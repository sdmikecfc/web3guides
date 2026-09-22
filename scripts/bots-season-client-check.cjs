const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Mike/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {createFightV6,presetV6,stepFightV6,acceptSpecialV6,advanceFightV6,resultV6,RULES_V6}=require('../src/lib/bots/v6');
const {HERO_COLLISION_VERSION_V6}=require('../src/lib/bots/v6/hero-collision');
const {SEASON_RULES}=require('../src/lib/bots/season/rules');
const out=path.join(process.env.BOTS_SEASON_STAGE||path.resolve(__dirname,'..'),'client-qa');fs.mkdirSync(out,{recursive:true});
const rulesOnly=process.argv.includes('--rules-only');
const id='00000000-0000-4000-8000-000000000076',copy=structuredClone,hero=presetV6('tank',3,{signature:true,collisionVersion:HERO_COLLISION_VERSION_V6});
const canPress=s=>{if(s.done||s.fighters[0].meter<100)return false;return acceptSpecialV6(copy(s),{id:'can-press',who:0,kind:'special',frame:s.frame}).accepted;};
let ready;
for(let seed=1;seed<=64&&!ready;seed++){
 const s=createFightV6(seed,hero,hero);
 while(!s.done&&!canPress(s))stepFightV6(s);
 if(!s.done)ready=copy(s);
}
assert(ready,'real signature hero reaches a charged manual Special');
function session(s,revision,inputs=[],status=s.done?'complete':'running',viewerSide=0){return {id,seasonId:'fixture-season',botId:'fixture-bot',revision,engineVersion:6,mode:'house',requestedMode:'house',serverNow:Date.now(),startedAt:new Date(Date.now()-s.frame*1000/60).toISOString(),seed:s.seed,tick:s.frame,status,playbackAvailable:true,rules:{...SEASON_RULES,engine:RULES_V6},builds:s.builds,state:copy(s),inputs:copy(inputs),identities:[{name:'Fixture Attacker',botId:'fixture-bot'},{name:'Fixture Defender',botId:'fixture-defender'}],result:s.done?resultV6(s):null,settlement:status==='complete'?{playCoins:75,objectiveCoins:0,tradeBonus:0,rewarded:true,ratingChange:0,defenderRatingChange:0,repairUntil:null,finishedAt:new Date().toISOString(),winner:s.winner}:null,viewerSide};}
const report={checks:[],errors:[],unexpectedApi:[],blockedExternal:[],fixture:{seed:ready.seed,readyFrame:ready.frame}};
const pass=name=>{report.checks.push(name);console.log('PASS',name);};
const fake='bb1.'+Buffer.from(JSON.stringify({wallet:'0x'+'b'.repeat(40),isTest:true,exp:Date.now()+3600000})).toString('base64url')+'.LOCAL_FIXTURE_NOT_SIGNED';
const send=(route,s,input)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,session:s,...(input?{input}:{})})});
const waitFor=async(fn,label,ms=15000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,80));}throw Error('Timed out: '+label);};
async function contextFor(browser,handler){
 const context=await browser.newContext({viewport:{width:1000,height:720},deviceScaleFactor:1,reducedMotion:'reduce'});
 await context.addInitScript(token=>{localStorage.setItem('bots.session',token);localStorage.setItem('bots.sound','off');},fake);
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!=='http://127.0.0.1:3000'){report.blockedExternal.push(url.origin);return route.abort();}
  if(url.pathname.startsWith('/api/')){
   if(url.pathname.startsWith('/api/bots/season/matches/'))return handler(route,request,url);
   if(url.pathname==='/api/bots/season'&&request.method()==='GET')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:{code:'FIXTURE_NOT_ENROLLED',message:'The isolated fight fixture has no live season account.'}})});
   report.unexpectedApi.push(url.pathname);return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:{code:'FIXTURE_BLOCKED',message:'Isolated fixture only.'}})});
  }
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 return{context,page};
}
const url='http://127.0.0.1:3000/bots?view=fight&combat=6&collection=season&session='+id+'&style=tank&rival=tank';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  if(!rulesOnly){
  let current=session(ready,10),held=null,getCount=0,inputBodies=[],holdSecond=false;
  const first=await contextFor(browser,async(route,request)=>{
   if(request.method()==='POST'){
    const body=request.postDataJSON();inputBodies.push(body);assert.deepEqual(Object.keys(body).sort(),['inputId','kind']);
    const s=copy(current.state),r=acceptSpecialV6(s,{id:body.inputId,kind:'special',who:0,frame:s.frame});assert(r.accepted);
    const receipt={inputId:body.inputId,kind:'special',frame:s.frame,accepted:true};current=session(s,11,[receipt]);return send(route,current,receipt);
   }
   getCount++;if(holdSecond){holdSecond=false;held={route,snapshot:copy(current)};return;}
   return send(route,current);
  });
  await first.page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  const charged=first.page.getByRole('button',{name:/Energy Shield · Space/});await charged.waitFor({timeout:60000});
  await waitFor(()=>charged.isEnabled(),'identical-practice build live renderer initialized',60000);
  pass('first live snapshot initializes its renderer even when builds equal the practice defaults');
  holdSecond=true;
  await waitFor(()=>held,'old poll held');
  await first.page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(v=>v.textContent.includes('Energy Shield · Space'));b.click();window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));});
  await waitFor(()=>inputBodies.length===1,'one synchronous input');await first.page.getByRole('button',{name:'Energy Shield active'}).waitFor({timeout:15000});
  await send(held.route,held.snapshot);held=null;await first.page.waitForTimeout(900);
  assert.equal(inputBodies.length,1);assert(await first.page.getByRole('button',{name:'Energy Shield active'}).isDisabled());
  assert.equal(await first.page.evaluate(id=>sessionStorage.getItem('bots:season:special:'+id),id),null);
  pass('rapid click/Space sends one input; delayed lower-revision same-frame poll cannot erase Special; receipt clears retry memento');
  const charge=await first.page.getByRole('progressbar',{name:'Special charge'}).getAttribute('value');await first.page.waitForTimeout(900);assert.equal(await first.page.getByRole('progressbar',{name:'Special charge'}).getAttribute('value'),charge);
  pass('a stalled server tick does not advance displayed Special charge or invent a client result');
  const end=copy(current.state);advanceFightV6(end,5400);current=session(end,90,current.inputs,'settlement-pending');
  await first.page.getByText('Saving the result…',{exact:true}).waitFor({timeout:15000});assert(await first.page.getByRole('button',{name:'Watch replay',exact:true}).isDisabled());
  current=session(end,91,current.inputs,'complete');await waitFor(()=>first.page.getByRole('button',{name:'Watch replay',exact:true}).isEnabled(),'complete replay enabled');
  const stop=getCount;await first.page.waitForTimeout(900);assert.equal(getCount,stop);
  pass('pending settlement remains visibly pending; only complete reply enables replay and stops polling');
  await first.page.screenshot({path:path.join(out,'complete-compact-result.png')});
  await first.page.getByRole('button',{name:'Watch replay',exact:true}).click();await first.page.keyboard.press('Space');await first.page.waitForTimeout(1000);assert.equal(inputBodies.length,1);assert.equal(getCount,stop);
  pass('replaying complete fight sends no input, start, polling or reward operation');
  await first.page.reload({waitUntil:'domcontentloaded'});await waitFor(()=>first.page.getByRole('button',{name:'Watch replay',exact:true}).isEnabled(),'reloaded saved match',60000);assert.equal(inputBodies.length,1);
  pass('reload resumes the same saved fight without a start request');
  await first.context.close();

  let current2=session(ready,20),post=null,inputs2=[],receipted=false;
  const second=await contextFor(browser,async(route,request)=>{
   if(request.method()==='POST'){
    const body=request.postDataJSON();inputs2.push(body);const s=copy(current2.state);assert(acceptSpecialV6(s,{id:body.inputId,who:0,kind:'special',frame:s.frame}).accepted);
    const receipt={inputId:body.inputId,kind:'special',frame:s.frame,accepted:true};current2=session(s,21,[receipt]);post=route;return;
   }
   if(current2.inputs.length)receipted=true;return send(route,current2);
  });
  await second.page.goto(url,{waitUntil:'domcontentloaded'});await waitFor(()=>second.page.getByRole('button',{name:/Energy Shield · Space/}).isEnabled(),'second renderer',60000);
  await second.page.getByRole('button',{name:/Energy Shield · Space/}).click();await waitFor(()=>receipted,'poll carries lost POST receipt');
  await waitFor(()=>second.page.evaluate(id=>sessionStorage.getItem('bots:season:special:'+id)===null,id),'receipt clears cached id');
  await post.abort('failed');await second.page.waitForTimeout(500);assert.equal(await second.page.getByRole('button',{name:'Retry Special',exact:true}).count(),0);
  assert.equal(await second.page.getByText(/could not connect|Tap Special again to retry/).count(),0);
  pass('accepted poll arriving before failed POST clears the retry ID and suppresses the obsolete retry error');
  await second.context.close();

  let defenderGets=0,defenderPosts=0;const final=copy(ready);advanceFightV6(final,5400);const defense=session(final,100,[],'complete',1);
  const third=await contextFor(browser,(route,request)=>{if(request.method()==='POST')defenderPosts++;else defenderGets++;return send(route,defense);});
  await third.page.goto(url,{waitUntil:'domcontentloaded'});await waitFor(()=>third.page.getByRole('button',{name:'Watch replay',exact:true}).isEnabled(),'defender replay',60000);
  assert(await third.page.getByText('Recorded defense. No coins were won or lost.',{exact:true}).isVisible());
  assert(await third.page.getByText(final.winner===1?'Your robot wins!':'The rival wins this one.',{exact:true}).isVisible());
  await third.page.keyboard.press('Space');await third.page.getByRole('button',{name:'Watch replay',exact:true}).click();await third.page.keyboard.press('Space');await third.page.waitForTimeout(1000);assert.equal(defenderPosts,0);
  await third.page.screenshot({path:path.join(out,'defender-recorded-replay.png')});pass('defender sees own win/loss, no attacker payout and cannot send Special during result or replay');
  await third.context.close();
  }
  for(const reason of ['changed-build','old-proof-rules']) {
  const incompatible=session(ready,1);incompatible.builds=copy(incompatible.builds);
  if(reason==='changed-build')incompatible.builds[0].gp++;
  else { incompatible.builds.forEach(build=>build.rulesVersion='mk6-1');incompatible.state.rulesVersion='mk6-1';incompatible.rules={...incompatible.rules,rulesVersion:'mk6-1'}; }
  incompatible.state.builds=copy(incompatible.builds);
  let incompatiblePosts=0;const fourth=await contextFor(browser,(route,request)=>{if(request.method()==='POST')incompatiblePosts++;return send(route,incompatible);});
  await fourth.page.goto(url,{waitUntil:'domcontentloaded'});await fourth.page.getByText('This fight needs its saved robot and combat rules. Your saved result is safe.',{exact:true}).waitFor({timeout:60000});
  await fourth.page.waitForTimeout(900);await fourth.page.keyboard.press('Space');await fourth.page.waitForTimeout(200);assert.equal(incompatiblePosts,0);
  pass(`${reason}: unavailable saved build/rules shows a clear error and never starts or invents a replacement fight`);await fourth.context.close();
  }
  assert.deepEqual(report.unexpectedApi,[]);assert.deepEqual(report.errors,[]);pass('isolated contexts intercepted every API; no real wallet, service, reward or external network call');
 }catch(e){report.failure=String(e);console.error(e);process.exitCode=1;for(const context of browser.contexts())for(const [n,page] of context.pages().entries()){report.lastBody=await page.locator('body').innerText().catch(()=>'(unavailable)');await page.screenshot({path:path.join(out,'failure-'+n+'.png')}).catch(()=>{});}}
 finally{await browser.close();fs.writeFileSync(path.join(out,rulesOnly?'rules-error-report.json':'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
