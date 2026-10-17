"""Rebuild locally bundled MIT Rocketbox crowd. Requires Python Pillow + Blender.
python3 scripts/people/prepare_people.py --cache /tmp/yunlan-rocketbox
Only two avatars and their color textures are downloaded; no entire repo clone.
"""
from pathlib import Path
from urllib.request import urlretrieve
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
import argparse, hashlib, json, subprocess, struct

ROOT=Path(__file__).resolve().parents[2]
REV='0943055db6ec570bcef9f2c8b41c9e5467c808f9'
BASE=f'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/{REV}/'
parser=argparse.ArgumentParser();parser.add_argument('--cache',default='/tmp/yunlan-rocketbox');parser.add_argument('--blender',default='/Applications/Blender.app/Contents/MacOS/Blender')
args=parser.parse_args();cache=Path(args.cache);cache.mkdir(parents=True,exist_ok=True)
out=ROOT/'assets/models/people';out.mkdir(parents=True,exist_ok=True)
paths=['LICENSE.md','README.md']
for sex,prefix in [('Male','m002'),('Female','f001')]:
 base=f'Assets/Avatars/Adults/{sex}_Adult_01/'
 paths += [base+f'Export/{sex}_Adult_01.fbx']+[base+f'Textures/{prefix}_{part}_color.tga' for part in ['body','head','opacity']]
def download(path):
 target=cache/path;target.parent.mkdir(parents=True,exist_ok=True)
 if not target.exists():urlretrieve(BASE+path,target)
 data=target.read_bytes()
 return {'path':path,'url':BASE+path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
with ThreadPoolExecutor(max_workers=4) as pool:sources=list(pool.map(download,paths))
for sex,short,prefix in [('Male','m','m002'),('Female','f','f001')]:
 atlas=Image.new('RGBA',(1024,1024),(255,255,255,255))
 for part,pos in [('body',(0,0)),('head',(512,0)),('opacity',(0,512))]:
  source=cache/'Assets/Avatars/Adults'/f'{sex}_Adult_01'/'Textures'/f'{prefix}_{part}_color.tga'
  im=Image.open(source).convert('RGBA').resize((512,512),Image.Resampling.LANCZOS)
  atlas.paste(im,pos)
 atlas.save(cache/f'{short}-atlas.png',optimize=True)
subprocess.run([args.blender,'--background','--threads','2','--python',str(ROOT/'scripts/people/bake_people.py'),'--',str(cache),str(out)],check=True)
models=json.loads((out/'bake-metrics.json').read_text())
for model in models:
 path=out/model['file'];data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0]
 gltf=json.loads(data[20:20+length]);binary=data[20+length:]
 # Preserve source alpha masks without thousands of blended transparent surfaces.
 for material in gltf.get('materials',[]):
  material['alphaMode']='MASK';material['alphaCutoff']=.45
  material['doubleSided']=True
 text=json.dumps(gltf,separators=(',',':')).encode();text+=b' '*((-len(text))%4)
 data=struct.pack('<III',0x46546c67,2,20+len(text)+len(binary))+struct.pack('<II',len(text),0x4e4f534a)+text+binary
 path.write_bytes(data)
 model.update({'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
(out/'LICENSE.txt').write_text((cache/'LICENSE.md').read_text())
(out/'manifest.json').write_text(json.dumps({'source':'Microsoft Rocketbox Avatar Library','repository':'https://github.com/microsoft/Microsoft-Rocketbox','revision':REV,'license':'MIT','licenseURL':f'https://github.com/microsoft/Microsoft-Rocketbox/blob/{REV}/LICENSE.md','sources':sources,'models':models,'processing':{'atlas':1024,'mobileTexture':512,'decimateRatio':.48,'motion':'New procedural native-rig eight-pose walk, not motion capture. Original library animation is not included.','notes':'Color textures preserved in UV atlas; relative walking morphs replace runtime skeletons. No source model scaling beyond human-height normalization.'}},indent=2)+'\n')
print(json.dumps({'models':models,'totalBytes':sum(m['bytes'] for m in models)},indent=2))
