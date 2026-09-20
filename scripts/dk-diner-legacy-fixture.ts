/** Historical square home used to retain pre-stage compatibility assertions. */
import {createDiner,type DinerState} from '../src/lib/chef/diner/progression';
export function createLegacyDinerFixture(now:number,seed='legacy-home'):DinerState {
 const state=createDiner(now,seed);delete state.home.roomPlan;delete state.home.fixtureInventory;
 state.home.w=state.home.h=8;state.home.expansion=0;state.home.staff={chefs:1,waiters:1};
 state.staffMembers=state.staffMembers.filter(member=>member.role!=='cashier');state.equipment.table_2.homeCopies=1;
 state.home.layout=[{id:'grill-1',equipmentId:'grill',x:1,y:0,rotation:0},{id:'prep-1',equipmentId:'prep',x:3,y:0,rotation:0},{id:'sink-1',equipmentId:'sink',x:5,y:0,rotation:0},{id:'table-1',equipmentId:'table_2',x:2,y:3,rotation:0}];
 return state;
}
