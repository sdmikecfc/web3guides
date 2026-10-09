'use strict';
// Local rendered UI fixtures only. Never reads or changes a real account.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.MK_PLAYWRIGHT||'playwright');
const origin=process.env.MK_TEST_ORIGIN||'http://127.0.0.1:3210',out='D:/Temp/modelkombat-roi-release-20261007/browser';
if(!/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin))throw Error('LOCAL_ONLY');
const data={schemaVersion:1,rules:'mk-token-zones-1',available:true,state:'active',startsAt:'2026-10-06T14:00:00Z',endsAt:'2026-11-03T14:00:00Z',confirmedThrough:'2026-10-07T10:00:00Z',fresh:true,complete:true,issues:[],volumeUsd:'5000',history:[{day:0,volumeUsd:'0'},{day:1,volumeUsd:'5000'}],assets:[],personal:null,financials:{verified:2,total:4,complete:false,confirmedThrough:'2026-10-07T10:00:00Z'},standings:{volume:[],roi:[{id:'fixture1',name:'Trader EXAMPLE',rank:1,score:'12.5',qualified:false}],profit:[{id:'fixture2',name:'Trader SAMPLE',rank:1,score:null,qualified:false}],battles:[]}};
async function main(){fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let pending=false,partial=false;
 await page.route('**/api/**',route=>new URL(route.request().url()).pathname==='/api/bots/campaign/zones'?route.fulfill({json:pending?{...data,financials:{...data.financials,verified:null,total:null},standings:{volume:[],roi:[],profit:[],battles:[]}}:partial?{...data,complete:false,tracking:{verified:1,total:2,partial:true},financials:{...data.financials,verified:1,total:null},personal:{id:'fixture-affected',connected:true,linkStatus:'linked',entered:true,syncStatus:'review',financialStatus:'syncing',weeks:[null,null,null,null],qualified:null,volumeUsd:null,attemptsRemaining:12,awards:[],challenges:[],ranks:{volume:null,roi:null,profit:null,battles:null}}}:data}):new URL(route.request().url()).pathname==='/api/bots/campaign/zones/register'?route.fulfill({json:{ok:true}}):route.fulfill({status:503,json:{error:'Local fixture'}}));
 for(const[width,height]of [[1280,720],[390,844],[844,390]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/bots/leaderboard',{waitUntil:'networkidle'});
  const leaders=page.getByRole('region',{name:'Verified trading results'});await leaders.waitFor();
  const text=await leaders.innerText();assert.match(text,/\+12\.50%/);assert.match(text,/Trader SAMPLE/);assert.match(text,/2 of 4 trading accounts verified/);assert.match(text,/provisional/);assert.doesNotMatch(text,/\$|NaN|undefined/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  await leaders.screenshot({path:path.join(out,`roi-fixture-${width}x${height}.png`)});
 }
 partial=true;await page.evaluate(()=>sessionStorage.setItem('mk8.wallet-session.v1',JSON.stringify({token:'local-fixture-only',address:'0x0000000000000000000000000000000000000001'})));
 for(const[width,height]of [[1280,720],[390,844],[844,390]]){
  await page.setViewportSize({width,height});await page.reload({waitUntil:'networkidle'});
  const leaders=page.getByRole('region',{name:'Verified trading results'}),text=await leaders.innerText();assert.match(text,/\+12\.50%/);assert.match(text,/1 trading account verified so far/);
  await page.getByRole('link',{name:'Contact @sdmike on Discord →'}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'partial page has no horizontal overflow');
  await page.screenshot({path:path.join(out,`roi-partial-${width}x${height}.png`)});
 }
 partial=false;await page.evaluate(()=>sessionStorage.removeItem('mk8.wallet-session.v1'));
 pending=true;await page.reload({waitUntil:'networkidle'});const text=await page.getByRole('region',{name:'Verified trading results'}).innerText();assert.match(text,/Calculating returns/);assert.doesNotMatch(text,/#1|0\.00%/);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,fixture:true,productionWrites:0,physicalPhone:false,sizes:[[1280,720],[390,844],[844,390]],errors},null,2));console.log('PASS local browser: ROI percentage, private-profit rank, provisional coverage, pending-not-zero, isolated-account support, desktop/portrait/landscape and no horizontal overflow. Fixture numbers only; no physical phone tested.');
 }finally{await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1});
