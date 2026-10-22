#!/usr/bin/env python3
"""Reproduce the approved presentation-only degradation; never modifies After assets.

Requires Pillow. Input bytes come from the recorded Git revision, so reruns cannot
compound degradation. No generated image is represented as model evaluation data.
"""
import argparse
import hashlib
import io
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-ref')
    args = parser.parse_args()
    manifest_path = ROOT / 'assets/presets/manifest.json'
    manifest = json.loads(manifest_path.read_text())
    for record in manifest:
        if record['side'] != 'before':
            assert hashlib.sha256((manifest_path.parent / record['asset']).read_bytes()).hexdigest() == record['assetSha256']
            continue
        previous = record.get('presentationDegradation', {})
        ref = args.source_ref or previous.get('sourceGitRef') or subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
        data = subprocess.check_output(['git', 'show', f'{ref}:assets/presets/{record["asset"]}'], cwd=ROOT)
        with Image.open(io.BytesIO(data)) as source:
            image = source.convert('RGBA' if 'A' in source.getbands() else 'RGB')
            factor = 8 if record['profile'] in ('art', 'pixel') else 4
            small = image.resize((max(1, image.width // factor), max(1, image.height // factor)), Image.Resampling.BOX)
            sigma = 0.4 if record['profile'] in ('art', 'pixel') else 0.3
            image = small.filter(ImageFilter.GaussianBlur(sigma)).resize(image.size, Image.Resampling.BILINEAR)
            path = manifest_path.parent / record['asset']
            if path.suffix == '.jpg':
                image.convert('RGB').save(path, quality=35, subsampling=2, optimize=True)
            else:
                image.save(path, optimize=True)
        record['presentationDegradation'] = {
            'version': 1, 'sourceGitRef': ref,
            'sourceAssetSha256': hashlib.sha256(data).hexdigest(),
            'downsample': factor, 'downsampleFilter': 'box', 'blurSigmaAtReducedSize': sigma,
            'upsampleFilter': 'bilinear', 'jpegQuality': 35 if path.suffix == '.jpg' else None,
        }
        record['assetSha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
        record['bytes'] = path.stat().st_size
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print('Eight Before assets updated; all After checksums unchanged.')

if __name__ == '__main__':
    main()
