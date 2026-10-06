import 'server-only';
import { dinerDb, dinerPlayer, dinerServerEnabled } from '../diner/server';
import { DinerAuthorityError } from '../diner/authority';
import { requireDinerWalletSession } from '../diner/wallet-auth-server';
import { DOMAIN_COLLECTIBLE_BY_ID, type DomainId } from '../diner/domain-worlds';
import { EQUIPMENT_BY_ID } from '../diner/content';
import { displaySpotKind } from '../diner/collection-display-spots';
import { SupabaseGachaStore } from './supabase-store';
import { gachaReadEnabled } from './read-server';
import { equipmentTargetKey, parseEquipmentAssignment, parseEquipmentInventory, type EquipmentAssignmentRequest, type EquipmentInventory } from './equipment-ownership';

interface EquipmentPorts {
  enabled(): boolean; configured(): boolean; now(): number;
  account(req: Request, game: string): Promise<{ owner: string; domain: DomainId }>;
  inventory(game: string, owner: string): Promise<unknown>;
  assign(game: string, owner: string, request: EquipmentAssignmentRequest, checkpoint: NonNullable<EquipmentInventory['checkpoint']>): Promise<void>;
}
const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
export function createEquipmentEndpoint(ports: EquipmentPorts) {
  return async (req: Request, game: string) => {
    if (!ports.enabled()) return respond({ error: 'not_found' }, 404);
    if (!ports.configured()) return respond({ error: 'gacha_not_configured' }, 503);
    try {
      if (!['GET', 'POST'].includes(req.method)) return respond({ error: 'method_not_allowed' }, 405);
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(game) || new URL(req.url).search) return respond({ error: 'invalid_request' }, 400);
      let change: EquipmentAssignmentRequest | null = null;
      if (req.method === 'POST') {
        const reader = req.body?.getReader(); let size = 0, raw = '';
        if (reader) { const decoder = new TextDecoder(); try { while (true) { const part = await reader.read(); if (part.done) break;
          size += part.value.byteLength; if (size > 2048) { await reader.cancel(); return respond({ error: 'request_too_large' }, 413); } raw += decoder.decode(part.value, { stream: true });
        } raw += decoder.decode(); } finally { reader.releaseLock(); } }
        try { change = parseEquipmentAssignment(JSON.parse(raw)); } catch { return respond({ error: 'invalid_request' }, 400); }
      }
      const { owner, domain } = await ports.account(req, game);
      const read = async () => {
        const result = parseEquipmentInventory({ ...await ports.inventory(game, owner) as object, domain }, domain);
        // A stopped indexer must not indefinitely authorize a transferred NFT.
        if (result.ready && (!result.checkpoint || ports.now() - result.checkpoint.timestamp > 300_000 || result.checkpoint.timestamp > ports.now() + 60_000)) return { ...result, ready: false, checkpoint: null, items: [] };
        return result;
      };
      const inventory = await read();
      if (change) {
        if (!inventory.ready || !inventory.checkpoint) return respond({ error: 'ownership_sync_required' }, 409);
        const item = inventory.items.find(i => i.tokenId === change!.tokenId);
        if (!item) return respond({ error: 'item_not_owned' }, 409);
        if (change.destination && (change.destination.display ? displaySpotKind(DOMAIN_COLLECTIBLE_BY_ID[item.itemId])!==change.destination.kind : !EQUIPMENT_BY_ID[change.destination.kind] || DOMAIN_COLLECTIBLE_BY_ID[item.itemId]?.machine !== change.destination.kind)) return respond({ error: 'incompatible_equipment' }, 400);
        await ports.assign(game, owner, change, inventory.checkpoint);
      }
      return respond({ inventory: change ? await read() : inventory, source: 'finalized-ownership', paymentsEnabled: false });
    } catch (error) {
      if (error instanceof DinerAuthorityError) return respond({ error: error.code, message: error.message }, error.status);
      return respond({ error: 'equipment_ownership_unavailable' }, 503);
    }
  };
}
export const gachaEquipmentEndpoint = createEquipmentEndpoint({
  enabled: () => gachaReadEnabled(process.env), configured: dinerServerEnabled, now: Date.now,
  async account(req, gameId) {
    const player = await dinerPlayer(req), db = dinerDb();
    const session = await requireDinerWalletSession(db, req.headers.get('authorization')!.slice(7), player);
    const { definition } = await new SupabaseGachaStore(db).game(gameId);
    return { owner: session.wallet.toLowerCase(), domain: definition.domain };
  },
  async inventory(game, owner) {
    const result = await dinerDb().rpc('diner_gacha_equipment_inventory', { p_game: game, p_owner: owner });
    if (result.error) throw new Error('Equipment inventory unavailable'); return result.data;
  },
  async assign(game, owner, request, checkpoint) {
    const result = await dinerDb().rpc('diner_gacha_assign_equipment', { p_game: game, p_owner: owner, p_request: request,
      p_target: request.destination ? equipmentTargetKey(request.destination) : null, p_block: checkpoint.block, p_hash: checkpoint.hash });
    if (result.error) {
      const message = result.error.message ?? '';
      if (message.includes('revision_conflict') || message.includes('sync_required') || message.includes('retry_conflict') || message.includes('not_owned') || result.error.code === '23505') throw new DinerAuthorityError('assignment_changed', 'Refresh your collection, then choose again.', 409);
      throw new Error('Equipment assignment unavailable');
    }
  },
});
