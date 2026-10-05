// Local-only integration checks; uses a fresh browser profile and no wallet.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.MK_PLAYWRIGHT || 'playwright');
async function main(){
 const origin=process.env.MK_TEST_ORIGIN||'http://localhost:3162';if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))throw Error('Local test origin required');
 const output=path.resolve('.bots-preview/workshop-browser-check');fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/bots/workshop',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Build my robot',exact:true}).click();
 await page.getByRole('button',{name:/Tank starter robot/}).click();
 for(const label of ['Head','Left arm','Right arm','Left leg','Right leg','Weapon']){
  await page.getByRole('button',{name:label,exact:true}).click();
  await page.locator('[data-testid="item-grid"] article>button').first().click();
 }
 await page.getByRole('button',{name:'Review robot',exact:false}).click();
 await page.getByRole('textbox',{name:'Robot name',exact:true}).fill('Workshop test');
 await page.screenshot({path:path.join(output,'builder.png')});

 await page.getByRole('button',{name:'Finish robot',exact:true}).click();
 await page.getByRole('heading',{name:'Workshop test',exact:true}).waitFor();
 await page.frameLocator('iframe').locator('#game-model[data-ready=true]').waitFor({state:'visible',timeout:90000});
 await page.screenshot({path:path.join(output,'garage.png')});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'garage-phone.png')});await page.setViewportSize({width:1280,height:720});
 await page.getByRole('button',{name:'Shop',exact:true}).click();
 await page.locator('[data-testid="item-grid"]>button').first().waitFor();
 assert.ok(await page.locator('[data-testid="item-grid"]>button').count()>0);
 await page.screenshot({path:path.join(output,'shop-desktop.png')});
 await page.locator('[data-testid="item-grid"]>button').first().click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'shop-phone.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.setViewportSize({width:1280,height:720});
 await page.getByRole('button',{name:'Fight',exact:true}).click();await page.getByRole('button',{name:'Start a house fight'}).click();
 const frame=page.frameLocator('iframe');await frame.getByRole('button',{name:'Start practice',exact:true}).click({timeout:90000});
 await page.screenshot({path:path.join(output,'fight.png')});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'fight-phone.png')});await page.setViewportSize({width:1280,height:720});
 // Advance the real deterministic simulator in bounded batches on software WebGL.
 // This is an integration check, not a desktop FPS measurement.
 let simulation=page.frames().find(f=>f.url().includes('view=practice'));
 await simulation.evaluate(()=>window.practice8.step(600));
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('mk8.connected-workshop.v1')).active?.ticks>=600);
 const checkpoint=await page.evaluate(()=>JSON.parse(localStorage.getItem('mk8.connected-workshop.v1')).active.ticks);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.frameLocator('iframe').getByRole('button',{name:'Continue',exact:true}).waitFor({timeout:90000});
 simulation=page.frames().find(f=>f.url().includes('view=practice'));
 assert.equal(await simulation.evaluate(()=>window.practice8.engine.tick),checkpoint);
 for(let batch=0;batch<65;batch++){const done=await simulation.evaluate(()=>{window.practice8.step(120);return window.practice8.engine.done});if(done)break;}
 const firstResult=await simulation.evaluate(()=>window.practice8.engine.snapshot());
 await page.getByRole('button',{name:'Next fight',exact:false}).waitFor({timeout:210000});
 await page.screenshot({path:path.join(output,'result.png')});
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('mk8.connected-workshop.v1')));
 assert.equal(save.history.length,1);assert.equal(save.coins,75);assert.equal(save.robots[0].name,'Workshop test');
 assert.deepEqual(save.history[0].choices,save.robots[0].choices);
 await page.getByRole('button',{name:'Progress',exact:true}).click();await page.getByRole('button',{name:/Watch replay/}).click();
 await frame.getByRole('button',{name:'Start practice',exact:true}).click({timeout:90000});
 const replayFrame=page.frames().find(f=>f.url().includes('view=practice'));
 for(let batch=0;batch<65;batch++){const done=await replayFrame.evaluate(()=>{window.practice8.step(120);return window.practice8.engine.done});if(done)break;}
 const replayResult=await replayFrame.evaluate(()=>window.practice8.engine.snapshot());assert.equal(replayResult.winner,firstResult.winner);assert.equal(replayResult.tick,firstResult.tick);assert.deepEqual(replayResult.events,firstResult.events);
 await frame.getByRole('button',{name:'Fight complete',exact:true}).waitFor({timeout:15000});
 const finalSave=await page.evaluate(()=>JSON.parse(localStorage.getItem('mk8.connected-workshop.v1')));assert.equal(finalSave.coins,75);
 await page.getByRole('button',{name:'Shop',exact:true}).click();await page.locator('[data-testid=item-grid]>button').first().click();await page.getByRole('button',{name:/Buy for/}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 const bought=await page.evaluate(()=>JSON.parse(localStorage.getItem('mk8.connected-workshop.v1')));assert.equal(bought.spares.length,1);assert.ok(bought.coins<75);
 await page.getByRole('button',{name:'Community',exact:true}).click();await page.getByRole('heading',{name:'Meet the neighbourhood.'}).waitFor();await page.screenshot({path:path.join(output,'community.png')});
 await page.setViewportSize({width:844,height:390});await page.getByRole('button',{name:'Shop',exact:true}).click();await page.screenshot({path:path.join(output,'shop-landscape.png')});
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({completed:true,errors,history:save.history.map(f=>({id:f.id,winner:f.winner,ticks:f.ticks,coins:f.coins})),viewport:'1280x720 and 390x844; emulated, not physical phone'},null,2));
 assert.deepEqual(errors,[]);console.log('Build, garage, shop, resumed fight, one reward, identical replay and purchase passed.');
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
