"""Local proof render only; source miniatures remain in TypeScript."""
import bpy, sys, json, math
from pathlib import Path
from mathutils import Vector

folder=Path(sys.argv[sys.argv.index('--')+1])
names=sys.argv[sys.argv.index('--')+2:] or ['regular','super','shop']
for name in names:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    meta=json.loads((folder/f'{name}.json').read_text())
    bpy.ops.import_scene.gltf(filepath=str(folder/f'{name}.glb'))
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.device='CPU'
    scene.cycles.samples=20
    scene.cycles.use_denoising=True
    scene.render.resolution_x=1500
    scene.render.resolution_y=1100 if meta['rows']==3 else 1800
    scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Cream studio')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.69,.73,.70,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
    def material(name,color):
        m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);return m
    floor=material('Warm paper',(.88,.84,.74))
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.035))
    bpy.context.object.data.materials.append(floor)
    for location,power,size in [((-4,-5,9),1300,7),((5,1,7),900,6)]:
        bpy.ops.object.light_add(type='AREA',location=location)
        lamp=bpy.context.object;lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size
        lamp.rotation_euler=(Vector((0,0,0))-lamp.location).to_track_quat('-Z','Y').to_euler()
    ink=material('Caption ink',(.055,.13,.11))
    for entry in meta['labels']:
        curve=bpy.data.curves.new(entry['name'],'FONT');curve.body=entry['name'];curve.size=.16;curve.align_x='CENTER'
        text=bpy.data.objects.new(entry['name'],curve);scene.collection.objects.link(text);text.location=(entry['x'],entry['y'],.009);text.data.materials.append(ink)
    bpy.ops.object.camera_add(location=(0,-10,16))
    cam=bpy.context.object;cam.rotation_euler=(Vector((0,-.1,.3))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=11.5 if meta['rows']==3 else 19.5;scene.camera=cam
    scene.view_settings.view_transform='AgX'
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(folder/f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('REVIEW_RENDER',scene.render.filepath,flush=True)
