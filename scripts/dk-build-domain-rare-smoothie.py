"""Seven original Smoothie finale collectibles; D: source and export only."""
import importlib.util,math,bpy
import sys
sys.dont_write_bytecode=True
from pathlib import Path
spec=importlib.util.spec_from_file_location('rare_base',Path(__file__).with_name('dk-build-domain-rare-gochujang.py'))
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g);v=g.v;u=g.u;s=g.s;b=g.b;c=g.c;a=g.a

def palm(p,h=.5):
 x,y,z=p;a.tube('Palm curved trunk',[(x,y,z),(x+.03,y,z+h*.53),(x,y,z+h)],.024*h/.5,'woodlight')
 for i in range(6):
  q=i*math.tau/6;pts=[(x,y,z+h),(x+math.cos(q)*h*.29,y+math.sin(q)*h*.29,z+h*1.035),(x+math.cos(q)*h*.58,y+math.sin(q)*h*.58,z+h*.85)]
  a.tube('Palm frond midrib',pts,.005,'jade')
  for k in range(1,5):
   t=k/5;xx=x+math.cos(q)*h*.52*t;yy=y+math.sin(q)*h*.52*t;zz=z+h+h*.045*math.sin(t*math.pi)-h*.15*t*t
   for side in [-1,1]:c.leaf('Feathered palm leaflet',(xx,yy,zz),h*(.23-.12*t),h*.032,'jade',q+side*.66,.22)

def fruit_stall(p,sc=.6):
 def model():
  a.box('Fluted miniature fruit bar',(0,0,.22),(.72,.32,.34),'peach',.04)
  for x in [-.30,-.20,-.10,0,.10,.20,.30]:a.tube('Bar vertical fluting',[(x,-.17,.10),(x,-.17,.34)],.009,'ivory')
  a.box('Terrazzo counter',(0,0,.41),(.78,.37,.05),'pith',.036)
  for x in [-.34,.34]:a.tube('Canopy post',[(x,.12,.44),(x,.12,.97)],.016,'woodlight')
  a.box('Rounded fruit canopy',(0,.04,.98),(.87,.46,.062),'teal',.038)
  for x in [-.32,-.16,0,.16,.32]:a.box('Cream canopy stripe',(x,-.01,1.018),(.075,.39,.012),'ivory',.005)
  for x,col in [(-.23,'papaya'),(0,'berry'),(.23,'lemon')]:
   a.box('Fruit basket',(x,0,.485),(.18,.20,.10),'woodlight',.016)
   for i in range(3):a.ell('Fresh market fruit',(x+(i-1)*.043,-.01,.555),(.030,.034,.033),col)
  for x in [-.17,.17]:s.mug((x,-.14,.45),.033,'teal')
 b.relocated(model,p,sc)

def pool(p,w=.70,d=.35):
 x,y,z=p;a.ell('Carved limestone pool lip',p,(w,d,.075),'sand');a.ell('Still turquoise pool',(x,y,z+.032),(w*.91,d*.85,.049),'sea')
 for i in range(3):a.tube('Fine water ripple',[(x-.28+i*.06,y-.17,z+.079),(x-.20+i*.06,y-.19,z+.079),(x-.12+i*.06,y-.17,z+.079)],.0025,'pith')

def fountain():
 v.base(.94,.80,'teal');s.drip((0,-.18,.23),.71,.34)
 a.lathe('Palm soda trunk cabinet',a.soft_profile([(.20,.18),(.26,.33),(.24,.67),(.17,.87)]),'woodlight',steps=32)
 for k in range(8):q=k*math.tau/8;a.tube('Palm cabinet brass seam',[(math.cos(q)*.23,math.sin(q)*.23,.33),(math.cos(q)*.22,math.sin(q)*.22,.64)],.004,'gold')
 for x in [-.20,0,.20]:
  a.tube('Fruit soda brass tap',[(x,-.12,.68),(x,-.29,.68),(x,-.29,.57)],.016,'gold');a.ell('Glazed fruit tap handle',(x,-.20,.75),(.035,.037,.041),['papaya','lemon','berry'][int((x+.2)/.2)])
 a.ell('Coconut fountain crown',(0,.035,.94),(.19,.17,.17),'coconut')
 for q in [0,1.25,2.5,3.75,5]:c.leaf('Cast palm crown',(0,.035,1.075),.43,.079,'jade',q,.25)
 s.work(b.assembly('Coconut cap hinge',(0,.10,1.065),lambda:a.ell('Fitted coconut lid',(0,.035,1.080),(.14,.12,.037),'woodlight'),'rock','X',.10,.65))
 b.board_label('PALM SODA',(0,-.39,.14),.50,'teal',.032)

def tide_pool():
 v.base(color='teal')
 # Half fruit shell and layered rind form the tide pool's enclosing sculpture.
 a.ell('Fruit shell outer rind',(0,.035,.37),(.81,.31,.20),'teal');a.ell('Pale cut fruit pith',(0,-.01,.46),(.76,.30,.065),'pith');pool((0,-.025,.50),.68,.28)
 for x,y in [(-.47,-.04),(-.20,-.12),(.11,-.10),(.38,-.02)]:a.ell('Tide pool stepping stone',(x,y,.596),(.084,.047,.028),'stone')
 palm((-.51,.15,.54),.61);fruit_stall((.30,.115,.60),.46)
 # A little paddle wheel feeds a channel into the actual pool.
 g.wheel((.60,-.10,.69),.09);a.box('Pool irrigation inlet',(.60,-.08,.60),(.16,.08,.025),'sea',.012)
 for i in range(5):c.leaf('Pool edge plant',(-.24+i*.08,.18,.59),.11,.031,'jade',i*1.3,-.1)
 b.board_label('LOW TIDE FRUIT POOL',(0,-.40,.14),.92,'teal',.031)

def conservatory():
 v.base(color='teal')
 profile=a.soft_profile([(.59,.18),(.78,.35),(.79,.72),(.61,1.19),(.25,1.40)])
 for color,offset in [('lemon',0),('pith',-.025)]:
  o=a.lathe('Cut tropical fruit conservatory' if not offset else 'Fruit pith interior',[(r+offset,z) for r,z in profile],color,0,math.pi,steps=36);o.scale.y=.44
 for side in [-1,1]:a.tube('Fruit shell cut edge',[(side*r,0,z) for r,z in profile],.013,'gold')
 for i in range(3):
  z=.27+i*.27;w=1.33-i*.27;y=.055+i*.043
  a.box('Orchard limestone terrace',(0,y,z),(w,.37-i*.035,.12),'sand',.037);a.box('Orchard growing bed',(0,y,z+.072),(w-.09,.29-i*.033,.027),'soil',.019)
  for x in [-w*.34,w*.34]:
   a.tube('Fruit tree trunk',[(x,y,z+.08),(x,y,z+.30)],.014,'wood');a.ell('Miniature citrus canopy',(x,y,z+.33),(.11,.065,.09),'jade')
   for dx in [-.046,.03]:a.ell('Citrus hanging in tree',(x+dx,y-.05,z+.32),(.020,.018,.022),'lemon')
  for k in range(3):a.box('Terrace limestone block',((k-1)*w*.26,y-.20+i*.02,z),(.24,.026,.072),'ivory',.008)
  # Fruiting underplanting and an irrigation channel fill the miniature orchard.
  for k in range(5):
   xx=(k-2)*w*.12;c.leaf('Orchard rooted banana leaf',(xx,y-.10,z+.09),.10,.034,'fruitleaf',k*1.17,-.2)
   a.ell('Orchard ripe papaya',(xx+.024,y-.12,z+.113),(.025,.035,.023),'papaya')
  a.box('Orchard water channel',(0,y+.10,z+.087),(w*.81,.025,.012),'sea',.009)
 fruit_stall((0,.065,1.00),.34);g.wheel((-.62,-.15,.43),.13)
 for k in range(6):a.box('Orchard terrace stair',(.56-k*.056,-.03,.31+k*.077),(.105,.13,.028),'ivory',.007)
 c.leaf('Crown fruit leaf',(0,.02,1.41),.23,.075,'jade',.3,-.2)
 b.board_label('GRAND FRUIT CONSERVATORY',(0,-.40,.14),1.14,'teal',.028)

def citrus_reef():
 v.base(color='teal');pool((0,0,.23),.78,.31)
 # A clear rear dome avoids putting translucent glass over the hero silhouette.
 profile=a.soft_profile([(.75,.24),(.77,.46),(.64,.91),(.40,1.15),(.05,1.24)])
 o=a.lathe('Open-front observatory glass',profile,'crystal',0,math.pi,steps=36);o.scale.y=.48
 for side in [-1,1]:a.tube('Observatory brass meridian',[(side*r,0,z) for r,z in profile],.012,'gold')
 a.ell('Dome citrus finial',(0,.03,1.26),(.06,.04,.065),'lemon')
 for x,y,h in [(-.43,.12,.31),(-.13,.06,.24),(.18,.13,.42),(.45,.09,.27)]:
  a.tube('Citrus coral stalk',[(x,y,.30),(x,y,.30+h)],.023,'peach')
  for side in [-1,1]:a.tube('Citrus coral branch',[(x,y,.37),(x+side*.075,y,.43+h*.3),(x+side*.09,y,.43+h*.65)],.016,'peach')
  a.ell('Glazed reef citrus',(x,y,.34+h),(.067,.049,.07),'lemon')
 # The ray is a recognizable glazed sculpture on a thin supported spindle.
 a.tube('Ray display spindle',[(.03,.02,.31),(.03,.02,.78)],.004,'gold')
 def ray():
  a.ell('Ray central body',(.03,.02,.78),(.079,.12,.030),'teal')
  for side in [-1,1]:c.leaf('Sculpted ray wing',(.03+side*.045,.025,.79),.29,.13,'teal',0 if side>0 else math.pi,-.06)
  a.tube('Ray long tail',[(.03,.11,.78),(.07,.30,.79),(.02,.38,.82)],.009,'teal')
  for dx in [-.031,.031]:a.ell('Ray eye',(.03+dx,-.06,.806),(.009,.007,.007),'coal')
 b.assembly('Ray on observatory spindle',(.03,.02,.78),ray,'rock','Z',.08,.42)
 b.board_label('CITRUS REEF OBSERVATORY',(0,-.40,.14),1.04,'teal',.028)

def fruit_station():
 a.box('Waterfront station backboard',(0,.17,.68),(1.85,.045,1.19),'teal',.07)
 a.box('Warm sky inset',(0,.135,.70),(1.68,.025,1.02),'pith',.06)
 a.box('Station stone quay',(0,-.045,.11),(1.88,.50,.12),'sand',.033)
 fruit_stall((-.46,.06,.25),.66);fruit_stall((.46,.07,.25),.59)
 for x in [-.60,.60]:palm((x,.09,.42),.57)
 a.tube('Tram platform rails',[(-.72,-.20,.18),(.72,-.20,.18)],.011,'gold')
 a.box('Station destination plaque',(0,.095,1.115),(.60,.026,.11),'teal',.023);c.letter('FRUIT PARADISE',(0,.078,1.117),.037,'ivory')
 for x in [-.21,.21]:
  a.box('Waterfront timber bench',(x,.04,.30),(.22,.11,.026),'woodlight',.012)
  for dx in [-.07,.07]:a.box('Bench supported foot',(x+dx,.04,.256),(.015,.045,.075),'gold',.004)
  a.box('Striped station parasol',(x,.052,.64),(.27,.17,.033),'peach',.016);a.tube('Parasol mast',[(x,.08,.23),(x,.08,.63)],.007,'gold')
 def tram():
  a.box('Fruit tram curved body',(-.52,-.20,.33),(.39,.18,.22),'peach',.045);a.box('Tram teal roof',(-.52,-.20,.472),(.44,.21,.040),'teal',.028)
  for x in [-.65,-.52,-.39]:a.box('Tram ivory window',(x,-.297,.375),(.087,.010,.086),'ivory',.012)
  for x in [-.65,-.39]:a.cyl('Tram wheel',(x,-.296,.212),.036,.019,'gold').rotation_euler.x=math.pi/2
 b.assembly('Tram carried by station rails',(-.52,-.20,.33),tram,'slide','X',1.04,.34)
 b.board_label('LAST STOP FRUIT PARADISE',(0,-.309,.10),1.16,'teal',.027)

def toucan_palace():
 v.base(color='teal');pool((0,-.02,.23),.76,.30)
 # Two carved papaya towers and a real high bridge, with perched birds.
 for side in [-1,1]:
  x=side*.49
  a.ell('Carved papaya palace tower',(x,.10,.67),(.25,.23,.45),'papaya')
  a.box('Recessed open tower doorway',(x,-.126,.55),(.21,.03,.31),'teal',.08)
  a.box('Tower balcony',(x,-.19,.66),(.41,.17,.043),'pith',.035)
  for dx in [-.16,0,.16]:a.tube('Balcony brass baluster',[(x+dx,-.265,.67),(x+dx,-.265,.77)],.006,'gold')
  a.tube('Balcony handrail',[(x-.19,-.265,.78),(x+.19,-.265,.78)],.007,'gold')
  a.ell('Palace gold canopy',(x,.075,1.10),(.30,.27,.082),'lemon')
  for q in [0,2,4]:c.leaf('Papaya leafy crown',(x,.08,1.16),.23,.058,'jade',q,-.3)
 a.tube('Curved high bridge',[(-.46,-.045,.80),(0,-.08,.91),(.46,-.045,.80)],.046,'woodlight')
 for x in [-.35,-.17,0,.17,.35]:a.tube('Bridge railing post',[(x,-.125,.88-abs(x)*.18),(x,-.125,1.01-abs(x)*.18)],.007,'gold')
 a.tube('Bridge handrail',[(-.43,-.125,.93),(0,-.125,1.025),(.43,-.125,.93)],.007,'gold')
 v.small_toucan((-.37,-.12,.69),.22);v.small_toucan((.40,-.12,.69),.19)
 # A third perched bird turns its head. No miniature bird moonwalks.
 before=set(bpy.context.scene.objects);v.small_toucan((0,-.055,.93),.21)
 p=a.pivot('Palace toucan neck',(0,-.055,1.092),'rock','Z',.065,.43)
 for o in set(bpy.context.scene.objects)-before:
  if o!=p and o.name.startswith(('Toucan head','Toucan long','Toucan dark','Toucan eye')):a.parent(o,p)
 for side in [-1,1]:palm((side*.50,.17,.30),.58)
 b.board_label('TOUCAN PALACE OF PLENTY',(0,-.40,.14),1.12,'teal',.028)

def summer_glass():
 v.base(color='teal')
 # The giant glass stays behind its stepped waterfront, rather than hiding it.
 profile=[(.53,.19),(.59,.29),(.71,1.31),(.69,1.35)]
 o=a.lathe('Crystal smoothie glass cutaway',profile,'crystal',0,math.pi,steps=36);o.scale.y=.51
 for side in [-1,1]:a.tube('Glass cut rim',[(side*r,0,z) for r,z in profile],.011,'gold')
 o=a.ring('Great crystal glass lip',(0,0,1.35),.70,'gold',.017);o.scale.y=.51
 a.tube('Giant striped straw',[(.39,.22,.45),(.39,.22,1.48),(.67,.22,1.51)],.022,'peach')
 # Two graceful glass ribs and shelf brackets tie the miniature to its vessel.
 for side in [-1,1]:a.tube('Crystal glass rear flute',[(side*.30,.24,.23),(side*.38,.28,.77),(side*.48,.24,1.33)],.004,'pith')
 for z in [.96,1.09,1.22,1.35]:a.ring('Straw cream stripe',(.39,.22,z),.023,'ivory',.006)
 pool((0,-.015,.24),.76,.30)
 for x,z,sc in [(-.36,.33,.59),(.30,.77,.51),(-.20,1.11,.27)]:
  a.box('Waterfront supported terrace',(x,.04,z),(.67,.34,.058),'sand',.03);fruit_stall((x,.045,z+.032),sc)
  a.tube('Terrace rear support',[(x,.17,z-.20),(x,.17,z)],.024,'teal')
  for side in [-1,1]:c.leaf('Balcony tropical leaf',(x+side*.26,.10,z+.046),.14,.047,'jade',.3+side,-.15)
 for i in range(7):a.box('Waterfront stepped path',(.52-i*.055,-.01,.32+i*.072),(.12,.13,.025),'pith',.007)
 palm((-.50,.12,.48),.68)
 # A moored dinghy gently rocks at the waterfront, never crosses land.
 a.tube('Mooring rope',[(-.11,-.17,.34),(.15,-.22,.33)],.003,'wood')
 def dinghy():
  a.ell('Moored fruit delivery dinghy',(.24,-.23,.32),(.18,.07,.041),'peach');a.ell('Dinghy interior',(.24,-.23,.355),(.14,.047,.012),'wood');a.box('Dinghy bench',(.24,-.23,.365),(.044,.13,.018),'pith',.006)
 b.assembly('Boat on its mooring',(.24,-.23,.32),dinghy,'rock','Y',.036,.58)
 b.board_label('A WHOLE SUMMER IN A GLASS',(0,-.40,.14),1.23,'teal',.028)

BUILDERS={'domain_smoothie_palm_fountain':fountain,'domain_smoothie_fruit_tide':tide_pool,'domain_smoothie_fruit_atoll':conservatory,'domain_smoothie_citrus_reef':citrus_reef,'domain_smoothie_tropical_station':fruit_station,'domain_smoothie_toucan_palace':toucan_palace,'domain_smoothie_sun_in_glass':summer_glass}
if __name__=='__main__':g.build_all(BUILDERS,'3.0.0-smoothie-finale.1',Path(__file__).resolve())
