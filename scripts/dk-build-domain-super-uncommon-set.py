"""Twelve individually authored collectibles. Local Blender, zero provider spend.

Keep approved heroes intact; export into a new D: study directory. Animated
assemblies have a physical joint/support and keep within their placement envelope.
"""
import importlib.util, math, bpy, json, hashlib
import sys
sys.dont_write_bytecode=True
from pathlib import Path
spec=importlib.util.spec_from_file_location('regular_uncommon',Path(__file__).with_name('dk-build-domain-uncommon-set.py'))
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u);s=u.s;b=u.b;c=u.c;a=u.a
a.P.update({'roof':('#344740',.10,.40),'roofedge':('#607668',.08,.40),'pink':('#da777d',0,.43),'stonewarm':('#b99d78',0,.58)})

def base(w=1.80,d=.80,color='wood'):
 c.footed_base(w,d,color)

def roof(p,w,d,color='roof'):
 x,y,z=p
 # A shallow curved hanok roof; the ribs follow its actual surface.
 verts=[];faces=[]
 for j in range(9):
  v=(j/8-.5)*2
  for i in range(13):
   t=(i/12-.5)*2;verts.append((x+t*w/2,y+v*d/2,z+.055*t*t+.06*abs(v)**1.7))
 for j in range(8):
  for i in range(12):k=j*13+i;faces.append((k,k+1,k+14,k+13))
 mesh=bpy.data.meshes.new('Curved ceramic roof');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Supported tiled roof',mesh);bpy.context.collection.objects.link(o);a.finish(o,o.name,color)
 for i in range(13):
  t=(i/12-.5)*2;a.tube('Curved roof tile rib',[(x+t*w/2,y+v*d/2,z+.055*t*t+.06*abs(v)**1.7+.008) for v in [-1,-.5,0,.5,1]],.010,'roofedge')
 for v in [-1,1]:a.tube('Rolled roof eave',[(x+t*w/2,y+v*d/2,z+.055*t*t+.06) for t in [-1,-.5,0,.5,1]],.014,'gold')

def lattice(p,w,h,color='gold'):
 x,y,z=p
 for i in range(6):a.box('Window lattice upright',(x-w/2+i*w/5,y,z),(.009,.012,h),color,.002)
 for j in range(4):a.box('Window lattice crossbar',(x,y,z-h/2+j*h/3),(w,.012,.009),color,.002)

def cat(p,sc=.18):
 x,y,z=p;a.ell('Seated ginger cat',(x,y+.018,z+sc*.40),(sc*.34,sc*.27,sc*.46),'ochre')
 a.tube('Curled cat tail',[(x+.025,y+.02,z+.025),(x+sc*.55,y,z+.03),(x+sc*.40,y-.05,z+.035)],.012,'ochre')
 def head():
  a.ell('Curious cat head',(x,y-.02,z+sc*.85),(sc*.31,sc*.27,sc*.29),'ochre')
  for dx in [-.19,.19]:
   a.cyl('Pointed cat ear',(x+dx*sc,y-.015,z+sc*1.13),sc*.105,sc*.23,'ochre',0)
   a.ell('Cat eye',(x+dx*sc,y-sc*.32,z+sc*.88),(.005,.004,.008),'coal')
  a.ell('Cat muzzle',(x,y-sc*.29,z+sc*.76),(sc*.15,.012,sc*.10),'ivory')
 b.assembly('Cat turns at its neck',(x,y-.015,z+sc*.68),head,'rock','Z',.055,.42)

def rooftop():
 a.box('Roof garden wall bracket',(0,.25,.60),(1.76,.06,1.14),'onggi',.04)
 a.box('Warm upper window',(0,.206,.62),(1.5,.025,.89),'ivory',.023)
 for x in [-.55,0,.55]:lattice((x,.18,.63),.43,.62)
 a.box('Supported garden balcony',(0,-.03,.32),(1.80,.64,.09),'wood',.03)
 for x in [-.77,.77]:a.box('Balcony support',(x,.04,.21),(.073,.46,.16),'onggi',.015)
 roof((0,.09,1.13),1.9,.60)
 # The supper is under the eave, unobstructed by roof geometry.
 a.box('Low supper table',(-.29,-.08,.48),(.50,.26,.035),'onggi',.02)
 for x in [-.47,-.11]:a.box('Supper table leg',(x,-.08,.415),(.03,.15,.13),'wood',.008)
 for x in [-.40,-.18]:a.bowl((x,-.075,.527),.068)
 c.ant_chef((-.49,.07,.366),.22,False)
 b.jar((.26,.09,.37),.086,.20);cat((.50,-.10,.366),.27)
 for x in [-.68,.68]:
  a.tube('Lantern hook',[(x,.03,1.11),(x,-.06,1.0)],.006,'gold');b.lantern((x,-.06,.94),.056,.12)
 b.board_label('AFTER THE LAST BOWL',(0,-.36,.32),.78,size=.026)

def pepper_player(x,instrument):
 # Pepper characters are glazed sculptures, rooted to the tiled bandstand.
 for dx in [-.06,.06]:a.ell('Band member shoe',(x+dx,-.05,.23),(.05,.069,.035),'coal')
 a.ell('Pepper musician body',(x,.035,.53),(.145,.104,.255),'enamel')
 a.tube('Pepper stem hat',[(x,.035,.76),(x+.02,.035,.86),(x+.06,.02,.88)],.020,'jade')
 for dx in [-.045,.045]:a.ell('Musician cream eye',(x+dx,-.058,.64),(.024,.016,.027),'ivory');a.ell('Musician pupil',(x+dx,-.073,.64),(.010,.005,.014),'coal')
 a.tube('Friendly musician smile',[(x-.035,-.071,.573),(x,-.082,.559),(x+.035,-.071,.573)],.005,'coal')
 if instrument=='drum':
  a.cyl('Barrel drum',(x,-.15,.40),.115,.16,'wood');a.cyl('Cream drumskin',(x,-.15,.49),.116,.012,'linen');a.ring('Drum hoop',(x,-.15,.49),.119,'gold',.008)
  def arm():
   a.tube('Drummer forearm',[(x+.12,-.005,.58),(x+.10,-.14,.57)],.021,'enamel');a.tube('Drum brush',[(x+.10,-.14,.57),(x,-.16,.51)],.007,'bamboo')
  b.assembly('Drummer elbow',(x+.12,-.005,.58),arm,'rock','X',.075,.9)
 elif instrument=='bass':
  a.ell('Lacquer bass body',(x,-.15,.48),(.075,.025,.115),'onggi');a.box('Brass bass neck',(x,-.15,.68),(.032,.026,.27),'gold',.009)
  for dx in [-.006,0,.006]:a.tube('Bass string',[(x+dx,-.18,.41),(x+dx,-.18,.80)],.0015,'ivory')
 else:
  a.tube('Brass saxophone',[(x+.07,-.12,.66),(x+.07,-.15,.44),(x-.05,-.15,.39),(x-.065,-.15,.48)],.028,'gold');a.cyl('Sax bell',(x-.065,-.15,.50),.030,.055,'gold',.065)
 for side in [-1,1]:a.tube('Planted instrument arm',[(x+side*.125,.015,.58),(x+side*.075,-.12,.49)],.020,'enamel')

def pepper_band():
 base(color='onggi');a.box('Tiled bandstand',(0,0,.22),(1.65,.64,.09),'ivory',.055)
 for i in range(9):a.box('Red stage facing',((i-4)*.18,-.318,.23),(.166,.018,.069),'enamel',.008)
 for x,inst in [(-.52,'bass'),(0,'drum'),(.52,'sax')]:pepper_player(x,inst)
 a.tube('Stage back brass rail',[(-.77,.24,.32),(-.77,.24,.98),(0,.24,1.04),(.77,.24,.98),(.77,.24,.32)],.014,'gold')
 b.board_label('HOT PEPPER HOUSE BAND',(0,-.40,.139),1.02,size=.032)

def delivery():
 base(.95,.82,'onggi')
 # Side-on parked scooter: wheels aligned with the front fork and chassis.
 for x in [-.31,.30]:
  a.cyl('Scooter rubber tyre',(x,0,.30),.105,.070,'coal').rotation_euler.x=math.pi/2
  a.cyl('Scooter wheel hub',(x,-.041,.30),.067,.012,'gold').rotation_euler.x=math.pi/2
 a.box('Scooter running board',(0,0,.30),(.52,.21,.055),'enamel',.030)
 a.ell('Rear enamel scooter fairing',(-.25,0,.41),(.19,.14,.12),'enamel')
 a.tube('Front fork',[(.30,0,.30),(.25,0,.65)],.024,'steel');a.ell('Rounded scooter leg shield',(.23,.015,.50),(.072,.15,.20),'enamel')
 a.tube('Scooter handlebar',[(.245,-.14,.70),(.245,0,.72),(.245,.14,.70)],.016,'gold')
 a.cyl('Headlamp',(.302,-.03,.66),.046,.037,'ivory').rotation_euler.y=math.pi/2
 a.box('Leather scooter saddle',(-.07,.015,.51),(.23,.22,.055),'coal',.039)
 a.tube('Parked scooter kickstand',[(-.11,.06,.34),(-.12,.19,.168)],.012,'steel')
 a.box('Delivery rack',(-.32,.04,.60),(.24,.31,.039),'gold',.018)
 for i in range(3):
  z=.654+i*.071;a.bowl((-.31,.04,z),.104);a.cyl('Sealed delivery bowl lid',(-.31,.04,z+.041),.109,.010,'onggi')
 for side in [-1,1]:a.tube('Delivery carrier securing strap',[(-.43,side*.09,.61),(-.43,side*.09,.86),(-.20,side*.09,.86),(-.20,side*.09,.61)],.009,'gold')
 # The courier stands alongside. Only the inspecting head moves.
 before=set(bpy.context.scene.objects);c.ant_chef((.12,-.20,.18),.34,False)
 pivot=a.pivot('Courier checking the delivery',(.12,-.20,.54),'rock','Z',.045,.55)
 for o in set(bpy.context.scene.objects)-before:
  if o!=pivot and any(o.name.startswith(k) for k in ['Sculpted ant face','Ant muzzle','Cream eye','Dark pupil','Eye glint','Jointed antenna','Antenna tip','Smile','Kitchen headband']):a.parent(o,pivot)
 b.board_label('FIREANT EXPRESS',(0,-.40,.139),.66,size=.028)

def steam_gate():
 base(color='onggi')
 for side in [-1,1]:
  x=side*.60;a.box('Gate foundation',(x,0,.24),(.31,.43,.17),'coal',.04)
  for dx in [-.047,.047]:a.tube('Sculpted noodle steam pillar',[(x+dx,0,.29),(x+dx-side*.06,.015,.63),(x+dx+side*.02,0,.97),(side*.27+dx,0,1.26),(side*.04,0,1.28)],.057,'ivory')
  a.ring('Gate pillar brass collar',(x,0,.37),.109,'gold',.010)
 a.tube('Lantern suspension',[(0,0,1.25),(0,0,1.02)],.008,'gold')
 b.assembly('Lantern on gate hook',(0,0,1.035),lambda:b.lantern((0,0,.86),.119,.28,'enamel'),'rock','Y',.025,.48)
 for x in [-.69,.69]:b.jar((x,-.17,.33),.06,.12,'jade')
 for side in [-1,1]:
  x=side*.60;a.box('Gate enamel foundation panel',(x,-.222,.24),(.20,.012,.090),'onggi',.013)
  c.pepper((x-.02,-.233,.27),.07)
 b.board_label('COME IN FOR ONE MORE BOWL',(0,-.40,.139),1.10,size=.025)

def fruit_tray(p):
 x,y,z=p;a.cyl('Fruit service brass tray',p,.18,.023,'gold')
 for dx,dy,col in [(-.09,.035,'papaya'),(.09,.045,'berry'),(0,-.07,'lemon')]:
  a.ell('Fresh cut fruit',(x+dx,y+dy,z+.045),(.047,.041,.04),col)
 s.mug((x+.045,y-.008,z+.020),.029,'teal')

def flamingo():
 base(.90,.78,'teal')
 for x in [-.075,.065]:
  a.tube('Flamingo planted leg',[(x,.04,.20),(x+.014,.04,.45),(x,.02,.65)],.017,'pink')
  for d in [-1,0,1]:a.tube('Flamingo forward toe',[(x,.04,.20),(x+d*.031,-.05,.18)],.010,'gold')
 a.ell('Flamingo feathered torso',(0,.02,.73),(.165,.12,.19),'pink')
 c.leaf('Folded flamingo wing',(.095,-.045,.77),.22,.068,'berry',1.1,.25)
 a.tube('Curved flamingo neck',[(0,.015,.85),(-.11,.015,1.01),(-.07,-.015,1.20),(.045,-.02,1.24)],.041,'pink')
 def head():
  a.ell('Flamingo head',(.045,-.02,1.255),(.069,.058,.071),'pink')
  a.tube('Curved pale flamingo bill',[(.045,-.066,1.254),(.062,-.143,1.20),(.065,-.152,1.165)],.030,'ivory')
  a.ell('Black flamingo bill tip',(.065,-.153,1.157),(.025,.027,.032),'coal')
  a.ell('Flamingo eye',(.084,-.065,1.27),(.009,.006,.012),'coal')
 b.assembly('Flamingo neck tip',(.015,-.02,1.21),head,'rock','Y',.027,.6)
 a.tube('Supported serving wing',[(.13,0,.80),(.26,-.04,.87)],.033,'pink');fruit_tray((.265,-.05,.875))
 b.board_label('FRUIT SERVICE',(0,-.378,.14),.54,'teal',.028)

def fan_blades(p,r):
 x,y,z=p
 for k in range(5):q=k*math.tau/5;c.leaf('Carved palm fan blade',(x,y,z),r,r*.20,'woodlight',q,.05)
 a.ell('Fan central cap',p,(.05,.05,.025),'gold')

def tropical_fan():
 a.box('Fruit market wall backing',(0,.11,.65),(1.79,.06,1.23),'teal',.075)
 a.box('Curved market window',(0,.064,.63),(1.61,.029,1.04),'pith',.14)
 for x in [-.66,.66]:a.box('Market timber post',(x,-.025,.63),(.055,.15,.88),'wood',.018)
 a.box('Mini fruit counter',(0,-.065,.31),(1.47,.33,.10),'peach',.04)
 for i,x in enumerate([-.49,-.16,.16,.49]):
  a.box('Mini produce bin',(x,-.09,.42),(.26,.19,.08),'woodlight',.015)
  for j in range(4):a.ell('Market fruit',(x+(j%2-.5)*.087,-.13+(j//2)*.079,.48),(.048,.043,.045),['papaya','lemon','berry','mango'][i])
 # Fan faces the viewer; blades rotate around their actual axle.
 a.cyl('Wall fan bearing',(0,.035,.90),.045,.10,'gold').rotation_euler.x=math.pi/2
 def fan():b.relocated(lambda:fan_blades((0,0,0),.33),(0,-.031,.90),1).rotation_euler.x=math.pi/2
 b.assembly('Fan on wall bearing',(0,-.031,.90),fan,'spin','Y',0,.22)
 for x in [-.70,.70]:c.leaf('Carved wall foliage',(x,-.01,.74),.29,.095,'jade',1.2 if x<0 else 2.0,-.3)
 b.board_label('TRADE WIND MARKET',(0,-.24,.27),.79,'teal',.029)

def fruit_canopy():
 for x in [-.68,.68]:a.cyl('Ceiling trellis rose',(x,0,1.42),.076,.035,'gold');a.tube('Garden suspension',[(x,0,1.40),(x,0,1.14)],.012,'gold')
 for y in [-.23,.23]:a.tube('Curved bamboo trellis',[(-.87,y,1.04),(-.43,y,1.13),(0,y,1.16),(.43,y,1.13),(.87,y,1.04)],.029,'bamboo')
 for x in [-.78,-.39,0,.39,.78]:a.tube('Trellis crossbar',[(x,-.26,1.13),(x,.26,1.13)],.016,'woodlight')
 for x in [-.64,.64]:
  before=set(bpy.context.scene.objects);b.jar((x,0,1.10),.097,.13,'teal')
  for o in set(bpy.context.scene.objects)-before:
   if o.name.startswith(('Domed jar lid','Lid grip')):bpy.data.objects.remove(o,do_unlink=True)
  for k in range(4):c.leaf('Rooted trellis foliage',(x,0,1.22),.23,.060,'jade',k*1.6,-.3)
 for x,col in [(-.42,'lemon'),(0,'peach'),(.42,'berry')]:
  a.tube('Glass fruit pendant cord',[(x,-.20,1.11),(x,-.20,.76)],.006,'gold');a.ell('Glazed fruit pendant',(x,-.20,.67),(.095,.09,.105),col);c.leaf('Pendant leaf',(x,-.20,.77),.09,.03,'jade',.4)
 a.tube('Palm fan spindle',[(0,.10,1.15),(0,.10,.91)],.012,'gold')
 b.assembly('Palm fan on ceiling spindle',(0,.10,.91),lambda:fan_blades((0,.10,.91),.28),'spin','Z',0,.27)

def small_toucan(p,sc=.20,sleep=False):
 x,y,z=p;a.ell('Toucan folded body',(x,y,z+sc*.45),(sc*.43,sc*.30,sc*.48),'feather')
 c.leaf('Folded toucan tail',(x,y+.025,z+sc*.20),sc*.55,sc*.17,'feather',1.5,.5)
 a.ell('Toucan pale breast',(x,y-sc*.24,z+sc*.5),(sc*.29,.018,sc*.28),'ivory')
 a.ell('Toucan head',(x,y,z+sc*.94),(sc*.36,sc*.30,sc*.33),'feather')
 a.ell('Toucan long yellow beak',(x+.04,y-sc*.36,z+sc*.94),(sc*.43,sc*.29,sc*.18),'beak')
 a.ell('Toucan dark bill tip',(x+.055,y-sc*.57,z+sc*.92),(sc*.27,sc*.10,sc*.15),'tip')
 if sleep:a.tube('Sleeping closed eye',[(x-sc*.20,y-sc*.28,z+sc*1.02),(x-sc*.13,y-sc*.30,z+sc*.99),(x-sc*.055,y-sc*.30,z+sc*1.02)],.004,'ivory')
 else:a.ell('Toucan eye',(x-sc*.18,y-sc*.28,z+sc*1.03),(.01,.006,.012),'ivory')

def banana_hammock():
 base(color='teal')
 for x in [-.58,.58]:b.relocated(lambda:a.palm((0,0,0),.92),(x,.05,.18),.78)
 # Fabric and sleeper form one hanging assembly, pivoting about its support line.
 def bed():
  a.tube('Banana-yellow curved hammock',[(-.62,0,.75),(-.34,-.01,.43),(0,-.02,.36),(.34,-.01,.43),(.62,0,.75)],.087,'lemon')
  for y in [-.062,.062]:a.tube('Stitched hammock seam',[(-.62,y,.75),(-.34,y,.49),(0,y,.43),(.34,y,.49),(.62,y,.75)],.006,'ivory')
  small_toucan((-.08,-.01,.44),.23,True)
 b.assembly('Hammock suspended between palm trunks',(0,0,.75),bed,'rock','X',.023,.43)
 for x in [-.47,.47]:a.ell('Smooth garden stone',(x,-.24,.205),(.12,.09,.038),'stone');c.leaf('Grounded garden leaf',(x,-.17,.22),.16,.05,'jade',x*3)
 b.board_label('THE BANANA DAY OFF',(0,-.40,.14),.84,'teal',.030)

def barrel(p,r=.10,h=.24):
 x,y,z=p;a.lathe('Coopered oak barrel',a.soft_profile([(r*.81,z),(r,z+h*.24),(r*1.05,z+h*.5),(r,z+h*.76),(r*.81,z+h)]),'woodlight',steps=24).location=(x,y,0)
 for zz,rr in [(z+h*.12,r*.95),(z+h*.85,r*.94)]:a.ring('Forged barrel hoop',(x,y,zz),rr,'gold',.008)
 a.cyl('Oak barrel head',(x,y,z+h),r*.78,.014,'wood')
 for i in range(12):q=i*math.tau/12;a.tube('Oak stave seam',[(x+math.cos(q)*rr,y+math.sin(q)*rr,zz) for rr,zz in [(r*.83,z+.016),(r*1.055,z+h*.5),(r*.83,z+h-.01)]],.002,'wood')

def cork_atelier():
 base(color='wood')
 profile=a.soft_profile([(.57,.18),(.62,.25),(.63,.96),(.56,1.15)])
 o=a.lathe('Giant carved cork workshop',profile,'cork',0,math.pi,steps=32);o.scale.y=.56
 o=a.lathe('Dark cork cutaway interior',[(r-.035,z) for r,z in profile],'corkdark',0,math.pi,steps=32);o.scale.y=.56
 for side in [-1,1]:a.tube('Polished cork cut edge',[(side*r,0,z) for r,z in profile],.014,'gold')
 a.box('Cooper workbench',(0,-.055,.52),(1.04,.37,.08),'wood',.027)
 for x in [-.44,.44]:a.box('Workbench leg',(x,.02,.36),(.072,.17,.31),'wood',.018)
 for x in [-.34,-.17,0]:a.cyl('Uncut cork', (x,-.13,.60),.039,.076,'cork')
 a.box('Cork press bed',(.32,-.03,.61),(.28,.23,.06),'gold',.02)
 for x in [.22,.42]:a.tube('Cork press upright',[(x,.01,.63),(x,.01,.98)],.014,'gold')
 a.tube('Cork press crossbeam',[(.20,.01,.98),(.44,.01,.98)],.015,'gold');a.tube('Press screw',[(.32,.01,.70),(.32,.01,1.05)],.010,'steel')
 def crank():
  a.ring('Press handwheel',(.32,.01,1.03),.11,'gold',.009)
  for i in range(4):q=i*math.pi/2;a.tube('Handwheel spoke',[(.32,.01,1.03),(.32+math.cos(q)*.10,.01+math.sin(q)*.10,1.03)],.006,'gold')
 b.assembly('Cork press screw bearing',(.32,.01,1.03),crank,'rock','Z',.13,.52)
 u.cheesemonger((-.23,.015,.57))
 # Carved tools and shelves make a working corkmaker's shop, not an empty shell.
 a.box('Atelier hanging tool rail',(-.21,.24,1.01),(.51,.035,.038),'gold',.01)
 for i,x in enumerate([-.41,-.25,-.09]):
  a.tube('Craft tool handle',[(x,.20,.96),(x,.20,.79)],.012,'woodlight')
  a.box('Cork cutting blade',(x,.20,.78),(.05,.018,.055),'steel',.008)
 for x in [-.39,-.23,-.06]:
  a.box('Cork drawer',(x,-.253,.447),(.13,.029,.095),'woodlight',.014);a.ell('Drawer brass pull',(x,-.273,.45),(.012,.008,.012),'gold')
 a.box('Finished cork stock shelf',(-.19,.22,.72),(.49,.20,.034),'woodlight',.012)
 for i in range(5):a.cyl('Cut cork stock',(-.37+i*.085,.20,.773),.027,.072,'cork')
 for x in [-.72,.73]:a.bottle((x,.04,.18),.16,'garnet')
 b.board_label('THE CORKMAKERS ATELIER',(0,-.40,.14),1.05,'wood',.028)

def sommelier():
 base(.92,.80,'wood')
 for dx in [-.10,.10]:
  a.ell('Polished planted shoe',(dx,-.05,.205),(.073,.11,.042),'coal');a.tube('Tailored trouser leg',[(dx,.015,.25),(dx,0,.52)],.047,'coal')
 a.ell('Burgundy tailored jacket',(0,0,.70),(.18,.12,.24),'velvet')
 a.box('Ivory shirt front',(0,-.117,.80),(.15,.018,.21),'ivory',.016)
 for dx in [-.045,.045]:a.ell('Sommelier bow tie',(dx,-.14,.86),(.04,.020,.022),'coal')
 for z in [.64,.73]:a.ell('Jacket brass button',(.04,-.124,z),(.011,.008,.012),'gold')
 a.tube('Arm supporting tasting tray',[(.15,0,.80),(.23,-.13,.72),(.31,-.17,.85)],.037,'velvet')
 a.ell('Hand beneath tray',(.31,-.17,.88),(.038,.028,.025),'skin');a.cyl('Silver tasting tray',(.25,-.16,.914),.18,.021,'steel')
 b.relocated(lambda:c.tasting_glass(0,0,0),(.20,-.16,.93),.61);a.bottle((.33,-.16,.93),.080,'garnet')
 def head():
  a.ell('Expressive sommelier face',(0,-.01,1.12),(.11,.092,.135),'skin');a.ell('Swept dark hair',(0,.014,1.207),(.117,.09,.063),'coal')
  for dx in [-.042,.042]:a.ell('Kind sommelier eye',(dx,-.096,1.135),(.009,.005,.011),'coal')
  a.ell('Sommelier nose',(0,-.107,1.103),(.016,.022,.021),'skin');a.tube('Sommelier smile',[(-.027,-.096,1.07),(0,-.109,1.06),(.027,-.096,1.07)],.004,'wood')
 b.assembly('Sommelier greeting at neck',(0,0,1.0),head,'rock','X',.055,.51)
 b.board_label('THE VELVET SOMMELIER',(0,-.39,.14),.76,'wood',.024)

def cellar_window():
 a.box('Deep cellar backing',(0,.18,.64),(1.78,.06,1.18),'velvet',.10)
 for x in [-.78,.78]:a.box('Limestone window jamb',(x,-.015,.57),(.13,.38,1.02),'stone',.032)
 a.tube('Rounded limestone arch',[(-.78,-.015,.97),(-.48,-.015,1.21),(0,-.015,1.27),(.48,-.015,1.21),(.78,-.015,.97)],.073,'stone')
 a.box('Stone cellar sill',(0,-.04,.065),(1.86,.52,.10),'stone',.035)
 for z in [.28,.55,.83]:
  a.box('Cellar walnut shelf',(0,.03,z),(1.34,.26,.033),'wood',.012)
  for x in [-.52,-.26,0,.26,.52]:a.bottle((x,.02,z+.02),.095,'garnet')
 a.tube('Cellar lantern suspension',[(0,-.10,1.22),(0,-.10,1.10)],.006,'gold');b.lantern((0,-.10,1.02),.069,.17)
 # Barrel rotation stays within a cooper's cradle, avoiding sliding miniature people.
 a.box('Barrel cradle',(-.34,-.16,.16),(.36,.28,.083),'wood',.024)
 def rocking_barrel():b.relocated(lambda:barrel((0,0,-.13),.11,.26),(-.34,-.16,.30),1).rotation_euler.x=math.pi/2
 b.assembly('Barrel inspection cradle',(-.34,-.16,.30),rocking_barrel,'rock','Y',.07,.43)
 u.cheesemonger((.32,-.15,.12))
 b.board_label('WINDOW ON THE LAST VINTAGE',(0,-.305,.072),1.16,'wood',.028)

def gazebo():
 base(color='wood');a.box('Limestone pavilion floor',(0,0,.23),(1.59,.69,.12),'stone',.04)
 for x in [-.64,.64]:
  for y in [-.20,.20]:a.cyl('Pavilion limestone column',(x,y,.67),.045,.81,'stone');a.cyl('Column capital',(x,y,1.09),.071,.065,'ivory')
 a.box('Pavilion cornice',(0,0,1.145),(1.56,.66,.088),'stone',.041)
 for x in [-.60,-.30,0,.30,.60]:a.tube('Pergola carved beam',[(x,-.31,1.215),(x,.31,1.215)],.025,'wood')
 for x in [-.66,.66]:b.vine((x,-.235,.41),.61)
 for x in [-.57,-.21,.21,.57]:c.leaf('Rooted pergola leaf',(x,.04,1.245),.25,.095,'jade',x*3,-.10)
 for x in [-.57,-.29,0,.29,.57]:
  a.tube('Climbing roof vine',[(x,-.27,1.16),(x+.08,-.27,1.26)],.006,'gold')
  for row in range(3):
   for k in range(3-row):a.ell('Gazebo purple grape',(x+(k-(2-row)/2)*.026,-.27,1.14-row*.028),(.020,.020,.022),'grape')
 a.box('Tasting bench',(0,.12,.46),(.91,.23,.046),'wood',.023)
 for x in [-.37,.37]:a.box('Tasting bench leg',(x,.12,.365),(.045,.14,.18),'wood',.012)
 a.box('Small tasting table',(0,-.14,.60),(.45,.22,.036),'woodlight',.02);a.box('Table pedestal',(0,-.14,.46),(.04,.05,.27),'gold',.009)
 for x in [-.13,.13]:b.relocated(lambda:c.tasting_glass(0,0,0),(x,-.14,.624),.42)
 a.tube('Pavilion lantern hook',[(0,.0,1.17),(0,0,1.03)],.006,'gold')
 b.assembly('Pavilion lantern hinge',(0,0,1.035),lambda:b.lantern((0,0,.96),.057,.13),'rock','Y',.032,.5)
 b.board_label('THE GRAPE GAZEBO',(0,-.40,.14),.86,'wood',.032)

BUILDERS={
 'domain_gochujang_hanok_roof':rooftop,'domain_gochujang_pepper_band':pepper_band,'domain_gochujang_ant_delivery':delivery,'domain_gochujang_steam_gate':steam_gate,
 'domain_smoothie_fruit_flamingo':flamingo,'domain_smoothie_tropical_fan':tropical_fan,'domain_smoothie_sorbet_cloud':fruit_canopy,'domain_smoothie_banana_hammock':banana_hammock,
 'domain_wines_cork_captain':cork_atelier,'domain_wines_harvest_bear':sommelier,'domain_wines_cellar_window':cellar_window,'domain_wines_grape_gazebo':gazebo,
}

def build_all(builders,version):
 a.BUILDERS=builders
 for name in (a.args.only.split(',') if a.args.only else builders):
  a.build(name);path=a.OUT/(name+'.json');record=json.loads(path.read_text());record.update(version=version,source=str(Path(__file__).resolve()),sourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),reviewStatus='Original authored study; renderer and owner review required',approved=False);path.write_text(json.dumps(record,indent=2),encoding='utf-8')
 for source in [Path(__file__),Path(u.__file__),Path(s.__file__),Path(b.__file__),Path(c.__file__),Path(a.__file__)]: (a.OUT/source.name).write_bytes(source.read_bytes())

if __name__=='__main__':build_all(BUILDERS,'3.0.0-super-uncommon.1')
