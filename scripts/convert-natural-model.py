#!/usr/bin/env python3
"""Development-only conversion of official RealESRNet; parity is mandatory."""
from pathlib import Path
import hashlib,json,urllib.request
from importlib.metadata import version
import torch,numpy as np,pnnx,ncnn
root=Path(__file__).resolve().parents[1];cache=root/'.tools/model';assets=root/'android/app/src/main/assets/models'
urls={'rrdbnet_arch.py':'https://raw.githubusercontent.com/XPixelGroup/BasicSR/v1.4.2/basicsr/archs/rrdbnet_arch.py','RealESRNet_x4plus.pth':'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.1/RealESRNet_x4plus.pth'}
expected={'rrdbnet_arch.py':'6aa8eb3f77e918b90eeff4ebfaf8745abe0c40eb8fcc03abbc1928693d70ab58','RealESRNet_x4plus.pth':'a820b9bde89a874d7599d545567308ce6c128fc8754a53208eda016d40aa81df'}
provenance={}
for name,url in urls.items():
 path=cache/name
 if not path.exists():path.write_bytes(urllib.request.urlopen(url).read())
 digest=hashlib.sha256(path.read_bytes()).hexdigest();assert digest==expected[name],f'Unexpected checksum: {name}'
 provenance[name]={'url':url,'sha256':digest}
source=(cache/'rrdbnet_arch.py').read_text().replace('from basicsr.utils.registry import ARCH_REGISTRY\n','').replace('from .arch_util import default_init_weights, make_layer, pixel_unshuffle\n','').replace('@ARCH_REGISTRY.register()\n','')
# Initialization only: all parameters are subsequently replaced by official weights.
ns={'default_init_weights':lambda *a,**k:None,'make_layer':lambda cls,n,**k:torch.nn.Sequential(*(cls(**k) for _ in range(n))),'pixel_unshuffle':torch.nn.functional.pixel_unshuffle}
exec(compile(source,'official_rrdbnet_arch.py','exec'),ns)
model=ns['RRDBNet'](num_in_ch=3,num_out_ch=3,num_feat=64,num_block=23,num_grow_ch=32,scale=4).eval()
model.load_state_dict(torch.load(cache/'RealESRNet_x4plus.pth',map_location='cpu',weights_only=True)['params_ema'])
torch.set_num_threads(2);torch.manual_seed(17)
param=assets/'realesrnet-x4plus.param';weights=assets/'realesrnet-x4plus.bin'
pnnx.export(model,str(cache/'natural.pt'),inputs=[torch.rand(1,3,8,8)],inputs2=[torch.rand(1,3,17,19)],fp16=False,ncnnparam=str(param),ncnnbin=str(weights),ncnnpy=str(cache/'natural_ncnn.py'))
errors=[]
for h,w in [(8,8),(17,19),(33,49)]:
 image=torch.rand(1,3,h,w)
 with torch.no_grad():expected=model(image).numpy()[0].copy()
 with ncnn.Net() as net:
  net.opt.num_threads=2;net.opt.use_fp16_storage=False;net.opt.use_packing_layout=False
  assert net.load_param(str(param))==0 and net.load_model(str(weights))==0
  with net.create_extractor() as ex:
   assert ex.input('in0',ncnn.Mat(image.numpy()[0]).clone())==0
   code,out=ex.extract('out0');assert code==0;actual=np.array(out).copy()
 mae=float(np.abs(np.clip(expected,0,1)-np.clip(actual,0,1)).mean()*255)
 assert expected.shape==actual.shape and mae<=1,(expected.shape,actual.shape,mae)
 errors.append({'width':w,'height':h,'mae8bit':mae})
record={'repository':'https://github.com/xinntao/Real-ESRGAN','license':'BSD-3-Clause','architectureLicense':'Apache-2.0','tools':{name:version(name) for name in ['torch','numpy','pnnx','ncnn']},'inputs':provenance,'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [param,weights]},'conversion':{'input':'in0','output':'out0','fp16':False,'scale':4,'parity':errors}}
(root/'docs/natural-model.json').write_text(json.dumps(record,indent=2)+'\n')
manifest=root/'android/app/src/main/assets/model-manifest.json';data=json.loads(manifest.read_text());data.update(record['files']);manifest.write_text(json.dumps(data,indent=2)+'\n')
print(json.dumps(record['conversion']))
