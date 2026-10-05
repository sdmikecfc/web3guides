import {createHeroBuildV7,createFightV7,stepFightV7,fighterPoseV7} from '@/lib/bots/v7';
import {length3,subtract} from '@/lib/bots/v6/math';
import assert from 'node:assert/strict';
for(const pair of [['tank','speed'],['tank','ranged'],['speed','ranged']] as const){
  const s=createFightV7([createHeroBuildV7(pair[0]),createHeroBuildV7(pair[1])],75,{autoSpecial:[true,true]});
  const peaks:any[]=[];let maxReachError=0,reachFrame=0;
  while(!s.done){
    const prior=s.fighters.map(f=>({action:f.action?{motion:f.action.motion,age:s.frame-f.action.started,phase:[f.action.windup,f.action.active,f.action.recovery]}:null,defence:f.defence,reaction:f.reaction,special:f.special?.style}));
    const p=[fighterPoseV7(s,0),fighterPoseV7(s,1)];stepFightV7(s);
    for(const who of [0,1] as const){const f=s.fighters[who],now=fighterPoseV7(s,who);
      if(now.support.maxReachError>maxReachError){maxReachError=now.support.maxReachError;reachFrame=s.frame;}
      for(const suffix of ['L','R'])if(f.armour[suffix==='L'?2:3]>0){const mm=length3(subtract(p[who].worldNodes['hand'+suffix].position,now.worldNodes['hand'+suffix].position));
        if(mm>180)peaks.push({mm:Math.round(mm),frame:s.frame,who,hand:suffix,prior:prior[who],current:{action:f.action?{motion:f.action.motion,age:s.frame-f.action.started,phase:[f.action.windup,f.action.active,f.action.recovery]}:null,defence:f.defence,reaction:f.reaction,special:f.special?.style},pelvis:[p[who].nodes.pelvis,now.nodes.pelvis]});
      }
    }
  }
  peaks.sort((a,b)=>b.mm-a.mm);console.log(JSON.stringify({pair,frames:s.frame,maxReachError,reachFrame,peaks:peaks.slice(0,6)}));
  assert(maxReachError<2,`Unreachable support in ${pair} at frame ${reachFrame}: ${maxReachError}mm`);
}
