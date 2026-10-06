// Local UI fixtures only. No wallet signing, production requests or real grants.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {freshWorkshop,changeWorkshop}=require('../../src/lib/bots/workshop8/state.ts');
const {playerAction}=require('../../src/lib/bots/workshop8/server-contract.ts');
const {BUILD_ENTRY_URL}=require('../../src/lib/bots/workshop8/entry.ts');
const {emptyCompetition}=require('../../src/lib/bots/workshop8/competition.ts');
const {emptyZoneView}=require('../../src/lib/bots/token-zones.ts');
const {chromium}=require(process.env.MK_PLAYWRIGHT||'playwright');
const origin=process.env.MK_TEST_ORIGIN||'http://localhost:3194',output=process.env.MK_ENTRY_OUTPUT||'D:/Temp/modelkombat-entry-review';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)||!/^D:[/\\]/i.test(output))throw Error('Local preview and D-drive output required');
async function main(){fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let state=null,failRead=false,anonymousReply=false,posts=0,finished=0,sessionDone=0,firstRead=0;
 await page.route('**/bots-playtest/index.html?*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="background:#243733;color:#cde2d5">Robot renderer omitted in navigation fixture</body></html>'}));
 await page.route('**/bots-display/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="background:#243733;color:#cde2d5">Robot renderer omitted in navigation fixture</body></html>'}));
 const packet=()=>({ok:true,journey:true,session:state?{kind:'guest'}:null,garageId:state?'fixture-garage':null,garages:state?[{id:'fixture-garage',name:'Test garage',robots:state.robots.map(r=>({id:r.id,name:r.name})),activeFight:null}]:[],state,days:{},serverNow:Date.now()});
 await page.route('**/api/**',async r=>{const u=new URL(r.request().url()),req=r.request();
  if(u.pathname==='/api/bots/workshop/session'){if(req.method()==='POST'){posts++;state??=freshWorkshop()}else{await new Promise(resolve=>setTimeout(resolve,200));sessionDone=Date.now()}return r.fulfill({json:{ok:true,enabled:true}})}
  if(u.pathname==='/api/bots/workshop'){
   if(req.method()==='GET'){firstRead||=Date.now();if(failRead)return r.fulfill({status:401,json:{ok:false,error:'Sign in again to open your saved garage.'}});if(anonymousReply)return r.fulfill({json:{...packet(),session:null,state:null,garageId:null,garages:[]}})}
   if(req.method()==='POST'){posts++;const b=req.postDataJSON();if(b.action.kind==='finish')finished++;state=changeWorkshop(state,playerAction(b.action,b.requestId))}
   return r.fulfill({json:packet()});
  }
  if(u.pathname==='/api/bots/campaign')return r.fulfill({json:{workshop:{...emptyCompetition(false,true),available:true,state:'draft'},standings:{roi:[],profit:[],battles:[]},zones:emptyZoneView()}});
  if(u.pathname==='/api/bots/campaign/zones')return r.fulfill({json:emptyZoneView()});
  return r.fulfill({status:503,json:{ok:false,error:'Not part of this local entry fixture'}});
 });
 await page.goto(origin+BUILD_ENTRY_URL,{waitUntil:'domcontentloaded',timeout:120000});
 await page.getByRole('heading',{name:'Choose your robot style.'}).waitFor({timeout:120000});
 assert.equal(state,null,'opening builder does not mint a starter');assert.equal(await page.locator('dialog[open]').count(),0,'no forced introduction');
 await page.getByRole('button',{name:'Tank starter robot',exact:true}).click();
 await page.getByRole('heading',{name:'Choose your parts.',exact:true}).waitFor({timeout:120000});
 assert.ok(firstRead<sessionDone,'session and restore begin in parallel');assert.equal(Object.keys(state.draft.choices).length,7);assert.equal(state.coins,250);assert.equal(state.robots.length,0);assert.equal(state.draft.step,'parts');
 for(const [label,width,height] of [['desktop',1280,720],['phone',390,844],['landscape',844,390]]){
  await page.setViewportSize({width,height});await page.screenshot({path:path.join(output,`builder-${label}.png`),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' has no horizontal overflow');
  for(const slot of ['Body','Head','Left arm','Right arm','Left leg','Right leg','Weapon'])assert.equal(await page.getByRole('button',{name:slot,exact:true}).count(),1);
 }
 await page.setViewportSize({width:1280,height:720});await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Choose your parts.',exact:true}).waitFor();
 // Keep manual choices when changing the suggested body style.
 state=changeWorkshop(state,{kind:'choose',slot:'head',entry:'bible2.tank.t1.revenant'});
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Step 1: Style',exact:true}).click();await page.getByRole('button',{name:'Speed starter robot',exact:true}).click();
 await page.getByRole('button',{name:'Keep my custom parts',exact:true}).click();assert.equal(state.draft.choices.head,'bible2.tank.t1.revenant');
 await page.getByRole('button',{name:'Name & finish →',exact:true}).click();await page.getByRole('textbox',{name:'Robot name',exact:true}).fill('Launch Buddy');
 await page.getByRole('button',{name:'Buy & finish',exact:true}).click();await page.getByRole('button',{name:'Open garage',exact:true}).waitFor({timeout:120000});
 assert.equal(finished,1);assert.equal(state.coins,0);assert.equal(state.robots.length,1);assert.equal(state.robots[0].name,'Launch Buddy');assert.equal(state.robots[0].choices.head,'bible2.tank.t1.revenant');
 assert.equal(await page.getByRole('dialog').getByRole('button',{name:'Fight with this robot →',exact:true}).count(),1);assert.equal(await page.getByRole('dialog').getByRole('button',{name:'Try Arcade · practice',exact:true}).count(),1);await page.getByRole('button',{name:'Open garage',exact:true}).click();
 const before=JSON.stringify(state);await page.goto(origin+'/bots/workshop?view=build&entry=play');await page.getByRole('main',{name:'garage room'}).waitFor();assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(JSON.stringify(state),before);
 const postCount=posts;failRead=true;await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Your garage could not open.'}).waitFor();assert.equal(posts,postCount);assert.equal(JSON.stringify(state),before);assert.equal(await page.getByRole('link',{name:'Play arcade now',exact:true}).count(),1);
 failRead=false;await page.getByRole('button',{name:'Retry saved garage',exact:true}).click();await page.getByRole('main',{name:'garage room'}).waitFor();assert.equal(JSON.stringify(state),before);
 anonymousReply=true;await page.evaluate(()=>sessionStorage.setItem('mk8.wallet-session.v1',JSON.stringify({token:'expired-local-test',address:'0x0000000000000000000000000000000000000001'})));await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Your garage could not open.'}).waitFor();assert.equal(posts,postCount);assert.equal(JSON.stringify(state),before);
 anonymousReply=false;await page.evaluate(()=>sessionStorage.removeItem('mk8.wallet-session.v1'));await page.getByRole('button',{name:'Retry saved garage',exact:true}).click();await page.getByRole('main',{name:'garage room'}).waitFor();assert.equal(JSON.stringify(state),before);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:true,scope:'local UI with mocked save API; renderer omitted; not live wallet or device-performance proof',checks:['parallel session and restore','direct builder no forced intro','no grant on browse','seven editable legal starter slots','desktop phone landscape overflow','reload keeps draft','manual choices survive style prompt','name then Finish exactly once','Arcade and Garage postfinish','saved garage preserved on identity error','retry restores same garage','expired bearer cannot fall back to anonymous garage'],errors},null,2));
 console.log('PASS browser: direct seven-part builder, atomic starter, draft protection, Finish, Arcade entry and identity failure recovery. '+output);
}finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
