import assert from 'node:assert/strict';
import { keyboardDirection, isTypingTarget, nearestTruckInteraction, firstLunchCoach } from '../src/app/chef/diner-preview/truck-controls';
import { createService, dispatchService, sanitizeService, serviceTargetIntent, stepService } from '../src/lib/chef/diner/service';
import { buildServiceLoadout, makeStation, makeTable, stationWorkingCell } from '../src/lib/chef/diner/geometry';
import type { ServiceAction, ServiceState } from '../src/lib/chef/diner/types';

let groups=0;
function check(name:string,run:()=>void){run();console.log(`PASS ${name}`);groups++;}
class Lunch {
  state=createService({seed:'input-coach',menu:['classic_burger'],customers:2,arrivalTicks:2400,tablePatienceTicks:12000,physicalSupplies:false});
  act(action:ServiceAction){this.state=dispatchService(this.state,action);}
  tick(ticks=1){stepService(this.state,ticks);}
  until(done:()=>boolean){let limit=2000;while(!done()&&limit-->0)this.tick();assert(done(),this.state.notice);}
  interact(targetId:string,seatId?:string){this.act({type:'interact',targetId,seatId});this.until(()=>!this.state.chef.path.length);}
  coach(heading:string,targetId?:string){const before=JSON.stringify(this.state),result=firstLunchCoach(this.state);assert.equal(result.heading,heading);if(targetId)assert.equal(result.targetId,targetId);assert.equal(JSON.stringify(this.state),before);return result;}
}
check('WASD and arrows keep their screen direction through all four camera turns',()=>{
  const pairs=[['w','ArrowUp'],['a','ArrowLeft'],['s','ArrowDown'],['d','ArrowRight']];
  for(const [letter,arrow] of pairs){
    const projected:number[][]=[];
    for(let rotation=0;rotation<4;rotation++){
      const direction=keyboardDirection(letter,rotation)!;assert.equal(Math.abs(direction.x)+Math.abs(direction.y),1);assert.deepEqual(direction,keyboardDirection(arrow,rotation));assert.deepEqual(direction,keyboardDirection(letter.toUpperCase(),rotation));
      const angle=rotation*Math.PI/2-Math.PI/4;projected.push([Math.cos(angle)*direction.x-Math.sin(angle)*direction.y,-Math.sin(angle)*direction.x-Math.cos(angle)*direction.y]);
    }
    for(const p of projected)for(let axis=0;axis<2;axis++)assert(Math.abs(p[axis]-projected[0][axis])<1e-9);
  }
  assert.deepEqual(keyboardDirection('w',-1),keyboardDirection('w',3));assert.deepEqual(keyboardDirection('w',9),keyboardDirection('w',1));
  for(const key of ['e','Escape',' ','__proto__','constructor'])assert.equal(keyboardDirection(key,0),null);assert.equal(keyboardDirection('w',NaN),null);
});
check('text entry is protected while focused buttons still allow cooking shortcuts',()=>{
  for(const tagName of ['input','TEXTAREA','Select'])assert(isTypingTarget({tagName}));
  assert(isTypingTarget({tagName:'SPAN',isContentEditable:true}));
  for(const target of [null,{}, {tagName:'BUTTON'}, {tagName:'SVG'}, {tagName:'DIV',isContentEditable:false}])assert.equal(isTypingTarget(target),false);
});
check('nearest interaction follows reachable sides, real recipe steps and explicit preferences',()=>{
  const lunch=new Lunch();assert.equal(nearestTruckInteraction(lunch.state),null);lunch.act({type:'open'});
  assert.deepEqual(nearestTruckInteraction(lunch.state),{targetId:'crate',recipeId:'classic_burger'});
  lunch.interact('crate');assert.equal(nearestTruckInteraction(lunch.state)?.targetId,'grill');
  assert.equal(nearestTruckInteraction(lunch.state,'missing')?.targetId,'grill');
  assert.equal(nearestTruckInteraction(lunch.state,'bin')?.targetId,'bin','explicit discard remains possible');
  assert.equal(nearestTruckInteraction(lunch.state,'prep')?.targetId,'prep','explicit safe put-down remains possible');
  const grill=lunch.state.stations.find(s=>s.kind==='grill')!;grill.facing=2;assert.equal(nearestTruckInteraction(lunch.state)?.targetId,'grill','another reachable side remains usable');
  lunch.state.stations.push(makeStation('sealed-front','bin',1,1));const chefPosition={x:lunch.state.chef.x,y:lunch.state.chef.y};Object.assign(lunch.state.chef,{x:1,y:2});assert.equal(nearestTruckInteraction(lunch.state),null,'a fully enclosed grill cannot be selected through its corners');lunch.state.stations.pop();Object.assign(lunch.state.chef,chefPosition);
  grill.facing=0;lunch.state.config.tier=2;lunch.state.stations.push(makeStation('second-grill','grill',4,0,1,0));
  lunch.state.chef={...lunch.state.chef,...stationWorkingCell(lunch.state.stations.at(-1)!)};assert.equal(nearestTruckInteraction(lunch.state)?.targetId,'second-grill');
});
check('first lunch coaching follows an actual burger from crate through washing',()=>{
  const lunch=new Lunch();lunch.coach('Get ready to cook');lunch.act({type:'open'});lunch.coach('Take fresh ingredients','crate');
  lunch.until(()=>lunch.state.customers.some(c=>c.phase==='seated'));lunch.interact('crate');lunch.coach('Put the patty on the grill','grill');lunch.interact('grill');lunch.coach('Let it cook','grill');
  lunch.until(()=>!!lunch.state.stations.find(s=>s.kind==='grill')!.slots[0].job?.ready);lunch.coach('Take the cooked food','grill');assert.equal(nearestTruckInteraction(lunch.state)?.targetId,'grill','a ready patty wins over nearby raw ingredients');lunch.interact('grill');lunch.coach('Add the bun','prep');lunch.interact('prep');lunch.coach('Hold to finish the dish','prep');
  const intent=nearestTruckInteraction(lunch.state)!;assert.equal(intent.targetId,'prep');assert(serviceTargetIntent(lunch.state,intent.targetId,intent.seatId,intent.recipeId).hold);
  lunch.act({type:'hold',active:true});lunch.until(()=>!!lunch.state.stations.find(s=>s.kind==='prep')!.slots[0].job?.ready);lunch.act({type:'hold',active:false});lunch.coach('Pick up the finished dish','prep');lunch.interact('prep');
  const guest=lunch.state.customers.find(c=>c.phase==='seated')!,serve=nearestTruckInteraction(lunch.state)!;assert.deepEqual(serve,{targetId:guest.tableId!,seatId:guest.seatId!});lunch.coach('Serve your guest',guest.tableId!);lunch.interact(serve.targetId,serve.seatId);lunch.coach('Let your guest enjoy it',guest.tableId!);
  lunch.until(()=>lunch.state.tables.some(table=>table.seats.some(seat=>seat.status==='dirty')));lunch.coach('Clear the used plate',guest.tableId!);const dirty=nearestTruckInteraction(lunch.state,guest.tableId!)!;assert.equal(dirty.seatId,guest.seatId);lunch.interact(dirty.targetId,dirty.seatId);lunch.coach('Bring the plate to the sink','sink');assert.equal(nearestTruckInteraction(lunch.state)?.targetId,'sink');lunch.interact('sink');lunch.coach('Hold to wash the plate','sink');
  lunch.act({type:'hold',active:true});lunch.until(()=>lunch.state.washed===1);lunch.act({type:'hold',active:false});lunch.coach('Take fresh ingredients','crate');assert.equal(lunch.state.served,1);assert.equal(lunch.state.washed,1);
});
check('recipient seats, renamed fixtures, burnt food and pause use current state only',()=>{
  const lunch=new Lunch();lunch.act({type:'open'});lunch.until(()=>lunch.state.customers.some(c=>c.phase==='seated'));
  const crate=lunch.state.stations.find(s=>s.kind==='crate')!;crate.id='my-ingredients';assert.equal(firstLunchCoach(lunch.state).targetId,'my-ingredients');assert.equal(nearestTruckInteraction(lunch.state)?.targetId,'my-ingredients');
  lunch.interact(crate.id);lunch.interact('grill');lunch.until(()=>lunch.state.stations.find(s=>s.kind==='grill')!.slots[0].item?.kind==='burnt');lunch.coach('Remove the burnt food','grill');lunch.interact('grill');lunch.coach('Clear the burnt food','bin');assert.equal(nearestTruckInteraction(lunch.state)?.targetId,'bin');
  lunch.act({type:'pause'});lunch.coach('Lunch is paused');assert.equal(nearestTruckInteraction(lunch.state),null);
  const synthetic:ServiceState=structuredClone(lunch.state);synthetic.phase='playing';synthetic.chef.held={id:'finished',recipeId:'fries',kind:'dish',step:1,stage:'plated_fries',cold:false,createdTick:0};
  assert.equal(nearestTruckInteraction(synthetic),null,'a different order cannot receive this plate or cause implicit discarding');assert.equal(firstLunchCoach(synthetic).heading,'Keep the dish ready');
});
check('physical coaching walks a patty, bun and finite plate through the exact first lunch',()=>{
  const lunch=new Lunch();lunch.state=createService({seed:'physical-coach',menu:['classic_burger'],customers:2,arrivalTicks:2400,tablePatienceTicks:12000,physicalSupplies:true});lunch.act({type:'open'});
  const take=(targetId:string)=>{const target=nearestTruckInteraction(lunch.state)!;assert.equal(target?.targetId,targetId,lunch.state.notice);const intent=serviceTargetIntent(lunch.state,target.targetId,target.seatId,target.recipeId);assert.equal(intent.disabled,false);lunch.act({type:'interact',...target});lunch.until(()=>!lunch.state.chef.path.length);};
  lunch.coach('Take a raw patty','fridge');assert.deepEqual(nearestTruckInteraction(lunch.state),{targetId:'fridge',recipeId:'classic_burger',ingredientId:'beef'});take('fridge');assert.equal(lunch.state.chef.held?.ingredientId,'beef');
  lunch.coach('Put the patty on the grill','grill');take('grill');lunch.coach('Let it cook','grill');lunch.until(()=>!!lunch.state.stations.find(s=>s.kind==='grill')!.slots[0].job?.ready);lunch.coach('Take the cooked food','grill');take('grill');
  lunch.coach('Set it on the prep counter','prep');take('prep');lunch.coach('Take the bun','crate');assert.deepEqual(nearestTruckInteraction(lunch.state),{targetId:'crate',recipeId:'classic_burger',ingredientId:'bun'});take('crate');lunch.coach('Add the bun','prep');take('prep');
  lunch.coach('Hold to finish the dish','prep');lunch.act({type:'hold',active:true});lunch.until(()=>!!lunch.state.stations.find(s=>s.kind==='prep')!.slots[0].job?.ready);lunch.act({type:'hold',active:false});
  lunch.coach('Fetch a clean plate','plates');const count=lunch.state.cleanPlates;take('plates');assert.equal(lunch.state.cleanPlates,count-1);lunch.coach('Plate your finished food','prep');take('prep');assert.equal(lunch.state.chef.held?.kind,'dish');assert(lunch.state.chef.held?.plateId);
  lunch.until(()=>lunch.state.customers.some(c=>c.phase==='seated'));const guest=lunch.state.customers.find(c=>c.phase==='seated')!;lunch.coach('Serve your guest',guest.tableId!);take(guest.tableId!);lunch.until(()=>lunch.state.tables.some(t=>t.seats.some(s=>s.status==='dirty')));lunch.coach('Clear the used plate',guest.tableId!);take(guest.tableId!);lunch.coach('Bring the plate to the sink','sink');take('sink');lunch.coach('Hold to wash the plate','sink');lunch.act({type:'hold',active:true});lunch.until(()=>lunch.state.washed===1);lunch.act({type:'hold',active:false});assert.equal(lunch.state.cleanPlates,count);
});
check('prepared food requests a real free plate and never sends an empty-handed chef back to a full prep',()=>{
  const lunch=new Lunch();lunch.state=createService({seed:'plate-needed',menu:['fries'],customers:2,arrivalTicks:2400,tablePatienceTicks:12000,physicalSupplies:true,batchVersion:0});lunch.act({type:'open'});
  const take=(targetId:string)=>{lunch.act({type:'interact',targetId,...(targetId==='crate'?{recipeId:'fries',ingredientId:'potato'}:{})});lunch.until(()=>!lunch.state.chef.path.length);};
  assert.equal(firstLunchCoach(lunch.state).targetId,'crate');take('crate');assert.equal(nearestTruckInteraction(lunch.state)?.targetId,'fryer');take('fryer');lunch.until(()=>!!lunch.state.stations.find(s=>s.kind==='fryer')!.slots[0].job?.ready);
  assert.equal(firstLunchCoach(lunch.state).targetId,'plates');assert.equal(nearestTruckInteraction(lunch.state)?.targetId,'plates');
  lunch.state.cleanPlates=0;lunch.state.plateStock=[];assert.notEqual(nearestTruckInteraction(lunch.state)?.targetId,'plates','empty rack cannot be selected');
  const before=JSON.stringify(lunch.state);firstLunchCoach(lunch.state);nearestTruckInteraction(lunch.state);assert.equal(JSON.stringify(lunch.state),before);
});
check('prep-ahead controls cut a potato, raise the basket and fetch boxes for three portions',()=>{
  const lunch=new Lunch();lunch.state=createService({seed:'batch-coach',menu:['fries'],...buildServiceLoadout(1,['fries'])});lunch.act({type:'prepare'});assert.equal(lunch.state.phase,'preparing');
  const take=(targetId:string)=>{const target=nearestTruckInteraction(lunch.state)!;assert.equal(target?.targetId,targetId,lunch.state.notice);lunch.act({type:'interact',...target});lunch.until(()=>!lunch.state.chef.path.length);};
  take('crate');take('prep');lunch.act({type:'hold',active:true});lunch.until(()=>!!lunch.state.stations.find(s=>s.kind==='prep')!.slots[0].job?.ready);lunch.act({type:'hold',active:false});take('prep');take('fryer');
  lunch.until(()=>lunch.state.stations.find(s=>s.kind==='fryer')!.slots[0].batch?.phase==='ready');lunch.coach('Raise the fryer basket','fryer');take('fryer');lunch.coach('Fetch a fries box','boxes');
  for(let i=0;i<3;i++){take('boxes');lunch.coach('Box one serving of fries','fryer');take('fryer');assert.equal(lunch.state.chef.held?.kind,'dish');assert.equal(lunch.state.chef.held?.vesselKind,'fry_box');lunch.interact('bin');}
  assert.equal(lunch.state.stations.find(s=>s.kind==='fryer')!.slots[0].item,null);assert.equal(lunch.state.spawned,0);
});
check('ready drinks lead to cups, and an empty cup pool never redirects to burger plates',()=>{
  const lunch=new Lunch();lunch.state=createService({seed:'cup-coach',menu:['coffee'],...buildServiceLoadout(1,['coffee'])});lunch.act({type:'prepare'});
  const take=(targetId:string)=>{const target=nearestTruckInteraction(lunch.state)!;assert.equal(target?.targetId,targetId,lunch.state.notice);lunch.act({type:'interact',...target});lunch.until(()=>!lunch.state.chef.path.length);};
  take('crate');take('coffee');lunch.until(()=>!!lunch.state.stations.find(s=>s.kind==='coffee')!.slots[0].job?.ready);lunch.coach('Fetch a cup','cups');take('cups');lunch.coach('Pour into the cup','coffee');take('coffee');assert.equal(lunch.state.chef.held?.vesselKind,'cup');lunch.interact('bin');take('sink');lunch.act({type:'hold',active:true});lunch.until(()=>lunch.state.cleanCups===2);lunch.act({type:'hold',active:false});assert.equal(lunch.state.washed,0,'discarding a drink is not a completed customer meal');
  take('crate');take('coffee');lunch.until(()=>!!lunch.state.stations.find(s=>s.kind==='coffee')!.slots[0].job?.ready);lunch.state.cleanCups=0;lunch.state.cupStock=[];assert.equal(nearestTruckInteraction(lunch.state),null);assert.notEqual(firstLunchCoach(lunch.state).targetId,'plates');
});
check('noodle coaching follows real boiling, drain, sauce, bowl serving and washing across reload',()=>{
  const lunch=new Lunch();lunch.state=createService({seed:'noodle-coach',menu:['tomato_pasta'],...buildServiceLoadout(1,['tomato_pasta']),customers:2,tutorialLearning:true});lunch.act({type:'prepare'});
  const take=(targetId:string)=>{const target=nearestTruckInteraction(lunch.state)!;assert.equal(target?.targetId,targetId,lunch.state.notice);assert.equal(serviceTargetIntent(lunch.state,target.targetId,target.seatId,target.recipeId).disabled,false);lunch.act({type:'interact',...target});lunch.until(()=>!lunch.state.chef.path.length);};
  lunch.coach('Take the pasta','crate');take('crate');take('boiler');lunch.coach('Let the noodles boil','boiler');lunch.until(()=>lunch.state.stations.find(s=>s.kind==='boiler')!.slots[0].boil?.phase==='ready');
  lunch.coach('Lift & drain the noodles','boiler');take('boiler');assert.equal(lunch.state.chef.held,null);lunch.coach('Collect the drained noodles','boiler');
  lunch.state=sanitizeService(lunch.state)!;assert(lunch.state);lunch.coach('Lunch is paused');lunch.act({type:'resume'});lunch.coach('Collect the drained noodles','boiler');take('boiler');lunch.coach('Set it on the prep counter','prep');take('prep');
  lunch.coach('Take the tomato sauce','crate');assert.equal(nearestTruckInteraction(lunch.state)?.ingredientId,'tomato_sauce');take('crate');lunch.coach('Add the tomato sauce','prep');take('prep');lunch.coach('Hold to finish the dish','prep');
  lunch.act({type:'hold',active:true});lunch.until(()=>!!lunch.state.stations.find(s=>s.kind==='prep')!.slots[0].job?.ready);lunch.act({type:'hold',active:false});lunch.coach('Fetch a clean bowl','bowls');take('bowls');lunch.coach('Fill the bowl','prep');take('prep');assert.equal(lunch.state.chef.held?.vesselKind,'bowl');
  lunch.act({type:'open'});lunch.until(()=>lunch.state.customers.some(c=>c.phase==='seated'));const guest=lunch.state.customers.find(c=>c.phase==='seated')!;lunch.coach('Serve your guest',guest.tableId!);take(guest.tableId!);assert.match(lunch.coach('Let your guest enjoy it',guest.tableId!).detail,/dirty bowl/);
  lunch.until(()=>lunch.state.tables.some(t=>t.seats.some(s=>s.item?.kind==='dirty')));lunch.coach('Clear the used bowl',guest.tableId!);take(guest.tableId!);lunch.coach('Bring the bowl to the sink','sink');take('sink');lunch.coach('Hold to wash the bowl','sink');lunch.act({type:'hold',active:true});lunch.until(()=>lunch.state.cleanBowls===2);assert.equal(lunch.state.cleanPlates,0);assert(sanitizeService(lunch.state));
});
check('ramen coaching requests pantry broth then cold vegetables instead of prematurely plating noodles',()=>{
  const lunch=new Lunch();lunch.state=createService({seed:'ramen-coach',menu:['vegetable_ramen'],...buildServiceLoadout(1,['vegetable_ramen'])});lunch.act({type:'prepare'});
  const take=(targetId:string)=>{const target=nearestTruckInteraction(lunch.state)!;assert.equal(target?.targetId,targetId,lunch.state.notice);lunch.act({type:'interact',...target});lunch.until(()=>!lunch.state.chef.path.length);};
  take('crate');take('boiler');lunch.until(()=>lunch.state.stations.find(s=>s.kind==='boiler')!.slots[0].boil?.phase==='ready');take('boiler');take('boiler');take('prep');
  lunch.coach('Take the vegetable broth','crate');take('crate');take('prep');assert.equal(lunch.state.stations.find(s=>s.kind==='prep')!.slots[0].job,null);lunch.coach('Take the mixed vegetables','fridge');assert.equal(nearestTruckInteraction(lunch.state)?.ingredientId,'mixed_vegetables');take('fridge');lunch.coach('Add the mixed vegetables','prep');take('prep');lunch.coach('Hold to finish the dish','prep');
  lunch.act({type:'hold',active:true});lunch.until(()=>!!lunch.state.stations.find(s=>s.kind==='prep')!.slots[0].job?.ready);lunch.act({type:'hold',active:false});lunch.state.cleanBowls=0;lunch.state.bowlStock=[];assert.equal(nearestTruckInteraction(lunch.state),null);lunch.coach('Wait for a clean bowl');assert.notEqual(firstLunchCoach(lunch.state).targetId,'plates');
});
check('a new guest at a dirty place is cleared first without confusing the old and current meal',()=>{
  const lunch=new Lunch();lunch.state=createService({seed:'dirty-place-coach',menu:['classic_burger'],customers:2,arrivalTicks:40,queuePatienceTicks:12000,tablePatienceTicks:12000,physicalSupplies:false,tables:[makeTable('one-table',3,5,1)]});lunch.act({type:'open'});
  const cook=()=>{lunch.interact('crate');lunch.interact('grill');lunch.until(()=>!!lunch.state.stations.find(s=>s.kind==='grill')!.slots[0].job?.ready);lunch.interact('grill');lunch.interact('prep');lunch.act({type:'hold',active:true});lunch.until(()=>!!lunch.state.stations.find(s=>s.kind==='prep')!.slots[0].job?.ready);lunch.act({type:'hold',active:false});lunch.interact('prep');};
  lunch.until(()=>lunch.state.customers.some(c=>c.phase==='seated'));const first=structuredClone(lunch.state.customers.find(c=>c.phase==='seated')!);cook();lunch.interact(first.tableId!,first.seatId!);
  lunch.until(()=>lunch.state.customers.some(c=>c.id!==first.id&&c.phase==='seated'));const guest=structuredClone(lunch.state.customers.find(c=>c.id!==first.id&&c.phase==='seated')!),seat=lunch.state.tables[0].seats[0];assert.equal(seat.status,'occupied');assert.equal(seat.item?.kind,'dirty');assert.equal(seat.item?.meal?.mealId,first.mealId);
  lunch.coach('Clear the used plate','one-table');assert.deepEqual(nearestTruckInteraction(lunch.state),{targetId:'one-table',seatId:seat.id});
  cook();lunch.coach('Set the dish down first','prep');assert.equal(nearestTruckInteraction(lunch.state)?.targetId,'prep');lunch.interact('prep');assert.deepEqual(nearestTruckInteraction(lunch.state),{targetId:'one-table',seatId:seat.id});lunch.interact('one-table',seat.id);
  assert.equal(lunch.state.chef.held?.meal?.mealId,first.mealId);assert.equal(lunch.state.tables[0].seats[0].mealId,guest.mealId);assert.equal(lunch.state.tables[0].seats[0].customerId,guest.id);assert.equal(lunch.state.tables[0].seats[0].status,'occupied');
});
console.log(`PASS ${groups} diner controls groups`);
