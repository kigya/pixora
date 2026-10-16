#!/usr/bin/env python3
"""Install checksum-pinned scanners into ignored project tooling, never globally."""
from pathlib import Path
import hashlib
import io
import json
import platform
import tarfile
import urllib.request

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'docs/security-tools.json').read_text())
darwin = platform.system() == 'Darwin'
arm = platform.machine() in {'arm64', 'aarch64'}
if darwin and not arm:
    raise SystemExit('Pinned local scanner artifacts require Apple Silicon; Linux CI uses x86_64.')
names = [
    'gitleaks_8.30.1_darwin_arm64.tar.gz' if darwin else 'gitleaks_8.30.1_linux_x64.tar.gz',
    'actionlint_1.7.12_darwin_arm64.tar.gz' if darwin else 'actionlint_1.7.12_linux_amd64.tar.gz',
    'zizmor-aarch64-apple-darwin.tar.gz' if darwin else 'zizmor-x86_64-unknown-linux-gnu.tar.gz',
    'osv-scanner_darwin_arm64' if darwin else 'osv-scanner_linux_amd64',
]
destination = root / '.p-build-app/local/bin'
destination.mkdir(parents=True, exist_ok=True)
for name in names:
    spec = manifest[name]
    archive = urllib.request.urlopen(spec['url'], timeout=90).read()
    if hashlib.sha256(archive).hexdigest() != spec['sha256']:
        raise SystemExit('Scanner checksum mismatch: ' + name)
    if name.endswith('.tar.gz'):
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as source:
            members = [m for m in source.getmembers() if m.isfile() and Path(m.name).name in {'gitleaks', 'actionlint', 'zizmor'}]
            if len(members) != 1:
                raise SystemExit('Unexpected scanner archive structure')
            member = members[0]
            executable = destination / Path(member.name).name
            executable.write_bytes(source.extractfile(member).read())
    else:
        executable = destination / 'osv-scanner'
        executable.write_bytes(archive)
    executable.chmod(0o700)
    print(executable.name + ' ' + spec['version'] + ' verified')
