"""Replace only the 17–31s game-footage window; preserve the authored edit/music."""
from pathlib import Path
import hashlib,json,shutil,subprocess,zipfile

original=Path('D:/Doma/DomainKitchenMedia/collectible-packs-v2-2026-09-24')
out=original.parent/'collectible-packs-v3-closeups'
out.mkdir(exist_ok=True)
project=out/'editable-project';project.mkdir(exist_ok=True)
captures=out/'source-captures';captures.mkdir(exist_ok=True)
review=out/'review';review.mkdir(exist_ok=True)
source=original/'native-project/dk-packs-v2'
recording=original/'captures/showcase-closeups.webm'
shutil.copy2(recording,captures/recording.name)
for p in (original/'captures').glob('hero_*.png'):shutil.copy2(p,review/p.name)

def ff(*args):subprocess.run(['ffmpeg','-hide_banner','-v','error','-y',*map(str,args)],check=True)
game=captures/'gameplay-closeups-14s.mp4'
ff('-i',recording,'-vf','fps=30,scale=1280:720:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=1,trim=duration=14','-an','-c:v','libx264','-crf','16','-preset','medium',game)
final=out/'Domain-Kitchen-Collectibles-Team-Concept-v3.mp4'
previous=original/'Domain-Kitchen-Collectibles-Team-Concept-v2.mp4'
ff('-i',previous,'-i',game,'-filter_complex',"[1:v]setpts=PTS-STARTPTS+17/TB[game];[0:v][game]overlay=560:180:eof_action=pass:enable='gte(t,17)*lt(t,31)'[picture]",'-map','[picture]','-map','0:a:0','-t','55','-r','30','-c:v','libx264','-crf','17','-preset','medium','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',final)

doc=json.loads((source/'project.json').read_text(encoding='utf-8'))
asset=next(a for a in doc['assets'] if a['name']=='gameplay-14s.mp4')
digest=hashlib.sha256(game.read_bytes()).hexdigest()
asset.update(name=game.name,uri='fs:media/'+digest+'.mp4',hash=digest,byteSize=game.stat().st_size,duration=14,width=1280,height=720)
for a in doc['assets']:
    if not a.get('uri','').startswith('fs:'):continue
    relative=a['uri'][3:];destination=project/relative;destination.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(game if a['id']==asset['id'] else source/relative,destination)
(project/'project.json').write_text(json.dumps(doc,indent=2),encoding='utf-8')
inputs=project/'inputs';inputs.mkdir(exist_ok=True)
for p in (source/'inputs').iterdir():
    if p.name.startswith('shot-') or p.suffix=='.ttf':shutil.copy2(p,inputs/p.name)
shutil.copy2(game,inputs/game.name)
shutil.copy2(source/'soundtrack-55s.wav',project/'soundtrack-55s.wav')
script=(source/'edit-v2.mjs').read_text(encoding='utf-8').replace('gameplay-14s.mp4',game.name)
(project/'edit-v3.mjs').write_text(script,encoding='utf-8')
notes='''Domain Kitchen — corrected collectible close-ups, version 3.
55 seconds, 1920×1080, 30 FPS. Replaces the game footage at 17–31 seconds.
Three independent front-facing camera setups, clean closed-shop fixture,
normal equipment → applied skin and empty position → placed jukebox.
Actual runtime meshes, materials, validated placement and appearance commands.
The captures contain no live player state, dirt, parcels, orders or customers.
All other footage, captions, prices, odds and the soundtrack retain version 2 timing.
TEAM CONCEPT remains visible. Paid purchasing, minting and redemption are disabled.
Zero new generated video clips. No production deployment.

Editable native project: editable-project/project.json.
Rebuild: higgsedit build edit-v3.mjs (from editable-project).
Add mastered audio: ffmpeg -i visual-master.mp4 -i soundtrack-55s.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -t 55 -movflags +faststart final.mp4
The earlier v2 deliverables remain available; this revision supersedes its film.
'''
(out/'Production-notes.txt').write_text(notes,encoding='utf-8');(project/'README.txt').write_text(notes,encoding='utf-8')
with zipfile.ZipFile(out/'Domain-Kitchen-Collectibles-Editable-v3.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for folder in [project,captures]:
        for p in folder.rglob('*'):
            if p.is_file():archive.write(p,p.relative_to(out))
    archive.write(out/'Production-notes.txt','Production-notes.txt')
subprocess.run(['ffmpeg','-v','error','-i',str(final),'-f','null','-'],check=True,capture_output=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(final)]))
video=next(s for s in probe['streams'] if s['codec_type']=='video')
assert float(probe['format']['duration'])==55 and (video['width'],video['height'],video['r_frame_rate'])==(1920,1080,'30/1')
for t in [17.4,19,21,22,24,26,26.4,28.5,30.5,31,42,51,54]:
    ff('-ss',t,'-i',final,'-frames:v','1','-vf','scale=960:540',review/f'frame-{t:04.1f}.png')
receipt={'duration':55,'resolution':'1920x1080','fullDecode':'passed','newVideoGenerations':0,'replacedSeconds':[17,31],'audio':'copied from v2 without re-encoding','sha256':hashlib.sha256(final.read_bytes()).hexdigest()}
(review/'verification.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print(json.dumps(receipt));print(final)
