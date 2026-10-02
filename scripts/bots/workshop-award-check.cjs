const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
function load(file,imports){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>imports[n],Number,Set,Error});return module.exports;}
const view=load('src/lib/bots/campaign-view.ts',{}),{battleAwardReview:review}=load('src/lib/bots/workshop8/award-review.ts',{'../campaign-view':view});
const yes={days:3,status:'qualified'},no={days:2,status:'ineligible'},w=i=>'0x'+String(i).padStart(40,'0');
const rows=Array.from({length:7},(_,i)=>({wallet:w(i),points:10,weeks:[yes,yes],excluded:false}));
for(const period of ['week1','week2','final']){const r=review(period,rows);assert.equal(r.totalCents,period==='final'?25000:7500);assert.equal(r.rows[0].rank,1);assert.ok(r.rows[0].prizeCents-r.rows[6].prizeCents<=1);assert.equal(r.transfersExecuted,false);}
assert.equal(review('final',[{...rows[0],weeks:[yes,no]}]).rows.length,0);assert.equal(review('week1',[{...rows[0],weeks:[yes,no]}]).rows.length,1);assert.equal(review('final',[{...rows[0],excluded:true}]).rows.length,0);
assert.throws(()=>review('final',[{...rows[0],weeks:[yes,{days:null,status:'unavailable'}]}]),/not ready/);assert.throws(()=>review('final',[rows[0],rows[0]]),/duplicate/);
const total=Object.values(view.CAMPAIGN_PRIZES).reduce((s,p)=>s+2*p.weekly.reduce((a,b)=>a+b,0)+p.final.reduce((a,b)=>a+b,0),0);assert.equal(total,2000);
console.log('PASS: $2,000 full schedule; Strategy eligibility across both weeks; exclusions; tied occupied slots/remainders; unknown eligibility blocks award review; no transfer side effects.');
