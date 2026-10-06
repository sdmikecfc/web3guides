'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import type { DomainId } from '@/lib/chef/diner/domain-worlds';
import type { DinerState } from '@/lib/chef/diner/progression';
import { EquipmentCollectionClient } from '@/lib/chef/gacha/equipment-client';
import type { EquipmentDestination, EquipmentInventory } from '@/lib/chef/gacha/equipment-ownership';
import { useDinerAccess } from './DinerAccess';
import type { DinerSession } from './diner-sync';

export function useCollectionEquipment(state: DinerState | null, domain?: DomainId) {
  const { address, chainId } = useAccount(), { signMessageAsync } = useSignMessage(), access = useDinerAccess();
  const wallet = address?.toLowerCase(), eligible = !!domain && access?.mode === 'beta' && access.wallet === wallet;
  const scope = `${eligible ? wallet : ''}:${domain ?? ''}:${state?.seed ?? ''}`;
  const live = useRef({ scope, state, eligible }); live.current = { scope, state, eligible };
  const client = useRef<EquipmentCollectionClient | null>(null), controller = useRef<AbortController | null>(null);
  const [view, setView] = useState<{ scope: string; inventory: EquipmentInventory; checkedAt: number } | null>(null);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [clock, setClock] = useState(Date.now());
  const signatureBusy = useRef(false);
  useEffect(() => {
    client.current?.dispose(); client.current = null; controller.current?.abort(); setView(null); setBusy(false); setStatus('');
    return () => { client.current?.dispose(); client.current = null; controller.current?.abort(); };
  }, [scope]);
  const update = useCallback(async (action: () => Promise<void>) => {
    const expected = live.current.scope; setBusy(true); setStatus('');
    try { await action(); return live.current.scope === expected; } catch (error) { if (live.current.scope === expected) setStatus(error instanceof Error ? error.message : 'Could not check ownership.'); return false; }
    finally { if (live.current.scope === expected) setBusy(false); }
  }, []);
  async function connect() {
    if (!eligible || !address || !domain || signatureBusy.current || busy) return;
    signatureBusy.current = true;
    await update(async () => {
      const expected = scope, abort = new AbortController(); controller.current?.abort(); controller.current = abort;
      const current = () => !abort.signal.aborted && live.current.scope === expected && live.current.eligible;
      const api = async (path: string, body: unknown) => {
        const response = await fetch(path, { method: 'POST', signal: abort.signal, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok) throw new Error('Wallet verification is not connected here yet.'); return response.json();
      };
      const challenge = await api('/api/chef/diner/wallet/challenge', { address, chainId: chainId ?? 1 }); if (!current()) return;
      const signature = await signMessageAsync({ message: challenge.message, account: address }); if (!current()) return;
      const session: DinerSession = await api('/api/chef/diner/wallet/verify', { nonce: challenge.nonce, message: challenge.message, signature }); if (!current()) return;
      if (session.wallet?.toLowerCase() !== wallet || typeof session.accessToken !== 'string') throw new Error('Reconnect the wallet for this restaurant.');
      client.current?.dispose();
      const owned = new EquipmentCollectionClient({ domain, accessToken: session.accessToken,
        current: () => current() ? live.current.state : null,
        changed: inventory => { if (current()) setView(inventory ? { scope: expected, inventory, checkedAt: Date.now() } : null); },
      });
      client.current = owned; await owned.refresh();
    });
    signatureBusy.current = false;
  }
  useEffect(() => {
    if (!domain) return;
    const refresh = () => { if (document.hidden || !client.current || client.current.busy) return; void client.current.refresh().catch(() => {}); };
    const timer = window.setInterval(() => { setClock(Date.now()); refresh(); }, 20_000);
    const focus = () => { setClock(Date.now()); refresh(); };
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [domain]);
  // These are existing saved targets, not an unconfirmed editor draft.
  const targets = JSON.stringify([state?.home.layout.map(p => [p.id, p.equipmentId]), state?.truckConfig.stations.map(p => [p.id, p.kind])]);
  useEffect(() => { if (client.current) void client.current.releaseMissing().catch(() => {}); }, [targets, view]);
  return {
    inventory: eligible && view?.scope === scope && Math.max(clock, Date.now()) - view.checkedAt < 60_000 ? view.inventory : null,
    eligible, busy, status, connected: !!client.current, pending: !!client.current?.pending,
    connect, refresh: () => update(async () => { await client.current?.refresh(); }),
    assign: (token: string, target: EquipmentDestination | null) => update(async () => { await client.current?.assign(token, target); }),
    retry: () => update(async () => { await client.current?.retry(); }),
  };
}
export type CollectionEquipmentController = ReturnType<typeof useCollectionEquipment>;
