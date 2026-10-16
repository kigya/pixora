#!/usr/bin/env python3
"""Generate original CC0 fixtures. Development-only dependency: Pillow."""
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent.parent/'tests/fixtures'
root.mkdir(parents=True,exist_ok=True)
def scene(w,h):
 image=Image.new('RGB',(w,h))
 for y in range(h):
  for x in range(w):image.putpixel((x,y),(int(40+80*y/h),int(50+80*x/w),int(130+60*x/w)))
 d=ImageDraw.Draw(image)
 d.ellipse((w*.63,h*.1,w*.9,h*.46),fill=(255,196,105))
 d.polygon([(0,h*.83),(w*.18,h*.39),(w*.48,h*.88),(w*.63,h*.57),(w,h*.91),(w,h),(0,h)],fill=(24,41,49))
 d.rectangle((w*.3,h*.53,w*.57,h*.87),fill=(217,156,113));d.polygon([(w*.26,h*.55),(w*.43,h*.34),(w*.62,h*.55)],fill=(112,37,79))
 d.rectangle((w*.4,h*.66,w*.48,h*.87),fill=(36,26,62));d.rectangle((w*.32,h*.59,w*.38,h*.67),fill=(248,224,168))
 return image
small=scene(65,49);small.save(root/'scene-65x49.png');small.save(root/'photo.jpg',quality=90);small.save(root/'static.webp')
alpha=small.convert('RGBA');a=Image.new('L',alpha.size,0);d=ImageDraw.Draw(a);d.rounded_rectangle((4,4,60,44),radius=10,fill=255);alpha.putalpha(a);alpha.save(root/'alpha.png')
scene(1200,800).save(root/'large.png');scene(257,193).save(root/'cancellation.png')
for orientation,name in [(6,'rotated.jpg'),(5,'mirrored.jpg')]:
 exif=small.getexif();exif[274]=orientation;small.save(root/name,exif=exif)
scene(8,257).save(root/'narrow.png')
Image.new('RGB',(16,16),'black').save(root/'black.png')
scene(1024,1024).save(root/'maximum.png')
small.save(root/'animated.webp',save_all=True,append_images=[scene(65,49).transpose(Image.Transpose.FLIP_LEFT_RIGHT)],duration=150,loop=0)
small.save(root/'animated.gif',save_all=True,append_images=[scene(65,49).transpose(Image.Transpose.FLIP_LEFT_RIGHT)],duration=150,loop=0)
(root/'corrupt.png').write_bytes(b'\x89PNG\r\n\x1a\ncorrupt')
(root/'unsupported.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
print('Original fixtures generated')
