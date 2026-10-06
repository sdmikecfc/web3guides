"""Second art study: three collectible Commons, not the approved room kits.

Original local modelling, no provider calls. Run with the existing hero builder's
--output/--only options, into a NEW D: directory. Originals remain reviewable.
"""
import importlib.util, math, bpy, hashlib, json
from pathlib import Path
from mathutils import Vector

spec=importlib.util.spec_from_file_location('hero_base',Path(__file__).with_name('dk-build-domain-heroes.py'))
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
a.UV_PROJECTION='cube'
a.P.update({
 'enamel':('#c83521',.08,.27),'onggi':('#85221d',.06,.31),'antred':('#bc3a20',.03,.36),
 'ochre':('#d98b29',.08,.4),'ivory':('#f5e5bf',0,.38),'linen':('#e9d9ad',0,.62),
 'gold':('#cba059',.65,.29),'bronze':('#806139',.68,.34),'coal':('#202827',.06,.43),
 'flame':('#ffbb58',.05,.27),'teal':('#247869',.06,.32),'peach':('#e88969',.04,.38),
 'jade':('#367756',.08,.31),'fruitleaf':('#598942',0,.48),'lemon':('#f1bc28',.02,.38),
 'pith':('#fff0c6',0,.52),'berry':('#c75767',0,.39),'papaya':('#ef8833',0,.32),
 'beak':('#efb635',.02,.35),'tip':('#a73b24',.02,.4),'feather':('#273a32',.01,.56),
 'wood':('#634029',.02,.41),'woodlight':('#aa7851',.02,.45),'velvet':('#642439',0,.7),
 'garnet':('#671626',.06,.23),'paleglass':('#deeee7',0,.14),'crystal':('#c8e4df',0,.12),
})
original_mat=a.mat
def material(key):
 m=original_mat(key)
 if key in ['crystal','paleglass']:
  p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Alpha'].default_value=.24 if key=='crystal' else .34
  m.diffuse_color=(*m.diffuse_color[:3],p.inputs['Alpha'].default_value);m.surface_render_method='DITHERED';m.use_transparency_overlap=False
 if key=='flame':
  p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(1,.40,.08,1);p.inputs['Emission Strength'].default_value=.65
 if key in ['enamel','onggi','jade']:m.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=.28
 return m
a.mat=material

def group(before,p):
 bpy.context.view_layer.update();objects=set(bpy.context.scene.objects)-before-{p};matrices={o:o.matrix_world.copy() for o in objects}
 for o in objects:o.parent=p;o.matrix_world=matrices[o]
a.group_since=group

def leaf(name,p,length,width,color,angle=0,tilt=0):
 """Tapered folded leaf/feather, with an actual tip rather than an ellipsoid."""
 verts=[];faces=[]
 for j in range(9):
  t=j/8;w=width*math.sin(math.pi*t)**.75
  for side in [-1,0,1]:verts.append((length*(t-.22),w*side,math.sin(math.pi*t)*width*(.27 if side==0 else -.10)))
 for j in range(8):
  for k in range(2):q=j*3+k;faces.append((q,q+3,q+4,q+1))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.location=p;o.rotation_euler=(0,tilt,angle);a.finish(o,name,color)
 solid=o.modifiers.new('Sculpted thickness','SOLIDIFY');solid.thickness=.004;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=solid.name)
 return o

def letter(text,p,size,color):
 bpy.ops.object.text_add(location=p,rotation=(math.pi/2,0,0));o=bpy.context.object;o.data.body=text;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.size=size;o.data.extrude=.0014;o.data.bevel_depth=.0006;o.parent=a.root;o.data.materials.append(a.mat(color));bpy.ops.object.convert(target='MESH');return o

def footed_base(w,d,color):
 for x in [-w*.35,w*.35]:
  for y in [-d*.32,d*.32]:a.ell('Low cabinet foot',(x,y,.04),(.043,.043,.04),'bronze')
 a.box('Undercut base',(0,0,.080),(w-.025,d-.025,.078),'coal',.055)
 a.box('Crafted plinth',(0,0,.12),(w,d,.065),color,.065)
 a.box('Fine perimeter bead',(0,0,.157),(w-.04,d-.04,.012),'gold',.050)

def pepper(p,s=.1):
 x,y,z=p;a.tube('Curved ripe chilli',[(x,y,z),(x+s*.45,y-.006,z-s*.33),(x+s*.40,y-.015,z-s*.78),(x+s*.05,y-.012,z-s)],s*.13,'enamel')
 a.tube('Chilli stem',[(x,y,z-.002),(x-s*.07,y,z+s*.14),(x+s*.08,y,z+s*.18)],s*.035,'jade')

def ant_chef(p,s=.30,stir=False):
 x,y,z=p
 # Six grounded legs, a pinched waist and separate abdomen establish the ant.
 a.ell('Glossy ant abdomen',(x,y+s*.27,z+s*.37),(s*.27,s*.32,s*.27),'onggi')
 a.ell('Ant waist',(x,y+s*.07,z+s*.56),(s*.14,s*.12,s*.16),'antred')
 a.ell('Chef jacket',(x,y,z+s*.77),(s*.25,s*.20,s*.29),'ivory')
 for side in [-1,1]:
  for i in range(2):
   yy=y+(i-.5)*s*.30;a.tube('Planted ant leg',[(x+side*s*.15,yy,z+s*.46),(x+side*s*.36,yy-s*.01,z+s*.24),(x+side*s*.43,yy-s*.13,z+.008)],s*.028,'coal')
   a.ell('Ant toe',(x+side*s*.43,yy-s*.15,z+.014),(s*.095,s*.11,s*.045),'coal')
 a.ell('Sculpted ant face',(x,y-.009,z+s*1.10),(s*.31,s*.265,s*.28),'antred')
 a.ell('Ant muzzle',(x,y-s*.235,z+s*1.01),(s*.18,s*.07,s*.10),'enamel')
 for side in [-1,1]:
  a.ell('Cream eye',(x+side*s*.122,y-s*.238,z+s*1.16),(s*.087,s*.035,s*.105),'ivory')
  a.ell('Dark pupil',(x+side*s*.116,y-s*.268,z+s*1.165),(s*.037,s*.020,s*.057),'coal')
  a.ell('Eye glint',(x+side*s*.106,y-s*.287,z+s*1.19),(s*.012,s*.006,s*.016),'white')
  a.tube('Jointed antenna',[(x+side*s*.16,y,z+s*1.31),(x+side*s*.26,y-.01,z+s*1.53),(x+side*s*.40,y-s*.08,z+s*1.58)],s*.023,'coal')
  a.ell('Antenna tip',(x+side*s*.40,y-s*.08,z+s*1.58),(s*.039,s*.028,s*.032),'antred')
 a.tube('Smile',[(x-s*.09,y-s*.291,z+s*1.02),(x,y-s*.303,z+s*.99),(x+s*.09,y-s*.291,z+s*1.02)],s*.01,'coal')
 a.box('Apron bib',(x,y-s*.20,z+s*.75),(s*.31,s*.032,s*.30),'linen',.012)
 a.tube('Neckerchief',[(x-s*.17,y-s*.15,z+s*.90),(x,y-s*.24,z+s*.86),(x+s*.17,y-s*.15,z+s*.90)],s*.042,'enamel')
 for k in [-1,1]:a.ell('Jacket button',(x+k*s*.09,y-s*.185,z+s*.71),(.006,.004,.006),'gold')
 if stir:
  a.cyl('Toque band',(x,y,z+s*1.38),s*.24,s*.12,'ivory')
  for dx in [-.15,0,.15]:a.ell('Toque crown',(x+dx*s,y,z+s*1.50),(s*.16,s*.21,s*.14),'ivory')
 else:
  a.tube('Kitchen headband',[(x-s*.27,y-s*.03,z+s*1.26),(x,y-s*.262,z+s*1.34),(x+s*.27,y-s*.03,z+s*1.26)],s*.035,'ivory')
 # Only the working forearm moves. Feet, body, other hand and bowl remain planted.
 before=set(bpy.context.scene.objects)
 a.tube('Serving arm',[(x+s*.21,y,z+s*.82),(x+s*.35,y-s*.12,z+s*.75),(x+s*.33,y-s*.30,z+s*.86)],s*.035,'antred')
 a.ell('Ant hand',(x+s*.33,y-s*.30,z+s*.86),(s*.052,s*.052,s*.053),'antred')
 if stir:
  a.tube('Wooden stirring spoon',[(x+s*.33,y-s*.30,z+s*.86),(x+s*.52,y-s*.40,z+s*.52)],.009,'woodlight')
  pivot=a.pivot('Forearm stirring at elbow',(x+s*.24,y-s*.05,z+s*.82),'rock','Y',.075,.95);group(before,pivot)
 else:a.bowl((x+s*.31,y-s*.34,z+s*.91),s*.20,'ivory')
 a.tube('Resting lower arm',[(x-s*.19,y,z+s*.80),(x-s*.27,y-s*.15,z+s*.59),(x-s*.21,y-s*.23,z+s*.66)],s*.033,'antred')

def brigade():
 footed_base(.90,.74,'onggi')
 # Deep onggi shell: real thickness and a generous front opening.
 profile=a.soft_profile([(.33,.16),(.43,.27),(.43,.69),(.36,.95),(.32,1.00)])
 a.lathe('Onggi jar outer glaze',profile,'enamel',-.12,math.pi+.12)
 a.lathe('Onggi warm interior',[(r-.018,z) for r,z in profile],'onggi',-.12,math.pi+.12)
 for side in [-1,1]:a.tube('Cut ceramic lip',[(side*r,-.014,z) for r,z in profile[::4]],.013,'gold')
 a.cyl('Jar floor',(0,0,.19),.365,.045,'coal')
 for row in range(4):
  for col in range(5):
   x=(col-2)*.128;y=(row-1)*.122
   if x*x+y*y<.112:a.box('Charcoal floor tile',(x,y,.221),(.120,.114,.012),'coal' if (row+col)%2 else 'bronze',.002)
 a.box('Miniature tiled cooker',(-.05,.18,.42),(.59,.23,.37),'onggi',.025)
 a.box('Ivory stove worktop',(-.05,.18,.617),(.64,.27,.033),'ivory',.014)
 for x in [-.25,-.10,.05,.20]:
  a.box('Glazed stove tiles',(x,.058,.44),(.132,.01,.24),'enamel',.008)
  a.ell('Brass stove dial',(x,.045,.54),(.015,.009,.015),'gold')
 a.cyl('Low cooker pedestal',(.036,-.241,.288),.089,.13,'onggi')
 pot=a.lathe('Open simmering pot',[(.068,.346),(.080,.358),(.087,.454),(.078,.454),(.072,.360),(.068,.346)],'steel',steps=32);pot.location.x=.036;pot.location.y=-.241
 a.ring('Rolled pot edge',(.036,-.241,.454),.089,'steel',.008);a.cyl('Red broth',(.036,-.241,.449),.079,.006,'enamel')
 for dx in [-1,1]:a.tube('Pot handle',[(.036+dx*.085,-.241,.411),(.036+dx*.109,-.241,.429),(.036+dx*.085,-.241,.437)],.008,'gold')
 for k in range(3):a.tube('Simmering noodles',[(-.006,-.265+k*.019,.453),(.032,-.25+k*.019,.455),(.070,-.265+k*.019,.453)],.0028,'ivory')
 a.bowl((.13,.12,.672),.10,'ivory')
 # Tiled backsplash, open shelf, hanging chilli and under-lid lamp.
 for col in range(6):
  for row in range(2):a.box('Ivory backsplash',((col-2.5)*.097,.279,.71+row*.085),(.090,.015,.077),'ivory',.005)
 a.box('Spice shelf',(0,.255,.875),(.58,.12,.025),'wood',.012)
 for x in [-.19,-.07,.06,.18]:
  a.cyl('Spice pot',(x,.25,.919),.034,.067,'onggi',.030);a.cyl('Spice lid',(x,.25,.956),.034,.014,'gold')
 a.tube('Chilli hanging rail',[(-.26,.10,.92),(.25,.10,.92)],.009,'bronze')
 for x in [.05,.13,.21]:pepper((x,.085,.915),.10)
 ant_chef((-.14,-.105,.235),.34,True);ant_chef((.235,-.12,.232),.245,False)
 # Tilted open lid gives a recognizable jar without hiding the crew.
 before=set(bpy.context.scene.objects)
 a.cyl('Open jar lid',(0,.18,1.045),.36,.045,'onggi');a.ring('Lid gold piping',(0,.18,1.07),.343,'gold',.012)
 a.ell('Lid chilli handle',(0,.18,1.103),(.084,.028,.030),'enamel');leaf('Chilli leaf',(.075,.18,1.12),.07,.016,'jade',.4)
 lid=bpy.data.objects.new('Supported open lid',None);bpy.context.collection.objects.link(lid);lid.parent=a.root;lid.location=(0,.40,1.0);group(before,lid);lid.rotation_euler.x=-.46
 for x in [-.14,.14]:a.tube('Lid hinge',[(x,.33,.91),(x,.37,1.03),(x,.27,1.09)],.012,'bronze')
 a.box('Warm work light',(0,.25,.988),(.30,.038,.014),'flame',.006)
 a.box('Front enamel maker tablet',(0,-.372,.14),(.35,.020,.065),'onggi',.014);letter('FIREANT',(0,-.385,.139),.043,'ivory')

def citrus(p,r=.07):
 x,y,z=p;a.cyl('Citrus peel',(x,y,z),r,.025,'papaya');a.cyl('Citrus pith',(x,y,z+.014),r*.91,.006,'pith')
 for i in range(8):
  theta=i*math.tau/8;verts=[(x,y,z+.019)]+[(x+math.cos(theta+t)*r*.78,y+math.sin(theta+t)*r*.78,z+.019) for t in [.09,.38,.68]]
  m=bpy.data.meshes.new('Citrus segment');m.from_pydata(verts,[],[(0,1,2,3)]);m.update();o=bpy.data.objects.new('Juicy citrus segment',m);bpy.context.collection.objects.link(o);a.finish(o,o.name,'lemon')

def beak():
 # Cross-section loft: hooked upper ridge, fine lower bill and a dark seam.
 sections=[(-.03,-.070,.984,.087,.064),(.04,-.13,.989,.082,.068),(.15,-.19,.972,.066,.061),(.26,-.215,.939,.039,.041),(.295,-.218,.920,.004,.005)]
 verts=[];faces=[]
 for x,y,z,ry,rz in sections:
  for j in range(16):q=j*math.tau/16;verts.append((x,y+math.cos(q)*ry,z+math.sin(q)*rz))
 for i in range(len(sections)-1):
  for j in range(16):k=i*16+j;faces.append((k,i*16+(j+1)%16,(i+1)*16+(j+1)%16,k+16))
 mesh=bpy.data.meshes.new('Toucan sculpted bill');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Toucan sculpted bill',mesh);bpy.context.collection.objects.link(o);a.finish(o,o.name,'beak');o.data.materials.append(a.mat('tip'))
 for f in o.data.polygons:
  if f.center.x>.18:f.material_index=1
 sub=o.modifiers.new('Bill surface','SUBSURF');sub.levels=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=sub.name)
 a.tube('Beak division',[(-.037,-.152,.966),(.07,-.210,.955),(.19,-.244,.930),(.282,-.226,.917)],.003,'coal')

def toucan():
 footed_base(.94,.72,'teal')
 a.box('Curved coral tasting counter',(0,-.045,.257),(.87,.60,.18),'peach',.095)
 for i in range(17):a.box('Hand-carved vertical fluting',((i-8)*.044,-.341,.245),(.018,.011,.130),'ivory',.008)
 a.box('Pale stone top',(0,-.045,.357),(.92,.64,.057),'ivory',.090)
 for x,y,c in [(-.35,-.18,'teal'),(.12,.15,'peach'),(.34,.13,'ochre'),(-.05,-.24,'woodlight')]:a.box('Inset terrazzo fleck',(x,y,.387),(.020,.009,.003),c,.002)
 a.tube('Branch perch',[(-.28,.10,.39),(-.28,.12,.58),(-.20,.11,.65),(-.01,.09,.66)],.024,'wood')
 a.tube('Perch side twig',[(-.26,.12,.50),(-.39,.16,.57),(-.40,.15,.66)],.012,'woodlight')
 for i in range(3):leaf('Perch leaf',(-.37,.16,.61+i*.035),.15,.038,'fruitleaf',2.4+i*.4,-.35)
 a.ell('Toucan body',(-.135,.085,.771),(.131,.110,.181),'coal')
 a.ell('Cream bib',(-.125,-.012,.823),(.086,.024,.125),'ivory')
 for side in [-1,1]:
  wing=a.ell('Folded sculpted wing',(-.135+side*.104,.098,.77),(.039,.073,.131),'feather');wing.rotation_euler.y=-side*.20
  for i in range(4):leaf('Layered wing flight feather',(-.13+side*.109,.10+i*.013,.78-i*.016),.15,.020,'coal',-math.pi/2,.9)
 for i in range(3):leaf('Tapered tail feather',(-.14+(i-1)*.032,.166,.704),.215,.026,'coal',math.pi/2,.60)
 for x in [-.185,-.08]:
  a.tube('Toucan ankle',[(x,.079,.678),(x,.073,.643)],.011,'coal')
  for offset in [-.011,0,.011]:a.tube('Toe grips the branch',[(x+offset,.073,.648),(x+offset,.047,.659),(x+offset,.030,.642),(x+offset,.048,.631)],.006,'coal')
 before=set(bpy.context.scene.objects)
 a.ell('Toucan head',(-.12,.021,.954),(.120,.105,.123),'coal');a.ell('Golden throat',(-.081,-.063,.915),(.074,.025,.075),'ivory')
 a.ell('Turquoise eye ring',(-.182,-.068,.986),(.028,.012,.032),'turquoise');a.ell('Bright toucan eye',(-.184,-.079,.987),(.015,.010,.018),'coal');a.ell('Toucan eye glint',(-.19,-.088,.995),(.004,.004,.005),'white')
 beak();head=a.pivot('Head nod on neck joint',(-.12,.02,.876),'rock','Y',.035,.65);group(before,head)
 # Substantial fresh fruit display, recognisable cross-sections and resting cups.
 a.box('Fruit crate',(.215,.145,.424),(.34,.20,.071),'woodlight',.018)
 for i in range(5):a.box('Fruit crate slat',(.085+i*.064,.042,.424),(.047,.012,.050),'wood',.004)
 for x,y in [(.12,.13),(.23,.13),(.32,.17)]:a.ell('Whole citrus',(x,y,.478),(.055,.050,.049),'papaya');leaf('Fresh citrus leaf',(x+.025,y,.522),.069,.014,'fruitleaf',.6)
 citrus((.32,-.17,.405),.079)
 for i,c in enumerate(['lemon','berry','jade']):
  x=-.035+i*.100;y=-.18
  a.cyl('Tasting cup foot',(x,y,.399),.037,.008,'gold')
  a.cyl('Thick tasting glass',(x,y,.455),.031,.106,'paleglass',.041);a.cyl('Smoothie in cup',(x,y,.451),.026,.086,c,.034)
  a.ring('Glass rim',(x,y,.509),.041,'paleglass',.004);a.tube('Paper drinking straw',[(x+.012,y,.465),(x+.012,y,.557),(x+.033,y,.570)],.0036,'ivory')
  leaf('Mint garnish',(x-.01,y,.513),.031,.011,'fruitleaf',.5)
 a.box('House enamel badge',(0,-.357,.247),(.22,.016,.075),'teal',.025);letter('FRUIT CLUB',(0,-.368,.248),.028,'ivory')

def tasting_glass(x,y,z):
 a.cyl('Crystal foot',(x,y,z+.005),.053,.010,'paleglass');a.cyl('Fine crystal stem',(x,y,z+.075),.007,.14,'paleglass')
 profile=a.soft_profile([(.007,z+.14),(.045,z+.17),(.058,z+.215),(.047,z+.276)])
 g=a.lathe('Open tasting glass',profile,'crystal',steps=32);g.location.x=x;g.location.y=y
 q=a.lathe('Garnet in glass',a.soft_profile([(.008,z+.147),(.037,z+.17),(.049,z+.212)]),'garnet',steps=32);q.location.x=x;q.location.y=y
 a.cyl('Level glass wine',(x,y,z+.212),.049,.003,'garnet');a.ring('Delicate glass rim',(x,y,z+.276),.047,'paleglass',.0026)

def decanter():
 footed_base(.92,.72,'wood')
 a.box('Walnut marquetry tray',(0,0,.173),(.855,.655,.024),'woodlight',.056)
 a.box('Burgundy tray lining',(0,0,.190),(.78,.58,.014),'velvet',.042)
 for side in [-1,1]:a.tube('Cast-brass tray handle',[(side*.414,-.15,.166),(side*.453,-.13,.221),(side*.453,.13,.221),(side*.414,.15,.166)],.012,'gold')
 # A flattened, scalloped crystal body with a long swept neck, not a stock flask.
 profile=a.soft_profile([(.10,.21),(.235,.245),(.280,.37),(.260,.48),(.16,.61),(.061,.73),(.045,.85),(.064,.975)])
 glass=a.lathe('Hand-cut decanter body',profile,'crystal',steps=64);glass.scale.y=.77
 inner=a.lathe('Resting deep garnet wine',a.soft_profile([(.10,.218),(.217,.25),(.258,.37),(.248,.43)]),'garnet',steps=64);inner.scale.y=.77
 surface=a.cyl('Level decanter wine',(0,0,.43),.248,.004,'garnet');surface.scale.y=.77
 a.ring('Polished pouring lip',(0,0,.975),.064,'paleglass',.007).scale.y=.77
 # Fine cut-glass flutes are large enough to catch the game light.
 for i in range(16):
  angle=i*math.tau/16
  a.tube('Crystal flute',[(math.cos(angle)*r,math.sin(angle)*r*.77,z) for r,z in [(.113,.218),(.233,.25),(.281,.37),(.261,.48),(.161,.61),(.067,.72)]],.0032,'paleglass')
 a.ring('Gold foot collar',(0,0,.225),.169,'gold',.008).scale.y=.77
 # Sculpted vine forms a visibly supporting cradle, with hand-cut leaves/grapes.
 for side in [-1,1]:
  a.tube('Supporting vine branch',[(side*.10,-.16,.204),(side*.24,-.15,.27),(side*.275,-.13,.42),(side*.18,-.095,.59)],.009,'gold')
  for k in range(3):leaf('Cast vine leaf',(side*(.23-k*.034),-.166+k*.027,.32+k*.075),.071,.027,'gold',(0 if side==1 else math.pi)+.4,-.22)
  for j in range(5):a.ell('Cast grape', (side*.26+(j%2)*.011,-.170,.285+(j//2)*.018),(.009,.009,.011),'bronze')
 # Real handle joins shoulder to neck. Empty stopper rests in its own recess.
 a.tube('Swept crystal handle',[(.19,.018,.54),(.31,.03,.59),(.28,.03,.81),(.057,.015,.89)],.016,'paleglass')
 a.ell('Cut crystal stopper',(-.295,-.11,.248),(.046,.038,.046),'paleglass');a.cyl('Stopper collar',(-.295,-.11,.208),.025,.021,'gold')
 tasting_glass(.28,-.145,.20)
 a.cyl('Candle saucer',(-.30,.185,.207),.059,.015,'gold');a.cyl('Ivory candle',(-.30,.185,.292),.039,.155,'ivory')
 for angle in [0,2,4]:a.tube('Wax drip',[(-.30+math.cos(angle)*.037,.185+math.sin(angle)*.037,.362),(-.30+math.cos(angle)*.039,.185+math.sin(angle)*.039,.326)],.004,'linen')
 a.tube('Black wick',[(-.30,.185,.365),(-.30,.185,.378)],.002,'coal')
 flame=a.pivot('Small candle flame',(-.30,.185,.378),'rock','Y',.06,1.3);a.parent(a.ell('Warm flame',(-.30,.185,.394),(.008,.006,.019),'flame'),flame)
 a.box('Maker enamel seal',(0,-.341,.133),(.265,.017,.058),'velvet',.016);letter('MIDNIGHT',(0,-.352,.134),.033,'gold')

BUILDERS={'domain_gochujang_fireant_brigade':brigade,'domain_smoothie_toucan_bar':toucan,'domain_wines_midnight_decanter':decanter}
if __name__=='__main__':
 a.BUILDERS=BUILDERS
 for name in (a.args.only.split(',') if a.args.only else BUILDERS):
  a.build(name)
  path=a.OUT/(name+'.json');record=json.loads(path.read_text());record.update(version='3.0.0-study.2',source=str(Path(__file__).resolve()),sourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),reviewStatus='revised Common; awaiting visual review',changes='Rebuilt silhouette, support, recognizable detail and localized motion; original study preserved',reference='Existing approved domain rooms and original item brief; no generated reference or provider spend')
  path.write_text(json.dumps(record,indent=2),encoding='utf-8')
