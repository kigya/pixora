#!/usr/bin/env python3
"""Device UI regression for 0.5. Restores emulator dimensions and font settings."""
from pathlib import Path
import subprocess,json
root=Path(__file__).resolve().parents[1]
adb=str(Path.home()/'Library/Android/sdk/platform-tools/adb')
output=root/'artifacts/validation-05/features-matrix';output.mkdir(parents=True,exist_ok=True)
def run(*args):return subprocess.check_output([adb,'-s','emulator-5554',*args],text=True,stderr=subprocess.STDOUT,timeout=180)
font=run('shell','settings','get','system','font_scale').strip();results=[]
cases=[('320','640x1280','1','en','light'),('360','720x1440','1','de','dark'),('412','824x1648','1','zh-Hans','light'),('840','1680x2400','1','ar','dark'),('landscape','1680x824','1','hi','light'),('font200','720x1440','2','ar','dark')]
try:
 run('shell','wm','density','320')
 for name,size,scale,language,theme in cases:
  run('shell','wm','size',size);run('shell','settings','put','system','font_scale',scale);run('shell','cmd','statusbar','collapse');run('shell','am','force-stop','dev.kigya.pixora')
  text=run('shell','am','instrument','-w','-r','-e','class','dev.kigya.pixora.LocalizationUiTest#supportProfilesPreviewAndRetention','-e','language',language,'-e','theme',theme,'dev.kigya.pixora.test/androidx.test.runner.AndroidJUnitRunner')
  (output/(name+'.log')).write_text(text);passed='OK (1 test)' in text;results.append(dict(viewport=name,sizePixels=size,density=320,fontScale=scale,language=language,theme=theme,passed=passed));print(name,'PASS' if passed else 'FAIL',flush=True)
  if not passed:raise AssertionError(text)
finally:
 run('shell','wm','size','reset');run('shell','wm','density','reset');run('shell','settings','put','system','font_scale',font)
 (output/'matrix.json').write_text(json.dumps(results,indent=2)+'\n')
