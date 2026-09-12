"""Original modular Model Kombat catalogue. Local Blender, no external assets.
blender -b --python bots-v6-author-catalogue.py -- --out DIRECTORY --quick
The existing hero proof is read as a helper library and never overwritten.
"""
from pathlib import Path
base=Path(__file__).with_name('bots-v6-author.py').read_text(encoding='utf-8').split('\nHEROES=[]')[0]
base=base.replace("args.add_argument('--quick', action='store_true')", "args.add_argument('--quick', action='store_true')\nargs.add_argument('--models-only', action='store_true')\nargs.add_argument('--family', default='')\nargs.add_argument('--bodies-only', action='store_true')")
exec(compile(base,'bots-v6-author.py','exec'),globals())
from mathutils import Matrix
TIERS={1:.79,2:.90,3:1,4:1.06}
FAMILIES=[('boiler_knight','tank'),('scrapyard_bruiser','tank'),('roller_daredevil','speed'),('spring_duelist','speed'),('owl_ranger','ranged'),('clockwork_gunner','ranged')]
KINDS=['hammer','sword','paired_blades','ap_rifle','shotgun_tight','shotgun_wide','shock_blade','flame_sword','flamethrower','shoulder_cannon']
manifest={'version':'mk6-art-1','status':'authored-candidate','license':'LicenseRef-ModelKombat-Original','source':'Original procedural Blender sculpture by the Model Kombat project; no third-party mesh or paid generation.','rigVersion':'mk6-rig-2','bodies':{},'weapons':{},'cards':{},'retiredCards':{}}
collision={'version':'mk6-collision-catalogue-1','rigVersion':'mk6-rig-2','units':'millimetres','bodies':{},'weapons':{}}
M['rust']=mat('clay_ochre_scrap',(.56,.255,.085),.13,.4)
M['jade']=mat('clay_duelist_jade',(.08,.41,.31),.12,.33)
M['wine']=mat('clay_clockwork_wine',(.38,.08,.16),.13,.34)
M['fire']=mat('flame_channel',(.98,.22,.012),.3,.22,1.1)
M['electric']=mat('charged_coil',(.12,.52,1),.3,.2,.9)

for material_key in ['tank','speed','ranged','rust','jade','wine']:
    shader=M[material_key].node_tree.nodes.get('Principled BSDF')
    shader.inputs['Metallic'].default_value=.035
    shader.inputs['Roughness'].default_value=.48

def clear_models():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def remove_objects(items):
    for o in list(items):
        if o.name in bpy.data.objects:bpy.data.objects.remove(o,do_unlink=True)
def find(root,name):return next((o for o in descendants(root) if o.name.split('.')[0]==name),None)
def own_slot(root,name):
    global PARENT,SLOT
    PARENT=find(root,'slot_'+name);SLOT=name
def scale_model(root,s):
    # Flatten Blender's parent-inverse matrices before scaling local joints and
    # geometry. Exported pivots therefore have ordinary, exact TRS semantics.
    bpy.context.view_layer.update();world={o:o.matrix_world.copy() for o in descendants(root)}
    for o in descendants(root):o.matrix_parent_inverse=Matrix.Identity(4);o.matrix_world=world[o]
    for o in descendants(root):
        o.location*=s
        if o.type=='MESH':
            for v in o.data.vertices:v.co*=s
    bpy.context.view_layer.update()
def mm(v):return [round(x*1000,4) for x in game(v)]
def bounds(root,slot_name=None):
    points=[]
    for o in descendants(root):
        if o.type!='MESH' or slot_name and o.get('mk_slot')!=slot_name:continue
        points.extend(game(o.matrix_world@v.co) for v in o.data.vertices)
    return [[min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)]]
def physique(root,style):
    bpy.context.view_layer.update();mounts={}
    for slot_name in ['head','torso','armL','armR','legL','legR']:
        mounts[slot_name]={'position':mm(find(root,'slot_'+slot_name).matrix_world.translation),'rotation':[0,0,0]}
    for name in ['handL','handR']:
        mounts[name]={'position':mm(find(root,name).matrix_world.translation),'rotation':[0,0,0]}
    body=find(root,'slot_torso');s=TIERS[TIER]
    for side,sign in [('L',-1),('R',1)]:mounts['shoulder'+side]={'position':[sign*640*s,2120*s,15*s],'rotation':[0,0,0]}
    proxies=[];arms={}
    for slot_name in ['head','torso','armL','armR','legL','legR']:
        lo,hi=bounds(root,slot_name);center=[(lo[i]+hi[i])*500 for i in range(3)];half=[(hi[i]-lo[i])*500 for i in range(3)]
        if slot_name in ['head','torso']:proxies.append({'slot':slot_name,'shape':'box','center':center,'half':half});continue
        if slot_name.startswith('arm'):
            side=slot_name[-1];a=mounts[slot_name]['position'];el=mm(find(root,slot_name+'_elbow').matrix_world.translation);b=mounts['hand'+side]['position']
            r={'tank':250,'speed':155,'ranged':195}[style]*s
            arms['left' if side=='L' else 'right']={'upper':[el[i]-a[i] for i in range(3)],'lower':[b[i]-el[i] for i in range(3)],'pole':[-1 if side=='L' else 1,-.2,.1],'upperRadius':r,'lowerRadius':r*.83}
        else:
            a=mounts[slot_name]['position'];r={'tank':255,'speed':180,'ranged':210}[style]*s;b=[a[0],r+lo[1]*1000,80*s]
        proxies.append({'slot':slot_name,'shape':'capsule','a':a,'b':b,'radius':r,'center':[(a[i]+b[i])/2 for i in range(3)],'half':[abs(a[i]-b[i])/2+r for i in range(3)]})
    lo,hi=bounds(root);return {'height':hi[1]*1000,'radius':max(abs(lo[0]),abs(hi[0]),abs(lo[2]),abs(hi[2]))*1000,'mounts':mounts,'proxies':proxies,'arms':arms}

def scrap_head(root):
    slot(root,'head',(0,2.16,0))
    box('welded helmet',(0,2.41,0),(.90,.62,.70),'rust',.12,True)
    box('black visor',(0,2.43,.354),(.75,.20,.075),'dark',.045)
    for sign in [-1,1]:
        box('stubborn amber eye',(sign*.19,2.43,.399),(.17,.064,.02),'lens',.009)
        b=box('angled scrap brow',(sign*.20,2.555,.375),(.43,.10,.09),'steel',.025);b.rotation_euler.y=sign*-.22
        cyl('temple bolt',(sign*.43,2.40,0),(sign*.51,2.40,0),.09,'brass',verts=6)
    box('square jaw',(0,2.22,.22),(.78,.19,.36),'steel',.07)
    for i in range(5):box('rivet grin',((i-2)*.105,2.24,.409),(.065,.072,.02),'cream',.012)
    box('offset roof plate',(-.18,2.735,.01),(.48,.055,.49),'brass',.02);key((.23,2.74,-.08))
def spring_head(root):
    slot(root,'head',(0,2.06,0))
    ell('duelist helmet',(0,2.34,.015),(.335,.335,.31),'jade',True)
    box('ivory fencing mask',(0,2.32,.274),(.56,.36,.115),'cream',.12,True)
    for sign in [-1,1]:
        ell('alert eye',(sign*.125,2.385,.374),(.077,.088,.02),'dark')
        ell('focused pupil',(sign*.125,2.386,.394),(.033,.044,.012),'mint')
        brow=box('confident brow',(sign*.12,2.49,.354),(.19,.035,.03),'steel',.012);brow.rotation_euler.y=sign*.18
    curve('sly smile',[(-.10,2.225,.356),(.025,2.213,.366),(.12,2.247,.346)],.014,'dark')
    fin=prism('fencer swept crest',[(-.055,2.59),(.05,2.59),(.12,2.96),(-.08,2.85)],.13,'brass');fin.location.y=.05
    for sign in [-1,1]:ring('temple spring',(sign*.33,2.33,0),.11,.028,'brass',(1,0,0))
def clock_head(root):
    slot(root,'head',(0,2.10,0))
    box('clockwork camera head',(0,2.37,0),(.77,.53,.61),'wine',.09,True)
    box('gunner cap brim',(0,2.59,.11),(.91,.065,.77),'steel',.035)
    cyl('large telescope surround',(-.15,2.37,.28),(-.15,2.37,.46),.195,'brass')
    cyl('telescope dark ring',(-.15,2.37,.46),(-.15,2.37,.50),.16,'dark')
    cyl('aiming telescope glass',(-.15,2.37,.50),(-.15,2.37,.506),.13,'lens')
    cyl('precision pupil',(-.15,2.37,.507),(-.15,2.37,.514),.045,'dark')
    box('square secondary eye',(.225,2.40,.31),(.19,.14,.06),'mint',.025)
    curve('quiet confident mouth',[(.04,2.23,.325),(.20,2.215,.327),(.28,2.245,.325)],.013,'brass')
    ring('focus adjustment',(.41,2.36,0),.115,.035,'brass',(1,0,0));key((-.22,2.70,-.16))

def alternate_torso(root,family,style):
    slot(root,'torso',(0,1.10,0))
    if family=='scrapyard_bruiser':
        box('chunky welded engine chest',(0,1.65,0),(1.23,1.04,.80),'rust',.15,True)
        box('asymmetric steel chest armour',(-.20,1.77,.395),(.73,.54,.11),'steel',.05)
        for i in [-1,0,1]:box('radiator brass rib',(-.22,1.77+i*.13,.46),(.52,.055,.04),'brass',.01)
        cyl('bolted circular core',(.37,1.57,.38),(.37,1.57,.49),.16,'brass',verts=12)
        cyl('hot engine glass',(.37,1.57,.49),(.37,1.57,.50),.10,'lens')
        for x in [-.49,.49]:
            for y in [1.3,2.0]:rivet((x,y,.41),r=.05)
        box('heavy waist',(0,1.10,0),(1.04,.18,.65),'steel',.06)
        cyl('single crooked exhaust',(-.48,1.47,-.40),(-.48,2.27,-.40),.125,'copper')
    elif family=='spring_duelist':
        ell('fitted duelist breastplate',(0,1.65,0),(.34,.45,.255),'jade',True)
        box('fencer belt',(0,1.27,0),(.51,.12,.38),'brass',.035)
        cyl('mainspring casing',(0,1.73,.22),(0,1.73,.32),.17,'brass')
        for r in [.055,.10,.14]:ring('spiral spring window',(0,1.73,.328),r,.012,'steel')
        box('ivory lapel',(-.20,1.86,.23),(.115,.40,.08),'cream',.035,True)
        cyl('flexible duelist waist',(0,1.05,0),(0,1.36,0),.13,'steel')
        for y in [1.09,1.17,1.25]:ring('waist spring',(0,y,0),.15,.027,'brass',(0,1,0))
    else:
        box('clockwork gunner cuirass',(0,1.67,0),(.86,.82,.60),'wine',.10,True)
        box('cream diagonal chest panel',(-.21,1.72,.29),(.27,.61,.08),'cream',.06,True)
        cyl('range clock housing',(.14,1.76,.31),(.14,1.76,.39),.205,'brass')
        cyl('range clock ivory dial',(.14,1.76,.39),(.14,1.76,.398),.169,'cream')
        needle=box('clock hand',(.16,1.79,.412),(.026,.21,.015),'steel',.006);needle.rotation_euler.y=-.35
        for i in range(8):
            a=i*math.pi/4;rivet((.14+math.sin(a)*.143,1.76+math.cos(a)*.143,.409),m='steel',r=.011)
        for x in [-.30,-.10,.10,.30]:cyl('spare brass cartridge',(x,1.25,.31),(x,1.44,.31),.045,'brass')
        box('gunner gear pack',(0,1.63,-.37),(.64,.56,.24),'steel',.06)
        ring('visible clock gear',(0,1.73,-.51),.19,.043,'brass')
        box('gunner waist',(0,1.11,0),(.67,.20,.42),'steel',.05)
    joint((0,2.08,0),.13)

def spring_leg(root,sign):
    x=sign*.25;slot(root,'legL' if sign<0 else 'legR',(x,1.04,0));joint((x,1.01,0),.115)
    cyl('upper duelist link',(x,.99,0),(x,.68,-.075),.067,'steel');joint((x,.66,-.075),.10)
    box('duelist kneepad',(x,.66,.045),(.24,.21,.14),'jade',.07,True)
    points=[]
    for i in range(121):
        a=i/120*math.pi*12;points.append((x+math.cos(a)*.105,.23+i/120*.37,math.sin(a)*.105-.045))
    curve('visible leg power spring',points,.026,'brass')
    cyl('spring guide rod',(x,.22,-.045),(x,.62,-.045),.035,'steel')
    box('fencer pointed boot',(x,.12,.11),(.28,.22,.62),'jade',.07,True)
    box('ivory toe cap',(x,.145,.38),(.26,.14,.17),'cream',.045)
    box('rubber fencing sole',(x,.033,.11),(.285,.053,.63),'rubber',.015)

def tier_details(root,style,tier):
    # Every tier is a complete toy. Progression adds armour and machinery;
    # it must never remove the forearm or the connection from knee to boot.
    if tier<3:
        fragments=['rear exhaust','exhaust cap','pauldron bronze','heavy visor brow','helmet crown','rear cooling vanes','back fin','rangefinder stalk','rangefinder beacon','offset roof plate']
        if tier==1:fragments+=['asymmetric steel chest armour']
        remove_objects(o for o in descendants(root) if o.type=='MESH' and any(n in o.name for n in fragments))
        if style=='tank':
            own_slot(root,'head')
            remove_objects(o for o in descendants(PARENT) if o.type=='MESH' and any(n in o.name for n in ['amber slit optic','stubborn amber eye','angled scrap brow']))
            y=2.435 if FAMILY=='boiler_knight' else 2.43
            for sign in [-1,1]:
                x=sign*.205
                ell('starter ivory optic',(x,y,.411),(.103,.098,.022),'cream')
                ell('starter curious pupil',(x+sign*.007,y,.435),(.035,.053,.012),'dark')
                ell('starter eye glint',(x-.012,y+.021,.449),(.011,.014,.003),'cream')
    if tier>=2:
        for side,sign in [('L',-1),('R',1)]:
            own_slot(root,'arm'+side);p=game(PARENT.matrix_world.translation);x,y,z=p
            box('arm rank collar',(x,y-.23,.045),(.28 if style=='tank' else .20,.08,.22),'brass',.025)
    if tier>=3:
        own_slot(root,'torso')
        for sign in [-1,1]:
            x=sign*({'tank':.52,'speed':.23,'ranged':.33}[style])
            box('reinforced side armour',(x,1.46,.08),(.17,.42,.47 if style=='tank' else .32),style,.055,True)
    if tier==4:
        for side,sign in [('L',-1),('R',1)]:
            own_slot(root,'arm'+side);x,y,z=game(PARENT.matrix_world.translation)
            ell('elite shoulder armour',(x+sign*.08,y+.075,0),(.36 if style=='tank' else .235,.21,.30),style,True)
            box('elite shoulder brass rim',(x+sign*.1,y+.22,.02),(.47 if style=='tank' else .30,.045,.30),'brass',.02)
            cyl('elite shoulder mechanism',(x+sign*.06,y-.08,-.21),(x+sign*.06,y+.16,-.21),.055,'copper')
        own_slot(root,'head')
        for sign in [-1,1]:
            x=sign*.31;cyl('elite temple guard',(x,2.34,-.18),(x,2.63,-.18),.053,'brass')
        own_slot(root,'torso');box('elite rear generator',(0,1.62,-.49),(.45,.46,.20),'steel',.055)
        for x in [-.12,0,.12]:cyl('elite generator core',(x,1.48,-.60),(x,1.77,-.60),.037,'mint' if style!='tank' else 'lens')

def helmet_expression(root,style,tier):
    if FAMILY != 'boiler_knight' or tier < 3:return
    own_slot(root,'head')
    remove_objects(o for o in descendants(PARENT) if o.type=='MESH' and any(n in o.name for n in ['heavy visor brow','amber slit optic']))
    # A helmeted character still has eyes. The brow is part of the helmet,
    # instead of two large floating gold bars covering its expression.
    box('sculpted helmet visor lip',(0,2.557,.368),(.79,.063,.103),'tank',.026,True)
    for sign in [-1,1]:
        x=sign*.205
        ell('focused ivory optic',(x,2.435,.399),(.105,.082,.022),'cream')
        ell('focused dark pupil',(x-sign*.009,2.432,.423),(.033,.046,.012),'dark')
        ell('small reflected eye light',(x-.013,2.451,.437),(.009,.012,.003),'cream')
        lid=box('armoured eye hood',(x,2.506,.409),(.236,.037,.045),'tank',.013,True)
        lid.rotation_euler.y=sign*-.10


def body_asset(family,style,tier):
    global FAMILY,PARENT,SLOT,TIER
    clear_models();FAMILY=family;TIER=tier;PARENT=None;SLOT='';root=empty('mk6_'+family)
    root['mk_family']=family;root['mk_tier']=tier;root['mk_assetVersion']='mk6-art-1'
    normal=M[style];M[style]=M[{'scrapyard_bruiser':'rust','spring_duelist':'jade','clockwork_gunner':'wine'}.get(family,style)]
    if family in ['scrapyard_bruiser','spring_duelist','clockwork_gunner']:
        alternate_torso(root,family,style);{'scrapyard_bruiser':scrap_head,'spring_duelist':spring_head,'clockwork_gunner':clock_head}[family](root)
    else:torso(root,style);{'tank':head_tank,'speed':head_speed,'ranged':head_ranged}[style](root)
    arm(root,style,-1);arm(root,style,1)
    for sign in [-1,1]:
        if family=='spring_duelist':spring_leg(root,sign)
        else:leg(root,style,sign)
    alternate_limbs(root,family,style)
    bpy.context.view_layer.update();tier_details(root,style,tier);helmet_expression(root,style,tier)
    # A fine, deterministic irregularity survives glTF export without a costly shader.
    for o in descendants(root):
        if o.type=='MESH' and o.get('mk_surface')=='clay':
            for v in o.data.vertices:
                p=v.co;d=math.sin(p.x*89+math.sin(p.z*63))*math.sin(p.y*81+p.z*43)*.0011;v.co+=v.normal*d
    scale_model(root,TIERS[tier]);body_collision=physique(root,style);consolidate(root)
    path=OUT/(family+'.t'+str(tier)+'.glb');info=export(root,path);info.update({'family':family,'style':style,'tier':tier,'url':path.name,'bounds':bounds(root),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in descendants(root) if o.type=='MESH')})
    key=family+'.t'+str(tier);manifest['bodies'][key]=info;collision['bodies'][key]=body_collision
    for kind,node in [('head','head'),('torso','torso'),('arms','armR'),('legs','legR')]:manifest['cards'][f'mk6.t{tier}.{family}.{kind}']={'model':path.name,'node':'slot_'+node,'ready':True,'thumbnail':f'thumbs/{family}.t{tier}.{kind}.png'}
    if not opt.models_only:render_tiles(root,family,tier,['head','torso','arms','legs'])
    M[style]=normal

def alternate_limbs(root,family,style):
    # Distinct mechanisms on the second family, within the same authored joint
    # reach and hit capsule. A cosmetic colour change alone is not a design.
    global PARENT,SLOT
    if family not in ['scrapyard_bruiser','spring_duelist','clockwork_gunner']:return
    for sign in [-1,1]:
        suffix='L' if sign<0 else 'R';SLOT='arm'+suffix;PARENT=find(root,SLOT+'_elbow')
        for obj in list(descendants(PARENT)):
            if obj.type=='MESH' and obj.get('mk_surface')=='clay':remove_objects([obj])
        width={'tank':.76,'speed':.48,'ranged':.59}[style];sy={'tank':2.04,'speed':1.94,'ranged':1.99}[style];x=sign*(width+.04);y=sy-.56
        if family=='scrapyard_bruiser':
            box('welded box gauntlet',(x,y,.065),(.43,.42,.36),'rust',.055,True)
            box('scrap forearm face',(x,y,.252),(.34,.27,.028),'steel',.023)
            for dx in [-.12,.12]:
                for dy in [-.09,.09]:rivet((x+dx,y+dy,.271),r=.023)
            cyl('visible salvaged ram',(x+sign*.19,y-.13,-.03),(x+sign*.19,y+.17,-.03),.039,'brass')
        elif family=='spring_duelist':
            box('tapered fencing vambrace',(x,y,.05),(.22,.40,.21),'jade',.047,True)
            for yy in [-.12,0,.12]:ring('fencer wrist spring',(x,y+yy,.05),.118,.015,'brass',(0,1,0))
            box('fencer hand shield',(x,y-.18,.16),(.25,.12,.085),'steel',.025)
        else:
            box('camera stabiliser forearm',(x,y,.055),(.29,.39,.28),'wine',.055,True)
            cyl('forearm aiming dial',(x,y,.205),(x,y,.225),.103,'brass')
            cyl('dial glass',(x,y,.225),(x,y,.23),.084,'dark')
            box('range needle',(x,y+.027,.239),(.014,.091,.009),'mint',.003)
            for dx in [-.07,.07]:cyl('exposed return rod',(x+dx,y-.14,-.12),(x+dx,y+.17,-.12),.02,'brass')
        if family=='spring_duelist':continue
        own_slot(root,'leg'+suffix);x=sign*(.37 if style=='tank' else .31)
        if family=='scrapyard_bruiser':
            box('riveted work boot',(x,.29,.24),(.43,.23,.12),'steel',.022)
            for dx in [-.14,0,.14]:rivet((x+dx,.30,.307),r=.023)
            cyl('external knee axle',(x-sign*.19,.60,.035),(x+sign*.19,.60,.035),.101,'steel')
        else:
            cyl('clockwork ankle gear',(x-sign*.145,.37,.045),(x+sign*.145,.37,.045),.126,'brass')
            for yy in [.22,.32,.42,.52]:box('telescopic shin segment',(x,yy,.225),(.24,.065,.045),'wine',.015,True)
            box('survey boot brace',(x,.155,.36),(.34,.10,.07),'brass',.017)

def gun(kind,tier):
    length={'ap_rifle':.650,'shotgun_tight':.440,'shotgun_wide':.350,'flamethrower':.420,'shoulder_cannon':.600,'shoulder_battery':1.290,'backup':.590,'special':.450}[kind]
    h=.130 if kind in ['shoulder_battery','backup'] else .120 if kind=='special' else .08 if kind=='shoulder_cannon' else .04
    cannon=kind in ['shoulder_cannon','shoulder_battery'];flame=kind=='flamethrower';wide=kind=='shotgun_wide';shot=kind.startswith('shotgun')
    width=.26 if cannon else .15;back=-.25 if not cannon else -.18
    box('forged receiver',(0,h,back+.22),(width,.22,.40),'steel',.025)
    box('machined upper rail',(0,h+.13,.045),(width+.025,.045,.34),'brass',.012)
    box('wrapped hand grip',(0,-.12,-.018),(.095,.25,.125),'rubber',.028)
    box('trigger guard',(0,-.06,.095),(.055,.12,.14),'steel',.035)
    barrelStart=.14;radius=.095 if cannon else .062 if flame else .053 if shot else .032
    barrels=[-.057,.057] if wide else [0]
    for x in barrels:
        cyl('rifled steel barrel',(x,h,barrelStart),(x,h,length-.035),radius,'steel')
        cyl('honed muzzle lip',(x,h,length-.035),(x,h,length),radius*1.22,'edge')
        cyl('dark bore',(x,h,length+.0005),(x,h,length+.003),radius*.70,'dark')
    if shot:box('ribbed pump',(0,h-.046,.21),(.17,.13,.20),'rubber',.025)
    if kind=='ap_rifle':
        box('short shoulder stock',(0,h-.02,-.32),(.105,.22,.28),'steel',.03)
        cyl('rifle brass scope',(0,h+.25,-.11),(0,h+.25,.17),.065,'brass')
        cyl('scope objective glass',(0,h+.25,.17),(0,h+.25,.18),.052,'mint')
        box('rifle magazine',(0,-.19,.15),(.09,.32,.15),'steel',.014)
    if cannon:
        box('cannon trunnion',(0,h-.19,-.08),(.35,.16,.30),'brass',.035)
        for z in [.20,length*.50,length*.72]:ring('cannon reinforcement',(0,h,z),radius*1.05,.027,'brass')
        box('armoured cannon shroud',(0,h+.095,.035),(.31,.19,.36),'cream',.04)
    if flame:
        for sign in [-1,1]:
            cyl('fuel cartridge',(sign*.125,-.08,-.10),(sign*.125,.10,-.10),.055,'copper')
            curve('fuel line',[(sign*.125,.08,-.1),(sign*.14,.09,.2),(sign*.07,.04,.32)],.015,'rubber')
        cyl('pilot nozzle',(.06,-.02,.31),(.06,-.02,.41),.018,'brass')
        ell('pilot light',(.06,-.02,.415),(.020,.025,.025),'fire')
    if tier>=3:
        for sign in [-1,1]:rivet((sign*(width/2-.02),h+.14,.035),r=.017)
    if tier==4:box('elite capacitor',(.095,h+.05,-.11),(.065,.10,.15),'mint',.012)
    return [-57 if wide else 0,h*1000,length*1000]

def blade(kind,tier):
    twin=kind=='powered_twins';length=1.09 if twin else .72
    cyl('tempered tang',(0,-.17,0),(0,.18,0),.048,'steel')
    for y in [-.11,-.055,0,.055,.11]:ring('leather grip wrap',(0,y,0),.05,.012,'rubber',(0,1,0))
    box('brass hand guard',(0,.145,0),(.32,.05,.13),'brass',.017)
    coords=[(-.08,.18),(.065,.18),(.15,.87),(.035,1.09),(-.105,.91)] if twin else [(-.14,.18),(-.012,.18),(0,.72),(-.08,.85),(-.155,.68)]
    prism('forged dangerous blade',coords,.047,'steel')
    edge=[(.047,.18),(.065,.18),(.15,.87),(.035,1.09),(.112,.84)] if twin else [(-.03,.18),(0,.18),(0,.72),(-.08,.85),(-.04,.67)]
    prism('bright honed edge',edge,.052,'edge')
    cyl('weighted steel pommel',(0,-.20,0),(0,-.155,0),.071,'brass')
    if kind in ['shock_blade','flame_sword','powered_twins']:
        channel='electric' if kind=='shock_blade' else 'fire' if kind=='flame_sword' else 'mint'
        curve('working elemental edge',[(.013 if twin else -.08,.23,.027),(.032 if twin else -.073,length*.73,.027),(.029 if twin else -.072,length*.91,.027)],.016,channel)
        for sign in [-1,1]:cyl('charge cell',(sign*.095,.035,0),(sign*.095,.14,0),.032,'copper')
    if tier==4:box('elite counterweight',(0,-.175,0),(.18,.12,.12),'brass',.025)

def hammer(signature,tier):
    z=.3 if signature else 0
    cyl('steel hammer shaft',(0,-.13,0),(0,.78,z-.16),.052,'steel')
    for y in [-.07,-.01,.05,.11]:ring('hammer grip wrap',(0,y,0),.062,.018,'rubber',(0,1,0))
    box('heavy forged hammer head',(0,.78,z-.16),(.56 if signature else .48,.31,.32),'steel',.045)
    box('flat striking face',(0,.78,z-.005),(.53 if signature else .45,.27,.02),'edge',.024)
    if signature:
        for x in [-.19,.19]:cyl('piledriver piston',(x,.78,z-.30),(x,.78,z+.004),.047,'brass')
        box('piledriver rear housing',(0,.78,z-.39),(.36,.22,.18),'brass',.04)
    if tier>=2:
        for x in [-.14,.14]:rivet((x,.86,z+.007),r=.023)
    if tier==4:box('elite impact brace',(0,.98,z-.17),(.49,.075,.26),'brass',.022)

def weapon_asset(kind,tier):
    global PARENT,SLOT,FAMILY
    clear_models();PARENT=None;SLOT='weapon';FAMILY='';root=empty('weapon_kit');SLOT='weapon'
    canonical='hammer' if kind=='piledriver' else 'paired_blades' if kind=='powered_twins' else 'shoulder_cannon' if kind=='shoulder_battery' else kind
    signature=kind in ['piledriver','powered_twins','shoulder_battery'];is_gun=canonical in ['ap_rifle','shotgun_tight','shotgun_wide','flamethrower','shoulder_cannon']
    PARENT=empty('weapon_shoulder' if canonical=='shoulder_cannon' else 'weapon_right',parent=root)
    if is_gun:
        muzzle=gun(kind,tier)
        if canonical=='shoulder_cannon':PARENT=empty('weapon_right',parent=root);backup=gun('backup',tier)
    elif canonical=='hammer':hammer(signature,tier);muzzle=[0,0,600]
    else:blade(kind,tier);muzzle=[0,0,500]
    scale_model(root,TIERS[tier]);consolidate(root)
    folder=OUT/'weapons';folder.mkdir(exist_ok=True);file=folder/(kind+'.t'+str(tier)+'.glb');info=export(root,file);info.update({'url':'weapons/'+file.name,'tier':tier,'kind':canonical,'signature':kind if signature else None,'muzzle':[n*TIERS[tier] for n in muzzle],'grip':[0,0,0],'paired':canonical=='paired_blades'})
    if canonical=='shoulder_cannon':info['backupMuzzle']=[n*TIERS[tier] for n in backup]
    info['triangles']=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in descendants(root) if o.type=='MESH')
    key=kind+'.t'+str(tier);manifest['weapons'][key]=info
    # Preserve the earlier T2 cannon export as a review asset. Playable cannon
    # kits begin at T3 and require a matching Ranged body in the catalogue.
    bucket='retiredCards' if tier==2 and kind=='shoulder_cannon' else 'cards'
    manifest[bucket][f'mk6.t{tier}.'+('signature.' if signature else 'weapon.')+kind]={'model':info['url'],'node':'weapon_kit','ready':True,'thumbnail':'thumbs/'+key+'.png'}
    if not opt.models_only:render_tiles(root,kind,tier,['weapon'])

def render_tiles(root,name,tier,kinds):
    # Actual geometry, shared soft studio lighting, small shelf-ready pictures.
    global PARENT,SLOT
    PARENT=None;SLOT='';scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8 if opt.quick else 24;scene.cycles.use_denoising=True
    scene.render.resolution_x=320;scene.render.resolution_y=320;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
    scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
    lamps=[]
    for loc,energy,size in [((3,4,5),600,5),((-3,3,1),450,4),((1,4,-3),700,3)]:
        data=bpy.data.lights.new('catalogue studio','AREA');data.energy=energy;data.shape='DISK';data.size=size;o=bpy.data.objects.new('catalogue studio',data);bpy.context.collection.objects.link(o);o.location=xyz(loc);o.rotation_euler=(xyz((0,1.4,0))-o.location).to_track_quat('-Z','Y').to_euler();lamps.append(o)
    data=bpy.data.cameras.new('catalogue camera');data.type='ORTHO';cam=bpy.data.objects.new('catalogue camera',data);bpy.context.collection.objects.link(cam);scene.camera=cam
    thumb=OUT/'thumbs';thumb.mkdir(exist_ok=True)
    for kind in kinds:
        selected='armR' if kind=='arms' else 'legR' if kind=='legs' else kind
        for o in descendants(root):o.hide_render=o.type=='MESH' and kind!='weapon' and o.get('mk_slot')!=selected
        lo,hi=bounds(root,None if kind=='weapon' else selected);target=Vector([(lo[i]+hi[i])/2 for i in range(3)]);size=max(hi[i]-lo[i] for i in range(3))*1.4
        cam.location=xyz(target+Vector((3,1.4,5)));cam.rotation_euler=(xyz(target)-cam.location).to_track_quat('-Z','Y').to_euler();data.ortho_scale=size
        scene.render.filepath=str(thumb/(f'{name}.t{tier}'+('' if kind=='weapon' else '.'+kind)+'.png'));bpy.ops.render.render(write_still=True)
    remove_objects(lamps+[cam])

for family,style in FAMILIES:
    if opt.family and opt.family!=family:continue
    for tier in [1,2,3,4]:
        body_asset(family,style,tier);(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2));(OUT/'body-collision.json').write_text(json.dumps(collision,indent=2));print('BODY_READY',family,tier,flush=True)
if not opt.family and not opt.bodies_only:
    for tier in [1,2,3,4]:
        for kind in KINDS+(['piledriver','powered_twins','shoulder_battery'] if tier>=3 else []):
            if tier==1 and kind not in ['hammer','sword','ap_rifle']:continue
            weapon_asset(kind,tier);(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2));print('WEAPON_READY',kind,tier,flush=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2));(OUT/'body-collision.json').write_text(json.dumps(collision,indent=2))
print('CATALOGUE_READY',len(manifest['cards']),flush=True)
