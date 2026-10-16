#!/usr/bin/env python3
"""Install the pinned Maestro CLI under this repository's ignored local data."""

from __future__ import annotations

import hashlib
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath


VERSION = "2.11.0"
URL = (
    "https://github.com/mobile-dev-inc/Maestro/releases/download/"
    f"cli-{VERSION}/maestro.zip"
)
SHA256 = "5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a"
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 25_000
ALLOWED_DOWNLOAD_HOSTS = {
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
}


def project_paths() -> tuple[Path, Path, Path]:
    project_root = Path(__file__).resolve().parent.parent
    local_root = project_root / ".p-build-app" / "local" / "maestro"
    install_root = local_root / "maestro"
    return project_root, local_root, install_root


def local_cli_environment(local_root: Path) -> dict[str, str]:
    user_home = local_root / "user-home"
    user_home.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["JAVA_TOOL_OPTIONS"] = f"-Duser.home={user_home}"
    env["MAESTRO_CLI_NO_ANALYTICS"] = "1"
    env["MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED"] = "true"
    env["MAESTRO_DISABLE_UPDATE_CHECK"] = "true"
    return env


def is_pinned_install(executable: Path, local_root: Path) -> bool:
    if not executable.is_file() or not os.access(executable, os.X_OK):
        return False
    try:
        result = subprocess.run(
            [str(executable), "--version"],
            check=False,
            capture_output=True,
            text=True,
            timeout=45,
            env=local_cli_environment(local_root),
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0 and re.search(
        rf"(?m)^\s*{re.escape(VERSION)}\s*$",
        result.stdout + result.stderr,
    ) is not None


def download_archive(local_root: Path) -> Path:
    request = urllib.request.Request(
        URL,
        headers={"User-Agent": f"Pixora-Maestro-setup/{VERSION}"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        final_url = urllib.parse.urlparse(response.geturl())
        if (
            final_url.scheme != "https"
            or final_url.hostname not in ALLOWED_DOWNLOAD_HOSTS
        ):
            raise RuntimeError("Maestro download redirected outside approved HTTPS hosts")
        declared_length = response.headers.get("Content-Length")
        if declared_length and int(declared_length) > MAX_ARCHIVE_BYTES:
            raise RuntimeError("Maestro archive exceeds the download size limit")
        digest = hashlib.sha256()
        total = 0
        archive_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                prefix="maestro-",
                suffix=".zip.part",
                dir=local_root,
                delete=False,
            ) as archive:
                archive_path = Path(archive.name)
                while chunk := response.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_ARCHIVE_BYTES:
                        raise RuntimeError(
                            "Maestro archive exceeds the download size limit"
                        )
                    digest.update(chunk)
                    archive.write(chunk)
            if digest.hexdigest() != SHA256:
                raise RuntimeError("Maestro archive SHA-256 does not match the pinned digest")
            return archive_path
        except Exception:
            if archive_path is not None:
                archive_path.unlink(missing_ok=True)
            raise


def safe_member_path(stage: Path, name: str) -> tuple[Path, tuple[str, ...]]:
    if "\\" in name:
        raise RuntimeError(f"Unsafe archive path: {name!r}")
    relative = PurePosixPath(name)
    if relative.is_absolute() or not relative.parts:
        raise RuntimeError(f"Unsafe archive path: {name!r}")
    if any(part in ("", ".", "..") for part in relative.parts):
        raise RuntimeError(f"Unsafe archive path: {name!r}")
    if relative.parts[0] != "maestro":
        raise RuntimeError(f"Unexpected top-level archive path: {name!r}")
    destination = stage.joinpath(*relative.parts)
    if not destination.resolve().is_relative_to(stage.resolve()):
        raise RuntimeError(f"Archive path escapes extraction directory: {name!r}")
    return destination, relative.parts


def extract_archive(archive_path: Path, stage: Path) -> Path:
    seen: set[tuple[str, ...]] = set()
    total_size = 0
    with zipfile.ZipFile(archive_path) as bundle:
        infos = bundle.infolist()
        if len(infos) > MAX_ARCHIVE_ENTRIES:
            raise RuntimeError("Maestro archive contains too many entries")
        for info in infos:
            destination, parts = safe_member_path(stage, info.filename)
            if parts in seen:
                raise RuntimeError(f"Duplicate archive entry: {info.filename!r}")
            seen.add(parts)
            total_size += info.file_size
            if total_size > MAX_EXTRACTED_BYTES:
                raise RuntimeError("Maestro archive exceeds the extracted size limit")

            mode = (info.external_attr >> 16) & 0xFFFF
            file_type = stat.S_IFMT(mode)
            if file_type not in (0, stat.S_IFREG, stat.S_IFDIR):
                raise RuntimeError(f"Unsupported special archive entry: {info.filename!r}")

            is_directory = info.is_dir() or file_type == stat.S_IFDIR
            if is_directory:
                destination.mkdir(parents=True, exist_ok=True)
                os.chmod(destination, (mode & 0o777) or 0o755)
                continue

            destination.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(info, "r") as source, destination.open("xb") as target:
                copied = 0
                while chunk := source.read(1024 * 1024):
                    copied += len(chunk)
                    target.write(chunk)
            if copied != info.file_size:
                raise RuntimeError(f"Unexpected extracted size: {info.filename!r}")
            os.chmod(destination, (mode & 0o777) or 0o644)

    extracted_root = stage / "maestro"
    executable = extracted_root / "bin" / "maestro"
    if not executable.is_file():
        raise RuntimeError("Maestro archive is missing maestro/bin/maestro")
    if not os.access(executable, os.X_OK):
        mode = stat.S_IMODE(executable.stat().st_mode)
        executable.chmod(mode | 0o111)
    return extracted_root


def main() -> int:
    project_root, local_root, install_root = project_paths()
    if not local_root.resolve().is_relative_to(project_root.resolve()):
        raise RuntimeError(f"Project-local Maestro path escapes the repository: {local_root}")
    if local_root.is_symlink():
        raise RuntimeError(f"Refusing symlinked project-local install path: {local_root}")
    local_root.mkdir(parents=True, exist_ok=True)
    executable = install_root / "bin" / "maestro"
    if install_root.is_symlink() or executable.is_symlink():
        raise RuntimeError(f"Refusing symlinked Maestro install path: {install_root}")
    if is_pinned_install(executable, local_root):
        print(f"Maestro {VERSION} is already installed at {executable}")
        return 0
    if install_root.exists() or install_root.is_symlink():
        raise RuntimeError(
            f"Refusing to replace existing Maestro path that is not verified {VERSION}: "
            f"{install_root}"
        )

    archive_path = download_archive(local_root)
    try:
        with tempfile.TemporaryDirectory(prefix="maestro-extract-", dir=local_root) as temp:
            staged_root = extract_archive(archive_path, Path(temp))
            staged_executable = staged_root / "bin" / "maestro"
            if not is_pinned_install(staged_executable, local_root):
                raise RuntimeError(f"Extracted CLI did not report Maestro {VERSION}")
            os.rename(staged_root, install_root)
    finally:
        archive_path.unlink(missing_ok=True)

    print(f"Installed Maestro {VERSION} at {executable}")
    print(f"Project-local CLI home: {local_root / 'user-home'}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError, zipfile.BadZipFile) as error:
        print(f"setup-maestro: {error}", file=sys.stderr)
        raise SystemExit(1)
