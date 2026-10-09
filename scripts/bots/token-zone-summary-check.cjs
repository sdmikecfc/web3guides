// Offline rendered-summary checks. No credentials, network calls, or source data changes.
require('./personal-native-path.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const root=path.resolve(__dirname,'../..');
function load(file,imports={}){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:name=>{if(name in imports)return imports[name];throw Error('Unexpected dependency '+name)},console,Intl,Date,Number,Set,Map,BigInt},{filename:file});return module.exports;}
const zones=load('src/lib/bots/token-zones.ts');
const {ZoneOverview,FinancialLeaders,PersonalSyncStatus}=load('src/app/bots/_game/TokenZoneBoard.tsx',{
 react:React,'react/jsx-runtime':require('react/jsx-runtime'),'next/dynamic':()=>()=>null,'./EntryDialog':()=>null,'./QuickHelp':()=>null,
 '@/lib/bots/token-zones':zones,'@/lib/bots/workshop8/entry':{PLAY_ENTRY_URL:'/bots/play'},'./token-zone-board.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})}
});
const base={...zones.emptyZoneView(),available:true,state:'active',startsAt:'2026-10-06T14:00:00Z',endsAt:'2026-11-03T14:00:00Z',complete:true,fresh:true,confirmedThrough:'2026-10-06T18:00:00Z',issues:[]};
const render=delta=>renderToStaticMarkup(React.createElement(ZoneOverview,{view:{...base,...delta}}));
for(const delta of [{complete:false,volumeUsd:'750000'},{volumeUsd:null},{volumeUsd:''},{volumeUsd:'NaN'},{volumeUsd:'-1'},{available:false,volumeUsd:'0'},{state:'unavailable',volumeUsd:'0'}]){
 const html=render(delta);assert.match(html,/Syncing trading activity/);assert.doesNotMatch(html,/aria-valuenow=/);assert.doesNotMatch(html,/≈ \$0|0 \/ 9 zones|All 9 unlocked/);
}
let html=render({state:'draft',volumeUsd:'750000'});assert.match(html,/Not started/);assert.match(html,/First unlock/);assert.match(html,/1,000 USDC/);assert.doesNotMatch(html,/aria-valuenow=|≈ \$|All 9 unlocked/);
html=render({volumeUsd:'0'});assert.match(html,/aria-valuenow="0"/);assert.match(html,/≈ \$0/);assert.match(html,/0 \/ 9 zones/);assert.match(html,/\$5,000 volume to go/);
let reference=0;
for(const [index,zone] of zones.REWARD_ZONES.entries()){
 reference+=zone.referenceUsd;html=render({volumeUsd:String(zone.threshold)});
 assert.match(html,new RegExp('aria-valuenow="'+(index+1)+'"'));assert.ok(html.includes('≈ $'+reference.toLocaleString('en-US')));
 if(index<8){const next=zones.REWARD_ZONES[index+1],quantity=Number(next.quantity).toLocaleString('en-US',{minimumFractionDigits:next.quantity.split('.')[1]?.length??0,maximumFractionDigits:2});assert.ok(html.includes(quantity+' '+next.symbol));assert.ok(html.includes('$'+(next.threshold-zone.threshold).toLocaleString('en-US')+' volume to go'));}
 else{assert.match(html,/All 9 unlocked/);assert.match(html,/All nine reward zones unlocked/);assert.doesNotMatch(html,/volume to go/);}
}
html=render({volumeUsd:'12500'});assert.match(html,/width:37.5%/);assert.match(html,/3,304.58 DEPIN.ai/);assert.match(html,/\$12,500 volume to go/);
html=render({volumeUsd:'4999.999999'});assert.match(html,/\$4,999.999999/);assert.match(html,/\$0.000001 volume to go/);assert.match(html,/aria-valuenow="0"/);
html=render({volumeUsd:'25000',fresh:false});assert.match(html,/Last verified total · update delayed/);assert.match(html,/Results through/);assert.match(html,/Updates about every 4 hours/);assert.match(html,/checks every 15 minutes/);
html=render({volumeUsd:'25000',complete:false});assert.match(html,/Latest check through/);assert.doesNotMatch(html,/Results through/);
for(const state of ['closed','frozen']){html=render({state,volumeUsd:'750000'});assert.match(html,/Nov 3, 2026/);assert.match(html,/14:00 UTC/);assert.match(html,state==='closed'?/Closed · reconciling/:/Final results/);assert.doesNotMatch(html,/28-day competition/);}
html=render({volumeUsd:null,endsAt:'invalid',confirmedThrough:'invalid'});assert.doesNotMatch(html,/Invalid Date/);assert.equal((html.match(/class="summaryCard/g)||[]).length,4);assert.equal((html.match(/class="unlockSegment/g)||[]).length,9);
console.log('PASS: four rendered summary cards; null/incomplete/unavailable safety; draft; confirmed zero; all nine exact thresholds and token amounts; partial segment fill; sub-dollar remainder; approximate reference values; active/closed/frozen dates; last-confirmed vs incomplete metadata; update cadence. Offline only.');
const leaders=delta=>renderToStaticMarkup(React.createElement(FinancialLeaders,{view:{...base,...delta}}));
html=leaders({});assert.match(html,/Calculating returns/);assert.doesNotMatch(html,/#1|NaN%/);
html=leaders({standings:{volume:[],battles:[],roi:[{name:'Trader ONE',rank:1,score:'12.50'}],profit:[{name:'Trader TWO',rank:1,score:null}]},financials:{verified:2,total:4,complete:false}});
assert.match(html,/\+12\.50%/);assert.match(html,/Trader ONE/);assert.match(html,/Trader TWO/);assert.match(html,/#1/);assert.match(html,/2 of 4 trading accounts verified/);assert.match(html,/Past results/);assert.doesNotMatch(html,/\$|USDC|NaN/);
html=leaders({complete:false,standings:{volume:[],battles:[],roi:[{name:'STALE',rank:1,score:'99'}],profit:[{name:'STALE',rank:1,score:null}]}});assert.doesNotMatch(html,/STALE|99%|#1/);
html=render({complete:false,tracking:{verified:1,total:2,partial:true},volumeUsd:'80'});assert.match(html,/Verified volume so far/);assert.match(html,/some accounts syncing/);assert.match(html,/\$80/);
html=leaders({complete:false,tracking:{verified:1,total:2,partial:true},financials:{verified:1,total:null,complete:false},standings:{volume:[],battles:[],roi:[{name:'Trader ONE',rank:1,score:'12.50'}],profit:[{name:'Trader ONE',rank:1,score:null}]}});assert.match(html,/\+12\.50%/);assert.match(html,/1 trading account verified so far/);assert.match(html,/provisional ranks/);assert.doesNotMatch(html,/of null|\$/);
html=leaders({complete:false,financials:{verified:null,total:null,complete:false}});assert.match(html,/Accounting is syncing/);assert.doesNotMatch(html,/0 of|0 trading account|null/);
html=renderToStaticMarkup(React.createElement(PersonalSyncStatus,{personal:{entered:true,syncStatus:'review'}}));assert.match(html,/couldn’t verify a trade/);assert.match(html,/https:\/\/discord.gg\/doma/);assert.match(html,/@sdmike/);
html=renderToStaticMarkup(React.createElement(PersonalSyncStatus,{personal:{entered:true,syncStatus:'verified',financialStatus:'review'}}));assert.match(html,/finish your ROI calculation/);assert.match(html,/@sdmike/);
html=renderToStaticMarkup(React.createElement(PersonalSyncStatus,{personal:{entered:true,syncStatus:'syncing'}}));assert.match(html,/trading history is syncing/);assert.doesNotMatch(html,/couldn’t|Contact/);
html=render({complete:false,fresh:false,tracking:{verified:1,total:2,partial:true,retained:true,oldestThrough:'2026-10-06T18:00:00Z',newestThrough:'2026-10-06T20:00:00Z'},volumeUsd:'80'});assert.match(html,/Latest verified volume/);assert.match(html,/Verified as of/);assert.match(html,/UTC/);assert.match(html,/newer trades syncing/);assert.match(html,/data-fresh="false"/);
html=leaders({complete:false,tracking:{verified:1,total:2,partial:true},financials:{verified:1,total:null,complete:false,retained:true},standings:{volume:[],battles:[],roi:[{name:'Trader ONE',rank:1,score:'12.5',verifiedThrough:'2026-10-06T18:00:00Z'}],profit:[{name:'Trader ONE',rank:1,score:null,verifiedThrough:'2026-10-06T18:00:00Z'}]}});assert.match(html,/\+12\.50%/);assert.match(html,/Last verified returns/);assert.match(html,/Oct 6/);assert.match(html,/18:00 UTC/);
html=renderToStaticMarkup(React.createElement(PersonalSyncStatus,{personal:{entered:true,syncStatus:'review',resultsDelayed:true,tradeThrough:'2026-10-06T18:00:00Z',financialThrough:'2026-10-06T18:00:00Z'}}));assert.match(html,/Last verified trades/);assert.match(html,/Last verified ROI/);assert.match(html,/@sdmike/);
console.log('PASS: realized ROI showcase, private-profit rank, pending/stale results and provisional account coverage.');
if(process.argv.includes('--strict')){
 const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile).config,options=ts.convertCompilerOptionsFromJson(config.compilerOptions,root).options;options.incremental=false;
 const program=ts.createProgram(['next-env.d.ts','src/app/bots/_game/TokenZoneBoard.tsx'].map(p=>path.join(root,p)),options),errors=ts.getPreEmitDiagnostics(program);
 if(errors.length)throw Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
 console.log('PASS: strict TypeScript for TokenZoneBoard and its imported runtime.');
}
