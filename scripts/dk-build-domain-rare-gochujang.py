"""Seven final Gochujang designs: dedicated silhouettes and miniature kitchens.
Editable original meshes, D: only. No provider generation or production release.
"""
import importlib.util,math,bpy,json,hashlib
import sys
sys.dont_write_bytecode=True
from pathlib import Path
spec=importlib.util.spec_from_file_location('super_uncommon',Path(__file__).with_name('dk-build-domain-super-uncommon-set.py'))
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v);u=v.u;s=v.s;b=v.b;c=v.c;a=v.a

# Miniature details are sub-pixel at play distance. Give them deliberate lower
# topology at authoring time instead of decimating the recognizable silhouettes.
def miniature_ell(name,p,scale,color):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=10,location=p);o=bpy.context.object;o.scale=scale;return a.finish(o,name,color)
def miniature_tube(name,points,r,color):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=4;curve.bevel_depth=r;curve.bevel_resolution=1
 spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
 for bp,p in zip(spline.bezier_points,points):bp.co=p;bp.handle_left_type=bp.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);return a.finish(o,name,color)
def miniature_cylinder(name,p,r,d,color,r2=None):
 bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=r,radius2=r if r2 is None else r2,depth=d,location=p);return a.finish(bpy.context.object,name,color)
def miniature_ring(name,p,r,color,thick=.014,axis='Z'):
 bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=6,location=p,major_radius=r,minor_radius=thick);o=bpy.context.object
 if axis=='Y':o.rotation_euler.x=math.pi/2
 return a.finish(o,name,color)
def miniature_box(name,p,scale,color,r=.02):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if r:
  bevel=o.modifiers.new('Rounded miniature joinery','BEVEL');bevel.width=r;bevel.segments=1 if max(scale)<.18 else 2;bpy.ops.object.modifier_apply(modifier=bevel.name)
 o.modifiers.new('Weighted miniature normals','WEIGHTED_NORMAL');return a.finish(o,name,color)
a.ell=miniature_ell;a.tube=miniature_tube;a.cyl=miniature_cylinder;a.ring=miniature_ring;a.box=miniature_box

def kitchen(p,sc=.48):
 def model():
  a.box('Miniature red stove',(0,.10,.22),(.62,.26,.36),'onggi',.022);a.box('Miniature tiled worktop',(0,.09,.42),(.67,.31,.035),'ivory',.019)
  for x in [-.23,-.08,.08,.23]:a.box('Red stove door',(x,-.039,.23),(.13,.016,.25),'enamel',.014);a.ell('Stove brass control',(x,-.055,.325),(.011,.008,.011),'gold')
  a.box('Kitchen backsplash',(0,.24,.65),(.65,.035,.39),'onggi',.019)
  for x in [-.24,-.12,0,.12,.24]:
   for z in [.55,.69]:a.box('Ivory kitchen backsplash tile',(x,.215,z),(.108,.011,.124),'ivory',.003)
  a.box('Spice jar shelf',(0,.17,.90),(.66,.15,.032),'wood',.012)
  for x in [-.23,-.08,.08,.23]:b.jar((x,.17,.924),.037,.078)
  for x in [-.21,.02]:a.bowl((x,.06,.482),.083)
  c.ant_chef((.17,-.13,.023),.29,False)
  for x in [-.24,-.09]:c.pepper((x,.12,.85),.085)
 b.relocated(model,p,sc)

def tiled_platform(p,w,d,color='coal'):
 x,y,z=p;a.box('Raised tiled platform',p,(w,d,.065),color,.026)
 for i in range(max(2,int(w/.16))):
  for j in range(2):a.box('Glazed platform tile',(x+(i-(int(w/.16)-1)/2)*.15,y+(j-.5)*d*.42,z+.038),(.14,d*.38,.012),'ivory' if i%3==0 else color,.003)

def wheel(p,r=.11):
 x,y,z=p
 def moving():
  a.ring('Waterwheel outer band',p,r,'woodlight',.010,axis='Y')
  for k in range(10):
   q=k*math.tau/10;a.tube('Waterwheel spoke',[p,(x+math.cos(q)*r,y,z+math.sin(q)*r)],.006,'gold');o=a.box('Waterwheel scoop',(x+math.cos(q)*r,y,z+math.sin(q)*r),(.037,.078,.025),'wood',.005);o.rotation_euler.y=-q
 a.tube('Waterwheel axle',[(x,y+.07,z),(x,y-.02,z)],.012,'gold')
 b.assembly('Waterwheel supported by axle',p,moving,'spin','Y',0,.27)

def griddle():
 u.counter_frame('onggi','steel')
 a.box('Blackened flat top',(0,-.025,.978),(.72,.53,.018),'coal',.033)
 for x in [-.355,.355]:a.box('Griddle splash guard',(x,.01,1.025),(.023,.55,.105),'steel',.019)
 a.box('Back griddle guard',(0,.265,1.036),(.74,.022,.129),'steel',.02)
 for x in [-.20,0,.20]:a.cyl('Red heat control',(x,-.355,.77),.038,.034,'enamel').rotation_euler.x=math.pi/2
 def dial():a.tube('Working heat pointer',[(0,-.377,.77),(0,-.38,.794)],.004,'ivory')
 s.work(b.assembly('Griddle thermostat pointer',(0,-.378,.77),dial,'rock','Y',.13,.6))
 for side in [-1,1]:
  x=side*.29;a.tube('Brass rice stalk',[(x,-.359,.25),(x-side*.035,-.359,.56)],.007,'gold')
  for k in range(5):a.ell('Sculpted brass rice grain',(x-side*.007*k+side*.022,-.365,.30+k*.047),(.017,.008,.032),'gold')
 # The tiny chef is a cast corner finial, never a second working cook.
 b.relocated(lambda:c.ant_chef((0,0,0),.23,False),(.225,.20,1.105),.63)
 b.board_label('GOLDEN RICE',(0,-.389,.141),.53,size=.034)

def orchard():
 v.base(color='onggi');tiled_platform((0,0,.23),1.66,.69)
 # A crescent wall frames the jar courtyard without enclosing its front.
 for i in range(9):
  x=(i-4)*.176;a.box('Garden brick pier',(x,.235,.44+abs(x)*.10),(.165,.11,.40),'onggi',.024)
  a.box('Pier stone cap',(x,.235,.665+abs(x)*.10),(.185,.15,.045),'coal',.018)
 for x,y,r,h in [(-.54,.03,.16,.36),(-.17,.10,.12,.27),(.17,.09,.17,.44),(.50,.09,.12,.29)]:b.jar((x,y,.285),r,h)
 a.box('Courtyard little watercourse',(0,-.22,.285),(1.34,.13,.030),'sea',.03)
 wheel((-.49,-.23,.445),.11)
 kitchen((.48,.09,.62),.32)
 for x in [-.73,.73]:
  a.tube('Pepper drying frame',[(x,.18,.30),(x,.18,1.15)],.016,'wood')
 a.tube('Chilli drying line',[(-.73,.18,1.12),(0,.18,1.04),(.73,.18,1.12)],.006,'gold')
 for i in range(7):x=(i-3)*.18;c.pepper((x,.175,1.06+abs(x)*.10),.16)
 b.board_label('THE KIMCHI ORCHARD',(0,-.40,.14),.89,size=.028)

def moon_pavilion():
 v.base(color='onggi');tiled_platform((0,0,.23),1.60,.69)
 # A crescent, with real thickness and a generous open center.
 verts=[];faces=[]
 for y in [.17,.24]:
  for i in range(41):
   q=-math.pi*.72+i*math.pi*1.44/40
   for r in [.58,.69]:verts.append((math.cos(q)*r-.18,y,.81+math.sin(q)*r))
 for i in range(40):
  k=i*2;faces.extend([(k,k+2,k+3,k+1),(82+k,83+k,85+k,84+k),(k,82+k,84+k,k+2),(k+1,k+3,85+k,83+k)])
 mesh=bpy.data.meshes.new('Cast crescent');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Brass crescent pavilion',mesh);bpy.context.collection.objects.link(o);a.finish(o,o.name,'gold')
 kitchen((-.16,.005,.28),.73);v.roof((-.12,.06,1.07),.85,.43)
 a.cyl('Lantern turntable bearing',(.48,-.06,.365),.024,.17,'gold')
 def carousel():
  a.ring('Lantern procession carriage',(.48,-.06,.42),.22,'gold',.012)
  for k in range(4):q=k*math.pi/2;x=.48+math.cos(q)*.22;y=-.06+math.sin(q)*.22;a.tube('Lantern carriage upright',[(x,y,.42),(x,y,.64)],.006,'gold');b.lantern((x,y,.65),.038,.082)
 b.assembly('Lantern carousel on bearing',(.48,-.06,.42),carousel,'spin','Z',0,.16)
 b.board_label('SPICE MOON PAVILION',(0,-.40,.14),.91,size=.029)

def lantern_street():
 v.base(color='onggi');profile=a.soft_profile([(.65,.19),(.80,.39),(.81,.94),(.60,1.36)])
 shell=a.lathe('Cutaway giant street lantern',profile,'enamel',0,math.pi,steps=40);shell.scale.y=.46
 inner=a.lathe('Warm lantern inner glaze',[(r-.024,z) for r,z in profile],'onggi',0,math.pi,steps=40);inner.scale.y=.46
 for side in [-1,1]:a.tube('Lantern cut rim',[(side*r,0,z) for r,z in profile],.016,'gold')
 a.ell('Lantern crown',(0,.045,1.38),(.61,.28,.067),'coal');a.ring('Lantern carry handle',(0,.02,1.45),.09,'gold',.015,axis='Y')
 for x,z,sc in [(-.38,.30,.56),(.35,.74,.48)]:
  tiled_platform((x,.07,z),.76,.38);kitchen((x,.07,z+.04),sc);v.roof((x,.10,z+.60*sc+.30),.71,.35)
 for i in range(7):a.box('Street stair',(.03+i*.064,.015,.30+i*.064),(.14,.18,.035),'ivory',.008)
 # A guided trolley, not people sliding around the miniature street.
 a.tube('Lower street trolley rail',[(-.58,-.21,.31),(.59,-.21,.31)],.008,'gold')
 def tram():
  a.box('Street bowl trolley',(-.49,-.21,.37),(.19,.10,.10),'enamel',.024);a.bowl((-.49,-.21,.45),.067)
  for dx in [-.059,.059]:a.cyl('Trolley wheel',(-.49+dx,-.262,.323),.025,.015,'gold').rotation_euler.x=math.pi/2
 b.assembly('Street trolley guided by rail',(-.49,-.21,.37),tram,'slide','X',.96,.36)
 for x,z in [(-.64,.98),(.64,1.11)]:a.tube('Street lantern bracket',[(x,.0,z+.16),(x,-.07,z+.16)],.007,'gold');b.lantern((x,-.07,z+.06),.044,.095)
 b.board_label('THE LAST LANTERN',(0,-.40,.14),.88,size=.031)

def fermentation_house():
 v.base(color='onggi');tiled_platform((0,0,.23),1.63,.69)
 for x in [-.64,.64]:a.box('Courtyard gate post',(x,.14,.68),(.09,.10,.85),'wood',.025)
 v.roof((0,.13,1.14),1.62,.46)
 a.box('Fermentation house back',(0,.28,.67),(1.27,.04,.76),'onggi',.025)
 for x in [-.40,0,.40]:v.lattice((x,.25,.75),.27,.34)
 for x,r,h in [(-.48,.16,.31),(0,.13,.25),(.48,.16,.37)]:b.jar((x,.02,.282),r,h)
 c.ant_chef((-.17,-.10,.279),.28,False);kitchen((.30,.14,.80),.27)
 # Remove one jar lid and put that exact lid on a visible inspection hinge.
 lid=[]
 for o in list(bpy.context.scene.objects):
  if o.name.startswith(('Domed jar lid','Lid grip')) and abs(o.location.x-.48)<.03 and o.location.z<.72:lid.append(o)
 pivot=a.pivot('Fermentation jar inspection hinge',(.48,.12,.66),'rock','X',.085,.43)
 for o in lid:a.parent(o,pivot)
 for x in [-.48,0,.48]:c.pepper((x,.24,1.06),.12)
 b.board_label('FIREANT FERMENTATION HOUSE',(0,-.40,.14),1.18,size=.028)

def workshop():
 a.box('Workshop wall mounting',(0,.15,.70),(1.84,.06,1.28),'onggi',.07)
 a.box('Workshop tiled interior',(0,.11,.69),(1.66,.025,1.12),'ivory',.05)
 for z in [.12,.72,1.28]:a.box('Workshop heavy shelf',(0,-.012,z),(1.79,.38,.055),'wood',.026)
 kitchen((-.41,-.05,.17),.57);kitchen((.39,.07,.765),.45)
 for x in [-.68,-.41,-.16]:b.jar((x,.035,.758),.075,.17)
 for x in [.17,.67]:a.tube('Brass elevator guide',[(x,-.16,.15),(x,-.16,1.20)],.012,'gold')
 def elevator():
  a.box('Fermentation jar lift',(.42,-.16,.19),(.40,.24,.052),'gold',.016);b.jar((.42,-.16,.22),.088,.18)
 b.assembly('Jar lift on two guide rails',(.42,-.16,.19),elevator,'slide','Z',.55,.32)
 a.tube('Visible lift cable',[(.42,-.16,.23),(.42,-.16,1.23)],.003,'coal')
 b.board_label('THE FERMENTATION WORKSHOP',(0,-.219,1.30),1.25,size=.028)

def fireant_city():
 v.base(color='onggi')
 # A great open red pepper encloses real floors and working miniature rooms.
 profile=a.soft_profile([(.59,.18),(.82,.41),(.73,1.07),(.49,1.33),(.16,1.39)])
 for col,offset in [('enamel',0),('onggi',-.025)]:
  o=a.lathe('Lacquer chilli city shell' if not offset else 'Chilli inner glaze',[(r+offset,z) for r,z in profile],col,0,math.pi,steps=36);o.scale.y=.44
 for side in [-1,1]:a.tube('Polished chilli cut edge',[(side*r,-.004,z) for r,z in profile],.014,'gold')
 a.tube('Great chilli stem',[(0,.09,1.37),(-.04,.09,1.48),(-.16,.09,1.50)],.030,'jade')
 for x,z,sc in [(-.35,.24,.67),(.29,.72,.57)]:
  tiled_platform((x,.01,z),.69 if sc>.5 else .43,.37);kitchen((x,.07,z+.04),sc)
 tiled_platform((-.28,.055,1.13),.43,.29)
 for x in [-.38,-.19]:b.jar((x,.055,1.175),.045,.094);a.bowl((x,-.025,1.20),.041)
 a.tube('Roof tea garden trellis',[(-.48,.11,1.16),(-.48,.11,1.37),(-.10,.11,1.37),(-.10,.11,1.16)],.008,'gold')
 a.tube('Fireant city lift guides',[(.70,-.06,.22),(.70,-.06,1.20)],.013,'gold')
 a.tube('Second lift guide',[(.46,-.06,.22),(.46,-.06,1.20)],.013,'gold')
 def lift():
  a.box('Brass city lift',(.58,-.06,.29),(.28,.22,.038),'gold',.018)
  for x in [.51,.65]:a.bowl((x,-.06,.346),.059)
 b.assembly('City kitchen lift on fixed guides',(.58,-.06,.29),lift,'slide','Z',.57,.29)
 for i in range(6):a.box('City connecting stair',(-.04+i*.068,-.015,.30+i*.07),(.11,.17,.028),'ivory',.006)
 for x,z in [(-.60,1.13),(.50,1.20)]:a.tube('Lantern fixed bracket',[(x,.05,z),(x,-.06,z)],.006,'gold');b.lantern((x,-.06,z-.08),.048,.11)
 b.board_label('FIREANT CITY AFTER DARK',(0,-.40,.14),1.04,size=.030)

BUILDERS={'domain_gochujang_rice_griddle':griddle,'domain_gochujang_kimchi_orchard':orchard,'domain_gochujang_spice_moon':moon_pavilion,'domain_gochujang_last_lantern':lantern_street,'domain_gochujang_spice_aquarium':fermentation_house,'domain_gochujang_fermentation_clockwork':workshop,'domain_gochujang_fireant_city':fireant_city}

def build_all(builders,version,source):
 v.build_all(builders,version)
 for name in (a.args.only.split(',') if a.args.only else builders):
  path=a.OUT/(name+'.json');record=json.loads(path.read_text());record.update(source=str(source),sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest());path.write_text(json.dumps(record,indent=2),encoding='utf-8')
 for path in [Path(__file__),source]: (a.OUT/path.name).write_bytes(path.read_bytes())

if __name__=='__main__':build_all(BUILDERS,'3.0.0-gochujang-finale.1',Path(__file__).resolve())
