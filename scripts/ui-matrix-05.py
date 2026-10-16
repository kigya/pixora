#!/usr/bin/env python3
"""Release UI regression on the emulator. Restores density, size and font."""
from pathlib import Path
import subprocess,time,json,sys
root=Path(__file__).resolve().parent.parent
adb=str(Path.home()/'Library/Android/sdk/platform-tools/adb');serial='emulator-5554'
def run(*args):return subprocess.check_output([adb,'-s',serial,*args],stderr=subprocess.STDOUT,text=True,timeout=360)
output=root/'artifacts/validation-05/matrix-api30';output.mkdir(parents=True,exist_ok=True)
font=run('shell','settings','get','system','font_scale').strip()
results=[]
if '--resume' in sys.argv and (output/'matrix.json').exists():results=[x for x in json.loads((output/'matrix.json').read_text()) if x['passed']]
cases=[('320','640x1280','1','de,zh-Hans,hi,ar'),('360','720x1440','1','de,ar'),('412','824x1648','1','zh-Hans,hi'),('840','1680x2400','1','de,zh-Hans,hi,ar'),('landscape','1680x824','1','de,ar'),('font200','720x1440','2','de,zh-Hans,hi,ar')]
try:
 run('install','-r',str(root/'android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk'))
 run('shell','wm','density','320')
 for name,size,scale,languages in cases:
  if any(x['viewport']==name for x in results):continue
  run('shell','wm','size',size);run('shell','settings','put','system','font_scale',scale)
  run('shell','cmd','statusbar','collapse');run('shell','am','force-stop','dev.kigya.pixora')
  text=run('shell','am','instrument','-w','-r','-e','class','dev.kigya.pixora.LocalizationUiTest#languagePickerHelpAndThemes','-e','languages',languages,'dev.kigya.pixora.test/androidx.test.runner.AndroidJUnitRunner')
  (output/('matrix-'+name+'.log')).write_text(text)
  passed='OK (1 test)' in text;results.append({'viewport':name,'sizePixels':size,'density':320,'fontScale':scale,'languages':languages,'passed':passed})
  destination=root/'artifacts/screenshots'/('05-'+name);destination.mkdir(parents=True,exist_ok=True)
  if int(run('shell','getprop','ro.build.version.sdk').strip()) >= 33:
   run('pull','/sdcard/Android/data/dev.kigya.pixora/files',str(destination))
  print(name,'PASS' if passed else 'FAIL',flush=True)
  if not passed:raise AssertionError(text)
finally:
 run('shell','wm','size','reset');run('shell','wm','density','reset');run('shell','settings','put','system','font_scale',font)
 (output/'matrix.json').write_text(json.dumps(results,indent=2)+'\n')
