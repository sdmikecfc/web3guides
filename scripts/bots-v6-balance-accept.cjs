// Verify two completed, independently seeded local banks. Never runs a match or reads credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const inputs = process.argv.slice(2);
assert.equal(inputs.length, 2, 'Usage: node scripts/bots-v6-balance-accept.cjs TRAIN/bank.json HELDOUT/bank.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const banks = inputs.map((input, index) => {
  const filename = path.resolve(input), report = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const expectedSplit = index === 0 ? 'train' : 'heldout';
  assert.equal(report.split, expectedSplit); assert.equal(report.scope, 'all');
  assert.equal(report.completeBank, true); assert.equal(report.diagnosticSeeds, null);
  assert.equal(report.thresholdPass, true, `${expectedSplit}: reference thresholds failed`);
  assert.deepEqual(report.problems, []); assert.deepEqual(report.nearBoundary, [], 'Expand uncertain boundary pairs before acceptance');
  assert.equal(report.partitions.length, 23); assert.equal(new Set(report.partitions.map(p => p.cohort)).size, 23);
  const snapshot = path.join(path.dirname(filename), 'snapshot'), source = path.join(snapshot, 'src/lib/bots/v6');
  const sourceHash = createHash('sha256');
  for (const file of fs.readdirSync(source).filter(file => /\.(ts|json)$/.test(file) && !['index.ts', 'assets.ts', 'asset-catalogue.json'].includes(file)).sort()) {
    sourceHash.update(file); sourceHash.update(fs.readFileSync(path.join(source, file), 'utf8').replace(/\r\n/g, '\n'));
  }
  assert.equal(sourceHash.digest('hex'), report.sourceHash, 'Saved source must match the executed bank');
  assert.equal(hash(fs.readFileSync(path.join(snapshot, 'scripts/bots-v6-balance-matrix.ts'), 'utf8').replace(/\r\n/g, '\n')), report.testHash);
  let games = 0, sideWins = 0;
  const totals = Object.fromEntries(['tank', 'speed', 'ranged'].map(style => [style, { wins: 0, games: 0 }]));
  for (const part of report.partitions) {
    assert.equal(part.exitCode, 0); assert.equal(part.header.sourceHash, report.sourceHash); assert.equal(part.header.testHash, report.testHash);
    assert.equal(part.header.splitFilter, expectedSplit); assert.equal(part.header.sampleOverride, null); assert.equal(part.header.pairFilter, null);
    assert.equal(part.pairs.length, 3); assert.deepEqual(part.receipt.failures, []); assert.equal(part.receipt.timeouts, 0);
    for (const row of part.pairs) {
      assert.equal(row.split, expectedSplit); assert.equal(row.timeouts, 0);
      assert.equal(row.matches, row.independentSeeds * (row.cohort.startsWith('mirror-') ? 1 : 2) * row.familyCombinations);
      if (row.cohort.startsWith('arsenal-')) {
        const tier=Number(row.cohort.slice(-1)),expected=tier===2||row.pair==='tank/speed'?72:81;
        assert.equal(row.independentSeeds,expected); assert.equal(row.weaponAssignments.length,expected); assert.equal(new Set(row.weaponAssignments.map(p=>p.join('/'))).size,expected);
        for(const [a,b] of row.weaponAssignments){assert.notEqual(a,b);assert.notEqual(a,'shoulder_cannon');if(b==='shoulder_cannon')assert(tier>=3&&row.pair.endsWith('/ranged'));}
      }
      if (!row.reference) continue;
      assert.equal(row.familyCombinations, 4); assert(row.independentSeeds >= 16);
      assert(row.firstStyleWinRate >= .3 && row.firstStyleWinRate <= .7);
      if (Math.min(Math.abs(row.firstStyleWinRate - .3), Math.abs(row.firstStyleWinRate - .7)) <= .04) assert(row.independentSeeds >= 32);
      const [a, b] = row.pair.split('/'), wins = row.firstStyleWinRate * row.matches;
      assert(Number.isInteger(wins)); totals[a].wins += wins; totals[b].wins += row.matches - wins;
      totals[a].games += row.matches; totals[b].games += row.matches; games += row.matches; sideWins += row.firstSideWinRate * row.matches;
    }
  }
  assert.equal(games, report.referenceGames); assert(Math.abs(sideWins / games - .5) < .05);
  for (const value of Object.values(totals)) assert(value.wins / value.games >= .4 && value.wins / value.games <= .6);
  return report;
});
assert.equal(banks[0].sourceHash, banks[1].sourceHash, 'Training and held-out must use the same frozen simulation');
assert.equal(banks[0].testHash, banks[1].testHash, 'Training and held-out must use the same test contract');
for(const part of banks[0].partitions){const peer=banks[1].partitions.find(p=>p.cohort===part.cohort);assert.deepEqual(part.pairs.map(p=>[p.pair,p.independentSeeds,p.matches]),peer.pairs.map(p=>[p.pair,p.independentSeeds,p.matches]),'Use the same declared cohort sizes in both banks');}
console.log(JSON.stringify({ balanceReferenceGatePass: true, sourceHash: banks[0].sourceHash, testHash: banks[0].testHash, banks: banks.map(b => ({ split: b.split, referenceGames: b.referenceGames, overall: b.overall, sideBias: b.sideBias, subgroupOutliers: b.subgroupOutliers, weaponScores: b.weaponScores })), releaseReady: false, note: 'Review the reported weapon/hybrid/plan outliers and independent gameplay, asset, persistence and performance checks before rollout.' }, null, 2));
