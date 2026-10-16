#!/usr/bin/env python3
"""Create real before/after examples with bundled ncnn models (developer tool)."""
from pathlib import Path
import json,hashlib
import numpy as np
import cv2,ncnn
root=Path(__file__).resolve().parents[1]
out=root/'assets/profiles';out.mkdir(parents=True,exist_ok=True)
photo=cv2.resize(cv2.imread(str(root/'tests/fixtures/landscape-256.jpg')),(128,57),interpolation=cv2.INTER_AREA)
art=cv2.imread(str(root/'tests/fixtures/scene-65x49.png'))
pixel=np.zeros((12,16,3),dtype=np.uint8);pixel[:]=[48,25,18];pixel[2:10,4:12]=[120,210,255];pixel[4:6,5:7]=[12,12,12];pixel[4:6,9:11]=[12,12,12];pixel[8,6:10]=[30,30,160]
models=[('quality','realesrgan-x4plus',photo),('fast','realesr-general-x4v3',photo),('illustration','realesrgan-x4plus-anime',art),('illustration-fast','realesr-animevideov3-x4',art),('pixel','nearest-neighbor',pixel)]
records=[]
for mode,model,image in models:
 if mode=='pixel':result=cv2.resize(image,None,fx=4,fy=4,interpolation=cv2.INTER_NEAREST)
 else:
  with ncnn.Net() as net:
   net.opt.num_threads=2;net.opt.use_vulkan_compute=False;net.opt.use_fp16_storage=False;net.opt.use_fp16_arithmetic=False
   path=root/'android/app/src/main/assets/models'/model
   assert net.load_param(str(path)+'.param')==0;assert net.load_model(str(path)+'.bin')==0
   x=image[:,:,::-1].copy().transpose(2,0,1).astype(np.float32)/255
   with net.create_extractor() as ex:
    assert ex.input('in0' if mode=='fast' else 'data',ncnn.Mat(x).clone())==0
    code,tensor=ex.extract('out0' if mode=='fast' else 'output');assert code==0
    result=np.round(np.clip(np.array(tensor).transpose(1,2,0),0,1)*255).astype(np.uint8)[:,:,::-1]
 assert result.shape[:2]==(image.shape[0]*4,image.shape[1]*4)
 for suffix,arr in [('before',image),('after',result)]:assert cv2.imwrite(str(out/f'{mode}-{suffix}.png'),arr)
 records.append({'mode':mode,'model':model,'input':[image.shape[1],image.shape[0]],'output':[result.shape[1],result.shape[0]],'afterSha256':hashlib.sha256((out/f'{mode}-after.png').read_bytes()).hexdigest()})
 print(mode,'OK',flush=True)
(out/'manifest.json').write_text(json.dumps(records,indent=2)+'\n')
