/** Input preferences never enter simulation rewards, timing or difficulty. */
export interface ControlPreferences {version:1;work:'hold'|'toggle';hand:'left'|'right';large:boolean;text:100|125|150}
export const DEFAULT_CONTROLS:ControlPreferences={version:1,work:'hold',hand:'right',large:false,text:100};
export function controlPreferences(raw:unknown):ControlPreferences{
 const p=raw as Partial<ControlPreferences>|null;
 return {version:1,work:p?.work==='toggle'?'toggle':'hold',hand:p?.hand==='left'?'left':'right',large:p?.large===true,text:p?.text===125||p?.text===150?p.text:100};
}
/** Stable identity of the work currently reachable by the player, never a queue. */
export function manualWorkKey(s:import('./types').ServiceState):string|null{
 if(!['preparing','playing','closing'].includes(s.phase)||s.chef.path.length)return null;
 const target=s.chef.targetId,mess=s.messes?.find(m=>m.id===target);
 if(mess&&mess.progress<60)return `mess:${mess.id}`;
 const station=s.stations.find(st=>st.id===target),slot=station?.slots.find(slot=>slot.item&&slot.job&&!slot.job.ready&&['hold','wash'].includes(slot.job.action));
 return slot?.item?`${target}:${slot.item.id}:${slot.item.step}`:null;
}
