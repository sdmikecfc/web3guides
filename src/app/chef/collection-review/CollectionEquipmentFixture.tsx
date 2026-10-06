'use client';
import { useState } from 'react';
import { DOMAIN_COLLECTIBLES, type DomainId } from '@/lib/chef/diner/domain-worlds';
import { attachVerifiedCollectionRoom } from '@/lib/chef/gacha/room-reward';
import { createDiner, dispatchDiner } from '@/lib/chef/diner/progression';
import { EQUIPMENT_BY_ID } from '@/lib/chef/diner/content';
import { equipmentDestinationError, equipmentSkinOverlays, type EquipmentDestination, type EquipmentInventory } from '@/lib/chef/gacha/equipment-ownership';
import { CollectionDisplay, type CollectionDisplayPreview, type DisplayPick } from '../diner-preview/CollectionDisplay';
import { CollectionEquipment, type EquipmentSkinPreview } from '../diner-preview/CollectionEquipment';
import { quietRestaurantScene } from '../diner-preview/quiet-view';
import { ControlPreferencesProvider } from '../diner-preview/ControlPreferences';
import DinerScene from '../diner-preview/DinerScene';
import css from '../diner-preview/diner.module.css';
const now = 1800000000000, wallet = '0x1111111111111111111111111111111111111111';
/** Synthetic, memory-only ownership. No real signatures, API calls or saves. */
export default function CollectionEquipmentFixture({ domain }: { domain: DomainId }) {
  const [state,setState] = useState(() => {
    const earned = attachVerifiedCollectionRoom(createDiner(now, 'isolated-equipment-review'), {
      version: 1, source: 'verified-openings', wallet, domain, catalogueVersion: 3,
      receiptId: `collection:${domain}:v3:${wallet}`, earnedAt: now, checkedAt: now,
    }, wallet, domain);
    const room = dispatchDiner(earned, { type: 'applyDomainRoom', domain }, { now }).state;
    const hero = DOMAIN_COLLECTIBLES.find(i => i.domain === domain && i.hero && i.machine && EQUIPMENT_BY_ID[i.machine]);
    if (hero?.machine && !room.home.layout.some(p => p.equipmentId === hero.machine)) {
      room.equipment[hero.machine] = { tier: 1, homeCopies: 1, truckOwned: false };
      room.home.layout.push({ id: 'sample-hero-machine', equipmentId: hero.machine, x: 1, y: 0, rotation: 0 });
    }
    return room;
  });
  const [inventory, setInventory] = useState<EquipmentInventory>(() => ({ domain, ready: true, revision: '0', checkpoint: { block: '1', hash: `0x${'1'.repeat(64)}`, timestamp: now },
    items: DOMAIN_COLLECTIBLES.filter(i => i.domain === domain).sort((a, b) => Number(!!EQUIPMENT_BY_ID[b.machine!]) - Number(!!EQUIPMENT_BY_ID[a.machine!]) || Number(b.hero) - Number(a.hero)).map((i, n) => ({ tokenId: String(n + 1), itemId: i.id, catalogueVersion: 3, destination: null })),
  }));
  const [open, setOpen] = useState(true), [preview, setPreview] = useState<EquipmentSkinPreview | null>(null), [status, setStatus] = useState('');
  const [display,setDisplay]=useState(false),[displayPreview,setDisplayPreview]=useState<CollectionDisplayPreview|null>(null),[pick,setPick]=useState<DisplayPick|null>(null);
  const scene = quietRestaurantScene(state), overlays = equipmentSkinOverlays(state, inventory, 'home');
  scene.decoratingCatalogue = open||display; scene.people = []; scene.selectedId = preview?.destination.id ?? null;
  scene.objects = scene.objects.map(o => ({ ...o, appearance: overlays[o.id] ?? o.appearance }));
  if (preview?.destination.location === 'home') { const o = scene.objects.find(o => o.id === preview.destination.id); if (o) o.appearance = preview.itemId; }
  if(display&&displayPreview){scene.objects=scene.objects.filter(o=>o.id!==displayPreview.object.id);scene.placement={object:displayPreview.object,surfaces:displayPreview.surfaces,valid:displayPreview.valid};}
  const assign = async (token: string, destination: EquipmentDestination | null) => {
    const item = inventory.items.find(i => i.tokenId === token); if (!item) return false;
    if (destination && equipmentDestinationError(state, item.itemId, destination)) return false;
    setInventory(i => ({ ...i, revision: String(Number(i.revision) + 1), items: i.items.map(a => a.tokenId === token ? { ...a, destination } : a) }));
    setStatus(destination ? 'Sample appearance applied. Cooking and the player save are unchanged.' : 'Sample appearance removed.'); return true;
  };
  return <ControlPreferencesProvider><main className={css.game}>
    <DinerScene mode="home" scene={scene} rotation={0} showWorldHints={false} editing={display} onTarget={()=>{}} onTile={(x,y)=>setPick({serial:Date.now(),x,y})} onMountSurface={surface=>setPick({serial:Date.now(),x:surface.x,y:surface.y,surface})}/>
    <div style={{ position: 'absolute', zIndex: 10, padding: 10, maxWidth: 'calc(100% - 20px)', fontSize: 11 }}><p style={{margin:'0 0 6px'}}>ISOLATED REVIEW · Sample ownership · No saved progress</p><button className={css.button} style={{fontSize:12,padding:8}} onClick={() => setOpen(true)}>Equipment appearances</button>
      <button className={css.button} style={{fontSize:12,padding:8}} onClick={() => { setInventory(i => ({ ...i, items: i.items.filter(a => !a.destination) })); setStatus('Sample transfer: assigned items left the wallet. Original machines remain.'); }}>Simulate transfer</button>{status && <p role="status">{status}</p>}</div>
    {display&&<CollectionDisplay state={state} fixture owned={{inventory,eligible:true,busy:false,status:"",connected:true,pending:false,connect:async()=>{},refresh:async()=>true,retry:async()=>true,assign}} pick={pick} preview={setDisplayPreview} send={command=>{const r=dispatchDiner(state,command,{now});if(r.error){setStatus(r.error);return false;}setState(r.state);return true;}} close={()=>{setDisplay(false);setDisplayPreview(null);setPick(null);}}/>}
    {open && <CollectionEquipment display={()=>{setOpen(false);setPreview(null);setDisplay(true);}} state={state} domain={domain} fixture preview={setPreview} close={() => { setOpen(false); setPreview(null); }} owned={{ inventory, eligible: true, busy: false, status: '', connected: true, pending: false, connect: async () => {}, refresh: async () => true, retry: async () => true, assign }}/>}
  </main></ControlPreferencesProvider>;
}
