#!/usr/bin/env python3
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parent.parent
manifest=json.loads((root/'docs/dependencies.json').read_text())
fast=json.loads((root/'docs/fast-model.json').read_text())
natural=json.loads((root/'docs/natural-model.json').read_text())
art=json.loads((root/'docs/illustration-models.json').read_text())
for name,expected in {**manifest['model']['files'],**fast['files'],**art['files'],**natural['files']}.items():
 path=root/'android/app/src/main/assets/models'/name
 actual=hashlib.sha256(path.read_bytes()).hexdigest()
 if actual!=expected: raise SystemExit(f'Model checksum mismatch: {name}')
print('Bundled model checksums verified')
