"""Original three-character designer-toy pilot. Blender 4.5. No paid providers.
Only writes art-src/bots/remaster-v7 and public/bots-art/3d/remaster-v7 below --repo.
"""
import argparse, hashlib, json, math, sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector, Matrix

ap=argparse.ArgumentParser();ap.add_argument('--repo',type=Path,required=True);ap.add_argument('--hero',choices=['tank','speed','ranged','all'],default='all');ap.add_argument('--quick',action='store_true');ap.add_argument('--no-render',action='store_true')
args=ap.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.context.preferences.filepaths.save_version=0
OUT=args.repo/'public/bots-art/3d/remaster-v7';SRC=args.repo/'art-src/bots/remaster-v7'
for p in [OUT,SRC,SRC/'review',OUT/'textures']:p.mkdir(parents=True,exist_ok=True)
HEROES={'tank':('boiler-knight','Boiler Knight'),'speed':('roller-daredevil','Roller Daredevil'),'ranged':('owl-ranger','Owl Ranger')}
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
N={};MARKERS={};M={};STYLE=''
def xyz(p):return Vector((p[0],-p[2],p[1]))
def game(p):return [float(p.x),float(p.z),float(-p.y)]
def mm(p):return [round(x*1000,5) for x in game(p)]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def reset():
    global N,MARKERS
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);N={};MARKERS={}
    bpy.data.orphans_purge(do_recursive=True)
def node(name,pos=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=xyz(pos)
    bpy.context.view_layer.update()
    if parent:w=o.matrix_world.copy();o.parent=N[parent];o.matrix_world=w
    o['mk_rig_node']=name;N[name]=o;return o
def world(name):bpy.context.view_layer.update();return game(N[name].matrix_world.translation)
def mark(name,parent,p,normal=None):
    bpy.context.view_layer.update();MARKERS[name]={'node':parent,'position':mm(N[parent].matrix_world.inverted()@xyz(p))}
    if normal is not None:MARKERS[name]['normal']=list(normal)
def tag(o,name,mat,parent,slot,clay=False):
    o.name=name;o.data.materials.append(M[mat]);o['mk_slot']=slot;o['mk_surface']='clay' if clay else 'protected';o['mk_surface_id']=STYLE+'.'+name.replace(' ','-')
    for f in o.data.polygons:f.use_smooth=True
    bpy.context.view_layer.update();w=o.matrix_world.copy();o.parent=N[parent];o.matrix_world=w;return o
def ell(name,p,s,mat,parent,slot,clay=False,segments=32,rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=xyz(p));o=bpy.context.object;o.scale=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return tag(o,name,mat,parent,slot,clay)
def box(name,p,s,mat,parent,slot,bevel=.04,clay=False):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p));o=bpy.context.object;o.dimensions=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    b=o.modifiers.new('Hand finished rounded edges','BEVEL');b.width=bevel;b.segments=4;bpy.ops.object.modifier_apply(modifier=b.name)
    if clay:s=o.modifiers.new('Clay deformation grid','SUBSURF');s.subdivision_type='SIMPLE';s.levels=1;bpy.ops.object.modifier_apply(modifier=s.name)
    tag(o,name,mat,parent,slot,clay);n=o.modifiers.new('Stable corner normals','WEIGHTED_NORMAL');n.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=n.name);return o
def cyl(name,a,b,r,mat,parent,slot,verts=24):
    a,b=xyz(a),xyz(b);v=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=v.length,location=(a+b)*.5);o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=v.to_track_quat('Z','Y')
    bevel=o.modifiers.new('Machined edge','BEVEL');bevel.width=min(.009,r*.12);bevel.segments=2;bpy.ops.object.modifier_apply(modifier=bevel.name);return tag(o,name,mat,parent,slot)
def ring(name,p,r,t,mat,parent,slot,axis=(0,0,1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=t,major_segments=40,minor_segments=8,location=xyz(p));o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=xyz(axis).to_track_quat('Z','Y');return tag(o,name,mat,parent,slot)
def curve(name,points,r,mat,parent,slot):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=10;cu.bevel_depth=r;cu.bevel_resolution=3;sp=cu.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
    for bp,p in zip(sp.bezier_points,points):bp.co=xyz(p);bp.handle_left_type=bp.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');return tag(bpy.context.object,name,mat,parent,slot)
def lathe(name,profile,depth,mat,parent,slot):
    vs=[];fs=[];steps=48
    for y,r in profile:
        for i in range(steps):t=i*math.tau/steps;vs.append(tuple(xyz((r*math.cos(t),y,r*depth*math.sin(t)))))
    for j in range(len(profile)-1):
        for i in range(steps):a=j*steps+i;b=j*steps+(i+1)%steps;fs.append((a,b,b+steps,a+steps))
    fs +=[tuple(range(steps-1,-1,-1)),tuple((len(profile)-1)*steps+i for i in range(steps))];me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    sub=o.modifiers.new('Sculpted shell continuity','SUBSURF');sub.levels=1;bpy.ops.object.modifier_apply(modifier=sub.name);return tag(o,name,mat,parent,slot,True)
def joint(name,p,r,parent,slot):return ell(name,p,(r,r,r),'brass',parent,slot,False,24,14)

def materials():
    global M
    n=1024;y,x=np.mgrid[0:n,0:n].astype(np.float32)/n
    h=.16*np.sin(math.tau*(x*9+np.sin(y*math.tau*3)*.07))*np.cos(math.tau*y*11)+.035*np.sin(math.tau*(x*79+y*47))+.026*np.cos(math.tau*(x*113-y*67))
    for cx,cy,a in [(.28,.32,.022),(.75,.72,.026),(.67,.20,.020)]:
        rr=np.sqrt(((x-cx)*1.1)**2+((y-cy)*.72)**2);h+=a*np.sin(rr*math.tau*180)*np.exp(-rr*rr/.007)
    dy,dx=np.gradient(h);normal=np.dstack((-dx*7,-dy*7,np.ones_like(h)));normal/=np.linalg.norm(normal,axis=2,keepdims=True);normal=np.dstack((normal*.5+.5,np.ones_like(h)))
    rough=np.clip(.47+h*.09,.41,.55);rough=np.dstack((rough,rough,rough,np.ones_like(h)));images={}
    for key,data in [('clay-normal',normal),('clay-roughness',rough)]:
        image=bpy.data.images.new(key,width=n,height=n,alpha=True);image.colorspace_settings.name='Non-Color';image.pixels.foreach_set(data.astype(np.float32).ravel());image.filepath_raw=str(OUT/'textures'/(key+'.png'));image.file_format='PNG';image.save();image.pack();images[key]=image
    palette={'teal':((.012,.18,.13),.035,.46),'coral':((.60,.065,.033),.025,.44),'indigo':((.05,.072,.18),.03,.45),'ivory':((.82,.70,.48),.015,.44),'brass':((.48,.265,.075),.75,.30),'steel':((.065,.083,.095),.8,.27),'edge':((.39,.47,.51),.85,.23),'rubber':((.019,.029,.028),0,.68),'black':((.008,.020,.019),.02,.25),'white':((.95,.91,.74),.02,.30),'glass':((.018,.055,.055),.20,.17),'red':((.52,.025,.014),.03,.4)}
    M={}
    for key,(color,metal,roughness) in palette.items():
        mat=bpy.data.materials.new('mk7_'+key);mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=roughness
        if key in ['teal','coral','indigo','ivory']:
            nt=mat.node_tree.nodes.new('ShaderNodeTexImage');nt.image=images['clay-normal'];normal=mat.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.25;mat.node_tree.links.new(nt.outputs['Color'],normal.inputs['Color']);mat.node_tree.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
            rt=mat.node_tree.nodes.new('ShaderNodeTexImage');rt.image=images['clay-roughness'];mat.node_tree.links.new(rt.outputs['Color'],bs.inputs['Roughness']);bs.inputs['Coat Weight'].default_value=.16;bs.inputs['Coat Roughness'].default_value=.36
        if key=='glass':bs.inputs['Coat Weight'].default_value=.7
        M[key]=mat

def skeleton(style):
    node('root');node('pelvis',(0,.89,0),'root');node('chest',(0,1.28,0),'pelvis');node('head',(0,1.88,0),'chest')
    shoulder={'tank':.66,'speed':.47,'ranged':.56}[style];sy={'tank':1.62,'speed':1.56,'ranged':1.54}[style];elbow={'tank':(.75,1.24,.035),'speed':(.57,1.22,.01),'ranged':(.67,1.22,.025)}[style];wrist={'tank':(.78,.96,.12),'speed':(.62,.97,.12),'ranged':(.69,.98,.13)}[style];hip={'tank':.30,'speed':.235,'ranged':.275}[style]
    for side,sign in [('L',-1),('R',1)]:
        node('shoulder'+side,(sign*shoulder,sy,0),'chest');node('elbow'+side,(sign*elbow[0],elbow[1],elbow[2]),'shoulder'+side);node('wrist'+side,(sign*wrist[0],wrist[1],wrist[2]),'elbow'+side);node('hand'+side,(sign*wrist[0],wrist[1]-.075,wrist[2]+.045),'wrist'+side)
        node('hip'+side,(sign*hip,.88,0),'pelvis');node('knee'+side,(sign*(hip+.018),.53,.015),'hip'+side);node('ankle'+side,(sign*(hip+.03),.19,.045),'knee'+side);node('wheel'+side,(sign*(hip+.03),.12,.055),'ankle'+side)
        mark('grip'+side,'hand'+side,world('hand'+side));mark('sole'+side,'ankle'+side,(sign*(hip+.03),.008,.13))
    return shoulder,sy,elbow,wrist,hip
def key(pos,width=.10):
    x,y,z=pos;cyl('winding spindle',(x,y-.045,z),(x,y+.035,z),.033,'brass','head','head')
    for s in [-1,1]:ring('winding loop '+str(s),(x+s*width*.70,y+.09,z),width*.66,.024,'brass','head','head')
def eyes(style,cy,front,spacing):
    color={'tank':'teal','speed':'coral','ranged':'indigo'}[style]
    for side,sign in [('L',-1),('R',1)]:
        x=spacing*sign;rad=.145 if style!='ranged' else .215
        ell('eye socket '+side,(x,cy,front),(rad*1.14,rad*1.08,.062),'rubber','head','head');ring('brass optical rim '+side,(x,cy,front+.038),rad,.016,'brass','head','head');ell('ivory eye '+side,(x,cy,front+.052),(rad*.94,rad*.94,.052),'white','head','head')
        py=cy-.014 if style=='speed' else cy
        node('pupil'+side,(x,py,front+.1),'head');ell('living pupil '+side,(x,py,front+.105),(rad*.38,rad*.47,.026),'glass','pupil'+side,'head',False,24,16);ell('eye catchlight '+side,(x-.025,py+.035,front+.127),(.016,.019,.009),'white','pupil'+side,'head',False,16,10)
        node('lid'+side,(x,cy+rad*.74,front+.055),'head');ell('armoured eyelid '+side,(x,cy+rad*.96,front+.038),(rad*1.03,.047,.076),color,'lid'+side,'head',True,24,14)
        if style=='speed':
            o=N['lid'+side];o.rotation_mode='QUATERNION';o.rotation_quaternion=(C@Matrix.Rotation(.18 if side=='L' else -.12,4,'Z')@C.inverted()).to_quaternion()
    if style!='ranged':
        points=[(-.12,cy-.21,front-.012),(0,cy-.235,front+.01),(.12,cy-.17 if style=='speed' else cy-.20,front-.012)]
        curve('confident smile',points,.017,'black','head','head')

def body(style):
    color={'tank':'teal','speed':'coral','ranged':'indigo'}[style]
    ell('flexible waist coupling',(0,1.015,0),(.20,.10,.17),'rubber','pelvis','torso')
    # A coherent shaped pelvis shell covers the central drive joint; side hip bearings stay visible.
    ell('pelvis armour bridge',(0,.915,.025),(.32 if style=='tank' else .255,.143,.19),color,'pelvis','torso',True)
    curve('pelvis service seam',[(-.17,.906,.174),(0,.87,.214),(.17,.906,.174)],.013,'brass','pelvis','torso')
    if style=='tank':
        lathe('continuous boiler armour',[(1,.23),(1.03,.35),(1.10,.45),(1.36,.57),(1.58,.56),(1.72,.45),(1.77,.22)],.70,color,'chest','torso');ring('boiler waist seam',(0,1.065,0),.33,.026,'brass','chest','torso',(0,1,0));ell('curved breastplate',(0,1.41,.304),(.43,.32,.13),color,'chest','torso',True,40,24)
        cyl('boiler service hatch',(0,1.40,.387),(0,1.40,.438),.212,'brass','chest','torso',48);cyl('ivory pressure gauge',(0,1.40,.438),(0,1.40,.449),.174,'ivory','chest','torso',48)
        for i in range(7):
            t=math.radians(-65+i*22);x=math.sin(t)*.143;y=1.40+math.cos(t)*.143;curve('gauge tick '+str(i),[(x,y,.453),(x*.86,1.40+(y-1.40)*.86,.454)],.0045,'black','chest','torso')
        curve('pressure needle',[(0,1.40,.459),(-.069,1.48,.460)],.009,'red','chest','torso');ell('needle pivot',(0,1.4,.463),(.018,.018,.009),'brass','chest','torso')
        for s in [-1,1]:
            curve('forged boiler strap '+str(s),[(s*.30,1.70,.24),(s*.39,1.50,.335),(s*.30,1.13,.26)],.031,'brass','chest','torso');box('rear heat exchanger '+str(s),(s*.21,1.47,-.36),(.17,.36,.15),'steel','chest','torso',.05)
        ell('upper gorget undercut',(0,1.687,.23),(.447,.101,.154),'rubber','chest','torso')
        ell('overlapping knight gorget',(0,1.715,.225),(.453,.10,.159),color,'chest','torso',True,40,20)
        ell('helmet shell',(0,2.07,0),(.53,.395,.37),color,'head','head',True,48,32);ell('helmet face recess',(0,2.085,.276),(.45,.268,.125),'rubber','head','head');ell('warm face plate',(0,2.071,.32),(.395,.24,.095),'ivory','head','head',True);eyes(style,2.11,.363,.195)
        curve('dark inset visor frame',[(-.445,2.20,.30),(-.26,2.26,.366),(0,2.285,.363),(.26,2.26,.366),(.445,2.20,.30)],.045,'rubber','head','head')
        curve('helmet proud brow',[(-.435,2.235,.30),(-.22,2.293,.365),(0,2.31,.36),(.22,2.293,.365),(.435,2.235,.30)],.041,color,'head','head')
        for s in [-1,1]:
            ell('helmet ear cap '+str(s),(s*.493,2.07,.005),(.072,.18,.18),'brass','head','head');ell('cheek dark inset '+str(s),(s*.378,1.973,.29),(.116,.122,.068),'rubber','head','head');ell('cheek armour '+str(s),(s*.399,1.976,.293),(.098,.125,.068),color,'head','head',True)
        key((0,2.465,-.06),.09)
    elif style=='speed':
        lathe('racer aerodynamic shell',[(1.02,.17),(1.07,.25),(1.26,.34),(1.49,.345),(1.67,.245),(1.70,.10)],.65,color,'chest','torso');ell('ivory racing bib',(0,1.43,.211),(.225,.255,.065),'ivory','chest','torso',True);curve('racing stripe',[(0,1.19,.231),(0,1.38,.283),(0,1.65,.216)],.025,'brass','chest','torso')
        for s in [-1,1]:curve('racer side seam '+str(s),[(s*.19,1.10,.10),(s*.29,1.38,.15),(s*.23,1.60,.12)],.015,'ivory','chest','torso')
        ell('helmet outer shell',(0,2.005,-.01),(.44,.38,.35),color,'head','head',True,48,28);ell('round friendly face',(0,2.02,.282),(.355,.279,.083),'ivory','head','head',True);eyes(style,2.06,.337,.175)
        curve('raised left brow',[(-.32,2.23,.36),(-.19,2.285,.39),(-.065,2.24,.382)],.026,color,'head','head');curve('low right brow',[(.07,2.22,.389),(.20,2.24,.385),(.32,2.205,.35)],.024,color,'head','head')
        for s in [-1,1]:ell('brass headphone '+str(s),(s*.414,2.02,0),(.065,.14,.14),'brass','head','head');box('streamlined helmet wing '+str(s),(s*.443,2.07,-.11),(.056,.115,.24),'ivory','head','head',.025)
        key((0,2.385,-.035),.082)
    else:
        lathe('ranger chest shell',[(1.04,.19),(1.085,.33),(1.28,.405),(1.51,.42),(1.66,.32),(1.72,.15)],.70,color,'chest','torso');ell('owl feather breastplate',(0,1.41,.266),(.282,.263,.071),'ivory','chest','torso',True,36,24)
        for x in [-.115,0,.115]:curve('engraved breast feather '+str(x),[(x-.043,1.43,.334),(x,1.39,.344),(x+.043,1.43,.334)],.008,'brass','chest','torso')
        ell('owl rounded head',(0,2.055,-.01),(.515,.352,.33),color,'head','head',True,48,28)
        for s in [-1,1]:ell('owl ivory facial disc '+str(s),(s*.236,2.085,.268),(.248,.267,.095),'ivory','head','head',True,36,24);ell('soft owl ear tuft '+str(s),(s*.402,2.325,-.005),(.102,.153,.08),color,'head','head',True,24,16)
        eyes(style,2.105,.337,.238);ell('owl brass beak',(0,1.941,.362),(.057,.098,.064),'brass','head','head',False,24,16);key((0,2.405,-.12),.073)

def limbs(style,info):
    shoulder,sy,elbow,wrist,hip=info;color={'tank':'teal','speed':'coral','ranged':'indigo'}[style]
    for side,sign in [('L',-1),('R',1)]:
        slot='arm'+side;upper='shoulder'+side;lower='elbow'+side;hand='hand'+side;a=(sign*shoulder,sy,0);b=(sign*elbow[0],elbow[1],elbow[2]);w=(sign*wrist[0],wrist[1],wrist[2]);g=world(hand)
        joint('shoulder bearing '+side,a,.145 if style=='tank' else .11,upper,slot);cap=.237 if style=='tank' else .156 if style=='speed' else .184
        ell('rounded shoulder armour '+side,(a[0],a[1]+.018,a[2]),(cap,cap*.85,cap*.95),color,upper,slot,True);cyl('upper arm piston '+side,(a[0],a[1]-.10,a[2]),b,.073 if style=='tank' else .052,'steel',upper,slot)
        if style=='tank':
            ell('pauldron shadow seam '+side,(a[0],a[1]+.129,a[2]),(.266,.083,.246),'rubber',upper,slot)
            ell('overlapping T3 shoulder plate '+side,(a[0],a[1]+.158,a[2]),(.279,.095,.257),color,upper,slot,True)
        ell('upper arm clay sleeve '+side,tuple((a[i]+b[i])*.5 for i in range(3)),(.14 if style=='tank' else .095,.18,.12),color,upper,slot,True);joint('elbow ball '+side,b,.11 if style=='tank' else .083,lower,slot)
        ell('cast forearm '+side,tuple(b[i]*.38+w[i]*.62 for i in range(3)),(.185 if style=='tank' else .113,.205 if style=='tank' else .168,.16 if style=='tank' else .114),color,lower,slot,True);ring('wrist cuff '+side,w,.115 if style=='tank' else .081,.027,'brass','wrist'+side,slot,(0,1,0))
        ell('mitt palm '+side,(g[0],g[1],g[2]-.015),(.118 if style=='tank' else .092,.105,.077),'rubber',hand,slot)
        for i in range(3):ell('ivory knuckle '+side+str(i),(g[0]+(i-1)*.049,g[1]-.031,g[2]+.055),(.024,.041,.029),'ivory',hand,slot,False,16,10)
        ell('thumb '+side,(g[0]-sign*.084,g[1]+.035,g[2]+.033),(.04,.058,.046),'brass',hand,slot,False,20,12)
        leg='leg'+side;h=world('hip'+side);k=world('knee'+side);a=world('ankle'+side)
        joint('hip ball '+side,h,.11,'hip'+side,leg);cyl('femur piston '+side,h,k,.071,'steel','hip'+side,leg);ell('rounded thigh '+side,tuple(h[i]*.53+k[i]*.47 for i in range(3)),(.158 if style=='tank' else .101,.19,.139 if style=='tank' else .10),color,'hip'+side,leg,True)
        joint('articulated knee '+side,k,.097 if style=='tank' else .076,'knee'+side,leg);ell('knee shield '+side,(k[0],k[1],k[2]+.081),(.118 if style=='tank' else .083,.102,.052),'brass','knee'+side,leg);cyl('shin mechanical core '+side,k,a,.065,'steel','knee'+side,leg)
        ell('curved shin guard '+side,tuple(k[i]*.46+a[i]*.54 for i in range(3)),(.165 if style=='tank' else .105,.175,.13 if style=='tank' else .096),color if style!='ranged' else 'ivory','knee'+side,leg,True);joint('ankle ball '+side,a,.074,'ankle'+side,leg)
        width=.23 if style=='tank' else .151 if style=='speed' else .19;ell('designer toy boot '+side,(a[0],.132,.132),(width,.132,.30 if style=='tank' else .252),color if style!='speed' else 'ivory','ankle'+side,leg,True)
        if style=='speed':
            for z in [-.02,.235]:
                axle=('wheelFront' if z>0 else 'wheelBack')+side;node(axle,(a[0],.095,z),'wheel'+side)
                cyl('roller tire '+side+str(z),(a[0]-.162,.095,z),(a[0]+.162,.095,z),.091,'rubber',axle,leg)
                for s in [-1,1]:cyl('roller brass hub '+side+str(z)+str(s),(a[0]+s*.163,.095,z),(a[0]+s*.172,.095,z),.061,'brass',axle,leg)
        else:
            box('flat rubber sole '+side,(a[0],.029,.127),(width*1.93,.05,.58 if style=='tank' else .48),'rubber','ankle'+side,leg,.025);curve('boot toe seam '+side,[(a[0]-width*.68,.12,.33),(a[0],.092,.413 if style=='tank' else .355),(a[0]+width*.68,.12,.33)],.014,'brass','ankle'+side,leg)

def hammer():
    x,y,z=world('handR');node('weaponR',(x,y,z),'handR');cyl('hammer forged handle',(x,y-.20,z),(x,y+.58,z),.043,'steel','weaponR','weapon')
    for h in [-.12,-.065,-.01,.045,.10]:ring('hammer grip wrap '+str(h),(x,y+h,z),.047,.013,'rubber','weaponR','weapon',(0,1,0))
    box('hammer forged head',(x,y+.55,z),(.65,.29,.29),'steel','weaponR','weapon',.045);box('hammer striking face',(x,y+.55,z+.159),(.54,.255,.065),'edge','weaponR','weapon',.020);box('hammer rear peen',(x,y+.55,z-.176),(.37,.20,.11),'brass','weaponR','weapon',.03)
    for sy in [-1,1]:box('hammer face retaining rail '+str(sy),(x,y+.55+sy*.124,z+.139),(.59,.034,.083),'steel','weaponR','weapon',.01)
    for sx in [-1,1]:cyl('hammer binding bolt '+str(sx),(x+sx*.205,y+.55,z+.152),(x+sx*.205,y+.55,z+.178),.025,'brass','weaponR','weapon',12)
    mark('weaponStrikeR','weaponR',(x,y+.55,z+.194),(0,0,1));mark('weaponHeelR','weaponR',(x,y+.425,z+.194));mark('weaponTipR','weaponR',(x,y+.675,z+.194))
    for sx in [-1,1]:
        for sy in [-1,1]:mark('hammerFace'+str(sx)+'_'+str(sy),'weaponR',(x+sx*.27,y+.55+sy*.1275,z+.194),(0,0,1))
    return {'kind':'hammer','node':'weaponR','strikeMarkers':['weaponStrikeR'],'strikeRadius':130,'strikeHalf':[270,127.5,32.5]}
def blades():
    for side in ['L','R']:
        x,y,z=world('hand'+side);parent='weapon'+side;node(parent,(x,y,z),'hand'+side);cyl('blade wrapped tang '+side,(x,y-.16,z),(x,y+.17,z),.036,'rubber',parent,'weapon');box('blade crossguard '+side,(x,y+.155,z),(.245,.045,.085),'brass',parent,'weapon',.018)
        vs=[];fs=[]
        for yy,half in [(.18,.053),(.66,.080),(.86,.027),(.95,.002)]:
            for xx,zz in [(-half,0),(0,-.032),(half,0),(0,.032)]:vs.append(tuple(xyz((x+xx,y+yy,z+zz))))
        for j in range(3):
            for i in range(4):fs.append((j*4+i,j*4+(i+1)%4,(j+1)*4+(i+1)%4,(j+1)*4+i))
        fs +=[(3,2,1,0),(12,13,14,15)];me=bpy.data.meshes.new('blade edge '+side);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('blade edge '+side,me);bpy.context.collection.objects.link(o);tag(o,'honed dangerous blade '+side,'edge',parent,'weapon')
        for p in o.data.polygons:p.use_smooth=False
        # A recessed dark fuller distinguishes the steel core from the polished cutting bevels.
        curve('dark forged blade fuller '+side,[(x,y+.255,z+.034),(x,y+.58,z+.035),(x,y+.80,z+.031)],.013,'steel',parent,'weapon')
        cyl('blade pommel '+side,(x,y-.17,z),(x,y-.20,z),.053,'brass',parent,'weapon')
        for s in [-1,1]:ell('guard curled end '+side+str(s),(x+s*.116,y+.164,z),(.028,.042,.031),'brass',parent,'weapon',False,16,10)
        mark('weaponStrike'+side,parent,(x,y+.66,z+.032),(0,0,1));mark('weaponHeel'+side,parent,(x,y+.20,z));mark('weaponTip'+side,parent,(x,y+.95,z))
    return {'kind':'paired_blades','node':'weaponR','leftNode':'weaponL','strikeMarkers':['weaponStrikeL','weaponStrikeR'],'strikeRadius':26}

def cannon():
    node('backpack',(0,1.46,-.26),'chest');box('backpack power shell',(0,1.47,-.347),(.55,.50,.25),'ivory','backpack','torso',.095,True)
    for s in [-1,1]:curve('shoulder harness '+str(s),[(s*.24,1.19,-.31),(s*.36,1.50,-.25),(s*.31,1.67,.02)],.046,'brass','backpack','torso');cyl('backpack capacitor '+str(s),(s*.16,1.30,-.49),(s*.16,1.65,-.49),.061,'steel','backpack','torso')
    node('cannonDeploy',(.79,1.59,-.24),'backpack');cyl('load-bearing bridge',(.18,1.62,-.34),(.79,1.62,-.24),.06,'brass','backpack','torso');cyl('outer lift column',(.79,1.58,-.24),(.79,1.78,-.24),.075,'steel','cannonDeploy','weapon')
    node('cannonYaw',(.79,1.77,-.24),'cannonDeploy');cyl('rotating turret bearing',(.79,1.737,-.24),(.79,1.80,-.24),.143,'brass','cannonYaw','weapon');node('cannonPitch',(.79,1.835,-.24),'cannonYaw')
    for s in [-1,1]:box('yoke cheek '+str(s),(.79+s*.147,1.84,-.24),(.055,.205,.205),'steel','cannonYaw','weapon',.025);cyl('pitch trunnion '+str(s),(.79+s*.148,1.84,-.24),(.79+s*.187,1.84,-.24),.073,'brass','cannonPitch','weapon')
    box('cannon cast receiver',(.79,1.86,-.33),(.265,.23,.35),'indigo','cannonPitch','weapon',.065,True);box('cannon armoured eyebrow',(.79,1.985,-.24),(.31,.062,.33),'ivory','cannonPitch','weapon',.025)
    node('cannonRecoil',(.79,1.85,-.19),'cannonPitch');cyl('short pressure barrel',(.79,1.85,-.23),(.79,1.85,.29),.10,'steel','cannonRecoil','weapon')
    for z in [-.07,.08]:ring('cannon recoil collar '+str(z),(.79,1.85,z),.105,.024,'brass','cannonRecoil','weapon')
    cyl('cannon vented muzzle',(.79,1.85,.255),(.79,1.85,.355),.137,'edge','cannonRecoil','weapon');cyl('cannon black bore',(.79,1.85,.355),(.79,1.85,.357),.085,'black','cannonRecoil','weapon')
    for s in [-1,1]:cyl('recoil return rod '+str(s),(.79+s*.12,1.83,-.33),(.79+s*.12,1.83,.045),.021,'brass','cannonPitch','weapon')
    curve('flexible power cable',[(.31,1.44,-.48),(.56,1.47,-.56),(.76,1.65,-.47),(.79,1.80,-.46)],.024,'rubber','backpack','torso');node('cannonMuzzle',(.79,1.85,.357),'cannonRecoil');mark('cannonMuzzle','cannonMuzzle',(.79,1.85,.357),(0,0,1))
    for side,s in [('L',-1),('R',1)]:
        suffix='L' if side=='L' else '';p=(s*.442,1.035,-.10);node('backupHolster'+suffix,p,'pelvis');parent='backupGun'+suffix;node(parent,p,'root')
        box('leather holster '+side,(p[0],p[1]-.043,p[2]-.029),(.155,.215,.15),'rubber','backupHolster'+suffix,'torso',.035)
        x,y,z=p;box('sidearm compact receiver '+side,(x,y+.036,z+.045),(.092,.098,.18),'steel',parent,'weapon',.026);cyl('sidearm short barrel '+side,(x,y+.037,z+.06),(x,y+.037,z+.222),.033,'edge',parent,'weapon');cyl('sidearm bore '+side,(x,y+.037,z+.222),(x,y+.037,z+.224),.023,'black',parent,'weapon')
        box('sidearm ivory grip '+side,(x,y-.055,z-.012),(.076,.127,.075),'ivory',parent,'weapon',.028);box('sidearm rear sight '+side,(x,y+.094,z-.006),(.073,.019,.057),'brass',parent,'weapon',.006)
        mark('backupMuzzle'+suffix,parent,(x,y+.037,z+.224),(0,0,1));mark('backupGrip'+suffix,parent,p)
        o=N[parent];o.rotation_mode='QUATERNION';o.rotation_quaternion=(C@Matrix.Rotation(math.pi/2,4,'X')@C.inverted()).to_quaternion()
    return {'kind':'shoulder_cannon','node':'cannonPitch','muzzleMarker':'cannonMuzzle','backupNode':'backupGun','backupMuzzleMarker':'backupMuzzle','leftBackupNode':'backupGunL','leftBackupMuzzleMarker':'backupMuzzleL'}

def uv_and_batch():
    for o in list(bpy.context.scene.objects):
        if o.type!='MESH' or not o.get('mk_surface'):continue
        if not o.data.uv_layers:
            bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
    groups={}
    for o in list(bpy.context.scene.objects):
        if o.type=='MESH' and o.get('mk_surface')=='protected':groups.setdefault((o.parent.name,o.data.materials[0].name,o['mk_slot']),[]).append(o)
    for (parent,material,slot),items in groups.items():
        if len(items)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in items:o.select_set(True)
        bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join();o=bpy.context.object;o.name=parent+'__'+material;o['mk_surface_id']=STYLE+'.'+o.name;o['mk_slot']=slot
    # Tangents must survive glTF export even on bevel/cylinder cap ngons.
    for o in list(bpy.context.scene.objects):
        if o.type!='MESH' or not o.get('mk_surface'):continue
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        tri=o.modifiers.new('Portable tangent topology','TRIANGULATE');tri.keep_custom_normals=True;bpy.ops.object.modifier_apply(modifier=tri.name)
def collision():
    groups={}
    for o in bpy.context.scene.objects:
        if o.type!='MESH' or o.get('mk_slot') not in ['head','torso','armL','armR','legL','legR']:continue
        parent=N['head'] if o.parent.name.startswith(('pupil','lid')) else o.parent;groups.setdefault((o['mk_slot'],parent.name),[]).append(o)
    out=[]
    for (slot,parent),objects in groups.items():
        inv=N[parent].matrix_world.inverted();points=[game(inv@(o.matrix_world@v.co)) for o in objects for v in o.data.vertices];lo=[min(p[i] for p in points)*1000 for i in range(3)];hi=[max(p[i] for p in points)*1000 for i in range(3)]
        out.append({'slot':slot,'node':parent,'shape':'box','center':[round((lo[i]+hi[i])*.5,4) for i in range(3)],'half':[round((hi[i]-lo[i])*.5,4) for i in range(3)]})
    return out
def scene_nodes():
    bpy.context.view_layer.update();out={}
    for name,o in N.items():
        local=o.matrix_local;q=(C.inverted()@local.to_quaternion().to_matrix().to_4x4()@C).to_quaternion();out[name]={'parent':o.parent.name if o.parent else None,'position':mm(local.translation),'quaternion':[round(q.x,8),round(q.y,8),round(q.z,8),round(q.w,8)]}
    return out
def studio(lineup=False):
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16 if args.quick else 40;scene.cycles.use_denoising=True;scene.render.resolution_x=1800 if lineup else 880;scene.render.resolution_y=1000 if lineup else 1060;scene.render.resolution_percentage=70 if args.quick else 100
    scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.76,.68,.51,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45;scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    mat=bpy.data.materials.new('warm seamless stage');mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.58,.48,.32,1);bs.inputs['Roughness'].default_value=.78
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.006));bpy.context.object.name='REVIEW_GROUND';bpy.context.object.data.materials.append(mat)
    for name,loc,energy,size,color in [('key',(-3.8,5,4.5),850,4,(1,.86,.67)),('fill',(4,3,3),550,4.5,(.74,.86,1)),('rim',(0,4,-3),950,3,(1,.87,.65))]:
        d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new('REVIEW_'+name,d);bpy.context.collection.objects.link(o);o.location=xyz(loc);o.rotation_euler=(xyz((0,1.2,0))-o.location).to_track_quat('-Z','Y').to_euler()
    d=bpy.data.cameras.new('review camera');d.type='ORTHO';d.ortho_scale=7.5 if lineup else 3.1;o=bpy.data.objects.new('REVIEW_CAMERA',d);bpy.context.collection.objects.link(o);scene.camera=o;o.location=xyz((0 if lineup else 3.7,2.4 if lineup else 2.6,9 if lineup else 7));o.rotation_euler=(xyz((0,1.25,0))-o.location).to_track_quat('-Z','Y').to_euler();return o
def export_hero(style,weapon):
    id,label=HEROES[style];bpy.context.view_layer.update();uv_and_batch();proxies=collision();nodes=scene_nodes();meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('mk_surface')]
    coords=[game(o.matrix_world@v.co) for o in meshes for v in o.data.vertices];bounds={'min':[min(p[i] for p in coords) for i in range(3)],'max':[max(p[i] for p in coords) for i in range(3)]};triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
    path=OUT/(id+'.t3.glb');bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        if o.name in N or o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=N['root'];bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_apply=True,export_materials='EXPORT',export_animations=False,export_tangents=True)
    studio();bpy.ops.wm.save_as_mainfile(filepath=str(SRC/(id+'.t3.blend')))
    record={'id':id,'style':style,'label':label,'modelUrl':'/bots-art/3d/remaster-v7/'+path.name,'sha256':sha(path),'bytes':path.stat().st_size,'triangles':triangles,'boundsMetres':bounds,'nodes':nodes,'proxies':proxies,'markers':dict(MARKERS),'legKind':{'left':'wheel' if style=='speed' else 'foot','right':'wheel' if style=='speed' else 'foot'},'weapon':weapon,'materialMaps':{'normal':'textures/clay-normal.png','roughness':'textures/clay-roughness.png'}}
    (SRC/(id+'.rig.json')).write_text(json.dumps(record,indent=2));print('HERO_EXPORTED',id,triangles,path,flush=True);return record
def review(record):
    reset();bpy.ops.import_scene.gltf(filepath=str(OUT/(record['id']+'.t3.glb')));cam=studio();scene=bpy.context.scene
    for name,loc in [('three-quarter',(3.7,2.6,7)),('front',(0,2.05,7))]:
        cam.location=xyz(loc);cam.rotation_euler=(xyz((0,1.26,0))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(SRC/'review'/(record['id']+'-'+name+'.png'));bpy.ops.render.render(write_still=True);print('REVIEW_READY',scene.render.filepath,flush=True)
def lineup(records):
    reset()
    for i,style in enumerate(['tank','speed','ranged']):
        if style not in records:return
        previous=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(OUT/(records[style]['id']+'.t3.glb')));imported=[o for o in bpy.context.scene.objects if o not in previous]
        for root in [o for o in imported if o.parent not in imported]:root.location.x=(i-1)*2.5
    studio(True);bpy.context.scene.render.filepath=str(SRC/'review'/'three-heroes-lineup.png');bpy.ops.render.render(write_still=True);bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'three-heroes-review.blend'))

manifestPath=OUT/'manifest.json';manifest=json.loads(manifestPath.read_text()) if manifestPath.exists() else {'version':'mk7-rig-pilot-1','assetVersion':'mk7-art-pilot-1','motionVersion':'mk7-motion-pilot-1','collisionVersion':'mk7-collision-pilot-1','presentationVersion':'mk7-presentation-pilot-1','units':'millimetres','glbUnits':'metres','up':'+Y','front':'+Z','status':'human-visual-review-pending','heroes':{}}
for style in HEROES:
    if args.hero not in ['all',style]:continue
    STYLE=style;reset();materials();info=skeleton(style);body(style);limbs(style,info);weapon=hammer() if style=='tank' else blades() if style=='speed' else cannon();record=export_hero(style,weapon);manifest['heroes'][style]=record;manifest['sourceSha256']=sha(Path(__file__));manifestPath.write_text(json.dumps(manifest,indent=2))
    if not args.no_render:review(record)
if args.hero=='all' and not args.no_render:lineup(manifest['heroes'])
manifest['textureHashes']={p.name:sha(p) for p in sorted((OUT/'textures').glob('*.png'))};manifestPath.write_text(json.dumps(manifest,indent=2));print('PILOT_READY',manifestPath,flush=True)
