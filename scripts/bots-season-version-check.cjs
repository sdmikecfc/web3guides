/* Current source only, local objects and a read-only mock. No services or database. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { presetV6, createFightV6, RULES_V6, validBuildV6, replayV6 } = require('../src/lib/bots/v6');
const { SEASON_RULES } = require('../src/lib/bots/season/rules');
const { advanceSeasonSnapshot, resumeSeasonMatch, seasonBuild, SeasonError } = require('../src/app/bots/_server/season');
const clone = structuredClone, checks = [], now = Date.now(), wallet = '0x' + 'a'.repeat(40);
const builds = [presetV6('tank', 1), presetV6('ranged', 1)], initial = createFightV6(75, ...builds);
const original = { id: '00000000-0000-4000-8000-000000000075', season_id: 'fixture-season', wallet, bot_id: 'fixture-bot', mode: 'house', requested_mode: 'house', revision: 1, status: 'running', started_at: new Date(now).toISOString(), seed: 75, builds, plans: ['balanced', 'balanced'], identities: [{ name: 'Saved Tank' }, { name: 'Saved Ranger' }], rules: { ...SEASON_RULES, engine: RULES_V6 }, state: initial, input_receipts: [], result: null, settlement: null };
const unavailable = error => error instanceof SeasonError && error.status === 503 && error.code === 'RULES_UNAVAILABLE' && /saved robot and combat rules/.test(error.message);
const pass = name => { checks.push(name); console.log('PASS', name); };
(async () => {
  assert.equal(RULES_V6.rulesVersion, 'mk6-2');
  const saved = JSON.stringify(original), advanced = advanceSeasonSnapshot(original, now + 1000);
  assert.equal(advanced.state.frame, 60); assert.equal(JSON.stringify(original), saved);
  const choices = Object.fromEntries(Object.entries(builds[0].parts).map(([socket, part]) => [socket, part.id]));
  assert.deepEqual(seasonBuild(choices), builds[0]); assert(validBuildV6(seasonBuild(choices)));
  pass('fresh canonical Finish build is mk6-2; current pending fight advances without mutating its saved snapshot');
  const oldRules = clone(original); oldRules.rules.engine.rulesVersion = 'mk6-1';
  const oldState = clone(original); oldState.state.rulesVersion = 'mk6-1';
  const oldBuild = clone(original); oldBuild.state = null; oldBuild.builds[0].rulesVersion = 'mk6-1';
  const changedBuild = clone(original); changedBuild.state.builds[0].stats.health += 1;
  const changedSeed = clone(original); changedSeed.state.seed = 76;
  for (const row of [oldRules, oldState, oldBuild, changedBuild, changedSeed]) {
    const before = JSON.stringify(row); assert.throws(() => advanceSeasonSnapshot(row, now + 1000), unavailable); assert.equal(JSON.stringify(row), before);
  }
  assert.throws(() => replayV6({ version: 6, rulesVersion: 'mk6-1', catalogVersion: 'mk6-catalog-1' }), /recorded replay rules are not installed/);
  pass('old rules, old state, old build, mismatched saved build and mismatched seed fail clearly; old proof replay is never relabeled');
  let writes = 0, reads = 0;
  for (const status of ['preparing', 'running', 'settlement-pending']) {
    const row = { ...clone(oldRules), status }, before = JSON.stringify(row);
    const db = { from(table) { assert.equal(table, 'mk6_matches'); const q = { select() { return q; }, eq() { return q; }, async maybeSingle() { reads++; return { data: row, error: null }; } }; return q; }, rpc() { writes++; throw Error('Version refusal may not write a fight or settlement.'); } };
    await assert.rejects(() => resumeSeasonMatch(db, wallet, row.id, undefined, now + 1000), unavailable);
    assert.equal(JSON.stringify(row), before);
  }
  assert.equal(reads, 3); assert.equal(writes, 0);
  pass('preparing, running and settlement-pending old proofs refuse resume before any CAS or payout; saved data stays intact');
  const report = { passed: true, rulesVersion: RULES_V6.rulesVersion, checks, completedAt: new Date().toISOString(), scope: 'local in-memory objects and read-only mock only' };
  fs.writeFileSync(path.join(process.env.BOTS_SEASON_STAGE || path.resolve(__dirname, '..'), 'version-verification.json'), JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
