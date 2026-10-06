import type {RoomPlan} from './room-plan';
import type {HomePlacement} from './progression';

export function backWallSupport(plan:RoomPlan,center:number,width:number):string|null {
 if(plan.version!==2||plan.legacyShell)return 'outer-back';
 const from=Math.max(0,Math.ceil(center-width/2)),to=Math.min(plan.w-1,Math.floor(center+width/2));
 for(let i=from;i<=to;i++)if(!plan.edges.some(e=>e.id===`outer-back-${i}`&&e.kind==='wall'&&(e.height??2.4)>=2.4))return null;
 return `outer-back-${Math.round(center)}`;
}

/** Shares the built-in shell's menu, brand and window dimensions. */
export function reservedWallMount(plan:RoomPlan,mount:HomePlacement['mount']):string|null{
 if(mount?.kind!=='wall')return null;
 const segment=/^outer-back-(\d+)$/.exec(mount.targetId),slot=segment?Number(segment[1]):mount.slot;
 if(mount.targetId==='outer-back'||segment){
  const kitchen=plan.zones.find(z=>z.kind==='kitchen'),center=(kitchen?.w??5)/2-.5;
  if(backWallSupport(plan,center,3.3)&&Math.abs(slot-center)<2.05)return 'Keep the restaurant menu board clear.';
  const bath=plan.zones.find(z=>z.kind==='bathroom'),sign=bath?bath.x+(bath.w-1)/2:plan.w-2;
  if(backWallSupport(plan,sign,Math.min(4.4,(bath?.w??3)-.25))&&Math.abs(slot-sign)<Math.min(4.4,(bath?.w??3)-.25)/2+.35)return 'Keep the restaurant name sign clear.';
 }
 if(mount.targetId==='outer-side'&&[Math.max(2.25,plan.h-5.35),plan.h-2.25].some(y=>Math.abs(y-mount.slot)<1.4))return 'Choose solid wall beside the window.';
 if(plan.edges.some(e=>e.id===mount.targetId&&['window','door','staff_gate'].includes(e.kind)))return 'Choose solid wall beside the opening.';
 return null;
}
