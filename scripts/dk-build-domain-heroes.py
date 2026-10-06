"""Nine original, provisional domain studies. No network/provider calls.
Outputs are D:-only, never overwrite unless --replace; fronts face Blender -Y.
The source is editable and all gameplay capabilities remain in the simulation.
"""
import argparse, bpy, math, json, hashlib, sys
from pathlib import Path
from mathutils import Vector

parser=argparse.ArgumentParser()
parser.add_argument('--output',required=True)
parser.add_argument('--only',default='')
parser.add_argument('--replace',action='store_true')
parser.add_argument('--finish-existing',action='store_true',help='Room-study workflow only: revalidate and export the existing authored blend')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
OUT=Path(args.output)
assert OUT.drive.lower()=='d:', 'Assets and previews must remain on D:'
OUT.mkdir(parents=True,exist_ok=True)
P={
 'cream':('#fff0d4',0,.28),'ceramic':('#ead8b7',0,.25),'red':('#ae3025',.12,.24),
 'darkred':('#571e22',.12,.30),'charcoal':('#242b2d',.22,.30),'steel':('#b3c1bd',.8,.26),
 'brass':('#d3a45a',.76,.24),'copper':('#ad633e',.78,.30),'black':('#192321',.08,.34),
 'walnut':('#59392d',.05,.36),'wine':('#741d42',.25,.22),'rose':('#c37583',.1,.28),
 'sage':('#548f78',.08,.35),'leaf':('#287b56',.04,.36),'lime':('#adba42',0,.32),
 'mango':('#edb02d',.02,.23),'orange':('#df7826',.06,.27),'coral':('#dd7865',.06,.27),
 'turquoise':('#39a59d',.12,.22),'blue':('#78bcc2',.1,.26),'white':('#fff9e9',0,.24),
 'glass':('#dbeedc',0,.13),'grape':('#763455',.1,.26),
}
M={};root=None;UV_PROJECTION='smart';MAX_TRIANGLES=75000
def mat(key):
 if key in M:return M[key]
 hx,metal,rough=P[key];srgb=[int(hx[i:i+2],16)/255 for i in (1,3,5)];c=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in srgb]
 m=bpy.data.materials.new(key);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if key in ['red','ceramic','wine','mango','cream','coral']:p.inputs['Coat Weight'].default_value=.32;p.inputs['Coat Roughness'].default_value=.22
 if key=='glass':
  p.inputs['Alpha'].default_value=.18;m.diffuse_color=(*c,.18);m.surface_render_method='DITHERED';m.use_transparency_overlap=False
 M[key]=m;return m
def finish(o,name,color):
 o.name=name;o.parent=root;o.data.materials.append(mat(color))
 if o.type=='MESH':
  for f in o.data.polygons:f.use_smooth=True
 return o
def ell(name,p,s,color):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=p);o=bpy.context.object;o.scale=s;return finish(o,name,color)
def box(name,p,s,color,r=.02):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if r:
  b=o.modifiers.new('Rounded construction','BEVEL');b.width=r;b.segments=3;bpy.ops.object.modifier_apply(modifier=b.name)
 o.modifiers.new('Corner normals','WEIGHTED_NORMAL');return finish(o,name,color)
def cyl(name,p,r,d,color,r2=None):
 bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=r,radius2=r if r2 is None else r2,depth=d,location=p);return finish(bpy.context.object,name,color)
def tube(name,points,r,color):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=6;c.bevel_depth=r;c.bevel_resolution=2;s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
 for bp,p in zip(s.bezier_points,points):bp.co=p;bp.handle_left_type=bp.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);return finish(o,name,color)
def ring(name,p,r,color,thick=.014,axis='Z'):
 bpy.ops.mesh.primitive_torus_add(major_segments=40,minor_segments=8,location=p,major_radius=r,minor_radius=thick);o=bpy.context.object
 if axis=='Y':o.rotation_euler.x=math.pi/2
 return finish(o,name,color)
def lathe(name,profile,color,start=0,end=math.tau,steps=48):
 verts=[];faces=[]
 for radius,z in profile:
  for i in range(steps+1):
   a=start+(end-start)*i/steps;verts.append((radius*math.cos(a),radius*math.sin(a),z))
 for j in range(len(profile)-1):
  for i in range(steps):
   k=j*(steps+1)+i;faces.append((k,k+1,k+steps+2,k+steps+1))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);return finish(o,name,color)

def soft_profile(points):
 result=[]
 for i in range(len(points)-1):
  a,b,c,d=points[max(0,i-1)],points[i],points[i+1],points[min(len(points)-1,i+2)]
  for step in range(4):
   t=step/4
   result.append(tuple(.5*(2*b[k]+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t) for k in range(2)))
 result.append(points[-1]);return result
def pivot(name,p=(0,0,0),motion='rock',axis='Z',amount=.1,speed=1,work=False):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=root;o.location=p;o['dkMotion']=motion;o['dkAxis']=axis;o['dkAmount']=amount;o['dkSpeed']=speed;o['dkWorkOnly']=work;return o
def parent(o,p):
 bpy.context.view_layer.update();matrix=o.matrix_world.copy();o.parent=p;o.matrix_world=matrix;return o
def group_since(before,p):
 for o in set(bpy.context.scene.objects)-before:
  if o!=p:parent(o,p)
def plaque(label,p,w=.5,color='brass'):
 x,y,z=p;box('Engraved maker plaque',(x,y,z),(w,.015,.075),color,.014)
 # Deliberate embossed motif, no tiny unreadable generated lettering.
 for k in [-1,0,1]:ell('Maker seal',(x+k*.036,y-.011,z),(.009,.004,.015),'darkred' if color=='brass' else 'brass')
def bowl(p,s=.10,color='cream'):
 x,y,z=p;cyl('Glazed bowl',(x,y,z),s*.54,s*.65,color,s);ring('Bowl rim',(x,y,z+s*.34),s,color,thick=s*.06);cyl('Rich broth',(x,y,z+s*.29),s*.88,s*.025,'orange')
 for k in range(3):tube('Visible noodles',[(x-s*.45,y+(k-1)*s*.28,z+s*.32),(x,y+(k-1)*s*.28+s*.15,z+s*.37),(x+s*.45,y+(k-1)*s*.28,z+s*.32)],s*.035,'cream')
 ell('Scallion',(x+s*.15,y+s*.18,z+s*.38),(s*.19,s*.08,s*.04),'leaf')
def bottle(p,s=.1,color='wine'):
 x,y,z=p;cyl('Bottle body',(x,y,z+s*.75),s*.32,s*1.3,color);ell('Bottle shoulder',(x,y,z+s*1.35),(s*.32,s*.32,s*.30),color);cyl('Bottle neck',(x,y,z+s*1.72),s*.12,s*.55,color);cyl('Foil',(x,y,z+s*1.98),s*.132,s*.16,'brass');box('Bottle label',(x,y-s*.319,z+s*.79),(s*.40,.008,s*.52),'cream',s*.035)
def wineglass(p,s=.12):
 x,y,z=p;ell('Glass foot',(x,y,z),(.26*s,.26*s,.035*s),'glass');cyl('Glass stem',(x,y,z+s*.34),s*.027,s*.65,'brass');ell('Wine glass bowl',(x,y,z+s*.80),(s*.29,s*.29,s*.39),'glass');ell('Garnet wine',(x,y,z+s*.78),(s*.255,s*.255,s*.20),'wine');ring('Fine glass lip',(x,y,z+s*1.09),s*.205,'cream',thick=s*.012)
def leaf(p,s=.15,a=0,color='leaf'):
 o=ell('Sculpted leaf',p,(s,s*.31,s*.08),color);o.rotation_euler=(0,.25,a);return o
def palm(p,s=.5):
 x,y,z=p;tube('Palm trunk',[(x,y,z),(x+s*.06,y,z+s*.55),(x,y,z+s)],s*.034,'walnut')
 for i in range(7):
  a=i*math.tau/7;o=leaf((x+math.cos(a)*s*.18,y+math.sin(a)*s*.18,z+s),s*.33,a);o.rotation_euler.y=.22
def ant(p,s=.16,chef=True):
 x,y,z=p;ell('Ant abdomen',(x,y+.035,z+s*.38),(s*.30,s*.27,s*.33),'darkred');ell('Ant jacket',(x,y,z+s*.72),(s*.28,s*.22,s*.32),'red');ell('Ant head',(x,y-.01,z+s*1.20),(s*.32,s*.28,s*.31),'darkred')
 for side in [-1,1]:
  ell('Bright eye',(x+side*s*.12,y-s*.252,z+s*1.25),(s*.087,s*.031,s*.10),'cream');ell('Eye pupil',(x+side*s*.12,y-s*.280,z+s*1.25),(s*.039,s*.018,s*.056),'black')
  tube('Antenna',[(x+side*s*.14,y,z+s*1.4),(x+side*s*.25,y,z+s*1.69),(x+side*s*.35,y-.02,z+s*1.72)],s*.018,'black')
  for i in range(3):tube('Ant leg',[(x+side*s*.15,y+(i-1)*s*.14,z+s*.55),(x+side*s*.43,y+(i-1)*s*.15,z+s*.38),(x+side*s*.49,y+(i-1)*s*.16,z+s*.19)],s*.03,'black')
 if chef:
  cyl('Chef hat band',(x,y-.01,z+s*1.49),s*.26,s*.15,'cream')
  for dx in [-.16,0,.16]:ell('Chef hat puff',(x+dx*s,y-.01,z+s*1.63),(s*.18,s*.23,s*.18),'cream')
 box('Apron',(x,y-s*.21,z+s*.77),(s*.38,s*.06,s*.40),'cream',s*.04)

def brigade():
 cyl('Jar foot',(0,0,.075),.36,.09,'charcoal');ring('Foot brass bead',(0,0,.115),.357,'brass')
 # An open, sculpted jar, not an opaque cylinder hiding the miniature.
 lathe('Cutaway lacquer jar',[(.32,.11),(.40,.24),(.42,.63),(.37,.94),(.31,1.02)],'red',-.10,math.pi+.10)
 lathe('Cream ceramic interior',[(.304,.12),(.383,.24),(.398,.62),(.35,.92),(.295,1.01)],'ceramic',-.10,math.pi+.10)
 for side in [-1,1]:tube('Cutaway gold edge',[(side*.32,-.02,.14),(side*.405,-.04,.42),(side*.39,-.03,.78),(side*.31,-.03,1.01)],.010,'brass')
 cyl('Interior floor',(0,0,.16),.335,.045,'charcoal');box('Tiny tiled workbench',(0,.145,.45),(.60,.19,.32),'red',.023);box('Steel worktop',(0,.145,.626),(.64,.22,.037),'steel',.016)
 for x in [-.23,-.08,.08,.23]:box('Cabinet panel',(x,.037,.46),(.13,.013,.23),'darkred',.01);ell('Tiny brass knob',(x,.025,.50),(.012,.009,.012),'brass')
 bowl((.16,.13,.665),.087);cyl('Tiny stockpot',(-.19,.14,.696),.085,.13,'steel');ring('Pot rim',(-.19,.14,.764),.086,'brass',thick=.008)
 before=set(bpy.context.scene.objects);ant((-.15,-.07,.20),.19);chef=pivot('Working ant cook',(-.15,-.07,.3),'rock','Z',.035,.8);group_since(before,chef)
 before=set(bpy.context.scene.objects);ant((.18,-.13,.20),.15,False);bowl((.18,-.21,.43),.065);server=pivot('Ant bowl handoff',(.18,-.13,.3),'rock','X',.045,.6);group_since(before,server)
 cyl('Jar collar',(0,0,1.017),.33,.074,'red');cyl('Embossed lid',(0,0,1.078),.36,.060,'brass');ring('Lid bead',(0,0,1.112),.328,'red',thick=.012)
 ell('Pepper lid handle',(0,0,1.16),(.09,.043,.055),'red');leaf((.075,0,1.20),.04,.1)
 plaque('Kitchen brigade',(0,-.316,.12),.39)

def volcano():
 for x in [-.29,.29]:
  for y in [-.27,.27]:cyl('Levelling foot',(x,y,.05),.055,.08,'charcoal')
 lathe('Glazed volcanic body',[(.33,.09),(.40,.16),(.42,.39),(.32,.66),(.29,.80),(.34,.88)],'red')
 lathe('Charcoal lower glaze',[(.332,.10),(.404,.18),(.421,.32)],'charcoal')
 for a in [.25,1.30,2.3,3.30,4.6,5.4]:
  tube('Copper glaze rivulet',[(math.cos(a)*.33,math.sin(a)*.33,.85),(math.cos(a+.09)*.33,math.sin(a+.09)*.33,.64),(math.cos(a)*.405,math.sin(a)*.405,.40)],.018,'copper')
 ring('Working basin lip',(0,0,.90),.33,'steel',thick=.04);cyl('Dark cooking basin',(0,0,.868),.30,.03,'charcoal');cyl('Broth surface',(0,0,.885),.279,.012,'orange')
 for side in [-1,1]:tube('Copper carry handle',[(side*.32,.01,.73),(side*.44,.01,.77),(side*.43,.01,.88),(side*.33,.01,.87)],.033,'copper')
 plaque('Temperature',(0,-.396,.40),.22);knob=cyl('Heat control',(0,-.423,.36),.042,.025,'charcoal');knob.rotation_euler.x=math.pi/2
 cyl('Chimney',(.24,.23,.995),.035,.20,'copper');ring('Chimney collar',(.24,.23,1.10),.036,'brass',thick=.008)
 steam=pivot('Cooking steam',(.24,.23,1.13),'float','Z',.035,.8,True)
 for i in range(3):parent(ell('Soft steam',(.24+i*.016,.23,1.15+i*.055),(.030+i*.006,.027,.024),'cream'),steam)

def express():
 box('Lacquer serving island',(0,0,.11),(1.74,.76,.19),'darkred',.09);box('Tiled counter',(0,0,.221),(1.69,.73,.05),'cream',.08)
 for scale in [1,.83]:
  rail=ring('Oval brass railway',(0,0,.278),.66,'brass',thick=.012);rail.scale.y=.41*scale;rail.scale.x=scale
 for i in range(32):
  a=i*math.tau/32;o=box('Rail sleeper',(math.cos(a)*.60,math.sin(a)*.246,.253),(.073,.016,.012),'walnut',.003);o.rotation_euler.z=a
 box('Midnight kiosk',(0,.15,.43),(.52,.15,.31),'red',.022);box('Kiosk awning',(0,.07,.62),(.65,.30,.052),'charcoal',.025)
 for x in [-.21,0,.21]:box('Kiosk window',(x,.063,.48),(.13,.01,.11),'mango',.012)
 for x in [-.28,.28]:cyl('Lantern post',(x,.12,.67),.012,.14,'brass');ell('Paper lantern',(x,.12,.755),(.043,.043,.052),'cream')
 train=pivot('Ramyeon train',(.60,0,.31),'orbit','Z',0,.24);train['dkPhase']=0;train['dkRadiusX']=.60;train['dkRadiusZ']=.246;train['dkFaceOrbit']=True
 before=set(bpy.context.scene.objects);box('Train cab',(.60,0,.36),(.16,.11,.12),'red',.027);box('Cab roof',(.60,0,.44),(.19,.13,.03),'charcoal',.015);cyl('Train boiler',(.60,-.09,.35),.047,.13,'copper').rotation_euler.x=math.pi/2
 for x in [.535,.665]:
  for y in [-.05,.05]:o=cyl('Train wheel',(x,y,.31),.028,.018,'brass');o.rotation_euler.y=math.pi/2
 bowl((.60,.09,.40),.075);group_since(before,train)
 for phase in [2.05,4.1]:
  x,y=math.cos(phase)*.60,math.sin(phase)*.246;car=pivot('Bowl carriage',(x,y,.31),'orbit','Z',0,.24);car['dkPhase']=phase;car['dkRadiusX']=.60;car['dkRadiusZ']=.246;car['dkFaceOrbit']=True
  before=set(bpy.context.scene.objects);box('Enamel bowl carriage',(x,y,.33),(.16,.13,.045),'red',.023);bowl((x,y,.393),.068)
  for dx in [-.055,.055]:
   wheel=cyl('Carriage wheel',(x+dx,y,.30),.022,.015,'brass');wheel.rotation_euler.y=math.pi/2
  group_since(before,car)
 ant((-.14,.005,.56),.071)
 for x in [-.10,.03,.15]:bowl((x,-.03,.53),.04)
 plaque('Midnight express',(0,-.388,.125),.66)

def toucan():
 box('Curved tasting plinth',(0,0,.07),(.83,.65,.11),'sage',.12);box('Terrazzo tasting bar',(0,-.06,.19),(.80,.53,.15),'cream',.09)
 for i in range(12):ell('Terrazzo chip',((i%4-1.5)*.15,(i//4-1)*.12-.06,.268),(.018,.009,.002),['coral','sage','mango'][i%3])
 cyl('Brass perch',(-.21,.08,.43),.018,.38,'brass');tube('T-bar perch',[(-.34,.08,.56),(-.09,.08,.56)],.019,'brass')
 before=set(bpy.context.scene.objects);ell('Toucan velvet body',(-.21,.08,.66),(.15,.12,.19),'black');ell('Cream throat',(-.21,-.023,.735),(.09,.035,.10),'cream');ell('Toucan head',(-.21,.06,.87),(.135,.13,.13),'black');ell('Sculpted yellow beak',(-.12,-.105,.86),(.17,.11,.079),'mango');ell('Coral beak tip',(-.07,-.178,.86),(.10,.046,.061),'coral')
 for side in [-1,1]:ell('Toucan eye',(-.21+side*.09,-.014,.9),(.03,.02,.032),'white');ell('Pupil',(-.21+side*.09,-.031,.904),(.013,.009,.017),'black')
 tail=ell('Toucan tail',(-.23,.18,.50),(.075,.033,.15),'black');tail.rotation_euler.x=-.32
 bird=pivot('Toucan greeting',(-.21,.08,.56),'rock','X',.055,.7);group_since(before,bird)
 for i,col in enumerate(['mango','coral','sage']):
  x=.06+i*.105;cyl('Tasting tumbler',(x,-.12,.322),.039,.104,'glass');cyl('Fruit tasting',(x,-.12,.315),.034,.08,col);tube('Tasting straw',[(x,-.12,.34),(x,-.12,.41),(x+.021,-.12,.423)],.004,'cream')
 leaf((.23,.13,.31),.12,.5);plaque('Toucan tasting club',(0,-.336,.14),.36)

def orbit_blender():
 box('Coral blender cabinet',(0,0,.36),(.72,.66,.62),'coral',.13);box('Cream cabinet foot',(0,0,.07),(.75,.69,.095),'cream',.08)
 for x in [-.22,0,.22]:ell('Brass control',(x,-.328,.54),(.043,.023,.043),'brass')
 cyl('Motor collar',(0,0,.738),.225,.16,'sage');ring('Motor bead',(0,0,.83),.24,'brass',thick=.018)
 lathe('Blending glass',[(.18,.84),(.23,.88),(.25,1.17),(.21,1.25)],'glass');cyl('Fruit smoothie',(0,0,.96),.19,.21,'mango',.215);ring('Chamber lip',(0,0,1.255),.216,'brass',thick=.018);ell('Chamber cap',(0,0,1.275),(.233,.233,.044),'cream');ell('Leaf lid handle',(0,0,1.337),(.065,.026,.033),'sage')
 orb=pivot('Fruit turning inside the blender',(0,0,1.04),'spin','Z',0,2.8);orb['dkAnimateOnlyWorking']=True
 for i,col in enumerate(['coral','lime','mango']):
  a=i*math.tau/3;parent(ell('Fruit inside the glass',(math.cos(a)*.13,math.sin(a)*.13,1.09),(.041,.041,.044),col),orb)
 parent(box('Working blender blade',(0,0,.87),(.28,.025,.012),'steel',.01),orb)
 tube('Sculpted citrus handle',[(.25,.12,.88),(.40,.12,.95),(.40,.12,1.16),(.23,.12,1.21)],.025,'sage');plaque('Fruit orbit',(0,-.34,.28),.33)

def lagoon():
 box('Lagoon base',(0,0,.07),(1.69,.77,.12),'sage',.13)
 # A large mango shell opens toward the viewer, with a sculpted peel around it.
 shell=lathe('Mango shell',soft_profile([(.35,.12),(.54,.28),(.59,.66),(.51,1.09),(.27,1.36),(.01,1.44)]),'mango',0,math.pi);shell.scale.x=1.32;shell.scale.y=.63
 inner=lathe('Golden mango interior',soft_profile([(.32,.13),(.50,.30),(.55,.67),(.47,1.07),(.25,1.33),(.01,1.39)]),'orange',0,math.pi);inner.scale.x=1.32;inner.scale.y=.63
 for side in [-1,1]:tube('Polished mango cut edge',[(side*.46,-.008,.16),(side*.70,-.008,.36),(side*.75,-.008,.67),(side*.62,-.008,1.1),(side*.32,-.008,1.36),(0,-.008,1.43)],.013,'mango')
 ell('Turquoise lagoon',(0,0,.21),(.76,.33,.085),'turquoise');ell('Sandy island',(.10,.02,.29),(.38,.23,.065),'cream');box('Tiny beach bar',(.17,.08,.41),(.31,.18,.18),'coral',.025);box('Curved cabana roof',(.17,.08,.525),(.39,.27,.045),'sage',.04)
 for x in [.055,.17,.285]:box('Cabana window',(x,-.016,.455),(.066,.012,.06),'cream',.008)
 for i in range(5):box('Striped tropical awning',(.025+i*.074,-.035,.545),(.035,.18,.027),'cream',.014)
 box('Fruit bar deck',(.16,-.05,.325),(.42,.24,.03),'walnut',.015)
 for i in range(6):box('Deck plank',(-.015+i*.069,-.05,.344),(.06,.22,.008),'ceramic',.004)
 for x in [.075,.23]:cyl('Tiny bar stool',(x,-.15,.383),.026,.016,'coral');cyl('Stool stem',(x,-.15,.36),.006,.034,'brass')
 for i in range(7):
  x=-.46+i*.035;y=.16+(i%2)*.04;leaf((x,y,.33+(i%3)*.025),.075,i*.82,'leaf' if i%2 else 'lime')
 for x,y in [(-.34,-.02),(.46,.04),(.40,.20)]:
  ell('Smooth island stone',(x,y,.33),(.053,.032,.036),'cream')
  leaf((x,y,.38),.057,.8,'lime')
 tube('Island bunting',[(-.23,.10,.69),(.02,.10,.58),(.44,.10,.62)],.003,'cream')
 for i in range(5):
  x=-.16+i*.13;box('Tiny festival pennant',(x,.099,.58+abs(x-.10)*.15),(.037,.006,.045),'coral' if i%2 else 'mango',.004)
 palm((-.25,.11,.31),.46);palm((.43,.10,.31),.32);tube('Island waterfall',[(-.43,.16,.60),(-.43,.09,.45),(-.48,0,.25)],.034,'blue')
 boat=pivot('Lagoon sailboat',(-.61,0,.28),'orbit','Z',0,.13);boat['dkPhase']=math.pi;boat['dkRadiusX']=.61;boat['dkRadiusZ']=.245;boat['dkFaceOrbit']=True
 before=set(bpy.context.scene.objects);ell('Little coral boat',(-.61,0,.27),(.09,.03,.022),'coral');tube('Sailboat mast',[(-.61,0,.28),(-.61,0,.40)],.004,'brass');box('Linen sail',(-.61,.018,.354),(.006,.054,.067),'cream',.004);group_since(before,boat)
 for phase in [0,1,2]:
  tube('Lagoon ripple',[(math.cos(a)*(.63-phase*.035),math.sin(a)*(.27-phase*.02),.258) for a in [3.5,3.7,3.9,4.1]],.003,'cream')
 leaf((.14,.10,1.42),.20,.25);plaque('Mango lagoon',(0,-.39,.07),.46)

def decanter():
 box('Walnut tasting tray',(0,0,.055),(.81,.64,.08),'walnut',.055);box('Brass inlay',(0,0,.102),(.70,.54,.012),'brass',.07)
 lathe('Crystal decanter',[(.06,.12),(.27,.17),(.30,.30),(.24,.49),(.10,.62),(.057,.79),(.067,.88)],'glass')
 for a in [0,math.pi/2,math.pi,3*math.pi/2]:tube('Fine crystal engraving',[(math.cos(a)*r,math.sin(a)*r,z) for r,z in [(.23,.17),(.30,.30),(.24,.49),(.10,.62),(.057,.79),(.067,.88)]],.0028,'cream')
 ring('Decanter foot',(0,0,.144),.22,'cream',thick=.007);ring('Crystal rim',(0,0,.88),.068,'brass',thick=.009)
 lathe('Wine resting in the decanter',[(.06,.145),(.25,.185),(.28,.295),(.27,.35)],'wine');cyl('Level wine surface',(0,0,.35),.27,.006,'wine')
 wineglass((.25,-.15,.12),.16);cyl('Tasting candle',(-.29,.15,.18),.032,.13,'cream')
 flame=pivot('Small tasting candle flame',(-.29,.15,.258),'rock','Y',.035,.8);parent(ell('Candle flame',(-.29,.15,.263),(.011,.010,.026),'mango'),flame);plaque('Midnight decanter',(0,-.321,.057),.37)

def orrery():
 box('Wine cabinet',(0,0,.43),(.79,.68,.70),'walnut',.065);box('Limestone serving top',(0,0,.82),(.85,.72,.08),'cream',.07)
 for x in [-.32,.32]:box('Brass cabinet upright',(x,-.336,.43),(.018,.018,.57),'brass',.006)
 for x in [-.17,.17]:
  box('Burgundy door',(x,-.341,.39),(.28,.018,.40),'wine',.03);ell('Cabinet knob',(x,-.358,.55),(.023,.015,.023),'brass')
 cyl('Tasting carousel spindle',(0,.11,1.05),.035,.38,'brass')
 turn=pivot('Supported bottle carousel',(0,.11,1.02),'spin','Z',0,.20);turn['dkAnimateOnlyWorking']=True;before=set(bpy.context.scene.objects)
 cyl('Walnut rotating bottle shelf',(0,.11,1.01),.29,.035,'walnut');ring('Brass shelf rim',(0,.11,1.03),.29,'brass',thick=.012)
 for i in range(6):
  angle=i*math.tau/6;bottle((math.cos(angle)*.20,.11+math.sin(angle)*.20,1.03),.10,'wine' if i%2 else 'leaf')
 group_since(before,turn)
 for x in [-.19,.19]:
  tube('Working wine tap',[(x,-.02,.94),(x,-.23,.94),(x,-.24,.88)],.014,'brass');ell('Tap handle',(x,-.02,.995),(.018,.024,.037),'wine');wineglass((x,-.23,.865),.10)
 plaque('Sommelier orrery',(0,-.35,.70),.38)

def vineyard():
 box('Stone vineyard base',(0,0,.065),(1.69,.78,.11),'ceramic',.09)
 # Bottle silhouette is a framed cutaway, so its landscape reads at playing size.
 shell=lathe('Cutaway emerald bottle',soft_profile([(.48,.14),(.53,.23),(.53,1.08),(.35,1.26),(.15,1.38),(.15,1.64)]),'sage',0,math.pi);shell.scale.x=1.33;shell.scale.y=.62
 for side in [-1,1]:tube('Cutaway brass edge',[(side*.64,0,.16),(side*.70,0,.38),(side*.70,0,1.05),(side*.45,0,1.27),(side*.20,0,1.4),(side*.20,0,1.63)],.011,'brass')
 cyl('Bottle collar',(0,0,1.65),.20,.12,'wine');cyl('Bottle cork',(0,0,1.735),.17,.06,'walnut');ring('Bottle foil bead',(0,0,1.70),.20,'brass',thick=.012)
 for i in range(3):
  box('Vineyard terrace',(0,.08+i*.055,.22+i*.20),(1.21-i*.24,.44-i*.065,.13),'ceramic',.035)
  box('Vineyard earth',(0,.08+i*.055,.292+i*.20),(1.15-i*.24,.40-i*.065,.027),'leaf',.026)
  for j in range(8-i*2):box('Cut limestone retaining block',((j-(7-i*2)/2)*.14,-.145+i*.086,.24+i*.20),(.128,.012,.079),'cream',.013)
  for x in [-.36,-.12,.12,.36]:
   if i==2 and abs(x)>.2:continue
   cyl('Vine post',(x,.12+i*.04,.36+i*.2),.005,.16,'walnut');leaf((x,.12+i*.04,.40+i*.2),.10,.2)
   leaf((x-.035,.10+i*.04,.43+i*.2),.07,1.2,'lime')
   for dx in [-.018,.013]:ell('Grape cluster',(x+dx,.075+i*.04,.37+i*.2),(.017,.019,.022),'grape')
  tube('Vine trellis',[(-.43+i*.12,.115+i*.04,.38+i*.20),(.43-i*.12,.115+i*.04,.38+i*.20)],.003,'walnut')
 box('Vineyard villa',(.18,.16,.90),(.36,.25,.31),'cream',.027);roof=box('Village tiled roof',(.18,.16,1.086),(.43,.31,.055),'wine',.025);roof.rotation_euler.y=.12
 for x in [.08,.27]:box('Warm villa window',(x,.030,.94),(.063,.01,.09),'mango',.008)
 box('Cellar doorway',(.18,.026,.83),(.06,.012,.13),'walnut',.022)
 for x in [.025,.122,.222,.32]:tube('Villa roof tile',[(x,.015,1.10),(x,.16,1.117),(x,.30,1.10)],.007,'rose')
 box('Village bell tower',(-.18,.22,.95),(.17,.17,.51),'ceramic',.016);box('Tower roof',(-.18,.22,1.225),(.21,.21,.065),'wine',.024);box('Belfry opening',(-.18,.13,1.12),(.070,.01,.09),'walnut',.027);ell('Little bell',(-.18,.11,1.13),(.019,.016,.025),'brass')
 for x in [-.47,.47]:
  cyl('Courtyard cypress trunk',(x,.11,.50),.008,.23,'walnut');ell('Sculpted cypress',(x,.11,.62),(.044,.044,.14),'leaf')
 box('Tasting courtyard',(-.32,-.10,.335),(.25,.18,.033),'ceramic',.025);bottle((-.32,-.10,.36),.045)
 for x in [-.42,-.22]:box('Courtyard chair seat',(x,-.08,.37),(.049,.045,.01),'walnut',.009);box('Courtyard chair back',(x,-.058,.401),(.048,.007,.06),'walnut',.01)
 for x in [.27,.40]:
  cyl('Oak barrel',(x,-.11,.34),.047,.105,'walnut');ring('Barrel hoop',(x,-.11,.366),.048,'brass',thick=.004);ring('Barrel hoop',(x,-.11,.313),.048,'brass',thick=.004)
 for i in range(5):box('Terrace stair',(.48-i*.045,-.025+i*.025,.32+i*.055),(.09,.07,.05),'cream',.008)
 cart=bpy.data.objects.new('Parked harvest cart',None);bpy.context.collection.objects.link(cart);cart.parent=root
 before=set(bpy.context.scene.objects);box('Little harvest cart',(.61,0,.25),(.11,.07,.07),'wine',.01);ell('Harvest grapes',(.61,0,.30),(.046,.027,.025),'grape')
 for x in [.553,.667]:o=cyl('Cart wheel',(x,0,.209),.028,.013,'brass');o.rotation_euler.y=math.pi/2
 group_since(before,cart);plaque('Vineyard in a bottle',(0,-.39,.07),.58)

BUILDERS={
 'domain_gochujang_fireant_brigade':brigade,'domain_gochujang_volcano_boiler':volcano,'domain_gochujang_midnight_express':express,
 'domain_smoothie_toucan_bar':toucan,'domain_smoothie_orbit_blender':orbit_blender,'domain_smoothie_mango_lagoon':lagoon,
 'domain_wines_midnight_decanter':decanter,'domain_wines_sommelier_orrery':orrery,'domain_wines_bottle_vineyard':vineyard,
}
def optimize():
 bpy.ops.object.select_all(action='DESELECT')
 for o in list(bpy.context.scene.objects):
  if o.type=='CURVE':
   o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');o.select_set(False)
 bins={}
 for o in list(bpy.context.scene.objects):
  if o.type=='MESH':bins.setdefault((o.parent.name if o.parent else '',o.data.materials[0].name),[]).append(o)
 for objects in bins.values():
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0]
  if len(objects)>1:bpy.ops.object.join()
 # Preserve an editable texture path even though the benchmark uses shared solid materials.
 bpy.ops.object.select_all(action='DESELECT')
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 for o in meshes:o.select_set(True)
 bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
 if UV_PROJECTION=='cube':bpy.ops.uv.cube_project(cube_size=1,correct_aspect=True)
 else:bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.02)
 bpy.ops.object.mode_set(mode='OBJECT')
def build(name):
 global root,M
 dest=OUT/(name+'.glb');assert args.replace or not dest.exists(),str(dest)+' exists; use a new output or explicit --replace'
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);M={};root=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(root)
 BUILDERS[name]();optimize();export_study(name)

def export_study(name):
 dest=OUT/(name+'.glb');bpy.context.view_layer.update()
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];vertices=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box];bounds={'min':[min(v[i] for v in vertices) for i in range(3)],'max':[max(v[i] for v in vertices) for i in range(3)]};tri=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
 assert tri<=MAX_TRIANGLES,f'{name}: {tri} triangles exceeds the {MAX_TRIANGLES} art-study budget'
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(name+'.blend')))
 bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',export_apply=True,export_extras=True,export_animations=False,export_yup=True)
 metadata={'id':name,'version':'3.0.0-study.1','reviewStatus':'unapproved prototype','source':str(Path(__file__).resolve()),'sourceSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'license':'Original project geometry; brand approval pending','providerSpend':0,'triangles':tri,'meshDraws':len(meshes),'bytes':dest.stat().st_size,'boundsBlender':bounds,'semanticFront':'-Y in Blender, +Z in glTF','up':'Z in Blender, Y in glTF','support':'lowest model surface; scaled to tile envelope','animation':'Separate dkMotion pivots; working motions are only presentation','approved':False}
 (OUT/(name+'.json')).write_text(json.dumps(metadata,indent=2),encoding='utf-8');print('DOMAIN_HERO',name,tri,len(meshes),dest.stat().st_size,flush=True)
if __name__=='__main__':
 for name in (args.only.split(',') if args.only else BUILDERS):build(name)
