/**
 * Read-only local fixture for workshop-wallet-dialog-browser-check.cjs.
 * Uses the real installed RainbowKit, Wagmi and project components; no UI stubs.
 *
 * Start: node scripts/bots/workshop-wallet-dialog-fixture.cjs
 * Then in another terminal, set MK_PLAYWRIGHT to the installed Playwright module
 * if it is not on NODE_PATH, and run workshop-wallet-dialog-browser-check.cjs.
 * The browser check intercepts all API and external requests.
 * Optional MK_WALLET_FIXTURE_DEPS / MK_WALLET_FIXTURE_OUTPUT / MK_WALLET_FIXTURE_PORT
 * select an existing dependency directory, a D: output directory, and local port.
 */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const deps=path.resolve(process.env.MK_WALLET_FIXTURE_DEPS||'D:/Temp/modelkombat-tracking-deps-20261002/node_modules');
const out=path.resolve(process.env.MK_WALLET_FIXTURE_OUTPUT||'D:/Temp/modelkombat-wallet-dialog-fixture');
const port=Number(process.env.MK_WALLET_FIXTURE_PORT||3223);
if(!/^D:[/\\]/i.test(out)||!/^D:[/\\]/i.test(deps))throw Error('Generated fixture and existing dependencies must be on D:');
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local fixture port');
const sourceFiles=[
 'src/app/bots/_game/EntryDialog.tsx',
 'src/app/bots/_game/WorkshopWalletConnect.tsx',
 'src/app/bots/_game/ModelKombatWalletProviders.tsx',
 'src/app/bots/_game/useWalletDialogHandoff.ts',
 'src/app/bots/_game/entry.module.css',
 'src/lib/bots/workshop8/wallet-sign-in.ts',
];
const hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const entry=`import React,{useState}from'react';
import{createRoot}from'react-dom/client';
import EntryDialog from ${JSON.stringify(path.join(root,'src/app/bots/_game/EntryDialog').replaceAll('\\','/'))};
import Wallet from ${JSON.stringify(path.join(root,'src/app/bots/_game/WorkshopWalletConnect').replaceAll('\\','/'))};
function App(){
 const[open,setOpen]=useState(false),[outer,setOuter]=useState(false),[inline,setInline]=useState(false),[wallet,setWallet]=useState(true),[connected,setConnected]=useState(false);
 const dialog=<EntryDialog title='Connect your Doma wallet' onClose={()=>setOpen(false)}>{wallet?<Wallet onConnected={()=>setConnected(true)}/>:<p>Wallet child replaced</p>}</EntryDialog>;
 return <main><h1>Real wallet-dialog regression fixture</h1>
  <button onClick={()=>{setWallet(true);setOpen(true)}}>Open wallet dialog</button>
  <button onClick={()=>setOuter(true)}>Open nested dialogs</button>
  <button onClick={()=>setInline(v=>!v)}>Toggle inline wallet</button>
  <button onClick={()=>setWallet(false)}>Fixture replace wallet child</button>
  <button onClick={()=>{setOpen(false);setOuter(false)}}>Fixture remove parents</button>
  {connected&&<p role='status'>Fixture connected callback</p>}
  {outer?<EntryDialog title='Rewards fixture' onClose={()=>setOuter(false)}><button onClick={()=>{setWallet(true);setOpen(true)}}>Connect from rewards</button>{open&&dialog}</EntryDialog>:open&&dialog}
  {inline&&<section aria-label='Inline wallet'><Wallet onConnected={()=>setConnected(true)}/></section>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
`;
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Real wallet fixture</title><style>body{margin:0;background:#112321;color:#fff;font-family:Arial,sans-serif}main{padding:20px}main>button{padding:14px;margin:8px}h1{font-size:24px}</style></head><body><div id="root"></div><script src="/harness.js"></script></body></html>';
async function main(){
 const before=hashes();fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'entry.tsx'),entry);
 fs.writeFileSync(path.join(out,'ts-loader.cjs'),`const ts=require(${JSON.stringify(path.join(deps,'typescript'))});module.exports=function(source){return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};`);
 fs.writeFileSync(path.join(out,'css-loader.cjs'),String.raw`module.exports=function(source){const classes={};for(const m of source.matchAll(/\.([A-Za-z_][\w-]*)/g))classes[m[1]]=m[1];return 'const el=document.createElement("style");el.textContent='+JSON.stringify(source)+';document.head.appendChild(el);export default '+JSON.stringify(classes)+';';};`);
 const wp=require(path.join(deps,'next/dist/compiled/webpack/webpack'));wp.init();
 await new Promise((resolve,reject)=>{
  const compiler=wp.webpack({mode:'production',optimization:{minimize:false},devtool:false,target:'web',entry:path.join(out,'entry.tsx'),output:{path:out,filename:'harness.js',publicPath:'/'},resolve:{extensions:['.tsx','.ts','.js','.json'],modules:['node_modules',deps],alias:{'@':path.join(root,'src'),'react':path.join(deps,'react'),'react-dom':path.join(deps,'react-dom'),'@react-native-async-storage/async-storage$':false}},plugins:[new wp.webpack.DefinePlugin({'process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID':'undefined'})],module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(out,'ts-loader.cjs')},{test:/\.css$/,sideEffects:true,use:path.join(out,'css-loader.cjs')}]}});
  compiler.run((error,stats)=>compiler.close(close=>error||close||stats.hasErrors()?reject(error||close||Error(stats.toString({all:false,errors:true}))):resolve()));
 });
 if(JSON.stringify(before)!==JSON.stringify(hashes()))throw Error('Source changed during fixture compilation; rebuild before testing');
 fs.writeFileSync(path.join(out,'build-proof.json'),JSON.stringify({hashes:before,builtAt:new Date().toISOString(),port,testOnly:true,walletUiStubbed:false,realApiAccess:false,dependencies:deps},null,2));
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');let url;try{url=new URL(req.url,'http://127.0.0.1:'+port)}catch{res.writeHead(400);return res.end('Invalid request')}
  if(req.method!=='GET'){res.writeHead(405);return res.end('No writes from fixture server')}
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html)}
  const icon=url.pathname.startsWith('/wallet-icons/');
  if(!icon&&url.pathname!=='/build-proof.json'&&!/^\/[\w-]+\.js$/.test(url.pathname)){res.writeHead(404);return res.end('Outside local fixture')}
  const base=icon?path.join(root,'public'):out;let file;try{file=path.resolve(base,'.'+decodeURIComponent(url.pathname))}catch{res.writeHead(400);return res.end('Invalid path')}
  if(!file.startsWith(path.resolve(base)+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Missing fixture asset')}
  res.setHeader('Content-Type',({'.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 });
 server.on('error',error=>{console.error(error.message);process.exitCode=1});
 server.listen(port,'127.0.0.1',()=>console.log('READY real wallet fixture http://127.0.0.1:'+port+'; proof '+path.join(out,'build-proof.json')));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1});
