"""Package verified local deliverables; never deploys or accesses player state."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

source = Path(__file__).resolve().parents[1]
base = Path('D:/Doma/DomainKitchenMedia/collectible-packs-v2-2026-09-24')
captures = base / 'captures'
review = base / 'review'
evidence = review / 'verification'
evidence.mkdir(parents=True, exist_ok=True)
shutil.copy2(source / 'docs/domain-kitchen-collectibles-v2-delivery.md', base / 'Production-notes.md')
logs = Path('D:/Temp/dk-collection-v2-verification')
for p in logs.iterdir():
    if p.suffix in {'.json', '.log'}:
        shutil.copy2(p, evidence / p.name)
shutil.copy2(Path('D:/Temp/dk-collection-v2-production-build-final.log'), evidence / 'production-build.log')
results = json.loads((evidence / 'results.json').read_text(encoding='utf-8'))
assert len(results) == 21 and all(r['passed'] for r in results)

icons = sorted(p for p in captures.glob('collection_*.png') if '_room_' not in p.name)
rooms = sorted(captures.glob('collection_*_room_*.png'))
destinations = sorted(captures.glob('destination_*_t*.png'))
assert (len(icons), len(rooms), len(destinations)) == (24, 48, 90)
with zipfile.ZipFile(base / 'Domain-Kitchen-Source-Captures-v2.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for p in [*icons, *rooms, *destinations, captures / 'showcase.webm']:
        archive.write(p, 'captures/' + p.name)
    archive.write(base / 'Production-notes.md', 'Production-notes.md')
    for p in review.rglob('*'):
        if p.is_file() and p.suffix in {'.jpg', '.json', '.txt', '.log'}:
            archive.write(p, 'review/' + p.relative_to(review).as_posix())

outputs = ['Domain-Kitchen-Collectibles-Team-Concept-v2.mp4', 'Domain-Kitchen-Collectibles-Editable-v2.zip', 'Domain-Kitchen-Source-Captures-v2.zip', 'Production-notes.md']
manifest = {'simulationGroupsPassed': len(results), 'catalogueCaptures': len(icons), 'roomCaptures': len(rooms), 'destinationCaptures': len(destinations), 'newPaidVideoGenerations': 0, 'productionDeployed': False, 'outputs': []}
for name in outputs:
    p = base / name
    assert p.is_file()
    manifest['outputs'].append({'file': name, 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
    if p.suffix == '.zip':
        with zipfile.ZipFile(p) as archive:
            assert archive.testzip() is None
(base / 'delivery-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps(manifest, indent=2))
