"""Original complete-room visual benchmarks, built locally. Not ownership grants.
Uses the same units, PBR palette, geometry merging, UVs and provenance as the hero kit.
All output remains on D:. No provider, downloads or production publishing.
"""
import importlib.util, math, bpy, json, hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('domain_primitives',Path(__file__).with_name('dk-build-domain-heroes.py'))
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
a.UV_PROJECTION='cube'
a.MAX_TRIANGLES=200000
a.P.update({'hotred':('#bd271e',.12,.30),'lacquer':('#7d171b',.15,.28),'coal':('#24252b',.25,.38),'ant':('#ed5833',.04,.34),'ivory':('#fff1cc',0,.32),'gold':('#eabb54',.68,.25),'walnut2':('#39241e',.05,.40),'oak':('#a7724d',.04,.43),'oaklight':('#c79765',0,.43),'oaktone':('#895634',0,.43),'velvet':('#781f40',0,.66),'stone':('#e9d9b6',0,.43),'rosewall':('#e8b3a5',0,.55),'seagreen':('#286756',.05,.39),'peach':('#e59a76',.06,.38),'limewall':('#eee5bd',0,.50),'tealglass':('#79bba9',.15,.3)})
W,H=10,8
bottle_templates={}

def group_objects(before,parent):
 # Snapshot once: per-object dependency updates made bottle-wall builds quadratic.
 bpy.context.view_layer.update()
 objects=set(bpy.context.scene.objects)-before-{parent}
 matrices={o:o.matrix_world.copy() for o in objects}
 for o in objects:o.parent=parent;o.matrix_world=matrices[o]
a.group_since=group_objects

def box(n,x,y,z,w,h,d,c,r=.03):return a.box(n,(x,-z,y),(w,d,h),c,r)
def ball(n,x,y,z,sx,sy,sz,c):return a.ell(n,(x,-z,y),(sx,sz,sy),c)
def cyl(n,x,y,z,r,h,c,sides=20):
 bpy.ops.mesh.primitive_cylinder_add(vertices=sides,radius=r,depth=h,location=(x,-z,y));return a.finish(bpy.context.object,n,c)
def rod(n,points,r,c):return a.tube(n,[(x,-z,y) for x,y,z in points],r,c)
def group(n,normal=None):
 g=bpy.data.objects.new(n,None);bpy.context.collection.objects.link(g);g.parent=a.root
 if normal:g['dkRoomWallX'],g['dkRoomWallZ']=normal
 return g
def capture_group(before,g):a.group_since(before,g)
def label(text,x,y,z,size,c,angle=0):
 bpy.ops.object.text_add(location=(x,-z,y),rotation=(math.pi/2,0,-angle));o=bpy.context.object;o.name=text;o.data.body=text;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.size=size;o.data.extrude=.009;o.data.bevel_depth=.002;o.parent=a.root;o.data.materials.append(a.mat(c));return o
def text_plate(title,sub,x,y,z,w,c='coal',letters='ivory'):
 box('Exclusive house sign',x,y,z,w,.73,.09,c,.07);label(title,x,y+.095,z+.055,w/(len(title)*.69),letters);label(sub,x,y-.20,z+.058,.105,letters)
def ring(n,x,y,z,r,c,t=.016):return a.ring(n,(x,-z,y),r,c,t)
def round_top(n,x,y,z,w,d,h,c):return box(n,x,y,z,w,h,d,c,min(.18,d*.3))
def bowl(x,y,z,s=.12):return a.bowl((x,-z,y),s)
def bottle(x,y,z,s=.13,c='wine'):
 # Twelve-sided spun glass reads clearly when repeated across a cellar wall.
 key=(s,c)
 if key in bottle_templates:
  original,ox,oy,oz=bottle_templates[key]
  for source in original:
   o=source.copy();o.data=source.data.copy();bpy.context.collection.objects.link(o);o.parent=a.root;o.location=source.location.copy();o.location.x+=x-ox;o.location.y-=z-oz;o.location.z+=y-oy
  return
 before=set(bpy.context.scene.objects)
 o=a.lathe('Cellar bottle',[(.25*s,0),(.28*s,.10*s),(.28*s,1.1*s),(.13*s,1.36*s),(.095*s,1.65*s)],c,steps=12);o.location=(x,-z,y)
 cyl('Bottle foil',x,y+1.57*s,z,.105*s,.17*s,'gold',10);box('Bottle label',x,y+.60*s,z+.28*s,.35*s,.48*s,.007,'ivory',.003)
 bottle_templates[key]=(list(set(bpy.context.scene.objects)-before),x,y,z)
def wineglass(x,y,z,s=.17):return a.wineglass((x,-z,y),s)
def planter(x,z,scale=1,tropical=False):
 cyl('Sculpted planter',x,.25*scale,z,.29*scale,.5*scale,'peach' if tropical else 'gold');cyl('Planter soil',x,.5*scale,z,.27*scale,.03,'walnut2')
 for i in range(7):
  angle=i*math.tau/7;ex=x+math.cos(angle)*.40*scale;ez=z+math.sin(angle)*.40*scale;ey=(1.30+(i%3)*.16)*scale
  rod('Leaf stem',[(x,.5*scale,z),(x+math.cos(angle)*.10,ey-.2,ez*.3+z*.7),(ex,ey,ez)],.012,'seagreen')
  leaf=ball('Broad tropical leaf',ex,ey,ez,.31*scale,.036*scale,.115*scale,'leaf' if i%2 else 'lime');leaf.rotation_euler.z=-angle;leaf.rotation_euler.x=.30
def pendant(x,z,y=2.75,c='gold',lantern=False):
 rod('Supported pendant cable',[(x,3.45,z),(x,y+.16,z)],.009,'coal')
 if lantern:
  ball('Silk pepper lantern',x,y,z,.21,.27,.21,c)
  for i in range(8):
   angle=i*math.tau/8;rod('Lantern rib',[(x+math.cos(angle)*.04,y+.25,z+math.sin(angle)*.04),(x+math.cos(angle)*.21,y,z+math.sin(angle)*.21),(x+math.cos(angle)*.06,y-.24,z+math.sin(angle)*.06)],.006,'gold')
  cyl('Lantern lower collar',x,y-.25,z,.066,.034,'coal');rod('Silk tassel',[(x,y-.28,z),(x,y-.42,z)],.013,'hotred')
 else:
  cyl('Pendant brass brim',x,y,z,.25,.06,c);ball('Milkglass lamp',x,y-.075,z,.16,.12,.16,'ivory')

def support_rail(left,right,z,c):
 for x in [left,right]:
  box('Structural lamp-rail post',x,1.70,z,.055,3.40,.055,c,.012)
  cyl('Rail post foot',x,.08,z,.065,.08,'gold')
def stool(x,z,c='hotred'):
 cyl('Padded bar stool',x,.67,z,.25,.13,c);cyl('Stool stitched edge',x,.72,z,.26,.025,'gold');cyl('Stool pedestal',x,.34,z,.044,.55,'gold');cyl('Stool foot',x,.07,z,.22,.07,'coal');ring('Stool footrest',x,.31,z,.16,'gold',.014)
def chair(x,z,c='velvet',angle=0):
 before=set(bpy.context.scene.objects)
 for dx in [-.20,.20]:
  for dz in [-.20,.20]:box('Chair tapered leg',x+dx,.27,z+dz,.036,.47,.036,'walnut2',.008)
 box('Chair cushion',x,.54,z,.51,.13,.53,c,.09);box('Curved upholstered back',x,.91,z-.24,.54,.66,.11,c,.13)
 for dy in [.78,.94,1.10]:ball('Upholstery button',x,dy,z-.175,.016,.014,.005,'gold')
 pivot=group('Dining chair');pivot.location=(x,-z,0);capture_group(before,pivot);pivot.rotation_euler.z=-angle
def cafe_table(x,z,theme='wines'):
 top='stone' if theme=='wines' else 'ivory';base='gold' if theme=='wines' else 'seagreen';cyl('Table pedestal',x,.42,z,.063,.75,base);cyl('Table foot',x,.055,z,.31,.07,base);round_top('Sculpted dining tabletop',x,.86,z,.95,1.14,.09,top)
 if theme=='wines':
  for dz in [-.29,.29]:box('Linen placemat',x,.915,z+dz,.64,.007,.36,'ceramic',.035);wineglass(x+.29,.924,z+dz,.16)
  bottle(x-.18,.91,z,.14);cyl('Table candle',x+.18,.99,z,.033,.13,'ivory');ball('Candle glow',x+.18,1.07,z,.011,.019,.011,'gold')
 elif theme=='gochujang':bowl(x-.10,.945,z,.15);box('Chopsticks',x+.27,.938,z,.018,.015,.34,'walnut',.003)
 else:
  for dx,c in [(-.2,'mango'),(.2,'coral')]:cyl('Fresh fruit drink',x+dx,1.05,z,.073,.24,c);rod('Paper straw',[(x+dx,1.1,z),(x+dx,1.29,z),(x+dx+.04,1.32,z)],.008,'ivory')
def bar(x,z,w,d,c='hotred',top='coal',rib=False):
 round_top('Exclusive counter body',x,.55,z,w,d,1.06,c);round_top('Continuous polished bar',x,1.125,z,w+.10,d+.09,.14,top);box('Bar brass toe kick',x,.12,z+d/2+.004,w-.10,.065,.014,'gold',.01)
 if rib:
  for i in range(max(3,round(w/.13))):box('Handcrafted fluted front',x-w/2+.10+i*.13,.56,z+d/2,.047,.72,.035,'gold' if c=='walnut2' else 'ivory',.012)
 else:
  for i in range(round(w/.75)):
   xx=x-w/2+.4+i*.75;box('Cabinet door',xx,.61,z+d/2+.02,.63,.72,.023,'lacquer' if c=='hotred' else c,.034);cyl('Brass pull',xx,.75,z+d/2+.05,.03,.015,'gold')
 rod('Solid brass foot rail',[(x-w/2+.15,.30,z+d/2+.24),(x+w/2-.15,.30,z+d/2+.24)],.02,'gold')
def base(theme):
 box('Restaurant foundation',4.5,-.105,3.5,10.45,.21,8.45,'coal' if theme=='gochujang' else 'stone',.08)
 if theme=='wines':
  # Plank flooring, with an inlaid walnut perimeter. No giant empty ground plane.
  for row in range(28):
   z=-.34+row*.279
   for col in range(7):
    x=-.45+col*1.48+(row%2)*.74;ww=min(1.45,9.46-x)
    if ww>0:box('Oak parquet plank',x+ww/2,.006,z,ww,.035,.264,['oak','oaklight','oaktone'][(row*7+col*5)%3],.006)
 else:
  for z in range(8):
   for x in range(10):box('Hand-set floor tile',x,.005,z,.987,.035,.987,('coal' if (x+z)%2 else 'charcoal') if theme=='gochujang' else ('stone' if (x+z)%3 else 'ceramic'),.012)
 for x in [-.47,9.47]:box('Floor inlay',x,.033,3.5,.035,.012,8,'gold',.003)
 for z in [-.47,7.47]:box('Floor inlay',4.5,.033,z,10,.012,.035,'gold',.003)
 # Low foreground cuts are intentional; they keep the kitchen and chairs visible.
 for x,w in [(1.40,3.8),(7.62,3.75)]:box('Front cutaway wall',x,.32,7.58,w,.64,.19,'hotred' if theme=='gochujang' else 'walnut2' if theme=='wines' else 'peach');box('Front stone cap',x,.66,7.58,w+.04,.07,.24,'gold' if theme=='gochujang' else 'stone')
 box('Left cutaway wall',-.57,.32,3.5,.18,.64,8.2,'hotred' if theme=='gochujang' else 'walnut2' if theme=='wines' else 'peach');box('Left wall cap',-.57,.66,3.5,.24,.07,8.2,'gold' if theme=='gochujang' else 'stone')
def ant(x,z,s=.72,hat=True,working=True):
 before=set(bpy.context.scene.objects)
 ball('Fireant rounded head',x,1.12*s,z,.35*s,.31*s,.28*s,'ant');ball('Fireant abdomen',x,.47*s,z-.02,.26*s,.24*s,.23*s,'lacquer');ball('Chef jacket',x,.75*s,z,.25*s,.26*s,.20*s,'ivory')
 for side in [-1,1]:
  ball('White almond eye',x+side*.126*s,1.16*s,z+.251*s,.11*s,.081*s,.025*s,'ivory');ball('Attentive pupil',x+side*.126*s,1.15*s,z+.275*s,.033*s,.041*s,.014*s,'coal')
  rod('Expressive brow',[(x+side*.23*s,1.28*s,z+.25*s),(x+side*.055*s,1.255*s,z+.28*s)],.021*s,'coal')
  rod('Fireant antenna',[(x+side*.17*s,1.36*s,z),(x+side*.27*s,1.63*s,z),(x+side*.35*s,1.65*s,z+.055*s)],.024*s,'lacquer')
  for k in range(2):rod('Ant planted leg',[(x+side*.13*s,.42*s,z+(k-.5)*.22*s),(x+side*.29*s,.25*s,z+(k-.5)*.26*s),(x+side*.30*s,.055*s,z+(k-.5)*.28*s)],.036*s,'coal')
  ball('Chef boot',x+side*.30*s,.045*s,z+.04,.09*s,.052*s,.16*s,'coal')
 box('Red chef apron',x,.71*s,z+.21*s,.32*s,.43*s,.025,'hotred',.025)
 if hat:cyl('Fireant black hat brim',x,1.43*s,z,.38*s,.035*s,'coal');cyl('Traditional black crown',x,1.58*s,z,.18*s,.31*s,'coal')
 head=group('Recognizable Fireant cook');capture_group(before,head)
 # A supported elbow moves the spoon around a fixed pot, with feet planted.
 before=set(bpy.context.scene.objects);rod('Chef upper arm',[(x+.20*s,.93*s,z),(x+.43*s,1.05*s if working else .85*s,z+.13*s)],.045*s,'ivory')
 if working:rod('Stirring spoon',[(x+.43*s,1.05*s,z+.13*s),(x+.42*s,.89*s,z+.34*s)],.015*s,'walnut')
 else:ball('Welcoming hand',x+.46*s,.89*s,z+.14*s,.06*s,.07*s,.05*s,'ant')
 motion=a.pivot('Ant tending the soup' if working else 'Host greeting',(x+.2*s,-z,.93*s),'rock','X',.06 if working else .035,.95 if working else .45);capture_group(before,motion)
def walls(theme):
 for side in ['back','right']:
  before=set(bpy.context.scene.objects);g=group(side+' themed architectural wall',(0,-1) if side=='back' else (1,0))
  c='hotred' if theme=='gochujang' else 'walnut2' if theme=='wines' else 'seagreen'
  if side=='back':box('Solid themed back wall',4.5,1.80,-.55,10.2,3.6,.22,c);box('Architectural cornice',4.5,3.56,-.39,10.3,.16,.34,'gold' if theme!='smoothie' else 'peach')
  else:box('Solid themed side wall',9.55,1.80,3.5,.22,3.6,8.2,c);box('Architectural cornice',9.39,3.56,3.5,.34,.16,8.3,'gold' if theme!='smoothie' else 'peach')
  if theme=='wines':
   # Wall-to-wall actual bottle bays, with a niche left open for the house sign.
   count=10 if side=='back' else 8
   for bay in range(count):
    if side=='back' and 2<=bay<=5:continue
    for row in range(6):
     y=.45+row*.43
     if side=='back':box('Walnut cellar shelf',bay,y,-.32,.96,.045,.40,'oak');box('Warm brass shelf light',bay,y+.03,-.12,.86,.013,.019,'gold')
     else:box('Walnut cellar shelf',9.32,y,bay,.40,.045,.96,'oak');box('Warm brass shelf light',9.12,y+.03,bay,.019,.013,.86,'gold')
     for k in range(4):
      if side=='back':bottle(bay+(k-1.5)*.20,y+.04,-.25,.18,['wine','leaf','charcoal'][(bay+row+k)%3])
      else:
       before_b=set(bpy.context.scene.objects);bottle(9.26,y+.04,bay+(k-1.5)*.20,.18,['wine','leaf','charcoal'][(bay+row+k)%3]);bg=group('Side-facing cellar bottle');bg.location=(9.26,-(bay+(k-1.5)*.20),0);capture_group(before_b,bg);bg.rotation_euler.z=math.pi/2
    if side=='back':box('Cellar bay upright',bay-.49,1.58,-.24,.055,2.8,.5,'oak');box('Brass bay number',bay,3.12,-.36,.30,.13,.04,'gold')
    else:box('Cellar bay upright',9.24,1.58,bay-.49,.5,2.8,.055,'oak')
   if side=='back':text_plate('WINES.XYZ','THE VELVET CELLAR',3.5,2.65,-.34,3.5,'walnut2','gold')
  elif theme=='gochujang':
   for n in range(10 if side=='back' else 8):
    for row in range(5):
     if side=='back':box('Glazed red wall tile',n,.3+row*.29,-.408,.96,.266,.02,'lacquer' if (n+row)%5==0 else 'red',.017)
     else:box('Glazed red wall tile',9.408,.3+row*.29,n,.02,.266,.96,'lacquer' if (n+row)%5==0 else 'red',.017)
   if side=='back':
    text_plate('Gochujang.com','FIREANT RAMYEON CLUB',3.8,2.81,-.35,5.1,'coal','ivory')
    for x in [0,7.9]:
     cyl('Pepper medallion',x,2.50,-.27,.47,.08,'gold').rotation_euler.x=math.pi/2
     ball('Pepper emblem',x,2.49,-.18,.13,.30,.08,'hotred');rod('Pepper stem',[(x,2.78,-.18),(x+.06,2.88,-.18),(x+.16,2.87,-.18)],.03,'leaf')
   else:
    # Graphic red-and-gold framed architectural panels, not purchasable posters.
    for z in [1,3.6,6.2]:
     box('Gold lattice frame',9.36,2.40,z,.08,1.34,1.62,'gold');box('Charcoal inset',9.30,2.40,z,.045,1.2,1.48,'coal')
     for j in range(5):box('Lacquer screen slat',9.25,2.40,z-.6+j*.30,.06,1.18,.035,'hotred')
  else:
   # Orangery glazing and repeated open view panels between sculpted palm piers.
   for k in range(4 if side=='back' else 3):
    p=.6+k*2.45
    if side=='back':
     box('Waterfront glass',p,2.12,-.398,2.16,2.52,.035,'tealglass',.25)
     for xx in [p-1.06,p,p+1.06]:box('Orangery frame',xx,2.12,-.32,.045,2.55,.065,'ivory')
     box('Orangery transom',p,2.42,-.31,2.15,.055,.065,'ivory')
    else:
     box('Waterfront glass',9.398,2.12,p,.035,2.52,2.16,'tealglass',.25)
     for zz in [p-1.06,p,p+1.06]:box('Orangery frame',9.32,2.12,zz,.065,2.55,.045,'ivory')
     box('Orangery transom',9.31,2.42,p,.065,.055,2.15,'ivory')
   if side=='back':text_plate('smoothie.com','THE TROPICAL FRUIT CLUB',4.2,2.85,-.20,4.6,'seagreen','ivory')
  capture_group(before,g)

def gochu():
 base('gochujang');walls('gochujang')
 bar(2.85,2.45,4.9,.90);bar(.60,3.20,.82,2.20)
 # The high rail supports the lamps; lanterns do not hover over the tables.
 box('Overhead lacquer beam',3.0,3.43,2.50,6.7,.14,.18,'coal')
 support_rail(-.20,6.22,2.50,'coal')
 for x in [.15,1.5,3,4.5,6]:pendant(x,2.50,2.82,'red' if x%3 else 'gold',True)
 for x in [1.3,2.6,4]:stool(x,3.48,'hotred');bowl(x,1.24,2.55,.15)
 for x in [1.1,3.3]:
  ant(x,1.25,1.18);cyl('Chef pot',x+.495,.95,1.65,.19,.22,'steel');cyl('Simmering broth',x+.495,1.053,1.65,.174,.015,'orange');cyl('Pot stand',x+.495,.48,1.65,.17,.82,'coal')
 for z in [4.7,6.55]:
  cafe_table(7.4,z,'gochujang');chair(6.40,z,'hotred',-math.pi/2);chair(8.45,z,'hotred',math.pi/2)
 # Architectural stepped fermentation display is part of this earned room kit.
 bar(7.5,.65,2.55,.77,'hotred','coal')
 for x in [6.6,7.1,7.6,8.1,8.6]:
  cyl('Glazed fermentation jar',x,1.46,.65,.18,.49,'lacquer');cyl('Jar lid',x,1.73,.65,.20,.06,'gold')
 # A recognizable Fireant host belongs at the entrance, facing arriving guests.
 ant(.45,6.33,.92,working=False)
 text_plate('HOT BOWLS. BIG HEART.','SPICE STREET',3.0,.44,7.71,2.9,'coal','gold')

def smoothie():
 base('smoothie');walls('smoothie')
 bar(3.1,2.4,5.1,1.05,'peach','stone',True);bar(.65,3.30,.84,2.15,'peach','stone',True)
 # Fruit display is organized like a real bar: ingredients sit in bowls, never in mid-air.
 for i,c in enumerate(['mango','coral','lime','grape']):
  x=1.35+i*.72;cyl('Produce bowl',x,1.23,2.18,.26,.13,'ivory')
  for j in range(6):ball('Fresh produce',x+math.cos(j*2.4)*.14,1.36+(j%2)*.05,2.18+math.sin(j*2.4)*.13,.08,.085,.08,c)
 for x in [1.35,2.7,4.1]:stool(x,3.58,'coral')
 for x,z,s in [(.05,.45,1.45),(8.85,.80,1.28),(8.90,6.9,1.2),(.15,6.20,1.10)]:planter(x,z,s,True)
 box('Suspended garden beam',3.2,3.43,2.38,6.65,.14,.18,'seagreen')
 support_rail(-.07,6.46,2.38,'seagreen')
 for x in [1.1,3.0,5.0]:pendant(x,2.38,2.84,'gold')
 # Foliage grows from supported overhead troughs outside the cooking workspace.
 for x in [0,8.3]:
  box('Hanging garden trough',x,3.08,1.1,1.2,.26,.52,'peach')
  for dx in [-.48,.48]:
   rod('Wall-fixed planter bracket',[(x+dx,3.30,-.40),(x+dx,3.30,1.1),(x+dx,3.15,1.1)],.017,'gold')
  for j in range(7):
   z=.92+(j%2)*.30;xx=x-.48+j*.16;rod('Trailing vine',[(xx,3.2,z),(xx+.05,2.91,z),(xx-.03,2.64,z)],.01,'leaf')
   for h in [2.74,2.93,3.12]:ball('Garden leaf',xx,h,z,.10,.045,.09,'leaf' if j%2 else 'lime')
 for z in [4.8,6.65]:cafe_table(7.05,z,'smoothie');chair(6.0,z,'coral',-math.pi/2);chair(8.1,z,'sage',math.pi/2)
 # Distinctive segmented citrus ceiling fan, mechanically attached to a beam.
 box('Fan support',7.15,3.43,5.15,4.8,.10,.13,'seagreen');box('Fan support post',4.76,1.70,5.15,.05,3.40,.05,'seagreen');cyl('Fan spindle',5.9,3.20,5.15,.04,.38,'gold')
 before=set(bpy.context.scene.objects);cyl('Fan hub',5.9,3.0,5.15,.13,.11,'ivory')
 for i in range(5):
  angle=i*math.tau/5;blade=box('Bamboo fan blade',5.9+math.cos(angle)*.43,3.0,5.15+math.sin(angle)*.43,.65,.025,.16,'oaklight',.07);blade.rotation_euler.z=-angle
 fan=a.pivot('Slow working ceiling fan',(5.9,-5.15,3.0),'spin','Z',0,.42);capture_group(before,fan)
 text_plate('FRESHLY SQUEEZED SUNSHINE','SUNSHINE WATERFRONT',3.0,.44,7.71,3.5,'seagreen','ivory')

def wines():
 a.P.update({'oak':('#996a4a',.04,.43),'oaklight':('#a27353',0,.43),'oaktone':('#936144',0,.43)})
 base('wines');walls('wines')
 bar(3.0,2.55,5.25,1.14,'walnut2','stone',True);bar(.62,3.65,.88,2.7,'walnut2','stone',True)
 # A brass glass rail and bottle backbar turn the entire room into a working cellar.
 for x in [1.2,2.6,4.0]:stool(x,3.82,'velvet');wineglass(x,1.245,2.76,.24)
 for i in range(8):bottle(.85+i*.53,1.23,2.22,.24,['wine','leaf','charcoal'][i%3])
 for z in [4.9,6.60]:cafe_table(7.10,z,'wines');chair(6.05,z,'velvet',-math.pi/2);chair(8.2,z,'velvet',math.pi/2)
 # Supported, restrained chandelier of actual wine glasses, not floating ornaments.
 box('Cellar overhead rail',3.1,3.44,2.50,6.3,.14,.17,'walnut2')
 support_rail(0,6.2,2.5,'gold')
 for x in [1.0,3.0,5.0]:
  pendant(x,2.5,2.85,'gold');rod('Stemware rack',[(x-.39,2.60,2.5),(x+.39,2.60,2.5)],.018,'gold')
  for dx in [-.30,-.10,.10,.30]:
   before=set(bpy.context.scene.objects);wineglass(x+dx,2.59,2.50,.22)
   for o in set(bpy.context.scene.objects)-before:
    if o.name.startswith('Garnet wine'):bpy.data.objects.remove(o,do_unlink=True)
   stemware=group('Hanging stemware');stemware.location=(x+dx,-2.5,2.59);capture_group(before,stemware);stemware.rotation_euler.x=math.pi
 # Dedicated tasting niche, with cut-stone base and a supported grape crest.
 bar(3.50,.30,3.5,.5,'walnut2','stone')
 for x in [2.4,3.0,3.6,4.2,4.8]:bottle(x,1.23,.28,.25)
 for i in range(9):ball('Carved grape crest',3.5+((i%3)-1)*.10,1.95-(i//3)*.13,-.25,.09,.10,.07,'gold')
 planter(.10,6.10,1.0)
 text_plate('GOOD COMPANY. GREAT VINTAGES.','VINEYARD VILLAGE',3.0,.44,7.71,3.9,'walnut2','gold')

# Text becomes ordinary geometry so the runtime needs no fonts or canvas textures.
old_optimize=a.optimize
def optimize():
 for o in list(bpy.context.scene.objects):
  if o.type=='FONT':
   bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');o.select_set(False)
 old_optimize()
 # Repeated beveled joinery is simplified for a whole-room view, not instanced
 # as hundreds of close-up props. Preserve geometry, UVs and separate joints.
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
 if triangles>195000:
  ratio=185000/triangles
  for o in meshes:
   if len(o.data.polygons)<80:continue
   bpy.context.view_layer.objects.active=o
   modifier=o.modifiers.new('Room-scale bevel detail budget','DECIMATE');modifier.ratio=ratio
   bpy.ops.object.modifier_apply(modifier=modifier.name)

def consolidate_wine_materials():
 for old,new in [('cream','ivory'),('ceramic','stone')]:
  target=bpy.data.materials.get(new)
  if not target:continue
  for mesh in [o for o in bpy.context.scene.objects if o.type=='MESH']:
   for slot in mesh.material_slots:
    if slot.material and slot.material.name==old:slot.material=target
a.optimize=optimize
a.BUILDERS={'domain_room_gochujang':gochu,'domain_room_smoothie':smoothie,'domain_room_wines':wines}
for name in ((a.args.only.split(',') if a.args.only else a.BUILDERS) if __name__=='__main__' else []):
 bottle_templates.clear()
 if a.args.finish_existing:
  assert a.args.replace,'Finishing an existing study requires explicit --replace'
  bpy.ops.wm.open_mainfile(filepath=str(a.OUT/(name+'.blend')));a.root=bpy.data.objects[name]
  if name=='domain_room_wines':consolidate_wine_materials()
  optimize();a.export_study(name)
 else:
  if name=='domain_room_wines':
   original_wines=a.BUILDERS[name]
   def wine_with_shared_materials():original_wines();consolidate_wine_materials()
   a.BUILDERS[name]=wine_with_shared_materials
  a.build(name)
 metadata_path=a.OUT/(name+'.json');metadata=json.loads(metadata_path.read_text(encoding='utf-8'))
 metadata.update(source=str(Path(__file__).resolve()),sourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),primitiveSourceSha256=hashlib.sha256(Path(a.__file__).read_bytes()).hexdigest(),support='Complete private room art study; integration with movable earned furnishings pending')
 metadata_path.write_text(json.dumps(metadata,indent=2),encoding='utf-8')
