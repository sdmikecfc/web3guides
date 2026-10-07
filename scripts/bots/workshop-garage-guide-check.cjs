/* Offline checks only: no API, database, wallet, or player-save access. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'../..'),resolve=Module._resolveFilename;
Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(root,'src',name.slice(2)):name,parent,...rest)};
Module._extensions['.ts']=function(module,file){module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file)};
global.fetch=async()=>{throw Error('Network forbidden in garage guide checks')};
const {freshWorkshop,blankDraft,changeWorkshop}=require('../../src/lib/bots/workshop8/state');
const {preset,ITEM_MAP,itemId}=require('../../src/lib/bots/workshop8/catalogue');
const {nextGarageStep,partOwnership,PurchaseGate,definitePurchaseRejection}=require('../../src/lib/bots/workshop8/garage-guide');
const now=Date.UTC(2026,9,7,12);
let state=freshWorkshop();assert.equal(nextGarageStep(state),'build');
state=changeWorkshop(state,{kind:'draft',draft:{...blankDraft(),name:'Fixture',choices:preset('tank')}},now);assert.equal(nextGarageStep(state),'resume-build');
state=changeWorkshop(state,{kind:'finish',request:'robot-one'},now);assert.equal(nextGarageStep(state),'fight');
state.journey={version:1,trainingCompleted:true,lessons:[],walletPromptDismissed:false,plan:null,retained:{}};assert.equal(nextGarageStep(state),'fight','Training is not the first normal auto fight');
state.robots[0].wins=1;assert.equal(nextGarageStep(state),'upgrade');
const fitted=ITEM_MAP.get(itemId(state.robots[0].choices.armL,'armL'));
assert.deepEqual(partOwnership(state,fitted),{spare:0,fitted:1,total:1});
state.coins=1000;
let ids=0;const makeId=()=>`purchase-${++ids}`,gate=new PurchaseGate();
const one=gate.begin('garage-one',fitted.id,makeId);assert.equal(one.retry,false);
assert.equal(gate.begin('garage-one',fitted.id,makeId),null,'A second same-tick click is suppressed');
assert.equal(gate.begin('garage-one','another-item',makeId),null,'All purchase buttons share the synchronous lock');
// Server committed, but the response was lost: retry must not spend again.
const action={kind:'buy',item:fitted.id,request:one.attempt.request};
state=changeWorkshop(state,action,now);const charged=state.coins;
gate.finish(one.attempt,false);assert.throws(()=>gate.begin('garage-one','different-item',makeId),/Retry your previous purchase/);
const retry=gate.begin('garage-one',fitted.id,makeId);assert.equal(retry.retry,true);assert.equal(retry.attempt.request,one.attempt.request);assert.equal(ids,1);
state=changeWorkshop(state,{...action,request:retry.attempt.request},now);assert.equal(state.coins,charged);assert.deepEqual(partOwnership(state,fitted),{spare:1,fitted:1,total:2});gate.finish(retry.attempt,true);
const two=gate.begin('garage-one',fitted.id,makeId);assert.notEqual(two.attempt.request,one.attempt.request,'An intentional next copy gets its own purchase');state=changeWorkshop(state,{...action,request:two.attempt.request},now);gate.finish(two.attempt,true);assert.deepEqual(partOwnership(state,fitted),{spare:2,fitted:1,total:3});
const restored=new PurchaseGate();restored.restore({scope:'garage-one',item:fitted.id,request:'reload-stable'});assert.equal(restored.begin('garage-one',fitted.id,makeId).attempt.request,'reload-stable');
const isolated=new PurchaseGate();isolated.restore({scope:'garage-one',item:fitted.id,request:'other-garage'});assert.notEqual(isolated.begin('garage-two',fitted.id,makeId).attempt.request,'other-garage');
const before=structuredClone(state);nextGarageStep(state);partOwnership(state,fitted);assert.deepEqual(state,before,'Presentation helpers do not change saves');
state.spares.push({uid:'new-upgrade',item:itemId(preset('speed',2).armL,'armL')});state=changeWorkshop(state,{kind:'replacePart',id:state.robots[0].id,slot:'armL',spareUid:'new-upgrade',request:'upgrade-one'},now);assert.equal(nextGarageStep(state),'another');
assert.equal(partOwnership(state,fitted).spare,3,'Removed part returns to the cabinet');assert.equal(partOwnership(state,fitted).fitted,0);
for(let i=2;i<=5;i++){state.robots.push({...structuredClone(state.robots[0]),id:`robot-${i}`});assert.equal(nextGarageStep(state),i===5?'full':'crew')}
state.active={id:'active-fight'};assert.equal(nextGarageStep(state),'resume-fight');
console.log('PASS garage guidance: actual saved build/fight/upgrade progression, five-stand limit, no save mutation, independent spare/fitted counts, duplicate copies, synchronous purchase lock, idempotent lost-response retry, reload and garage-scoped request IDs.');

for(const status of [400,401,403,404,422,429])assert.equal(definitePurchaseRejection({status}),true);
for(const error of [undefined,null,new Error('lost response'),{status:408},{status:409},{status:500},{status:503}])assert.equal(definitePurchaseRejection(error),false);
const rejected=new PurchaseGate(),rejectAttempt=rejected.begin('garage','old',makeId);rejected.confirm('garage',rejectAttempt.attempt.request);rejected.finish(rejectAttempt.attempt,false);assert.ok(rejected.begin('garage','different',makeId));
console.log('PASS definitive 4xx rejections release the purchase gate; timeouts, conflicts, network and server failures retain the retry ID.');

const uncertain=new PurchaseGate(),first=uncertain.begin('garage','part',makeId);uncertain.finish(first.attempt,false);const afterSignInExpired=uncertain.begin('garage','part',makeId);assert.equal(definitePurchaseRejection({status:401},afterSignInExpired.retry),false);uncertain.finish(afterSignInExpired.attempt,false);assert.equal(uncertain.begin('garage','part',makeId).attempt.request,first.attempt.request);console.log('PASS a committed/lost response followed by expired sign-in retains the original purchase ID.');

const newborn=new PurchaseGate(),beforeCreation=newborn.begin('uncreated','part',makeId),originalId=beforeCreation.attempt.request;newborn.rehome(beforeCreation.attempt,'created-garage');assert.equal(newborn.pending('uncreated'),undefined);assert.equal(newborn.begin('created-garage','part',makeId),null);newborn.finish(beforeCreation.attempt,false);assert.equal(newborn.begin('created-garage','part',makeId).attempt.request,originalId);console.log('PASS first-visit guest garage creation preserves the in-flight purchase lock and retry ID.');
