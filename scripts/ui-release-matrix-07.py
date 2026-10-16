#!/usr/bin/env python3
"""Exercise the installed R8 UI via Android accessibility, without loading test dex."""
import subprocess,json,time,sys,xml.etree.ElementTree as ET,re,os
from pathlib import Path
root=Path(__file__).resolve().parent.parent
adb=str(Path.home()/'Library/Android/sdk/platform-tools/adb');serial=os.environ.get('PIXORA_TEST_SERIAL','emulator-5556')
out=root/'artifacts/validation-07/matrix-r8-accessibility';out.mkdir(parents=True,exist_ok=True)
def run(*args,timeout=90):return subprocess.check_output([adb,'-s',serial,*args],text=True,stderr=subprocess.STDOUT,timeout=timeout)
def tree():
 run('shell','uiautomator','dump','/sdcard/Download/pixora-matrix.xml')
 return list(ET.fromstring(run('shell','cat','/sdcard/Download/pixora-matrix.xml')).iter('node'))
def bounds(n):return list(map(int,re.findall(r'\d+',n.get('bounds',''))))
def find(label,click=False,prefix=False):
 for n in tree():
  b=bounds(n)
  match=any((s.startswith(label) if prefix else s==label) for s in [n.get('text',''),n.get('content-desc','')])
  if match and len(b)==4 and b[2]>b[0] and b[3]-b[1]>=40 and (not click or n.get('clickable')=='true'):return n
 return None
def scroll(up=False):
 candidates=[n for n in tree() if n.get('package')=='dev.kigya.pixora' and n.get('scrollable')=='true']
 if not candidates:raise AssertionError('No app scroll container')
 x,y,r,b=bounds(candidates[0]);h=b-y
 run('shell','input','swipe',str((x+r)//2),str(y+int(h*(.35 if up else .77))),str((x+r)//2),str(y+int(h*(.77 if up else .35))),'300')
def tap(label,prefix=False,seek=False):
 for attempt in range(18 if seek else 2):
  n=find(label,True,prefix)
  if n is not None:
   x,y,r,b=bounds(n);run('shell','input','tap',str((x+r)//2),str((y+b)//2));return
  if seek:scroll()
 raise AssertionError('Missing action: '+label)
def top():
 run('shell','input','keyevent','111')
 run('shell','cmd','statusbar','collapse')
 nodes=tree()
 if not any(n.get('package')=='dev.kigya.pixora' for n in nodes):
  run('shell','input','keyevent','4')
  run('shell','am','start','-W','-n','dev.kigya.pixora/.MainActivity')
  nodes=tree()
 for n in nodes:
  if n.get('package')=='dev.kigya.pixora' and n.get('scrollable')=='true':
   x,y,r,b=bounds(n)
   for _ in range(4):run('shell','input','swipe',str((x+r)//2),str(y+(b-y)//3),str((x+r)//2),str(y+3*(b-y)//4),'400')
   break
def capture(name):
 (out/(name+'.png')).write_bytes(subprocess.check_output([adb,'-s',serial,'exec-out','screencap','-p'],timeout=90))
registry=json.loads((root/'src/locales/registry.json').read_text());names={v['id']:v['name'] for v in registry}
def dictionary(code):return json.loads((root/f'src/locales/{code}.json').read_text())
current=dictionary(os.environ.get('PIXORA_CURRENT_LANGUAGE','en'));results=[]
if '--resume' in sys.argv and (out/'matrix.json').exists():results=[x for x in json.loads((out/'matrix.json').read_text()) if x.get('passed')]
oldfont=run('shell','settings','get','system','font_scale').strip()
cases=[('320','640x1280','1','de'),('360','720x1440','1','fa'),('412','824x1648','1','zh-Hans'),('840','1680x2400','1','ar'),('landscape','1680x824','1','hi'),('font200','720x1440','2','ur'),('font200-de','720x1440','2','de')]
try:
 run('shell','am','start','-W','-n','dev.kigya.pixora/.MainActivity')
 if find(current['understood'],True) is not None:tap(current['understood'])
 run('shell','wm','density','320')
 for case,size,font,code in cases:
  if all(any(x['viewport']==case and x['theme']==theme for x in results) for theme in ['light','dark']):continue
  run('shell','wm','size',size);run('shell','settings','put','system','font_scale',font)
  run('shell','cmd','statusbar','collapse')
  run('shell','am','start','-W','-n','dev.kigya.pixora/.MainActivity')
  for theme in ['light','dark']:
   if any(x['viewport']==case and x['theme']==theme for x in results):continue
   top();tap(current['settings']);top();tap(current['language']+':',prefix=True,seek=True)
   tap(names[code],seek=True);current=dictionary(code)
   top();tap(current[theme],seek=True);top();tap(current['back'])
   top()
   for _ in range(15):
    if find(current['choose'],True) is not None:break
    scroll()
   assert find(current['choose'],True) is not None, 'Choose image unavailable'
   capture(case+'-'+theme+'-'+code)
   tap(current['how'],seek=True);tap(current['understood'],seek=True)
   results.append({'viewport':case,'language':code,'theme':theme,'fontScale':font,'passed':True})
   (out/'matrix.json').write_text(json.dumps(results,indent=2));print(case,theme,code,'PASS',flush=True)
except Exception as exc:
 results.append({'error':str(exc),'passed':False});capture('failure');raise
finally:
 run('shell','wm','size','reset');run('shell','wm','density','reset');run('shell','settings','put','system','font_scale',oldfont)
 (out/'matrix.json').write_text(json.dumps(results,indent=2))
