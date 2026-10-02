/** Authoring check: sample the real rigid rig through each new motion curve. */
import assert from 'node:assert/strict';
import {createHeroBuildV7,createFightV7,fighterPoseV7} from '@/lib/bots/v7';
import {markerV7,restNodesV7,worldNodesV7} from '@/lib/bots/v7/rig';
import {length3,subtract,axisQuatV6} from '@/lib/bots/v6/math';
import type {ActionMotionV7,ActionV7,StyleV7} from '@/lib/bots/v7';

const rows: {style:StyleV7;kind:ActionV7['kind'];motions:ActionMotionV7[]}[]=[
  {style:'tank',kind:'hammer',motions:['hammer_overhead','hammer_cross','hammer_uppercut']},
  {style:'speed',kind:'paired_blades',motions:['blade_cross','blade_reverse','blade_lunge']},
  {style:'ranged',kind:'kick',motions:['front_kick']},
  {style:'ranged',kind:'backup_pistol',motions:['pistol_snap','pistol_cross']},
];
for(const row of rows)for(const motion of row.motions){
  const s=createFightV7([createHeroBuildV7(row.style),createHeroBuildV7('tank')],75);
  const f=s.fighters[0],rig=s.builds[0].rig;
  f.x=0;f.z=0;f.yaw=0;s.fighters[1].x=0;s.fighters[1].z=1500;s.fighters[1].yaw=3142;
  const rest=restNodesV7(rig);rest.root.position=[0,0,0];rest.root.quaternion=axisQuatV6([0,1,0],0);const world=worldNodesV7(rig,rest);
  for(const suffix of ['L','R'] as const){const p=markerV7(rig,world,'sole'+suffix),foot=f.feet[suffix==='L'?'left':'right'];foot.plant=[...p];foot.from=[...p];foot.to=[...p];foot.planted=!(row.kind==='kick'&&suffix==='R');}
  f.action={id:1,kind:row.kind,motion,mount:'right',started:0,windup:32,active:14,recovery:32,released:false,hitTargets:[],aim:[0,1250,1500],aimError:[0,0,0],critical:false,emissions:0,nextPulse:0,burstBudget:0};
  let previous=fighterPoseV7(s,0),maximumHandStep=0,maximumReach=0;const points:number[][]=[];
  for(let frame=1;frame<=78;frame++){
    s.frame=frame;const pose=fighterPoseV7(s,0);
    maximumHandStep=Math.max(maximumHandStep,length3(subtract(pose.worldNodes.handR.position,previous.worldNodes.handR.position)));
    maximumReach=Math.max(maximumReach,pose.support.maxReachError);
    for(const suffix of ['L','R'])for(const [a,b]of [['shoulder','elbow'],['elbow','wrist'],['hip','knee'],['knee','ankle']])assert(Math.abs(length3(subtract(pose.worldNodes[a+suffix].position,pose.worldNodes[b+suffix].position))-length3(rig.nodes[b+suffix].position))<.001,'A rigid bone stretched');
    if(frame>=32&&frame<46)points.push(row.kind==='kick'?pose.support.feet.right:row.kind==='backup_pistol'?pose.mounts.right!.muzzle:markerV7(rig,pose.worldNodes,'weaponStrikeR'));
    previous=pose;
  }
  assert(Number.isFinite(maximumReach));
  console.log(JSON.stringify({motion,maxHandStepMm:Math.round(maximumHandStep),maxUnreachableMm:Math.round(maximumReach),contactBounds:{min:[0,1,2].map(i=>Math.round(Math.min(...points.map(p=>p[i])))),max:[0,1,2].map(i=>Math.round(Math.max(...points.map(p=>p[i]))))}}));
}
