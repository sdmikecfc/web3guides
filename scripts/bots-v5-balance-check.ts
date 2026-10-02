import assert from 'node:assert/strict';
import {presetV5,runFightV5,STYLES_V5} from '../src/lib/bots/v5';
const seeds=64, report=[];let matches=0,timeouts=0,ends=0;
for(const tier of [1,2,3,4] as const){
  const wins=STYLES_V5.map(()=>[0,0,0]),duration=STYLES_V5.map(()=>[0,0,0]);let firstWins=0,minShots=Infinity;
  for(const [ai,a]of Array.from(STYLES_V5.entries()))for(const [bi,b]of Array.from(STYLES_V5.entries()))for(let seed=1;seed<=seeds;seed++){
    const s=runFightV5(seed,presetV5(a,tier),presetV5(b,tier),{autoSpecial:[true,true]});wins[ai][bi]+=s.winner===0?1:0;firstWins+=s.winner===0?1:0;duration[ai][bi]+=s.frame/60;matches++;timeouts+=s.frame===5400?1:0;ends+=s.events.filter(e=>e.kind==='charge'||e.kind==='flank'||e.kind==='shot'&&e.weapon==='smg').length;if(a==='ranged')minShots=Math.min(minShots,s.fighters[0].shots);if(b==='ranged')minShots=Math.min(minShots,s.fighters[1].shots);
  }
  const matrix=wins.map((row,a)=>row.map((n,b)=>a===b?.5:(n+seeds-wins[b][a])/(seeds*2))),overall=matrix.map(row=>row.reduce((n,v)=>n+v)/3);
  for(const row of matrix)for(const rate of row)assert(rate>=.30&&rate<=.70,`T${tier} pair rate ${(rate*100).toFixed(1)} outside30–70`);
  for(const rate of overall)assert(rate>=.40&&rate<=.60,`T${tier} overall ${(rate*100).toFixed(1)} outside40–60`);
  assert(minShots>0,'a ranged robot never fired');
  report.push({tier,styleOrder:STYLES_V5,mirroredWinPercent:matrix.map(row=>row.map(n=>+(n*100).toFixed(1))),overallWinPercent:overall.map(n=>+(n*100).toFixed(1)),meanSeconds:duration.map(row=>row.map(n=>+(n/seeds).toFixed(1))),side0WinPercent:+(firstWins/(9*seeds)*100).toFixed(1),minimumRifleShots:minShots});
}
assert.equal(timeouts,0);console.log(JSON.stringify({seedsPerOrderedPair:seeds,matches,timeouts,endingEvents:ends,report},null,2));console.log('PASS equal-budget T1–T4 mirrored pair and overall balance gates. This bounded seeded sample does not prove all mixed builds are balanced.');
