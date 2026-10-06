/** Exercise the shipped batch builder and actual GameStage truck callbacks. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { isTruckCommand, takeTruckBatch } from "../src/app/chef/game/_chain/truck-tape";
import { applyKitchenCommand, initializeKitchen, publicAuthority, type KitchenCommand } from "../src/lib/chef/authority";
import { dispatchTruck, type TruckAction } from "../src/app/chef/game/_engine/truck";

const source=ts.createSourceFile("GameStage.tsx",readFileSync("src/app/chef/game/GameStage.tsx","utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function callback(name:string,environment:Record<string,unknown>):any {
  let arrow:ts.Expression|undefined;
  function walk(node:ts.Node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text===name&&node.initializer&&ts.isCallExpression(node.initializer))arrow=node.initializer.arguments[0];ts.forEachChild(node,walk);}
  walk(source);assert.ok(arrow,`actual callback ${name} exists`);
  const output=ts.transpileModule(`const selected=${arrow!.getText(source)};`,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
  return new Function(...Object.keys(environment),`${output};return selected;`)(...Object.values(environment));
}
const now=Date.UTC(2026,8,20,12),noop=()=>{};
function fixture(){
  let record=applyKitchenCommand(initializeKitchen(null,now),{type:"truck",action:{type:"start",node:1}},now,"alice").actor;
  const makeSnapshot=()=>({ok:true,save:structuredClone(record.save),revision:record.revision,authority:publicAuthority(record,record.save.savedAt)});
  const initial=makeSnapshot(),w={truck:structuredClone(record.save.truck),playMoney:record.save.coins,pantry:structuredClone(record.save.pantry),inventory:structuredClone(record.save.inventory)};
  const requests:{command:KitchenCommand,resolve:(response:any)=>void}[]=[];
  let pending:KitchenCommand|null=null,error="";
  const cloud={wallet:"alice",authorityRef:{current:initial},pendingCommand:()=>pending,command:async(command:KitchenCommand)=>{pending=structuredClone(command);return new Promise(resolve=>requests.push({command:structuredClone(command),resolve}));}};
  const env:any={worldRef:{current:w},cloudRef:{current:cloud},truckActionsRef:{current:[]},truckSendingRef:{current:false},truckFlightRef:{current:null},truckUncertainRef:{current:false},flushTruckRef:{current:null},authoritative:()=>true,dispatchTruck,isTruckCommand,takeTruckBatch,setTruckBusy:noop,setTruckError:(value:string)=>{error=value;},renderTruck:noop,saveGuestProgress:noop};
  env.syncAuthorityRef={current:(snapshot:any)=>{w.truck=structuredClone(snapshot.save.truck);w.playMoney=snapshot.save.coins;w.inventory=structuredClone(snapshot.save.inventory);w.pantry=structuredClone(snapshot.save.pantry);}};
  env.applyTruckLocal=callback("applyTruckLocal",env);env.flushTruckRef.current=callback("flushTruck",env);env.onTruckAction=callback("onTruckAction",env);
  const exit=callback("prepareTruckExit",env);
  const confirm=(index:number,time:number,grant=false)=>{record=applyKitchenCommand(record,requests[index].command,time,"alice").actor;if(grant)record.save.inventory.fryer_basic=1;const snapshot=makeSnapshot();cloud.authorityRef.current=snapshot;pending=null;requests[index].resolve(snapshot);};
  return {env,w,requests,cloud,exit,confirm,getError:()=>error};
}
const turn=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};

(async()=>{
  {
    const tape:TruckAction[]=[{type:"start",node:1},{type:"tick",ticks:80},{type:"tick",ticks:80},{type:"pause"},{type:"resume"},{type:"tick",ticks:5}];
    const batches:TruckAction[][]=[];while(tape.length)batches.push(takeTruckBatch(tape));
    assert.deepEqual(batches,[[{type:"start",node:1}],[{type:"tick",ticks:80},{type:"tick",ticks:20}],[{type:"tick",ticks:60}],[{type:"pause"}],[{type:"resume"}],[{type:"tick",ticks:5}]]);
    assert.ok(batches.every(batch=>batch.filter(action=>action.type==="tick").reduce((sum,action)=>sum+action.ticks,0)<=100));
    console.log("ok batching preserves ordered ticks, bounds each tape, and isolates clock lifecycle receipts");
  }
  {
    const f=fixture();f.env.onTruckAction({type:"tick",ticks:20});
    const first=f.env.flushTruckRef.current();await turn();assert.equal(f.requests.length,1);
    let exited=false;const exit=f.exit().then((ok:boolean)=>{exited=ok;return ok;});await turn();
    assert.equal(exited,false);assert.equal(f.w.inventory.fryer_basic??0,0);
    f.confirm(0,now+1000,true);await turn();assert.equal(f.requests.length,2);assert.equal(exited,false);
    assert.deepEqual(f.requests[1].command,{type:"truckBatch",actions:[{type:"pause"}]});
    f.confirm(1,now+1100);assert.equal(await first,true);assert.equal(await exit,true);
    assert.equal(f.w.truck.run!.phase,"paused");assert.equal(f.w.inventory.fryer_basic,1);
    console.log("ok going home waits for the in-flight tape, canonical equipment grant, and pause receipt");
  }
  {
    const f=fixture();f.env.onTruckAction({type:"tick",ticks:20});f.w.playMoney+=999;
    const first=f.env.flushTruckRef.current();await turn();f.requests[0].resolve(null);assert.equal(await first,false);
    assert.equal(f.w.playMoney,f.cloud.authorityRef.current.save.coins,"speculative rewards are removed immediately");
    assert.equal(f.w.truck.run!.phase,"paused");assert.equal(f.env.truckUncertainRef.current,true);
    const retry=f.env.flushTruckRef.current(true);await turn();assert.deepEqual(f.requests[1].command,f.requests[0].command);
    f.confirm(1,now+1000);assert.equal(await retry,true);assert.equal(f.w.truck.run!.tick,20);assert.equal(f.env.truckUncertainRef.current,false);
    console.log("ok uncertain trip rebases speculative rewards and retries only its original pending tape");
  }
  {
    const f=fixture();f.env.onTruckAction({type:"tick",ticks:20});const flight=f.env.flushTruckRef.current();await turn();
    f.env.onTruckAction({type:"tick",ticks:20});assert.equal(f.w.truck.run!.tick,40);
    f.confirm(0,now+1000);assert.equal(await flight,true);
    assert.equal(f.w.truck.run!.tick,40,"canonical prefix plus unsent suffix, never replay the submitted prefix");
    assert.deepEqual(f.env.truckActionsRef.current,[{type:"tick",ticks:20}]);
    console.log("ok canonical receipts rebase only the unsent predicted suffix");
  }
  {
    const f=fixture();f.env.onTruckAction({type:"tick",ticks:20});const flight=f.env.flushTruckRef.current();await turn();
    f.cloud.pendingCommand=()=>null;f.requests[0].resolve(null);assert.equal(await flight,false);
    assert.equal(f.w.truck.run!.phase,"playing","a conclusive refusal must not invent a local pause absent from the server");
    assert.equal(f.w.truck.run!.tick,0);assert.equal(f.env.truckUncertainRef.current,false);
    console.log("ok conclusive action refusal restores the actual phase without a false Resume dead end");
  }
  {
    const f=fixture(),coins=f.w.playMoney;
    const service=f.w.truck.run!,pass=service.stations.find(station=>station.machineId==="pass")!;
    service.player.x=pass.x;service.player.y=pass.y+1;service.player.held={id:999,kind:"plate_pasta"};
    assert.equal(f.env.applyTruckLocal({type:"interact",stationId:pass.id}),true);
    assert.equal(f.w.playMoney,coins,"connected predicted sales are not spendable money");
    f.w.truck.run=null;f.w.truck.nextNode=3;
    assert.equal(f.env.applyTruckLocal({type:"marketVisit",node:3}),true);
    assert.ok(f.w.truck.unlockedMachineIds.includes("fryer"));assert.equal(f.w.inventory.fryer_basic??0,0,"home equipment waits for the canonical grant");
    console.log("ok connected prediction never credits spendable coins or home equipment before confirmation");
  }
  {
    const f=fixture();f.env.onTruckAction({type:"tick",ticks:20});const first=f.env.flushTruckRef.current();await turn();
    f.env.onTruckAction({type:"tick",ticks:80});f.env.onTruckAction({type:"tick",ticks:1});
    assert.equal(f.w.truck.run!.phase,"paused");assert.equal(f.w.truck.run!.tick,100);
    assert.deepEqual(f.env.truckActionsRef.current,[{type:"tick",ticks:80},{type:"pause"}]);
    const drain=f.env.flushTruckRef.current(true);
    f.confirm(0,now+1000);await turn();assert.equal(f.requests.length,2);
    f.confirm(1,now+5000);await turn();assert.equal(f.requests.length,3);
    f.confirm(2,now+5000);assert.equal(await first,true);assert.equal(await drain,true);
    assert.equal(f.w.truck.run!.tick,100);assert.equal(f.w.truck.run!.phase,"paused");
    console.log("ok a delayed response pauses prediction at four queued seconds and drains bounded receipts");
  }
  console.log("PASS connected truck client callbacks (local doubles; no browser/network)");
})().catch(error=>{console.error(error);process.exitCode=1;});
