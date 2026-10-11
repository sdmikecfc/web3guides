// Browser-only fixtures: every API is intercepted. No wallet signing or real entry.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.MK_PLAYWRIGHT||'playwright');
const origin=process.env.MK_TEST_ORIGIN||'http://127.0.0.1:3221',output=process.env.MK_ZONE_OUTPUT||'D:/Temp/modelkombat-zone-session-20261011/results';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)||!/^D:[/\\]/i.test(output))throw Error('Local fixture and D-drive output required');
const SESSION='mk8.wallet-session.v1',privateVolume='987654321',privateProfit='6789123.456789';
const zone=(identity='',entered=false,volume='12345.678')=>({schemaVersion:1,rules:'mk-token-zones-1',available:true,state:'active',startsAt:'2026-10-06T14:00:00Z',endsAt:'2026-11-03T14:00:00Z',confirmedThrough:'2026-10-11T08:00:00Z',fresh:true,complete:true,issues:[],volumeUsd:volume,history:[{day:1,volumeUsd:'500'},{day:5,volumeUsd:volume}],assets:[],tracking:{verified:3,total:5,partial:true},financials:{verified:2,total:5,complete:false,confirmedThrough:'2026-10-11T08:00:00Z'},standings:{volume:[{id:'public-leader',name:'Public trader',rank:1,score:'5000',qualified:true}],roi:[{id:'public-leader',name:'Public trader',rank:1,score:'12.3456',qualified:true}],profit:[{id:'public-leader',name:'Public trader',rank:1,score:privateProfit,qualified:true}],battles:[]},personal:identity?{id:identity,connected:true,linkStatus:'linked',entered,weeks:[1,0,0,0],qualified:false,volumeUsd:privateVolume,attemptsRemaining:12,awards:[],challenges:[],ranks:{volume:2,roi:null,profit:null,battles:null}}:null});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+15000;while(!await fn()){if(Date.now()>end)throw Error('Timed out: '+label);await delay(20)}}
async function main(){
 fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true}),checks=[],errors=[];let contexts=0;
 try{
  async function fixture(token='',initial={}){
   const context=await browser.newContext({viewport:{width:1280,height:800}});contexts++;const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
   if(token)await page.addInitScript(({SESSION,token})=>sessionStorage.setItem(SESSION,JSON.stringify({token})),{SESSION,token});
   const mode={register:'normal',public:'normal',personal:'normal',entered:false,publicPersonal:false,...initial},requests=[],holds={};
   const hold=key=>new Promise(resolve=>{holds[key]=resolve});
   const reply=(route,data)=>route.fulfill(data).catch(()=>{});
   await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();
    const bearer=(req.headers().authorization||'').replace(/^Bearer /,'');requests.push({path:u.pathname,method:req.method(),bearer});
    assert.ok(['/api/bots/campaign/zones','/api/bots/campaign/zones/register'].includes(u.pathname),'Unexpected API requested');
    if(u.pathname.endsWith('/register')){
     assert.equal(req.method(),'POST');assert.ok(bearer,'Registration must be authenticated');const selected=mode.register;if(selected==='hold')await hold('register');
     if(['401','503'].includes(selected))return reply(route,{status:Number(selected),json:{ok:false,error:'SECRET_BACKEND_DETAILS'}});
     return reply(route,{json:{ok:selected!=='false'}});
    }
    if(req.method()==='POST'){
     assert.ok(bearer,'Competition entry must be authenticated');if(mode.entry==='hold')await hold('entry');
     return reply(route,{json:{ok:true,zones:zone(bearer,true)}});
    }
    assert.equal(req.method(),'GET');const selected=bearer?mode.personal:mode.public;if(selected==='hold')await hold(bearer?'personal':'public');
    if(['401','503'].includes(selected))return reply(route,{status:Number(selected),json:{error:'SECRET_BACKEND_DETAILS'}});
    if(selected==='unavailable')return reply(route,{json:{...zone(),available:false}});
    const data=zone(bearer&&selected!=='anonymous'?bearer:mode.publicPersonal?'PUBLIC_MUST_IGNORE_PERSONAL':'',mode.entered,bearer?mode.privateVolume||'12345.678':mode.publicVolume||'12345.678');
    return reply(route,{json:data});
   });
   const button=name=>page.getByRole('button',{name,exact:true}),heading=name=>page.getByRole('heading',{name,exact:true}),text=()=>page.locator('body').innerText();
   const settled=()=>button('Refresh').waitFor(),refresh=async()=>{await button('Refresh').click();await settled()},ready=async()=>{await heading('Your progress').waitFor();await settled()},publicReady=()=>page.getByText('$12,345.678',{exact:true}).waitFor();
   const change=async(next,notify=false)=>page.evaluate(({SESSION,next,notify})=>{if(next)sessionStorage.setItem(SESSION,JSON.stringify({token:next}));else sessionStorage.removeItem(SESSION);if(notify)window.dispatchEvent(new StorageEvent('storage',{key:SESSION}));},{SESSION,next,notify});
   const release=async key=>{await until(()=>!!holds[key],key+' held');const resolve=holds[key];delete holds[key];resolve();};
   const noPersonal=async()=>{assert.equal(await heading('Your progress').count(),0);const body=await text();assert.ok(!body.includes('Your volume:'));assert.ok(!body.includes('Competition entered'));assert.ok(!body.includes('SECRET_BACKEND_DETAILS'));assert.ok(!body.includes(privateProfit));assert.ok(!body.includes('6,789,123'));};
   await page.goto(origin+'/bots/leaderboard',{waitUntil:'domcontentloaded',timeout:120000});
   return {page,context,mode,requests,holds,button,heading,text,settled,refresh,ready,publicReady,change,release,noPersonal};
  }
  {
   const f=await fixture('',{publicPersonal:true});await f.settled();await f.publicReady();await f.noPersonal();assert.deepEqual(f.requests.map(x=>[x.method,x.bearer]),[['GET','']]);
   await f.button('Realized profit 15%').click();assert.ok((await f.text()).includes('Amount private'));await f.noPersonal();
   await f.button('Connect wallet →').click();await f.button('Fixture sign in').click();await f.ready();assert.equal(f.requests.filter(x=>x.path.endsWith('/register')).length,1);assert.equal(f.requests.filter(x=>x.path.endsWith('/zones')&&x.method==='POST').length,0);
   checks.push('anonymous public results, stripped personal payload, private profit hidden, fixture sign-in registers without entering');await f.context.close();
  }
  {
   const f=await fixture('slow-registration',{register:'hold'});await f.publicReady();assert.ok(await f.button('Checking…').isVisible());await f.noPersonal();assert.equal(f.requests.filter(x=>x.method==='GET'&&x.bearer).length,0);await f.release('register');await f.ready();
   await f.refresh();assert.equal(f.requests.filter(x=>x.path.endsWith('/register')).length,1);assert.ok((await f.text()).includes('Not entered'));checks.push('public results appear before delayed registration; registration reused only after ACK');
   for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:844,height:390}]){await f.page.setViewportSize(viewport);assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal overflow '+viewport.width);await f.page.screenshot({path:path.join(output,'valid-session-'+viewport.width+'x'+viewport.height+'.png'),fullPage:true})}
   checks.push('desktop, portrait and short landscape without horizontal overflow');await f.context.close();
  }
  {
   const f=await fixture('timeout-registration',{register:'hold'});await f.publicReady();await f.noPersonal();await f.settled();await f.publicReady();await f.noPersonal();assert.equal(await f.page.getByRole('alert').innerText(),'Your wallet status could not be checked. Try again.');assert.equal(f.requests.filter(x=>x.method==='GET'&&x.bearer).length,0);await f.release('register');f.mode.register='normal';await f.refresh();await f.ready();checks.push('shared registration timeout never hides public results and retry recovers');await f.context.close();
  }
  for(const failure of ['401','503','false']){
   const f=await fixture('registration-'+failure,{register:failure});await f.settled();await f.publicReady();await f.noPersonal();assert.equal(f.requests.filter(x=>x.method==='GET'&&x.bearer).length,0);assert.equal(await f.button('Enter competition →').count(),0);
   assert.equal(await f.page.getByRole('alert').innerText(),failure==='401'?'Sign in again to check your rewards.':'Your wallet status could not be checked. Try again.');
   if(failure==='401'){await f.button('Sign in again →').waitFor();await f.page.setViewportSize({width:390,height:844});await f.page.screenshot({path:path.join(output,'expired-session-public-results-390x844.png'),fullPage:true});}
   f.mode.register='normal';await f.refresh();await f.ready();assert.equal(f.requests.filter(x=>x.path.endsWith('/register')).length,2);checks.push('registration '+failure+' keeps public results, prevents stale entry and recovers');await f.context.close();
  }
  {
   const f=await fixture('expiry');await f.ready();f.mode.personal='401';await f.refresh();await f.publicReady();await f.noPersonal();await f.button('Sign in again →').waitFor();f.mode.personal='anonymous';await f.refresh();await f.noPersonal();await f.button('Sign in again →').waitFor();f.mode.personal='normal';await f.refresh();await f.ready();checks.push('expiry and anonymous authenticated 200 clear personal state while retaining public results');await f.context.close();
  }
  {
   const f=await fixture('private-first',{public:'hold',privateVolume:'23456.789'});await f.heading('Your progress').waitFor();await f.page.getByText('$23,456.789',{exact:true}).waitFor();await f.release('public');await f.ready();await f.page.getByText('$23,456.789',{exact:true}).waitFor();checks.push('late public response cannot overwrite successful authenticated results');await f.context.close();
  }
  {
   const f=await fixture('private-fallback',{public:'503'});await f.ready();await f.publicReady();assert.equal(await f.page.getByRole('alert').count(),0);f.mode.personal='503';await f.refresh();await f.noPersonal();assert.equal(await f.page.getByText('$12,345.678',{exact:true}).count(),0);assert.ok((await f.text()).includes('Competition status unavailable'));f.mode.public='normal';f.mode.personal='normal';await f.refresh();await f.ready();checks.push('authenticated fallback works if public read fails; both failures clear stale results and retry recovers');await f.context.close();
  }
  {
   const f=await fixture('late-register-A',{register:'hold'});await f.publicReady();await f.change('late-register-B');await f.release('register');await f.settled();await f.noPersonal();assert.equal(f.requests.filter(x=>x.method==='GET'&&x.bearer).length,0);assert.equal(await f.page.getByRole('alert').innerText(),'Your wallet changed. Refresh its status before continuing.');f.mode.register='normal';await f.refresh();await f.ready();assert.equal(f.requests.filter(x=>x.path.endsWith('/register')&&x.bearer==='late-register-B').length,1);checks.push('wallet change during registration rejects stale ACK and re-registers current identity');await f.context.close();
  }
  {
   const f=await fixture('late-read-A',{personal:'hold'});await f.publicReady();await until(()=>!!f.holds.personal,'private held');await f.change('late-read-B');await f.release('personal');await f.settled();await f.noPersonal();f.mode.personal='normal';await f.refresh();await f.ready();
   f.mode.personal='hold';await f.button('Refresh').click();await until(()=>!!f.holds.personal,'private held again');f.mode.personal='normal';await f.change('late-read-C',true);await f.ready();await f.release('personal');await delay(100);assert.equal(await f.page.getByRole('alert').count(),0);assert.equal(f.requests.filter(x=>x.path.endsWith('/register')&&x.bearer==='late-read-C').length,1);checks.push('late personal responses cannot cross identities, including storage-triggered abort');await f.context.close();
  }
  {
   const f=await fixture('entry-A');await f.ready();f.mode.entry='hold';await f.button('Enter competition →').evaluate(control=>{control.click();control.click()});await until(()=>!!f.holds.entry,'entry held');assert.equal(f.requests.filter(x=>x.method==='POST'&&x.path.endsWith('/zones')).length,1);await f.change('entry-B');await f.release('entry');await f.button('Refresh').waitFor();await f.noPersonal();assert.equal(await f.page.getByRole('alert').innerText(),'Your wallet changed. Refresh its status before continuing.');await f.refresh();await f.ready();checks.push('entry double-click is single authenticated request; stale entry response cannot enroll displayed new identity');await f.context.close();
  }
  assert.deepEqual(errors,[]);const source=path.resolve(__dirname,'../../src/app/bots/_game/TokenZoneBoard.tsx'),sourceHash=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');const proof=await (await fetch(origin+'/build-proof.json')).json();assert.equal(proof.sha256,sourceHash,'Fixture is not built from current exact component');
  const report={passed:true,scope:'Exact-source Chromium fixture; all APIs intercepted, wallet callback stubbed, no real signing, registration or competition entry',contexts,sourceHash,builtAt:proof.builtAt,checks,errors,physicalPhoneTested:false};fs.writeFileSync(path.join(output,'token-zone-session-results.json'),JSON.stringify(report,null,2));console.log('PASS token-zone session: '+checks.length+' browser scenarios; source '+sourceHash+'; '+output);
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
