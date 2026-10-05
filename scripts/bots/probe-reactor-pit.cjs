// A repeatable counterplay probe, not a substitute for human play testing.
const fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:1,target:7,esModuleInterop:true}}).outputText,f);
const {PitEngine}=require('../../src/lib/bots/pit/engine.ts'),{loaner}=require('../../src/lib/bots/pit/moves.ts');
for(const player of (process.argv.includes('--matrix')?['tank','speed','ranged']:['tank']))for(const opponent of (process.argv.includes('--matrix')?['tank','speed','ranged']:['speed']))for(const policy of ['spam','deliberate']){
 let wins=0,losses=0,damage=0,taken=0;
 for(let seed=100;seed<112;seed++){
  const e=new PitEngine([loaner(player),loaner(opponent)],{seed,difficulty:'normal'});
  const pulse=k=>{e.input(0,k);e.input(0,k,false)},held=(k,on)=>{if(e.actors[0].held.has(k)!==on)e.input(0,k,on)};
  for(let t=0;t<22000&&e.phase!=='result'&&e.phase!=='finishPrompt';t++){
   if(e.phase==='fight'&&t%5===0){
    const a=e.actors[0],b=e.actors[1],dist=Math.abs(a.x-b.x);
    for(const k of ['right','left','guard','down'])held(k,false);
    if(dist>1650)held(b.x>a.x?'right':'left',true);
    if(policy==='spam')pulse('light');
    else if(a.attack?.hits.includes(1)){
     if(a.attack.move.id==='light')pulse('heavy');
     else if(a.attack.move.id==='heavy'){held(a.facing===1?'right':'left',true);pulse(a.energy>=200?'super':'special')}
    }else if(b.attack&&b.attack.frame<b.attack.move.startup+b.attack.move.active&&dist<2700){held('guard',true);if(b.attack.move.level==='low')held('down',true)}
    else if(!a.attack&&dist<1900){if(b.held.has('guard')){held('down',true);pulse('light')}else pulse('light')}
   }
   e.step();
  }
  if(e.winner===0)wins++;else losses++;
  for(const event of e.events)if(event.kind==='hit'){if(event.who===0)damage+=event.amount;else taken+=event.amount}
 }
 console.log(JSON.stringify({player,opponent,policy,wins,losses,damage,taken}));
}
