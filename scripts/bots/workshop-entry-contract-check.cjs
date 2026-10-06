const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {freshWorkshop,changeWorkshop,draftCost}=require('../../src/lib/bots/workshop8/state.ts');
const {preset,defaultAppearance,legalChoices}=require('../../src/lib/bots/workshop8/catalogue.ts');
const {playerAction}=require('../../src/lib/bots/workshop8/server-contract.ts');
const {playEntry,PLAY_ENTRY_URL,BUILD_ENTRY_URL,ARCADE_ENTRY_URL}=require('../../src/lib/bots/workshop8/entry.ts');
assert.equal(PLAY_ENTRY_URL,'/bots/play');assert.equal(BUILD_ENTRY_URL,'/bots/workshop?view=build&entry=build');assert.equal(ARCADE_ENTRY_URL,'/bots/arcade');
assert.deepEqual(playEntry(null),{room:'build',intro:false});
for(const style of ['tank','speed','ranged']){
 const original=freshWorkshop(),intent={kind:'draft',draft:{name:'',choices:preset(style),appearance:defaultAppearance(),step:'parts',slot:'torso',coins:999999}};
 const action=playerAction(intent,'entry-contract-test'),state=changeWorkshop(original,action);
 assert.equal(state.revision,1);assert.equal(state.coins,250);assert.equal(state.robots.length,0);assert.equal(draftCost(state),250);
 assert.ok(legalChoices(state.draft.choices));assert.equal(state.draft.step,'parts');assert.equal(state.draft.slot,'torso');assert.equal(state.draft.coins,undefined);
 const before=JSON.stringify(state);assert.deepEqual(playEntry(state),{room:'build',intro:false});assert.equal(JSON.stringify(state),before);
 for(const step of ['invalid',['parts'],null])assert.throws(()=>playerAction({...intent,draft:{...intent.draft,step}},'entry-contract-test'));
 assert.throws(()=>playerAction({...intent,draft:{...intent.draft,slot:'coins'}},'entry-contract-test'));
}
const returning=freshWorkshop();returning.robots=[{id:'saved'}];assert.equal(playEntry(returning).room,'garage');returning.active={id:'fight'};assert.equal(playEntry(returning).room,'fight');
console.log('PASS workshop entry: distinct play/build/arcade routes; atomic editable 250-coin starter; safe draft step validation; existing saves and fights preserved.');
