"""Original Combat Lab assets. Blender 4.5, authored locally; no external assets.
Run: blender --background --factory-startup --python build_clay_lab.py
Each rigid shell records its attachment bone and deformable surface in glTF extras.
"""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/bots-art/3d/clay-lab'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
def cv(p): return (p[0], -p[2], p[1])
def material(name, color, metal=0, rough=.7, emission=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value=(*color,1); b.inputs['Metallic'].default_value=metal; b.inputs['Roughness'].default_value=rough
    if emission:
        b.inputs['Emission Color'].default_value=(*color,1); b.inputs['Emission Strength'].default_value=emission
    m.diffuse_color=(*color,1); return m
CLAY=material('clay',(.68,.68,.68),0,.87)
DARK=material('mechanism',(.035,.048,.045),.58,.42)
BRASS=material('brass',(.48,.30,.11),.75,.35)
STEEL=material('steel',(.27,.32,.30),.8,.29)
IVORY=material('ivory',(.83,.76,.56),0,.71)
LENS=material('lens',(.94,.85,.61),.06,.24)
PUPIL=material('pupil',(.016,.024,.020),.2,.19)
GLINT=material('glint',(1,.98,.87),0,.14)
HOT=material('charge',(.92,.29,.09),.22,.24,1.1)
RUBBER=material('rubber',(.025,.03,.028),0,.91)
OBJS=[]
def finish(o,name,mat,bone,clay=False):
    o.name=name; o.data.materials.append(mat); o['bone']=bone; o['clay']=clay
    for f in o.data.polygons:f.use_smooth=True
    OBJS.append(o); return o
def sphere(name,p,size,mat,bone,segments=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=12, location=cv(p))
    o=bpy.context.object; o.scale=(size[0],size[2],size[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,bone)
def box(name,p,size,mat,bone,bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1,location=cv(p));o=bpy.context.object;o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Hand softened edges','BEVEL');mod.width=min(bevel,min(size)*.3);mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o,name,mat,bone)
def cylinder(name,a,b,r,mat,bone,r2=None,vertices=16):
    av,bv=Vector(cv(a)),Vector(cv(b));d=bv-av
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=d.length,location=(av+bv)*.5)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y')
    return finish(o,name,mat,bone)
def ring(name,p,r,t,mat,bone,axis='z'):
    bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=6,major_radius=r,minor_radius=t,location=cv(p))
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector(cv({'x':(1,0,0),'y':(0,1,0),'z':(0,0,1)}[axis])).to_track_quat('Z','Y')
    return finish(o,name,mat,bone)
def shell(name,p,size,bone,power=4,res=14):
    # A welded, evenly tessellated superellipsoid: dents work across broad faces.
    verts=[]; faces=[]; lookup={}
    def vertex(c):
        key=tuple(c)
        if key in lookup:return lookup[key]
        v=[x/res for x in c];n=sum(abs(x)**power for x in v)**(1/power)
        v=[x/n for x in v]
        wobble=.0025*math.sin(v[0]*19+v[1]*13)*math.sin(v[2]*17-v[1]*9)+.0015*math.sin(v[0]*41+v[2]*31)
        point=[v[i]*(size[i]*.5+wobble) for i in range(3)]
        idx=len(verts);verts.append(cv(point));lookup[key]=idx;return idx
    for axis in range(3):
        other=[a for a in range(3) if a!=axis]
        for sign in [-1,1]:
            for i in range(-res,res,2):
                for j in range(-res,res,2):
                    ids=[]
                    for u,v in [(i,j),(i+2,j),(i+2,j+2),(i,j+2)]:
                        c=[0,0,0];c[axis]=sign*res;c[other[0]]=u;c[other[1]]=v;ids.append(vertex(c))
                    faces.append(ids)
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.location=cv(p)
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    o.select_set(False);return finish(o,name,CLAY,bone,True)
def rivet(x,y,z,bone):
    cylinder('fastener',(x,y,z),(x,y,z+.032),.032,BRASS,bone,vertices=10)
def eye(p,bone,r=.14,angry=False):
    cylinder('optic housing',(p[0],p[1],p[2]-.05),(p[0],p[1],p[2]+.035),r*1.25,DARK,bone)
    sphere('living lens',(p[0],p[1],p[2]+.045),(r,r*.9,.046),LENS,bone)
    sphere('pupil',(p[0]-.012,p[1]-.014,p[2]+.085),(r*.38,r*.49,.022),PUPIL,bone)
    sphere('eye glint',(p[0]-.012-r*.12,p[1]+r*.12,p[2]+.104),(r*.12,r*.14,.008),GLINT,bone)
    ring('optic ring',(p[0],p[1],p[2]+.045),r,.019,BRASS,bone)
    if angry:
        brow=box('expressive brow',(p[0],p[1]+r*.78,p[2]+.10),(r*2.2,.068,.10),DARK,bone)
        brow.rotation_euler[1]=-.25 if p[0]>0 else .25

def head(f,v):
    if f=='brute':
        shell('forged clay helmet',(0,.32,0),(1.02,.73,.74),'head',5 if v==0 else 3)
        for x in [-.22,.22]:eye((x,.37,.36),'head',.155,True)
        box('jaw',(0,.04,.25),(.66,.18,.35),DARK,'head')
        for x in [-.2,-.1,0,.1,.2]:box('teeth',(x,.055,.45),(.047,.09,.035),IVORY,'head',.008)
        for x in [-.48,.48]:cylinder('helmet ear',(x,.32,0),(x*1.16,.32,0),.14,BRASS,'head')
        if v:ring('crown hook',(0,.80,0),.11,.025,BRASS,'head',axis='x')
    elif f=='hotshot':
        shell('quick clay mask',(0,.35,0),(.88,.73,.66),'head',3 if v==0 else 6)
        for x in [-.18,.18]:eye((x,.40,.33),'head',.14)
        brow=box('cocked eyebrow',(-.19,.57,.39),(.34,.045,.045),DARK,'head',.012);brow.rotation_euler[1]=-.18
        mouth=box('half smile',(.08,.18,.36),(.25,.04,.045),DARK,'head',.019);mouth.rotation_euler[1]=-.20
        for i in range(3 if v==0 else 1):
            shell('swept clay crest',(-.14+i*.14,.77,-.14),(.13,.38,.48),'head',2,10)
    else:
        shell('precision clay hood',(0,.36,-.02),(.80,.83,.69),'head',5 if v==0 else 2.7)
        box('dark visor',(0,.39,.30),(.65,.22,.13),DARK,'head',.07)
        eye((.16 if v==0 else -.12,.4,.40),'head',.155)
        cylinder('antenna',(-.30,.59,-.13),(-.38,1.04,-.16),.019,STEEL,'head')
        sphere('antenna cap',(-.38,1.04,-.16),(.038,.038,.038),LENS,'head')
        for x in [-.12,-.04,.04]:box('mouth vent',(x,.12,.345),(.034,.07,.035),BRASS,'head',.008)
    cylinder('neck stem',(0,-.12,0),(0,.01,0),.13,BRASS,'head')

def torso(f,v):
    size={'brute':(1.48,1.22,.91),'hotshot':(.98,1.15,.68),'deadeye':(1.08,1.24,.75)}[f]
    shell('clay breastplate',(0,.52,0),size,'torso',5 if v==0 else 2.8,18)
    z=size[2]/2
    shell('raised clay service panel',(0,.51,z-.012),(size[0]*.69,.74,.13),'torso',5,14)
    for x in [-size[0]*.27,size[0]*.27]:
        for y in [.25,.77]:rivet(x,y,z+.065,'torso')
    z+=.055
    ring('reactor frame',(0,.56,z+.035),.17,.035,DARK,'torso')
    cylinder('reactor',(0,.56,z),(0,.56,z+.05),.13,BRASS,'torso')
    sphere('reactor light',(0,.56,z+.065),(.075,.075,.02),LENS,'torso')
    for x in [-size[0]*.32,size[0]*.32]:
        for y in [.20,.87]:rivet(x,y,z*.94,'torso')
    for i in range(4):box('lower grille',(-.17+i*.11,.19,z+.015),(.05,.12,.025),DARK,'torso',.01)
    for x in [-.26,.26]:
        cylinder('back canister',(x,.12,-z-.06),(x,.78,-z-.06),.095,STEEL,'torso')
        ring('canister strap',(x,.36,-z-.06),.102,.018,BRASS,'torso',axis='y')
    box('belt',(0,-.02,0),(.77,.14,.59),DARK,'torso')
    box('belt buckle',(0,-.02,.33),(.2,.13,.08),BRASS,'torso')

def arm(f,v):
    width={'brute':.48,'hotshot':.29,'deadeye':.34}[f]
    sphere('shoulder bearing',(0,0,0),(.18,.18,.18),BRASS,'upper')
    shell('clay shoulder',(0,-.20,0),(width,.45,width*.91),'upper',4 if v==0 else 2.4)
    cylinder('upper piston',(width*.30,-.14,.07),(width*.30,-.43,.07),.041,STEEL,'upper')
    sphere('elbow bearing',(0,0,0),(.13,.13,.13),DARK,'lower')
    shell('clay forearm',(0,-.24,0),(width*(1.12 if v else .91),.42,width*.96),'lower',4.5)
    cylinder('wrist',(0,-.41,0),(0,-.52,.03),.095,BRASS,'lower')
    sphere('mechanical palm',(0,-.055,.065),(.14,.14,.15),DARK,'hand')
    for x in [-.10,0,.10]:
        box('finger',(x,-.10,.15),(.073,.17,.095),IVORY,'hand',.03)
    rivet(0,-.20,width*.52,'lower')
    if f=='hotshot' and v:cylinder('forearm fin',(.12,-.05,-.12),(.22,-.28,-.18),.045,BRASS,'lower',r2=.01)

def leg(f,v):
    width={'brute':.42,'hotshot':.27,'deadeye':.32}[f]
    sphere('hip bearing',(0,0,0),(.15,.15,.15),BRASS,'upper')
    shell('clay thigh',(0,-.19,0),(width,.39,width*.95),'upper',4)
    sphere('knee bearing',(0,0,0),(.13,.13,.13),DARK,'lower')
    if f=='hotshot':
        cylinder('spring shaft',(0,-.03,0),(0,-.35,0),.051,STEEL,'lower')
        for i in range(7):ring('spring',(0,-.065-i*.040,0),.095,.020,BRASS,'lower',axis='y')
    else:
        shell('clay shin',(0,-.21,0),(width*.90,.40,width*.89),'lower',3 if v else 5)
        cylinder('shin piston',(width*.4,-.05,.06),(width*.4,-.38,.06),.033,STEEL,'lower')
    if f=='hotshot' and v:
        for x in [-.16,.16]:
            cylinder('skate wheel',(x-.05,.045,.06),(x+.05,.045,.06),.16,RUBBER,'foot',vertices=24)
            cylinder('wheel hub',(x-.06,.045,.06),(x+.06,.045,.06),.079,BRASS,'foot')
        shell('clay skate',(0,.15,.10),(.32,.18,.43),'foot',4)
    else:
        shell('clay boot',(0,.065,.13),(width*1.24,.25,.61 if f=='brute' else .49),'foot',4)
        box('rubber sole',(0,-.045,.14),(width*1.27,.08,.62 if f=='brute' else .50),RUBBER,'foot')
        if f=='deadeye' and v:
            for x in [-.17,.17]:box('stabiliser',(x,-.02,0),(.09,.1,.59),STEEL,'foot')

def weapon(kind):
    if kind=='hammer':
        cylinder('hammer shaft',(0,-.13,0),(0,.92,0),.052,STEEL,'weapon')
        for y in [-.05,.02,.09,.16]:ring('grip',(0,y,0),.059,.014,RUBBER,'weapon',axis='y')
        box('hammer head',(0,.84,0),(.88,.41,.43),DARK,'weapon',.09)
        for x in [-.43,.43]:cylinder('hammer face',(x-.08,.84,0),(x+.08,.84,0),.25,BRASS,'weapon')
        for x in [-.20,0,.20]:box('hammer coil',(x,.84,.235),(.09,.22,.035),HOT,'weapon')
    elif kind=='baton':
        cylinder('baton grip',(0,-.11,0),(0,.29,0),.063,RUBBER,'weapon')
        cylinder('baton shaft',(0,.23,0),(0,.92,0),.085,DARK,'weapon')
        for y in [.34,.49,.64,.79,.90]:ring('shock coil',(0,y,0),.09,.022,LENS,'weapon',axis='y')
        sphere('baton tip',(0,.97,0),(.13,.1,.13),STEEL,'weapon')
    elif kind=='rifle':
        box('receiver',(0,.11,.20),(.22,.28,.64),DARK,'weapon',.045)
        box('stock',(0,.13,-.21),(.19,.27,.37),BRASS,'weapon',.06)
        box('grip',(0,-.10,.13),(.12,.29,.17),RUBBER,'weapon',.035)
        cylinder('barrel',(0,.15,.42),(0,.15,1.06),.075,STEEL,'weapon')
        cylinder('muzzle',(0,.15,1.00),(0,.15,1.18),.10,DARK,'weapon')
        ring('muzzle rim',(0,.15,1.19),.075,.018,BRASS,'weapon')
        cylinder('scope',(0,.36,.03),(0,.36,.39),.075,DARK,'weapon')
        sphere('scope glass',(0,.36,.40),(.06,.06,.018),LENS,'weapon')
        for z in [.48,.62,.76]:ring('barrel winding',(0,.15,z),.087,.012,BRASS,'weapon')
    else:
        shell('clay shield',(0,-.20,.24),(.75,.91,.22),'lower',5,18)
        box('shield rim',(0,-.20,.20),(.82,.98,.13),STEEL,'lower',.13)
        for x in [-.29,.29]:
            for y in [-.53,.13]:rivet(x,y,.39,'lower')
        box('shield window',(0,-.13,.40),(.34,.13,.045),LENS,'lower',.025)

def clear():
    for o in OBJS:bpy.data.objects.remove(o,do_unlink=True)
    OBJS.clear()
def export(name):
    # One draw per bone/material, retaining clay as separate editable geometry.
    groups={}
    for o in OBJS:
        key=(o['bone'],bool(o.get('clay')),o.data.materials[0].name)
        groups.setdefault(key,[]).append(o)
    merged=[]
    for (bone,clay,mat),objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        o=bpy.context.object;o.name=f'{bone}_{mat}';o['bone']=bone;o['clay']=clay;merged.append(o)
    OBJS[:]=merged
    bpy.ops.object.select_all(action='DESELECT')
    for o in OBJS:o.select_set(True)
    path=OUT/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True)
    return {'file':path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'claySurfaces':sum(bool(o.get('clay')) for o in OBJS),'vertices':sum(len(o.data.vertices) for o in OBJS)}

manifest={'version':'clay-lab-v1','origin':'Original procedural sculpture for Model Kombat','license':'Project-owned original assets; no third-party source assets','units':'metres','up':'+Y','front':'+Z','parts':{}}
for family in ['brute','hotshot','deadeye']:
    for variant in [0,1]:
        for slot,build in [('head',head),('torso',torso),('arm',arm),('leg',leg)]:
            clear();build(family,variant);name=f'{family}-{slot}-{variant}';manifest['parts'][name]=export(name)
for kind in ['hammer','baton','rifle','shield']:
    clear();weapon(kind);manifest['parts'][kind]=export(kind)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
# A native catalogue sheet makes every exported module accessible in Blender.
clear()
for index,name in enumerate(manifest['parts']):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(OUT/(name+'.glb')))
    collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(collection)
    objects=[o for o in bpy.data.objects if o not in before]
    for o in objects:
        for previous in list(o.users_collection):previous.objects.unlink(o)
        collection.objects.link(o)
        if o.parent is None:o.location+=Vector((index%7*3.4,index//7*3.3,0))
bpy.data.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(Path(__file__).with_name('clay-lab-source.blend')),compress=True)
print('CLAY_LAB_COMPLETE',len(manifest['parts']),sum(p['bytes'] for p in manifest['parts'].values()))
