/** Deterministic legal-input cooking driver for local career fixtures. */
import assert from 'node:assert/strict';
import {RECIPE_BY_ID,ingredientSupply} from '../src/lib/chef/diner/content';
import {serviceMissingIngredients,serviceRecipeSteps,isUsedFriesBox} from '../src/lib/chef/diner/service';
import {recipeVessel,vesselSupplyStation} from '../src/lib/chef/diner/batch';
import type {ServiceState,ServiceAction} from '../src/lib/chef/diner/types';
export class Cook {
  constructor(readonly get:()=>ServiceState,readonly send:(action:ServiceAction)=>void,readonly decisionTicks=0){}
  tick(n=1){this.send({type:'tick',ticks:n});}
  until(predicate:()=>boolean,limit=2000){let ticks=0;while(!predicate()&&ticks++<limit&&['preparing','playing','closing'].includes(this.get().phase))this.tick();assert(predicate(),`Cooking timed out: ${this.get().notice}`);}
  touch(targetId:string,recipeId?:string,seatId?:string,ingredientId?:string,itemId?:string){if(this.decisionTicks)this.tick(this.decisionTicks);this.send({type:'interact',targetId,recipeId,seatId,ingredientId,itemId});this.until(()=>this.get().chef.path.length===0);}
  dish(recipeId:string,vesselFirst=true){
    if(recipeId==='fries'&&this.get().config.batchVersion&&this.get().stations.some(st=>st.slots.some(slot=>slot.batch?.phase==='raised'))){if(vesselFirst)this.touch('boxes');this.touch('fryer');return;}
    const physical=this.get().config.physicalSupplies,primary=RECIPE_BY_ID[recipeId].ingredients[0];
    const finite=this.get().stations.flatMap(st=>st.slots.filter(slot=>slot.portions?.ready&&slot.item?.recipeId===recipeId).map(slot=>({st,slot})))[0];
    if(finite&&recipeId==='house_red'){this.touch('cups');this.touch(finite.st.id,undefined,undefined,undefined,finite.slot.item!.id);return;}
    if(finite)this.touch(finite.st.id,undefined,undefined,undefined,finite.slot.item!.id);
    const boiler=this.get().stations.find(st=>st.kind==='boiler'),batch=boiler?.slots.find(slot=>slot.item&&slot.boil?.version===2&&slot.boil.phase!=='cooking'&&(recipeId.endsWith('_soup')?slot.item.recipeId===recipeId:!slot.item.recipeId.endsWith('_soup')&&RECIPE_BY_ID[slot.item.recipeId].ingredients[0]===primary));
    if(batch){const itemId=batch.item!.id;if(batch.boil?.phase==='ready')this.touch(boiler!.id,undefined,undefined,undefined,itemId);if(recipeId.endsWith('_soup'))this.touch('bowls');this.touch(boiler!.id,undefined,undefined,undefined,itemId);}else if(!finite)this.touch(physical?ingredientSupply(primary):'crate',recipeId,undefined,physical?primary:undefined);if(!batch)assert.equal(this.get().chef.held?.recipeId,recipeId);
    for(const [index,step] of serviceRecipeSteps(this.get(),recipeId).entries()){
      if((batch||finite)&&index===0)continue;const station=this.get().stations.find(s=>s.kind===step.station)!,boilId=step.station==='boiler'?this.get().chef.held?.id:undefined,missing=serviceMissingIngredients(this.get().chef.held!);this.touch(station.id,recipeId);
      for(const ingredientId of missing){this.touch(ingredientSupply(ingredientId),recipeId,undefined,ingredientId);if(recipeId==='chicken_ramen'&&ingredientId==='chicken'&&this.get().config.cookingVersion===1){this.touch('grill');this.until(()=>!!this.get().stations.find(s=>s.kind==='grill')!.slots[0].job?.ready);this.touch('grill');}this.touch(station.id);}
      this.send({type:'hold',active:true});
      this.until(()=>this.get().stations.find(s=>s.id===station.id)!.slots.some(slot=>slot.job?.ready&&(!boilId||slot.item?.id===boilId)));
      this.send({type:'hold',active:false});if(step.station==='fryer'&&this.get().config.batchVersion&&['fries','cheese_fries'].includes(recipeId)){
        // Tier three already lifts the basket. Touching it empty-handed again
        // takes an unfinished portion instead of merely raising it.
        if(this.get().stations.find(s=>s.id===station.id)!.slots.some(slot=>slot.batch?.phase==='ready'))this.touch(station.id);
        if(recipeId==='fries'){if(vesselFirst)this.touch('boxes');this.touch(station.id);return;}this.touch(station.id);continue;
      }if(step.station==='boiler'){if(recipeId.endsWith('_soup'))this.touch('bowls');else this.touch(station.id,undefined,undefined,undefined,boilId);}if(vesselFirst&&physical&&!this.get().chef.held?.plateId&&!this.get().stations.find(s=>s.id===station.id)!.slots.some(slot=>slot.item?.plateId)&&index===serviceRecipeSteps(this.get(),recipeId).length-1){if(recipeId==='fries'&&this.get().config.batchVersion)this.touch(station.id);this.touch(this.get().config.batchVersion?vesselSupplyStation(recipeVessel(recipeId))!:'plates');}this.touch(station.id,undefined,undefined,undefined,boilId);assert.equal(this.get().chef.held?.step,index+1);
    }
  }
  wash(tableId:string,seatId:string){this.touch(tableId,undefined,seatId);if(!this.get().chef.held)return;assert.equal(this.get().chef.held?.kind,'dirty');if(isUsedFriesBox(this.get().chef.held)){this.touch('bin');return;}this.touch('sink');this.send({type:'hold',active:true});this.until(()=>this.get().stations.find(s=>s.kind==='sink')!.slots.every(slot=>!slot.item));this.send({type:'hold',active:false});}
  run(allowMisses=false){this.send({type:'open'});let guard=0;
    while(['playing','closing'].includes(this.get().phase)&&guard++<4000){
      const s=this.get();const mess=s.messes?.[0];if(mess&&!s.chef.held){this.touch(mess.id);this.send({type:'hold',active:true});this.until(()=>!this.get().messes?.some(m=>m.id===mess.id));this.send({type:'hold',active:false});continue;}if(s.served+s.missed>=s.config.customers){this.tick(20);continue;}
      const guest=s.customers.filter(c=>c.phase==='seated').sort((a,b)=>a.patience-b.patience)[0];
      if(guest&&s.tables.some(table=>table.seats.some(seat=>seat.customerId===guest.id&&seat.item?.kind==='dirty'))){this.wash(guest.tableId!,guest.seatId!);continue;}if(guest&&(!s.config.physicalSupplies||recipeVessel(guest.recipeId)==='fry_box'||(recipeVessel(guest.recipeId)==='cup'?s.cleanCups:recipeVessel(guest.recipeId)==='bowl'?s.cleanBowls:s.cleanPlates)>0)){this.dish(guest.recipeId);this.touch(guest.tableId!,undefined,guest.seatId!);assert.equal(this.get().customers.find(c=>c.id===guest.id)?.phase,'eating',this.get().notice);continue;}
      const dirty=s.tables.flatMap(table=>table.seats.filter(seat=>seat.item?.kind==='dirty').map(seat=>({tableId:table.id,seatId:seat.id})))[0];
      if(dirty){this.wash(dirty.tableId,dirty.seatId);continue;}this.tick(10);
    }
    assert.equal(this.get().phase,'complete',this.get().notice);if(!allowMisses)assert.equal(this.get().missed,0);
  }
}
