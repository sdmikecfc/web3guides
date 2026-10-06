import type { DomainSeason } from '../diner/domain-seasons';
import type { CatalogueBox } from './settlement';
import { ingestNextBlock, runSettlementJob, type ChainReader, type SettlementSigner } from './worker';
import { queueEndedReveals, recoverStalledPurchase, rotateRound, runRevealJob, type OperationsStore, type RecoverySigner, type RevealSigner, type RoundSecretStore } from './operations';

export interface MaintenancePorts {
  store: OperationsStore; chain: ChainReader; secrets: RoundSecretStore;
  signer: SettlementSigner & RecoverySigner & RevealSigner;
}
export interface MaintenancePolicy {
  deploymentBlock: string; season: DomainSeason; boxes: readonly CatalogueBox[];
  blockBudget?: number; durationMs?: number; leadMs?: number;
}
/** One bounded private worker invocation, suitable for the later approved host.
 * No cron is registered here. Raw provider exceptions and secrets are never
 * returned in its diagnostics. Retry resumes from database/custody receipts.
 */
export async function runGachaMaintenance(ports: MaintenancePorts, gameId: string, policy: MaintenancePolicy, now = Date.now()) {
  const blockBudget = policy.blockBudget ?? 8;
  if (!Number.isSafeInteger(blockBudget) || blockBudget < 1 || blockBudget > 32 || !Number.isSafeInteger(now)) throw new Error('Invalid maintenance bounds');
  const stages: Record<string, string> = {};
  let indexedBlocks = 0;
  try { if ((await ports.store.game(gameId)).halted) return { status: 'halted' as const, indexedBlocks, stages }; }
  catch { return { status: 'retry_required' as const, indexedBlocks, stages: { configuration: 'unavailable' } }; }
  // A missing future round must not stop refunds or settlement of already-paid
  // requests. The contract stays public-gated until all deployment checks pass.
  try { stages.rotation = (await rotateRound(ports, gameId, policy.season, policy.boxes, now, policy.durationMs, policy.leadMs)).status; }
  catch { stages.rotation = 'retry_required'; }
  try {
    for (let i = 0; i < blockBudget; i++) {
      const result = await ingestNextBlock(ports, gameId, policy.deploymentBlock);
      stages.ingestion = result.status;
      if (result.status === 'halted') return { status: 'halted' as const, indexedBlocks, stages };
      if (result.status !== 'advanced') break;
      indexedBlocks++;
    }
  } catch { return { status: 'retry_required' as const, indexedBlocks, stages: { ...stages, ingestion: 'retry_required' } }; }
  try { stages.recovery = (await recoverStalledPurchase(ports, gameId)).status; }
  catch { stages.recovery = 'retry_required'; }
  try { stages.settlement = (await runSettlementJob(ports, gameId)).status; }
  catch { stages.settlement = 'retry_required'; }
  try {
    stages.revealQueue = String((await queueEndedReveals(ports, gameId, now)).queued);
    stages.reveal = (await runRevealJob(ports, gameId, now)).status;
  } catch { stages.reveal = 'retry_required'; }
  return { status: Object.values(stages).includes('halted') ? 'halted' as const : Object.values(stages).includes('retry_required') ? 'retry_required' as const : 'complete' as const, indexedBlocks, stages };
}
