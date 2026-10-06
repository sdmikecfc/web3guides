"""Bake static ambient detail into vertex colours and produce bounded mobile meshes."""
import bpy,sys,argparse,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--output',required=True);ap.add_argument('--only',default='');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(args.output);assert out.drive.lower()=='d:';out.mkdir(parents=True,exist_ok=True)
for folder in Path(args.source).iterdir():
 if not folder.is_dir() or '_low' in folder.name or folder.name=='cosmic_carousel':continue
 name=folder.name.replace('-2.0.1','');source=folder/'model.glb'
 if args.only and name not in args.only.split(','):continue
 if '-2.0.1' not in folder.name and (folder.parent/(name+'-2.0.1')).exists():continue
 if not source.exists():continue
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(source))
 for o in list(bpy.context.scene.objects):
  if o.type!='MESH':continue
  bpy.context.view_layer.objects.active=o;dec=o.modifiers.new('Mobile silhouette','DECIMATE');dec.ratio=.32;bpy.ops.object.modifier_apply(modifier=dec.name)
 # Actual ray-tested ambient occlusion, baked once. No runtime AO pass or textures.
 vertices=[];faces=[]
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  start=len(vertices);vertices.extend(o.matrix_world@v.co for v in o.data.vertices);faces.extend(tuple(start+i for i in p.vertices) for p in o.data.polygons)
 tree=BVHTree.FromPolygons(vertices,faces)
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  attr=o.data.color_attributes.new(name='BakedAO',type='FLOAT_COLOR',domain='POINT');o.data.color_attributes.active_color=attr
  for v in o.data.vertices:
   p=o.matrix_world@v.co;n=(o.matrix_world.to_3x3()@v.normal).normalized();basis=n.cross(Vector((0,0,1)))
   if basis.length<.1:basis=n.cross(Vector((0,1,0)))
   basis.normalize();bit=n.cross(basis);blocked=0
   for k in range(8):
    a=k*2.399;direction=(n*.73+basis*math.cos(a)*.55+bit*math.sin(a)*.55).normalized();hit=tree.ray_cast(p+n*.003,direction,.18)[0];blocked+=hit is not None
   shade=1-.30*blocked/8;attr.data[v.index].color=(shade,shade,shade,1)
 # The active colour stream multiplies the same authored PBR base colour in glTF.
 kwargs={'filepath':str(out/(name+'_low.glb')),'export_format':'GLB','export_apply':True,'export_extras':True,'export_animations':False,'export_yup':True}
 props=bpy.ops.export_scene.gltf.get_rna_type().properties
 if 'export_vertex_color' in props:kwargs['export_vertex_color']='ACTIVE'
 if 'export_all_vertex_colors' in props:kwargs['export_all_vertex_colors']=True
 bpy.ops.export_scene.gltf(**kwargs)
 tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH');print('MOBILE_ASSET',name,tris,flush=True)
