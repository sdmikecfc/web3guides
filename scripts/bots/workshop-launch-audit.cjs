// Disposable browser profile. Public API reads only; never deploys or uses a wallet.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/Mike/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=path.resolve(process.env.MK_AUDIT_OUTPUT||path.join(require('node:os').tmpdir(),'modelkombat-launch-review'));fs.mkdirSync(output,{recursive:true});
async function main(){
 const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const report={date:new Date().toISOString(),device:'Headless Chromium / software WebGL. Viewport emulation, not physical-phone performance.',errors:[],rooms:[],publicReads:[]};
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',e=>report.errors.push(e.message));
  const fixture=JSON.parse(fs.readFileSync('.bots-preview/workshop-check/fixture.json','utf8'));
  await page.addInitScript(save=>{localStorage.setItem('mk8.connected-workshop.v1',JSON.stringify(save));localStorage.setItem('mk8.welcome.2','seen')},fixture);
  await page.goto('http://localhost:3162/bots/workshop',{waitUntil:'domcontentloaded',timeout:120000});
  for(const room of ['Garage','Shop','Build','Fight','Community','Progress']){
   await page.getByRole('button',{name:room,exact:true}).click();
   if(room==='Garage'||room==='Fight')await page.frameLocator('iframe').locator('#game-model[data-ready=true]').waitFor({timeout:120000});
   if(room==='Community')await page.locator('[data-room-pending="0"][data-room-ready="true"]').waitFor({timeout:90000}).catch(()=>{});
   for(const [label,width,height] of [['desktop',1280,720],['phone',390,844],['landscape',844,390]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(500);
    await page.screenshot({path:path.join(output,`${room.toLowerCase()}-${label}.png`)});
    report.rooms.push(await page.evaluate(({room,label})=>({room,viewport:label,heading:document.querySelector('main h1')?.textContent,documentOverflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,navVisible:document.querySelector('nav[aria-label="Game rooms"]').getBoundingClientRect().bottom<=innerHeight,scrollAreas:[...document.querySelectorAll('main *')].filter(e=>getComputedStyle(e).overflowY==='auto'&&e.scrollHeight>e.clientHeight+4).map(e=>({class:e.className,height:e.clientHeight,content:e.scrollHeight})),status:[...document.querySelectorAll('[role=status]')].map(e=>e.textContent)}),{room,label}));
   }
   await page.setViewportSize({width:1280,height:720});
  }
  // Failure state must preserve usable practice activity and the room navigation.
  await page.route('**/api/bots/battles',r=>r.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'}));
  await page.getByRole('button',{name:'Garage',exact:true}).click();await page.getByRole('button',{name:'Community',exact:true}).click();
  await page.getByRole('button',{name:'Try again',exact:true}).waitFor({timeout:20000});
  report.communityFailure={retry:true,practice:await page.getByRole('button',{name:/Watch a practice fight/}).count(),nav:await page.getByRole('navigation',{name:'Game rooms'}).isVisible()};
  await page.screenshot({path:path.join(output,'community-failure.png')});
  // Confirm transparent preview corners; visible surfaces come from CSS now.
  report.preview=await page.evaluate(async()=>{const i=new Image();i.src='/bots-playtest/part-previews-studio-v2/bible2.ranged.t1.specter.head.png';await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return {width:i.width,height:i.height,cornerAlpha:x.getImageData(0,0,1,1).data[3]}});
  for(const route of ['/','/bots/workshop','/api/bots/battles','/bots-playtest/release.json']){
   try{const response=await fetch('https://www.modelkombat.xyz'+route,{signal:AbortSignal.timeout(20000)});const item={route,status:response.status,url:response.url};if(route==='/api/bots/battles'){const data=await response.json();item.ok=data.ok;item.recentCount=data.recent?.length??null;}if(route.endsWith('release.json'))item.release=await response.json();report.publicReads.push(item)}catch(e){report.publicReads.push({route,error:e.message})}
  }
  fs.writeFileSync(path.join(output,'audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});

