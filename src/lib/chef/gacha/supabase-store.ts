import type { SupabaseClient } from '@supabase/supabase-js';
import { assertGame, type EventEffect, type FinalizedBlock, type StoredPull } from './settlement';
import type { GachaStore, LeasedJob, StoredGame, StoredRound } from './worker';
import { assertDomainCatalogue } from './catalogue';
import type { OperationsStore, RevealJob, RoundIntent, RoundTemplate } from './operations';

/** Construct only in a server/worker with the service-role client. All underlying
 * tables/RPCs deny browser roles. Never expose this client to pack components. */
export class SupabaseGachaStore implements GachaStore, OperationsStore {
  constructor(readonly db: SupabaseClient) {}
  private checked<T>(result: { data: T; error: unknown }, operation: string): T {
    if (result.error) throw new Error(`Gacha storage failed: ${operation}`);
    return result.data;
  }
  async game(id: string): Promise<StoredGame> {
    const row = this.checked(await this.db.from('diner_gacha_games').select('definition,revision,cursor_block,cursor_hash,halted').eq('id', id).single(), 'game');
    if (!row) throw new Error('Gacha game is not configured');
    assertGame(row.definition);
    if (row.definition.id !== id || !Number.isSafeInteger(row.revision) || (row.cursor_block !== null && !Number.isSafeInteger(Number(row.cursor_block)))) throw new Error('Invalid persisted game');
    return { definition: row.definition, revision: row.revision, halted: row.halted, cursor: row.cursor_block === null ? null : { number: String(row.cursor_block), hash: row.cursor_hash } };
  }
  async round(gameId: string, id: string): Promise<StoredRound | undefined> {
    const row = this.checked(await this.db.from('diner_gacha_rounds').select('definition,secret_ref,revealed_secret').eq('game_id', gameId).eq('round_id', id).maybeSingle(), 'round');
    return row ? { definition: row.definition, secretRef: row.secret_ref, revealedSecret: row.revealed_secret ?? undefined } : undefined;
  }
  async roundAt(gameId: string, time: number): Promise<StoredRound | undefined> {
    const rows = this.checked(await this.db.from('diner_gacha_rounds').select('definition,secret_ref,revealed_secret').eq('game_id', gameId).lte('starts_at', time).gt('ends_at', time).limit(2), 'round at time');
    if (!rows?.length) return undefined;
    if (rows.length !== 1 || time < rows[0].definition.startsAt || time >= rows[0].definition.endsAt) throw new Error('Ambiguous round window');
    return { definition: rows[0].definition, secretRef: rows[0].secret_ref, revealedSecret: rows[0].revealed_secret ?? undefined };
  }
  async pull(game: string, nonce: string): Promise<StoredPull | undefined> {
    const row = this.checked(await this.db.from('diner_gacha_pulls').select('record').eq('game_id', game).eq('nonce', nonce).maybeSingle(), 'pull');
    return row?.record;
  }
  async receipt(game: string, key: string): Promise<string | undefined> {
    const row = this.checked(await this.db.from('diner_gacha_events').select('fingerprint').eq('game_id', game).eq('event_key', key).maybeSingle(), 'receipt');
    return row?.fingerprint;
  }
  async commit(game: string, revision: number, key: string, fingerprint: string, envelope: object, effect: EventEffect) {
    const data = this.checked(await this.db.rpc('diner_gacha_commit_event', { p_game: game, p_revision: revision, p_key: key, p_fingerprint: fingerprint, p_envelope: envelope, p_effect: effect }), 'commit event');
    if (!Number.isSafeInteger(data?.revision)) throw new Error('Invalid storage revision');
    return data.revision;
  }
  async advance(game: string, revision: number, block: FinalizedBlock) {
    return this.checked(await this.db.rpc('diner_gacha_advance_cursor', { p_game: game, p_revision: revision, p_block: block.number, p_hash: block.hash, p_timestamp: block.timestamp }), 'advance cursor') === true;
  }
  async halt(game: string, reason: string) {
    if (!/^[a-z_]{1,80}$/.test(reason)) throw new Error('Invalid halt reason');
    this.checked(await this.db.from('diner_gacha_games').update({ halted: true, halt_reason: reason }).eq('id', game), 'halt');
  }
  async lease(game: string): Promise<LeasedJob | null> {
    const row = this.checked(await this.db.rpc('diner_gacha_lease_job', { p_game: game }), 'lease');
    return row ? { gameId: row.game_id, key: row.intent_key, nonce: row.nonce, kind: row.kind, lease: row.lease_token, transactionHash: row.transaction_hash ?? undefined } : null;
  }
  async finish(job: LeasedJob, status: 'ready' | 'submitted' | 'cancelled', transactionHash: string | undefined, errorCode: string | undefined, delaySeconds: number) {
    return this.checked(await this.db.rpc('diner_gacha_finish_job', { p_game: job.gameId, p_key: job.key, p_lease: job.lease, p_status: status, p_tx: transactionHash ?? null, p_error: errorCode ?? null, p_delay: delaySeconds }), 'finish job') === true;
  }
  async registerRound(game: string, round: StoredRound) {
    const saved = await this.game(game); assertDomainCatalogue(saved.definition, round.definition);
    if (!round.secretRef || round.revealedSecret) throw new Error('New round requires a secret reference and no reveal');
    this.checked(await this.db.from('diner_gacha_rounds').insert({ game_id: game, round_id: round.definition.id, definition: round.definition, secret_ref: round.secretRef }), 'register round');
  }
  async latestRound(game: string): Promise<StoredRound | undefined> {
    const rows = this.checked(await this.db.from('diner_gacha_rounds').select('definition,secret_ref,revealed_secret').eq('game_id', game).order('round_id', { ascending: false }).limit(1), 'latest round');
    const row = rows?.[0];
    return row ? { definition: row.definition, secretRef: row.secret_ref, revealedSecret: row.revealed_secret ?? undefined } : undefined;
  }
  async pendingRound(game: string): Promise<RoundIntent | undefined> {
    return this.checked(await this.db.rpc('diner_gacha_pending_round', { p_game: game }), 'pending round') ?? undefined;
  }
  async reserveRound(template: RoundTemplate): Promise<RoundIntent> {
    return this.checked(await this.db.rpc('diner_gacha_reserve_round', { p_game: template.gameId, p_template: template }), 'reserve round');
  }
  async commitRound(intent: RoundIntent, reference: string, hash: string): Promise<'committed' | 'expired'> {
    const result = this.checked(await this.db.rpc('diner_gacha_commit_round', { p_game: intent.template.gameId, p_key: intent.key, p_reference: reference, p_secret_hash: hash }), 'commit round');
    if (result !== 'committed' && result !== 'expired') throw new Error('Invalid round result');
    return result;
  }
  async endedRounds(game: string, now: number, limit: number): Promise<string[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8) throw new Error('Invalid scheduler bound');
    const rows = this.checked(await this.db.from('diner_gacha_rounds').select('definition').eq('game_id', game).is('revealed_secret', null).lte('ends_at', now).order('round_id').limit(limit), 'ended rounds');
    return (rows ?? []).map(r => r.definition.id);
  }
  async prepareReveal(game: string, round: string, revision: number, cursor: { number: string; hash: string; timestamp: number }) {
    return this.checked(await this.db.rpc('diner_gacha_prepare_reveal', { p_game: game, p_round: round, p_revision: revision, p_block: cursor.number, p_hash: cursor.hash, p_timestamp: cursor.timestamp }), 'prepare reveal') === true;
  }
  async leaseReveal(game: string): Promise<RevealJob | null> {
    const row = this.checked(await this.db.rpc('diner_gacha_lease_reveal', { p_game: game }), 'lease reveal');
    return row ? { gameId: row.game_id, roundId: row.round_id, lease: row.lease_token, transactionHash: row.transaction_hash ?? undefined } : null;
  }
  async finishReveal(job: RevealJob, transactionHash: string | undefined, errorCode: string | undefined) {
    return this.checked(await this.db.rpc('diner_gacha_finish_reveal', { p_game: job.gameId, p_round: job.roundId, p_lease: job.lease, p_tx: transactionHash ?? null, p_error: errorCode ?? null }), 'finish reveal') === true;
  }
  async leaseRecovery(game: string, head: string, timeout: string): Promise<LeasedJob | null> {
    const row = this.checked(await this.db.rpc('diner_gacha_lease_recovery', { p_game: game, p_head: head, p_timeout: timeout }), 'lease recovery');
    return row ? { gameId: row.game_id, key: row.intent_key, nonce: row.nonce, kind: row.kind, lease: row.lease_token, transactionHash: row.transaction_hash ?? undefined } : null;
  }
  async switchToRefund(job: LeasedJob, retirementReference: string, head: string, timeout: string) {
    return this.checked(await this.db.rpc('diner_gacha_switch_refund', { p_game: job.gameId, p_key: job.key, p_lease: job.lease, p_reference: retirementReference, p_head: head, p_timeout: timeout }), 'switch refund') === true;
  }
}
