import { axisQuatV6, clamp, multiplyQuatV6, type Vec3, type QuatV6 } from '@/lib/bots/v6/math';
import type { ActionV7 } from './types';

/** Authored rigid-shell motion curves, sampled by both collision and rendering. */
export interface AttackSampleV7 {
  hand: Vec3;
  rotation: QuatV6;
  twist: number;
  pitch: number;
  roll: number;
  crouch: number;
}

type Key = {
  hand: Vec3; angles: Vec3; twist: number; pitch: number; roll: number; crouch: number;
};
type Clip = [Key, Key, Key, Key];
const key = (hand: Vec3, angles: Vec3, twist = 0, pitch = 0, crouch = 0, roll = 0): Key => ({ hand, angles, twist, pitch, roll, crouch });
// Hand offsets are relative to the working shoulder, with X mirrored by side.
// The four poses are chamber, start of contact, follow-through and end contact.
const clips: Record<string, Clip> = {
  hammer_overhead: [
    key([-20, 170, -200], [-.9, -.12, -.12], -.34, -.16, 85),
    key([-155, 20, 430], [.45, -.08, -.08], -.12, .06, 35),
    key([-260, -170, 470], [1.05, .15, .12], .35, .30, 115),
    key([-340, -380, 300], [1.82, .32, .24], .54, .23, 85),
  ],
  hammer_cross: [
    key([120, -130, -220], [.48, 1.15, -.75], -.65, -.03, 65),
    key([30, -170, 360], [.85, .8, -.45], -.40, .06, 45),
    key([-230, -190, 495], [.98, -.22, .10], .26, .15, 80),
    key([-375, -300, 255], [1.14, -.95, .45], .68, .13, 85),
  ],
  hammer_uppercut: [
    key([40, -525, -70], [1.66, .42, -.35], -.42, .18, 130),
    key([-105, -425, 415], [1.42, .22, -.25], -.19, .19, 115),
    key([-210, -130, 470], [.52, -.05, .10], .35, -.10, 20),
    key([-165, 105, 240], [-.2, -.15, .24], .52, -.15, 30),
  ],
  blade_cross: [
    key([160, -90, -65], [.08, .8, -1.05], -.60, .03, 60),
    key([20, -200, 400], [.96, .83, -.12], -.30, .10, 35),
    key([-150, -230, 470], [1.15, -.13, .20], .28, .20, 65),
    key([-325, -355, 250], [1.36, -.85, .64], .64, .18, 70),
  ],
  blade_reverse: [
    key([-315, -225, 195], [1.12, -.82, .62], .52, .09, 75),
    key([-200, -205, 410], [1.18, -.52, .24], .28, .16, 60),
    key([15, -125, 450], [.84, .5, -.4], -.20, .09, 35),
    key([150, -100, 230], [.54, 1.03, -.8], -.57, .04, 50),
  ],
  blade_lunge: [
    key([-70, -200, 50], [1.58, -.1, 0], -.38, -.10, 85),
    key([-85, -170, 390], [1.57, -.03, 0], -.06, .18, 40),
    key([-105, -150, 515], [1.57, .04, .07], .22, .29, 65),
    key([-90, -230, 380], [1.38, .25, .18], .36, .20, 65),
  ],
  body_hook: [
    key([75, -230, 65], [.25, .1, -.25], -.42, .12, 80),
    key([20, -235, 350], [.38, .2, -.18], -.20, .18, 70),
    key([-165, -230, 490], [.45, -.24, .06], .30, .25, 60),
    key([-250, -270, 275], [.48, -.48, .25], .48, .14, 65),
  ],
  shove: [
    key([-125, -225, 160], [.38, 0, 0], -.10, -.06, 85),
    key([-100, -190, 385], [.30, 0, 0], .03, .19, 35),
    key([-110, -180, 500], [.28, 0, 0], .12, .27, 40),
    key([-120, -240, 350], [.30, 0, 0], .15, .16, 65),
  ],
  front_kick: [
    key([-90, -220, 220], [.5, 0, 0], -.18, -.15, 80),
    key([-85, -210, 260], [.6, 0, 0], -.08, -.24, 60),
    key([-70, -180, 230], [.5, 0, 0], .12, -.30, 45),
    key([-90, -225, 220], [.5, 0, 0], .18, -.13, 65),
  ],
  shield_charge: [
    key([-110, -240, 230], [.65, 0, 0], -.10, .16, 160),
    key([-120, -210, 380], [.7, 0, 0], .10, .32, 75),
    key([-150, -180, 395], [.6, 0, 0], .23, .40, 100),
    key([-120, -260, 320], [.5, 0, 0], .34, .18, 130),
  ],
  flank_strike: [
    key([110, -70, -100], [.32, .78, -.95], -.75, .22, 125),
    key([-60, -170, 390], [1.18, .35, -.25], -.35, .26, 100),
    key([-200, -195, 470], [1.40, -.45, .40], .48, .35, 115),
    key([-320, -320, 250], [1.70, -.9, .70], .80, .20, 85),
  ],
  cannon_brace: [
    key([-110, -250, 200], [.3, 0, 0], -.10, .13, 95),
    key([-110, -220, 235], [.4, 0, 0], -.06, .17, 110),
    key([-70, -250, 130], [.25, 0, 0], .12, -.17, 145),
    key([-70, -265, 170], [.28, 0, 0], .06, -.08, 95),
  ],
  pistol_snap: [
    key([-80, -330, 155], [0, 0, 0], -.30, .12, 95),
    key([-95, -260, 435], [0, 0, 0], -.14, .19, 75),
    key([-70, -265, 390], [0, 0, 0], -.03, .03, 80),
    key([-60, -290, 380], [0, 0, 0], .10, .09, 75),
  ],
  pistol_cross: [
    key([-235, -300, 175], [0, 0, 0], .32, .12, 110),
    key([-180, -250, 415], [0, 0, 0], .16, .20, 65),
    key([-155, -260, 375], [0, 0, 0], -.03, .04, 80),
    key([-90, -290, 310], [0, 0, 0], -.26, .12, 85),
  ],
  pistol_burst: [
    key([-80, -310, 170], [0, 0, 0], 0, .18, 100),
    key([-60, -245, 420], [0, 0, 0], 0, .19, 80),
    key([-60, -245, 400], [0, 0, 0], .08, .08, 100),
    key([-65, -275, 340], [0, 0, 0], -.08, .10, 75),
  ],
};

function interpolate(values: number[], times: number[], t: number): number {
  let i = 0;
  while (i < times.length - 2 && t > times[i + 1]) i++;
  const span = Math.max(.001, times[i + 1] - times[i]);
  const u = clamp((t - times[i]) / span, 0, 1), u2 = u * u, u3 = u2 * u;
  const slope = (j: number) => j === 0 || j === values.length - 1 ? 0 : (values[j + 1] - values[j - 1]) / (times[j + 1] - times[j - 1]);
  // Continuous velocity through the contact keys; rest velocity at clip ends.
  return (2*u3-3*u2+1)*values[i] + (u3-2*u2+u)*span*slope(i) + (-2*u3+3*u2)*values[i+1] + (u3-u2)*span*slope(i+1);
}

export function attackMotionV7(action: ActionV7, frame: number, sign: number, shoulder: Vec3, carry: Vec3, carryAngles: Vec3): AttackSampleV7 {
  const fallback = action.kind === 'hammer' ? 'hammer_overhead' : action.kind === 'shove' ? 'shove' : action.kind === 'punch' ? 'body_hook' : action.kind === 'shoulder_cannon' ? 'cannon_brace' : action.kind === 'backup_pistol' ? 'pistol_snap' : action.kind === 'special_burst' ? 'pistol_burst' : action.kind === 'special_charge' ? 'shield_charge' : action.kind === 'special_flank' ? 'flank_strike' : 'blade_cross';
  const clip = clips[action.motion ?? fallback] ?? clips[fallback];
  const neutral = key([(carry[0] * sign) - Math.abs(shoulder[0]), carry[1]-shoulder[1], carry[2]], carryAngles);
  const keys = [neutral, ...clip, neutral];
  // A one-tick emission does not compress the entire physical recoil into one
  // tick. Follow-through can occupy recovery while contact remains server timed.
  const emission=action.kind==='backup_pistol'||action.kind==='shoulder_cannon';
  const followThrough=emission?Math.min(action.active+action.recovery-8,Math.max(action.active,action.kind==='backup_pistol'?12:18)):action.active;
  const times = [0, action.windup*.59, action.windup, action.windup+followThrough*.48, action.windup+followThrough, action.windup+action.active+action.recovery];
  const t = clamp(frame-action.started, 0, times[times.length-1]);
  const vector = (field: 'hand'|'angles') => [0,1,2].map(axis => interpolate(keys.map(k=>k[field][axis]),times,t)) as Vec3;
  const h = vector('hand'), r = vector('angles');
  const scalar = (field: 'twist'|'pitch'|'roll'|'crouch') => interpolate(keys.map(k=>k[field]),times,t);
  let rotation = multiplyQuatV6(axisQuatV6([0,1,0],r[1]*sign), multiplyQuatV6(axisQuatV6([1,0,0],r[0]),axisQuatV6([0,0,1],r[2]*sign)));
  // Turn the handle in the chamber so the striking face leads a rising blow.
  // The same local grip rotation moves the rendered hammer and its swept face.
  if(action.motion==='hammer_uppercut')rotation=multiplyQuatV6(rotation,axisQuatV6([0,1,0],interpolate([0,Math.PI,Math.PI,Math.PI,Math.PI,0],times,t)));
  return {hand:[(Math.abs(shoulder[0])+h[0])*sign,shoulder[1]+h[1],h[2]],rotation,twist:scalar('twist')*sign,pitch:scalar('pitch'),roll:scalar('roll')*sign,crouch:Math.max(0,scalar('crouch'))};
}
