import {DOMAIN_COLLECTIBLES,type DomainId} from '@/lib/chef/diner/domain-worlds';
import {hasDomainArtStudy} from '@/lib/chef/diner/domain-art-studies';
import {DOMAIN_ROOM_STUDIES} from '@/lib/chef/diner/domain-room-studies';
import type {DinerSceneData,SceneObject} from '../diner-preview/scene-types';

/** Complete visual directions. Not a saved layout or proof of a working theme entitlement. */
export function domainReviewScene(domain:DomainId,selectedId?:string,closeup=false,working=false,aspect=2,showCollectibles=false):DinerSceneData {
  const heroes=DOMAIN_COLLECTIBLES.filter(i=>i.domain===domain&&i.hero),small=heroes.find(i=>!i.machine&&i.footprint[0]===1)!,machine=heroes.find(i=>i.machine)!,large=heroes.find(i=>i.footprint[0]===2)!;
  const display=domain==='gochujang'?{x:6.85,y:3.15}:domain==='smoothie'?{x:1.05,y:4.95}:{x:6.6,y:2.45};
  const subjects:SceneObject[]=[
    {id:small.id,kind:small.id,x:4.85,y:2.50,rotation:0,elevation:1.205},
    {id:machine.id,kind:domain==='gochujang'?'boiler':domain==='smoothie'?'blender':'drinks',appearance:machine.id,x:3.3,y:5.3,rotation:0,tier:1,state:working?'working':'idle'},
    {id:large.id,kind:large.id,...display,rotation:0,footprint:[2,1],elevation:large.mount==='counter'?1.02:.025},
  ];
  const selected=DOMAIN_COLLECTIBLES.find(i=>i.id===selectedId&&i.domain===domain&&hasDomainArtStudy(i.id));
  if(selected&&!selected.hero){
    const elevated=selected.mount==='counter'||selected.mount==='ceiling',wall=selected.mount==='wall';
    const position=wall?{x:domain==='gochujang'?1.3:7.15,y:domain==='gochujang'?-.24:.09,elevation:domain==='gochujang'?1.24:1.70}:{x:elevated?4.85:3.3,y:selected.mount==='ceiling'?3.65:elevated?2.5:5.3,elevation:selected.mount==='counter'?1.205:selected.mount==='ceiling'?2.18:.025};
    subjects.push({id:selected.id,kind:selected.id,...position,rotation:0,footprint:[selected.footprint[0],1],state:working?'working':'idle'});
    // Each selected piece replaces the display at its position, so it never
    // interpenetrates another collectible or hides behind an unrelated hero.
    if(elevated)subjects.splice(0,1);else if(!wall)subjects.splice(1,1);
  }
  const objects:SceneObject[]=showCollectibles?subjects:[];
  if(showCollectibles&&large.mount==='counter')objects.push({id:'optional-pack-display',kind:'display_counter_red',...display,footprint:[2,1],rotation:0});
  const focus=subjects.find(o=>o.id===selectedId)??subjects[0],close=closeup&&showCollectibles;
  return {
    width:10,height:8,sign:DOMAIN_ROOM_STUDIES[domain].name,domainRoomStudy:domain,
    objects,tables:[],people:close||domain==='gochujang'?[]:[{id:'house-bartender',role:'waiter',look:2,x:2.8,y:1.30,pose:'idle',facing:0}],
    quality:'high',atmosphere:domain==='smoothie'?'day':'evening',menu:[],paused:false,
    reviewCamera:close?{x:focus.x+((focus.footprint?.[0]??1)-1)/2,y:(focus.elevation??.025)+.60,z:focus.y,vertical:Math.max(focus.footprint?.[0]===2?2.5:2.0,(focus.footprint?.[0]===2?2.4:1.6)/aspect),azimuth:domain==='smoothie'&&focus.id!==large.id?-.6:.24,elevation:.45,...(selected?.mount==='wall'?{foregroundCutaway:.8}:{})}:{x:4.4,y:1.25,z:3.4,vertical:Math.max(11.4,14.2/aspect),azimuth:-.54,elevation:.62},
  };
}
