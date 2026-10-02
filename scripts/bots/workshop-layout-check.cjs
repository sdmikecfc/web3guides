// Fresh disposable browser saves only. No wallet or server transactions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.MK_PLAYWRIGHT||'C:/Users/Mike/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=path.resolve('.bots-preview/workshop-layout-check'+(process.env.MK_TEST_STYLE?'-'+process.env.MK_TEST_STYLE.toLowerCase():''));fs.mkdirSync(output,{recursive:true});
async function main(){
 const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const origin=process.env.MK_TEST_ORIGIN||'http://localhost:3162';
 await page.goto(origin+'/bots/workshop',{waitUntil:'domcontentloaded',timeout:90000});
 await page.getByRole('button',{name:'Build my robot',exact:true}).click();
 const sizes=[['desktop',1280,720],['tablet',928,930],['phone',390,844],['landscape',844,390]];
 async function capture(name,cards=false){
  await page.waitForTimeout(400);
  await page.locator('[data-testid=item-grid] img').evaluateAll(nodes=>Promise.all(nodes.map(i=>i.decode())));
  if(await page.locator('iframe').count())await page.frameLocator('iframe').locator('#game-model[data-ready=true]').waitFor({timeout:90000});
  await page.screenshot({path:path.join(output,name+'.png')});
  const bounds=await page.evaluate(()=>({width:innerWidth,height:innerHeight,docWidth:document.documentElement.scrollWidth,docHeight:document.documentElement.scrollHeight,nav:document.querySelector('nav[aria-label="Game rooms"]')?.getBoundingClientRect().toJSON()}));
  assert.ok(bounds.nav&&bounds.nav.bottom<=bounds.height&&bounds.nav.top>=0);assert.ok(bounds.docWidth<=bounds.width&&bounds.docHeight<=bounds.height,`${name}: page overflow`);
  if(cards){const bad=await page.locator('[data-testid=item-grid]> *').evaluateAll(nodes=>nodes.flatMap(n=>{const r=n.getBoundingClientRect();const bad=[...n.querySelectorAll('img,strong,small,span,button')].some(c=>{const b=c.getBoundingClientRect();return b.width>0&&b.height>0&&(b.bottom>r.bottom+2||b.right>r.right+2||b.top<r.top-2)});return bad?[n.textContent]:[]}));assert.deepEqual(bad,[],`${name}: clipped cards`);}
 }
 for(const [name,width,height] of sizes){await page.setViewportSize({width,height});await capture('style-'+name);}
 await page.getByRole('button',{name:(process.env.MK_TEST_STYLE||'Tank')+' starter robot',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'Robot name',exact:true}).count(),0);
 for(const [name,width,height] of sizes){await page.setViewportSize({width,height});await capture('parts-'+name,true);}
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'See robot',exact:true}).click();await capture('parts-phone-preview');await page.getByRole('button',{name:'Back to parts',exact:true}).click();
 await page.setViewportSize({width:1280,height:720});
 const selected={};
 for(const label of ['Head','Left arm','Right arm','Left leg','Right leg','Weapon']){
  await page.getByRole('button',{name:label,exact:true}).click();
  await page.locator('[data-testid=item-grid] article>button').first().click();
 }
 await page.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('mk8.connected-workshop.v1')).draft.choices).length===7);
 const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('mk8.connected-workshop.v1')).draft);
 assert.equal(Object.keys(draft.choices).length,7);
 await page.getByRole('button',{name:'Review robot',exact:false}).click();
 await page.getByRole('textbox',{name:'Robot name',exact:true}).fill('Window fighter');
 for(const [name,width,height] of sizes){await page.setViewportSize({width,height});await capture('review-'+name);}
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Review robot',exact:false}).click();
 assert.equal(await page.getByRole('textbox',{name:'Robot name',exact:true}).inputValue(),'Window fighter');
 await page.getByRole('button',{name:'Finish robot',exact:true}).click();await page.getByRole('heading',{name:'Window fighter',exact:true}).waitFor();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('mk8.connected-workshop.v1')));
 assert.equal(saved.coins,0);assert.deepEqual(saved.robots[0].choices,draft.choices);
 await page.getByRole('button',{name:'Shop',exact:true}).click();
 for(const [name,width,height] of sizes){await page.setViewportSize({width,height});await capture('shop-'+name,true);}
 await page.setViewportSize({width:390,height:844});
 await page.getByLabel('Browse every design').check();
 const first=await page.locator('[data-testid=item-grid]').innerText();await page.getByRole('button',{name:'Next items',exact:true}).click();
 assert.notEqual(await page.locator('[data-testid=item-grid]').innerText(),first);
 const second=await page.locator('[data-testid=item-grid]').innerText();await page.locator('[data-testid=item-grid]>button').first().click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Close dialog',exact:true}).click();assert.equal(await page.locator('[data-testid=item-grid]').innerText(),second);
 await page.getByLabel('Shop style',{exact:true}).selectOption('speed');await page.waitForTimeout(150);assert.equal(await page.getByRole('button',{name:'Previous items',exact:true}).isDisabled(),true);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:true,sizes,checks:['three separate steps','complete card bounds','phone robot preview','seven editable choices','resume and finish preserve selections','shop pagination and filter reset','popup preserves page'],errors},null,2));await browser.close();console.log('Workshop layout and build flow passed.');
}
main().catch(e=>{console.error(e);process.exit(1)});






