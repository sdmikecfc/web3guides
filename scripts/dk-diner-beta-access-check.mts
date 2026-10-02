/** Connected-wallet beta isolation and real useDiner persistence; no network or live wallet. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { DINER_SAVE_KEY, type DinerState } from '../src/lib/chef/diner/progression';

const loader=Module as unknown as {_load:(request:string,parent:unknown,isMain:boolean)=>unknown};
const originalLoad=loader._load;
const a=`0x${'aB'.repeat(20)}`,b=`0x${'cD'.repeat(20)}`;
let groups=0;
class Store {
  data=new Map<string,string>();
  failReads=false;
  failWrite:((key:string)=>boolean)|null=null;
  getItem(key:string){if(this.failReads)throw new Error('Browser storage is blocked.');return this.data.get(key)??null;}
  setItem(key:string,value:string){if(this.failWrite?.(key))throw new Error('Browser storage quota exceeded.');this.data.set(key,value);}
  removeItem(key:string){this.data.delete(key);}
}
type Hook=ReturnType<typeof import('../src/app/chef/diner-preview/useDiner').useDiner>;
type Access={mode:'beta';wallet:string}|null;
type Mounted={access:Access;slots:unknown[];refs:Array<{current:unknown}>;stateCursor:number;refCursor:number;mounted:boolean;effects:Array<()=>void|(()=>void)>;cleanups:Array<()=>void>;hook:Hook;readonly state:DinerState|null;refresh:()=>void;unmount:()=>void};
let rendering:Mounted;
const fakeReact={
  useState(value:unknown){const h=rendering,index=h.stateCursor++;if(index===h.slots.length)h.slots.push(typeof value==='function'?(value as ()=>unknown)():value);return [h.slots[index],(next:unknown)=>{h.slots[index]=typeof next==='function'?(next as (old:unknown)=>unknown)(h.slots[index]):next;}];},
  useRef(value:unknown){const h=rendering,index=h.refCursor++;return h.refs[index]??(h.refs[index]={current:value});},
  useCallback(value:unknown){return value;},
  // These tests remount for identity changes. Explicit refreshes only read the
  // latest returned hook values; beta effect dependencies remain unchanged.
  useEffect(effect:()=>void|(()=>void)){if(!rendering.mounted)rendering.effects.push(effect);},
};
const globals=['fetch','localStorage','document','window','setInterval','clearInterval','setTimeout','clearTimeout'] as const;
const descriptors=new Map(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
const intervals=new Map<number,()=>void>(),timeouts=new Map<number,()=>void>();
const documentListeners=new Map<string,Set<()=>void>>(),windowListeners=new Map<string,Set<()=>void>>();
const requests:string[]=[],storage=new Store();let timerId=0;
const target=(listeners:Map<string,Set<()=>void>>)=>({
  addEventListener(name:string,fn:()=>void){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(fn);},
  removeEventListener(name:string,fn:()=>void){listeners.get(name)?.delete(fn);},
});
const doc={visibilityState:'visible',...target(documentListeners)};
async function check(name:string,run:()=>void|Promise<void>){await run();groups++;console.log(`PASS ${name}`);}

async function main(){
  loader._load=function(request,parent,isMain){
    if(request==='react')return fakeReact;
    if(request==='./DinerAccess')return {useDinerAccess:()=>rendering.access};
    return originalLoad.call(this,request.startsWith('@/')?path.resolve('src',request.slice(2)):request,parent,isMain);
  };
  const {betaWallet,betaStorageKeys}=require('../src/app/chef/diner-preview/beta-access') as typeof import('../src/app/chef/diner-preview/beta-access');
  const {useDiner}=require('../src/app/chef/diner-preview/useDiner') as typeof import('../src/app/chef/diner-preview/useDiner');
  loader._load=originalLoad;
  const fakeGlobals={
    localStorage:storage,document:doc,window:target(windowListeners),
    fetch:async(url:unknown)=>{requests.push(String(url));throw new Error('The public beta must not call account services.');},
    setInterval:(fn:()=>void)=>{const id=++timerId;intervals.set(id,fn);return id;},clearInterval:(id:number)=>intervals.delete(id),
    setTimeout:(fn:()=>void)=>{const id=++timerId;timeouts.set(id,fn);return id;},clearTimeout:(id:number)=>timeouts.delete(id),
  };
  for(const [key,value] of Object.entries(fakeGlobals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  function mount(wallet:string|null){
    const h={access:wallet?{mode:'beta' as const,wallet}:null,slots:[],refs:[],stateCursor:0,refCursor:0,mounted:false,effects:[],cleanups:[],get state(){return this.slots[0] as DinerState|null;}} as unknown as Mounted;
    h.refresh=()=>{rendering=h;h.stateCursor=0;h.refCursor=0;h.hook=useDiner();};h.refresh();
    for(const effect of h.effects){const cleanup=effect();if(cleanup)h.cleanups.push(cleanup);}
    h.mounted=true;h.refresh();
    h.unmount=()=>{for(const cleanup of h.cleanups.splice(0))cleanup();};return h;
  }
  function checkpoint(){for(const callback of intervals.values())callback();}
  function stored(wallet:string){const raw=storage.getItem(betaStorageKeys(wallet).save);assert(raw,'wallet has a checkpoint');return JSON.parse(raw) as DinerState;}

  await check('only a connected, complete EVM address opens the beta and casing cannot split a wallet',()=>{
    assert.equal(betaWallet(a,true),a.toLowerCase());assert.equal(betaWallet(b,true),b.toLowerCase());
    for(const address of [undefined,null,'','0x1234',`0x${'z'.repeat(40)}`,` ${a}`,`${a} `])assert.equal(betaWallet(address as string|undefined,true),null);
    assert.equal(betaWallet(a,false),null);
    const keys=betaStorageKeys(a.toLowerCase());assert.deepEqual(betaStorageKeys(a),keys);assert.notEqual(keys.save,keys.preferences);
    assert.throws(()=>betaStorageKeys('0x1234'),/wallet/);
    assert(keys.save.startsWith('domain_kitchen_beta_v1'));assert(keys.preferences.startsWith('domain_kitchen_beta_v1'));
    assert.notEqual(keys.save,betaStorageKeys(b.toLowerCase()).save);assert.notEqual(keys.save,DINER_SAVE_KEY);
  });

  const protectedKeys=[DINER_SAVE_KEY,'diner_preview_session_v1','diner_preview_pending_v1','diner_preview_social_pending_v1',`diner_preview_wallet_session_v1:${a.toLowerCase()}`,`diner_preview_wallet_pending_v1:${a.toLowerCase()}`];
  for(const key of protectedKeys)storage.setItem(key,`preserve:${key}`);
  let aSeed='';
  await check('connected beta creates a playable diner and checkpoints actions without status or authentication services',async()=>{
    const h=mount(a.toLowerCase());assert(h.state);aSeed=h.state.seed;
    assert.equal(h.hook.send({type:'settings',name:'Amber Burger'}),true);assert.equal(h.state.home.name,'Amber Burger');
    checkpoint();assert.equal(stored(a.toLowerCase()).home.name,'Amber Burger');
    assert.equal(await h.hook.connect(),false);
    await assert.rejects(()=>h.hook.read('social'));
    await assert.rejects(()=>h.hook.read('state'));
    await assert.rejects(()=>h.hook.social({type:'profile'} as never));
    assert.deepEqual(requests,[],'beta never reaches status, account, social or verified-session APIs');
    h.unmount();assert.equal(intervals.size,0);assert.equal(timeouts.size,0);
  });
  await check('a reload restores that wallet while switching wallets creates an independent diner',()=>{
    const restored=mount(a.toLowerCase());assert.equal(restored.state?.home.name,'Amber Burger');assert.equal(restored.state?.seed,aSeed);restored.unmount();
    const second=mount(b.toLowerCase());assert(second.state);assert.notEqual(second.state.seed,aSeed);assert.notEqual(second.state.home.name,'Amber Burger');
    assert(second.hook.send({type:'settings',name:'Blueberry Buns'}));second.unmount();
    assert.equal(stored(b.toLowerCase()).home.name,'Blueberry Buns');
    const first=mount(a.toLowerCase());assert.equal(first.state?.home.name,'Amber Burger');first.unmount();
    for(const key of protectedKeys)assert.equal(storage.getItem(key),`preserve:${key}`,'guest and verified accounts remain untouched');
    assert.deepEqual(requests,[]);
  });
  await check('closing an active beta service pauses and saves it before releasing timers and listeners',()=>{
    const h=mount(a.toLowerCase()),state=h.state!;
    assert(h.hook.send({type:'setupLayout',stations:[...state.truckConfig.stations,{id:'grill',kind:'grill',x:1,y:0,facing:0},{id:'prep',kind:'prep',x:2,y:0,facing:0}],tables:state.truckConfig.tables}));
    assert(h.hook.send({type:'startPractice'}));assert(h.hook.send({type:'service',action:{type:'open'}}));
    assert.equal(h.state!.run!.service!.phase,'playing');
    assert(h.hook.send({type:'service',action:{type:'tick',ticks:2}}));const tick=h.state!.run!.service!.tick;
    h.unmount();const saved=stored(a.toLowerCase());assert.equal(saved.run!.service!.phase,'paused');assert.equal(saved.run!.service!.tick,tick);
    assert.equal(intervals.size,0);assert.equal(timeouts.size,0);
    for(const listeners of [...documentListeners.values(),...windowListeners.values()])assert.equal(listeners.size,0);
    const restored=mount(a.toLowerCase());assert.equal(restored.state!.run!.service!.phase,'paused');assert.equal(restored.state!.run!.service!.tick,tick);restored.unmount();
    assert.deepEqual(requests,[]);
  });
  await check('no access context cannot create or mutate a playable diner',async()=>{
    const before=new Map(storage.data),h=mount(null);assert.equal(h.state,null);assert.equal(h.hook.send({type:'settings',name:'Unconnected'}),false);h.unmount();
    await Promise.resolve();await Promise.resolve();assert.deepEqual(storage.data,before);
  });
  await check('unavailable browser storage retains a visible unsaved warning instead of claiming a checkpoint',()=>{
    const wallet=`0x${'31'.repeat(20)}`,key=betaStorageKeys(wallet).save,unread='earlier data the browser refuses to read';storage.setItem(key,unread);
    storage.failReads=true;const h=mount(wallet);
    try{
      assert(h.state,'playing remains possible in memory');assert.match(h.hook.localSaveError??'',/storage.*unavailable/i,'the UI receives a persistent storage error');
      assert(h.hook.send({type:'settings',name:'Memory Only'}));checkpoint();
      for(const callback of timeouts.values())callback();timeouts.clear();h.refresh();
      assert(h.hook.localSaveError,'the unsaved warning survives toast expiry and further play');
      assert.equal(storage.data.get(key),unread,'do not overwrite a checkpoint that could not be inspected');assert.deepEqual(requests,[]);
    }finally{h.unmount();storage.failReads=false;}
    assert.equal(storage.getItem(key),unread);
  });
  await check('a corrupt checkpoint is backed up and recovery remains visible after creating the new diner',()=>{
    const wallet=`0x${'32'.repeat(20)}`,key=betaStorageKeys(wallet).save,corrupt='{"unfinished beta checkpoint":';storage.setItem(key,corrupt);
    const h=mount(wallet);
    try{
      assert(h.state);assert.equal(h.hook.message?.error,true);assert(h.hook.message?.text,'replace must not swallow the recovery notice');
      const backup=[...storage.data].find(([savedKey])=>savedKey.startsWith(`${key}_recovery_`));assert(backup);assert.equal(backup[1],corrupt);
      checkpoint();h.refresh();assert.equal(h.hook.localSaveError,null);assert.notEqual(storage.getItem(key),corrupt);
    }finally{h.unmount();}
  });
  await check('a failed corrupt-save backup never overwrites the original and stays visibly unsaved',()=>{
    const wallet=`0x${'33'.repeat(20)}`,key=betaStorageKeys(wallet).save,corrupt='cannot parse this checkpoint';storage.setItem(key,corrupt);
    storage.failWrite=savedKey=>savedKey.startsWith(`${key}_recovery_`);const h=mount(wallet);
    try{
      assert(h.hook.localSaveError);assert.match(h.hook.localSaveError,/backed up/i);assert(!/backup has been preserved/i.test(h.hook.message?.text??h.hook.localSaveError),'do not claim a failed backup succeeded');
      assert(h.hook.send({type:'settings',name:'Cannot Save Yet'}));checkpoint();h.refresh();
      assert(h.hook.localSaveError);assert.equal(storage.getItem(key),corrupt);
      assert(![...storage.data.keys()].some(savedKey=>savedKey.startsWith(`${key}_recovery_`)));
    }finally{h.unmount();storage.failWrite=null;}
    assert.equal(storage.getItem(key),corrupt,'unmount must also preserve the only corrupt copy');
  });
  await check('a quota failure preserves the last checkpoint and clears its error only after a successful retry',()=>{
    const wallet=`0x${'34'.repeat(20)}`,key=betaStorageKeys(wallet).save,h=mount(wallet);checkpoint();const before=storage.getItem(key);assert(before);
    storage.failWrite=savedKey=>savedKey===key;
    try{
      assert(h.hook.send({type:'settings',name:'Waiting to Save'}));h.refresh();assert.match(h.hook.localSaveError??'',/could not save/i);
      assert.equal(storage.getItem(key),before,'failed saving must retain the last valid checkpoint');
      for(const callback of timeouts.values())callback();timeouts.clear();h.refresh();assert(h.hook.localSaveError,'settings must not advertise saved after toast expiry');
      storage.failWrite=null;checkpoint();h.refresh();assert.equal(h.hook.localSaveError,null);assert.equal(stored(wallet).home.name,'Waiting to Save');
      assert.deepEqual(requests,[]);
    }finally{h.unmount();storage.failWrite=null;}
  });
  console.log(`PASS ${groups} connected-wallet beta groups`);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
  loader._load=originalLoad;
  for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
});
