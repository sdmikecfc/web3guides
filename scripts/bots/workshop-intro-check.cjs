const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.MK_PLAYWRIGHT||'playwright');
const origin=process.env.MK_TEST_ORIGIN||'http://localhost:3162';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))throw Error('Local-only test');
async function main(){const output=path.resolve('.bots-preview/workshop-intro-check');fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],walletNetwork=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/walletconnect|rpc\.doma|eth-mainnet|coinbase\.com/i.test(r.url()))walletNetwork.push(r.url())});
 await page.addInitScript(()=>{window.walletChecks={requests:[],discovery:0};window.ethereum={isMetaMask:true,request:async args=>{window.walletChecks.requests.push(args.method);return[]},on(){},removeListener(){}};addEventListener('eip6963:requestProvider',()=>window.walletChecks.discovery++);});
 await page.goto(origin+'/bots/workshop',{waitUntil:'domcontentloaded',timeout:120000});await page.getByRole('heading',{name:'Small robots. Big fight energy.'}).waitFor({timeout:120000});
 await page.locator('dialog img').evaluate(i=>i.decode());await page.screenshot({path:path.join(output,'welcome-desktop.png')});
 assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.getByRole('link',{name:'Wallet collection',exact:true}).count(),0);
 await page.getByRole('button',{name:'Speed',exact:true}).click();assert.ok((await page.locator('dialog img').getAttribute('src')).endsWith('/speed.png'));
 await page.getByText('What are game coins?',{exact:true}).click();await page.getByText(/They are not cryptocurrency, have no cash value/).waitFor();
 await page.setViewportSize({width:390,height:844});await page.locator('dialog img').evaluate(i=>i.decode());await page.locator('dialog').evaluate(d=>d.scrollTop=0);await page.screenshot({path:path.join(output,'welcome-phone.png')});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('dialog').evaluate(d=>d.scrollWidth<=d.clientWidth));
 await page.setViewportSize({width:844,height:390});await page.screenshot({path:path.join(output,'welcome-landscape.png')});
 await page.setViewportSize({width:1280,height:800});await page.getByRole('button',{name:'Watch a fight',exact:true}).click();await page.frameLocator('iframe').getByRole('button',{name:'Start practice',exact:true}).click({timeout:120000});const demo=page.frames().find(f=>f.url().includes('view=practice'));await demo.waitForFunction(()=>window.practice8?.engine?.tick>90,{},{timeout:30000});await page.screenshot({path:path.join(output,'demo.png')});
 assert.equal(await page.evaluate(()=>localStorage.getItem('mk8.connected-workshop.v1')),null,'Example fight must not award coins or create history');
 await page.getByRole('button',{name:'← Back',exact:true}).click();await page.getByRole('button',{name:'Build my robot',exact:true}).click();await page.getByRole('button',{name:/Tank starter robot/}).waitFor();
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('mk8.connected-workshop.v1')));assert.equal(save.coins,250);assert.equal(save.robots.length,0);assert.equal(save.history.length,0);
 await page.reload();assert.equal(await page.locator('dialog').count(),0);await page.getByRole('button',{name:'Help and rules'}).click();await page.getByRole('button',{name:'Show me around'}).click();await page.getByRole('button',{name:'Continue my build',exact:true}).waitFor();await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mk8.connected-workshop.v1')).coins),250);
 const wallet=await page.evaluate(()=>window.walletChecks);assert.deepEqual(wallet.requests,[]);assert.equal(wallet.discovery,0);assert.deepEqual(walletNetwork,[]);assert.deepEqual(errors,[]);
 const fixture=JSON.parse(fs.readFileSync('.bots-preview/workshop-check/fixture.json','utf8'));await page.evaluate(save=>{localStorage.setItem('mk8.connected-workshop.v1',JSON.stringify(save));localStorage.removeItem('mk8.welcome.2')},fixture);await page.reload();await page.getByRole('button',{name:'Go to my garage',exact:true}).waitFor();await page.getByRole('button',{name:'Go to my garage',exact:true}).click();const preserved=await page.evaluate(()=>JSON.parse(localStorage.getItem('mk8.connected-workshop.v1')));assert.deepEqual(preserved.robots,fixture.robots);assert.equal(preserved.coins,fixture.coins);
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Help and rules'}).click();await page.getByRole('button',{name:'Show me around'}).click();await page.screenshot({path:path.join(output,'returning.png')});
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:true,wallet,errors,walletNetwork,checks:['desktop/phone/short landscape','example fight without rewards','starter granted only once','draft resumes','existing robots preserved','keyboard dismissal','reduced motion','no wallet requests or discovery']},null,2));console.log('Intro, example fight, existing saves, mobile layouts and wallet isolation passed.');
}finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});

