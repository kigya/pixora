#!/usr/bin/env python3
"""Research-only weight candidates. Never writes bundled models or their manifests.

Downloads are supplied in --cache with an inspected, hash-pinned sources.json.
Uses official architectures already audited by the project and a pinned SwinIR
source. A smoke corpus cannot approve a production model replacement.
"""
import argparse, hashlib, json, math
from pathlib import Path
import cv2, numpy as np, torch
from PIL import Image, ImageDraw
import importlib.util
helper=importlib.util.spec_from_file_location('pixora_quality',Path(__file__).with_name('evaluate-model-quality.py'))
quality=importlib.util.module_from_spec(helper);helper.loader.exec_module(quality)
metrics=quality.metrics

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(path):
    state=torch.load(path,map_location='cpu',weights_only=True)
    return state.get('params_ema',state.get('params',state))
def interpolate(a,b,factor):
    assert a.keys()==b.keys()
    assert all(a[k].shape==b[k].shape and a[k].dtype==b[k].dtype for k in a)
    return {k:a[k]* (1-factor) + b[k]*factor for k in a}
def architecture(path,kind,torch):
    source=path.read_text()
    if kind=='rrdb':
        source=source.replace('from basicsr.archs.arch_util import default_init_weights, make_layer, pixel_unshuffle\n','').replace('from .arch_util import default_init_weights, make_layer, pixel_unshuffle\n','')
    source=source.replace('from basicsr.utils.registry import ARCH_REGISTRY\n','').replace('@ARCH_REGISTRY.register()\n','')
    ns={'default_init_weights':lambda *a,**k:None,'make_layer':lambda cls,n,**k:torch.nn.Sequential(*(cls(**k) for _ in range(n))),'pixel_unshuffle':lambda x,scale:torch.nn.functional.pixel_unshuffle(x,scale)}
    exec(compile(source,str(path),'exec'),ns)
    return ns['RRDBNet' if kind=='rrdb' else 'SRVGGNetCompact']
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--cache',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();root=Path(__file__).resolve().parents[1];args.output.mkdir(parents=True,exist_ok=True)
    sources=json.loads((args.cache/'sources.json').read_text())
    for name,record in sources.items():
        if 'sha256' in record:assert digest(args.cache/name)==record['sha256'],name
    torch.set_num_threads(2)
    import lpips
    measure=lpips.LPIPS(net='alex').eval()
    RRDB=architecture(root/'.tools/model/rrdbnet_arch.py','rrdb',torch);VGG=architecture(root/'.tools/model/srvgg_arch.py','vgg',torch)
    standard=load(args.cache/'RealESRGAN_x4plus.pth');natural=load(root/'.tools/model/RealESRNet_x4plus.pth');general=load(root/'.tools/model/realesr-general-x4v3.pth');wdn=load(args.cache/'realesr-general-wdn-x4v3.pth')
    configs=[('standard',RRDB(num_in_ch=3,num_out_ch=3,num_feat=64,num_block=23,num_grow_ch=32,scale=4),standard,4),('natural',RRDB(num_in_ch=3,num_out_ch=3,num_feat=64,num_block=23,num_grow_ch=32,scale=4),natural,4),('native-2x',RRDB(num_in_ch=3,num_out_ch=3,num_feat=64,num_block=23,num_grow_ch=32,scale=2),load(args.cache/'RealESRGAN_x2plus.pth'),2)]
    for f in (0.,.5,1.):configs.append((f'lite-denoise-{f}',VGG(num_conv=32),interpolate(wdn,general,f),4))
    for f in (.15,.3):configs.append((f'natural-gan-{f}',RRDB(num_in_ch=3,num_out_ch=3,num_feat=64,num_block=23,num_grow_ch=32,scale=4),interpolate(natural,standard,f),4))
    # Only definition code is loaded after inspection; inference semantics are unchanged.
    source_manifest=json.loads((args.cache/'swinir-source-manifest.json').read_text());swin_path=args.cache/'swinir-network_swinir.py';assert digest(swin_path)==source_manifest['files'][0]['sha256']
    src=swin_path.read_text().replace('from timm.models.layers import DropPath, to_2tuple, trunc_normal_','')
    ns={'DropPath':torch.nn.Identity,'to_2tuple':lambda x:x if isinstance(x,tuple) else (x,x),'trunc_normal_':torch.nn.init.trunc_normal_};exec(compile(src,str(swin_path),'exec'),ns)
    swin=ns['SwinIR'](upscale=4,in_chans=3,img_size=64,window_size=8,img_range=1.,depths=[6]*6,embed_dim=180,num_heads=[6]*6,mlp_ratio=2,upsampler='nearest+conv',resi_connection='1conv')
    configs.append(('swinir-real',swin,load(args.cache/'SwinIR-M-realSR-GAN.pth'),4))
    photo=cv2.imread(str(root/'tests/fixtures/landscape-256.jpg'))[:,:,::-1][:96,:128]
    drawing=Image.new('RGB',(128,96),'#eeeeee');draw=ImageDraw.Draw(drawing)
    draw.text((8,5),'Pixora 2026\nABC 123',fill='#222222');draw.line([(4,72),(48,25),(120,72)],fill='#8050c0',width=2);draw.rectangle((10,76,117,89),outline='#202020',width=1)
    references=[('landscape','calibration',photo),('lines-text','holdout',np.array(drawing))]
    inputs=[];rng=np.random.default_rng(17)
    for name,split,reference in references:
        low=cv2.resize(reference,(32,24),interpolation=cv2.INTER_AREA)
        for damage in ('clean','jpeg-noise'):
            image=low
            if damage=='jpeg-noise':
                image=np.clip(low+rng.normal(0,3,low.shape),0,255).astype(np.uint8);_,data=cv2.imencode('.jpg',image[:,:,::-1],[cv2.IMWRITE_JPEG_QUALITY,35]);image=cv2.imdecode(data,1)[:,:,::-1]
            inputs.append((name+'-'+damage,split,image,reference))
    report={'sources':sources,'swinirSource':source_manifest,'architectureAdaptations':'registry/initialization wiring; eval-only DropPath identity; timm tuple/trunc_normal from torch','blindReview':'not-run','representativeCorpus':'not-run; only landscape and synthetic lines/text, two degradations each','shippingDecision':'retain all existing weights and finishers; insufficient evidence for no-regression','records':[]}
    for name,model,state,scale in configs:
        model.load_state_dict(state,strict=True);model.eval()
        if 'denoise-' in name or 'natural-gan-' in name:
            path=args.output/(name+'.pth');torch.save({'params':state},path);weight_hash=digest(path)
        else:weight_hash=None
        for id,split,image,reference in inputs:
            with torch.no_grad():value=model(torch.from_numpy(image.astype(np.float32).transpose(2,0,1).copy())[None]/255)[0].numpy().transpose(1,2,0)*255
            value=np.clip(value,0,255);ref=reference if scale==4 else cv2.resize(reference,(image.shape[1]*2,image.shape[0]*2),interpolation=cv2.INTER_AREA)
            record={'candidate':name,'case':id,'split':split,'scale':scale,'weightSha256':weight_hash,**metrics(value,ref,measure)}
            report['records'].append(record)
            if name=='standard':
                down=cv2.resize(np.round(value).astype(np.uint8),(image.shape[1]*2,image.shape[0]*2),interpolation=cv2.INTER_LINEAR).astype(np.float32)
                target=cv2.resize(reference,(image.shape[1]*2,image.shape[0]*2),interpolation=cv2.INTER_AREA)
                report['records'].append({'candidate':'standard-4x-to-2x','case':id,'split':split,'scale':2,**metrics(down,target,measure)})
            cv2.imwrite(str(args.output/f'{name}-{id}.png'),np.round(value).astype(np.uint8)[:,:,::-1])
        (args.output/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(name,'evaluated',flush=True)
if __name__=='__main__':main()
