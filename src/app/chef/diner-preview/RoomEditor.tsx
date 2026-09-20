'use client';
import type { DinerState } from '../../../lib/chef/diner/progression';
import { ROOM_FIXTURES, RESTAURANT_STAGES } from '../../../lib/chef/diner/room-plan';
import { RENOVATION_RULES } from '../../../lib/chef/diner/renovation';
import { addStoredRoomFixture, rotateRoomDraft, validateRoomDraft, type RoomDraft } from './room-editor';
import styles from './finish-preview.module.css';

export interface RoomEditorProps {state:DinerState;draft:RoomDraft;selected:string|null;onSelect:(id:string|null)=>void;onDraft:(draft:RoomDraft)=>void;onCancel:()=>void;onConfirm:()=>void;onBuy:(kind:'toilet'|'handwash_sink'|'chef_bar')=>void}
export function RoomEditor({state,draft,selected,onSelect,onDraft,onCancel,onConfirm,onBuy}:RoomEditorProps){
 const error=validateRoomDraft(state,draft),module=draft.roomPlan.modules.find(m=>m.id===selected),zone=draft.roomPlan.zones.find(z=>`zone:${z.id}`===selected),inventory=state.home.fixtureInventory??{},stored=Object.entries(inventory).filter(([id])=>!draft.roomPlan.modules.some(m=>m.id===id));
 const select=(id:string)=>{if(id.startsWith('stored:')){const key=id.slice(7),owned=inventory[key];if(owned){onDraft(addStoredRoomFixture(draft,key,owned.kind,owned.condition));onSelect(key);}}else onSelect(id||null);};
 const stage=RESTAURANT_STAGES[draft.roomPlan.stage];
 return <section className={styles.panel} aria-label="Arrange restaurant structure">
  <div className={styles.heading}><div><strong>Shape your restaurant</strong><small>{zone?'Tap where this area’s top-left corner should go.':module?'Tap the floor to move it. Rotate before confirming.':'Choose a counter, fixture or area to move.'}</small></div><button type="button" onClick={onCancel} aria-label="Cancel room changes">×</button></div>
  <div className={styles.row} style={{gap:8,flexWrap:'wrap'}}>
   <label style={{flex:'1 1 190px',minWidth:0,fontSize:11}}>Move <select aria-label="Room piece or area" value={selected??''} onChange={e=>select(e.target.value)} style={{display:'block',width:'100%',minHeight:44,marginTop:4,border:'1px solid #dec9a7',borderRadius:10,background:'#fffaf0',padding:'8px 10px',color:'inherit'}}><option value="">Choose a piece</option><optgroup label="Placed pieces">{draft.roomPlan.modules.map(m=><option key={m.id} value={m.id}>{ROOM_FIXTURES[m.kind].name}{m.condition!==undefined?` · ${Math.round(m.condition)}%`:''}</option>)}</optgroup><optgroup label="Move an entire area">{draft.roomPlan.zones.map(z=><option key={z.id} value={`zone:${z.id}`}>{z.kind==='kitchen'?'Kitchen':z.kind==='bathroom'?'Bathroom':'Dining area'} · {z.w} × {z.h}</option>)}</optgroup>{stored.length>0&&<optgroup label="In storage">{stored.map(([id,item])=><option key={id} value={`stored:${id}`}>{ROOM_FIXTURES[item.kind].name} · stored</option>)}</optgroup>}</select></label>
   <div className={styles.tabs}><button type="button" disabled={!module} onClick={()=>onDraft(rotateRoomDraft(draft,selected))}>Rotate</button>{module&&(module.kind==='toilet'||module.kind==='handwash_sink'||(module.kind==='chef_bar'&&draft.roomPlan.stage==='restaurant'))&&<button type="button" onClick={()=>{onDraft({...draft,roomPlan:{...draft.roomPlan,modules:draft.roomPlan.modules.filter(m=>m.id!==module.id)}});onSelect(null);}}>Store</button>}</div>
  </div>
  <div className={styles.row} style={{gap:6,flexWrap:'wrap',margin:'6px 0'}}>{(['toilet','handwash_sink'] as const).map(kind=>{const count=Object.values(inventory).filter(m=>m.kind===kind).length,price=RENOVATION_RULES.fixturePrices[kind];return <button key={kind} type="button" className={styles.cancel} disabled={count>=stage.bathroomBays||state.coins<price} onClick={()=>onBuy(kind)} style={{minHeight:44,border:'1px solid #dec9a7',borderRadius:10,padding:'6px 10px',fontSize:11}}>{kind==='toilet'?'Add toilet':'Add hand basin'} · {price} coins <span style={{opacity:.65}}>({count}/{stage.bathroomBays})</span></button>;})}</div>
  {draft.roomPlan.stage==='restaurant'&&!Object.values(inventory).some(m=>m.kind==='chef_bar')&&<div className={styles.tabs}><button disabled={state.coins<RENOVATION_RULES.fixturePrices.chef_bar} onClick={()=>onBuy('chef_bar')}>Buy a standalone bar · {RENOVATION_RULES.fixturePrices.chef_bar} coins</button></div>}
  {error&&<p className={styles.error} role="status">{error}</p>}
  <div className={styles.footer}><span>{error?'Adjust the preview to keep paths clear.':'Changes stay in preview until you confirm.'}</span><button type="button" className={styles.cancel} onClick={onCancel}>Cancel</button><button type="button" className={styles.apply} disabled={!!error} onClick={onConfirm}>Confirm</button></div>
 </section>;
}
