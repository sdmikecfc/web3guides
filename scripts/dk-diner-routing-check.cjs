/** Exercise actual middleware/page gates without a server, browser or credentials. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('../node_modules/typescript/lib/typescript.js');
const {NextRequest}=require('next/server');
const root=path.resolve(__dirname,'..');

function load(relative,env={},mocks={}){
  const filename=path.resolve(root,relative),module={exports:{}};
  const output=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const localRequire=id=>Object.prototype.hasOwnProperty.call(mocks,id)?mocks[id]:id.startsWith('@/')?load(`src/${id.slice(2)}.ts`,env,mocks):require(id);
  vm.runInNewContext(output,{module,exports:module.exports,require:localRequire,process:{env},console,URL,btoa:value=>Buffer.from(value).toString('base64')},{filename});
  return module.exports;
}
const {middleware,config}=load('src/middleware.ts',{NODE_ENV:'production'});
// Match the application's NextURL serialization, including incoming /chef/.
const request=(host,entry,headers={})=>new NextRequest(`https://${host}${entry}`,{headers:{host,...headers},nextConfig:{trailingSlash:false}});
const query='?view=kitchen&ref=A1B2&note=a%20b&item=fries&item=coffee';
let groups=0,cases=0;
function test(name,run){run();groups++;console.log(`PASS ${name}`);}
function rewritten(host,entry,expected,headers={},handler=middleware){
  const req=request(host,entry+query,headers),original=req.nextUrl.href,response=handler(req),target=response.headers.get('x-middleware-rewrite');
  assert(target,`${host}${entry}: missing rewrite`);assert.equal(response.headers.get('location'),null,'entry must rewrite, not redirect');
  // Next 14 retains an incoming non-root slash in NextURL's serializer even
  // with trailingSlash:false. Assert the exact route and that specific suffix.
  const serializedExpected=entry.length>1&&entry.endsWith('/')?`${expected.replace(/\/$/,'')}/`:expected;
  const url=new URL(target);assert.equal(url.pathname,serializedExpected,`${host}${entry}`);assert.equal(url.search,query,'query strings including repeated/encoded values survive');assert.equal(req.nextUrl.href,original,'middleware must clone its input URL');cases++;
}
function untouched(host,entry){const response=middleware(request(host,entry));assert.equal(response.headers.get('x-middleware-rewrite'),null,`${host}${entry}`);assert.equal(response.headers.get('location'),null);cases++;}

test('standalone domain entrances open the diner and preserve queries',()=>{
  for(const host of ['domainkitchen.xyz','www.domainkitchen.xyz'])for(const entry of ['/','/chef','/chef/'])rewritten(host,entry,'/chef/diner-preview');
  rewritten('preview.vercel.app','/','/chef/diner-preview',{'x-forwarded-host':'domainkitchen.xyz'});
  rewritten('domainkitchen.xyz:3010','/','/chef/diner-preview');
});
test('explicit legacy and diner links keep their intended independent routes',()=>{
  for(const host of ['domainkitchen.xyz','www.domainkitchen.xyz'])for(const [entry,target] of [['/game','/chef/game'],['/chef/game','/chef/game'],['/diner-preview','/chef/diner-preview'],['/chef/diner-preview','/chef/diner-preview']])rewritten(host,entry,target);
});
test('explicit false restores the standalone legacy entrance without changing direct legacy routes',()=>{
  const rollback=load('src/middleware.ts',{NODE_ENV:'production',DINER_PREVIEW_ENABLED:'false'}).middleware;
  for(const host of ['domainkitchen.xyz','www.domainkitchen.xyz']){
    for(const entry of ['/','/chef','/chef/'])rewritten(host,entry,'/chef',{},rollback);
    for(const entry of ['/game','/chef/game'])rewritten(host,entry,'/chef/game',{},rollback);
  }
});
test('the older Kitchen host retains its legacy entrance and the main host is unchanged',()=>{
  for(const host of ['chef.web3guides.com','chef.localhost:3010'])for(const [entry,target] of [['/','/chef'],['/chef','/chef'],['/chef/','/chef'],['/game','/chef/game'],['/diner-preview','/chef/diner-preview']])rewritten(host,entry,target);
  for(const entry of ['/','/chef','/chef/game','/chef/diner-preview','/articles'])untouched('web3guides.com',entry);
});
test('legal paths remain shared and actual middleware matchers exclude APIs and assets',()=>{
  for(const host of ['domainkitchen.xyz','www.domainkitchen.xyz','chef.web3guides.com','web3guides.com'])for(const entry of ['/privacy','/privacy/data','/terms','/disclaimer'])untouched(host,entry);
  const matches=pathname=>config.matcher.some(pattern=>new RegExp(`^${typeof pattern==='string'?pattern:pattern.source}$`).test(pathname));
  for(const entry of ['/','/chef','/game','/diner-preview','/chef/diner-preview'])assert(matches(entry),`${entry} must reach middleware`);
  for(const entry of ['/api/chef/diner/status','/api/chef/diner/command','/_next/static/chunk.js','/_next/image','/favicon.ico','/robots.txt','/sitemap.xml','/chef-art/room.png','/image.svg','/font.woff2','/style.css','/bundle.js','/video.mp4','/go/example'])assert(!matches(entry),`${entry} must bypass host rewriting`);
});

const NOT_FOUND=Symbol('not-found');
const Client=()=>null;
function page(env){return load('src/app/chef/diner-preview/page.tsx',env,{'next/navigation':{notFound(){throw NOT_FOUND;}},'./DinerClient':{__esModule:true,default:Client},'react/jsx-runtime':{jsx:(type,props)=>({type,props})}});}
test('production guest access defaults on, explicit false closes it, and development remains available',()=>{
  for(const flag of [undefined,'true']){
    const env={NODE_ENV:'production'};if(flag!==undefined)env.DINER_PREVIEW_ENABLED=flag;
    const entry=page(env);assert.equal(entry.default().type,Client);assert.equal(entry.metadata.robots.index,false);
  }
  assert.throws(()=>page({NODE_ENV:'production',DINER_PREVIEW_ENABLED:'false'}).default(),error=>error===NOT_FOUND);
  assert.equal(page({NODE_ENV:'development',DINER_PREVIEW_ENABLED:'false'}).default().type,Client);
});
test('online authority remains independently opt-in and requires every server credential',()=>{
  let externalCalls=0;
  const mocks={'server-only':{},'@supabase/supabase-js':{createClient(){externalCalls++;throw Error('Routing checks must never create an external client');}},'./content':{CONTENT_VERSION:1},'./authority':{createDinerRecord(){throw Error('Unexpected record creation');},DinerAuthorityError:class extends Error{}}};
  const credentials={NEXT_PUBLIC_SUPABASE_URL:'https://test.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-anon',SUPABASE_SERVICE_ROLE_KEY:'test-service'};
  for(const guestFlag of [undefined,'true','false']){
    const env={NODE_ENV:'production',...credentials};if(guestFlag!==undefined)env.DINER_PREVIEW_ENABLED=guestFlag;
    const module=load('src/lib/chef/diner/server.ts',env,mocks);assert.equal(module.dinerServerEnabled(),false);
    env.DINER_PREVIEW_SERVER_ENABLED='false';assert.equal(module.dinerServerEnabled(),false);
    env.DINER_PREVIEW_SERVER_ENABLED='true';assert.equal(module.dinerServerEnabled(),true);
    for(const key of Object.keys(credentials)){const value=env[key];delete env[key];assert.equal(module.dinerServerEnabled(),false,`missing ${key}`);env[key]=value;}
  }
  assert.equal(externalCalls,0);
});
console.log(`${groups} diner routing/gate groups passed; ${cases} real middleware route cases. No network or database access.`);
