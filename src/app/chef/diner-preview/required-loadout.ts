import {buildServiceLoadout,makeStation} from '@/lib/chef/diner/geometry';
import type {DinerState,DinerCommand} from '@/lib/chef/diner/progression';
import {createPlacementDraft,previewPlacement} from './placement-preview';

/** A proposal only: preserve placed furniture and never invent purchased ownership. */
export function requiredLoadout(state:DinerState):{command:Extract<DinerCommand,{type:'setupLayout'}>|null;added:string[];error:string|null}{
 const copy=structuredClone(state),service=copy.run?.service,added:string[]=[];
 if(!service||service.phase!=='setup')return{command:null,added,error:'Arrange before preparing food.'};
 const wanted=buildServiceLoadout(copy.truckTier,service.config.menu).stations;
 for(const item of wanted){
  if(service.stations.some(s=>s.kind===item.kind))continue;
  if(!copy.equipment[item.kind]?.truckOwned)return{command:null,added,error:`You do not own ${item.kind}. Find it at a market.`};
  const preview=previewPlacement(copy,createPlacementDraft(copy,'truck',item.kind,`loaded-${item.kind}`));
  if(preview.error||preview.command.type!=='setupLayout')return{command:null,added,error:preview.error??'Make room in the layout first.'};
  const command=preview.command;
  // Update both sources used by placement and storage validation between additions.
  copy.truckConfig.stations=command.stations;copy.truckConfig.tables=command.tables;
  service.stations=command.stations.map(p=>makeStation(p.id,p.kind,p.x,p.y,Math.min(3,copy.equipment[p.kind].tier) as 1|2|3,p.facing));
  added.push(item.kind);
 }
 return{command:{type:'setupLayout',stations:copy.truckConfig.stations,tables:copy.truckConfig.tables},added,error:null};
}
