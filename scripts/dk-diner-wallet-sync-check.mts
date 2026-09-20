/** Wallet identity gates and checkpoint isolation; no live wallets or network. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { createDiner } from '../src/lib/chef/diner/progression';
import type { DinerSession } from '../src/app/chef/diner-preview/diner-sync';
const loader=Module as unknown as {_load:(request:string,parent:unknown,isMain:boolean)=>unknown},original=loader._load;
loader._load=function(request,parent,isMain){return original.call(this,request.startsWith('@/')?path.resolve('src',request.slice(2)):request,parent,isMain);};
const {DinerSync}=require('../src/app/chef/diner-preview/diner-sync') as typeof import('../src/app/chef/diner-preview/diner-sync');loader._load=original;
const a=`0x${'11'.repeat(20)}`,b=`0x${'22'.repeat(20)}`,now=Date.now();let groups=0;
class Store{data=new Map<string,string>();getItem(key:string){return this.data.get(key)??null;}setItem(key:string,value:string){this.data.set(key,value);}removeItem(key:string){this.data.delete(key);}}
const session=(wallet:string):DinerSession=>({accessToken:`token-${wallet}`,refreshToken:`refresh-${wallet}`,expiresAt:Math.floor(now/1000)+3600,playerId:`player-${wallet}`,wallet});
function client(wallet:string,store=new Store(),refreshWallet=wallet){
  const requests:string[]=[],states:unknown[]=[],state=createDiner(now,`wallet-${wallet}`);
  const fetcher:typeof fetch=async url=>{const route=String(url).split('/').pop()!;requests.push(route);return {ok:true,status:200,json:async()=>route==='session'?session(refreshWallet):{ok:true,state,revision:0,serverTime:now}} as Response;};
  const sync=new DinerSync({state:s=>states.push(s),status:()=>{},message:()=>{}},store,fetcher,wallet);return {sync,store,requests,states};
}
async function check(name:string,run:()=>Promise<void>){await run();groups++;console.log(`PASS ${name}`);}
async function main(){
 await check('required wallet never creates an anonymous session or opens a browser guest',async()=>{const h=client(a);assert.equal(await h.sync.connect(),false);assert.deepEqual(h.requests,[]);assert.equal(h.sync.canonical,null);assert.equal(h.sync.send({type:'claimCrate'}),false);const missing=client(a);assert.equal(await missing.sync.connect(true),false);assert.equal(missing.sync.needsSignature,true,'removed credentials return to the signature gate');assert.deepEqual(missing.requests,[]);});
 await check('another wallet cannot be adopted or restored under this wallet namespace',async()=>{const h=client(a);await assert.rejects(()=>h.sync.adoptSession(session(b)),/this wallet/);h.store.setItem(DinerSync.sessionKey(a),JSON.stringify(session(b)));assert.equal(await h.sync.connect(true),false);assert.deepEqual(h.requests,[]);assert.equal(h.sync.canonical,null);});
 await check('wallet checkpoints and refresh credentials stay separate from other accounts and old guests',async()=>{
   const store=new Store();store.setItem('diner_preview_session_v1','old-anonymous');store.setItem('diner_preview_pending_v1','old-guest-pending');store.setItem('street_eats_preview_v1','old-browser-room');
   store.setItem(DinerSync.sessionKey(a),JSON.stringify(session(a)));store.setItem(DinerSync.sessionKey(b),JSON.stringify(session(b)));
   const first=client(a,store),second=client(b,store);assert(await first.sync.connect(true));assert(await second.sync.connect(true));assert.notEqual(first.sync.canonical!.seed,second.sync.canonical!.seed);
   first.sync.flight={id:'saved-request',revision:0,commands:[{type:'claimCrate'}]};first.sync.dispose();
   const pendingA=store.getItem(`diner_preview_wallet_pending_v1:${a}`)!;assert.equal(JSON.parse(pendingA).flight.id,'saved-request');assert.equal(JSON.parse(store.getItem(`diner_preview_wallet_pending_v1:${b}`)!).flight,null);
   assert.equal(store.getItem('diner_preview_session_v1'),'old-anonymous');assert.equal(store.getItem('diner_preview_pending_v1'),'old-guest-pending');assert.equal(store.getItem('street_eats_preview_v1'),'old-browser-room');
 });
 await check('a refresh returning the wrong wallet cannot load or replay account state',async()=>{const h=client(a,new Store(),b),expired=session(a);expired.expiresAt=1;h.store.setItem(DinerSync.sessionKey(a),JSON.stringify(expired));assert.equal(await h.sync.connect(true),false);assert.deepEqual(h.requests,['session']);assert.equal(h.sync.canonical,null);assert.equal(h.sync.blocked,true);});
 await check('a revoked session requests a fresh signature without deleting the unresolved action ID',async()=>{
   const store=new Store(),credentials=session(a);credentials.expiresAt=1;store.setItem(DinerSync.sessionKey(a),JSON.stringify(credentials));
   const tapeKey=`diner_preview_wallet_pending_v1:${a}`,flight={id:'persisted-before-expiry',revision:0,commands:[{type:'claimCrate'}]};
   store.setItem(tapeKey,JSON.stringify({playerId:credentials.playerId,flight,queue:[],canonical:createDiner(now,'expired'),revision:0}));
   const revoked:typeof fetch=async()=>({ok:false,status:401,json:async()=>({error:'Sign in again.'})}) as Response;
   const sync=new DinerSync({state:()=>{},status:()=>{},message:()=>{}},store,revoked,a);
   assert.equal(await sync.connect(true),false);assert.equal(sync.needsSignature,true);assert.equal(sync.blocked,true);assert.equal(sync.flight?.id,flight.id);sync.dispose();
   assert.equal(JSON.parse(store.getItem(tapeKey)!).flight.id,flight.id);
   // WalletEntry writes freshly verified credentials; the next mount keeps the
   // same player's envelope and retries its existing idempotency ID.
   store.setItem(DinerSync.sessionKey(a),JSON.stringify(session(a)));const retried:unknown[]=[];
   const restored=new DinerSync({state:()=>{},status:()=>{},message:()=>{}},store,async(url,init)=>{if(String(url).endsWith('/command'))retried.push(JSON.parse(String(init?.body)));return {ok:true,status:200,json:async()=>({ok:true,state:createDiner(now,'expired'),revision:retried.length,serverTime:now})} as Response;},a);
   assert.equal(await restored.connect(true),true);assert.equal(restored.needsSignature,false);assert.equal((retried[0] as {id:string}).id,flight.id);assert.equal(restored.flight,null);
 });
 await check('device sign-out revokes first, clears credentials, and keeps the durable pending receipt',async()=>{
   const h=client(a);h.store.setItem(DinerSync.sessionKey(a),JSON.stringify(session(a)));assert(await h.sync.connect(true));
   h.sync.flight={id:'unsure-before-signout',revision:0,commands:[{type:'claimCrate'}]};
   assert.equal(await h.sync.signOut(),true);assert.equal(h.requests.at(-1),'logout');assert.equal(h.sync.stopped,true);assert.equal(h.sync.session,null);assert.equal(h.store.getItem(DinerSync.sessionKey(a)),null);
   const tapeKey=`diner_preview_wallet_pending_v1:${a}`;assert.equal(JSON.parse(h.store.getItem(tapeKey)!).flight.id,'unsure-before-signout');h.sync.dispose();assert.equal(h.store.getItem(DinerSync.sessionKey(a)),null);assert.equal(JSON.parse(h.store.getItem(tapeKey)!).flight.id,'unsure-before-signout');
 });
 await check('uncertain revocation never pretends that server sign-out succeeded',async()=>{
   const store=new Store(),state=createDiner(now,'signout-failure');store.setItem(DinerSync.sessionKey(a),JSON.stringify(session(a)));
   const sync=new DinerSync({state:()=>{},status:()=>{},message:()=>{}},store,async url=>{if(String(url).endsWith('/logout'))throw new Error('Network unavailable');return {ok:true,status:200,json:async()=>({ok:true,state,revision:0,serverTime:now})} as Response;},a);
   assert(await sync.connect(true));await assert.rejects(()=>sync.signOut(),/Network unavailable/);assert(sync.session);assert(store.getItem(DinerSync.sessionKey(a)));assert.equal(sync.stopped,false);assert.equal(sync.blocked,true);
 });
 await check('failed initial account loading stays visible past toast expiry and a successful retry clears it',async()=>{
   const savedGlobals={fetch:globalThis.fetch,localStorage:globalThis.localStorage,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
   const stateSlots:unknown[]=[],timers=new Map<number,()=>void>();let timerId=0,fail=true;
   const fakeReact={useState:(value:unknown)=>{const index=stateSlots.length;stateSlots.push(value);return [value,(next:unknown)=>{stateSlots[index]=next;}];},useRef:(value:unknown)=>({current:value}),useCallback:(value:unknown)=>value,useEffect:()=>{}};
   loader._load=function(request,parent,isMain){if(request==='react')return fakeReact;if(request==='./DinerAccess')return {useDinerAccess:()=>({mode:'wallet',wallet:a})};return original.call(this,request.startsWith('@/')?path.resolve('src',request.slice(2)):request,parent,isMain);};
   try{
     const {useDiner}=require('../src/app/chef/diner-preview/useDiner') as typeof import('../src/app/chef/diner-preview/useDiner');loader._load=original;
     const storage=new Store();storage.setItem(DinerSync.sessionKey(a),JSON.stringify(session(a)));
     Object.assign(globalThis,{localStorage:storage,setTimeout:(fn:()=>void)=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:(id:number)=>timers.delete(id),fetch:async()=>({ok:!fail,status:fail?503:200,json:async()=>fail?{error:'The account database is unavailable.'}:{ok:true,state:createDiner(now,'recovery'),revision:0,serverTime:now}})});
     const hook=useDiner();assert.equal(await hook.connect(),false);assert.equal(stateSlots[0],null,'no guest state is created');assert.deepEqual(stateSlots[1],{text:'The account database is unavailable.',error:true});
     for(const fn of timers.values())fn();assert.deepEqual(stateSlots[1],{text:'The account database is unavailable.',error:true},'a load failure does not return to the almost-ready placeholder');
     fail=false;assert.equal(await hook.connect(),true);assert(stateSlots[0]);assert.equal(stateSlots[1],null,'canonical recovery clears the persistent load error');
     hook.announce('Saved message',true);assert.equal(timers.size,1,'ordinary errors after loading retain the short toast lifetime');for(const fn of timers.values())fn();assert.equal(stateSlots[1],null);
   }finally{loader._load=original;Object.assign(globalThis,savedGlobals);}
 });
 console.log(`PASS ${groups} diner wallet client groups`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
