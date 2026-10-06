"""Seven original Wines collectibles: cellar craft, harvest and cabinet miniatures."""
import importlib.util,math,bpy
import sys
sys.dont_write_bytecode=True
from pathlib import Path
spec=importlib.util.spec_from_file_location('rare_base',Path(__file__).with_name('dk-build-domain-rare-gochujang.py'))
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g);v=g.v;u=g.u;s=g.s;b=g.b;c=g.c;a=g.a

def cellar(p,sc=.5):
 def miniature():
  a.box('Miniature cellar back',(0,.12,.39),(.74,.03,.71),'velvet',.03)
  for x in [-.36,.36]:a.box('Cellar walnut upright',(x,.03,.39),(.048,.23,.76),'wood',.014)
  for z in [.09,.40,.75]:
   a.box('Carved walnut shelf',(0,0,z),(.79,.32,.036),'woodlight',.018)
   if z<.7:
    for x in [-.24,0,.24]:a.bottle((x,0,z+.022),.125,'garnet')
  a.box('Tasting table',(0,-.18,.29),(.54,.21,.038),'wood',.021)
  for x in [-.20,.20]:a.box('Table carved leg',(x,-.18,.17),(.03,.10,.21),'gold',.006)
  for x in [-.13,.13]:b.relocated(lambda:c.tasting_glass(0,0,0),(x,-.18,.315),.48)
 b.relocated(miniature,p,sc)

def vine_row(p,w=.6):
 x,y,z=p
 for xx in [-w/2,w/2]:a.tube('Vineyard trained post',[(x+xx,y,z),(x+xx,y,z+.17)],.008,'wood')
 a.tube('Taut trellis wire',[(x-w/2,y,z+.15),(x+w/2,y,z+.15)],.002,'gold')
 for k in range(4):xx=x+(k-1.5)*w/4;b.vine((xx,y,z),.20)

def press(p,sc=1,animate=True):
 def model():
  a.box('Wine press limestone bed',(0,0,.05),(.46,.34,.10),'stone',.026)
  for x in [-.19,.19]:a.box('Wine press oak column',(x,.035,.32),(.050,.060,.55),'wood',.014)
  a.box('Press oak lintel',(0,.035,.61),(.49,.09,.069),'wood',.020)
  a.cyl('Press basket bottom',(0,0,.14),.16,.035,'woodlight')
  for k in range(16):q=k*math.tau/16;a.box('Press basket vertical stave',(math.cos(q)*.15,math.sin(q)*.15,.26),(.023,.025,.23),'woodlight',.006)
  for z in [.19,.33]:a.ring('Press basket hoop',(0,0,z),.155,'gold',.007)
  a.cyl('Press juice',(0,0,.177),.132,.027,'garnet');a.cyl('Press circular platen',(0,0,.39),.128,.026,'wood')
  a.tube('Press threaded screw',[(0,0,.41),(0,0,.72)],.013,'steel')
  for z in [.47,.51,.55,.59]:a.ring('Fine screw thread',(0,0,z),.017,'gold',.003)
  def crank():a.tube('Press turning handle',[(-.13,0,.71),(.13,0,.71)],.012,'wood');a.ell('Press handle grip',(.14,0,.71),(.034,.023,.023),'gold')
  if animate:b.assembly('Wine press screw head',(0,0,.71),crank,'rock','Z',.14,.50)
  else:crank()
 b.relocated(model,p,sc)

def chiller():
 v.base(.96,.81,'wood')
 a.box('Wine chiller insulated back',(0,.285,.75),(.82,.07,1.12),'velvet',.05)
 for x in [-.395,.395]:a.box('Carved walnut chiller frame',(x,.018,.75),(.078,.60,1.13),'wood',.036)
 for z in [.22,.53,.86,1.29]:a.box('Brass chilled shelf',(0,.028,z),(.79,.55,.040),'gold',.024)
 for z in [.25,.565,.89]:
  for x in [-.24,0,.24]:a.bottle((x,.08,z),.131,'garnet' if x else 'jade')
 # Open visual center keeps real stocked shelves legible at playing distance.
 # Slender glazed edge panes and a brass perimeter describe the closed door.
 for x in [-.30,.30]:a.box('Clear chiller edge glazing',(x,-.29,.765),(.057,.009,.94),'crystal',.008)
 for x in [-.34,.34]:a.box('Glass door brass upright',(x,-.304,.765),(.017,.016,.98),'gold',.006)
 a.tube('Chiller brass door handle',[(.263,-.32,.55),(.263,-.37,.59),(.263,-.37,.87),(.263,-.32,.91)],.013,'gold')
 for side in [-1,1]:b.vine((side*.31,-.305,.33),.29)
 def indicator():c.leaf('Cooling dial leaf',(0,-.312,1.263),.082,.029,'jade',.2)
 s.work(b.assembly('Supply cooling indicator',(0,-.312,1.263),indicator,'rock','Y',.06,.75))
 b.board_label('THE CELLAR CABINET',(0,-.397,.14),.73,'wood',.027)

def harvest_arch():
 a.box('Harvest wall backing',(0,.14,.67),(1.85,.055,1.20),'wood',.07)
 a.box('Burgundy harvest inset',(0,.105,.65),(1.70,.026,1.06),'velvet',.048)
 a.box('Limestone harvest sill',(0,-.04,.13),(1.90,.46,.085),'stone',.032)
 for x in [-.57,.57]:a.box('Harvest arch column',(x,.015,.59),(.12,.20,.85),'stone',.032);b.vine((x-.02,-.093,.35),.44)
 a.tube('Limestone harvest arch',[(-.57,.015,.94),(-.29,.015,1.19),(0,.015,1.23),(.29,.015,1.19),(.57,.015,.94)],.069,'stone')
 for side in [-1,1]:a.bottle((side*.77,-.04,.18),.13,'garnet')
 a.box('Harvest cart lane',(0,-.16,.215),(1.35,.12,.022),'woodlight',.014)
 # The arch looks into a vineyard, not an empty burgundy rectangle.
 for i in range(3):
  z=.43+i*.18;w=.83-i*.11;a.box('Distant vineyard stone terrace',(0,.058,z),(w,.061,.079),'stonewarm',.02)
  for j in range(5-i):
   x=(j-(4-i)/2)*.15;a.tube('Mini trellis post',[(x,.010,z+.04),(x,.010,z+.15)],.004,'wood')
   c.leaf('Mini vineyard leaf',(x,.012,z+.14),.075,.029,'jade',j*.9);a.ell('Mini grape bunch',(x,-.009,z+.096),(.017,.015,.025),'grape')
 a.box('Harvest village house',(0,.062,1.03),(.19,.062,.14),'ivory',.012);a.box('House burgundy roof',(0,.045,1.111),(.23,.089,.029),'velvet',.013)
 def cart():
  a.box('Grape harvest cart',(-.42,-.16,.33),(.28,.16,.16),'wood',.026)
  for dx in [-.08,.08]:a.cyl('Harvest cart wheel',(-.42+dx,-.25,.24),.039,.014,'gold').rotation_euler.x=math.pi/2
  for k in range(8):a.ell('Grapes in harvest cart',(-.50+(k%4)*.047,-.185+(k//4)*.05,.427),(.028,.027,.030),'grape')
 b.assembly('Harvest cart on recessed guide',(-.42,-.16,.33),cart,'slide','X',.83,.28)
 b.lantern((0,-.005,1.06),.06,.14)
 b.board_label('HARVEST PROCESSION',(0,-.28,.12),.99,'wood',.030)

def endless_vintage():
 v.base(color='wood')
 # A waist-pinched hourglass silhouette, with cutaway crystal and solid floors.
 profile=a.soft_profile([(.61,.22),(.70,.38),(.59,.57),(.17,.77),(.17,.87),(.57,1.07),(.69,1.30)])
 glass=a.lathe('Crystal hourglass cellar',profile,'crystal',0,math.pi,steps=36);glass.scale.y=.45
 for side in [-1,1]:a.tube('Hourglass brass cut rim',[(side*r,0,z) for r,z in profile],.012,'gold')
 for z in [.22,1.32]:a.box('Walnut hourglass crown',(0,0,z),(1.53,.67,.065),'wood',.075);a.box('Crown gold marquetry',(0,-.338,z),(1.36,.012,.011),'gold',.003)
 for x in [-.70,.70]:a.tube('Hourglass fixed outer column',[(x,0,.24),(x,0,1.31)],.025,'gold')
 for z in [.22,1.32]:
  for x in [-.60,.60]:a.ell('Hourglass polished corner boss',(x,-.26,z+.043),(.039,.027,.029),'gold')
 cellar((-.25,.04,.27),.68);press((.31,.025,.27),.58,False)
 for side in [-1,1]:
  x=side*.32;a.box('Upper vineyard terrace',(x,.055,1.105),(.49,.30,.055),'stone',.02);vine_row((x,.035,1.14),.36)
 # Tiered wine-label books make the waist read as a cellar instrument.
 for side in [-1,1]:
  for k in range(3):a.box('Cellar vintage ledger',(side*(.34+k*.037),.115,.81),(.030,.14,.18),'velvet' if k%2 else 'wood',.004)
  a.box('Ledger stone shelf',(side*.37,.10,.704),(.23,.23,.035),'stone',.013)
 # The vintage moves on a vertical cellar lift through the neck, never floats.
 for x in [-.075,.075]:a.tube('Hourglass elevator guide',[(x,-.025,.48),(x,-.025,1.26)],.006,'gold')
 def lift():a.box('Vintage elevator platform',(0,-.025,.52),(.18,.17,.023),'gold',.012);v.barrel((0,-.025,.538),.052,.13)
 b.assembly('Vintage lift through glass waist',(0,-.025,.52),lift,'slide','Z',.56,.25)
 b.board_label('THE ENDLESS VINTAGE',(0,-.40,.14),.97,'wood',.030)

def moon_press():
 v.base(color='wood');a.box('Harvest workshop stone floor',(0,0,.235),(1.65,.67,.14),'stone',.038)
 press((-.16,-.02,.31),1.0)
 for x in [.38,.63]:v.barrel((x,.07,.31),.098,.25)
 u.cheesemonger((-.57,-.005,.31))
 a.tube('Brass moon support',[(.02,.22,.31),(.02,.22,1.03)],.016,'gold')
 # Slim open crescent above the press, supported behind the workshop.
 a.tube('Brass harvest moon',[(.02+math.cos(q)*.30,.22,1.06+math.sin(q)*.30) for q in [i*math.pi*1.65/28+.18 for i in range(29)]],.043,'gold')
 for side in [-1,1]:b.vine((side*.70,.18,.35),.59)
 a.box('Press runoff channel',(.08,-.18,.32),(.65,.079,.024),'garnet',.014)
 b.board_label('THE MOONLIT WINE PRESS',(0,-.40,.14),1.02,'wood',.030)

def velvet_stage():
 a.box('Theatre walnut wall case',(0,.16,.70),(1.87,.055,1.26),'wood',.07)
 a.box('Deep velvet stage back',(0,.12,.70),(1.70,.026,1.12),'velvet',.04)
 a.box('Polished tasting stage',(0,-.035,.15),(1.87,.49,.13),'woodlight',.037)
 for x in [-.83,.83]:a.box('Theatre brass pilaster',(x,-.045,.76),(.065,.33,1.10),'gold',.021)
 a.box('Theatre carved cornice',(0,-.035,1.30),(1.92,.40,.073),'wood',.032)
 cellar((0,.04,.225),.81)
 a.box('Grand tasting table',(0,-.14,.46),(.92,.25,.053),'stone',.03)
 for x in [-.34,.34]:a.box('Table carved pedestal',(x,-.12,.33),(.051,.13,.23),'gold',.010)
 for x in [-.33,-.10,.10,.33]:b.relocated(lambda:c.tasting_glass(0,0,0),(x,-.15,.50),.49)
 a.bottle((.02,-.07,.50),.11,'garnet')
 for side in [-1,1]:
  def curtain(side=side):
   for k in range(6):x=side*(.49+k*.047);a.tube('Draped velvet curtain fold',[(x,-.12,1.24),(x+side*.02,-.11,.84),(x+side*.055,-.11,.25)],.032,'velvet')
   a.tube('Curtain gold tie',[(side*.51,-.152,.79),(side*.79,-.152,.79)],.007,'gold')
  b.assembly('Curtain on theatre rail '+str(side),(side*.61,-.11,.75),curtain,'slide','X',side*.055,.36)
 b.board_label('THE VELVET TASTING THEATRE',(0,-.30,.14),1.17,'wood',.027)

def grand_chandelier():
 for x in [-.56,.56]:a.cyl('Chandelier ceiling rose',(x,0,1.40),.086,.036,'gold');a.tube('Chandelier suspension',[(x,0,1.38),(x,0,1.14)],.010,'gold')
 a.box('Walnut chandelier crown',(0,0,1.13),(1.72,.48,.09),'wood',.05)
 a.box('Crown inset brass stripe',(0,-.245,1.14),(1.58,.010,.014),'gold',.003)
 for i,x in enumerate([-.66,-.33,0,.33,.66]):
  # Mounted magnums on a heavy shelf; no airborne bottles.
  a.box('Magnum shelf saddle',(x,.045,.63),(.23,.24,.044),'wood',.021)
  for side in [-1,1]:a.tube('Bottle cradle arm',[(x+side*.08,.04,.65),(x+side*.08,.04,1.085)],.012,'gold')
  a.bottle((x,.045,.66),.18,'garnet' if i%2 else 'jade')
  a.tube('Stemware rack arm',[(x,-.035,1.08),(x,-.17,.90)],.009,'gold')
  # Real wineglass forms suspended upside down by their foot.
  root=b.relocated(lambda:c.tasting_glass(0,0,0),(x,-.17,.91),.91);root.rotation_euler.x=math.pi
 for side in [-1,1]:
  x=side*.65;a.tube('Grapevine chandelier branch',[(x,0,1.15),(x+side*.16,-.04,.99),(x+side*.12,-.08,.77)],.018,'gold')
  b.assembly('Little chandelier leaf on petiole '+str(side),(x,-.05,.85),lambda x=x:c.leaf('Small glass grape leaf',(x,-.05,.85),.17,.059,'jade',.4),'rock','X',.025,.51)
 for x in [-.48,.48]:b.vine((x,.07,1.14),.18)
 for side in [-1,1]:
  x=side*.78;a.tube('Chandelier scrollwork',[(x,-.10,.95),(x+side*.10,-.10,.85),(x+side*.08,-.10,.74),(x,-.10,.77)],.011,'gold')
 for x in [-.49,-.16,.16,.49]:
  a.tube('Crystal drop suspension',[(x,-.18,.84),(x,-.18,.70)],.004,'gold');a.ell('Faceted garnet grape drop',(x,-.18,.64),(.035,.028,.060),'garnet')

def world_vintage():
 v.base(color='wood')
 # Monumental horizontal barrel cut open toward the viewer, supported by saddles.
 profile=a.soft_profile([(.52,.20),(.76,.42),(.82,.80),(.76,1.12),(.52,1.40)])
 shell=a.lathe('Great cutaway oak barrel',profile,'woodlight',0,math.pi,steps=40);shell.scale.y=.43
 inner=a.lathe('Barrel dark inner wood',[(r-.031,z) for r,z in profile],'wood',0,math.pi,steps=40);inner.scale.y=.43
 for side in [-1,1]:a.tube('Coopered barrel cut rim',[(side*r,0,z) for r,z in profile],.015,'gold')
 for q in [.20,.53,.88,1.21,1.57,1.94,2.27,2.61,2.94]:
  a.tube('Great oak barrel stave joint',[(math.cos(q)*(r+.003),math.sin(q)*(r+.003)*.43,z) for r,z in profile[::2]],.004,'wood')
 for z,r in [(.37,.72),(1.18,.72)]:
  hoop=a.ring('Giant barrel forged hoop',(0,0,z),r,'gold',.018);hoop.scale.y=.43
 a.box('Barrel top cooper crown',(0,.04,1.43),(1.10,.47,.055),'wood',.065)
 cellar((-.32,.05,.27),.69);press((.37,.02,.29),.61,False)
 for i,(x,z,w) in enumerate([(-.28,.84,.72),(.16,1.10,.64)]):
  a.box('Vineyard retaining terrace',(x,.09,z),(w,.32,.082),'stone',.027);a.box('Terrace earth',(x,.09,z+.054),(w-.04,.28,.023),'soil',.02);vine_row((x,.085,z+.067),w*.74)
 for i in range(7):a.box('Limestone cellar stair',(.29-i*.058,-.007,.39+i*.073),(.12,.15,.035),'ivory',.008)
 for x in [-.66,-.46]:a.tube('Cellar lift guide',[(x,-.12,.24),(x,-.12,1.10)],.009,'gold')
 def lift():a.box('Barrel cellar lift',(-.56,-.12,.30),(.27,.22,.037),'gold',.017);v.barrel((-.56,-.12,.323),.072,.18)
 b.assembly('Barrel lift on oak guides',(-.56,-.12,.30),lift,'slide','Z',.47,.29)
 a.tube('Cellar lantern bracket',[(.53,.015,1.20),(.53,-.09,1.20)],.006,'gold');b.lantern((.53,-.09,1.13),.042,.095)
 b.board_label('THE WORLDS LAST PERFECT VINTAGE',(0,-.40,.14),1.33,'wood',.023)

BUILDERS={'domain_wines_cellar_chiller':chiller,'domain_wines_harvest_procession':harvest_arch,'domain_wines_endless_vintage':endless_vintage,'domain_wines_moonlit_press':moon_press,'domain_wines_velvet_stage':velvet_stage,'domain_wines_vintage_airship':grand_chandelier,'domain_wines_world_vintage':world_vintage}
if __name__=='__main__':g.build_all(BUILDERS,'3.0.0-wines-finale.1',Path(__file__).resolve())
