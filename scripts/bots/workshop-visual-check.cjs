const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.MK_PLAYWRIGHT||'playwright');
async function main(){
 const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{const page=await browser.newPage({viewport:{width:1280,height:720}});
 const save=JSON.parse(fs.readFileSync('.bots-preview/workshop-check/fixture.json','utf8'));
 await page.addInitScript(save=>{localStorage.setItem('mk8.connected-workshop.v1',JSON.stringify(save));localStorage.setItem('mk8.welcome.2','seen')},save);
 await page.goto('http://localhost:3162/bots/workshop');
 await page.frameLocator('iframe').locator('#game-model[data-ready=true]').waitFor({timeout:90000});
 const frame=page.frames().find(f=>f.url().includes('view=display'));
 console.log(await page.locator('iframe').evaluate(e=>({scheme:getComputedStyle(e).colorScheme,background:getComputedStyle(e).background,parent:getComputedStyle(e.parentElement).background})));console.log(await frame.evaluate(()=>({gl:document.querySelector('canvas').getContext('webgl2').getContextAttributes(),clear:[...document.querySelector('canvas').getContext('webgl2').getParameter(3106)],html:getComputedStyle(document.documentElement).background,scheme:getComputedStyle(document.documentElement).colorScheme,body:getComputedStyle(document.body).background,canvas:getComputedStyle(document.querySelector('canvas')).background,studio:getComputedStyle(document.querySelector('.studio')).background})));
 await page.screenshot({path:'.bots-preview/workshop-browser-check/garage-ready.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.bots-preview/workshop-browser-check/garage-ready-phone.png'});
 await page.setViewportSize({width:1280,height:720});await page.getByRole('button',{name:'Name & paint'}).click();
 await page.getByRole('dialog').locator('iframe').waitFor();await page.getByRole('dialog').frameLocator('iframe').locator('#game-model[data-ready=true]').waitFor({timeout:90000});
 await page.getByRole('button',{name:'harrow',exact:true}).click();await page.screenshot({path:'.bots-preview/workshop-browser-check/paint-ready.png'});
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Community',exact:true}).click();await page.locator('[data-room-pending="0"][data-room-ready="true"]').waitFor({timeout:90000});await page.screenshot({path:'.bots-preview/workshop-browser-check/community-ready.png'});
 console.log('Garage, paint and Community views captured.');
 }finally{await browser.close()}
}main().catch(e=>{console.error(e);process.exitCode=1});
