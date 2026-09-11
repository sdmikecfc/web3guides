"""Derive the tier-three retractable sidearm from our own Blender-authored kit.
This is a separate asset; it does not overwrite any existing hero or old model.
"""
import bpy,sys,json,hashlib
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:];source=Path(args[0]);out=Path(args[1])
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
root=next(o for o in bpy.data.objects if o.name.startswith('weapon_right') and o.type=='EMPTY')
root.parent=None;root.name='special_sidearm';root.location=(0,0,0);root.rotation_euler=(0,0,0)
# Blender +Z is game +Y; Blender -Y is game +Z. Both pivots stay at the grip.
root.scale=(1,450/590,120/130)
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in root.children_recursive:o.select_set(True);o['mk_surface']='protected';o['mk_slot']='weapon'
bpy.context.view_layer.objects.active=root
out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_apply=True,export_animations=False)
record={'file':out.name,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'grip':[0,0,0],'muzzle':[0,120,450],'units':'millimetres','source':source.name,'use':'T3 Ranged Special, counted within the bounded special burst'}
out.with_suffix('.json').write_text(json.dumps(record,indent=2))
print(json.dumps(record))
