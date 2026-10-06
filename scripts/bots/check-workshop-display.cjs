// Isolated browser verification. Reads local assets; no sessions or database writes.
require('./personal-native-path.cjs');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.MK_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'../../public'),output='D:/Temp/modelkombat-display-check-20261006';
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/check'){res.writeHead(200,{'content-type':'text/html'});res.end('<html><body style="margin:0;background:#243433"><iframe title="Robot" style="border:0;width:100vw;height:100vh" src="/bots-display/v2/index.html?channel=display-check"></iframe><script>window.messages=[];addEventListener("message",e=>messages.push(e.data));</script></body></html>');return;}const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}const type={'.js':'application/javascript','.json':'application/json','.html':'text/html','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'content-type':type});fs.createReadStream(file).pipe(res)});
async function main(){await new Promise(r=>server.listen(0,'127.0.0.1',r));fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const page=await browser.newPage({viewport:{width:650,height:680}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 const began=Date.now();await page.goto(`http://127.0.0.1:${server.address().port}/check`);await page.waitForFunction(()=>messages.some(m=>m.type==='ready'));
 const slots=['head','torso','armL','armR','legL','legR','weapon'],choices=Object.fromEntries(slots.map(s=>[s,s==='weapon'?'kit1.hammer.t1':'bible2.tank.t1.warden']));
 const payload={room:'build',selected:'test',robots:[{id:'test',name:'Test',choices,repairUntil:0}]};
 const send=async(type='update')=>page.evaluate(({type,payload})=>document.querySelector('iframe').contentWindow.postMessage({channel:'display-check',type,payload},location.origin),{type,payload});
 await send('init');const frame=page.frames().find(f=>f.url().includes('/bots-display/'));await frame.waitForFunction(()=>document.querySelector('#game-model')?.dataset.ready==='true');
 const readyMs=Date.now()-began;assert.equal(await frame.locator('#game-model-status').isVisible(),false);await page.screenshot({path:path.join(output,'initial.png')});
 await page.route('**/speed-t1-duelist.glb',async r=>{await new Promise(resolve=>setTimeout(resolve,350));await r.continue()});
 choices.head='bible2.speed.t1.duelist';await send();choices.head='bible2.ranged.t1.tracker';await send();
 await frame.waitForFunction(()=>JSON.parse(document.querySelector('#game-model').dataset.equipment)[0].head==='bible2.ranged.t1.tracker');
 await page.waitForTimeout(500);assert.equal(await frame.evaluate(()=>JSON.parse(document.querySelector('#game-model').dataset.equipment)[0].head),'bible2.ranged.t1.tracker');
 const glbsBefore=requests.filter(x=>x.endsWith('.glb')).length;
 payload.robots[0].appearance={version:1,banner:false,parts:Object.fromEntries(slots.map(s=>[s,{primary:'#cb4234',secondary:'#d2c6a2',trim:'#697e84'}]))};await send();
 await page.waitForTimeout(150);assert.equal(requests.filter(x=>x.endsWith('.glb')).length,glbsBefore);await page.screenshot({path:path.join(output,'changed-and-painted.png')});
 let reject=true;await page.route('**/axe-t1.glb',r=>reject?r.abort():r.continue());
 const kit=JSON.parse(fs.readFileSync(path.join(root,'bots-playtest/assets/weapon-kits-1/manifest.json'))).entries.find(e=>e.id==='kit1.axe.t1');
 await page.route('**'+new URL(kit.url,'http://test').pathname,r=>reject?r.abort():r.continue());choices.weapon='kit1.axe.t1';await send();await frame.getByRole('button',{name:/Retry Test preview/}).waitFor();
 assert.equal(await frame.evaluate(()=>JSON.parse(document.querySelector('#game-model').dataset.equipment)[0].weapon),'kit1.hammer.t1');reject=false;await frame.getByRole('button',{name:/Retry Test preview/}).click();await frame.waitForFunction(()=>JSON.parse(document.querySelector('#game-model').dataset.equipment)[0].weapon==='kit1.axe.t1');
 for(let i=0;i<8;i++){choices.weapon=i%2?'kit1.hammer.t1':'kit1.axe.t1';await send();await frame.waitForFunction(expected=>JSON.parse(document.querySelector('#game-model').dataset.equipment)[0].weapon===expected,choices.weapon)}
 assert.equal(await frame.evaluate(()=>performance.getEntriesByType('navigation').length),1);assert.deepEqual(errors,[]);
 const result={checks:['initial display','rapid equipment updates keep latest selection','paint does not refetch GLBs','failed asset retains previous model','in-place retry','repeated swaps without navigation'],initialReadyMs:readyMs,glbRequests:requests.filter(x=>x.endsWith('.glb')).length,errors};fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();server.close()}}
main().catch(e=>{console.error(e);server.close();process.exitCode=1});
