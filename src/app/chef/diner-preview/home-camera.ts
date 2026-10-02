import { EQUIPMENT_BY_ID } from '../../../lib/chef/diner/content';
import { DECOR_BY_ID } from '../../../lib/chef/diner/collections';
import { homeSpatial } from '../../../lib/chef/diner/home-spatial';
import type { DinerSceneData } from './scene-types';

export interface HomeCameraPoint { x:number; y:number; z:number }
export interface HomeCameraBox { min:HomeCameraPoint; max:HomeCameraPoint }
export interface HomeCameraBounds { boxes:HomeCameraBox[] }
export interface HomeCameraInsets { top:number; right:number; bottom:number; left:number }
export interface HomeCameraFit {
  /** Base focus at zoom 1. Keep user pan as a separate offset from this point. */
  focus:HomeCameraPoint;
  /** Full orthographic vertical span, before the user's zoom multiplier. */
  vertical:number;
  insets:HomeCameraInsets;
  pixelsPerTile:number;
  projectedBounds:{minX:number;maxX:number;minY:number;maxY:number};
}

/** The phone starts with the entire miniature in view. Extra bottom space lifts
 * the room above onboarding; a taller preview sheet always keeps its full inset. */
export function homeCameraPresentation(width:number,hasRoomPlan:boolean,previewInset?:number){
  const phone=width<700;
  return {azimuthOffset:phone?(hasRoomPlan?Math.PI/6:Math.PI/12):Math.PI/4,
    insets:{bottom:phone&&hasRoomPlan?Math.max(225,previewInset??0):previewInset??125},
    scaleBoost:hasRoomPlan&&!phone&&!previewInset?1.04:1};
}

// Conservative silhouette envelopes, including counter-top attachments. These do
// not read GPU geometry or change collision footprints, stations, or navigation.
const HEIGHTS:Record<string,number>={
  grill:1.18,prep:1.12,fryer:1.36,sink:1.40,oven:1.30,blender:1.72,
  coffee:1.65,drinks:1.65,waffle:1.25,pass:1.75,bin:.80,crate:.80,
  till:1.45,book:1.55,trophy:1.65,parcel:.90,spill:.12,
};
const CONTEXT_IDS=new Set(['home-till','home-binder','home-collections','home-parcel']);
const own = <T,>(catalog:Record<string,T>,id:string):T|undefined => Object.prototype.hasOwnProperty.call(catalog,id)?catalog[id]:undefined;

/** Build once per layout/dimensions change. Actors, jobs and transient chores do not affect composition. */
export function createHomeCameraBounds(scene:Pick<DinerSceneData,'width'|'height'|'objects'|'tables'|'roomPlan'>):HomeCameraBounds {
  const space=homeSpatial(scene.width,scene.height),boxes:HomeCameraBox[]=[];
  const add=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number)=>boxes.push({min:{x:x0,y:y0,z:z0},max:{x:x1,y:y1,z:z1}});
  const floor=(z:number)=>z<scene.height-.5?space.interior.elevation:space.terrace.elevation;

  // The full supported board fixes the composition when customers or daily
  // parcels appear/disappear. Only real walls receive the full wall height.
  add(space.bounds.minX,-.18,space.bounds.minY,space.bounds.maxX,.10,space.bounds.maxY);
  add(-.70,0,-.70,scene.width-.30,scene.roomPlan?2.98:2.55,-.24);
  add(-.70,0,-.70,-.24,2.55,scene.height-.30);
  add(space.door.x-1.02,0,scene.height-.75,space.door.x+1.02,2.50,scene.height+.60);

  // Reserve the four permanent terrace destinations even after a parcel claim,
  // plus the regular's standing space even when nobody is visiting.
  for(const point of scene.roomPlan?[space.context.parcel,space.delivery]:Object.values(space.context))add(point.x-.50,0,point.y-.50,point.x+.50,scene.roomPlan?.95:1.65,point.y+.50);
  if(!scene.roomPlan)add(space.regular.x-.48,0,space.regular.y-.48,space.regular.x+.48,2.05,space.regular.y+.48);

  for(const object of scene.objects){
    if(object.id.startsWith('incident:')||CONTEXT_IDS.has(object.id)||object.kind==='spill'||object.kind==='parcel')continue;
    const shape=object.footprint??own(EQUIPMENT_BY_ID,object.kind)?.footprint??own(DECOR_BY_ID,object.kind)?.footprint??[1,1];
    const turned=(object.rotation??0)%2===1,w=shape[turned?1:0],h=shape[turned?0:1],y=floor(object.y);
    if(object.mount?.kind==='ceiling'){add(object.x-.54,object.mount.surfaceHeight-.85,object.y-.54,object.x+.54,object.mount.surfaceHeight+.1,object.y+.54);continue;}
    add(object.x-.54,y,object.y-.54,object.x+w-.46,y+(own(HEIGHTS,object.kind)??2.35),object.y+h-.46);
  }
  for(const table of scene.tables){
    const turned=(table.rotation??0)%2===1,raw=table.footprint??[table.capacity===4?2:1,table.capacity===1?1:2],w=raw[turned?1:0],h=raw[turned?0:1],y=floor(table.y);
    add(table.x-.54,y,table.y-.54,table.x+w-.46,y+1.10,table.y+h-.46);
    for(const seat of table.seats)add(seat.x-.45,y,seat.y-.45,seat.x+.45,y+1.35,seat.y+.45);
  }
  return {boxes};
}

/** Pure isometric fit. All angles are radians; the default preserves the original renderer axes. */
export function fitHomeCamera({bounds,width,height,rotation,elevation=35*Math.PI/180,azimuthOffset=-Math.PI/4,insets:customInsets,padding=7}:{
  bounds:HomeCameraBounds;width:number;height:number;rotation:number;elevation?:number;azimuthOffset?:number;insets?:Partial<HomeCameraInsets>;padding?:number;
}):HomeCameraFit {
  const viewportW=Math.max(1,width),viewportH=Math.max(1,height),angle=rotation+azimuthOffset;
  const insets:HomeCameraInsets={top:viewportH<650?65:110,right:viewportW<700?12:58,bottom:125,left:12,...customInsets};
  const right={x:Math.cos(angle),y:0,z:-Math.sin(angle)},up={x:-Math.sin(angle)*Math.sin(elevation),y:Math.cos(elevation),z:-Math.cos(angle)*Math.sin(elevation)};
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const box of bounds.boxes)for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const px=x*right.x+z*right.z,py=x*up.x+y*up.y+z*up.z;
    minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
  }
  if(!Number.isFinite(minX)){minX=minY=-1;maxX=maxY=1;}
  const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2,focusY=.68;
  // Solve at the existing focus height instead of moving the room or its actors.
  const along=(focusY*Math.cos(elevation)-centerY)/Math.max(.01,Math.sin(elevation));
  const focus={x:right.x*centerX+Math.sin(angle)*along,y:focusY,z:right.z*centerX+Math.cos(angle)*along};
  const availableW=Math.max(1,viewportW-insets.left-insets.right-padding*2),availableH=Math.max(1,viewportH-insets.top-insets.bottom-padding*2);
  const vertical=Math.max(.1,(maxY-minY)*viewportH/availableH,(maxX-minX)*viewportH/availableW);
  return {focus,vertical,insets,pixelsPerTile:viewportH/vertical,projectedBounds:{minX,maxX,minY,maxY}};
}
