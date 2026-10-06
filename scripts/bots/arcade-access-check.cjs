// Offline progression checks: no network, credentials, or save mutations.
require('./personal-native-path.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const root=path.resolve(__dirname,'../..');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
require.extensions['.css']=m=>{m.exports={__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};};
const {loaner,arcadeBuild}=require('../../src/lib/bots/arcade/equipment.ts'),{ladderAvailable,ladderResumeAvailable}=require('../../src/lib/bots/arcade/access.ts'),{newRun,readRun}=require('../../src/lib/bots/arcade/ladder.ts'),{preset}=require('../../src/lib/bots/workshop8/catalogue.ts'),{freshArcadeSave,readArcadeSave}=require('../../src/lib/bots/arcade/save.ts');
const Arcade=require('../../src/app/bots/_game/ArcadeKombat.tsx').default;
for(const style of ['tank','speed','ranged']){
 const free=loaner(style);
 assert.equal(ladderAvailable(1,free,false),true);
 for(const tier of [2,3,4]){assert.equal(ladderAvailable(tier,free,false),false);assert.equal(ladderAvailable(tier,loaner(style,tier),false),false);}
}
for(const [gp,max] of [[100,1],[199,1],[200,2],[349,2],[350,3],[499,3],[500,4]])for(const tier of [1,2,3,4])assert.equal(ladderAvailable(tier,{...loaner('tank'),gp},true),tier<=max);
for(const tier of [1,2,3,4])assert.equal(ladderAvailable(tier,null,true),false);
const free=loaner('tank'),freeRun=newRun(free,1,75,'free');
assert(ladderResumeAvailable(freeRun,free,null));
assert(!ladderResumeAvailable(freeRun,loaner('speed'),null));
for(const tier of [2,3,4]){
 const build=loaner('tank',tier),oldFreeRun=newRun(build,tier,75,'old-free');
 assert(!ladderResumeAvailable(oldFreeRun,free,null));
 assert(!ladderResumeAvailable(oldFreeRun,build,null));
 assert(!ladderResumeAvailable(oldFreeRun,null,null));
 const ownRun=newRun(build,tier,75,'owned','robot-a');
 assert(ladderResumeAvailable(ownRun,build,'robot-a'));
 assert(!ladderResumeAvailable(ownRun,build,'robot-b'));
 assert(!ladderResumeAvailable(ownRun,{...build,health:build.health+1},'robot-a'));
 // Legacy saves remain readable, but cannot themselves unlock a ladder.
 assert(ladderResumeAvailable(oldFreeRun,build,'matching-legacy-owner'));
 const saved=readArcadeSave(JSON.stringify({...freshArcadeSave('test'),active:tier,runs:{[tier]:oldFreeRun}}),'test');
 assert(saved.runs[tier]);assert(!ladderResumeAvailable(saved.runs[tier],free,null));
 assert.equal(readRun(ownRun).robotId,'robot-a');
}
assert.equal(readRun({...freeRun,robotId:''}),null);
function tierButtons(html){return [...html.matchAll(/<button[^>]*aria-pressed="(?:true|false)"[^>]*>[^]*?<small>TIER (\d)<\/small>[^]*?<\/button>/g)].map(m=>({tier:Number(m[1]),disabled:m[0].includes('disabled=""')}));}
let html=renderToStaticMarkup(React.createElement(Arcade,{garageMessage:'Loading your garage…'}));
assert.deepEqual(tierButtons(html),[1,2,3,4].map(tier=>({tier,disabled:tier>1})));
assert.match(html,/Free fighters enter Tier 1/);assert.doesNotMatch(html,/-t[234]-jab/);assert.match(html,/Start Scrapyard ladder/);
for(const tier of [1,2,3,4]){
 const robot={id:'owned',name:'My robot',choices:preset('tank',tier)},actual=arcadeBuild(robot.choices,robot.name);
 html=renderToStaticMarkup(React.createElement(Arcade,{ownedRobot:robot}));
 assert.deepEqual(tierButtons(html),[1,2,3,4].map(t=>({tier:t,disabled:t>actual.tier})));
 assert(html.includes(`${actual.gp} GP`));
}
console.log('PASS arcade access: free T1 only; all GP boundaries; loading/unavailable garages; owned selection; stale/legacy runs; robot identity and equipment recheck; saved data preserved; rendered locked tabs and starter art.');
