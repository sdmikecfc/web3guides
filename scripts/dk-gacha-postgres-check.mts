/** Isolated PostgreSQL execution, not a live Supabase migration. Install PGlite
 * outside the checkout, on D:, and set DK_PGLITE_ROOT if using another location. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { processEvent, type ChainEvent, type EventEffect, type FinalizedBlock, type FrozenPull, type StoredPull } from '../src/lib/chef/gacha/settlement';
import { eventFingerprint, ingestNextBlock, runSettlementJob, type ChainReader, type GachaStore, type LeasedJob, type SettlementSigner, type StoredGame, type StoredRound } from '../src/lib/chef/gacha/worker';
import { game, round, secret, fixtureRequest, block, hash } from './fixtures/dk-gacha';
import { GachaPostgresStore } from './fixtures/gacha-postgres-store';

async function main() {
  const dependencyRoot = process.env.DK_PGLITE_ROOT ?? 'D:/Temp/dk-gacha-postgres-tests';
  const { PGlite } = createRequire(resolve(dependencyRoot, 'package.json'))('@electric-sql/pglite');
  const db = new PGlite(); // In-memory database, no source-drive cache or output.
  let count = 0;
  async function test(name: string, fn: () => Promise<void>) { await fn(); count++; console.log(`PASS ${name}`); }
  async function q(sql: string, args: unknown[] = []): Promise<any[]> { return (await db.query(sql, args)).rows; }
  async function rpc(name: string, args: unknown[]) { return (await q(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as value`, args))[0].value; }
  const store = new GachaPostgresStore(q,rpc);
  const logs = new Map<string, ChainEvent[]>();
  let head = '102', changedHistory = false;
  const chain: ChainReader = {
    finalizedHead: async () => head, head: async () => head, refundTimeout: async () => '5',
    block: async (_g,n) => changedHistory && n === '103' ? { ...block(n), hash: hash('reorg') } : block(n),
    events: async (g,n) => (logs.get(n) ?? []).map(e => ({ ...e, gameId: g.id, contract: g.contract })),
    pull: async () => ({ status: 'pending', player: fixtureRequest().player, price: '5000000', blockNumber: '100', commitment: hash('zero') }),
  };
  const ports = { store, chain, secrets: { read: async (ref: string) => { assert.equal(ref,'test-only-vault-reference'); return secret; } } };
  async function insertGame(g = game) { await q('insert into diner_gacha_games(id,domain,chain_id,contract,definition,halted) values($1,$2,$3,$4,$5,false)',[g.id,g.domain,g.chainId,g.contract,JSON.stringify(g)]); }
  async function insertRound(gameId = game.id) { await q('insert into diner_gacha_rounds(game_id,round_id,definition,secret_ref) values($1,$2,$3,$4)',[gameId,round.id,JSON.stringify({ ...round,gameId }),'test-only-vault-reference']); }
  try {
    await test('Migration executes on PostgreSQL with browser roles denied', async () => {
      await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
      await db.exec(readFileSync(resolve('supabase/migrations/20261005_domain_kitchen_gacha_foundation.sql'),'utf8'));
      await db.exec(readFileSync(resolve('supabase/migrations/20261006_domain_kitchen_gacha_operations.sql'),'utf8'));
      await db.exec(readFileSync(resolve('supabase/migrations/20261007_domain_kitchen_gacha_custody.sql'),'utf8'));
      await db.exec(readFileSync(resolve('supabase/migrations/20261008_domain_kitchen_gacha_ownership.sql'),'utf8'));
      for (const role of ['anon','authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(q('select * from diner_gacha_rounds'), /permission denied/);
        await assert.rejects(rpc('diner_gacha_lease_job',['any']), /permission denied/);
        await assert.rejects(q('select * from diner_gacha_leaderboards'), /permission denied/);
        await db.exec('reset role');
      }
      await insertGame(); await insertRound();
    });
    await test('Round snapshots and game bindings are immutable; windows cannot overlap', async () => {
      await assert.rejects(q("update diner_gacha_rounds set definition=jsonb_set(definition,'{boxes,0,boxId}','9999')"),/gacha_round_immutable/);
      await assert.rejects(q("update diner_gacha_games set contract='0x3333333333333333333333333333333333333333'"),/gacha_game_immutable/);
      await assert.rejects(q('insert into diner_gacha_rounds(game_id,round_id,definition,secret_ref) values($1,2,$2,$3)',[game.id,JSON.stringify({ ...round,id:'2' }),'another-ref']),/gacha_round_overlap/);
    });
    await test('Following block finality is required before freezing a draw', async () => {
      logs.set('100',[fixtureRequest()]); head='100';
      assert.equal((await ingestNextBlock(ports,game.id,'100')).status,'caught_up');
      assert.equal((await q('select * from diner_gacha_pulls')).length,0); head='102';
    });
    await test('Disconnect after atomic commit resumes without a duplicate pull or job', async () => {
      store.failAfterCommit=true;
      await assert.rejects(ingestNextBlock(ports,game.id,'100'),/SIMULATED/);
      assert.equal((await store.game(game.id)).cursor,null);
      assert.equal((await q('select * from diner_gacha_jobs')).length,1);
      assert.equal((await ingestNextBlock(ports,game.id,'100')).status,'advanced');
      assert.equal((await q('select * from diner_gacha_jobs')).length,1);
      assert.equal((await q('select * from diner_gacha_pulls')).length,1);
    });
    await test('Same nonce, prices and round ID stay isolated across two games', async () => {
      const second = { ...game,id:'test-wines',domain:'wines' as const,contract:'0x2222222222222222222222222222222222222222' };
      await insertGame(second); await insertRound(second.id);
      assert.equal((await ingestNextBlock(ports,second.id,'100')).status,'advanced');
      assert.equal((await q('select * from diner_gacha_pulls where nonce=1')).length,2);
      await assert.rejects(store.commit(game.id,(await store.game(game.id)).revision,'bad-scope',hash('bad').slice(2),{ ...fixtureRequest(), gameId:second.id },{}),/gacha_event_scope/);
      assert.equal((await q("select * from diner_gacha_events where event_key='bad-scope'")).length,0);
    });
    await test('Expired leases are reclaimable and stale workers cannot overwrite results', async () => {
      const first = await store.lease(game.id); assert(first);
      assert.equal(await store.lease(game.id),null);
      await q("update diner_gacha_jobs set lease_until=now()-interval '1 second' where game_id=$1",[game.id]);
      const replacement=await store.lease(game.id); assert(replacement); assert.notEqual(replacement.lease,first.lease);
      assert.equal(await store.finish(first,'submitted',hash('tx'),undefined,1),false);
      assert.equal(await store.finish(replacement,'ready',undefined,undefined,1),true);
      await q("update diner_gacha_jobs set available_at=now()-interval '1 second' where game_id=$1",[game.id]);
    });
    await test('Unknown broadcast retry reuses the custody idempotency key', async () => {
      const intents = new Map<string,string>(); let submissions=0, disconnect=true;
      const signer: SettlementSigner = { submitOnce: async r => {
        if (!intents.has(r.idempotencyKey)) { intents.set(r.idempotencyKey,hash('signed-tx')); submissions++; }
        if (disconnect) { disconnect=false; throw new Error('SIMULATED disconnect after broadcast'); }
        return { transactionHash:intents.get(r.idempotencyKey)! };
      } };
      await assert.rejects(runSettlementJob({ store,chain,signer },game.id),/SIMULATED/);
      await q("update diner_gacha_jobs set available_at=now()-interval '1 second' where game_id=$1",[game.id]);
      assert.equal((await runSettlementJob({ store,chain,signer },game.id)).status,'submitted');
      assert.equal(submissions,1);
      assert.equal((await q('select * from diner_gacha_openings')).length,0);
    });
    await test('Permissionless fake reveal is a no-op and does not stall ingestion', async () => {
      logs.set('101',[{ ...fixtureRequest(),kind:'revealed',roundId:'1',secretKeyHash:`0x${round.secretHash}`,secret:hash('fake'),blockNumber:'101',blockHash:block('101').hash,timestamp:block('101').timestamp,transactionHash:hash('fake-reveal') }]);
      assert.equal((await ingestNextBlock(ports,game.id,'100')).status,'advanced');
      assert.equal((await store.round(game.id,'1'))?.revealedSecret,undefined);
      assert.equal((await q("select envelope from diner_gacha_events where envelope->>'kind'='revealed'"))[0].envelope.secret,undefined);
    });
    await test('Finalized fulfillment alone grants one opening; redemption retains it', async () => {
      const pull=(await store.pull(game.id,'1'))! as FrozenPull;
      const fulfilled: ChainEvent={ ...fixtureRequest(),kind:'fulfilled',blockNumber:'102',blockHash:block('102').hash,timestamp:block('102').timestamp,transactionHash:hash('fulfilled'),roundId:'1',boxId:pull.boxId,cardNumber:pull.cardNumber,prizeAmount:pull.prizeAmount,prizeTokenAmount:'999999999999999999999999',source:pull.source };
      logs.set('102',[fulfilled]); head='104';
      await ingestNextBlock(ports,game.id,'100');
      assert.equal((await q('select * from diner_gacha_openings')).length,1);
      const board=await q('select * from diner_gacha_leaderboards'); assert.equal(board.length,1); assert.equal(Number(board[0].openings),1);
      assert.equal((await q('select * from diner_gacha_discoveries')).length,1);
      assert.equal((await q('select status from diner_gacha_jobs where game_id=$1',[game.id]))[0].status,'done');
      logs.set('103',[{ ...fixtureRequest(),kind:'burned',blockNumber:'103',blockHash:block('103').hash,timestamp:block('103').timestamp,transactionHash:hash('burned'),owner:game.contract,prizeTokenAmount:'999999999999999999999999' }]);
      await ingestNextBlock(ports,game.id,'100');
      const redeemed=await store.pull(game.id,'1'); assert(redeemed && !('refusal' in redeemed)); assert.equal(redeemed.redeemed,true);
      assert.equal((await q('select * from diner_gacha_openings')).length,1);
    });
    await test('Refund processing cannot grant a discovery or consume another game nonce', async () => {
      const secondId='test-wines', p=(await store.pull(secondId,'1'))!;
      const event: ChainEvent={ ...fixtureRequest(),gameId:secondId,contract:p.request.contract,kind:'refunded',blockNumber:'102',blockHash:block('102').hash,timestamp:block('102').timestamp,transactionHash:hash('refund') };
      const effect=processEvent({ game:(await store.game(secondId)).definition,pull:p,event,canonicalBlock:block('102') });
      await store.commit(secondId,(await store.game(secondId)).revision,'refund-event',eventFingerprint(event),event,effect);
      assert.equal((await store.pull(secondId,'1'))?.status,'refunded');
      assert.equal((await store.pull(game.id,'1'))?.status,'fulfilled');
      assert.equal((await q('select * from diner_gacha_openings where game_id=$1',[secondId])).length,0);
      assert.equal((await q('select status from diner_gacha_jobs where game_id=$1',[secondId]))[0].status,'done');
    });
    await test('Unexpected payment amounts queue one refund and respect the strict timeout', async () => {
      const g=(await store.game('test-wines')).definition;
      const e: ChainEvent={ ...fixtureRequest('88'),gameId:g.id,contract:g.contract,price:'1' };
      const effect=processEvent({ game:g,round:{ ...round,gameId:g.id },event:e,canonicalBlock:block('100') });
      assert.equal(effect.job?.kind,'refund');
      await store.commit(g.id,(await store.game(g.id)).revision,'unsupported-payment',eventFingerprint(e),e,effect);
      const refundChain={ ...chain,head:async()=> '105',pull:async()=>({ status:'pending' as const,player:e.player,price:'1',blockNumber:'100',commitment:hash('zero') }) };
      let submits=0;
      const signer: SettlementSigner={ submitOnce:async r=>{ assert.equal(r.operation,'refund'); assert.equal(r.pull.nonce,'88'); submits++; return { transactionHash:hash('refund-submit') }; } };
      assert.equal((await runSettlementJob({ store,chain:refundChain,signer },g.id)).status,'waiting');
      assert.equal(submits,0);
      await q("update diner_gacha_jobs set available_at=now()-interval '1 second' where game_id=$1 and nonce=88",[g.id]);
      refundChain.head=async()=> '106';
      assert.equal((await runSettlementJob({ store,chain:refundChain,signer },g.id)).status,'submitted');
      assert.equal(submits,1);
    });
    await test('Season rollover reuses the contract and preserves the previous round', async () => {
      const { roundHash,secretHash }=await import('../src/lib/chef/gacha/protocol');
      const next={ ...round,id:'2',seasonId:'season-two',startsAt:round.endsAt,endsAt:round.endsAt+10000,seasonStartsAt:round.endsAt,seasonEndsAt:round.endsAt+20000,previousHash:round.hash,secretHash:secretHash('b'.repeat(64)) };
      next.hash=roundHash(next.previousHash,next.id,next.secretHash,next.configHash);
      await q('insert into diner_gacha_rounds(game_id,round_id,definition,secret_ref) values($1,$2,$3,$4)',[game.id,'2',JSON.stringify(next),'second-secret-reference']);
      assert.equal((await store.roundAt(game.id,round.startsAt))?.definition.id,'1');
      assert.equal((await store.roundAt(game.id,next.startsAt))?.definition.id,'2');
      assert.equal((await q('select season_id from diner_gacha_openings where game_id=$1',[game.id]))[0].season_id,'test-season');
    });
    await test('SQL rejects wrong reveal secrets, validates correct ended reveal', async () => {
      const r=(await store.game(game.id)).revision;
      const env={ ...fixtureRequest(),kind:'revealed',timestamp:round.endsAt };
      await assert.rejects(store.commit(game.id,r,'bad-reveal',hash('bad').slice(2),env,{ reveal:{ roundId:'1',secret:'a'.repeat(64) } }),/gacha_reveal_not_ended/);
      await store.commit(game.id,r,'good-reveal',hash('good').slice(2),env,{ reveal:{ roundId:'1',secret } });
      assert.equal((await store.round(game.id,'1'))?.revealedSecret,secret);
    });
    await test('Six SQL boards separate packs/domains and share ranks on equal counts', async () => {
      const third={ ...game,id:'test-smoothie',domain:'smoothie' as const,contract:'0x3333333333333333333333333333333333333333' };
      await insertGame(third); await insertRound(third.id);
      let nonce=200;
      async function opening(gid:string,price:string,player:string){
        const g=(await store.game(gid)).definition,n=String(nonce++);
        const event: ChainEvent={ ...fixtureRequest(n),gameId:gid,contract:g.contract,price,player };
        const effect=processEvent({ game:g,round:{ ...round,gameId:gid },event,canonicalBlock:block('100'),nextBlock:block('101'),secret });
        await store.commit(gid,(await store.game(gid)).revision,`request-${n}`,eventFingerprint(event),event,effect);
        const p=effect.pull as FrozenPull;
        const paid: ChainEvent={ ...event,kind:'fulfilled',blockNumber:'102',blockHash:block('102').hash,timestamp:block('102').timestamp,transactionHash:hash(`fulfill-${n}`),roundId:p.roundId,boxId:p.boxId,cardNumber:p.cardNumber,prizeAmount:p.prizeAmount,prizeTokenAmount:'1000000000000000000',source:p.source };
        const fulfilled=processEvent({ game:g,event:paid,canonicalBlock:block('102'),pull:p });
        await store.commit(gid,(await store.game(gid)).revision,`fulfill-${n}`,eventFingerprint(paid),paid,fulfilled);
      }
      const a='0x4444444444444444444444444444444444444444',b='0x5555555555555555555555555555555555555555';
      for(const gid of [game.id,'test-wines','test-smoothie'])for(const price of ['5000000','10000000'])await opening(gid,price,a);
      await opening(game.id,'5000000',a);await opening(game.id,'5000000',b);await opening(game.id,'5000000',b);
      const boards=await q('select distinct game_id,pack from diner_gacha_leaderboards'); assert.equal(boards.length,6);
      const ranks=await q("select opener,rank,openings from diner_gacha_leaderboards where game_id=$1 and pack='regular' order by rank,opener",[game.id]);
      assert.deepEqual(ranks.map(r=>Number(r.rank)),[1,1,3]);
      assert.deepEqual(ranks.map(r=>Number(r.openings)),[2,2,1]);
      await q('update diner_gacha_openings set invalidated=true where game_id=$1 and nonce=200',[game.id]);
      const lowered=await q("select openings from diner_gacha_leaderboards where game_id=$1 and pack='regular' and opener=$2",[game.id,a]);assert.equal(Number(lowered[0].openings),1);
    });
    await test('A finalized reorg halts instead of silently redrawing paid results', async () => {
      const before=(await q('select * from diner_gacha_openings')).length;
      changedHistory=true; head='105';
      assert.equal((await ingestNextBlock(ports,game.id,'100')).status,'halted');
      assert.equal((await store.game(game.id)).halted,true);
      assert.equal(await store.lease(game.id),null);
      assert.equal((await q('select * from diner_gacha_openings')).length,before);
    });
    console.log(`${count} PostgreSQL/worker groups passed. Live Supabase and wallets were not used.`);
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
