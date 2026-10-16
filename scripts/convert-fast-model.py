#!/usr/bin/env python3
"""Development-only official SRVGG conversion. Never run by the phone."""
from pathlib import Path
import hashlib, json, urllib.request
import numpy as np
import torch
import pnnx
import ncnn

ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / 'docs/fast-model.json').read_text())
cache = ROOT / '.tools/model'
cache.mkdir(parents=True, exist_ok=True)
for name, info in manifest['inputs'].items():
    path = cache / name
    if not path.exists():
        path.write_bytes(urllib.request.urlopen(info['url']).read())
    if hashlib.sha256(path.read_bytes()).hexdigest() != info['sha256']:
        raise SystemExit(f'Checksum mismatch: {name}')
# Registry only registers the class in BasicSR. No computation is changed.
source = (cache / 'srvgg_arch.py').read_text().replace('from basicsr.utils.registry import ARCH_REGISTRY\n', '').replace('@ARCH_REGISTRY.register()\n', '')
namespace = {}
exec(compile(source, 'official_srvgg_arch.py', 'exec'), namespace)
model = namespace['SRVGGNetCompact'](num_conv=32).eval()
model.load_state_dict(torch.load(cache / 'realesr-general-x4v3.pth', map_location='cpu', weights_only=True)['params'])
torch.set_num_threads(2)
torch.manual_seed(17)
inputs = torch.rand(1, 3, 32, 40)
assets = ROOT / 'android/app/src/main/assets/models'
param = assets / 'realesr-general-x4v3.param'
weights = assets / 'realesr-general-x4v3.bin'
pnnx.export(model, str(cache / 'general.pt'), inputs=[inputs], inputs2=[torch.rand(1,3,48,56)], fp16=False, ncnnparam=str(param), ncnnbin=str(weights), ncnnpy=str(cache/'general_ncnn.py'))
# Compare dynamic dimensions, not just the shape used for tracing.
errors = []
for h,w in [(8,8), (32,40), (33,49)]:
    image = torch.rand(1,3,h,w)
    with torch.no_grad(): expected = model(image).numpy()[0].copy()
    with ncnn.Net() as net:
        net.opt.num_threads = 2
        net.opt.use_packing_layout = False
        net.opt.use_fp16_storage = False
        net.opt.use_fp16_packed = False
        net.opt.use_fp16_arithmetic = False
        assert net.load_param(str(param)) == 0
        assert net.load_model(str(weights)) == 0
        with net.create_extractor() as extractor:
            assert extractor.input('in0', ncnn.Mat(image.numpy()[0]).clone()) == 0
            code, output = extractor.extract('out0')
            assert code == 0
            actual = np.array(output).copy()
    mae = float(np.abs(np.clip(expected,0,1)-np.clip(actual,0,1)).mean()*255)
    assert actual.shape == expected.shape and mae <= 1, (actual.shape, expected.shape, mae)
    errors.append({'width':w,'height':h,'mae8bit':mae})
manifest['files'] = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in (param, weights)}
manifest['conversion'] = {'fp16':False,'input':'in0','output':'out0','scale':4,'parity':errors}
(ROOT/'docs/fast-model.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest['conversion'],indent=2))
