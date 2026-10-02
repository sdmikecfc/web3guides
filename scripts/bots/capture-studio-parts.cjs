// Re-render existing GLBs with the approved browser renderer. No image editing,
// model changes, provider calls, or mutation of historical thumbnails.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('C:/Users/Mike/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve('public/bots-playtest'),output=path.join(root,'part-previews-studio-v2');
const sourceHashes=new Map();
const hash=file=>{if(file.endsWith('.glb')&&sourceHashes.has(file))return sourceHashes.get(file);const value=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');if(file.endsWith('.glb'))sourceHashes.set(file,value);return value};
async function main(){
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const receipt={method:'Existing GLB parts isolated and rendered by partsStudio.capture',background:'transparent',size:480,sourceRenderer:[],assets:[]};
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.route('**/bots-playtest/*.js',async route=>{
   const response=await route.fetch();let body=await response.text();
   if(body.includes('partsStudio=')){
    if(!body.includes('"#242723"'))throw Error('Capture background definition changed');
    receipt.sourceRenderer.push({url:new URL(route.request().url()).pathname,sha256:crypto.createHash('sha256').update(body).digest('hex')});
    // Capture-only background and framing; the shipped renderer is unchanged.
    body=body.replace('preserveDrawingBuffer:!0','preserveDrawingBuffer:!0,alpha:!0').replace(/U.background=new r.Ilk\("#242723"\)/,'U.background=null').replaceAll('1.22:1.27','1.06:1.27');
    // An arm's grip contains the attached kit. Exclude that child from arm
    // thumbnails so the preview shows the item being bought, not its weapon.
    const visibility='D.model.traverse((e=>{e.isMesh&&(e.visible=t.has(e))}))';
    if(!body.includes(visibility))throw Error('Capture isolation definition changed');
    body=body.replace(visibility,'if("weapon"!==F)for(const a of D.installed.weapon??[])a.traverse((e=>t.delete(e)));'+visibility);
   }
   await route.fulfill({response,body});
  });
  await page.goto('http://localhost:3162/bots-playtest/index.html?view=parts',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.partsStudio?.ready,{},{timeout:120000});
  const {entries,kits}=await page.evaluate(()=>({entries:window.partsStudio.entries,kits:window.partsStudio.kits}));
  async function capture(entry,slot){
   const data=await page.evaluate(slot=>{const studio=window.partsStudio;studio.selectSlot(slot);studio.isolate(true);return studio.capture(480)},slot);
   const file=entry.id+'.'+slot+'.png';fs.writeFileSync(path.join(output,file),Buffer.from(data.split(',')[1],'base64'));
   receipt.assets.push({file,sha256:hash(path.join(output,file)),source:entry.url,sourceSha256:hash(path.join('public',entry.url))});
  }
  let count=0;async function reset(){if(count++%8===0){await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.partsStudio?.ready,{},{timeout:120000});}}
  for(const entry of entries){await reset();await page.evaluate(id=>window.partsStudio.preset(id),entry.id);for(const slot of entry.slots.filter(slot=>slot!=="weapon"))await capture(entry,slot);console.log('Rendered '+entry.id)}
  for(const entry of kits){await reset();await page.evaluate(id=>window.partsStudio.change('weapon',id),entry.id);await capture(entry,'weapon');console.log('Rendered '+entry.id)}
  if(receipt.assets.length!==264)throw Error('Expected 264 previews, got '+receipt.assets.length);
  fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2));
  console.log('264 transparent previews saved; original thumbnails and GLBs unchanged.');
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});

