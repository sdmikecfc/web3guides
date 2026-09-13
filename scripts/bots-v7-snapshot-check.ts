import assert from 'node:assert/strict';
import {createHeroBuildV7,createFightV7,validBuildV7,RULES_V7} from '@/lib/bots/v7';
import {cloneV6} from '@/lib/bots/v6/math';
const build=createHeroBuildV7('speed');assert.equal(build.name,'Roller Daredevil');assert.equal(build.rulesVersion,'mk7-proof-3');assert.equal(build.stats.armour[0],Math.round(build.stats.armour[1]*.65));assert.equal(RULES_V7.rulesVersion,build.rulesVersion);
const old=cloneV6(build) as unknown as {rulesVersion:string};old.rulesVersion='mk7-proof-2';assert.equal(validBuildV7(old),false);assert.throws(()=>createFightV7([old as unknown as typeof build,build],7),/saved remaster build/);
const forged=cloneV6(build);forged.stats.armour[1]+=100;assert.equal(validBuildV7(forged),false);assert.throws(()=>createFightV7([build,build],7,{autoSpecial:[1,true] as unknown as [boolean,boolean]}),/valid Special/);console.log('v7 snapshot:5checks passed (proof3,name,head budget,old/forged snapshots,controls).');
