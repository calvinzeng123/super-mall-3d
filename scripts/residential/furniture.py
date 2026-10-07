"""Reusable metre-scale furniture for the independent residential Blender scene.

All room origins are southwest floor corners. Local +X is right, +Y is forward,
and +Z is up. Rotation is radians around +Z. Every builder returns a flat list
including its root Empty; child transforms remain relative to that root.

set_context(materials={...}, collection=bpy.data.collections[...]) accepts shared
Blender materials. Supported keys: oak, paint, stone, metal, black, white,
fabric, glass, green, mirror, warm, clay, blue, pink. Missing keys are generated;
oak and stone use the project's existing Poly Haven CC0 colour images.
"""
import math
from contextlib import contextmanager
from pathlib import Path

import bpy
from mathutils import Vector

_CTX = {"materials": {}, "collection": None}
_ROOT = Path(__file__).resolve().parents[2]
_COLORS = {
    "oak": (0.57, .40, .23, 1), "paint": (.72, .70, .62, 1),
    "stone": (.77, .75, .68, 1), "metal": (.32, .25, .15, 1),
    "black": (.018, .024, .023, 1), "white": (.88, .86, .80, 1),
    "fabric": (.63, .66, .54, 1), "glass": (.86, .96, .97, 1),
    "green": (.18, .29, .105, 1), "mirror": (.93, .95, .94, 1),
    "warm": (1.0, .67, .31, 1), "clay": (.40, .24, .15, 1),
    "blue": (.22, .38, .45, 1), "pink": (.62, .35, .30, 1),
}


def set_context(materials=None, collection=None):
    """Use shared materials/collection, retaining defaults for missing keys."""
    if materials is not None:
        _CTX["materials"] = dict(materials)
        aliases = {"wood": "oak", "brass": "metal", "linen": "fabric",
                   "plaster": "paint", "ceramic": "white", "foliage": "green"}
        for old, new in aliases.items():
            if old in materials and new not in materials:
                _CTX["materials"][new] = materials[old]
    if collection is not None:
        _CTX["collection"] = collection


def _material(key):
    shared = _CTX["materials"].get(key)
    if shared is not None:
        return shared
    name = "RES_Furniture_" + key
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = _COLORS.get(key, _COLORS["white"])
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = mat.diffuse_color
    bsdf.inputs["Roughness"].default_value = .48
    if key in ("metal", "mirror"):
        bsdf.inputs["Metallic"].default_value = 1
        bsdf.inputs["Roughness"].default_value = .23 if key == "metal" else .055
    if key == "glass":
        bsdf.inputs["Transmission Weight"].default_value = 1
        bsdf.inputs["Roughness"].default_value = .045
        bsdf.inputs["IOR"].default_value = 1.45
    if key == "warm":
        bsdf.inputs["Emission Color"].default_value = (1, .68, .32, 1)
        bsdf.inputs["Emission Strength"].default_value = 3.2
    texture = {"oak": "oak_wood_planks", "stone": "marble_01"}.get(key)
    if texture:
        directory = _ROOT / "assets" / "textures" / texture
        image = nodes.new("ShaderNodeTexImage")
        image.image = bpy.data.images.load(str(directory / "color.jpg"), check_existing=True)
        image.projection = "BOX"
        image.projection_blend = .18
        coords = nodes.new("ShaderNodeTexCoord")
        links.new(coords.outputs["Generated"], image.inputs["Vector"])
        links.new(image.outputs["Color"], bsdf.inputs["Base Color"])
    if key in ("fabric", "paint", "blue", "pink", "white"):
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 175 if key in ("fabric", "blue", "pink") else 85
        noise.inputs["Detail"].default_value = 2
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = .14 if key != "white" else .045
        bump.inputs["Distance"].default_value = .012 if key != "white" else .004
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


class _Builder:
    def __init__(self, name, origin, rotation):
        self.collection = _CTX["collection"] or bpy.context.scene.collection
        self.objects = []
        self.root = bpy.data.objects.new(name, None)
        self.collection.objects.link(self.root)
        self.root.location = origin
        self.root.rotation_euler[2] = rotation
        self.root["asset_type"] = "residential_furniture"
        self.objects.append(self.root)
        self.parent = self.root

    def add(self, obj, name, position, material=None):
        obj.name = name
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        self.collection.objects.link(obj)
        obj.parent = self.parent
        obj.location = position
        if material and hasattr(obj.data, "materials"):
            obj.data.materials.append(_material(material))
        self.objects.append(obj)
        return obj

    def mesh(self, name, vertices, faces, position=(0, 0, 0), material="oak", smooth=False):
        mesh = bpy.data.meshes.new(name + "Mesh")
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = self.add(bpy.data.objects.new(name, mesh), name, position, material)
        for polygon in mesh.polygons:
            polygon.use_smooth = smooth
        return obj

    def box(self, name, p, size, material="oak", bevel=.012, rotation=0):
        w, d, h = (s / 2 for s in size)
        v = [(-w,-d,-h),(-w,-d,h),(-w,d,-h),(-w,d,h),(w,-d,-h),(w,-d,h),(w,d,-h),(w,d,h)]
        f = [(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)]
        obj = self.mesh(name, v, f, p, material)
        obj.rotation_euler[2] = rotation
        if bevel:
            mod = obj.modifiers.new("Soft manufactured edges", "BEVEL")
            mod.width = min(bevel, min(size) * .44)
            mod.segments = 3
            mod.harden_normals = True
            normal = obj.modifiers.new("Weighted face normals", "WEIGHTED_NORMAL")
            normal.keep_sharp = True
        return obj

    def cylinder(self, name, p, radius, depth, material="metal", vertices=32, rotation=None):
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
        obj = self.add(bpy.context.object, name, p, material)
        if rotation:
            obj.rotation_euler = rotation
        for polygon in obj.data.polygons:
            polygon.use_smooth = len(polygon.vertices) == 4
        bevel = obj.modifiers.new("Edge softness", "BEVEL")
        bevel.width = min(.004, depth * .15, radius * .1)
        bevel.segments = 2
        return obj

    def sphere(self, name, p, scale, material="fabric"):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1)
        obj = self.add(bpy.context.object, name, p, material)
        obj.scale = scale
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        return obj

    def rod(self, name, a, b, radius=.015, material="metal"):
        a, b = Vector(a), Vector(b)
        obj = self.cylinder(name, (a + b) / 2, radius, (b - a).length, material, 16)
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = (b - a).to_track_quat("Z", "Y")
        return obj

    def curve(self, name, points, radius=.012, material="metal", cyclic=False):
        data = bpy.data.curves.new(name + "Curve", "CURVE")
        data.dimensions = "3D"
        data.resolution_u = 12
        data.bevel_depth = radius
        data.bevel_resolution = 3
        spline = data.splines.new("BEZIER")
        spline.bezier_points.add(len(points) - 1)
        for point, coord in zip(spline.bezier_points, points):
            point.co = coord
            point.handle_left_type = point.handle_right_type = "AUTO"
        spline.use_cyclic_u = cyclic
        return self.add(bpy.data.objects.new(name, data), name, (0, 0, 0), material)

    def ring(self, name, p, radius, tube=.008, material="metal", scale=(1,1,1), rotation=None):
        bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=tube, major_segments=48, minor_segments=10)
        obj = self.add(bpy.context.object, name, p, material)
        obj.scale = scale
        if rotation:
            obj.rotation_euler = rotation
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        return obj

    @contextmanager
    def frame(self, name, p, rotation=0):
        previous = self.parent
        obj = self.add(bpy.data.objects.new(name, None), name, p)
        obj.rotation_euler[2] = rotation
        self.parent = obj
        try:
            yield obj
        finally:
            self.parent = previous


def _finish(B):
    """Bake only this builder's curve leaves, so mesh-only GLB export is complete.

    Shared materials and parent transforms survive. No unrelated scene objects
    are selected, converted or removed; manufacturing modifiers on boxes stay
    editable and are applied by the caller's export_apply=True.
    """
    bpy.context.view_layer.update()
    for index, obj in enumerate(B.objects):
        if obj.type != "CURVE":
            continue
        depsgraph = bpy.context.evaluated_depsgraph_get()
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph),
                                               preserve_all_data_layers=True,
                                               depsgraph=depsgraph)
        name = obj.name
        source_data = obj.data
        converted = bpy.data.objects.new(name + " baked", mesh)
        for collection in list(obj.users_collection):
            collection.objects.link(converted)
        converted.parent = obj.parent
        converted.matrix_parent_inverse = obj.matrix_parent_inverse.copy()
        converted.matrix_basis = obj.matrix_basis.copy()
        for key in obj.keys():
            converted[key] = obj[key]
        if not mesh.materials:
            for material in source_data.materials:
                mesh.materials.append(material)
        B.objects[index] = converted
        bpy.data.objects.remove(obj, do_unlink=True)
        if source_data.users == 0:
            bpy.data.curves.remove(source_data)
        converted.name = name
    B.root["curves_baked_to_mesh"] = True
    return list(B.objects)


def _lathe(B, name, p, profile, material="white", segments=48, scale=(1,1,1)):
    vertices = []
    for r, z in profile:
        vertices.extend((math.cos(i * math.tau / segments) * r, math.sin(i * math.tau / segments) * r, z) for i in range(segments))
    faces = [(j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i)
             for j in range(len(profile)-1) for i in range(segments)]
    obj = B.mesh(name, vertices, faces, p, material, True)
    obj.scale = scale
    return obj


def _rounded_points(w, d, radius, segments=7):
    out = []
    for cx, cy, a0 in [(w/2-radius,d/2-radius,0),(-w/2+radius,d/2-radius,math.pi/2),(-w/2+radius,-d/2+radius,math.pi),(w/2-radius,-d/2+radius,math.pi*1.5)]:
        for i in range(segments+1):
            a = a0 + i * math.pi / 2 / segments
            out.append((cx + radius * math.cos(a), cy + radius * math.sin(a)))
    return out


def _sink(B, p, width=.54, depth=.41, material="metal"):
    profiles = [(width,depth,.06,0),(width-.035,depth-.035,.052,-.015),
                (width-.06,depth-.06,.055,-.155),(width-.10,depth-.10,.055,-.18)]
    vertices = []
    for w,d,r,z in profiles:
        vertices.extend((x,y,z) for x,y in _rounded_points(w,d,r))
    n = len(vertices)//len(profiles)
    faces = [(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(3) for i in range(n)]
    faces.append(tuple(range(3*n,4*n)))
    B.mesh("Recessed basin with curved corners", vertices, faces, p, material, True)
    B.cylinder("Basin drain", (p[0],p[1],p[2]-.177), .028, .008, "black")
    B.ring("Drain metal rim", (p[0],p[1],p[2]-.171), .027, .003, "metal")


def _tap(B, x, y, z):
    B.cylinder("Faucet mounting escutcheon", (x,y,z+.008), .037, .016)
    B.curve("Arched mixer faucet", [(x,y,z),(x,y,z+.23),(x,y+.05,z+.32),(x,y+.16,z+.31),(x,y+.205,z+.25)], .015)
    B.cylinder("Faucet aerator", (x,y+.205,z+.239), .018, .025)
    B.rod("Mixer handle", (x+.052,y,z+.05),(x+.052,y+.085,z+.105), .009)


def _cup(B, x, y, z, material="white"):
    _lathe(B,"Open ceramic cup",(x,y,z),[(.001,0),(.030,0),(.041,.006),(.044,.075),(.039,.078),(.035,.009),(.001,.009)],material,32)
    B.curve("Cup handle",[(x+.04,y,z+.06),(x+.066,y,z+.064),(x+.07,y,z+.035),(x+.041,y,z+.026)],.006,material)


def _books(B, x, y, z, count=6, length=.50):
    for i in range(count):
        thick = length / count * .82
        h = .20 + (i % 3) * .025
        B.box("Book cloth cover",(x+i*length/count,y,z+h/2),(thick,.16,h),["blue","white","fabric","pink"][i%4],.002)
        B.box("Book pages",(x+i*length/count,y+.006,z+h/2),(thick-.007,.151,h-.012),"white",.001)


def _plant(B, x, y, z=0, size=1):
    _lathe(B,"Tapered ceramic planter",(x,y,z),[(.16,0),(.20,.015),(.235,.35),(.222,.37),(.205,.34),(.18,.03)],"clay",40,scale=(size,size,size))
    B.cylinder("Planter soil",(x,y,z+.325*size),.205*size,.01*size,"black")
    for k in range(9):
        angle = k * 2.39996
        reach = (.23 + k % 2 * .08) * size
        height = (.63 + k % 4 * .13) * size
        tip = (x+math.cos(angle)*reach,y+math.sin(angle)*reach,z+height)
        stem = (x,y,z+.30*size)
        B.curve("Plant curved stem",[stem,(x+math.cos(angle)*reach*.35,y+math.sin(angle)*reach*.35,z+height*.7),tip],.006*size,"green")
        direction = Vector((math.cos(angle),math.sin(angle),.27)).normalized()
        tangent = Vector((-math.sin(angle),math.cos(angle),0))
        start = Vector(tip)-direction*.07*size
        mid = Vector(tip)+direction*.11*size
        end = Vector(tip)+direction*.30*size
        width = .095*size
        vertices=[start,mid+tangent*width,mid+Vector((0,0,.025*size)),mid-tangent*width,end]
        B.mesh("Curved broad leaf",[tuple(v) for v in vertices],[(0,1,2),(0,2,3),(1,4,2),(2,4,3)],material="green",smooth=True)


def _chair(B, x, y, rotation=0, outdoor=False, material="fabric"):
    with B.frame("Curved-back chair",(x,y,0),rotation):
        for sx in [-1,1]:
            for sy in [-1,1]:
                B.rod("Splayed chair leg",(sx*.235,sy*.205,.02),(sx*.18,sy*.15,.45),.022,"oak")
        B.box("Chair upholstered seat",(0,0,.465),(.53,.49,.10),material,.045)
        # Arc-shaped back frame and actual curved upholstery mesh.
        points=[(.27*math.cos(a),.17+.105*math.sin(a),.86) for a in [0,math.pi/4,math.pi/2,3*math.pi/4,math.pi]]
        B.curve("Curved chair back top rail",points,.025,"oak")
        for sx in [-1,1]:
            B.curve("Chair back uprights",[(sx*.21,.15,.42),(sx*.255,.18,.65),(sx*.27,.17,.86)],.019,"oak")
        if outdoor:
            for i in range(7):
                x=-.225+i*.075
                B.rod("Outdoor back slat",(x,.225,.53),(x,.225,.82),.013,"oak")
        else:
            v=[]
            for i in range(13):
                a=i*math.pi/12
                for h in [.61,.83]:
                    v.append((.246*math.cos(a),.175+.08*math.sin(a),h))
            obj=B.mesh("Curved upholstered back",v,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(12)],material=material,smooth=True)
            solid=obj.modifiers.new("Back upholstery thickness","SOLIDIFY");solid.thickness=.035
            bevel=obj.modifiers.new("Soft back edges","BEVEL");bevel.width=.014;bevel.segments=3


def build_kitchen(origin, rotation=0, length=3.8, depth=.68, wall_height=2.65,
                  appliances=True, sink=True, cooktop=True, upper=True):
    """Straight kitchen, back at local y=0, fronts toward +Y.

    A second L-return can use appliances=False, sink=False, cooktop=False.
    Supports the main sample's 2.8m run without rescaling appliance heights.
    """
    if length < 1.2 or depth < .55:
        raise ValueError("Kitchen requires length >=1.2m and depth >=0.55m")
    B=_Builder("Detailed kitchen",origin,rotation)
    B.root["footprint"]=[length,depth]
    start=.77 if appliances and length>=2.5 else 0
    run=length-start
    front=depth-.015
    B.box("Continuous recessed toe kick",(start+run/2,depth/2,.075),(run-.035,depth-.10,.12),"black",.006)
    n=max(2,round(run/.58));module=run/n
    cook_x=start+run*.76
    sink_x=start+run*.25
    # The carcass is hollow: a solid cupboard box would fill the recessed sink
    # above its bowl floor, despite a correctly cut stone worktop.
    B.box("Kitchen cabinet bottom panel",(start+run/2,depth/2,.151),(run-.012,depth-.018,.038),"oak",.004)
    B.box("Kitchen cabinet back panel",(start+run/2,.025,.47),(run-.012,.030,.67),"oak",.004)
    for x in [start+.014,length-.014]:B.box("Kitchen cabinet end panel",(x,depth/2,.47),(.028,depth-.018,.69),"oak",.004)
    for i in range(1,n):
        x=start+i*module
        if (not sink or abs(x-sink_x)>.32) and (not cooktop or abs(x-cook_x)>.32):
            B.box("Kitchen cabinet internal divider",(x,depth/2,.46),(.021,depth-.035,.67),"oak",.003)
    for i in range(n):
        lo=start+i*module+.0075;hi=start+(i+1)*module-.0075
        spans=[(lo,hi)]
        if cooktop and run>=1.2:
            spans=[(lo,min(hi,cook_x-.294)),(max(lo,cook_x+.294),hi)]
        for left,right in spans:
            if right-left<.035:
                continue
            x=(left+right)/2;panel_width=right-left
            for h in [.275,.615]:
                B.box("Separate drawer front",(x,front,h),(panel_width,.028,.315),"paint",.008)
                if panel_width>.14:
                    B.rod("Brushed brass pull",(x-panel_width*.30,front+.034,h+.11),(x+panel_width*.30,front+.034,h+.11),.008)
                    for sx in [-panel_width*.30,panel_width*.30]:B.rod("Pull mounting stem",(x+sx,front+.005,h+.11),(x+sx,front+.035,h+.11),.006)
    top=.85
    if sink and run>=1.2:
        sw=min(.55,run*.26);sd=.40;sy=depth*.51
        x0,x1=sink_x-sw/2,sink_x+sw/2
        B.box("Stone counter left",((start+x0)/2,depth/2,top),(x0-start,depth,.035),"stone",.004)
        B.box("Stone counter right",((x1+length)/2,depth/2,top),(length-x1,depth,.035),"stone",.004)
        B.box("Stone counter rear bridge",(sink_x,(sy-sd/2)/2,top),(sw,sy-sd/2,.035),"stone",.004)
        B.box("Stone counter front bridge",(sink_x,(sy+sd/2+depth)/2,top),(sw,depth-sy-sd/2,.035),"stone",.004)
        _sink(B,(sink_x,sy,top+.019),sw+.018,sd+.018)
        _tap(B,sink_x,sy-sd/2-.055,top+.02)
        B.cylinder("Soap dispenser",(sink_x+sw*.38,.08,.97),.033,.19,"white")
        B.rod("Soap dispenser pump",(sink_x+sw*.38,.08,1.072),(sink_x+sw*.38,.14,1.072),.009)
    else:
        B.box("Stone worktop",(start+run/2,depth/2,top),(run,depth,.035),"stone",.007)
    B.box("Stone splashback",(start+run/2,.018,1.14),(run,.025,.54),"stone",.004)
    if upper:
        count=max(2,round(run/.6));w=run/count
        for i in range(count):
            x=start+(i+.5)*w
            B.box("Upper cabinet body",(x,.18,1.94),(w-.010,.36,.65),"oak",.006)
            B.box("Upper cabinet door",(x,.377,1.94),(w-.018,.028,.625),"paint",.007)
            B.rod("Upper cabinet pull",(x-w*.24,.406,1.665),(x+w*.24,.406,1.665),.006)
        B.box("Continuous undercabinet light",(start+run/2,.326,1.606),(run-.05,.022,.012),"warm",.002)
    if cooktop and run>=1.2:
        B.box("Induction glass cooktop",(cook_x,depth*.51,.882),(.57,.49,.016),"black",.017)
        for dx in [-.14,.14]:
            for dy in [-.115,.115]:
                B.ring("Induction burner etched ring",(cook_x+dx,depth*.51+dy,.892),.085,.0025,"metal")
        B.box("Oven black enclosure",(cook_x,front-.023,.465),(.57,.038,.60),"black",.009)
        B.box("Oven glass window",(cook_x,front+.001,.445),(.47,.014,.36),"glass",.014)
        B.box("Oven dark cavity",(cook_x,front-.055,.44),(.49,.015,.38),"black",.002)
        for z in [.32,.43,.55]:
            for dx in [-.19,-.095,0,.095,.19]:B.rod("Visible oven wire rack",(cook_x+dx,front-.035,z),(cook_x+dx,front-.14,z),.003)
        B.rod("Oven handle",(cook_x-.20,front+.07,.68),(cook_x+.20,front+.07,.68),.011)
        for dx in [-.19,.19]:B.cylinder("Oven rotary control",(cook_x+dx,front+.025,.747),.019,.024,"metal",24,(math.pi/2,0,0))
        B.box("Flush extractor hood",(cook_x,.26,1.584),(.62,.45,.06),"metal",.008)
        B.cylinder("Saucepan",(cook_x+.14,depth*.51+.1,.945),.092,.095,"metal")
        B.rod("Saucepan handle",(cook_x+.22,depth*.51+.1,.978),(cook_x+.37,depth*.51+.1,.989),.012,"black")
    if start:
        B.box("Integrated refrigerator body",(.35,.335,1.105),(.70,.64,2.15),"paint",.013)
        for z,h in [(.41,.72),(1.49,1.39)]:
            B.box("Refrigerator door",(.35,.675,z),(.684,.037,h),"paint",.013)
            B.rod("Refrigerator vertical handle",(.618,.722,z-.17),(.618,.722,z+.17),.010)
        B.box("Fridge ventilation grille",(.35,.674,.055),(.61,.025,.045),"black",.001)
        for i in range(15):B.box("Fridge grille fins",(.07+i*.04,.690,.055),(.01,.01,.04),"metal",.001)
    board_x=min(length-.19,start+run*.50)
    B.box("Oak chopping board",(board_x,depth*.48,.891),(.26,.35,.025),"oak",.028,rotation=.08)
    B.cylinder("Utensil crock",(length-.13,.11,.98),.063,.23,"white")
    for i in range(4):
        x=length-.165+i*.024
        B.rod("Wood kitchen utensil",(x,.11,.985),(x+.03,.11,1.27+i%2*.04),.006,"oak")
        B.sphere("Wood spoon head",(x+.03,.11,1.285+i%2*.04),(.020,.010,.032),"oak")
    return _finish(B)


def build_dining(origin, rotation=0, width=3.4, depth=3.3):
    """Six-person dining group with tableware and a suspended linear pendant."""
    B=_Builder("Six seat dining room",origin,rotation)
    cx,cy=width/2,depth/2
    tw=min(2.08,width-1.20);td=.94
    B.box("Rounded oak dining top",(cx,cy,.765),(tw,td,.065),"oak",.033)
    for sx in [-1,1]:
        for sy in [-1,1]:
            B.rod("Dining tapered leg",(cx+sx*(tw/2-.10),cy+sy*.38,.03),(cx+sx*(tw/2-.23),cy+sy*.28,.73),.032,"oak")
    for dx in [-tw*.29,tw*.29]:
        _chair(B,cx+dx,cy-.90,math.pi)
        _chair(B,cx+dx,cy+.90,0)
    _chair(B,cx-tw/2-.35,cy,math.pi/2)
    _chair(B,cx+tw/2+.35,cy,-math.pi/2)
    places=[(cx-tw*.29,cy-.30,0),(cx+tw*.29,cy-.30,0),(cx-tw*.29,cy+.30,math.pi),(cx+tw*.29,cy+.30,math.pi),(cx-tw*.41,cy,math.pi/2),(cx+tw*.41,cy,-math.pi/2)]
    for x,y,r in places:
        with B.frame("Dining place setting",(x,y,.804),r):
            B.box("Woven linen placemat",(0,0,0),(.38,.29,.004),"fabric",.009)
            _lathe(B,"Porcelain dinner plate",(0,0,.004),[(.001,0),(.075,0),(.13,.012),(.137,.022),(.126,.026),(.088,.012),(.001,.012)],"white",48)
            B.rod("Table knife",(.165,-.09,.017),(.165,.09,.017),.0045)
            B.rod("Table fork stem",(-.165,-.10,.017),(-.165,.045,.017),.004)
            for dx in [-.01,0,.01]:B.rod("Fork tine",(-.165+dx,.04,.017),(-.165+dx,.095,.017),.0018)
            B.box("Folded linen napkin",(.015,0,.044),(.10,.18,.012),"fabric",.004,rotation=.09)
            _cup(B,.105,.12,.01)
    _lathe(B,"Dining flower vase",(cx,cy,.808),[(.001,0),(.062,0),(.075,.06),(.035,.18),(.041,.20),(.034,.20),(.029,.18),(.06,.03)],"clay",40)
    for i in range(3):
        x=cx+(i-1)*.06
        B.curve("Dried arrangement stem",[(cx,cy,.89),(x,cy,.99),(x+.03,cy,1.19+i%2*.06)],.003,"oak")
        B.sphere("Dried flower head",(x+.03,cy,1.19+i%2*.06),(.025,.025,.045),"fabric")
    B.box("Pendant ceiling canopy",(cx,cy,2.64),(.68,.11,.038),"metal",.015)
    for dx in [-.53,.53]:B.rod("Pendant suspension",(cx+dx,cy,2.62),(cx+dx,cy,1.99),.003,"black")
    B.box("Linear pendant housing",(cx,cy,1.98),(1.42,.095,.065),"metal",.026)
    B.box("Linear pendant diffuser",(cx,cy,1.941),(1.32,.067,.014),"warm",.007)
    return _finish(B)


def _toilet(B,x,y):
    B.box("Toilet concealed pedestal",(x,y+.06,.20),(.29,.43,.36),"white",.09)
    _lathe(B,"Curved porcelain toilet bowl",(x,y,.29),[(.07,0),(.16,.035),(.205,.10),(.21,.155),(.182,.177),(.145,.15),(.10,.035)],"white",48,scale=(1,1.37,1))
    B.ring("Toilet seat ring",(x,y,.475),.178,.027,"white",scale=(1,1.39,.50))
    B.box("Toilet cistern",(x,y+.315,.62),(.39,.17,.38),"white",.043)
    B.box("Toilet cistern lid",(x,y+.315,.823),(.41,.19,.035),"white",.015)
    B.cylinder("Dual flush large",(x-.035,y+.315,.845),.025,.006,"metal")
    B.cylinder("Dual flush small",(x+.025,y+.315,.845),.019,.006,"metal")


def _washer(B,x,y,stacked=False):
    for j in range(2 if stacked else 1):
        z=.455+j*.87
        B.box("Laundry machine shell",(x,y,z),(.62,.62,.84),"white",.025)
        B.box("Laundry control fascia",(x,y-.326,z+.295),(.56,.025,.105),"paint",.009)
        B.box("Laundry digital display",(x-.09,y-.342,z+.30),(.18,.008,.049),"black",.004)
        B.cylinder("Laundry selector",(x+.18,y-.35,z+.30),.030,.025,"metal",32,(math.pi/2,0,0))
        B.ring("Laundry door metal surround",(x,y-.335,z-.035),.208,.030,"metal",rotation=(math.pi/2,0,0))
        B.sphere("Laundry convex glazing",(x,y-.345,z-.035),(.182,.022,.182),"glass")
        B.cylinder("Laundry drum shadow",(x,y-.319,z-.035),.185,.012,"black",40,(math.pi/2,0,0))
    for i in range(3):B.box("Folded laundry towel",(x,y,.92+(int(stacked)*.87)+i*.045),(.46,.29,.047),"fabric" if i%2 else "white",.022)


def build_bathroom(origin, rotation=0, width=2.8, depth=3.0, laundry=True, entry_side="south"):
    """Compact bathroom with a south-centre or southwest west-wall entry.

    Net room sizes down to 1.95 x 1.94m are supported. entry_side='west' moves
    the towel rail north, keeping it clear of the west wall's southern door.
    """
    if width<1.95 or depth<1.94:
        raise ValueError("Bathroom requires at least 1.95 x 1.94m")
    if entry_side not in ("south", "west"):
        raise ValueError("entry_side must be 'south' or 'west'")
    B=_Builder("Detailed bathroom",origin,rotation)
    B.root["footprint"]=[width,depth]
    sw=min(1.14,width*.49);sd=min(1.18,depth*.47)
    sx=.035+sw/2;sy=depth-.035-sd/2;front=sy-sd/2
    B.box("Flush shower tray",(sx,sy,.026),(sw,sd,.045),"stone",.009)
    # Real tiled joints, linear drain, glass thickness and individual clamps.
    for i in range(1,4):B.box("Shower tile grout",(.035+i*sw/4,sy,.052),(.003,sd-.02,.0015),"paint",0)
    for i in range(1,4):B.box("Shower tile grout",(sx,front+i*sd/4,.052),(sw-.02,.003,.0015),"paint",0)
    B.box("Linear drain dark recess",(sx,depth-.16,.055),(sw*.61,.070,.014),"black",.008)
    for i in range(17):B.box("Drain grate bars",(sx-sw*.28+i*sw*.035,depth-.16,.064),(.011,.064,.007),"metal",.002)
    B.box("Shower return safety glass",(.035+sw,sy,1.11),(.01,sd,2.14),"glass",.003)
    B.box("Shower front fixed safety glass",(.135,front,1.11),(.20,.01,2.14),"glass",.003)
    B.rod("Shower top stabilizer",(.04,depth-.05,2.17),(.035+sw,depth-.05,2.17),.012)
    for y in [front+.07,depth-.12]:
        for z in [.30,1.86]:B.box("Glass mounting clamp",(.035+sw,y,z),(.026,.044,.046),"metal",.005)
    B.curve("Rain shower riser and curved arm",[(sx,depth-.082,1.0),(sx,depth-.082,2.10),(sx,depth-.20,2.21),(sx,depth-.43,2.21)],.014)
    B.cylinder("Overhead rain shower",(sx,depth-.43,2.18),.126,.032,"metal",48)
    for i in range(24):
        a=i*math.tau/24
        B.sphere("Rain shower nozzle",(sx+math.cos(a)*.089,depth-.43+math.sin(a)*.089,2.160),(.003,.003,.003),"black")
    B.box("Thermostatic shower mixer",(sx,depth-.097,1.05),(.25,.075,.055),"metal",.016)
    B.curve("Hand shower hose",[(sx+.1,depth-.115,1.04),(sx+.18,depth-.15,.61),(sx+.30,depth-.15,.65),(sx+.30,depth-.11,1.32)],.008)
    B.rod("Hand shower wand",(sx+.30,depth-.11,1.27),(sx+.30,depth-.11,1.52),.019)
    # Vanity occupies the northeast side, with a recessed sink and wall mirror.
    vw=min(.94,width-sw-.12);vx=width-.045-vw/2;vy=depth-.345
    B.box("Floating vanity bottom panel",(vx,vy,.371),(vw,.56,.035),"oak",.012)
    B.box("Floating vanity back panel",(vx,vy+.265,.59),(vw,.03,.47),"oak",.008)
    for x in [vx-vw/2+.015,vx+vw/2-.015]:B.box("Vanity cabinet side panel",(x,vy,.59),(.03,.56,.47),"oak",.008)
    for x in [vx-vw*.25,vx+vw*.25]:
        B.box("Vanity drawer front",(x,vy-.29,.59),(vw/2-.014,.029,.425),"oak",.01)
        B.rod("Vanity recessed brass pull",(x-vw*.16,vy-.31,.76),(x+vw*.16,vy-.31,.76),.006)
    holew=min(.53,vw-.12);holed=.35;top=.85
    for x in [vx-vw/2+(vw-holew)/4,vx+vw/2-(vw-holew)/4]:B.box("Vanity stone counter side",(x,vy,top),((vw-holew)/2,.59,.04),"stone",.004)
    for y in [vy-(.59+holed)/4,vy+(.59+holed)/4]:B.box("Vanity counter bridge",(vx,y,top),(holew,(.59-holed)/2,.04),"stone",.004)
    _sink(B,(vx,vy,top+.023),holew+.014,holed+.014,"white")
    # Basin front is -Y, mirror against the north wall.
    with B.frame("Bathroom tap",(vx,vy+.23,top+.025),math.pi):_tap(B,0,0,0)
    B.box("Mirror thin bronze backing",(vx,depth-.043,1.57),(vw-.01,.030,.96),"metal",.045)
    B.box("Vanity mirror",(vx,depth-.066,1.57),(vw-.045,.007,.92),"mirror",.037)
    B.box("Mirror warm task strip",(vx,depth-.10,2.11),(vw*.78,.055,.028),"warm",.008)
    _toilet(B,width-.35,.62)
    # Towel rail is on the west side beside the entrance, away from door centre.
    towel_start=depth*.48 if entry_side=="west" else .20
    towel_end=min(depth-.20,towel_start+.59)
    towel_mid=(towel_start+towel_end)/2
    B.rod("Towel rail",(.10,towel_start,1.04),(.10,towel_end,1.04),.011)
    B.box("Hanging folded hand towel",(.135,towel_mid,.82),(.055,.31,.45),"white",.021)
    for offset in [-.14,-.07,0,.07,.14]:
        y=towel_mid+offset
        B.curve("Towel soft vertical fold",[(.17,y,1.00),(.165,y,.82),(.185,y,.62)],.010,"white")
    if laundry and width>=2.5 and depth>=2.8:
        _washer(B,.40,.42,stacked=False)
        B.root["laundry_included"]=True
    else:
        B.root["laundry_included"]=False
    return _finish(B)


def build_balcony(origin, width, depth, rotation=0):
    """Two furniture pockets on long balconies, with continuous low planting."""
    if width<2 or depth<1.6:
        raise ValueError("Balcony requires at least 2 x 1.6m")
    B=_Builder("Balcony lounge and planting",origin,rotation)
    cy=depth*.58
    cx=width*.28 if width>7 else width*.5
    B.cylinder("Outdoor round stone table",(cx,cy,.62),.37,.042,"stone",48)
    B.cylinder("Outdoor table pedestal",(cx,cy,.31),.075,.58,"metal")
    B.cylinder("Outdoor table foot",(cx,cy,.035),.26,.035,"metal")
    _chair(B,cx-.78,cy,math.pi/2,True)
    _chair(B,cx+.78,cy,-math.pi/2,True)
    _cup(B,cx-.1,cy,.646)
    _lathe(B,"Outdoor water carafe",(cx+.11,cy+.04,.643),[(.001,0),(.055,0),(.069,.03),(.061,.20),(.03,.26),(.028,.27),(.025,.268),(.027,.25),(.054,.195),(.056,.018)],"glass",36)
    if width>7:
        sofa_x=width*.69; sofa_y=depth-.58
        B.box("Outdoor sofa teak frame",(sofa_x,sofa_y,.31),(2.1,.84,.10),"oak",.025)
        for x in [sofa_x-.92,sofa_x+.92]:
            for y in [sofa_y-.30,sofa_y+.30]:B.rod("Outdoor sofa legs",(x,y,.025),(x,y,.31),.028,"oak")
        for i in range(12):B.box("Outdoor sofa rear slats",(sofa_x-.99+i*.18,sofa_y+.35,.65),(.042,.055,.62),"oak",.008)
        for x in [sofa_x-.54,sofa_x+.54]:
            B.box("Outdoor seat cushion",(x,sofa_y,.435),(.98,.79,.18),"fabric",.074)
            B.box("Outdoor back cushion",(x,sofa_y+.30,.73),(.99,.20,.55),"white",.075)
        for x in [sofa_x-.78,sofa_x+.77]:B.box("Outdoor accent pillow",(x,sofa_y+.13,.75),(.40,.18,.37),"blue",.078,rotation=.12)
    # Leaf tips remain inside the balcony footprint, including curved stems.
    for x,y,size in [(.62,depth-.62,.9),(width-.64,depth-.64,1),(width*.49,depth-.55,.72)]:_plant(B,x,y,size=size)
    # Shallow planter beds echo the balcony edge without creating a tall screen.
    for x in ([width*.11,width*.86] if width>7 else []):
        B.box("Balcony linear planter",(x,depth-.22,.24),(1.05,.38,.44),"stone",.022)
        B.box("Planter soil surface",(x,depth-.22,.467),(.99,.32,.012),"black",.004)
        for i in range(7):B.sphere("Low aromatic foliage",(x-.40+i*.13,depth-.22,.62),(.16,.14,.17),"green")
    return _finish(B)


def _soft_pillow(B, name, p, width, depth, thickness, material="white", tilt=0, turn=0):
    """Closed stuffed textile: pinched corners, inflated centre, seam and creases."""
    nx,ny=30,20
    vertices=[]
    for side in [1,-1]:
        for j in range(ny+1):
            v=j/ny*2-1
            for i in range(nx+1):
                u=i/nx*2-1
                px=width*.5*u*(1-.060*abs(v)**6)
                py=depth*.5*v*(1-.060*abs(u)**6)
                envelope=max(0,1-u*u)**.47*max(0,1-v*v)**.47
                loft=thickness*.56*envelope
                corner_crease=.010*math.sin(17*u+4*v)*abs(u)**5*max(0,1-v*v)
                wrinkles=.0035*math.sin(28*u-9*v)*math.sin(math.pi*(v+1)/2)*abs(v)**4
                z=.011+loft+corner_crease+wrinkles if side==1 else -.011-loft*.66
                vertices.append((px,py,z))
    count=(nx+1)*(ny+1)
    faces=[]
    for j in range(ny):
        for i in range(nx):
            a=j*(nx+1)+i;b=a+1;c=a+nx+2;d=a+nx+1
            faces.append((a,b,c,d))
            faces.append((count+d,count+c,count+b,count+a))
    edge=list(range(nx+1))+[j*(nx+1)+nx for j in range(1,ny+1)]+[ny*(nx+1)+i for i in range(nx-1,-1,-1)]+[j*(nx+1) for j in range(ny-1,0,-1)]
    for k,a in enumerate(edge):
        b=edge[(k+1)%len(edge)]
        faces.append((a,count+a,count+b,b))
    with B.frame(name+" textile frame",p,turn) as frame:
        frame.rotation_euler[0]=tilt
        B.mesh(name,vertices,faces,material=material,smooth=True)
        # Piping follows the actual squeezed perimeter rather than a box edge.
        seam=[]
        for k in range(0,len(edge),3):
            vx,vy,_=vertices[edge[k]]
            seam.append((vx,vy,0))
        B.curve(name+" fine sewn piping",seam,.0017,"fabric",True)


def _draped_bedding(B,x,y,width,length,accent):
    """Soft quilt draping over both sides and the foot, within the bed envelope."""
    half=width/2

    def point(u,t):
        au=abs(u)
        if au<=.86:
            px=u/.86*(half-.025)
            side_drop=0
        else:
            theta=(au-.86)/.14*math.pi/2
            px=math.copysign(half-.025+.055*math.sin(theta),u)
            side_drop=.215*(1-math.cos(theta))
        if t<.13:
            theta=(.13-t)/.13*math.pi/2
            py=-length/2+.07-.085*math.sin(theta)
            foot_drop=.205*(1-math.cos(theta))
        else:
            py=(-length/2+.07)+(t-.13)/.87*(length/2+.45)
            foot_drop=0
        lift=.030*(1-min(1,au)**2)*math.sin(math.pi*min(1,max(0,(t-.03)/.98)))
        wrinkles=(.010*math.sin(10*u+6*t)+.005*math.sin(27*u-19*t))*(1-min(1,au)**6)
        diagonal=.012*math.sin(15*u-5*t)*math.exp(-((t-.73)/.18)**2)
        # Draped edges have small vertical folds instead of perfectly flat walls.
        hem_wave=.008*math.sin(py*24+u*1.6)*(side_drop/.215 if side_drop else 0)
        z=.561+lift+wrinkles+diagonal-max(side_drop,foot_drop)+hem_wave
        return (x+px,y+py,z)

    nx,ny=52,62
    vertices=[point(i/nx*2-1,j/ny) for j in range(ny+1) for i in range(nx+1)]
    faces=[(j*(nx+1)+i,j*(nx+1)+i+1,(j+1)*(nx+1)+i+1,(j+1)*(nx+1)+i) for j in range(ny) for i in range(nx)]
    quilt=B.mesh("Draped duvet with soft diagonal folds",vertices,faces,material=accent,smooth=True)
    pad=quilt.modifiers.new("Quilted textile thickness","SOLIDIFY")
    pad.thickness=.030;pad.offset=-1
    # A cream turned-over top edge rolls gently away from the pillows.
    folded=[]
    fx,fy=40,12
    for j in range(fy+1):
        q=j/fy
        for i in range(fx+1):
            u=i/fx*2-1
            px=x+u*(half-.030)
            py=y+.365+q*.205+.006*math.sin(9*u)
            z=.587+.035*math.sin(math.pi*q)+.008*math.sin(11*u+q*4)*(1-u*u)
            folded.append((px,py,z))
    fold_faces=[(j*(fx+1)+i,j*(fx+1)+i+1,(j+1)*(fx+1)+i+1,(j+1)*(fx+1)+i) for j in range(fy) for i in range(fx)]
    fold=B.mesh("Turned back duvet cuff",folded,fold_faces,material="white",smooth=True)
    solid=fold.modifiers.new("Turned linen thickness","SOLIDIFY");solid.thickness=.020;solid.offset=-1
    # Separate woven bed-end throw follows the same drape rather than floating.
    throw_vertices=[]
    tx,ty=42,14
    for j in range(ty+1):
        yy=-.83+j/ty*.34
        t=.13+(yy+length/2-.07)/(length/2+.45)*.87
        for i in range(tx+1):
            u=(i/tx*2-1)*.975
            px,py,pz=point(u,t)
            throw_vertices.append((px,py,pz+.034+.0035*math.sin(i*1.6+j*.8)))
    throw_faces=[(j*(tx+1)+i,j*(tx+1)+i+1,(j+1)*(tx+1)+i+1,(j+1)*(tx+1)+i) for j in range(ty) for i in range(tx)]
    throw=B.mesh("Soft woven bed-end throw",throw_vertices,throw_faces,material="white",smooth=True)
    solid=throw.modifiers.new("Woven throw thickness","SOLIDIFY");solid.thickness=.013;solid.offset=-1
    for side in [-1,1]:
        seam=[point(side*.997,j/24) for j in range(25)]
        B.curve("Duvet hanging edge seam",seam,.0015,accent)


def _bed(B,x,y,width=1.2,length=2.05,accent="blue"):
    B.box("Rounded timber bed plinth",(x,y,.185),(width+.06,length+.06,.25),"oak",.048)
    B.box("Soft rounded mattress",(x,y,.395),(width,length,.25),"white",.115)
    B.box("Upholstered rounded headboard",(x,y+length/2-.01,.75),(width+.10,.13,1.14),"fabric",.058)
    _draped_bedding(B,x,y,width,length,accent)
    n=2 if width>1.3 else 1
    for i in range(n):
        px=x+(i-(n-1)/2)*.62
        _soft_pillow(B,"Lofted sleeping pillow",(px,y+.745,.596),.64 if n>1 else .73,.43,.22,"white",tilt=.12,turn=(i-(n-1)/2)*.07)
    for i,sign in enumerate([-1,1]):
        _soft_pillow(B,"Small soft accent cushion",(x+sign*width*.20,y+.46,.758),min(.37,width*.31),.35,.17,"fabric" if i else accent,tilt=.96,turn=sign*.10)


def build_secondary_bedroom(origin, width, depth, variant="kids", rotation=0):
    """Children/teen/guest bedroom with bedding, curved chair, storage and toys."""
    if width<3 or depth<3:
        raise ValueError("Secondary bedroom requires at least 3 x 3m")
    B=_Builder("Detailed " + variant + " bedroom",origin,rotation)
    kids=variant in ("kids","child","children")
    accent="blue" if kids else "fabric"
    bw=1.20 if kids else 1.50
    bx=.22+bw/2;by=depth-1.14
    _bed(B,bx,by,bw,accent=accent)
    # Wardrobe faces west, keeping the centre and south-side entry circulation.
    wardrobe_x=width-.37;wardrobe_y=depth-.88
    B.box("Full-height wardrobe body",(wardrobe_x,wardrobe_y,1.21),(.66,1.58,2.38),"oak",.012)
    for i in range(3):
        y=wardrobe_y-.52+i*.52
        B.box("Wardrobe individual front",(wardrobe_x-.348,y,1.21),(.028,.503,2.32),"paint",.009)
        B.rod("Wardrobe long brass handle",(wardrobe_x-.386,y+.17,.94),(wardrobe_x-.386,y+.17,1.35),.008)
    # Window-side study along the west wall, with a curved upholstered chair.
    desk_x=.37;desk_y=1.12
    B.box("Study rounded oak top",(desk_x,desk_y,.76),(.66,1.36,.055),"oak",.027)
    for x in [.10,.63]:
        for y in [.52,1.72]:B.rod("Study table legs",(x,y,.03),(x,y,.73),.023,"oak")
    B.box("Study drawer pedestal",(.35,1.57,.39),(.56,.36,.60),"paint",.012)
    for h in [.28,.50]:B.rod("Study drawer pull",(.658,1.46,h),(.658,1.66,h),.006)
    _chair(B,1.18,1.10,-math.pi/2,material=accent)
    B.box("Open exercise book",(.39,.99,.799),(.39,.28,.019),"white",.002,rotation=.07)
    B.box("Exercise book central seam",(.39,.99,.810),(.002,.26,.002),"blue",0,rotation=.07)
    B.cylinder("Desk pencil pot",(.30,1.54,.86),.048,.14,"clay")
    for i in range(5):B.rod("Coloured pencil",(.275+i*.012,1.54,.84),(.265+i*.016,1.54,1.06+i%2*.025),.0025,["blue","pink","oak"][i%3])
    B.cylinder("Desk lamp foot",(.26,.64,.801),.095,.022,"metal")
    B.rod("Desk lamp articulated lower",(.26,.64,.81),(.26,.70,1.03),.010)
    B.rod("Desk lamp articulated upper",(.26,.70,1.03),(.44,.70,1.18),.010)
    B.sphere("Desk lamp rounded shade",(.46,.70,1.16),(.11,.085,.045),"metal")
    B.sphere("Desk lamp diffuser",(.46,.70,1.143),(.084,.064,.015),"warm")
    shelf_x=width-.22;shelf_y=.91
    for h in [.09,.44,.80,1.16]:B.box("Open bookshelf shelf",(shelf_x,shelf_y,h),(.38,1.36,.035),"oak",.006)
    for y in [shelf_y-.65,shelf_y+.65]:B.box("Bookshelf side",(shelf_x,y,.62),(.38,.04,1.18),"oak",.006)
    # Book groups are turned so the spines face the centre of the room.
    with B.frame("Bedroom book row",(shelf_x,shelf_y-.50,.455),math.pi/2):_books(B,0,0,0,7,.57)
    B.box("Woven storage basket",(shelf_x,shelf_y+.30,.26),(.33,.49,.31),"fabric",.025)
    for z in [.14,.19,.24,.29,.34]:B.curve("Basket woven band",[(shelf_x-.17,shelf_y+.06,z),(shelf_x-.17,shelf_y+.53,z),(shelf_x+.16,shelf_y+.53,z)],.004,"oak")
    B.box("Bedside floating drawer",(bx+bw/2+.30,depth-.46,.46),(.40,.43,.17),"oak",.018)
    B.cylinder("Bedside lamp stem",(bx+bw/2+.30,depth-.46,.70),.013,.31,"metal")
    _lathe(B,"Bedside linen lamp shade",(bx+bw/2+.30,depth-.46,.81),[(.13,0),(.095,.16),(.088,.16),(.121,0)],"white",40)
    if kids:
        # Keep the play chest at the bed foot, outside the central entry route.
        tx=bx;ty=depth-2.42 if depth>=3.8 else depth*.47
        B.box("Low toy storage chest",(tx,ty,.24),(.80,.46,.43),"paint",.025)
        B.box("Toy chest lid",(tx,ty,.473),(.82,.48,.04),"oak",.016)
        for i in range(4):
            B.box("Wood building block",(tx-.24+i*.14,ty,.54+i%2*.07),(.11,.11,.11),["blue","pink","oak","white"][i],.011,rotation=i*.23)
        # A recognisable soft toy: rounded body, muzzle, separate ears and feet.
        px=bx;py=by+.35
        B.sphere("Teddy soft body",(px,py,.74),(.115,.083,.145),"clay")
        B.sphere("Teddy head",(px,py,.93),(.097,.083,.09),"clay")
        for sx in [-1,1]:
            B.sphere("Teddy rounded ear",(px+sx*.081,py,.996),(.035,.027,.036),"clay")
            B.sphere("Teddy foot",(px+sx*.083,py-.048,.632),(.048,.068,.039),"clay")
            B.sphere("Teddy eye",(px+sx*.032,py-.078,.948),(.007,.007,.007),"black")
        B.sphere("Teddy muzzle",(px,py-.079,.914),(.044,.025,.03),"white")
        B.sphere("Teddy nose",(px,py-.103,.923),(.010,.006,.009),"black")
    else:
        _plant(B,width-.38,depth*.53,size=.60)
    return _finish(B)


def build_bed(origin, width=1.5, rotation=0, variant="teen"):
    """Bed only: origin is the plan centre at floor Z; head points toward +Y."""
    if width<.9:
        raise ValueError("Bed width must be at least .9m")
    B=_Builder("Modular " + variant + " bed",origin,rotation)
    _bed(B,0,0,width,accent="blue" if variant in ("kids","child","children") else "fabric")
    B.root["origin_kind"]="bed_plan_centre"
    return _finish(B)


def build_wardrobe(origin, length=2.1, rotation=0):
    """Southwest origin; width along +X, depth .6m along +Y, fronts face -Y."""
    if length<.6:
        raise ValueError("Wardrobe length must be at least .6m")
    B=_Builder("Modular wardrobe",origin,rotation)
    B.root["footprint"]=[length,.6]
    B.box("Wardrobe full-height carcass",(length/2,.34,1.21),(length,.52,2.38),"oak",.010)
    n=max(1,round(length/.55));span=length/n
    for i in range(n):
        x=span*(i+.5)
        B.box("Wardrobe framed door",(x,.061,1.21),(span-.016,.029,2.32),"paint",.010)
        hx=x+span*.29
        B.rod("Wardrobe brass handle",(hx,.025,.90),(hx,.025,1.31),.008)
        for z in [.90,1.31]:B.rod("Wardrobe handle mounting pin",(hx,.025,z),(hx,.054,z),.005)
    B.box("Wardrobe recessed plinth",(length/2,.33,.052),(length-.065,.46,.07),"black",.005)
    return _finish(B)


def build_study(origin, rotation=0, length=1.4):
    """Desk southwest origin, .6m deep; chair occupies y=-.74..-.14m in front."""
    if length<1.0:
        raise ValueError("Study desk requires at least 1m length")
    B=_Builder("Modular study desk and chair",origin,rotation)
    B.root["desk_footprint"]=[length,.6]
    B.root["front_chair_clearance"] = .8
    B.box("Study rounded desktop",(length/2,.30,.765),(length,.6,.055),"oak",.027)
    for x in [.09,length-.09]:
        for y in [.08,.52]:B.rod("Study table leg",(x,y,.025),(x,y,.737),.023,"oak")
    B.box("Study drawer cabinet",(.28,.30,.405),(.46,.51,.59),"paint",.017)
    for z in [.22,.43,.64]:
        B.box("Study drawer front",(.28,.027,z),(.434,.027,.186),"paint",.008)
        B.rod("Study drawer pull",(.16,.001,z+.052),(.40,.001,z+.052),.006)
    _chair(B,length*.70,-.44,math.pi,material="blue")
    B.box("Study open notebook",(length*.67,.245,.804),(.38,.27,.018),"white",.004,rotation=-.08)
    B.box("Notebook binding",(length*.67,.245,.815),(.005,.258,.003),"fabric",.001,rotation=-.08)
    _books(B,.11,.47,.796,count=5,length=.40)
    B.cylinder("Study pen holder",(length-.13,.48,.876),.043,.155,"clay")
    for i in range(4):B.rod("Study pencil",(length-.15+i*.013,.48,.86),(length-.16+i*.020,.48,1.05+i%2*.022),.0025,["blue","pink","oak"][i%3])
    B.cylinder("Study lamp base",(length-.15,.17,.802),.085,.022,"metal")
    B.rod("Study lamp lower arm",(length-.15,.17,.813),(length-.15,.20,1.04),.009)
    B.rod("Study lamp upper arm",(length-.15,.20,1.04),(length-.32,.20,1.17),.009)
    B.sphere("Study lamp rounded shade",(length-.34,.20,1.15),(.10,.075,.039),"metal")
    B.sphere("Study lamp diffuser",(length-.34,.20,1.13),(.079,.057,.010),"warm")
    return _finish(B)


def build_laundry(origin, width=1.2, depth=1.9, rotation=0):
    """Stacked washer/dryer plus recessed utility sink on the room's rear row.

    Southwest origin; appliances face -Y. The first depth-.72m stays available
    as the front working area; geometry fits the supplied width/depth envelope.
    """
    if width<1.15 or depth<.85:
        raise ValueError("Laundry area requires at least 1.15 x .85m")
    B=_Builder("Modular laundry and utility basin",origin,rotation)
    B.root["footprint"]=[width,depth]
    y=depth-.35
    _washer(B,.34,y,stacked=True)
    for x in [.013,.669]:B.box("Laundry tower side panel",(x,y,1.005),(.026,.68,2.01),"oak",.006)
    B.box("Laundry tower top",(.34,y,2.025),(.68,.68,.035),"oak",.007)
    B.box("Laundry top shelf",(.34,y,1.91),(.62,.61,.027),"oak",.006)
    sw=width-.75;sx=.735+sw/2;sy=y;top=.929;holew=min(.43,sw-.065);holed=.37
    B.box("Utility sink bottom panel",(sx,sy,.18),(sw,.65,.04),"oak",.008)
    for x in [sx-sw/2+.012,sx+sw/2-.012]:B.box("Utility sink cabinet sides",(x,sy,.55),(.024,.65,.75),"oak",.006)
    B.box("Utility sink cabinet door",(sx,sy-.338,.55),(sw-.024,.029,.71),"paint",.008)
    B.rod("Utility cabinet pull",(sx-.08,sy-.362,.80),(sx+.08,sy-.362,.80),.006)
    for x in [sx-sw/2+(sw-holew)/4,sx+sw/2-(sw-holew)/4]:B.box("Utility stone counter side",(x,sy,top),((sw-holew)/2,.67,.035),"stone",.004)
    for yy in [sy-(.67+holed)/4,sy+(.67+holed)/4]:B.box("Utility stone counter bridge",(sx,yy,top),(holew,(.67-holed)/2,.035),"stone",.004)
    _sink(B,(sx,sy,top+.019),holew+.012,holed+.012,"white")
    with B.frame("Utility mixer",(sx,sy+.255,top+.02),math.pi):_tap(B,0,0,0)
    B.box("Utility cleaning shelf",(sx,depth-.18,1.79),(sw,.32,.035),"oak",.008)
    B.cylinder("Laundry detergent bottle",(sx-.05,depth-.17,1.945),.052,.27,"white")
    B.cylinder("Detergent bottle cap",(sx-.05,depth-.17,2.09),.030,.026,"blue")
    return _finish(B)
