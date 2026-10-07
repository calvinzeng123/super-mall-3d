"""Build the independent Yunlan 03 residence in Blender (metres, Z up).
Usage: Blender --background --factory-startup --python scripts/residential/build_residence.py -- --out DIR [--quick] [--no-render]
All source assets stay unmodified. The resulting .blend packs all used images.
"""
import bpy, math, json, os, sys, argparse, random
from pathlib import Path
from mathutils import Vector, Matrix
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
import furniture
args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
p = argparse.ArgumentParser(); p.add_argument('--out',required=True); p.add_argument('--quick',action='store_true'); p.add_argument('--no-render',action='store_true'); p.add_argument('--views',default='overview,plan,living,master,kitchen,balcony,dining,bath,bedroom2,bedroom3,guest,night')
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

# ---- Architecture: data-driven wall openings and room schedule ----
PLAN=json.loads((Path(__file__).parent/'plan_03.json').read_text())
W,D,H=17.6,11.5,2.85
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
box('Balcony structural slab',(W/2,-1.4,-.16),(W,2.8,.24),'paint',.006,'Structure')
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
tile_floor('Balcony limestone',[0,-2.8,W,0],.8,-.018)

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
    wall_piece('Glass parked balcony panel',a,b,l-a[0],r-a[0],.035,z1-.03,.018,'glass','Windows')
    for edge in [l-a[0],r-a[0]]:wall_piece('Balcony slider stile',a,b,edge-.022,edge+.022,.01,z1,.06,'black','Windows')
   wall_piece('Balcony recessed track',a,b,lo,hi,.002,.018,.17,'black','Windows')
  elif op.get('open_leaf'):
   aa,bb=op['open_leaf'];length=math.dist(aa,bb)
   door=wall_piece('Door open '+op['id'],aa,bb,0,length,0,z1-.04,.042,'oak','Joinery');DOORS.append(door)
   wall_piece('Door face inlay '+op['id'],aa,bb,.08,length-.08,.16,z1-.16,.046,'paint','Joinery')
   dx,dy=(bb[0]-aa[0])/length,(bb[1]-aa[1])/length
   for side in [-1,1]:
    hx=bb[0]-.12*dx-side*dy*.042;hy=bb[1]-.12*dy+side*dx*.042
    h=cyl('Door brushed lever',(hx,hy,1.02),.011,.13);h.rotation_euler=(Vector((dx,dy,0))).to_track_quat('Z','Y').to_euler();h.location.x-=dx*.055;h.location.y-=dy*.055

# Pleated side curtains at bedroom glazing and the living-room opening.
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
for x0,x1 in [(0.7,3.3),(6.2,12.2),(13.5,16.9)]:
 curtain('Curtain south linen left',x0-.07,x0+.44,.25);curtain('Curtain south linen right',x1-.44,x1+.07,.25)
 box('Curtain recessed track',((x0+x1)/2,.28,2.77),(x1-x0+.15,.13,.04),'paint',.005,'Joinery')
for x0,x1 in [(.7,3.9),(14.2,17.0)]:
 curtain('Curtain north linen left',x0-.05,x0+.4,11.17);curtain('Curtain north linen right',x1-.4,x1+.05,11.17)

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
box('Balcony slot drain',(8.8,-2.5,-.001),(16.6,.048,.018),'black',.004,'Structure')

furniture.set_context(M,COL['Furnishings'])
clone('bed',(1.45,3.65,.008),math.pi/2,'primary 1 to 1')
# Household bedroom fixtures are individually placed; the four rooms are not hotel copies.
furniture.build_bed((14.05,1.10,.018),width=1.5,rotation=math.pi/2,variant='guest')
furniture.build_bed((3.25,9.70,.018),width=1.5,rotation=-math.pi/2,variant='kids')
furniture.build_bed((15.0,9.70,.018),width=1.5,rotation=math.pi/2,variant='teen')
# Storage against opaque internal walls, never across exterior glazing or doors.
for origin,length,rotation in [((4.92,2.35,0),2.0,-math.pi/2),((13.57,3.05,0),1.9,math.pi/2),((2.50,7.77,0),2.10,math.pi),((17.32,7.77,0),1.7,math.pi),((8.09,9.50,0),1.4,math.pi/2)]:
 furniture.build_wardrobe(origin,length=length,rotation=rotation)
furniture.build_study((.85,8.25,0),rotation=math.pi/2,length=1.55)
furniture.build_study((16.75,9.10,0),rotation=-math.pi/2,length=1.1)
# Living: two original detailed sofas form a broad conversational L, keeping the balcony route open.
clone('sofa',(10.85,3.90,.016),math.pi/2,'living east sofa')
clone('sofa',(8.65,4.55,.016),math.pi,'living north sofa')
clone('art',(12.71,3.05,1.62),math.pi/2,'living artwork')
clone('floorlamp',(11.85,4.65,0),math.pi,'living reading')
box('Living wool inset rug',(8.93,2.9,.009),(4.6,3.55,.018),'fabric',.04)
box('Living floating travertine media console',(5.96,2.85,.34),(.57,3.2,.36),'stone',.026)
box('Living oak media wall',(5.69,2.90,1.42),(.055,3.65,2.7),'oak',.015,'Joinery')
box('Living television brushed frame',(5.744,2.95,1.56),(.085,2.07,1.19),'black',.025)
box('Living television dark glass',(5.792,2.95,1.56),(.01,1.99,1.10),'black',.006)
for y in [1.8,2.52,3.24,3.96]:box('Media fluted cabinet drawer',(6.262,y,.36),(.022,.67,.27),'oak',.005)
for x,y,r,h in [(8.6,2.9,.60,.34),(9.25,2.4,.40,.43)]:
 cyl('Nested coffee stone top',(x,y,h),r,.055,'stone',64);cyl('Nested coffee bronze pedestal',(x,y,h/2),r*.38,h-.045,'metal',48)
box('Coffee table art book',(8.55,2.8,.386),(.32,.25,.033),'clay',.004)
cyl('Coffee table cup',(8.80,3.04,.418),.045,.075,'white',32)
# Kitchens: north run under window and the west cooking/fridge run.
kitchen_run=furniture.build_kitchen((4.74,11.26,.018),rotation=-math.pi/2,length=4.02,appliances=True,sink=False,cooktop=True,upper=True)
# Put the tall refrigerator at the south end, leaving the north window unobstructed.
for o in kitchen_run:
 if o.parent and o.parent==kitchen_run[0]:
  o.location.x += 3.25 if any(word in o.name.lower() for word in ['refrigerator','fridge']) else -.77
north_counter=furniture.build_kitchen((7.22,11.27,.018),rotation=math.pi,length=1.76,appliances=False,sink=True,cooktop=False,upper=False)
for o in north_counter:
 if o.name.startswith('Stone splashback'):
  o.dimensions.z=.04;o.location.z=.90
furniture.build_dining((8.55,5.93,.018),width=4.2,depth=2.94)
furniture.build_bathroom((3.56,2.66,.018),width=1.98,depth=2.68,laundry=False,entry_side='west')
furniture.build_bathroom((15.45,2.66,.018),width=1.95,depth=2.68,laundry=False,entry_side='west')
furniture.build_bathroom((9.96,9.36,.018),width=2.38,depth=1.94,laundry=False,entry_side='west')
furniture.build_laundry((12.48,9.38,.018),width=1.24,depth=1.94)
furniture.build_balcony((.15,-2.65,-.018),width=17.3,depth=2.5,rotation=0)
# Wall cladding follows real exterior window openings instead of covering glazing.
for room in PLAN['rooms']:
 if room['type']!='bathroom':continue
 x0,y0,x1,y1=room['floor_rects'][0]
 holes=[]
 if y1>D-.01:
  for wall in PLAN['walls']:
   if abs(wall['a'][1]-(D-.1))>.01 or abs(wall['b'][1]-(D-.1))>.01:continue
   for op in wall.get('openings',[]):
    if op['type']=='window':
     cx=wall['a'][0]+op['at'];holes.append((cx-op['width']/2,cx+op['width']/2,op['bottom'],op['top']))
 xs=sorted(set([x0+.065,x1-.065]+[v for h in holes for v in h[:2] if x0+.065<v<x1-.065]))
 zs=sorted(set([0,.9,1.8,2.7]+[v for h in holes for v in h[2:] if 0<v<2.7]))
 for xa,xb in zip(xs,xs[1:]):
  for za,zb in zip(zs,zs[1:]):
   if any(h[0]<(xa+xb)/2<h[1] and h[2]<(za+zb)/2<h[3] for h in holes):continue
   yy=y1-.211 if y1>D-.01 else y1-.071
   box('Wet room stone rear wall',((xa+xb)/2,yy,(za+zb)/2),(xb-xa-.004,.022,zb-za-.004),'stone',.001,'Joinery')
# Entrance storage, bench and mirror form a usable arrival zone.
# Bathroom entry at the east wall remains completely open.
M['mirror']=material('Yunlan polished entry mirror','#efeee8',.055,1)
box('Foyer bronze mirror frame',(9.80,10.85,1.50),(.035,.68,1.44),'metal',.012,'Joinery')
box('Foyer full length mirror',(9.779,10.85,1.50),(.007,.63,1.39),'mirror',.006,'Joinery')

box('Foyer runner',(8.65,10.22,.018),(.87,1.75,.02),'fabric',.025)

# Three-layer lighting: natural daylight, soft downlights, and local task lighting.
LIGHTS=[]
for name,x,y,power,size in [('LivingA',7.4,2.3,150,.85),('LivingB',10.6,2.7,150,.85),('Dining',10.6,7.4,180,1.15),('Primary',1.7,2.0,100,.65),('PrimaryEntry',2.6,4.7,50,.45),('Guest',16.1,1.2,100,.65),('NWBedroom',2.3,9,120,.65),('NEBedroom',16,9,120,.65),('Kitchen',6.1,9.7,140,.75),('Foyer',8.65,10.2,60,.4),('GalleryWest',4.8,6.2,80,.45),('GalleryEast',15.6,6.2,60,.4),('PrimaryBath',4.6,4.05,85,.5),('GuestBath',16.5,4.05,85,.5),('CommonBath',11.25,10.4,80,.45),('Laundry',13.1,10.5,50,.35)]:
 light=area('Light interior '+name,(x,y,2.72),(x,y,0),power,size);light['basePower']=power;LIGHTS.append(light)
 bezel=cyl('Ceiling downlight bezel',(x,y,2.818),.076,.018,'black',32,'Ceilings');bezel['viewerRole']='roof'
 lens=cyl('Ceiling downlight lens',(x,y,2.807),.064,.01,'light',32,'Ceilings');lens['viewerRole']='roof'
area('Light primary bedside',(0.56,3.65,2.45),(1.45,3.65,.4),20,.32)
area('Light media wash',(6.55,2.9,2.6),(5.6,2.9,1.2),45,.8)
area('Light kitchen task',(5.25,9.65,1.58),(5.45,9.65,.9),25,1.4,shape='RECTANGLE',size_y=.10)
area('Light balcony evening',(9,-1.25,2.66),(9,-1.25,0),95,3.5)
DAYLIGHT=area('DAY south broad sky',(8.8,-5.8,5.8),(8.8,5.5,.7),2600,12,'#e6efff',shape='RECTANGLE',size_y=6)
NORTHLIGHT=area('DAY north broad sky',(8.8,15,5),(8.8,7,.7),1500,14,'#eef3ff',shape='RECTANGLE',size_y=5)
sun_data=bpy.data.lights.new('DAY afternoon sun','SUN');sun_data.energy=2.1;sun_data.angle=.10;sun_data.color=rgb('#ffebd1');SUN=bpy.data.objects.new('DAY afternoon sun',sun_data);COL['Lighting'].objects.link(SUN);SUN.rotation_euler=Vector((.55,1,-.8)).to_track_quat('-Z','Y').to_euler()
world=bpy.data.worlds.new('Yunlan quiet sky');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs['Color'].default_value=(*rgb('#dce4ec'),1);world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.45

CAM={
 'overview':cam('Camera overview',(24,-19,23),(8.8,4.2,0),ortho=25.2),
 'plan':cam('Camera plan',(8.8,4.35,30),(8.8,4.35,0),ortho=20.5),
 'living':cam('Camera living',(6.65,.75,1.57),(10.5,3.7,1.15),22),
 'master':cam('Camera master',(3.03,1.55,1.62),(1.15,3.95,1.1),23),
 'kitchen':cam('Camera kitchen',(6.98,7.73,1.6),(5.23,10.32,1.15),23),
 'balcony':cam('Camera balcony',(7.2,-1.7,1.6),(14.6,-1.0,1.0),24),
 'dining':cam('Camera dining',(8.0,5.30,1.60),(10.6,8,1.13),25),
 'bath':cam('Camera primary bathroom',(3.98,2.94,1.6),(4.65,4.76,1.05),20),
 'bedroom2':cam('Camera kids room',(1.55,7.95,1.58),(3.3,10.0,.85),24),
 'bedroom3':cam('Camera teen room',(16.30,7.90,1.6),(14.8,10,.85),24),
 'guest':cam('Camera south guest',(15.55,2.10,1.6),(13.25,.85,.9),23),
}
CAM['night']=CAM['living']
# Purge only imported source objects, retaining their linked furniture mesh data.
for o in source_originals:
 if o.name in bpy.data.objects:bpy.data.objects.remove(o,do_unlink=True)
for c in list(bpy.data.collections):
 if c.name=='Orphan Nodes':bpy.data.collections.remove(c)
bpy.context.view_layer.update()
# Full ceiling stored; preview render hides it for the cutaway only.
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
# Save materials and model before render so slow image generation never risks source loss.
bpy.ops.file.pack_all();blend_path=OUT/'云澜汇_03四房两厅.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend_path),compress=True)
# Include full ceilings in GLB. Viewers identify them by name/extras.
COL['Ceilings'].hide_render=False
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
 if o.type in ['MESH','LIGHT','CAMERA','EMPTY']:o.select_set(True)
glb_path=OUT/'云澜汇_03四房两厅.glb'
bpy.ops.export_scene.gltf(filepath=str(glb_path),export_format='GLB',use_selection=True,export_apply=True,export_cameras=True,export_lights=True,export_extras=True,export_image_format='AUTO')
report={'blenderVersion':bpy.app.version_string,'plan':PLAN['id'],'rooms':PLAN['rooms'],'area':PLAN['area'],'objects':len(scene.objects),'meshObjects':sum(o.type=='MESH' for o in scene.objects),'lights':sum(o.type=='LIGHT' for o in scene.objects),'sourceFurnitureScale':1,'blend':str(blend_path),'glb':str(glb_path),'renders':[]}
if not ARGS.no_render:
 for view in ARGS.views.split(','):
  view=view.strip()
  if view not in CAM:continue
  night=view=='night';COL['Ceilings'].hide_render=view in ['overview','plan'];scene.camera=CAM[view]
  SUN.data.energy=.04 if night else 2.1;DAYLIGHT.data.energy=70 if night else 2600;NORTHLIGHT.data.energy=40 if night else 1500
  world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.08 if night else .45
  scene.render.filepath=str(OUT/(view+'.png'));bpy.ops.render.render(write_still=True);report['renders'].append(view+'.png')
COL['Ceilings'].hide_render=True;scene.camera=CAM['overview'];SUN.data.energy=2.1;DAYLIGHT.data.energy=2600;NORTHLIGHT.data.energy=1500;world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.45
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path),compress=True)
(OUT/'build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('RESIDENCE_COMPLETE',json.dumps({k:v for k,v in report.items() if k not in ['rooms']},ensure_ascii=False))
