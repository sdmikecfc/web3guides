import type {ScenePerson} from './scene-types';

export type Atmosphere='day'|'evening'|'rain';
export type Quality='auto'|'low'|'medium'|'high';
export type RenderQuality=Exclude<Quality,'auto'>;
export const QUALITY_BUDGETS={low:{pixelRatio:1,shadowSize:512,shadows:false},medium:{pixelRatio:1.25,shadowSize:1024,shadows:true},high:{pixelRatio:1.75,shadowSize:2048,shadows:true}} as const;
export function initialQuality(width:number,cores:number):RenderQuality{return width<=700||cores<=4?'medium':'high';}
/** Downgrade only after six seconds of sustained poor rendering; no oscillating upgrades. */
export function qualitySample(quality:RenderQuality,slowSamples:number,fps:number,phone:boolean){
  const slow=fps<(phone?27:50)?slowSamples+1:0;
  return slow>=3&&quality!=='low'?{quality:(quality==='high'?'medium':'low') as RenderQuality,slowSamples:0}:{quality,slowSamples:slow};
}
export interface PresentationAction {kind:'pickup'|'setDown'|'clear'|'acknowledge'|'pride';started:number}
/** These observations never dispatch a gameplay command or change food ownership. */
export function observeAction(previous:ScenePerson,next:ScenePerson,now:number):PresentationAction|null{
  if(!previous.held&&next.held)return {kind:next.held.kind==='dirty'?'clear':'pickup',started:now};
  if(previous.held&&!next.held)return {kind:previous.held.kind==='dish'&&next.role==='waiter'?'pride':'setDown',started:now};
  if(previous.pose!=='takeOrder'&&next.pose==='takeOrder')return {kind:'acknowledge',started:now};
  return null;
}
export function actionEnvelope(action:PresentationAction|undefined,now:number,reduced=false){
  if(!action)return 0;const phase=(now-action.started)/.55;
  return phase<0||phase>=1?0:Math.sin(phase*Math.PI)*(reduced?.35:1);
}
