'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'run-trade-worker.cjs'),'utf8');
const start=code.indexOf('const waitingCodes='),end=code.indexOf('main().catch(',start);
assert.ok(start>=0&&end>start,'worker retry loop exists');
const loop=code.slice(start,end)+'main();';
async function scenario(error,{watch=true,published=false}={}){
 let now=1000000,active=0,maxActive=0,calls=0;
 const records=[],reports=[],pauses=[];
 const context={pollMinutes:15,runPublishedScores:published,workerVersion:'test-worker',stopping:false,args:new Set(watch?['--watch']:[]),process:{exitCode:0},console:{error(){}},safeCode:value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{2,100}$/.test(value)?value:'SOURCE_UNAVAILABLE',
 Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},
 setTimeout(fn,delay){pauses.push(delay);now+=delay;queueMicrotask(fn);},
 progress:async(phase,detail,report)=>{records.push({phase,detail,report});return true;},saveReport:r=>reports.push(r),
 run:async()=>{active++;maxActive=Math.max(maxActive,active);calls++;try{if(calls===1)throw Error(error);context.stopping=true;}finally{active--;}}
 };
 await vm.runInNewContext(loop,context,{timeout:1000});
 assert.equal(maxActive,1);assert.equal(calls,watch?2:1);
 return {record:records[0],report:reports[0],wait:pauses.reduce((a,b)=>a+b,0),exitCode:context.process.exitCode};
}
(async()=>{
 for(const reason of ['PUBLICATION_SOURCE_CHANGED','PRIVATE_COVERAGE_PENDING','SOURCE_BEHIND_SAVED_CHECKPOINT','WORKER_COMMIT_MK_WORKER_SOURCE_CHANGED','ACCOUNTING_PUBLICATION_INTERRUPTED']){
  const x=await scenario(reason,{published:reason==='ACCOUNTING_PUBLICATION_INTERRUPTED'});
  assert.equal(x.record.phase,'AUDIT_COMPLETE');assert.equal(x.report.status,'PENDING');assert.equal(x.wait,300000);assert.equal(x.record.detail.nextCheckMinutes,5);assert.equal(x.report.scoresConfirmed,false);assert.equal(x.report.scoreWrites,reason==='ACCOUNTING_PUBLICATION_INTERRUPTED');
 }
 const failed=await scenario('RESULT_PUBLICATION_SCHEMA_REQUIRED');assert.equal(failed.record.phase,'AUDIT_FAILED');assert.equal(failed.report.status,'FAILED');assert.equal(failed.wait,900000);
 const sensitive=await scenario('unexpected private wallet 0x123 secret text');assert.equal(sensitive.report.code,'SOURCE_UNAVAILABLE');assert(!JSON.stringify(sensitive).includes('private wallet'));
 const once=await scenario('PRIVATE_COVERAGE_PENDING',{watch:false});assert.equal(once.wait,0);assert.equal(once.exitCode,1);
 assert(!code.includes("progress('TRADE_RESULTS_PUBLISHED'"),'all progress phases must exist in deployed SQL');
 console.log('PASS worker retries: delayed coverage/concurrent publication stays pending, preserves successful score writes, retries in five minutes without overlap; setup errors remain failed, one-shot exits, and errors stay private.');
})().catch(e=>{console.error(e);process.exitCode=1});
