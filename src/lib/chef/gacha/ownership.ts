import type { SupabaseClient } from '@supabase/supabase-js';
import { decodeEventLog, encodeEventTopics, type Address, type PublicClient } from 'viem';
import type { ChainPosition, FinalizedBlock, Game } from './settlement';
import type { ChainReader, GachaStore } from './worker';
import { chainHash, uint, wallet } from './protocol';

// Standard ERC-721 event used by PullGame (_mint uses tokenId = pull nonce).
// https://eips.ethereum.org/EIPS/eip-721
export const nftTransferAbi = [{ type: 'event', name: 'Transfer', anonymous: false, inputs: [
  { name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'tokenId', type: 'uint256', indexed: true },
] }] as const;
export interface NftTransfer extends ChainPosition { tokenId: string; from: string; to: string }
export interface OwnershipCursor { start: string; number: string | null; hash: string | null }
export interface OwnershipStore {
  cursor(game: string): Promise<OwnershipCursor | undefined>;
  commit(game: string, start: string, block: FinalizedBlock, transfers: readonly NftTransfer[]): Promise<boolean>;
}
export class SupabaseOwnershipStore implements OwnershipStore {
  constructor(private readonly db: SupabaseClient) {}
  async cursor(game: string): Promise<OwnershipCursor | undefined> {
    const result = await this.db.from('diner_gacha_ownership_cursors').select('*').eq('game_id', game).maybeSingle();
    if (result.error) throw new Error('Ownership cursor unavailable');
    const r = result.data;
    // Supabase represents numeric columns as JSON numbers. Reject imprecise reads.
    for (const value of [r?.start_block, r?.block_number]) if (value != null && typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Ownership block exceeds safe range');
    return r ? { start: String(r.start_block), number: r.block_number === null ? null : String(r.block_number), hash: r.block_hash } : undefined;
  }
  async commit(game: string, start: string, block: FinalizedBlock, transfers: readonly NftTransfer[]) {
    const result = await this.db.rpc('diner_gacha_ownership_block', { p_game: game, p_start: start, p_block: block, p_events: transfers });
    if (result.error) throw new Error('Ownership block commit unavailable');
    return result.data === true;
  }
}
export function viemTransferReader(client: PublicClient) {
  const topic = encodeEventTopics({ abi: nftTransferAbi, eventName: 'Transfer' })[0];
  return async (game: Game, block: FinalizedBlock): Promise<NftTransfer[]> => {
    if (await client.getChainId() !== game.chainId) throw new Error('Ownership RPC chain mismatch');
    const logs = await client.getLogs({ address: game.contract as Address, fromBlock: BigInt(uint(block.number)), toBlock: BigInt(block.number) });
    return logs.filter(log => log.topics[0] === topic).map(log => {
      if (log.removed || log.blockHash !== block.hash || log.blockNumber?.toString() !== block.number || log.logIndex === null || !log.transactionHash || wallet(log.address) !== wallet(game.contract)) throw new Error('Noncanonical ownership event');
      const { args } = decodeEventLog({ abi: nftTransferAbi, data: log.data, topics: log.topics, strict: true });
      return { gameId: game.id, chainId: game.chainId, contract: game.contract.toLowerCase(), blockNumber: block.number, blockHash: chainHash(block.hash),
        transactionHash: chainHash(log.transactionHash), logIndex: log.logIndex, timestamp: block.timestamp,
        tokenId: args.tokenId.toString(), from: args.from.toLowerCase(), to: args.to.toLowerCase() };
    });
  };
}
/** Ownership follows the fully committed settlement cursor. This handles ERC-721
 * mint BEFORE PullFulfilled in one transaction, including immediate reinvest burn.
 * Commit all transfers and the cursor atomically; never expose half a block. */
export async function ingestOwnershipBlock(ports: {
  store: Pick<GachaStore, 'game' | 'halt'>; ownership: OwnershipStore;
  chain: Pick<ChainReader, 'block' | 'finalizedHead'>;
  transfers(game: Game, block: FinalizedBlock): Promise<NftTransfer[]>;
}, gameId: string, deploymentBlock: string) {
  uint(deploymentBlock);
  const saved = await ports.store.game(gameId), game = saved.definition;
  if (saved.halted) return { status: 'halted' as const };
  if (!saved.cursor) return { status: 'waiting_for_settlement' as const };
  const checkpoint = await ports.chain.block(game, saved.cursor.number);
  const final = BigInt(uint(await ports.chain.finalizedHead(game)));
  if (checkpoint.hash !== saved.cursor.hash || BigInt(checkpoint.number) > final) {
    await ports.store.halt(gameId, 'ownership_settlement_history_changed'); return { status: 'halted' as const };
  }
  const cursor = await ports.ownership.cursor(gameId);
  if (cursor && cursor.start !== deploymentBlock) throw new Error('Ownership deployment block changed');
  if (cursor?.number) {
    const prior = await ports.chain.block(game, cursor.number);
    if (prior.hash !== cursor.hash) { await ports.store.halt(gameId, 'ownership_finalized_history_changed'); return { status: 'halted' as const }; }
  }
  const number = cursor?.number !== null && cursor?.number !== undefined ? (BigInt(cursor.number) + BigInt(1)).toString() : deploymentBlock;
  if (BigInt(number) > BigInt(saved.cursor.number)) return { status: 'caught_up' as const };
  const block = await ports.chain.block(game, number);
  if (block.number !== number || (cursor?.hash && cursor.hash !== block.parentHash)) {
    await ports.store.halt(gameId, 'ownership_parent_changed'); return { status: 'halted' as const };
  }
  const transfers = (await ports.transfers(game, block)).sort((a, b) => a.logIndex - b.logIndex);
  await ports.ownership.commit(gameId, deploymentBlock, block, transfers);
  return { status: 'advanced' as const, block: number, transfers: transfers.length };
}
