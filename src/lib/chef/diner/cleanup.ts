import {blockedCells,inServiceFloor,pointKey,serviceGeometry,servicePath,serviceQueueSlots} from './geometry';
import type {ServiceState,Point} from './types';
export interface ServiceMess extends Point {id:string;progress:number;createdTick:number}
export const CLEANUP_RULES={version:1,limit:4,workTicks:60,minimumGap:300,chance:.15,patiencePerMess:.1} as const;
export function cleanupDrain(count:number):number{return 1+Math.min(4,Math.max(0,count))*.1;}
/** Messes use walkable pavement, never collision geometry or reserved queue cells. */
export function leaveServiceMess(s:ServiceState,near:Point,roll:number):boolean {
  if(!s.config.destinationVersion||(s.messes?.length??0)>=4||s.tick-(s.lastMessTick??-300)<300)return false;
  const teaching=s.config.cleanupLesson&&!s.cleanupIntroduced;if(!teaching&&roll>=CLEANUP_RULES.chance)return false;
  const occupied=blockedCells(s.stations,s.tables),queue=new Set(serviceQueueSlots(s.config.tier,s.stations,s.tables).map(pointKey)),g=serviceGeometry(s.config.tier);
  const candidates:Point[]=[];for(let y=0;y<g.pavement.h;y++)for(let x=0;x<g.pavement.w;x++){const p={x:x+g.pavement.x,y:y+g.pavement.y};if(!inServiceFloor(s.config.tier,p)||occupied.has(pointKey(p))||queue.has(pointKey(p))||(s.messes??[]).some(m=>m.x===p.x&&m.y===p.y)||Math.hypot(p.x-g.door.x,p.y-g.door.y)<1||(s.customers.some(c=>c.phase!=='gone'&&Math.hypot(c.x-p.x,c.y-p.y)<.6)))continue;if(servicePath(s.config.tier,s.stations,s.tables,s.chef,p))candidates.push(p);}
  const spot=candidates.sort((a,b)=>Math.hypot(a.x-near.x,a.y-near.y)-Math.hypot(b.x-near.x,b.y-near.y)||a.y-b.y||a.x-b.x)[0];if(!spot)return false;
  (s.messes??=[]).push({...spot,id:`mess_${s.nextId++}`,progress:0,createdTick:s.tick});s.lastMessTick=s.tick;
  if(teaching){s.cleanupIntroduced=true;s.nextArrival=Math.max(s.nextArrival,35*20);for(const c of s.customers)if(c.phase==='queue'||c.phase==='seated')c.patience=Math.max(c.patience,35*20);}
  s.notice='A guest left a mess. Free your hands, tap it and hold to mop. Each mess drains patience 10% faster.';return true;
}
export function workServiceMess(s:ServiceState):void {
  const mess=s.messes?.find(m=>m.id===s.chef.targetId);if(!mess||s.chef.held||!s.chef.holding||s.chef.path.length||Math.hypot(s.chef.x-mess.x,s.chef.y-mess.y)>.2)return;
  mess.progress++;if(mess.progress>=CLEANUP_RULES.workTicks){s.messes=s.messes!.filter(m=>m!==mess);s.chef.targetId=null;s.chef.holding=false;s.notice='All clean. Patience pressure reduced.';}
}
