import assert from 'node:assert/strict';
import {segmentBoxSurfaceV7,sweepWeaponSegmentV7,sweepRobotV7,earlierContactV7} from '../src/lib/bots/v7/collision';
import {canonicalRecordedV7} from '../src/lib/bots/v7/recording';
import {inverseQuatV6,rotateQuatV6,subtract,normalize,dotV6,hashV6,type Vec3} from '@/lib/bots/v6/math';
import type {HitProxyV6} from '@/lib/bots/v6/collision';

const zero:Vec3=[0,0,0],half:Vec3=[100,100,100];
assert.deepEqual(segmentBoxSurfaceV7([-200,0,0],[0,0,0],zero,half)?.target,[-100,0,0]);
assert.deepEqual(segmentBoxSurfaceV7([0,0,0],[200,0,0],zero,half)?.target,[100,0,0]);
assert.deepEqual(segmentBoxSurfaceV7([0,0,0],[0,0,0],zero,half)?.normal,[1,0,0]);
assert.deepEqual(segmentBoxSurfaceV7([-200,-200,0],[0,0,0],zero,half)?.normal,[-1,0,0]);
assert.equal(segmentBoxSurfaceV7([-200,101,0],[200,101,0],zero,half),null);

// Frozen original browser/Node disagreement: seed75, Tank/Speed, tick866,
// right blade versus head. Keep these measurements independent of fresh poses.
const oldA:Vec3=[312.3502502418499,1402.2691294353472,-483.6195334580194],oldB:Vec3=[-51.08624803693425,1849.1356678701004,-3.281934944018076],a:Vec3=[186.9139556505145,1348.2112533529848,-437.4783357581156],b:Vec3=[-289.89141504211955,1691.8357927454265,28.43883972052072];
const prior:HitProxyV6={slot:'head',shape:'box',center:[-520.5889478570091,2025.8377322619085,-63.390484474217295],half:[564.9999,481.6999,434.5],orientation:[0.0012196818960062594,0.959390736506449,-0.022873666775404977,0.2811489328628753]};
const current:HitProxyV6={...prior,center:[-520.1484820978145,2023.9142823108675,-65.70578428274324],orientation:[0.0010788221457240289,0.9597285057587558,-0.023528936043266842,0.2799400302663339]};
const root={x:0,z:0,yaw:0},armour=[100,100,100,100,100,100];
const sweep=(delta:number)=>sweepWeaponSegmentV7(oldA.map(v=>v+delta) as Vec3,oldB.map(v=>v-delta) as Vec3,a,b,root,root,[current],armour,26,[prior]);
const contact=sweep(0);assert(contact);assert.equal(contact.t,0);
const local=rotateQuatV6(subtract(contact.point,prior.center),inverseQuatV6(prior.orientation!));
assert(local.every((v,i)=>Math.abs(v)<=prior.half[i]+1));assert(Math.abs(local[2]-prior.half[2])<1,'Original corner must land on the actual local Z face.');
const expectedNormal=rotateQuatV6([0,0,1],prior.orientation!);assert(dotV6(normalize(contact.normal),expectedNormal)>.999999,'Normal must rotate with the head, not choose a world axis.');
for(const jitter of [-1e-10,-1e-12,1e-12,1e-10])assert.deepEqual(sweep(jitter),contact,'Last-bit perturbations changed the intersecting face.');

assert(!earlierContactV7(.5-1e-12,.5));assert(earlierContactV7(.5-1e-8,.5));
const head:HitProxyV6={slot:'head',center:zero,half},torso:HitProxyV6={...head,slot:'torso',center:[-1e-12,0,0]};
const ordered=sweepRobotV7([-200,0,0],[200,0,0],root,root,[head,torso],armour);assert.equal(ordered?.slot,'head','Nearly equal TOI must retain authored proxy ordering.');
const raw={point:[-395.8162084136211,8.000010000000032,56.21481892090081],normal:[-.16969383585114886],id:33};
const varied={point:[-395.81620841362115,8.000010000000032,56.214818920900825],normal:[-.1696938358511489],id:33};
assert.equal(hashV6(canonicalRecordedV7(raw)),hashV6(canonicalRecordedV7(varied)));assert.deepEqual(canonicalRecordedV7(canonicalRecordedV7(raw)),canonicalRecordedV7(raw));assert.throws(()=>canonicalRecordedV7({point:[Infinity]}),/non-finite/);
console.log(JSON.stringify({groups:5,originalCorner:{frame:866,point:contact.point,normal:contact.normal},checks:['local entry/exit/internal/corner faces','original oriented-box overlap and four perturbations','near-equal contact ordering','canonical event precision','non-finite recording rejection']}));
