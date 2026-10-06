import { decodeEventLog, encodeEventTopics, type PublicClient, type Address } from 'viem';
import { pullGameAbi } from './pull-game-abi';
import { chainHash, uint } from './protocol';
import type { ChainEvent, FinalizedBlock, Game } from './settlement';
import type { ChainReader } from './worker';

/** Read-only adapter. The configured RPC must support a trustworthy finalized
 * block tag for this chain. Failure does NOT fall back to latest/zero confirmations.
 */
export function viemChainReader(client: PublicClient): ChainReader {
  async function checkChain(game: Game) { if (await client.getChainId() !== game.chainId) throw new Error('RPC chain does not match registered game'); }
  async function block(game: Game, number: string): Promise<FinalizedBlock> {
    await checkChain(game);
    const value = await client.getBlock({ blockNumber: BigInt(uint(number)) });
    const timestamp = Number(value.timestamp) * 1000;
    if (!value.hash || value.number.toString() !== number || !Number.isSafeInteger(timestamp)) throw new Error('Invalid canonical block');
    return { number, hash: value.hash, timestamp, parentHash: value.parentHash };
  }
  const eventAbis = pullGameAbi.filter(a => a.type === 'event');
  const topics = new Set(eventAbis.map(a => encodeEventTopics({ abi: [a], eventName: a.name })[0]));
  return {
    block,
    async finalizedHead(game) { await checkChain(game); return (await client.getBlock({ blockTag: 'finalized' })).number.toString(); },
    async head(game) { await checkChain(game); return (await client.getBlockNumber()).toString(); },
    async refundTimeout(game) { await checkChain(game); return (await client.readContract({ address: game.contract as Address, abi: pullGameAbi, functionName: 'refundTimeoutBlocks' })).toString(); },
    async pull(game, nonce) {
      await checkChain(game);
      const p = await client.readContract({ address: game.contract as Address, abi: pullGameAbi, functionName: 'getPull', args: [BigInt(uint(nonce))] });
      const states = ['none', 'pending', 'fulfilled', 'refunded'] as const;
      if (!states[p.status]) throw new Error('Unknown contract pull state');
      return { status: states[p.status], player: p.player, price: p.price.toString(), blockNumber: p.blockNumber.toString(), commitment: p.commitmentHash };
    },
    async events(game, number) {
      const b = await block(game, number);
      const logs = await client.getLogs({ address: game.contract as Address, fromBlock: BigInt(number), toBlock: BigInt(number) });
      const result: ChainEvent[] = [];
      for (const log of logs) {
        if (!log.topics[0] || !topics.has(log.topics[0])) continue;
        if (log.removed || log.blockHash !== b.hash || log.blockNumber?.toString() !== number || log.logIndex === null || !log.transactionHash || log.address.toLowerCase() !== game.contract.toLowerCase()) throw new Error('Inconsistent RPC log');
        const decoded = decodeEventLog({ abi: pullGameAbi, topics: log.topics, data: log.data, strict: true });
        const base = { gameId: game.id, chainId: game.chainId, contract: game.contract, transactionHash: chainHash(log.transactionHash), logIndex: log.logIndex, blockNumber: number, blockHash: b.hash, timestamp: b.timestamp };
        switch (decoded.eventName) {
          case 'PullRequested': { const a = decoded.args; result.push({ ...base, kind: 'requested', nonce: a.nonce.toString(), player: a.player, price: a.price.toString() }); break; }
          case 'PullRefunded': { const a = decoded.args; result.push({ ...base, kind: 'refunded', nonce: a.nonce.toString(), player: a.player, price: a.price.toString() }); break; }
          case 'CardBurned': { const a = decoded.args; result.push({ ...base, kind: 'burned', nonce: a.tokenId.toString(), owner: a.owner, prizeTokenAmount: a.prizeTokenAmount.toString() }); break; }
          case 'RoundRevealed': { const a = decoded.args; result.push({ ...base, kind: 'revealed', roundId: a.roundId.toString(), secretKeyHash: a.secretKeyHash, secret: a.secret }); break; }
          case 'PullFulfilled': {
            const a = decoded.args, s = a.result.randomnessSource;
            result.push({ ...base, kind: 'fulfilled', nonce: a.nonce.toString(), player: a.player, roundId: a.roundId.toString(), boxId: a.boxId.toString(), cardNumber: a.result.cardNumber, prizeAmount: a.result.prizeAmount.toString(), prizeTokenAmount: a.result.prizeTokenAmount.toString(), source: { ...s, pullNextBlockTimestamp: s.pullNextBlockTimestamp.toString() } }); break;
          }
        }
      }
      return result;
    },
  };
}
