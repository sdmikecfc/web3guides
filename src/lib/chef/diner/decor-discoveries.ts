import type {DinerState,HomePlacement} from './progression';
import {resolveDecorationMount,type RoomPlan} from './room-plan';
export const DISCOVERIES={
 window_garden:{name:'A window garden',hint:'Two planters within one tile of a window invite butterflies.',items:['red_planter','herb_planter','daisy_pot','leafy_plant','brass_planter']},
 coffee_pie:{name:'Coffee and a slice',hint:'Pairs with a fresh coffee sign or pie display within two tiles.',items:['coffee_sign','pie_display']},
 welcome_bear:{name:'A warm welcome',hint:'Pairs with a friendly bear or welcome mat within two tiles.',items:['bear_statue','welcome_mat']},
 radio_mascot:{name:'Lunch-break dance',hint:'Pairs with the lunch-break radio or burger mascot within two tiles.',items:['retro_radio','burger_mascot']},
} as const;
export type DiscoveryId=keyof typeof DISCOVERIES;
export interface DecorDiscovery {id:DiscoveryId;objects:string[];x:number;y:number;height:number}
export const roomWindows=(plan:Pick<RoomPlan,'h'>)=>[Math.max(2.25,plan.h-5.35),plan.h-2.25].map(y=>({x:-.476,y,width:2.02}));
export function decorationDiscoveries(home:Pick<DinerState['home'],'layout'|'roomPlan'>):DecorDiscovery[]{
 const plan=home.roomPlan;if(!plan)return [];
 const placed=home.layout.flatMap(p=>{const m=p.mount?resolveDecorationMount(plan,p,home.layout):null;if(p.mount&&!m)return [];return [{...p,x:m?.x??p.x,y:m?.y??p.y,height:m?.surfaceHeight??0}];});
 const results:DecorDiscovery[]=[],near=(a:HomePlacement,b:HomePlacement)=>Math.hypot(a.x-b.x,a.y-b.y)<=2;
 for(const id of ['coffee_pie','welcome_bear','radio_mascot'] as const){const [first,second]=DISCOVERIES[id].items;const a=placed.find(p=>p.equipmentId===first&&placed.some(q=>q.equipmentId===second&&near(p,q))),b=a&&placed.find(q=>q.equipmentId===second&&near(a,q));if(a&&b){const focal=id==='coffee_pie'?b:id==='welcome_bear'?a:b;results.push({id,objects:[a.id,b.id],x:focal.x,y:focal.y,height:focal.height});}}
 for(const window of roomWindows(plan)){const plants=placed.filter(p=>(DISCOVERIES.window_garden.items as readonly string[]).includes(p.equipmentId)&&Math.hypot(p.x-window.x,Math.max(0,Math.abs(p.y-window.y)-window.width/2))<=1);if(plants.length>=2&&near(plants[0],plants[1])){results.push({id:'window_garden',objects:plants.slice(0,2).map(p=>p.id),x:window.x-.18,y:window.y,height:1.6});break;}}
 return results;
}
export function pairingHint(id:string){return Object.values(DISCOVERIES).find(d=>(d.items as readonly string[]).includes(id))?.hint;}
