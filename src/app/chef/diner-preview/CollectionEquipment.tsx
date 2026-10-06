'use client';
import { useEffect, useState } from 'react';
import { DOMAIN_COLLECTIBLE_BY_ID, DOMAIN_WORLDS, type DomainId } from '@/lib/chef/diner/domain-worlds';
import { EQUIPMENT_BY_ID } from '@/lib/chef/diner/content';
import { atRestaurant, type DinerState } from '@/lib/chef/diner/progression';
import { equipmentDestinations, type EquipmentDestination } from '@/lib/chef/gacha/equipment-ownership';
import type { CollectionEquipmentController } from './useCollectionEquipment';
import { loadDomainStudy } from './domain-assets';
import { ModelIcon } from './ModelIcon';
import { DinerModal } from './DinerModal';
import css from './diner.module.css';
import styles from './collection-equipment.module.css';

export interface EquipmentSkinPreview { destination: EquipmentDestination; itemId: string }
export function CollectionEquipment({ state, domain, owned, preview, close, display, fixture = false }: {
  state: DinerState; domain: DomainId; owned: CollectionEquipmentController;
  preview(value: EquipmentSkinPreview | null): void; close(): void; display?():void; fixture?: boolean;
}) {
  const [token, setToken] = useState(''), [targetId, setTargetId] = useState('');
  const location = atRestaurant(state) ? 'home' : 'truck';
  const [ready, setReady] = useState<string | null>(null), [artError, setArtError] = useState(false), [retry, setRetry] = useState(0);
  const items = owned.inventory?.items.filter(i => DOMAIN_COLLECTIBLE_BY_ID[i.itemId]?.machine) ?? [];
  const groups = [...new Set(items.map(i => i.itemId))].map(id => ({ id, copies: items.filter(i => i.itemId === id) }));
  const selected = items.find(i => i.tokenId === token) ?? items[0], item = selected && DOMAIN_COLLECTIBLE_BY_ID[selected.itemId];
  const targets = equipmentDestinations(state, location).filter(t => t.kind === item?.machine), target = targets.find(t => t.id === targetId) ?? targets[0];
  useEffect(() => {
    let active = true; setReady(null); setArtError(false);
    if (item) void loadDomainStudy(item.id).then(() => { if (active) setReady(item.id); }).catch(() => { if (active) setArtError(true); });
    return () => { active = false; };
  }, [item?.id, retry]);
  const targetKey = JSON.stringify(target);
  useEffect(() => { preview(item && ready === item.id && target ? { itemId: item.id, destination: target } : null); return () => preview(null); }, [item?.id, ready, targetKey, preview]);
  return <DinerModal title="Dress your equipment" eyebrow={fixture ? 'Isolated review · sample ownership' : `${DOMAIN_WORLDS[domain].name} · owned collectibles`} roomVisible onClose={close}
    footer={<>{selected?.destination && <button className={css.button} disabled={owned.busy || owned.pending} onClick={async () => { if (await owned.assign(selected.tokenId, null)) close(); }}>Remove appearance</button>}<button className={css.primary} disabled={!selected || !target || ready !== item?.id || owned.busy || owned.pending} onClick={async () => { if (await owned.assign(selected!.tokenId, target!)) close(); }}>{owned.busy ? 'Saving…' : 'Apply appearance'}</button></>}>
    <p className={styles.explanation}>Same speed, capacity and recipes.</p>
    {display && atRestaurant(state) && <button className={css.button} onClick={display}>Place as decoration</button>}
    {!owned.connected ? <><p className={css.small}>Sign a message to check what you own. No transaction or spending permission.</p><button className={css.primary} disabled={!owned.eligible || owned.busy} onClick={() => void owned.connect()}>{owned.busy ? 'Checking…' : 'Check my collection'}</button></> : <>
      {owned.inventory && !owned.inventory.ready && <p>Ownership is catching up. Appearances stay hidden until it is ready.</p>}
      {owned.inventory?.ready && !items.length && <p>No equipment appearances in this wallet yet. Decorations stay in your collection.</p>}
      {!!items.length && <>
        <div className={styles.feature}><ModelIcon kind={item!.id} label={item!.name} size={108}/><div><h3>{item!.name}</h3><small>One copy, one machine at a time.</small></div></div>
        <label className={styles.destination}>{location === 'home' ? 'Restaurant machine' : 'Truck machine'}<select value={target?.id ?? ''} onChange={e => setTargetId(e.target.value)}>{!targets.length && <option value="">No compatible machine placed</option>}{targets.map((t, i) => <option key={t.id} value={t.id}>{EQUIPMENT_BY_ID[t.kind]?.name ?? t.kind} · {i + 1}</option>)}</select></label>
        {!target && <p>{EQUIPMENT_BY_ID[item!.machine!] ? `Place or load a ${EQUIPMENT_BY_ID[item!.machine!].name} first. This appearance does not grant equipment.` : 'This machine is part of the upcoming domain kitchens. You can inspect its collectible here.'}</p>}
        {artError ? <button className={css.button} onClick={() => setRetry(r => r + 1)}>Retry item preview</button> : ready !== item?.id && <p role="status">Loading your item…</p>}
        {items.filter(i => i.itemId === item!.id).length > 1 && <label className={styles.destination}>Owned copy<select value={selected!.tokenId} onChange={e => setToken(e.target.value)}>{items.filter(i => i.itemId === item!.id).map((i, n) => <option key={i.tokenId} value={i.tokenId}>Copy {n + 1} · {i.destination ? `In use in ${i.destination.location === 'home' ? 'restaurant' : 'truck'}` : 'Available'}</option>)}</select></label>}
        <h3>Choose an appearance</h3><div className={styles.items} aria-label="Owned equipment appearances">{groups.map(group => <button key={group.id} aria-pressed={group.id === item?.id} onClick={() => setToken((group.copies.find(i => !i.destination) ?? group.copies[0]).tokenId)}><ModelIcon kind={group.id} label="" size={72}/><span>{DOMAIN_COLLECTIBLE_BY_ID[group.id].name}<small>{group.copies.length} owned · {group.copies.filter(i => !!i.destination).length} in use</small></span></button>)}</div>
        <details className={styles.details}><summary>About this piece</summary><p>{item!.description}</p></details>
      </>}
      <details className={styles.details}><summary>Ownership & connection</summary><div className={styles.tools}><button className={css.button} disabled={owned.busy} onClick={() => void owned.refresh()}>Refresh ownership</button>{!fixture && <button className={css.quietLink} disabled={owned.busy} onClick={() => void owned.connect()}>Sign in again</button>}</div></details>
    </>}
    {owned.status && <p role="status">{owned.status}</p>}{owned.pending && <button className={css.button} disabled={owned.busy} onClick={() => void owned.retry()}>Retry unfinished change</button>}
  </DinerModal>;
}
