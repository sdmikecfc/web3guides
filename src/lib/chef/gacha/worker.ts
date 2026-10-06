import { sha256, chainHash, uint, wallet } from './protocol';
import { assertGame, assertRound, eventKey, IgnoredReveal, processEvent, type ChainEvent, type EventEffect, type FinalizedBlock, type StoredPull, type Game, type Round } from './settlement';

export interface StoredGame { definition: Game; revision: number; cursor: { number: string; hash: string } | null; halted: boolean }
export interface StoredRound { definition: Round; secretRef: string; revealedSecret?: string }
export interface LeasedJob { gameId: string; key: string; kind: 'fulfill' | 'refund'; nonce: string; lease: string; transactionHash?: string }
export interface GachaStore {
  game(id: string): Promise<StoredGame>;
  round(game: string, id: string): Promise<StoredRound | undefined>;
  roundAt(game: string, time: number): Promise<StoredRound | undefined>;
  pull(game: string, nonce: string): Promise<StoredPull | undefined>;
  receipt(game: string, key: string): Promise<string | undefined>;
  commit(game: string, revision: number, key: string, fingerprint: string, envelope: object, effect: EventEffect): Promise<number>;
  advance(game: string, revision: number, block: FinalizedBlock): Promise<boolean>;
  halt(game: string, reason: string): Promise<void>;
  lease(game: string): Promise<LeasedJob | null>;
  finish(job: LeasedJob, status: 'ready' | 'submitted' | 'cancelled', transactionHash: string | undefined, errorCode: string | undefined, delaySeconds: number): Promise<boolean>;
}
export interface ChainReader {
  finalizedHead(game: Game): Promise<string>;
  block(game: Game, number: string): Promise<FinalizedBlock>;
  events(game: Game, number: string): Promise<ChainEvent[]>;
  pull(game: Game, nonce: string): Promise<{ status: 'none' | 'pending' | 'fulfilled' | 'refunded'; player: string; price: string; blockNumber: string; commitment: string }>;
  refundTimeout(game: Game): Promise<string>;
  head(game: Game): Promise<string>;
}
export interface SecretStore { read(reference: string): Promise<string> }
/** Required production custody contract: submitOnce MUST persist the signed tx
 * before broadcast, recover unknown broadcast outcomes, and order nonces across
 * all games sharing (chainId, signer). Repeating a key returns that SAME operation.
 * There is deliberately no private-key/env fallback in this application.
 */
export interface SettlementSigner {
  submitOnce(request: { idempotencyKey: string; game: Game; operation: 'fulfill' | 'refund'; pull: StoredPull }): Promise<{ transactionHash: string }>;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}
export function eventFingerprint(event: ChainEvent) { return sha256(JSON.stringify(canonical(event))); }
function envelope(event: ChainEvent) {
  return { gameId: event.gameId, chainId: event.chainId, contract: event.contract, kind: event.kind, transactionHash: event.transactionHash, logIndex: event.logIndex, blockNumber: event.blockNumber, blockHash: event.blockHash, timestamp: event.timestamp };
}
/** One bounded, restartable block. A failed commit never advances the cursor.
 * Logs are replayed in chain order; receipt checks happen BEFORE transition logic.
 * RPC/network failures retry naturally. Conflicting canonical history halts.
 */
export async function ingestNextBlock(ports: { store: GachaStore; chain: ChainReader; secrets: SecretStore }, gameId: string, deploymentBlock: string) {
  const { store, chain, secrets } = ports;
  const saved = await store.game(gameId), game = saved.definition;
  assertGame(game); uint(deploymentBlock);
  if (saved.halted) return { status: 'halted' as const };
  if (saved.cursor) {
    const anchor = await chain.block(game, saved.cursor.number);
    if (chainHash(anchor.hash) !== chainHash(saved.cursor.hash)) { await store.halt(game.id, 'finalized_history_changed'); return { status: 'halted' as const }; }
  }
  const number = saved.cursor ? (BigInt(saved.cursor.number) + BigInt(1)).toString() : deploymentBlock;
  const finalized = BigInt(uint(await chain.finalizedHead(game)));
  // N+1 must itself be finalized before fixing a requested pull's random input.
  if (BigInt(number) + BigInt(1) > finalized) return { status: 'caught_up' as const };
  const block = await chain.block(game, number);
  if (saved.cursor && chainHash(block.parentHash) !== chainHash(saved.cursor.hash)) { await store.halt(game.id, 'finalized_parent_changed'); return { status: 'halted' as const }; }
  const events = (await chain.events(game, number)).sort((a, b) => a.logIndex - b.logIndex);
  let revision = saved.revision;
  for (const event of events) {
    if (event.blockNumber !== number) throw new Error('Reader returned an event outside requested block');
    const key = eventKey(event), fingerprint = eventFingerprint(event), receipt = await store.receipt(game.id, key);
    if (receipt) {
      if (receipt !== fingerprint) { await store.halt(game.id, 'finalized_event_changed'); return { status: 'halted' as const }; }
      continue;
    }
    const pull = event.kind === 'revealed' ? undefined : await store.pull(game.id, event.nonce);
    const round = event.kind === 'requested' ? await store.roundAt(game.id, event.timestamp) : event.kind === 'revealed' ? await store.round(game.id, event.roundId) : undefined;
    let effect: EventEffect;
    try {
      effect = processEvent({ game, event, canonicalBlock: block, pull, round: round?.definition,
        nextBlock: event.kind === 'requested' ? await chain.block(game, (BigInt(number) + BigInt(1)).toString()) : undefined,
        secret: event.kind === 'requested' && round ? await secrets.read(round.secretRef) : undefined });
    } catch (error) {
      // revealRound is permissionless. Invalid reveals are recorded as no-ops;
      // an outsider must not be able to stall the entire indexer with one.
      if (error instanceof IgnoredReveal) effect = {};
      else throw error;
    }
    revision = await store.commit(game.id, revision, key, fingerprint, envelope(event), effect);
  }
  if (!await store.advance(game.id, revision, block)) throw new Error('Concurrent cursor update; retry from persisted cursor');
  return { status: 'advanced' as const, block: number, events: events.length };
}
/** A lease is not proof that a transaction wasn't submitted. Every retry asks the
 * custody adapter for the SAME stable operation. Only chain ingestion completes jobs.
 */
export async function runSettlementJob(ports: { store: GachaStore; chain: ChainReader; signer: SettlementSigner }, gameId: string) {
  const { store, chain, signer } = ports, saved = await store.game(gameId);
  if (saved.halted) return { status: 'halted' as const };
  const game = saved.definition, job = await store.lease(gameId);
  if (!job) return { status: 'idle' as const };
  try {
    const pull = await store.pull(gameId, job.nonce);
    if (!pull || pull.gameId !== gameId || job.gameId !== gameId) throw new Error('Missing scoped job request');
    if (pull.status !== 'pending') { await store.finish(job, 'cancelled', undefined, undefined, 1); return { status: 'settled' as const }; }
    const onchain = await chain.pull(game, pull.nonce);
    if (onchain.status === 'fulfilled' || onchain.status === 'refunded') {
      if (onchain.status === 'fulfilled' && ('refusal' in pull || chainHash(onchain.commitment) !== chainHash(pull.commitment))) { await store.halt(gameId, 'onchain_draw_mismatch'); throw new Error('On-chain commitment mismatch'); }
      await store.finish(job, 'submitted', job.transactionHash, undefined, 15);
      return { status: 'awaiting_ingestion' as const };
    }
    if (onchain.status !== 'pending' || wallet(onchain.player) !== pull.player || onchain.price !== pull.price || onchain.blockNumber !== pull.request.blockNumber) throw new Error('On-chain request mismatch');
    const head = BigInt(uint(await chain.head(game)));
    const age = head - BigInt(pull.request.blockNumber);
    if (age < BigInt(2)) { await store.finish(job, 'ready', undefined, undefined, 10); return { status: 'waiting' as const }; }
    if (job.kind === 'refund' && age <= BigInt(uint(await chain.refundTimeout(game)))) { await store.finish(job, 'ready', undefined, undefined, 15); return { status: 'waiting' as const }; }
    if (job.kind === 'fulfill') {
      if ('refusal' in pull) throw new Error('Rejected request cannot be fulfilled');
      const round = await store.round(gameId, pull.roundId);
      if (!round) throw new Error('Round missing');
      assertRound(game, round.definition);
      if (round.revealedSecret) throw new Error('Cannot fulfill a revealed round');
    }
    const result = await signer.submitOnce({ idempotencyKey: `${game.chainId}:${game.contract.toLowerCase()}:${job.key}`, game, operation: job.kind, pull });
    const transactionHash = chainHash(result.transactionHash);
    if (!await store.finish(job, 'submitted', transactionHash, undefined, 15)) return { status: 'lease_lost' as const };
    return { status: 'submitted' as const, transactionHash };
  } catch (error) {
    // Never persist provider messages: they can contain URLs, tokens or signed data.
    await store.finish(job, 'ready', job.transactionHash, 'settlement_retry_required', 30);
    throw error;
  }
}
