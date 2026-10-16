#!/usr/bin/env python3
"""Validate all bundled translations and flag provenance; never fetch at runtime."""
from pathlib import Path
import json,re,hashlib
root=Path(__file__).resolve().parent.parent
folder=root/'src/locales';registry=json.loads((folder/'registry.json').read_text())
def flatten(data,prefix=''):
 out={}
 for key,value in data.items():
  path=prefix+key
  if isinstance(value,dict):out.update(flatten(value,path+'.'))
  else:
   assert isinstance(value,str) and value.strip(),path
   out[path]=value
 return out
base=flatten(json.loads((folder/'en.json').read_text()))
for item in registry:
 data=flatten(json.loads((folder/(item['id']+'.json')).read_text()))
 assert data.keys()==base.keys(),item['id']
 for key in base:
  assert sorted(re.findall(r'\{\w+\}',data[key]))==sorted(re.findall(r'\{\w+\}',base[key])),(item['id'],key)
manifest=json.loads((root/'assets/flags/manifest.json').read_text())
for name,digest in manifest['files'].items():
 assert hashlib.sha256((root/'assets/flags'/name).read_bytes()).hexdigest()==digest,name
print(f'{len(registry)} locale schemas, placeholders and bundled flag hashes verified')
