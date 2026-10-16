#!/usr/bin/env python3
"""Generate an original synthetic PNG and PyTorch reference for Android parity."""
from pathlib import Path
import sys
import json
import numpy as np
import torch
import cv2
root=Path(__file__).resolve().parents[1]
cache=root/'.tools/model'
source=(cache/'srvgg_arch.py').read_text().replace('from basicsr.utils.registry import ARCH_REGISTRY','').replace('@ARCH_REGISTRY.register()','')
namespace={};exec(compile(source,'upstream-srvgg_arch.py','exec'),namespace)
model=namespace['SRVGGNetCompact'](num_in_ch=3,num_out_ch=3,num_feat=64,num_conv=32,upscale=4,act_type='prelu').eval()
model.load_state_dict(torch.load(cache/'realesr-general-x4v3.pth',map_location='cpu',weights_only=True)['params'])
y,x=np.mgrid[:24,:32]
pixels=np.stack([(x*7+y*3)%256,(y*11)%256,np.where((x+y)%8<4,40,220)],axis=-1).astype(np.uint8)
tensor=torch.from_numpy(pixels.transpose(2,0,1).copy()).unsqueeze(0).float()/255
with torch.no_grad():output=model(tensor).clamp(0,1)[0].numpy().transpose(1,2,0)
folder=root/'android/app/src/androidTest/assets'
assert cv2.imwrite(str(folder/'fast-input.png'),pixels[:,:,::-1])
assert cv2.imwrite(str(folder/'fast-reference.png'),np.round(output*255).astype(np.uint8)[:,:,::-1])
print('Original synthetic input and PyTorch reference generated')
