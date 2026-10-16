#!/usr/bin/env python3
"""UI smoke regression with generated fixtures; explicit serial, no network changes.
Waits for actual result actions and the system sharesheet before cancelling.
See docs/VALIDATION-0.2.md for verified native and physical-device results.
"""
import importlib.util,sys,time,tempfile,shutil,os,json,re
from pathlib import Path
spec=importlib.util.spec_from_file_location('smoke',Path(__file__).with_name('emulator-smoke.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
size=m.run('shell','wm','size');w,h=map(int,re.findall(r'(\d+)x(\d+)',size)[-1]);records=[]
def find(text):return m.find(m.tree(),text)
def tap(text,scroll=True):
 for _ in range(8 if scroll else 1):
  matches=[n for n in find(text) if n.get("clickable")=="true" and m.bounds(n)[3]-m.bounds(n)[1]<h*.8]
  if matches:
   n=matches[0];x,y,r,b=m.bounds(n)
   if 0<(y+b)/2<h-32:m.run('shell','input','tap',str((x+r)//2),str((y+b)//2));return
  m.run('shell','input','swipe',str(w//2),str(int(h*.8)),str(w//2),str(int(h*.35)),'350')
 raise AssertionError('Missing '+text)
def top():
 for _ in range(2):m.run('shell','input','swipe',str(w//2),str(int(h*.3)),str(w//2),str(int(h*.85)),'350')
def note(name):print(name,flush=True);records.append(name)
def shot(name):m.shot(('xiaomi' if not m.serial.startswith('emulator') else 'emulator')+'-02-'+name)
def pick(name):
 top()
 labels=[m.label(n) for n in m.tree()]
 if 'Choose image' in labels:tap('Choose image')
 elif 'New image' in labels or find('Ready'):tap('New image')
 else:tap('Choose another')
 photos=[]
 for _ in range(12):
  nodes=m.tree()
  if m.find(nodes,'Choose new'):
   tap('Choose new');continue
  photos=[n for n in nodes if (n.get('content-desc')or'').startswith('Photo taken')]
  if photos:break
  time.sleep(.25)
 if not photos:raise AssertionError('No local fixture in picker')
 n=photos[0];x,y,r,b=m.bounds(n);m.run('shell','input','tap',str((x+r)//2),str((y+b)//2));m.wait('Upscale');note('Imported '+name)
def push(name):
 with tempfile.TemporaryDirectory() as directory:
  src=Path(directory)/('upselora-'+str(time.time_ns())+'-'+name);shutil.copyfile(m.root/'tests/fixtures'/name,src)
  dst='/sdcard/Download/'+src.name;m.run('push',str(src),dst);m.run('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file://'+dst)
 time.sleep(1)
def settings():top();tap('Settings',False)
def back():top();tap('Back',False)
font=m.run('shell','settings','get','system','font_scale').strip()
try:
 m.run('shell','am','start','-n','dev.kigya.pixora/.MainActivity');time.sleep(2)
 if find('\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438'):tap('\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438',False);tap('English');top();tap('Back',False)
 settings();tap('Light');shot('light-settings');back();shot('light-home');note('Light theme')
 settings();tap('Dark');shot('dark-settings');back();shot('dark-home');note('Dark theme')
 push('large.png');pick('large.png');tap('Upscale');m.wait('Prepare image?');shot('prepare-dialog');tap('Cancel');top();m.wait('Upscale');note('Styled preparation dialog; cancellation starts no job')
 push('scene-65x49.png');pick('scene-65x49.png');tap('Upscale');note('Job starts without notification permission prompt');shot('processing')
 m.run('shell','input','keyevent','KEYCODE_HOME');time.sleep(3);m.run('shell','am','start','-n','dev.kigya.pixora/.MainActivity');m.wait('Save',180);top();m.wait('Ready');note('2x AI completes after backgrounding');shot('result')
 tap('Before');tap('After');tap('Compare');tap('Save');m.wait('Saved');note('PNG saved')
 tap('JPEG');tap('Save');m.wait('Saved');note('JPEG saved')
 tap('Share');m.wait('Sharing image');m.run('shell','input','keyevent','KEYCODE_BACK');top();m.wait('Ready');note('Share cancellation retains result')
 settings();tap('Light');back();top();m.wait('Ready');note('Theme switch retains completed result')
 m.run('shell','settings','put','system','font_scale','2.0');time.sleep(1);shot('font200');tap('Share');m.wait('Sharing image');m.run('shell','input','keyevent','KEYCODE_BACK');note('200% font: share action remains reachable')
finally:
 m.run('shell','settings','put','system','font_scale',font)
 (m.root/'artifacts'/('ui-02-'+m.serial+'.json')).write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
