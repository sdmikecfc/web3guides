"""Movable architectural pieces from the approved restaurant art direction.
Same original geometry and materials; no provider use. Output is a private D: kit.
"""
import importlib.util, bpy, math, json, hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('room_art',Path(__file__).with_name('dk-build-domain-restaurants.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
a=r.a
a.MAX_TRIANGLES=30000
THEMES=['gochujang','smoothie','wines']
PARTS=['wall','counter','chair','stool','table','plant','sign','lamp','feature']

def palette(theme):
 return ('hotred','coal','hotred') if theme=='gochujang' else ('peach','stone','coral') if theme=='smoothie' else ('walnut2','stone','velvet')

def wall(theme):
 c,top,seat=palette(theme)
 r.box('Architectural wall',0,1.70,0,1,3.4,.18,c)
 r.box('Cornice',0,3.36,.06,1,.12,.28,'seagreen' if theme=='smoothie' else 'gold')
 r.box('Wall skirting',0,.12,.11,1,.14,.07,'gold')
 if theme=='wines':
  for row in range(6):
   y=.38+row*.44;r.box('Walnut cellar shelf',0,y,.18,.96,.045,.30,'oak');r.box('Shelf light',0,y+.03,.33,.84,.014,.018,'gold')
   for k in range(4):r.bottle((k-1.5)*.20,y+.04,.19,.18,['wine','leaf','charcoal'][(row+k)%3])
  for x in [-.47,.47]:r.box('Cellar upright',x,1.59,.13,.05,2.9,.33,'oak')
 elif theme=='gochujang':
  for row in range(5):r.box('Red glazed tile',0,.3+row*.29,.101,.96,.266,.026,'red' if row%3 else 'lacquer')
  r.box('Gold lattice frame',0,2.42,.12,.88,1.18,.06,'gold');r.box('Charcoal panel',0,2.42,.16,.77,1.06,.035,'coal')
  for x in [-.3,-.15,0,.15,.3]:r.box('Lacquer lattice',x,2.42,.20,.025,1.03,.04,'hotred')
 else:
  r.box('Orangery glass',0,2.0,.11,.87,2.4,.035,'tealglass',.09)
  for x in [-.45,0,.45]:r.box('Orangery mullion',x,2,.15,.04,2.45,.06,'ivory')
  for y in [.8,2.42,3.20]:r.box('Orangery transom',0,y,.16,.94,.05,.07,'ivory')

def lamp(theme):
 # All hanging pieces include a real wall bracket, not unsupported floating lamps.
 r.rod('Wall-fixed lamp bracket',[(0,2.95,-.47),(0,2.95,0),(0,2.80,0)],.024,'gold')
 r.pendant(0,0,2.55,'red' if theme=='gochujang' else 'gold',theme=='gochujang')
 # The original ceiling cable is replaced by this fixture's short bracket drop.
 for o in list(bpy.context.scene.objects):
  if o.name.startswith('Supported pendant cable'):bpy.data.objects.remove(o,do_unlink=True)

def feature(theme):
 if theme=='gochujang':r.ant(0,0,.82,working=False)
 elif theme=='smoothie':
  r.bar(0,0,.92,.75,'peach','stone',True)
  for i,c in enumerate(['mango','coral','lime']):
   x=(i-1)*.25;r.cyl('Produce bowl',x,1.24,0,.14,.12,'ivory')
   for j in range(3):r.ball('Market fruit',x+math.cos(j*2.1)*.06,1.36,math.sin(j*2.1)*.06,.064,.073,.064,c)
 else:
  r.bar(0,0,.92,.72,'walnut2','stone')
  for x in [-.26,0,.26]:r.bottle(x,1.23,0,.23)

def build_part(theme,part):
 r.bottle_templates.clear();c,top,seat=palette(theme)
 if theme=='wines':a.P.update({'oak':('#996a4a',.04,.43),'oaklight':('#a27353',0,.43),'oaktone':('#936144',0,.43)})
 if part=='wall':wall(theme)
 elif part=='counter':r.bar(0,0,.995,.86,c,top,theme!='gochujang')
 elif part=='chair':r.chair(0,0,seat)
 elif part=='stool':r.stool(0,0,seat)
 elif part=='table':
  r.cyl('Dining pedestal',0,.42,0,.063,.75,'gold' if theme=='wines' else 'seagreen');r.cyl('Dining foot',0,.055,0,.31,.07,'coal');r.round_top('Dining tabletop',0,.86,0,.92,.92,.09,top if theme=='wines' else 'ivory')
 elif part=='plant':r.planter(0,0,.85,theme=='smoothie')
 elif part=='sign':r.text_plate({'gochujang':'Gochujang.com','smoothie':'smoothie.com','wines':'WINES.XYZ'}[theme],{'gochujang':'FIREANT RAMYEON CLUB','smoothie':'THE TROPICAL FRUIT CLUB','wines':'THE VELVET CELLAR'}[theme],0,2.7,.12,3.6,'seagreen' if theme=='smoothie' else c,'ivory' if theme!='wines' else 'gold')
 elif part=='lamp':lamp(theme)
 elif part=='feature':feature(theme)
 for o in bpy.context.scene.objects:
  if o.type=='FONT':o.data.resolution_u=2;o.data.bevel_resolution=0;o.data.bevel_depth=0

a.BUILDERS={f'domain_kit_{theme}_{part}':(lambda t=theme,p=part:build_part(t,p)) for theme in THEMES for part in PARTS}
for name in (a.args.only.split(',') if a.args.only else a.BUILDERS):
 a.build(name)
 path=a.OUT/(name+'.json');record=json.loads(path.read_text(encoding='utf-8'))
 record.update(source=str(Path(__file__).resolve()),sourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),roomSourceSha256=hashlib.sha256(Path(r.__file__).read_bytes()).hexdigest(),support='Tile-centred movable room piece. Sign spans four wall tiles; lamps attach to wall.',reviewStatus='Derived from user-approved room direction; integration review pending')
 path.write_text(json.dumps(record,indent=2),encoding='utf-8')
