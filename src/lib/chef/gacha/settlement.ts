import type { DomainId } from '../diner/domain-worlds';
import type { DomainOpeningRecord } from '../diner/domain-seasons';
import { atomicUsd, bareHash, boxForPayment, canonicalBoxes, chainHash, configHash, draw, pullCommitment, roundHash, secretHash, uint, wallet, type GachaBox, type RandomnessSource } from './protocol';

export interface Game {
  id: string; domain: DomainId; chainId: number; contract: string;
}
export interface CatalogueBox extends GachaBox { pack: 'regular' | 'super'; items: Readonly<Record<number, string>> }
export interface Round {
  gameId: string; id: string; startsAt: number; endsAt: number; previousHash: string;
  secretHash: string; configHash: string; hash: string; boxes: readonly CatalogueBox[];
  seasonId: string; catalogueVersion: number; seasonStartsAt: number; seasonEndsAt: number;
}
export interface ChainPosition {
  gameId: string; chainId: number; contract: string; transactionHash: string;
  logIndex: number; blockNumber: string; blockHash: string; timestamp: number;
}
export interface FinalizedBlock { number: string; hash: string; timestamp: number; parentHash: string }
export type ChainEvent = ChainPosition & (
  | { kind: 'requested'; nonce: string; player: string; price: string }
  | { kind: 'fulfilled'; nonce: string; player: string; roundId: string; boxId: string; cardNumber: number; prizeAmount: string; prizeTokenAmount: string; source: RandomnessSource }
  | { kind: 'refunded'; nonce: string; player: string; price: string }
  | { kind: 'burned'; nonce: string; owner: string; prizeTokenAmount: string }
  | { kind: 'revealed'; roundId: string; secretKeyHash: string; secret: string }
);
export interface FrozenPull {
  gameId: string; nonce: string; player: string; price: string; roundId: string;
  seasonId: string; catalogueVersion: number;
  status: 'pending' | 'fulfilled' | 'refunded'; request: ChainPosition;
  boxId: string; pack: 'regular' | 'super'; itemId: string; cardNumber: number;
  prizeAmount: string; source: RandomnessSource; commitment: string;
  prizeTokenAmount?: string; redeemed?: boolean;
}
export interface RefundOnlyPull {
  gameId: string; nonce: string; player: string; price: string; request: ChainPosition;
  roundId: null; status: 'pending' | 'refunded'; refusal: 'outside_round' | 'unconfigured_pack';
}
export type StoredPull = FrozenPull | RefundOnlyPull;
export interface SettlementJob {
  key: string; gameId: string; nonce: string; kind: 'fulfill' | 'refund';
}
export interface EventEffect {
  pull?: StoredPull; opening?: DomainOpeningRecord; job?: SettlementJob;
  cancelJobsForNonce?: string; reveal?: { roundId: string; secret: string };
}
const scopedId = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export class IgnoredReveal extends Error {}
export function assertGame(game: Game) {
  if (!scopedId.test(game.id) || !['gochujang', 'smoothie', 'wines'].includes(game.domain)) throw new Error('Invalid game identity');
  if (!Number.isSafeInteger(game.chainId) || game.chainId < 1) throw new Error('Invalid game configuration');
  if (wallet(game.contract) === `0x${'0'.repeat(40)}`) throw new Error('Missing game contract');
}
export function assertRound(game: Game, round: Round) {
  assertGame(game); uint(round.id);
  if (!scopedId.test(round.seasonId) || !Number.isSafeInteger(round.catalogueVersion) || round.catalogueVersion < 1 || !Number.isSafeInteger(round.seasonStartsAt) || !Number.isSafeInteger(round.seasonEndsAt) || round.seasonStartsAt < 0 || round.seasonEndsAt <= round.seasonStartsAt) throw new Error('Invalid season snapshot');
  if (round.gameId !== game.id || !Number.isSafeInteger(round.startsAt) || !Number.isSafeInteger(round.endsAt) || round.endsAt <= round.startsAt) throw new Error('Invalid round scope or dates');
  if (round.startsAt < round.seasonStartsAt || round.endsAt > round.seasonEndsAt) throw new Error('Round outside season');
  canonicalBoxes(round.boxes);
  const packs = new Set<string>(), items = new Set<string>();
  for (const box of round.boxes) {
    if (!['regular', 'super'].includes(box.pack) || packs.has(box.pack)) throw new Error('Duplicate or invalid pack');
    packs.add(box.pack);
    if (box.cards.length !== 12 || Object.keys(box.items).length !== 12) throw new Error('Each pack requires twelve item mappings');
    for (const card of box.cards) {
      const item = box.items[card.cardNumber];
      if (!item || !/^[a-z0-9_-]{1,128}$/.test(item) || items.has(item)) throw new Error('Missing or duplicate collectible mapping');
      items.add(item);
    }
  }
  if (packs.size !== 2 || configHash(round.boxes) !== round.configHash || roundHash(round.previousHash, round.id, round.secretHash, round.configHash) !== round.hash) throw new Error('Round commitment mismatch');
}
export function eventKey(event: ChainPosition) { return `${chainHash(event.transactionHash)}:${event.logIndex}`; }
export function assertEvent(game: Game, event: ChainEvent, finalized: FinalizedBlock) {
  assertGame(game); uint(event.blockNumber); uint(finalized.number);
  if (event.gameId !== game.id || event.chainId !== game.chainId || wallet(event.contract) !== wallet(game.contract)) throw new Error('Event is not from this registered game');
  if (!Number.isSafeInteger(event.logIndex) || event.logIndex < 0 || !Number.isSafeInteger(event.timestamp) || event.timestamp < 0) throw new Error('Invalid event position');
  chainHash(event.transactionHash); chainHash(event.blockHash);
  // The ingestion adapter supplies the canonical block fetched by number, never
  // a browser/webhook assertion that a log is finalized.
  if (event.blockNumber !== finalized.number || chainHash(event.blockHash) !== chainHash(finalized.hash) || event.timestamp !== finalized.timestamp) throw new Error('Event is not in the canonical finalized block');
}
function position(event: ChainEvent): ChainPosition {
  return { gameId: event.gameId, chainId: event.chainId, contract: wallet(event.contract), transactionHash: chainHash(event.transactionHash), logIndex: event.logIndex, blockNumber: event.blockNumber, blockHash: chainHash(event.blockHash), timestamp: event.timestamp };
}
/** Pure processor. Call only with canonical finalized evidence read by the worker.
 * Persistence atomically stores its result and event receipt under a game revision.
 */
export function processEvent(input: {
  game: Game; event: ChainEvent; canonicalBlock: FinalizedBlock; round?: Round;
  pull?: StoredPull; nextBlock?: FinalizedBlock; secret?: string;
}): EventEffect {
  const { game, event, canonicalBlock, round, pull } = input;
  assertEvent(game, event, canonicalBlock);
  if (round) assertRound(game, round);
  if (event.kind === 'revealed') {
    if (!round || event.roundId !== round.id || event.timestamp < round.endsAt || chainHash(event.secretKeyHash) !== `0x${round.secretHash}` || secretHash(event.secret.replace(/^0x/, '')) !== round.secretHash) throw new IgnoredReveal('Untrusted or premature round reveal');
    return { reveal: { roundId: round.id, secret: bareHash(event.secret.replace(/^0x/, '')) } };
  }
  uint(event.nonce);
  if (event.kind === 'requested') {
    if (pull) throw new Error('Nonce already exists; replay must use the event receipt');
    uint(event.price); const player = wallet(event.player);
    // The legacy contract does not enforce the off-chain pack catalogue. Unknown
    // payments must not jam the indexer or be assigned the nearest-priced box.
    const refusal = !round || event.timestamp < round.startsAt || event.timestamp >= round.endsAt ? 'outside_round' : !round.boxes.some(b => atomicUsd(b.priceUsd) === event.price) ? 'unconfigured_pack' : null;
    if (refusal) return { pull: { gameId: game.id, nonce: event.nonce, player, price: event.price, request: position(event), roundId: null, status: 'pending', refusal }, job: { gameId: game.id, key: `refund:${event.nonce}`, nonce: event.nonce, kind: 'refund' } };
    const next = input.nextBlock;
    if (!round) throw new Error('Round missing');
    if (!next || BigInt(next.number) !== BigInt(event.blockNumber) + BigInt(1) || chainHash(next.parentHash) !== chainHash(event.blockHash) || next.timestamp < event.timestamp || next.timestamp % 1000 !== 0) throw new Error('Canonical following block is required');
    if (!input.secret || secretHash(input.secret) !== round.secretHash) throw new Error('Secret does not match commitment');
    const box = boxForPayment(round.boxes, event.price), catalogue = round.boxes.find(b => b.boxId === box.boxId)!;
    const result = draw({ secretKey: input.secret, roundHash: round.hash, nonce: event.nonce, walletAddress: player, txHash: chainHash(event.transactionHash), blockHash: chainHash(next.hash) }, box.cards);
    const card = box.cards.find(c => c.cardNumber === result.cardNumber)!;
    const prizeAmount = atomicUsd(card.valueUsd);
    const source: RandomnessSource = { boxConfigsHash: `0x${round.configHash}`, randomness: `0x${result.randomness}`, roundHash: `0x${round.hash}`, roundSecretKeyHash: `0x${round.secretHash}`, pullTxHash: chainHash(event.transactionHash), pullNextBlockHash: chainHash(next.hash), pullNextBlockTimestamp: String(next.timestamp / 1000) };
    return { pull: { gameId: game.id, nonce: event.nonce, player, price: event.price, roundId: round.id, seasonId: round.seasonId, catalogueVersion: round.catalogueVersion, status: 'pending', request: position(event), boxId: box.boxId, pack: catalogue.pack, itemId: catalogue.items[card.cardNumber], cardNumber: card.cardNumber, prizeAmount, source, commitment: pullCommitment(source, card.cardNumber, prizeAmount) }, job: { key: `fulfill:${event.nonce}`, gameId: game.id, nonce: event.nonce, kind: 'fulfill' } };
  }
  if (!pull || pull.gameId !== game.id || pull.nonce !== event.nonce) throw new Error('Missing game-scoped request');
  if (BigInt(event.blockNumber) < BigInt(pull.request.blockNumber) || (event.blockNumber === pull.request.blockNumber && event.logIndex <= pull.request.logIndex)) throw new Error('Settlement precedes request');
  if ('refusal' in pull) {
    if (event.kind !== 'refunded' || pull.status !== 'pending' || wallet(event.player) !== pull.player || event.price !== pull.price) throw new Error('Rejected request requires matching refund');
    return { pull: { ...pull, status: 'refunded' }, cancelJobsForNonce: pull.nonce };
  }
  if (event.kind === 'burned') {
    if (pull.status !== 'fulfilled' || pull.redeemed || event.prizeTokenAmount !== pull.prizeTokenAmount) throw new Error('Invalid redemption event');
    // A transferee may redeem. Opening credit remains with the original opener.
    wallet(event.owner); return { pull: { ...pull, redeemed: true } };
  }
  if (wallet(event.player) !== pull.player || pull.status !== 'pending') throw new Error('Conflicting settlement');
  if (event.kind === 'refunded') {
    if (event.price !== pull.price) throw new Error('Refund amount mismatch');
    return { pull: { ...pull, status: 'refunded' }, cancelJobsForNonce: pull.nonce };
  }
  uint(event.prizeTokenAmount);
  if (BigInt(event.blockNumber) < BigInt(pull.request.blockNumber) + BigInt(2) || event.roundId !== pull.roundId || event.boxId !== pull.boxId || event.cardNumber !== pull.cardNumber || event.prizeAmount !== pull.prizeAmount || pullCommitment(event.source, event.cardNumber, event.prizeAmount) !== pull.commitment) throw new Error('Fulfillment does not match frozen draw');
  const blockNumber = Number(event.blockNumber);
  if (!Number.isSafeInteger(blockNumber)) throw new Error('Opening block exceeds application range');
  return {
    pull: { ...pull, status: 'fulfilled', prizeTokenAmount: event.prizeTokenAmount }, cancelJobsForNonce: pull.nonce,
    opening: { id: `${game.id}:${pull.nonce}`, domain: game.domain, seasonId: pull.seasonId, catalogueVersion: pull.catalogueVersion, pack: pull.pack, itemId: pull.itemId, opener: pull.player, chainId: game.chainId, contractAddress: game.contract, transactionHash: chainHash(event.transactionHash), logIndex: event.logIndex, blockHash: chainHash(event.blockHash), blockNumber, tokenId: pull.nonce, openedAt: pull.request.timestamp, settlement: 'finalized', source: 'chain' },
  };
}
/** Explicit projection: no secret reference, live secret or unrevealed draw ever
 * escapes through a spread of a database row. The verifier uses this same gate. */
export function publicRound(round: Round, now: number, verifiedReveal?: string) {
  const secret = Number.isSafeInteger(now) && now >= round.endsAt && verifiedReveal && secretHash(verifiedReveal) === round.secretHash ? verifiedReveal : null;
  return { id: round.id, gameId: round.gameId, seasonId: round.seasonId, catalogueVersion: round.catalogueVersion, startsAt: round.startsAt, endsAt: round.endsAt, previousHash: round.previousHash, secretHash: round.secretHash, configHash: round.configHash, hash: round.hash, boxes: round.boxes, secret };
}
export function verifyPull(round: Round, pull: FrozenPull, now: number, verifiedReveal?: string) {
  const published = publicRound(round, now, verifiedReveal);
  if (!published.secret || pull.status !== 'fulfilled') return { available: false as const };
  if (pull.gameId !== round.gameId || pull.roundId !== round.id || configHash(round.boxes) !== round.configHash || roundHash(round.previousHash, round.id, round.secretHash, round.configHash) !== round.hash) throw new Error('Verification round mismatch');
  const box = boxForPayment(round.boxes, pull.price);
  const result = draw({ secretKey: published.secret, roundHash: round.hash, nonce: pull.nonce, walletAddress: pull.player, txHash: pull.source.pullTxHash, blockHash: pull.source.pullNextBlockHash }, box.cards);
  const card = box.cards.find(c => c.cardNumber === result.cardNumber)!;
  const valid = box.boxId === pull.boxId && card.cardNumber === pull.cardNumber && atomicUsd(card.valueUsd) === pull.prizeAmount && `0x${result.randomness}` === pull.source.randomness && pull.source.roundHash === `0x${round.hash}` && pull.source.boxConfigsHash === `0x${round.configHash}` && pull.source.roundSecretKeyHash === `0x${round.secretHash}` && pullCommitment(pull.source, pull.cardNumber, pull.prizeAmount) === pull.commitment;
  return { available: true as const, valid, round: published, nonce: pull.nonce, player: pull.player, source: pull.source, cardNumber: pull.cardNumber, prizeAmount: pull.prizeAmount, commitment: pull.commitment };
}
