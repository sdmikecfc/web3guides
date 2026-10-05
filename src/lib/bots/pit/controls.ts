import type {Action} from './types';
export type Binding=Exclude<Action,'clear'|'skip'>|'pause';
export const DEFAULT_BINDINGS:Record<Binding,string>={left:'KeyA',right:'KeyD',up:'KeyW',down:'KeyS',light:'KeyJ',heavy:'KeyK',special:'KeyU',guard:'KeyI',throw:'KeyL',super:'KeyO',enhance:'KeyE',escape:'KeyR',finish:'KeyF',dash:'ShiftLeft',pause:'Escape'};
export type PitPreferences={bindings:Record<Binding,string>;touch:boolean;size:number;opacity:number;leftX:number;leftY:number;rightX:number;rightY:number;dashButton:boolean;quality:'auto'|'standard'|'low';shake:number;flashes:boolean;reduced:boolean;effectsVolume:number;musicVolume:number};
export const DEFAULT_PREFERENCES:PitPreferences={bindings:DEFAULT_BINDINGS,touch:false,size:1,opacity:.9,leftX:0,leftY:0,rightX:0,rightY:0,dashButton:true,quality:'auto',shake:.5,flashes:true,reduced:false,effectsVolume:.7,musicVolume:.25};
export const PREFERENCES_KEY='mk10.pit.preferences.1';
export const keyName=(code:string)=>code.replace(/^Key/,'').replace(/^Digit/,'').replace('ShiftLeft','Shift').replace('Arrow','');
/** Explicit remaps take precedence over convenience keys. */
export function keyboardBinding(code:string,bindings:Record<Binding,string>):Binding|undefined{
 return (Object.keys(bindings) as Binding[]).find(k=>bindings[k]===code)??({Space:'up',ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'} as Record<string,Binding>)[code];
}
export function readPreferences(raw:unknown):PitPreferences{
 const v=raw as Partial<PitPreferences>|null;if(!v||typeof v!=='object')return structuredClone(DEFAULT_PREFERENCES);
 const out=structuredClone(DEFAULT_PREFERENCES);for(const field of ['touch','dashButton','flashes','reduced'] as const)if(typeof v[field]==='boolean')out[field]=v[field]!;
 for(const [field,min,max] of [['size',.8,1.25],['opacity',.35,1],['leftX',-20,40],['rightX',-20,40],['leftY',-20,40],['rightY',-20,40],['shake',0,1],['musicVolume',0,1],['effectsVolume',0,1]] as const){const n=v[field];if(typeof n==='number'&&Number.isFinite(n))out[field]=Math.max(min,Math.min(max,n));}
 if(v.quality&&['auto','standard','low'].includes(v.quality))out.quality=v.quality;
 if(v.bindings&&Object.keys(DEFAULT_BINDINGS).every(k=>typeof v.bindings?.[k as Binding]==='string')&&new Set(Object.values(v.bindings)).size===Object.keys(DEFAULT_BINDINGS).length)out.bindings={...v.bindings};return out;
}
/** One logical hold can belong to keyboard and several pointers concurrently. */
export class HeldInputs{
 owners=new Map<string,Set<Action>>();
 constructor(private emit:(action:Action,down:boolean)=>void){}
 set(owner:string,next:Action[]){const previous=this.owners.get(owner)??new Set<Action>();this.owners.set(owner,new Set(next));
  for(const action of previous)if(!next.includes(action)&&![...this.owners.values()].some(set=>set.has(action)))this.emit(action,false);
  for(const action of next)if(!previous.has(action)&&![...this.owners.entries()].some(([key,set])=>key!==owner&&set.has(action)))this.emit(action,true);
  if(!next.length)this.owners.delete(owner);
 }
 clear(){this.owners.clear();this.emit('clear',true);}
}
/** Mouse events report every button in a chord; pointerdown reports only the first. */
export function bindCombatMouse(surface:EventTarget,outside:EventTarget,inputs:HeldInputs,enabled:()=>boolean,onUse:()=>void){
 const buttons:[number,number,Action][]=[[0,1,'light'],[2,2,'guard'],[1,4,'heavy']];
 const down=(event:Event)=>{const e=event as MouseEvent,entry=buttons.find(([button])=>button===e.button);if(!entry||!enabled())return;e.preventDefault();onUse();inputs.set('mouse'+e.button,[entry[2]]);};
 const up=(event:Event)=>{const e=event as MouseEvent;inputs.set('mouse'+e.button,[]);};
 const move=(event:Event)=>{const e=event as MouseEvent;for(const [button,mask] of buttons)if(!(e.buttons&mask))inputs.set('mouse'+button,[]);};
 const menu=(event:Event)=>{if(enabled())event.preventDefault();};
 surface.addEventListener('mousedown',down);surface.addEventListener('contextmenu',menu);surface.addEventListener('auxclick',menu);outside.addEventListener('mouseup',up);outside.addEventListener('mousemove',move);
 return()=>{surface.removeEventListener('mousedown',down);surface.removeEventListener('contextmenu',menu);surface.removeEventListener('auxclick',menu);outside.removeEventListener('mouseup',up);outside.removeEventListener('mousemove',move);for(const [button] of buttons)inputs.set('mouse'+button,[]);};
}
