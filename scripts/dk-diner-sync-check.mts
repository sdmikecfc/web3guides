/** Real client protocol + real authority replay. No network, browser, or database writes. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { createDinerRecord, DinerAuthorityError, replayDiner, validateDinerEnvelope } from '../src/lib/chef/diner/authority';
import type { DinerEnvelope } from '../src/lib/chef/diner/authority';
import { dispatchDiner, homeIncidents, shopOffers, type DinerCommand, type DinerState } from '../src/lib/chef/diner/progression';
import { createDinerEvent } from '../src/lib/chef/diner/events';
import { homeGestureCommands } from '../src/lib/chef/diner/home-gesture';
const loader=Module as unknown as {_load:(request:string,parent:unknown,isMain:boolean)=>unknown};
const originalLoad=loader._load;
loader._load=function(request,parent,isMain){return originalLoad.call(this,request.startsWith('@/')?path.resolve('src',request.slice(2)):request,parent,isMain);};
const {DinerSync}=require('../src/app/chef/diner-preview/diner-sync') as typeof import('../src/app/chef/diner-preview/diner-sync');
loader._load=originalLoad;
const SESSION='diner_preview_session_v1',TAPE='diner_preview_pending_v1';
const clone=<T,>(v:T):T=>structuredClone(v);
let clock=Date.UTC(2026,8,20,8),groups=0;const realNow=Date.now;Date.now=()=>clock;
class MemoryStorage {
  data=new Map<string,string>(); failFlight=false;
  getItem(key:string){return this.data.get(key)??null;}
  setItem(key:string,value:string){if(this.failFlight&&key===TAPE&&JSON.parse(value).flight)throw new Error('quota');this.data.set(key,value);}
  removeItem(key:string){this.data.delete(key);}
}
/** Protocol fixtures explicitly install owned burger equipment before opening any service. */
function preparedRecord(){
  const record=createDinerRecord(clock,'sync-regression'),layout=record.state.truckConfig;
  const stations=[...layout.stations.filter(station=>!['grill','prep'].includes(station.kind)),{id:'grill',kind:'grill' as const,x:1,y:0,facing:0 as const},{id:'prep',kind:'prep' as const,x:2,y:0,facing:0 as const}];
  const result=dispatchDiner(record.state,{type:'setupLayout',stations,tables:layout.tables},{now:clock});assert.equal(result.error,undefined);record.state=result.state;return record;
}
class Server {
  record=preparedRecord();receipts=new Map<string,string>();requests:{path:string;body:any}[]=[];
  offline=false;loseNext=false;unauthorizedNext=false;holdNext=false;release:(()=>void)|null=null;
  snapshot(extra:Record<string,unknown>={}){return {ok:true,state:clone(this.record.state),revision:this.record.revision,serverTime:clock,...extra};}
  response(body:unknown,status=200){return {ok:status>=200&&status<300,status,json:async()=>clone(body)} as Response;}
  external(commands:DinerCommand[]){const next=replayDiner(this.record,commands,clock);this.record=next.record;this.record.revision++;}
  fetch:typeof fetch=async(input,init)=>{
    const route=String(input).split('/').pop()!,body=typeof init?.body==='string'?JSON.parse(init.body):undefined;this.requests.push({path:route,body:clone(body)});
    if(this.offline)throw new Error('offline');
    if(route==='session')return this.response({accessToken:'access-token',refreshToken:'refresh-token',expiresAt:Math.floor(clock/1000)+3600,playerId:'player-one'});
    if(route==='state')return this.response(this.snapshot());
    if(route!=='command')throw new Error(`Unexpected request ${route}`);
    if(this.holdNext){this.holdNext=false;await new Promise<void>(resolve=>{this.release=resolve;});this.release=null;}
    if(this.unauthorizedNext){this.unauthorizedNext=false;return this.response({error:'Token expired.'},401);}
    try{
      const envelope=validateDinerEnvelope(body),fingerprint=JSON.stringify(envelope.commands),prior=this.receipts.get(envelope.id);
      if(prior){if(prior!==fingerprint)return this.response(this.snapshot({ok:false,error:'Action ID reused.'}),409);return this.response(this.snapshot({duplicate:true}));}
      if(envelope.revision!==this.record.revision)return this.response(this.snapshot({ok:false,error:'Changed on another device.'}),409);
      const result=replayDiner(this.record,envelope.commands,clock);this.record=result.record;this.record.revision++;this.receipts.set(envelope.id,fingerprint);
      if(this.loseNext){this.loseNext=false;throw new Error('Receipt lost after commit.');}
      return this.response(this.snapshot({interrupted:result.interrupted}));
    }catch(error){if(error instanceof DinerAuthorityError)return this.response({ok:false,code:error.code,error:error.message,retryAfterMs:error.retryAfterMs},error.status);throw error;}
  };
}
function make(server=new Server(),storage=new MemoryStorage()){
  const states:DinerState[]=[],statuses:string[]=[],messages:string[]=[];
  const sync=new DinerSync({state:s=>states.push(clone(s)),status:s=>statuses.push(s),message:m=>messages.push(m)},storage,server.fetch);
  return {server,storage,sync,states,statuses,messages};
}
async function idle(sync:InstanceType<typeof DinerSync>){for(let i=0;i<1000&&sync.busy;i++)await Promise.resolve();assert.equal(sync.busy,false,'request did not settle');}
async function connected(){const h=make();assert(await h.sync.connect());return h;}
async function send(h:ReturnType<typeof make>,command:DinerCommand){assert(h.sync.send(command),h.messages.at(-1));await idle(h.sync);}
async function open(h:ReturnType<typeof make>){await send(h,{type:'startRun'});await send(h,{type:'chooseNode',nodeId:h.sync.predicted!.run!.available[0]});await send(h,{type:'service',action:{type:'open'}});assert.equal(h.server.record.state.run?.service?.phase,'playing');}
async function check(name:string,run:()=>Promise<void>){clock+=100000;await run();groups++;console.log(`PASS ${name}`);}
async function main(){
  await check('lost reward receipt retries the identical durable UUID and grants once',async()=>{
    const h=await connected();h.server.loseNext=true;await send(h,{type:'claimCrate'});assert.equal(h.sync.blocked,true);const id=h.sync.flight!.id;assert.equal(JSON.parse(h.storage.getItem(TAPE)!).flight.id,id);assert.equal(h.server.record.state.daily.minted,2);
    clock+=1500;await h.sync.flush();assert.equal(h.sync.flight,null);assert.equal(h.sync.blocked,false);assert.equal(h.server.record.state.daily.minted,2);const commands=h.server.requests.filter(r=>r.path==='command');assert.equal(commands.length,2);assert.equal(commands[0].body.id,commands[1].body.id);assert.equal(h.server.record.revision,1);
  });
  await check('opening-trip return survives a lost receipt and reload without duplicate coins or fryer',async()=>{
    const h=make();h.server.external([{type:'startRun'}]);
    // Canonical between-stop checkpoint after the two introductory lunches.
    const run=h.server.record.state.run!,first=run.map.find(node=>node.id===run.available[0])!,second=run.map.find(node=>node.id===first.next[0])!;
    delete run.discoveryVersion;run.visited=[first.id,second.id];run.available=[...second.next];run.serviceDays=2;run.qualified=true;run.haul=388;
    const bank=h.server.record.state.coins,revision=h.server.record.revision,runId=run.id;
    assert(await h.sync.connect());h.server.loseNext=true;await send(h,{type:'goHome'});
    assert(h.sync.blocked);const id=h.sync.flight!.id;assert.equal(JSON.parse(h.storage.getItem(TAPE)!).flight.id,id);
    const banked=h.server.record.state;assert.equal(banked.run,null);assert.equal(banked.coins,bank+388);assert.equal(banked.lastRun!.id,runId);assert.equal(banked.lastRun!.banked,388);
    assert.equal(banked.tutorial.finished,true);assert.equal(banked.tutorial.fryerGifted,true);assert.equal(banked.equipment.fryer.homeCopies,1);assert.equal(banked.equipment.fryer.truckOwned,true);assert.equal(banked.recipes.fries,undefined);
    const pantry=clone(banked.pantry);assert.equal(banked.daily.truckRuns.length,1);assert.equal(banked.daily.truckRuns[0],runId);
    clock+=1500;const restored=make(h.server,h.storage);assert(await restored.sync.connect(true));
    assert.equal(restored.sync.flight,null);assert.equal(restored.sync.blocked,false);assert.equal(restored.sync.predicted!.run,null);assert.equal(restored.sync.predicted!.coins,bank+388);assert.equal(restored.sync.predicted!.equipment.fryer.homeCopies,1);
    assert.equal(h.server.record.revision,revision+1);assert.deepEqual(h.server.record.state.pantry,pantry);assert.deepEqual(h.server.record.state.daily.truckRuns,[runId]);
    const requests=h.server.requests.filter(request=>request.path==='command');assert.equal(requests.length,2);assert(requests.every(request=>request.body.id===id));
    const secondDevice=make(h.server);assert(await secondDevice.sync.connect());assert.equal(secondDevice.sync.send({type:'goHome'}),false);
    assert.equal(h.server.record.state.coins,bank+388);assert.equal(h.server.record.state.equipment.fryer.homeCopies,1);
  });
  await check('cancelling unopened prep retries after reload once and reuses its uncounted reservation',async()=>{
    for(const veteran of [false,true]){
      const h=make();
      if(veteran){h.server.record.state.runsStarted=3;h.server.record.state.tutorial.finished=true;h.server.record.state.tutorial.fryerGifted=true;h.server.record.state.equipment.fryer={tier:1,truckOwned:true,homeCopies:1};h.server.record.state.lastRun={id:'previous-counted-trip',reason:'home',banked:100,lost:0,serviceDays:2,recipes:['classic_burger'],equipment:['grill','prep']};}
      const unchanged=(state:DinerState)=>({coins:state.coins,pantry:state.pantry,equipment:state.equipment,tutorial:state.tutorial,lastRun:state.lastRun,career:state.career,collections:state.collections,minted:state.daily.minted,truckRuns:state.daily.truckRuns});
      const before=clone(unchanged(h.server.record.state)),count=h.server.record.state.runsStarted;
      assert(await h.sync.connect());await send(h,{type:'startRun'});const reservation=clone(h.server.record.state.run!);
      await send(h,{type:'chooseNode',nodeId:reservation.available[0]});await send(h,{type:'service',action:{type:'prepare'}});
      clock+=1000;assert(h.sync.send({type:'service',action:{type:'tick',ticks:20}}));await h.sync.flush();await send(h,{type:'service',action:{type:'pause'}});
      assert.equal(h.server.record.state.run!.service!.pausedPhase,'preparing');assert.equal(h.server.record.state.runsStarted,count+1);
      const revision=h.server.record.revision;h.server.loseNext=true;await send(h,{type:'goHome'});assert(h.sync.blocked);const id=h.sync.flight!.id;
      assert.equal(h.server.record.state.run,null);assert.equal(h.server.record.state.runsStarted,count);assert.deepEqual(unchanged(h.server.record.state),before);
      clock+=1500;const restored=make(h.server,h.storage);assert(await restored.sync.connect(true));assert.equal(restored.sync.flight,null);assert.equal(restored.sync.blocked,false);
      assert.equal(h.server.record.revision,revision+1);assert.equal(restored.sync.predicted!.runsStarted,count);assert.deepEqual(unchanged(h.server.record.state),before);
      const cancellations=h.server.requests.filter(request=>request.path==='command'&&request.body.commands.some((command:DinerCommand)=>command.type==='goHome'));assert.equal(cancellations.length,2);assert(cancellations.every(request=>request.body.id===id));
      await send(restored,{type:'startRun'});const restarted=h.server.record.state.run!;assert.equal(restarted.id,reservation.id);assert.equal(restarted.seed,reservation.seed);assert.deepEqual(restarted.map,reservation.map);assert.equal(h.server.record.state.runsStarted,count+1);
      await send(restored,{type:'chooseNode',nodeId:restarted.available[0]});await send(restored,{type:'service',action:{type:'open'}});
      assert.equal(h.server.record.state.run!.service!.phase,'playing');assert.equal(restored.sync.send({type:'goHome'}),false);assert.equal(h.server.record.state.runsStarted,count+1);assert.deepEqual(h.server.record.state.lastRun,before.lastRun);
    }
  });
  await check('a lost recipe-purchase receipt charges once and never enables new customer orders',async()=>{
    const h=make();h.server.external([{type:'startRun'}]);const run=h.server.record.state.run!,markets=run.map.filter(node=>node.kind==='shop');
    // Canonical fixture at a second visited market; offers use the real seeded stock.
    run.visited=[markets[0].id];run.position=markets[1].id;run.available=[];run.haul=1000;run.offers=shopOffers(h.server.record.state);
    const offer=run.offers.find(item=>item.kind==='recipe')!;assert(offer);const before=run.haul,bank=h.server.record.state.coins,home=clone(h.server.record.state.home.menu);
    assert(await h.sync.connect());h.server.loseNext=true;await send(h,{type:'buyOffer',offerId:offer.id});assert(h.sync.blocked);const id=h.sync.flight!.id;
    assert.equal(h.server.record.state.run!.haul,before-offer.price);assert.equal(h.server.record.state.recipes[offer.target].level,0);
    clock+=1500;await h.sync.flush();assert.equal(h.sync.flight,null);assert.equal(h.server.record.state.run!.haul,before-offer.price);assert.equal(h.server.record.state.coins,bank);assert.deepEqual(h.server.record.state.truckConfig.menu,['classic_burger']);assert.deepEqual(h.server.record.state.home.menu,home);
    const requests=h.server.requests.filter(request=>request.path==='command');assert.equal(requests.length,2);assert(requests.every(request=>request.body.id===id));
  });
  await check('a lost capacity-upgrade response retries one receipt and charges only once',async()=>{
    const h=make();h.server.record.state.restaurantLevel=5;h.server.record.state.coins=1000;assert(await h.sync.connect());h.server.loseNext=true;
    await send(h,{type:'upgradeTruckEquipment',equipmentId:'plates'});const id=h.sync.flight!.id;assert.equal(h.server.record.state.equipment.plates.tier,2);assert.equal(h.server.record.state.coins,880);
    clock+=1500;await h.sync.flush();assert.equal(h.sync.flight,null);assert.equal(h.server.record.state.equipment.plates.tier,2);assert.equal(h.server.record.state.coins,880);assert.equal(h.server.record.revision,1);assert(h.server.requests.filter(r=>r.path==='command').every(r=>r.body.id===id));
  });
  await check('preparation starts a fresh clock boundary and opening preserves its accepted work',async()=>{
    const h=await connected();await send(h,{type:'startPractice'});h.server.holdNext=true;assert(h.sync.send({type:'service',action:{type:'prepare'}}));assert(h.sync.send({type:'service',action:{type:'tick',ticks:20}}));h.server.release!();await idle(h.sync);await h.sync.flush();
    assert.equal(h.server.record.state.run!.service!.phase,'preparing');assert(h.sync.flight);const id=h.sync.flight.id;clock+=1000;await h.sync.flush();assert.equal(h.sync.flight,null);assert.equal(h.server.record.state.run!.service!.tick,20);assert.equal(h.server.record.state.run!.service!.spawned,0);assert.equal(h.server.requests.filter(r=>r.path==='command').at(-1)!.body.id,id);
    await send(h,{type:'service',action:{type:'open'}});assert.equal(h.server.record.state.run!.service!.phase,'playing');assert.equal(h.server.record.state.run!.service!.tick,20);
  });
  await check('ordered tapes commit open before spending ticks and preserve ID through time-credit retries',async()=>{
    const h=await connected();h.server.holdNext=true;assert(h.sync.send({type:'startRun'}));assert(h.sync.busy);assert(h.sync.send({type:'chooseNode',nodeId:h.sync.predicted!.run!.available[0]}));assert(h.sync.send({type:'service',action:{type:'open'}}));assert(h.sync.send({type:'service',action:{type:'tick',ticks:20}}));h.server.release!();await idle(h.sync);await h.sync.flush();
    assert.equal(h.server.record.state.run?.service?.phase,'playing');assert.equal(h.server.record.state.run?.service?.tick,0);assert.equal(h.sync.queue.length,1);const boundaries=h.server.requests.filter(r=>r.path==='command').map(r=>r.body.commands as DinerCommand[]);assert.equal(boundaries[1].at(-1)?.type,'service');assert.equal((boundaries[1].at(-1) as any).action.type,'open');
    await h.sync.flush();const id=h.sync.flight!.id;assert(h.sync.retryAt>clock);assert.equal(h.server.record.state.run?.service?.tick,0);clock+=1000;await h.sync.flush();assert.equal(h.server.record.state.run?.service?.tick,20);assert.equal(h.sync.flight,null);assert.equal(h.server.requests.filter(r=>r.path==='command').at(-1)?.body.id,id);
  });
  await check('second-device revision conflicts discard stale predictions and pending actions',async()=>{
    const h=await connected();h.server.external([{type:'settings',name:'Other device'}]);await send(h,{type:'settings',name:'Old device'});assert.equal(h.sync.predicted?.home.name,'Other device');assert.equal(h.sync.queue.length,0);assert.equal(h.sync.flight,null);assert.equal(h.sync.revision,h.server.record.revision);assert(h.messages.some(m=>m.includes('Another device')));
  });
  await check('duplicate receipts after another writer advance do not rebase stale queued edits',async()=>{
    const h=await connected();h.server.holdNext=true;h.server.loseNext=true;assert(h.sync.send({type:'claimCrate'}));assert(h.sync.send({type:'settings',name:'Queued stale name'}));h.server.release!();await idle(h.sync);h.server.external([{type:'settings',name:'New device name'}]);clock+=1500;await h.sync.flush();assert.equal(h.sync.predicted?.home.name,'New device name');assert.equal(h.sync.queue.length,0);assert.equal(h.server.record.state.daily.minted,2);
  });
  await check('lost auto-pause receipt clears queued cooking inputs even when duplicate omits interrupted flag',async()=>{
    const h=await connected();await open(h);clock+=6000;assert(h.sync.send({type:'service',action:{type:'tick',ticks:20}}));h.server.holdNext=true;h.server.loseNext=true;const pending=h.sync.flush();assert(h.sync.send({type:'service',action:{type:'tick',ticks:10}}));h.server.release!();await pending;assert.equal(h.server.record.state.run?.service?.phase,'paused');assert.equal(h.sync.queue.length,1);clock+=1500;await h.sync.flush();assert.equal(h.sync.predicted?.run?.service?.phase,'paused');assert.equal(h.sync.queue.length,0);assert.equal(h.sync.flight,null);assert.equal(h.sync.blocked,false);assert.equal(h.server.record.state.run?.service?.tick,0);
  });
  await check('offline restore displays only cached canonical state, freezes inputs and preserves pending UUID',async()=>{
    const h=await connected();h.server.offline=true;await send(h,{type:'settings',name:'Unsaved name'});const id=h.sync.flight!.id,before=h.storage.getItem(TAPE);assert.equal(h.sync.send({type:'claimCrate'}),false);const restored=make(h.server,h.storage);assert.equal(await restored.sync.connect(true),false);assert(restored.sync.canonical);assert.equal(restored.sync.predicted?.home.name,'My little burger shop');assert.equal(restored.sync.blocked,true);assert.equal(restored.sync.send({type:'claimCrate'}),false);assert.equal(h.storage.getItem(TAPE),before);
    h.server.offline=false;assert(await restored.sync.connect(true));assert.equal(restored.sync.flight,null);assert.equal(restored.sync.predicted?.home.name,'Unsaved name');assert.equal(h.server.requests.filter(r=>r.path==='command').at(-1)?.body.id,id);
  });
  await check('quota failure never transmits an action without its stored UUID; recovery retains the action',async()=>{
    const h=await connected();h.storage.failFlight=true;assert(h.sync.send({type:'settings',name:'Durable diner'}));await idle(h.sync);assert.equal(h.server.requests.filter(r=>r.path==='command').length,0);assert.equal(h.sync.blocked,true);assert(h.sync.flight);const id=h.sync.flight.id;h.storage.failFlight=false;await h.sync.flush();assert.equal(h.server.record.state.home.name,'Durable diner');assert.equal(h.server.requests.filter(r=>r.path==='command')[0].body.id,id);assert.equal(h.sync.blocked,false);
  });
  await check('expired access retries with refresh and the same command ID',async()=>{
    const h=await connected();h.server.unauthorizedNext=true;await send(h,{type:'settings',name:'Refreshed diner'});assert.equal(h.sync.blocked,true);const id=h.sync.flight!.id;clock+=1500;await h.sync.flush();assert.equal(h.server.record.state.home.name,'Refreshed diner');assert.equal(h.server.requests.filter(r=>r.path==='session').length,2);assert.equal(h.server.requests.filter(r=>r.path==='command').at(-1)?.body.id,id);
  });
  await check('backpressure freezes predictions and prevents unbounded tick tapes',async()=>{
    const h=await connected();await open(h);for(let i=0;i<90;i++)assert(h.sync.send({type:'service',action:{type:'tick',ticks:1}}));assert.equal(h.sync.blocked,true);assert.equal(h.sync.send({type:'service',action:{type:'tick',ticks:1}}),false);assert.equal(h.sync.predicted?.run?.service?.tick,90);clock+=4500;await h.sync.flush();assert.equal(h.server.record.state.run?.service?.tick,90);assert.equal(h.sync.blocked,false);assert(h.server.requests.filter(r=>r.path==='command').every(r=>(r.body as DinerEnvelope).commands.length<=128));
  });
  await check('roadside challenges and rally services share durable clock boundaries and gap pauses',async()=>{
    for(const mode of ['eventInput','rallyService'] as const){
      const h=make();
      if(mode==='eventInput'){
        let state=h.server.record.state;state.tutorial.finished=true;state=dispatchDiner(state,{type:'startRun'},{now:clock}).state;
        const node=state.run!.map.find(node=>node.kind==='event')!;state.run!.available=[node.id];state=dispatchDiner(state,{type:'chooseNode',nodeId:node.id},{now:clock}).state;
        state.run!.event=createDinerEvent('sync-inspection','sync-inspection','health_inspector');h.server.record.state=state;
      }else h.server.external([{type:'startRally'}]);
      assert(await h.sync.connect());h.server.holdNext=true;
      assert(h.sync.send(mode==='eventInput'?{type:'eventChoice',choiceId:'clean'}:{type:'rallyService',action:{type:'open'}}));
      assert(h.sync.send({type:mode,action:{type:'tick',ticks:20}}));h.server.release!();await idle(h.sync);await h.sync.flush();
      assert(h.sync.flight);const id=h.sync.flight.id;clock+=1000;await h.sync.flush();assert.equal(h.sync.flight,null);
      const current=()=>mode==='eventInput'?h.server.record.state.run!.event!:h.server.record.state.rally.service!;assert.equal(current().tick,20);assert.equal(h.server.requests.filter(r=>r.path==='command').at(-1)!.body.id,id);
      clock+=6000;assert(h.sync.send({type:mode,action:{type:'tick',ticks:1}}));await h.sync.flush();assert.equal(current().phase,'paused');assert.equal(current().tick,20);assert.equal(h.sync.queue.length,0);assert.equal(h.sync.flight,null);
    }
  });
  await check('companion snapshots cannot discard pending cooking inputs or replace newer revisions',async()=>{
    const h=await connected();h.server.holdNext=true;assert(h.sync.send({type:'settings',name:'Keep this change'}));
    assert.equal(h.sync.acceptSnapshot(h.server.snapshot()),false);h.server.release!();await idle(h.sync);
    assert.equal(h.sync.acceptSnapshot({...h.server.snapshot(),revision:h.sync.revision-1}),false);
    assert.equal(h.sync.acceptSnapshot(h.server.snapshot()),true);assert.equal(h.sync.predicted!.home.name,'Keep this change');
  });
  await check('cloth samples batch with elapsed ticks instead of posting every pointer movement',async()=>{
    const h=await connected(),job=homeIncidents(h.sync.predicted!)[0];await send(h,{type:'beginHomeTask',incidentId:job.id});await send(h,{type:'homeTaskInput',action:{type:'strokeStart',point:{x:job.x-.2,y:job.y}}});
    const requests=h.server.requests.length;
    for(let i=0;i<5;i++){clock+=50;assert(h.sync.send({type:'homeTaskInput',action:{type:'stroke',point:{x:job.x+(i%2===0?.2:-.2),y:job.y}}}));assert(h.sync.send({type:'homeTaskInput',action:{type:'tick',ticks:1}}));}
    assert.equal(h.server.requests.length,requests);assert.equal(h.sync.predicted!.homeTask!.progressTicks,5);assert.equal(h.sync.queue.length,10);
    await h.sync.flush();assert.equal(h.server.requests.length,requests+1);assert.equal(h.server.record.state.homeTask!.progressTicks,5);assert.equal(h.sync.queue.length,0);
  });
  await check('home work release during a lost stroke-start receipt stays queued and cannot resume unattended',async()=>{
    const h=await connected(),job=homeIncidents(h.sync.predicted!)[0];await send(h,{type:'beginHomeTask',incidentId:job.id});
    h.server.loseNext=true;await send(h,{type:'homeTaskInput',action:{type:'strokeStart',point:{x:job.x-.2,y:job.y}}});assert(h.sync.blocked);const id=h.sync.flight!.id;
    assert(h.sync.send({type:'homeTaskInput',action:{type:'hold',active:false}}));assert.equal(h.sync.predicted!.homeTask!.phase,'paused');assert.equal(h.sync.predicted!.homeTask!.progressTicks,0);
    assert.equal(h.sync.send({type:'homeTaskInput',action:{type:'tick',ticks:60}}),false);assert.equal(JSON.parse(h.storage.getItem(TAPE)!).queue.at(-1).action.active,false);
    clock+=1500;await h.sync.flush();assert.equal(h.server.requests.filter(r=>r.path==='command').at(-1)!.body.id,id);assert.equal(h.sync.predicted!.homeTask!.phase,'paused');await h.sync.flush();
    assert.equal(h.server.record.state.homeTask!.phase,'paused');assert.equal(h.server.record.state.homeTask!.progressTicks,0);assert.equal(h.server.record.state.daily.incidentClaims.length,0);
  });
  await check('home work completion retries once and an older paused job does not interrupt a truck tape',async()=>{
    const h=await connected(),job=homeIncidents(h.sync.predicted!)[0];await send(h,{type:'beginHomeTask',incidentId:job.id});await send(h,{type:'homeTaskInput',action:{type:'strokeStart',point:{x:job.x-.2,y:job.y}}});
    for(let i=0;i<13;i++){clock+=150;await send(h,{type:'homeTaskInput',action:{type:'stroke',point:{x:job.x+(i%2===0?.2:-.2),y:job.y}}});assert(h.sync.send({type:'homeTaskInput',action:{type:'tick',ticks:3}}));await h.sync.flush();}
    clock+=50;await send(h,{type:'homeTaskInput',action:{type:'stroke',point:{x:job.x-.2,y:job.y}}});assert(h.sync.send({type:'homeTaskInput',action:{type:'tick',ticks:1}}));h.server.loseNext=true;await h.sync.flush();const id=h.sync.flight!.id;assert.equal(h.server.record.state.coins,230);
    assert(h.sync.send({type:'homeTaskInput',action:{type:'hold',active:false}}));clock+=1500;await h.sync.flush();await h.sync.flush();assert.equal(h.server.record.state.coins,230);assert.equal(h.server.record.state.daily.incidentClaims.length,1);assert(h.server.requests.filter(r=>r.path==='command').filter(r=>r.body.id===id).length===2);
    const second=homeIncidents(h.sync.predicted!)[0];clock=second.availableAt;await send(h,{type:'beginHomeTask',incidentId:second.id});await send(h,{type:'homeTaskInput',action:{type:'hold',active:false}});
    h.server.holdNext=true;assert(h.sync.send({type:'startRun'}));assert(h.sync.send({type:'chooseNode',nodeId:h.sync.predicted!.run!.available[0]}));assert(h.sync.send({type:'service',action:{type:'open'}}));h.server.release!();await idle(h.sync);await h.sync.flush();
    assert.equal(h.server.record.state.run!.service!.phase,'playing');assert.equal(h.sync.predicted!.run!.service!.phase,'playing');assert.equal(h.server.record.state.homeTask!.phase,'paused');
  });
  await check('daily parcel final-flap receipt survives reload and retries without duplicate ingredients',async()=>{
    const h=await connected();
    for(const part of ['tape','leftFlap','rightFlap'] as const){
      for(const command of homeGestureCommands(h.sync.predicted!,{type:'parcel',incidentId:'home-parcel',part}))await send(h,command);
      clock+=200;assert(h.sync.send({type:'homeTaskInput',action:{type:'tick',ticks:4}}));
      if(part==='rightFlap')h.server.loseNext=true;await h.sync.flush();
    }
    assert(h.sync.blocked);const id=h.sync.flight!.id,pantry=clone(h.server.record.state.pantry);assert.equal(h.server.record.state.daily.minted,2);assert.equal(h.server.record.state.daily.crate,true);
    clock+=1500;const restored=make(h.server,h.storage);assert(await restored.sync.connect(true));assert.equal(restored.sync.flight,null);assert.equal(restored.sync.predicted!.daily.crateProgressTicks,12);assert.equal(h.server.record.state.daily.minted,2);assert.deepEqual(h.server.record.state.pantry,pantry);
    assert.equal(h.server.requests.filter(r=>r.path==='command').at(-1)!.body.id,id);assert.deepEqual(homeGestureCommands(restored.sync.predicted!,{type:'parcel',incidentId:'home-parcel',part:'tape'}),[]);
  });
  console.log(`PASS ${groups} diner sync groups`);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Date.now=realNow;});
