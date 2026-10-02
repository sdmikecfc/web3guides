// Isolated CPU-only balance banks. No services, credentials, environment files or database access.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const os = require('node:os');
const assert = require('node:assert/strict');
const split = process.argv[2], scope = process.argv[3] || 'all';
assert(['train', 'heldout'].includes(split), 'Choose an explicit train or heldout bank. Never tune on heldout.');
assert(['all', 'reference'].includes(scope));
const output = path.resolve(process.env.MK_V6_BENCH_OUTPUT || path.join(__dirname, '..', 'outputs', `v6-balance-${split}-${Date.now()}`));
const workers = Math.max(1, Math.min(4, Number(process.env.MK_V6_BENCH_WORKERS || 4)));
const diagnosticSeeds = process.env.MK_V6_BENCH_DIAGNOSTIC_SEEDS ? Number(process.env.MK_V6_BENCH_DIAGNOSTIC_SEEDS) : null;
if (diagnosticSeeds !== null) assert(split === 'train' && scope === 'reference' && Number.isInteger(diagnosticSeeds) && diagnosticSeeds >= 2 && diagnosticSeeds <= 64, 'Reduced diagnostics are training/reference only.');
const cohortIds = [];
for (const tier of [1, 2, 3, 4]) {
  cohortIds.push(`role-t${tier}`);
  if (scope === 'all') {
    cohortIds.push(`mirror-t${tier}`, `manual-t${tier}`, `hybrid-t${tier}`);
    if (tier >= 2) cohortIds.push(`arsenal-t${tier}`);
    if (tier >= 3) cohortIds.push(`signature-t${tier}`, `splash-t${tier}`);
  }
}
cohortIds.sort((a,b) => Number(!a.startsWith("role-"))-Number(!b.startsWith("role-")) || a.localeCompare(b));
fs.mkdirSync(output, { recursive: true });
const snapshot = path.join(output, 'snapshot');
assert(!fs.existsSync(snapshot), 'Choose an unused output directory; each bank retains its exact source snapshot.');
fs.mkdirSync(path.join(snapshot, 'src', 'lib', 'bots'), { recursive: true });
fs.mkdirSync(path.join(snapshot, 'scripts'), { recursive: true });
// fs.cpSync walks every ancestor on Windows, including restricted user-home metadata.
// Copy only known entries under the game source; never follow symlinks or inspect parent trees.
function copySource(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name), destination = path.join(to, entry.name);
    if (entry.isDirectory()) copySource(source, destination);
    else if (entry.isFile()) fs.copyFileSync(source, destination);
    else throw new Error(`Unsupported entry in pure v6 source: ${entry.name}`);
  }
}
copySource(path.join(__dirname, '..', 'src', 'lib', 'bots', 'v6'), path.join(snapshot, 'src', 'lib', 'bots', 'v6'));
fs.copyFileSync(path.join(__dirname, 'bots-v6-balance-matrix.ts'), path.join(snapshot, 'scripts', 'bots-v6-balance-matrix.ts'));
let next = 0;
const results = [];
function run(cohort) {
  return new Promise(resolve => {
    const log = path.join(output, `${cohort}.log`), sink = fs.createWriteStream(log);
    const env = { ...process.env, MK_V6_BENCH_OUTPUT: output, MK_V6_BENCH_COHORT: cohort, MK_V6_BENCH_SPLIT: split, MK_V6_BENCH_PARTITION: '1' };
    if (cohort === 'role-t1' && process.env.MK_V6_REFERENCE_SEEDS_T1) env.MK_V6_REFERENCE_SEEDS = process.env.MK_V6_REFERENCE_SEEDS_T1;
    if (diagnosticSeeds === null) delete env.MK_V6_BENCH_SEEDS;
    else env.MK_V6_BENCH_SEEDS = String(diagnosticSeeds);
    const child = spawn(process.execPath, [...process.execArgv, path.join(__dirname, 'bots-v6-check.cjs'), 'bots-v6-balance-matrix.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    // Touch only this runner's newly spawned worker; never enumerate or alter other processes.
    child.once('spawn', () => {
      try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); console.log(JSON.stringify({ worker: cohort, pid: child.pid, priority: 'below-normal' })); }
      catch (error) { console.log(JSON.stringify({ worker: cohort, pid: child.pid, priority: 'unchanged', reason: String(error) })); }
    });
    child.stdout.pipe(sink, { end: false }); child.stderr.pipe(sink, { end: false });
    child.on('error', error => { sink.end(String(error)); resolve({ cohort, log, exitCode: -1, error: String(error) }); });
    child.on('close', exitCode => sink.end(() => {
      const json = fs.readFileSync(log, 'utf8').split(/\r?\n/).filter(line => line.startsWith('{')).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
      const value = { cohort, log, exitCode, header: json.find(row => row.sourceHash), pairs: json.filter(row => row.pair), summary: json.find(row => row.scores && row.cohort), receipt: json.findLast(row => row.failures) };
      console.log(JSON.stringify({ cohort, exitCode, pairs: value.pairs.map(p => [p.pair, p.firstStyleWinRate, p.matches]) }));
      resolve(value);
    }));
  });
}
async function worker(limit = cohortIds.length) { while (next < limit) { const cohort = cohortIds[next++]; results.push(await run(cohort)); } }
(async () => {
  await Promise.all(Array.from({ length: workers }, () => worker(4)));
  const referenceFailed = results.some(result => result.exitCode || !result.receipt || result.receipt.failures.length);
  if (scope === 'all' && !referenceFailed) await Promise.all(Array.from({ length: workers }, () => worker()));
  else if (scope === 'all') console.log(JSON.stringify({ incompleteBank: true, reason: 'Reference partition failed. Remaining cohorts were not run for this rejected candidate.' }));
  results.sort((a, b) => a.cohort.localeCompare(b.cohort));
  const problems = [], hashes = new Set(results.map(r => r.header?.sourceHash)), tests = new Set(results.map(r => r.header?.testHash));
  if (hashes.size !== 1 || hashes.has(undefined)) problems.push('Domain changed or a worker failed before loading its source.');
  if (tests.size !== 1 || tests.has(undefined)) problems.push('Bank partitions did not use one test contract.');
  for (const result of results) {
    if (result.exitCode || !result.receipt || result.pairs.length !== 3) problems.push(`${result.cohort}: incomplete or failed partition`);
    problems.push(...(result.receipt?.failures || []));
  }
  const styles = ['tank', 'speed', 'ranged'], scores = Object.fromEntries(styles.map(style => [style, { wins: 0, games: 0 }]));
  const references = results.flatMap(r => r.pairs || []).filter(row => row.reference);
  let games = 0, sideWins = 0;
  for (const row of references) {
    const [a, b] = row.pair.split('/'), wins = Math.round(row.firstStyleWinRate * row.matches);
    scores[a].wins += wins; scores[b].wins += row.matches - wins;
    scores[a].games += row.matches; scores[b].games += row.matches;
    games += row.matches; sideWins += row.firstSideWinRate * row.matches;
  }
  const overall = Object.entries(scores).map(([style, value]) => ({ style, ...value, winRate: value.wins / value.games }));
  for (const value of overall) if (!(value.winRate >= .4 && value.winRate <= .6)) problems.push(`${value.style} overall is outside 40–60%.`);
  const sideBias = Math.abs(sideWins / games - .5);
  if (!(sideBias < .05)) problems.push('Reference bank side bias is not below 5 percentage points.');
  if (references.length !== 12 || references.some(row => row.independentSeeds < 16 || row.familyCombinations !== 4)) problems.push('All four tiers require 16+ independent seeds, four family combinations and mirrored sides.');
  const nearBoundary = references.filter(row => row.independentSeeds < 32 && (Math.abs(row.firstStyleWinRate - .3) <= .04 || Math.abs(row.firstStyleWinRate - .7) <= .04)).map(row => ({ cohort: row.cohort, pair: row.pair, rate: row.firstStyleWinRate, requiredSeeds: 32 }));
  const outliers = results.flatMap(r => r.pairs || []).filter(row => !row.reference && (row.firstStyleWinRate < .25 || row.firstStyleWinRate > .75)).map(row => ({ cohort: row.cohort, pair: row.pair, rate: row.firstStyleWinRate, matches: row.matches }));
  const weaponScores = [];
  for (const result of results.filter(result => result.cohort.startsWith('arsenal-'))) {
    const totals = {};
    for (const row of result.pairs || []) for (const [weapon, score] of Object.entries(row.weaponScores || {})) {
      const value = totals[weapon] ||= { wins: 0, matches: 0 }; value.wins += score.wins; value.matches += score.matches;
    }
    for (const [weapon, score] of Object.entries(totals)) weaponScores.push({ cohort: result.cohort, weapon, ...score, winRate: score.wins / score.matches });
  }
  const report = { split, scope, diagnosticSeeds, completeBank: scope === 'all' && diagnosticSeeds === null && results.length === cohortIds.length, sourceHash: [...hashes][0], testHash: [...tests][0], referenceGames: games, overall, sideBias, nearBoundary, subgroupOutliers: outliers, weaponScores, problems: [...new Set(problems)], thresholdPass: problems.length === 0 && diagnosticSeeds === null, releaseGatePass: false, note: 'A complete training and separate held-out bank with the same frozen source, boundary expansions, and an investigated subgroup report are required before release.', partitions: results };
  fs.writeFileSync(path.join(output, 'bank.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, partitions: undefined }));
  process.exitCode = problems.length || nearBoundary.length ? 1 : 0;
})();
