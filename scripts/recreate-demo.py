#!/usr/bin/env python3
"""Build the authentic CC0 cat reconstruction onboarding pair (host inference required)."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "assets" / "recreate"
LOCAL_DIR = ROOT / ".p-build-app" / "local"
MODEL_DIR = LOCAL_DIR / "models"
SD_REV = "dcac270609fffc0ce7c7d41a3c0e752721859f7c"
LORA_REV = "cf2fced511dbe7e26c8d1d397e728fbab875db4b"
MODEL_NAME = "stable-diffusion-v1-5-Q4_0.gguf"
LORA_NAME = "pytorch_lora_weights.safetensors"
MODEL_SIZE, MODEL_SHA = 1747190784, "c2f6e92f9d08d69cc673a1003528ac8199274b3c0eaec88d5fbefe5af67bd42b"
LORA_SIZE, LORA_SHA = 134621556, "8f90d840e075ff588a58e22c6586e2ae9a6f7922996ee6649a7f01072333afe4"
PHOTO_URL = "https://commons.wikimedia.org/wiki/Special:FilePath/Cat_unsplash.jpg"
PHOTO_PAGE = "https://commons.wikimedia.org/wiki/File:Cat_unsplash.jpg"
SOURCE_SHA1 = "44be6530745cbb71237d791caf9f95374782d203"


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def download(url: str, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return
    temp = path.with_suffix(path.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": "Pixora-reproducible-demo/0.9"})
    with urllib.request.urlopen(request) as response, temp.open("wb") as out:
        while True:
            block = response.read(1024 * 1024)
            if not block:
                break
            out.write(block)
    temp.replace(path)


def checked(path: Path, size: int, sha: str, label: str) -> None:
    actual_size = path.stat().st_size
    actual_sha = digest(path)
    if actual_size != size or actual_sha != sha:
        raise SystemExit(f"{label} integrity failure: {actual_size} bytes SHA-256 {actual_sha}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="stable-diffusion.cpp checkout at pinned commit")
    parser.add_argument("--models-dir", type=Path, default=MODEL_DIR)
    parser.add_argument("--cli", type=Path, help="prebuilt native/recreate-cli host executable")
    parser.add_argument("--seed", type=int, default=230922)
    parser.add_argument("--steps", type=int, choices=(4, 8), default=4)
    args = parser.parse_args()

    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    model_dir = args.models_dir.resolve()
    model = model_dir / MODEL_NAME
    lora = model_dir / LORA_NAME
    download(f"https://huggingface.co/gpustack/stable-diffusion-v1-5-GGUF/resolve/{SD_REV}/{MODEL_NAME}?download=true", model)
    download(f"https://huggingface.co/latent-consistency/lcm-lora-sdv1-5/resolve/{LORA_REV}/{LORA_NAME}?download=true", lora)
    checked(model, MODEL_SIZE, MODEL_SHA, "SD 1.5 Q4_0 model")
    checked(lora, LORA_SIZE, LORA_SHA, "LCM LoRA")

    source = ASSET_DIR / "cat-unsplash-source.jpg"
    download(PHOTO_URL, source)
    if hashlib.sha1(source.read_bytes()).hexdigest() != SOURCE_SHA1:
        raise SystemExit("Downloaded Wikimedia source does not match the documented CC0 source SHA-1")

    try:
        from PIL import Image
    except ImportError as exc:
        raise SystemExit("Pillow is required: python3 -m pip install Pillow") from exc
    with Image.open(source) as image:
        image = image.convert("RGB")
        # Deliberately poor 128px JPEG source, enlarged to the actual 512px model canvas.
        w, h = image.size
        factor = min(128 / max(w, h), 1.0)
        tiny = image.resize((max(1, round(w * factor)), max(1, round(h * factor))), Image.Resampling.LANCZOS)
        import io
        buffer = io.BytesIO()
        tiny.save(buffer, format="JPEG", quality=12, optimize=True)
        degraded = Image.open(io.BytesIO(buffer.getvalue())).convert("RGB")
        factor = 512 / max(degraded.size)
        before = degraded.resize((max(1, round(degraded.width * factor)), max(1, round(degraded.height * factor))), Image.Resampling.NEAREST)
        before_path = ASSET_DIR / "before.png"
        before.save(before_path, format="PNG", optimize=True)

    cli = args.cli
    if cli is None:
        raise SystemExit("A real host inference executable is required; build native/recreate with PIXORA_RECREATE_BUILD_CLI=ON")
    rgba_path = LOCAL_DIR / "recreate-input.rgba"
    rgb_path = LOCAL_DIR / "recreate-output.rgb"
    rgb = before.convert("RGBA").tobytes()
    rgba_path.parent.mkdir(parents=True, exist_ok=True)
    rgba_path.write_bytes(rgb)
    prompt = "a photorealistic close-up portrait of the same domestic cat, natural fur texture, preserve pose, face markings and composition, soft daylight"
    subprocess.run([str(cli.resolve()), str(model), str(lora), str(rgba_path), str(before.width), str(before.height),
                    str(args.steps), str(args.seed), prompt, str(rgb_path)], check=True)
    raw = rgb_path.read_bytes()
    expected = before.width * before.height * 3
    if len(raw) != expected:
        raise SystemExit(f"native inference returned {len(raw)} bytes, expected {expected}")
    after_path = ASSET_DIR / "after.png"
    Image.frombytes("RGB", before.size, raw).save(after_path, format="PNG", optimize=True)

    files = {p.name: {"sha256": digest(p), "bytes": p.stat().st_size} for p in (before_path, after_path)}
    manifest = {
        "type": "authentic-model-output",
        "source": {"title": "Cat unsplash", "page": PHOTO_PAGE, "license": "CC0 1.0", "sha1": SOURCE_SHA1},
        "derivation": {"degradation": "downscale to max 128px, JPEG quality 12, nearest-neighbor display upscale", "source_sha256": digest(source)},
        "engine": {"repo": "leejet/stable-diffusion.cpp", "revision": "39bc9d0b4bad86750fcb1fd2d711bc57a4c6018f", "license": "MIT"},
        "model": {"repo": "gpustack/stable-diffusion-v1-5-GGUF", "revision": SD_REV, "file": MODEL_NAME,
                  "license": "CreativeML OpenRAIL-M", "license_url": "https://huggingface.co/gpustack/stable-diffusion-v1-5-GGUF",
                  "bytes": MODEL_SIZE, "sha256": MODEL_SHA, "lora_repo": "latent-consistency/lcm-lora-sdv1-5",
                  "lora_revision": LORA_REV, "lora_file": LORA_NAME, "lora_bytes": LORA_SIZE, "lora_sha256": LORA_SHA,
                  "lora_license": "OpenRAIL++", "lora_license_url": "https://huggingface.co/latent-consistency/lcm-lora-sdv1-5"},
        "parameters": {"pipeline": "stable-diffusion.cpp img2img", "steps": args.steps, "sampler": "LCM",
                        "scheduler": "LCM", "cfg": 1.0, "strength": 0.6, "seed": args.seed,
                        "prompt": prompt, "backend": "CPU", "input_max_side": 512},
        "outputs": files,
        "note": "after.png is raw host inference output; the licensed high-quality source is not presented as generated output."
    }
    (ASSET_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"before": files[before_path.name], "after": files[after_path.name], "manifest": str(ASSET_DIR / "manifest.json")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
