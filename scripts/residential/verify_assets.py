"""Blender background verification of packed source and exported GLB delivery."""
import argparse, hashlib, json, struct, sys
from pathlib import Path
import bpy
from mathutils import Vector
import numpy as np

p=argparse.ArgumentParser();p.add_argument('--out',required=True)
args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(args.out)
blend=out/'云澜汇_03四房两厅.blend';glb=out/'云澜汇_03四房两厅.glb'
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(blend))
used_images=[i for i in bpy.data.images if i.type=='IMAGE' and i.users and i.source=='FILE']
missing=[i.name for i in used_images if not i.packed_file]
assert not missing,missing
source_meshes=sum(o.type=='MESH' for o in bpy.context.scene.objects)
raw=glb.read_bytes();magic,version,size=struct.unpack_from('<III',raw,0)
assert magic==0x46546c67 and version==2 and size==len(raw)
jlen,jtype=struct.unpack_from('<II',raw,12);assert jtype==0x4e4f534a
j=json.loads(raw[20:20+jlen]);offset=20+jlen
blen,btype=struct.unpack_from('<II',raw,offset);assert btype==0x004e4942
binary=raw[offset+8:offset+8+blen]
assert all('uri' not in b for b in j['buffers'])
assert all('bufferView' in i and 'uri' not in i for i in j.get('images',[]))
positions=set(p['attributes']['POSITION'] for m in j['meshes'] for p in m['primitives'])
for index in positions:
    a=j['accessors'][index];v=j['bufferViews'][a['bufferView']]
    assert a['componentType']==5126 and a['type']=='VEC3'
    values=np.ndarray((a['count'],3),dtype='<f4',buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',12),4))
    assert np.isfinite(values).all(),index
names=[n.get('name','') for n in j['nodes']]
for fragment in ['Arched mixer faucet','Rain shower riser','Hand shower hose','Duvet hanging edge seam']:
    assert any(fragment in n for n in names),fragment
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(glb))
bpy.context.view_layer.update()
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
assert len(meshes)==source_meshes,(len(meshes),source_meshes)
coordinates=[o.matrix_world@Vector(p) for o in meshes for p in o.bound_box]
minimum=[min(p[i] for p in coordinates) for i in range(3)];maximum=[max(p[i] for p in coordinates) for i in range(3)]
assert all(np.isfinite(minimum+maximum))
print('REIMPORTED_BOUNDS',minimum,maximum)
assert minimum[0]>-.2 and maximum[0]<17.8 and minimum[1]>-3 and maximum[1]<11.7 and maximum[2]<3.4
report={'blender':bpy.app.version_string,'blendSHA256':sha(blend),'glbSHA256':sha(glb),'usedPackedImages':len(used_images),'missingPackedImages':missing,'embeddedGLBImages':len(j.get('images',[])),'externalGLBResources':0,'finitePositionAccessors':len(positions),'sourceMeshObjects':source_meshes,'reimportedMeshObjects':len(meshes),'boundsBlender':{'min':minimum,'max':maximum},'punctualLights':len(j.get('extensions',{}).get('KHR_lights_punctual',{}).get('lights',[])),'areaLightsNote':'Blender area lights are saved in the blend; the offline viewer supplies room lighting because glTF has no area-light primitive.'}
(out/'asset-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('ASSET_VALIDATION',json.dumps(report,ensure_ascii=False))
