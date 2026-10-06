import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,generateDinerMap,sanitizeDinerSave,type DinerNode} from '../src/lib/chef/diner/progression';
import {makeRoadsideGift,validRoadsideGifts} from '../src/lib/chef/diner/roadside-gifts';
import {buildServiceLoadout,makeTable} from '../src/lib/chef/diner/geometry';
import {createService,dispatchService,serviceTargetIntent,stepService} from '../src/lib/chef/diner/service';
const now=Date.UTC(2026,8,25,12),services=new Set(['slow','medium','busy','special','finale']);
function paths(map:DinerNode[]){const found:DinerNode[][]=[];const walk=(n:DinerNode,p:DinerNode[])=>{const next=[...p,n];if(!n.next.length)found.push(next);else n.next.forEach(id=>walk(map.find(n=>n.id===id)!,next));};map.filter(n=>n.row===0).forEach(n=>walk(n,[]));return found;}
let forks=0,topologies=new Set<string>();
for(let seed=0;seed<1000;seed++){
 const map=generateDinerMap(`road-${seed}`,7),all=paths(map);assert.deepEqual(map,generateDinerMap(`road-${seed}`,7));
 assert(map.length<=48);assert(all.length>=9);assert.equal(new Set(all.flat().map(n=>n.id)).size,map.length);
 for(const path of all){assert.equal(path.filter(n=>services.has(n.kind)).length,8);assert.deepEqual(path.slice(0,4).map(n=>n.kind),['slow','slow','medium','shop']);assert.equal(path.at(-1)!.kind,'finale');assert.equal(new Set(path.map(n=>n.id)).size,path.length);}
 for(const n of map)for(const id of n.next)assert.equal(map.find(n=>n.id===id)!.row,n.row+1);
 if(map.filter(n=>n.row===5).length===4)forks++;
 topologies.add(JSON.stringify(map.map(n=>n.next)));
}
assert(forks>500);assert(topologies.size>=9);console.log('PASS 1,000 seeds: eight services, reachable finale, varied three-road corridors and local forks');
for(const version of [1,2,3,4,5,6] as const)assert.deepEqual(generateDinerMap('legacy',version),generateDinerMap('legacy',version));
let state=dispatchDiner(createDiner(now,'gifts'),{type:'startRun'},{now}).state;
assert.equal(state.run!.mapVersion,7);assert(sanitizeDinerSave(state,now));
let discoveries=0,recipes=0,equipment=0,upgrades=0;
for(let i=0;i<1000;i++){
 const run={...state.run!,seed:`gift-${i}`,position:'r5c0',qualified:true},gift=makeRoadsideGift(state,run,1000),cash=gift.offers[0];
 assert(cash.amount>=400&&cash.amount<=600);assert.equal(cash.amount%25,0);assert(gift.offers.length<=3);assert.deepEqual(gift,makeRoadsideGift(state,run,1000));
 const permanent=gift.offers.find(o=>['recipe','equipment','upgrade'].includes(o.kind));if(permanent){discoveries++;if(permanent.kind==='recipe')recipes++;if(permanent.kind==='equipment')equipment++;if(permanent.kind==='upgrade')upgrades++;}
 assert(gift.offers.every(o=>!o.target.startsWith('collectible')&&!o.target.includes('pack')));
}
assert(discoveries>550&&discoveries<650);assert(recipes>150&&equipment>150&&upgrades>50);console.log('PASS gift scaling, deterministic choices and discovery distribution', {discoveries,recipes,equipment,upgrades});
// Reveal a real map gift through its command, then reload before claiming.
const giftNode=state.run!.map.find(n=>n.kind==='bonus')!;state.run!.available=[giftNode.id];state.run!.qualified=true;state.run!.serviceDays=4;
let result=dispatchDiner(state,{type:'chooseNode',nodeId:giftNode.id},{now});assert.equal(result.error,undefined);state=result.state;
const gift=state.run!.gifts![giftNode.id],reloaded=sanitizeDinerSave(JSON.parse(JSON.stringify(state)),now);assert(reloaded);assert.deepEqual(reloaded.run!.gifts,gift?state.run!.gifts:null);
result=dispatchDiner(reloaded,{type:'chooseGift',choice:'coins'},{now});assert.equal(result.error,undefined);assert.equal(result.state.run!.haul,state.run!.haul+gift.offers[0].amount);assert(validRoadsideGifts(result.state.run!));assert(sanitizeDinerSave(result.state,now));
const duplicate=dispatchDiner(result.state,{type:'chooseGift',choice:'coins'},{now});assert(duplicate.error);assert.equal(duplicate.state.run!.haul,result.state.run!.haul);console.log('PASS gift reveal, reload, claim and duplicate refusal');
for(const rotation of [0,1,2,3] as const){
 let s=dispatchService(createService({...buildServiceLoadout(1,['classic_burger']),tables:[makeTable('table',3,5,2,1,rotation)],menu:['classic_burger']}),{type:'prepare'});
 const intent=serviceTargetIntent(s,'table');assert(intent.movement?.available);assert(intent.movement.only);assert.equal(intent.reason,undefined);
 s=dispatchService(s,{type:'interact',targetId:'table',seatId:s.tables[0].seats[1].id});assert(s.chef.path.length);assert.equal(s.chef.targetId,null);
 // A dirty vessel appearing after the original click must not be collected.
 s.tables[0].seats[1].item={id:'late-dirty',kind:'dirty',recipeId:'classic_burger',step:0,stage:'dirty',createdTick:0,cold:false};
 for(let i=0;i<600&&s.chef.path.length;i++)stepService(s);assert.equal(s.chef.path.length,0);assert.equal(s.chef.held,null);assert.equal(s.tables[0].seats[1].item.id,'late-dirty');
 const before={x:s.chef.x,y:s.chef.y};s=dispatchService(s,{type:'interact',targetId:'table',seatId:'not-a-seat'});assert.equal(s.chef.path.length,0);assert.deepEqual({x:s.chef.x,y:s.chef.y},before);
}
console.log('PASS movement-only table clicks, all rotations, exact seats and no delayed actions');
