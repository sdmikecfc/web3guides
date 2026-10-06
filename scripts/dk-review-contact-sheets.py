"""Arrange existing renderer captures for side-by-side visual inspection on D:."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
base=Path('D:/Doma/DomainKitchenMedia/collectible-packs-v2-2026-09-24');captures=base/'captures';review=base/'review';review.mkdir(exist_ok=True)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',15)
routes=['street','festival','business','boardwalk','night_market']
def sheet(files,name,w=320,h=180,cols=5):
 result=Image.new('RGB',(w*cols,((len(files)+cols-1)//cols)*(h+30)),'#173f38');d=ImageDraw.Draw(result)
 for i,(p,label) in enumerate(files):
  assert p.is_file(),p
  im=Image.open(p).convert('RGB');im.thumbnail((w,h));x=(i%cols)*w;y=(i//cols)*(h+30);result.paste(im,(x+(w-im.width)//2,y+(h-im.height)//2));d.text((x+7,y+h+5),label,fill='#fff2d6',font=font)
 result.save(review/name,quality=95)
for quality in ['low','medium','high']:
 sheet([(captures/f'destination_{r}_1280x720_t{t}_r0_{quality}.png',f'{r} · tier {t} · {quality}') for t in range(1,5) for r in routes],f'destinations-{quality}.jpg')
sheet([(captures/f'destination_{r}_1280x720_t4_r{a}_high.png',f'{r} · rotation {a}') for a in range(4) for r in routes],'destinations-camera-directions.jpg')
sheet([(captures/f'destination_{r}_390x844_t1_r0_high.png',r) for r in routes],'destinations-390px.jpg',260,563)
icons=sorted(p for p in captures.glob('collection_*.png') if '_room_' not in p.name)
sheet([(p,p.stem.replace('collection_','').replace('_',' ')) for p in icons],'collection-all-24.jpg',280,280,6)
for size in ['1280x720','390x844']:
 rooms=sorted(captures.glob(f'collection_*_room_{size}.png'))
 if rooms:sheet([(p,p.stem.split('_room_')[0].replace('collection_','').replace('_',' ')) for p in rooms],f'collection-rooms-{size}.jpg',320,180 if size=='1280x720' else 692,6)
print(f'Reviewed source counts: {len(list(captures.glob("destination_*_t*.png")))} scenery captures, {len(icons)} icons')
heroes=Image.new('RGB',(1000,3*320),'#fff2d6');h=ImageDraw.Draw(heroes)
for i,(shape,t,title) in enumerate([('dragonfire_grill',7,'Dragonfire Grill'),('disco_burger_jukebox',11,'Disco Burger Jukebox'),('lucky_cat_soda',15,'Lucky Cat Soda Fountain')]):
 reference=Image.open(review/f'frame-{t:04.1f}.png').convert('RGB');reference.thumbnail((640,290));heroes.paste(reference,(0,i*320))
 icon=Image.open(captures/f'collection_{shape}.png').convert('RGBA');icon.thumbnail((280,280));heroes.paste(icon,(680,i*320),icon)
 h.text((16,i*320+293),title+' · cinematic reference / playable mesh',font=font,fill='#173f38')
heroes.save(review/'heroes-reference-comparison.jpg',quality=95)
