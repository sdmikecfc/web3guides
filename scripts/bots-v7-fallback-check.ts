import assert from 'node:assert/strict';
import {createHeroBuildV7,createFightV7,stepFightV7} from '@/lib/bots/v7';
const s=createFightV7([createHeroBuildV7('tank'),createHeroBuildV7('tank')],17,{autoSpecial:[false,false]});s.fighters[0].armour[3]=0;s.fighters[1].nextAction=9999;s.stats[1].movement=0;s.stats[1].turnRate=0;
for(let i=0;i<360&&!s.done;i++)stepFightV7(s);
const hits=s.events.filter(e=>e.who===0&&e.weapon==='punch'&&(e.kind==='hit'||e.kind==='block'));assert(hits.length>0,'The surviving left fist never reaches the opponent.');assert.equal(s.events.filter(e=>e.who===0&&e.kind==='windup'&&e.weapon==='hammer').length,0);assert(hits.every(e=>e.mount==='left'));console.log(JSON.stringify({checks:3,frames:s.frame,punchContacts:hits.length,firstContact:hits[0].frame,finalDistance:Math.hypot(s.fighters[0].x-s.fighters[1].x,s.fighters[0].z-s.fighters[1].z)}));
