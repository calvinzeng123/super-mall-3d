"""Build the independent Yunlan 01/02 three-bedroom residences in Blender (metres, Z up).
Usage: Blender --background --factory-startup --python scripts/residential/build_three_bedroom.py -- --unit 01 --out DIR [--quick] [--no-render]
All source assets stay unmodified. The resulting .blend packs all used images.
"""
import bpy, math, json, os, sys, argparse, random
from pathlib import Path
from mathutils import Vector, Matrix
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
import furniture
args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
p = argparse.ArgumentParser(); p.add_argument('--unit',required=True,choices=['01','02']); p.add_argument('--out',required=True); p.add_argument('--quick',action='store_true'); p.add_argument('--no-render',action='store_true'); p.add_argument('--views',default='overview,plan,living,master,kitchen,balcony,dining,bath,bedroom2,bedroom3,commonBath,night')
ARGS=p.parse_args(args); OUT=Path(ARGS.out);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
 if col.name!='Collection':bpy.data.collections.remove(col)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
COL={}
def collection(name):
 c=bpy.data.collections.new(name);scene.collection.children.link(c);COL[name]=c;return c
for n in ['Structure','Ceilings','Windows','Joinery','Furnishings','Lighting','Cameras']:collection(n)
def link(obj,col='Furnishings'):
 for c in list(obj.users_collection):c.objects.unlink(obj)
 COL[col].objects.link(obj);return obj

def rgb(hex):
 v=[int(hex[i:i+2],16)/255 for i in (1,3,5)]
 return tuple(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v)
def material(name,hex,rough=.5,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*rgb(hex),1);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=m.diffuse_color;n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal;return m
M={k:material('Yunlan '+k,h,r,m) for k,h,r,m in [
 ('paint','#ede8df',.8,0),('oak','#bf9f73',.5,0),('stone','#e3ddcf',.4,0),('metal','#8b6b43',.28,.75),('black','#242726',.32,.35),('white','#faf6eb',.24,0),('fabric','#dbd4c5',.9,0),('green','#465d43',.65,0),('clay','#b17453',.65,0),('grout','#bab2a5',.9,0),('glass','#dce9e6',.05,0)]}
g=M['glass'].node_tree.nodes.get('Principled BSDF');g.inputs['Transmission Weight'].default_value=.97;g.inputs['IOR'].default_value=1.45
M['glass'].diffuse_color=(*rgb('#dce9e6'),.25)
M['light']=material('Yunlan warm diffuser','#fff1d5',.45);bs=M['light'].node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(*rgb('#ffdfa7'),1);bs.inputs['Emission Strength'].default_value=3
# Documented CC0 maps already bundled with the campus. UVs are assigned in metres.
for key,asset in [('oak','oak_wood_planks'),('stone','marble_01')]:
 m=M[key];nt=m.node_tree;bs=nt.nodes.get('Principled BSDF')
 for kind,socket in [('color','Base Color'),('roughness','Roughness'),('normal','Normal')]:
  path=ROOT/'assets/textures'/asset/(kind+'.jpg');tex=nt.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(path));tex.image.pack()
  if kind!='color':tex.image.colorspace_settings.name='Non-Color'
  if kind=='normal':
   norm=nt.nodes.new('ShaderNodeNormalMap');norm.inputs['Strength'].default_value=.22;nt.links.new(tex.outputs['Color'],norm.inputs['Color']);nt.links.new(norm.outputs['Normal'],bs.inputs[socket])
  else:nt.links.new(tex.outputs['Color'],bs.inputs[socket])

def uv_meters(o,meters=2.6):
 if o.type!='MESH':return
 uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
 for face in o.data.polygons:
  n=face.normal;axis=max(range(3),key=lambda i:abs(n[i]));axes=[i for i in range(3) if i!=axis]
  for li in face.loop_indices:
   v=o.data.vertices[o.data.loops[li].vertex_index].co
   uv.data[li].uv=(v[axes[0]]/meters,v[axes[1]]/meters)

def box(name,loc,size,mat='paint',bevel=.012,col='Furnishings'):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(M[mat] if isinstance(mat,str) else mat);uv_meters(o)
 if bevel:
  mod=o.modifiers.new('Small crafted edges','BEVEL');mod.width=min(bevel,min(size)*.22);mod.segments=3
  mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
 link(o,col);return o

def cyl(name,loc,radius,depth,mat='metal',vertices=32,col='Furnishings'):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc);o=bpy.context.object;o.name=name;o.data.materials.append(M[mat]);link(o,col)
 for face in o.data.polygons:face.use_smooth=len(face.vertices)==4
 mod=o.modifiers.new('Turned edge','BEVEL');mod.width=min(.008,depth*.15);mod.segments=2;return o

def area(name,loc,target,power,size,color='#ffe5bf',shape='DISK',size_y=None):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=rgb(color);d.shape=shape;d.size=size
 if size_y is not None:d.size_y=size_y
 o=bpy.data.objects.new(name,d);COL['Lighting'].objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o

def cam(name,loc,target,lens=25,ortho=None):
 d=bpy.data.cameras.new(name);d.lens=lens;d.clip_start=.08;d.clip_end=200;o=bpy.data.objects.new(name,d);COL['Cameras'].objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
 if ortho:d.type='ORTHO';d.ortho_scale=ortho
 return o

# The user's actual upholstery, headboard, linen and fittings are preserved.
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/models/user-suite-processed.glb'))
source={o.name:o for o in scene.objects if o.type=='MESH'}
GROUPS={
 'bed':(['Bed 床','BedWall 床头背景墙','Nightstands 床头柜与吊灯','Nightstands 床头柜与吊灯 [C 天花]','BedroomRug 卧室地毯'],(3.45,-1.191842,0)),
 'sofa':(['Sofa 沙发'],(3.45,-5.26,0)),
 'art':(['Art 挂画 [S 南墙]'],(3.45,-5.73,1.55)),
 'art_entry':(['EntryPrints 玄关挂画'],(7.12,-3.465,1.5)),
 'console':(['EntryConsole 玄关台与圆镜'],(9.45,-3.573681,0)),
 'pouf':(['Pouf 圆凳'],(4.85,-4.2,0)),
 'floorlamp':(['FloorLamp 落地灯'],(5.03,-5.30,0)),
}
source_matrices={n:o.matrix_world.copy() for n,o in source.items()}
def clone(group,target,yaw=0,label=''):
 names,anchor=GROUPS[group];transform=Matrix.Translation(target)@Matrix.Rotation(yaw,4,'Z')@Matrix.Translation(-Vector(anchor))
 copied=[]
 for n in names:
  if n not in source:continue
  o=source[n].copy();o.data=source[n].data;o.parent=None;o.name=f'Furniture {label} {n}';COL['Furnishings'].objects.link(o);o.matrix_world=transform@source_matrices[n];copied.append(o)
 return copied
# Keep source meshes as library only while constructing; delete originals before save/export.
source_originals=list(scene.objects)

# ---- Architecture: all dimensions and openings come from the unit plan ----
PLAN=json.loads((Path(__file__).parent/('plan_'+ARGS.unit+'.json')).read_text())
W,D=PLAN['envelope']['outer_rect'][2:]
H=PLAN['envelope']['ceiling_z']
BRECT=PLAN['balcony']['rect']; BW=BRECT[2]-BRECT[0]; BD=BRECT[3]-BRECT[1]
box('Structure main floor slab',(W/2,D/2,-.13),(W,D,.22),'paint',.005,'Structure')
# Narrow real plank geometry, batched into one mesh; UVs keep millimetre seams.
verts=[];faces=[];uvs=[];rng=random.Random(31)
for row in range(math.ceil(D/.18)):
 y0=row*.18;y1=min(D,y0+.18);x0=-(row%3)*.4
 while x0<W:
  xa=max(0,x0);xb=min(W,x0+1.2)
  if xb-xa>.01:
   k=len(verts);verts.extend([(xa+.002,y0+.002,-.027),(xb-.002,y0+.002,-.027),(xb-.002,y1-.002,-.027),(xa+.002,y1-.002,-.027),(xa+.002,y0+.002,0),(xb-.002,y0+.002,0),(xb-.002,y1-.002,0),(xa+.002,y1-.002,0)])
   faces.extend([tuple(k+i for i in f) for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]])
  x0+=1.2
me=bpy.data.meshes.new('Metered oak planks');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('Floor individually jointed oak',me);COL['Structure'].objects.link(o);o.data.materials.append(M['oak']);uv_meters(o,2.4)
box('Balcony structural slab',((BRECT[0]+BRECT[2])/2,(BRECT[1]+BRECT[3])/2,-.16),(BW,BD,.24),'paint',.006,'Structure')
# Real tiled floors and subtle grout in wet zones and on the balcony.
def tile_floor(name,r,size=.6,z=.012):
 x0,y0,x1,y1=r;box(name+' grout bed',((x0+x1)/2,(y0+y1)/2,z-.012),(x1-x0,y1-y0,.018),'grout',0,'Structure')
 for ix in range(math.ceil((x1-x0)/size)):
  for iy in range(math.ceil((y1-y0)/size)):
   a=x0+ix*size;b=y0+iy*size;ww=min(size,x1-a);dd=min(size,y1-b)
   box(name+' porcelain tile',(a+ww/2,b+dd/2,z),(ww-.003,dd-.003,.02),'stone',.001,'Structure')
for r in PLAN['rooms']:
 if r['type'] in ['bathroom','utility','kitchen']:
  for rect in r['floor_rects']:tile_floor(r['id'],rect)
tile_floor('Balcony limestone',BRECT,.8,-.018)

DOORS=[]
def wall_piece(name,a,b,start,end,z0,z1,thickness,mat='paint',col='Structure'):
 if end-start<.005 or z1-z0<.005:return
 dx,dy=b[0]-a[0],b[1]-a[1];L=math.hypot(dx,dy);cx=a[0]+dx*(start+end)/2/L;cy=a[1]+dy*(start+end)/2/L
 o=box(name,(cx,cy,(z0+z1)/2),(end-start,thickness,z1-z0),mat,.005,col);o.rotation_euler.z=math.atan2(dy,dx);return o
for wall in PLAN['walls']:
 a,b=wall['a'],wall['b'];L=math.dist(a,b);t=wall['thickness'];cursor=0;openings=sorted(wall.get('openings',[]),key=lambda op:op['at'])
 for op in openings:
  lo,hi=op['at']-op['width']/2,op['at']+op['width']/2
  wall_piece('Wall '+wall['id'],a,b,cursor,lo,0,H,t)
  wall_piece('Wall '+wall['id']+' sill',a,b,lo,hi,0,op['bottom'],t)
  wall_piece('Wall '+wall['id']+' lintel',a,b,lo,hi,op['top'],H,t);cursor=hi
 wall_piece('Wall '+wall['id'],a,b,cursor,L,0,H,t)
 # Skirting follows the actual door cutouts on both sides of the wall.
 breaks=[0,L]
 for op in openings:
  if op['bottom']<.02:breaks.extend([op['at']-op['width']/2,op['at']+op['width']/2])
 breaks=sorted(breaks)
 for start,end in zip(breaks,breaks[1:]):
  mid=(start+end)/2
  if any(op['bottom']<.02 and abs(mid-op['at'])<op['width']/2 for op in openings):continue
  for side in [-1,1]:
   normal=Vector((-(b[1]-a[1])/L,(b[0]-a[0])/L))*side*(t/2+.01)
   aa=[a[0]+normal.x,a[1]+normal.y];bb=[b[0]+normal.x,b[1]+normal.y]
   wall_piece('Skirting '+wall['id'],aa,bb,start,end,0,.075,.018,'oak','Joinery')
 for op in openings:
  lo,hi=op['at']-op['width']/2,op['at']+op['width']/2;z0,z1=op['bottom'],op['top'];mat='black' if op['type']=='window' or 'slid' in op.get('style','') else 'oak'
  wall_piece('Frame '+op['id'],a,b,lo-.026,lo+.026,z0,z1,t+.028,mat,'Windows')
  wall_piece('Frame '+op['id'],a,b,hi-.026,hi+.026,z0,z1,t+.028,mat,'Windows')
  wall_piece('Frame '+op['id'],a,b,lo,hi,z1-.022,z1+.022,t+.028,mat,'Windows')
  if op['type']=='window':
   wall_piece('Frame sill '+op['id'],a,b,lo,hi,z0-.025,z0+.025,t+.05,'stone','Windows')
   count=max(2,round(op['width']/1.1))
   for i in range(count):
    l=lo+i*op['width']/count;r=lo+(i+1)*op['width']/count
    wall_piece('Glass '+op['id'],a,b,l+.025,r-.025,z0+.025,z1-.025,.008,'glass','Windows')
    if i:wall_piece('Mullion '+op['id'],a,b,l-.018,l+.018,z0,z1,.055,'black','Windows')
  elif op.get('style')=='sliding':
   for l,r in op.get('parked_panel_zones',[]):
    # Already expressed in global X for the south elevation.
    wall_piece('Glass parked balcony panel',a,b,*sorted([(l-a[0])/(1 if b[0]>a[0] else -1),(r-a[0])/(1 if b[0]>a[0] else -1)]),.035,z1-.03,.018,'glass','Windows')
    for edge in [*sorted([(l-a[0])/(1 if b[0]>a[0] else -1),(r-a[0])/(1 if b[0]>a[0] else -1)])]:wall_piece('Balcony slider stile',a,b,edge-.022,edge+.022,.01,z1,.06,'black','Windows')
   wall_piece('Balcony recessed track',a,b,lo,hi,.002,.018,.17,'black','Windows')
  elif op.get('style')=='pocket_sliding':
   # An open pocket door stores its leaf inside the adjoining wall cavity.
   segment=op.get('parking_segment')
   if segment:
    aa,bb=segment;length=math.dist(aa,bb)
    leaf=wall_piece('Door concealed pocket leaf '+op['id'],aa,bb,0,length,.02,z1-.04,.032,'oak','Joinery')
    if leaf:leaf['intentionalPocket']=True
   wall_piece('Pocket sliding upper rail '+op['id'],a,b,lo,hi,z1-.035,z1-.012,.05,'black','Joinery')
  elif op.get('open_leaf'):

   aa,bb=op['open_leaf'];length=math.dist(aa,bb)
   door=wall_piece('Door open '+op['id'],aa,bb,0,length,0,z1-.04,.042,'oak','Joinery');DOORS.append(door)
   wall_piece('Door face inlay '+op['id'],aa,bb,.08,length-.08,.16,z1-.16,.046,'paint','Joinery')
   dx,dy=(bb[0]-aa[0])/length,(bb[1]-aa[1])/length
   for side in [-1,1]:
    hx=bb[0]-.12*dx-side*dy*.042;hy=bb[1]-.12*dy+side*dx*.042
    h=cyl('Door brushed lever',(hx,hy,1.02),.011,.13);h.rotation_euler=(Vector((dx,dy,0))).to_track_quat('Z','Y').to_euler();h.location.x-=dx*.055;h.location.y-=dy*.055

# Real pleated curtains are derived from exterior bedroom/living windows.
def curtain(name,x0,x1,y,z0=.10,z1=2.67):
 seg=64;vs=[];fs=[]
 for iz in range(9):
  z=z0+(z1-z0)*iz/8
  for i in range(seg+1):
   x=x0+(x1-x0)*i/seg;vs.append((x,y+.026*math.sin(i/seg*math.pi*18)+.010*math.sin(iz*.8),z))
 for iz in range(8):
  for i in range(seg):
   k=iz*(seg+1)+i;fs.append((k,k+1,k+seg+2,k+seg+1))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);mesh.update();o=bpy.data.objects.new(name,mesh);COL['Windows'].objects.link(o);o.data.materials.append(M['fabric']);uv_meters(o)
 for face in mesh.polygons:face.use_smooth=True
 sol=o.modifiers.new('Fabric thickness','SOLIDIFY');sol.thickness=.002

def curtains_for_opening(wall,op):
 a,b=wall['a'],wall['b'];dx,dy=b[0]-a[0],b[1]-a[1];L=math.hypot(dx,dy)
 # The south/north facades carry fabric side panels; side windows stay unobstructed.
 if abs(dy)>.001:return
 cy=a[1]; width=op['width'];cx=a[0]+dx*op['at']/L;lo=cx-width/2;hi=cx+width/2
 if not (abs(cy-.1)<.01 or abs(cy-(D-.1))<.01):return
 if not (op['type']=='window' and op['bottom']<1.05 or op.get('style')=='sliding'):return
 if op.get('room')=='kitchen' or 'kitchen' in op.get('connects',[]) or 'bath' in op['id']:return
 # Curtains keep centre glazing clear and do not sit inside the window frame.
 y=.26 if cy<D/2 else D-.30
 for x0,x1 in [(lo-.04,lo+min(.42,width*.18)),(hi-min(.42,width*.18),hi+.04)]:
  curtain('Curtain linen '+op['id'],x0,x1,y)
 box('Curtain recessed track '+op['id'],(cx,y,2.77),(width+.13,.12,.04),'paint',.005,'Joinery')
for wall in PLAN['walls']:
 for op in wall.get('openings',[]):curtains_for_opening(wall,op)

# Flush gypsum ceiling, recessed border, visible downlight lenses.
for r in PLAN['rooms']:
 for i,(x0,y0,x1,y1) in enumerate(r['floor_rects']):
  roof=box('Ceiling '+r['id']+str(i),((x0+x1)/2,(y0+y1)/2,H+.08),(x1-x0,y1-y0,.16),'paint',.006,'Ceilings');roof['viewerRole']='roof'
  for y in [y0+.14,y1-.14]:
   roof=box('Ceiling shadow gap',((x0+x1)/2,y,H-.006),(max(.05,x1-x0-.28),.018,.015),'black',0,'Ceilings');roof['viewerRole']='roof'
# Balcony safety glazing with real rails and continuous drainage.
for a,b in PLAN['balcony']['rails']:
 L=math.dist(a,b);wall_piece('Balcony safety glass',a,b,0,L,.08,1.12,.016,'glass','Windows');wall_piece('Balcony bronze handrail',a,b,0,L,1.12,1.165,.045,'metal','Windows')
 for i in range(math.ceil(L/1.4)+1):
  t=min(L,i*1.4);wall_piece('Balcony railing post',a,b,max(0,t-.015),min(L,t+.015),.02,1.14,.035,'metal','Windows')
box('Balcony slot drain',(W/2,BRECT[1]+.30,-.001),(W-1,.048,.018),'black',.004,'Structure')

# ---- Detailed domestic furnishings ----
M['mirror']=material('Yunlan polished mirror','#efeee8',.055,1)
if ARGS.unit=='02':
 # The mirrored home has a muted sage textile palette, not just a new number.
 bs=M['fabric'].node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb('#bbc4b2'),1)
 M['fabric'].diffuse_color=(*rgb('#bbc4b2'),1)
furniture.set_context(M,COL['Furnishings'])
ASSEMBLY=PLAN['assembly']
ASSEMBLY_GROUPS=[]

def label_group(objects,spec,kind):
 for o in objects:
  o['assemblyKind']=kind;o['unit']=ARGS.unit
  if spec.get('id'):o['assemblyId']=spec['id']
  if spec.get('room'):o['roomId']=spec['room']
 ASSEMBLY_GROUPS.append({'kind':kind,'id':spec.get('id',kind),'room':spec.get('room'),'objects':len(objects),'mirrored':bool(spec.get('mirror_x'))})
 return objects

def sourced(kind,spec):
 names,anchor=GROUPS[kind]
 matrix=Matrix.Translation(spec['target'])@Matrix.Rotation(spec.get('yaw',0),4,'Z')
 if spec.get('mirror_x'):matrix=matrix@Matrix.Diagonal((-1,1,1,1))
 matrix=matrix@Matrix.Translation(-Vector(anchor));objects=[]
 for name in names:
  if name not in source:raise ValueError('Missing source furniture: '+name)
  o=source[name].copy();o.data=source[name].data;o.parent=None
  o.name='Furniture '+spec.get('id',kind)+' '+name;COL['Furnishings'].objects.link(o);o.matrix_world=matrix@source_matrices[name];objects.append(o)
 return label_group(objects,spec,'source_'+kind)

def generated(kind,spec):
 mapping={'beds':'build_bed','wardrobes':'build_wardrobe','studies':'build_study','baths':'build_bathroom','kitchens':'build_kitchen','dining':'build_dining','laundry':'build_laundry','balcony':'build_balcony'}
 allowed={
  'beds':['width','variant'], 'wardrobes':['length'], 'studies':['length'],
  'baths':['width','depth','laundry','entry_side'],
  'kitchens':['length','depth','wall_height','appliances','sink','cooktop','upper'],
  'dining':['width','depth'], 'laundry':['width','depth'], 'balcony':['width','depth']}
 kwargs={k:spec[k] for k in allowed[kind] if k in spec}
 if kind=='baths':kwargs.setdefault('laundry',False)
 objects=getattr(furniture,mapping[kind])(spec['origin'],rotation=spec.get('yaw',0),**kwargs)
 if spec.get('mirror_x'):objects[0].scale.x=-1
 if kind=='balcony' and spec.get('relocate_west_linear_planter_x'):
  shift=spec['relocate_west_linear_planter_x']
  for o in objects:
   if o.parent==objects[0] and o.location.x<spec['width']*.5 and o.name.startswith(('Balcony linear planter','Planter soil surface','Low aromatic foliage')):
    o.location.x+=shift
 if kind=='kitchens':
  # Move the tall appliance to the south end of the main run so it does not cover the window.
  if spec.get('fridge_at_end') or spec.get('refrigerator_at_end'):
   shift=spec['length']-.77
   for o in objects:
    if o.parent==objects[0]:
     o.location.x += shift if any(t in o.name.lower() for t in ['refrigerator','fridge']) else -.77
  if spec.get('low_splashback'):
   for o in objects:
    if o.name.startswith('Stone splashback'):o.dimensions.z=.04;o.location.z=.90
 return label_group(objects,spec,kind)

sourced('bed',ASSEMBLY['source_bed'])
for kind,key in [('sofa','sofas'),('art','artworks'),('floorlamp','floorlamps'),('pouf','poufs'),('console','consoles')]:
 for item in ASSEMBLY.get(key,[]):sourced(kind,item)
for kind in ['beds','wardrobes','studies','baths','kitchens','dining','laundry','balcony']:
 value=ASSEMBLY.get(kind,[])
 if isinstance(value,dict):value=[value]
 for spec in value:generated(kind,spec)

# Living wall, media joinery, nested tables and a separate reading corner.
# This base composition is reflected geometrically for 02 after construction.
custom_before=set(scene.objects)
box('Living wool inset rug',(9.0,2.80,.009),(4.6,3.35,.018),'fabric',.04)
box('Living floating travertine media console',(5.96,2.85,.34),(.57,3.2,.36),'stone',.026)
box('Living oak media wall',(5.69,2.90,1.42),(.055,3.65,2.7),'oak',.015,'Joinery')
box('Living television brushed frame',(5.744,2.95,1.56),(.085,2.07,1.19),'black',.025)
box('Living television dark glass',(5.792,2.95,1.56),(.01,1.99,1.10),'black',.006)
for y in [1.8,2.52,3.24,3.96]:box('Media fluted cabinet drawer',(6.262,y,.36),(.022,.67,.27),'oak',.005)
for x,y,r,h in [(8.6,2.9,.60,.34),(9.25,2.4,.40,.43)]:
 cyl('Nested coffee stone top',(x,y,h),r,.055,'stone',64);cyl('Nested coffee bronze pedestal',(x,y,h/2),r*.38,h-.045,'metal',48)
box('Coffee table art book',(8.55,2.8,.386),(.32,.25,.033),'clay',.004)
cyl('Coffee table cup',(8.80,3.04,.418),.045,.075,'white',32)
# Open library occupies the opaque south-wall segment east of the balcony door.
box('Living reading bookcase back',(14.07,.257,1.13),(1.90,.035,2.20),'oak',.008,'Joinery')
for z in [.10,.60,1.10,1.60,2.16]:box('Living reading bookshelf',(14.07,.45,z),(1.90,.39,.035),'oak',.006)
for x in [13.145,14.995]:box('Living bookcase side',(x,.45,1.13),(.032,.39,2.18),'oak',.005)
for row,z in enumerate([.625,1.125,1.625]):
 for k in range(8):
  x=13.40+k*.075+(row%2)*.38
  o=box('Reading library book',(x,.45,z+.13),(.045,.21,.26),'clay' if k%3==0 else 'fabric',.002)
  o.rotation_euler.y=(k%3-1)*.05
reading_xy=(14.17,2.14) if ARGS.unit=='01' else (W-2.2,1.90)
table_xy=(13.82,3.0) if ARGS.unit=='01' else (W-2.75,2.70)
cyl('Reading side table top',(*table_xy,.53),.36,.04,'stone',48)
cyl('Reading side table pedestal',(*table_xy,.26),.08,.51,'metal',32)
# Fine upholstered reading chair, built from the same curved furniture primitives.
B=furniture._Builder('Living reading chair',(*reading_xy,0),math.pi/2)
furniture._chair(B,0,0,0,False,'fabric');furniture._finish(B)
for o in list(set(scene.objects)-custom_before):
 if ARGS.unit=='02' and not o.parent:o.matrix_world=Matrix.Translation((W,0,0))@Matrix.Diagonal((-1,1,1,1))@o.matrix_world
 o['roomId']='living';o['assemblyKind']='living_joinery'

# Mirror/runner at arrival: sizes deliberately clear the actual door leaf.
spec=ASSEMBLY.get('entry_mirror')
if spec:
 x,y,z=spec['origin'];side=1 if ARGS.unit=='02' else -1
 box('Foyer bronze mirror frame',(x,y,z),(.035,.68,1.44),'metal',.012,'Joinery')
 box('Foyer full length mirror',(x+side*.021,y,z),(.007,.63,1.39),'mirror',.006,'Joinery')
for key,name,mat in [('entry_runner','Foyer woven runner','fabric'),('service_canopy','Laundry protective stone canopy','stone')]:
 spec=ASSEMBLY.get(key)
 if spec:box(name,spec['origin'],spec['size'],mat,.015,'Joinery')
for spec in ASSEMBLY.get('boxes',[]):
 obj=box(spec['name'],spec['location'],spec['size'],spec.get('material','oak'),spec.get('bevel',.008),spec.get('collection','Joinery'))
 obj.rotation_euler.z=spec.get('yaw',0)
 if spec.get('room'):obj['roomId']=spec['room']

# Bathroom stone lining covers only actual wall solids, preserving windows and doors.
for room in PLAN['rooms']:
 if room['type']!='bathroom':continue
 x0,y0,x1,y1=room['floor_rects'][0]
 # North face is behind each vanity/shower. Get openings from any overlapping horizontal wall.
 cuts=[];face_y=y1-.071
 for wall in PLAN['walls']:
  a,b=wall['a'],wall['b']
  if abs(a[1]-b[1])>.001 or abs(a[1]-y1)>.11:continue
  if max(a[0],b[0])<=x0 or min(a[0],b[0])>=x1:continue
  face_y=a[1]-wall['thickness']/2-.011
  sign=1 if b[0]>a[0] else -1
  for opening in wall.get('openings',[]):
   cx=a[0]+sign*opening['at'];cuts.append((cx-opening['width']/2,cx+opening['width']/2,opening['bottom'],opening['top']))
 xs=sorted(set([x0+.065,x1-.065]+[v for c in cuts for v in c[:2] if x0+.065<v<x1-.065]))
 zs=sorted(set([0,.9,1.8,2.7]+[v for c in cuts for v in c[2:] if 0<v<2.7]))
 for xa,xb in zip(xs,xs[1:]):
  for za,zb in zip(zs,zs[1:]):
   if any(c[0]<(xa+xb)/2<c[1] and c[2]<(za+zb)/2<c[3] for c in cuts):continue
   obj=box('Wet room stone rear wall '+room['id'],((xa+xb)/2,face_y,(za+zb)/2),(xb-xa-.004,.022,zb-za-.004),'stone',.001,'Joinery');obj['roomId']=room['id']

# Three-layer lighting: daylight, broad downlights and local task lighting.
LIGHTS=[]
for room in PLAN['rooms']:
 if room['type']=='balcony':continue
 for index,rect in enumerate(room['floor_rects']):
  x0,y0,x1,y1=rect;area_m=(x1-x0)*(y1-y0);cx=(x0+x1)/2;cy=(y0+y1)/2
  if area_m<2:continue
  positions=[(cx,cy)] if area_m<32 else [(x0+(x1-x0)*.28,cy),(x0+(x1-x0)*.72,cy)]
  for li,(x,y) in enumerate(positions):
   power=min(210,max(55,area_m*6/len(positions)));size=min(1.1,max(.40,math.sqrt(area_m)*.16))
   light=area('Light interior '+room['id']+str(index)+str(li),(x,y,H-.13),(x,y,0),power,size);light['basePower']=power;LIGHTS.append(light)
   bezel=cyl('Ceiling downlight bezel',(x,y,H-.032),.076,.018,'black',32,'Ceilings');bezel['viewerRole']='roof'
   lens=cyl('Ceiling downlight lens',(x,y,H-.043),.064,.01,'light',32,'Ceilings');lens['viewerRole']='roof'

def p01(pos):return (W-pos[0],pos[1],pos[2]) if ARGS.unit=='02' else pos
area('Light primary bedside',p01((.56,3.65,2.45)),p01((1.45,3.65,.4)),20,.32)
area('Light media wash',p01((6.55,2.9,2.6)),p01((5.6,2.9,1.2)),45,.8)
area('Light kitchen task',p01((5.25,9.65,1.58)),p01((5.45,9.65,.9)),25,1.4,shape='RECTANGLE',size_y=.10)
area('Light balcony evening',(W/2,-1.25,2.66),(W/2,-1.25,0),105,3.5)
DAYLIGHT=area('DAY south broad sky',(W/2,-5.8,5.8),(W/2,5.5,.7),2600,W*.72,'#e6efff',shape='RECTANGLE',size_y=6)
NORTHLIGHT=area('DAY north broad sky',(W/2,D+3.5,5),(W/2,7,.7),1500,W*.83,'#eef3ff',shape='RECTANGLE',size_y=5)
sun_data=bpy.data.lights.new('DAY afternoon sun','SUN');sun_data.energy=2.1;sun_data.angle=.10;sun_data.color=rgb('#ffebd1');SUN=bpy.data.objects.new('DAY afternoon sun',sun_data);COL['Lighting'].objects.link(SUN);SUN.rotation_euler=Vector((.55,1,-.8)).to_track_quat('-Z','Y').to_euler()
world=bpy.data.worlds.new('Yunlan quiet sky');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs['Color'].default_value=(*rgb('#dce4ec'),1);world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.45

CAM={}
for view in PLAN['views']:
 key={'primary':'master'}.get(view['id'],view['id']);ortho=view.get('ortho')
 if key=='overview':ortho=max(26.5,ortho or 0)
 if key=='plan':ortho=max(22.5,ortho or 0)
 CAM[key]=cam('Camera '+key,view['position'],view['target'],view.get('lens',23),ortho)
if 'overview' not in CAM:CAM['overview']=cam('Camera default overview',(W+7,-19,23),(W/2,4.2,0),ortho=26.5)
if 'plan' not in CAM:CAM['plan']=cam('Camera default plan',(W/2,4.35,30),(W/2,4.35,0),ortho=22.5)
CAM.setdefault('entry',cam('Camera arrival',p01((8.5,8.95,1.61)),p01((8.7,10.85,1.12)),24))
CAM['night']=CAM['living']
# Remove only original imported objects, preserving the reused mesh/image datablocks.
for o in source_originals:
 if o.name in bpy.data.objects:bpy.data.objects.remove(o,do_unlink=True)
for c in list(bpy.data.collections):
 if c.name=='Orphan Nodes':bpy.data.collections.remove(c)
bpy.context.view_layer.update()
# Bake mirrored furniture to unique, positive-transform meshes. Winding correction
# keeps glTF front faces and Blender normals consistent after a reflection.
mirrored=[];depsgraph=bpy.context.evaluated_depsgraph_get()
for o in list(scene.objects):
 if o.type=='MESH' and o.matrix_world.determinant()<0:
  mesh=bpy.data.meshes.new_from_object(o.evaluated_get(depsgraph),preserve_all_data_layers=True,depsgraph=depsgraph)
  matrix=o.matrix_world.copy();mesh.transform(matrix);mesh.flip_normals();mesh.update();mirrored.append((o,mesh))
for o,mesh in mirrored:
 o.parent=None;o.modifiers.clear();o.data=mesh;o.matrix_world=Matrix.Identity(4);o['reflectionBaked']=True
# Drop the now-empty reflection hierarchy; exported nodes have no negative scale.
while True:
 unused=[o for o in scene.objects if o.type=='EMPTY' and not o.children]
 if not unused:break
 for o in unused:bpy.data.objects.remove(o,do_unlink=True)
bpy.context.view_layer.update()
assert not any(o.type=='CURVE' for o in scene.objects),'Unbaked curve geometry would be omitted by GLB selection'
assert not any(o.type=='MESH' and o.matrix_world.determinant()<0 for o in scene.objects),'Mirrored mesh still has negative transform'

# Deliver editable scene, embedded model and real rendered interiors.
scene.render.engine='CYCLES';scene.cycles.samples=24 if ARGS.quick else 72;scene.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences
try:
 prefs.compute_device_type='METAL';prefs.get_devices()
 for device in prefs.devices:device.use=device.type=='METAL'
 scene.cycles.device='GPU'
except Exception:scene.cycles.device='CPU'
scene.cycles.max_bounces=7;scene.cycles.transparent_max_bounces=8;scene.cycles.transmission_bounces=6
scene.render.resolution_x=1000 if ARGS.quick else 1600;scene.render.resolution_y=750 if ARGS.quick else 1100;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.7
scene.camera=CAM['overview'];COL['Ceilings'].hide_render=True
bpy.context.preferences.filepaths.save_version=0
stem='云澜汇_'+ARGS.unit+'三房两厅';blend_path=OUT/(stem+'.blend');glb_path=OUT/(stem+'.glb')
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(blend_path),compress=True)
COL['Ceilings'].hide_render=False
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
 if o.type in ['MESH','LIGHT','CAMERA','EMPTY']:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(glb_path),export_format='GLB',use_selection=True,export_apply=True,export_cameras=True,export_lights=True,export_extras=True,export_image_format='AUTO')
report={'blenderVersion':bpy.app.version_string,'plan':PLAN['id'],'unit':ARGS.unit,'rooms':PLAN['rooms'],'area':PLAN['area'],'objects':len(scene.objects),'meshObjects':sum(o.type=='MESH' for o in scene.objects),'lights':sum(o.type=='LIGHT' for o in scene.objects),'sourceFurnitureScale':1,'mirroredMeshesBaked':len(mirrored),'assembly':ASSEMBLY_GROUPS,'blend':str(blend_path),'glb':str(glb_path),'renders':[]}
(OUT/'build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
if not ARGS.no_render:
 for view in ARGS.views.split(','):
  view=view.strip()
  if view not in CAM:print('SKIP unknown view',view);continue
  night=view=='night';COL['Ceilings'].hide_render=view in ['overview','plan'];scene.camera=CAM[view]
  SUN.data.energy=.04 if night else 2.1;DAYLIGHT.data.energy=70 if night else 2600;NORTHLIGHT.data.energy=40 if night else 1500
  world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.08 if night else .45
  scene.render.filepath=str(OUT/(view+'.png'));bpy.ops.render.render(write_still=True);report['renders'].append(view+'.png')
  (OUT/'build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
COL['Ceilings'].hide_render=True;scene.camera=CAM['overview'];SUN.data.energy=2.1;DAYLIGHT.data.energy=2600;NORTHLIGHT.data.energy=1500;world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.45
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path),compress=True)
print('RESIDENCE_COMPLETE',json.dumps({k:v for k,v in report.items() if k not in ['rooms','assembly']},ensure_ascii=False))
