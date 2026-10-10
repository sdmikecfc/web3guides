// Browser-only fixtures: every API is intercepted. No wallet signing or real entry.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.MK_PLAYWRIGHT||'playwright');
const origin=process.env.MK_TEST_ORIGIN||'http://127.0.0.1:3195',output=process.env.MK_ENTRY_OUTPUT||'D:/Temp/modelkombat-entry-review';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)||!/^D:[/\\]/i.test(output))throw Error('Local preview and D-drive output required');
const SESSION='mk8.wallet-session.v1';
const zone=(identity,entered=false)=>({schemaVersion:1,rules:'mk-token-zones-1',available:true,state:'active',startsAt:'2026-10-06T14:00:00Z',endsAt:'2026-11-03T14:00:00Z',confirmedThrough:null,fresh:false,complete:false,issues:[],volumeUsd:null,history:[],assets:[],standings:{volume:[],roi:[],profit:[],battles:[]},personal:identity?{id:identity,connected:true,linkStatus:'linked',entered,weeks:[null,null,null,null],qualified:null,volumeUsd:'123',attemptsRemaining:12,awards:[],challenges:[],ranks:{volume:null,roi:null,profit:null,battles:null}}:null});
async function main(){fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({SESSION})=>{sessionStorage.setItem(SESSION,JSON.stringify({token:'fixture-A',address:'0x0000000000000000000000000000000000000001'}));localStorage.setItem('mk.trading-guide.2',JSON.stringify({step:3,method:'strategy'}))},{SESSION});
 const heading=name=>page.getByRole('heading',{name,exact:true}),button=name=>page.getByRole('button',{name,exact:true});
 async function refresh(){const control=button('Refresh status');if(!await control.isVisible())await page.getByText('Reward rules & updates',{exact:true}).click();await control.click();}
 async function retry(){await button('Check status again →').click();}
 const changeWallet=token=>page.evaluate(({SESSION,token})=>sessionStorage.setItem(SESSION,JSON.stringify({token})),{SESSION,token});
 async function noEntryConfirmation(){for(const name of ['Ready to enter','Not entered yet','You’re entered','Start trading now.'])assert.equal(await heading(name).count(),0);const text=await page.locator('body').innerText();assert.ok(!text.includes('Your wallet is saved.'));assert.ok(!text.includes('We’re linking your Doma wallets.'));assert.ok(!text.includes('SECRET_DATABASE_DETAIL'));}
 async function waitForHold(get){const until=Date.now()+10000;while(!get()){if(Date.now()>until)throw Error('Mock request did not reach its controlled hold');await new Promise(resolve=>setTimeout(resolve,10));}}
 let readMode='normal',registerMode='normal',linkStatus='linked',posts=0,entered=false,holdRead=null,holdPost=null,holdRegistration=null,deferPost=false;
 const requests=[],queued=new Set(),registrations=token=>requests.filter(r=>r.path.endsWith('/register')&&r.token===token).length,reads=token=>requests.filter(r=>r.path==='/api/bots/campaign/zones'&&r.method==='GET'&&(!token||r.token===token)).length;
 await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url());if(!['/api/bots/campaign/zones','/api/bots/campaign/zones/register'].includes(url.pathname))return route.fulfill({status:503,json:{ok:false,error:'Not part of this local fixture'}});
  const token=(req.headers().authorization||'').replace('Bearer ','');requests.push({path:url.pathname,method:req.method(),token});
  if(url.pathname.endsWith('/register')){
   assert.equal(req.method(),'POST');assert.ok(token,'Registration must use the saved authenticated session');
   if(registerMode==='defer')await new Promise(resolve=>{holdRegistration=resolve});
   if(registerMode==='503'||registerMode==='401')return route.fulfill({status:Number(registerMode),json:{ok:false,error:'SECRET_DATABASE_DETAIL_MUST_NOT_RENDER'}});
   if(registerMode==='false')return route.fulfill({json:{ok:false,error:'SECRET_DATABASE_DETAIL_MUST_NOT_RENDER'}});
   queued.add(token);return route.fulfill({json:{ok:true}});
  }
  if(req.method()==='POST'){posts++;if(deferPost)await new Promise(resolve=>{holdPost=resolve});return route.fulfill({json:{ok:true,zones:zone(token,true)}})}
  if(readMode==='401'||readMode==='503')return route.fulfill({status:Number(readMode),json:{error:'SECRET_DATABASE_DETAIL_MUST_NOT_RENDER'}});
  if(readMode==='defer')await new Promise(resolve=>{holdRead=resolve});
  const data=zone(readMode==='anonymous'?'':token,entered);if(data.personal)data.personal.linkStatus=queued.has(token)?linkStatus:'pending';return route.fulfill({json:data});
 });
 await page.goto(origin+'/bots/start?setup=1',{waitUntil:'domcontentloaded',timeout:120000});await heading('Ready to enter').waitFor({timeout:30000}).catch(async error=>{console.error({body:await page.locator('body').innerText(),errors});throw error});
 // A legacy saved session must be queued before the first personal status read.
 assert.deepEqual(requests.slice(0,2),[{path:'/api/bots/campaign/zones/register',method:'POST',token:'fixture-A'},{path:'/api/bots/campaign/zones',method:'GET',token:'fixture-A'}]);assert.equal(registrations('fixture-A'),1);
 await refresh();await heading('Ready to enter').waitFor();assert.equal(registrations('fixture-A'),1);assert.equal(reads('fixture-A'),2);
 // Missing Doma accounts have a setup route without implying competition entry.
 linkStatus='not_found';await refresh();await heading('Not entered yet').waitFor();
 assert.equal(await page.getByRole('link',{name:'Set up Doma ↗',exact:true}).getAttribute('href'),'https://app.doma.xyz/auto-trading');
 assert.equal(await button('Enter competition →').count(),0);assert.equal(await heading('You’re entered').count(),0);assert.equal(await heading('Start trading now.').count(),0);
 await button('Check linking status →').waitFor();
 linkStatus='pending';await button('Check linking status →').click();await heading('Not entered yet').waitFor();
 assert.equal(await page.getByRole('link',{name:'Set up Doma ↗',exact:true}).count(),0);assert.equal(await button('Enter competition →').count(),0);assert.equal(await heading('You’re entered').count(),0);
 linkStatus='linked';await button('Check linking status →').click();await heading('Ready to enter').waitFor();assert.equal(registrations('fixture-A'),1);
 // A changed credential cannot reuse the previous wallet's ready status.
 await changeWallet('fixture-B');await button('Enter competition →').click();await heading('Account status unavailable').waitFor();assert.equal(posts,0);assert.equal(await button('Enter competition →').count(),0);
 await retry();await heading('Ready to enter').waitFor();assert.equal(registrations('fixture-B'),1);assert.equal(reads('fixture-B'),1);
 assert.equal(await page.getByRole('link',{name:'Open Doma Strategies ↗',exact:true}).count(),0);
 // Entered users have clear actions on desktop, portrait and short landscape.
 entered=true;await refresh();await heading('You’re entered').waitFor();
 assert.equal(await page.getByRole('link',{name:'Open Doma Strategies ↗',exact:true}).getAttribute('href'),'https://app.doma.xyz/auto-trading');
 assert.equal(await page.getByRole('link',{name:'MCP setup help ↗',exact:true}).getAttribute('href'),'https://docs.doma.xyz/agentic-commerce/mcp-server/connect');
 assert.equal(await page.getByRole('link',{name:'Strategy help ↗',exact:true}).getAttribute('href'),'https://app.doma.xyz/help#help-category-trade');
 await heading('Start trading now.').waitFor();await page.getByText('Reward rules & updates',{exact:true}).evaluate(summary=>summary.parentElement.open=false);
 for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const name of ['Open Doma Strategies ↗','MCP setup help ↗']){const box=await page.getByRole('link',{name,exact:true}).boundingBox();assert.ok(box.width>=200&&box.height>=54,'Actions must be large enough for touch');}
  await page.screenshot({path:path.join(output,'entered-'+viewport.width+'x'+viewport.height+'.png'),fullPage:true});
 }
 await page.setViewportSize({width:1280,height:720});
 // Authentication failure clears prior entered/ready facts and offers sign-in.
 readMode='401';await refresh();await button('Sign in again →').waitFor();assert.equal(await heading('You’re entered').count(),0);assert.ok(!(await page.locator('body').innerText()).includes('SECRET_DATABASE_DETAIL'));
 // An anonymous 200 response with a bearer is not a confirmed wallet save.
 readMode='anonymous';await refresh();await button('Sign in again →').waitFor();assert.equal(posts,0);
 readMode='normal';entered=false;await refresh();await heading('Ready to enter').waitFor();assert.equal(registrations('fixture-B'),1,'Successful registration is not repeated on status refreshes');
 // A late read must not install the old account after the credential changed.
 readMode='defer';await refresh();await button('Checking status…').waitFor();await changeWallet('fixture-C');await waitForHold(()=>holdRead);holdRead();holdRead=null;
 await heading('Account status unavailable').waitFor();assert.equal(await button('Enter competition →').count(),0);
 readMode='normal';await retry();await heading('Ready to enter').waitFor();assert.equal(registrations('fixture-C'),1);
 // Double dispatch is one request, and a switched identity rejects its response.
 deferPost=true;await button('Enter competition →').evaluate(control=>{control.click();control.click()});await button('Saving entry…').waitFor();assert.equal(posts,1);
 await changeWallet('fixture-D');await waitForHold(()=>holdPost);holdPost();holdPost=null;await heading('Account status unavailable').waitFor();assert.equal(await heading('You’re entered').count(),0);
 // Transient backend errors do not expose backend details or stale qualification.
 readMode='503';await retry();await heading('Account status unavailable').waitFor();assert.ok(!(await page.locator('body').innerText()).includes('SECRET_DATABASE_DETAIL'));
 // Registration failures cannot be misreported as saved or pending discovery.
 readMode='normal';registerMode='503';await changeWallet('fixture-E');const beforeFailureReads=reads();await retry();await heading('Account status unavailable').waitFor();assert.equal(reads(),beforeFailureReads);assert.equal(registrations('fixture-E'),1);await noEntryConfirmation();
 registerMode='false';await retry();await heading('Account status unavailable').waitFor();assert.equal(reads(),beforeFailureReads);assert.equal(registrations('fixture-E'),2);await noEntryConfirmation();
 registerMode='401';await retry();await button('Sign in again →').waitFor();assert.equal(reads(),beforeFailureReads);await noEntryConfirmation();
 registerMode='normal';await refresh();await heading('Ready to enter').waitFor();assert.equal(registrations('fixture-E'),4);assert.equal(reads('fixture-E'),1);await refresh();await heading('Ready to enter').waitFor();assert.equal(registrations('fixture-E'),4);
 // A registration ACK for a wallet changed in flight cannot trigger a stale GET
 // or be cached as the current identity's successful registration.
 registerMode='defer';await changeWallet('fixture-F');const beforeLateReads=reads();await refresh();await button('Checking status…').waitFor();await changeWallet('fixture-G');await waitForHold(()=>holdRegistration);holdRegistration();holdRegistration=null;
 await heading('Account status unavailable').waitFor();assert.equal(reads(),beforeLateReads);assert.equal(registrations('fixture-F'),1);await noEntryConfirmation();
 registerMode='normal';await changeWallet('fixture-F');await retry();await heading('Ready to enter').waitFor();assert.equal(registrations('fixture-F'),2,'A stale registration ACK must not suppress the retry');assert.equal(reads('fixture-F'),1);
 // Existing sign-in proceeds straight to entry status, without a setup detour.
 await button('← Back').click();await button('← Back').click();await button('← Back').click();await heading('Connect your wallet.').waitFor();await button('Check my entry →').click();await heading('Ready to enter').waitFor();
 await page.getByRole('link',{name:'MODEL KOMBAT',exact:true}).click();await heading('Trade with bots. Climb the ranks.').waitFor();assert.equal(new URL(page.url()).search,'');
 await page.getByRole('button',{name:'Continue trading setup',exact:false}).click();await heading('Ready to enter').waitFor();await page.getByRole('link',{name:'MODEL KOMBAT',exact:true}).click();
 await page.screenshot({path:path.join(output,'landing-home.png'),fullPage:true});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'landing-identity-results.json'),JSON.stringify({passed:true,scope:'local browser with all APIs mocked; no real wallet authentication, enrollment or tracking',checks:['saved session registers before personal GET','registration is reused only for the confirmed bearer','credential change requeues registration','not-found wallet has Doma setup recovery without entry','pending wallet cannot enter until linked','failed and false-success registration cannot claim pending or saved','registration retries recover','late registration identity change blocks stale GET and cached ACK','credential change cannot reuse ready status','401 clears old account','anonymous bearer response rejected','in-flight read identity change rejected','double-click entry sends once','in-flight entry identity change rejected','existing sign-in goes straight to entry','friendly errors only','brand returns home'],posts,registrations:requests.filter(r=>r.path.endsWith('/register')).length,errors},null,2));
 console.log('PASS landing identity: saved-session registration, failure/retry/late-ACK guards, changed identities, duplicate entry and direct entry navigation. '+output);
}finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
