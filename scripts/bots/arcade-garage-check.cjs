// Offline API-boundary regression. Uses synthetic garages and in-memory request stubs.
require('./personal-native-path.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
require.extensions['.css']=m=>{m.exports={__esModule:true,default:{}};};
const {readArcadeGarage}=require('../../src/app/bots/_game/ArcadeGarage.tsx'),{freshWorkshop,SAVE_KEY}=require('../../src/lib/bots/workshop8/state.ts'),{preset,defaultAppearance}=require('../../src/lib/bots/workshop8/catalogue.ts');
const robot={id:'saved-robot',name:'Actual robot',choices:preset('tank'),appearance:defaultAppearance(),cost:250,wins:0,losses:0,repairUntil:0},state={...freshWorkshop(),selected:robot.id,robots:[robot]},storage=data=>({getItem:key=>data[key]??null}),empty=storage({}),walletKey='mk8.wallet-session.v1',activeKey='mk8.journey.active.1',scopeKey='mk8.journey.scope.1';
function requestStub(responses){const calls=[];const request=async(url,options)=>{calls.push({url,options});const [status,body]=responses.shift()??[];if(!status)throw Error('Unexpected request');return new Response(JSON.stringify(body),{status});};return{request,calls};}
void(async()=>{
 let stub=requestStub([[200,{ok:true,session:{kind:'guest'},garageId:'guest-a',state}]]);
 let result=await readArcadeGarage(storage({[walletKey]:JSON.stringify({token:'synthetic',address:'wallet'}),[scopeKey]:'guest',[activeKey]:'guest-a'}),empty,stub.request);
 assert.equal(stub.calls[0].options.headers.Authorization,undefined);assert.equal(result.state.selected,robot.id);assert.equal(result.scope,'guest-a');
 stub=requestStub([[404,{ok:false}],[200,{ok:true,session:{kind:'wallet'},garageId:'wallet-a',state}]]);
 result=await readArcadeGarage(storage({[walletKey]:JSON.stringify({token:'synthetic'}),[activeKey]:'old-garage'}),empty,stub.request);
 assert.equal(stub.calls.length,2);assert.equal(stub.calls[1].url,'/api/bots/workshop');assert.equal(stub.calls[1].options.headers.Authorization,'Bearer synthetic');assert.equal(result.state.robots[0].choices.weapon,robot.choices.weapon);
 for(const body of [{ok:true,session:null},{ok:true,session:{kind:'guest'},garageId:'wrong',state}]){
  stub=requestStub([[200,body]]);await assert.rejects(readArcadeGarage(storage({[walletKey]:JSON.stringify({token:'expired'})}),storage({[SAVE_KEY]:JSON.stringify(state)}),stub.request),/Sign in again/);
 }
 stub=requestStub([[401,{ok:false}]]);await assert.rejects(readArcadeGarage(storage({[walletKey]:JSON.stringify({token:'expired'})}),storage({[SAVE_KEY]:JSON.stringify(state)}),stub.request),/Sign in again/);assert.equal(stub.calls.length,1);
 const wallet='0x1111111111111111111111111111111111111111';
 stub=requestStub([[200,{ok:true,wallet,state}]]);result=await readArcadeGarage(storage({[walletKey]:JSON.stringify({token:'legacy-session',address:wallet}),[activeKey]:'old-journey-garage'}),empty,stub.request);assert.equal(result.state.selected,robot.id);assert.equal(result.scope,'wallet:'+wallet);
 stub=requestStub([[200,{ok:true,wallet:'0x2222222222222222222222222222222222222222',state}]]);await assert.rejects(readArcadeGarage(storage({[walletKey]:JSON.stringify({token:'legacy-session',address:wallet})}),empty,stub.request),/Sign in again/);
 stub=requestStub([[200,{ok:true,journey:true,session:null,wallet,state}]]);await assert.rejects(readArcadeGarage(storage({[walletKey]:JSON.stringify({token:'expired',address:wallet})}),empty,stub.request),/Sign in again/);
 stub=requestStub([[200,{ok:true,session:null}]]);await assert.rejects(readArcadeGarage(storage({[activeKey]:'expired-guest'}),empty,stub.request),/fresh sign-in/);
 stub=requestStub([[200,{ok:true,session:null}]]);result=await readArcadeGarage(empty,storage({[SAVE_KEY]:JSON.stringify(state)}),stub.request);assert.equal(result.scope,'device-garage');assert.equal(result.state.selected,robot.id);
 stub=requestStub([[200,{ok:true,session:{kind:'guest'},garageId:'empty-online',state:freshWorkshop()}]]);result=await readArcadeGarage(empty,storage({[SAVE_KEY]:JSON.stringify(state)}),stub.request);assert.equal(result.scope,'empty-online');assert.equal(result.state.robots.length,0);
 await assert.rejects(readArcadeGarage(empty,storage({[SAVE_KEY]:JSON.stringify(state)}),async()=>{throw Error('offline');}),/offline/);
 console.log('PASS Arcade garage: selected real equipment; explicit guest scope; stale garage retry; expired/null/wrong identity rejection; valid legacy wallet endpoint and mismatch rejection; no wallet-to-device substitution; legacy-only fallback; online empty garage preserved; network failure surfaced.');
})().catch(error=>{console.error(error);process.exitCode=1;});
