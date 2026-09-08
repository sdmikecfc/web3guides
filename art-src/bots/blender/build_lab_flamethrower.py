"""Author only the lab's compact toy flamethrower; leave existing moulds intact."""
from pathlib import Path
source = Path(__file__).with_name('build_clay_lab.py')
# Reuse the established material, attachment and export helpers, not its batch build.
exec(compile(source.read_text(encoding='utf8').split("manifest={'version':")[0], str(source), 'exec'))
OUT = ROOT / 'public/bots-art/3d/toy-lab'
orange = material('enamel orange', (.68, .17, .045), .12, .45)
cream = material('ceramic', (.81, .71, .49), .03, .42)
box('rounded receiver', (0,.13,.10), (.29,.31,.54), DARK, 'weapon', .07)
box('grip', (0,-.12,.02), (.13,.28,.17), RUBBER, 'weapon', .04)
cylinder('short ceramic shroud', (0,.16,.29), (0,.16,.68), .15, cream, 'weapon', r2=.19)
cylinder('dark nozzle', (0,.16,.65), (0,.16,.80), .13, DARK, 'weapon')
ring('brass nozzle rim', (0,.16,.80), .13, .025, BRASS, 'weapon')
for z in [.37,.49,.61]: ring('heat fins', (0,.16,z), .17, .02, orange, 'weapon')
cylinder('side fuel pod', (.23,-.02,-.13), (.23,.44,-.13), .15, orange, 'weapon')
sphere('pod cap', (.23,.44,-.13), (.15,.08,.15), BRASS, 'weapon')
sphere('pod base', (.23,-.02,-.13), (.15,.07,.15), DARK, 'weapon')
for y in [.08,.32]: ring('pod strap', (.23,y,-.13), .153, .018, BRASS, 'weapon', axis='y')
cylinder('feed pipe', (.23,.07,-.02), (.12,.07,.28), .034, BRASS, 'weapon')
sphere('pilot light', (0,.045,.77), (.035,.035,.045), HOT, 'weapon')
entry = export('flamethrower')
manifest_path = OUT / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
entry['source'] = 'art-src/bots/blender/build_lab_flamethrower.py'
manifest['parts']['flamethrower'] = entry
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
bpy.ops.wm.save_as_mainfile(filepath=str(Path(__file__).with_name('lab-flamethrower.blend')), compress=True)
print('FLAMETHROWER_COMPLETE', entry['bytes'])
