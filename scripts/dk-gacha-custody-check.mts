import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { keccak256, parseTransaction, TransactionReceiptNotFoundError, type Hex, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SupabaseRoundSecrets } from '../src/lib/chef/gacha/vault-secrets';
import { SupabaseTransactionJournal } from '../src/lib/chef/gacha/supabase-custody';
import { JournaledGachaSigner, toViemTransaction, type TransactionTransport, type UnsignedGachaTransaction, type CustodyPolicy } from '../src/lib/chef/gacha/custody';
import { viemTransactionTransport } from '../src/lib/chef/gacha/viem-transactions';
import { settlementCall } from '../src/lib/chef/gacha/contract-calls';
import { operationKey } from '../src/lib/chef/gacha/operations';
import { createPrivateGachaWorker } from '../src/lib/chef/gacha/private-worker';
import { DOMAIN_SEASONS } from '../src/lib/chef/diner/domain-seasons';
import { processEvent, type Game } from '../src/lib/chef/gacha/settlement';
import { secretHash } from '../src/lib/chef/gacha/protocol';
import { game, round, secret, fixtureRequest, block, hash } from './fixtures/dk-gacha';

// Public, deliberately unfunded TEST key. Never loaded from any user's wallet.
const account = privateKeyToAccount(`0x${'0'.repeat(63)}1`);
async function main() {
  const { PGlite } = createRequire(resolve(process.env.DK_PGLITE_ROOT ?? 'D:/Temp/dk-gacha-postgres-tests', 'package.json'))('@electric-sql/pglite');
  const db = new PGlite();
  const q = async (sql: string, args: unknown[] = []): Promise<any[]> => (await db.query(sql, args)).rows;
  let loseReply = '', groups = 0;
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.match(name, /^diner_gacha_[a-z_]+$/);
      try {
        const result = (await q(`select public.${name}(${Object.keys(args).map((k, i) => `${k} => $${i + 1}`).join(',')}) as value`,
          Object.values(args).map(v => v !== null && typeof v === 'object' ? JSON.stringify(v) : v)))[0].value;
        if (loseReply === name) { loseReply = ''; return { data: null, error: { message: 'SIMULATED unknown response' } }; }
        return { data: result, error: null };
      } catch (error) { return { data: null, error }; }
    },
    from: (table: string) => {
      assert.equal(table, 'diner_gacha_transactions');
      return { select: () => ({ eq: (field: string, key: string) => {
        assert.equal(field, 'operation_key');
        return { maybeSingle: async () => ({ data: (await q('select * from diner_gacha_transactions where operation_key=$1', [key]))[0] ?? null, error: null }) };
      } }) };
    },
  } as unknown as SupabaseClient;
  const vault = new SupabaseRoundSecrets(client), journal = new SupabaseTransactionJournal(client);
  const games: Game[] = [game, { ...game, id: 'test-smoothie', domain: 'smoothie', contract: '0x2222222222222222222222222222222222222222' }];
  const policy: CustodyPolicy = { chainId: game.chainId, signer: account.address, games, maxGas: '500000', maxFeePerGas: '10000000000', maxTransactionFee: '5000000000000000' };
  const pending = new Map<Hex, Awaited<ReturnType<TransactionTransport['observe']>>>();
  let broadcastLost = false, signCount = 0, preparedCount = 0, pendingNonce = 0;
  const broadcasts: Hex[] = [];
  const transport: TransactionTransport = {
    pendingNonce: async () => pendingNonce,
    prepare: async (call, _signer, nonce) => { preparedCount++; return { ...call, type: 'eip1559', nonce, gas: '200000', maxFeePerGas: '2000000000', maxPriorityFeePerGas: '1000000000' }; },
    broadcast: async raw => {
      broadcasts.push(raw);
      const saved = await q('select operation_key from diner_gacha_transactions where raw_tx=$1 and transaction_hash=$2', [raw, keccak256(raw)]);
      assert.equal(saved.length, 1, 'MUST persist exact bytes before broadcasting');
      if (broadcastLost) { broadcastLost = false; throw Error('SIMULATED RPC timeout https://provider.invalid/SECRET_TOKEN'); }
      return keccak256(raw);
    },
    observe: async tx => pending.get(tx) ?? { status: 'pending' },
  };
  const signer = new JournaledGachaSigner(journal, transport, { sign: async t => { signCount++; return account.signTransaction(toViemTransaction(t)); } }, policy, () => round.endsAt + 1);
  async function test(name: string, fn: () => Promise<void>) { await fn(); groups++; console.log(`PASS ${name}`); }
  function pull(n: string, g = game) {
    const event = { ...fixtureRequest(n), gameId: g.id, contract: g.contract };
    return processEvent({ game: g, event, canonicalBlock: block('100'), nextBlock: block('101'), round: { ...round, gameId: g.id }, secret }).pull!;
  }
  function request(n: string, g = game) { return { idempotencyKey: operationKey(g, `fulfill:${n}`), game: g, operation: 'fulfill' as const, pull: pull(n, g) }; }
  async function expire(key: string) { await q("update diner_gacha_transactions set lease_until=now()-interval '1 second' where operation_key=$1", [key]); }
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    for (const file of ['20261005_domain_kitchen_gacha_foundation.sql', '20261006_domain_kitchen_gacha_operations.sql', '20261007_domain_kitchen_gacha_custody.sql', '20261008_domain_kitchen_gacha_ownership.sql']) await db.exec(readFileSync(resolve('supabase/migrations', file), 'utf8'));
    for (const g of games) await q('insert into diner_gacha_games(id,domain,chain_id,contract,definition,halted) values($1,$2,$3,$4,$5,false)', [g.id, g.domain, g.chainId, g.contract, JSON.stringify(g)]);
    await test('Custody tables and RPCs deny browser roles and direct service-role writes', async () => {
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        for (const table of ['diner_gacha_secret_refs', 'diner_gacha_signer_lanes', 'diner_gacha_transactions']) await assert.rejects(q(`select * from ${table}`), /permission denied/);
        await db.exec('reset role');
        const allowed = await q("select proname from pg_proc where pronamespace='public'::regnamespace and (proname like 'diner_gacha_tx_%' or proname like 'diner_gacha_secret_%') and has_function_privilege($1,oid,'EXECUTE')", [role]);
        assert.equal(allowed.length, 0);
      }
      await db.exec('set role service_role');
      await assert.rejects(q("delete from diner_gacha_transactions"), /permission denied/);
      await db.exec('reset role');
    });
    const start = Date.now() + 600000, vaultKey = `domain-kitchen:${game.chainId}:${game.contract}:round:${start}`;
    const template = { ...round, startsAt: start, endsAt: start + 60000, seasonStartsAt: start, seasonEndsAt: start + 600000 };
    const intent = (await q('select diner_gacha_reserve_round($1,$2) as value', [game.id, JSON.stringify(template)]))[0].value;
    await test('Missing Vault fails closed with no reference or plaintext fallback', async () => {
      await assert.rejects(vault.createOnce(vaultKey), /creation unavailable/);
      assert.equal((await q('select count(*)::int as n from diner_gacha_secret_refs'))[0].n, 0);
    });
    // PGlite cannot load Supabase's encrypted Vault extension. Only its documented
    // SQL interface is doubled below. This validates our transaction/access logic,
    // NOT real Vault encryption or hosted project configuration.
    await db.exec(`create schema vault;
      create table vault.test_secrets(id uuid primary key, decrypted_secret text, name text unique);
      create view vault.decrypted_secrets as select * from vault.test_secrets;
      create function vault.create_secret(s text,n text,d text) returns uuid language plpgsql as $$
        declare i uuid:=gen_random_uuid(); begin insert into vault.test_secrets values(i,s,n); return i; end $$;
      revoke all on schema vault from public; revoke all on all tables in schema vault from public;`);
    let reference = '', committedHash = '';
    await test('Lost create responses and concurrent retries keep exactly one Vault secret', async () => {
      loseReply = 'diner_gacha_secret_create';
      await assert.rejects(vault.createOnce(vaultKey), /creation unavailable/);
      const [a, b] = await Promise.all([vault.createOnce(vaultKey), vault.createOnce(vaultKey)]);
      assert.deepEqual(a, b); reference = a.reference; committedHash = a.hash;
      assert.equal((await q('select count(*)::int as n from vault.test_secrets'))[0].n, 1);
      const row = (await q('select * from diner_gacha_secret_refs'))[0];
      assert.equal('secret' in row, false); assert.equal('decrypted_secret' in row, false);
      await assert.rejects(vault.read(reference), /read unavailable/);
    });
    await test('Only committed gacha references can be read; tampering and unrelated Vault IDs fail', async () => {
      await q('select diner_gacha_commit_round($1,$2,$3,$4)', [game.id, intent.key, reference, committedHash]);
      assert.equal(secretHash(await vault.read(reference)), committedHash);
      const foreign = (await q("select vault.create_secret('unrelated credential','other-app','') as id"))[0].id;
      await assert.rejects(vault.read(`dk-vault:${foreign}`), /read unavailable/);
      await q("update vault.test_secrets set decrypted_secret=repeat('a',64) where id=$1", [reference.slice(9)]);
      await assert.rejects(vault.read(reference), /read unavailable/);
    });
    await test('Lost broadcast response reuses persisted bytes, signature and nonce', async () => {
      broadcastLost = true;
      await assert.rejects(signer.submitOnce(request('1')), error => error instanceof Error && !error.message.includes('SECRET_TOKEN'));
      const result = await signer.submitOnce(request('1'));
      assert.equal(broadcasts.length, 2); assert.equal(broadcasts[0], broadcasts[1]);
      assert.equal(result.transactionHash, keccak256(broadcasts[0])); assert.equal(signCount, 1); assert.equal(preparedCount, 1);
    });
    await test('Three-way concurrent calls share one durable transaction', async () => {
      const count = signCount;
      await Promise.allSettled([signer.submitOnce(request('2')), signer.submitOnce(request('2')), signer.submitOnce(request('2'))]);
      const result = await signer.submitOnce(request('2'));
      assert.equal(signCount, count + 1);
      assert.equal((await journal.get(request('2').idempotencyKey))!.transaction_hash, result.transactionHash);
    });
    await test('Lost signed-write reply recovers without signing or preparing again', async () => {
      loseReply = 'diner_gacha_tx_signed'; const count = signCount, before = broadcasts.length;
      await assert.rejects(signer.submitOnce(request('3')));
      assert.equal(broadcasts.length, before);
      await signer.submitOnce(request('3')); assert.equal(signCount, count + 1);
    });
    await test('Games sharing a signer allocate different nonces; request keys cannot change content', async () => {
      await signer.submitOnce(request('1', games[1]));
      const first = await journal.get(request('1').idempotencyKey), second = await journal.get(request('1', games[1]).idempotencyKey);
      assert.notEqual(first!.nonce, second!.nonce);
      const rows = await q('select count(*)::int as n,count(distinct nonce)::int as u from diner_gacha_transactions');
      assert.equal(rows[0].n, rows[0].u);
      const wrong = request('1'); wrong.idempotencyKey = request('2').idempotencyKey;
      await assert.rejects(signer.submitOnce(wrong), /operation_key/);
      await assert.rejects(signer.submitOnce(request('2', { ...game, contract: games[1].contract })), /not_approved/);
      await assert.rejects(journal.reserve(request('1').idempotencyKey, game.id, account.address.toLowerCase(), settlementCall(game, 'refund', pull('1')), 0));
    });
    await test('A pre-sign retirement fences future submission permanently', async () => {
      const key = request('4').idempotencyKey;
      const a = await signer.retireOnce(key), b = await signer.retireOnce(key);
      assert.equal(a.state, 'retired'); assert.deepEqual(a, b);
      const count = signCount; await assert.rejects(signer.submitOnce(request('4'))); assert.equal(signCount, count);
    });
    await test('Pending and missing receipts cannot retire; finalized revert can', async () => {
      const key = request('1').idempotencyKey, row = (await journal.get(key))!;
      assert.equal((await signer.retireOnce(key)).state, 'pending');
      pending.set(row.transaction_hash!, { status: 'reverted', hash: row.transaction_hash!, block: '900', blockHash: hash('final-900') });
      assert.equal((await signer.retireOnce(key)).state, 'retired');
      await assert.rejects(signer.submitOnce(request('1')));
      const live = (await journal.get(request('2').idempotencyKey))!;
      pending.set(live.transaction_hash!, { status: 'confirmed', hash: live.transaction_hash!, block: '900', blockHash: hash('final-900') });
      assert.equal((await signer.retireOnce(live.operation_key)).state, 'confirmed');
      const before = broadcasts.length; await signer.submitOnce(request('2')); assert.equal(broadcasts.length, before);
    });
    await test('Wrong signer output, fee excess and stale leases never broadcast', async () => {
      let tamper = true;
      const bad = new JournaledGachaSigner(journal, transport, { sign: async t => account.signTransaction(toViemTransaction(tamper ? { ...t, to: games[1].contract as Hex } : t)) }, policy);
      const before = broadcasts.length, req = request('5');
      await assert.rejects(bad.submitOnce(req)); assert.equal(broadcasts.length, before);
      const saved = (await journal.get(req.idempotencyKey))!;
      assert.equal((await signer.retireOnce(req.idempotencyKey)).state, 'pending');
      await expire(req.idempotencyKey);
      const otherAccount = privateKeyToAccount(`0x${'0'.repeat(63)}2`);
      const wrongSigner = new JournaledGachaSigner(journal, transport, { sign: async t => otherAccount.signTransaction(toViemTransaction(t)) }, policy);
      await assert.rejects(wrongSigner.submitOnce(req)); assert.equal(broadcasts.length, before);
      await expire(req.idempotencyKey); tamper = false;
      await signer.submitOnce(req);
      assert.equal(await journal.signed(req.idempotencyKey, saved.lease_token!, '0x01', hash('wrong')), false);
      const expensive = new JournaledGachaSigner(journal, { ...transport, prepare: async (c, s, n) => ({ ...await transport.prepare(c, s, n), gas: '500001' }) }, { sign: async () => { throw Error('MUST NOT SIGN'); } }, policy);
      await assert.rejects(expensive.submitOnce(request('6')));
      await expire(request('6').idempotencyKey); await signer.submitOnce(request('6'));
    });
    await test('Uncertain prepare response retains fees and blocks later nonces until resumed', async () => {
      const req = request('7'); loseReply = 'diner_gacha_tx_prepare';
      await assert.rejects(signer.submitOnce(req));
      const count = signCount, prepared = preparedCount;
      await assert.rejects(signer.submitOnce(request('8'))); assert.equal(signCount, count);
      await expire(req.idempotencyKey); await signer.submitOnce(req);
      assert.equal(preparedCount, prepared);
      pendingNonce = 30; await signer.submitOnce(request('8'));
      assert.equal((await journal.get(request('8').idempotencyKey))!.nonce, 30);
    });
    await test('Reveal uses real ABI and the same journal; live rounds cannot sign', async () => {
      const req = { idempotencyKey: operationKey(game, `reveal:${round.id}`), game, round, secret };
      const early = new JournaledGachaSigner(journal, transport, { sign: async () => { throw Error('MUST NOT SIGN'); } }, policy, () => round.startsAt);
      await assert.rejects(early.revealOnce(req), /cannot be revealed/);
      const result = await signer.revealOnce(req);
      const row = (await journal.get(req.idempotencyKey))!;
      assert.equal(result.transactionHash, keccak256(row.raw_tx!));
      assert.equal(parseTransaction(row.raw_tx!).to?.toLowerCase(), game.contract);
    });
    await test('Viem transport checks chain and canonical finality; no latest-block fallback', async () => {
      const txHash = hash('transport'), blockHash = hash('canonical'); let mode = 'pending';
      const rpc = {
        getChainId: async () => mode === 'wrong-chain' ? 1 : game.chainId,
        getTransactionReceipt: async () => {
          if (mode === 'pending') throw new TransactionReceiptNotFoundError({ hash: txHash });
          if (mode === 'offline') throw Error('RPC credentials must not escape');
          return { transactionHash: txHash, blockNumber: BigInt(50), blockHash, status: 'reverted' };
        },
        getBlock: async ({ blockTag }: { blockTag?: string }) => {
          if (mode === 'unsupported') throw Error('Finality unsupported');
          return { number: BigInt(blockTag ? mode === 'unfinalized' ? 49 : 51 : 50), hash: blockTag ? hash('head') : mode === 'reorg' ? hash('other') : blockHash };
        },
      } as unknown as PublicClient;
      const network = viemTransactionTransport(rpc, game.chainId);
      assert.equal((await network.observe(txHash)).status, 'pending');
      mode = 'unfinalized'; assert.equal((await network.observe(txHash)).status, 'pending');
      mode = 'finalized'; assert.equal((await network.observe(txHash)).status, 'reverted');
      for (mode of ['wrong-chain', 'offline', 'unsupported', 'reorg']) await assert.rejects(network.observe(txHash));
    });
    await test('Private worker assembly performs no I/O and rejects unapproved season configuration', async () => {
      const unused = new Proxy({}, { get: () => { throw Error('No connections may be used'); } });
      const worker = createPrivateGachaWorker({ db: unused as SupabaseClient, rpc: unused as PublicClient, custody: unused as any, policy });
      await assert.rejects(worker.run(game.id, { deploymentBlock: '0', season: DOMAIN_SEASONS[0], boxes: round.boxes }), /incomplete/);
    });
    console.log(`${groups} custody groups passed. Actual SQL and signatures; Vault encryption, RPC and managed signing remain test doubles.`);
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
