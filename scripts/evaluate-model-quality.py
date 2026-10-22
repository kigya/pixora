#!/usr/bin/env python3
"""Offline, real-ncnn comparison. Outputs stay outside the shipped asset tree.

Input corpus: JSON list of {id, input, reference?, split, license}. Paths relative
 to the manifest. Never use assets/presets as evaluation data. This harness does
 not select production weights: a separate blind visual review is mandatory.
"""
import argparse
import hashlib
import json
import math
import time
from pathlib import Path
import cv2
import ncnn
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
MODELS=[('standard','realesrgan-x4plus','data','output'),('lite','realesr-general-x4v3','in0','out0'),('natural','realesrnet-x4plus','in0','out0'),('art','realesrgan-x4plus-anime','data','output'),('legacy-art','realesr-animevideov3-x4','data','output')]

def infer(net,image,names):
    with net.create_extractor() as ex:
        tensor=np.ascontiguousarray(image.astype(np.float32).transpose(2,0,1)/255)
        assert ex.input(names[0],ncnn.Mat(tensor).clone())==0
        code,out=ex.extract(names[1]);assert code==0
        return np.clip(np.array(out).transpose(1,2,0).copy()*255,0,255)

def tiled(net,image,names,padding):
    h,w=image.shape[:2];output=np.empty((h*4,w*4,3),np.float32)
    for y in range(0,h,32):
        for x in range(0,w,32):
            r,b=min(w,x+32),min(h,y+32);l,t=max(0,x-padding),max(0,y-padding);rr,bb=min(w,r+padding),min(h,b+padding)
            tile=infer(net,image[t:bb,l:rr],names)
            output[y*4:b*4,x*4:r*4]=tile[(y-t)*4:(b-t)*4,(x-l)*4:(r-l)*4]
    return output

def ssim(a,b):
    a=a.astype(np.float64);b=b.astype(np.float64);mu1=cv2.GaussianBlur(a,(11,11),1.5);mu2=cv2.GaussianBlur(b,(11,11),1.5)
    v1=cv2.GaussianBlur(a*a,(11,11),1.5)-mu1*mu1;v2=cv2.GaussianBlur(b*b,(11,11),1.5)-mu2*mu2;cov=cv2.GaussianBlur(a*b,(11,11),1.5)-mu1*mu2
    return float((((2*mu1*mu2+6.5025)*(2*cov+58.5225))/((mu1*mu1+mu2*mu2+6.5025)*(v1+v2+58.5225))).mean())

def metrics(a,b,lpips_model=None):
    mse=float(np.mean((a.astype(np.float64)-b)**2));record={'mae8bit':float(np.abs(a-b).mean()),'maxError8bit':float(np.abs(a-b).max()),'psnrDb':10*math.log10(255**2/mse) if mse else None,'ssim':ssim(a,b)}
    if lpips_model is not None:
        import torch
        with torch.no_grad():record['lpips']=float(lpips_model(torch.from_numpy(a.transpose(2,0,1).copy()).float()[None]/127.5-1,torch.from_numpy(b.transpose(2,0,1).copy()).float()[None]/127.5-1).item())
    return record

def tta(net,image,names):
    results=[]
    for flip in (False,True):
        for turns in range(4):
            view=np.rot90(image,turns)
            if flip:view=np.fliplr(view)
            output=infer(net,np.ascontiguousarray(view),names)
            if flip:output=np.fliplr(output)
            results.append(np.rot90(output,-turns))
    return np.mean(results,axis=0)

def finish_candidate(image,preset):
    # Research only. Noise/flatness suppression and a local-range halo clamp.
    image=image.astype(np.float32);y=cv2.cvtColor(image,cv2.COLOR_RGB2GRAY);blur=cv2.GaussianBlur(y,(7,7),1)
    deviation=y-blur;median=cv2.medianBlur(y,3);noise=cv2.GaussianBlur(np.abs(y-median),(7,7),1)
    local_min=cv2.erode(y,np.ones((3,3),np.uint8));local_max=cv2.dilate(y,np.ones((3,3),np.uint8));contrast=local_max-local_min
    threshold=np.maximum(3,noise*2.5);amount=.15 if preset=='details' else .35
    delta=np.where((np.abs(deviation)>=threshold)&(contrast>=6),deviation*amount,0)
    delta=np.clip(delta,-4 if preset=='details' else -8,4 if preset=='details' else 8)
    delta=np.clip(delta,local_min-y,local_max-y)
    return np.clip(image+delta[:,:,None],0,255)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--corpus',type=Path);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--size',type=int,default=72);parser.add_argument('--lpips',action='store_true');args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    lpips_model=None
    if args.lpips:
        import lpips
        lpips_model=lpips.LPIPS(net='alex').eval()
    if args.corpus:
        records=json.loads(args.corpus.read_text());base=args.corpus.parent
        assert {r['split'] for r in records}>={'calibration','holdout'}
        inputs=[(r,cv2.imread(str(base/r['input']))[:,:,::-1],cv2.imread(str(base/r['reference']))[:,:,::-1] if r.get('reference') else None) for r in records]
    else:
        # Bounded smoke fixtures, intentionally insufficient to approve a model replacement.
        fixture=cv2.imread(str(ROOT/'tests/fixtures/landscape-256.jpg'))[:,:,::-1];size=args.size
        reference=cv2.resize(fixture,(size*4,size*3),interpolation=cv2.INTER_CUBIC)
        low=cv2.resize(reference,(size,max(1,size*3//4)),interpolation=cv2.INTER_AREA)
        inputs=[({'id':'landscape-smoke','split':'smoke','license':'CC-BY-SA-3.0; tests/fixtures/PHOTO-LICENSE.md'},low,reference)]
    report={'device':'host CPU, 2 threads, FP32 arithmetic; no device/emulator','purpose':'bounded correctness and candidate comparison, not production acceptance','lpips':'measured' if args.lpips else 'not-run','blindReview':'not-run','productionChangesApproved':False,'records':[]}
    for preset,model,input_name,output_name in MODELS:
        with ncnn.Net() as net:
            net.opt.num_threads=2;net.opt.use_vulkan_compute=False;net.opt.use_fp16_storage=False;net.opt.use_fp16_packed=False;net.opt.use_fp16_arithmetic=False
            root=ROOT/'android/app/src/main/assets/models'/model
            assert net.load_param(str(root)+'.param')==0 and net.load_model(str(root)+'.bin')==0
            hashes={s:hashlib.sha256(Path(str(root)+s).read_bytes()).hexdigest() for s in ('.param','.bin')}
            for record,image,reference in inputs:
                start=time.monotonic();baseline=infer(net,image,(input_name,output_name));elapsed=time.monotonic()-start
                entry={'profile':preset,'modelHashes':hashes,'case':record,'inputSize':[image.shape[1],image.shape[0]],'baselineSeconds':elapsed,'padding':{}}
                if reference is not None:entry['baselineToReference']=metrics(baseline,reference,lpips_model)
                for padding in (16,32,64):
                    start=time.monotonic();value=tiled(net,image,(input_name,output_name),padding);entry['padding'][str(padding)]={**metrics(value,baseline),'seconds':time.monotonic()-start}
                candidate=tta(net,image,(input_name,output_name));entry['ttaToBaseline']=metrics(candidate,baseline)
                if reference is not None:entry['ttaToReference']=metrics(candidate,reference,lpips_model)
                outputs={'baseline':baseline,'tta':candidate}
                if preset=='standard':
                    for finisher in ('details','sharp'):
                        result=finish_candidate(baseline,finisher);outputs['candidate-'+finisher]=result
                        if reference is not None:entry[finisher+'ToReference']=metrics(result,reference,lpips_model)
                    enlarged=cv2.resize(image,(baseline.shape[1],baseline.shape[0]),interpolation=cv2.INTER_LINEAR)
                    balanced=baseline+(cv2.GaussianBlur(enlarged,(0,0),3)-cv2.GaussianBlur(baseline,(0,0),3))*.2
                    outputs['candidate-balanced']=np.clip(balanced,0,255)
                    if reference is not None:entry['balancedToReference']=metrics(outputs['candidate-balanced'],reference,lpips_model)
                for name,output in outputs.items():cv2.imwrite(str(args.output/f'{preset}-{record["id"]}-{name}.png'),np.round(output).astype(np.uint8)[:,:,::-1])
                report['records'].append(entry);(args.output/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(preset,record['id'],round(elapsed,3),'s',flush=True)
if __name__=='__main__':main()
