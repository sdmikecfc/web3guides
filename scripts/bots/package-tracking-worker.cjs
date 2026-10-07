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
 'scripts/bots/lib/public-router-settlement.cjs',
 'scripts/bots/lib/public-accounting.cjs',
 'scripts/bots/lib/public-native-accounting.cjs',
 'scripts/bots/lib/public-native-router.cjs',
 'scripts/bots/lib/public-native-quote-router.cjs',
 'scripts/bots/lib/public-smart-wallet-settlement.cjs',
 'scripts/bots/lib/worker-health.cjs',
 'scripts/bots/lib/worker-contract.cjs',
 'scripts/bots/lib/worker-release.cjs',
 'scripts/bots/public-trade-worker-check.cjs',
 'scripts/bots/public-router-settlement-check.cjs',
 'scripts/bots/public-accounting-check.cjs',
 'scripts/bots/public-native-accounting-check.cjs',
 'scripts/bots/public-native-router-check.cjs',
 'scripts/bots/native-purchase-ledger-check.cjs',
 'scripts/bots/public-native-quote-router-check.cjs',
 'scripts/bots/public-smart-wallet-check.cjs',
 'scripts/bots/public-source-budget-check.cjs',
 'scripts/bots/public-transfer-window-check.cjs',
 'scripts/bots/worker-contract-check.cjs',
 'scripts/bots/fixtures/smart-wallet/runtime-code.json',
 'scripts/bots/fixtures/smart-wallet/a80aed76.json',
 'scripts/bots/fixtures/smart-wallet/4e9590d2.json',
 'scripts/bots/fixtures/smart-wallet/3dfb75e1.json',
 'scripts/bots/fixtures/smart-wallet/README.md',
 'docs/model-kombat-tracking-audit-2026-10-07.md',
 'scripts/bots/install-tracking-worker.sh',
];
if(fs.existsSync(out)&&fs.readdirSync(out).some(x=>!['scripts','docs','package.json','package-lock.json','README.txt','manifest.json'].includes(x)))throw Error('PACKAGE_DIRECTORY_CONTAINS_OTHER_FILES');
fs.mkdirSync(out,{recursive:true});
const manifest={createdAt:new Date().toISOString(),purpose:'Model Kombat public trade collector',deployed:false,files:[]};
for(const name of files){const data=fs.readFileSync(path.join(root,name)),dest=path.join(out,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data);manifest.files.push({path:name,sha256:createHash('sha256').update(data).digest('hex')});}
const checks=['public-router-settlement-check','public-trade-worker-check','public-accounting-check','public-native-accounting-check','public-native-router-check','native-purchase-ledger-check','public-native-quote-router-check','public-smart-wallet-check','public-source-budget-check','worker-contract-check','public-transfer-window-check'];
fs.writeFileSync(path.join(out,'package.json'),JSON.stringify({name:'model-kombat-tracking-worker',private:true,version:'1.0.0',engines:{node:'>=20'},scripts:{test:checks.map(name=>'node scripts/bots/'+name+'.cjs').join(' && '),check:'node scripts/bots/run-trade-worker.cjs',start:'node scripts/bots/run-trade-worker.cjs --write --watch'},dependencies:{'@next/env':'14.2.3','@supabase/supabase-js':'2.99.1','viem':'2.51.2'}},null,2)+'\n');
fs.writeFileSync(path.join(out,'README.txt'),"MODEL KOMBAT COLLECTOR 6 - PREPARED, NOT INSTALLED\n\nThis update compares two complete scans of the same historical transfer window. Transfers after the cutoff no longer invalidate an unchanged scoring window. Changes, duplicates, reorgs, incomplete pagination and failed requests still leave coverage pending. The worker 5 full-proof commitment and database preflight remain intact.\n\nNo new SQL, key, internal-AI instructions or website deployment are needed. Keep internal-AI v4 running. Update only the separate collector using the source checkout's existing scripts/bots/install-tracking-worker.cjs. It checks disk space, database setup and all eleven included tests before replacing that collector. Do not rerun old setup SQL for this update.\n\nThis package contains public transaction regression fixtures, not private account mappings. It contains no credentials, private player data, game art or Reporter code. Use Node 20+ and the existing Model Kombat settings.\n\nThe service waits 15 minutes between completed cycles. Wallet and Strategy-reference discovery remains on its separate four-hour schedule. Read-only checks never write scores. Installation success is not financial audit success. Accounting has a three-minute total cycle budget with real cancellation, so large historical backfills leave ROI pending. Existing financial snapshots are retained.\n\nLive result on 7 October 2026: worker 5 saved 16 verified economic trades totaling $199.904189 at 08:52 UTC. Overall coverage remained pending with TRANSFER_INDEX_CHANGED. All eight participant-wallet windows passed the revised read-only scan through the common 06:10:50.936 UTC cutoff; four windows belong to entrants newer than that cutoff and correctly require no historical scan. One transient Explorer HTTP 500 recovered through the existing retry. No production writes were performed by these local checks. The original production mismatch was not reproduced in those later live reads; the moving-head failure is reproduced by regression tests. ROI/profit remains unconfirmed until linked-account history and balances reconcile.\n\nAfter installation, verify mk-public-worker-6-stable-window and inspect its completed audit. This package is prepared only. Reporter, shared accounting, campaign dates and reward rules are unchanged. See docs/model-kombat-tracking-audit-2026-10-07.md for evidence and remaining limitations.\n");
for(const name of ['package.json','README.txt'])manifest.files.push({path:name,sha256:createHash('sha256').update(fs.readFileSync(path.join(out,name))).digest('hex')});
const lock=path.join(root,'scripts/bots/tracking-worker-lock.json');
if(fs.existsSync(lock)){const bytes=fs.readFileSync(lock),parsed=JSON.parse(bytes),pkg=JSON.parse(fs.readFileSync(path.join(out,'package.json')));if(JSON.stringify(parsed.packages[''].dependencies)!==JSON.stringify(pkg.dependencies)||Object.values(parsed.packages).some(p=>p.resolved&&(!p.resolved.startsWith('https://registry.npmjs.org/')||p.link)))throw Error('NONPORTABLE_WORKER_LOCK');fs.writeFileSync(path.join(out,'package-lock.json'),bytes);manifest.files.push({path:'package-lock.json',sha256:createHash('sha256').update(bytes).digest('hex')});}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(out);
