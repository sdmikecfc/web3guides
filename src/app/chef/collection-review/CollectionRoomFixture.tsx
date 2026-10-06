'use client';
import { useState } from 'react';
import { DOMAIN_IDS, type DomainId } from '@/lib/chef/diner/domain-worlds';
import { attachVerifiedCollectionRoom } from '@/lib/chef/gacha/room-reward';
import { createDiner, dispatchDiner, type DinerCommand } from '@/lib/chef/diner/progression';
import { CollectionRestaurant } from '../diner-preview/CollectionRestaurant';
import { ControlPreferencesProvider } from '../diner-preview/ControlPreferences';
import { FurnishingCatalog } from '../diner-preview/FurnishingCatalog';
import DinerScene from '../diner-preview/DinerScene';
import { quietRestaurantScene } from '../diner-preview/quiet-view';
import css from '../diner-preview/diner.module.css';
const now = 1800000000000, wallet = '0x1111111111111111111111111111111111111111';
/** Memory-only presentation fixture. No API, wallet signature or browser save. */
export default function CollectionRoomFixture({ domain }: { domain: DomainId }) {
  const [state, setState] = useState(() => DOMAIN_IDS.reduce((s, d) => attachVerifiedCollectionRoom(s, {
    version: 1, source: 'verified-openings', wallet, domain: d, catalogueVersion: 3,
    receiptId: `collection:${d}:v3:${wallet}`, earnedAt: now, checkedAt: now,
  }, wallet, d), createDiner(now, 'isolated-collection-room-review')));
  const [open, setOpen] = useState(true), [storage, setStorage] = useState(false), [message, setMessage] = useState('');
  const send = (command: DinerCommand) => {
    const result = dispatchDiner(state, command, { now });
    if (result.error) { setMessage(result.error); return false; }
    setState(result.state); setMessage('Sample layout updated. No player save was changed.'); return true;
  };
  return <ControlPreferencesProvider><main className={css.game}>
    <DinerScene mode="home" scene={quietRestaurantScene(state)} rotation={0} showWorldHints={false} onTarget={()=>{}} onTile={()=>{}}/>
    <div style={{ position: 'absolute', zIndex: 10, padding: 16 }}><p>ISOLATED REVIEW · Sample rewards · No saved progress</p><button className={css.button} onClick={() => { setOpen(true); setStorage(false); }}>Preview collection restaurants</button>{message && <p role="status">{message}</p>}</div>
    {open && <CollectionRestaurant state={state} send={send} reviewDomain={domain} fixture close={() => setOpen(false)} decorate={() => { setOpen(false); setStorage(true); }}/>} 
    {storage && <div style={{ position: 'absolute', inset: '20% 10%', overflow: 'auto', background: '#fff8ea', padding: 24 }}><button className={css.button} onClick={() => setStorage(false)}>Close sample storage</button><p>The earned room pieces are ready in storage. Actual placement uses the restaurant editor.</p><FurnishingCatalog state={state} send={send} place={() => setMessage('Storage preview only. Place pieces in the connected restaurant editor.')} moreStyle={() => {}} onGrow={() => {}} onCook={() => {}}/></div>}
  </main></ControlPreferencesProvider>;
}
