#!/usr/bin/env python3
"""Reject private files, credentials and non-English maintenance text in Git."""
import argparse
import configparser
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys

PRIVATE_PARTS = {
    '.agents', '.codex', '.cursor', '.serena', '.p-build-app', '.p-find-ideas',
    '.p-prepare-google-play', '.local-private', '.tools', '.idea', '.gradle',
    '.cxx', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache',
    'node_modules', 'Pods', 'DerivedData', 'xcuserdata',
}
PRIVATE_ROOTS = ('artifacts/', 'coverage/', 'research/', 'ideas/', 'docs/archive/',
                 'docs/agent-reports/', 'docs/research/', 'docs/release/',
                 'vendor/ncnn/', 'vendor/bundle/', 'ios/Vendor/')
PRIVATE_NAMES = {
    'agents.md', 'claude.md', 'skill.md', 'tooling.json', 'local.properties',
    'signing.properties', 'feedback.properties', 'google-services.json',
    'googleservice-info.plist', '.xcode.env.local',
}
PRIVATE_SUFFIXES = {'.log', '.apk', '.aab', '.ipa', '.idsig', '.keystore', '.jks',
                    '.p12', '.pfx', '.pem', '.key', '.mobileprovision', '.hprof'}
CYRILLIC = re.compile('[\u0400-\u052f]')
SECRET_PATTERNS = [
    re.compile(rb'AIza[0-9A-Za-z_-]{35}'),
    re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})'),
    re.compile(rb'(?:AKIA|ASIA)[A-Z0-9]{16}'),
    re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----'),
    re.compile(rb'"type"\s*:\s*"service_account"'),
    re.compile(rb'(?:sk_live_|rk_live_|sk-proj-)[A-Za-z0-9_-]{20,}'),
]


def git(*args):
    return subprocess.check_output(['git', *args])


def private_path(name):
    path = PurePosixPath(name)
    base = path.name.lower()
    return (bool(set(path.parts) & PRIVATE_PARTS)
            or bool(CYRILLIC.search(name))
            or name.startswith(PRIVATE_ROOTS)
            or base in PRIVATE_NAMES
            or path.suffix.lower() in PRIVATE_SUFFIXES
            or (base.startswith('.env') and base != '.env.example')
            or base == '.coverage' or base.startswith('.coverage.')
            or name in {'docs/SKILLS.md', 'docs/project-status.md'}
            or (name.startswith('docs/') and base == '.gitignore')
            or (name.startswith('docs/quality/') and base.endswith('.md')
                and name != 'docs/quality/test-matrix.md')
            or (name.startswith('docs/') and
                re.match(r'(VALIDATION|PLAN-|PERFORMANCE|ANALYTICS|COVERAGE)', path.name))
            or 'build' in path.parts or '.build' in path.parts)


def content_issues(name, content, mode='100644'):
    issues = []
    if any(pattern.search(content) for pattern in SECRET_PATTERNS):
        issues.append('credential material')
    if mode == '120000':
        target = content.decode('utf-8', errors='replace')
        if target.startswith('/') or '..' in PurePosixPath(target).parts:
            issues.append('non-portable symlink')
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        return issues
    if CYRILLIC.search(text):
        if name.startswith('src/locales/') and name.endswith('.json'):
            try:
                data = json.loads(text)
                if not isinstance(data, (dict, list)):
                    issues.append('invalid localization data')
            except ValueError:
                issues.append('invalid localization JSON')
        else:
            issues.append('maintenance text must be English; use escaped localized test data')
    if re.search(r'/(?:Users|home)/[^/\s]+/', text):
        issues.append('personal absolute path')
    return issues


def reviewed_submodule(mode, oid, name, revision):
    """Only the reviewed diffusion dependency and exact immutable revision are allowed."""
    if (mode, name, oid) != (
        '160000', 'native/recreate/vendor/stable-diffusion.cpp',
        '39bc9d0b4bad86750fcb1fd2d711bc57a4c6018f',
    ):
        raise ValueError('Submodules require an explicit publication review.')
    config = configparser.ConfigParser(interpolation=None)
    config.read_string(git('show', (revision or '') + ':.gitmodules').decode())
    section = 'submodule "native/recreate/vendor/stable-diffusion.cpp"'
    if config.sections() != [section] or dict(config[section]) != {
        'path': name,
        'url': 'https://github.com/leejet/stable-diffusion.cpp.git',
    }:
        raise ValueError('Reviewed submodule metadata does not match its pinned public source.')


def entries(revision):
    if revision is None:
        records = git('ls-files', '--stage', '-z').split(b'\0')
        for record in filter(None, records):
            meta, name = record.split(b'\t', 1)
            mode, oid, stage = meta.decode().split()
            if stage != '0':
                raise ValueError('Resolve the unmerged index before publication.')
            if mode == '160000':
                reviewed_submodule(mode, oid, os.fsdecode(name), revision)
            yield mode, oid, os.fsdecode(name)
    else:
        for record in filter(None, git('ls-tree', '-rz', '--full-tree', revision).split(b'\0')):
            meta, name = record.split(b'\t', 1)
            mode, kind, oid = meta.decode().split()
            if kind != 'blob':
                reviewed_submodule(mode, oid, os.fsdecode(name), revision)
            yield mode, oid, os.fsdecode(name)


def check(revisions):
    errors = []
    seen = set()
    for revision in revisions:
        if revision is not None:
            for issue in content_issues('commit-message', git('show', '-s', '--format=%B', revision)):
                errors.append('commit-message: ' + issue)
        for mode, oid, name in entries(revision):
            key = (mode, oid, name)
            if key in seen:
                continue
            seen.add(key)
            if private_path(name):
                errors.append(f'{name}: private/generated path')
                continue
            if mode == '160000':
                continue  # entries() already verified exact pin and public-source metadata.
            for issue in content_issues(name, git('cat-file', 'blob', oid), mode):
                errors.append(f'{name}: {issue}')
    return sorted(set(errors))


def outgoing(data):
    tips = []
    for line in data.splitlines():
        _local_ref, local, _remote_ref, _remote = line.split()
        if set(local) != {'0'}:
            tips.append(local)
    return tips


def install_hooks():
    common = Path(os.fsdecode(git('rev-parse', '--git-common-dir')).strip()).resolve()
    configured = subprocess.run(['git', 'config', '--get', 'core.hooksPath'],
                                capture_output=True, text=True).stdout.strip()
    previous = Path(configured).expanduser().resolve() if configured else common / 'hooks'
    destination = common / 'info' / 'pixora-publication-hooks'
    destination.mkdir(parents=True, exist_ok=True)
    script = destination / 'check-publication.py'
    script.write_bytes(Path(__file__).read_bytes())
    for name, args in [('pre-commit', ['--staged']), ('pre-push', ['--pre-push']),
                       ('commit-msg', ['--message-file'])]:
        hook = destination / name
        old = previous / name
        if old == hook:
            # Reinstallation preserves the previously recorded chain.
            old = Path((destination / (name + '.previous')).read_text())
        (destination / (name + '.previous')).write_text(str(old))
        hook.write_text('#!/usr/bin/env python3\nimport os,shutil,subprocess,sys\nfrom pathlib import Path\n'
                        'data=sys.stdin.buffer.read() if "pre-push" in __file__ else b""\n'
                        f'args={args!r}\n'
                        'if "--message-file" in args: args += sys.argv[1:2]\n'
                        f'r=subprocess.run([sys.executable,{str(script)!r},*args],input=data)\n'
                        'if r.returncode: sys.exit(r.returncode)\n'
                        'if "--message-file" not in args:\n'
                        ' root=Path(subprocess.check_output(["git","rev-parse","--show-toplevel"],text=True).strip())\n'
                        ' local=root/".p-build-app/local/bin/gitleaks"\n'
                        ' scanner=str(local) if local.is_file() else shutil.which("gitleaks")\n'
                        ' if not scanner:\n'
                        '  sys.exit("Install the pinned scanner: python3 scripts/setup-security-tools.py")\n'
                        ' scan=[scanner,"git","--redact=100","--no-banner","--ignore-gitleaks-allow","--gitleaks-ignore-path","/dev/null"]\n'
                        ' if "--staged" in args: scan += ["--pre-commit","--staged"]\n'
                        ' else:\n'
                        '  tips=[line.split()[1] for line in data.decode().splitlines() if set(line.split()[1])!={"0"}]\n'
                        '  if not tips: scan=[]\n'
                        '  else: scan += ["--log-opts="+" ".join(tips)]\n'
                        ' if scan:\n'
                        '  r=subprocess.run(scan,cwd=root)\n'
                        '  if r.returncode: sys.exit(r.returncode)\n'
                        f'old={str(old)!r}\n'
                        'if Path(old).is_file() and os.access(old,os.X_OK):\n'
                        ' sys.exit(subprocess.run([old,*sys.argv[1:]],input=data).returncode)\n')
        hook.chmod(0o700)
    subprocess.run(['git', 'config', '--local', 'core.hooksPath', str(destination)], check=True)


def main(argv=None, stdin=None):
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--staged', action='store_true')
    modes.add_argument('--history', nargs='+')
    modes.add_argument('--pre-push', action='store_true')
    modes.add_argument('--message-file', type=Path)
    modes.add_argument('--install-hooks', action='store_true')
    args = parser.parse_args(argv)
    if args.install_hooks:
        install_hooks()
        return 0
    if args.message_file:
        errors = content_issues('commit-message', args.message_file.read_bytes())
    elif args.staged:
        errors = check([None])
    else:
        tips = args.history if args.history else outgoing(sys.stdin.read() if stdin is None else stdin)
        revisions = os.fsdecode(git('rev-list', *tips)).splitlines() if tips else []
        errors = check(revisions)
    for error in errors:
        print('Publication blocked: ' + error, file=sys.stderr)
    return int(bool(errors))


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, subprocess.CalledProcessError) as error:
        print('Publication check failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
