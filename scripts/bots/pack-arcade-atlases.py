"""Lossy RGB / lossless-alpha derivatives; originals and animation pivots are unchanged.
Build on D:, then copy the verified release directory into public/bots-arcade.
"""
import argparse, hashlib, json, pathlib
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument('--source', required=True)
p.add_argument('--output', required=True)
a = p.parse_args()
source, output = pathlib.Path(a.source).resolve(), pathlib.Path(a.output).resolve()
if output.drive.lower() != 'd:':
    raise SystemExit('Generated atlas workspace must be on D:')
output.mkdir(parents=True, exist_ok=True)
index = {'version': 2, 'sheets': {}, 'arenas': {}}
before = after = count = 0
for file in sorted(source.glob('*.json')):
    sheet = json.loads(file.read_text())
    if not isinstance(sheet.get('frames'), list):
        continue
    frames = sheet['frames']
    cell_w, cell_h = max(f['w'] for f in frames)+4, max(f['h'] for f in frames)+4
    cols = min(4, len(frames))
    packed = Image.new('RGBA', (cell_w*cols, cell_h*((len(frames)+cols-1)//cols)))
    digest = hashlib.sha256(file.read_bytes())
    for i, frame in enumerate(frames):
        data = (source/frame['file']).read_bytes()
        digest.update(data)
        before += len(data)
        with Image.open(source/frame['file']) as image:
            assert image.size == (frame['w'], frame['h'])
            x, y = (i % cols)*cell_w+2, (i // cols)*cell_h+2
            packed.paste(image.convert('RGBA'), (x, y))
            frame.update(x=x, y=y)
        count += 1
    name = file.stem+'-'+digest.hexdigest()[:12]+'.webp'
    if not (output/name).exists():
        packed.save(output/name, 'WEBP', quality=88, method=6, exact=True)
    after += (output/name).stat().st_size
    sheet.update(version=2, texture=name, width=packed.width, height=packed.height)
    manifest_name = pathlib.Path(name).with_suffix('.json').name
    (output/manifest_name).write_text(json.dumps(sheet, separators=(',', ':')))
    index['sheets'][file.stem] = manifest_name
for name in ['reactor.png', 'salvage-dock.png', 'orbital-hangar.png']:
    file = source/name
    if not file.exists():
        continue
    data = file.read_bytes()
    packed_name = file.stem+'-'+hashlib.sha256(data).hexdigest()[:12]+'.webp'
    if not (output/packed_name).exists():
        with Image.open(file) as image:
            image.save(output/packed_name, 'WEBP', quality=88, method=6)
    index['arenas'][name] = packed_name
    before += len(data)
    after += (output/packed_name).stat().st_size
(output/'index.json').write_text(json.dumps(index, separators=(',', ':')))
print(json.dumps({'frames': count, 'sheets': len(index['sheets']), 'originalBytes': before,
                  'packedBytes': after, 'savedPercent': round(100*(1-after/before), 2)}))
