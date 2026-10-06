"""Render source assets for visual inspection; output must be on D:."""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector
folder=Path(sys.argv[sys.argv.index('--')+1]);assert folder.drive.lower()=='d:'
names=sys.argv[sys.argv.index('--')+2:] or ['dragonfire_grill','disco_burger_jukebox','lucky_cat_soda']
bpy.ops.wm.read_factory_settings(use_empty=True)
for i,name in enumerate(names):
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(folder/(name+'.glb')))
 for o in set(bpy.data.objects)-before:
  if not o.parent:o.location.x+=(i-(len(names)-1)/2)*1.7
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=1500;scene.render.resolution_y=700;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Warm studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.73,.7,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.02));m=bpy.data.materials.new('Cream backdrop');m.diffuse_color=(.8,.75,.64,1);bpy.context.object.data.materials.append(m)
for loc,power,size in [((-3,-4,6),800,5),((4,1,5),950,4)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,.5))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2,-7,3.4));o=bpy.context.object;o.rotation_euler=(Vector((0,0,.65))-o.location).to_track_quat('-Z','Y').to_euler();o.data.type='ORTHO';o.data.ortho_scale=6;scene.camera=o
scene.view_settings.view_transform='AgX';scene.render.filepath=str(folder/'hero-review.png');bpy.ops.render.render(write_still=True)
