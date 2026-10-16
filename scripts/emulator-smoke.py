#!/usr/bin/env python3
"""Offline UI smoke test on an already running emulator. Only generated fixtures.
Usage: python3 scripts/emulator-smoke.py [emulator-5554]
No third-party Python packages required. Does not send files to other apps.
"""
from pathlib import Path
import os,sys,time,subprocess,xml.etree.ElementTree as ET,json,tempfile,shutil,re,hashlib
root=Path(__file__).resolve().parent.parent
serial=sys.argv[1] if len(sys.argv)>1 else 'emulator-5554'
adb=str(Path(os.environ.get('ANDROID_HOME',str(Path.home()/'Library/Android/sdk')))/'platform-tools/adb')
output=root/'artifacts/screenshots';output.mkdir(parents=True,exist_ok=True)
records=[]
def run(*args,binary=False):
 p=subprocess.run([adb,'-s',serial,*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=35)
 if p.returncode:raise RuntimeError(p.stderr.decode(errors='replace'))
 return p.stdout if binary else p.stdout.decode(errors='replace')
def tree():
 run('shell','rm','-f','/sdcard/upscale-smoke-ui.xml')
 run('shell','uiautomator','dump','/sdcard/upscale-smoke-ui.xml')
 try:return list(ET.fromstring(run('exec-out','cat','/sdcard/upscale-smoke-ui.xml')).iter('node'))
 except ET.ParseError:return []
def label(n):return n.get('content-desc') or n.get('text') or ''
def bounds(n):
 v=list(map(int,re.findall(r'\d+',n.get('bounds',''))))
 return v if len(v)==4 else [0,0,0,0]
def find(nodes,text):
 # UiAutomator includes clipped React Native nodes with zero height. Tapping
 # their nominal centre can hit Android's navigation bar instead of the app.
 matches=[n for n in nodes if text.casefold() in ((n.get('text')or'').casefold(),(n.get('content-desc')or'').casefold()) and bounds(n)[2]>bounds(n)[0] and bounds(n)[3]-bounds(n)[1]>20 and (bounds(n)[1]+bounds(n)[3])/2<2280]
 return sorted(matches,key=lambda n:n.get('clickable')!='true')
def tap(text,scroll=True):
 for attempt in range(6 if scroll else 1):
  nodes=tree();matches=find(nodes,text)
  if matches:
   n=matches[0];x,y,r,b=bounds(n);run('shell','input','tap',str((x+r)//2),str((y+b)//2));return n
  if scroll:run('shell','input','swipe','540','1950','540','850','350')
 raise AssertionError('Missing action: '+text)
def wait(text,timeout=90):
 until=time.monotonic()+timeout
 while time.monotonic()<until:
  nodes=tree()
  if find(nodes,text):return nodes
  time.sleep(.25)
 raise AssertionError('Missing state: '+text)
def shot(name):
 (output/(name+'.png')).write_bytes(run('exec-out','screencap','-p',binary=True))
def note(name):
 print(name,flush=True);records.append({'step':name,'time':time.strftime('%Y-%m-%dT%H:%M:%S')})
def import_fixture(name,initial=False):
 with tempfile.TemporaryDirectory() as tmp:
  source=Path(tmp)/('upscale-smoke-'+str(time.time_ns())+'-'+name);shutil.copyfile(root/'tests/fixtures'/name,source);os.utime(source,None)
  destination='/sdcard/Download/'+source.name
  run('push',str(source),destination)
  run('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file://'+destination)
  time.sleep(.5)
 tap('Choose image' if initial else 'New image')
 nodes=tree()
 if find(nodes,'Choose new'):tap('Choose new');nodes=tree()
 photos=[n for n in nodes if (n.get('content-desc')or'').startswith('Photo taken')]
 if not photos:
  time.sleep(1);photos=[n for n in tree() if (n.get('content-desc')or'').startswith('Photo taken')]
 if not photos:raise AssertionError('Photo Picker has no fixture')
 n=photos[0];x,y,r,b=bounds(n);run('shell','input','tap',str((x+r)//2),str((y+b)//2))
 wait('Upscale');note('Imported '+name)
def start():
 tap('Upscale');nodes=tree()
 if find(nodes,'Continue'):
  tap('Continue');nodes=tree()
  # Explicit denial verifies notification permission is not required for AI.
  if find(nodes,'Don’t allow'):tap('Don’t allow')
  elif find(nodes,"Don't allow"):tap("Don't allow")
 run('shell','input','keyevent','KEYCODE_HOME')
 time.sleep(2)
 run('shell','am','start','-n','dev.kigya.pixora/.MainActivity')
 wait('Ready',120);note('Inference completed after backgrounding');shot('result-en')
def exports():
 text=run('shell','ls','-1','/sdcard/Pictures/UpscaleImage')
 return [n for n in text.splitlines() if n.endswith(('.png','.jpg'))]
def main():
 try:
  run('shell','cmd','connectivity','airplane-mode','enable')
  run('shell','am','start','-W','-n','dev.kigya.pixora/.MainActivity')
  wait('Choose image');shot('home-en');note('Release launched offline')
  import_fixture('scene-65x49.png',True);shot('ready-en');start()
  tap('Before');tap('After');tap('Compare');note('Accessible comparison controls')
  tap('Save');wait('Saved');note('PNG saved to MediaStore')
  pngs=exports();assert len(pngs)>0
  tap('JPEG');tap('Save');nodes=tree()
  if find(nodes,'Continue'):tap('Continue')
  wait('Saved');note('JPEG saved to MediaStore')
  tap('Share');time.sleep(.5);run('shell','input','keyevent','KEYCODE_BACK');note('Sharesheet opened and cancelled')
  run('shell','am','force-stop','dev.kigya.pixora');run('shell','am','start','-n','dev.kigya.pixora/.MainActivity');wait('Ready');note('Last result restored after process restart')
  tap('Settings',False);tap('Русский');shot('settings-ru');tap('Назад',False);wait('Готово');shot('result-ru');note('Russian locale without losing result')
  run('shell','settings','put','system','font_scale','2.0');run('shell','am','force-stop','dev.kigya.pixora');run('shell','am','start','-n','dev.kigya.pixora/.MainActivity');wait('Готово');shot('result-ru-font200');tap('Поделиться');run('shell','input','keyevent','KEYCODE_BACK');note('200% font: result and share action reachable')
 finally:
  run('shell','settings','put','system','font_scale','1.0')
  (root/'artifacts/ui-smoke.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')

if __name__ == '__main__':
 main()
