import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,dinerStopService,generateDinerMap,sanitizeDinerSave,type NodeKind} from '../src/lib/chef/diner/progression';
import {buildServiceLoadout,makeTable} from '../src/lib/chef/diner/geometry';
import {Kitchen} from './dk-diner-reference-kitchen';
const now=1800000000000;
const mapVersion=process.env.DK_MAP_VERSION==='6'?6:5;
const totals:Record<string,{n:number;cleared:number;seconds:number;coins:number;pressure:number}>={};
for(const prepared of [false,true])for(const kind of ['slow','medium','busy'] as const){
 const key=`${kind}:${prepared}`,r=totals[key]={n:0,cleared:0,seconds:0,coins:0,pressure:0};
 for(let seed=0;seed<100;seed++){
  let state=createDiner(now,`pressure-${seed}`);state.tutorial.finished=true;state.onboarding!.completed=true;
  if(mapVersion===6)for(const id of ['grill','prep','sink','plates'])state.equipment[id].tier=2;
  const load=buildServiceLoadout(1,['classic_burger'],mapVersion===6?{grill:2,prep:2,sink:2,plates:2}:{});state.truckConfig.stations=load.stations.map(({id,kind,x,y,facing})=>({id,kind,x,y,facing}));state.truckConfig.tables=mapVersion===6?[{id:'a',x:3,y:5,capacity:2,rotation:0},{id:'b',x:5,y:5,capacity:2,rotation:0}]:[{id:'table_1',x:3,y:5,capacity:1,rotation:0}];
  if(mapVersion===6){state.equipment.table_2={tier:1,homeCopies:0,truckOwned:true};state.truckConfig.tableCopies.table_2=2;}
  state=dispatchDiner(state,{type:'startRun',routeId:'downtown'},{now}).state;state.run!.mapVersion=mapVersion;state.run!.map=generateDinerMap(state.run!.seed,mapVersion);state.run!.serviceDays=4;
  const node={id:'comparison',row:6,column:0,kind,next:[],name:kind};const s=dinerStopService(state,state.run!,node),k=new Kitchen(s,20);
  r.n++;try{if(mapVersion===6)k.multiSeatLunch(prepared);else k.lunch(prepared);}catch{/* Failed seeds count, never disappear from the denominator. */}
  if(k.s.phase==='complete'){r.cleared++;r.coins+=k.s.coins+(k.s.config.completionBonus??0);r.seconds+=k.s.tick/20;}r.pressure+=k.queueTicks;
 }
 console.log(JSON.stringify({key,...r,coinsPerMinute:r.coins/r.seconds*60}));
}
const low=totals['slow:true'],high=totals['busy:true'];assert(high.cleared>=95);const ratio=(high.coins/high.seconds)/(low.coins/low.seconds);console.log('MEASURED prepared rush/relaxed income per active minute: '+ratio.toFixed(4));
assert(ratio>=1.2&&ratio<=1.3,'Prepared harder branches target 20–30% more income per active minute.');
if(mapVersion===6)for(const kind of ['slow','medium','busy']){
 const r=totals[`${kind}:true`];console.log('RENOVATION COOKING BOUND '+JSON.stringify({kind,sixtyClearHours:r.seconds/r.cleared*60/3600,sixtyClearCoins:r.coins/r.cleared*60,assumptions:'Measured upgraded solo burger loadout, 1-second decisions, preparation and clearing included. No home earnings, mastery upgrades, market purchases, decorating or menu discovery credited. This is a service-time bound, not a complete renovation campaign.'}));
}
const reactive=(totals['busy:false'].coins/totals['busy:false'].seconds)/(totals['slow:false'].coins/totals['slow:false'].seconds);assert(reactive>=1.2&&reactive<=1.3);
if(mapVersion===5)for(let seed=0;seed<100;seed++){const map=generateDinerMap(`branches-${seed}`,5);for(const row of [4,6,7,9]){assert(map.some(n=>n.row===row&&n.kind==='slow'));assert(map.some(n=>n.row===row&&['medium','busy','special'].includes(n.kind)));for(const before of map.filter(n=>n.row===row-1))assert.equal(before.next.length,2);}assert.equal(map.filter(n=>n.kind==='shop').map(n=>n.row).join(','),'3,8');}
if(mapVersion===5)console.log('PASS 100 legacy version-five route seeds preserve teaching stops, both pressure choices and the two shared markets.');
