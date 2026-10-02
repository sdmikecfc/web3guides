/** Deterministic legal-input cooking driver for local career fixtures. */
import assert from 'node:assert/strict';
import {RECIPE_BY_ID,ingredientSupply} from '../src/lib/chef/diner/content';
import {serviceMissingIngredients,serviceRecipeSteps} from '../src/lib/chef/diner/service';
import {recipeVessel,vesselSupplyStation} from '../src/lib/chef/diner/batch';
import type {ServiceState,ServiceAction} from '../src/lib/chef/diner/types';
export class Cook {
  constructor(readonly get:()=>ServiceState,readonly send:(action:ServiceAction)=>void){}
  tick(n=1){this.send({type:'tick',ticks:n});}
  until(predicate:()=>boolean,limit=2000){let ticks=0;while(!predicate()&&ticks++<limit&&['playing','closing'].includes(this.get().phase))this.tick();assert(predicate(),`Cooking timed out: ${this.get().notice}`);}
  touch(targetId:string,recipeId?:string,seatId?:string,ingredientId?:string){this.send({type:'interact',targetId,recipeId,seatId,ingredientId});this.until(()=>this.get().chef.path.length===0);}
  dish(recipeId:string){
    if(recipeId==='fries'&&this.get().config.batchVersion&&this.get().stations.some(st=>st.slots.some(slot=>slot.batch?.phase==='raised'))){this.touch('boxes');this.touch('fryer');return;}
    const physical=this.get().config.physicalSupplies,primary=RECIPE_BY_ID[recipeId].ingredients[0];this.touch(physical?ingredientSupply(primary):'crate',recipeId,undefined,physical?primary:undefined);assert.equal(this.get().chef.held?.recipeId,recipeId);
    for(const [index,step] of serviceRecipeSteps(this.get(),recipeId).entries()){
      const station=this.get().stations.find(s=>s.kind===step.station)!,missing=serviceMissingIngredients(this.get().chef.held!);this.touch(station.id);
      for(const ingredientId of missing){this.touch(ingredientSupply(ingredientId),recipeId,undefined,ingredientId);this.touch(station.id);}
      this.send({type:'hold',active:true});
      this.until(()=>this.get().stations.find(s=>s.id===station.id)!.slots.some(slot=>slot.job?.ready));
      this.send({type:'hold',active:false});if(step.station==='boiler')this.touch(station.id);if(physical&&index===serviceRecipeSteps(this.get(),recipeId).length-1){if(recipeId==='fries'&&this.get().config.batchVersion)this.touch(station.id);this.touch(this.get().config.batchVersion?vesselSupplyStation(recipeVessel(recipeId))!:'plates');}this.touch(station.id);assert.equal(this.get().chef.held?.step,index+1);
    }
  }
  wash(tableId:string,seatId:string){this.touch(tableId,undefined,seatId);if(!this.get().chef.held)return;assert.equal(this.get().chef.held?.kind,'dirty');this.touch('sink');this.send({type:'hold',active:true});this.until(()=>this.get().stations.find(s=>s.kind==='sink')!.slots.every(slot=>!slot.item));this.send({type:'hold',active:false});}
  run(allowMisses=false){this.send({type:'open'});let guard=0;
    while(['playing','closing'].includes(this.get().phase)&&guard++<1000){
      const s=this.get();if(s.served+s.missed>=s.config.customers){this.tick(20);continue;}
      const guest=s.customers.filter(c=>c.phase==='seated').sort((a,b)=>a.patience-b.patience)[0];
      if(guest&&s.tables.some(table=>table.seats.some(seat=>seat.customerId===guest.id&&seat.item?.kind==='dirty'))){this.wash(guest.tableId!,guest.seatId!);continue;}if(guest&&(!s.config.physicalSupplies||recipeVessel(guest.recipeId)==='fry_box'||(recipeVessel(guest.recipeId)==='cup'?s.cleanCups:recipeVessel(guest.recipeId)==='bowl'?s.cleanBowls:s.cleanPlates)>0)){this.dish(guest.recipeId);this.touch(guest.tableId!,undefined,guest.seatId!);assert.equal(this.get().customers.find(c=>c.id===guest.id)?.phase,'eating',this.get().notice);continue;}
      const dirty=s.tables.flatMap(table=>table.seats.filter(seat=>seat.item?.kind==='dirty').map(seat=>({tableId:table.id,seatId:seat.id})))[0];
      if(dirty){this.wash(dirty.tableId,dirty.seatId);continue;}this.tick(10);
    }
    assert.equal(this.get().phase,'complete',this.get().notice);if(!allowMisses)assert.equal(this.get().missed,0);
  }
}
