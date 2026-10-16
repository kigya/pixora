#!/usr/bin/env python3
import os
"""Temporarily test all-disabled server flags; always restore the original template."""
from pathlib import Path
import subprocess,json,time,xml.etree.ElementTree as ET
root=Path(__file__).resolve().parent.parent;output=root/'artifacts/validation-07';template=root/'remote_config.json';original=template.read_text()
adb=str(Path.home()/'Library/Android/sdk/platform-tools/adb');serial=os.environ['ANDROID_SERIAL']
def device(*args):return subprocess.check_output([adb,'-s',serial,*args],text=True,stderr=subprocess.STDOUT,timeout=90)
def deploy(name):
 with (output/name).open('w') as log:subprocess.run(['npx','--yes','firebase-tools@15.33.0','deploy','--only','remoteconfig','--project',os.environ['FIREBASE_PROJECT_ID']],cwd=root,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=180)
try:
 data=json.loads(original)
 for value in data['parameters'].values():value['defaultValue']['value']='false'
 template.write_text(json.dumps(data,indent=2)+'\n');deploy('remote-disabled-deploy.log')
 device('shell','am','force-stop','dev.kigya.pixora');device('shell','am','start','-W','-n','dev.kigya.pixora/.MainActivity')
 expected={json.loads((root/f'src/locales/{code}.json').read_text())['profilesUnavailable'] for code in ['en','ar','ru']}
 found=False
 for attempt in range(8):
  device('shell','uiautomator','dump','/sdcard/Download/pixora-remote.xml');text=device('shell','cat','/sdcard/Download/pixora-remote.xml')
  if any(n.get('text') in expected for n in ET.fromstring(text).iter('node')):
   (output/'remote-disabled-ui.xml').write_text(text);found=True;break
  time.sleep(1)
 (output/'remote-disabled-result.json').write_text(json.dumps({'all_disabled_message_visible':found},indent=2))
 if found:(output/'xiaomi-remote-disabled.png').write_bytes(subprocess.check_output([adb,'-s',serial,'exec-out','screencap','-p'],timeout=60))
 print('All-disabled UI:',found,flush=True)
finally:
 template.write_text(original);deploy('remote-restored-deploy.log')
 device('shell','am','force-stop','dev.kigya.pixora');device('shell','am','start','-W','-n','dev.kigya.pixora/.MainActivity')
 print('Restored original all-true server template and restarted app.',flush=True)
