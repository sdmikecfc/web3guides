'use strict';
// Explicit, secret-free handoff for the separate Model Kombat collector.
// Generates files only. Does not deploy, schedule, connect to a DB or score.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out='D:/Temp/modelkombat-tracking-worker-20261006';
const files=[
 'scripts/bots/run-trade-worker.cjs',
 'scripts/bots/worker-install-preflight.cjs',
 'scripts/bots/lib/public-trade-worker.cjs',
 'scripts/bots/lib/public-trade-source.cjs',
 'scripts/bots/lib/public-native-quote-output.cjs',
 'scripts/bots/lib/historical-price.cjs',
 'scripts/bots/lib/public-erc20-log-history.cjs',
 'scripts/bots/lib/public-router-settlement.cjs',
 'scripts/bots/lib/public-order-route.cjs',
 'scripts/bots/lib/public-universal-settlement.cjs',
 'scripts/bots/lib/public-accounting.cjs',
 'scripts/bots/lib/accounting-cache.cjs',
 'scripts/bots/lib/accounting-cycle.cjs',
 'scripts/bots/lib/progressive-publication.cjs',
 'scripts/bots/lib/publication-source-check.cjs',
 'scripts/bots/lib/start-publication.cjs',
 'scripts/bots/lib/public-native-accounting.cjs',
 'scripts/bots/lib/public-native-router.cjs',
 'scripts/bots/lib/public-native-quote-router.cjs',
 'scripts/bots/lib/public-smart-wallet-settlement.cjs',
 'scripts/bots/lib/worker-health.cjs',
 'scripts/bots/lib/worker-contract.cjs',
 'scripts/bots/lib/worker-release.cjs',
 'scripts/bots/public-trade-worker-check.cjs',
 'scripts/bots/historical-price-check.cjs',
 'scripts/bots/native-quote-output-ledger-check.cjs',
 'scripts/bots/public-native-quote-output-check.cjs',
 'scripts/bots/historical-native-gas-check.cjs',
 'scripts/bots/historical-unknown-inventory-check.cjs',
 'scripts/bots/public-erc20-log-history-check.cjs',
 'scripts/bots/public-router-settlement-check.cjs',
 'scripts/bots/public-order-route-check.cjs',
 'scripts/bots/public-universal-settlement-check.cjs',
 'scripts/bots/public-accounting-check.cjs',
 'scripts/bots/public-accounting-scoped-check.cjs',
 'scripts/bots/public-accounting-deferred-in-check.cjs',
 'scripts/bots/public-accounting-source-check.cjs',
 'scripts/bots/accounting-cache-check.cjs',
 'scripts/bots/accounting-cycle-check.cjs',
 'scripts/bots/progressive-publication-check.cjs',
 'scripts/bots/publication-source-check.cjs',
 'scripts/bots/start-publication-check.cjs',
 'scripts/bots/worker-retry-check.cjs',
 'scripts/bots/public-native-accounting-check.cjs',
 'scripts/bots/public-native-router-check.cjs',
 'scripts/bots/native-purchase-ledger-check.cjs',
 'scripts/bots/public-native-quote-router-check.cjs',
 'scripts/bots/public-smart-wallet-check.cjs',
 'scripts/bots/public-source-budget-check.cjs',
 'scripts/bots/public-transfer-window-check.cjs',
 'scripts/bots/worker-contract-check.cjs',
 'scripts/bots/fixtures/smart-wallet/runtime-code.json',
 'scripts/bots/fixtures/order-route-runtimes.json',
 'scripts/bots/fixtures/smart-wallet/a80aed76.json',
 'scripts/bots/fixtures/smart-wallet/4e9590d2.json',
 'scripts/bots/fixtures/smart-wallet/3dfb75e1.json',
 'scripts/bots/fixtures/smart-wallet/permit-portion-sweep.json',
 'scripts/bots/fixtures/smart-wallet/portion-sweep.json',
 'scripts/bots/fixtures/smart-wallet/README.md',
 'docs/model-kombat-result-publication-2026-10-09.md',
 'scripts/sql/bots-token-zone-opening-basis.sql',
 'scripts/sql/bots-token-zone-financial-scope.sql',
 'scripts/sql/bots-token-zone-account-isolation.sql',
 'scripts/sql/bots-token-zone-result-publication.sql',
 'scripts/bots/install-tracking-worker.sh',
];
if(fs.existsSync(out)&&fs.readdirSync(out).some(x=>!['scripts','docs','package.json','package-lock.json','README.txt','manifest.json'].includes(x)))throw Error('PACKAGE_DIRECTORY_CONTAINS_OTHER_FILES');
fs.mkdirSync(out,{recursive:true});
const manifest={createdAt:new Date().toISOString(),purpose:'Model Kombat public trade collector',deployed:false,files:[]};
for(const name of files){const data=fs.readFileSync(path.join(root,name)),dest=path.join(out,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data);manifest.files.push({path:name,sha256:createHash('sha256').update(data).digest('hex')});}
const checks=['historical-unknown-inventory-check','historical-price-check','native-quote-output-ledger-check','public-native-quote-output-check','historical-native-gas-check','public-erc20-log-history-check','public-router-settlement-check','public-order-route-check','public-universal-settlement-check','public-trade-worker-check','public-accounting-check','public-native-accounting-check','public-native-router-check','native-purchase-ledger-check','public-native-quote-router-check','public-smart-wallet-check','public-source-budget-check','worker-contract-check','public-transfer-window-check','public-accounting-scoped-check','public-accounting-deferred-in-check','public-accounting-source-check','accounting-cache-check','accounting-cycle-check','progressive-publication-check','publication-source-check','start-publication-check','worker-retry-check'];
fs.writeFileSync(path.join(out,'package.json'),JSON.stringify({name:'model-kombat-tracking-worker',private:true,version:'1.0.0',engines:{node:'>=20'},scripts:{test:checks.map(name=>'node scripts/bots/'+name+'.cjs').join(' && '),check:'node scripts/bots/run-trade-worker.cjs',start:'node scripts/bots/run-trade-worker.cjs --write --watch'},dependencies:{'@next/env':'14.2.3','@supabase/supabase-js':'2.99.1','viem':'2.51.2'}},null,2)+'\n');
fs.writeFileSync(path.join(out,'README.txt'),"MODEL KOMBAT COLLECTOR 12 - PREPARED, NOT INSTALLED\n\nExisting worker10 installations require no SQL, new key, website deployment or internal-AI change. This worker update adds the historical router variants found in the remaining ROI accounts, preserves per-account published results and avoids rejecting finished scans for unrelated discovery heartbeats.\n\nHistorical Permit2, split, two-hop and exact-output settlements are checked against pinned deployed code, canonical factory pools, receipts and exact fee/conservation rules. USDC-to-native conversion remains capital movement, not competition volume. ROI methodology is unchanged.\n\nCurrent-period ERC20 discovery uses bounded canonical RPC logs; targeted historical token discovery retains its complete Explorer pagination proof. Historical zero-value gas proofs avoid irrelevant pre-entry native traces. Batched historical pricing returns the same selected-pool integer valuation with fewer requests.\n\nThe installer tests the bundled package before touching the current service and retains rollback releases. No secret or private participant data is packaged. Check the private database health for mk-public-worker-12-router-reconciliation after a future installation.\n\nA Git push only updates source. The worker is not installed by packaging or pushing. Website production remains the user's vercel --prod. No competition dates, reward amounts, Reporter or shared accounting change.\n");
for(const name of ['package.json','README.txt'])manifest.files.push({path:name,sha256:createHash('sha256').update(fs.readFileSync(path.join(out,name))).digest('hex')});
const lock=path.join(root,'scripts/bots/tracking-worker-lock.json');
if(fs.existsSync(lock)){const bytes=fs.readFileSync(lock),parsed=JSON.parse(bytes),pkg=JSON.parse(fs.readFileSync(path.join(out,'package.json')));if(JSON.stringify(parsed.packages[''].dependencies)!==JSON.stringify(pkg.dependencies)||Object.values(parsed.packages).some(p=>p.resolved&&(!p.resolved.startsWith('https://registry.npmjs.org/')||p.link)))throw Error('NONPORTABLE_WORKER_LOCK');fs.writeFileSync(path.join(out,'package-lock.json'),bytes);manifest.files.push({path:'package-lock.json',sha256:createHash('sha256').update(bytes).digest('hex')});}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(out);
