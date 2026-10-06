// Packages the additive game migrations as one atomic SQL Editor paste.
// Does not connect to or modify a database. Output stays on D:.
const fs=require('node:fs'),path=require('node:path');
const out='D:/Temp/modelkombat-launch-guide';fs.mkdirSync(out,{recursive:true});
const names=['bots-workshop-v8.sql','bots-workshop-journey.sql','bots-workshop-competition.sql','bots-workshop-reporter-read.sql','bots-workshop-wallet-links.sql','bots-token-zones.sql','bots-token-zone-wallets.sql','bots-token-zone-payout-policy.sql','bots-token-zone-collector.sql','bots-token-zone-accounting.sql','bots-token-zone-discovery.sql','bots-token-zone-worker-health.sql'];
const blocks=names.map(name=>{let sql=fs.readFileSync(path.join(__dirname,'../sql',name),'utf8');
 if((sql.match(/^begin;\s*$/gmi)||[]).length!==1||(sql.match(/^commit;\s*$/gmi)||[]).length!==1)throw Error('Unexpected transaction structure: '+name);
 return `-- SOURCE: ${name}\n${sql.replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,'')}`;
});
const checks=`select to_regprocedure('public.mkz_read(text)') is not null as token_zones_ready,
 to_regprocedure('public.mkz_commit(uuid,uuid,bigint,text,jsonb,date,jsonb,text)') is not null as fight_settlement_ready,
 to_regprocedure('public.mkz_resolve_wallet(jsonb)') is not null as wallet_grouping_ready,
 to_regprocedure('public.mkz_finalize(jsonb,jsonb)') is not null as finalization_ready,
 to_regprocedure('public.mkz_collector_accounting(jsonb)') is not null as server_accounting_ready,
 to_regprocedure('public.mkz_worker_commit(jsonb)') is not null as backend_worker_ready,
 case when to_regrole('doma_ai_mk') is null then false else not exists(
  select 1 from (values ('public.mkz_discovery_manifest()'),('public.mkz_discovery_accounts()'),('public.mkz_collector_wallets(text,text)'),('public.mkz_collector_resolve(jsonb)'),('public.mkz_discovery_references(jsonb)')) f(signature)
  where to_regprocedure(signature) is null or not has_function_privilege('doma_ai_mk',to_regprocedure(signature),'EXECUTE')
 ) end as collector_access_ready,
 state, starts_at, ends_at from public.mkz_campaigns where id='model-kombat-zones-1';\n`;
fs.writeFileSync(out+'/01-workshop-setup.sql',`-- Model Kombat ONLY. Eleven additive migrations, in dependency order.\n-- One transaction: an error rolls back this entire setup.\n-- Reuses the EXISTING doma_ai_mk database login; no keys or passwords changed.\n-- Internal AI now supplies identity/Strategy references only; our worker collects trades.\n-- Rewards can be funded at payout; no upfront balance requirement.\n-- Does not open the competition. Does not touch Reporter.\nbegin;\n${blocks.join('\n\n')}\ncommit;\n\n-- One visible result: all setup booleans must be true.\n-- If collector_access_ready is false, confirm the original database/login; do not create a replacement key.\n${checks}`);
fs.writeFileSync(out+'/02-check-setup.sql',`-- OPTIONAL READ-ONLY RECHECK. Setup already returns these checks.\n${checks}-- New setup: all true, draft and null dates. Never reset an active campaign.\n`);
fs.copyFileSync(path.join(__dirname,'../../docs/model-kombat-internal-ai-instruction.txt'),out+'/model-kombat-internal-ai-instructions.txt');
fs.copyFileSync(path.join(__dirname,'../../docs/model-kombat-accounting-slack.txt'),out+'/03-internal-ai-short.txt');
fs.writeFileSync(out+'/START-HERE.txt',`MODEL KOMBAT TRACKING UPDATE\n\n1. Open 01-workshop-setup.sql. Copy ALL of it into your existing Supabase SQL Editor and run once. All readiness columns should be true. This does not open the competition.\n\n2. Open 03-internal-ai-short.txt. COPY THE TEXT into the internal AI; do not attach the file. No new secret is needed.\n\n3. Send back the AI's first report. We still need to verify real Strategy coverage and financial histories before calling cash tracking ready.\n\nOur independent worker has verified 14 trades totaling $26.684083 on the approved linked test wallet in a read-only rehearsal. No scores were written.\n\nProduction and an always-on backend worker have NOT been deployed or scheduled. The repository includes scripts/bots/run-trade-worker.cjs. On your own configured server: node scripts/bots/run-trade-worker.cjs --write --watch. It uses the existing server environment and processes only active/closed campaigns. Without --write it is read-only. Stop with Ctrl+C. Do not run it inside Doma Reporter.\n\nThe public site remains your own vercel --prod release. That command alone does not start this separate long-running collector.\n`);
console.log(out+'/01-workshop-setup.sql\n'+out+'/02-check-setup.sql\n'+out+'/model-kombat-internal-ai-instructions.txt');
