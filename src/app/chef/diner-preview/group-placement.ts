import {EQUIPMENT_BY_ID} from '../../../lib/chef/diner/content';
import {DECOR_BY_ID} from '../../../lib/chef/diner/collections';
import {alignRoomMounts} from '../../../lib/chef/diner/room-plan';
import {validateDinerHomePlacement,type DinerState,type HomePlacement} from '../../../lib/chef/diner/progression';
import {createPlacementDraft,aimHomeMount,previewPlacement} from './placement-preview';

/** Rotate whole footprints around their shared bounding box, then reattach
 * surface pieces. No state, ownership or earnings are changed by a preview. */
export function transformGroup(state:DinerState,ids:string[],dx:number,dy:number,turn=false){
 const selected=new Set(ids),roots=state.home.layout.filter(p=>selected.has(p.id)&&!selected.has(p.mount?.targetId??''));
 if(!roots.length)return {layout:state.home.layout,error:'Select something to move.'};
 if(roots.length===1&&roots[0].mount){const p=roots[0];if(turn)return {layout:state.home.layout,error:'Wall and surface pieces face their mounting surface.'};const draft=aimHomeMount(state,createPlacementDraft(state,'home',p.equipmentId,p.id,true),p.x+dx,p.y+dy,true),preview=previewPlacement(state,draft);return {layout:preview.command.type==='homeLayout'?preview.command.layout:state.home.layout,error:preview.error};}
 if(roots.some(p=>p.mount))return {layout:state.home.layout,error:'Select a display counter with its attached objects, or move a wall piece on its own.'};
 const size=(p:HomePlacement)=>{const [w,h]=(EQUIPMENT_BY_ID[p.equipmentId]??DECOR_BY_ID[p.equipmentId]).footprint;return p.rotation%2?[h,w]:[w,h];};
 const minX=Math.min(...roots.map(p=>p.x)),minY=Math.min(...roots.map(p=>p.y)),maxY=Math.max(...roots.map(p=>p.y+size(p)[1]));
 let layout=state.home.layout.map(p=>{if(!roots.some(root=>root.id===p.id))return {...p};return turn?{...p,x:minX+maxY-p.y-size(p)[1],y:minY+p.x-minX,rotation:((p.rotation+1)%4) as HomePlacement['rotation']}:{...p,x:p.x+dx,y:p.y+dy};});
 if(state.home.roomPlan)layout=alignRoomMounts(layout,state.home.roomPlan);
 return {layout,error:validateDinerHomePlacement(state,layout)};
}
