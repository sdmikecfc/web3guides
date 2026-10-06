/** Pure finite-pool checks. No network, credentials, database writes, or transfers. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEqualEventTruck, createRewardManifest, depthWeight, enterRewardEvent, reconcilePayoutReceipts, replayRewardEvent, rewardRulesDigest, validateEventEvidence, RewardEventError, type RewardEvent, type ReviewedEventEvidence, type ConfirmedPayoutReceipt } from "../src/lib/chef/reward-events";

const wallet = (n: number) => `0x${n.toString(16).padStart(40,"0")}`;
const hash = (n: number) => `0x${n.toString(16).padStart(64,"0")}`;
const start = Date.UTC(2026,8,20), end = start + 14*86_400_000;
const event: RewardEvent = {version:1,id:"truck-reviewed-test",chainId:97477,token:wallet(11),escrow:wallet(12),domain:"test.invalid",startsAt:start,endsAt:end,poolAtomic:"100000000000000000000000000000000000000000000000000007",rulesDigest:rewardRulesDigest()};
const evidence: ReviewedEventEvidence = {
  funding:{eventId:event.id,chainId:event.chainId,token:event.token,escrow:event.escrow,amountAtomic:event.poolAtomic,transactionHash:hash(1),blockHash:hash(2),verifiedAt:start-1},
  rights:{eventId:event.id,domain:event.domain,agreementDigest:hash(3),expiresAt:end,reviewedBy:"test-reviewer"},
  cohort:{eventId:event.id,wallets:[wallet(1),wallet(2),wallet(3),wallet(4)],reviewDigest:hash(4),reviewedBy:"test-reviewer",closedAt:start-1},
};
const rows = () => [3,6,8,2].map((depth,i)=>({wallet:wallet(i+1),bestDepth:depth,eventId:event.id,rulesDigest:event.rulesDigest}));
const rejects = (f:()=>unknown,code:string) => assert.throws(f,e=>e instanceof RewardEventError && e.code===code);
const run = (label:string,f:()=>void) => {f();console.log(`ok ${label}`);};

run("scoring counts best service depth, excludes markets, and bounds advantage",()=>{
  assert.deepEqual(Array.from({length:9},(_,i)=>depthWeight(i)),[0,0,0,100,100,100,110,110,125]);
  rejects(()=>depthWeight(12),"invalid_depth");rejects(()=>depthWeight(NaN),"invalid_depth");
});
run("entry requires funded matching chain/token, domain rights, and reviewed fixed cohort",()=>{
  validateEventEvidence(event,evidence);
  const missingFunds=structuredClone(evidence);missingFunds.funding.amountAtomic="1";rejects(()=>validateEventEvidence(event,missingFunds),"funding_missing");
  const wrongToken=structuredClone(evidence);wrongToken.funding.token=wallet(99);rejects(()=>validateEventEvidence(event,wrongToken),"funding_missing");
  const expired=structuredClone(evidence);expired.rights.expiresAt=end-1;rejects(()=>validateEventEvidence(event,expired),"rights_missing");
  const duplicates=structuredClone(evidence);duplicates.cohort.wallets.push(wallet(1));rejects(()=>validateEventEvidence(event,duplicates),"cohort_missing");
  rejects(()=>enterRewardEvent(event,evidence,wallet(99),start),"not_eligible");
  rejects(()=>enterRewardEvent(event,evidence,wallet(1),end),"event_closed");
});
run("equal event kit is independent of owned equipment, upgrades, and recipes",()=>{
  const first=enterRewardEvent(event,evidence,wallet(1),start),second=enterRewardEvent(event,evidence,wallet(2),start);
  assert.deepEqual(first.truck.progress,second.truck.progress);
  assert.deepEqual(first.truck.progress.techLevels,{prep:0,cook:0,service:0});
  assert.ok(first.truck.progress.unlockedMachineIds.includes("fryer"));assert.ok(first.truck.progress.unlockedMachineIds.includes("drinks"));
  first.truck.progress.techLevels.cook=3;assert.equal(second.truck.progress.techLevels.cook,0);
  rejects(()=>replayRewardEvent(second,event,evidence,[{type:"upgrade",tech:"cook"}],start),"event_loadout_fixed");
  rejects(()=>replayRewardEvent(second,event,evidence,[{type:"start",node:1,practice:true}],start),"event_loadout_fixed");
  assert.deepEqual(createEqualEventTruck(start).progress,second.truck.progress);
});
run("event replays retain best depth only and never expose normal-mode grants",()=>{
  let entry=enterRewardEvent(event,evidence,wallet(1),start);
  entry.bestDepth=6;entry.truck.progress.bestDay=6;
  entry=replayRewardEvent(entry,event,evidence,[{type:"start",node:1}],start);
  assert.equal(entry.bestDepth,6);assert.deepEqual(entry.truck.progress.run!.loadout.recipeLevels,{});
  entry=replayRewardEvent(entry,event,evidence,[{type:"abandon"}],start);
  entry=replayRewardEvent(entry,event,evidence,[{type:"start",node:1}],start);
  assert.equal(entry.bestDepth,6,"repeated runs never add their depths");
  const market=enterRewardEvent(event,evidence,wallet(2),start);market.truck.progress.nextNode=3;
  const visited=replayRewardEvent(market,event,evidence,[{type:"marketVisit",node:3}],start);
  assert.equal(visited.bestDepth,0,"a route stop is not a service-day clear");
  assert.deepEqual(Object.keys(visited).sort(),["eventId","rulesDigest","wallet","bestDepth","truck"].sort());
  assert.equal((visited as any).coinDelta,undefined);assert.equal((visited as any).stockGrants,undefined);assert.equal((visited as any).homeGrants,undefined);
});
run("large atomic pools allocate exactly once with deterministic fair rounding",()=>{
  const manifest=createRewardManifest(event,evidence,rows(),end);
  assert.equal(manifest.allocations.length,3);assert.equal(manifest.allocatedAtomic,event.poolAtomic);assert.equal(manifest.unallocatedAtomic,"0");
  assert.equal(manifest.allocations.reduce((sum,row)=>sum+BigInt(row.amountAtomic),BigInt(0)).toString(),event.poolAtomic);
  assert.deepEqual(createRewardManifest(event,evidence,rows().reverse(),end+1000),manifest);
  assert.ok(Object.isFrozen(manifest));assert.ok(Object.isFrozen(manifest.allocations));assert.ok(Object.isFrozen(manifest.allocations[0]));
  const repeated=rows();repeated.push(rows()[0]);rejects(()=>createRewardManifest(event,evidence,repeated,end),"duplicate_entry");
  rejects(()=>createRewardManifest(event,evidence,rows(),end-1),"event_open");
});
run("small pool and zero qualifying players never overallocate or divide by zero",()=>{
  const tiny={...event,poolAtomic:"2"},tinyEvidence=structuredClone(evidence);tinyEvidence.funding.amountAtomic="2";
  const manifest=createRewardManifest(tiny,tinyEvidence,rows(),end);
  assert.equal(manifest.allocatedAtomic,"2");assert.deepEqual(manifest.allocations.map(a=>a.amountAtomic),["0","1","1"]);
  assert.equal(reconcilePayoutReceipts(manifest,[]).pendingWallets.length,2,"zero-unit rounding entries do not require a pointless transfer");
  const empty=createRewardManifest(event,evidence,[],end);assert.equal(empty.allocatedAtomic,"0");assert.equal(empty.unallocatedAtomic,event.poolAtomic);
});
run("confirmed receipts reconcile exact immutable allocations and reject double payment",()=>{
  const manifest=createRewardManifest(event,evidence,rows(),end),allocation=manifest.allocations[0];
  const receipt:ConfirmedPayoutReceipt={manifestDigest:manifest.digest,wallet:allocation.wallet,amountAtomic:allocation.amountAtomic,chainId:event.chainId,token:event.token,transactionHash:hash(8),logIndex:0,blockHash:hash(9)};
  const single=reconcilePayoutReceipts(manifest,[receipt]);assert.deepEqual(reconcilePayoutReceipts(manifest,[receipt,receipt]),single);
  assert.equal(single.paidAtomic,allocation.amountAtomic);assert.equal(single.pendingWallets.length,2);
  rejects(()=>reconcilePayoutReceipts(manifest,[{...receipt,amountAtomic:"1"}]),"invalid_receipt");
  rejects(()=>reconcilePayoutReceipts(manifest,[receipt,{...receipt,transactionHash:hash(10)}]),"duplicate_payout");
  const second={...receipt,wallet:manifest.allocations[1].wallet,amountAtomic:manifest.allocations[1].amountAtomic};
  rejects(()=>reconcilePayoutReceipts(manifest,[receipt,second]),"duplicate_payout");
  rejects(()=>reconcilePayoutReceipts({...manifest,poolAtomic:"1"},[receipt]),"manifest_changed");
});
run("deployed event discovery is closed without real verification adapters",()=>{
  const source=readFileSync("src/lib/chef/authority-server.ts","utf8");
  assert.match(source,/function verifiedTruckEvent[\s\S]*?return null;/);
  assert.match(source,/fundingVerified: false, domainRightsVerified: false, cohortReviewed: false/);
  const route=readFileSync("src/app/api/chef/truck/event/route.ts","utf8");assert.doesNotMatch(route,/export (async )?function POST/);
});
console.log("PASS finite reward-event checks (no live funding, chain verification, or transfer tested)");
