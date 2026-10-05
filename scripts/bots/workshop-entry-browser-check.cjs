// Local UI fixtures only. No wallet signing, production requests or real grants.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {freshWorkshop,changeWorkshop}=require('../../src/lib/bots/workshop8/state.ts');
const {preset,defaultAppearance}=require('../../src/lib/bots/workshop8/catalogue.ts');
const {playEntry,PLAY_ENTRY_URL}=require('../../src/lib/bots/workshop8/entry.ts');
const {emptyCompetition}=require('../../src/lib/bots/workshop8/competition.ts');
const {chromium}=require(process.env.MK_PLAYWRIGHT||'playwright');
const origin=process.env.MK_TEST_ORIGIN||'http://localhost:3183',output=process.env.MK_ENTRY_OUTPUT||'D:/Temp/modelkombat-entry-review';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)||!/^D:[/\\]/i.test(output))throw Error('Local preview and D-drive output required');
async function main(){fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let state=null;
 // This verifies navigation and saves, not unchanged 3D renderer performance.
 await page.route('**/bots-playtest/index.html?*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="background:#243733;color:#cde2d5">Robot renderer omitted in navigation fixture</body></html>'}));
 const packet=()=>({ok:true,journey:true,session:state?{kind:'guest'}:null,garageId:state?'fixture-garage':null,garages:state?[{id:'fixture-garage',name:'Test garage',robots:state.robots.map(r=>({id:r.id,name:r.name})),activeFight:null}]:[],state,days:{},serverNow:Date.now()});
 await page.route('**/api/bots/campaign?*',r=>r.fulfill({json:{workshop:{...emptyCompetition(false,true),available:true,state:'draft'},standings:{roi:[],profit:[],battles:[]}}}));
 await page.route('**/api/bots/workshop{,/**,?*}',async r=>{const u=new URL(r.request().url()),req=r.request();
  if(u.pathname.endsWith('/session')){if(req.method()==='POST')state??=freshWorkshop();return r.fulfill({json:{ok:true,enabled:true}})}
  if(u.pathname==='/api/bots/workshop'){if(req.method()==='POST'){const b=req.postDataJSON();state=changeWorkshop(state,b.action)}return r.fulfill({json:packet()})}
  return r.fulfill({status:503,json:{ok:false,error:'Not part of this local entry fixture'}});
 });
 await page.goto(origin+'/bots/start',{waitUntil:'domcontentloaded',timeout:120000});await page.getByRole('heading',{name:'Connect your wallet.'}).waitFor();
 for(const [label,width,height] of [['desktop',1280,720],['phone',390,844],['landscape',844,390]]){
  await page.setViewportSize({width,height});await page.screenshot({path:path.join(output,`home-${label}.png`),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' has no horizontal overflow');
  if(label==='desktop'){const cta=await page.getByRole('button',{name:'Connect Doma wallet →'}).boundingBox();assert.ok(cta.y+cta.height<=height,'Connect action above fold');}
 }
 await page.setViewportSize({width:1280,height:720});await page.getByRole('link',{name:'Play · Build your robot →'}).click();
 await page.getByRole('heading',{name:'Build your first robot. Make it yours.'}).waitFor({timeout:120000});
 assert.equal(state,null,'opening the intro does not mint a starter');
 await page.screenshot({path:path.join(output,'game-intro.png')});
 await page.getByRole('button',{name:'Build my robot →',exact:true}).click();
 await page.getByRole('heading',{name:'Give it some personality.'}).waitFor({timeout:120000});
 assert.equal(Object.keys(state.draft.choices).length,7);assert.equal(state.coins,250);assert.equal(state.robots.length,0);
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Give it some personality.'}).waitFor();
 assert.equal(state.coins,250);assert.equal(state.robots.length,0);
 await page.goto(origin+PLAY_ENTRY_URL);await page.getByRole('heading',{name:'Give it some personality.'}).waitFor();assert.equal(await page.locator('dialog[open]').count(),0,'existing draft resumes');
 state=changeWorkshop(state,{kind:'nameDraft',name:'Returning Warden'});state=changeWorkshop(state,{kind:'finish',request:'entry-test-finish'});const before=JSON.stringify(state);
 await page.goto(origin+PLAY_ENTRY_URL);await page.getByRole('main',{name:'garage room'}).waitFor();assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(JSON.stringify(state),before);
 assert.equal(playEntry({...state,active:{id:'ongoing'}}).room,'fight');
 // The old published link must also stop skipping the fresh-player introduction.
 state=null;await page.goto(origin+'/bots/workshop?view=garage&entry=landing');await page.getByRole('heading',{name:'Build your first robot. Make it yours.'}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.screenshot({path:path.join(output,'game-intro-phone.png'),fullPage:true});
 assert.ok(await page.locator('dialog').evaluate(d=>d.scrollWidth<=d.clientWidth));
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:true,scope:'local browser with mocked save/campaign API; not live wallet or tracking verification',checks:['desktop/phone/landscape no overflow','wallet action above fold','Play opens robot intro','no grant on intro','seven-part starter and 250 coins','reload resumes draft','returning garage preserved','active fight routing','old Play URL','reduced motion'],errors},null,2));
 console.log('PASS browser: trading-first landing; responsive layouts; fresh Play intro; complete starter; draft and owned progress retained. '+output);
}finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
