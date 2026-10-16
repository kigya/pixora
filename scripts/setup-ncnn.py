#!/usr/bin/env python3
"""Development-only download. The installed application never downloads assets."""
from pathlib import Path
import json,hashlib,subprocess,tempfile,zipfile
root=Path(__file__).resolve().parent.parent
lock=json.loads((root/'docs/dependencies.json').read_text())['ncnn']
if (root/'vendor/ncnn/arm64-v8a/lib/cmake/ncnn/ncnnConfig.cmake').is_file():
 print('Pinned ncnn SDK already present');raise SystemExit(0)
with tempfile.TemporaryDirectory() as temporary:
 archive=Path(temporary)/'ncnn.zip'
 subprocess.run(['curl','-fLsS','--retry','2','-o',str(archive),lock['url']],check=True)
 if hashlib.sha256(archive.read_bytes()).hexdigest()!=lock['sha256']:raise SystemExit('ncnn checksum mismatch')
 prefix=f"ncnn-{lock['version']}-android-vulkan/"
 with zipfile.ZipFile(archive) as z:
  for name in z.namelist():
   if name.startswith(prefix+'arm64-v8a/') and not name.endswith('/'):
    relative=Path(name[len(prefix):])
    if '..' in relative.parts:raise SystemExit('Unsafe archive path')
    target=root/'vendor/ncnn'/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(name))
print('Pinned ncnn SDK ready')
