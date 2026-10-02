import {createHeroBuildV7,createFightV7,stepFightV7,type StateV7,type ActionV7} from '@/lib/bots/v7';
import {restNodesV7,worldNodesV7,markerV7} from '@/lib/bots/v7/rig';
import {axisQuatV6} from '@/lib/bots/v6/math';
const rows:unknown[]=[];
for(const style of ['tank','speed'] as const)for(const target of ['tank','speed','ranged'] as const)for(const distance of [1300,1400,1450,1500,1600,1700]){
  const s=createFightV7([createHeroBuildV7(style),createHeroBuildV7(target)],75,{autoSpecial:[false,false]});
  for(const side of [0,1] as const){const f=s.fighters[side];f.x=0;f.z=side?distance:0;f.yaw=side?3142:0;f.nextAction=9999;s.stats[side].movement=0;s.stats[side].turnRate=0;const rig=s.builds[side].rig,nodes=restNodesV7(rig);nodes.root.position=[f.x,0,f.z];nodes.root.quaternion=axisQuatV6([0,1,0],f.yaw/1000);const world=worldNodesV7(rig,nodes);for(const suffix of ['L','R'] as const){const foot=f.feet[suffix==='L'?'left':'right'],p=markerV7(rig,world,'sole'+suffix);foot.plant=p;foot.from=[...p];foot.to=[...p];}}
  const w=s.builds[0].capabilities.weaponDefinition,a:ActionV7={id:1,kind:w.id,mount:'right',started:0,windup:w.windup,active:w.active,recovery:w.recovery,released:false,hitTargets:[],aim:[0,1450,distance],aimError:[0,0,0],critical:false,emissions:0,nextPulse:0,burstBudget:0};s.fighters[0].action=a;
  for(let i=0;i<w.windup+w.active+1;i++)stepFightV7(s);const hits=s.events.filter(e=>e.who===0&&(e.kind==='hit'||e.kind==='block'));rows.push({style,target,distance,hits:hits.map(e=>({frame:e.frame,slot:e.slot,damage:e.damage}))});
}
console.log(JSON.stringify(rows));
