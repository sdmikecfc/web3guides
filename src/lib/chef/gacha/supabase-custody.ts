import type { SupabaseClient } from '@supabase/supabase-js';
import type { Hex } from 'viem';
import type { GachaContractCall } from './contract-calls';
import type { JournalTransaction, TransactionJournal, UnsignedGachaTransaction } from './custody';

/** Private service-role storage, never constructed in a browser component. */
export class SupabaseTransactionJournal implements TransactionJournal {
  constructor(private readonly db: SupabaseClient) {}
  private async rpc(name: string, args: Record<string, unknown>) {
    const result = await this.db.rpc(name, args);
    if (result.error) throw new Error('Gacha transaction storage unavailable');
    return result.data;
  }
  async get(key: string): Promise<JournalTransaction | undefined> {
    const result = await this.db.from('diner_gacha_transactions').select('*').eq('operation_key', key).maybeSingle();
    if (result.error) throw new Error('Gacha transaction storage unavailable');
    return result.data ?? undefined;
  }
  async reserve(key: string, game: string, signer: string, call: GachaContractCall, pendingNonce: number): Promise<JournalTransaction | null> {
    return this.rpc('diner_gacha_tx_reserve', { p_key: key, p_game: game, p_signer: signer, p_call: call, p_pending: pendingNonce });
  }
  async prepare(key: string, lease: string, transaction: UnsignedGachaTransaction) {
    return (await this.rpc('diner_gacha_tx_prepare', { p_key: key, p_lease: lease, p_unsigned: transaction })) === true;
  }
  async signed(key: string, lease: string, raw: Hex, hash: Hex) {
    return (await this.rpc('diner_gacha_tx_signed', { p_key: key, p_lease: lease, p_raw: raw, p_hash: hash })) === true;
  }
  async final(key: string, hash: Hex, status: 'confirmed' | 'reverted', block: string, blockHash: Hex) {
    return (await this.rpc('diner_gacha_tx_final', { p_key: key, p_hash: hash, p_status: status, p_block: block, p_block_hash: blockHash })) === true;
  }
  async retire(key: string, chain: number, signer: string) {
    return this.rpc('diner_gacha_tx_retire', { p_key: key, p_chain: chain, p_signer: signer });
  }
}
