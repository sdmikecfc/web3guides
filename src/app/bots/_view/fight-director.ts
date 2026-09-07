/** Deterministic presentation only. Each contact refers to exactly one event
 * in the immutable combat log. No action can change HP, timing or the result. */
import type { Build, FightEvent, Side } from "../_engine/parts";
import { combatPart } from "@/lib/bots/combat-model";

export type AttackMove = "thrust" | "rising-thrust" | "braced-thrust" | "horizontal" | "backhand" | "overhead" | "diagonal-cut" | "rising-cut" | "low-cut" | "punch" | "kick" | "shove";
export interface DirectedAttack {
  index: number; frame: number; begin: number; end: number; attacker: Side; defender: Side;
  outcome: "hit" | "miss" | "block"; part: number; move: AttackMove; mirror: boolean; strong: boolean;
}
export interface FightDirection { attacks: readonly DirectedAttack[]; breakFrames: readonly (readonly number[])[]; finalFrame: number }
export const clamp01 = (x: number) => Math.max(0, Math.min(1,x));
export const ease = (x: number) => { const t=clamp01(x); return t*t*(3-2*t); };
const soundsLikeThrust=(id:string)=>/drill|pike|spear/i.test(id);
const wheelLike=(id:string)=>/peeperStilts|pistonTreads/i.test(id);

export function directFight(log: readonly FightEvent[], builds: readonly [Build, Build]): FightDirection {
  const breakFrames=[Array<number>(6).fill(Infinity),Array<number>(6).fill(Infinity)];
  for(const e of log) if(e.t==="break") breakFrames[e.who][e.part]=Math.min(breakFrames[e.who][e.part],e.f);
  const attacks: DirectedAttack[]=[];
  const last=[-100,-100];
  const kickChances=[0,0];
  for(const e of log) {
    if(e.t!=="hit"&&e.t!=="miss"&&e.t!=="block")continue;
    const attacker: Side=e.t==="block"?(e.who===0?1:0):e.who,defender:Side=attacker===0?1:0;
    const idx=attacks.length, alive=(part:number)=>breakFrames[attacker][part]>=e.f;
    const build=builds[attacker];
    const part=e.t==="hit"?e.part:e.t==="block"?e.arm:1;
    const canKick=alive(4)&&alive(5)&&!wheelLike(combatPart(build,"legL").id)&&!wheelLike(combatPart(build,"legR").id);
    let move: AttackMove;
    let mirror=false;
    if(!alive(3)) { move=alive(2)?"punch":canKick?"kick":"shove"; }
    else if(canKick&&(part===1||part>=4)&&kickChances[attacker]++%3===0)move="kick";
    else if(idx%7===2&&alive(2)&&part<=3)move="punch";
    else if(soundsLikeThrust(build.weapon.id))move=(["thrust","rising-thrust","braced-thrust"] as const)[idx%3];
    else if(/cleaver|saw|axe|blade|hook/i.test(build.weapon.id))move=(["diagonal-cut","rising-cut","low-cut"] as const)[idx%3];
    else move=(["horizontal","overhead","backhand"] as const)[idx%3];
    if(move==="kick"&&part===4)mirror=true;
    // Short combinations borrow preparation time from their own previous
    // recovery, not the opposing fighter's independent animation channel.
    const begin=Math.max(0,e.f-22,last[attacker]+7);
    attacks.push({index:idx,frame:e.f,begin,end:e.f+19,attacker,defender,outcome:e.t,part,move,mirror,strong:e.t==="hit"&&!!e.crit});
    last[attacker]=e.f;
  }
  for(let i=0;i<attacks.length;i++){
    const next=attacks.slice(i+1).find(a=>a.attacker===attacks[i].attacker);
    if(next)attacks[i].end=Math.min(attacks[i].end,next.begin);
  }
  return {attacks,breakFrames,finalFrame:log.length?log[log.length-1].f:0};
}

export function activeAttack(direction: FightDirection, side: Side, frame: number): DirectedAttack | undefined {
  return direction.attacks.find(a=>a.attacker===side&&frame>=a.begin&&frame<=a.end);
}
export function actionTime(a: DirectedAttack, frame: number): number {
  return frame<=a.frame ? .5*clamp01((frame-a.begin)/Math.max(1,a.frame-a.begin)) : .5+.5*clamp01((frame-a.frame)/Math.max(1,a.end-a.frame));
}
export interface RingPosition { x: number; z: number; yaw: number; advance: number; stride: number }
/** Smooth, bounded paths in the same coordinate system as the stage. */
export function ringPosition(direction: FightDirection, side: Side, frame: number, seed: number): RingPosition {
  const t=frame/60,sign=side===0?-1:1;
  const phase=(seed%97)*.035;
  let nearest=Infinity;
  for(const a of direction.attacks)nearest=Math.min(nearest,Math.abs(a.frame-frame));
  const proximity=Math.max(0,1-nearest/65);
  const engaged=ease(proximity);
  const spacing=1.43-.43*engaged;
  const angle=Math.sin(t*.42+phase)*.26;
  const driftX=Math.sin(t*.29+phase)*.48,driftZ=Math.sin(t*.34+phase)*.43;
  const advance=ease(Math.min(t/.6,1));
  const intro=(1-advance)*.56;
  const radius=spacing+intro;
  const x=driftX+sign*radius*Math.cos(angle);
  const z=driftZ+sign*radius*Math.sin(angle)+(side===0?.09:-.09);
  const facing=side===0?1:-1;
  // A slight turn toward the production camera keeps the eyes readable.
  const yaw=facing*(Math.PI/2-.34)-angle;
  return {x,z,yaw,advance:engaged,stride:t*1.45+side*.5};
}
