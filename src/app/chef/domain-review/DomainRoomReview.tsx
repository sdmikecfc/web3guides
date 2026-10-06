'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {DOMAIN_COLLECTIBLES,type DomainId} from '@/lib/chef/diner/domain-worlds';
import {hasDomainArtStudy} from '@/lib/chef/diner/domain-art-studies';
import {DOMAIN_ROOM_STUDIES} from '@/lib/chef/diner/domain-room-studies';
import DinerScene from '../diner-preview/DinerScene';
import {loadDomainStudy} from '../diner-preview/domain-assets';
import {domainReviewScene} from './review-scene';
import css from '../packs/domain-hub.module.css';
import DomainKitReview from './DomainKitReview';
export default function DomainRoomReview({domain,initialItem}:{domain:DomainId;initialItem?:string}){
  const [editingKit,setEditingKit]=useState(false);
  const heroes=useMemo(()=>DOMAIN_COLLECTIBLES.filter(i=>i.domain===domain&&hasDomainArtStudy(i.id)),[domain]);
  const room=DOMAIN_ROOM_STUDIES[domain];
  const chosen=heroes.find(i=>i.id===initialItem)?.id;
  const [id,setId]=useState(chosen??heroes[0].id),[close,setClose]=useState(!!chosen),[showCollectibles,setShowCollectibles]=useState(!!chosen),[working,setWorking]=useState(false),[loaded,setLoaded]=useState(false),[rendered,setRendered]=useState(false),[error,setError]=useState(''),[captured,setCaptured]=useState('');
  const frame=useRef<HTMLDivElement>(null),[aspect,setAspect]=useState(2);
  useEffect(()=>{if(!frame.current)return;const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;if(r.height)setAspect(r.width/r.height);});observer.observe(frame.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{let cancelled=false;setId(chosen??heroes[0].id);setLoaded(false);setRendered(false);setError('');setClose(!!chosen);setCaptured('');setShowCollectibles(!!chosen);Promise.all([loadDomainStudy(room.asset),...heroes.filter(i=>!chosen||i.hero||i.id===chosen).map(i=>loadDomainStudy(i.id))]).then(()=>{if(!cancelled)setLoaded(true);}).catch(()=>{if(!cancelled)setError('The local 3D studies could not be loaded.');});return()=>{cancelled=true;};},[heroes,room.asset,chosen]);
  const scene=useMemo(()=>domainReviewScene(domain,id,close,working,aspect,showCollectibles),[domain,id,close,working,aspect,showCollectibles]),item=heroes.find(i=>i.id===id)??heroes[0];
  async function saveCorner(){
    if(!rendered)return;
    setCaptured('Saving concept postcard…');
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    const canvas=document.querySelector<HTMLCanvasElement>('[data-domain-room] canvas[tabindex]');if(!canvas){setCaptured('The room is not ready for a postcard yet.');return;}
    const out=document.createElement('canvas');out.width=1200;out.height=1000;const c=out.getContext('2d');if(!c){setCaptured('The review image could not be created.');return;}
    c.fillStyle='#f8f0e2';c.fillRect(0,0,1200,1000);
    // Wide desktop panels have useful camera breathing room, but a postcard
    // should devote its pixels to the restaurant, without clipping its walls.
    const cropWidth=close?canvas.width:Math.min(canvas.width,canvas.height*1.55),scale=Math.min(1200/cropWidth,830/canvas.height),w=cropWidth*scale,h=canvas.height*scale;
    c.drawImage(canvas,(canvas.width-cropWidth)/2,0,cropWidth,canvas.height,(1200-w)/2,35+(830-h)/2,w,h);
    c.fillStyle='#363b32';c.font='600 38px Georgia';c.fillText(close?item.name:room.name,54,911,1090);c.font='22px system-ui';c.fillText(`${domain.toUpperCase()} · ${close?item.rarity.toUpperCase():'COLLECTION RESTAURANT'} · PRIVATE ART REVIEW`,54,951,1090);
    out.toBlob(async blob=>{if(!blob){setCaptured('The review image could not be created.');return;}try{const r=await fetch(`/api/chef/domain-review-capture?id=${close?item.id:room.asset}&view=${close?'closeup':'room'}&size=${innerWidth<=600?'phone':'desktop'}`,{method:'POST',headers:{'Content-Type':'image/png'},body:blob});setCaptured(r.ok?'Concept postcard saved to the D: review folder.':'The review image could not be saved.');}catch{setCaptured('The review image could not be saved.');}});
  }
  if(editingKit)return <DomainKitReview key={domain} domain={domain} onBack={()=>setEditingKit(false)}/>;
  return <section className={css.review} aria-label="Furnished room studies">
    {!initialItem&&<button onClick={()=>setEditingKit(true)}>Try the editable room</button>}
    <div className={css.reviewBar}><strong>{room.name}</strong><div><button aria-pressed={!close} onClick={()=>setClose(false)}>Whole restaurant</button><button hidden={!!initialItem} aria-pressed={showCollectibles} onClick={()=>{setShowCollectibles(!showCollectibles);setClose(false);}}>{showCollectibles?'Hide pack pieces':'Show pack pieces'}</button>{initialItem&&<button aria-pressed={close} onClick={()=>setClose(true)}>Item close-up</button>}<button hidden={!!initialItem} onClick={()=>void saveCorner()} disabled={!rendered||captured==='Saving concept postcard…'}>Save concept postcard</button></div></div>
    <div ref={frame} className={css.canvas} data-domain-room data-assets={rendered?'ready':'loading'}>{loaded?<DinerScene mode="home" scene={scene} rotation={0} onTarget={target=>{if(heroes.some(i=>i.id===target)){setId(target);setClose(true);}}} onTile={()=>{}} onPerformance={stats=>{if(stats.triangles>10000)setRendered(true);}} showWorldHints={false}/>:<p role="status">{error||'Setting out the original studies…'}</p>}</div>
    {showCollectibles&&!initialItem&&<div className={css.heroChoices}>{heroes.map(hero=><button key={hero.id} aria-pressed={hero.id===id&&close} onClick={()=>{setId(hero.id);setClose(true);}}><small>{hero.rarity} · {hero.machine?'equipment skin':hero.mount+' piece'}</small><strong>{hero.name}</strong></button>)}</div>}
    <div className={css.caption}><p>{close?item.description:room.description} <span>{close?item.signature:room.details}</span></p>{close&&item.machine&&<button aria-pressed={working} onClick={()=>setWorking(!working)}>{working?'Stop motion preview':'Preview working motion'}</button>}</div>
    {!close&&!initialItem&&<p className={css.fine}>{room.motion} Discover all 24 different domain collectibles at least once to unlock this restaurant’s exclusive architecture and furnishings. Selling or redeeming your pulls keeps your discovery credit.</p>}
    {!initialItem&&<p className={css.fine}>{captured||'Private room art review. Try the editable room to rearrange its kit. Domain recipes and verified journey rewards are still being connected. Your restaurant save is untouched.'}</p>}
  </section>;
}
