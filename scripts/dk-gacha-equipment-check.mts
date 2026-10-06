import assert from 'node:assert/strict';
import Module from 'node:module';
import { DOMAIN_COLLECTIBLES, DOMAIN_IDS } from '../src/lib/chef/diner/domain-worlds';
import { createDiner } from '../src/lib/chef/diner/progression';
import { EQUIPMENT_BY_ID } from '../src/lib/chef/diner/content';
import type { StationKind } from '../src/lib/chef/diner/types';
import { EquipmentCollectionClient } from '../src/lib/chef/gacha/equipment-client';
import { equipmentRoomKey, equipmentDestinations, equipmentDestinationError, equipmentSkinOverlays, parseEquipmentInventory, parseEquipmentAssignment, type EquipmentInventory, type EquipmentAssignmentRequest } from '../src/lib/chef/gacha/equipment-ownership';
import { DinerAuthorityError } from '../src/lib/chef/diner/authority';
const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown }, original = loader._load;
loader._load = function(name, ...args) { return name === 'server-only' ? {} : original.call(this, name, ...args); };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const wallet = '0x1111111111111111111111111111111111111111';
async function main() {
  const { createEquipmentEndpoint, gachaEquipmentEndpoint } = await import('../src/lib/chef/gacha/equipment-server');
  const state = createDiner(1800000000000, 'equipment-test'), destination = equipmentDestinations(state, 'home').find(d => d.kind === 'prep')!;
  assert(destination);
  const fresh = (): EquipmentInventory => ({ domain: 'gochujang', ready: true, revision: '0', checkpoint: { block: '10', hash: `0x${'1'.repeat(64)}`, timestamp: 1800000000000 },
    items: [{ tokenId: '1', itemId: 'domain_gochujang_pepper_prep', catalogueVersion: 3, destination: null }, { tokenId: '2', itemId: 'domain_gochujang_fireant_brigade', catalogueVersion: 3, destination: null }],
  });
  let inventory = fresh(), reads = 0, writes = 0, auth = true;
  const receipts = new Map<string, string>();
  const endpoint = createEquipmentEndpoint({ enabled: () => true, configured: () => true, now: () => 1800000000000,
    async account(req, game) { assert.equal(game, 'gochujang'); assert.equal(req.headers.get('authorization'), 'Bearer session'); if (!auth) throw new DinerAuthorityError('auth', 'Sign in.', 401); return { owner: wallet, domain: 'gochujang' }; },
    async inventory() { reads++; return structuredClone(inventory); },
    async assign(_g, owner, r) {
      assert.equal(owner, wallet); const old = receipts.get(r.requestId), body = JSON.stringify(r);
      if (old) { assert.equal(old, body); return; }
      if (r.revision !== inventory.revision) throw new DinerAuthorityError('conflict', 'Refresh.', 409);
      writes++; receipts.set(r.requestId, body); inventory = { ...inventory, revision: String(Number(inventory.revision) + 1), items: inventory.items.map(i => i.tokenId === r.tokenId ? { ...i, destination: r.destination } : i) };
    },
  });
  const request = (body?: unknown, query = '') => new Request(`http://localhost/api/chef/gacha/gochujang/equipment${query}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer session' }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const change: EquipmentAssignmentRequest = { requestId: uuid(1), revision: '0', tokenId: '1', destination };
  for (const bad of [{ ...change, wallet }, { ...change, coins: 5 }, { ...change, itemId: 'forged' }, { ...change, destination: { ...destination, kind: 'grill', tier: 3 } }, { ...change, tokenId: '-1' }, { ...change, tokenId: (BigInt(1) << BigInt(256)).toString() }, 'null', '[]', '{']) assert.equal((await endpoint(request(bad), 'gochujang')).status, 400);
  assert.equal(reads, 0); assert.equal((await endpoint(request('x'.repeat(2049)), 'gochujang')).status, 413);
  assert.equal((await endpoint(request(undefined, '?wallet=' + wallet), 'gochujang')).status, 400);
  auth = false; assert.equal((await endpoint(request(), 'gochujang')).status, 401); auth = true;
  assert.equal((await endpoint(request({ ...change, destination: { ...destination, kind: 'grill' } }), 'gochujang')).status, 400);
  assert.equal((await endpoint(request({ ...change, tokenId: '2' }), 'gochujang')).status, 400, 'Decoration cannot become a production machine');
  assert.equal((await endpoint(request({ ...change, tokenId: '999' }), 'gochujang')).status, 409);
  inventory.ready = false; inventory.checkpoint = null; inventory.items = [];
  assert.equal((await endpoint(request(change), 'gochujang')).status, 409);
  inventory = fresh(); const a = await endpoint(request(change), 'gochujang'); assert.equal(a.status, 200); assert.equal(a.headers.get('cache-control'), 'no-store');
  assert.equal((await endpoint(request(change), 'gochujang')).status, 200); assert.equal(writes, 1);
  inventory.checkpoint!.timestamp -= 300001;
  assert.equal((await (await endpoint(request(), 'gochujang')).json()).inventory.ready, false);
  assert.equal((await endpoint(request(change), 'gochujang')).status, 409);
  console.log('PASS private assignment API: authentication, bounded input, no client ownership/progress, compatibility and retries');
  inventory=fresh();receipts.clear();
  const displayChange:EquipmentAssignmentRequest={requestId:uuid(2),revision:'0',tokenId:'2',destination:{...destination,id:'display-1',kind:'collection_spot_counter_1',display:true}};
  assert.equal((await endpoint(request({...displayChange,destination:{...displayChange.destination,kind:'collection_spot_floor_1'}}),'gochujang')).status,400);
  assert.equal((await endpoint(request({...displayChange,destination:{...displayChange.destination,location:'truck'}}),'gochujang')).status,400);
  assert.equal((await endpoint(request(displayChange),'gochujang')).status,200);
  assert.equal((await endpoint(request(displayChange),'gochujang')).status,200);
  assert.equal(parseEquipmentInventory((await (await endpoint(request(),'gochujang')).json()).inventory,'gochujang').items[1].destination?.display,true);
  console.log('PASS owned decoration assignment: exact mount/envelope, no truck machine impersonation and retry-safe display binding');

  for (const domain of DOMAIN_IDS) for (const item of DOMAIN_COLLECTIBLES.filter(i => i.domain === domain && i.machine)) {
    const test = structuredClone(state), machine = item.machine!;
    if (!EQUIPMENT_BY_ID[machine]) { assert.equal(equipmentDestinationError(test, item.id, { ...destination, kind: machine }), 'Load or place this machine first.'); continue; }
    test.equipment[machine] = { tier: 3, homeCopies: 1, truckOwned: true };
    test.home.layout.push({ id: 'skin-test-machine', equipmentId: machine, x: 1, y: 1, rotation: 0 });
    test.truckConfig.stations.push({ id: 'skin-test-truck', kind: machine as StationKind, x: 1, y: 1, facing: 0 });
    for (const location of ['home', 'truck'] as const) {
      const target = equipmentDestinations(test, location).find(d => d.id.startsWith('skin-test'))!;
      const owned = { ...fresh(), domain, items: [{ tokenId: '1', itemId: item.id, catalogueVersion: 3 as const, destination: target }] };
      const before = structuredClone(test); assert.equal(equipmentSkinOverlays(test, owned, location)[target.id], item.id); assert.deepEqual(test, before);
      assert.equal(equipmentDestinationError(test, item.id, { ...target, room: equipmentRoomKey({ seed: 'another-save' }) }), 'Load or place this machine first.');
      if (location === 'home') test.home.layout = test.home.layout.filter(p => p.id !== target.id); else test.truckConfig.stations = test.truckConfig.stations.filter(p => p.id !== target.id);
      assert.deepEqual(equipmentSkinOverlays(test, owned, location), {}, 'Stored machines immediately release the visual overlay');
    }
  }
  assert.throws(() => parseEquipmentInventory({ ...fresh(), items: [fresh().items[0], fresh().items[0]] }, 'gochujang'));
  assert.throws(() => parseEquipmentAssignment({ ...change, destination: { ...destination, id: '<script>' } }));
  console.log('PASS 18 skin definitions: compatible home/truck targets preserve tier/food/save; four future machines remain unavailable');

  const originalState = structuredClone(state);
  inventory = fresh(); receipts.clear(); writes = 0; let visible: EquipmentInventory | null = null, current = true, lose = false, fail = false, serial = 10, local = state;
  const bodies: string[] = [];
  const client = new EquipmentCollectionClient({ domain: 'gochujang', accessToken: 'session', current: () => current ? local : null, changed: v => { visible = v; }, requestId: () => uuid(serial++),
    fetcher: async (url, options) => { if (fail) throw Error('Simulated offline'); if (options?.body) bodies.push(String(options.body)); const result = await endpoint(new Request(`http://localhost${url}`, options), 'gochujang'); if (lose && options?.body) { lose = false; throw Error('Simulated lost reply'); } return result; },
  });
  await client.refresh(); assert(visible); lose = true; await assert.rejects(client.assign('1', destination), /lost reply/);
  assert.equal(visible, null); assert(client.pending); await client.retry(); assert.equal(bodies[0], bodies[1]); assert.equal(writes, 1); assert.equal(client.pending, null);
  assert.equal(client.inventory!.items[0].destination!.id, destination.id);
  local = structuredClone(state); local.home.layout = local.home.layout.filter(p => p.id !== destination.id);
  await client.releaseMissing(); assert.equal(client.inventory!.items[0].destination, null); local = state;
  await client.assign('1', destination);
  fail = true; await assert.rejects(client.refresh()); assert.equal(visible, null); fail = false;
  inventory.items = inventory.items.filter(i => i.tokenId !== '1'); await client.refresh(); assert.deepEqual(equipmentSkinOverlays(state, client.inventory, 'home'), {});
  assert.deepEqual(state, originalState, 'All wallet operations preserve the entire original restaurant');
  current = false; await assert.rejects(client.assign('2', null)); client.dispose(); assert.equal(visible, null);
  console.log('PASS client lost reply reuses exact request; transfer and offline reads remove skins without touching machines');

  let resolve!: (r: Response) => void; visible = null;
  const delayed = new EquipmentCollectionClient({ domain: 'gochujang', accessToken: 'session', current: () => state, changed: v => { visible = v; }, fetcher: () => new Promise(r => { resolve = r; }) });
  const waiting = delayed.refresh(); delayed.dispose(); resolve(Response.json({ inventory: fresh(), source: 'finalized-ownership' })); await waiting; assert.equal(visible, null);
  const env = process.env as Record<string, string | undefined>, prior = env.NODE_ENV; env.NODE_ENV = 'production';
  try { for (const r of [request(), request(change)]) assert.equal((await gachaEquipmentEndpoint(r, 'gochujang')).status, 404); } finally { env.NODE_ENV = prior; }
  console.log('PASS delayed reply after disconnect/unmount ignored; real production GET/POST remain closed');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { loader._load = original; });
