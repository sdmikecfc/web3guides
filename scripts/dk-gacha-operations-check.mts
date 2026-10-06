import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { decodeFunctionData } from 'viem';
import { settlementCall, revealCall } from '../src/lib/chef/gacha/contract-calls';
import { pullGameAbi } from '../src/lib/chef/gacha/pull-game-abi';
import { runGachaMaintenance } from '../src/lib/chef/gacha/maintenance';
import { domainBoxes } from '../src/lib/chef/gacha/catalogue';
import { DOMAIN_SEASONS, type DomainSeason } from '../src/lib/chef/diner/domain-seasons';
import { configHash, secretHash, sha256 } from '../src/lib/chef/gacha/protocol';
import { publicRound, verifyPull, type ChainEvent, type FrozenPull, type Game } from '../src/lib/chef/gacha/settlement';
import { ingestNextBlock, runSettlementJob, type ChainReader, type SettlementSigner } from '../src/lib/chef/gacha/worker';
import { nextRoundWindow, operationKey, queueEndedReveals, recoverStalledPurchase, rotateRound, runRevealJob, type RecoverySigner, type RevealSigner, type RoundSecretStore, type RoundTemplate } from '../src/lib/chef/gacha/operations';
import { GachaPostgresStore } from './fixtures/gacha-postgres-store';
import { block, fixtureRequest, game, hash, round, secret } from './fixtures/dk-gacha';

async function main() {
  const { PGlite } = createRequire(resolve(process.env.DK_PGLITE_ROOT ?? 'D:/Temp/dk-gacha-postgres-tests','package.json'))('@electric-sql/pglite');
  const db=new PGlite();
  const q=async(sql:string,args:unknown[]=[]):Promise<any[]> => (await db.query(sql,args)).rows;
  const rpc=async(name:string,args:unknown[]) => (await q(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as value`,args))[0].value;
  const store=new GachaPostgresStore(q,rpc);
  let groups=0;
  async function test(name:string,fn:()=>Promise<void>){await fn();groups++;console.log(`PASS ${name}`);}
  async function insertGame(g:Game){await q('insert into diner_gacha_games(id,domain,chain_id,contract,definition,halted) values($1,$2,$3,$4,$5,false)',[g.id,g.domain,g.chainId,g.contract,JSON.stringify(g)]);}
  const start=Date.now()+600000;
  function seasonFor(g:Game):DomainSeason{return {...DOMAIN_SEASONS.find(s=>s.domain===g.domain)!,id:`${g.id}-season`,startsAt:start,endsAt:start+600000,approved:true,contract:{chainId:g.chainId,address:g.contract},backingToken:{address:'0x9999999999999999999999999999999999999999',symbol:'TEST',decimals:18},protocolVersion:'test-legacy',feesApproved:true,fundingApproved:true};}
  const terms={regular:{boxId:'1000',priceUsd:5,prizeBudgetUsd:4.988},super:{boxId:'1001',priceUsd:10,prizeBudgetUsd:9.98}};
  const rotating:Game={...game,id:'rotate-gochujang',contract:'0x4444444444444444444444444444444444444444'};
  const rotationSeason=seasonFor(rotating),boxes=domainBoxes(rotating,terms);
  const secretsByKey=new Map<string,{reference:string;secret:string}>();
  let failVault=true,secretReads=0;
  const secrets:RoundSecretStore={
    createOnce:async key=>{
      let value=secretsByKey.get(key);
      if(!value){value={reference:`vault-test:${secretsByKey.size+1}`,secret:sha256(`SYNTHETIC TEST SECRET ${key}`)};secretsByKey.set(key,value);}
      if(failVault){failVault=false;throw Error('SIMULATED vault response lost');}
      return {reference:value.reference,hash:secretHash(value.secret)};
    },
    read:async reference=>{secretReads++;if(reference==='test-only-vault-reference')return secret;const value=[...secretsByKey.values()].find(v=>v.reference===reference);if(!value)throw Error('Unknown synthetic reference');return value.secret;},
  };
  try{
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    for(const file of ['20261005_domain_kitchen_gacha_foundation.sql','20261006_domain_kitchen_gacha_operations.sql','20261007_domain_kitchen_gacha_custody.sql','20261008_domain_kitchen_gacha_ownership.sql'])await db.exec(readFileSync(resolve('supabase/migrations',file),'utf8'));
    await insertGame(rotating);
    await test('Operational tables and every new RPC deny browser roles',async()=>{
      for(const role of ['anon','authenticated']){
        await db.exec(`set role ${role}`);
        for(const table of ['diner_gacha_round_intents','diner_gacha_reveal_jobs','diner_gacha_recoveries'])await assert.rejects(q(`select * from ${table}`),/permission denied/);
        for(const [name,args]of [['diner_gacha_pending_round',[rotating.id]],['diner_gacha_lease_reveal',[rotating.id]],['diner_gacha_lease_recovery',[rotating.id,'100','5']]]as const)await assert.rejects(rpc(name,[...args]),/permission denied/);
        await db.exec('reset role');
      }
      const grants=await q("select p.proname from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'diner_gacha_%' and has_function_privilege('anon',p.oid,'EXECUTE')");assert.equal(grants.length,0);
    });
    await test('Round windows are fixed, precommitted and never backfilled after downtime',async()=>{
      assert.deepEqual(nextRoundWindow(rotationSeason,undefined,start-10000,60000,1000),{startsAt:start,endsAt:start+60000});
      assert.deepEqual(nextRoundWindow(rotationSeason,undefined,start+61000,60000,1000),{startsAt:start+120000,endsAt:start+180000});
      assert.equal(nextRoundWindow(rotationSeason,undefined,rotationSeason.endsAt!,60000,1000),null);
      await assert.rejects(store.reserveRound({gameId:rotating.id,seasonId:'past',catalogueVersion:3,seasonStartsAt:0,seasonEndsAt:10000,startsAt:1,endsAt:9999,boxes,configHash:configHash(boxes)}),/gacha_round_must_be_future/);
    });
    await test('Lost vault response resumes the same frozen round and secret',async()=>{
      await assert.rejects(rotateRound({store,secrets},rotating.id,rotationSeason,boxes,Date.now(),60000,1000),/SIMULATED/);
      const pending=await store.pendingRound(rotating.id);assert(pending);assert.equal(secretsByKey.size,1);
      await assert.rejects(store.reserveRound({...pending.template,boxes:[{...boxes[0],boxId:'777'},boxes[1]]}),/gacha_round_intent_conflict/);
      const result=await rotateRound({store,secrets},rotating.id,rotationSeason,boxes,Date.now(),60000,1000);
      assert.equal(result.status,'committed');assert.equal(secretsByKey.size,1);
      assert.equal((await store.latestRound(rotating.id))?.definition.hash.length,64);
      assert.equal((await rotateRound({store,secrets},rotating.id,rotationSeason,boxes,Date.now(),60000,1000)).status,'up_to_date');
      assert.equal(secretReads,0);
    });
    await test('Concurrent rotation and lost database responses never duplicate a round',async()=>{
      const g:Game={...rotating,id:'rotate-smoothie',domain:'smoothie',contract:'0x5555555555555555555555555555555555555555'};await insertGame(g);
      const s=seasonFor(g),b=domainBoxes(g,terms);
      const values=await Promise.all([rotateRound({store,secrets},g.id,s,b,Date.now(),60000,1000),rotateRound({store,secrets},g.id,s,b,Date.now(),60000,1000)]);
      assert(values.every(v=>['committed','up_to_date'].includes(v.status)));
      assert.equal((await q('select * from diner_gacha_rounds where game_id=$1',[g.id])).length,1);
      const g2:Game={...rotating,id:'rotate-wines',domain:'wines',contract:'0x6666666666666666666666666666666666666666'};await insertGame(g2);
      store.failAfterRoundCommit=true;
      await assert.rejects(rotateRound({store,secrets},g2.id,seasonFor(g2),domainBoxes(g2,terms),Date.now(),60000,1000),/SIMULATED/);
      assert.equal((await rotateRound({store,secrets},g2.id,seasonFor(g2),domainBoxes(g2,terms),Date.now(),60000,1000)).status,'up_to_date');
      assert.equal((await q('select * from diner_gacha_rounds where game_id=$1',[g2.id])).length,1);
    });
    await test('Late secret creation expires safely instead of changing an active round',async()=>{
      const g:Game={...rotating,id:'expired-round',contract:'0x7777777777777777777777777777777777777777'};await insertGame(g);
      const startsAt=Date.now()+1500;
      const template:RoundTemplate={gameId:g.id,seasonId:'short-fixture',catalogueVersion:3,seasonStartsAt:startsAt,seasonEndsAt:startsAt+60000,startsAt,endsAt:startsAt+60000,boxes,configHash:configHash(boxes)};
      const intent=await store.reserveRound(template);
      await new Promise(resolve=>setTimeout(resolve,1600));
      assert.equal(await store.commitRound(intent,'vault-test:expired',secretHash('c'.repeat(64))),'expired');
      assert.equal(await store.latestRound(g.id),undefined);
      assert.equal(await store.pendingRound(g.id),undefined);
    });

    // A complete request -> fulfillment/refund -> reveal -> verification flow.
    // RPC and custody are synthetic; persistence uses the actual PostgreSQL RPCs.
    await insertGame(game);
    await q('insert into diner_gacha_rounds(game_id,round_id,definition,secret_ref) values($1,$2,$3,$4)',[game.id,round.id,JSON.stringify(round),'test-only-vault-reference']);
    const logs=new Map<string,ChainEvent[]>();
    const canonical=(n:string)=>Number(n)<102?block(n):{...block(n),timestamp:round.endsAt+(Number(n)-101)*1000};
    const onchain=new Map<string,{status:'pending'|'fulfilled'|'refunded';commitment:string}>();
    const chain:ChainReader={finalizedHead:async()=> '107',head:async()=> '107',refundTimeout:async()=> '5',block:async(_g,n)=>canonical(n),events:async(_g,n)=>logs.get(n)??[],pull:async(_g,n)=>({status:onchain.get(n)?.status??'pending',commitment:onchain.get(n)?.commitment??hash('zero'),player:fixtureRequest(n).player,price:'5000000',blockNumber:'100'})};
    const ports={store,chain,secrets};
    logs.set('100',[fixtureRequest(),{...fixtureRequest('2'),logIndex:1}]);
    await test('Ended round waits for indexed requests and pending purchases before reading a secret',async()=>{
      await ingestNextBlock(ports,game.id,'100');await ingestNextBlock(ports,game.id,'100');
      const p=await store.pull(game.id,'1')as FrozenPull;
      onchain.set('1',{status:'fulfilled',commitment:p.commitment});
      logs.set('102',[{...fixtureRequest(),kind:'fulfilled',transactionHash:hash('paid-one'),blockNumber:'102',blockHash:canonical('102').hash,timestamp:canonical('102').timestamp,roundId:p.roundId,boxId:p.boxId,cardNumber:p.cardNumber,prizeAmount:p.prizeAmount,prizeTokenAmount:'12345678901234567890123',source:p.source}]);
      await ingestNextBlock(ports,game.id,'100');
      const readsBefore=secretReads;
      assert.equal((await queueEndedReveals(ports,game.id,Date.now())).queued,0);
      const never:RevealSigner={revealOnce:async()=>{throw Error('Must not submit');}};
      assert.equal((await runRevealJob({store,secrets,signer:never},game.id,Date.now())).status,'idle');
      assert.equal(secretReads,readsBefore);
      assert.equal((await q('select * from diner_gacha_openings where game_id=$1',[game.id])).length,1);
    });
    let custodyState:'unknown'|'pending'|'retired'='unknown';
    const retiredKeys=new Set<string>();
    const retirement:RecoverySigner={retireOnce:async key=>{
      if(custodyState==='retired'){retiredKeys.add(key);return {state:'retired',idempotencyKey:key,reference:'test-final-retirement:1'};}
      return {state:custodyState,idempotencyKey:key};
    }};
    const due=()=>q("update diner_gacha_jobs set available_at=now()-interval '1 second' where game_id=$1",[game.id]);
    await test('Timed-out unknown and pending broadcasts are never assumed safe to refund',async()=>{
      for(const state of ['unknown','pending']as const){custodyState=state;await due();assert.equal((await recoverStalledPurchase({...ports,signer:retirement},game.id)).status,'awaiting_custody');}
      assert.equal((await q("select * from diner_gacha_jobs where game_id=$1 and kind='refund'",[game.id])).length,0);
      assert.equal((await q('select * from diner_gacha_recoveries')).length,0);
    });
    await test('Custody retirement fences stale fulfillers; lost refund-switch response is idempotent',async()=>{
      custodyState='retired';store.failAfterRefundSwitch=true;await due();
      await assert.rejects(recoverStalledPurchase({...ports,signer:retirement},game.id),/SIMULATED/);
      assert.equal((await recoverStalledPurchase({...ports,signer:retirement},game.id)).status,'idle');
      assert.equal((await q('select * from diner_gacha_recoveries where game_id=$1',[game.id])).length,1);
      assert.equal((await q("select * from diner_gacha_jobs where game_id=$1 and kind='refund'",[game.id])).length,1);
      const signer:SettlementSigner={submitOnce:async r=>{if(retiredKeys.has(r.idempotencyKey))throw Error('Custody key permanently retired');assert.equal(r.operation,'refund');return {transactionHash:hash('refund-two')};}};
      await assert.rejects(signer.submitOnce({idempotencyKey:operationKey(game,'fulfill:2'),game,operation:'fulfill',pull:(await store.pull(game.id,'2'))!}),/permanently retired/);
      assert.equal((await runSettlementJob({...ports,signer},game.id)).status,'submitted');
      const p=await store.pull(game.id,'2');assert(p);
      logs.set('103',[{...fixtureRequest('2'),kind:'refunded',blockNumber:'103',blockHash:canonical('103').hash,timestamp:canonical('103').timestamp,transactionHash:hash('refunded-two')}]);
      onchain.set('2',{status:'refunded',commitment:hash('zero')});
      await ingestNextBlock(ports,game.id,'100');
      assert.equal((await store.pull(game.id,'2'))?.status,'refunded');
    });
    let revealFailed=false,revealSubmissions=0;
    const revealIntents=new Map<string,string>();
    const signer:RevealSigner={revealOnce:async r=>{
      assert.equal(r.secret,secret);assert.equal(r.round.id,'1');
      if(!revealIntents.has(r.idempotencyKey)){revealSubmissions++;revealIntents.set(r.idempotencyKey,hash('reveal-one'));}
      if(!revealFailed){revealFailed=true;throw Error('SIMULATED reveal broadcast response lost');}
      return {transactionHash:revealIntents.get(r.idempotencyKey)!};
    }};
    await test('Reveal waits for all terminal outcomes, then retries the same custody operation',async()=>{
      assert.equal((await queueEndedReveals(ports,game.id,Date.now())).queued,1);
      assert.equal((await queueEndedReveals(ports,game.id,Date.now())).queued,0);
      const stale=await store.leaseReveal(game.id);assert(stale);assert.equal(await store.leaseReveal(game.id),null);
      await q("update diner_gacha_reveal_jobs set lease_until=now()-interval '1 second' where game_id=$1",[game.id]);
      const fresh=await store.leaseReveal(game.id);assert(fresh);assert.notEqual(fresh.lease,stale.lease);
      assert.equal(await store.finishReveal(stale,hash('stale-reveal'),undefined),false);
      assert.equal(await store.finishReveal(fresh,undefined,undefined),true);
      await q("update diner_gacha_reveal_jobs set available_at=now()-interval '1 second' where game_id=$1",[game.id]);
      await assert.rejects(runRevealJob({store,secrets,signer},game.id,Date.now()),/SIMULATED/);
      assert.equal((await store.round(game.id,'1'))?.revealedSecret,undefined);
      assert.equal(publicRound(round,Date.now()).secret,null);
      await q("update diner_gacha_reveal_jobs set available_at=now()-interval '1 second' where game_id=$1",[game.id]);
      assert.equal((await runRevealJob({store,secrets,signer},game.id,Date.now())).status,'submitted');
      assert.equal(revealSubmissions,1);
    });
    await test('Only finalized reveal publishes the proof and completes its durable job',async()=>{
      logs.set('104',[{...fixtureRequest(),kind:'revealed',roundId:'1',secretKeyHash:`0x${round.secretHash}`,secret:`0x${secret}`,transactionHash:hash('reveal-one'),blockNumber:'104',blockHash:canonical('104').hash,timestamp:canonical('104').timestamp}]);
      await ingestNextBlock(ports,game.id,'100');
      const r=await store.round(game.id,'1'),p=await store.pull(game.id,'1')as FrozenPull;assert(r);
      assert.equal(verifyPull(r.definition,p,Date.now(),r.revealedSecret).valid,true);
      assert.equal((await q('select status from diner_gacha_reveal_jobs where game_id=$1',[game.id]))[0].status,'done');
      assert.equal((await runRevealJob({store,secrets,signer},game.id,Date.now())).status,'idle');
      assert.equal((await q('select * from diner_gacha_openings where game_id=$1',[game.id])).length,1);
      assert.equal(JSON.stringify(await q('select envelope from diner_gacha_events')).includes(secret),false);
    });
    await test('Custody calldata matches the real ABI and rejects wrong-game or live-round requests',async()=>{
      const stored=await store.pull(game.id,'1')as FrozenPull,p={...stored,status:'pending' as const};
      const fulfill=settlementCall(game,'fulfill',p),decoded=decodeFunctionData({abi:pullGameAbi,data:fulfill.data});
      assert.equal(decoded.functionName,'fulfill');assert.equal(fulfill.chainId,game.chainId);assert.equal(fulfill.to,game.contract);assert.equal(fulfill.value,'0');
      if(decoded.functionName==='fulfill'){assert.equal(decoded.args[0],BigInt(1));assert.equal(decoded.args[5],BigInt(p.prizeAmount));}
      const refund=decodeFunctionData({abi:pullGameAbi,data:settlementCall(game,'refund',p).data});assert.equal(refund.functionName,'refund');
      const reveal=decodeFunctionData({abi:pullGameAbi,data:revealCall(game,round,secret,Date.now()).data});assert.equal(reveal.functionName,'revealRound');
      assert.throws(()=>settlementCall({...game,contract:rotating.contract},'fulfill',p));
      assert.throws(()=>settlementCall(game,'fulfill',{...p,prizeAmount:'1'}));
      assert.throws(()=>revealCall(game,round,secret,round.endsAt-1));
    });
    await test('Changed finalized checkpoint halts maintenance instead of revealing another round',async()=>{
      const changed={...chain,block:async(_g:Game,n:string)=>({...canonical(n),hash:hash('changed-history')})};
      assert.equal((await queueEndedReveals({store,chain:changed},game.id,Date.now())).queued,0);
      assert.equal((await store.game(game.id)).halted,true);
    });
    await test('Worker entry point bounds work and redacts provider failures',async()=>{
      const never={submitOnce:async()=>{throw Error('Unexpected submit');},retireOnce:async()=>{throw Error('Unexpected retirement');},revealOnce:async()=>{throw Error('Unexpected reveal');}};
      const emptyChain={...chain,events:async()=>[]as ChainEvent[]};
      const policy={deploymentBlock:'0',season:rotationSeason,boxes,blockBudget:1,durationMs:60000,leadMs:1000};
      const result=await runGachaMaintenance({store,chain:emptyChain,secrets,signer:never},rotating.id,policy);
      assert.equal(result.indexedBlocks,1);assert.equal(result.status,'complete');
      const failedChain={...emptyChain,events:async()=>{throw Error('SENSITIVE PROVIDER CREDENTIAL MUST NOT BE RETURNED');}};
      const failed=await runGachaMaintenance({store,chain:failedChain,secrets,signer:never},rotating.id,policy);
      assert.equal(failed.status,'retry_required');assert.equal(JSON.stringify(failed).includes('SENSITIVE'),false);
      assert.equal((await store.game(rotating.id)).cursor?.number,'0');
      await assert.rejects(runGachaMaintenance({store,chain:emptyChain,secrets,signer:never},rotating.id,{...policy,blockBudget:33}));
      assert.equal((await runGachaMaintenance({store,chain:emptyChain,secrets,signer:never},game.id,policy)).status,'halted');
    });
    console.log(`${groups} gacha operations groups passed. Actual SQL; synthetic RPC, secrets and custody. No live transactions.`);
  }finally{await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
