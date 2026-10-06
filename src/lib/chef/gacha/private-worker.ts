import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicClient } from 'viem';
import { gameFromSeason } from './catalogue';
import { JournaledGachaSigner, type CustodyPolicy, type SignOnlyCustody } from './custody';
import { runGachaMaintenance, type MaintenancePolicy } from './maintenance';
import { SupabaseGachaStore } from './supabase-store';
import { SupabaseTransactionJournal } from './supabase-custody';
import { SupabaseRoundSecrets } from './vault-secrets';
import { viemChainReader } from './viem-reader';
import { viemTransactionTransport } from './viem-transactions';
import { ingestOwnershipBlock, SupabaseOwnershipStore, viemTransferReader } from './ownership';

/** Explicit assembly for an approved private worker host. Merely importing or
 * constructing this factory does no I/O. No env fallback, route or cron is added.
 * The caller supplies a service-role DB, chain RPC, sign-only custody integration
 * and approved gas budget. Existing public release gates remain separate. */
export function createPrivateGachaWorker(input: {
  db: SupabaseClient; rpc: PublicClient; custody: SignOnlyCustody; policy: CustodyPolicy;
}) {
  const store = new SupabaseGachaStore(input.db);
  const policy = structuredClone(input.policy);
  const ports = {
    store, chain: viemChainReader(input.rpc), secrets: new SupabaseRoundSecrets(input.db),
    signer: new JournaledGachaSigner(new SupabaseTransactionJournal(input.db), viemTransactionTransport(input.rpc, policy.chainId), input.custody, policy),
  };
  const ownershipPorts = { store, chain: ports.chain, ownership: new SupabaseOwnershipStore(input.db), transfers: viemTransferReader(input.rpc) };
  return {
    async run(gameId: string, maintenance: MaintenancePolicy) {
      const approved = policy.games.find(g => g.id === gameId);
      const configured = gameFromSeason(maintenance.season);
      if (!approved || approved.chainId !== configured.chainId || approved.domain !== configured.domain || approved.contract.toLowerCase() !== configured.contract.toLowerCase()) throw new Error('Worker season is not approved');
      // Verify persisted routing before ingesting events or reading any secret.
      const saved = (await store.game(gameId)).definition;
      if (saved.chainId !== approved.chainId || saved.domain !== approved.domain || saved.contract.toLowerCase() !== approved.contract.toLowerCase()) throw new Error('Worker registration changed');
      const result = await runGachaMaintenance(ports, gameId, maintenance);
      if (result.status === 'halted') return { ...result, ownership: 'halted' };
      let ownership: string = 'caught_up';
      try {
        for (let i = 0; i < (maintenance.blockBudget ?? 8); i++) {
          ownership = (await ingestOwnershipBlock(ownershipPorts, gameId, maintenance.deploymentBlock)).status;
          if (ownership !== 'advanced') break;
        }
      } catch { ownership = 'retry_required'; }
      return { ...result, status: ownership === 'halted' ? 'halted' as const : ownership === 'retry_required' ? 'retry_required' as const : result.status, ownership };
    },
  };
}
