require('./personal-native-path.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {NextRequest}=require('next/server');
const root=path.resolve(__dirname,'../..');
const request=url=>new NextRequest(url,{headers:{host:new URL(url).host}});
function load(file){const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText;const module={exports:{}};new Function('require','module','exports',output)(id=>id.startsWith('@/')?load(path.join(root,'src',id.slice(2)+'.ts')):require(id),module,module.exports);return module.exports;}
const {middleware}=load(path.join(root,'src/middleware.ts'));
for(const host of ['modelkombat.xyz','www.modelkombat.xyz']){
 assert.equal(new URL(middleware(request(`https://${host}/`)).headers.get('location')).pathname,'/bots/start');
 for(const entry of ['/','/bots','/bots/']){const response=middleware(request(`https://${host}${entry}?view=parts`));assert.equal(response.status,307);assert.equal(response.headers.get('location').replace('/?','?'),`https://${host}/bots/workshop?view=parts`);}
 const classic=middleware(request(`https://${host}/bots?collection=classic`));assert.equal(new URL(classic.headers.get('x-middleware-rewrite')).pathname,'/bots');assert.equal(classic.headers.get('location'),null);
 for(const entry of ['/bots/workshop','/bots-playtest/index.html','/rules']){const response=middleware(request(`https://${host}${entry}`));assert.equal(response.headers.get('location'),null);assert.equal(new URL(response.headers.get('x-middleware-rewrite')).pathname,entry==='/rules'?'/bots/rules':entry);}
}
const main=middleware(request('https://web3guides.com/'));assert.equal(main.headers.get('location'),null);assert.equal(main.headers.get('x-middleware-rewrite'),null);
console.log('Workshop domain entry, direct assets, legal pages, classic collection and unrelated apex routing passed.');
