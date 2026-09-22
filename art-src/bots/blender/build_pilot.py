"""Authored modular toy pilot. Run with Blender 4.5 LTS --background --python.

No provider assets or external textures. The .blend, GLBs and motion manifest
are reproducible from this source. Coordinates below are runtime (+Y up, +Z
front); cv() converts them to Blender at the authoring boundary.
"""
import bpy, math, json, sys, os, hashlib
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "public/bots-art/3d/pilot"
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = Path(__file__).resolve().parent
VERSION = "toy-rig-v1"
MESHES = []
PARTS = {}
def cv(p): return Vector((p[0], -p[2], p[1]))

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials): bpy.data.materials.remove(block)

def material(name, color, metal=0, rough=.38, coat=0, glow=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value=(*color,1)
    b.inputs['Metallic'].default_value=metal; b.inputs['Roughness'].default_value=rough
    b.inputs['Coat Weight'].default_value=coat
    if glow:
        b.inputs['Emission Color'].default_value=(*color,1); b.inputs['Emission Strength'].default_value=glow
    m.diffuse_color=(*color,1)
    return m
PAINT=material('enamel',(0.75,.75,.75),.07,.30,.65)
METAL=material('brass',(.52,.32,.105),.78,.31,.12)
SOFT=material('rubber',(.045,.06,.053),0,.72)
LIGHT=material('ivory',(.89,.79,.58),.02,.38,.2)
LENS=material('lens',(.95,.67,.20),.1,.17,.7,.16)
STEEL=material('steel',(.39,.44,.43),.8,.28)
CORAL=material('sole',(.56,.22,.15),0,.64)

# Rigid shells are single-bone weighted. All rest bones point up, giving the
# exported rig predictable axes for shared animation and runtime contact IK.
POSITIONS={
 'root':(0,0,0), 'torso':(0,1.08,0), 'head':(0,2.53,0),
 'armL':(-.96,2.2224,0), 'elbowL':(-.96,1.6724,.015), 'wristL':(-.96,1.1424,.055),
 'armR':(.96,2.2224,0), 'elbowR':(.96,1.6724,.015), 'wristR':(.96,1.1424,.055),
 'legL':(-.44,1.08,0), 'kneeL':(-.44,.58,0), 'ankleL':(-.44,.16,.09),
 'legR':(.44,1.08,0), 'kneeR':(.44,.58,0), 'ankleR':(.44,.16,.09),
 'weapon':(.96,1.1424,.40), 'mechanism':(.96,2.05,.40),
 'wheelL':(-.44,.265,.07), 'wheelR':(.44,.265,.07),
}
PARENTS={'torso':'root','head':'torso','weapon':'wristR','mechanism':'weapon'}
for side in ['L','R']:
    PARENTS.update({f'arm{side}':'torso',f'elbow{side}':f'arm{side}',f'wrist{side}':f'elbow{side}',f'leg{side}':'root',f'knee{side}':f'leg{side}',f'ankle{side}':f'knee{side}',f'wheel{side}':f'ankle{side}'})
armdata=bpy.data.armatures.new(VERSION)
RIG=bpy.data.objects.new(VERSION,armdata); bpy.context.collection.objects.link(RIG)
bpy.context.view_layer.objects.active=RIG; RIG.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name, p in POSITIONS.items():
    b=armdata.edit_bones.new(name); b.head=cv(p); b.tail=cv((p[0],p[1]+.13,p[2]))
    if name in PARENTS: b.parent=armdata.edit_bones[PARENTS[name]]
bpy.ops.object.mode_set(mode='OBJECT')
RIG['rigVersion']=VERSION
for bone in RIG.pose.bones: bone.rotation_mode='XYZ'

def finish(obj, mat, bone):
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(mat)
    for p in obj.data.polygons: p.use_smooth=True
    group=obj.vertex_groups.new(name=bone); group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
    mod=obj.modifiers.new('Canonical skeleton','ARMATURE'); mod.object=RIG
    obj.parent=RIG
    MESHES.append(obj)
    return obj

def ball(p, size, mat, bone, seg=16, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=cv(p))
    o=bpy.context.object; o.scale=(size[0],size[2],size[1]); return finish(o,mat,bone)

def box(p,size,mat,bone,bevel=.07):
    bpy.ops.mesh.primitive_cube_add(size=1,location=cv(p))
    o=bpy.context.object; o.scale=(size[0],size[2],size[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        m=o.modifiers.new('Soft molded edges','BEVEL'); m.width=min(bevel,min(size)*.45); m.segments=3
        bpy.ops.object.modifier_apply(modifier=m.name)
    return finish(o,mat,bone)

def rod(a,b,r,mat,bone,top=None,verts=16):
    d=cv(b)-cv(a)
    bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r,radius2=r if top is None else top,depth=d.length,location=(cv(a)+cv(b))*.5)
    o=bpy.context.object; o.rotation_mode='QUATERNION'; o.rotation_quaternion=d.to_track_quat('Z','Y')
    return finish(o,mat,bone)

def ring(p,r,t,mat,bone,axis='z',major=20):
    bpy.ops.mesh.primitive_torus_add(major_segments=major,minor_segments=6,location=cv(p),major_radius=r,minor_radius=t)
    o=bpy.context.object
    normal=cv({'x':(1,0,0),'y':(0,1,0),'z':(0,0,1)}[axis])
    o.rotation_mode='QUATERNION'; o.rotation_quaternion=normal.to_track_quat('Z','Y')
    return finish(o,mat,bone)

def curve(points,r,mat,bone):
    data=bpy.data.curves.new('Bent metal','CURVE'); data.dimensions='3D'; data.resolution_u=2; data.bevel_depth=r; data.bevel_resolution=2
    spline=data.splines.new('POLY'); spline.points.add(len(points)-1)
    for pt,p in zip(spline.points,points): pt.co=(*cv(p),1)
    obj=bpy.data.objects.new('Bent metal',data); bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH');return finish(bpy.context.object,mat,bone)

def offset(a,b): return tuple(a[i]+b[i] for i in range(3))
def screw(p,bone):
    rod(offset(p,(0,0,-.01)),offset(p,(0,0,.02)),.033,METAL,bone,verts=10)
    box(offset(p,(0,0,.026)),(.042,.010,.007),SOFT,bone,.003)
def key(y,bone):
    rod((0,y,0),(0,y+.15,0),.045,METAL,bone)
    box((0,y+.19,0),(.29,.06,.065),METAL,bone,.025)
    for x in [-.13,.13]: ring((x,y+.22,0),.084,.025,METAL,bone)

def head(v):
    n='head'; y=2.53
    if v==0:
        box((0,y+.48,0),(1.24,.91,.90),PAINT,n,.22); front=.45; ey=.55; spread=.29; crown=.99
    elif v==1:
        ball((0,y+.47,0),(.60,.52,.53),PAINT,n); front=.46;ey=.54;spread=.28;crown=1.02
    elif v==2:
        ball((0,y+.48,0),(.80,.57,.57),PAINT,n,20,12); front=.50;ey=.55;spread=.33;crown=1.06
        for x in [-.79,.79]:
            ball((x,y+.45,0),(.115,.24,.23),PAINT,n);rod((x,y+.45,.02),(x,y+.45,.16),.14,METAL,n)
    elif v==3:
        box((0,y+.52,0),(1.03,1.02,.98),PAINT,n,.16);front=.49;ey=.60;spread=0;crown=1.09
    else:
        box((0,y+.50,0),(1.48,.98,.99),PAINT,n,.21);front=.50;ey=.58;spread=.32;crown=1.04
        box((0,y+.67,.50),(1.17,.47,.10),SOFT,n,.10)
    eyes=[0] if v==3 else [-spread,spread]
    for x in eyes:
        r=.245 if v==3 else .172
        rod((x,y+ey,front-.04),(x,y+ey,front+.06),r+.032,METAL,n)
        ball((x,y+ey,front+.06),(r,r,.075),LENS,n)
        ball((x+.008,y+ey-.005,front+.133),(.052,.068,.026),SOFT,n)
        ball((x-.023,y+ey+.053,front+.148),(.021,.021,.008),LIGHT,n,10,6)
    # A recessed curved grill reads as an affectionate old tin toy smile.
    box((0,y+.22,front-.015),(.43,.18,.10),METAL,n,.07)
    box((0,y+.225,front+.043),(.35,.105,.016),SOFT,n,.03)
    for x in [-.105,-.035,.035,.105]: rod((x,y+.187,front+.055),(x,y+.261,front+.055),.009,LIGHT,n,verts=6)
    key(y+crown,n)

def torso(v):
    n='torso'
    if v==0: box((0,1.67,0),(1.25,1.19,.87),PAINT,n,.22);front=.44
    elif v==1: ball((0,1.60,0),(.72,.61,.52),PAINT,n,20,12);front=.51
    elif v==2:
        rod((0,1.17,0),(0,2.12,0),.66,PAINT,n,top=.39,verts=24)
        ring((0,1.17,0),.60,.063,PAINT,n,'y');front=.52
    else: box((0,1.66,0),(1.18,1.18,1.0),PAINT,n,.15);front=.50
    rod((-.94,2.2224,0),(.94,2.2224,0),.105,METAL,n)
    rod((0,2.15,0),(0,2.57,0),.14,METAL,n)
    box((0,1.63,front),(.60,.55,.09),PAINT,n,.09)
    for x in [-.22,.22]: screw((x,1.81,front+.055),n)
    ring((0,1.61,front+.07),.11,.024,METAL,n)
    ball((0,1.61,front+.075),(.071,.071,.021),LIGHT,n)
    for x in [-.11,0,.11]: box((x,1.40,front+.055),(.047,.018,.012),SOFT,n,.003)

def arm(v,side):
    x=-.96 if side=='L' else .96
    sh,el,wr='arm'+side,'elbow'+side,'wrist'+side
    ball((x,2.2224,0),(.21,.21,.21),METAL,sh)
    rod((x-.11,2.2224,0),(x+.11,2.2224,0),.235,PAINT,sh)
    rod((x,2.12,0),(x,1.70,.015),.145 if v!=3 else .095,PAINT if v!=3 else METAL,sh)
    ball((x,1.6724,.015),(.155,.155,.155),METAL,el)
    box((x,1.43,.04),(.30,.40,.33),PAINT,el,.13)
    ring((x,1.25,.05),.15,.027,LIGHT,el,'y')
    ball((x,1.1424,.055),(.12,.12,.12),METAL,wr)
    # All hands physically surround a clear handle at z=.40. Different palm
    # silhouettes remain compatible with a stranger's weapon.
    if v==2:
        box((x,1.12,.29),(.46,.39,.43),PAINT,wr,.14)
        for dx in [-.15,-.05,.05,.15]:box((x+dx,1.17,.51),(.085,.23,.13),PAINT,wr,.04)
        ball((x-.23,1.08,.37),(.10,.14,.14),PAINT,wr)
    elif v in [1,3]:
        box((x,1.12,.21),(.26,.27,.23),PAINT,wr,.085)
        for sign in [-1,1]:
            pts=[(x+sign*.13,1.14,.23),(x+sign*.23,1.14,.38),(x+sign*.17,1.14,.55),(x+sign*.055,1.14,.55)]
            curve(pts,.072 if v==1 else .057,PAINT,wr)
        screw((x,1.15,.345),wr)
    else:
        ball((x,1.12,.28),(.22,.20,.22),PAINT,wr)
        for dx in [-.12,0,.12]:box((x+dx,1.15,.475),(.10,.20,.14),PAINT,wr,.045)
    return {'grip':[x,1.1424,.40],'handKind':['mitten','claw','boxer','hook'][v]}

def leg(v,side):
    x=-.44 if side=='L' else .44
    hip,knee,ankle='leg'+side,'knee'+side,'ankle'+side
    ball((x,1.08,0),(.16,.16,.16),METAL,hip)
    if v==2:
        rod((x,1.0,0),(x,.59,0),.061,SOFT,hip)
        pts=[]
        for i in range(41):
            t=i/40; a=t*math.pi*5;pts.append((x+math.cos(a)*.13,1.0-t*.41,math.sin(a)*.13))
        curve(pts,.031,METAL,hip)
        ring((x,.97,0),.14,.035,LIGHT,hip,'y')
    else: rod((x,.98,0),(x,.59,0),.14 if v!=3 else .085,PAINT if v!=3 else METAL,hip)
    ball((x,.58,0),(.16,.16,.16),PAINT,knee)
    rod((x,.53,.0),(x,.18,.07),.13 if v!=3 else .075,PAINT if v!=3 else METAL,knee)
    if v==1:
        # Wheel bone rolls independently; knees remain available for a mixed gait.
        axle='wheel'+side
        rod((x-.15,.265,.07),(x+.15,.265,.07),.255,SOFT,axle,verts=20)
        for sign in [-1,1]:
            rod((x+sign*.155,.265,.07),(x+sign*.18,.265,.07),.192,PAINT,axle)
            rod((x+sign*.182,.265,.07),(x+sign*.19,.265,.07),.068,METAL,axle)
            ring((x+sign*.16,.265,.07),.222,.025,CORAL,axle,'x')
    else:
        box((x,.09,.18),(.55,.17,.73),CORAL,ankle,.07)
        box((x,.21,.18),(.52,.26,.69),PAINT,ankle,.12)
        box((x,.143,.19),(.54,.027,.71),SOFT,ankle,.012)
    return {'foot':[x,.025,.14],'movement':['boot','wheel','spring','piston'][v]}

def weapon(v):
    x,y,z=POSITIONS['weapon'];n='weapon'
    rod((x,y-.16,z),(x,y+.72,z),.053,METAL,n)
    rod((x,y-.135,z),(x,y+.135,z),.087,SOFT,n)
    for dy in [-.09,0,.09]: ring((x,y+dy,z),.081,.009,METAL,n,'y')
    if v==0:
        pts=[]
        for i in range(20):
            a=math.pi*.15+i/19*math.pi*1.7;pts.append((x+math.sin(a)*.21,y+.86+math.cos(a)*.21,z))
        curve(pts,.082,STEEL,n);contact=(0,1.08,0);kind='blunt'
    elif v==1:
        rod((x,y+.58,z),(x,y+.90,z),.23,PAINT,n)
        ball((x,y+.90,z),(.23,.16,.23),PAINT,n);contact=(0,1.03,0);kind='blunt'
    elif v==3:
        box((x,y+.52,z),(.34,.41,.34),PAINT,n,.10)
        rod((x,y+.73,z),(x,y+.82,z),.125,METAL,n)
        rod((x,y+.81,z),(x,y+1.16,z),.11,STEEL,'mechanism',top=.012)
        pts=[]
        for i in range(45):
            t=i/44;a=t*math.pi*7;r=.115*(1-t)+.014*t;pts.append((x+math.cos(a)*r,y+.81+t*.34,z+math.sin(a)*r))
        curve(pts,.013,METAL,'mechanism')
        for dx in [-.08,0,.08]:box((x+dx,y+.54,z+.175),(.017,.13,.01),SOFT,n,.004)
        contact=(0,1.16,0);kind='thrust'
    else:
        box((x,y+.86,z),(.64,.36,.41),PAINT,n,.095)
        for sign in [-1,1]:
            rod((x+sign*.29,y+.86,z),(x+sign*.40,y+.86,z),.21,SOFT,n)
            rod((x+sign*.405,y+.86,z),(x+sign*.42,y+.86,z),.18,METAL,n)
        screw((x,y+.86,z+.22),n);contact=(.42,.86,0);kind='blunt'
    return {'grip':[0,0,0],'contact':list(contact),'attackFamily':kind}

def select_only(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.hide_set(False);o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]

def consolidate(objects,name):
    # Material batching preserves separate bone vertex groups in one skin.
    select_only(objects);bpy.ops.object.join();o=bpy.context.object;o.name=name
    # Vertex-colour neutral accents keep four draw calls per purchased part.
    mats=list(o.data.materials)
    color=o.data.color_attributes.new(name='COLOR_0',type='FLOAT_COLOR',domain='CORNER')
    role=[]
    for m in mats:
        if m==PAINT:role.append(0)
        elif m in [METAL,STEEL]:role.append(1)
        elif m==LENS:role.append(3)
        else:role.append(2)
    indices=[]
    for poly in o.data.polygons:
        old=mats[poly.material_index];rgb=old.diffuse_color[:3]
        rgba=(1,1,1,1) if old==PAINT else (*rgb,1)
        for li in poly.loop_indices:color.data[li].color=rgba
        indices.append(role[poly.material_index])
    o.data.materials.clear()
    for m in BATCH_MATS:o.data.materials.append(m)
    for poly,idx in zip(o.data.polygons,indices):poly.material_index=idx
    return o

# All non-paint colours are authored vertex colours. This keeps silhouettes
# detailed without one draw call per screw or finger.
BATCH_MATS=[]
for name,metal,rough,coat,glow in [('paint',.07,.31,.65,0),('metal',.78,.31,.12,0),('soft',0,.62,.10,0),('eye',.1,.20,.7,.10)]:
    m=material(name,(1,1,1),metal,rough,coat,glow)
    b=m.node_tree.nodes.get('Principled BSDF');v=m.node_tree.nodes.new('ShaderNodeVertexColor');v.layer_name='COLOR_0';m.node_tree.links.new(v.outputs['Color'],b.inputs['Base Color'])
    if glow:m.node_tree.links.new(v.outputs['Color'],b.inputs['Emission Color'])
    BATCH_MATS.append(m)

CATALOG={
 'head':[(0,'sprocketCap'),(1,'lanternLens'),(2,'kettleDome'),(3,'peeperEye'),(5,'pistonVisor')],
 'torso':[(0,'sprocketCan'),(1,'lanternDrum'),(2,'kettleChest'),(3,'peeperBox')],
 'arms':[(0,'sprocketMitts'),(1,'lanternClamps'),(2,'kettleGrips'),(3,'peeperHooks')],
 'legs':[(0,'sprocketPegs'),(1,'peeperStilts'),(2,'kettleShins'),(3,'lanternStruts')],
 'weapon':[(0,'rustySpanner'),(1,'tinMallet'),(3,'sparkDrill'),(6,'pistonHammer')],
}

def export(path,objects,animations=False):
    select_only([RIG]+objects)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,
       export_animations=animations,export_skins=True,export_extras=True,export_apply=False,
       export_all_influences=False,export_def_bones=False,export_force_sampling=True,
       export_animation_mode='ACTIONS' if animations else 'ACTIVE_ACTIONS')

for slot, variants in CATALOG.items():
    for v,name in variants:
        ident=f'{slot}.{name}';entries=[]
        for side in (['L','R'] if slot in ['arms','legs'] else ['']):
            MESHES=[]
            meta={}
            if slot=='head':head(v)
            elif slot=='torso':torso(v)
            elif slot=='arms':meta=arm(v,side)
            elif slot=='legs':meta=leg(v,side)
            else:meta=weapon(v)
            socket=('arm'+side if slot=='arms' else 'leg'+side if slot=='legs' else slot)
            markers={}
            if slot=='head': markers['neck']={'bone':'head','point':[0,0,0]}
            elif slot=='torso':
                for label,bone in [('shoulderL','armL'),('shoulderR','armR'),('hipL','legL'),('hipR','legR'),('neck','head')]:
                    markers[label]={'bone':'torso','point':[POSITIONS[bone][i]-POSITIONS['torso'][i] for i in range(3)]}
                markers['decal']={'bone':'torso','point':[0,.55,[.44,.51,.52,.50][v]+.085]}
            elif slot=='arms':
                markers['shoulder']={'bone':socket,'point':[0,0,0]}
                markers['hand']={'bone':'wrist'+side,'point':[0,0,.345]}
                meta['grip']=[0,0,.345];meta['gripBone']='wrist'+side
            elif slot=='legs':
                markers['hip']={'bone':socket,'point':[0,0,0]}
                markers['foot']={'bone':'ankle'+side,'point':[0,-.16,0]}
            else:
                markers['grip']={'bone':'weapon','point':[0,0,0]}
                markers['workingSurface']={'bone':'weapon','point':meta['contact']}
            meta.update({'attachment':{'bone':socket,'point':[0,0,0]},'markers':markers})
            merged=consolidate(MESHES,ident+side)
            meta['materialRegions']=[m.name for i,m in enumerate(merged.data.materials) if any(p.material_index==i for p in merged.data.polygons)]
            merged['slot']=socket;merged['rigVersion']=VERSION;merged['catalogueId']=ident
            inspectfile=ident+side+'.glb';export(OUT/inspectfile,[merged])
            low=merged.copy();low.data=merged.data.copy();bpy.context.collection.objects.link(low)
            select_only([low]);dec=low.modifiers.new('Fight LOD','DECIMATE');dec.ratio=.60
            bpy.ops.object.modifier_apply(modifier=dec.name)
            filename=ident+side+'.fight.glb';export(OUT/filename,[low])
            tris=sum(len(p.vertices)-2 for p in low.data.polygons)
            entries.append({'socket':socket,'file':filename,'inspection':inspectfile,'triangles':tris,**meta})
            bpy.data.objects.remove(low,do_unlink=True)
            merged.hide_set(True);merged.hide_render=True
        PARTS[ident]={'slot':slot,'rigVersion':VERSION,'variants':entries}

# Author shared performances in normalized seconds. All actions are in place;
# the runtime maps contact=.5 to the immutable combat event frame.
CLIPS={}
def action(name,poses,requires=None):
    RIG.animation_data_clear()
    for pb in RIG.pose.bones:pb.rotation_euler=(0,0,0);pb.location=(0,0,0);pb.scale=(1,1,1)
    for t,pose in poses:
        for bn in POSITIONS:
            pb=RIG.pose.bones[bn]; e=pose.get(bn,(0,0,0));pb.rotation_euler=e
            pb.keyframe_insert(data_path='rotation_euler',frame=1+round(t*60),group=bn)
    a=RIG.animation_data.action;a.name=name;a.use_fake_user=True
    # Linear interpolation makes marker resampling deterministic and avoids
    # Blender Bezier overshoot snapping a weapon through a hand.
    for fc in a.fcurves:
        for k in fc.keyframe_points:k.interpolation='LINEAR'
    CLIPS[name]={'duration':1,'contact':.5,'prepare':0,'recover':1,'requires':requires or [],'rate':[.65,1.8]}

# Bones all point up: local X bends toward the toy's semantic front.
guard={'armL':(-.45,0,-.12),'elbowL':(-.8,0,0),'wristL':(.40,0,0),
       'armR':(-.40,0,.10),'elbowR':(-.75,0,0),'wristR':(2.25,0,-.1)}
def merged(base,**kw):return {**base,**kw}
action('guard',[(0,guard),(1,guard)])
action('advance',[(0,{'legL':(.20,0,0),'legR':(-.20,0,0),'kneeL':(.18,0,0)}),(.5,{'legL':(-.20,0,0),'legR':(.20,0,0),'kneeR':(.18,0,0)}),(1,{'legL':(.20,0,0),'legR':(-.20,0,0),'kneeL':(.18,0,0)})])
action('lateral',[(0,{'legL':(0,0,-.13),'legR':(0,0,.10)}),(.5,{'legL':(0,0,.08),'legR':(0,0,-.10)}),(1,{'legL':(0,0,-.13),'legR':(0,0,.10)})])
for name,wind,hit in [
 ('thrust',{'armR':(-.3,0,.20),'elbowR':(-1.25,0,0),'wristR':(2.9,0,0)}, {'armR':(-1.52,0,.10),'elbowR':(-.12,0,0),'wristR':(3.18,0,0)}),
 ('rising-thrust',{'armR':(.15,0,.2),'elbowR':(-.55,0,0),'wristR':(1.5,0,0)}, {'armR':(-1.25,0,.15),'elbowR':(-.25,0,0),'wristR':(2.8,0,0)}),
 ('braced-thrust',{'armR':(-.2,0,.25),'elbowR':(-1.2,0,0),'wristR':(2.65,0,0)}, {'armR':(-1.65,0,0),'elbowR':(-.1,0,0),'wristR':(3.20,0,0)}),
 ('overhead',{'armR':(-2.6,0,.25),'elbowR':(-.5,0,0),'wristR':(1.7,0,0)}, {'armR':(-1.15,0,-.1),'elbowR':(-.3,0,0),'wristR':(2.9,0,0)}),
 ('horizontal',{'armR':(-.8,0,1.0),'elbowR':(-.4,0,0),'wristR':(1.7,0,-.6)}, {'armR':(-1.25,0,-.35),'elbowR':(-.3,0,0),'wristR':(2.9,0,.3)}),
 ('backhand',{'armR':(-.8,0,-.75),'elbowR':(-.7,0,0),'wristR':(2.2,0,.6)}, {'armR':(-1.2,0,.5),'elbowR':(-.2,0,0),'wristR':(2.7,0,-.3)}),
 ('diagonal-cut',{'armR':(-2.3,0,.8),'elbowR':(-.45,0,0),'wristR':(1.9,0,-.4)}, {'armR':(-1.2,0,-.25),'elbowR':(-.2,0,0),'wristR':(2.8,0,.25)}),
 ('rising-cut',{'armR':(.15,0,.65),'elbowR':(-.4,0,0),'wristR':(1.2,0,-.4)}, {'armR':(-1.5,0,-.35),'elbowR':(-.2,0,0),'wristR':(2.65,0,.2)}),
 ('low-cut',{'armR':(-.2,0,-.8),'elbowR':(-.4,0,0),'wristR':(1.6,0,.6)}, {'armR':(-.65,0,.4),'elbowR':(-.15,0,0),'wristR':(2.8,0,-.25)}),
 ('punch',{'armL':(-.4,0,-.18),'elbowL':(-1.3,0,0)}, {'armL':(-1.55,0,.1),'elbowL':(-.15,0,0)}),
 ('kick',{'legR':(-.4,0,.1),'kneeR':(1.05,0,0)}, {'legR':(-1.25,0,.05),'kneeR':(.15,0,0),'ankleR':(.08,0,0)}),
]:
    action(name,[(0,guard),(.28,{**guard,**wind}),(.5,{**guard,**hit}),(.68,{**guard,**hit}),(1,guard)],['legL','legR'] if name=='kick' else ['armL'] if name=='punch' else ['armR'])
action('slip',[(0,guard),(.5,{**guard,'torso':(.18,0,.16),'head':(-.06,0,-.10),'legL':(.10,0,0),'kneeL':(.18,0,0)}),(1,guard)])
action('block',[(0,guard),(.5,{**guard,'armL':(-1.22,0,.55),'elbowL':(-1.40,0,0),'head':(.10,0,0)}),(1,guard)],['armL'])
action('recoil',[(0,{}),(.5,{'torso':(-.12,0,-.08),'head':(-.10,0,.08)}),(1,{})])
action('one-leg',[(0,{'legR':(-.08,0,-.06),'kneeR':(.20,0,0)}),(.5,{'legR':(.10,0,-.06),'kneeR':(.08,0,0)}),(1,{'legR':(-.08,0,-.06),'kneeR':(.20,0,0)})])
action('knockout',[(0,guard),(.5,{'armL':(-.2,0,-.4),'armR':(-.15,0,.55),'kneeL':(.4,0,0),'kneeR':(.5,0,0),'head':(.14,0,.10)}),(1,{'armL':(.1,0,-.6),'armR':(.1,0,.7),'kneeL':(.3,0,0),'kneeR':(.5,0,0)})])
bpy.context.scene.render.fps=60;bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=61
# A tiny rigged witness mesh makes glTF retain the complete skeleton and clips.
MESHES=[];ball((0,-10,0),(.001,.001,.001),PAINT,'root',8,4)
witness=consolidate(MESHES,'rig-witness');export(OUT/'toy-motion-v1.glb',[witness],True)
bpy.data.objects.remove(witness,do_unlink=True)
RIG.animation_data_clear()
for pb in RIG.pose.bones:pb.rotation_euler=(0,0,0)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'toy-pilot.blend'))
manifest={'version':VERSION,'coordinates':{'up':'+Y','front':'+Z','units':'metres'},'rest':POSITIONS,'parents':PARENTS,'parts':PARTS,'clips':CLIPS,'motion':'toy-motion-v1.glb','source':'art-src/bots/blender/build_pilot.py','provider':'none','bake':'neutral form; runtime lighting','budgets':{'fightTrianglesPerRobot':12000,'drawsPerRobot':28,'bonesPerRobot':32}}
for entry in PARTS.values():
    for v in entry['variants']:
        v['sha256']=hashlib.sha256((OUT/v['file']).read_bytes()).hexdigest()
        v['inspectionSha256']=hashlib.sha256((OUT/v['inspection']).read_bytes()).hexdigest()
manifest['motionSha256']=hashlib.sha256((OUT/manifest['motion']).read_bytes()).hexdigest()
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('PILOT_EXPORTED',len(PARTS),'catalogue designs',sum(len(p['variants']) for p in PARTS.values()),'modules',len(CLIPS),'clips')
