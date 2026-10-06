import assert from 'node:assert/strict';
import {dispatchService,stepService} from '../src/lib/chef/diner/service';
import {ingredientSupply} from '../src/lib/chef/diner/content';
import type {ServiceAction,ServiceState} from '../src/lib/chef/diner/types';
export class Kitchen{
  maxQueue=0;queueTicks=0;decisions=0;arrivals:number[]=[];
  constructor(public s:ServiceState,readonly decisionTicks=20){}
  held(){return this.s.chef.held;}
  tick(ticks=1){for(let i=0;i<ticks;i++){const before=this.s.spawned;stepService(this.s);if(this.s.spawned>before)this.arrivals.push(this.s.tick);const queued=this.s.customers.filter(c=>c.phase==='queue').length;this.maxQueue=Math.max(this.maxQueue,queued);this.queueTicks+=queued;}}
  send(action:ServiceAction){if(['interact','hold','move'].includes(action.type)){this.tick(this.decisionTicks);this.decisions++;}this.s=dispatchService(this.s,action);}
  until(done:()=>boolean,max=6000){let ticks=0;while(!done()&&ticks++<max&&['preparing','playing','closing'].includes(this.s.phase))this.tick();assert(done(),`Timed out at ${this.s.tick}: ${this.s.notice}`);}
  touch(targetId:string,ingredientId?:string,recipeId?:string,seatId?:string){this.send({type:'interact',targetId,ingredientId,recipeId,seatId});this.until(()=>!this.s.chef.path.length);}
  ingredient(id:string){this.touch(ingredientSupply(id),id,'classic_burger');}
  burger(){this.ingredient('beef');this.touch('grill');this.until(()=>!!this.s.stations.find(st=>st.kind==='grill')!.slots[0].job?.ready);this.touch('grill');this.touch('prep');this.ingredient('bun');this.touch('prep');this.send({type:'hold',active:true});this.until(()=>!!this.s.stations.find(st=>st.kind==='prep')!.slots[0].job?.ready);this.send({type:'hold',active:false});this.touch('plates');this.touch('prep');assert.equal(this.s.chef.held?.kind,'dish');}
  wash(){this.touch('sink');this.send({type:'hold',active:true});this.until(()=>this.s.phase==='complete'||this.s.stations.find(st=>st.kind==='sink')!.slots.every(slot=>!slot.item));this.send({type:'hold',active:false});}
  /** Multiple simultaneous orders: recheck who is still waiting after cooking.
   * Uses the same physical actions and decision delay as the teaching fixture. */
  multiSeatLunch(prepared=false){
    this.send({type:'prepare'});if(prepared)this.burger();this.send({type:'open'});
    let guard=0;
    while(['playing','closing'].includes(this.s.phase)&&guard++<2000){
      if(this.s.served+this.s.missed===this.s.config.customers){this.until(()=>!['playing','closing'].includes(this.s.phase));break;}
      const guests=()=>this.s.customers.filter(c=>c.phase==='seated').sort((a,b)=>a.patience-b.patience);
      const dirty=this.s.tables.flatMap(table=>table.seats.filter(seat=>seat.item?.kind==='dirty').map(seat=>({table,seat})));
      const guest=guests()[0],blocked=guest&&dirty.find(d=>d.seat.id===guest.seatId);
      if(blocked||(!this.held()&&(!guest||!this.s.cleanPlates)&&dirty.length)){
        const target=blocked??dirty[0],saved=!!this.held();if(saved)this.touch('prep');
        this.touch(target.table.id,undefined,undefined,target.seat.id);if(this.held()?.kind==='dirty')this.wash();if(saved)this.touch('prep');continue;
      }
      if(guest){if(!this.held())this.burger();const ready=guests().find(c=>!this.s.tables.find(t=>t.id===c.tableId)?.seats.find(seat=>seat.id===c.seatId)?.item);if(ready)this.touch(ready.tableId!,undefined,undefined,ready.seatId!);continue;}
      this.tick(20);
    }
    assert.equal(this.s.phase,'complete',this.s.notice);
  }
  lunch(prepared=false){
    this.send({type:'prepare'});if(prepared)this.burger();this.send({type:'open'});let decisions=0;
    while(['playing','closing'].includes(this.s.phase)&&decisions++<100){
      const mess=this.s.messes?.[0];if(mess&&!this.s.chef.held){this.touch(mess.id);this.send({type:'hold',active:true});this.until(()=>!this.s.messes?.some(m=>m.id===mess.id));this.send({type:'hold',active:false});continue;}
      if(this.s.paid===this.s.config.customers){this.until(()=>this.s.phase==='complete');continue;}
      const dirty=this.s.tables.flatMap(table=>table.seats.filter(seat=>seat.item?.kind==='dirty').map(seat=>({table,seat})))[0];
      if(dirty&&!this.s.chef.held&&!this.s.helpers.some(h=>h.role==='washer')){this.touch(dirty.table.id,undefined,undefined,dirty.seat.id);assert.equal(this.held()?.kind,'dirty');this.wash();continue;}
      const guest=this.s.customers.find(c=>c.phase==='seated');
      if(guest){if(!this.s.chef.held)this.burger();this.touch(guest.tableId!,undefined,undefined,guest.seatId!);assert.equal(this.s.customers.find(c=>c.id===guest.id)!.phase,'eating',this.s.notice);continue;}
      this.until(()=>!['playing','closing'].includes(this.s.phase)||this.s.customers.some(c=>c.phase==='seated')||!this.s.helpers.some(h=>h.role==='washer')&&this.s.tables.some(t=>t.seats.some(seat=>seat.item?.kind==='dirty')));
    }
    assert.equal(this.s.phase,'complete',this.s.notice);
  }
}
