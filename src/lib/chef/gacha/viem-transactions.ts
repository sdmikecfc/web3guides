import { TransactionReceiptNotFoundError, type Address, type PublicClient } from 'viem';
import type { TransactionTransport } from './custody';

/** Actual RPC transport; its client and approved chain are explicitly supplied.
 * No defaults, URLs, credentials or production broadcast loop live in this file. */
export function viemTransactionTransport(client: PublicClient, chainId: number): TransactionTransport {
  async function checkChain() { if (await client.getChainId() !== chainId) throw new Error('Transaction RPC chain mismatch'); }
  return {
    async pendingNonce(signer) {
      await checkChain();
      return client.getTransactionCount({ address: signer as Address, blockTag: 'pending' });
    },
    async prepare(call, signer, nonce) {
      await checkChain();
      if (call.chainId !== chainId) throw new Error('Transaction call chain mismatch');
      const [gas, fees] = await Promise.all([
        client.estimateGas({ account: signer as Address, to: call.to, data: call.data, value: BigInt(0), nonce }),
        client.estimateFeesPerGas({ type: 'eip1559', chain: null }),
      ]);
      return { ...call, type: 'eip1559', nonce, gas: ((gas * BigInt(120) + BigInt(99)) / BigInt(100)).toString(),
        maxFeePerGas: fees.maxFeePerGas.toString(), maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString() };
    },
    async broadcast(raw) { await checkChain(); return client.sendRawTransaction({ serializedTransaction: raw }); },
    async observe(hash) {
      await checkChain();
      let receipt;
      try { receipt = await client.getTransactionReceipt({ hash }); }
      catch (error) { if (error instanceof TransactionReceiptNotFoundError) return { status: 'pending' }; throw error; }
      if (receipt.transactionHash !== hash || !['success', 'reverted'].includes(receipt.status)) throw new Error('Receipt hash or status mismatch');
      const finalized = await client.getBlock({ blockTag: 'finalized' });
      if (receipt.blockNumber > finalized.number) return { status: 'pending' };
      const canonical = await client.getBlock({ blockNumber: receipt.blockNumber });
      if (!canonical.hash || canonical.hash !== receipt.blockHash || canonical.number !== receipt.blockNumber) throw new Error('Finalized receipt changed');
      return { status: receipt.status === 'success' ? 'confirmed' : 'reverted', hash, block: receipt.blockNumber.toString(), blockHash: canonical.hash };
    },
  };
}
