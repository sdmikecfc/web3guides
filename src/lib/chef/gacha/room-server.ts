import 'server-only';
import { dinerDb, dinerPlayer, dinerServerEnabled } from '../diner/server';
import { DinerAuthorityError } from '../diner/authority';
import { requireDinerWalletSession } from '../diner/wallet-auth-server';
import { DOMAIN_RESTAURANT_COLLECTION_VERSION } from '../diner/domain-discoveries';
import type { DomainId } from '../diner/domain-worlds';
import { SupabaseGachaStore } from './supabase-store';
import { gachaReadEnabled } from './read-server';
import { parseVerifiedCollection, collectionRoomReward } from './room-reward';

interface RoomRewardPorts {
  enabled(): boolean; configured(): boolean; now(): number;
  collection(req: Request, game: string): Promise<{ wallet: string; domain: DomainId; progress: unknown }>;
}
const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
/** Claiming re-delivers the existing immutable entitlement. There is no client
 * total, cloud-save load, payment, or second reward receipt to duplicate. */
export function createRoomRewardEndpoint(ports: RoomRewardPorts) {
  return async (req: Request, game: string) => {
    if (!ports.enabled()) return respond({ error: 'not_found' }, 404);
    if (!ports.configured()) return respond({ error: 'gacha_not_configured' }, 503);
    try {
      if (req.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(game) || new URL(req.url).search) return respond({ error: 'invalid_request' }, 400);
      // Stream-bound the body; a forged Content-Length must not bypass the limit.
      const reader = req.body?.getReader(); let size = 0, raw = '';
      if (reader) { const decoder = new TextDecoder(); try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength;
        if (size > 64) { await reader.cancel(); return respond({ error: 'request_too_large' }, 413); } raw += decoder.decode(chunk.value, { stream: true });
      } raw += decoder.decode(); } finally { reader.releaseLock(); } }
      let body: unknown; try { body = JSON.parse(raw); } catch { return respond({ error: 'invalid_request' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) return respond({ error: 'invalid_request' }, 400);
      const { wallet, domain, progress: data } = await ports.collection(req, game);
      const progress = parseVerifiedCollection(data, domain, wallet);
      if (!progress.complete || !progress.receipt) return respond({ error: 'collection_incomplete', found: progress.found, total: 24 }, 409);
      return respond({ reward: collectionRoomReward(progress, wallet, ports.now()), paymentsEnabled: false });
    } catch (error) {
      if (error instanceof DinerAuthorityError) return respond({ error: error.code, message: error.message }, error.status);
      return respond({ error: 'collection_reward_unavailable' }, 503);
    }
  };
}
export const gachaRoomRewardEndpoint = createRoomRewardEndpoint({
  enabled: () => gachaReadEnabled(process.env), configured: dinerServerEnabled, now: Date.now,
  async collection(req, gameId) {
    const player = await dinerPlayer(req), db = dinerDb();
    const session = await requireDinerWalletSession(db, req.headers.get('authorization')!.slice(7), player);
    const { definition: game } = await new SupabaseGachaStore(db).game(gameId), wallet = session.wallet.toLowerCase();
    const result = await db.rpc('diner_gacha_collection', { p_owner: wallet, p_domain: game.domain, p_version: DOMAIN_RESTAURANT_COLLECTION_VERSION });
    if (result.error) throw new Error('Collection unavailable');
    return { wallet, domain: game.domain, progress: result.data };
  },
});
