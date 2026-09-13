import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHeroBuildV7,createFightV7,stepFightV7,resultV7,replayV7,type ResultV7} from '@/lib/bots/v7';
import {cloneV6,hashV6} from '@/lib/bots/v6/math';

const directory=process.env.BOTS_V7_RESULT_DIR;
const packets:{name:string;record:ResultV7}[]=directory?fs.readdirSync(directory).filter(name=>name.endsWith('.result.json')).sort().map(name=>({name,record:JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'))})):[];
if(directory)assert(packets.length>0,'No actual saved result packets found.');
else{const s=createFightV7([createHeroBuildV7('speed'),createHeroBuildV7('ranged')],76,{autoSpecial:[true,true]});while(!s.done)stepFightV7(s);packets.push({name:'local-replay-fixture',record:resultV7(s)});}
for(const {name,record} of packets){const replay=replayV7(record);assert.deepEqual(replay,record,'Saved result must reproduce every field, including contact anchors.');console.log(JSON.stringify({name,rules:record.rulesVersion,frames:record.frames,hash:record.hash,events:record.events.length,exactReplay:true}));}
const original=packets[0].record,changed=cloneV6(original);changed.events[0].target=changed.events[0].target===0?1:0;
assert.throws(()=>replayV7(changed),/checksum/,'Edited payload with stale checksum must be rejected.');
const {hash:oldHash,...payload}=changed;changed.hash=hashV6(payload);
assert.throws(()=>replayV7(changed),/does not match/,'Rehashing altered events must not bypass strict simulation replay.');
console.log(JSON.stringify({packets:packets.length,tamperingChecks:2,strictReplay:true}));
