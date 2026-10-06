'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { DOMAIN_IDS, DOMAIN_WORLDS, type DomainId } from '@/lib/chef/diner/domain-worlds';
import { domainRoomName, earnedDomainRoomDraft } from '@/lib/chef/diner/domain-room-kits';
import { atRestaurant, canVisitRestaurant, type DinerState, type DinerCommand } from '@/lib/chef/diner/progression';
import { parseVerifiedCollection, type VerifiedCollection } from '@/lib/chef/gacha/room-reward';
import type { DinerSession } from './diner-sync';
import { useDinerAccess } from './DinerAccess';
import { quietRestaurantScene } from './quiet-view';
import DinerScene from './DinerScene';
import { DinerModal } from './DinerModal';
import css from './diner.module.css';
import styles from './collection-restaurant.module.css';
import { loadDomainStudy } from './domain-assets';
import { DOMAIN_KIT_PARTS, domainKitAsset } from '@/lib/chef/diner/domain-room-kit-defs';

export type ClaimCollectionRoom = (session: DinerSession, domain: DomainId, signal: AbortSignal) => Promise<void>;
export function CollectionRestaurant({ state, send, close, decorate, reviewDomain, claim, fixture = false, equipment }: {
  state: DinerState; send: (command: DinerCommand) => boolean; close: () => void; decorate: () => void;
  reviewDomain?: DomainId; claim?: ClaimCollectionRoom; fixture?: boolean; equipment?: () => void;
}) {
  const [domain, setDomain] = useState<DomainId>(reviewDomain ?? DOMAIN_IDS.find(id => state.domainRooms?.earned[id]) ?? 'gochujang');
  const earned = !!state.domainRooms?.earned[domain];
  const [rotation, setRotation] = useState(0), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<VerifiedCollection | null>(null), [signed, setSigned] = useState(false);
  const [artReady, setArtReady] = useState<DomainId | null>(null), [artError, setArtError] = useState(false), [artRetry, setArtRetry] = useState(0);
  const session = useRef<DinerSession | null>(null), request = useRef<AbortController | null>(null);
  const { address, chainId } = useAccount(), { signMessageAsync } = useSignMessage(), access = useDinerAccess();
  const wallet = address?.toLowerCase(), scope = `${wallet ?? ''}:${domain}`, scopeRef = useRef(scope); scopeRef.current = scope;
  const eligibleWallet = access?.mode === 'beta' && access.wallet === wallet;
  useEffect(() => {
    let active = true; setArtReady(null); setArtError(false);
    if (earned) void Promise.all(DOMAIN_KIT_PARTS.map(part => loadDomainStudy(domainKitAsset(domain, part)))).then(() => { if (active) setArtReady(domain); }).catch(() => { if (active) setArtError(true); });
    return () => { active = false; };
  }, [domain, earned, artRetry]);
  useEffect(() => { request.current?.abort(); session.current = null; setProgress(null); setSigned(false); setBusy(false); setStatus('');
    return () => { request.current?.abort(); };
  }, [scope]);
  const preview = useMemo(() => {
    if (!earned) return null;
    try {
      const design = earnedDomainRoomDraft(state, domain), copy = structuredClone(state);
      copy.home.roomPlan = design.roomPlan; copy.home.layout = design.layout;
      const scene = quietRestaurantScene(copy); scene.people = []; scene.previewInset = 0;
      scene.objects = scene.objects.filter(o => !o.id.startsWith('incident:'));
      return { scene, error: null };
    } catch (error) { return { scene: null, error: error instanceof Error ? error.message : 'This room needs a missing piece restored from storage.' }; }
  }, [state, domain, earned]);

  async function checkCollection() {
    if (!address || !eligibleWallet || busy) return;
    const expected = scope, controller = new AbortController(); request.current?.abort(); request.current = controller; setBusy(true); setStatus('');
    const current = () => !controller.signal.aborted && scopeRef.current === expected;
    async function api(path: string, body?: unknown) {
      const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', signal: controller.signal, cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(session.current ? { Authorization: `Bearer ${session.current.accessToken}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body) });
      if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to check this wallet.' : 'Verified collections are not connected here yet. Your restaurant is unchanged.');
      return response.json();
    }
    try {
      if (!session.current || session.current.expiresAt * 1000 < Date.now() + 60_000) {
        session.current = null;
        const challenge = await api('/api/chef/diner/wallet/challenge', { address, chainId: chainId ?? 1 }); if (!current()) return;
        const signature = await signMessageAsync({ message: challenge.message, account: address }); if (!current()) return;
        const verified: DinerSession = await api('/api/chef/diner/wallet/verify', { nonce: challenge.nonce, message: challenge.message, signature });
        if (!current()) return;
        if (verified.wallet?.toLowerCase() !== wallet || typeof verified.accessToken !== 'string') throw new Error('Reconnect the wallet for this restaurant.');
        session.current = verified;
      }
      const result = await api(`/api/chef/gacha/${domain}?view=collection`); if (!current()) return;
      if (result.source !== 'verified-openings') throw new Error('A verified collection record is required.');
      setProgress(parseVerifiedCollection(result.progress, domain, wallet!)); setSigned(true);
    } catch (error) { if (current()) { session.current = null; setSigned(false); setStatus(error instanceof Error ? error.message : 'The collection check did not finish.'); } }
    finally { if (current()) setBusy(false); }
  }
  async function claimRoom() {
    if (!claim || !session.current || !eligibleWallet || busy) return;
    const expected = scope, controller = new AbortController(); request.current?.abort(); request.current = controller; setBusy(true); setStatus('');
    try { await claim(session.current, domain, controller.signal); if (!controller.signal.aborted && scopeRef.current === expected) setStatus('Your restaurant kit is in storage. Choose how to use it.'); }
    catch (error) { if (!controller.signal.aborted && scopeRef.current === expected) setStatus(error instanceof Error ? error.message : 'Claiming did not finish. You can retry.'); }
    finally { if (!controller.signal.aborted && scopeRef.current === expected) setBusy(false); }
  }
  const canApply = atRestaurant(state) || canVisitRestaurant(state);
  function useRoom() {
    if (!atRestaurant(state) && !send({ type: 'visitRestaurant' })) return;
    if (send({ type: 'applyDomainRoom', domain })) close();
  }
  const action = earned ? <>
    <button className={`${css.button} ${styles.action}`} disabled={!atRestaurant(state)} onClick={decorate}>Use the pieces</button>
    <button className={`${css.primary} ${styles.action}`} disabled={!canApply || !preview?.scene || artReady !== domain} onClick={useRoom}>Use this layout</button>
  </> : progress?.complete && progress.receipt ? <button className={css.primary} disabled={busy || !claim} onClick={() => void claimRoom()}>{busy ? 'Checking reward…' : 'Claim restaurant kit'}</button> :
    <button className={css.primary} disabled={busy || !eligibleWallet} onClick={() => void checkCollection()}>{busy ? 'Checking collection…' : signed ? 'Refresh collection' : 'Sign in & check collection'}</button>;
  return <DinerModal title={domainRoomName(domain)} eyebrow={fixture ? 'Isolated review · sample reward' : earned ? 'Your collection restaurant' : 'Private collection check'} onClose={close} wide bodyClassName={styles.body} footer={action}>
    <div className={styles.studio}>
      <div className={styles.scene}>{preview?.scene ? <DinerScene mode="home" scene={preview.scene} rotation={rotation} onRotate={setRotation} editing showWorldHints={false} onTarget={()=>{}} onTile={()=>{}}/> :
        <img src={`/api/chef/pack-preview-image/${domain}`} alt={domainRoomName(domain)} style={{ width: '100%', height: '100%', objectFit: 'contain' }}/>} 
        {earned && artReady !== domain && <div role="status" style={{position:'absolute',inset:0,display:'grid',placeContent:'center',textAlign:'center',padding:24,background:'#f5edde'}}>
          <p>{artError ? 'The room artwork could not load.' : 'Setting up your complete room…'}</p>{artError && <button className={css.button} onClick={() => setArtRetry(n => n + 1)}>Retry room preview</button>}
        </div>}
      </div>
      <div className={styles.controls}>
        <div className={`${css.tabs} ${styles.tabs}`} aria-label="Collection restaurants">{DOMAIN_IDS.filter(id => !!reviewDomain || !!state.domainRooms?.earned[id]).map(id => <button key={id} aria-pressed={domain === id} onClick={() => setDomain(id)}>{DOMAIN_WORLDS[id].name}</button>)}</div>
        {earned ? <>
          <p>Yours to keep. Previewed at your current restaurant size.</p>
          <details><summary>What happens to my room?</summary><p className={css.small}>Your current room is backed up. Displaced furniture stays in storage, and your menu stays selected.</p></details>
          {!canApply && <p>Finish this stop before changing your room.</p>}
          {preview?.error && <p role="status">{preview.error}</p>}
          {state.domainRoomBackup && <button className={css.quietLink} disabled={!atRestaurant(state)} onClick={() => { if (send({ type: 'restoreDomainRoomBackup' })) close(); }}>Restore previous room</button>}
        </> : <>
          <p>Discover all 24 different pieces to earn this restaurant. Selling or redeeming them keeps your progress.</p>
          {progress && <p aria-live="polite"><strong>{progress.found} / 24</strong> discovered through verified openings.</p>}
          <p className={css.small}>A message signature only. No transaction or spending permission. Preview samples do not count.</p>
          {!eligibleWallet && <p>Open this review with the same connected wallet as your beta restaurant.</p>}
        </>}
        {equipment && <button className={css.button} onClick={equipment}>Owned collectibles</button>}
        {status && <p role="status" className={css.notice}>{status}</p>}
      </div>
    </div>
  </DinerModal>;
}
