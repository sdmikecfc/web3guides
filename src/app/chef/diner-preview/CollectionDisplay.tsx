'use client';
import { useEffect, useState } from 'react';
import { DOMAIN_COLLECTIBLE_BY_ID } from '@/lib/chef/diner/domain-worlds';
import { hasDomainArtStudy } from '@/lib/chef/diner/domain-art-studies';
import { displaySpotKind } from '@/lib/chef/diner/collection-display-spots';
import { atRestaurant, type DinerCommand, type DinerState, type HomePlacement } from '@/lib/chef/diner/progression';
import { equipmentRoomKey, type EquipmentDestination } from '@/lib/chef/gacha/equipment-ownership';
import type { CollectionEquipmentController } from './useCollectionEquipment';
import { createPlacementDraft, homeMountSurfaces, previewPlacement, rotatePlacementDraft, type PlacementDraft } from './placement-preview';
import type { SceneMountSurface, SceneObject } from './scene-types';
import { loadDomainStudy } from './domain-assets';
import { ModelIcon } from './ModelIcon';
import { DinerModal } from './DinerModal';
import css from './diner.module.css';
import styles from './collection-equipment.module.css';

export type DisplayPick = { serial: number; x: number; y: number; surface?: SceneMountSurface };
export interface CollectionDisplayPreview { object: SceneObject; surfaces: SceneMountSurface[]; valid: boolean }
/** A draft grants nothing. The confirmed free support goes through normal layout
 * validation; the NFT itself is bound separately by the ownership API. */
export function CollectionDisplay({ state, owned, pick, preview, send, close, fixture = false }: {
  state: DinerState; owned: CollectionEquipmentController; pick: DisplayPick | null;
  preview(value: CollectionDisplayPreview | null): void; send(command: DinerCommand): boolean; close(): void; fixture?: boolean;
}) {
  const [token, setToken] = useState(''), [draft, setDraft] = useState<PlacementDraft | null>(null);
  const [ready, setReady] = useState(''), [artError, setArtError] = useState(false), [retry, setRetry] = useState(0);
  const [waiting, setWaiting] = useState<{ token: string; destination: EquipmentDestination } | null>(null);
  const [notice, setNotice] = useState('');
  const items = owned.inventory?.items ?? [], selected = items.find(i => i.tokenId === token) ?? items.find(i=>hasDomainArtStudy(i.itemId)) ?? items[0];
  const item = selected && DOMAIN_COLLECTIBLE_BY_ID[selected.itemId], kind = item && displaySpotKind(item);
  // The preview's one support is not NFT ownership and never leaves this component.
  const candidate = kind ? { ...state, decorOwned: { ...state.decorOwned, [kind]: (state.decorOwned[kind] ?? 0) + 1 } } : state;
  useEffect(() => {
    setNotice('');
    if (!selected || !kind || !state.home.roomPlan) { setDraft(null); return; }
    const bound = selected.destination?.display && selected.destination.room === equipmentRoomKey(state) && state.home.layout.find(p => p.id === selected.destination!.id && p.equipmentId === kind);
    setDraft(createPlacementDraft(candidate, 'home', kind, bound ? bound.id : `display-${crypto.randomUUID()}`, !!bound));
  }, [selected?.tokenId, kind, state.seed]);
  useEffect(() => {
    let current = true; setReady(''); setArtError(false);
    if (item) void loadDomainStudy(item.id).then(() => { if (current) setReady(item.id); }).catch(() => { if (current) setArtError(true); });
    return () => { current = false; };
  }, [item?.id, retry]);
  useEffect(() => {
    if (!pick) return;
    setDraft(d => !d ? d : pick.surface && d.mount && d.mount.kind === pick.surface.mount.kind ? { ...d, mount: pick.surface.mount, x: Math.floor(pick.surface.x), y: Math.floor(pick.surface.y), rotation: pick.surface.rotation, pinned: true } : !d.mount && !pick.surface ? { ...d, x: pick.x, y: pick.y, pinned: true } : d);
  }, [pick]);
  const result = draft ? previewPlacement(candidate, draft) : null;
  const placement = draft && result?.command.type === 'homeLayout' ? result.command.layout.find(p => p.id === draft.id) : undefined;
  const snapshot = JSON.stringify({ object: result?.object, error: result?.error, draft, item: item?.id, ready, layout: state.home.layout, plan: state.home.roomPlan });
  useEffect(() => {
    preview(result?.object && item && ready === item.id ? { object: { ...result.object, appearance: item.id }, valid: !result.error, surfaces: draft?.mount ? homeMountSurfaces(candidate, draft) : [] } : null);
    return () => preview(null);
  }, [snapshot, preview]);
  useEffect(() => {
    if (!waiting || !state.home.layout.some(p => p.id === waiting.destination.id && p.equipmentId === waiting.destination.kind)) return;
    setWaiting(null);
    setDraft(d=>d?{...d,existing:true}:d);
    void owned.assign(waiting.token, waiting.destination).then(ok => { if (ok) close(); else setNotice('Your display spot is saved. Retry the connection to add the collectible.'); });
  }, [waiting, state.home.layout, owned.assign, close]);
  const confirm = () => {
    if (!placement || result?.error || !selected || !item || ready !== item.id || !kind) return;
    if (!send({ type: 'placeCollectionDisplay', placement: placement as HomePlacement })) return;
    setWaiting({ token: selected.tokenId, destination: { room: equipmentRoomKey(state), location: 'home', id: placement.id, kind, display: true } });
  };
  const canPlace = atRestaurant(state) && !!state.home.roomPlan;
  return <DinerModal title="Place a collectible" eyebrow={fixture ? 'Isolated review · sample ownership' : 'Owned collection'} roomVisible interactiveRoom onClose={close}
    footer={<>{selected?.destination && <button className={css.button} disabled={owned.busy || owned.pending || !!waiting} onClick={async () => { if (await owned.assign(selected.tokenId, null)) close(); }}>Put away</button>}<button className={css.primary} disabled={!canPlace || !placement || !!result?.error || ready !== item?.id || owned.busy || owned.pending || !!waiting} onClick={confirm}>{owned.busy || waiting ? 'Placing…' : 'Place here'}</button></>}>
    {!owned.connected ? <><p>Check your collection to place a piece.</p><button className={css.primary} disabled={!owned.eligible || owned.busy} onClick={() => void owned.connect()}>Check my collection</button></> : <>
      {!canPlace ? <p>Return to your restaurant to place decorations.</p> : !items.length ? <p>{owned.inventory?.ready ? 'No collectibles in this wallet yet.' : 'Checking current ownership…'}</p> : <>
        <div className={styles.feature}><ModelIcon kind={item!.id} label={item!.name} size={96}/><div><h3>{item!.name}</h3><small>{item!.machine ? 'Decorative display · does not cook' : `${item!.mount} decoration`}</small></div></div>
        <p className={styles.explanation}>{draft?.mount ? `Tap a highlighted ${draft.mount.kind} spot.` : 'Tap a clear floor tile to move this piece.'}</p>
        {result?.error && <p role="status">{result.error}</p>}
        {artError ? <button className={css.button} onClick={() => setRetry(r => r + 1)}>Retry item preview</button> : ready !== item?.id && <p role="status">Loading your piece…</p>}
        <div className={styles.tools}><button className={css.button} disabled={!draft || !!draft.mount || !!waiting} onClick={() => setDraft(d => d ? rotatePlacementDraft(d) : null)}>Rotate</button></div>
        <label className={styles.destination}>Choose a piece<select disabled={!!waiting || owned.busy} value={selected!.tokenId} onChange={e => setToken(e.target.value)}>{items.map(i => <option key={i.tokenId} value={i.tokenId} disabled={!hasDomainArtStudy(i.itemId)}>{DOMAIN_COLLECTIBLE_BY_ID[i.itemId].name}{items.filter(a => a.itemId === i.itemId).length > 1 ? ` · copy ${items.filter(a=>a.itemId===i.itemId).findIndex(a=>a.tokenId===i.tokenId)+1}` : ''}{!hasDomainArtStudy(i.itemId)?' · art in progress':''}</option>)}</select></label>
        <details className={styles.details}><summary>About the display</summary><p>{item!.description}</p><p>Each copy can be displayed or dress one machine. Display supports are free and give no bonuses. If the piece leaves your wallet, its empty support stays where you placed it. Move or store it in Decorate.</p></details>
      </>}
    </>}
    {owned.connected&&<details className={styles.details}><summary>Ownership & connection</summary><button className={css.button} disabled={owned.busy||!!waiting} onClick={()=>void owned.refresh()}>Refresh ownership</button></details>}
    {(notice || owned.status) && <p role="status">{notice || owned.status}</p>}{owned.pending && <button className={css.button} disabled={owned.busy} onClick={async () => { if (await owned.retry()) close(); }}>Retry unfinished change</button>}
  </DinerModal>;
}
