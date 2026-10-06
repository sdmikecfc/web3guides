import {createDiner,type DinerState} from '@/lib/chef/diner/progression';
import {createRestaurantBlueprint,type RestaurantStage} from '@/lib/chef/diner/room-plan';
import {stageDecorLayout,stageDefaultSurfaces} from '@/lib/chef/diner/stage-style-kit';
import {stageDefaultFinishes} from '@/lib/chef/diner/renovation';
import {createPlacementDraft,previewPlacement} from '../diner-preview/placement-preview';

/** Development fixture only. All pieces use the same validation and assets as the editor. */
export function roomBenchmark(stage:RestaurantStage,furnished=false):DinerState {
 const s=createDiner(1_800_000_000_000,'room-review'),blueprint=createRestaurantBlueprint(stage);
 s.cosmetics={...s.cosmetics,...stageDefaultSurfaces(stage)};
 s.home={...s.home,...blueprint.roomPlan,roomPlan:blueprint.roomPlan,layout:stage==='burger_shop'?s.home.layout:[...blueprint.layout,...stageDecorLayout(blueprint.roomPlan)],staff:blueprint.staff,finishes:stageDefaultFinishes(stage),name:stage==='burger_shop'?'Bun & Butter':stage==='diner'?'The Hungry Bear':'Sunday Supper'};
 s.home.menu.main=['classic_burger'];
 for(const p of s.home.layout){if(s.equipment[p.equipmentId])s.equipment[p.equipmentId].homeCopies=Math.max(4,s.equipment[p.equipmentId].homeCopies);else s.decorOwned[p.equipmentId]=4;}
 if(!furnished)return s;
 const finish=stage==='burger_shop'?'red':stage==='diner'?'oak':'deco';
 const pieces=[`display_counter_${finish}`,`display_corner_${finish}`,'floor_lamp',stage==='restaurant'?'brass_planter':'leafy_plant',stage==='diner'?'diner_clock':'chrome_clock'];
 for(const equipmentId of pieces){
  if(equipmentId.includes('clock')&&s.home.layout.some(p=>p.equipmentId===equipmentId))continue;
  s.decorOwned[equipmentId]=(s.decorOwned[equipmentId]??0)+1;
  let draft=createPlacementDraft(s,'home',equipmentId,`benchmark-${equipmentId}`);
  if(!draft.mount){
   // Start in the customer area: the benchmark must not fill the cooking aisle.
   const candidates=Array.from({length:s.home.h-5},(_,i)=>5+i).flatMap(y=>Array.from({length:s.home.w},(_,x)=>({...draft,x,y})));
   draft=candidates.find(candidate=>!previewPlacement(s,candidate).error)??draft;
  }
  const preview=previewPlacement(s,draft);
  if(preview.error)throw new Error(`${stage}: ${equipmentId}: ${preview.error}`);
  if(preview.command.type==='homeLayout')s.home.layout=preview.command.layout;
 }
 return s;
}
