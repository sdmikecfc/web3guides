import type {Attack,Move,Spec} from './types';
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
/** Authored root step, independent of target position. It plants at contact;
 * it never homes toward the opponent or stretches a collision shape. */
export function attackStep(m:Move,frame:number){const t=clamp(frame/m.startup);return Math.round((m.stepIn??0)*t*t*(3-2*t));}
export function motionPhase(a:Attack){
 const m=a.move,f=a.frame;
 return f<m.startup?.3*clamp(f/m.startup):f<m.startup+m.active?.3+.3*clamp((f-m.startup)/m.active):.6+.4*clamp((f-m.startup-m.active)/m.recovery);
}
/** Authoritative local-space striking centre, in thousandths of a world unit.
 * Renderer IK uses this same trajectory; collision never reads rendered bones. */
export function strikePoint(m:Move,frame:number):[number,number]{
 const p=clamp((frame-m.startup)/Math.max(1,m.active-1));
 if(m.motion==='stomp'||m.motion==='pulse')return [Math.round(m.reach*p),m.height];
 if(m.motion==='uppercut')return [Math.round(m.reach*(.72+.28*p)),Math.round(950+1900*p)];
 if(['overhead','weaponOverhead','airHeavy'].includes(m.motion))return [Math.round(m.reach*(.8+.2*p)),Math.round(m.height+900*(1-p))];
 if(['weaponCross','weaponFlail','weaponBlades','cross'].includes(m.motion))return [Math.round(m.reach*(.82+.18*Math.sin(p*Math.PI))),m.height];
 return [m.reach,m.height];
}
export function attackExtension(a:Attack){const f=a.frame,m=a.move;if(f<m.startup)return Math.max(0,f/m.startup)*.18;if(f<m.startup+m.active)return m.hitFrames?.length?(.35+.65*Math.sin(Math.PI*((f-m.startup)%5)/5)):1;return 1-clamp((f-m.startup-m.active)/m.recovery);}
export function contactPoint(spec:Spec,m:Move,frame:number):[number,number]{const path=spec.contacts?.[m.id];return path?.[Math.max(0,Math.min(path.length-1,frame-m.startup))]??strikePoint(m,frame)}
