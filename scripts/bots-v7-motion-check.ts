import assert from 'node:assert/strict';
import {createHeroBuildV7,createFightV7,stepFightV7,acceptSpecialV7,resultV7,replayV7,fighterPoseV7,AFTERMATH_FRAMES_V7} from '@/lib/bots/v7';
import {hashV6,length3,subtract,rotateQuatV6,add} from '@/lib/bots/v6/math';
import {transformPointV7} from '@/lib/bots/v7/rig';
const builds=[createHeroBuildV7('speed'),createHeroBuildV7('ranged')] as [ReturnType<typeof createHeroBuildV7>,ReturnType<typeof createHeroBuildV7>];
const hashes:string[]=[];let groups=0;
for(const renderRate of [30,60,144]){const s=createFightV7(builds,76,{autoSpecial:[false,true]}),commands=new Set<string>();let nextRender=0;while(!s.done){if(s.fighters[0].meter>=100&&!s.fighters[0].special&&!commands.size){const receipt=acceptSpecialV7(s,{id:'manual-special-1',who:0,kind:'special',frame:s.frame});if(receipt.accepted)commands.add('1');}
    stepFightV7(s);while(nextRender<=s.frame){const hash=hashV6(s);for(const who of [0,1] as const){const p=fighterPoseV7(s,who);assert.equal(hashV6(p),hashV6(fighterPoseV7(s,who)));for(const suffix of ['L','R']){for(const [a,b] of [['shoulder','elbow'],['elbow','wrist'],['hip','knee'],['knee','ankle']]){const actual=length3(subtract(p.worldNodes[a+suffix].position,p.worldNodes[b+suffix].position)),rest=length3(s.builds[who].rig.nodes[b+suffix].position);assert(Math.abs(actual-rest)<.001,`${a}/${b} stretch`);}}
      assert(s.fighters[who].motionTrail.length<=12);for(let i=1;i<s.fighters[who].motionTrail.length;i++)assert.equal(s.fighters[who].motionTrail[i].frame-s.fighters[who].motionTrail[i-1].frame,4);
      for(const mount of Object.values(p.mounts))assert(mount&&[...mount.muzzle,...mount.forward].every(Number.isFinite));
    }assert.equal(hashV6(s),hash,'Rendering changed the simulation.');nextRender+=60/renderRate;}
  }assert(s.commands.length>0,'The proof never reached a manual Special.');const result=resultV7(s);assert.equal(replayV7(result).hash,result.hash);hashes.push(result.hash);
  const stateHash=hashV6(s),loser=(1-s.winner!) as 0|1,begin=fighterPoseV7(s,loser),end=fighterPoseV7(s,loser,s.frame+AFTERMATH_FRAMES_V7);assert.notDeepEqual(begin.nodes.pelvis,end.nodes.pelvis);assert.equal(hashV6(s),stateHash);assert.equal(end.aftermath,1);
  for(const event of result.events.filter(e=>e.kind==='break'&&e.slot!=='torso')){assert(event.detachPose);assert(event.detachPose.nodes[event.detachPose.node]);assert(event.impulse?.every(Number.isFinite));}
  groups++;console.log(JSON.stringify({renderRate,frames:result.frames,hash:result.hash,commands:result.commands.length,breaks:result.events.filter(e=>e.kind==='break').length}));
}
assert.equal(new Set(hashes).size,1);groups++;
const a=createFightV7([createHeroBuildV7('tank'),createHeroBuildV7('tank')],5),f=a.fighters[0];f.meter=100;f.stunnedUntil=24;assert.equal(acceptSpecialV7(a,{id:'stunned',who:0,kind:'special',frame:0}).accepted,false);f.stunnedUntil=0;const command={id:'ready',who:0 as const,kind:'special' as const,frame:0};assert(acceptSpecialV7(a,command).accepted);assert(acceptSpecialV7(a,command).accepted);assert.equal(a.commands.length,1);f.armour[4]=0;f.armour[5]=0;for(let i=0;i<100;i++)stepFightV7(a);assert.equal(a.events.filter(e=>e.who===0&&(e.kind==='dodge'||e.weapon==='special_charge')).length,0);groups++;
console.log(`v7 motion: ${groups} groups passed; 30/60/144Hz sampling is deterministic, exact rigid joints, manual retry/control and limb gates.`);
