import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createDiner,dispatchDiner,sanitizeDinerSave} from '../src/lib/chef/diner/progression';
import {decorationDiscoveries,roomWindows} from '../src/lib/chef/diner/decor-discoveries';
import {createDiscoveryEffects} from '../src/app/chef/diner-preview/discovery-effects';

const now=1800000000000,state=createDiner(now,'discovery-check'),plan=state.home.roomPlan!;
const item=(id:string,x:number,y:number)=>({id,equipmentId:id,x,y,rotation:0 as const});
for(const [id,a,b] of [['coffee_pie','coffee_sign','pie_display'],['welcome_bear','bear_statue','welcome_mat'],['radio_mascot','retro_radio','burger_mascot']] as const){
 const home={roomPlan:plan,layout:[item(a,2,5),item(b,4,5)]};
 assert(decorationDiscoveries(home).some(d=>d.id===id));
 for(const rotation of [0,1,2,3] as const){home.layout[1]={...home.layout[1],rotation} as typeof home.layout[number];assert(decorationDiscoveries(home).some(d=>d.id===id));}
 home.layout[1].x=4.01;assert(!decorationDiscoveries(home).length);
 home.layout.pop();assert(!decorationDiscoveries(home).length);
}
const window=roomWindows(plan)[0];
const garden={roomPlan:plan,layout:[item('red_planter',0,window.y-.5),item('herb_planter',0,window.y+.5)]};
assert(decorationDiscoveries(garden).some(d=>d.id==='window_garden'));
garden.layout[1].x=2;assert(!decorationDiscoveries(garden).length);
const mounted={roomPlan:plan,layout:[{...item('coffee_sign',99,99),mount:{kind:'wall' as const,targetId:'outer-side',slot:5}},item('pie_display',1,5)]};
assert(decorationDiscoveries(mounted).some(d=>d.id==='coffee_pie'),'Mounted coordinates override stale floor coordinates');
mounted.layout[1].x=2;assert(!decorationDiscoveries(mounted).length);

const radio=state.home.layout.find(p=>p.equipmentId==='retro_radio')!,mascot=state.home.layout.find(p=>p.equipmentId==='burger_mascot')!;
assert(radio&&mascot);
const before=JSON.stringify(state);decorationDiscoveries(state.home);assert.equal(JSON.stringify(state),before);
const commit=dispatchDiner(state,{type:'homeLayout',layout:state.home.layout},{now});assert(!commit.error,commit.error);
const reloaded=sanitizeDinerSave(JSON.parse(JSON.stringify(commit.state)));assert(reloaded);
assert.deepEqual(reloaded.personal!.discoveries,commit.state.personal!.discoveries);
const again=dispatchDiner(commit.state,{type:'homeLayout',layout:commit.state.home.layout},{now});assert(!again.error,again.error);assert.deepEqual(again.state.personal!.discoveries,commit.state.personal!.discoveries);

const parent=new THREE.Group(),effects=createDiscoveryEffects(parent),d={id:'window_garden' as const,objects:['a','b'],x:0,y:4,height:1.6},root=parent.children[0];
effects.update(0,[d],false,false,()=>undefined);assert.equal(root.children.length,2);assert(root.userData.inputPassthrough);
effects.update(6,[d],false,false,()=>undefined);assert.equal(root.children.length,0);
effects.update(59,[d],false,false,()=>undefined);assert.equal(root.children.length,0);
effects.update(62,[d],false,true,()=>undefined);const still=root.children.map(c=>({position:c.position.toArray(),rotation:c.rotation.toArray()}));
effects.update(80,[d],false,true,()=>undefined);assert.deepEqual(root.children.map(c=>({position:c.position.toArray(),rotation:c.rotation.toArray()})),still);
effects.dispose();assert.equal(parent.children.length,0);
console.log('PASS all four combinations, rotation/storage/distance, mount resolution, reload/idempotence, animation spacing, reduced motion and disposal.');
