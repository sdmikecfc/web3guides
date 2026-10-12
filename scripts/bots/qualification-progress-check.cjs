// Offline qualification guidance checks. No credentials, network requests or writes to scores.
require('./personal-native-path.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const root=path.resolve(__dirname,'../..');
function load(file,imports={}){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:name=>{if(name in imports)return imports[name];throw Error('Unexpected dependency '+name)},Date,Number,Math,Set,Map,BigInt},{filename:file});return module.exports;}
const zones=load('src/lib/bots/token-zones.ts'),progress=load('src/lib/bots/qualification-progress.ts',{'./token-zones':zones});
const base={state:'active',startsAt:'2026-10-06T14:00:00Z',endsAt:'2026-11-03T14:00:00Z',now:Date.parse('2026-10-11T12:00:00Z'),verifiedThrough:'2026-10-11T11:59:00Z',times:[],qualified:false};
const result=delta=>progress.qualificationProgress({...base,...delta});
assert.equal(result({}).label,'Trade on 3 different days this week');
assert.equal(result({times:['2026-10-09T12:00:00Z']}).label,'Trade on 2 more days this week');
assert.equal(result({times:['2026-10-09T12:00:00Z','2026-10-10T12:00:00Z']}).label,'Trade on 1 more day this week');
assert.equal(result({times:['2026-10-09T12:00:00Z','2026-10-09T13:00:00Z','2026-10-09T23:59:00Z']}).label,'Trade on 2 more days this week');
assert.equal(result({times:['2026-10-09T12:00:00Z','2026-10-10T12:00:00Z','2026-10-11T11:00:00Z']}).status,'qualified');
assert.equal(result({times:['2026-10-09T12:00:00Z','2026-10-10T12:00:00Z','2026-10-11T12:30:00Z']}).label,'Trade on 1 more day this week','Evidence after verified cutoff is not counted');
assert.equal(result({times:['2026-10-06T13:59:59Z']}).label,'Trade on 3 different days this week','Trades before opening are ignored');
let out=result({now:Date.parse('2026-10-12T12:00:00Z'),verifiedThrough:'2026-10-12T11:59:00Z',times:['2026-10-11T12:00:00Z']});
assert.equal(out.label,'Trade on 2 more days this week','Oct12 and partial Oct13 are both available UTC days');
out=result({now:Date.parse('2026-10-12T12:00:00Z'),verifiedThrough:'2026-10-12T11:59:00Z',times:['2026-10-12T11:00:00Z']});
assert.equal(out.label,'Qualify in Week 2','Already traded today cannot count today twice');assert.match(out.detail,/Oct 13, 14:00 UTC/);
out=result({now:Date.parse('2026-10-13T13:59:00Z'),verifiedThrough:'2026-10-13T13:58:00Z',times:['2026-10-11T11:00:00Z','2026-10-12T11:00:00Z']});
assert.equal(out.label,'Trade on 1 more day this week');
out=result({now:Date.parse('2026-10-13T14:00:00Z'),verifiedThrough:'2026-10-13T14:00:00Z',times:['2026-10-12T11:00:00Z','2026-10-13T13:00:00Z']});
assert.equal(out.label,'Trade on 3 different days this week');assert.match(out.detail,/Week 2/);
out=result({now:Date.parse('2026-10-13T14:30:00Z'),verifiedThrough:'2026-10-13T14:29:00Z',times:['2026-10-13T14:00:00Z']});assert.equal(out.label,'Trade on 2 more days this week');
out=result({now:Date.parse('2026-10-20T14:30:00Z'),verifiedThrough:'2026-10-20T14:29:00Z',times:['2026-10-09T12:00:00Z','2026-10-10T12:00:00Z','2026-10-11T11:00:00Z']});assert.equal(out.status,'qualified');assert.match(out.detail,/Week 1/);
out=result({now:Date.parse('2026-11-02T12:00:00Z'),verifiedThrough:'2026-11-02T11:59:00Z',times:['2026-11-02T11:00:00Z']});assert.equal(out.label,'Not enough trading days left');
for(const delta of [{times:undefined},{verifiedThrough:null},{startsAt:'invalid'},{endsAt:'2026-11-03T00:00:00Z'},{state:'unavailable'}])assert.equal(result(delta).status,'waiting');
assert.equal(result({verifiedThrough:'2026-10-11T06:00:00Z',times:['2026-10-09T12:00:00Z']}).label,'1/3 trading days verified');
assert.equal(result({now:Date.parse('2026-10-11T00:01:00Z'),verifiedThrough:'2026-10-10T23:59:00Z',times:['2026-10-09T12:00:00Z']}).status,'waiting','UTC midnight does not reinterpret old evidence as current');
assert.equal(result({now:Date.parse('2026-10-13T14:00:00Z'),verifiedThrough:'2026-10-13T13:59:00Z'}).label,'Checking this week’s trading days');
assert.equal(result({state:'draft',qualified:true}).label,'Trading has not started');
assert.equal(result({entered:false,qualified:true}).label,'Enter the competition first');
assert.equal(result({state:'closed',entered:false}).label,'Competition entry is closed');
assert.equal(result({state:'closed',times:['2026-10-09T12:00:00Z']}).label,'1/3 trading days verified');
assert.equal(result({state:'frozen'}).label,'Did not qualify');
assert.equal(result({state:'frozen',qualified:undefined,times:undefined}).status,'waiting');
assert.equal(result({qualified:true,times:undefined}).label,'Qualified for rewards');
assert.equal(result({delayed:true,times:['2026-10-09T12:00:00Z']}).label,'1/3 trading days verified','Retained proof remains clear even when its timestamp is recent');
assert.equal(result({verifiedThrough:'2026-10-11T12:01:00Z',qualified:true,times:['2026-10-09T12:00:00Z','2026-10-10T12:00:00Z','2026-10-11T12:00:30Z']}).status,'waiting','Future coverage cannot qualify a player');
const {QualificationStatus}=load('src/app/bots/_game/TokenZoneBoard.tsx',{
 react:React,'react/jsx-runtime':require('react/jsx-runtime'),'next/dynamic':()=>()=>null,'./EntryDialog':()=>null,'./QuickHelp':()=>null,
 '@/lib/bots/token-zones':zones,'@/lib/bots/qualification-progress':progress,'@/lib/bots/workshop8/entry':{PLAY_ENTRY_URL:'/bots/play'},'./token-zone-board.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})}
});
const render=props=>renderToStaticMarkup(React.createElement(QualificationStatus,{view:base,...props}));
let html=render({progress:result({times:['2026-10-09T12:00:00Z']})});assert.match(html,/Trade on 2 more days this week/);assert.match(html,/Each UTC day counts once/);assert.doesNotMatch(html,/In progress|Not qualified|times this week/);
html=render({qualified:false});assert.match(html,/Checking qualifying days/);assert.doesNotMatch(html,/Trade on 3 different days this week/);
html=render({qualified:true});assert.match(html,/Qualified for rewards/);
html=render({entered:false});assert.match(html,/Enter the competition first/);
console.log('PASS qualification: exact 0/1/2-day next actions, repeated-day trades, verified cutoff, UTC/campaign-week boundaries, available dates, prior-week qualification, final week, stale/unknown/draft/closed/frozen data, and rendered old-payload fallback.');
