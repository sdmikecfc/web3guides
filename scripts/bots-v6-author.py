"""Original Model Kombat hero proof. Local Blender only; no external assets.

Coordinates in helpers are game metres (+Y up, +Z forward). The exported
GLBs retain labelled rigid pivots, protected machinery and unique clay meshes.
Run: blender -b --python author-v6-heroes.py -- --out <directory>
"""
import bpy, math, json, hashlib, argparse, sys, random
from pathlib import Path
from mathutils import Vector

args = argparse.ArgumentParser()
args.add_argument('--out', required=True)
args.add_argument('--quick', action='store_true')
opt = args.parse_args(sys.argv[sys.argv.index('--')+1:])
OUT=Path(opt.out); OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
random.seed(603)

def xyz(v): return Vector((v[0],-v[2],v[1]))
def game(v): return [round(v.x,5),round(v.z,5),round(-v.y,5)]
def mat(name, color, metal=0, rough=.36, glow=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if glow: p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=glow
    if name.startswith('clay'):
        n=m.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=145;n.inputs['Detail'].default_value=2
        b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.11;b.inputs['Distance'].default_value=.017
        m.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal'])
    return m

M={
 'tank':mat('clay_petrol_enamel',(.045,.255,.245),.15,.34),
 'speed':mat('clay_vermilion',(.76,.13,.055),.1,.33),
 'ranged':mat('clay_midnight_indigo',(.095,.15,.29),.16,.35),
 'cream':mat('clay_warm_ivory',(.91,.8,.56),.05,.43),
 'yellow':mat('clay_saffron',(.95,.49,.065),.1,.33),
 'steel':mat('forged_bluelead_steel',(.06,.083,.10),.84,.28),
 'edge':mat('honed_steel_edge',(.61,.68,.7),.95,.2),
 'brass':mat('worn_warm_brass',(.62,.37,.12),.8,.3),
 'copper':mat('burnished_copper',(.57,.22,.092),.76,.34),
 'rubber':mat('charcoal_rubber',(.022,.028,.03),0,.77),
 'dark':mat('eye_socket',(.008,.019,.021),.28,.29),
 'lens':mat('amber_glass',(.95,.50,.095),.42,.16,.3),
 'mint':mat('mint_reticle',(.12,.85,.58),.18,.22,.7),
}
PARENT=None; SLOT=''; FAMILY=''
def empty(name,pos=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=xyz(pos)
    if parent: o.parent=parent;o.matrix_parent_inverse=parent.matrix_world.inverted()
    return o
def attach(o,name,m,clay=False):
    o.name=name;o.data.materials.append(M[m] if isinstance(m,str) else m)
    o['mk_slot']=SLOT;o['mk_surface']='clay' if clay else 'protected';o['mk_family']=FAMILY
    if PARENT:
        bpy.context.view_layer.update();mw=o.matrix_world.copy();o.parent=PARENT;o.matrix_world=mw
    for p in o.data.polygons: p.use_smooth=True
    return o
def box(name,pos,size,m,bevel=.06,clay=False):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(pos));o=bpy.context.object;o.dimensions=xyz((size[0],size[1],-size[2]))
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        b=o.modifiers.new('Soft moulded edge','BEVEL');b.width=bevel;b.segments=3
        bpy.ops.object.modifier_apply(modifier=b.name)
    if clay:
        s=o.modifiers.new('Dent surface grid','SUBSURF');s.subdivision_type='SIMPLE';s.levels=2
        bpy.ops.object.modifier_apply(modifier=s.name)
    n=o.modifiers.new('Weighted studio normals','WEIGHTED_NORMAL');n.keep_sharp=True
    bpy.ops.object.modifier_apply(modifier=n.name)
    return attach(o,name,m,clay)
def ell(name,pos,scale,m,clay=False):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32 if clay else 20,ring_count=20 if clay else 12,location=xyz(pos))
    o=bpy.context.object;o.scale=(scale[0],scale[2],scale[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return attach(o,name,m,clay)
def cyl(name,a,b,r,m,r2=None,verts=24):
    av,bv=xyz(a),xyz(b);d=bv-av
    bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r,radius2=r if r2 is None else r2,depth=d.length,location=(av+bv)/2)
    o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    q=o.modifiers.new('Machined edge','BEVEL');q.width=min(.013,r*.17);q.segments=2
    bpy.ops.object.modifier_apply(modifier=q.name)
    return attach(o,name,m)
def ring(name,pos,r,t,m,axis=(0,0,1)):
    bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=8,location=xyz(pos),major_radius=r,minor_radius=t)
    o=bpy.context.object;o.rotation_euler=xyz(axis).to_track_quat('Z','Y').to_euler();return attach(o,name,m)
def rivet(pos,m='brass',r=.035): return ell('flush rivet',pos,(r,r,r*.53),m)
def prism(name,coords,depth,m):
    # A tapered, honed blade profile drawn in the game XY plane.
    v=[xyz((x,y,z)) for z in (-depth/2,depth/2) for x,y in coords];n=len(coords)
    f=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
    return attach(o,name,m)
def curve(name,points,r,m):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=2
    s=c.splines.new('POLY');s.points.add(len(points)-1)
    for p,v in zip(s.points,points): p.co=(*xyz(v),1)
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.convert(target='MESH');o=bpy.context.object;o.select_set(False);return attach(o,name,m)
def word(text,pos,size,m='cream'):
    c=bpy.data.curves.new('Stamped '+text,'FONT');c.body=text;c.size=size;c.align_x='CENTER';c.extrude=.0015
    o=bpy.data.objects.new('Stamped '+text,c);bpy.context.collection.objects.link(o);o.location=xyz(pos);o.rotation_euler=(math.pi/2,0,0)
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o=bpy.context.object;o.select_set(False);return attach(o,'Stamped '+text,m)
def joint(pos,r=.115):
    ell('brass ball joint',pos,(r,r,r),'brass');ring('joint seam',pos,r*.9,.015,'steel',(1,0,0))
def key(pos):
    x,y,z=pos;cyl('winding spindle',(x,y-.13,z),(x,y+.08,z),.045,'brass')
    ring('winding key left',(x-.11,y+.12,z),.115,.025,'brass');ring('winding key right',(x+.11,y+.12,z),.115,.025,'brass')
def slot(root,name,pos):
    global PARENT,SLOT
    SLOT=name;PARENT=empty('slot_'+name,pos,root);PARENT['mk_slot']=name
    return PARENT
def tube_holes(x,y,z,count=4):
    for i in range(count): cyl('cooling port',(x+(i-(count-1)/2)*.09,y,z),(x+(i-(count-1)/2)*.09,y,z+.012),.025,'dark')

def head_tank(root):
    slot(root,'head',(0,2.16,0))
    ell('boiler helmet', (0,2.41,.015),(.46,.42,.39),'tank',True)
    box('dark visor recess',(0,2.43,.347),(.78,.23,.10),'dark',.05)
    for s in [-1,1]:
        # The slanted brow is a sculpted silhouette, not an aggressive face decal.
        brow=box('heavy visor brow',(s*.21,2.55,.37),(.43,.09,.14),'brass',.025);brow.rotation_euler.y=s*-.12
        eye=box('amber slit optic',(s*.205,2.435,.406),(.20,.072,.03),'lens',.017)
        cyl('helmet hinge',(s*.44,2.43,0),(s*.50,2.43,0),.14,'brass')
        rivet((s*.36,2.29,.338))
    box('heavy lower visor',(0,2.235,.31),(.59,.18,.21),'tank',.07,True)
    for i in [-2,-1,0,1,2]: box('breather grille',(i*.084,2.255,.425),(.038,.10,.018),'steel',.008)
    # A blunt crest and two little rear valves preserve the wind-up toy character.
    box('helmet crown',(0,2.725,-.02),(.13,.16,.51),'brass',.03)
    key((0,2.72,-.18))

def head_speed(root):
    slot(root,'head',(0,2.06,0))
    ell('racing helmet',(0,2.33,.015),(.34,.32,.33),'speed',True)
    ell('ivory face',(0,2.315,.234),(.295,.225,.16),'cream',True)
    for s in [-1,1]:
        ell('expressive optic socket',(s*.13,2.38,.373),(.088,.105,.018),'dark')
        ell('mint pupil',(s*.133,2.38,.392),(.04,.062,.012),'mint')
        brow=box('cheeky eyebrow',(s*.13,2.51,.343),(.17,.042,.044),'steel',.013);brow.rotation_euler.y=s*.23
        cyl('racing ear bearing',(s*.30,2.32,0),(s*.385,2.32,0),.12,'brass')
        fin=prism('swept helmet fin',[(s*.26,2.53),(s*.34,2.53),(s*.47,2.78),(s*.30,2.68)],.075,'yellow');fin.location.y=.08
    curve('crooked smile',[(-.105,2.235,.384),(-.03,2.213,.397),(.06,2.228,.395),(.12,2.262,.372)],.015,'dark')
    # Helmet stripe, the crest is distinctive from the knight's winding key.
    box('racing stripe',(0,2.606,-.07),(.10,.04,.31),'cream',.02)

def head_ranged(root):
    slot(root,'head',(0,2.10,0))
    box('owl helmet',(0,2.36,.0),(.78,.53,.58),'ranged',.17,True)
    for s in [-1,1]:
        ell('owl ivory eye mask',(s*.193,2.37,.278),(.224,.237,.12),'cream',True)
        cyl('focus lens brass surround',(s*.193,2.38,.325),(s*.193,2.38,.46),.165,'brass')
        cyl('focus lens rubber inset',(s*.193,2.38,.451),(s*.193,2.38,.469),.139,'dark')
        cyl('large lens glass',(s*.193,2.38,.468),(s*.193,2.38,.48),.113,'lens' if s<0 else 'mint')
        cyl('owl pupil',(s*.18,2.38,.483),(s*.18,2.38,.49),.052,'dark')
        rivet((s*.29,2.20,.329),r=.025)
        horn=prism('owl feather ear',[(s*.25,2.54),(s*.42,2.65),(s*.39,2.36)],.11,'ranged');horn.location.y=.015
    beak=prism('brass owl beak',[(-.065,2.25),(.065,2.25),(0,2.14)],.075,'brass');beak.location.y=-.42
    for d in [-.06,.06]: box('reticle tick',(.193+d,2.38,.496),(.024,.012,.01),'cream',.001)
    cyl('rangefinder stalk',(.34,2.51,-.18),(.34,2.80,-.18),.019,'steel')
    ell('rangefinder beacon',(.34,2.81,-.18),(.038,.042,.038),'mint')

def torso(root,style):
    slot(root,'torso',(0,1.10,0))
    if style=='tank':
        ell('pressure vessel chest',(0,1.64,0),(.66,.59,.42),'tank',True)
        box('belly steel belt',(0,1.19,.03),(1.05,.22,.70),'steel',.10)
        box('brass breastplate border',(0,1.66,.326),(.98,.64,.18),'brass',.18)
        box('raised chest plate',(0,1.66,.41),(.88,.55,.14),'tank',.14,True)
        cyl('pressure gauge rim',(0,1.75,.477),(0,1.75,.515),.14,'brass')
        cyl('pressure dial',(0,1.75,.514),(0,1.75,.521),.114,'cream')
        needle=box('pressure gauge needle',(.027,1.78,.533),(.017,.11,.012),'speed',.005);needle.rotation_euler.y=-.55
        for x in [-.32,.32]:
            for y in [1.48,1.84]: rivet((x,y,.477),r=.032)
        for s in [-1,1]:
            cyl('rear exhaust', (s*.43,1.41,-.32),(s*.43,2.12,-.34),.11,'copper')
            cyl('exhaust cap',(s*.43,2.12,-.34),(s*.43,2.15,-.34),.12,'steel')
            curve('boiler hose',[(s*.44,1.36,.22),(s*.64,1.42,.24),(s*.65,1.9,.12)],.047,'rubber')
        word('03',(0,1.48,.494),.11)
    elif style=='speed':
        box('narrow athletic chassis',(0,1.65,0),(.60,.64,.42),'speed',.15,True)
        ell('ivory chest bib',(0,1.71,.203),(.27,.29,.073),'cream',True)
        # A moulded lightning emblem, not a generic rectangular access panel.
        flash=prism('racer lightning',[(.055,1.90),(-.11,1.69),(.005,1.69),(-.03,1.50),(.15,1.75),(.045,1.75)],.025,'yellow');flash.location.y=-.277
        cyl('flexible spinal core',(0,1.10,0),(0,1.42,0),.16,'steel')
        for y in [1.13,1.20,1.27,1.34]: ring('spinal bellows',(0,y,0),.16,.025,'rubber',(0,1,0))
        box('racing hip casing',(0,1.05,0),(.56,.22,.36),'speed',.06,True)
        for s in [-1,1]: box('back fin',(s*.23,1.77,-.29),(.10,.44,.17),'yellow',.04)
        word('07',(0,1.36,.177),.095)
    else:
        box('steady gunner chest',(0,1.65,0),(.83,.77,.58),'ranged',.14,True)
        for s in [-1,1]:
            plate=box('owl breast feathers',(s*.20,1.72,.29),(.34,.55,.09),'cream',.085,True);plate.rotation_euler.y=s*.10
            box('utility pouch',(s*.25,1.28,.30),(.25,.23,.19),'copper',.035)
        box('central sighting rail',(0,1.73,.37),(.07,.62,.055),'brass',.015)
        box('gunner waist',(0,1.10,0),(.68,.20,.44),'steel',.055)
        box('range computer',(0,1.65,-.36),(.6,.56,.22),'steel',.06)
        for y in [1.51,1.61,1.71]:box('rear cooling vanes',(0,y,-.49),(.5,.04,.04),'brass',.01)
        word('11',(-.19,1.70,.371),.11,'ranged')
    joint((0,2.08,0),.13)

def arm(root,style,s):
    name='armL' if s<0 else 'armR';width={'tank':.76,'speed':.48,'ranged':.59}[style]
    sy={'tank':2.04,'speed':1.94,'ranged':1.99}[style]
    p=slot(root,name,(s*width,sy,0));joint((s*width,sy,0),.155 if style=='tank' else .115)
    size=.32 if style=='tank' else .19 if style=='speed' else .23
    ell('shoulder shell',(s*(width+.025),sy+.035,0),(size,size*.85,size),'tank' if style=='tank' else style,True)
    if style=='tank':
        # Curved shoulder ring and chimney-shaped shoulder make the frame broad.
        cyl('pauldron bronze bearing',(s*(width+.27),sy,0),(s*(width+.30),sy,0),.20,'brass')
        for i in [-1,0,1]: rivet((s*(width+.03+i*.10),sy+.18,.239),r=.027)
    ex=s*(width+.04); ey=sy-.39; ez=.025
    cyl('upper steel link',(s*width,sy-.09,0),(ex,ey+.03,ez),.10 if style=='tank' else .072,'steel')
    cyl('upper brass piston',(s*(width+.08),sy-.13,.05),(s*(width+.08),ey+.02,.08),.035,'brass')
    joint((ex,ey,ez),.125 if style=='tank' else .095)
    global PARENT
    elbow=empty(name+'_elbow',(ex,ey,ez),p);PARENT=elbow
    wy=ey-.36;wz=.12
    ell('forearm clay gauntlet',(ex,ey-.17,.065),(size*.78,.24,size*.68),style,True)
    if style=='speed':box('racer wrist cuff',(ex,wy+.07,wz),(.24,.10,.23),'cream',.035)
    else:ring('wrist brass seal',(ex,wy+.04,wz),size*.60,.035,'brass',(0,1,0))
    joint((ex,wy,wz),.085)
    hand=empty('handL' if s<0 else 'handR',(ex,wy-.065,wz),elbow);PARENT=hand
    box('steel finger grip',(ex,wy-.065,wz),(.19,.20,.20),'steel',.065)
    for i in [-1,0,1]:box('segmented knuckle',(ex+i*.06,wy-.09,wz+.106),(.05,.105,.035),'brass' if style=='tank' else 'cream',.017)
    return {'shoulder':[s*width,sy,0],'hand':[ex,wy-.065,wz]}

def leg(root,style,s):
    x=s*({'tank':.37,'speed':.25,'ranged':.31}[style]);slot(root,'legL' if s<0 else 'legR',(x,1.04,0))
    joint((x,1.01,0),.13);cyl('upper leg piston',(x,.99,0),(x,.61,.025),.094,'steel')
    if style=='tank':
        box('heavy thigh',(x,.85,0),(.44,.31,.43),'tank',.075,True)
        box('knight knee',(x,.61,.13),(.41,.24,.28),'brass',.065)
        box('greave plate',(x,.36,.03),(.42,.40,.42),'tank',.075,True)
        box('broad planted foot',(x,.13,.12),(.57,.25,.75),'tank',.10,True)
        box('steel toe cap',(x,.155,.425),(.55,.17,.20),'brass',.05)
        box('grippy sole',(x,.037,.10),(.58,.065,.76),'rubber',.02)
        for n in [-1,0,1]:box('toe groove',(x+n*.11,.175,.53),(.018,.08,.014),'steel',.003)
    elif style=='speed':
        box('narrow shin guard',(x,.59,.025),(.23,.60,.25),'speed',.07,True)
        box('roller boot',(x,.24,.10),(.30,.20,.54),'cream',.065,True)
        box('roller chassis',(x,.14,.08),(.31,.07,.56),'steel',.022)
        for z in [-.08,.24]:
            cyl('urethane roller',(x-.185,.13,z),(x+.185,.13,z),.126,'rubber',verts=24)
            for e in [-1,1]:
                cyl('roller coloured hub',(x+e*.18,.13,z),(x+e*.192,.13,z),.082,'yellow')
                cyl('roller axle',(x+e*.19,.13,z),(x+e*.198,.13,z),.032,'steel')
        for z in [-.04,.06,.16]:box('boot lace',(x,.348,z),(.24,.022,.027),'speed',.008)
        ell('knee pad',(x,.75,.145),(.15,.15,.06),'steel')
    else:
        box('ranger thigh',(x,.82,.02),(.32,.28,.31),'ranged',.065,True)
        joint((x,.63,.03),.105)
        box('stable shin',(x,.38,.035),(.31,.40,.34),'cream',.08,True)
        cyl('stability piston',(x+s*.16,.60,-.09),(x+s*.16,.18,-.09),.035,'brass')
        box('ranger boot',(x,.115,.11),(.44,.22,.64),'ranged',.075,True)
        box('rubber sole',(x,.029,.11),(.46,.055,.66),'rubber',.018)
        box('heel brace',(x,.11,-.27),(.49,.12,.15),'brass',.025)

def weapon(root,style,hand):
    global PARENT,SLOT
    SLOT='weapon';PARENT=empty('slot_weapon',(0,0,0),root);kit=PARENT
    # Authored weapon-local frame: grip at origin; weapon built upward along +Y.
    # Assembly carries it at the corresponding hand. Simulation rotates this frame
    # so its recorded striking surface follows the root-space contact path.
    x,y,z=hand
    if style=='tank':
        PARENT=empty('weapon_right',(x,y,z),kit);blade_root=PARENT
        cyl('piledriver haft',(x,y-.22,z),(x,y+.91,z),.055,'steel')
        for dy in [-.16,-.09,-.02,.05,.12]: ring('leather haft grip',(x,y+dy,z),.058,.014,'rubber',(0,1,0))
        box('forged hammer block',(x,y+.78,z),(.60,.36,.32),'steel',.042)
        # The striking face is +Z, clearly distinct from the steel sides.
        box('hardened striking face',(x,y+.78,z+.23),(.56,.34,.14),'edge',.027)
        box('rear counterweight',(x,y+.78,z-.24),(.35,.24,.18),'brass',.035)
        for s in [-1,1]:
            cyl('impact hydraulic ram',(x+s*.18,y+.58,z-.03),(x+s*.18,y+.99,z-.03),.038,'brass')
            rivet((x+s*.21,y+.79,z+.308),r=.03)
        for dy in [-.06,.06]:box('striking face score',(x,y+.78+dy,z+.306),(.37,.018,.008),'steel',.002)
        blade_root.rotation_euler.x=.52
    elif style=='speed':
        for sign in [-1,1]:
            hx=sign*abs(x)
            PARENT=empty('weapon_left' if sign<0 else 'weapon_right',(hx,y,z),kit);blade_root=PARENT
            cyl('blade wrapped grip',(hx,y-.14,z),(hx,y+.15,z),.055,'rubber')
            box('blade swept guard',(hx,y+.16,z),(.30,.047,.16),'brass',.018)
            coords=[(hx-.06,y+.18),(hx+.065,y+.18),(hx+.15,y+.87),(hx+.035,y+1.09),(hx-.105,y+.91)]
            blade=prism('forged twin blade',coords,.052,'steel');blade.location.y=-z
            edge=prism('honed cutting edge',[(hx+.065,y+.18),(hx+.15,y+.87),(hx+.035,y+1.09),(hx+.106,y+.83)],.059,'edge');edge.location.y=-z
            curve('energised blade channel',[(hx,y+.28,z+.03),(hx+.038,y+.72,z+.03),(hx+.026,y+.87,z+.03)],.012,'mint')
            cyl('blade pommel',(hx,y-.19,z),(hx,y-.14,z),.082,'steel')
            blade_root.rotation_euler.x=.50;blade_root.rotation_euler.y=sign*-.19
    else:
        # Entire cannon+backup kit is a single item. Shoulder mount is paid in GP.
        x=.64;y=2.12;z=.015
        PARENT=empty('weapon_shoulder',(x,y,z),kit)
        box('cannon shoulder trunnion',(x,y-.10,z),(.37,.21,.41),'brass',.045)
        box('cannon receiver',(x,y+.13,z+.09),(.32,.34,.62),'steel',.05)
        box('cannon ivory cowling',(x,y+.19,z-.01),(.35,.23,.35),'cream',.04)
        cyl('long rifled cannon barrel',(x,y+.13,z+.34),(x,y+.13,z+1.11),.075,'steel')
        for dz in [.44,.61,.78]:ring('barrel reinforcement',(x,y+.13,z+dz),.077,.024,'brass')
        cyl('muzzle brake',(x,y+.13,z+1.08),(x,y+.13,z+1.28),.112,'steel')
        cyl('visible barrel bore',(x,y+.13,z+1.283),(x,y+.13,z+1.291),.071,'dark')
        for dz in [1.12,1.20]:
            for s in [-1,1]:cyl('muzzle brake port',(x+s*.101,y+.13,z+dz),(x+s*.115,y+.13,z+dz),.028,'dark')
        cyl('cannon sight',(x,y+.34,z-.04),(x,y+.34,z+.31),.054,'brass')
        cyl('cannon sight lens',(x,y+.34,z+.308),(x,y+.34,z+.319),.044,'mint')
        # Folded short-range stock shares the weapon slot and budget.
        hx,hy,hz=hand
        PARENT=empty('weapon_right',(hx,hy,hz),kit)
        box('compact backup receiver',(hx,hy+.13,hz+.20),(.16,.22,.36),'steel',.032)
        cyl('backup barrel',(hx,hy+.13,hz+.34),(hx,hy+.13,hz+.59),.035,'steel')
        box('backup brass slide',(hx,hy+.245,hz+.20),(.17,.05,.30),'brass',.015)
        PARENT=kit
        curve('armoured power cable',[(x,y-.04,z-.28),(x+.17,1.91,-.32),(.28,1.64,-.48)],.035,'rubber')

def descendants(root): return [root]+list(root.children_recursive)
def consolidate(root):
    # Batch each moving piece by material/surface. Keep the clay separate so
    # dents cannot deform lenses, joints, barrels or any neighbouring robot.
    groups={}
    for o in descendants(root):
        if o.type!='MESH':continue
        k=(o.parent.name,o.data.materials[0].name,o.get('mk_surface','protected'))
        groups.setdefault(k,[]).append(o)
    for (parent,material,surface),items in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in items:o.select_set(True)
        bpy.context.view_layer.objects.active=items[0]
        if len(items)>1:bpy.ops.object.join()
        o=bpy.context.object;o.name=parent+'__'+material+'__'+surface

def export(root,path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in descendants(root): o.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_apply=True,export_materials='EXPORT',export_animations=False)
    return {'file':path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}

HEROES=[];manifest={'version':'mk6-art-hero-review-1','rigVersion':'mk6-rig-1','units':'metres','front':'+Z','up':'+Y','status':'hero-review','source':'Original procedural Blender models. No generated or third-party assets.','heroes':{}}
for family,style,label in [('boiler_knight','tank','BOILER KNIGHT'),('roller_daredevil','speed','ROLLER DAREDEVIL'),('owl_ranger','ranged','OWL-EYED RANGER')]:
    FAMILY=family;PARENT=None;SLOT='';root=empty('mk6_'+family);root['mk_assetVersion']=manifest['version'];root['mk_family']=family
    torso(root,style);{'tank':head_tank,'speed':head_speed,'ranged':head_ranged}[style](root)
    left=arm(root,style,-1);right=arm(root,style,1);leg(root,style,-1);leg(root,style,1);weapon(root,style,right['hand'])
    bpy.context.view_layer.update();consolidate(root)
    info=export(root,OUT/(family+'.t3.glb'))
    verts=sum(len(o.data.vertices) for o in descendants(root) if o.type=='MESH')
    triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in descendants(root) if o.type=='MESH')
    info.update({'family':family,'tier':3,'style':style,'vertices':verts,'triangles':triangles,'mounts':{'handL':left['hand'],'handR':right['hand'],'shoulderL':left['shoulder'],'shoulderR':right['shoulder']}})
    manifest['heroes'][family+'.t3']=info;HEROES.append((root,style,label))

(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
# Preserve an editable source file, separate from the public asset directory.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'hero-source.blend'))

# Shared photography stage. The review images use the actual exported models.
PARENT=None;SLOT='';FAMILY='';floor=mat('warm photography stage',(.23,.185,.145),0,.77)
box('photography floor',(0,-.10,0),(200,.12,200),floor,.0)
def light(name,pos,energy,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=xyz(pos);o.rotation_euler=(xyz((0,1.2,0))-o.location).to_track_quat('-Z','Y').to_euler()
light('large warm key',(-3,6,5),850,5,(1,.88,.72));light('soft front',(4,3,5),550,4,(.76,.86,1));light('cool rim',(1,5,-4),1100,3,(.63,.81,1))
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.24,.26,.30,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
camd=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',camd);bpy.context.collection.objects.link(cam);bpy.context.scene.camera=cam;camd.type='ORTHO';camd.lens=60
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16 if opt.quick else 48;scene.cycles.use_denoising=True
scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
def photograph(path,position,target,scale,width,height):
    cam.location=xyz(position);cam.rotation_euler=(xyz(target)-cam.location).to_track_quat('-Z','Y').to_euler();camd.ortho_scale=scale
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
for i,(root,style,label) in enumerate(HEROES):
    root.location.x=(i-1)*2.9
photograph(OUT/'t3-hero-lineup.png',(6,4.2,11),(0,1.42,0),10,1800,850)
for chosen,style,label in HEROES:
    for root,_,_ in HEROES:
        root.hide_render=root!=chosen
        for o in root.children_recursive:o.hide_render=root!=chosen
    chosen.location.x=0
    photograph(OUT/(style+'-three-quarter.png'),(4.3,3.25,6),(0,1.42,.1),3.85,1000,1100)
    photograph(OUT/(style+'-side.png'),(6,2.8,1.1),(0,1.42,.1),3.85,1000,1100)
    chosen.location.x=8
print('MK6_HERO_EXPORT '+json.dumps(manifest))
