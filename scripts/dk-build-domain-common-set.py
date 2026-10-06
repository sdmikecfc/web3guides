"""Nine authored Regular Commons, extending the approved Fireant art benchmark.
Original Blender meshes only. New D: output directory; never overwrites approved heroes.
One recognisable composition per object, restrained jointed motion, no provider spend.
"""
import importlib.util, math, bpy, json, hashlib
from pathlib import Path

spec=importlib.util.spec_from_file_location('common_base',Path(__file__).with_name('dk-refine-domain-commons.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c);a=c.a
a.P.update({'bamboo':('#c5a567',0,.50),'bambooshade':('#87703e',0,.54),'soil':('#403929',0,.82),'seed':('#242624',0,.35),'cork':('#ae8350',0,.76),'corkdark':('#775c3e',0,.80),'stone':('#d8c5a3',0,.57),'sea':('#68b6ae',.05,.28),'grapecream':('#eac98f',0,.22)})
a.MAX_TRIANGLES=75000

def assembly(name,p,fn,motion='rock',axis='Z',amount=.03,speed=.6):
 before=set(bpy.context.scene.objects);fn();pivot=a.pivot(name,p,motion,axis,amount,speed);c.group(before,pivot);return pivot

def relocated(fn,p=(0,0,0),scale=1,angle=0):
 before=set(bpy.context.scene.objects);fn();created=set(bpy.context.scene.objects)-before
 root=bpy.data.objects.new('Authored subassembly',None);bpy.context.collection.objects.link(root);root.parent=a.root
 for o in created:
  if o.parent not in created:a.parent(o,root)
 root.location=p;root.scale=(scale,scale,scale);root.rotation_euler.z=angle;return root

def board_label(text,p,width,color='enamel',size=.045):
 a.box('Inset enamel house badge',p,(width,.017,.080),color,.014);c.letter(text,(p[0],p[1]-.012,p[2]),size,'ivory')

def jar(p,r=.07,h=.15,color='onggi'):
 x,y,z=p;o=a.lathe('Glazed fermentation jar',a.soft_profile([(r*.66,z),(r*.90,z+.025),(r,z+h*.45),(r*.85,z+h*.85),(r*.68,z+h)]),color,steps=24);o.location.x=x;o.location.y=y
 a.ring('Rolled jar collar',(x,y,z+h),r*.68,'gold',.003);a.cyl('Domed jar lid',(x,y,z+h+.009),r*.73,.018,color);a.ell('Lid grip',(x,y,z+h+.021),(.018,.014,.009),'gold')

def steam_basket(p,r=.22,h=.14):
 x,y,z=p;a.cyl('Woven basket bottom',(x,y,z+.013),r,.025,'bambooshade');a.lathe('Open bamboo basket',[(r,z+.02),(r,z+h),(r-.012,z+h),(r-.012,z+.02)],'bamboo',steps=40).location=(x,y,0)
 for zz in [z+.035,z+h-.02]:a.ring('Dark bamboo binding',(x,y,zz),r+.002,'bambooshade',.005)
 for i in range(32):q=i*math.tau/32;a.tube('Basket upright weave',[(x+math.cos(q)*(r+.003),y+math.sin(q)*(r+.003),z+.045),(x+math.cos(q)*(r+.003),y+math.sin(q)*(r+.003),z+h-.027)],.0025,'ivory')
 for i in range(-3,4):
  yy=i*r/4;length=math.sqrt(max(0,r*r-yy*yy))*.90;a.box('Bamboo steaming slat',(x,y+yy,z+.034),(length*2,.015,.009),'bamboo',.003)

def dumpling(p,s=.065):
 x,y,z=p;a.ell('Soft pleated mandu',(x,y,z+s*.44),(s,s*.66,s*.46),'ivory')
 for i in range(7):
  q=(i-3)*.32;a.tube('Pinched dough pleat',[(x+math.sin(q)*s*.83,y-.010,z+s*.66),(x+math.sin(q)*s*.78,y+.014,z+s*.94),(x+math.sin(q)*s*.72,y+.025,z+s*.63)],s*.031,'linen')

def lantern(p,r=.075,h=.14,color='ivory'):
 x,y,z=p;a.ell('Glazed warm lantern',(x,y,z),(r,r,h/2),color)
 for dz in [-h*.38,h*.38]:a.cyl('Lantern brass cap',(x,y,z+dz),r*.64,.016,'gold')
 for k in range(8):
  q=k*math.tau/8;a.tube('Lantern fine rib',[(x+math.cos(q)*r*f,y+math.sin(q)*r*f,z+h*t) for f,t in [(.62,-.38),(.96,-.14),(.96,.14),(.62,.38)]],.0028,'gold')

def pepper_lanterns():
 # One ceiling rose and a crafted crossbar visibly carry all three pendants.
 a.cyl('Ceiling rose',(0,.015,1.37),.17,.042,'onggi');a.ring('Rose gold edge',(0,.015,1.39),.15,'gold',.008)
 a.tube('Rose suspension',[(0,.015,1.35),(0,.015,1.20)],.015,'gold');a.tube('Curved pendant crossbar',[(-.34,0,1.13),(0,.015,1.23),(.34,0,1.13)],.019,'gold')
 for x,z,s in [(-.31,.69,.93),(0,.47,1.10),(.31,.76,.83)]:
  a.tube('Pendant cord',[(x,0,1.16),(x,0,z+.28*s)],.006,'coal')
  def pendant(x=x,z=z,s=s):
   # Four curving chilli ribs make a readable pepper cage around porcelain.
   for i in range(4):
    q=i*math.pi/2;a.tube('Sculpted chilli lantern rib',[(x+math.cos(q)*.025,math.sin(q)*.025,z+.25*s),(x+math.cos(q)*.132*s,math.sin(q)*.132*s,z+.10*s),(x+math.cos(q)*.10*s,math.sin(q)*.10*s,z-.065*s),(x-.020*s,-.01,z-.19*s)],.022*s,'enamel')
   lantern((x,0,z+.045*s),.079*s,.22*s)
   c.leaf('Pepper crown leaf',(x,0,z+.26*s),.13*s,.036*s,'jade',.7,-.35)
   a.tube('Silk tassel cord',[(x-.02,0,z-.17*s),(x-.02,0,z-.24*s)],.004,'gold')
   for i in range(5):a.tube('Red silk tassel',[(x-.02+(i-2)*.005,0,z-.24*s),(x-.02+(i-2)*.006,0,z-.32*s)],.0026,'enamel')
  assembly('Pepper pendant on its suspension',(x,0,1.16),pendant,'rock','Y',.012,.43+z*.1)

def mandu_mountain():
 c.footed_base(.95,.77,'onggi');steam_basket((0,0,.18),.345,.16)
 # A miniature open-front shop lives inside the oversized basket.
 a.box('Miniature shop platform',(0,.045,.35),(.53,.35,.028),'woodlight',.02)
 a.box('Mandu kitchen back',(0,.18,.52),(.46,.027,.32),'onggi',.018)
 for x in [-.22,.22]:a.box('Miniature kitchen post',(x,.11,.54),(.028,.027,.36),'gold',.008)
 a.box('Red shop canopy',(0,.055,.725),(.56,.38,.044),'enamel',.03)
 for x in [-.2,-.1,0,.1,.2]:a.box('Canopy cream stripe',(x,.014,.749),(.044,.28,.008),'ivory',.003)
 a.box('Kitchen counter',(0,.075,.443),(.44,.09,.12),'wood',.018);a.box('Counter stone slab',(0,.066,.507),(.47,.12,.020),'ivory',.009)
 for x in [-.14,0,.14]:dumpling((x,.061,.523),.045)
 c.ant_chef((-.135,-.085,.342),.19,True)
 a.box('Raised front bamboo serving rack',(0,-.165,.322),(.50,.13,.022),'bamboo',.012)
 for x,y in [(-.20,-.18),(.05,-.18),(.20,-.13)]:dumpling((x,y,.335),.068)
 a.bowl((-.036,-.161,.416),.049,'steel')
 # Offset second basket leaves the first cook and counter fully legible.
 steam_basket((.20,.05,.77),.135,.11)
 for x in [.145,.245]:dumpling((x,.034,.804),.040)
 def lid():
  a.cyl('Lifted woven steamer lid',(.20,.13,.981),.145,.025,'bamboo');a.ring('Lid dark rim',(.20,.13,.995),.143,'bambooshade',.007)
  for k in range(-3,4):a.box('Woven lid band',(.20+k*.033,.13,.997),(.012,.19,.004),'ivory',.002)
  a.tube('Bamboo lid handle',[(.16,.13,1.01),(.17,.13,1.048),(.23,.13,1.048),(.24,.13,1.01)],.008,'bambooshade')
 assembly('Lid supported on rear hinge',(.20,.175,.888),lid,'rock','X',.035,.65)
 for x in [.16,.24]:a.tube('Steamer hinge support',[(x,.167,.87),(x,.192,.976)],.007,'gold')
 board_label('MANDU CLUB',(0,-.367,.14),.37,size=.036)

def spice_drawers():
 c.footed_base(.89,.63,'onggi');a.box('Red lacquer cabinet back',(0,.297,.76),(.81,.044,1.12),'enamel',.024)
 for x in [-.385,.385]:a.box('Rounded red lacquer side',(x,.07,.76),(.055,.51,1.12),'enamel',.02)
 a.box('Charcoal drawer recess',(0,-.19,.61),(.71,.029,.78),'coal',.025)
 for x in [-.365,.365]:a.box('Cabinet brass stile',(x,-.22,.76),(.015,.025,.98),'gold',.004)
 for z in [.32,.58,.84]:
  for x in [-.18,.18]:
   if z==.58 and x==.18:continue
   a.box('Ceramic spice drawer',(x,-.229,z),(.31,.042,.205),'onggi',.025);a.box('Drawer ivory label',(x,-.254,z+.040),(.13,.008,.042),'ivory',.008)
   a.tube('Drawer brass loop',[(x-.041,-.258,z-.031),(x-.043,-.29,z-.051),(x+.043,-.29,z-.051),(x+.041,-.258,z-.031)],.007,'gold')
 # Open drawer is constrained to a physical runner; its contents travel with it.
 def drawer():
  a.box('Sliding drawer base',(.18,-.22,.511),(.28,.22,.022),'woodlight',.008)
  for x in [.039,.321]:a.box('Drawer side',(x,-.22,.557),(.018,.22,.095),'wood',.006)
  a.box('Sliding red drawer face',(.18,-.337,.58),(.31,.026,.205),'onggi',.024)
  c.pepper((.145,-.19,.56),.08);c.pepper((.22,-.24,.56),.07);a.ell('Gold drawer knob',(.18,-.36,.60),(.019,.012,.018),'gold')
 assembly('Spice drawer on straight runners',(.18,-.22,.56),drawer,'slide','Y',-.10,.5)
 a.box('Open display shelf',(0,-.05,1.0),(.67,.30,.026),'woodlight',.008)
 for x in [-.22,0,.22]:jar((x,-.045,1.02),.074,.16,'onggi' if x else 'ivory')
 a.box('Cabinet cornice',(0,.035,1.337),(.87,.59,.057),'onggi',.04)
 board_label('SEOUL SPICE',(0,-.277,1.258),.51,size=.044)
 for x in [-.27,.27]:c.pepper((x,-.24,1.31),.11)

def papaya_planter():
 c.footed_base(.94,.75,'teal')
 # Sculpted ripe papaya with an open face, seeds tracing the natural cavity.
 profile=a.soft_profile([(.20,.17),(.35,.28),(.39,.63),(.29,.99),(.09,1.16),(.012,1.19)])
 o=a.lathe('Papaya sculpted peel',profile,'papaya',0,math.pi);o.scale.y=.80
 o=a.lathe('Thick pink papaya flesh',[(r-.02,z+.008) for r,z in profile],'peach',0,math.pi);o.scale.y=.79
 for side in [-1,1]:a.tube('Papaya cut flesh lip',[(side*r,-.012,z) for r,z in profile[::4]],.015,'pith')
 for side in [-1,1]:
  for i in range(8):
   z=.34+i*.074;x=side*(.29-.16*((z-.55)/.65)**2);a.ell('Glossy papaya seed',(x,-.033,z),(.020,.025,.019),'seed')
 a.ell('Planted conservatory earth',(0,0,.244),(.30,.25,.04),'soil')
 a.box('Terrarium stone step',(0,-.19,.266),(.21,.13,.030),'ivory',.03)
 # Brass greenhouse ribs sit inside the fruit, never in front of its opening.
 for x in [-.21,.21]:a.tube('Arched greenhouse rib',[(x,.09,.27),(x,.10,.63),(x*.60,.11,.88),(0,.12,1.02)],.008,'gold')
 for z in [.44,.66]:a.tube('Greenhouse cross rail',[(-.23,.12,z),(.23,.12,z)],.007,'gold')
 for x,y,z,s in [(-.18,.02,.28,.28),(.17,.06,.30,.34),(-.03,.14,.28,.50)]:
  a.tube('Living plant stem',[(x,y,z),(x+.02,y,z+s*.65)],.009,'jade')
  for i in range(5):c.leaf('Papaya garden leaf',(x,y,z+s*(.25+i*.09)),s*.53,s*.15,'jade' if i%2 else 'fruitleaf',i*2,-.30)
 jar((-.17,-.11,.28),.045,.075,'teal');a.cyl('Little watering can',(.14,-.11,.323),.042,.07,'gold');a.tube('Watering spout',[(.17,-.11,.32),(.24,-.11,.37)],.009,'gold')
 # Butterfly rests on one leaf. Its body stays put; wings hinge at the thorax.
 x,y,z=-.015,.10,.72;a.ell('Perched butterfly body',(x,y,z),(.008,.023,.008),'coal')
 for side in [-1,1]:
  def wing(side=side):
   a.ell('Butterfly forewing',(x+side*.030,y-.008,z+.004),(.032,.034,.004),'lemon');a.ell('Butterfly hindwing',(x+side*.024,y+.028,z+.004),(.024,.022,.004),'papaya')
  assembly('Perched butterfly wing',(x,y,z),wing,'rock','Y',.16,1.4)
 board_label('PAPAYA GARDEN',(0,-.366,.137),.43,'teal',.032)

def citrus_mobile():
 a.cyl('Canopy rose',(0,0,1.20),.13,.037,'teal');a.ring('Canopy bead',(0,0,1.22),.11,'gold',.007)
 a.tube('Main hanging rod',[(0,0,1.19),(0,0,.98)],.009,'gold')
 # Arms rotate around a real central bearing; pendants remain on their wires.
 def mobile():
  a.tube('Sweeping brass balance arm',[(-.37,0,.84),(0,0,.97),(.37,0,.91)],.013,'gold')
  for x,y,z,r in [(-.35,0,.44,.12),(0,.07,.31,.145),(.34,0,.56,.105)]:
   a.tube('Fine pendant wire',[(x,y,.9),(x,y,z+r)],.004,'gold')
   relocated(lambda r=r:c.citrus((0,0,0),r),(x,y,z),1,0).rotation_euler.x=math.pi/2
   c.leaf('Enamel citrus leaf',(x+.03,y,z+r+.03),r*.65,r*.21,'jade',.8,-.1)
  a.ring('Mobile central bearing',(0,0,.97),.035,'gold',.008,axis='Y')
 assembly('Citrus mobile hanging bearing',(0,0,.97),mobile,'rock','Z',.10,.35)

def fruit_skate_details():
 # A parked cargo tricycle, complete with fork, axle, saddle and fixed wheels.
 for x,y,r in [(-.29,-.235,.17),(-.29,.235,.17),(.32,0,.20)]:
  a.ring('Rubber tricycle tyre',(x,y,r+.015),r,'coal',.024,axis='Y');a.ring('Polished wheel rim',(x,y,r+.015),r-.035,'gold',.006,axis='Y')
  for i in range(10):q=i*math.tau/10;a.tube('Wheel spoke',[(x,y,r+.015),(x+math.cos(q)*(r-.037),y,r+.015+math.sin(q)*(r-.037))],.003,'steel')
  a.cyl('Wheel axle cap',(x,y,r+.015),.024,.030,'gold').rotation_euler.x=math.pi/2
 a.tube('Cargo tricycle chassis',[(-.29,-.22,.19),(-.29,.22,.19)],.021,'teal')
 a.tube('Curved frame',[(-.29,0,.19),(-.06,0,.22),(.16,0,.45),(.31,0,.44),(.32,0,.215)],.027,'peach')
 a.tube('Saddle tube',[(-.05,0,.23),(-.04,0,.47)],.02,'gold');a.ell('Leather saddle',(-.05,0,.49),(.075,.056,.023),'wood')
 a.tube('Steering column',[(.29,0,.43),(.26,0,.63)],.018,'steel');a.tube('Handlebars',[(.26,-.105,.61),(.26,0,.65),(.26,.105,.61)],.013,'gold')
 for y in [-.10,.10]:a.tube('Handlebar grip',[(.26,y,.61),(.31,y,.60)],.017,'wood')
 a.box('Fruit kiosk cargo cabinet',(-.255,0,.403),(.43,.48,.27),'teal',.035)
 for i in range(7):a.box('Cargo cabinet timber slat',(-.444,-.185+i*.062,.398),(.010,.04,.21),'woodlight',.008)
 a.box('Cream cargo worktop',(-.255,0,.554),(.48,.53,.032),'ivory',.035)
 for x in [-.45,-.06]:a.tube('Canopy pole',[(x,.19,.57),(x,.19,.99)],.010,'gold')
 a.box('Coral canvas sunshade',(-.255,.0,1.0),(.54,.62,.035),'peach',.037)
 for i in range(6):a.box('Striped sunshade',(-.48+i*.09,0,1.020),(.044,.59,.008),'ivory',.014)
 a.box('Open citrus crate',(-.34,.09,.610),(.21,.21,.073),'woodlight',.014)
 for x,y in [(-.39,.07),(-.29,.08),(-.33,.145)]:a.ell('Cargo citrus',(x,y,.67),(.043,.04,.04),'papaya');c.leaf('Fresh fruit leaf',(x,y,.706),.053,.014,'jade',.8)
 a.cyl('Manual citrus press base',(-.12,-.10,.58),.052,.018,'gold');a.tube('Citrus press upright',[(-.12,-.06,.59),(-.12,-.06,.78)],.015,'gold')
 a.cyl('Press bowl',(-.12,-.12,.67),.050,.06,'steel',.065)
 a.tube('Citrus press crank',[(-.12,-.06,.78),(-.20,-.06,.78)],.009,'gold');a.ell('Wooden crank grip',(-.20,-.06,.798),(.013,.013,.033),'wood')
 def valance():
  a.box('Soft coral canvas valance',(-.255,-.29,.969),(.53,.012,.083),'peach',.011)
  for i in range(6):a.box('Valance ivory stripe',(-.48+i*.09,-.299,.969),(.044,.005,.082),'ivory',.004)
 assembly('Canvas valance stitched to canopy',(-.255,-.29,1.007),valance,'rock','X',.035,.72)
 board_label('FRUIT CLUB',(-.255,-.251,.421),.30,'teal',.029)

def fruit_skate():
 relocated(fruit_skate_details,p=(0,0,.009),scale=.93)

def vine(p,length=.30):
 x,y,z=p;a.tube('Carved climbing vine',[(x,y,z),(x+.015,y,z+length*.35),(x-.02,y,z+length*.72),(x+.02,y,z+length)],.008,'gold')
 for i in range(4):c.leaf('Folded vine leaf',(x,y,z+length*(.25+i*.18)),.07,.035,'jade',i*2.5,-.18)
 for i in range(3):
  for j in range(3-i):a.ell('Individual grape',(x+(j-(2-i)/2)*.023,y-.024,z+length*.5-i*.021),(.015,.014,.016),'grape')

def cork_garden():
 c.footed_base(.93,.76,'wood')
 profile=a.soft_profile([(.31,.17),(.37,.21),(.39,.76),(.36,.88)])
 a.lathe('Cutaway carved cork',profile,'cork',0,math.pi);a.lathe('Cork interior',[(r-.025,z) for r,z in profile],'corkdark',0,math.pi)
 for side in [-1,1]:a.tube('Carved cork cut lip',[(side*r,-.008,z) for r,z in profile[::3]],.012,'cork')
 # Three vineyard terraces, visible retaining masonry and supported vine rows.
 for i in range(3):
  z=.23+i*.17;w=.63-i*.15;y=.01+i*.047
  a.box('Limestone garden terrace',(0,y,z),(w,.40-i*.055,.105),'stone',.025);a.box('Vineyard earth',(0,y,z+.058),(w-.03,.35-i*.055,.017),'soil',.014)
  for x in [-w*.4,w*.4]:vine((x,y-(.40-i*.055)*.25,z+.07),.22)
  a.tube('Terrace grape trellis',[(-w*.42,y-(.40-i*.055)*.25,z+.19),(w*.42,y-(.40-i*.055)*.25,z+.19)],.003,'wood')
  for j in range(3):a.box('Tasting garden path stone',((j-1)*w*.17,y-(.40-i*.055)*.34,z+.074),(w*.14,.049,.012),'stone',.006)
  for k in range(max(2,5-i)):a.box('Terrace stone facing',((k-(4-i)/2)*.115,y-(.40-i*.055)/2-.002,z),(.104,.017,.060),'ivory',.006)
 # Tiny press house and an actual water wheel running in its open channel.
 a.box('Little garden mill',(.155,.08,.718),(.20,.18,.20),'ivory',.017);a.box('Tiled mill roof',(.155,.08,.828),(.25,.22,.035),'velvet',.024).rotation_euler.y=.12
 a.box('Mill window',(.155,-.015,.742),(.07,.007,.067),'gold',.013)
 a.box('Water channel',(-.215,-.075,.319),(.23,.065,.018),'sea',.014)
 a.tube('Mill axle',[(-.215,-.016,.412),(-.215,-.09,.412)],.012,'gold')
 def wheel():
  a.ring('Brass watering wheel',(-.215,-.083,.412),.089,'gold',.007,axis='Y')
  for k in range(10):q=k*math.tau/10;a.tube('Wheel spoke',[(-.215,-.083,.412),(-.215+math.cos(q)*.085,-.083,.412+math.sin(q)*.085)],.004,'wood');o=a.box('Water scoop',(-.215+math.cos(q)*.086,-.083,.412+math.sin(q)*.086),(.026,.051,.014),'gold',.004);o.rotation_euler.y=-q
 assembly('Mill wheel on axle',(-.215,-.083,.412),wheel,'spin','Y',0,.24)
 board_label('CORK GARDEN',(0,-.37,.139),.43,'wood',.034)

def harvest_lamp():
 # A weighty limestone base, sculpted brass vine and opaque frosted grapes.
 a.cyl('Limestone lamp foot',(0,0,.048),.265,.086,'stone');a.ring('Foot brass bead',(0,0,.086),.24,'gold',.009)
 a.tube('Main brass vine stem',[(0,0,.09),(-.035,0,.39),(.02,.02,.79),(-.015,0,1.22)],.023,'gold')
 for side in [-1,1]:a.tube('Branch supporting grape shade',[(.015,0,.78),(side*.13,.012,1.08),(side*.18,0,1.20)],.014,'gold')
 # Deliberate hanging grape silhouette, broad at top and tapering below.
 for row in range(4):
  count=4-row;z=1.18-row*.109
  for i in range(count):x=(i-(count-1)/2)*.108;a.ell('Frosted grape lamp shade',(x,0,z),(.068,.066,.075),'grapecream');a.ring('Fine grape brass collar',(x,0,z+.055),.037,'gold',.003)
 for x,y,z in [(-.15,.08,1.18),(0,.095,1.21),(.14,.08,1.17),(0,.08,1.04)]:a.ell('Rear grape milkglass',(x,y,z),(.064,.063,.069),'ivory')
 for angle in [0,2.4,4.4]:c.leaf('Cast brass crown leaf',(0,0,1.286),.19,.067,'gold',angle,-.3)
 c.leaf('Broad lower vine leaf',(-.035,0,.50),.22,.09,'jade',.5,-.4)
 assembly('Small leaf on its petiole',(.02,.012,.78),lambda:c.leaf('Small hanging vine leaf',(.02,.012,.78),.16,.056,'gold',3.6,.25),'rock','X',.025,.58)

def cellar_library():
 c.footed_base(.97,.64,'wood');a.box('Wine library back',(0,.225,.80),(.86,.04,1.27),'velvet',.025)
 for x in [-.425,.425]:a.box('Walnut cabinet column',(x,.02,.80),(.072,.46,1.27),'wood',.032);a.box('Column marquetry',(x,-.22,.80),(.018,.009,1.16),'gold',.005)
 for z in [.22,.53,.86,1.18,1.44]:a.box('Rounded walnut shelf',(0,.02,z),(.93,.51,.045),'woodlight',.025);a.tube('Shelf brass nosing',[(-.40,-.237,z+.014),(.40,-.237,z+.014)],.005,'gold')
 # Vary bottle and book groupings; the silhouette remains a real wine library.
 for x in [-.30,-.12,.08,.28]:a.bottle((x,.08,.885),.12,'leaf' if x<0 else 'garnet')
 for i in range(8):
  x=-.34+i*.063;z=.555;h=.20+(i%3)*.025;a.box('Cloth bound tasting notebook',(x,.015,z+h/2),(.046,.22,h),['velvet','wood','ivory'][i%3],.006)
  for zz in [z+.027,z+h-.027]:a.box('Book spine gold band',(x,-.099,zz),(.036,.005,.006),'gold',.001)
  if i%2==0:a.box('Spine nameplate',(x,-.104,z+.12),(.025,.007,.032),'ivory',.002)
 for x in [-.26,0,.26]:a.bottle((x,.08,.246),.115,'garnet')
 a.box('Upper tasting tray',(0,-.035,1.207),(.65,.30,.028),'wood',.016)
 for x in [-.21,0,.21]:relocated(lambda:c.tasting_glass(0,0,0),(x,-.035,1.225),.59)
 # Brass rail carries a proper ladder. Only its wheels/ladder translate together.
 a.tube('Rolling ladder brass rail',[(-.445,-.279,1.34),(.445,-.279,1.34)],.012,'gold')
 for x in [-.43,.43]:a.tube('Rail bracket',[(x,-.23,1.34),(x,-.279,1.34)],.015,'gold')
 def ladder():
  for x in [-.27,-.09]:a.tube('Ladder timber stile',[(x,-.36,.185),(x,-.287,1.36)],.012,'woodlight');a.ring('Rail roller',(x,-.280,1.366),.025,'gold',.006,axis='Y')
  for i in range(8):z=.25+i*.135;y=-.36+(z-.185)/1.175*.073;a.tube('Ladder rung',[(-.27,y,z),(-.09,y,z)],.011,'gold')
 assembly('Library ladder on rail',(-.18,-.30,.7),ladder,'slide','X',.24,.24)
 board_label('TASTING LIBRARY',(0,-.258,1.466),.64,'wood',.034)

BUILDERS={
 'domain_gochujang_pepper_lanterns':pepper_lanterns,'domain_gochujang_mandu_mountain':mandu_mountain,'domain_gochujang_spice_drawers':spice_drawers,
 'domain_smoothie_papaya_planter':papaya_planter,'domain_smoothie_citrus_mobile':citrus_mobile,'domain_smoothie_fruit_skate':fruit_skate,
 'domain_wines_cork_garden':cork_garden,'domain_wines_harvest_lamp':harvest_lamp,'domain_wines_cellar_library':cellar_library,
}
if __name__=='__main__':
 a.BUILDERS=BUILDERS
 for name in (a.args.only.split(',') if a.args.only else BUILDERS):
  a.build(name);path=a.OUT/(name+'.json');record=json.loads(path.read_text());record.update(version='3.0.0-common-set.1',source=str(Path(__file__).resolve()),sourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),reviewStatus='New original model at approved benchmark; visual review pending',approved=False)
  path.write_text(json.dumps(record,indent=2),encoding='utf-8')
 for source in [Path(__file__),Path(c.__file__),Path(a.__file__)]: (a.OUT/source.name).write_bytes(source.read_bytes())
