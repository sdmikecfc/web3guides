// Capture the existing, approved renderer. No new model or generated artwork.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.MK_PLAYWRIGHT||'playwright');
async function main(){const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const page=await browser.newPage({viewport:{width:600,height:650},deviceScaleFactor:1});
 const slots=['head','torso','armL','armR','legL','legR','weapon'];
 const styles=[['tank','warden','hammer',{primary:'#126c70',secondary:'#eee4ca',trim:'#bf934c'}],['speed','duelist','sword_shield',{primary:'#254fba',secondary:'#eee8d9',trim:'#c78052'}],['ranged','tracker','rifle',{primary:'#68754a',secondary:'#ccb88c',trim:'#dcaa45'}]];
 const output=path.resolve('public/bots-playtest/intro');fs.mkdirSync(output,{recursive:true});
 for(const [style,family,kit,paint] of styles){
  await page.goto('http://localhost:3162/bots-playtest/index.html?view=parts',{waitUntil:'domcontentloaded'});
  const payload={robots:[{id:'intro-'+style,choices:Object.fromEntries(slots.map(s=>[s,s==='weapon'?`kit1.${kit}.t3`:`bible2.${style}.t3.${family}`])),appearance:{version:1,parts:Object.fromEntries(slots.map(s=>[s,paint])),banner:false}}]};
  await page.evaluate(payload=>{document.body.innerHTML='';document.documentElement.style.cssText='background:transparent;color-scheme:light';document.body.style.cssText='margin:0;background:transparent';const frame=document.createElement('iframe');frame.style.cssText='border:0;width:600px;height:650px;display:block;color-scheme:light';window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===frame.contentWindow&&event.data?.type==='ready')frame.contentWindow.postMessage({channel:'intro-capture',type:'init',payload},location.origin)});frame.src='/bots-playtest/index.html?view=display&embedded=1&channel=intro-capture';document.body.append(frame)},payload);
  const canvas=page.frameLocator('iframe').locator('#game-model[data-ready=true]');await canvas.waitFor({timeout:120000});await canvas.screenshot({path:path.join(output,style+'.png'),omitBackground:true});console.log('Captured approved '+style+' model.');
 }
 }finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
