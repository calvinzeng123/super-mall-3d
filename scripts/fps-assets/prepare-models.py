"""Resize embedded licensed textures without changing source meshes or animations.
Input files are fetched from the pinned URLs in assets/models/fps/sources.json.
Run: python3 scripts/fps-assets/prepare-models.py /tmp/yunlan-fps-source
"""
from pathlib import Path
from PIL import Image
import sys,struct,json,io,hashlib
ROOT=Path(__file__).resolve().parents[2]
SOURCE=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/tmp/yunlan-fps-source')
OUTPUT=ROOT/'assets/models/fps'
OUTPUT.mkdir(parents=True,exist_ok=True)
CONFIG=[('smg.glb','smg45-mobile.glb',1024),('pistol-hands.glb','pistol-hands-mobile.glb',1024),('desert-eagle.glb','desert-eagle-mobile.glb',512)]
records=[]
for source,name,maxsize in CONFIG:
 raw=(SOURCE/source).read_bytes()
 magic,version,total=struct.unpack_from('<III',raw)
 assert magic==0x46546c67 and version==2 and len(raw)==total
 jl,jt=struct.unpack_from('<II',raw,12);doc=json.loads(raw[20:20+jl])
 off=20+jl;bl,bt=struct.unpack_from('<II',raw,off);binary=raw[off+8:off+8+bl]
 assert bt==0x004e4942
 images={i['bufferView']:i for i in doc.get('images',[]) if 'bufferView' in i}
 chunks=[];offset=0;sizes=[]
 for index,view in enumerate(doc['bufferViews']):
  content=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
  if index in images:
   image=Image.open(io.BytesIO(content));old=list(image.size);image.thumbnail((maxsize,maxsize),Image.Resampling.LANCZOS)
   # All used materials are opaque. JPEG retains the authored albedo/normal/ORM
   # UV maps without requiring browser compression extensions or GPU decoders.
   dst=io.BytesIO();image.convert('RGB').save(dst,'JPEG',quality=92,optimize=True,subsampling=0)
   content=dst.getvalue();images[index]['mimeType']='image/jpeg';sizes.append({'name':images[index].get('name',str(index)),'source':old,'runtime':list(image.size),'bytes':len(content)})
  view['byteOffset']=offset;view['byteLength']=len(content);chunks.append(content)
  padding=(-len(content))%4;chunks.append(b'\0'*padding);offset+=len(content)+padding
 doc['buffers']=[{'byteLength':offset}]
 doc.setdefault('asset',{}).setdefault('extras',{})['yunlanAdaptation']='Embedded texture resize/recompression for mobile. Original mesh topology, source UVs, skin and reload clips retained. See sources.json.'
 js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binout=b''.join(chunks)
 result=struct.pack('<III',magic,version,12+8+len(js)+8+len(binout))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binout),bt)+binout
 (OUTPUT/name).write_bytes(result)
 tris=sum(doc['accessors'][p['indices']]['count']//3 for mesh in doc['meshes'] for p in mesh['primitives'] if 'indices' in p)
 record={'file':name,'bytes':len(result),'sha256':hashlib.sha256(result).hexdigest(),'sourceFile':source,'sourceBytes':len(raw),'sourceSha256':hashlib.sha256(raw).hexdigest(),'triangles':tris,'meshes':len(doc['meshes']),'animations':[a.get('name') for a in doc.get('animations',[])],'textures':sizes}
 records.append(record);print(name,len(result),tris,'triangles')
(OUTPUT/'manifest.json').write_text(json.dumps({'version':1,'files':records},indent=2)+'\n')
