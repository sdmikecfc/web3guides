"""Nine individually authored Super Commons. Original meshes, no paid generation.
Run into a new D: review directory; the approved nine heroes remain untouched.
"""
import importlib.util, math, bpy, json, hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('common_set',Path(__file__).with_name('dk-build-domain-common-set.py'))
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b);a=b.a;c=b.c
a.P.update({'coconut':('#855436',0,.52),'fibre':('#4d3627',0,.64),'berrymilk':('#e5a6b2',0,.27),'frost':('#cce4d9',0,.20),'sand':('#edd6ae',0,.59)})

def work(pivot):pivot['dkAnimateOnlyWorking']=True;return pivot
def gauge(p,r=.052):
 x,y,z=p;a.cyl('Brass pressure gauge',p,r,.018,'gold').rotation_euler.x=math.pi/2;a.cyl('Ivory gauge dial',(x,y-.012,z),r*.82,.004,'ivory').rotation_euler.x=math.pi/2
 for i in range(9):
  q=.2+i*math.pi*.32;a.tube('Fine gauge marking',[(x+math.cos(q)*r*.64,y-.015,z+math.sin(q)*r*.64),(x+math.cos(q)*r*.76,y-.015,z+math.sin(q)*r*.76)],.0015,'coal')
 a.tube('Pressure pointer',[(x,y-.018,z),(x-r*.36,y-.018,z+r*.36)],.002,'enamel')
def drip(p,w=.55,d=.22):
 x,y,z=p;a.box('Copper drip tray',p,(w,d,.03),'gold',.025);a.box('Dark tray inset',(x,y,z+.017),(w-.04,d-.04,.009),'coal',.02)
 for i in range(12):a.box('Tray slat',(x+(i-5.5)*(w-.06)/12,y,z+.027),(.010,d-.06,.008),'steel',.004)
def mug(p,r=.045,color='ivory'):
 x,y,z=p;a.lathe('Thick coffee cup',[(r*.75,z),(r,z+.014),(r,z+.09),(r-.009,z+.09),(r-.009,z+.015)],color,steps=24).location=(x,y,0)
 a.cyl('Coffee resting in cup',(x,y,z+.076),r-.01,.004,'wood');a.ring('Coffee cup lip',(x,y,z+.09),r,color,.005)
 a.tube('Cup handle',[(x+r,y,z+.070),(x+r+.025,y,z+.072),(x+r+.025,y,z+.032),(x+r,y,z+.031)],.006,color)
def steam(p):
 def plume():
  x,y,z=p
  for i in range(3):a.ell('Restrained steam puff',(x+.009*i,y,z+.035*i),(.018+.005*i,.018,.017),'paleglass')
 pivot=b.assembly('Steam from working vent',p,plume,'float','Z',.018,.8);pivot['dkWorkOnly']=True

def captain():
 c.footed_base(.84,.70,'onggi');c.ant_chef((0,.035,.18),.62,False)
 # The friendly head moves at the neck; six feet and the serving arm stay fixed.
 head=bpy.data.objects.new('Host neck joint',None);bpy.context.collection.objects.link(head);head.parent=a.root;head.location=(0,.026,.83);head['dkMotion']='rock';head['dkAxis']='X';head['dkAmount']=.027;head['dkSpeed']=.7
 prefixes=['Sculpted ant face','Ant muzzle','Cream eye','Dark pupil','Eye glint','Jointed antenna','Antenna tip','Smile','Kitchen headband']
 for o in list(bpy.context.scene.objects):
  if any(o.name.startswith(k) for k in prefixes):a.parent(o,head)
 # Bow tie, enamel buttons and a pepper welcome shield establish a host.
 for side in [-1,1]:a.ell('Host red bow tie',(side*.036,-.104,.744),(.034,.012,.017),'enamel')
 a.box('Little welcome sign',(-.275,-.105,.72),(.14,.022,.20),'onggi',.022);c.letter('OPEN',(-.275,-.120,.744),.038,'ivory');c.pepper((-.30,-.128,.70),.07)
 a.tube('Sign pole',[(-.275,-.10,.24),(-.275,-.10,.66)],.010,'gold')
 b.board_label('NIGHT SHIFT',(0,-.338,.14),.42,size=.033)

def mandu_steamer():
 # Cloud-glazed cooker around a real basket volume, with a supported lid.
 c.footed_base(.86,.77,'onggi');a.box('Steamer enamel cabinet',(0,0,.36),(.74,.64,.39),'ivory',.085)
 for x,z,r in [(-.26,.49,.14),(0,.54,.18),(.26,.49,.14)]:a.ell('Cloud ceramic casing',(x,.10,z),(r,.24,r),'ivory')
 a.cyl('Steel heating basin',(0,0,.605),.30,.044,'steel');b.steam_basket((0,0,.635),.285,.16);b.steam_basket((0,0,.80),.26,.16)
 a.cyl('Woven steamer lid',(0,0,.986),.282,.035,'bamboo');a.ring('Lid bamboo rim',(0,0,1.006),.273,'bambooshade',.008)
 for i in range(-5,6):
  x=i*.044;length=math.sqrt(max(0,.255**2-x*x));a.box('Lid woven strip',(x,0,1.009),(.013,length*2,.005),'ivory',.002)
 a.tube('Bamboo loop handle',[(-.06,0,1.01),(-.058,0,1.084),(.058,0,1.084),(.06,0,1.01)],.012,'bambooshade')
 for side in [-1,1]:a.tube('Steamer copper carry grip',[(side*.27,0,.686),(side*.36,0,.724),(side*.36,0,.802),(side*.265,0,.80)],.020,'gold')
 gauge((-.16,-.321,.39));a.cyl('Steamer temperature control',(.13,-.332,.37),.037,.025,'enamel').rotation_euler.x=math.pi/2
 b.board_label('MANDU',(0,-.324,.255),.29,size=.041);steam((.16,.11,1.04))

def spice_drinks():
 c.footed_base(.83,.75,'onggi');drip((0,-.20,.223),.60,.37)
 a.cyl('Pepper urn pedestal',(0,.09,.245),.145,.17,'gold');a.ring('Pedestal bottom collar',(0,.09,.18),.15,'onggi',.012)
 body=a.lathe('Sculpted pepper soda urn',a.soft_profile([(.14,.28),(.29,.38),(.31,.69),(.23,.94),(.11,1.06)]),'enamel',steps=48);body.location.y=.09
 for i in range(6):
  q=i*math.tau/6;a.tube('Pepper enamel fluting',[(math.cos(q)*r,.09+math.sin(q)*r,z) for r,z in [(.15,.32),(.27,.47),(.295,.69),(.22,.91)]],.008,'onggi')
 a.tube('Pepper stem',[(0,.09,1.057),(.035,.10,1.20),(.12,.10,1.23)],.025,'jade')
 for q in [0,2,4]:c.leaf('Pepper crown leaf',(0,.09,1.045),.15,.045,'jade',q,-.20)
 for x in [-.17,0,.17]:
  a.tube('Copper soda tap',[(x,-.19,.57),(x,-.35,.57),(x,-.35,.505)],.013,'gold')
  a.tube('Valve stem',[(x,-.26,.57),(x,-.26,.605)],.010,'gold');a.ell('Jade tap handle',(x,-.26,.635),(.021,.024,.045),'jade')
 gauge((0,-.198,.83),.059)
 def dial():
  a.ring('Pepper valve wheel',(.29,.09,.71),.063,'gold',.009,axis='Y')
  for i in range(4):q=i*math.pi/2;a.tube('Valve wheel spoke',[(.29,.09,.71),(.29+math.cos(q)*.06,.09,.71+math.sin(q)*.06)],.007,'gold')
 work(b.assembly('Working pepper valve',(.29,.09,.71),dial,'rock','Y',.10,.7));b.board_label('PEPPER SODA',(0,-.366,.141),.43,size=.032)

def pineapple_cabana():
 c.footed_base(.97,.83,'teal')
 profile=a.soft_profile([(.24,.17),(.37,.25),(.40,.60),(.31,.94),(.19,1.0)])
 a.lathe('Golden pineapple cabana',profile,'lemon',0,math.pi);a.lathe('Cream fruit interior',[(r-.018,z) for r,z in profile],'pith',0,math.pi)
 for side in [-1,1]:a.tube('Pineapple cut lip',[(side*r,-.009,z) for r,z in profile[::4]],.013,'gold')
 for row in range(5):
  z=.29+row*.13;r=.39-.055*abs(row-2)
  for col in range(7):
   q=(col+.5)*math.pi/7;x,y=math.cos(q)*(r+.005),math.sin(q)*(r+.005);o=a.box('Pineapple carved diamond',(x,y,z),(.069,.021,.069),'papaya',.009);o.rotation_euler=(0,math.pi/4,q-math.pi/2)
 for i in range(9):c.leaf('Pineapple pointed crown',(0,.12,1.01),.34,.057,'jade' if i%2 else 'fruitleaf',i*math.tau/9,-.90)
 a.box('Cabana timber deck',(0,-.025,.258),(.63,.53,.035),'woodlight',.05)
 for i in range(8):a.box('Cabana decking seam',((i-3.5)*.071,-.035,.278),(.004,.47,.004),'wood',.001)
 # Tiny lounge chair and supported palm-leaf parasol, not floating fruit actors.
 for x in [-.23,-.05]:a.tube('Deck chair frame',[(x,-.22,.285),(x,-.11,.47),(x,.13,.56),(x,.10,.285)],.011,'wood')
 a.box('Coral deck chair cushion',(-.14,-.06,.41),(.20,.28,.022),'peach',.017).rotation_euler.x=.39
 a.box('Lounger head cushion',(-.14,.086,.51),(.19,.10,.032),'ivory',.023).rotation_euler.x=.50
 a.cyl('Tiny fruit table top',(.16,-.09,.401),.095,.021,'ivory');a.cyl('Tiny table pedestal',(.16,-.09,.341),.020,.10,'gold');c.citrus((.16,-.09,.42),.038)
 a.tube('Parasol central post',[(.20,.15,.28),(.20,.15,.77)],.010,'gold')
 def canopy():
  a.cyl('Tiny parasol canopy',(.20,.15,.766),.205,.064,'teal',.026);a.cyl('Parasol finial',(.20,.15,.812),.014,.031,'gold')
  for i in range(8):q=i*math.tau/8;a.tube('Parasol stitched rib',[(.20,.15,.80),(.20+math.cos(q)*.19,.15+math.sin(q)*.19,.737)],.003,'ivory')
 b.assembly('Parasol on fixed pole',(.20,.15,.77),canopy,'rock','Z',.045,.4);b.board_label('CABANA CLUB',(0,-.409,.14),.43,'teal',.033)

def berry_fridge():
 c.footed_base(.88,.76,'teal')
 # A proper hollow glasshouse cabinet, with a botanical arched crown.
 a.box('Cabinet rear',(0,.30,.73),(.77,.037,1.08),'berrymilk',.035)
 for x in [-.365,.365]:
  for y in [-.273,.273]:a.box('Fridge corner upright',(x,y,.73),(.052,.054,1.10),'teal',.02)
  a.box('Glasshouse side glazing',(x,0,.73),(.012,.50,1.02),'paleglass',.005)
 for z in [.25,.57,.90,1.24]:a.box('Glasshouse shelf',(0,0,z),(.72,.56,.024),'ivory',.013);a.tube('Brass shelf guard',[(-.31,-.25,z+.03),(.31,-.25,z+.03)],.006,'gold')
 for row,z in enumerate([.28,.60,.93]):
  for x in [-.23,0,.23]:
   a.box('Chilled fruit carton',(x,.05,z+.047),(.14,.18,.075),'woodlight',.010)
   for j in range(4):a.ell('Chilled berries',(x+(j%2-.5)*.06,.035+(j//2)*.06,z+.099),(.034,.032,.034),'berry' if row%2 else 'grape')
 a.box('Clear frontal door',(0,-.286,.73),(.66,.012,.95),'crystal',.02)
 for x in [-.34,.34]:a.box('Brass door stile',(x,-.298,.73),(.016,.025,1.04),'gold',.006)
 a.tube('Fridge door handle',[(.25,-.316,.59),(.25,-.365,.64),(.25,-.365,.84),(.25,-.316,.89)],.011,'gold')
 a.box('Crown lintel',(0,0,1.28),(.82,.67,.05),'teal',.033)
 vertices=[];faces=[]
 for y in [-.285,.285]:
  for i in range(17):q=i*math.pi/16;vertices.append((-.35*math.cos(q),y,1.31+.16*math.sin(q)))
 for i in range(16):faces.append((i,i+1,i+18,i+17))
 mesh=bpy.data.meshes.new('Arched botanical glass roof');mesh.from_pydata(vertices,[],faces);mesh.update();roof=bpy.data.objects.new('Arched botanical glass roof',mesh);bpy.context.collection.objects.link(roof);a.finish(roof,roof.name,'paleglass');roof.modifiers.new('Real glass thickness','SOLIDIFY').thickness=.005
 for y in [-.285,0,.285]:a.tube('Glasshouse curved roof rib',[(-.35*math.cos(i*math.pi/12),y,1.31+.16*math.sin(i*math.pi/12)) for i in range(13)],.007,'gold')
 for x,z in [(-.35,1.31),(0,1.47),(.35,1.31)]:a.tube('Glasshouse canopy joining rail',[(x,-.285,z),(x,.285,z)],.008,'gold')
 a.tube('Fine botanical door vine',[(-.325,-.313,.44),(-.31,-.313,.79),(-.335,-.313,1.09)],.005,'gold')
 for i in range(4):c.leaf('Berry door enamel leaf',(-.321,-.312,.55+i*.135),.057,.020,'jade',1.5+i*.6,-.3)
 work(b.assembly('Supply indicator leaf',(0,-.30,1.31),lambda:c.leaf('Enamel berry leaf',(0,-.30,1.31),.115,.039,'jade',.5),'rock','Y',.07,.7))
 b.board_label('BERRY HOUSE',(0,-.332,.176),.47,'teal',.033)

def coconut_coffee():
 c.footed_base(.92,.80,'teal');drip((0,-.21,.207),.67,.28)
 a.cyl('Coconut boiler brass pedestal',(0,.08,.26),.20,.20,'gold');a.ring('Pedestal coconut collar',(0,.08,.32),.22,'wood',.015)
 shell=a.lathe('Polished coconut coffee boiler',a.soft_profile([(.19,.29),(.34,.38),(.37,.66),(.30,.91),(.10,1.06)]),'coconut',steps=48);shell.location.y=.08
 for i in range(16):
  q=i*math.tau/16;a.tube('Carved coconut fibre',[(math.cos(q)*r,.08+math.sin(q)*r,z) for r,z in [(.22,.31),(.34,.44),(.371,.63),(.31,.88),(.11,1.05)]],.003,'fibre')
 a.ring('Coconut brass collar',(0,.08,.94),.255,'gold',.012)
 for x in [-.145,.145]:
  a.tube('Espresso group neck',[(x,-.13,.72),(x,-.28,.72),(x,-.28,.61)],.027,'gold');a.cyl('Portafilter',(x,-.28,.59),.045,.035,'steel');a.tube('Wooden filter handle',[(x,-.28,.59),(x+.10,-.28,.59)],.016,'wood')
  mug((x,-.22,.24),.039)
 gauge((0,-.259,.83));a.tube('Steam wand',[(.27,-.08,.74),(.36,-.22,.64),(.32,-.29,.42)],.009,'gold')
 for i in range(5):c.leaf('Brass palm crown',(0,.08,1.045),.23,.042,'gold',i*math.tau/5,-.23)
 steam((.05,.10,1.10));b.board_label('COCONUT CLUB',(0,-.398,.139),.48,'teal',.029)

def limestone_hearth():
 c.footed_base(.95,.85,'wood');a.box('Stone hearth body',(0,.04,.58),(.87,.67,.84),'stone',.090)
 # Segmented arch, a dark recessed oven, visible ledge and proper door below.
 a.box('Black oven opening',(0,-.306,.68),(.63,.018,.49),'coal',.10)
 for i in range(9):
  q=i*math.pi/8;o=a.box('Cut limestone arch block',(math.cos(q)*.32,-.32,.76+math.sin(q)*.23),(.126,.055,.14),'ivory',.013);o.rotation_euler.y=math.pi/2-q
 a.box('Oven lower door',(0,-.33,.405),(.62,.030,.13),'wood',.020);a.tube('Hearth brass handle',[(-.18,-.359,.435),(-.18,-.399,.445),(.18,-.399,.445),(.18,-.359,.435)],.014,'gold')
 a.box('Stone baking ledge',(0,-.30,.529),(.73,.24,.045),'ivory',.020);a.box('Oven dark interior',(0,-.32,.62),(.54,.027,.16),'coal',.03)
 def glow():
  for x in [-.17,0,.17]:a.ell('Small fire behind grate',(x,-.341,.63),(.040,.009,.047),'flame')
 flames=b.assembly('Hearth while baking',(0,-.342,.63),glow,'rock','Y',.025,.9);flames['dkWorkOnly']=True
 a.box('Walnut mantel',(0,.015,1.039),(.95,.77,.061),'wood',.055)
 for side in [-1,1]:b.vine((side*.36,-.321,.60),.30)
 b.board_label('THE HEARTH',(0,-.367,.259),.47,'wood',.034)

def cellar_coffee():
 c.footed_base(.95,.80,'wood');drip((0,-.23,.225),.72,.29)
 for x in [-.35,.35]:
  for y in [-.04,.21]:a.cyl('Espresso cabinet brass foot',(x,y,.272),.037,.23,'gold')
 a.box('Rear boiler support',(0,.19,.307),(.50,.20,.30),'wood',.028)
 a.box('Burgundy enamel boiler',(0,.07,.70),(.65,.44,.57),'velvet',.10)
 for side in [-1,1]:
  a.box('Carved walnut cheek',(side*.35,.07,.68),(.078,.46,.62),'wood',.05)
  b.vine((side*.345,-.178,.41),.40)
 a.box('Brass top cup warmer',(0,.045,1.006),(.67,.42,.031),'gold',.045)
 for x in [-.18,.18]:
  a.tube('Espresso group',[(x,-.16,.72),(x,-.31,.72),(x,-.31,.58)],.025,'gold');a.cyl('Coffee group head',(x,-.31,.574),.046,.031,'steel');mug((x,-.22,.259),.044)
 for x in [-.17,0,.17]:a.cyl('Cream control dial',(x,-.167,.846),.027,.020,'ivory').rotation_euler.x=math.pi/2
 gauge((0,-.166,.962),.046);a.tube('Copper steam wand',[(.30,-.02,.69),(.39,-.16,.55),(.35,-.27,.41)],.010,'gold')
 for x in [-.13,.13]:mug((x,.05,1.025),.032,'velvet')
 c.leaf('Vent grape leaf',(.13,.13,1.046),.13,.057,'gold',.8,-.4);steam((.14,.13,1.13));b.board_label('AFTER DINNER',(0,-.386,.139),.48,'wood',.032)

def vineyard_cooler():
 c.footed_base(.90,.80,'wood');drip((0,-.22,.23),.70,.30)
 a.box('Limestone tower pedestal',(0,.095,.21),(.62,.43,.11),'stone',.035)
 a.box('Porcelain cask tower',(0,.095,.49),(.58,.39,.47),'ivory',.055)
 a.box('Bottle alcove backing',(0,.25,.94),(.58,.08,.45),'wood',.024)
 for side in [-1,1]:a.box('Limestone alcove column',(side*.252,.075,.94),(.075,.33,.45),'stone',.018)
 a.box('Bottle alcove shelf',(0,.05,.738),(.51,.34,.027),'gold',.012)
 for x,s,color in [(-.145,.145,'wine'),(0,.16,'leaf'),(.145,.145,'wine')]:
  a.bottle((x,.055,.758),s,color)
 a.box('Clear bottle display glass',(0,-.098,.947),(.43,.008,.36),'paleglass',.015)
 a.tube('Bottle shelf retaining rail',[(-.215,-.08,.79),(.215,-.08,.79)],.007,'gold')
 for x in [-.25,.25]:a.tube('Brass tower pilaster',[(x,-.10,.31),(x,-.10,1.13)],.017,'gold')
 for x in [-.13,.13]:
  a.cyl('Oak cask end',(x,-.112,.54),.113,.032,'wood').rotation_euler.x=math.pi/2
  hoop=a.ring('Brass cask hoop',(x,-.134,.54),.104,'gold',.009);hoop.rotation_euler.x=math.pi/2
  for dx in [-.056,0,.056]:
   h=math.sqrt(.092**2-dx**2);a.tube('Oak stave seam',[(x+dx,-.133,.54-h),(x+dx,-.133,.54+h)],.002,'corkdark')
  a.tube('Chilled cask serving tap',[(x,-.142,.54),(x,-.282,.54),(x,-.282,.46)],.016,'gold');a.ell('Garnet valve handle',(x,-.21,.596),(.020,.024,.034),'garnet')
 a.box('Limestone tower cap',(0,.07,1.184),(.67,.49,.065),'stone',.05)
 for side in [-1,1]:b.vine((side*.26,-.124,.85),.23)
 b.board_label('VINEYARD',(0,-.191,1.174),.35,'wood',.035)
 a.tube('Weather-vane mast',[(0,.07,1.22),(0,.07,1.43)],.010,'gold')
 def vane():
  a.tube('Weather vane pointer',[(-.145,.07,1.395),(.145,.07,1.395)],.007,'gold');c.leaf('Grape-leaf vane',(-.09,.07,1.397),.082,.037,'gold',0);a.ell('Vane pivot',(0,.07,1.397),(.016,.016,.018),'gold')
 work(b.assembly('Serving weather vane',(0,.07,1.395),vane,'rock','Z',.08,.6));b.board_label('CELLAR COOLER',(0,-.395,.139),.49,'wood',.029)

BUILDERS={
 'domain_gochujang_fireant_doorman':captain,'domain_gochujang_mandu_steamer':mandu_steamer,'domain_gochujang_spice_drinks':spice_drinks,
 'domain_smoothie_pineapple_cabana':pineapple_cabana,'domain_smoothie_berry_fridge':berry_fridge,'domain_smoothie_coconut_coffee':coconut_coffee,
 'domain_wines_tartine_oven':limestone_hearth,'domain_wines_cellar_coffee':cellar_coffee,'domain_wines_vine_cooler':vineyard_cooler,
}
if __name__=='__main__':
 a.BUILDERS=BUILDERS
 for name in (a.args.only.split(',') if a.args.only else BUILDERS):
  a.build(name);path=a.OUT/(name+'.json');record=json.loads(path.read_text());record.update(version='3.0.0-super-common.1',source=str(Path(__file__).resolve()),sourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),reviewStatus='New original model; visual review pending',approved=False);path.write_text(json.dumps(record,indent=2),encoding='utf-8')
 for source in [Path(__file__),Path(b.__file__),Path(c.__file__),Path(a.__file__)]: (a.OUT/source.name).write_bytes(source.read_bytes())
