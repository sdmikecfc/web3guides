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
 'scripts/bots/lib/worker-health.cjs',
 'scripts/bots/lib/worker-release.cjs',
 'scripts/bots/public-trade-worker-check.cjs',
 'scripts/bots/public-router-settlement-check.cjs',
 'scripts/bots/public-accounting-check.cjs',
 'scripts/bots/public-native-accounting-check.cjs',
 'scripts/bots/public-native-router-check.cjs',
 'scripts/bots/native-purchase-ledger-check.cjs',
 'scripts/bots/install-tracking-worker.sh',
];
if(fs.existsSync(out)&&fs.readdirSync(out).some(x=>!['scripts','package.json','package-lock.json','README.txt','manifest.json'].includes(x)))throw Error('PACKAGE_DIRECTORY_CONTAINS_OTHER_FILES');
fs.mkdirSync(out,{recursive:true});
const manifest={createdAt:new Date().toISOString(),purpose:'Model Kombat public trade collector',deployed:false,files:[]};
for(const name of files){const data=fs.readFileSync(path.join(root,name)),dest=path.join(out,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data);manifest.files.push({path:name,sha256:createHash('sha256').update(data).digest('hex')});}
const checks=['public-router-settlement-check','public-trade-worker-check','public-accounting-check','public-native-accounting-check','public-native-router-check','native-purchase-ledger-check'];
fs.writeFileSync(path.join(out,'package.json'),JSON.stringify({name:'model-kombat-tracking-worker',private:true,version:'1.0.0',engines:{node:'>=20'},scripts:{test:checks.map(name=>'node scripts/bots/'+name+'.cjs').join(' && '),check:'node scripts/bots/run-trade-worker.cjs',start:'node scripts/bots/run-trade-worker.cjs --write --watch'},dependencies:{'@next/env':'14.2.3','@supabase/supabase-js':'2.99.1','viem':'2.51.2'}},null,2)+'\n');
fs.writeFileSync(path.join(out,'README.txt'),`MODEL KOMBAT COLLECTOR - PREPARED, NOT INSTALLED\n\nUse the Windows source checkout's scripts/bots/install-tracking-worker.cjs. It checks free space, verifies files and database setup, tests the candidate, and then replaces only this collector. Database repair is the single companion tracking-update.sql file; the preflight checks whether it is installed. Internal-AI v4 does not need reconfiguration.\n\nThis small package is for an always-on server, separate from Doma Reporter. It contains no passwords, keys, player data, game art or unrelated project code.\n\nUse Node 20 or later and the existing Model Kombat settings (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DOMA_API_KEY). No new key is needed.\n\nThe service polls every 15 minutes. Draft runs write private health reports only, never competition scores. Read-only check mode writes neither. Installation confirmation is not a completed financial audit.\n\nRetrying identical files reuses the verified release. Downloads use a temporary dedicated npm cache. Successful updates retain the current and previous release and remove only verified older collector releases. Unknown directories are preserved.\n\nThis is not a website deployment, and vercel --prod does not start it. It cannot open the campaign, enroll players, grant coins or transfer rewards.\n\nVerified read-only: 14 fills, $26.684083, and the approved single agent wallet's 31-event accounting reconstruction. Full-account financial readiness and real Strategy settlement still require the new installed collector's audit.\n`);
for(const name of ['package.json','README.txt'])manifest.files.push({path:name,sha256:createHash('sha256').update(fs.readFileSync(path.join(out,name))).digest('hex')});
const lock=path.join(root,'scripts/bots/tracking-worker-lock.json');
if(fs.existsSync(lock)){const bytes=fs.readFileSync(lock),parsed=JSON.parse(bytes),pkg=JSON.parse(fs.readFileSync(path.join(out,'package.json')));if(JSON.stringify(parsed.packages[''].dependencies)!==JSON.stringify(pkg.dependencies)||Object.values(parsed.packages).some(p=>p.resolved&&(!p.resolved.startsWith('https://registry.npmjs.org/')||p.link)))throw Error('NONPORTABLE_WORKER_LOCK');fs.writeFileSync(path.join(out,'package-lock.json'),bytes);manifest.files.push({path:'package-lock.json',sha256:createHash('sha256').update(bytes).digest('hex')});}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const updateDir='D:/Temp/modelkombat-tracking-update-20261006';fs.mkdirSync(updateDir,{recursive:true});
const patch=['bots-token-zone-native-eth.sql','bots-token-zone-worker-health.sql'].map(name=>{
 const sql=fs.readFileSync(path.join(root,'scripts/sql',name),'utf8');
 if((sql.match(/^begin;\s*$/gmi)||[]).length!==1||(sql.match(/^commit;\s*$/gmi)||[]).length!==1)throw Error('PATCH_TRANSACTION_INVALID');
 return '-- '+name+'\n'+sql.replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,'');
}).join('\n');
fs.writeFileSync(path.join(updateDir,'tracking-update.sql'),'-- Model Kombat collector repair: run this entire file once. Safe to rerun.\n-- No campaign opening, score changes, new keys or Reporter changes.\nbegin;\n'+patch+'\ncommit;\nselect (public.mkz_worker_health(null)->>\'nativeAccountingReady\')::boolean as tracking_update_ready;\n');
console.log(out);
