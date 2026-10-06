// Local browser fixture: all APIs are intercepted; no real enrollment or wallet signing.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.MK_PLAYWRIGHT||'playwright');
const origin=process.env.MK_TEST_ORIGIN||'http://127.0.0.1:3195',output=process.env.MK_ENTRY_OUTPUT||'D:/Temp/modelkombat-entry-review';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)||!/^D:[/\\]/i.test(output))throw Error('Local preview and D-drive output required');
const SESSION='mk8.wallet-session.v1';
const zone=(token,mode)=>({schemaVersion:1,rules:'mk-token-zones-1',available:mode!=='unavailable',state:mode==='draft'||mode==='unavailable'?'draft':'active',startsAt:'2026-10-08T14:00:00Z',endsAt:'2026-11-05T14:00:00Z',confirmedThrough:null,fresh:false,complete:false,issues:[],volumeUsd:null,history:[],assets:[],standings:{volume:[],roi:[],profit:[],battles:[]},personal:token&&mode!=='unavailable'?{id:token,connected:true,linkStatus:'linked',entered:mode==='entered',weeks:[null,null,null,null],qualified:null,volumeUsd:'123',attemptsRemaining:12,awards:[],challenges:[],ranks:{volume:null,roi:null,profit:null,battles:null}}:null});
async function main(){fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(SESSION=>sessionStorage.setItem(SESSION,JSON.stringify({token:'fixture-A'})),SESSION);
 let mode='draft',deferRead=false,deferPost=false,releaseRead,releasePost,posts=0,failPost=false;
 await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url()),token=(req.headers().authorization||'').replace('Bearer ','');
  if(url.pathname==='/api/bots/campaign/zones/register')return route.fulfill({json:{ok:true}});
  if(url.pathname!=='/api/bots/campaign/zones')return route.fulfill({status:503,json:{error:'Not part of local fixture'}});
  if(req.method()==='POST'){posts++;if(deferPost)await new Promise(resolve=>releasePost=resolve);return failPost?route.fulfill({status:503,json:{error:'SECRET_DATABASE_DETAIL'}}):route.fulfill({json:{zones:zone(token,'entered')}})}
  const requestMode=mode;if(deferRead)await new Promise(resolve=>releaseRead=resolve);
  if(requestMode==='401')return route.fulfill({status:401,json:{error:'SECRET_DATABASE_DETAIL'}});
  return route.fulfill({json:zone(requestMode==='anonymous'?'':token,requestMode)});
 });
 const releaseWhenReady=async get=>{const end=Date.now()+10000;while(!get()){if(Date.now()>end)throw Error('Fixture request did not arrive');await new Promise(resolve=>setTimeout(resolve,10))}get()()};
 const refresh=()=>page.getByRole('button',{name:'Refresh',exact:true}).click();
 const settle=()=>page.getByRole('button',{name:'Refresh',exact:true}).waitFor();
 const changeToken=token=>page.evaluate(({SESSION,token})=>sessionStorage.setItem(SESSION,JSON.stringify({token})),{SESSION,token});
 await page.goto(origin+'/bots/leaderboard',{waitUntil:'domcontentloaded',timeout:120000});await settle();
 assert.ok((await page.locator('body').innerText()).includes('Opens Oct'));assert.ok(!(await page.locator('body').innerText()).includes('Start date to be announced'));
 assert.ok((await page.locator('svg[aria-labelledby="zone-chart-title zone-chart-desc"]').textContent()).includes('Opens Oct'));
 mode='unavailable';await refresh();await settle();let body=await page.locator('body').innerText();
 assert.ok(body.includes('Competition status unavailable'));assert.ok(body.includes('Not confirmed'));assert.ok(!body.includes('0 / 9 zones'));assert.ok(!body.includes('Not started'));assert.ok(!body.includes('Start date to be announced'));assert.ok(!body.includes('Your volume:'));
 mode='active';await refresh();await page.getByRole('button',{name:'Enter competition →',exact:true}).waitFor();
 await changeToken('fixture-B');await page.getByRole('button',{name:'Enter competition →',exact:true}).click();await page.locator('p[role=alert]').waitFor();assert.equal(posts,0);assert.ok(!(await page.locator('body').innerText()).includes('Your volume:'));
 await refresh();await page.getByRole('button',{name:'Enter competition →',exact:true}).waitFor();
 mode='401';await refresh();await settle();assert.ok((await page.locator('p[role=alert]').innerText()).includes('Sign in again'));assert.ok(!(await page.locator('body').innerText()).includes('Your volume:'));
 mode='anonymous';await refresh();await settle();assert.ok((await page.locator('p[role=alert]').innerText()).includes('Sign in again'));
 mode='active';await refresh();await settle();deferRead=true;await refresh();await page.getByRole('button',{name:'Checking…',exact:true}).waitFor();await changeToken('fixture-C');await releaseWhenReady(()=>releaseRead);await settle();assert.ok((await page.locator('p[role=alert]').innerText()).includes('wallet changed'));assert.ok(!(await page.locator('body').innerText()).includes('Your volume:'));
 deferRead=false;await refresh();await settle();deferPost=true;await page.getByRole('button',{name:'Enter competition →',exact:true}).evaluate(el=>{el.click();el.click()});await page.getByRole('button',{name:'Entering… →',exact:true}).waitFor();assert.equal(posts,1);await changeToken('fixture-D');await releaseWhenReady(()=>releasePost);await page.locator('p[role=alert]').waitFor();assert.ok(!(await page.locator('body').innerText()).includes('Competition entered'));
 deferPost=false;await refresh();await settle();failPost=true;await page.getByRole('button',{name:'Enter competition →',exact:true}).click();await page.locator('p[role=alert]').waitFor();assert.ok((await page.locator('p[role=alert]').innerText()).includes('Entry could not be confirmed'));assert.ok(!(await page.locator('body').innerText()).includes('SECRET_DATABASE_DETAIL'));
 await page.screenshot({path:path.join(output,'rewards-unconfirmed.png'),fullPage:true});assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(output,'token-zone-board-results.json'),JSON.stringify({passed:true,scope:'local browser with all APIs mocked; no real enrollment or tracking',checks:['server opening date in badge and chart','unavailable is not zero or draft','changed identity cannot reuse entry','401 and anonymous bearer clear personal status','late read discarded','double entry sends once','late entry identity discarded','friendly errors only'],posts,errors},null,2));
 console.log('PASS token rewards board: server dates, unavailable status, request/identity races, duplicate entry and safe errors. '+output);
}finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
