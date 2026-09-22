import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,roadsideShopVisit,sanitizeDinerSave,shopOffers,type DinerState,type DinerCommand} from '../src/lib/chef/diner/progression';
import {RECIPE_BY_ID} from '../src/lib/chef/diner/content';
import {createDinerEvent,dispatchDinerEvent} from '../src/lib/chef/diner/events';
const now=Date.UTC(2026,8,22,12);let groups=0;
function test(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
function act(s:DinerState,c:DinerCommand){const r=dispatchDiner(s,c,{now});assert.equal(r.error,undefined,r.error);return r.state;}
function market(){let s=createDiner(now,'scheduled-market');s.tutorial.finished=true;s=act(s,{type:'startRun'});const shop=s.run!.map.find(n=>n.kind==='shop')!;s.run!.available=[shop.id];s.run!.serviceDays=3;s.run!.qualified=true;s.run!.haul=2000;return act(s,{type:'chooseNode',nodeId:shop.id});}

test('every market has equipment and a complete paid mastery set even after daily gifts are exhausted',()=>{
  let s=market();s.daily.minted=7;s.daily.truckRuns=['old-a','old-b'];s.run!.ingredientClaimed=true;
  for(let i=0;i<100;i++){const offers=shopOffers(s,`stock-${i}`);assert(offers.some(o=>o.kind==='equipment'));assert.equal(offers.filter(o=>o.kind==='ingredients').length,1);assert(offers.length<=7);}
  const pack=s.run!.offers.find(o=>o.kind==='ingredients')!,haul=s.run!.haul;s=act(s,{type:'buyOffer',offerId:pack.id});assert.equal(s.run!.haul,haul-70);assert.equal(s.daily.minted,7);assert.deepEqual(s.daily.truckRuns,['old-a','old-b']);
  assert.deepEqual(s.pantry,Object.fromEntries(RECIPE_BY_ID[pack.target].ingredients.map(id=>[id,1])));
  const reload=sanitizeDinerSave(s)!;assert(reload);assert.deepEqual(reload.pantry,s.pantry);assert.equal(dispatchDiner(reload,{type:'buyOffer',offerId:pack.id},{now}).code,'offer_unavailable');
  s=act(reload,{type:'upgradeRecipe',recipeId:pack.target});assert.equal(s.recipes[pack.target].level,1);assert(RECIPE_BY_ID[pack.target].ingredients.every(id=>s.pantry[id]===0));
});

test('markets sell additional seat copies and prevent duplicate purchase receipts',()=>{
  let s=market();for(let i=0;i<100;i++){s.run!.offers=shopOffers(s,`seat-${i}`);if(s.run!.offers.some(o=>o.id==='equipment:table_1'))break;}
  assert(s.run!.offers.some(o=>o.id==='equipment:table_1'));const before=s.truckConfig.tableCopies.table_1;s=act(s,{type:'buyOffer',offerId:'equipment:table_1'});assert.equal(s.truckConfig.tableCopies.table_1,before+1);assert.equal(s.equipment.table_1.homeCopies,0);assert.equal(dispatchDiner(s,{type:'buyOffer',offerId:'equipment:table_1'},{now}).code,'offer_unavailable');
});

test('new cooking-machine finds also offer their matching serving supply at the same market',()=>{
  const s=market(),seen=new Set<string>();
  for(let i=0;i<200;i++){const offers=shopOffers(s,`machine-${i}`);for(const [machine,rack] of [['boiler','bowls'],['fryer','boxes'],['drinks','cups'],['blender','cups'],['coffee','cups']])if(offers.some(o=>o.kind==='equipment'&&o.target===machine)){seen.add(machine);assert(offers.some(o=>o.kind==='equipment'&&o.target===rack),machine);}}
  assert.equal(seen.size,5);
});

test('skipped supplies for owned machines cannot be crowded out by later equipment discoveries',()=>{
  for(const [machine,rack] of [['fryer','boxes'],['boiler','bowls'],['drinks','cups']]){
    let s=market();s.equipment[machine]={tier:1,truckOwned:true,homeCopies:1};const discoveries=new Set<string>();
    for(let i=0;i<100;i++){
      s.run!.offers=shopOffers(s,`missing-rack-${i}`);assert(s.run!.offers.some(o=>o.kind==='equipment'&&o.target===rack),`${machine}: ${i}`);assert(s.run!.offers.length<=8);
      for(const offer of s.run!.offers.filter(o=>o.kind==='equipment'&&!o.target.startsWith('table_')&&!['boxes','cups','bowls'].includes(o.target)))discoveries.add(offer.target);
    }
    assert(discoveries.size>=4,'required racks leave space for different machine discoveries');
    const loaded=sanitizeDinerSave(s)!;assert(loaded);s=act(loaded,{type:'buyOffer',offerId:`equipment:${rack}`});assert.equal(s.equipment[rack].truckOwned,true);assert.equal(s.equipment[rack].homeCopies,0);
  }
});

test('a head start keeps the second scheduled market recipe tier without claiming the skipped shop',()=>{
  let s=createDiner(now,'market-head-start');s.tutorial.finished=true;s.collections.routeWins=['downtown'];s=act(s,{type:'startRun',headStart:true});
  const start=s.run!.map.find(n=>n.id===s.run!.available[0])!,shops=s.run!.map.filter(n=>n.kind==='shop'&&n.row>=start.row);assert.equal(start.row,4);assert.equal(shops.length,1);assert.deepEqual(s.run!.visited,[]);
  const before=structuredClone({coins:s.coins,pantry:s.pantry,equipment:s.equipment,receipts:s.career.receipts});s.run!.available=[shops[0].id];s=act(s,{type:'chooseNode',nodeId:shops[0].id});
  assert.equal(roadsideShopVisit(s),2);assert.equal(s.run!.offers.filter(o=>o.kind==='recipe').length,2);assert.deepEqual(s.run!.visited,[]);assert.equal(s.run!.haul,0);
  assert.deepEqual({coins:s.coins,pantry:s.pantry,equipment:s.equipment,receipts:s.career.receipts},before);assert(sanitizeDinerSave(s));
});

test('legacy single-ingredient receipts remain valid while new route rain cannot bypass the scheduled market',()=>{
  let s=market();s.run!.offers=[{id:'ingredients:bundle',kind:'ingredients',target:'beef',price:50,purchased:false}];s=act(s,{type:'buyOffer',offerId:'ingredients:bundle'});assert.equal(Object.values(s.pantry).reduce((a,b)=>a+b,0),1);assert.equal(s.daily.minted,1);assert.equal(s.run!.ingredientClaimed,true);
  const event=createDinerEvent('rain','rain','rainstorm'),context={haul:0,routeRecipeIds:['fries'],seed:'rain'};
  const legacy=dispatchDinerEvent(event,{type:'choice',choiceId:'wait'},context),scheduled=dispatchDinerEvent(event,{type:'choice',choiceId:'wait'},{...context,scheduledMarkets:true});assert.equal(legacy.outcome!.skipRows,1);assert.equal(scheduled.outcome!.skipRows,undefined);assert.equal(scheduled.event.result,'The rain passed. Your planned route is ready.');
});
console.log(`PASS ${groups} scheduled market checks`);
