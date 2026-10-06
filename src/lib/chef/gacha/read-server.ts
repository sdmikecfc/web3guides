import 'server-only';
import { dinerDb, dinerPlayer, dinerServerEnabled } from '../diner/server';
import { DinerAuthorityError } from '../diner/authority';
import { requireDinerWalletSession } from '../diner/wallet-auth-server';
import { publicPacksEnabled } from '../diner/pack-release';
import { assertDomainCatalogue } from './catalogue';
import { publicRound, verifyPull } from './settlement';
import { SupabaseGachaStore } from './supabase-store';
import { uint } from './protocol';
import { DOMAIN_RESTAURANT_COLLECTION_VERSION } from '../diner/domain-discoveries';

export function gachaReadEnabled(env: Record<string, string | undefined>) {
  return publicPacksEnabled(env) || (env.NODE_ENV === 'development' && env.DINER_GACHA_REVIEW_ENABLED === 'true');
}
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
/** Development review is authenticated and read-only. No browser route accepts
 * chain events, drawn cards, opening counts, secret values or settlement commands.
 * Opening credit never imports or overwrites a local beta restaurant save.
 */
export async function gachaReadEndpoint(req: Request, gameId: string) {
  if (!gachaReadEnabled(process.env)) return response({ error: 'not_found' }, 404);
  if (!dinerServerEnabled()) return response({ error: 'gacha_not_configured' }, 503);
  try {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(gameId)) return response({ error: 'invalid_game' }, 400);
    const url = new URL(req.url), view = url.searchParams.get('view') ?? 'leaderboard';
    if (![...url.searchParams.keys()].every(k => ['view', 'pack', 'id', 'season'].includes(k))) return response({ error: 'invalid_query' }, 400);
    const player = await dinerPlayer(req), db = dinerDb();
    const session = await requireDinerWalletSession(db, req.headers.get('authorization')!.slice(7), player);
    const owner = session.wallet.toLowerCase(), store = new SupabaseGachaStore(db), saved = await store.game(gameId);
    const game = saved.definition;
    if (view === 'leaderboard') {
      const pack = url.searchParams.get('pack') ?? 'regular';
      if (!['regular', 'super'].includes(pack)) return response({ error: 'invalid_pack' }, 400);
      const season = url.searchParams.get('season');
      if (!season || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(season)) return response({ error: 'season_required' }, 400);
      const [leaders, mine] = await Promise.all([
        db.from('diner_gacha_leaderboards').select('opener,openings,rank').eq('game_id', gameId).eq('season_id', season).eq('pack', pack).order('openings', { ascending: false }).order('opener').limit(50),
        db.from('diner_gacha_leaderboards').select('opener,openings,rank').eq('game_id', gameId).eq('season_id', season).eq('pack', pack).eq('opener', owner).maybeSingle(),
      ]);
      if (leaders.error || mine.error) throw new Error('Read unavailable');
      return response({ domain: game.domain, season, pack, entries: leaders.data, me: mine.data, paymentsEnabled: false });
    }
    if (view === 'collection') {
      const [result, progress] = await Promise.all([
        db.from('diner_gacha_discoveries').select('item_id,first_opened_at').eq('game_id', gameId).eq('opener', owner),
        db.rpc('diner_gacha_collection', { p_owner: owner, p_domain: game.domain, p_version: DOMAIN_RESTAURANT_COLLECTION_VERSION }),
      ]);
      if (result.error || progress.error) throw new Error('Read unavailable');
      return response({ domain: game.domain, items: result.data, progress: progress.data, source: 'verified-openings', paymentsEnabled: false });
    }
    if (view === 'assets') {
      const result = await db.rpc('diner_gacha_owned_assets', { p_game: gameId, p_owner: owner });
      if (result.error) throw new Error('Read unavailable');
      return response({ domain: game.domain, ...result.data, source: 'finalized-ownership', paymentsEnabled: false });
    }
    const id = url.searchParams.get('id');
    if (!id || !/^(0|[1-9][0-9]{0,77})$/.test(id)) return response({ error: 'invalid_id' }, 400);
    uint(id);
    if (view === 'round') {
      const round = await store.round(gameId, id);
      if (!round) return response({ error: 'round_not_found' }, 404);
      assertDomainCatalogue(game, round.definition);
      return response(publicRound(round.definition, Date.now(), round.revealedSecret));
    }
    if (view === 'pull' || view === 'verification') {
      const pull = await store.pull(gameId, id);
      if (!pull || pull.player.toLowerCase() !== owner) return response({ error: 'pull_not_found' }, 404);
      if ('refusal' in pull) return response({ nonce: pull.nonce, status: pull.status, refundRequired: pull.status === 'pending', reason: pull.refusal, verification: { available: false } });
      const round = await store.round(gameId, pull.roundId);
      if (!round) throw new Error('Round missing');
      assertDomainCatalogue(game, round.definition);
      if (view === 'verification') return response(verifyPull(round.definition, pull, Date.now(), round.revealedSecret));
      return response({ nonce: pull.nonce, status: pull.status, pack: pull.pack, itemId: pull.status === 'fulfilled' ? pull.itemId : null, prizeTokenAmount: pull.status === 'fulfilled' ? pull.prizeTokenAmount : null, redeemed: pull.redeemed ?? false });
    }
    return response({ error: 'invalid_view' }, 400);
  } catch (error) {
    if (error instanceof DinerAuthorityError) return response({ error: error.code, message: error.message }, error.status);
    // Provider/database failures must never serialize secrets or raw backend errors.
    return response({ error: 'gacha_review_unavailable' }, 503);
  }
}
