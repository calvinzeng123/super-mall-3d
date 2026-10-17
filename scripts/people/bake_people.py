"""Bake MIT Rocketbox avatars with native-rig walking motion into eight instancable morph poses.
Run with Blender --background --python scripts/people/bake_people.py -- SOURCE_DIR OUTPUT_DIR.
Sources and atlases are prepared by prepare_people.py, never downloaded at runtime.
"""
import bpy, math, sys, json
from pathlib import Path
from mathutils import Vector, Matrix

source_dir, output_dir = map(Path, sys.argv[sys.argv.index('--') + 1:])
output_dir.mkdir(parents=True, exist_ok=True)
results=[]
for sex, short in [('Male','m'),('Female','f')]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    src=source_dir/'Assets/Avatars/Adults'/f'{sex}_Adult_01'
    bpy.ops.import_scene.fbx(filepath=str(src/'Export'/f'{sex}_Adult_01.fbx'))
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    mesh=next(o for o in bpy.data.objects if o.type=='MESH')
    rig.animation_data_clear()
    # Collapse only mesh topology; armature weights/UVs remain attached.
    bpy.context.view_layer.objects.active=mesh
    dec=mesh.modifiers.new('Crowd mesh simplification','DECIMATE'); dec.ratio=.48
    bpy.ops.object.modifier_move_up(modifier=dec.name)
    bpy.ops.object.modifier_apply(modifier=dec.name)
    bpy.context.scene.frame_set(1)
    uv=mesh.data.uv_layers.active.data
    for poly in mesh.data.polygons:
        name=mesh.data.materials[poly.material_index].name
        # Pillow atlas origin is upper-left; Blender UV origin is lower-left.
        ox,oy=(0,0.5) if 'body' in name else ((.5,.5) if 'head' in name else (0,0))
        for li in poly.loop_indices: uv[li].uv=uv[li].uv*.5+Vector((ox,oy))
        poly.material_index=0
    mat=bpy.data.materials.new(f'{sex} textured skin clothing hair');mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(1,1,1,1)
    bs.inputs['Roughness'].default_value=.82
    bs.inputs['Specular IOR Level'].default_value=.15
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(source_dir/f'{short}-atlas.png'))
    mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    mat.node_tree.links.new(tex.outputs['Alpha'],bs.inputs['Alpha'])
    mat.surface_render_method='DITHERED'
    mesh.data.materials.clear();mesh.data.materials.append(mat)
    poses=[]
    for sample in range(8):
        phase=sample*math.tau/8
        for bone in rig.pose.bones:
            bone.matrix_basis=Matrix.Identity(4)
        def rotate(name, world_rotation):
            bone=rig.pose.bones[name]
            rest_world=(rig.matrix_world@bone.bone.matrix_local).to_quaternion()
            bone.rotation_mode='QUATERNION'
            bone.rotation_quaternion=rest_world.inverted()@world_rotation.to_quaternion()@rest_world
        # The source is an A-pose. Lower the arms in their native bind skeleton,
        # then use opposite shoulder/hip swings and a flexed recovery knee.
        for side,offset in [('L',0),('R',math.pi)]:
            swing=math.sin(phase+offset)
            sign=1 if side=='L' else -1
            rotate(f'Bip01 {side} UpperArm',Matrix.Rotation(-swing*.25,4,'X')@Matrix.Rotation(sign*.65,4,'Y'))
            rotate(f'Bip01 {side} Forearm',Matrix.Rotation(-.13,4,'X'))
            rotate(f'Bip01 {side} Thigh',Matrix.Rotation(swing*.31,4,'X'))
            rotate(f'Bip01 {side} Calf',Matrix.Rotation(max(0,swing)*.42,4,'X'))
            rotate(f'Bip01 {side} Foot',Matrix.Rotation(-max(0,swing)*.15,4,'X'))
        rotate('Bip01 Spine',Matrix.Rotation(math.sin(phase)*.025,4,'Z'))
        bpy.context.view_layer.update()
        dg=bpy.context.evaluated_depsgraph_get();ev=mesh.evaluated_get(dg);em=ev.to_mesh()
        coords=[mesh.matrix_world@v.co for v in em.vertices]
        # Remove locomotion translation; render paths supply travel. The pelvis
        # keeps its subtle vertical weight shift and the feet retain footfall.
        pelvis=rig.matrix_world@rig.pose.bones['Bip01 Pelvis'].matrix.translation
        coords=[Vector((v.x-pelvis.x,v.y-pelvis.y,v.z)) for v in coords]
        poses.append(coords);ev.to_mesh_clear()
    # Ground each sampled stance at the supporting shoe; no floating crowd.
    for pose in poses:
        minz=min(v.z for v in pose)
        for v in pose:v.z-=minz
    minz=0
    maxz=max(v.z for pose in poses for v in pose)
    target_h=1.80 if sex=='Male' else 1.69
    scale=target_h/(maxz-minz)
    for pose in poses:
        for v in pose:v.z-=minz;v*=scale
    # Bake the deformed topology into one unskinned mesh; the original armature
    # is not duplicated per walker, only these eight small morph targets.
    bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get();baked=bpy.data.meshes.new_from_object(mesh.evaluated_get(dg),depsgraph=dg)
    obj=bpy.data.objects.new(f'rocketbox-{short}-walking',baked);bpy.context.collection.objects.link(obj)
    for v,co in zip(baked.vertices,poses[0]):v.co=co
    obj.shape_key_add(name='Basis')
    for i,pose in enumerate(poses):
        key=obj.shape_key_add(name=f'walk-{i:02}')
        for v,co in zip(key.data,pose):v.co=co
    obj['source']='Microsoft Rocketbox / MIT / 0943055db6ec570bcef9f2c8b41c9e5467c808f9'
    obj['walk_frames']=8
    for o in list(bpy.data.objects):
        if o!=obj:bpy.data.objects.remove(o,do_unlink=True)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    # FBX forward direction is Blender -Y, glTF +Z after export axis conversion.
    bpy.ops.export_scene.gltf(filepath=str(output_dir/f'rocketbox-{short}.glb'),export_format='GLB',use_selection=True,export_animations=False,export_morph=True,export_morph_normal=True,export_skins=False,export_extras=True,export_image_format='AUTO')
    results.append({'id':short,'name':f'{sex}_Adult_01','vertices':len(baked.vertices),'triangles':sum(len(p.vertices)-2 for p in baked.polygons),'height':target_h,'poses':8,'cycleSeconds':32/30,'file':f'rocketbox-{short}.glb'})
print('PEOPLE_RESULT',json.dumps(results))
(output_dir/'bake-metrics.json').write_text(json.dumps(results,indent=2)+'\n')
