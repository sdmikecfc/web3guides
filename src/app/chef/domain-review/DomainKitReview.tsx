'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {DomainId} from '@/lib/chef/diner/domain-worlds';
import {DOMAIN_KIT_PARTS,domainKitAsset} from '@/lib/chef/diner/domain-room-kit-defs';
import {domainRoomBlueprint,unlockDomainRoomSizes,earnedDomainRoomDraft,domainRoomName} from '@/lib/chef/diner/domain-room-kits';
import {createDiner,dispatchDiner} from '@/lib/chef/diner/progression';
import {createRestaurantBlueprint,alignRoomMounts,type RestaurantStage} from '@/lib/chef/diner/room-plan';
import {fixtureInventoryFor,installedStools} from '@/lib/chef/diner/renovation';
import {roomDesignPreview,roomDesignCommand,type RoomDesign} from '@/lib/chef/diner/room-building-draft';
import {drawRoomEdges,paintRoomFloor,storeRoomPiece,type ConstructionTool} from '@/lib/chef/diner/room-construction';
import {physicalHomeScene} from '../diner-preview/physical-home-scene';
import {moveRoomDraft,rotateRoomDraft,validateRoomDraft,roomPieceLabel} from '../diner-preview/room-editor';
import {loadDomainStudy} from '../diner-preview/domain-assets';
import {homeMountSurfaces} from '../diner-preview/placement-preview';
import DinerScene from '../diner-preview/DinerScene';
import css from './domain-kit-review.module.css';

function fixture(domain:DomainId,stage:RestaurantStage){
 let state=createDiner(1800000000000,`domain-room-${domain}-${stage}`);const base=createRestaurantBlueprint(stage);
 Object.assign(state.home,{w:base.roomPlan.w,h:base.roomPlan.h,roomPlan:base.roomPlan,layout:base.layout,fixtureInventory:fixtureInventoryFor(base.roomPlan),stools:installedStools(base.roomPlan)});
 // Isolated art preview only. No pretend chain receipt or real account entitlement.
 state.domainRooms={version:1,earned:{[domain]:{receiptId:`dev-only-${domain}`,seasonId:'private-review',earnedAt:1800000000000,stages:[]}}};
 state=unlockDomainRoomSizes(state);
 const draft=earnedDomainRoomDraft(state,domain);state.home.roomPlan=structuredClone(draft.roomPlan);state.home.layout=structuredClone(draft.layout);
 return {state,draft};
}
export default function DomainKitReview({domain,onBack}:{domain:DomainId;onBack:()=>void}){
 const [stage,setStage]=useState<RestaurantStage>('burger_shop'),[session,setSession]=useState(()=>fixture(domain,'burger_shop'));
 const [draft,setDraft]=useState<RoomDesign>(session.draft),[past,setPast]=useState<RoomDesign[]>([]),[future,setFuture]=useState<RoomDesign[]>([]),[selected,setSelected]=useState<string|null>(null),[tool,setTool]=useState<ConstructionTool>('select'),[overhead,setOverhead]=useState(false),[notice,setNotice]=useState(''),[loaded,setLoaded]=useState(false),[loadError,setLoadError]=useState('');
 const frame=useRef<HTMLDivElement>(null),[aspect,setAspect]=useState(1.6),[rendered,setRendered]=useState(false);
 const [buildStart,setBuildStart]=useState<{x:number;y:number}|null>(null);
 useEffect(()=>{if(!frame.current)return;const observer=new ResizeObserver(([e])=>setAspect(e.contentRect.width/e.contentRect.height));observer.observe(frame.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{let active=true;setLoaded(false);Promise.all(DOMAIN_KIT_PARTS.map(part=>loadDomainStudy(domainKitAsset(domain,part)))).then(()=>{if(active)setLoaded(true);}).catch(()=>{if(active)setLoadError('The local furniture files could not be loaded.');});return()=>{active=false;};},[domain]);
 const preview=useMemo(()=>roomDesignPreview(session.state,draft),[session.state,draft]),error=validateRoomDraft(session.state,draft),selectedItem=draft.layout.find(p=>p.id===selected);
 const scene=useMemo(()=>{
  const data=physicalHomeScene(preview,null,selected);data.quality='high';data.atmosphere=domain==='smoothie'?'day':'evening';data.buildEditor=true;data.construction=tool!=='select';
  if(tool==='select'&&selectedItem?.mount)data.placement={valid:!error,surfaces:homeMountSurfaces(preview,{...selectedItem,mode:'home',existing:true,pinned:false})};
  if(overhead)data.buildView='overhead';else data.reviewCamera={x:(draft.roomPlan.w-1)/2,y:1.15,z:(draft.roomPlan.h-1)/2,vertical:Math.max(draft.roomPlan.h+3.5,(draft.roomPlan.w+4.2)/aspect),azimuth:-.54,elevation:.64};
  return data;
 },[preview,selected,selectedItem,error,domain,draft.roomPlan,overhead,aspect,tool]);
 function change(next:RoomDesign){setPast(p=>[...p,draft].slice(-40));setFuture([]);setDraft(next);setNotice('');}
 function construct(from:{x:number;y:number},to:{x:number;y:number}){
  const floor=tool==='indoor'||tool==='patio'||tool==='garden',snap=(p:{x:number;y:number})=>({x:Math.round(p.x+(floor?0:.5)),y:Math.round(p.y+(floor?0:.5))}),a=snap(from),b=snap(to);
  if(!floor&&!buildStart&&a.x===b.x&&a.y===b.y){setBuildStart(a);setNotice('Tap the end of the wall.');return;}
  const start=buildStart??a;setBuildStart(null);
  if(tool==='indoor'||tool==='patio'||tool==='garden')change(paintRoomFloor(draft,start,b,tool));else if(tool!=='select'&&tool!=='entrance')change(drawRoomEdges(draft,start,b,tool));
 }
 function resize(next:RestaurantStage){const f=fixture(domain,next);setStage(next);setSession(f);setDraft(f.draft);setPast([]);setFuture([]);setSelected(null);setNotice('');setRendered(false);}
 function confirm(){const result=dispatchDiner(session.state,roomDesignCommand(session.state,draft),{now:session.state.updatedAt});if(result.error){setNotice(result.error);return;}setSession({state:result.state,draft:structuredClone(draft)});setNotice('Layout confirmed in this private review. Your real restaurant is unchanged.');}
 async function capture(){
  if(!rendered)return;setSelected(null);setNotice('Saving workshop image…');await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  const canvas=frame.current?.querySelector<HTMLCanvasElement>('canvas[tabindex]');if(!canvas){setNotice('Wait for the room to finish loading.');return;}
  const out=document.createElement('canvas');out.width=1200;out.height=Math.min(1400,Math.round(1200*canvas.height/canvas.width)+140);const c=out.getContext('2d')!;c.fillStyle='#f8f0e2';c.fillRect(0,0,out.width,out.height);
  const scale=Math.min(1200/canvas.width,(out.height-140)/canvas.height);c.drawImage(canvas,(1200-canvas.width*scale)/2,20,canvas.width*scale,canvas.height*scale);
  c.fillStyle='#353e34';c.font='600 34px Georgia';c.fillText(domainRoomName(domain),45,out.height-72);c.font='20px system-ui';c.fillText(`${stage.replaceAll('_',' ').toUpperCase()} · EDITABLE ROOM KIT · PRIVATE DEVELOPMENT`,45,out.height-32);
  out.toBlob(async blob=>{if(!blob)return;try{const response=await fetch(`/api/chef/domain-review-capture?id=domain_room_${domain}&view=kit-${stage}&size=${innerWidth<=600?'phone':'desktop'}`,{method:'POST',headers:{'Content-Type':'image/png'},body:blob});setNotice(response.ok?'Workshop image saved to D:.':'The workshop image could not be saved.');}catch{setNotice('The workshop image could not be saved.');}});
 }
 const inventory=useMemo(()=>earnedDomainRoomDraft(session.state,domain),[session.state,domain]);
 const choices=[...draft.roomPlan.modules.map(m=>m.id),...draft.layout.map(p=>p.id)],stored=inventory.layout.filter(p=>!draft.layout.some(q=>p.id===q.id)),storedModules=inventory.roomPlan.modules.filter(p=>!draft.roomPlan.modules.some(q=>p.id===q.id));
 return <section className={css.workshop} aria-label="Editable collection restaurant">
  <header><div><small>PRIVATE LAYOUT WORKSHOP</small><h2>{domainRoomName(domain)}</h2></div><button disabled={!rendered} onClick={()=>void capture()}>Save workshop image</button><button onClick={onBack}>Back to art review</button></header>
  <nav aria-label="Restaurant size">{(['burger_shop','diner','restaurant'] as const).map(s=><button key={s} aria-pressed={s===stage} onClick={()=>resize(s)}>{s==='burger_shop'?'Small restaurant':s==='diner'?'Diner':'Full restaurant'}</button>)}</nav>
  <div className={css.canvas} ref={frame}>{loaded?<DinerScene mode="home" scene={scene} rotation={0} onPerformance={stats=>{if(stats.triangles>10000)setRendered(true);}} editing onTarget={id=>{if(choices.includes(id)){setSelected(id);setNotice('');}}} onTile={(x,y)=>{if(tool==='select'&&selected)change(moveRoomDraft(draft,selected,x,y));}} onMountSurface={surface=>{if(!selectedItem?.mount)return;const next=structuredClone(draft);next.layout=alignRoomMounts(next.layout.map(p=>p.id===selected?{...p,mount:surface.mount}:p),next.roomPlan);change(next);}} onConstruction={construct} showWorldHints={false}/>:<p role="status">{loadError||'Unpacking the room pieces…'}</p>}</div>
  <div className={css.tools}>
   <label>Work on <select aria-label="Build tool" value={tool} onChange={e=>{setTool(e.target.value as ConstructionTool);setBuildStart(null);setNotice('');}}><option value="select">Furniture</option><option value="wall">Draw a wall</option><option value="half_wall">Draw a half wall</option><option value="door">Add a doorway</option><option value="erase">Remove a wall</option><option value="patio">Paint patio</option><option value="indoor">Paint indoor floor</option></select></label>
   {tool==='select'&&<label>Selected piece <select aria-label="Selected room piece" value={selected??''} onChange={e=>{setSelected(e.target.value||null);setNotice('');}}><option value="">Tap a piece in the room</option>{choices.map(id=><option key={id} value={id}>{roomPieceLabel(draft,id)}</option>)}</select></label>}
   <button aria-pressed={overhead} onClick={()=>setOverhead(!overhead)}>{overhead?'Isometric view':'Overhead view'}</button>
   <button disabled={!selected||!!selectedItem?.mount} onClick={()=>change(rotateRoomDraft(draft,selected))}>Rotate</button>
   <button disabled={!selected} onClick={()=>{change(storeRoomPiece(draft,selected!));setSelected(null);}}>Store</button>
   <button disabled={!past.length} onClick={()=>{setFuture(f=>[draft,...f]);setDraft(past[past.length-1]);setPast(p=>p.slice(0,-1));}}>Undo</button>
   <button disabled={!future.length} onClick={()=>{setPast(p=>[...p,draft]);setDraft(future[0]);setFuture(f=>f.slice(1));}}>Redo</button>
  </div>
  {(stored.length+storedModules.length)>0&&<details className={css.storage}><summary>Storage · {stored.length+storedModules.length} pieces</summary>{stored.map(p=><button key={p.id} onClick={()=>{change({...draft,layout:[...draft.layout,structuredClone(p)]});setSelected(p.id);}}>Place {roomPieceLabel(inventory,p.id)}</button>)}{storedModules.map(p=><button key={p.id} onClick={()=>{change({...draft,roomPlan:{...draft.roomPlan,modules:[...draft.roomPlan.modules,structuredClone(p)]}});setSelected(p.id);}}>Place {roomPieceLabel(inventory,p.id)}</button>)}</details>}
  <footer><p role="status">{notice||error||(tool==='select'?(selectedItem?.mount?'Tap a highlighted wall to move this piece.':'Select a piece, then tap the floor to move it.'):'Drag a line, or tap its start and end points.')}</p><button onClick={()=>{setDraft(structuredClone(session.draft));setPast([]);setFuture([]);setSelected(null);setNotice('Changes cancelled.');}}>Cancel changes</button><button disabled={!!error} onClick={confirm}>Confirm layout</button></footer>
  <p className={css.note}>The same room editor and placement checks used in the game. Private test ownership only. Domain recipes and verified journey rewards are still being connected.</p>
 </section>;
}
