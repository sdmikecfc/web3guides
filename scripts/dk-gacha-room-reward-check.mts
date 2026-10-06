import assert from 'node:assert/strict';
import Module from 'node:module';
import { DOMAIN_COLLECTIBLES, DOMAIN_IDS } from '../src/lib/chef/diner/domain-worlds';
import { attachVerifiedCollectionRoom, collectionRoomReward, parseVerifiedCollection, type VerifiedCollection } from '../src/lib/chef/gacha/room-reward';
import { claimCollectionRestaurant } from '../src/lib/chef/gacha/collection-client';
import { createDiner, dispatchDiner, sanitizeDinerSave } from '../src/lib/chef/diner/progression';
import { DinerAuthorityError } from '../src/lib/chef/diner/authority';
const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown }, original = loader._load;
loader._load = function(name, ...args) { return name === 'server-only' ? {} : original.call(this, name, ...args); };
const wallet = '0x1111111111111111111111111111111111111111', other = '0x2222222222222222222222222222222222222222', now = 1800000000000;
const progress = (domain = 'gochujang' as typeof DOMAIN_IDS[number], count = 24): VerifiedCollection => {
  const ids = DOMAIN_COLLECTIBLES.filter(i => i.domain === domain).map(i => i.id);
  return { domain, catalogueVersion: 3, found: count, total: 24, discoveredIds: ids.slice(0, count), missingIds: ids.slice(count), complete: count === 24,
    completedAt: count === 24 ? now - 10 : null, receipt: count === 24 ? { id: `collection:${domain}:v3:${wallet}`, earnedAt: now - 10 } : null };
};
async function main() {
  const { createRoomRewardEndpoint, gachaRoomRewardEndpoint } = await import('../src/lib/chef/gacha/room-server');
  let authorized = 0, supplied: unknown = progress(), authError = false;
  const endpoint = createRoomRewardEndpoint({ enabled: () => true, configured: () => true, now: () => now,
    async collection(req, game) { authorized++; if (authError) throw new DinerAuthorityError('wallet_session_required', 'Sign in.', 401);
      assert.equal(game, 'gochujang'); assert.equal(req.headers.get('authorization'), 'Bearer test-session'); return { wallet, domain: 'gochujang', progress: supplied }; },
  });
  const request = (body = '{}', query = '') => new Request(`http://localhost/api/chef/gacha/gochujang/room${query}`, { method: 'POST', headers: { Authorization: 'Bearer test-session' }, body });
  const a = await endpoint(request(), 'gochujang'), b = await endpoint(request(), 'gochujang');
  assert.equal(a.status, 200); assert.equal(a.headers.get('cache-control'), 'no-store'); const expected = await a.json(); assert.deepEqual(await b.json(), expected);
  for (const body of ['[]', 'null', '', '{', '{"found":24}', '{"wallet":"' + other + '"}', '{"state":{}}']) assert.equal((await endpoint(request(body), 'gochujang')).status, 400);
  assert.equal(authorized, 2, 'Forged input never reaches account/collection reads');
  assert.equal((await endpoint(request(' '.repeat(65)), 'gochujang')).status, 413);
  assert.equal((await endpoint(request('{}', '?wallet=' + other), 'gochujang')).status, 400);
  supplied = progress('gochujang', 23); assert.equal((await endpoint(request(), 'gochujang')).status, 409);
  supplied = { ...progress(), receipt: null }; assert.equal((await endpoint(request(), 'gochujang')).status, 409);
  supplied = { ...progress(), receipt: { id: `collection:gochujang:v3:${other}`, earnedAt: now } }; assert.equal((await endpoint(request(), 'gochujang')).status, 503);
  supplied = { ...progress(), completedAt: now + 1 }; assert.equal((await endpoint(request(), 'gochujang')).status, 503);
  authError = true; assert.equal((await endpoint(request(), 'gochujang')).status, 401); authError = false;
  console.log('PASS authenticated empty-body claim, bound input, incomplete/revoked evidence, safe failures and idempotent receipt');

  for (const domain of DOMAIN_IDS) {
    const source = createDiner(now, `reward-${domain}`); source.coins = 8912; source.equipment.grill.tier = 3;
    const before = structuredClone(source), reward = collectionRoomReward(progress(domain), wallet, now), earned = attachVerifiedCollectionRoom(source, reward, wallet, domain);
    assert.deepEqual(source, before, 'Grant cannot mutate original save'); assert.ok(sanitizeDinerSave(earned));
    for (const property of Object.keys(before) as (keyof typeof before)[]) if (!['domainRooms', 'home', 'equipment', 'decorOwned'].includes(property)) assert.deepEqual(earned[property], before[property], property);
    for (const property of Object.keys(before.home) as (keyof typeof before.home)[]) if (!['fixtureInventory', 'stools'].includes(property)) assert.deepEqual(earned.home[property], before.home[property], property);
    assert.equal(earned.equipment.grill.tier, 3); assert.deepEqual(attachVerifiedCollectionRoom(earned, reward, wallet, domain), earned);
    const sold = structuredClone(earned); sold.decorOwned[`domain_kit_${domain}_plant`] = 0;
    assert.equal(attachVerifiedCollectionRoom(sold, reward, wallet, domain).decorOwned[`domain_kit_${domain}_plant`], 0);
    assert.throws(() => attachVerifiedCollectionRoom(source, reward, other, domain));
    assert.throws(() => attachVerifiedCollectionRoom(source, { ...reward, source: 'sample' }, wallet, domain));
    assert.throws(() => attachVerifiedCollectionRoom(source, { ...reward, state: source }, wallet, domain));
    assert.throws(() => parseVerifiedCollection({ ...progress(domain), discoveredIds: Array(24).fill(progress(domain).discoveredIds[0]) }, domain, wallet));
    const placed = dispatchDiner(earned, { type: 'applyDomainRoom', domain }, { now }); assert.equal(placed.error, undefined, placed.error);
    const restored = dispatchDiner(placed.state, { type: 'restoreDomainRoomBackup' }, { now }); assert.equal(restored.error, undefined, restored.error);
    assert.deepEqual(restored.state.home.layout, earned.home.layout); assert.deepEqual(placed.state.home.menu, earned.home.menu);
    assert.ok(dispatchDiner(source, { type: 'claimCollectionRoom', reward } as never, { now }).error, 'No browser command can submit a receipt as authoritative evidence');
  }
  console.log('PASS all three kits: unchanged saves/menus/balances/tiers, no duplicate grants, wrong-wallet/sample rejection, apply/restore');

  let live = createDiner(now, 'bridge'), activeWallet: string | null = wallet, writes = 0;
  const bridge = (fetcher: typeof fetch, signal = new AbortController().signal, persist = (next: typeof live) => { writes++; live = next; }) => claimCollectionRestaurant({ wallet, domain: 'gochujang', session: { wallet, accessToken: 'test-session' }, signal,
    current: () => activeWallet ? { wallet: activeWallet, state: live } : null, persist, fetcher });
  const fetcher: typeof fetch = async (url, options) => { assert.equal(url, '/api/chef/gacha/gochujang/room'); assert.equal(options?.body, '{}'); live.coins += 50; return Response.json(expected); };
  const oldCoins = live.coins; await bridge(fetcher); assert.equal(live.coins, oldCoins + 50); assert.equal(writes, 1);
  const snapshot = structuredClone(live);
  await assert.rejects(bridge(async () => { activeWallet = other; return Response.json(expected); }), /wallet changed/); assert.deepEqual(live, snapshot);
  activeWallet = wallet; await assert.rejects(bridge(async () => { activeWallet = null; return Response.json(expected); }), /wallet changed/); assert.equal(writes, 1);
  activeWallet = wallet; const controller = new AbortController();
  await assert.rejects(bridge(async () => { controller.abort(); return Response.json(expected); }, controller.signal)); assert.equal(writes, 1);
  await assert.rejects(bridge(async () => Response.json(expected), undefined, () => { throw new Error('storage failed'); }), /storage failed/); assert.deepEqual(live, snapshot);
  await assert.rejects(bridge(async () => Response.json({ reward: { ...expected.reward, wallet: other } }))); assert.equal(writes, 1);
  await bridge(async () => Response.json(expected)); assert.equal(writes, 2); assert.deepEqual(live, snapshot);
  console.log('PASS delayed response preserves newer play; switching/disconnect/unmount/cancel/storage failure cannot attach to another save');
  const env = process.env as Record<string, string | undefined>, saved = env.NODE_ENV;
  try { env.NODE_ENV = 'production'; assert.equal((await gachaRoomRewardEndpoint(request(), 'gochujang')).status, 404); }
  finally { if (saved === undefined) delete env.NODE_ENV; else env.NODE_ENV = saved; }
  console.log('PASS production room reward stays closed');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { loader._load = original; });
