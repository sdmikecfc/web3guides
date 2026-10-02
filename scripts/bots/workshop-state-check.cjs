const assert=require('node:assert/strict');
const {freshWorkshop,readWorkshop,changeWorkshop,blankDraft,draftCost,repairQuote}=require('../../src/lib/bots/workshop8/state.ts');
const {preset,ITEMS,SLOTS,ITEM_MAP,itemId,dailyItems,practiceOpponent,aggregateEquipment,ENTRY_MAP}=require('../../src/lib/bots/workshop8/catalogue.ts');
let s=freshWorkshop(),n=0;const now=Date.UTC(2026,8,18,12),apply=a=>s=changeWorkshop(s,a,now);
assert.equal(s.coins,250);assert.equal(readWorkshop('{broken'),null);assert.equal(s.robots.length,0);
for(const style of ['tank','speed','ranged'])for(let tier=1;tier<=4;tier++){const choices=preset(style,tier);assert.equal(SLOTS.reduce((sum,slot)=>sum+ITEM_MAP.get(itemId(choices[slot],slot)).price,0),[0,250,750,2000,5000][tier]);assert.equal(Math.round(aggregateEquipment(choices,ENTRY_MAP).gp),[0,100,200,350,500][tier])}
for(let day=1;day<=30;day++){const items=dailyItems(`2026-09-${day}`);assert.equal(items.length,16);assert.equal(new Set(items.map(i=>i.id)).size,16)}
const draft={...blankDraft(),name:'Chosen by me',choices:preset('speed')};
apply({kind:'draft',draft});assert.equal(draftCost(s),250);apply({kind:'finish',request:'finish-1'});
const finished=structuredClone(s);apply({kind:'finish',request:'finish-1'});assert.deepEqual(s,finished);assert.equal(s.coins,0);assert.equal(s.robots.length,1);
const original=structuredClone(s.robots[0].choices);apply({kind:'paint',id:'finish-1',name:'Still me',appearance:blankDraft().appearance});assert.deepEqual(s.robots[0].choices,original);
const fight=(id)=>({id,robotId:null,name:'Loaner',choices:preset('tank'),appearance:blankDraft().appearance,rival:preset('ranged'),seed:75,arena:'spaceship',startedAt:now});
for(let i=0;i<14;i++){apply({kind:'start',fight:fight('fight-'+i)});const result={kind:'complete',id:'fight-'+i,winner:1,ticks:3000,inputs:[],reason:'Body broke.',versions:{}};apply(result);const saved=structuredClone(s);apply(result);assert.deepEqual(s,saved)}
assert.equal(s.coins,1000);assert.equal(s.days['2026-09-18'],14);
apply({kind:'buy',item:itemId(preset('tank').armL,'armL'),request:'purchase-1'});const bought=structuredClone(s);apply({kind:'buy',item:itemId(preset('tank').armL,'armL'),request:'purchase-1'});assert.deepEqual(s,bought);
apply({kind:'draft',draft:{...blankDraft(),name:'Mixed',choices:preset('tank')}});assert.equal(draftCost(s),225);apply({kind:'finish',request:'finish-2'});assert.equal(s.spares.length,0);assert.equal(s.robots.length,2);
for(const tier of [1,4]){const r={...s.robots[0],choices:preset('tank',tier),repairUntil:now+(tier===1?3600000:10800000)};assert.equal(repairQuote(r,now),tier===1?50:150);assert.equal(repairQuote(r,r.repairUntil),0);assert.equal(repairQuote(r,now+(r.repairUntil-now)/2),tier===1?25:75)}
assert.ok(readWorkshop(JSON.stringify(s)));const broken=structuredClone(s);broken.robots[0].choices.head='missing';assert.equal(readWorkshop(JSON.stringify(broken)),null);
const recycledBefore=s.coins;apply({kind:'recycle',id:'finish-2',request:'recycle-1'});apply({kind:'recycle',id:'finish-2',request:'recycle-1'});assert.equal(s.coins,recycledBefore+100);
console.log('Starter preservation, 16-item shipments, seven-slot pricing/GP, immutable assembly, duplicate Finish/purchase/recycle, daily rewards, spare consumption, repair quotes and corrupt-save checks passed.');

const mixed=preset("tank");mixed.torso=preset("tank",4).torso;for(const style of ["tank","speed","ranged"])assert.equal(aggregateEquipment(practiceOpponent(mixed,style),ENTRY_MAP).gp,aggregateEquipment(mixed,ENTRY_MAP).gp);

require("node:fs").writeFileSync(".bots-preview/workshop-check/fixture.json",JSON.stringify(s));
