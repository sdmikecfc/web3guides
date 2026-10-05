import type { DinerCommand, DinerState } from './progression';

export interface HomeGesturePoint {x:number;y:number}
export type ParcelPart='tape'|'leftFlap'|'rightFlap';
export type HomeSceneGesture=
  | {type:'begin';incidentId:string;point:HomeGesturePoint}
  | {type:'stroke';incidentId:string;point:HomeGesturePoint}
  | {type:'end';incidentId:string}
  | {type:'parcel';incidentId:string;part:ParcelPart};
export interface HomeGestureWork {point:HomeGesturePoint|null;creditTicks:number;remainder:number}
export const HOME_GESTURE_RULES={version:2,spillRadius:.43,clothRadius:.13,shrinkFactor:.72,startRadius:.55,maxPointRadius:1.1,maxSegment:1.05,minSegment:.009,ticksPerTile:36,maxCreditTicks:6,sampleMs:50} as const;
export const PARCEL_PARTS:readonly ParcelPart[]=['tape','leftFlap','rightFlap'];
export function emptyHomeGesture():HomeGestureWork{return {point:null,creditTicks:0,remainder:0};}
export function validHomePoint(point:unknown):point is HomeGesturePoint {
  return !!point&&typeof point==='object'&&Object.keys(point).every(key=>key==='x'||key==='y')&&['x','y'].every(key=>Number.isFinite((point as any)[key])&&Math.abs((point as any)[key])<=100);
}
export function homePointNear(point:HomeGesturePoint,center:HomeGesturePoint,radius:number):boolean{return Math.hypot(point.x-center.x,point.y-center.y)<=radius;}
/** Length of the actual stroke inside the puddle; off-target travel is never work. */
export function homeSpillScale(progress:number):number{return 1-Math.max(0,Math.min(1,progress))*HOME_GESTURE_RULES.shrinkFactor;}
export function spillStrokeLength(from:HomeGesturePoint,to:HomeGesturePoint,center:HomeGesturePoint,progress=0):number {
  const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);
  if(length<HOME_GESTURE_RULES.minSegment||length>HOME_GESTURE_RULES.maxSegment)return 0;
  const radius=HOME_GESTURE_RULES.spillRadius*homeSpillScale(progress)+HOME_GESTURE_RULES.clothRadius;
  const fx=from.x-center.x,fy=from.y-center.y,a=length*length,b=2*(fx*dx+fy*dy),c=fx*fx+fy*fy-radius**2,disc=b*b-4*a*c;
  if(disc<=0)return 0;
  const root=Math.sqrt(disc),enter=Math.max(0,(-b-root)/(2*a)),leave=Math.min(1,(-b+root)/(2*a));
  return Math.max(0,leave-enter)*length;
}
export function addHomeStroke(work:HomeGestureWork,point:HomeGesturePoint,center:HomeGesturePoint,progress=0):HomeGestureWork {
  if(!homePointNear(point,center,HOME_GESTURE_RULES.maxPointRadius))return {...work,point:null,remainder:0};
  const length=work.point?spillStrokeLength(work.point,point,center,progress):0;
  const units=length*HOME_GESTURE_RULES.ticksPerTile+work.remainder,credit=Math.floor(units);
  return {point:{...point},creditTicks:Math.min(HOME_GESTURE_RULES.maxCreditTicks,work.creditTicks+credit),remainder:units-credit};
}
export function parcelStage(progressTicks:number,requiredTicks:number):0|1|2{return Math.min(2,Math.floor(progressTicks*3/requiredTicks)) as 0|1|2;}
export function parcelStageEnd(stage:number,requiredTicks:number):number{return Math.ceil((stage+1)*requiredTicks/3);}
/** UI mapping only. The reducer independently checks the current target and geometry. */
export function homeGestureCommands(state:DinerState,gesture:HomeSceneGesture):DinerCommand[] {
  if(gesture.incidentId==='home-parcel'){
    if(state.daily.crate||gesture.type!=='parcel')return [];
    gesture={...gesture,incidentId:`crate:${state.daily.day}`};
  }
  if(gesture.type==='end')return state.homeTask?.incidentId===gesture.incidentId?[{type:'homeTaskInput',action:{type:'pause'}}]:[];
  if(gesture.type==='stroke')return state.homeTask?.incidentId===gesture.incidentId?[{type:'homeTaskInput',action:{type:'stroke',point:gesture.point}}]:[];
  const begin:DinerCommand[]=(gesture.type==='begin'||state.homeTask?.incidentId!==gesture.incidentId)?[{type:'beginHomeTask',incidentId:gesture.incidentId}]:[];
  return [...begin,{type:'homeTaskInput',action:gesture.type==='begin'?{type:'strokeStart',point:gesture.point}:{type:'parcel',part:gesture.part}}];
}
