"""Decode the complete deliverable and produce a time-labelled editorial review."""
from pathlib import Path
import subprocess,json,zipfile,hashlib
from PIL import Image,ImageDraw,ImageFont
base=Path('D:/Doma/DomainKitchenMedia/collectible-packs-v2-2026-09-24')
film=base/'Domain-Kitchen-Collectibles-Team-Concept-v2.mp4';review=base/'review';review.mkdir(exist_ok=True)
subprocess.run(['ffmpeg','-v','error','-i',str(film),'-f','null','-'],check=True,capture_output=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(film)]))
assert float(probe['format']['duration'])==55
v=next(s for s in probe['streams'] if s['codec_type']=='video');assert (v['width'],v['height'],v['r_frame_rate'])==(1920,1080,'30/1')
audio=subprocess.run(['ffmpeg','-hide_banner','-i',str(film),'-af','ebur128=peak=true','-f','null','-'],capture_output=True,text=True,check=True).stderr
(review/'audio-measurement.txt').write_text(audio[ audio.rfind('Summary:'):],encoding='utf-8')
times=[2,7,11,15,19,24,29,33,37,42,47.5,51,54]
sheet=Image.new('RGB',(1280,7*385),'#123f37');draw=ImageDraw.Draw(sheet);font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',20)
for i,t in enumerate(times):
 file=review/f'frame-{t:04.1f}.png'
 subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(film),'-frames:v','1','-vf','scale=640:360',str(file)],check=True)
 x=(i%2)*640;y=(i//2)*385;sheet.paste(Image.open(file),(x,y));draw.text((x+8,y+361),f'{t:04.1f}s',font=font,fill='#fff2d6')
sheet.save(review/'editorial-contact-sheet.jpg',quality=94)
# Repair Windows portability without recompressing the movie.
project=base/'native-project/dk-packs-v2'
for name in ['edit.mjs','edit-v2.mjs']:
 p=project/name;s=p.read_text(encoding='utf-8').replace("import {execFileSync} from 'node:child_process';","import {fileURLToPath} from 'node:url';").replace("new URL('./inputs',import.meta.url).pathname","fileURLToPath(new URL('./inputs',import.meta.url))").replace("new URL('.',import.meta.url).pathname","fileURLToPath(new URL('.',import.meta.url))");p.write_text(s,encoding='utf-8')
document=json.loads((project/'project.json').read_text(encoding='utf-8'));used={a['uri'][3:] for a in document['assets'] if a.get('uri','').startswith('fs:')}
for relative in used:assert (project/relative).is_file(),relative
with zipfile.ZipFile(base/'Domain-Kitchen-Collectibles-Editable-v2.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in project.rglob('*'):
  if not p.is_file():continue
  rel=p.relative_to(project).as_posix()
  if p.name in ['visual-master.mp4','build.log','check.txt'] or (rel.startswith('media/') and rel not in used):continue
  z.write(p,'Domain-Kitchen-Collectibles-v2/'+rel)
 z.write(base/'captures/showcase.webm','source-captures/showcase.webm')
receipt={'duration':55,'frames':1650,'resolution':'1920x1080','fullDecode':'passed','sha256':hashlib.sha256(film.read_bytes()).hexdigest(),'newVideoGenerations':0,'nativeProjectAssetsVerified':len(used)}
(review/'film-verification.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print(json.dumps(receipt))
