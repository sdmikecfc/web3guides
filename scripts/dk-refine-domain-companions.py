"""Five private studies using the approved Fireant Brigade's crafted detail.
Original Blender geometry. Originals and the approved Brigade are never rebuilt.
All generated output and source snapshots stay in the supplied D: directory.
"""
import importlib.util, math, bpy, json, hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('common_craft',Path(__file__).with_name('dk-refine-domain-commons.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
a=c.a
a.P.update({'sea':('#39acaf',.12,.23),'deepsea':('#277e85',.10,.25),'sand':('#edd5a0',0,.62),'pulp':('#f7bd47',0,.4),'rind':('#d98f28',0,.35),'palm':('#477348',0,.5),'slate':('#384849',.06,.43),'ash':('#b4c0b9',.2,.42)})
original_tube=a.tube
def bounded_tube(*args,**kwargs):
 o=original_tube(*args,**kwargs);o.data.resolution_u=3;o.data.bevel_resolution=1;return o
a.tube=bounded_tube
original_ell=a.ell
def detail_sphere(name,p,s,color):
 if max(s)>.05:return original_ell(name,p,s,color)
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,location=p);o=bpy.context.object;o.scale=s;return a.finish(o,name,color)
a.ell=detail_sphere

def cylinder(name,p,r,h,col,segments=20):
 bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=r,depth=h,location=p);return a.finish(bpy.context.object,name,col)

def noodle_bowl(p,r=.08):
 x,y,z=p
 profile=[(.53*r,z),(.65*r,z+.12*r),(.91*r,z+.48*r),(r,z+.62*r),(.88*r,z+.62*r),(.58*r,z+.17*r),(.53*r,z)]
 o=a.lathe('Glazed ramyeon bowl',profile,'ivory',steps=24);o.location.x=x;o.location.y=y
 cylinder('Spicy ramyeon broth',(x,y,z+r*.52),r*.86,.004,'enamel')
 for i in range(4):a.tube('Noodle curl',[(x-r*.5,y+(i-1.5)*r*.2,z+r*.55),(x,y+(i-1.5)*r*.2+r*.16,z+r*.59),(x+r*.45,y+(i-1.5)*r*.2,z+r*.55)],r*.025,'ivory')
 a.ell('Half egg',(x-r*.22,y+r*.06,z+r*.60),(r*.30,r*.22,r*.065),'ivory');a.ell('Egg yolk',(x-r*.22,y+r*.06,z+r*.64),(r*.14,r*.13,r*.035),'lemon')
 for i in range(3):c.leaf('Fresh scallion',(x+r*.20,y-r*.18+i*r*.12,z+r*.62),r*.40,r*.06,'jade',.8)

def lantern(p,s=.07):
 x,y,z=p;a.ell('Ribbed paper lantern',p,(s*.75,s*.75,s),'ivory')
 for i in range(8):
  q=i*math.tau/8;a.tube('Lantern bamboo rib',[(x+math.cos(q)*r,y+math.sin(q)*r,z+h) for r,h in [(s*.18,-s*.96),(s*.70,-s*.35),(s*.75,0),(s*.70,s*.35),(s*.18,s*.96)]],.0025,'gold')
 cylinder('Lantern cap',(x,y,z+s*.96),s*.22,.012,'onggi');a.tube('Lantern tassel',[(x,y,z-s),(x,y,z-s*1.5)],.006,'enamel')

def rail_points(straight,r,z):
 points=[]
 for i in range(17):
  q=math.pi/2-i*math.pi/16;points.append((straight+math.cos(q)*r,-math.sin(q)*r,z))
 for i in range(17):
  q=-math.pi/2-i*math.pi/16;points.append((-straight+math.cos(q)*r,-math.sin(q)*r,z))
 return points+[points[0]]

def track_pose(distance,L=.49,R=.28):
 perimeter=4*L+math.tau*R;s=distance%perimeter
 if s<2*L:return -L+s,-R,math.pi/2
 s-=2*L
 if s<math.pi*R:
  q=math.pi/2-s/R;return L+math.cos(q)*R,-math.sin(q)*R,math.pi-q
 s-=math.pi*R
 if s<2*L:return L-s,R,-math.pi/2
 s-=2*L;q=-math.pi/2-s/R;return -L+math.cos(q)*R,-math.sin(q)*R,math.pi-q

def vehicle(offset,engine=False):
 before=set(bpy.context.scene.objects)
 a.box('Enamel train chassis',(0,0,.06),(.145,.225,.05),'enamel',.018)
 for y in [-.065,.065]:
  for side in [-1,1]:
   wheel=cylinder('Rail wheel',(side*.052,y,0),.042,.014,'coal');wheel.rotation_euler.y=math.pi/2
   hub=cylinder('Brass wheel hub',(side*.061,y,0),.019,.007,'gold');hub.rotation_euler.y=math.pi/2
 a.tube('Brass chassis rail',[(-.077,-.105,.07),(-.077,.105,.07)],.005,'gold');a.tube('Brass chassis rail',[(.077,-.105,.07),(.077,.105,.07)],.005,'gold')
 if engine:
  boiler=cylinder('Locomotive copper boiler',(0,-.045,.13),.063,.18,'copper');boiler.rotation_euler.x=math.pi/2
  front=cylinder('Locomotive front',(0,-.140,.13),.057,.012,'onggi');front.rotation_euler.x=math.pi/2
  lamp=cylinder('Locomotive headlamp',(0,-.153,.14),.023,.013,'flame');lamp.rotation_euler.x=math.pi/2
  cylinder('Steam locomotive chimney',(0,-.076,.229),.023,.093,'coal');a.ring('Chimney rolled edge',(0,-.076,.277),.024,'gold',.005)
  a.box('Cab back',(0,.09,.17),(.13,.025,.17),'enamel',.012)
  for x in [-.055,.055]:a.box('Open cab side',(x,.05,.17),(.018,.09,.17),'enamel',.008)
  a.box('Curved locomotive roof',(0,.058,.277),(.17,.13,.031),'coal',.021)
  a.ell('Ant conductor head',(0,.023,.225),(.036,.03,.037),'antred')
  for x in [-.014,.014]:a.ell('Conductor eye',(x,-.005,.231),(.009,.005,.010),'ivory')
  for side in [-1,1]:a.tube('Conductor antenna',[(side*.013,.021,.252),(side*.028,.01,.274)],.003,'coal')
 else:
  a.box('Bowl nest',(0,0,.096),(.144,.18,.03),'wood',.017);noodle_bowl((0,0,.112),.080)
 joint=a.pivot('Noodle locomotive' if engine else f'Ramyeon carriage {offset}',motion='track');c.group(before,joint)
 x,y,yaw=track_pose(offset);joint.location=(x,y,.300);joint.rotation_euler.z=yaw
 joint['dkTrackStraight']=.49;joint['dkTrackRadius']=.28;joint['dkTrackSpeed']=.095;joint['dkTrackOffset']=offset

def express():
 c.footed_base(1.93,.94,'onggi');a.box('Stone platform',(0,0,.186),(1.84,.87,.05),'ivory',.085)
 for i in range(54):
  distance=i*(4*.49+math.tau*.28)/54;x,y,yaw=track_pose(distance)
  tie=a.box('Walnut railway sleeper',(x,y,.228),(.138,.022,.014),'wood',.003);tie.rotation_euler.z=yaw
 for r in [.228,.332]:a.tube('Continuous brass track',rail_points(.49,r,.257),.007,'gold')
 a.box('Station raised platform',(0,.006,.262),(1.04,.28,.104),'slate',.035)
 for i in range(9):a.box('Platform paving',((i-4)*.110,-.018,.320),(.103,.23,.015),'ivory',.004)
 a.box('Tiny noodle counter',(0,.035,.409),(.83,.145,.16),'enamel',.024);a.box('Counter stone top',(0,.015,.501),(.89,.20,.029),'ivory',.014)
 for x in [-.33,-.11,.11,.33]:a.box('Lacquer panel',(x,-.041,.415),(.18,.012,.115),'onggi',.008);a.ell('Door knob',(x,-.052,.446),(.008,.006,.008),'gold')
 for x in [-.43,.43]:
  for y in [-.075,.125]:a.box('Station post',(x,y,.602),(.028,.028,.56),'onggi',.006)
 # Readable tiled gable roof with rolled eaves and a gold ridge.
 for side in [-1,1]:
  roof=a.box('Swept station roof',(0,side*.116,.89),(1.03,.263,.039),'coal',.02);roof.rotation_euler.x=side*.22
  for i in range(13):
   x=(i-6)*.078;a.tube('Ceramic roof tile',[(x,side*.245,.858),(x,side*.12,.895),(x,0,.928)],.010,'slate')
  a.tube('Rolled eave',[(-.54,side*.245,.876),(0,side*.24,.854),(.54,side*.245,.876)],.018,'coal')
 a.tube('Gold roof ridge',[(-.55,0,.934),(0,0,.930),(.55,0,.934)],.009,'gold')
 for x in [-.42,.42]:a.tube('Lantern hook',[(x,-.19,.84),(x,-.19,.80)],.004,'gold');lantern((x,-.19,.724),.057)
 a.box('Night station sign',(0,-.110,.731),(.59,.020,.097),'onggi',.010);c.letter('MIDNIGHT RAMYEON',(0,-.125,.734),.043,'ivory')
 for x in [-.31,.12,.29]:noodle_bowl((x,-.007,.525),.043)
 c.ant_chef((-.10,.045,.324),.245,False)
 for i in range(3):c.pepper((.16+i*.052,.08,.657),.070)
 for i in range(3):vehicle(-i*.31,engine=i==0)
 a.box('Station nameplate',(0,-.471,.122),(.67,.013,.065),'onggi',.013);c.letter('THE RAMYEON EXPRESS',(0,-.481,.121),.039,'ivory')

def toucan():
 # One wooden tasting counter, rather than a stack of display plinths.
 for x in [-.35,.35]:
  for y in [-.235,.21]:a.box('Rounded oak leg',(x,y,.181),(.068,.068,.35),'woodlight',.016)
 a.box('Lower open shelf',(0,-.013,.117),(.76,.49,.039),'woodlight',.025)
 a.box('Cabinet back',(0,.235,.242),(.73,.026,.226),'teal',.015)
 for x in [-.375,.375]:a.box('Cabinet side',(x,-.015,.242),(.029,.47,.226),'teal',.014)
 a.box('Rounded oak serving top',(0,-.025,.364),(.87,.59,.055),'woodlight',.043)
 a.box('Cream worktop inset',(0,-.025,.397),(.82,.54,.015),'ivory',.036)
 # A useful storage bay with two woven baskets; no ornamental stripes or feet.
 for x in [-.18,.18]:
  a.box('Fruit storage basket',(x,-.026,.189),(.29,.35,.102),'wood',.022)
  for z in [.157,.184,.211]:a.box('Basket front weave',(x,-.205,z),(.284,.01,.010),'woodlight',.003)
  a.box('Basket handle',(x,-.214,.213),(.075,.009,.024),'coal',.009)
 a.box('Smoothie enamel plaque',(0,-.283,.307),(.38,.014,.073),'teal',.016);c.letter('SMOOTHIE.COM',(0,-.294,.308),.032,'ivory')
 # The branch belongs to a real planted pot, with visible soil and a rim.
 o=a.lathe('Perch planter',[(.057,.405),(.070,.477),(.065,.484),(.056,.477),(.050,.416)],'peach',steps=24);o.location.x=-.29;o.location.y=.125
 cylinder('Perch soil',(-.29,.125,.471),.056,.012,'wood');a.ring('Planter rim',(-.29,.125,.477),.067,'ivory',.007)
 a.tube('Rooted wooden perch',[(-.29,.125,.392),(-.30,.135,.53),(-.22,.135,.606),(-.067,.12,.613)],.019,'wood')
 a.tube('Perch side branch',[(-.29,.135,.505),(-.40,.15,.56)],.010,'woodlight')
 for i in range(3):c.leaf('Perch foliage',(-.37,.14,.56),.12,.030,'palm',1.9+i*.5,-.3)
 # A visible ankle gap separates the body from the branch. Toes wrap its surface.
 for x in [-.205,-.110]:
  a.tube('Scaly ankle',[(x,.118,.681),(x,.107,.624)],.009,'ash')
  for offset in [-.012,0,.012]:a.tube('Branch gripping toe',[(x+offset,.108,.622),(x+offset,.082,.631),(x+offset,.071,.610),(x+offset,.09,.598)],.0053,'ash')
 a.ell('Tapered toucan body',(-.168,.141,.770),(.109,.096,.132),'coal')
 a.ell('Ivory breast',(-.149,.056,.795),(.066,.029,.086),'ivory')
 for side in [-1,1]:
  wing=a.ell('Folded toucan wing',(-.168+side*.093,.153,.761),(.032,.079,.119),'feather');wing.rotation_euler.x=-.15
  for i in range(3):
   feather=a.ell('Wing flight feather',(-.168+side*.098,.166+i*.015,.717-i*.015),(.026,.025,.065),'coal');feather.rotation_euler.x=-.23
 for i in range(3):
  tail=a.ell('Tapered tail',(-.168+(i-1)*.026,.224,.659),(.021,.025,.095),'coal');tail.rotation_euler.x=-.50
 # Neck, skull and both bill surfaces are captured by one actual neck joint.
 before=set(bpy.context.scene.objects)
 a.ell('Toucan neck',(-.153,.078,.862),(.071,.067,.080),'coal');a.ell('Toucan skull',(-.132,.033,.922),(.107,.095,.098),'coal')
 a.ell('Throat patch',(-.079,-.028,.871),(.060,.023,.047),'ivory')
 for x,y in [(-.162,-.052),(-.143,.116)]:
  a.ell('Turquoise eye ring',(x,y,.943),(.023,.010,.026),'turquoise');a.ell('Toucan eye',(x,y-.007,.944),(.012,.008,.014),'coal');a.ell('Eye sparkle',(x-.004,y-.013,.950),(.003,.003,.004),'white')
 sections=[(-.064,-.022,.929,.055,.047),(.008,-.041,.938,.060,.056),(.102,-.066,.931,.054,.049),(.187,-.080,.915,.035,.031),(.217,-.084,.897,.004,.006)]
 verts=[];faces=[]
 for x,y,z,ry,rz in sections:
  for j in range(20):q=j*math.tau/20;verts.append((x,y+math.cos(q)*ry,z+math.sin(q)*rz))
 faces.append(tuple(reversed(range(20))))
 for k in range(4):
  for j in range(20):v=k*20+j;faces.append((v,k*20+(j+1)%20,(k+1)*20+(j+1)%20,v+20))
 faces.append(tuple(range(80,100)))
 mesh=bpy.data.meshes.new('Sealed sculpted toucan bill');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Sealed sculpted toucan bill',mesh);bpy.context.collection.objects.link(o);a.finish(o,o.name,'beak');o.data.materials.append(a.mat('coal'))
 for face in o.data.polygons:
  if face.center.x>.14:face.material_index=1
 sub=o.modifiers.new('Bill smoothing','SUBSURF');sub.levels=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=sub.name)
 a.tube('Natural beak seam',[(-.040,-.080,.909),(.05,-.10,.908),(.145,-.109,.897),(.207,-.091,.891)],.0025,'coal')
 joint=a.pivot('Toucan neck joint',(-.15,.070,.849),'rock','Z',.03,.60);c.group(before,joint)
 a.box('Fruit crate bottom',(.216,.15,.419),(.34,.185,.024),'woodlight',.010)
 for y in [.059,.24]:a.box('Crate rim',(.216,y,.445),(.35,.016,.050),'wood',.005)
 for x in [.044,.388]:a.box('Crate end',(x,.15,.445),(.017,.18,.050),'wood',.005)
 for x,y in [(.12,.13),(.225,.13),(.32,.16)]:a.ell('Ripe orange',(x,y,.469),(.051,.048,.043),'papaya');c.leaf('Orange leaf',(x,y,.507),.065,.014,'palm',.6)
 a.box('Tasting flight board',(.064,-.162,.416),(.365,.142,.023),'wood',.022)
 for i,col in enumerate(['pulp','berry','jade']):
  x=-.044+i*.105;o=a.lathe('Tasting tumbler',[(.027,.429),(.038,.527),(.032,.527),(.022,.435)],'paleglass',steps=24);o.location=(x,-.162,0)
  a.cyl('Fruit drink',(x,-.162,.476),.024,.078,col,.031);a.tube('Paper straw',[(x,-.162,.476),(x,-.162,.560),(x+.020,-.162,.570)],.003,'ivory');c.leaf('Mint garnish',(x-.010,-.162,.52),.033,.010,'palm',.6)
 c.citrus((.326,-.17,.408),.060)

def blender():
 c.footed_base(.78,.70,'teal')
 a.box('Peach appliance cabinet',(0,0,.444),(.70,.62,.55),'peach',.08)
 a.box('Ivory inset front',(0,-.312,.441),(.60,.017,.39),'ivory',.05)
 for x in [-.29,.29]:a.box('Jade cabinet edging',(x,-.327,.445),(.018,.010,.30),'teal',.007)
 for i in range(7):a.box('Lower ventilation slot',((i-3)*.048,-.326,.305),(.025,.009,.055),'teal',.009)
 a.box('Machine worktop',(0,0,.744),(.79,.70,.055),'ivory',.06)
 cylinder('Motor collar',(0,0,.805),.201,.096,'teal');a.ring('Motor brass trim',(0,0,.85),.199,'gold',.010)
 # A tapered open jug with an actual pouring spout, handle and volume marks.
 jug=a.lathe('Thick blending jug',[(.148,.85),(.187,.875),(.209,1.265),(.191,1.291),(.178,1.288),(.176,.884),(.148,.866)],'crystal',steps=48)
 for angle in [0,.9,2.2,3.1,4.4,5.6]:a.tube('Fluted pitcher glass',[(math.cos(angle)*r,math.sin(angle)*r,z) for r,z in [(.178,.886),(.19,1.08),(.205,1.257)]],.005,'paleglass')
 a.tube('Braced jug handle',[(.185,.036,1.222),(.329,.036,1.204),(.349,.036,1.075),(.286,.036,.949),(.185,.036,.969)],.022,'teal')
 a.tube('Pouring lip',[(-.165,-.091,1.274),(-.215,-.133,1.299),(-.094,-.183,1.28)],.008,'paleglass')
 cylinder('Blender lid',(0,0,1.302),.215,.037,'ivory');a.ring('Lid seal',(0,0,1.281),.20,'teal',.009)
 a.ell('Citrus lid grip',(0,0,1.345),(.065,.049,.031),'papaya');c.leaf('Lid leaf',(.054,0,1.363),.073,.019,'palm',.35)
 # Fruit never leaves its vessel. The blade and surface swirl share the motor axis.
 a.cyl('Mango smoothie inside jug',(0,0,1.028),.171,.252,'pulp',.180)
 rotor=a.pivot('Blender rotor',(0,0,1.070),'spin','Z',0,2.4);rotor['dkAnimateOnlyWorking']=True
 before=set(bpy.context.scene.objects)
 for i,col in enumerate(['papaya','berry','pith']):
  q=i*math.tau/3;a.box('Cut fruit in smoothie',(math.cos(q)*.102,math.sin(q)*.102,1.186),(.046,.046,.036),col,.012)
 a.tube('Surface blending swirl',[(math.cos(t)*(.014+t*.012),math.sin(t)*(.014+t*.012),1.158) for t in [i*.30 for i in range(35)]],.004,'ivory')
 a.box('Steel blade',(0,0,.90),(.26,.026,.008),'steel',.004);c.group(before,rotor)
 for z in [1.00,1.075,1.15,1.225]:a.tube('Pitcher volume mark',[(-.03,-.194,z),(.02,-.194,z)],.0026,'ivory')
 for x,col in [(-.165,'teal'),(.165,'papaya')]:
  knob=cylinder('Tactile control',(x,-.345,.51),.054,.034,col);knob.rotation_euler.x=math.pi/2
  a.box('Knob index',(x,-.368,.541),(.005,.006,.018),'gold',.002)
 a.box('Enamel maker plate',(0,-.338,.409),(.35,.014,.063),'teal',.015);c.letter('FRUIT ORBIT',(0,-.349,.41),.035,'ivory')
 # Citrus embossing is in the cabinet, never circling the appliance.
 citrus=cylinder('Orange wheel medallion',(0,-.34,.613),.068,.016,'papaya');citrus.rotation_euler.x=math.pi/2
 for i in range(8):
  q=i*math.tau/8;a.tube('Citrus medallion segment',[(math.cos(q)*.008,-.351,.613+math.sin(q)*.008),(math.cos(q)*.054,-.351,.613+math.sin(q)*.054)],.003,'ivory')

def palm(p,s):
 x,y,z=p;a.tube('Ringed palm trunk',[(x,y,z),(x-.025*s,y+.02*s,z+.60*s),(x,y,z+s)],.021*s,'wood')
 for i in range(7):a.ring('Palm trunk ring',(x-.014*s,y+.015*s,z+s*(.16+i*.105)),.022*s,'woodlight',.003*s)
 for i in range(7):
  q=i*math.tau/7;center=(x,y,z+s)
  # Separate leaflets create feathered palms instead of flat star shapes.
  points=[(x+math.cos(q)*s*t,y+math.sin(q)*s*t,z+s+(math.sin(t*math.pi)*.15-t*.11)*s) for t in [0,.13,.27,.40]]
  a.tube('Palm frond spine',points,.004*s,'palm')
  for j,t in enumerate([.12,.21,.30]):
   for side in [-1,1]:c.leaf('Palm leaflet',(x+math.cos(q)*s*t,y+math.sin(q)*s*t,z+s+(math.sin(t*math.pi)*.15-t*.11)*s),s*.15,s*.028,'palm' if j%2 else 'fruitleaf',q+side*.75,.3)

def lagoon():
 c.footed_base(1.82,.90,'teal')
 profile=a.soft_profile([(.34,.17),(.54,.32),(.59,.72),(.49,1.13),(.26,1.40),(.01,1.47)])
 shell=a.lathe('Sculpted mango peel',profile,'rind',0,math.pi);shell.scale=(1.31,.64,1)
 inner=a.lathe('Golden mango flesh',[(r-.027,z+.009) for r,z in profile],'pulp',0,math.pi);inner.scale=(1.31,.64,1)
 for side in [-1,1]:a.tube('Thick cut mango rim',[(side*r*1.31,-.004,z) for r,z in profile[::4]],.019,'pulp')
 c.leaf('Mango crown leaf',(.065,.11,1.455),.27,.069,'jade',.30,-.12);a.tube('Mango stem',[(0,.10,1.47),(.09,.13,1.50)],.013,'wood')
 a.ell('Deep lagoon basin',(0,0,.226),(.81,.375,.062),'deepsea');a.ell('Clear lagoon surface',(0,-.012,.258),(.77,.343,.028),'sea')
 a.ell('Layered sandy shore',(.09,.08,.303),(.53,.242,.065),'sand');a.ell('Beach top',(.11,.08,.334),(.46,.205,.032),'ivory')
 # Rock-backed waterfall, emerging from a basin rather than a floating pipe.
 for i,(x,z,w) in enumerate([(-.49,.35,.10),(-.46,.47,.12),(-.43,.60,.10),(-.42,.70,.08)]):a.ell('Waterfall rock',(x,.19,z),(w,.077,.09),'ivory' if i%2 else 'sand')
 a.tube('Water over rock face',[(-.43,.175,.725),(-.45,.110,.62),(-.48,.101,.49),(-.51,.04,.34),(-.56,-.016,.277)],.015,'blue')
 for dx in [-.015,.015]:a.tube('Waterfall highlight',[(-.43+dx,.160,.710),(-.465+dx,.091,.58),(-.52+dx,.011,.32)],.003,'paleglass')
 for i in range(3):a.tube('Waterfall pool ripple',[(-.55+math.cos(q)*(.05+i*.025),-.01+math.sin(q)*(.023+i*.01),.286) for q in [j*.2 for j in range(32)]],.0025,'ivory')
 # A complete open-front smoothie hut with shelves, fruit and service counter.
 a.box('Cabana deck',(.145,.074,.370),(.47,.32,.035),'wood',.035)
 for i in range(8):a.box('Deck plank',(-.054+i*.056,.074,.391),(.051,.30,.008),'woodlight',.003)
 a.box('Hut back',(.145,.194,.532),(.41,.020,.283),'peach',.014)
 for x in [-.061,.351]:a.box('Cabana post',(x,.09,.554),(.021,.021,.35),'teal',.005)
 a.box('Fruit bar counter',(.145,-.018,.472),(.42,.073,.15),'peach',.014);a.box('Bar stone top',(.145,-.02,.557),(.45,.09,.022),'ivory',.012)
 for i in range(9):a.box('Cabana fluting',(-.04+i*.045,-.058,.474),(.015,.007,.108),'ivory',.004)
 roof=a.box('Cabana pitched canopy',(.145,.08,.727),(.51,.36,.031),'teal',.025);roof.rotation_euler.x=.13
 for i in range(8):a.box('Ivory canvas stripe',(-.073+i*.062,.01,.741),(.029,.23,.010),'ivory',.008).rotation_euler.x=.13
 a.box('Cabana sign',(.145,-.11,.667),(.25,.012,.054),'teal',.01);c.letter('MANGO CLUB',(.145,-.120,.668),.027,'ivory')
 a.box('Back display shelf',(.145,.165,.589),(.34,.055,.016),'woodlight',.008)
 for i,col in enumerate(['papaya','berry','jade']):
  x=.038+i*.098;cylinder('Tiny smoothie',(x,-.02,.590),.017,.047,col);a.tube('Tiny straw',[(x,-.02,.60),(x,-.02,.628)],.0018,'ivory');a.ell('Fresh fruit basket',(x,.158,.620),(.029,.023,.022),col)
 for x in [.025,.245]:cylinder('Round bar stool',(x,-.135,.433),.035,.020,'peach');cylinder('Stool leg',(x,-.135,.407),.008,.042,'gold')
 palm((-.27,.155,.358),.63);palm((.475,.15,.33),.46)
 for x,y in [(-.34,.12),(.48,.18),(.52,.08)]:
  for i in range(3):c.leaf('Island tropical foliage',(x,y,.36),.14,.035,'palm' if i%2 else 'jade',i*2+.4,-.35)
 # Moored boat rocks slightly about its keel; it cannot sail through the island.
 before=set(bpy.context.scene.objects)
 a.ell('Little wooden dinghy',(-.50,-.195,.299),(.106,.045,.030),'wood');a.ell('Cream boat interior',(-.50,-.195,.318),(.083,.032,.009),'ivory')
 for x in [-.54,-.46]:a.box('Dinghy bench',(x,-.195,.323),(.014,.069,.008),'woodlight',.003)
 a.tube('Resting wooden oar',[(-.57,-.16,.33),(-.43,-.23,.34)],.004,'woodlight')
 boat=a.pivot('Moored lagoon boat',(-.50,-.195,.292),'rock','Y',.025,.7);c.group(before,boat)
 a.tube('Slack mooring rope',[(-.40,-.185,.310),(-.36,-.16,.297),(-.32,-.10,.343)],.002,'linen')
 cylinder('Mooring post',(-.32,-.10,.349),.008,.07,'wood')
 a.box('Lagoon enamel label',(0,-.451,.121),(.42,.014,.06),'teal',.014);c.letter('MANGO LAGOON',(0,-.462,.121),.033,'ivory')

def boiler():
 a.volcano()
 # Existing silhouette retained; add recognisable working basket and fittings.
 before=set(bpy.context.scene.objects)
 basket=cylinder('Basket bottom',(0,0,.892),.196,.009,'steel')
 for i in range(16):
  q=i*math.tau/16;a.tube('Basket vertical wire',[(math.cos(q)*.194,math.sin(q)*.194,.893),(math.cos(q)*.218,math.sin(q)*.218,.969)],.0025,'steel')
 for z,r in [(.91,.199),(.935,.207),(.968,.218)]:a.ring('Basket woven rim',(0,0,z),r,'steel',.004)
 a.tube('Basket hooked handle',[(.21,0,.957),(.337,0,1.04),(.432,0,1.04)],.012,'steel');a.tube('Basket wooden grip',[(.353,0,1.04),(.442,0,1.04)],.021,'wood')
 for i in range(5):a.tube('Noodles inside basket',[(-.12,-.09+i*.043,.925),(0,-.07+i*.04,.929),(.12,-.09+i*.043,.925)],.006,'ivory')
 display_basket=a.pivot('Display basket');del display_basket['dkMotion'];c.group(before,display_basket);display_basket['dkDisplayOnly']=True
 gauge=cylinder('Inset temperature gauge',(-.13,-.384,.55),.066,.018,'gold');gauge.rotation_euler.x=math.pi/2
 face=cylinder('Cream gauge face',(-.13,-.396,.55),.055,.006,'ivory');face.rotation_euler.x=math.pi/2
 for i in range(9):
  q=i*math.pi/6-.5;a.tube('Gauge tick',[(-.13+math.cos(q)*.041,-.40,.55+math.sin(q)*.041),(-.13+math.cos(q)*.050,-.40,.55+math.sin(q)*.050)],.0018,'coal')
 a.tube('Pressure needle',[(-.13,-.404,.55),(-.155,-.404,.581)],.0026,'enamel')
 a.box('Enamel boiler plaque',(.09,-.399,.555),(.24,.023,.09),'onggi',.022);c.letter('RAMYEON',(.09,-.413,.554),.036,'ivory')
 for x in [-.10,.10]:a.ell('Cast mounting bolt',(x,-.412,.523),(.005,.004,.005),'gold')
 for side in [-1,1]:a.tube('Insulated handle grip',[(side*.427,-.021,.783),(side*.428,-.021,.848)],.020,'wood')

BUILDERS={'domain_gochujang_midnight_express':express,'domain_smoothie_toucan_bar':toucan,'domain_smoothie_orbit_blender':blender,'domain_smoothie_mango_lagoon':lagoon,'domain_gochujang_volcano_boiler':boiler}
if __name__=='__main__':
 a.BUILDERS=BUILDERS
 for name in (a.args.only.split(',') if a.args.only else BUILDERS):
  a.build(name)
  path=a.OUT/(name+'.json');record=json.loads(path.read_text());record.update(version='3.0.0-study.4',source=str(Path(__file__).resolve()),sourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),reviewStatus='revised against approved Fireant Brigade; awaiting review',approved=False)
  path.write_text(json.dumps(record,indent=2),encoding='utf-8')
 for source in [Path(__file__),Path(c.__file__),Path(a.__file__)]:
  (a.OUT/source.name).write_bytes(source.read_bytes())

