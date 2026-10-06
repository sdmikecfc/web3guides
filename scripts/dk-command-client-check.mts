/** Exercise the real hook's command transport using deterministic React/session doubles. */
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import Module from "node:module";
process.env.NEXT_PUBLIC_DK_AUTHORITY_ENABLED = "true";
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const stored = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) } });
let refs: any[] = [], cursor = 0;
let address = "0x" + "a1".repeat(20);
let signatures = 0;
const loader = (Module as any)._load;
(Module as any)._load = function(id: string, ...args: unknown[]) {
  if (id === "react") return {
    useRef: (value: unknown) => refs[cursor++] ?? (refs[cursor - 1] = { current: value }),
    useState: (value: unknown) => [value, () => {}],
    useCallback: (callback: unknown) => callback,
    useEffect: (callback: () => unknown) => callback(),
  };
  if (id === "wagmi") return { useAccount: () => ({ address, isConnected: true }), useSignMessage: () => ({ signMessageAsync: async () => { signatures++; return "signature"; } }) };
  return loader.call(this, id, ...args);
};
const { useCloudSave } = require("../src/app/chef/game/_chain/useCloudSave");
(Module as any)._load = loader;
function hook() {
  refs = []; cursor = 0; stored.clear(); address = "0x" + "a1".repeat(20);
  stored.set("dk_token_v1", "token-old"); stored.set("dk_token_wallet", address);
  return useCloudSave();
}
const snapshot = (revision: number, ok = true) => ({ ok, revision, save: { coins: 100 }, authority: {}, neighbors: [], featured: [], serverTime: 1 });
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
(async () => {
  {
    const cloud = hook(); const requests: any[] = [];
    Object.assign(globalThis, { fetch: async (_url: string, init: any) => {
      const body = JSON.parse(init.body); requests.push(body);
      if (requests.length === 1) throw new Error("response lost after commit");
      return response(snapshot(1));
    } });
    assert.ok((await cloud.command({ type: "purchase", itemId: "plant_basic" })).ok);
    assert.equal(requests.length, 2); assert.equal(requests[0].id, requests[1].id);
    assert.equal(stored.has("dk_pending_command_v1"), false);
    console.log("ok uncertain request reuses one command ID");
  }
  {
    const cloud = hook(); const requests: any[] = []; let offline = true;
    Object.assign(globalThis, { fetch: async (_url: string, init: any) => {
      const body=JSON.parse(init.body); requests.push(body);
      if(offline)throw new Error("offline"); return response(snapshot(1));
    } });
    assert.equal(await cloud.command({type:"purchase",itemId:"plant_basic"}),null);
    assert.ok(stored.has("dk_pending_command_v1")); offline=false;
    assert.ok((await cloud.command({type:"purchase",itemId:"plant_basic"})).ok);
    assert.equal(new Set(requests.map((r)=>r.id)).size,1);
    console.log("ok user retry confirms the outstanding purchase instead of purchasing twice");
  }
  {
    const cloud=hook();const requests:any[]=[];let caughtUp=false;
    const tape={type:"truckBatch",actions:[{type:"tick",ticks:20}]};
    Object.assign(globalThis,{fetch:async(_url:string,init:any)=>{
      requests.push(JSON.parse(init.body));
      return caughtUp?response(snapshot(1)):response({ok:false,code:"truck_time_credit",error:"wait",retryAfterMs:1},429);
    }});
    assert.equal(await cloud.command(tape),null);
    assert.deepEqual(cloud.pendingCommand(),tape,"an underfunded clock keeps the exact tape pending");
    assert.ok(stored.has("dk_pending_command_v1"));caughtUp=true;
    assert.ok((await cloud.command(cloud.pendingCommand())).ok);
    assert.equal(new Set(requests.map(request=>request.id)).size,1);
    assert.equal(cloud.pendingCommand(),null);
    console.log("ok clock-credit retries retain the same tape and command ID until confirmed");
  }
  {
    const cloud=hook();let requests=0;
    Object.assign(globalThis,{fetch:async()=>{requests++;return response({...snapshot(5,false),code:"conflict"},409);}});
    const result=await cloud.command({type:"layout",layout:[]});
    assert.equal(result.ok,false);assert.equal(requests,1);assert.equal(cloud.authorityRef.current.revision,5);
    console.log("ok stale layout stops for review instead of overwriting the other device");
  }
  {
    const cloud=hook(); const requests:any[]=[]; let offline=true;
    const original={type:"layout",layout:[{itemId:"table_basic",gx:2,gy:3,facing:"se"}],design:{floor:"sage"}};
    const expected=structuredClone(original);
    Object.assign(globalThis,{fetch:async(_url:string,init:any)=>{
      requests.push(JSON.parse(init.body));
      if(offline)throw new Error("layout may have committed before the connection failed");
      return response(snapshot(1));
    }});
    const failed=cloud.command(original);
    original.layout[0].gx=8;
    assert.equal(await failed,null);
    assert.deepEqual(cloud.pendingCommand(),expected,"editor must retain the submitted layout, not later local edits");
    const persisted=JSON.parse(stored.get("dk_pending_command_v1")!);
    assert.deepEqual(persisted.command,expected);
    // A reload retains the unresolved envelope and exposes it to the editor lock.
    refs=[];cursor=0;const reloaded=useCloudSave();
    assert.deepEqual(reloaded.pendingCommand(),expected);
    offline=false;
    assert.ok((await reloaded.command(reloaded.pendingCommand())).ok);
    assert.equal(new Set(requests.map((r)=>r.id)).size,1);
    assert.equal(requests[requests.length-1].id,persisted.id);
    assert.deepEqual(requests[requests.length-1].command,expected);
    assert.equal(reloaded.pendingCommand(),null);
    assert.equal(stored.has("dk_pending_command_v1"),false);
    console.log("ok uncertain editor save survives failure and reload, then confirms its original ID and clears the lock");
  }
  {
    const cloud=hook(); let resolve: ((value: unknown)=>void)|undefined; let requests=0;
    Object.assign(globalThis,{fetch:async()=>{requests++;return new Promise((r)=>{resolve=r;});}});
    const first=cloud.command({type:"purchase",itemId:"plant_basic"});
    const second=cloud.command({type:"purchase",itemId:"table_basic"});
    await Promise.resolve();await Promise.resolve();
    cloud.signOut();resolve!(response(snapshot(1)));
    assert.equal(await first,null);assert.equal(await second,null);assert.equal(requests,1);
    console.log("ok sign-out cancels queued writes and discards another session's response");
  }
  {
    refs=[];cursor=0;stored.clear();
    const pending={wallet:address,id:"existing-player-command",revision:7,command:{type:"purchase",itemId:"plant_basic"}};
    stored.set("dk_token_v1","existing-player-token");stored.set("dk_token_wallet",address);
    stored.set("dk_pending_command_v1",JSON.stringify(pending));
    const before=[...stored.entries()],beforeSignatures=signatures;
    const normalStorage=globalThis.localStorage;
    let reads=0,writes=0,removes=0,requests=0;
    Object.assign(globalThis,{localStorage:{
      getItem:(key:string)=>{reads++;return stored.get(key)??null;},
      setItem:(key:string,value:string)=>{writes++;stored.set(key,value);},
      removeItem:(key:string)=>{removes++;stored.delete(key);},
    },fetch:async()=>{requests++;throw new Error("opening preview must not contact the server");}});
    try {
      const preview=useCloudSave(true);
      assert.equal(preview.status,"off");assert.equal(preview.wallet,null);assert.equal(preview.error,"");
      assert.equal(preview.authorityRef.current,null);assert.equal(preview.pendingCommand(),null);
      await preview.signIn();
      assert.equal(await preview.load(),null);
      assert.equal(await preview.store({coins:999} as any),false);
      assert.equal(await preview.command({type:"settle"}),null);
      assert.equal(await preview.command(pending.command),null);
      assert.equal(await preview.social(),null);
      preview.signOut();
      assert.equal(reads,0,"preview must not read the existing account's token or pending command");
      assert.equal(writes,0);assert.equal(removes,0);assert.equal(requests,0);assert.equal(signatures,beforeSignatures);
      assert.deepEqual([...stored.entries()],before,"preview calls, including sign-out, must preserve the existing account");
    } finally { Object.assign(globalThis,{localStorage:normalStorage}); }
    // The saved envelope remains usable when the player returns to the ordinary game.
    refs=[];cursor=0;
    assert.deepEqual(useCloudSave().pendingCommand(),pending.command);
    console.log("ok opening preview ignores and preserves existing account data without signatures, requests, or storage writes");
  }
  console.log("Domain Kitchen command-client checks passed.");
})().catch((error)=>{console.error(error);process.exitCode=1;});
