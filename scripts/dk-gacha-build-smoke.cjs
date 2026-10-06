/** Smoke-test an already-built D: workspace; never starts a production deployment. */
const {spawn}=require('node:child_process');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'D:/Temp/domain-kitchen-packs-build-20261005');
if(!/^D:[\\/]/i.test(root))throw Error('Use an isolated build on D:');
const port=Number(process.env.DK_GACHA_SMOKE_PORT||4314);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local port');
const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-p',String(port),'-H','127.0.0.1'],{
 cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],
 env:{...process.env,NODE_ENV:'production',TEMP:'D:/Temp',TMP:'D:/Temp',DK_PREVIEW_DIST:'.next-gacha-20261005',DINER_GACHA_REVIEW_ENABLED:'true',DINER_PACKS_RELEASE:'true',NEXT_TELEMETRY_DISABLED:'1'},
});
let startup='',exit;
child.stdout.on('data',data=>{startup=(startup+String(data)).slice(-4000);});
child.stderr.on('data',data=>{startup=(startup+String(data)).slice(-4000);});
child.on('exit',code=>{exit=code;});
async function main(){
 try{
  for(let i=0;i<60&&!startup.includes('Ready in');i++){if(exit!==undefined)throw Error('Local server exited before readiness');await new Promise(resolve=>setTimeout(resolve,500));}
  if(!startup.includes('Ready in'))throw Error('Local server readiness timed out');
  for(const view of ['leaderboard','round','pull','verification','collection','assets']){
   const response=await fetch(`http://127.0.0.1:${port}/api/chef/gacha/gochujang?view=${view}&id=1`,{signal:AbortSignal.timeout(10000)});
   assert.equal(response.status,404,view);assert.deepEqual(await response.json(),{error:'not_found'});
   assert.equal(response.headers.get('cache-control'),'no-store');
  }
  const claim=await fetch(`http://127.0.0.1:${port}/api/chef/gacha/gochujang/room`,{method:'POST',body:'{}',signal:AbortSignal.timeout(10000)});
  assert.equal(claim.status,404);assert.deepEqual(await claim.json(),{error:'not_found'});
  for(const method of ['GET','POST']){
   const result=await fetch(`http://127.0.0.1:${port}/api/chef/gacha/gochujang/equipment`,{method,...(method==='POST'?{body:'{}'}:{}),signal:AbortSignal.timeout(10000)});
   assert.equal(result.status,404);assert.deepEqual(await result.json(),{error:'not_found'});
  }
  for(const path of ['/chef/collection-review?domain=wines','/chef/collection-review?domain=wines&fixture=1','/chef/collection-review?domain=wines&fixture=1&equipment=1']){
   const result=await fetch(`http://127.0.0.1:${port}${path}`,{signal:AbortSignal.timeout(10000)});assert.equal(result.status,404,path);
  }
  const page=await fetch(`http://127.0.0.1:${port}/chef/diner-preview`,{signal:AbortSignal.timeout(10000)});
  assert.equal(page.status,200);assert((await page.text()).includes('</html>'));
  console.log('PASS built production app: six reads, room claim, equipment GET/POST and three collection review variants stay closed with flags set; diner page renders.');
 }finally{child.kill();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
