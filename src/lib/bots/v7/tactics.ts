import {clamp,randomV6,type Vec3} from '@/lib/bots/v6/math';
import type {ActionMotionV7,AttackKindV7,FighterV7,SideV7,StateV7,StyleV7,TacticV7} from './types';

export const EXCHANGE_RULES_V7=Object.freeze({circleMin:24,circleSpread:19,withdrawMin:36,withdrawSpread:31,defenceCooldown:78,counterFrames:48,maxExchangeFrames:260});

export function setTacticV7(f:FighterV7,frame:number,kind:TacticV7['kind'],duration:number,side?:1|-1):void {
  f.tactic={kind,started:frame,until:frame+duration,side:side??f.tactic?.side??(randomV6(f,2)?1:-1)};
}

export function beginExchangeV7(f:FighterV7,frame:number,counter=false):void {
  f.exchangeSequence=(f.exchangeSequence??0)+1;
  f.exchange={id:f.exchangeSequence,index:0,limit:counter?2:2+randomV6(f,2),pattern:randomV6(f,3),started:frame,lastAttack:0,landed:0};
  setTacticV7(f,frame,counter?'counter':'enter',EXCHANGE_RULES_V7.maxExchangeFrames);
}

export function endExchangeV7(f:FighterV7,frame:number):void {
  f.exchange=undefined;
  setTacticV7(f,frame,'withdraw',EXCHANGE_RULES_V7.withdrawMin+randomV6(f,EXCHANGE_RULES_V7.withdrawSpread));
  f.nextAction=Math.max(f.nextAction,frame+18);
}

export function advanceTacticV7(s:StateV7,who:SideV7):void {
  const f=s.fighters[who],r=s.fighters[(1-who) as SideV7],distance=Math.hypot(r.x-f.x,r.z-f.z),ranged=s.builds[who].style==='ranged';
  if(!f.tactic)setTacticV7(f,s.frame,'approach',120);
  if(f.action||f.defence&&s.frame<f.defence.until)return;
  const t=f.tactic!;
  if(f.exchange&&s.frame-f.exchange.started>EXCHANGE_RULES_V7.maxExchangeFrames){endExchangeV7(f,s.frame);return;}
  if(t.kind==='approach'){
    if(distance<(ranged?3400:2350))setTacticV7(f,s.frame,'circle',EXCHANGE_RULES_V7.circleMin+randomV6(f,EXCHANGE_RULES_V7.circleSpread));
    return;
  }
  if(t.kind==='withdraw'||t.kind==='reposition'){
    if(s.frame<t.until)return;
    setTacticV7(f,s.frame,distance>3300?'approach':'circle',24+randomV6(f,19),t.side===1?-1:1);
    return;
  }
  if(t.kind==='circle'&&s.frame>=t.until)beginExchangeV7(f,s.frame,(f.counterUntil??0)>s.frame);
  if(t.kind==='brace'&&s.frame>=t.until)endExchangeV7(f,s.frame);
}

export function motionForV7(kind:AttackKindV7,style:StyleV7,index:number,pattern:number,last?:ActionMotionV7):ActionMotionV7 {
  if(kind==='kick')return 'front_kick';
  if(kind==='shove')return 'shove';
  if(kind==='punch')return 'body_hook';
  if(kind==='shoulder_cannon')return 'cannon_brace';
  if(kind==='backup_pistol')return index%2?'pistol_cross':'pistol_snap';
  if(kind==='special_charge')return 'shield_charge';
  if(kind==='special_flank')return 'flank_strike';
  if(kind==='special_burst')return 'pistol_burst';
  const motions:ActionMotionV7[]=style==='tank'?['hammer_overhead','hammer_cross','hammer_uppercut']:['blade_cross','blade_reverse','blade_lunge'];
  let motion=motions[(pattern+index)%motions.length];if(motion===last)motion=motions[(pattern+index+1)%motions.length];return motion;
}

/** Local forward/side intent. Fixed-step acceleration and arena projection are
 * applied by the engine; no root teleport or guaranteed hit is encoded here. */
export function tacticalIntentV7(s:StateV7,who:SideV7):{forward:number;side:number} {
  const f=s.fighters[who],r=s.fighters[(1-who) as SideV7],d=Math.hypot(f.x-r.x,f.z-r.z),ranged=s.builds[who].style==='ranged',t=f.tactic,sign=t?.side??(who?1:-1);
  switch(t?.kind){
    case 'circle':return {forward:clamp((d-(ranged?2950:1950))/600,-.45,.55),side:sign*(ranged?.55:.8)};
    case 'withdraw':return {forward:d<(ranged?3100:2350)?-1.1:0,side:sign*.65};
    case 'reposition':return {forward:d<(ranged?2800:1950)?-.6:0,side:sign};
    case 'brace':return {forward:0,side:0};
    case 'enter':case 'counter':{
      const armed=f.armour[3]>0||s.builds[who].capabilities.paired&&f.armour[2]>0;
      const reach=armed?1480:970;
      if(ranged)return {forward:d<1850?-.8:d>3050?.65:0,side:sign*(d<2100?.7:.25)};
      return {forward:d>reach?1:d<1050?-.55:0,side:sign*(f.action?.comboIndex?-.22:.18)};
    }
    default:return {forward:d>(ranged?3200:2100)?1:0,side:0};
  }
}

/** Avoid retreating out of the ring: remove outward velocity and move along
 * the open arc towards centre. Never edit an actor's position to create space. */
export function arenaIntentV7(f:FighterV7,intent:Vec3,side:1|-1):Vec3 {
  const radius=Math.hypot(f.x,f.z);if(radius<4200)return intent;
  const nx=f.x/Math.max(1,radius),nz=f.z/Math.max(1,radius),out=intent[0]*nx+intent[2]*nz;
  if(out<=0)return intent;
  const strength=clamp((radius-4200)/800,0,1);
  return [intent[0]-nx*out*(.7+.3*strength)-nx*strength*8-nz*side*strength*7,0,intent[2]-nz*out*(.7+.3*strength)-nz*strength*8+nx*side*strength*7];
}
