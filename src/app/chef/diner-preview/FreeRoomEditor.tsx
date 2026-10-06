'use client';
import {useEffect,useRef,useState} from 'react';
import {EQUIPMENT_BY_ID,HOME_EQUIPMENT} from '@/lib/chef/diner/content';
import {DECOR_BY_ID,DECOR} from '@/lib/chef/diner/collections';
import {quoteRoomPurchases,BUILD_FIXTURE_PRICES,roomDesignPreview} from '@/lib/chef/diner/room-building-draft';
import {homeEquipmentPurchaseError} from '@/lib/chef/diner/progression';
import {roomCollectionVisible} from '@/lib/chef/diner/room-collection';
import {ROOM_FIXTURES,roomSeatStyles,type RoomModuleKind,type StoolStyle} from '@/lib/chef/diner/room-plan';
import {RENOVATION_RULES} from '@/lib/chef/diner/renovation';
import {setRoomSeating,storeRoomPiece,type ConstructionTool} from '@/lib/chef/diner/room-construction';
import {freeRoomSeats,privateRestroom} from '@/lib/chef/diner/room-plan-v2';
import {addStoredRoomFixture,rotateRoomDraft,roomDraftProblem,roomPieceLabel,roomFixtureLabel,transformRoomGroup} from './room-editor';
import {createPlacementDraft} from './placement-preview';
import {roomChairSelection} from './room-selection';
import {ModelIcon} from './ModelIcon';
import {EditorFinishes} from './EditorFinishes';
import {EditorSavedRooms} from './EditorSavedRooms';
import type {RoomEditorProps} from './RoomEditor';
import styles from './free-room-editor.module.css';

export type BuildControls={initialStorage?:boolean;onCollectionRooms?:()=>void;onFind:(id:string)=>void;tool:ConstructionTool;onTool:(tool:ConstructionTool)=>void;overhead:boolean;onOverhead:()=>void;instruction:string;floorFinish?:string;onFloorFinish:(id:string)=>void;onSaveDraft?:()=>void;onRestore?:()=>void;onSaveDesign:(name:string,id?:string)=>boolean};
const buildTools:ConstructionTool[]=['select','wall','half_wall','glass','screen','window','door','staff_gate','erase','entrance'];
const toolNames:Partial<Record<ConstructionTool,string>>={select:'Select',half_wall:'Half wall',staff_gate:'Staff gate',erase:'Remove wall',entrance:'Move entrance'};
const fixtureHints:Record<RoomModuleKind,string>={display_counter:'Food ready for collection',lift_gate:'Staff can pass through',service_hatch:'Serve through a wall',internal_pass:'Link separate cooking areas',console:'Counter dining · add stools',chef_bar:'Chef-side dining · add stools',toilet:'Needs privacy and a door',handwash_sink:'A basin for your guests'};
function BuildSymbol({tool}:{tool:ConstructionTool}){
 return <svg viewBox="0 0 52 36" width="52" height="36" aria-hidden="true"><path d="M4 28 24 34 48 25 28 19Z" fill="#e4dfcc"/>{tool==='select'?<path d="m20 4 0 23 6-6 5 9 5-3-5-8 9-1Z" fill="#3f7060"/>:tool==='erase'?<><path d="m10 22 20-15 12 9-20 15Z" fill="#c47764"/><path d="m26 10 12 13" stroke="#fff4df" strokeWidth="5"/></>:tool==='entrance'?<><path d="M14 29V7h23v20" fill="none" stroke="#986747" strokeWidth="4"/><path d="M23 29V13l-9-6v22" fill="#bf8c63"/></>:<><path d={`M7 27V${tool==='half_wall'?18:7}l36-5v22Z`} fill={tool==='glass'||tool==='window'?'#b7d5d1':tool==='screen'?'#bb9572':'#ead8b6'} stroke="#9e8769" strokeWidth="1.5"/>{['door','staff_gate','window'].includes(tool)&&<path d={tool==='window'?'M17 12 34 9v11l-17 3Z':'M21 26V12l14-2v15'} fill="#6f9c8c" stroke="#fff4df" strokeWidth="2"/>}{tool==='screen'&&[15,23,31,39].map(x=><path key={x} d={`M${x} 7v18`} stroke="#795739" strokeWidth="2"/>)}</>}</svg>;
}

export default function FreeRoomEditor({state:original,draft,selected,onSelect,onFind,onDraft,onCancel,onConfirm,onUndo,onRedo,onRehearse,tool,onTool,overhead,onOverhead,instruction,onFloorFinish,onSaveDraft,onRestore,onSaveDesign,initialStorage=false,onCollectionRooms}:RoomEditorProps&BuildControls){
 const [tab,setTab]=useState<'Furniture'|'Build'|'Finishes'|'Storage'>(initialStorage?'Storage':'Furniture'),[details,setDetails]=useState(false),[category,setCategory]=useState('seating'),[storage,setStorage]=useState<'pieces'|'rooms'>('pieces'),[group,setGroup]=useState<string[]>([]);
 const contentRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{contentRef.current?.scrollTo(0,0);},[tab,details,selected,storage]);
 const quote=quoteRoomPurchases(original,draft),state=quote.owned,p=draft.roomPlan,problem=roomDraftProblem(original,draft),error=problem?.message??null;
 const module=p.modules.find(m=>m.id===selected),item=draft.layout.find(m=>m.id===selected),edge=p.edges.find(e=>`edge:${e.id}`===selected),entry=p.entrances?.find(e=>`entrance:${e.id}`===selected),chair=roomChairSelection(selected);
 const title=selected?roomPieceLabel(draft,selected):null;
 const selectedPurchase=!!(draft.purchases?.[item?.equipmentId??'']||module&&draft.purchases?.[`fixture/${module.kind}/${module.id}`]);
 const table=!!(module&&['chef_bar','console'].includes(module.kind)||item&&['table_1','table_2','table_4','booth_2'].includes(item.equipmentId)),mode=p.seating?.[selected??'']?.mode??'waiter';
 const storedFixtures=Object.entries(state.home.fixtureInventory??{}).filter(([id])=>!p.modules.some(m=>m.id===id));
 const spare=(id:string)=>(state.equipment[id]?.homeCopies??state.decorOwned[id]??0)-draft.layout.filter(p=>p.equipmentId===id).length;
 const stock=[...Object.keys(state.equipment),...Object.keys(state.decorOwned)].filter(id=>spare(id)>0);
 const choose=(id:string)=>{onTool('select');onSelect(id);if(id)onFind(id);setDetails(false);};
 const add=(id:string,buy=false)=>{
  if(spare(id)>0)buy=false;
  const next={...draft,purchases:buy?{...draft.purchases,[id]:(draft.purchases?.[id]??0)+1}:draft.purchases};
  if(quoteRoomPurchases(original,next).error)return;
  let suffix=1;while(draft.layout.some(p=>p.id===`placed-${id}-${suffix}`))suffix++;
  const placed=`placed-${id}-${suffix}`,placement=createPlacementDraft(roomDesignPreview(original,next),'home',id,placed),{x,y,rotation,mount}=placement;
  onDraft({...next,layout:[...draft.layout,{id:placed,equipmentId:id,x,y,rotation,...(mount?{mount}:{})}]});choose(placed);
 };
 const store=()=>{if(selected&&!chair)onDraft(storeRoomPiece(draft,selected.replace(/^edge:/,'')));onSelect(null);};
 const addFixture=(kind:RoomModuleKind)=>{
  const stored=storedFixtures.find(([,m])=>m.kind===kind);let id=stored?.[0],next=draft;
  if(!id){let n=1;while(state.home.fixtureInventory?.[`draft-fixture-${kind}-${n}`])n++;id=`draft-fixture-${kind}-${n}`;next={...draft,purchases:{...draft.purchases,[`fixture/${kind}/${id}`]:1}};}
  const placed=addStoredRoomFixture(next,id,kind,stored?.[1].condition??100,stored?.[1].width);
  onDraft(kind==='chef_bar'?setRoomSeating(placed,id,'chef'):placed);choose(id);
 };
 const addStool=(style:StoolStyle)=>{if(!module)return;const installed=p.modules.flatMap(roomSeatStyles).filter(s=>s===style).length,buy=installed>=(state.home.stools?.[style]??0);onDraft({...draft,purchases:buy?{...draft.purchases,[`stool/${style}`]:(draft.purchases?.[`stool/${style}`]??0)+1}:draft.purchases,roomPlan:{...p,modules:p.modules.map(m=>m.id===module.id?{...m,seatStyles:[...roomSeatStyles(m),style]}:m)}});};
 const goods=[...HOME_EQUIPMENT.filter(e=>spare(e.id)>0||!homeEquipmentPurchaseError(state,e.id)).map(e=>({id:e.id,name:e.name,category:e.id.startsWith('table_')||e.id==='booth_2'?'seating':'kitchen'})),...DECOR.filter(d=>!d.memento&&!d.collectible&&roomCollectionVisible(d.id,'decor',original.decorOwned[d.id]??0)).map(d=>({id:d.id,name:d.name,category:d.setId==='build'?'build':d.id.includes('lamp')||d.id.includes('sconce')||d.ceiling?'lighting':d.setId==='garden'||d.id.includes('plant')||d.id.includes('pot')?'plants':'details'}))].filter(d=>d.category===category);
 const bathroomAdvice=module?.kind==='toilet'&&!privateRestroom(p,{x:module.x+(module.rotation===3?1:module.rotation===1?-1:0),y:module.y+(module.rotation===0?1:module.rotation===2?-1:0)})?'This toilet needs privacy and a door. You can still open.':null;
 const status=(error?`${problem?.targetId?roomPieceLabel(draft,problem.targetId)+' · ':''}${error}`:null)??(quote.cost>original.coins?`You need ${(quote.cost-original.coins).toLocaleString()} more coins.`:null)??bathroomAdvice??(!details&&tab==='Finishes'&&tool==='select'?'Preview only · purchases join the Apply total.':chair?'Tap a tile beside its table to move this chair.':instruction);
 return <section className={styles.panel} aria-label="Build your restaurant">
  <nav aria-label="Decorating categories">{(['Furniture','Build','Finishes','Storage'] as const).map(name=><button key={name} aria-pressed={!details&&tab===name} onClick={()=>{setTab(name);setDetails(false);onTool('select');if(name!=='Finishes')onSelect(null);}}>{name}</button>)}<button className={styles.close} onClick={onCancel} aria-label="Cancel building">×</button></nav>
  <div className={styles.content} ref={contentRef}>
   {details?<>
    <h2 className={styles.title}>Layout tools</h2>
    <div className={styles.tools}><button disabled={!onRedo} onClick={onRedo}>Redo</button>{onRehearse&&<button onClick={onRehearse}>Try layout</button>}{onSaveDraft&&<button onClick={onSaveDraft}>Save unfinished draft</button>}{onRestore&&<button onClick={onRestore}>Preview starter design</button>}</div>
    <label className={styles.field}>Find in room<select value={selected??''} onChange={e=>choose(e.target.value)}><option value="">Choose a piece</option>{p.modules.map(m=><option key={m.id} value={m.id}>{roomFixtureLabel(m.kind)}</option>)}{draft.layout.map(m=><option key={m.id} value={m.id}>{EQUIPMENT_BY_ID[m.equipmentId]?.name??DECOR_BY_ID[m.equipmentId]?.name}</option>)}</select></label>
    <details><summary>Move several pieces</summary>{[...p.modules.map(m=>({id:m.id,name:roomFixtureLabel(m.kind)})),...draft.layout.filter(m=>!m.mount).map(m=>({id:m.id,name:EQUIPMENT_BY_ID[m.equipmentId]?.name??DECOR_BY_ID[m.equipmentId]?.name}))].map(m=><label className={styles.groupPick} key={m.id}><input type="checkbox" checked={group.includes(m.id)} onChange={e=>setGroup(e.target.checked?[...group,m.id]:group.filter(id=>id!==m.id))}/>{m.name}</label>)}<div className={styles.tools}>{[['Left',-1,0],['Right',1,0],['Up',0,-1],['Down',0,1]].map(([name,x,y])=><button key={name} disabled={!group.length} onClick={()=>onDraft(transformRoomGroup(draft,group,Number(x),Number(y)))}>{name}</button>)}<button disabled={!group.length} onClick={()=>onDraft(transformRoomGroup(draft,group,0,0,true))}>Rotate group</button></div><p className={styles.note}>Countertop decorations move with their furniture.</p></details>
   </>:<>
    {selected&&tab!=='Finishes'?<>
     <div className={styles.selection}>{(item||module||chair)&&<ModelIcon kind={chair?'chair':item?.equipmentId??module!.kind} label="" size={48}/>}<strong>{title??'Selected piece'}</strong><button onClick={()=>onSelect(null)} aria-label="Back to browsing">←</button></div>
     {chair?<><button onClick={()=>choose(chair.tableId)}>Select its table</button><p className={styles.note}>This chair belongs to the table. Move or store the whole set by selecting its table.</p></>:<>
      <div className={styles.tools}>{(item&&!item.mount||module||entry)&&<button onClick={()=>onDraft(rotateRoomDraft(draft,selected))}>Rotate</button>}{!entry&&<button onClick={store}>{selectedPurchase?'Remove preview':'Store'}{draft.layout.some(i=>i.mount?.targetId===selected)?' & attached décor':''}</button>}</div>
      {table&&<label className={styles.field}>Service<select value={mode} onChange={e=>onDraft(setRoomSeating(draft,selected,e.target.value as 'waiter'|'pickup'|'chef'))}><option value="waiter">Waiter</option><option value="pickup">Customer pickup</option>{module?.kind==='chef_bar'&&<option value="chef">Chef-side dining</option>}</select></label>}
      {item&&table&&item.equipmentId!=='booth_2'&&<div className={styles.tools}>{freeRoomSeats(p,item).map((_,i)=><button key={i} onClick={()=>choose(`chair:${item.id}:${i}`)}>Move chair {i+1}</button>)}</div>}
      {module&&['console','chef_bar'].includes(module.kind)&&<div className={styles.tools}>{(['classic','diner'] as const).map(style=><button key={style} disabled={roomSeatStyles(module).length>=ROOM_FIXTURES[module.kind].capacity} onClick={()=>addStool(style)}>Add {style==='classic'?'classic':'upholstered'} stool · {p.modules.flatMap(roomSeatStyles).filter(s=>s===style).length<(state.home.stools?.[style]??0)?'stored':RENOVATION_RULES.stoolPrices[style]+' coins'}</button>)}{!!roomSeatStyles(module).length&&<button onClick={()=>onDraft({...draft,roomPlan:{...p,modules:p.modules.map(m=>m.id===module.id?{...m,seatStyles:roomSeatStyles(m).slice(0,-1)}:m)}})}>Store last stool</button>}</div>}
      {table&&mode==='pickup'&&<label className={styles.field}>Collect from<select value={p.seating?.[selected!]?.pointId??''} onChange={e=>onDraft(setRoomSeating(draft,selected!,'pickup',e.target.value))}><option value="">Choose a counter</option>{p.modules.filter(m=>['display_counter','service_hatch','internal_pass'].includes(m.kind)).map(m=><option key={m.id} value={m.id}>{roomFixtureLabel(m.kind)} · {m.x+1}, {m.y+1}</option>)}</select></label>}
     </>}
    </>:<>
     {tab==='Furniture'&&<><label className={styles.field}>Browse<select value={category} onChange={e=>setCategory(e.target.value)}>{[['seating','Tables & chairs'],['build','Counters & waiting areas'],['plants','Plants'],['lighting','Lighting'],['details','Finishing touches'],['kitchen','Kitchen equipment']].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><div className={styles.goods}>{goods.map(g=>{const stored=spare(g.id)>0,price=stored?quote:quoteRoomPurchases(original,{...draft,purchases:{...draft.purchases,[g.id]:(draft.purchases?.[g.id]??0)+1}});return <button key={g.id} disabled={!!price.error} onClick={()=>add(g.id,true)}><ModelIcon kind={g.id} label="" size={56}/><span>{g.name}<small>{stored?'Stored · place it':`${(price.cost-quote.cost).toLocaleString()} coins · preview`}</small></span></button>;})}</div></>}
     {tab==='Build'&&<><div className={styles.buildTools}>{buildTools.map(t=><button key={t} aria-pressed={tool===t} onClick={()=>{onTool(t);onSelect(null);}}><BuildSymbol tool={t}/><span>{toolNames[t]??t[0].toUpperCase()+t.slice(1)}</span></button>)}</div><h2 className={styles.title}>Counters & bathroom</h2><div className={styles.goods}>{(Object.keys(BUILD_FIXTURE_PRICES) as RoomModuleKind[]).map(kind=><button key={kind} onClick={()=>addFixture(kind)}><ModelIcon kind={kind} label="" size={64}/><span>{roomFixtureLabel(kind)}<small>{fixtureHints[kind]}</small><small>{storedFixtures.some(([,m])=>m.kind===kind)?'Stored · place it':`${BUILD_FIXTURE_PRICES[kind].toLocaleString()} coins · preview`}</small></span></button>)}</div></>}
     {tab==='Finishes'&&<EditorFinishes state={original} draft={draft} selected={selected} onDraft={onDraft} onTool={onTool} onFloorFinish={onFloorFinish}/>}
     {tab==='Storage'&&<>{onCollectionRooms&&<button onClick={onCollectionRooms}>Collection restaurants</button>}<div className={styles.segment}><button aria-pressed={storage==='pieces'} onClick={()=>setStorage('pieces')}>Stored pieces</button><button aria-pressed={storage==='rooms'} onClick={()=>setStorage('rooms')}>Saved rooms</button></div>{storage==='rooms'?<EditorSavedRooms state={original} draft={draft} onDraft={next=>{onDraft(next);onSelect(null);}} onSave={onSaveDesign} error={error}/>:<div className={styles.goods}>{storedFixtures.map(([id,m])=><button key={id} onClick={()=>{onDraft(addStoredRoomFixture(draft,id,m.kind,m.condition,m.width));choose(id);}}><ModelIcon kind={m.kind} label="" size={56}/><span>{roomFixtureLabel(m.kind)}<small>Stored · place it</small></span></button>)}{stock.map(id=><button key={id} onClick={()=>add(id)}><ModelIcon kind={id} label="" size={56}/><span>{EQUIPMENT_BY_ID[id]?.name??DECOR_BY_ID[id]?.name}<small>{spare(id)} in storage</small></span></button>)}{!storedFixtures.length&&!stock.length&&<p>Everything you own is in the room.</p>}</div>}</>}
    </>}
   </>}
  </div>
  <div className={`${styles.feedback} ${error||quote.cost>original.coins?styles.error:''}`}><p role="status" className={styles.status}>{status}</p>{problem?.targetId&&<button onClick={()=>choose(problem.targetId!)}>Show</button>}</div>
  <footer><button onClick={onOverhead} aria-pressed={overhead}>{overhead?'3D view':'Overhead'}</button><button disabled={!onUndo} onClick={onUndo} aria-label="Undo building change">↶</button><button aria-pressed={details} onClick={()=>setDetails(!details)}>Tools</button><button className={styles.apply} disabled={!!error||quote.cost>original.coins} onClick={onConfirm}>Apply{quote.cost?<small>{quote.cost.toLocaleString()} coins</small>:null}</button></footer>
 </section>;
}
