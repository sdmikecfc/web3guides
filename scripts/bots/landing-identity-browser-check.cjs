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
 async function refresh(){const button=page.getByRole('button',{name:'Refresh status',exact:true});if(!await button.isVisible())await page.getByText('Reward rules & updates',{exact:true}).click();await button.click();}
 let readMode='normal',posts=0,entered=false,holdRead=null,holdPost=null,deferPost=false;
 await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url());if(url.pathname!=='/api/bots/campaign/zones')return route.fulfill({status:503,json:{ok:false,error:'Not part of this local fixture'}});
  const token=(req.headers().authorization||'').replace('Bearer ','');
  if(req.method()==='POST'){posts++;if(deferPost)await new Promise(resolve=>{holdPost=resolve});return route.fulfill({json:{ok:true,zones:zone(token,true)}})}
  if(readMode==='401')return route.fulfill({status:401,json:{error:'SECRET_DATABASE_DETAIL_MUST_NOT_RENDER'}});
  if(readMode==='503')return route.fulfill({status:503,json:{error:'SECRET_DATABASE_DETAIL_MUST_NOT_RENDER'}});
  if(readMode==='defer')await new Promise(resolve=>{holdRead=resolve});
  return route.fulfill({json:zone(readMode==='anonymous'?'':token,entered)});
 });
 await page.goto(origin+'/bots/start?setup=1',{waitUntil:'domcontentloaded',timeout:120000});await page.getByRole('heading',{name:'Ready to enter',exact:true}).waitFor({timeout:30000}).catch(async error=>{console.error({body:await page.locator('body').innerText(),errors});throw error});
 // A changed credential cannot reuse the previous wallet's ready status.
 await page.evaluate(SESSION=>sessionStorage.setItem(SESSION,JSON.stringify({token:'fixture-B'})),SESSION);await page.getByRole('button',{name:'Enter competition →',exact:true}).click();
 await page.getByRole('heading',{name:'Account status unavailable',exact:true}).waitFor();assert.equal(posts,0);assert.equal(await page.getByRole('button',{name:'Enter competition →',exact:true}).count(),0);
 await page.getByRole('button',{name:'Check status again →',exact:true}).click();await page.getByRole('heading',{name:'Ready to enter',exact:true}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Open Doma Strategies ↗',exact:true}).count(),0);
 // Authentication failure clears prior entered/ready facts and offers sign-in.
 entered=true;await refresh();await page.getByRole('heading',{name:'You’re entered',exact:true}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Open Doma Strategies ↗',exact:true}).getAttribute('href'),'https://app.doma.xyz/auto-trading');
 assert.equal(await page.getByRole('link',{name:'MCP setup help ↗',exact:true}).getAttribute('href'),'https://docs.doma.xyz/agentic-commerce/mcp-server/connect');
 assert.equal(await page.getByRole('link',{name:'Strategy help ↗',exact:true}).getAttribute('href'),'https://app.doma.xyz/help#help-category-trade');
 await page.getByRole('heading',{name:'Start trading now.',exact:true}).waitFor();
 await page.getByText('Reward rules & updates',{exact:true}).evaluate(summary=>summary.parentElement.open=false);
 for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const name of ['Open Doma Strategies ↗','MCP setup help ↗']){const box=await page.getByRole('link',{name,exact:true}).boundingBox();assert.ok(box.width>=200&&box.height>=54,'Actions must be large enough for touch');}
  await page.screenshot({path:path.join(output,'entered-'+viewport.width+'x'+viewport.height+'.png'),fullPage:true});
 }
 await page.setViewportSize({width:1280,height:720});
 readMode='401';await refresh();await page.getByRole('button',{name:'Sign in again →',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'You’re entered',exact:true}).count(),0);assert.ok(!(await page.locator('body').innerText()).includes('SECRET_DATABASE_DETAIL'));
 // An anonymous 200 response with a bearer is not a confirmed wallet save.
 readMode='anonymous';await refresh();await page.getByRole('button',{name:'Sign in again →',exact:true}).waitFor();assert.equal(posts,0);
 readMode='normal';entered=false;await refresh();await page.getByRole('heading',{name:'Ready to enter',exact:true}).waitFor();
 // A late read must not install the old account after the credential changed.
 readMode='defer';await refresh();await page.getByRole('button',{name:'Checking status…',exact:true}).waitFor();
 await page.evaluate(SESSION=>sessionStorage.setItem(SESSION,JSON.stringify({token:'fixture-C'})),SESSION);while(!holdRead)await new Promise(resolve=>setTimeout(resolve,10));holdRead();holdRead=null;
 await page.getByRole('heading',{name:'Account status unavailable',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Enter competition →',exact:true}).count(),0);
 readMode='normal';await page.getByRole('button',{name:'Check status again →',exact:true}).click();await page.getByRole('heading',{name:'Ready to enter',exact:true}).waitFor();
 // Double dispatch is one request, and a switched identity rejects its response.
 deferPost=true;await page.getByRole('button',{name:'Enter competition →',exact:true}).evaluate(button=>{button.click();button.click()});await page.getByRole('button',{name:'Saving entry…',exact:true}).waitFor();assert.equal(posts,1);
 await page.evaluate(SESSION=>sessionStorage.setItem(SESSION,JSON.stringify({token:'fixture-D'})),SESSION);while(!holdPost)await new Promise(resolve=>setTimeout(resolve,10));holdPost();holdPost=null;
 await page.getByRole('heading',{name:'Account status unavailable',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'You’re entered',exact:true}).count(),0);
 // Transient backend errors do not expose backend details or stale qualification.
 readMode='503';await page.getByRole('button',{name:'Check status again →',exact:true}).click();await page.getByRole('heading',{name:'Account status unavailable',exact:true}).waitFor();assert.ok(!(await page.locator('body').innerText()).includes('SECRET_DATABASE_DETAIL'));
 await page.getByRole('link',{name:'MODEL KOMBAT',exact:true}).click();await page.getByRole('heading',{name:'Trade with bots. Climb the ranks.',exact:true}).waitFor();assert.equal(new URL(page.url()).search,'');
 await page.screenshot({path:path.join(output,'landing-home.png'),fullPage:true});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'landing-identity-results.json'),JSON.stringify({passed:true,scope:'local browser with all APIs mocked; no real wallet authentication, enrollment or tracking',checks:['credential change cannot reuse ready status','401 clears old account','anonymous bearer response rejected','in-flight read identity change rejected','double-click entry sends once','in-flight entry identity change rejected','friendly errors only','brand returns home'],posts,errors},null,2));
 console.log('PASS landing identity: stale/changed identities, failed reads, duplicate entry clicks, late responses and guide navigation. '+output);
}finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
