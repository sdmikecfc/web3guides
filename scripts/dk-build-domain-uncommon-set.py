"""Twelve original Regular Uncommons; authored for the three approved rooms.
Separate D: review outputs. No provider generation, automatic approval or release.
"""
import importlib.util, math, bpy, json, hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('super_common',Path(__file__).with_name('dk-build-domain-super-common-set.py'))
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s);a=s.a;b=s.b;c=s.c
a.P.update({'rind':('#286748',.02,.38),'rindlight':('#7ca855',0,.45),'melon':('#e48280',0,.33),'cheese':('#e5ba59',0,.55),'skin':('#c99973',0,.52)})

def rail_handle(p,w=.15,color='gold'):
 x,y,z=p;a.tube('Cabinet handle with two mounts',[(x-w/2,y+.022,z),(x-w/2,y,z),(x+w/2,y,z),(x+w/2,y+.022,z)],.012,color)

def counter_frame(color,top='ivory'):
 c.footed_base(.94,.79,color);a.box('Rounded cabinet carcass',(0,.015,.53),(.85,.67,.71),color,.065)
 a.box('Crafted stone worktop',(0,0,.925),(.96,.80,.080),top,.065)
 for x in [-.21,.21]:a.box('Inset drawer front',(x,-.33,.77),(.376,.030,.17),color,.024)
 for x in [-.21,.21]:a.box('Inset cupboard front',(x,-.33,.435),(.376,.030,.43),color,.030)
 a.box('Worktop shadow line',(0,-.343,.878),(.77,.016,.014),'coal',.002)

def melon_slice(x,y,z):
 def wedge(name,scale,height,color):
  xy=[(-.049,.075),(.049,.075),(0,-.070)];verts=[(x+xx*scale,y+yy*scale,z+zz) for zz in [0,height] for xx,yy in xy]
  mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)]);mesh.update()
  o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);a.finish(o,name,color)
 wedge('Green watermelon rind',1,.011,'rind');wedge('Pale watermelon pith',.94,.014,'pith');wedge('Pink watermelon flesh',.84,.019,'melon')
 for dx,dy in [(-.019,.027),(.019,.027),(0,-.022)]:a.ell('Watermelon seed',(x+dx,y+dy,z+.020),(.005,.009,.002),'seed')

def pepper_prep():
 counter_frame('onggi','coal')
 for x in [-.21,.21]:
  rail_handle((x,-.38,.77));c.pepper((x-.027,-.367,.57),.18)
  a.box('Cupboard corner brass inlay',(x,-.35,.258),(.30,.006,.009),'gold',.003)
 a.box('Inset chopping board',(-.085,-.07,.982),(.51,.43,.030),'woodlight',.035)
 for i in range(5):a.box('Board endgrain line',(-.265+i*.09,-.07,1.0),(.002,.38,.003),'wood',.001)
 b.jar((.31,.16,.969),.064,.13,'jade');b.jar((.13,.25,.969),.055,.115)
 for i in range(3):c.pepper((-.20+i*.075,-.11,1.023),.09)
 a.box('Knife blade',(.08,-.11,1.017),(.17,.048,.011),'steel',.007);a.box('Knife wooden handle',(.207,-.11,1.019),(.105,.037,.026),'wood',.012)
 def pointer():c.pepper((0,-.376,.775),.057)
 s.work(b.assembly('Preparation pepper pointer',(0,-.375,.746),pointer,'rock','Y',.08,.8))
 b.board_label('PEPPER WORKSHOP',(0,-.389,.142),.60,size=.028)

def coffee_ant():
 c.footed_base(.96,.80,'onggi');a.box('Barista station platform',(0,0,.21),(.86,.66,.08),'coal',.038)
 # A planted barista with a coffee cup, never a bowl of noodles.
 before=set(bpy.context.scene.objects);c.ant_chef((-.235,-.04,.253),.405,False)
 for o in set(bpy.context.scene.objects)-before:
  if o.name.startswith(('Glazed bowl','Bowl rim','Rich broth','Visible noodles','Scallion')):bpy.data.objects.remove(o,do_unlink=True)
 s.mug((-.109,-.178,.593),.038)
 a.cyl('Copper boiler foot',(.205,.09,.34),.165,.18,'gold')
 boiler=a.lathe('Spun copper coffee boiler',a.soft_profile([(.14,.39),(.205,.46),(.20,.94),(.16,1.06),(.11,1.09)]),'copper',steps=40);boiler.location=(.205,.09,0)
 a.ring('Boiler rolled collar',(.205,.09,1.066),.15,'gold',.010);a.ell('Pepper finial',(.205,.09,1.125),(.025,.025,.045),'enamel')
 a.tube('Coffee group pipe',[(.205,-.10,.76),(.205,-.257,.76),(.205,-.257,.60)],.024,'gold')
 a.cyl('Coffee group head',(.205,-.257,.589),.051,.025,'steel');s.drip((.205,-.22,.282),.34,.28);s.mug((.205,-.23,.313),.046)
 s.gauge((.205,-.116,.94));c.pepper((.36,-.016,.79),.11)
 a.tube('Brass steam vent',[(.27,.12,1.04),(.32,.17,1.15)],.017,'gold');s.steam((.32,.17,1.175))
 b.board_label('NIGHT SHIFT COFFEE',(0,-.386,.142),.68,size=.027)

def chilli_canopy():
 # All hanging detail is carried by the same rigid double-width trellis.
 for x in [-.79,.79]:a.cyl('Ceiling mounting rose',(x,0,1.30),.080,.044,'onggi');a.tube('Fixed canopy suspension',[(x,0,1.28),(x,0,1.0)],.009,'gold')
 a.box('Lacquer trellis front',(0,-.25,.97),(1.75,.055,.075),'onggi',.022);a.box('Lacquer trellis back',(0,.25,.97),(1.75,.055,.075),'onggi',.022)
 for x in [-.84,-.42,0,.42,.84]:a.box('Canopy crosspiece',(x,0,.97),(.049,.56,.068),'wood',.015)
 for i,x in enumerate([-.63,-.21,.21,.63]):
  before=set(bpy.context.scene.objects);b.jar((x,.06,.987),.091,.12,'jade')
  for o in set(bpy.context.scene.objects)-before:
   if o.name.startswith(('Domed jar lid','Lid grip')):bpy.data.objects.remove(o,do_unlink=True)
  a.cyl('Planter soil',(x,.06,1.084),.058,.014,'wood')
  for j in range(5):c.leaf('Rooted canopy foliage',(x,.06,1.09),.20,.065,'fruitleaf',j*math.tau/5,-.45)
  a.tube('Trailing garden stem',[(x,.07,1.09),(x+.06,-.14,1.08),(x+.05,-.22,.69)],.010,'jade')
  for k in range(4):c.leaf('Garden leaf',(x+.05,-.19,.75+k*.085),.14,.047,'fruitleaf',k*2.2,-.22)
  a.tube('Chilli pendant cord',[(x,-.22,.945),(x,-.22,.83-i%2*.1)],.005,'gold')
  def chilli(x=x,i=i):c.pepper((x,-.22,.83-i%2*.1),.31);a.ring('Ceramic pepper collar',(x,-.22,.83-i%2*.1),.019,'gold',.005)
  b.assembly('Chilli on its stem',(x,-.22,.92),chilli,'rock','Y',.018,.45+i*.06)
 b.board_label('MIDNIGHT GARDEN',(0,-.284,.975),.58,size=.028)

def stall_window():
 # A deep wall-mounted shop window, with visible shelf space behind the pass.
 a.box('Wall diorama backing',(0,.13,.61),(1.78,.055,1.17),'onggi',.045)
 a.box('Charcoal tiled interior',(0,.098,.60),(1.61,.020,1.01),'coal',.018)
 for x in [-.835,.835]:a.box('Shop window upright',(x,-.03,.61),(.077,.32,1.12),'gold',.025)
 a.box('Window sill',(0,-.075,.065),(1.82,.45,.105),'onggi',.035)
 a.box('Miniature noodle pass',(0,-.157,.47),(1.47,.17,.073),'steel',.025)
 a.box('Cook floor behind the pass',(0,.018,.215),(1.48,.14,.04),'wood',.012)
 for i in range(8):a.box('Pass red tile',((i-3.5)*.17,-.23,.30),(.16,.035,.24),'enamel',.012)
 for x in [-.57,.55]:
  a.cyl('Miniature red stool',(x,-.32,.223),.085,.038,'enamel');a.tube('Mini stool leg',[(x,-.32,.065),(x,-.32,.207)],.017,'steel')
 c.ant_chef((-.32,.006,.236),.38,False)
 for x in [.21,.44,.65]:a.bowl((x,-.13,.515),.075)
 a.box('Small bowl runners',(.12,-.195,.515),(.59,.10,.016),'wood',.009)
 b.assembly('Bowl carriage along miniature pass',(-.06,-.195,.535),lambda:a.bowl((-.06,-.195,.555),.074),'slide','X',.31,.62)
 for x in [-.54,.54]:a.tube('Lantern hanging thread',[(x,-.05,1.10),(x,-.05,.98)],.004,'gold');b.lantern((x,-.05,.925),.054,.12)
 a.box('Shop awning',(0,-.06,1.128),(1.84,.40,.055),'ivory',.034)
 for i in range(8):a.box('Awning lacquer stripe',((i-3.5)*.219,-.06,1.162),(.105,.37,.013),'enamel',.012)
 b.board_label('ONE MORE BOWL',(0,-.26,1.058),.66,size=.035)

def watermelon_prep():
 counter_frame('rind','pith')
 for x in [-.21,.21]:
  a.box('Watermelon pink drawer',(x,-.350,.77),(.337,.018,.123),'melon',.023);rail_handle((x,-.382,.77))
  for z in [.32,.42,.52]:a.tube('Carved rind stripe',[(x-.13,-.35,z-.035),(x,-.363,z),(x+.13,-.35,z+.025)],.008,'rindlight')
 # Terrazzo and a genuine removable chopping board, not food used as a worktop.
 for i in range(27):
  x=((i*17)%29/29-.5)*.83;y=((i*7)%23/23-.5)*.67;a.ell('Stone terrazzo chip',(x,y,.966),(.008+(i%3)*.003,.004,.0015),['melon','rindlight','gold'][i%3])
 a.box('Rounded prep board',(0,-.055,.987),(.53,.39,.035),'woodlight',.045)
 for x in [-.13,0,.13]:melon_slice(x,-.085,1.007)
 b.jar((.32,.21,.969),.061,.12,'ivory');a.tube('Utensil in crock',[(.32,.21,1.035),(.29,.20,1.21)],.006,'wood')
 s.work(b.assembly('Preparation leaf dial',(0,-.36,.77),lambda:c.leaf('Green melon dial',(0,-.367,.77),.086,.034,'jade',0),'rock','Y',.085,.7))
 b.board_label('WATERMELON WORKS',(0,-.389,.142),.64,'teal',.026)

def citrus_press():
 c.footed_base(.92,.79,'teal');a.box('Juicer motor pedestal',(0,.02,.42),(.51,.43,.48),'ivory',.073)
 a.box('Sunrise brass face',(0,-.20,.44),(.42,.023,.26),'gold',.045);s.gauge((0,-.222,.47),.054)
 # A cast sun with fixed rays frames the working, restrained central reamer.
 a.ring('Sunburst brass arch',(0,.105,.92),.28,'gold',.024,axis='Y')
 for i in range(11):
  q=i*math.pi/10;a.tube('Cast sunray',[(math.cos(q)*.29,.105,.92+math.sin(q)*.29),(math.cos(q)*.38,.105,.92+math.sin(q)*.38)],.018,'gold')
 a.cyl('Juicer catch bowl',(0,0,.752),.20,.095,'ivory',.235);a.ring('Catch bowl rolled lip',(0,0,.80),.228,'gold',.009)
 def reamer():
  a.cyl('Citrus reamer',(0,0,.858),.11,.11,'gold',.027)
  for i in range(8):q=i*math.tau/8;a.tube('Reamer ridge',[(math.cos(q)*.105,math.sin(q)*.105,.81),(math.cos(q)*.024,math.sin(q)*.024,.912)],.006,'ivory')
 s.work(b.assembly('Reamer shaft',(0,0,.83),reamer,'spin','Z',0,1.2))
 a.tube('Juice spout',[(0,-.18,.761),(0,-.30,.728),(0,-.32,.655)],.022,'gold');s.drip((0,-.245,.228),.37,.27)
 a.lathe('Juice tumbler',[(.065,.256),(.077,.47),(.069,.47),(.058,.266)],'paleglass',steps=28).location.y=-.25
 a.cyl('Orange juice',(0,-.25,.343),.059,.155,'orange')
 for x in [-.30,.30]:a.ell('Whole citrus',(x,.03,.246),(.081,.075,.081),'lemon');c.leaf('Citrus leaf',(x,.03,.324),.095,.031,'jade',x*4)
 b.board_label('SUNBURST PRESS',(0,-.385,.142),.51,'teal',.029)

def little_bird(p,scl=.12,color='teal',moving=False):
 x,y,z=p
 for dx in [-.032,.032]:a.tube('Planted bird toe',[(x+dx,y,z),(x+dx,y-.022,z)],.005,'gold')
 a.ell('Little bird body',(x,y+.01,z+.082),(scl*.58,scl*.49,scl*.69),color)
 c.leaf('Folded bird wing',(x+scl*.28,y,z+.08),scl*.85,scl*.25,'jade',1.6,.12)
 def head():
  a.ell('Small tropical bird head',(x,y-.01,z+.16),(scl*.45,scl*.46,scl*.46),color)
  a.ell('Ivory bird cheek',(x,y-.056,z+.159),(.030,.014,.033),'ivory');a.ell('Black bird eye',(x+.016,y-.068,z+.171),(.008,.006,.009),'coal')
  a.tube('Pointed bird beak',[(x,y-.052,z+.142),(x,y-.098,z+.139)],.014,'gold')
 if moving:b.assembly('Bird neck on its shoulders',(x,y-.01,z+.138),head,'rock','Z',.08,.55)
 else:head()

def berry_nest():
 # Open strawberry-shaped ceramic home. The opening is real geometry.
 a.box('Wall bracket backplate',(0,.365,.59),(.20,.030,.84),'gold',.025)
 profile=a.soft_profile([(.08,.05),(.24,.19),(.34,.43),(.32,.70),(.23,.90)])
 a.lathe('Strawberry ceramic shell',profile,'berry',0,math.pi,steps=40)
 a.lathe('Strawberry warm inner glaze',[(r-.021,z) for r,z in profile],'ivory',0,math.pi,steps=40)
 for side in [-1,1]:a.tube('Berry cutaway rim',[(side*r,-.005,z) for r,z in profile[::3]],.013,'gold')
 # Tiny pale seeds follow the curved shell; all are rooted into its outer surface.
 for k,(r,z) in enumerate([(.27,.24),(.333,.44),(.324,.63),(.27,.80)]):
  for j in range(7):q=.16+j*.46;a.ell('Strawberry seed',(math.cos(q)*r,math.sin(q)*r,z),(.011,.012,.019),'pith')
 for i in range(5):c.leaf('Strawberry leafy crown',(0,.035,.91),.26,.085,'jade',i*math.tau/5,-.26)
 a.tube('Curved berry stem',[(0,.05,.93),(.016,.065,1.065),(.09,.06,1.09)],.019,'jade')
 a.box('Birdhouse perch',(0,-.10,.33),(.53,.20,.050),'woodlight',.025)
 a.ring('Woven nest bowl',(0,.075,.38),.126,'bamboo',.026);a.cyl('Nest lining',(0,.075,.357),.12,.025,'bambooshade')
 little_bird((-.072,-.073,.357),.16,'teal',True);little_bird((.125,.067,.409),.095,'lemon')
 a.tube('Perch support',[(0,.355,.19),(0,-.08,.309)],.025,'gold')

def mango_pendant():
 a.cyl('Mango pendant ceiling rose',(0,0,1.42),.115,.037,'gold');a.tube('Pendant suspension',[(0,0,1.40),(0,0,1.18)],.009,'gold')
 a.ell('Warm mango milkglass',(0,0,.72),(.19,.16,.30),'ivory')
 # Folded peel segments curl around the light, with clear gaps between them.
 for i in range(5):
  q=i*math.tau/5;points=[(.02,1.19),(.19,1.07),(.285,.78),(.22,.48),(.08,.32)]
  a.tube('Sculpted mango peel ribbon',[(math.cos(q)*r,math.sin(q)*r,z) for r,z in points],.029,'mango')
  a.tube('Fine peel brass edge',[(math.cos(q)*r,math.sin(q)*r,z+.025) for r,z in points],.005,'gold')
 for z,r in [(1.18,.055),(.35,.065)]:a.ring('Pendant cap bead',(0,0,z),r,'gold',.014)
 a.tube('Leaf tassel suspension',[(0,0,.34),(0,0,.22)],.006,'gold')
 b.assembly('Leaf tassel at its joint',(0,0,.23),lambda:c.leaf('Enamel mango leaf',(0,0,.16),.14,.05,'jade',.3,.95),'rock','Y',.035,.55)

def tasting_cabinet():
 c.footed_base(.95,.78,'wood');a.box('Limestone lower cabinet',(0,.04,.36),(.82,.61,.39),'stone',.055)
 for x in [-.205,.205]:a.box('Walnut inset drawer',(x,-.271,.38),(.36,.026,.24),'wood',.025);rail_handle((x,-.307,.40),.105)
 a.box('Wine cabinet polished shelf',(0,0,.585),(.91,.72,.060),'wood',.04)
 for x in [-.37,.37]:a.tube('Bottle cradle supporting column',[(x,.08,.60),(x,.08,1.22)],.025,'gold')
 a.tube('Arched cellar canopy',[(-.37,.08,1.22),(0,.08,1.38),(.37,.08,1.22)],.026,'gold')
 a.tube('Cradle vertical bearing',[(0,.08,1.36),(0,.08,1.24)],.012,'gold')
 def cradle():
  a.ring('Brass bottle cradle',(0,.08,1.01),.235,'gold',.014,axis='Y')
  a.box('Cradle lower saddle',(0,.08,.804),(.25,.16,.024),'wood',.018);a.bottle((0,.08,.817),.18,'garnet')
 b.assembly('Cradle on its bearing',(0,.08,1.245),cradle,'rock','Y',.025,.45)
 for x in [-.23,.23]:b.relocated(lambda:c.tasting_glass(0,0,0),(x,-.15,.625),.53)
 for side in [-1,1]:b.vine((side*.355,.03,.685),.30)
 b.board_label('TASTING CABINET',(0,-.377,.142),.59,'wood',.028)

def walnut_prep():
 counter_frame('wood','stone')
 for x in [-.21,.21]:
  rail_handle((x,-.379,.77),.14);rail_handle((x,-.38,.485),.11)
  for dx in [-.146,.146]:a.box('Walnut door marquetry',(x+dx,-.351,.435),(.009,.006,.34),'gold',.002)
  b.vine((x-.045,-.352,.297),.16)
 a.box('Limestone backsplash',(0,.318,1.046),(.87,.038,.17),'stone',.029)
 for i in range(7):a.tube('Fine limestone vein',[(-.38+i*.12,-.28,.967),(-.34+i*.12,-.03,.967),(-.40+i*.12,.25,.967)],.0018,'ivory')
 a.box('Walnut serving board',(-.06,-.07,.987),(.49,.37,.026),'woodlight',.028)
 a.cyl('Small cheese wheel',(-.13,-.09,1.044),.075,.080,'cheese');a.box('Cheese wedge',(.027,-.06,1.035),(.095,.11,.06),'ivory',.012)
 for i in range(5):a.ell('Grapes on board',(.11+(i%2)*.032,-.13+(i//2)*.028,1.023),(.022,.021,.022),'grape')
 a.bottle((.32,.19,.969),.092,'garnet')
 s.work(b.assembly('Atelier brass leaf dial',(0,-.364,.77),lambda:c.leaf('Atelier leaf',(0,-.368,.77),.083,.030,'gold',.2),'rock','Y',.055,.7))
 b.board_label('THE WALNUT ATELIER',(0,-.389,.142),.66,'wood',.026)

def vine_chandelier():
 for x in [-.58,.58]:a.cyl('Ceiling vine rose',(x,0,1.35),.079,.032,'gold');a.tube('Brass hanger',[(x,0,1.33),(x,0,1.11)],.009,'gold')
 a.tube('Sculpted main grapevine',[(-.82,0,.94),(-.43,.015,1.10),(0,0,1.05),(.42,.01,1.12),(.81,0,.96)],.027,'gold')
 for i,x in enumerate([-.65,-.22,.22,.65]):
  z=.78+(i%2)*.06;a.tube('Branched shade support',[(x,0,1.04),(x,.01,z+.12)],.014,'gold')
  for row in range(3):
   for j in range(3-row):a.ell('Frosted glass grape',(x+(j-(2-row)/2)*.085,0,z-row*.079),(.052,.055,.057),'grapecream' if i%2 else 'ivory')
  for angle in [0,2.3,4.4]:c.leaf('Brass grape crown',(x,0,z+.068),.135,.045,'gold',angle,-.25)
  b.assembly('Tiny leaf on grape stem',(x,.025,z+.07),lambda x=x,z=z:c.leaf('Small glass leaf',(x,.025,z+.07),.15,.059,'paleglass',.45,.3),'rock','X',.023,.55+i*.04)

def cheesemonger(p):
 x,y,z=p
 for dx in [-.038,.038]:a.ell('Affineur planted shoe',(x+dx,y-.018,z+.017),(.032,.050,.018),'coal');a.tube('Apron trouser',[(x+dx,y,z+.035),(x+dx,y,z+.11)],.019,'velvet')
 a.ell('Linen apron body',(x,y,z+.17),(.073,.045,.09),'linen');a.ell('Cheesemonger head',(x,y,z+.29),(.053,.044,.062),'skin')
 a.ell('Little burgundy beret',(x,y+.004,z+.348),(.063,.052,.020),'velvet')
 for dx in [-.019,.019]:a.ell('Cheesemonger eye',(x+dx,y-.042,z+.30),(.005,.004,.006),'coal')
 a.tube('Left working arm',[(x-.06,y,z+.22),(x-.093,y-.055,z+.16)],.015,'linen')
 def hand():
  a.tube('Right working forearm',[(x+.062,y,z+.22),(x+.10,y-.065,z+.25)],.014,'linen');a.ell('Hand on cheese tool',(x+.10,y-.067,z+.25),(.018,.017,.019),'skin');a.tube('Cheese rind brush',[(x+.10,y-.07,z+.25),(x+.10,y-.13,z+.20)],.005,'wood')
 b.assembly('Cheese-turning elbow',(x+.06,y,z+.22),hand,'rock','Y',.05,.6)

def cheese_dome():
 c.footed_base(.96,.80,'wood');a.cyl('Limestone cellar floor',(0,0,.21),.36,.08,'stone')
 # Rear half cloche leaves the artisan and cheese room readable from the front.
 profile=a.soft_profile([(.37,.23),(.39,.36),(.38,.80),(.29,1.01),(.055,1.13)])
 a.lathe('Cutaway crystal cloche',profile,'crystal',0,math.pi,steps=40)
 for side in [-1,1]:a.tube('Cloche brass cut rim',[(side*r,-.008,z) for r,z in profile[::3]],.009,'gold')
 a.ring('Cloche lower rim',(0,0,.25),.375,'gold',.012);a.ell('Cloche grape finial',(0,0,1.167),(.041,.041,.055),'garnet')
 a.box('Walnut cellar rack',(0,.15,.56),(.55,.18,.59),'wood',.022)
 for z in [.33,.55,.77]:
  a.box('Cheese shelf',(0,.038,z),(.59,.23,.027),'woodlight',.013)
  for x in [-.18,0,.18]:a.cyl('Aged cheese wheel',(x,-.018,z+.05),.057,.067,'cheese' if x else 'ivory');a.ring('Cheese wheel rind',(x,-.018,z+.080),.054,'pith',.004)
 a.box('Affinage workbench',(.13,-.17,.36),(.28,.17,.057),'woodlight',.015)
 for x in [.035,.23]:a.box('Workbench leg',(x,-.15,.297),(.026,.03,.09),'wood',.005)
 a.cyl('Cheese being tended',(.15,-.17,.428),.050,.068,'ivory');cheesemonger((0,-.04,.251))
 b.board_label('THE CHEESE OBSERVATORY',(0,-.39,.142),.74,'wood',.023)

BUILDERS={
 'domain_gochujang_pepper_prep':pepper_prep,'domain_gochujang_tiger_coffee':coffee_ant,'domain_gochujang_chilli_canopy':chilli_canopy,'domain_gochujang_night_stall':stall_window,
 'domain_smoothie_watermelon_prep':watermelon_prep,'domain_smoothie_citrus_juicer':citrus_press,'domain_smoothie_berry_nest':berry_nest,'domain_smoothie_mango_pendant':mango_pendant,
 'domain_wines_tasting_station':tasting_cabinet,'domain_wines_walnut_prep':walnut_prep,'domain_wines_vine_chandelier':vine_chandelier,'domain_wines_cheese_dome':cheese_dome,
}
if __name__=='__main__':
 a.BUILDERS=BUILDERS
 for name in (a.args.only.split(',') if a.args.only else BUILDERS):
  a.build(name);path=a.OUT/(name+'.json');record=json.loads(path.read_text());record.update(version='3.0.0-uncommon.1',source=str(Path(__file__).resolve()),sourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),reviewStatus='New original model; visual review pending',approved=False);path.write_text(json.dumps(record,indent=2),encoding='utf-8')
 for source in [Path(__file__),Path(s.__file__),Path(b.__file__),Path(c.__file__),Path(a.__file__)]: (a.OUT/source.name).write_bytes(source.read_bytes())
