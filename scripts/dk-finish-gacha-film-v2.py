"""Finish the native motion-graphics edit with the authorized local gameplay/music."""
from pathlib import Path
import argparse,subprocess,json,hashlib,shutil,zipfile
ap=argparse.ArgumentParser();ap.add_argument('--workspace',required=True);ap.add_argument('--music',required=True);args=ap.parse_args()
out=Path(args.workspace);assert out.drive.lower()=='d:'
project=out/'native-project/dk-packs-v2';capture=out/'captures/showcase.webm';final=out/'Domain-Kitchen-Collectibles-Team-Concept-v2.mp4'
def ff(*args):subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*map(str,args)],check=True)
game=out/'captures/gameplay-14s.mp4'
ff('-i',capture,'-vf','fps=30,scale=1280:720:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=1,trim=duration=14','-an','-c:v','libx264','-preset','medium','-crf','16',game)
bed=out/'soundtrack-55s.wav'
ff('-ss','19.2','-i',args.music,'-t','55','-af','loudnorm=I=-17:TP=-1.5:LRA=7,afade=t=in:st=0:d=0.4,afade=t=out:st=53.7:d=1.3','-ar','48000',bed)
ff('-i',project/'visual-master.mp4','-i',game,'-i',bed,'-filter_complex',"[1:v]setpts=PTS-STARTPTS+17/TB[game];[0:v][game]overlay=560:180:eof_action=pass:enable='gte(t,17)*lt(t,31)'[picture]",'-map','[picture]','-map','2:a:0','-t','55','-r','30','-c:v','libx264','-crf','18','-preset','medium','-pix_fmt','yuv420p','-c:a','aac','-b:a','256k','-movflags','+faststart',final)
# Preserve native element IDs so all authored animation/timing remains editable.
document=json.loads((project/'project.json').read_text(encoding='utf-8'))
tracks=document['scenes'][0]['tracks'];background=next(c for t in tracks for c in t['clips'] if c['name']=='Playable collectibles')
for track in tracks:
 for clip in list(track['clips']):
  if clip['name'] in ['Dress your Dragonfire Grill.','Place your Disco Burger Jukebox.','Make the Lucky Cat Fountain yours.']:
   track['clips'].remove(clip);clip['timeRange']['start']-=17;background['children'].append(clip)
asset=next(a for a in document['assets'] if a['name'] in ['gameplay-placeholder.mp4','gameplay-14s.mp4'])
old_uri=asset['uri'];digest=hashlib.sha256(game.read_bytes()).hexdigest();uri='media/'+digest+'.mp4';shutil.copy2(game,project/uri)
asset.update(name=game.name,uri='fs:'+uri,hash=digest,byteSize=game.stat().st_size,duration=14,width=1280,height=720)
def rename(node):
 if isinstance(node,dict):
  if node.get('assetId')==asset['id']:node['name']=game.name
  for v in node.values():rename(v)
 elif isinstance(node,list):
  for v in node:rename(v)
rename(document);(project/'project.json').write_text(json.dumps(document,indent=2),encoding='utf-8')
inputs=project/'inputs';inputs.mkdir(exist_ok=True)
for a in document['assets']:
 if a['kind']=='video' and a['name'].startswith('shot-'):shutil.copy2(project/a['uri'][3:],inputs/a['name'])
font=next(a for a in document['assets'] if a['kind']=='font');shutil.copy2(project/font['uri'][3:],inputs/'Montserrat.ttf');shutil.copy2(game,inputs/game.name);shutil.copy2(bed,project/bed.name)
script=Path('scripts/dk-gacha-film-v2.mjs').read_text(encoding='utf-8').replace("import {execFileSync} from 'node:child_process';","import {fileURLToPath} from 'node:url';").replace("const fontPath=execFileSync('fc-match',['-f','%{file}','Montserrat:style=Bold'],{encoding:'utf8'}).trim();",'const fontPath=`${input}/Montserrat.ttf`;').replace('gameplay-placeholder.mp4','gameplay-14s.mp4').replace("'/home/user/inputs'","fileURLToPath(new URL('./inputs',import.meta.url))").replace("'/home/user/dk-packs-v2'","fileURLToPath(new URL('.',import.meta.url))")
(project/'edit-v2.mjs').write_text(script,encoding='utf-8');(project/'edit.mjs').write_text(script,encoding='utf-8')
readme='''Domain Kitchen — editable team concept, 55 seconds, 1080p/30.
project.json contains native editable titles, animated cards and original source footage.
The gameplay media now contains the actual game renderer, not the temporary key plate.
To regenerate pictures with Higgsedit: higgsedit build edit-v2.mjs
Then add the already mastered soundtrack: ffmpeg -i visual-master.mp4 -i soundtrack-55s.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -t 55 -movflags +faststart final.mp4
All wording, six rarity levels, leaderboard cards and timing remain editable.
No narration or new paid video generations. Music: owner's Sunlit Groove, offset 19.2s.
Paid purchasing/minting/redemption are disabled. Leaderboards shown are illustrative.
Proposed pack prices 5 / 10 USDC. Proposed redemption 4.99 / 9.98 USDC.
'''
(project/'README.txt').write_text(readme,encoding='utf-8');(out/'README.txt').write_text(readme,encoding='utf-8')
with zipfile.ZipFile(out/'Domain-Kitchen-Collectibles-Editable-v2.zip','w',zipfile.ZIP_DEFLATED) as z:
 for file in project.rglob('*'):
  if file.is_file() and file.name not in ['visual-master.mp4','build.log','check.txt'] and file.relative_to(project).as_posix()!=old_uri[3:]:z.write(file,Path('Domain-Kitchen-Collectibles-v2')/file.relative_to(project))
 z.write(capture,'source-captures/showcase.webm')
print(final,flush=True)
