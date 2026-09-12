const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { PGlite } = require(process.env.BOTS_PGLITE_PATH || '@electric-sql/pglite');
const { V6_CATALOG, cardV6, presetV6, snapshotBuildV6, weaponCompatibilityV6, FAMILIES_V6 } = require('../src/lib/bots/v6');
const server = require('../src/app/bots/_server/season');
const { SEASON_SOCKETS } = require('../src/lib/bots/season/rules');
const stage = process.env.BOTS_SEASON_STAGE || path.resolve(__dirname, '..');
const sqlFile = path.join(stage, 'scripts/sql/bots-season-v1-catalog.sql');
const seed = fs.readFileSync(sqlFile, 'utf8');
const table = `CREATE TABLE mk6_catalog(id text PRIMARY KEY,catalog_version text NOT NULL,slot text NOT NULL,tier integer NOT NULL,gp integer NOT NULL,price integer NOT NULL,spec jsonb NOT NULL);
CREATE TABLE mk6_fixture_owned(snapshot jsonb); INSERT INTO mk6_fixture_owned VALUES('{"weapon":"mk6.t2.weapon.shoulder_cannon","coins":987}');`;
const rows = async db => (await db.query('SELECT * FROM mk6_catalog ORDER BY id')).rows;
const owned = async db => (await db.query('SELECT * FROM mk6_fixture_owned')).rows;
const partsOf = build => Object.fromEntries(SEASON_SOCKETS.map(socket => [socket, build.parts[socket].id]));
const checks = [];
const pass = text => { checks.push(text); console.log('PASS', text); };

async function rejectedSeed(db) {
  await assert.rejects(() => db.exec(seed), /MK6_CATALOG_MISMATCH.*Roll back and review/);
  await db.exec('ROLLBACK;');
}

(async () => {
  assert.equal(V6_CATALOG.length, 134);
  assert.equal(cardV6('mk6.t2.weapon.shoulder_cannon'), undefined);
  assert.deepEqual([1, 2, 3, 4].map(tier => V6_CATALOG.filter(c => c.tier === tier).length), [27, 33, 37, 37]);
  const cannons = V6_CATALOG.filter(c => c.weaponKind === 'shoulder_cannon');
  assert.equal(cannons.length, 4);
  for (const cannon of cannons) { assert.equal(cannon.style, 'ranged'); assert.equal(cannon.signatureStyle, 'ranged'); assert.ok(cannon.tier >= 3); }
  pass('134 active cards; starter27 unchanged; no Tier2 cannon; all four cannon kits labelled Ranged');

  let combinations = 0, legal = 0;
  for (const weapon of cannons) for (const family of FAMILIES_V6) for (const tier of [1, 2, 3, 4]) {
    const base = presetV6(family.style, tier, { family: family.id });
    const raw = JSON.parse(JSON.stringify(base.appearanceBuild));
    raw.weapon = { id: weapon.id, s: [...weapon.s] };
    const allowed = family.style === 'ranged' && tier >= 3;
    assert.equal(weaponCompatibilityV6(weapon.id, base.parts.torso.id).compatible, allowed);
    const chosen = { ...partsOf(base), weapon: weapon.id };
    if (allowed) {
      assert.equal(snapshotBuildV6(raw).parts.weapon.id, weapon.id);
      assert.equal(server.seasonBuild(chosen).parts.weapon.id, weapon.id);
      assert.equal(server.parseArchiveBuild({ requestId: 'valid-archive-cannon', name: 'Fixture', parts: chosen }).build.parts.weapon.id, weapon.id);
      legal++;
    } else {
      assert.throws(() => snapshotBuildV6(raw), /tier 3 or 4 Ranged body/);
      assert.throws(() => server.seasonBuild(chosen), /matching Tier 3 or Tier 4 body/);
      assert.throws(() => server.parseArchiveBuild({ requestId: 'invalid-archive-cannon', name: 'Fixture', parts: chosen }), /matching Tier 3 or Tier 4 body/);
    }
    combinations++;
  }
  assert.equal(combinations, 96); assert.equal(legal, 16);
  pass('96 body/cannon combinations enforce the same rule in domain, seasonal Finish builder and archive parser');

  let rpcCalls = 0;
  let selected = { ...partsOf(presetV6('tank', 3)), weapon: 'mk6.t3.weapon.shoulder_cannon' };
  const fakeDb = {
    from(tableName) { assert.ok(['mk6_receipts', 'mk6_players'].includes(tableName)); const query = {
      select() { return this; }, eq() { return this; }, async maybeSingle() {
        return { error: null, data: tableName === 'mk6_receipts' ? null : { draft: { revision: 2, parts: selected } } };
      },
    }; return query; },
    async rpc(name, payload) { rpcCalls++; assert.equal(name, 'mk6_finish_bot'); return { error: null, data: { id: payload.p_id, build: payload.p_build } }; },
  };
  await assert.rejects(() => server.finishSeasonBot(fakeDb, '0x' + '3'.repeat(40), { requestId: 'bad-cannon-finish', revision: 2 }), /matching Tier 3 or Tier 4 body/);
  assert.equal(rpcCalls, 0);
  selected = { ...partsOf(presetV6('ranged', 3)), weapon: 'mk6.t3.weapon.shoulder_cannon' };
  const finished = await server.finishSeasonBot(fakeDb, '0x' + '3'.repeat(40), { requestId: 'good-cannon-finish', revision: 2 });
  assert.equal(finished.bot.build.parts.weapon.id, selected.weapon); assert.equal(rpcCalls, 1);
  assert.throws(() => server.parseArchiveBuy({ requestId: 'retired-purchase', cardId: 'mk6.t2.weapon.shoulder_cannon' }), /available collection part/);
  pass('incompatible Finish stops before the mutation RPC; compatible Finish keeps exact weapon; retired collection purchase rejected');

  const fresh = new PGlite(); await fresh.exec(table);
  const ownedBefore = await owned(fresh);
  await fresh.exec(seed);
  assert.equal((await rows(fresh)).length, 134);
  for (const row of await rows(fresh)) assert.deepEqual(row.spec, cardV6(row.id));
  const freshRows = await rows(fresh); await fresh.exec(seed);
  assert.deepEqual(await rows(fresh), freshRows); assert.deepEqual(await owned(fresh), ownedBefore);
  pass('fresh PGlite seed matches every canonical spec; repeat application changes no row or saved equipment');

  const old = new PGlite(); await old.exec(table);
  await old.exec(fs.readFileSync(path.join(stage, 'scripts/fixtures/bots-season-catalog-before-cannon.sql'), 'utf8'));
  const oldRows = await rows(old);
  assert.equal(oldRows.length, 135);
  const oldMap = new Map(oldRows.map(row => [row.id, row]));
  for (const card of V6_CATALOG) {
    const previous = oldMap.get(card.id); assert.ok(previous);
    assert.deepEqual([previous.slot, previous.tier, previous.gp, previous.price, previous.spec.s], [card.slot, card.tier, card.gp, card.price, card.s], card.id);
  }
  await rejectedSeed(old);
  assert.deepEqual(await rows(old), oldRows); assert.deepEqual(await owned(old), ownedBefore);
  pass('all retained prices/GP/tuples unchanged; stale135-card preview rejects without deleting its retired part or changing saved equipment');

  await fresh.exec("DELETE FROM mk6_catalog WHERE id='mk6.t1.weapon.sword'; UPDATE mk6_catalog SET spec=jsonb_set(spec,'{style}','\"tank\"') WHERE id='mk6.t3.weapon.shoulder_cannon';");
  const altered = await rows(fresh);
  assert.equal(altered.length, 133);
  await rejectedSeed(fresh);
  assert.deepEqual(await rows(fresh), altered); assert.deepEqual(await owned(fresh), ownedBefore);
  pass('altered retained cannon metadata rejects transactionally; the temporarily inserted missing card rolls back too');

  await fresh.close(); await old.close();
  const report = { at: new Date().toISOString(), passed: true, checks, activeCards: 134, bodyWeaponCombinations: combinations,
    legalBodyWeaponCombinations: legal, sqlSha256: crypto.createHash('sha256').update(seed).digest('hex'),
    databases: 'Two isolated in-memory PGlite fixtures', liveDatabaseActions: 0, externalServiceActions: 0 };
  fs.writeFileSync(path.join(stage, 'cannon-verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: true, groups: checks.length, combinations }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
