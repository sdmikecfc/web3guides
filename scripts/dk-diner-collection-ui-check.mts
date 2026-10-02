/** UI eligibility and labels checked against actual collection commands. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { createDiner, dispatchDiner, type DinerState } from '../src/lib/chef/diner/progression';
import { ROUTES } from '../src/lib/chef/diner/content';
const loader=Module as unknown as {_load:(request:string,parent:unknown,main:boolean)=>unknown},original=loader._load;
loader._load=function(request,parent,main){return original.call(this,request.startsWith('@/')?path.resolve('src',request.slice(2)):request,parent,main);};
const {regularBookEntry,passportStamp,passportRoute}=require('../src/app/chef/diner-preview/collection-view') as typeof import('../src/app/chef/diner-preview/collection-view');loader._load=original;
const now=Date.UTC(2026,8,20,12);let groups=0;
function check(name:string,fn:()=>void){fn();groups++;console.log(`PASS ${name}`);}
function fresh(){return createDiner(now,'collection-ui');}
function greet(state:DinerState,id:string){const result=dispatchDiner(state,{type:'serveRegular',regularId:id},{now});assert.equal(result.error,undefined);return result.state;}
check('a daily hello unlocks after an actual meal receipt and never implies an ingredient gift',()=>{
  const state=fresh();let entry=regularBookEntry(state,'old_pete')!;assert(entry.available);assert.equal(entry.ready,false);assert.equal(entry.served,false);
  assert(dispatchDiner(state,{type:'serveRegular',regularId:'old_pete'},{now}).error);
  state.daily.regularProgress.old_pete=1;entry=regularBookEntry(state,'old_pete')!;assert(entry.ready);
  const after=greet(state,'old_pete');entry=regularBookEntry(after,'old_pete')!;assert(entry.greeted);assert.equal(entry.count,1);assert.equal(entry.ready,false);assert.deepEqual(after.pantry,state.pantry);assert.equal(after.daily.kindness,false);
  assert(dispatchDiner(after,{type:'serveRegular',regularId:'old_pete'},{now}).error);
});
check('invitations show the real missing menu, furnishing, route, mastery and horn conditions',()=>{
  const state=fresh();assert(regularBookEntry(state,'marge')!.requirements.some(row=>!row.met&&row.label==='Discover Coffee'));
  for(const [id,recipe,course] of [['dottie','ice_cream_sundae','dessert'],['rex','bacon_deluxe_burger','main'],['professor_lin','apple_pie','dessert'],['kiki','fries','starter'],['hendersons','pancakes','dessert']] as const){
    const s=fresh();s.recipes[recipe]={level:0};s.home.menu[course]=[recipe];s.daily.regularProgress[id]=1;
    assert.equal(regularBookEntry(s,id)!.ready,false,id);assert(regularBookEntry(s,id)!.requirements.some(row=>!row.met),id);
    if(id==='dottie')s.home.layout.push({id:'test-pot',equipmentId:'daisy_pot',x:6,y:6,rotation:0});
    if(id==='rex')s.cosmetics.horn='friendly';
    if(id==='professor_lin')s.recipes.apple_pie.level=5;
    if(id==='kiki')s.collections.stamps.push('boardwalk:0:slow');
    if(id==='hendersons')s.home.layout.push({id:'test-table',equipmentId:'table_4',x:6,y:6,rotation:0});
    const entry=regularBookEntry(s,id)!;assert(entry.available,id);assert(entry.ready,id);assert(entry.requirements.every(row=>row.met),id);
  }
});
check('Bell shows the mastered dish actually selected instead of an older off-menu favourite',()=>{
  const state=fresh();assert(regularBookEntry(state,'mr_bell')!.requirements.some(row=>row.label.includes('level 10')&&!row.met));
  state.recipes.classic_burger.level=10;state.recipes.cheeseburger={level:10};state.home.menu.main=['cheeseburger'];
  const entry=regularBookEntry(state,'mr_bell')!;assert.equal(entry.favourite,'cheeseburger');assert.equal(entry.recipe?.name,'Cheeseburger');assert(entry.available);
});
check('15 and 40 hellos match real keepsake and scrap receipts, with recognition in between',()=>{
  for(const count of [2,7,14,24,39]){const state=fresh();state.collections.regulars.old_pete=count;state.daily.regularProgress.old_pete=1;const entry=regularBookEntry(state,'old_pete')!;assert.equal(entry.nextAt,count+1);
    const after=greet(state,'old_pete');assert.equal(after.collections.regulars.old_pete,count+1);
    if(count===14){assert.equal(entry.nextReward,'A personal keepsake');assert(after.collections.mementos.includes('pete_postcard'));}
    else if(count===39){assert.equal(entry.nextReward,'One secret recipe scrap');assert.equal(Object.values(after.collections.scraps).reduce((sum,n)=>sum+n,0),1);assert.equal(regularBookEntry(after,'old_pete')!.nextAt,null);}
    else {assert.equal(entry.nextReward,'Friendship recognition');assert.equal(after.collections.mementos.length,0);assert.equal(Object.values(after.collections.scraps).length,0);}
  }
});
check('passport displays one-based friendly visited stamps without inventing service clears',()=>{
  assert.deepEqual(passportStamp('night_market:0:shop'),{id:'night_market:0:shop',routeId:'night_market',routeName:'Night market',stop:1,kind:'shop',name:'Equipment market'});
  for(const invalid of ['downtown:-1:slow','downtown:12:slow','downtown:0:constructor','unknown:1:slow','downtown:1:slow:extra'])assert.equal(passportStamp(invalid),null);
  const state=fresh();state.collections.stamps=['downtown:11:finale','downtown:0:slow','downtown:0:slow'];const route=passportRoute(state,'downtown')!;
  assert.equal(route.stamps.length,2);assert.deepEqual(route.stamps.map(stamp=>stamp.stop),[1,12]);assert.equal(route.won,false);assert.equal(route.earned,false);
});
check('truck growth needs a finale win plus owned route recipes, not mastery or stamp counts',()=>{
  const state=fresh(),route=ROUTES[0];state.collections.stamps=Array.from({length:12},(_,row)=>`downtown:${row}:slow`);
  for(const id of route.recipeIds)state.recipes[id]={level:0};assert.equal(passportRoute(state,'downtown')!.earned,false);
  state.collections.routeWins.push('downtown');assert.equal(passportRoute(state,'downtown')!.earned,true);assert.equal(passportRoute(state,'downtown')!.nextTier.tier,2);
  delete state.recipes.coffee;const view=passportRoute(state,'downtown')!;assert.equal(view.earned,false);assert.equal(view.owned,4);assert.equal(view.recipes.find(recipe=>recipe.id==='coffee')!.owned,false);
  assert.equal(passportRoute(state,'boardwalk')!.open,false);state.truckTier=2;assert.equal(passportRoute(state,'boardwalk')!.open,true);
});
console.log(`PASS ${groups} collection UI groups`);
