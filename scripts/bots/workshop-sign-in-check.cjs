/* Read-only test: actual SIWE/signature/session code, isolated in-memory DB.
 * No server connection, wallet provider, secrets or generated repo files. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'../..'),load=Module._load,resolve=Module._resolveFilename,tsExtension=Module._extensions['.ts'];
Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(root,'src',name.slice(2)):name,parent,...rest);};
Module._extensions['.ts']=function(module,file){module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);};
// This unrelated renderer/economy module is deliberately outside this unit.
Module._load=function(name,parent,...rest){
 if(name==='server-only')return{};
 if(name==='@/app/bots/_server/workshop8')return{requireWorkshop(){},workshopError(error){const {Refusal}=require('../../src/app/bots/_server/db');return Response.json({ok:false,error:error instanceof Refusal?error.message:'Sign-in unavailable'},{status:error instanceof Refusal?error.status:503});}};
 return load.call(this,name,parent,...rest);
};
const {privateKeyToAccount}=require('viem/accounts'),{SiweMessage}=require('siwe');
const dbModule=require('../../src/app/bots/_server/db'),{verifySession}=require('../../src/app/bots/_server/session');
const {issueNonce,burnNonce}=require('../../src/app/api/bots/enlist/nonce-store');
const {POST}=require('../../src/app/api/bots/workshop/auth/route');
const {signInToWorkshop,workshopSignInMessage,signInErrorMessage}=require('../../src/lib/bots/workshop8/wallet-sign-in');
const envNames=['NODE_ENV','BB_SESSION_SECRET','BB_CARD_SECRET','BOTS_TOKEN_ZONES'],savedEnv=envNames.map(k=>process.env[k]),oldDb=dbModule.botsDb,oldFetch=global.fetch;
const rows=new Map(),operations=[],registered=[];let failRegistration=false;
const db={from(table){assert.equal(table,'battle_bots_enlist_nonces');const filters=[];let kind='select',value,single=false,count=false;
 const query={select(_fields,options){count=!!options?.count;return query;},insert(row){kind='insert';value=row;return query;},update(row){kind='update';value=row;return query;},eq(key,val){filters.push(row=>row[key]===val);return query;},is(key,val){filters.push(row=>row[key]===val);return query;},gt(key,val){filters.push(row=>row[key]>val);return query;},maybeSingle(){single=true;return query;},then(ok,bad){try{operations.push(kind);if(kind==='insert'){assert(!rows.has(value.nonce));rows.set(value.nonce,{used_at:null,...value});return Promise.resolve({data:null,error:null}).then(ok,bad);}const found=[...rows.values()].filter(row=>filters.every(f=>f(row)));if(kind==='update')found.forEach(row=>Object.assign(row,value));return Promise.resolve({data:single?found[0]??null:found.map(row=>({...row})),count:count?found.length:null,error:null}).then(ok,bad);}catch(e){return Promise.reject(e).then(ok,bad);}}};return query;},async rpc(name,args){assert.equal(name,'mkz_register_wallet');if(failRegistration)return{error:{message:'fixture registration failure'}};registered.push(args.p_wallet);return{error:null};}};
const account=privateKeyToAccount('0x'+'1'.repeat(64)),other=privateKeyToAccount('0x'+'2'.repeat(64)),origin='https://www.modelkombat.xyz';
const pass=name=>console.log('PASS',name);
async function challenge(wallet=account.address){return(await issueNonce(db,wallet,false)).nonce;}
async function signed(nonce,signer=account,changes={}){const original=workshopSignInMessage(signer.address,origin,nonce),parsed=new SiweMessage(original);Object.assign(parsed,changes);const message=parsed.prepareMessage();return{address:signer.address,message,signature:await signer.signMessage({message})};}
async function send(body){const response=await POST(new Request(origin+'/api/bots/workshop/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));return{status:response.status,body:await response.json()};}
async function main(){try{
 process.env.NODE_ENV='production';process.env.BB_SESSION_SECRET='isolated-fixture-session-key';delete process.env.BB_CARD_SECRET;process.env.BOTS_TOKEN_ZONES='1';dbModule.botsDb=()=>db;global.fetch=async()=>{throw Error('No network allowed');};
 for(let i=0;i<64;i++){rows.clear();const n=await challenge();assert.match(n,/^[a-f0-9]{64}$/);assert.equal(new SiweMessage(workshopSignInMessage(account.address,origin,n)).nonce,n);}
 pass('64 real issued cryptographic challenges construct and parse with the installed SIWE library');
 rows.clear();const legacy='legacy_challenge-with-base64url-symbols';rows.set(legacy,{nonce:legacy,wallet:account.address.toLowerCase(),expires_at:new Date(Date.now()+300000).toISOString(),used_at:null});await burnNonce(db,account.address,legacy);await assert.rejects(burnNonce(db,account.address,legacy));
 assert.throws(()=>workshopSignInMessage(account.address,origin,legacy));pass('legacy challenges remain single-use without permitting invalid SIWE or rewriting the challenge');
 rows.clear();const n=await challenge(),valid=await signed(n),startOps=operations.length;
 const wrong=await other.signMessage({message:valid.message});assert.equal((await send({...valid,signature:wrong})).status,401);assert.equal(rows.get(n).used_at,null);
 for(const changes of[{domain:'wrong.example'},{uri:'https://wrong.example'},{chainId:97477},{statement:'Different operation'},{issuedAt:new Date(Date.now()-360000).toISOString()}])assert.equal((await send(await signed(n,account,changes))).status,401);
 assert.equal((await send({...valid,address:other.address})).status,401);assert.equal(operations.length,startOps);assert.equal(registered.length,0);pass('real signatures reject wrong signer/site/statement/chain/address and expiry before consuming a challenge or registering');
 const replay=await Promise.all([send(valid),send(valid)]);assert.deepEqual(replay.map(r=>r.status).sort(),[200,401]);const session=replay.find(r=>r.status===200).body;assert.equal(verifySession(session.token).wallet,account.address.toLowerCase());assert.equal(registered.length,1);pass('concurrent replay registers once and returns exactly one verified session');
 rows.clear();const expired=await challenge();rows.get(expired).expires_at=new Date(Date.now()-1).toISOString();assert.equal((await send(await signed(expired))).status,401);
 const someoneElse=await challenge(other.address);assert.equal((await send(await signed(someoneElse))).status,401);pass('expired and other-wallet challenges cannot authenticate');
 rows.clear();failRegistration=true;const failed=await send(await signed(await challenge()));assert.equal(failed.status,503);assert.equal(failed.body.token,undefined);failRegistration=false;pass('tracking registration failure cannot issue a successful session');
 rows.clear();const stages=[],clientCalls=[];
 const fetcher=async(url,options)=>{clientCalls.push(url);if(url.endsWith('/nonce'))return Response.json({ok:true,nonce:await challenge()});const r=await send(JSON.parse(options.body));return Response.json(r.body,{status:r.status});};
 const result=await signInToWorkshop({address:account.address,origin,fetcher,onStage:s=>stages.push(s),signMessage:message=>account.signMessage({message})});assert.equal(result.wallet,account.address.toLowerCase());assert.equal(verifySession(result.token).wallet,result.wallet);assert.deepEqual(stages,['preparing','signing','saving']);assert.deepEqual(clientCalls,['/api/bots/enlist/nonce','/api/bots/workshop/auth']);pass('client challenge, actual signature, tracking registration and session complete in one flow');
 rows.clear();clientCalls.length=0;await assert.rejects(signInToWorkshop({address:account.address,origin,fetcher,signMessage:async()=>{throw{code:4001};}}));assert.deepEqual(clientCalls,['/api/bots/enlist/nonce']);assert.equal([...rows.values()][0].used_at,null);assert.match(signInErrorMessage({cause:{code:4001}}),/cancelled/);pass('cancelled wallet signature never submits authentication or consumes its challenge');
 rows.clear();clientCalls.length=0;let stillCurrent=true;await assert.rejects(signInToWorkshop({address:account.address,origin,fetcher,isCurrentWallet:()=>stillCurrent,signMessage:async message=>{stillCurrent=false;return account.signMessage({message});}}));assert.deepEqual(clientCalls,['/api/bots/enlist/nonce']);pass('wallet changes during signing cannot submit the old wallet session');
 assert(!signInErrorMessage(Error('line 9: invalid nonce private RPC')).includes('nonce'));assert(!signInErrorMessage(Error('private RPC')).includes('RPC'));pass('player errors never expose raw SIWE or wallet diagnostics');
 }finally{dbModule.botsDb=oldDb;global.fetch=oldFetch;envNames.forEach((k,i)=>savedEnv[i]===undefined?delete process.env[k]:process.env[k]=savedEnv[i]);Module._load=load;Module._resolveFilename=resolve;if(tsExtension)Module._extensions['.ts']=tsExtension;else delete Module._extensions['.ts'];}}
main().catch(error=>{console.error(error);process.exitCode=1;});
