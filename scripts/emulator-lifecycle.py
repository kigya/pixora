#!/usr/bin/env python3
"""Additional lifecycle checks on an isolated ARM64 emulator, after smoke test.
Uses generated fixtures, replaces the app's test session, no external sharing.
"""
from pathlib import Path
import importlib.util,time,json
spec=importlib.util.spec_from_file_location('smoke',Path(__file__).with_name('emulator-smoke.py'))
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
try:
 s.run('shell','am','force-stop','dev.kigya.pixora')
 s.run('shell','am','start','-n','dev.kigya.pixora/.MainActivity')
 s.wait('\u0413\u043e\u0442\u043e\u0432\u043e');s.tap('\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438',False);s.tap('English');s.tap('Back',False);s.wait('Ready')
 s.import_fixture('cancellation.png')
 s.tap('Upscale');s.wait('CPU');s.tap('Cancel');s.wait('Processing cancelled',60)
 s.shot('cancelled');s.note('UI cancellation completed, input retained')
 s.tap('Try again');s.wait('CPU')
 s.run('shell','am','force-stop','dev.kigya.pixora')
 s.run('shell','am','start','-n','dev.kigya.pixora/.MainActivity')
 s.wait('Processing was interrupted. You can start again.');s.shot('interrupted');s.note('Force stop during inference restored INTERRUPTED')
 # Replacing an interrupted input uses Choose another, not New image.
 s.tap('Choose another');s.wait('Photos');s.run('shell','input','keyevent','KEYCODE_BACK')
 s.wait('Try again');s.note('Picker cancellation kept interrupted input')
finally:
 (s.root/'artifacts/ui-lifecycle.json').write_text(json.dumps(s.records,ensure_ascii=False,indent=2)+'\n')
