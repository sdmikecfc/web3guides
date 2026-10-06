import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { encodeEventTopics, type PublicClient } from 'viem';
import { DOMAIN_COLLECTIBLES, DOMAIN_IDS } from '../src/lib/chef/diner/domain-worlds';
import { DOMAIN_SEASONS } from '../src/lib/chef/diner/domain-seasons';
import { domainBoxes, makeCommittedRound } from '../src/lib/chef/gacha/catalogue';
import { processEvent, type ChainEvent, type FrozenPull, type Game, type Round } from '../src/lib/chef/gacha/settlement';
import { eventFingerprint } from '../src/lib/chef/gacha/worker';
import { ingestOwnershipBlock, viemTransferReader, nftTransferAbi, type NftTransfer, type OwnershipStore } from '../src/lib/chef/gacha/ownership';
import { GachaPostgresStore } from './fixtures/gacha-postgres-store';
import { block, fixtureRequest, game, hash, round, secret } from './fixtures/dk-gacha';
import { equipmentTargetKey, parseEquipmentInventory, type EquipmentAssignmentRequest } from '../src/lib/chef/gacha/equipment-ownership';
import { displaySpotKind } from '../src/lib/chef/diner/collection-display-spots';

const zero = '0x0000000000000000000000000000000000000000';
const buyer = '0x3333333333333333333333333333333333333333';
async function main() {
  const { PGlite } = createRequire(resolve(process.env.DK_PGLITE_ROOT ?? 'D:/Temp/dk-gacha-postgres-tests', 'package.json'))('@electric-sql/pglite');
  const db = new PGlite();
  const q = async (sql: string, args: unknown[] = []): Promise<any[]> => (await db.query(sql, args)).rows;
  const rpc = async (name: string, args: unknown[]) => (await q(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as value`, args))[0].value;
  const store = new GachaPostgresStore(q, rpc);
  let lostReply = false, groups = 0;
  const ownership: OwnershipStore = {
    cursor: async id => { const r = (await q('select start_block::text,block_number::text,block_hash from diner_gacha_ownership_cursors where game_id=$1', [id]))[0]; return r && { start: r.start_block, number: r.block_number, hash: r.block_hash }; },
    commit: async (id, start, b, events) => {
      const result = await rpc('diner_gacha_ownership_block', [id, start, JSON.stringify(b), JSON.stringify(events)]);
      if (lostReply) { lostReply = false; throw Error('SIMULATED lost committed response'); }
      return result;
    },
  };
  const logs = new Map<string, NftTransfer[]>();
  const ports = { store, ownership, chain: { block: async (_g: Game, n: string) => block(n), finalizedHead: async () => '200' }, transfers: async (_g: Game, b: { number: string }) => logs.get(b.number) ?? [] };
  const owner = fixtureRequest().player.toLowerCase();
  const progress = () => rpc('diner_gacha_collection', [owner, game.domain, 3]);
  const assets = (wallet = owner) => rpc('diner_gacha_owned_assets', [game.id, wallet]);
  async function test(name: string, fn: () => Promise<void>) { await fn(); groups++; console.log(`PASS ${name}`); }
  async function insertGame(g: Game) { await q('insert into diner_gacha_games(id,domain,chain_id,contract,definition,halted) values($1,$2,$3,$4,$5,false)', [g.id, g.domain, g.chainId, g.contract, JSON.stringify(g)]); }
  function domainRound(g: Game): Round {
    const season = { ...DOMAIN_SEASONS.find(s => s.domain === g.domain)!, approved: true, startsAt: round.seasonStartsAt, endsAt: round.seasonEndsAt,
      contract: { chainId: g.chainId, address: g.contract }, backingToken: { address: buyer, symbol: 'TEST', decimals: 18 }, protocolVersion: 'test', feesApproved: true, fundingApproved: true };
    return makeCommittedRound(g, season, { id: '1', previousHash: '0'.repeat(64), secret, startsAt: round.startsAt, endsAt: round.endsAt,
      boxes: domainBoxes(g, { regular: { boxId: '1000', priceUsd: 5, prizeBudgetUsd: 4.988 }, super: { boxId: '1001', priceUsd: 10, prizeBudgetUsd: 9.98 } }) });
  }
  const r = domainRound(game);
  async function insertRound(g: Game, definition: Round) { await q('insert into diner_gacha_rounds(game_id,round_id,definition,secret_ref) values($1,$2,$3,$4)', [g.id, '1', JSON.stringify(definition), 'synthetic-reference']); }
  async function commitEvent(g: Game, event: ChainEvent, effect: ReturnType<typeof processEvent>) {
    await store.commit(g.id, (await store.game(g.id)).revision, `${event.transactionHash}:${event.logIndex}`, eventFingerprint(event), event, effect);
  }
  function prepared(n: string, price = '5000000', g = game, definition = r) {
    const event = { ...fixtureRequest(n), gameId: g.id, contract: g.contract, price };
    const effect = processEvent({ game: g, event, canonicalBlock: block('100'), nextBlock: block('101'), round: definition, secret });
    return { event, effect, pull: effect.pull! as FrozenPull };
  }
  async function fulfill(n: string, price: string, logIndex: number, g = game, definition = r) {
    const { event, effect, pull } = prepared(n, price, g, definition); await commitEvent(g, event, effect);
    const event2: ChainEvent = { ...event, kind: 'fulfilled', transactionHash: hash(`mint-${g.id}-${n}`), logIndex,
      blockNumber: '102', blockHash: block('102').hash, timestamp: block('102').timestamp,
      roundId: '1', boxId: pull.boxId, cardNumber: pull.cardNumber, prizeAmount: pull.prizeAmount, prizeTokenAmount: '999999999999999999999999', source: pull.source };
    await commitEvent(g, event2, processEvent({ game: g, event: event2, pull, canonicalBlock: block('102') }));
    return { ...event2, from: zero, to: owner, tokenId: n, logIndex: logIndex - 1 } as NftTransfer;
  }
  async function advance(n: string) { await store.advance(game.id, (await store.game(game.id)).revision, block(n)); }
  const assign = (token: string, wallet = owner, target = 'grill-1', location = 'home', mode = 'skin') => rpc('diner_gacha_assign_asset', [game.id, token, wallet, location, target, mode, '102', block('102').hash]);
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    for (const file of ['20261005_domain_kitchen_gacha_foundation.sql', '20261006_domain_kitchen_gacha_operations.sql', '20261007_domain_kitchen_gacha_custody.sql', '20261008_domain_kitchen_gacha_ownership.sql', '20261009_domain_kitchen_equipment_assignments.sql', '20261010_domain_kitchen_collectible_displays.sql']) await db.exec(readFileSync(resolve('supabase/migrations', file), 'utf8'));
    await insertGame(game); await insertRound(game, r);
    await test('Ownership/receipt tables and functions are private; catalogue requirements match all 72 items', async () => {
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        for (const table of ['diner_gacha_assets', 'diner_gacha_asset_assignments', 'diner_gacha_room_receipts']) await assert.rejects(q(`select * from ${table}`), /permission denied/);
        await assert.rejects(progress(), /permission denied/); await assert.rejects(assets(), /permission denied/);
        await db.exec('reset role');
      }
      for (const d of DOMAIN_IDS) {
        const rule = (await q('select required_items from diner_gacha_collection_rules where domain=$1', [d]))[0].required_items;
        assert.equal(new Set(rule).size, 24); assert.deepEqual([...rule].sort(), DOMAIN_COLLECTIBLES.filter(i => i.domain === d).map(i => i.id).sort());
      }
      await db.exec('set role service_role'); await assert.rejects(q('delete from diner_gacha_room_receipts'), /permission denied/); await db.exec('reset role');
    });
    let minted: NftTransfer[] = [];
    await test('24 distinct verified discoveries earn one permanent receipt, across both packs', async () => {
      const seen = new Set<string>();
      // Search deterministic SYNTHETIC requests; never choose an outcome for a real pull.
      for (let n = 1; n < 10000 && seen.size < 24; n++) {
        const price = n % 2 ? '5000000' : '10000000', p = prepared(String(n), price).pull;
        if (seen.has(p.itemId)) continue;
        seen.add(p.itemId); minted.push(await fulfill(String(n), price, seen.size * 4));
        const p2 = await progress(); assert.equal(p2.found, seen.size); assert.equal(p2.complete, seen.size === 24);
      }
      assert.equal(seen.size, 24); assert.equal((await progress()).receipt.id, `collection:gochujang:v3:${owner}`);
      assert.equal((await q('select count(*)::int as n from diner_gacha_room_receipts'))[0].n, 1);
      const duplicate = await fulfill('20001', '5000000', 100); minted.push(duplicate);
      assert.equal((await progress()).found, 24); assert.equal((await q('select count(*)::int as n from diner_gacha_room_receipts'))[0].n, 1);
      assert.equal((await rpc('diner_gacha_collection', [buyer, game.domain, 3])).found, 0);
    });
    await test('Ownership waits for settlement indexing; mint-before-fulfillment is accepted atomically', async () => {
      logs.set('102', minted);
      assert.equal((await ingestOwnershipBlock(ports, game.id, '100')).status, 'waiting_for_settlement');
      for (const n of ['100', '101', '102']) await advance(n);
      assert.equal((await assets()).ready, false);
      for (let i = 0; i < 3; i++) assert.equal((await ingestOwnershipBlock(ports, game.id, '100')).status, 'advanced');
      assert.equal((await assets()).items.length, minted.length);
      assert.equal((await assets()).items[0].backingAmount, '999999999999999999999999');
      assert.equal(typeof (await assets()).items[0].tokenId, 'string');
      assert.equal((await ingestOwnershipBlock(ports, game.id, '100')).status, 'caught_up');
    });
    await test('Equipment bindings: persistent targets, revision conflicts, retry identity and transfer cleanup', async () => {
      const inventory = async () => parseEquipmentInventory({ domain: game.domain, ...await rpc('diner_gacha_equipment_inventory', [game.id, owner]) }, game.domain);
      const asset = (await inventory()).items.find(i => DOMAIN_COLLECTIBLES.find(d => d.id === i.itemId)?.machine)!;
      const kind = DOMAIN_COLLECTIBLES.find(d => d.id === asset.itemId)!.machine!;
      const change: EquipmentAssignmentRequest = { requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', revision: '0', tokenId: asset.tokenId,
        destination: { room: hash('test-room'), location: 'home', id: 'machine-1', kind } };
      const commit = (r: EquipmentAssignmentRequest) => rpc('diner_gacha_assign_equipment', [game.id, owner, JSON.stringify(r), r.destination ? equipmentTargetKey(r.destination) : null, '102', block('102').hash]);
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`); await assert.rejects(inventory(), /permission denied/); await assert.rejects(commit(change), /permission denied/); await db.exec('reset role');
      }
      assert.equal(await commit(change), true); assert.equal(await commit(change), false);
      assert.equal((await inventory()).revision, '1'); assert.deepEqual((await inventory()).items.find(i => i.tokenId === asset.tokenId)!.destination, change.destination);
      await assert.rejects(commit({ ...change, destination: null }), /retry_conflict/);
      await assert.rejects(commit({ ...change, requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }), /revision_conflict/);
      const remove = { ...change, requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', revision: '1', destination: null };
      assert.equal(await commit(remove), true);
      assert.equal(await commit(change), false, 'Late retry cannot resurrect a removed appearance');
      assert.equal((await inventory()).items.find(i => i.tokenId === asset.tokenId)!.destination, null);
        assert.equal((await q('select count(*)::int as n from diner_gacha_equipment_bindings'))[0].n, 0);
        const display:EquipmentAssignmentRequest={...change,requestId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',revision:'2',destination:{...change.destination!,id:'display-1',kind:displaySpotKind(DOMAIN_COLLECTIBLES.find(i=>i.id===asset.itemId)!)!,display:true}};
        assert.equal(await commit(display),true);assert.equal(await commit(display),false);
        assert.deepEqual((await inventory()).items.find(i=>i.tokenId===asset.tokenId)!.destination,display.destination);
        assert.equal((await q('select mode from diner_gacha_asset_assignments where game_id=$1 and token_id=$2',[game.id,asset.tokenId]))[0].mode,'display');
        const skin={...change,requestId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',revision:'3'};
        assert.equal(await commit(skin),true);assert.equal((await q('select count(*)::int as n from diner_gacha_asset_assignments'))[0].n,1,'A display and a machine cannot use the same NFT');
        assert.equal(await commit(display),false,'Retrying an old display cannot replace a later skin');
        assert.equal((await inventory()).items.find(i=>i.tokenId===asset.tokenId)!.destination?.display,undefined);
        assert.equal(await commit({...remove,requestId:'ffffffff-ffff-4fff-8fff-ffffffffffff',revision:'4'}),true);
    });
    await test('One NFT can occupy one saved location; unauthorized and conflicting assignments fail', async () => {
      await assign(minted[0].tokenId); await assign(minted[0].tokenId);
      assert.equal((await q('select count(*)::int as n from diner_gacha_asset_assignments'))[0].n, 1);
      await assign(minted[0].tokenId, owner, 'display-1', 'truck', 'display');
      assert.equal((await q('select location from diner_gacha_asset_assignments'))[0].location, 'truck');
      await assert.rejects(assign(minted[0].tokenId, buyer), /not_owned/);
      await assert.rejects(assign(minted[1].tokenId, owner, 'display-1', 'truck', 'display'), /duplicate key/);
      assert.equal((await assets(buyer)).items.length, 0);
    });
    await test('Transfer releases appearance, preserves discoveries, and gives no opening credit to its recipient', async () => {
      const event = { ...minted[0], from: owner, to: buyer, blockNumber: '103', blockHash: block('103').hash, timestamp: block('103').timestamp, transactionHash: hash('transfer'), logIndex: 0 };
      logs.set('103', [event]); await advance('103');
      await assert.rejects(assign(minted[0].tokenId), /sync_required/);
      assert.equal((await assets()).ready, false);
      lostReply = true; await assert.rejects(ingestOwnershipBlock(ports, game.id, '100'), /SIMULATED/);
      assert.equal((await ingestOwnershipBlock(ports, game.id, '100')).status, 'caught_up');
      assert.equal((await assets(buyer)).items.length, 1); assert.equal((await assets(buyer)).items[0].assignment, null);
      assert.equal((await q('select count(*)::int as n from diner_gacha_asset_assignments'))[0].n, 0);
      assert.equal((await progress()).complete, true);
      assert.equal((await q('select * from diner_gacha_leaderboards where opener=$1', [buyer])).length, 0);
      assert.equal((await rpc('diner_gacha_collection', [buyer, game.domain, 3])).found, 0);
    });
    await test('Burn removes current ownership without touching the completed restaurant receipt', async () => {
      const event = { ...minted[0], from: buyer, to: zero, blockNumber: '104', blockHash: block('104').hash, timestamp: block('104').timestamp, transactionHash: hash('burn'), logIndex: 0 };
      logs.set('104', [event]); await advance('104'); await ingestOwnershipBlock(ports, game.id, '100');
      assert.equal((await assets(buyer)).items.length, 0); assert.equal((await progress()).complete, true);
      assert.equal((await q('select burned from diner_gacha_assets where game_id=$1 and token_id=$2', [game.id, minted[0].tokenId]))[0].burned, true);
    });
    await test('Entire transfer block rolls back on forged previous owner; exact replay cannot apply twice', async () => {
      const event = { ...minted[1], from: owner, to: buyer, blockNumber: '105', blockHash: block('105').hash, timestamp: block('105').timestamp, transactionHash: hash('two-transfers'), logIndex: 0 };
      await advance('105');
      await assert.rejects(ownership.commit(game.id, '100', block('105'), [event, { ...event, logIndex: 1, from: owner }]), /previous_owner/);
      assert.equal((await ownership.cursor(game.id))!.number, '104');
      assert.equal((await q('select owner from diner_gacha_assets where game_id=$1 and token_id=$2', [game.id, event.tokenId]))[0].owner, owner);
      assert.equal(await ownership.commit(game.id, '100', block('105'), [event]), true);
      assert.equal(await ownership.commit(game.id, '100', block('105'), [event]), false);
      await assert.rejects(ownership.commit(game.id, '100', block('105'), [{ ...event, to: owner }]), /replay_conflict/);
    });
    await test('Same token numbers in another contract never cross ownership or collections', async () => {
      const other: Game = { ...game, id: 'test-wines', domain: 'wines', contract: '0x2222222222222222222222222222222222222222' };
      await insertGame(other); const rr = domainRound(other); await insertRound(other, rr);
      const event = await fulfill(minted[0].tokenId, '5000000', 4, other, rr);
      await store.advance(other.id, (await store.game(other.id)).revision, block('102'));
      await ownership.commit(other.id, '102', block('102'), [event]);
      const rows = await q('select game_id,owner,burned from diner_gacha_assets where token_id=$1', [minted[0].tokenId]);
      assert.equal(rows.length, 2); assert.equal(rows.find(r => r.game_id === other.id).owner, owner);
      assert.equal(rows.find(r => r.game_id === game.id).burned, true);
      assert.equal((await rpc('diner_gacha_collection', [owner, other.domain, 3])).found, 1);
    });
    await test('All three domain completion receipts require their own exact collection', async () => {
      for (const domain of ['smoothie', 'wines'] as const) {
        const g: Game = { ...game, id: `test-${domain}`, domain, contract: domain === 'wines' ? '0x2222222222222222222222222222222222222222' : '0x4444444444444444444444444444444444444444' };
        const definition = domainRound(g);
        if (domain === 'smoothie') { await insertGame(g); await insertRound(g, definition); }
        const seen = new Set<string>((await rpc('diner_gacha_collection', [owner, domain, 3])).discoveredIds);
        for (let n = 30000; n < 40000 && seen.size < 24; n++) {
          const price = n % 2 ? '5000000' : '10000000', p = prepared(String(n), price, g, definition).pull;
          if (seen.has(p.itemId)) continue;
          seen.add(p.itemId); await fulfill(String(n), price, seen.size * 4 + 100, g, definition);
        }
        const p = await rpc('diner_gacha_collection', [owner, domain, 3]);
        assert.equal(p.complete, true); assert.equal(p.receipt.id, `collection:${domain}:v3:${owner}`);
      }
      assert.equal((await q('select count(*)::int as n from diner_gacha_room_receipts where owner=$1', [owner]))[0].n, 3);
    });
    await test('Mint and immediate burn in one block leaves discovery but no usable NFT', async () => {
      const g: Game = { ...game, id: 'test-reinvest', contract: '0x5555555555555555555555555555555555555555' };
      await insertGame(g); const definition = domainRound(g); await insertRound(g, definition);
      const mint = await fulfill('1', '5000000', 4, g, definition);
      const p = await store.pull(g.id, '1') as FrozenPull;
      const burn: ChainEvent = { ...fixtureRequest(), ...mint, kind: 'burned', nonce: '1', owner, prizeTokenAmount: p.prizeTokenAmount!, logIndex: 6 };
      await commitEvent(g, burn, processEvent({ game: g, event: burn, pull: p, canonicalBlock: block('102') }));
      await store.advance(g.id, (await store.game(g.id)).revision, block('102'));
      await ownership.commit(g.id, '102', block('102'), [mint, { ...mint, from: owner, to: zero, logIndex: 5 }]);
      assert.equal((await rpc('diner_gacha_owned_assets', [g.id, owner])).items.length, 0);
      assert.equal((await q('select count(*)::int as n from diner_gacha_openings where game_id=$1', [g.id]))[0].n, 1);
    });
    await test('Invalidated evidence revokes unsupported completion; restoring evidence reuses the receipt', async () => {
      const one = minted.find(m => m.tokenId !== '20001' && m.tokenId !== minted[0].tokenId)!;
      const item = (await store.pull(game.id, one.tokenId) as FrozenPull).itemId;
      const oldReceipt = (await progress()).receipt.id;
      await q('update diner_gacha_openings set invalidated=true where game_id=$1 and item_id=$2', [game.id, item]);
      assert.equal((await progress()).complete, false); assert.equal((await progress()).receipt, null);
      await q('update diner_gacha_openings set invalidated=false where game_id=$1 and item_id=$2', [game.id, item]);
      assert.equal((await progress()).receipt.id, oldReceipt);
      assert.equal((await q('select count(*)::int as n from diner_gacha_room_receipts where domain=$1', [game.domain]))[0].n, 1);
      await assert.rejects(q('update diner_gacha_openings set opener=$1 where game_id=$2', [buyer, game.id]), /history_immutable/);
      await assert.rejects(q('delete from diner_gacha_openings where game_id=$1', [game.id]), /history_immutable/);
      await assert.rejects(q('update diner_gacha_collection_rules set required_items=array_fill($1::text,array[24]) where domain=$2', [item, game.domain]), /history_immutable/);
    });
    await test('Finalized history changes halt the game and hide placement inventory', async () => {
      const changed = { ...ports, chain: { ...ports.chain, block: async (_g: Game, n: string) => ({ ...block(n), hash: hash('changed') }) } };
      assert.equal((await ingestOwnershipBlock(changed, game.id, '100')).status, 'halted');
      assert.equal((await assets()).ready, false);
    });
    await test('Viem transfer reader rejects removed, wrong-chain and wrong-block events', async () => {
      const topics = encodeEventTopics({ abi: nftTransferAbi, eventName: 'Transfer', args: { from: zero, to: owner as `0x${string}`, tokenId: BigInt(1) } });
      let mode = 'valid';
      const client = { getChainId: async () => mode === 'chain' ? 1 : game.chainId, getLogs: async () => [{ address: game.contract,
        topics, data: '0x', removed: mode === 'removed', blockHash: mode === 'block' ? hash('wrong') : block('102').hash, blockNumber: BigInt(102), logIndex: 3, transactionHash: hash('mint') }] } as unknown as PublicClient;
      const reader = viemTransferReader(client);
      assert.equal((await reader(game, block('102')))[0].tokenId, '1');
      for (mode of ['chain', 'removed', 'block']) await assert.rejects(reader(game, block('102')));
    });
    console.log(`${groups} ownership groups passed. Real PostgreSQL procedures; synthetic finalized chain events only.`);
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
