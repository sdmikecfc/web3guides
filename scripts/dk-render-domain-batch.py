"""Render actual exported GLBs, front-facing and isolated, for art review on D:."""
import bpy,sys,json
from pathlib import Path
from mathutils import Vector
folder=Path(sys.argv[sys.argv.index('--')+1]);assert folder.drive.lower()=='d:'
names=sys.argv[sys.argv.index('--')+2:] or [p.stem for p in folder.glob('domain_*.glb')]
dest=folder/'review';dest.mkdir(exist_ok=True)
for name in names:
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(folder/(name+'.glb')))
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
 scene.render.resolution_x=600;scene.render.resolution_y=600;scene.render.resolution_percentage=100
 vertices=[o.matrix_world@Vector(c) for o in scene.objects if o.type=='MESH' for c in o.bound_box]
 lo=Vector(tuple(min(v[i] for v in vertices) for i in range(3)));hi=Vector(tuple(max(v[i] for v in vertices) for i in range(3)));target=(lo+hi)*.5
 scene.world=bpy.data.worlds.new('Neutral warm studio');scene.world.use_nodes=True;bg=scene.world.node_tree.nodes['Background'];bg.inputs[0].default_value=(.70,.76,.72,1);bg.inputs[1].default_value=.65
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012));m=bpy.data.materials.new('Cream studio ground');m.diffuse_color=(.82,.77,.65,1);bpy.context.object.data.materials.append(m)
 for loc,power,size in [((-3,-4,6),650,5),((4,1,4),850,4)]:
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=target+Vector((.85,-4.5,2.0)));cam=bpy.context.object;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=max(hi.x-lo.x,hi.z-lo.z)*1.32;scene.camera=cam
 scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(dest/(name+'.png'));bpy.ops.render.render(write_still=True)
 print('ART_REVIEW',name,flush=True)
