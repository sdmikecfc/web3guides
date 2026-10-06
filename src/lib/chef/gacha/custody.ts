import { keccak256, parseTransaction, recoverTransactionAddress, type Hex } from 'viem';
import { assertGame, type Game } from './settlement';
import type { SettlementSigner } from './worker';
import type { RecoverySigner, RevealSigner } from './operations';
import { operationKey } from './operations';
import { revealCall, settlementCall, type GachaContractCall } from './contract-calls';
import { chainHash, uint, wallet } from './protocol';

export interface UnsignedGachaTransaction extends GachaContractCall {
  type: 'eip1559'; nonce: number; gas: string; maxFeePerGas: string; maxPriorityFeePerGas: string;
}
export interface JournalTransaction {
  operation_key: string; chain_id: number; signer: string; game_id: string | null;
  call: GachaContractCall | null; nonce: number | null; unsigned_tx: UnsignedGachaTransaction | null;
  raw_tx: Hex | null; transaction_hash: Hex | null;
  status: 'reserved' | 'signed' | 'confirmed' | 'reverted' | 'retired'; lease_token: string | null;
}
export interface TransactionJournal {
  get(key: string): Promise<JournalTransaction | undefined>;
  reserve(key: string, game: string, signer: string, call: GachaContractCall, pendingNonce: number): Promise<JournalTransaction | null>;
  prepare(key: string, lease: string, transaction: UnsignedGachaTransaction): Promise<boolean>;
  signed(key: string, lease: string, raw: Hex, hash: Hex): Promise<boolean>;
  final(key: string, hash: Hex, status: 'confirmed' | 'reverted', block: string, blockHash: Hex): Promise<boolean>;
  retire(key: string, chain: number, signer: string): ReturnType<RecoverySigner['retireOnce']>;
}
export interface TransactionTransport {
  pendingNonce(signer: string): Promise<number>;
  prepare(call: GachaContractCall, signer: string, nonce: number): Promise<UnsignedGachaTransaction>;
  broadcast(raw: Hex): Promise<Hex>;
  /** Only canonical FINALIZED receipts may report confirmed/reverted. */
  observe(hash: Hex): Promise<{ status: 'pending' } | { status: 'confirmed' | 'reverted'; hash: Hex; block: string; blockHash: Hex }>;
}
/** Approved HSM/managed-wallet integration must SIGN ONLY. It must never submit,
 * log or independently release the signed bytes. The journal owns broadcasting.
 * No private-key or environment-key fallback is provided. */
export interface SignOnlyCustody { sign(transaction: UnsignedGachaTransaction): Promise<Hex> }
export interface CustodyPolicy {
  chainId: number; signer: string; games: readonly Game[];
  maxGas: string; maxFeePerGas: string; maxTransactionFee: string;
}
export function toViemTransaction(t: UnsignedGachaTransaction) {
  return { type: t.type, chainId: t.chainId, to: t.to, data: t.data, value: BigInt(0), nonce: t.nonce,
    gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) } as const;
}
function sameCall(a: GachaContractCall, b: GachaContractCall) {
  return a.chainId === b.chainId && a.to.toLowerCase() === b.to.toLowerCase() && a.data.toLowerCase() === b.data.toLowerCase() && a.value === b.value;
}
function checkUnsigned(t: UnsignedGachaTransaction, call: GachaContractCall, nonce: number, policy: CustodyPolicy) {
  if (t.type !== 'eip1559' || !sameCall(t, call) || t.nonce !== nonce || !Number.isSafeInteger(nonce) || nonce < 0) throw new Error('custody_unsigned_mismatch');
  const gas = BigInt(uint(t.gas)), fee = BigInt(uint(t.maxFeePerGas)), tip = BigInt(uint(t.maxPriorityFeePerGas));
  if (gas <= BigInt(0) || fee <= BigInt(0) || gas > BigInt(policy.maxGas) || fee > BigInt(policy.maxFeePerGas) || tip > fee || gas * fee > BigInt(policy.maxTransactionFee)) throw new Error('custody_fee_limit');
}
export async function checkSigned(raw: Hex, t: UnsignedGachaTransaction, signer: string) {
  if (!/^0x02([0-9a-f]{2})+$/.test(raw) || raw.length > 32768) throw new Error('custody_signed_encoding');
  const parsed = parseTransaction(raw), wanted = toViemTransaction(t);
  if (parsed.type !== 'eip1559' || parsed.chainId !== wanted.chainId || parsed.nonce !== wanted.nonce || !parsed.to || wallet(parsed.to) !== wallet(wanted.to)
    || (parsed.data ?? '0x') !== wanted.data || (parsed.value ?? BigInt(0)) !== BigInt(0) || parsed.gas !== wanted.gas
    || parsed.maxFeePerGas !== wanted.maxFeePerGas || parsed.maxPriorityFeePerGas !== wanted.maxPriorityFeePerGas
    || (parsed.accessList?.length ?? 0) !== 0 || wallet(await recoverTransactionAddress({ serializedTransaction: raw as `0x02${string}` })) !== wallet(signer)) throw new Error('custody_signed_mismatch');
  return keccak256(raw);
}

/** One chain/signer instance may serve multiple approved games. The same address
 * must NOT be used by another wallet tool outside this journal. No gas bump or
 * automatic replacement is attempted; unresolved nonces require reviewed recovery. */
export class JournaledGachaSigner implements SettlementSigner, RevealSigner, RecoverySigner {
  private readonly policy: CustodyPolicy;
  constructor(private readonly journal: TransactionJournal, private readonly transport: TransactionTransport, private readonly custody: SignOnlyCustody, policy: CustodyPolicy, private readonly now = Date.now) {
    this.policy = { ...policy, signer: wallet(policy.signer).toLowerCase(), games: policy.games.map(g => ({ ...g })) };
    this.policy.games.forEach(assertGame);
    if (!Number.isSafeInteger(policy.chainId) || policy.chainId <= 0 || !policy.games.length || policy.games.some(g => g.chainId !== policy.chainId)
      || new Set(policy.games.map(g => g.id)).size !== policy.games.length || new Set(policy.games.map(g => g.contract.toLowerCase())).size !== policy.games.length
      || wallet(policy.signer) === '0x0000000000000000000000000000000000000000') throw new Error('Invalid custody policy');
    for (const value of [policy.maxGas, policy.maxFeePerGas, policy.maxTransactionFee]) if (BigInt(uint(value)) <= BigInt(0)) throw new Error('Invalid custody budget');
  }
  private game(game: Game) {
    const approved = this.policy.games.find(g => g.id === game.id);
    if (!approved || approved.chainId !== game.chainId || approved.domain !== game.domain || wallet(approved.contract) !== wallet(game.contract)) throw new Error('custody_game_not_approved');
  }
  async submitOnce(input: Parameters<SettlementSigner['submitOnce']>[0]) {
    this.game(input.game);
    if (input.idempotencyKey !== operationKey(input.game, `${input.operation}:${input.pull.nonce}`)) throw new Error('custody_operation_key');
    return this.submit(input.idempotencyKey, input.game, settlementCall(input.game, input.operation, input.pull));
  }
  async revealOnce(input: Parameters<RevealSigner['revealOnce']>[0]) {
    this.game(input.game);
    if (input.idempotencyKey !== operationKey(input.game, `reveal:${input.round.id}`)) throw new Error('custody_operation_key');
    return this.submit(input.idempotencyKey, input.game, revealCall(input.game, input.round, input.secret, this.now()));
  }
  private async submit(key: string, game: Game, originalCall: GachaContractCall) {
    // Normalize casing once; persisted bytes are otherwise immutable.
    const call = { ...originalCall, to: originalCall.to.toLowerCase() as Hex, data: originalCall.data.toLowerCase() as Hex };
    try {
      let row = await this.journal.get(key);
      if (!row || row.status === 'reserved') row = (await this.journal.reserve(key, game.id, this.policy.signer, call, await this.transport.pendingNonce(this.policy.signer))) ?? undefined;
      if (!row) throw new Error('busy');
      if (row.status === 'retired' || row.status === 'reverted' || row.game_id !== game.id || row.chain_id !== game.chainId || row.signer !== this.policy.signer || !row.call || !sameCall(row.call, call)) throw new Error('conflicting_operation');
      if (row.status === 'reserved') {
        if (row.nonce === null || !row.lease_token) throw new Error('lease_missing');
        const unsigned = row.unsigned_tx ?? await this.transport.prepare(call, this.policy.signer, row.nonce);
        checkUnsigned(unsigned, call, row.nonce, this.policy);
        // Freeze gas/fees before remote signing. An uncertain response retries the
        // identical transaction; stale workers can never publish their own copy.
        if (!await this.journal.prepare(key, row.lease_token, unsigned)) throw new Error('lease_lost');
        const raw = await this.custody.sign(unsigned);
        const hash = await checkSigned(raw, unsigned, this.policy.signer);
        if (!await this.journal.signed(key, row.lease_token, raw, hash)) throw new Error('lease_lost');
        row = { ...row, raw_tx: raw, transaction_hash: hash, unsigned_tx: unsigned, status: 'signed' };
      }
      if (!row.raw_tx || !row.transaction_hash || !row.unsigned_tx || row.nonce === null) throw new Error('signed_record_missing');
      checkUnsigned(row.unsigned_tx, call, row.nonce, this.policy);
      if (await checkSigned(row.raw_tx, row.unsigned_tx, this.policy.signer) !== row.transaction_hash) throw new Error('signed_record_corrupt');
      if (row.status === 'confirmed') return { transactionHash: row.transaction_hash };
      const observed = await this.transport.observe(row.transaction_hash);
      if (observed.status !== 'pending') {
        if (chainHash(observed.hash) !== row.transaction_hash) throw new Error('receipt_mismatch');
        await this.journal.final(key, row.transaction_hash, observed.status, uint(observed.block), chainHash(observed.blockHash));
        if (observed.status === 'reverted') throw new Error('transaction_reverted');
      } else if (chainHash(await this.transport.broadcast(row.raw_tx)) !== row.transaction_hash) throw new Error('broadcast_hash_mismatch');
      return { transactionHash: row.transaction_hash };
    } catch { throw new Error('Gacha transaction unavailable; retry the same operation'); }
  }
  async retireOnce(key: string): ReturnType<RecoverySigner['retireOnce']> {
    const game = this.policy.games.find(g => key.startsWith(operationKey(g, 'fulfill:')));
    if (!game || !/:[0-9]+$/.test(key)) throw new Error('custody_retirement_scope');
    try {
      const row = await this.journal.get(key);
      if (row && (row.signer !== this.policy.signer || row.chain_id !== this.policy.chainId)) throw new Error('scope');
      if (row?.status === 'signed' && row.transaction_hash) {
        const observed = await this.transport.observe(row.transaction_hash);
        if (observed.status !== 'pending') {
          if (chainHash(observed.hash) !== row.transaction_hash) throw new Error('receipt');
          await this.journal.final(key, row.transaction_hash, observed.status, uint(observed.block), chainHash(observed.blockHash));
        }
      }
      return await this.journal.retire(key, this.policy.chainId, this.policy.signer);
    } catch { return { state: 'unknown', idempotencyKey: key }; }
  }
}
