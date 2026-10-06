"""Original Blender-authored Lunch Club assets. All production output must be on D:.
Run portable Blender --background --python this.py -- --output D:/... [--only id,...].
No provider calls. Existing outputs are retained unless --replace is explicit.
"""
import bpy, math, sys, json, hashlib, argparse
from pathlib import Path
from mathutils import Vector
ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);ap.add_argument('--only',default='');ap.add_argument('--replace',action='store_true');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
OUT=Path(args.output)
assert OUT.drive.lower()=='d:', 'Generated assets must stay on D:'
OUT.mkdir(parents=True,exist_ok=True)
PALETTE={'ivory':('#fff0ce',.0,.32),'jade':('#185d55',.35,.27),'red':('#bf4739',.2,.27),'copper':('#ce8c56',.78,.3),'gold':('#e9bd61',.8,.24),'chrome':('#b8d6d2',.86,.22),'dark':('#203c3a',.2,.36),'pink':('#e7a5ae',.05,.35),'mint':('#86c6af',.15,.34),'bun':('#dca458',.0,.56),'green':('#779648',.0,.6),'brown':('#633e30',.0,.58),'water':('#70bcc7',.3,.24)}
M={};root=None
def material(key):
 if key in M:return M[key]
 hx,metal,rough=PALETTE[key];srgb=tuple(int(hx[i:i+2],16)/255 for i in (1,3,5));c=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in srgb);m=bpy.data.materials.new(key);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;M[key]=m;return m
def finish(o,name,mat,parent=None):
 o.name=name;o.data.materials.append(material(mat));o.parent=parent or root
 if o.type=='MESH':
  for f in o.data.polygons:f.use_smooth=True
 return o
def ell(name,p,s,mat,parent=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=p);o=bpy.context.object;o.scale=s;return finish(o,name,mat,parent)
def box(name,p,s,mat,r=.035,parent=None):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if r:mod=o.modifiers.new('Crafted rounded edges','BEVEL');mod.width=r;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
 mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');return finish(o,name,mat,parent)
def cyl(name,p,r,d,mat,r2=None,parent=None):
 bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=r,radius2=r if r2 is None else r2,depth=d,location=p);return finish(bpy.context.object,name,mat,parent)
def tube(name,points,r,mat,parent=None):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=12;curve.bevel_depth=r;curve.bevel_resolution=3;spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
 for bp,p in zip(spline.bezier_points,points):bp.co=p;bp.handle_left_type=bp.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.data.materials.append(material(mat));o.parent=parent or root;return o
def ring(name,p,r,mat,axis='Z',parent=None,thick=.025):
 bpy.ops.mesh.primitive_torus_add(major_segments=40,minor_segments=8,location=p,major_radius=r,minor_radius=thick);o=bpy.context.object
 if axis=='Y':o.rotation_euler.x=math.pi/2
 if axis=='X':o.rotation_euler.y=math.pi/2
 return finish(o,name,mat,parent)
def pivot(name,p=(0,0,0),motion='rock',axis='Y',amount=.1,speed=1,work=False):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=root;o.location=p;o['dkMotion']=motion;o['dkAxis']=axis;o['dkAmount']=amount;o['dkSpeed']=speed;o['dkWorkOnly']=work;return o
def reparent(o,p):
 bpy.context.view_layer.update();mw=o.matrix_world.copy();o.parent=p;o.matrix_world=mw;return o
def face(z,y=-.25,x=0,size=1):
 for side in [-1,1]:ell('Bright eye',(x+side*.09*size,y,z),(.025*size,.015*size,.035*size),'dark');ell('Eye glint',(x+side*.09*size-.005,y-.013,z+.009),(.006*size,.004*size,.007*size),'ivory')
 tube('Smile',[(x-.07*size,y,z-.07*size),(x,y-.009,z-.09*size),(x+.07*size,y,z-.07*size)],.009*size,'dark')
def base(w=.8,d=.72):box('Jade footing',(0,0,.075),(w,d,.14),'jade');box('Brass welt',(0,0,.15),(w*.96,d*.96,.025),'gold',.018)
def steam(p,work=False):
 for i in range(3):
  q=pivot('Steam'+str(i),(p[0]+i*.065,p[1],p[2]+i*.085),'float','Y',.035,1+i*.2,work);o=ell('Porcelain vapour',(p[0]+i*.065,p[1],p[2]+i*.085),(.045,.04,.065),'ivory');reparent(o,q)
def bun(p=(0,0,.5),s=1):
 x,y,z=p;ell('Sesame crown',(x,y,z),(.31*s,.28*s,.16*s),'bun')
 for i in range(15):
  a=i*2.399;rr=.21*math.sqrt((i+.5)/15)*s;xx=math.cos(a)*rr;yy=math.sin(a)*rr
  o=ell('Sesame seed',(x+xx,y+yy,z+.15*s*math.sqrt(max(.1,1-(rr/(.31*s))**2))),(.013*s,.028*s,.008*s),'ivory');o.rotation_euler.z=a
def burger(p=(0,0,.4),s=1):
 x,y,z=p;cyl('Lower bun',(x,y,z),.28*s,.09*s,'bun');ell('Patty',(x,y,z+.09*s),(.285*s,.265*s,.045*s),'brown');box('Cheese',(x,y,z+.13*s),(.44*s,.41*s,.028*s),'gold',.012);ell('Lettuce',(x,y,z+.15*s),(.30*s,.28*s,.025*s),'green');bun((x,y,z+.23*s),s)
def feet():
 for x in [-.29,.29]:
  for y in [-.24,.24]:ell('Rounded foot',(x,y,.09),(.10,.13,.09),'dark')
def hero_cat():
 base();box('Dispenser plinth',(0,0,.31),(.72,.66,.38),'jade');box('Recess',(0,-.338,.30),(.54,.015,.25),'dark',.035)
 ell('Ceramic body',(0,.035,.78),(.34,.25,.42),'ivory');ell('Cat head',(0,.005,1.17),(.30,.235,.245),'ivory')
 for x in [-.205,.205]:
  cyl('Ear',(x,0,1.405),.09,.21,'ivory',0);ell('Coral ear',(x,-.073,1.414),(.05,.015,.07),'pink')
 face(1.20,-.222,size=1.3)
 ring('Gold tummy coin',(0,-.243,.80),.13,'gold','Y',thick=.025);ell('Coin centre',(0,-.247,.80),(.115,.025,.115),'gold')
 paw=pivot('Beckoning paw',(.32,0,.91),'rock','X',.20,.85);reparent(ell('Raised paw',(.35,-.02,1.12),(.095,.095,.18),'ivory'),paw)
 for x in [-.22,0,.22]:
  tube('Chrome soda tap',[(x,-.24,.61),(x,-.38,.59),(x,-.39,.50)],.025,'chrome');ell('Tap button',(x,-.25,.67),(.04,.04,.025),'red' if x==0 else 'mint')
 cyl('Glass',(0,-.31,.27),.073,.13,'water');cyl('Lime drink',(0,-.31,.339),.068,.008,'mint')
 tube('Gold striped tail',[(.19,.15,.58),(.38,.24,.62),(.37,.26,.84),(.27,.23,.87)],.045,'gold')
 flow=pivot('Soda flow',(0,-.39,.43),'pulse','Y',.06,2,True);reparent(cyl('Soda stream',(0,-.39,.425),.01,.15,'mint'),flow)
def hero_dragon():
 feet();ell('Dragon enamel body',(0,.015,.48),(.43,.34,.40),'red');box('Grill surround',(0,0,.875),(.81,.64,.12),'copper',.055);box('Grill inset',(0,0,.94),(.69,.51,.018),'dark',.012)
 for i in range(10):box('Grill rib',(-.30+i*.067,0,.957),(.026,.46,.022),'copper',.009)
 ell('Dragon muzzle',(0,-.30,.50),(.29,.14,.15),'red')
 ell('Furnace smile',(0,-.422,.44),(.21,.015,.060),'dark')
 for side in [-1,1]:
  ell('Amber dragon eye',(side*.205,-.295,.725),(.095,.052,.057),'gold');ell('Dragon pupil',(side*.205,-.346,.728),(.017,.010,.045),'dark')
  tube('Heavy copper brow',[(side*.10,-.307,.78),(side*.20,-.32,.81),(side*.29,-.26,.78)],.025,'copper')
  tooth=cyl('Tiny tooth',(side*.13,-.444,.465),.028,.085,'ivory',0);tooth.rotation_euler.x=math.pi
  for j in range(3):ell('Copper toe',(side*.29+(j-1)*.033,-.344,.072),(.013,.025,.020),'copper')
 for x in [-.13,.13]:ell('Warm nostril',(x,-.425,.56),(.043,.018,.028),'gold')
 for side in [-1,1]:
  tube('Copper horn',[(side*.29,.01,.71),(side*.36,.005,.98),(side*.24,.02,1.16)],.043,'copper')
  cyl('Tapered horn tip',(side*.24,.02,1.20),.043,.12,'copper',0)
  for i in range(3):ell('Turquoise wing',(side*(.33+i*.025),.12,.48+i*.08),(.065,.12,.10),'mint')
  for i in range(4):ell('Brass rivet',(side*.407,-.18+i*.115,.50),(.018,.018,.018),'gold')
 cyl('Chimney',(.29,.23,1.045),.066,.23,'copper');ring('Chimney lip',(.29,.23,1.17),.066,'gold',thick=.013);steam((.29,.23,1.25),True)
 tube('Dragon tail',[(0,.27,.38),(.18,.38,.36),(.32,.38,.54)],.055,'red')
def hero_jukebox():
 base();box('Red cabinet',(0,0,.54),(.72,.47,.82),'red',.10)
 ell('Lettuce crown',(0,0,1.03),(.365,.32,.03),'green');box('Cheese crown',(0,0,1.07),(.65,.56,.035),'gold',.025);bun((0,0,1.17),1.23)
 for x in [-.34,.34]:box('Chrome flank',(x,-.19,.68),(.035,.065,.85),'chrome',.017)
 for i,(r,mat) in enumerate([(.30,'gold'),(.255,'mint'),(.21,'pink')]):
  tube('Glowing arch',[(math.cos(a)*r,-.255,.70+math.sin(a)*r) for a in [j*math.pi/16 for j in range(17)]],.025,mat)
 box('Speaker',(0,-.25,.38),(.48,.045,.33),'dark',.035)
 for x in range(9):tube('Speaker grille',[(x*.045-.18,-.279,.25),(x*.045-.18,-.279,.51)],.006,'gold')
 turn=pivot('Vinyl',(0,-.28,.71),'spin','Z',1,.35);disc=cyl('Vinyl record',(0,-.29,.72),.13,.018,'dark');disc.rotation_euler.x=math.pi/2;reparent(disc,turn);reparent(ell('Record label',(.04,-.306,.74),(.04,.01,.035),'red'),turn)
 for i in range(5):
  light=pivot('Button'+str(i),(-.20+i*.1,-.28,.57),'pulse','Y',.08,.8+i*.13);reparent(ell('Lit button',(-.2+i*.1,-.28,.57),(.031,.02,.017),'mint' if i%2 else 'gold'),light)

def dumpling(p,s=.1):
 x,y,z=p;ell('Pleated dumpling',p,(s,s*.8,s*.8),'ivory')
 for i in range(5):
  a=(i-2)*.25;tube('Pastry fold',[(x+a*s,y-.02,z+s*.55),(x+a*s*.65,y,z+s*.84),(x+a*s,y+.02,z+s*.55)],s*.06,'bun')

def roof(z,w=.8,d=.55):
 for side in [-1,1]:
  o=box('Sweeping tiled roof',(side*w*.25,0,z),(w*.56,d,.055),'jade',.015);o.rotation_euler.y=side*.32
  for i in range(7):tube('Tile seam',[(side*.02,-d*.44+i*d*.145,z+.065),(side*w*.48,-d*.44+i*d*.145,z-.07)],.009,'mint')
 tube('Ridge cap',[(-w*.53,0,z-.055),(0,0,z+.115),(w*.53,0,z-.055)],.025,'gold')

def bathhouse():
 base(.79,.59);box('Bath surround',(0,0,.24),(.72,.52,.19),'ivory');box('Warm bath',(0,-.015,.343),(.60,.40,.012),'water',.05)
 for x in [-.31,.31]:
  for y in [-.20,.20]:cyl('Timber post',(x,y,.50),.026,.65,'copper')
 roof(.78,.86,.64)
 for x,y in [(-.17,-.09),(.14,.065)]:dumpling((x,y,.39),.12)
 steam((.04,-.08,.50));box('Bathhouse plaque',(0,-.292,.25),(.19,.012,.08),'jade',.015)

def rocket():
 base();cyl('Chrome rocket foot',(0,0,.30),.21,.27,'chrome',.13);cyl('Drink chamber',(0,0,.66),.22,.44,'pink');ring('Lower glass collar',(0,0,.45),.23,'chrome');ring('Upper glass collar',(0,0,.89),.23,'chrome');cyl('Rocket cone',(0,0,1.02),.23,.28,'red',0)
 for a in [0,2.094,4.189]:
  o=box('Swept rocket fin',(math.sin(a)*.24,math.cos(a)*.24,.47),(.07,.22,.29),'red');o.rotation_euler.z=-a
 swirl=pivot('Shake swirl',(0,0,.66),'spin','Z',1,1.2,True)
 for i in range(2):
  reparent(tube('Cream helix',[(math.cos(a)*.225,math.sin(a)*.225,.48+a*.054) for a in [j*.15+i*math.pi for j in range(37)]],.018,'ivory'),swirl)
 for z in [.58,.70]:ell('Porthole',(0,-.226,z),(.08,.014,.047),'water')
 tube('Milkshake spout',[(.14,0,.57),(.32,-.12,.54),(.32,-.21,.42)],.025,'chrome');cyl('Catch cup',(.31,-.21,.25),.067,.14,'ivory')

def pickles():
 base(.74,.48);ell('Corn dog steed',(0,0,.37),(.25,.085,.10),'bun');ell('Steed head',(.23,0,.47),(.09,.07,.09),'bun')
 for x in [-.16,.16]:
  for y in [-.052,.052]:tube('Tiny galloping legs',[(x,y,.35),(x+.025,y,.24),(x+.055,y,.22)],.018,'copper')
 tube('Mustard saddle',[(-.21,-.075,.4),(-.07,-.09,.43),(.09,-.075,.4),(.22,-.07,.47)],.012,'gold')
 ell('Pickle knight',(0,0,.59),(.085,.07,.15),'green');ell('Steel helmet',(0,0,.74),(.093,.082,.065),'chrome');box('Visor',(0,-.078,.72),(.14,.017,.034),'dark',.008)
 for x in [-.035,0,.035]:box('Visor slit',(x,-.091,.72),(.006,.008,.02),'gold',0)
 tube('Lance',[(.1,-.08,.34),(.13,-.08,.96)],.012,'gold');flag=pivot('Knight pennant',(.13,-.08,.9),'rock','Z',.08,.7);reparent(box('Crimson pennant',(.23,-.08,.86),(.19,.015,.10),'red',.015),flag)
 ell('Shield',(-.08,-.09,.57),(.065,.025,.085),'jade');ring('Shield border',(-.08,-.116,.57),.049,'gold','Y',thick=.006)

def wheel():
 base(.70,.42)
 for side in [-1,1]:tube('Wheel stand',[(side*.27,0,.18),(0,0,.66),(side*.27,.07,.18)],.025,'copper')
 axle=pivot('Butter wheel',(0,0,.65),'spin','Y',1,.18);reparent(ring('Maple wheel',(0,0,.65),.32,'gold','Y',thick=.026),axle)
 for i in range(6):
  a=i*math.tau/6;x=math.cos(a)*.31;z=.65+math.sin(a)*.31
  reparent(tube('Wheel spoke',[(0,0,.65),(x,0,z)],.012,'copper'),axle)
  reparent(box('Butter gondola',(x,-.05,z-.04),(.13,.12,.075),'gold',.026),axle);reparent(cyl('Pancake cushion',(x,-.05,z+.005),.053,.015,'bun'),axle)
 ell('Maple centre',(0,-.04,.65),(.065,.025,.065),'red')

def rabbit():
 base(.73,.54);ell('Tea rabbit',(0,.055,.40),(.14,.12,.23),'ivory');ell('Rabbit head',(0,.02,.65),(.145,.105,.13),'ivory')
 for x in [-.06,.06]:ell('Long porcelain ear',(x,.03,.83),(.034,.038,.17),'ivory');ell('Ear glaze',(x,-.008,.85),(.017,.007,.115),'pink')
 face(.665,-.089,size=.7);ell('Tea pot',(.18,-.12,.43),(.10,.07,.075),'jade');cyl('Teapot lid',(.18,-.12,.502),.053,.017,'gold');tube('Curled spout',[(.12,-.13,.45),(.09,-.2,.46),(.05,-.24,.43)],.019,'jade');ring('Tea cup',(0,-.24,.25),.049,'gold',thick=.012)
 pour=pivot('Tea ribbon',(.05,-.24,.34),'pulse','Y',.10,1);reparent(tube('Tea flowing',[(.05,-.24,.43),(.04,-.25,.35),(0,-.24,.25)],.008,'copper'),pour)
 ring('Moon shrine',(0,.12,.59),.32,'gold','Y',thick=.025)

def lobster():
 ring('Neon halo',(0,.025,.40),.32,'pink','Y',thick=.014);ell('Chrome lobster',(0,0,.40),(.08,.06,.19),'chrome')
 for side in [-1,1]:
  claw=pivot('Claw'+str(side),(side*.06,0,.48),'rock','Y',.08,.7)
  for o in [tube('Arm',[(side*.07,0,.48),(side*.18,0,.57),(side*.25,0,.68)],.03,'chrome'),ell('Claw',(side*.25,0,.72),(.075,.04,.095),'chrome')]:reparent(o,claw)
  for i in range(3):tube('Lobster leg',[(side*.06,0,.43-i*.07),(side*.17,-.005,.44-i*.075),(side*.19,0,.37-i*.08)],.012,'copper')
  ell('Eye',(side*.034,-.06,.57),(.016,.012,.021),'dark')
 for i in range(4):ell('Tail armour',(0,0,.23-i*.024),(.07+i*.012,.046,.023),'copper')

def croissant(p,s=.1):
 x,y,z=p
 for i in range(7):
  a=math.pi*.18+i*math.pi*.64/6;ell('Flaky crescent',(x+math.cos(a)*s,y,z+math.sin(a)*s),(.055*(s/.1),.046*(s/.1),.045*(s/.1)),'bun')

def mobile():
 turn=pivot('Cloud mobile',(0,0,.45),'rock','Z',.13,.32);ringObj=ring('Mobile ring',(0,0,.60),.33,'gold');reparent(ringObj,turn);tube('Ceiling chain',[(0,0,.90),(0,0,.70)],.009,'gold')
 for i in range(5):
  a=i*math.tau/5;x=math.cos(a)*.28;y=math.sin(a)*.28;z=.22+(i%2)*.10
  before=set(bpy.context.scene.objects);tube('Hanging thread',[(x,y,.59),(x,y,z+.12)],.004,'gold')
  if i%2:croissant((x,y,z),.095)
  else:
   star=box('Butter star',(x,y,z),(.085,.024,.085),'gold',.008);star.rotation_euler.y=math.pi/4
  for o in set(bpy.context.scene.objects)-before:reparent(o,turn)

def kraken():
 base();cyl('Copper espresso boiler',(0,.04,.67),.22,.91,'copper');ell('Pressure crown',(0,.04,1.11),(.23,.23,.095),'copper');ring('Pressure dial',(0,-.196,.83),.08,'gold','Y');ell('Gauge',(0,-.2,.83),(.07,.011,.07),'ivory');tube('Gauge hand',[(0,-.214,.83),(.035,-.214,.858)],.005,'dark')
 for i in range(6):
  a=i*math.tau/6;x=math.cos(a);y=math.sin(a);tube('Copper tentacle',[(x*.17,y*.17,.68),(x*.32,y*.28,.48),(x*.34,y*.30,.22),(x*.22,y*.29,.24)],.035,'copper')
  for j in range(3):ell('Suction cup',(x*(.31-j*.01),y*.30-.028,.28+j*.055),(.018,.02,.01),'gold')
 for x in [-.095,.095]:tube('Espresso group',[(x,-.13,.64),(x,-.3,.58),(x,-.31,.48)],.025,'chrome');cyl('Espresso cup',(x,-.29,.30),.066,.11,'ivory')
 steam((.21,.06,1.17),True)

def koi(p,s=.08,parent=None):
 x,y,z=p;o=ell('Koi body',p,(s,s*.38,s*.32),'ivory');o2=ell('Koi patch',(x+s*.12,y-s*.30,z+s*.1),(s*.38,s*.1,s*.2),'red');tail=ell('Koi tail',(x-s*.92,y,z),(.032,.043,.012),'gold')
 if parent:
  for q in [o,o2,tail]:reparent(q,parent)

def bonsai():
 base(.79,.58);box('Bento tray',(0,0,.20),(.71,.50,.10),'red');box('Koi pool',(0,-.05,.263),(.55,.31,.025),'water',.06)
 tube('Bonsai trunk',[(.19,.14,.23),(.16,.12,.48),(.04,.13,.67),(.11,.13,.78)],.031,'brown')
 for x,z,s in [(.08,.74,.15),(-.06,.65,.13),(.20,.51,.10)]:ell('Cloud-pruned foliage',(x,.13,z),(s,.12,s*.34),'green')
 swim=pivot('Garden koi',(0,-.05,.28),'rock','Z',.3,.6);koi((-.06,-.1,.28),.074,swim)
 tube('Waterfall',[(.28,.12,.42),(.27,.07,.36),(.24,.03,.28)],.023,'water');ell('Garden stone',(-.22,.12,.31),(.075,.08,.055),'ivory')

def theatre():
 box('Theatre frame',(0,0,.39),(.80,.16,.72),'jade');box('Shadow stage',(0,-.095,.41),(.68,.012,.53),'gold',.018)
 for x in [-.31,.31]:box('Velvet curtain',(x,-.12,.45),(.09,.024,.53),'red',.02)
 box('Stage lip',(0,-.17,.105),(.81,.23,.06),'copper')
 player=pivot('Shadow puppets',(0,-.115,.29),'rock','Y',.15,.9);reparent(ell('Shadow chef head',(-.09,-.12,.40),(.055,.01,.055),'dark'),player);reparent(box('Shadow chef apron',(-.09,-.12,.29),(.075,.01,.13),'dark',.02),player)
 for i in range(3):reparent(cyl('Chef toque',(-.12+i*.03,-.12,.456),.022,.04,'dark'),player)
 ell('Noodle bowl',(.15,-.13,.25),(.10,.016,.045),'dark');tube('Noodle strings',[(.09,-.13,.30),(.12,-.13,.40),(.18,-.13,.46)],.007,'dark')

def reliquary():
 base(.58,.50);box('Emerald altar',(0,0,.24),(.48,.41,.18),'jade');box('Velvet cushion',(0,0,.34),(.38,.30,.045),'red',.04)
 for x in [-.19,.19]:
  for y in [-.15,.15]:tube('Crystal cage edge',[(x,y,.35),(x,y,.72),(x*.65,y*.65,.84)],.013,'gold')
 ring('Halo',(0,0,.75),.19,'gold',thick=.012)
 fry=pivot('The last golden fry',(0,0,.54),'float','Y',.025,.8);reparent(box('Golden fry',(0,0,.54),(.055,.055,.26),'gold',.013),fry)
 for i in range(4):ell('Emerald gem',(math.cos(i*math.pi/2)*.18,math.sin(i*math.pi/2)*.13,.31),(.035,.025,.025),'mint')

def boiler():
 base();box('Koi enamel boiler',(0,0,.55),(.74,.63,.71),'jade',.085);box('Aquarium window',(0,-.33,.54),(.59,.025,.36),'water',.05);ring('Window brass badge',(0,-.35,.54),.12,'gold','Y',thick=.014)
 swim=pivot('Window koi',(0,-.357,.55),'rock','Y',.06,.55);koi((-.10,-.36,.58),.11,swim);koi((.15,-.36,.45),.073,swim)
 box('Boiler rim',(0,0,.94),(.80,.69,.08),'copper');box('Water bath',(0,0,.985),(.67,.54,.016),'water',.04)
 # Baskets are mounted by the renderer from the actual equipment tier.
 for x in [-.27,.27]:ell('Boiler control',(x,-.33,.84),(.04,.022,.04),'gold')

def oven_moon():
 base();ell('Lunar oven shell',(0,.04,.66),(.40,.31,.48),'ivory');ring('Crescent copper edge',(0,-.267,.67),.32,'gold','Y',thick=.045);ell('Oven porthole',(0,-.285,.66),(.26,.021,.26),'dark');ring('Glowing porthole',(0,-.315,.66),.23,'copper','Y',thick=.012);box('Oven handle',(0,-.35,.47),(.28,.045,.045),'chrome')
 heat=pivot('Moon warmth',(0,-.312,.66),'pulse','Y',.035,.65,True);reparent(ell('Warm glow',(0,-.312,.66),(.215,.008,.215),'gold'),heat)
 for x in [-.15,0,.15]:dumpling((x,-.20,.63),.062)
 for a in [.2,.8,1.4,2.1,2.7]:ell('Moon crater',(math.cos(a)*.34,-.13,.67+math.sin(a)*.40),(.025,.018,.025),'bun')

def phoenix():
 base();box('Foundry body',(0,0,.55),(.73,.61,.72),'red',.07);box('Oil well lip',(0,0,.94),(.77,.66,.08),'copper');box('Oil well',(0,0,.985),(.62,.5,.01),'brown',.04)
 for side in [-1,1]:
  for i in range(5):
   x=side*(.25+i*.025);o=ell('Copper phoenix feather',(x,.17,.75+i*.07),(.035,.085,.19),'copper');o.rotation_euler.y=side*(.2+i*.12)
 ell('Phoenix face',(0,-.316,.67),(.11,.045,.13),'gold');cyl('Beak',(0,-.37,.65),.041,.10,'copper',0).rotation_euler.x=math.pi/2
 for x in [-.042,.042]:ell('Phoenix eye',(x,-.36,.72),(.015,.012,.017),'dark')
 # Layered wing plates sit outside the working well, clear of the real basket.
 for side in [-1,1]:
  for i in range(5):
   feather=ell('Raised wing feather',(side*(.22+i*.043),.25,.99+i*.065),(.03,.065,.15),'copper');feather.rotation_euler.y=side*.28
  tube('Wing gilded edge',[(side*.19,.23,.91),(side*.32,.25,1.16),(side*.41,.25,1.38)],.011,'gold')
 for x in [-.24,.24]:ring('Temperature dial',(x,-.327,.40),.052,'chrome','Y',thick=.01);ell('Temperature face',(x,-.334,.40),(.041,.01,.041),'dark')

def observatory():
 base();cyl('Observatory pedestal',(0,0,.48),.29,.62,'jade',.22);ring('Dome rim',(0,0,.80),.36,'gold',thick=.032)
 for i in range(8):
  a=i*math.tau/8;tube('Observatory dome rib',[(math.cos(a)*math.sin(t)*.35,math.sin(a)*math.sin(t)*.35,.81+math.cos(t)*.52) for t in [j*math.pi/20 for j in range(11)]],.009,'copper')
 for i,(x,y,z) in enumerate([(-.14,-.08,1.05),(.12,.06,1.13),(0,-.11,.90)]):
  drift=pivot('Gelato jelly'+str(i),(x,y,z),'float','Y',.022,.6+i*.1);reparent(ell('Gelato bell',(x,y,z),(.083,.067,.055),'pink' if i%2 else 'mint'),drift)
  for j in range(4):reparent(tube('Jelly ribbon',[(x+(j-1.5)*.03,y,z-.02),(x+(j-1.5)*.029+.01,y,z-.09),(x+(j-1.5)*.02,y,z-.14)],.006,'ivory'),drift)
 cyl('Dome finial',(0,0,1.38),.045,.10,'gold',0)

def orchestra():
 base();ell('Octopus conductor',(0,.02,.59),(.22,.20,.25),'red');face(.64,-.18,size=1.1);cyl('Top hat brim',(0,.03,.85),.22,.028,'dark');cyl('Top hat',(0,.03,.94),.15,.18,'jade');ring('Hat band',(0,.03,.88),.15,'gold',thick=.01)
 for i in range(8):
  a=i*math.tau/8;x=math.cos(a);y=math.sin(a);arm=pivot('Shaking arm'+str(i),(x*.14,y*.14,.48),'rock','X',.07,.7+i*.09)
  reparent(tube('Cocktail arm',[(x*.14,y*.14,.49),(x*.30,y*.29,.32),(x*.34,y*.32,.48),(x*.28,y*.30,.58)],.024,'red'),arm)
  if i%2==0:reparent(cyl('Cocktail shaker',(x*.28,y*.30,.64),.034,.13,'chrome',.022),arm)
  else:reparent(ell('Cocktail cherry',(x*.28,y*.30,.59),(.033,.033,.033),'gold'),arm)

def belt():
 box('Championship leather',(0,0,.40),(1.67,.09,.37),'dark',.10);box('Gold belt backing',(0,-.059,.40),(1.58,.035,.31),'gold',.08)
 for x in [-.62,.62]:ring('Side medal',(x,-.091,.40),.12,'copper','Y');ell('Side enamel',(x,-.09,.40),(.10,.018,.10),'red')
 ell('Burger medallion',(0,-.09,.43),(.37,.035,.30),'jade');ring('Medallion rim',(0,-.13,.43),.27,'gold','Y',thick=.025)
 # Burger relief rather than a floor model turned sideways.
 ell('Relief bun',(0,-.16,.54),(.20,.03,.075),'bun');box('Relief cheese',(0,-.16,.45),(.35,.03,.025),'gold');box('Relief patty',(0,-.16,.41),(.34,.03,.038),'brown');ell('Relief lower bun',(0,-.16,.365),(.19,.03,.032),'bun')
 glint=pivot('Belt sheen',(.25,-.16,.60),'pulse','Y',.09,.55);reparent(ell('Enamel glint',(.25,-.16,.60),(.014,.012,.045),'ivory'),glint)

def sushi():
 base(1.70,.48)
 for i in range(7):
  x=-.60+i*.18;segment=pivot('Sushi segment'+str(i),(x,0,.29),'rock','Y',.05,.5+i*.05)
  reparent(ell('Sushi rice',(x,0,.29),(.13,.11,.10),'ivory'),segment);reparent(box('Salmon sashimi',(x,0,.38),(.21,.19,.045),'pink',.025),segment);reparent(box('Nori ribbon',(x,0,.383),(.035,.20,.05),'jade',.006),segment)
 ell('Sushi dragon head',(.64,0,.46),(.14,.12,.12),'mint');face(.485,-.112,x=.64,size=.7)
 for x in [.58,.71]:tube('Wasabi horn',[(x,.02,.53),(x+.03,.02,.65)],.015,'gold')
 tube('Ginger whisker',[(.59,-.09,.44),(.72,-.16,.42),(.78,-.20,.46)],.009,'copper')

def after_hours():
 box('Diorama shadow box',(0,.045,.42),(1.64,.25,.80),'jade');box('Midnight interior',(0,-.10,.44),(1.48,.02,.65),'dark',.01);box('Tiny diner floor',(0,-.19,.105),(1.48,.36,.04),'ivory',.01)
 for x in [-.62,.62]:box('Neon window',(x,-.119,.50),(.17,.02,.37),'water',.016)
 box('Mini counter',(0,-.20,.32),(.88,.15,.07),'ivory');box('Mini counter front',(0,-.16,.22),(.90,.10,.19),'red')
 for x in [-.30,0,.30]:cyl('Mini stool',(x,-.29,.17),.055,.028,'red');cyl('Mini stool leg',(x,-.29,.12),.012,.09,'chrome')
 chef=pivot('Night cook',(0,-.135,.45),'rock','Z',.04,.8);reparent(ell('Tiny cook',(0,-.145,.48),(.05,.02,.05),'bun'),chef);reparent(box('Tiny apron',(0,-.14,.40),(.07,.028,.09),'ivory',.014),chef)
 box('After hours sign',(0,-.12,.70),(.65,.026,.08),'pink',.02);ring('Clock',(.40,-.13,.60),.055,'gold','Y',thick=.01)
 for x in [-.62,.62]:
  for j in range(4):tube('Rain on glass',[(x-.05+j*.035,-.133,.62-j*.013),(x-.061+j*.035,-.133,.54-j*.013)],.003,'ivory')
  box('Window mullion',(x,-.145,.49),(.012,.012,.35),'gold',.002)
 for x in [-.30,.30]:
  guest=pivot('Midnight diner guest'+str(x),(x,-.30,.32),'rock','Y',.06,.6)
  reparent(ell('Guest coat',(x,-.30,.27),(.036,.032,.055),'jade'),guest);reparent(ell('Guest face',(x,-.30,.36),(.036,.034,.038),'bun'),guest)
  cyl('Coffee cup',(x,-.235,.372),.023,.038,'ivory');ell('Mini plate',(x+.07,-.23,.36),(.044,.027,.008),'gold')
 for x in [-.48,.48]:tube('Pendant cord',[(x,-.21,.77),(x,-.21,.64)],.004,'copper');ell('Pendant shade',(x,-.21,.63),(.065,.035,.025),'gold')

def carousel():
 base(1.70,.72);cyl('Carousel podium',(0,0,.28),.34,.23,'jade',.28);cyl('Planetarium axle',(0,0,.73),.065,.85,'gold');ell('Central sun',(0,0,.94),(.15,.15,.15),'gold')
 rim=ring('Orbit rim',(0,0,.72),.69,'copper',thick=.014);rim.scale.y=.44
 for i in range(5):
  a=i*math.tau/5;x=math.cos(a)*.61;y=math.sin(a)*.27;z=.76;orbit=pivot('Food planet'+str(i),(x,y,z),'orbit','Z',1,.18);orbit['dkPhase']=a;orbit['dkRadiusX']=.61;orbit['dkRadiusZ']=.27;before=set(bpy.context.scene.objects)
  if i==0:burger((x,y,z),.43)
  elif i==1:dumpling((x,y,z),.11)
  elif i==2:cyl('Pancake planet',(x,y,z),.105,.09,'bun');box('Butter moon',(x,y,z+.06),(.06,.06,.02),'gold')
  elif i==3:ell('Sundae planet',(x,y,z),(.10,.10,.10),'pink');ring('Sundae ring',(x,y,z),.14,'ivory',thick=.014)
  else:croissant((x,y,z),.11)
  for o in set(bpy.context.scene.objects)-before:reparent(o,orbit)

def world_plate():
 base(1.73,.79);ell('Porcelain world platter',(0,0,.24),(.82,.36,.12),'ivory');ring('Plate orbit',(0,0,.27),.34,'gold',thick=.015).scale.x=2.25
 ell('Island lagoon',(0,0,.32),(.68,.28,.04),'water');ell('Restaurant island',(0,0,.35),(.42,.23,.07),'green');box('Tiny restaurant',(0,.02,.50),(.46,.27,.22),'red',.025);box('Restaurant roof',(0,.02,.63),(.53,.34,.05),'ivory',.025)
 for x in [-.14,0,.14]:box('Mini window',(x,-.124,.51),(.085,.012,.095),'water',.008)
 for i in range(7):box('Striped awning',(-.23+i*.077,-.18,.59),(.073,.14,.028),'red' if i%2 else 'ivory',.004)
 burger((0,.02,.73),.46)
 for x in [-.52,.52]:
  cyl('Island palm trunk',(x,.04,.47),.015,.25,'brown')
  for a in range(5):o=ell('Palm frond',(x+math.cos(a*1.257)*.055,.04+math.sin(a*1.257)*.055,.60),(.10,.018,.015),'jade');o.rotation_euler.z=a*1.257
 orbit=pivot('Island boat',(0,0,.32),'rock','Z',.10,.35);reparent(ell('Little boat',(-.40,-.20,.36),(.10,.03,.023),'gold'),orbit);reparent(box('Boat sail',(-.40,-.20,.42),(.05,.006,.085),'ivory',.005),orbit)
 for side in [-1,1]:
  ell('Floating garden island',(side*.48,.05,.86),(.12,.10,.065),'green');cyl('Floating rock',(side*.48,.05,.76),.018,.18,'brown',.10)
  tube('Island waterfall',[(side*.46,.0,.84),(side*.45,-.015,.65),(side*.48,-.035,.38)],.019,'water')
  ell('Garden cloud',(side*.54,.08,.70),(.13,.065,.035),'ivory')
  for i in range(3):ell('Garden flower',(side*.49+i*.018,.0,.925),(.017,.018,.018),'pink')
 for x in [-.12,.12]:
  cyl('Terrace table',(x,-.235,.435),.039,.015,'ivory');cyl('Terrace pedestal',(x,-.235,.40),.006,.06,'gold')
  for dx in [-.05,.05]:box('Terrace stool',(x+dx,-.235,.405),(.025,.03,.023),'red',.005)
 blimp=pivot('Lunch airship',(0,.12,1.12),'float','Y',.018,.5)
 for obj in [ell('Airship envelope',(0,.12,1.12),(.18,.065,.065),'ivory'),box('Airship stripe',(0,.055,1.12),(.20,.012,.025),'red',.005),box('Airship gondola',(0,.12,1.03),(.065,.033,.028),'gold',.005)]:reparent(obj,blimp)
def reset(name):
 global root,M
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);M={};root=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(root)
def optimize():
 # Preserve motion parents, joining only pieces sharing both parent and material.
 for o in list(bpy.context.scene.objects):
  if o.type=='CURVE':bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
 bins={}
 for o in list(bpy.context.scene.objects):
  if o.type=='MESH':bins.setdefault((o.parent.name if o.parent else '',o.data.materials[0].name),[]).append(o)
 for group in bins.values():
  bpy.ops.object.select_all(action='DESELECT')
  for o in group:o.select_set(True)
  bpy.context.view_layer.objects.active=group[0]
  if len(group)>1:bpy.ops.object.join()
def export(name):
 dest=OUT/(name+'.glb');assert args.replace or not dest.exists(),str(dest)+' already exists'
 optimize();bpy.ops.object.select_all(action='SELECT');bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(name+'.blend')))
 bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',export_apply=True,export_extras=True,export_animations=False,export_yup=True)
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];tri=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
 (OUT/(name+'.json')).write_text(json.dumps({'id':name,'version':2,'authoring':'Original local Blender meshes','source':str(Path(__file__).resolve()),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'triangles':tri,'materials':len(M),'bytes':dest.stat().st_size,'license':'Proprietary project asset; no third-party models','reference':'Existing owner-authorized cinematic artwork for three hero designs'},indent=2))
 print('COLLECTION_ASSET',name,tri,dest.stat().st_size,flush=True)
BUILDERS={'lucky_cat_soda':hero_cat,'dragonfire_grill':hero_dragon,'disco_burger_jukebox':hero_jukebox,'rocket_shake':rocket,'dumpling_bathhouse':bathhouse,'sir_pickles':pickles,'pancake_wheel':wheel,'rabbit_tea':rabbit,'disco_lobster':lobster,'croissant_mobile':mobile,'kraken_espresso':kraken,'bento_garden':bonsai,'noodle_theatre':theatre,'last_fry':reliquary,'koi_boiler':boiler,'lunar_oven':oven_moon,'phoenix_fryer':phoenix,'gelato_observatory':observatory,'octopus_orchestra':orchestra,'burger_belt':belt,'sushi_parade':sushi,'after_hours_diner':after_hours,'cosmic_carousel':carousel,'world_on_plate':world_plate}
for name in (args.only.split(',') if args.only else BUILDERS):
 reset(name);BUILDERS[name]();export(name)
