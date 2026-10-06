import type { DomainSeason } from '../diner/domain-seasons';
import { assertDomainCatalogue, gameFromSeason } from './catalogue';
import { bareHash, chainHash, configHash, roundHash, secretHash, uint } from './protocol';
import { assertRound, type CatalogueBox, type Game, type Round, type StoredPull } from './settlement';
import type { ChainReader, GachaStore, LeasedJob, SecretStore, StoredRound } from './worker';

export interface RoundTemplate {
  gameId: string; seasonId: string; catalogueVersion: number;
  seasonStartsAt: number; seasonEndsAt: number; startsAt: number; endsAt: number;
  boxes: readonly CatalogueBox[]; configHash: string;
}
export interface RoundIntent {
  key: string; id: string; previousHash: string; template: RoundTemplate;
  state: 'reserved' | 'committed' | 'expired';
}
export interface RevealJob { gameId: string; roundId: string; lease: string; transactionHash?: string }
export interface OperationsStore extends GachaStore {
  latestRound(game: string): Promise<StoredRound | undefined>;
  pendingRound(game: string): Promise<RoundIntent | undefined>;
  reserveRound(template: RoundTemplate): Promise<RoundIntent>;
  commitRound(intent: RoundIntent, reference: string, hash: string): Promise<'committed' | 'expired'>;
  endedRounds(game: string, now: number, limit: number): Promise<string[]>;
  prepareReveal(game: string, round: string, revision: number, cursor: { number: string; hash: string; timestamp: number }): Promise<boolean>;
  leaseReveal(game: string): Promise<RevealJob | null>;
  finishReveal(job: RevealJob, transactionHash: string | undefined, errorCode: string | undefined): Promise<boolean>;
  leaseRecovery(game: string, head: string, timeout: string): Promise<LeasedJob | null>;
  switchToRefund(job: LeasedJob, retirementReference: string, head: string, timeout: string): Promise<boolean>;
}
/** The secret provider atomically creates OR loads one independently random
 * secret for a stable key. It returns only its opaque reference and SHA-256 hash.
 * An uncertain create response must never generate a different secret on retry.
 */
export interface RoundSecretStore extends SecretStore {
  createOnce(key: string): Promise<{ reference: string; hash: string }>;
}
export interface RevealSigner {
  revealOnce(input: { idempotencyKey: string; game: Game; round: Round; secret: string }): Promise<{ transactionHash: string }>;
}
/** Retirement is a durable custody fence, NOT a mempool lookup. A retired key
 * rejects all future submitOnce calls, including stale workers. Every previously
 * signed tx is either never released, or permanently unusable after a finalized
 * revert/nonce cancellation. Unknown, dropped and pending txs are NOT retired.
 */
export interface RecoverySigner {
  retireOnce(key: string): Promise<
    | { state: 'pending' | 'unknown' | 'confirmed'; idempotencyKey: string }
    | { state: 'retired'; idempotencyKey: string; reference: string }
  >;
}
export function operationKey(game: Game, operation: string) { return `${game.chainId}:${game.contract.toLowerCase()}:${operation}`; }

/** Choose a future window, keeping daily boundaries anchored to the season.
 * If a scheduler missed a window, leave the gap closed instead of retroactively
 * committing a secret after users could have paid into it.
 */
export function nextRoundWindow(season: DomainSeason, latest: Round | undefined, now: number, durationMs = 86400000, leadMs = 60000) {
  gameFromSeason(season);
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(durationMs) || durationMs < 60000 || durationMs > 7 * 86400000 || !Number.isSafeInteger(leadMs) || leadMs < 1000 || leadMs >= durationMs) throw new Error('Invalid round scheduling policy');
  if (latest && latest.endsAt >= season.endsAt!) return null;
  const earliest = Math.max(season.startsAt!, latest?.endsAt ?? season.startsAt!, now + leadMs);
  const startsAt = season.startsAt! + Math.ceil((earliest - season.startsAt!) / durationMs) * durationMs;
  if (startsAt >= season.endsAt!) return null;
  // At most one round ahead; repeated scheduler calls cannot create the season.
  if (latest && latest.startsAt > now && latest.endsAt <= season.endsAt!) return null;
  return { startsAt, endsAt: Math.min(startsAt + durationMs, season.endsAt!) };
}

export async function rotateRound(ports: { store: OperationsStore; secrets: RoundSecretStore }, gameId: string, season: DomainSeason, boxes: readonly CatalogueBox[], now: number, durationMs = 86400000, leadMs = 60000) {
  const saved = await ports.store.game(gameId), configured = gameFromSeason(season), game = saved.definition;
  if (saved.halted) return { status: 'halted' as const };
  if (game.domain !== configured.domain || game.chainId !== configured.chainId || game.contract.toLowerCase() !== configured.contract.toLowerCase()) throw new Error('Season does not belong to this game');
  const latest = await ports.store.latestRound(gameId);
  const pending = await ports.store.pendingRound(gameId);
  const window = pending?.template ?? nextRoundWindow(season, latest?.definition, now, durationMs, leadMs);
  if (!window) return { status: 'up_to_date' as const };
  const template: RoundTemplate = pending?.template ?? { gameId, seasonId: season.id, catalogueVersion: season.catalogueVersion, seasonStartsAt: season.startsAt!, seasonEndsAt: season.endsAt!, startsAt: window.startsAt, endsAt: window.endsAt, boxes, configHash: configHash(boxes) };
  // Validate item IDs before any database reservation or secret creation.
  const probe: Round = { ...template, id: '0', previousHash: '0'.repeat(64), secretHash: '0'.repeat(64), hash: roundHash('0'.repeat(64), '0', '0'.repeat(64), template.configHash) };
  assertDomainCatalogue(game, probe);
  const intent = pending ?? await ports.store.reserveRound(template);
  if (intent.state !== 'reserved') return { status: intent.state, roundId: intent.id };
  const prepared = await ports.secrets.createOnce(`domain-kitchen:${game.chainId}:${game.contract.toLowerCase()}:round:${intent.key}`);
  const preparedHash = bareHash(prepared.hash);
  if (preparedHash === secretHash('0'.repeat(64))) throw new Error('The contract cannot reveal a zero secret');
  if (!prepared.reference || prepared.reference.length > 256 || /^(0x)?[a-f0-9]{64}$/i.test(prepared.reference)) throw new Error('Secret store must return an opaque reference');
  return { status: await ports.store.commitRound(intent, prepared.reference, preparedHash), roundId: intent.id };
}

export async function queueEndedReveals(ports: { store: OperationsStore; chain: ChainReader }, gameId: string, now: number) {
  if (!Number.isSafeInteger(now)) throw new Error('Invalid scheduler time');
  const saved = await ports.store.game(gameId);
  if (saved.halted || !saved.cursor) return { queued: 0 };
  const anchor = await ports.chain.block(saved.definition, saved.cursor.number);
  if (chainHash(anchor.hash) !== chainHash(saved.cursor.hash) || BigInt(uint(await ports.chain.finalizedHead(saved.definition))) < BigInt(anchor.number)) {
    await ports.store.halt(gameId, 'reveal_cursor_not_finalized'); return { queued: 0 };
  }
  const ended = await ports.store.endedRounds(gameId, Math.min(now, anchor.timestamp), 8);
  let queued = 0;
  for (const id of ended) if (await ports.store.prepareReveal(gameId, id, saved.revision, anchor)) queued++;
  return { queued };
}
export async function runRevealJob(ports: { store: OperationsStore; secrets: SecretStore; signer: RevealSigner }, gameId: string, now: number) {
  if (!Number.isSafeInteger(now)) throw new Error('Invalid scheduler time');
  const saved = await ports.store.game(gameId);
  if (saved.halted) return { status: 'halted' as const };
  const job = await ports.store.leaseReveal(gameId);
  if (!job) return { status: 'idle' as const };
  try {
    if (job.gameId !== gameId) throw new Error('Reveal lease belongs to another game');
    const stored = await ports.store.round(gameId, job.roundId);
    if (!stored || stored.definition.gameId !== gameId || stored.definition.endsAt > now) throw new Error('Round is not ready for reveal');
    assertRound(saved.definition, stored.definition);
    if (stored.revealedSecret) { await ports.store.finishReveal(job, job.transactionHash, undefined); return { status: 'awaiting_ingestion' as const }; }
    // No secret is read until the database lease has checked end time, complete
    // ingestion and every request in the round's window being terminal.
    const secret = await ports.secrets.read(stored.secretRef);
    if (secretHash(secret) !== stored.definition.secretHash) throw new Error('Reveal secret mismatch');
    const result = await ports.signer.revealOnce({ idempotencyKey: operationKey(saved.definition, `reveal:${job.roundId}`), game: saved.definition, round: stored.definition, secret });
    if (!await ports.store.finishReveal(job, chainHash(result.transactionHash), undefined)) return { status: 'lease_lost' as const };
    return { status: 'submitted' as const };
  } catch (error) { await ports.store.finishReveal(job, job.transactionHash, 'reveal_retry_required'); throw error; }
}

export async function recoverStalledPurchase(ports: { store: OperationsStore; chain: ChainReader; signer: RecoverySigner }, gameId: string) {
  const saved = await ports.store.game(gameId), game = saved.definition;
  if (saved.halted) return { status: 'halted' as const };
  const head = uint(await ports.chain.finalizedHead(game)), timeout = uint(await ports.chain.refundTimeout(game));
  const job = await ports.store.leaseRecovery(gameId, head, timeout);
  if (!job) return { status: 'idle' as const };
  try {
    const pull: StoredPull | undefined = await ports.store.pull(gameId, job.nonce);
    if (!pull || pull.gameId !== gameId || 'refusal' in pull || pull.status !== 'pending') throw new Error('Recovery request is not pending fulfillment');
    const onchain = await ports.chain.pull(game, pull.nonce);
    if (onchain.status === 'fulfilled' || onchain.status === 'refunded') {
      if (onchain.status === 'fulfilled' && chainHash(onchain.commitment) !== chainHash(pull.commitment)) { await ports.store.halt(gameId, 'recovery_commitment_mismatch'); throw new Error('Recovery commitment mismatch'); }
      await ports.store.finish(job, 'submitted', job.transactionHash, undefined, 15);
      return { status: 'awaiting_ingestion' as const };
    }
    if (onchain.status !== 'pending' || onchain.player.toLowerCase() !== pull.player.toLowerCase() || onchain.price !== pull.price || onchain.blockNumber !== pull.request.blockNumber || BigInt(head) - BigInt(pull.request.blockNumber) <= BigInt(timeout)) throw new Error('Recovery evidence mismatch');
    const key = operationKey(game, job.key), retired = await ports.signer.retireOnce(key);
    if (retired.idempotencyKey !== key) throw new Error('Custody returned another operation');
    if (retired.state !== 'retired') {
      await ports.store.finish(job, 'submitted', job.transactionHash, 'awaiting_custody_retirement', 30);
      return { status: 'awaiting_custody' as const };
    }
    if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(retired.reference)) throw new Error('Invalid custody retirement reference');
    return { status: await ports.store.switchToRefund(job, retired.reference, head, timeout) ? 'refund_queued' as const : 'lease_lost' as const };
  } catch (error) { await ports.store.finish(job, 'ready', job.transactionHash, 'recovery_retry_required', 30); throw error; }
}
