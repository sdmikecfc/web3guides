"""Verify every derivative keeps original geometry, pivot and exact alpha silhouette."""
import json, pathlib
from PIL import Image, ImageChops

root = pathlib.Path(__file__).resolve().parents[2] / 'public/bots-arcade'
packed = root/'packed-v2'
index = json.loads((packed/'index.json').read_text())
count = 0
for key, file in index['sheets'].items():
    original = json.loads((root/'v1'/(key+'.json')).read_text())
    sheet = json.loads((packed/file).read_text())
    assert original['referenceHeight'] == sheet['referenceHeight']
    assert len(original['frames']) == len(sheet['frames'])
    with Image.open(packed/sheet['texture']) as atlas:
        assert atlas.size == (sheet['width'], sheet['height'])
        assert max(atlas.size) <= 4096
        for before, after in zip(original['frames'], sheet['frames']):
            for field in ['w','h','pivotX','pivotY','file']:
                assert before[field] == after[field], (key, field)
            frame = atlas.crop((after['x'],after['y'],after['x']+after['w'],after['y']+after['h'])).convert('RGBA')
            with Image.open(root/'v1'/before['file']) as source:
                assert ImageChops.difference(frame.getchannel('A'), source.convert('RGBA').getchannel('A')).getbbox() is None, key
            count += 1
assert len(index['arenas']) == 3
print(json.dumps({'framesVerified':count,'pivotAndDimensions':'identical','alphaSilhouettes':'pixel-identical','arenas':3}))
