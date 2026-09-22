/** Versioned route topology: real choices, deterministic checkpoints, no reward changes. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDiner, dispatchDiner, generateDinerMap, sanitizeDinerSave, type DinerNode, type DinerState } from '../src/lib/chef/diner/progression';
const now=Date.UTC(2026,8,26,12), serviceKinds=new Set(['slow','medium','busy','special','finale']);
let groups=0;function check(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
function paths(map:DinerNode[]):DinerNode[][]{
  const byId=new Map(map.map(n=>[n.id,n])),out:DinerNode[][]=[];
  function visit(node:DinerNode,path:DinerNode[]){const next=[...path,node];if(!node.next.length)out.push(next);else node.next.forEach(id=>visit(byId.get(id)!,next));}
  map.filter(n=>n.row===0).forEach(n=>visit(n,[]));return out;
}
function started(tutorial=false){const s=createDiner(now,'route-check');s.tutorial.finished=!tutorial;const result=dispatchDiner(s,{type:'startRun'},{now});assert.equal(result.error,undefined);return result.state;}
check('saved v3 routes keep one or two options and seven services per full path',()=>{
  for(let seed=0;seed<100;seed++){
    const map=generateDinerMap(`choices-${seed}`,3),all=paths(map);assert.equal(map.filter(n=>n.row===0).length,1);assert.equal(all.length,8);assert.equal(map.filter(n=>n.kind==='finale').length,1);
    for(const node of map){assert(node.next.length<3);assert.equal(node.next.length===0,node.row===11);for(const id of node.next)assert.equal(map.find(n=>n.id===id)!.row,node.row+1);}
    assert.equal(new Set(all.flatMap(path=>path.map(n=>n.id))).size,map.length);
    for(const path of all){assert.equal(path.length,12);assert.equal(path.filter(n=>serviceKinds.has(n.kind)).length,7);assert.equal(path.filter(n=>!serviceKinds.has(n.kind)).length,5);}
    assert.deepEqual(map,generateDinerMap(`choices-${seed}`,3));
  }
  assert.notDeepEqual(generateDinerMap('branch-seed'),generateDinerMap('other-seed'));
});
check('both main choices sacrifice the other road until the next shared service',()=>{
  for(let seed=0;seed<100;seed++){
    const map=generateDinerMap(`commit-${seed}`,3);
    for(const first of [2,6]){
      const branch=map.filter(n=>n.row===first).map(start=>{const path=[start];for(let row=first;row<first+2;row++){assert.equal(path.at(-1)!.next.length,1);path.push(map.find(n=>n.id===path.at(-1)!.next[0])!);}return path;});
      assert(branch[0].every(n=>!branch[1].some(other=>other.id===n.id)));
      assert.deepEqual(branch[0].at(-1)!.next,branch[1].at(-1)!.next);
      assert.equal(map.find(n=>n.id===branch[0].at(-1)!.next[0])!.row,first+3);
      const market=branch.find(path=>path.at(-1)!.kind==='shop')!,other=branch.find(path=>path!==market)!;
      assert(market);assert(['busy','special'].includes(market[1].kind));assert.equal(other[1].kind,'medium');
      assert.equal(other[0].kind,'bonus');assert.equal(other.at(-1)!.kind,first===2?'ingredients':'event');
    }
    assert.deepEqual(map.filter(n=>n.row===10).map(n=>n.kind).sort(),['bonus','shop']);
  }
});
check('legacy map versions keep their exact generation and in-progress checkpoint',()=>{
  const digests={1:'3c2c321e0b075542f2b5ca6452d2bee6c22a4adfb5571347d12dad15e347cbad',2:'81550a2859ea5ada7508da888a10edcb6ce6704a8df0578710aeb4c192e2e695',3:'da11f8e2e96f7a57dd628f0cbe9bcd14caffc79f4fe274f338d17e541965c656'};
  for(const version of [1,2,3] as const){
    assert.equal(createHash('sha256').update(JSON.stringify(generateDinerMap('legacy-route-snapshot',version))).digest('hex'),digests[version]);
    const state=started(),run=state.run!;run.mapVersion=version;run.map=generateDinerMap(run.seed,version);
    const taken=paths(run.map)[0].slice(0,4);run.visited=taken.map(n=>n.id);run.available=[...taken.at(-1)!.next];run.haul=237;run.strikes=1;
    const before=structuredClone(run),restored=sanitizeDinerSave(state)!;assert(restored);assert.deepEqual(restored.run,before);assert.equal(restored.coins,state.coins);assert.deepEqual(restored.equipment,state.equipment);
    const continued=dispatchDiner(restored,{type:'chooseNode',nodeId:restored.run!.available[0]},{now});assert.equal(continued.error,undefined);assert.deepEqual(continued.state.run!.map,before.map);assert.equal(continued.state.run!.mapVersion,version);
  }
});
check('new run, tutorial and head-start checkpoints keep bounded choices after reload',()=>{
  for(const tutorial of [false,true]){const state=started(tutorial);assert.equal(state.run!.mapVersion,4);assert.equal(state.run!.available.length,1);assert.deepEqual(sanitizeDinerSave(state)!.run,state.run);}
  const state=createDiner(now,'headstart');state.tutorial.finished=true;state.collections.routeWins=['downtown'];state.coins=10_000;
  const result=dispatchDiner(state,{type:'startRun',headStart:true},{now});assert.equal(result.error,undefined);assert.equal(result.state.run!.available.length,1);assert(result.state.run!.available.every(id=>result.state.run!.map.find(n=>n.id===id)!.row===4));assert(sanitizeDinerSave(result.state));
});
check('failed and voluntary returns still bank the same haul and retain purchases',()=>{
  const state=started();state.run!.haul=237;
  const returned=dispatchDiner(state,{type:'goHome'},{now});assert.equal(returned.error,undefined);assert.equal(returned.state.coins,state.coins+237);assert.equal(returned.state.lastRun!.lost,0);
  const opening=dispatchDiner(state,{type:'chooseNode',nodeId:state.run!.available[0]},{now});assert.equal(opening.error,undefined);const failed: DinerState=opening.state;failed.run!.service!.phase='failed';failed.run!.service!.strikes=3;
  const result=dispatchDiner(failed,{type:'service',action:{type:'pause'}},{now});assert.equal(result.error,undefined);assert.equal(result.state.lastRun!.reason,'failed');assert.equal(result.state.lastRun!.banked,118);assert.equal(result.state.lastRun!.lost,119);assert.equal(result.state.coins,state.coins+118);assert.deepEqual(result.state.equipment,state.equipment);assert.deepEqual(result.state.recipes,state.recipes);
});
check('tutorial v3 names match forced stops and earlier checkpoints retain every gameplay field',()=>{
  for(const version of [1,2,3] as const){
    const state=started(true),run=state.run!;run.mapVersion=version;run.map=generateDinerMap(run.seed,version);
    for(const node of run.map){if(node.row<2)node.kind='slow';else if(node.row===2)node.kind='bonus';else if(node.row===3)node.kind='busy';}
    run.available=run.map.filter(node=>node.row===0).map(node=>node.id);run.haul=137;
    const before=structuredClone(state),restored=sanitizeDinerSave(state)!;assert(restored);assert.equal(restored.run!.haul,137);assert.deepEqual(restored.run!.available,before.run!.available);
    if(version<3)assert.deepEqual(restored.run!.map,before.run!.map);
    else {for(const node of restored.run!.map.filter(node=>node.row<4))assert.equal(node.name,node.row<2?'A quiet lunch':node.row===2?'A little surprise':'Lunch rush');
      assert.deepEqual(restored.run!.map.map(({name,...node})=>node),before.run!.map.map(({name,...node})=>node));}
    assert.equal(restored.coins,before.coins);assert.deepEqual(restored.recipes,before.recipes);assert.deepEqual(restored.equipment,before.equipment);
  }
  const fresh=started(true);assert(fresh.run!.map.filter(node=>node.row===2).every(node=>node.name==='Around the corner'&&node.kind==='medium'));assert(fresh.run!.map.filter(node=>node.row===3).every(node=>node.kind==='shop'));assert.deepEqual(sanitizeDinerSave(fresh)!.run,fresh.run);
});
check('v4 guarantees equipment markets after exactly three and six services on every branch',()=>{
  for(let seed=0;seed<100;seed++){
    const map=generateDinerMap(`scheduled-${seed}`),all=paths(map);assert.equal(all.length,4);assert.deepEqual(map,generateDinerMap(`scheduled-${seed}`,4));
    for(const node of map){assert(node.next.length<=2);for(const id of node.next)assert.equal(map.find(n=>n.id===id)!.row,node.row+1);}
    assert.equal(new Set(all.flatMap(path=>path.map(n=>n.id))).size,map.length);
    for(const path of all){let services=0;const markets:number[]=[];assert.equal(path.length,12);for(const node of path){if(serviceKinds.has(node.kind))services++;if(node.kind==='shop')markets.push(services);}assert.equal(services,8);assert.deepEqual(markets,[3,6]);assert.deepEqual(path.slice(0,3).map(n=>n.kind),['slow','slow','medium']);}
    const branches=map.filter(n=>n.row===5);assert.equal(branches.length,2);for(const start of branches){let current=start;for(let row=5;row<7;row++){assert.equal(current.next.length,1);current=map.find(n=>n.id===current.next[0])!;}assert.equal(map.find(n=>n.id===current.next[0])!.kind,'shop');}
  }
});
console.log(`PASS ${groups} diner route groups`);
