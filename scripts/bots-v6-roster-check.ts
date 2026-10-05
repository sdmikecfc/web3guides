import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createFightV6,presetV6,stepFightV6,advanceFightV6,runFightV6,replayV6,resolveImpactV6,hashV6,type SweepContactV6} from '../src/lib/bots/v6';
const baseline=JSON.parse(readFileSync(path.join(__dirname,'fixtures/bots-v6-Z-reference-builds.json'),'utf8')).hashes as Record<string,string>;
let groups=0;const check=(name:string,f:()=>void)=>{f();groups++;console.log(`PASS ${name}`);};
check('roster tuning preserves every canonical reference and every signature definition exactly',()=>{
 for(const style of ['tank','speed','ranged'] as const)for(const tier of [1,2,3,4] as const){assert.equal(hashV6(presetV6(style,tier)),baseline[`${style}:${tier}:ordinary`]);if(tier>=3)assert.equal(hashV6(presetV6(style,tier,{signature:true})),baseline[`${style}:${tier}:signature`]);}
});
check('real ordinary shock swings already build a stun from three clean contacts',()=>{
 const s=createFightV6(391,presetV6('speed',2,{weapon:'shock_blade'}),presetV6('tank',2),{autoSpecial:[true,true]});let proved=false;while(!s.done&&!proved){stepFightV6(s);const stun=s.events.find(e=>e.kind==='stun'&&e.who===0&&e.frame===s.frame);if(!stun)continue;const trio=s.events.filter(e=>e.kind==='shock'&&e.who===0).slice(-3);if(trio.length<3||trio[1].frame-trio[0].frame>=90||trio[2].frame-trio[1].frame>=90)continue;assert.equal(trio[2].frame,stun.frame);for(const hit of trio)assert(s.events.some(e=>e.kind==='hit'&&e.weapon==='shock_blade'&&e.attackId===hit.attackId));assert.equal(s.fighters[1].stunnedUntil,stun.frame+24);assert.equal(s.fighters[1].immuneUntil,stun.frame+144);proved=true;}assert(proved);
});
check('a genuine two-second gap decays shock, and physical guard prevents status application',()=>{
 const contact=(slot:'torso'|'armL'):SweepContactV6=>({t:0,slot,point:[0,1500,0],normal:[0,0,1000],localPoint:[0,500,1000],localNormal:[0,0,1000]}),s=createFightV6(10,presetV6('speed',2,{weapon:'shock_blade'}),presetV6('tank',2),{autoSpecial:[false,false]});s.fighters.forEach(f=>{f.nextAction=99999;f.nextDodge=99999;});
 const impact=(slot:'torso'|'armL')=>resolveImpactV6(s,{who:0,weapon:'shock_blade',mount:'right',attackId:s.frame+1,contact:contact(slot),damage:3,shock:36,source:[0,0,1000]});impact('torso');advanceFightV6(s,60);impact('torso');assert.equal(s.fighters[1].shock,72);advanceFightV6(s,149);assert.equal(s.fighters[1].shock,72);advanceFightV6(s,180);assert.equal(s.fighters[1].shock,60);assert(!s.events.some(e=>e.kind==='stun'));
 const f=s.fighters[1];f.x=f.z=f.yaw=0;f.guard=20;f.guardPose=1;f.stunnedUntil=f.downUntil=0;impact('armL');assert.equal(f.shock,60);assert.equal(s.events.at(-1)?.kind,'block');resolveImpactV6(s,{who:0,weapon:'flame_sword',mount:'right',attackId:999,contact:contact('armL'),damage:3,burn:2.2,source:[0,0,1000]});assert.equal(f.burn,null);
});
check('flame sword and flamethrower replay burn events keep their actual source weapon',()=>{
 for(const weapon of ['flame_sword','flamethrower'] as const){const r=runFightV6(391,presetV6(weapon==='flame_sword'?'speed':'ranged',2,{weapon}),presetV6('tank',2),{autoSpecial:[true,true]}),burns=r.events.filter(e=>e.kind==='burn'&&e.who===0);assert(burns.length>0);assert(burns.every(e=>e.weapon===weapon));for(const burn of burns)assert(r.events.some(e=>e.who===0&&e.kind==='hit'&&e.weapon===weapon&&e.attackId===burn.attackId));const replay=replayV6(r);assert.equal(replay.hash,r.hash);assert.deepEqual(replay.events,r.events);}
});
console.log(JSON.stringify({ok:true,groups}));
