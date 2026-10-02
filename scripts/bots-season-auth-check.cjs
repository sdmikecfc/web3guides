/* Synthetic EOA signatures and an isolated nonce adapter; no wallet UI/network/service. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {privateKeyToAccount}=require('viem/accounts');
const {randomBytes}=require('node:crypto');
const stage=process.env.BOTS_SEASON_STAGE||path.resolve(__dirname,'..');
const dbModule=require('../src/app/bots/_server/db'),{verifySession}=require('../src/app/bots/_server/session');
const source=fs.readFileSync(path.join(process.env.BOTS_REPO_ROOT||path.resolve(__dirname,'..'),'src/app/api/bots/season/auth/route.ts'),'utf8');
const {POST}=require('../src/app/api/bots/season/auth/route');
const rows=new Map(),calls=[],checks=[],saved={node:process.env.NODE_ENV,flag:process.env.BOTS_SEASON_V1,secret:process.env.BB_SESSION_SECRET,card:process.env.BB_CARD_SECRET},oldDb=dbModule.botsDb,oldFetch=global.fetch;
const account=privateKeyToAccount('0x'+'1'.repeat(64)),other=privateKeyToAccount('0x'+'2'.repeat(64));
const pass=name=>{checks.push(name);console.log('PASS',name);};
const db={from(table){assert.equal(table,'battle_bots_enlist_nonces','sign-in may only consume an existing game nonce');const filters=[],operation={table,kind:'select',value:null};
 const chain={update(value){operation.kind='update';operation.value=value;return chain;},select(){return chain;},eq(k,v){filters.push(row=>row[k]===v);return chain;},is(k,v){filters.push(row=>row[k]===v);return chain;},gt(k,v){filters.push(row=>row[k]>v);return chain;},maybeSingle(){operation.single=true;return chain;},then(resolve,reject){try{calls.push({...operation});const found=[...rows.values()].filter(row=>filters.every(f=>f(row)));if(operation.kind==='update')for(const row of found)Object.assign(row,operation.value);return Promise.resolve({data:operation.single?found[0]||null:found.map(row=>({...row})),error:null}).then(resolve,reject);}catch(e){return Promise.reject(e).then(resolve,reject);}}};return chain;
}};
const nonce=(wallet=account.address,expires=Date.now()+300000)=>{const value=randomBytes(24).toString('base64url');rows.set(value,{nonce:value,wallet:wallet.toLowerCase(),expires_at:new Date(expires).toISOString(),used_at:null,is_test:false});return value;};
const body=async(n,signer=account,options={})=>{const message=`${options.domain||'modelkombat.xyz'} wants you to sign in with your Ethereum account:\n${signer.address}\n\nSign in to Model Kombat.\n\nURI: https://modelkombat.xyz\nVersion: 1\nChain ID: 1\n${n===null?'':`Nonce: ${n}\n`}Issued At: ${options.issued||new Date().toISOString()}`;return{address:signer.address,message,signature:await signer.signMessage({message})};};
const req=data=>new Request('http://localhost/api/bots/season/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
async function send(data){const response=await POST(req(data));return{status:response.status,body:await response.json()};}
(async()=>{try{
 process.env.NODE_ENV='production';process.env.BOTS_SEASON_V1='1';process.env.BB_SESSION_SECRET='local-auth-fixture-secret';delete process.env.BB_CARD_SECRET;
 dbModule.botsDb=()=>db;global.fetch=async()=>{throw Error('auth fixture forbids every network request');};
 assert(!/enlistPlayer|campaignEnrollment|loadPlayer|mk6_enroll|\.rpc\(/.test(source),'authentication route has no legacy or seasonal enrollment call');
 const valid=await body(nonce());delete process.env.BOTS_SEASON_V1;assert.equal((await send(valid)).status,404);process.env.BOTS_SEASON_V1='0';assert.equal((await send(valid)).status,404);process.env.BOTS_SEASON_V1='1';
 for(const bad of[null,{},[],{address:'broken'},{address:account.address,message:1,signature:'0x00'},{address:account.address,message:'message',signature:3}])assert.equal((await send(bad)).status,400);
 assert.equal(calls.length,0);pass('missing/disabled preview flag and invalid wallet payloads fail before any nonce or enrollment access');
 const badSignature={...valid,signature:(await body(nonce(),other)).signature};assert.equal((await send(badSignature)).status,401);assert.equal((await send({...valid,address:other.address})).status,401);
 assert.equal((await send(await body(nonce(),account,{domain:'unapproved.example'}))).status,401);assert.equal((await send(await body(nonce(),account,{issued:new Date(Date.now()-360000).toISOString()}))).status,401);assert.equal(calls.length,0);
 pass('real ECDSA verification rejects wrong signer, altered address, disallowed domain and stale message before consuming a nonce');
 assert.equal((await send(await body(null))).status,400);assert.equal((await send(await body(randomBytes(24).toString('base64url')))).status,401);
 assert.equal((await send(await body(nonce(account.address,Date.now()-1)))).status,401);assert.equal((await send(await body(nonce(other.address)))).status,401);
 pass('actual nonce-store path rejects missing, unknown, expired and other-wallet nonces');
 const signed=await body(nonce()),responses=await Promise.all([send(signed),send(signed)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,401]);
 const success=responses.find(r=>r.status===200).body;assert.equal(success.ok,true);assert.equal(success.joined,false);assert.deepEqual(Object.keys(success).sort(),['joined','ok','token']);
 const session=verifySession(success.token);assert(session);assert.equal(session.wallet,account.address.toLowerCase());assert.equal(session.isTest,false);
 assert(calls.every(c=>c.table==='battle_bots_enlist_nonces'&&['update','select'].includes(c.kind)));
 pass('concurrent replay grants one valid session only; consumes one nonce and creates no player, starter, seasonal enrollment, coins or inventory');
 const before=calls.length;delete process.env.BB_SESSION_SECRET;const missing=await send(await body(nonce()));assert.equal(missing.status,503);assert.equal(missing.body.code,'SIGN_IN_NOT_CONFIGURED');assert.equal(calls.length,before);
 pass('missing production signing secret fails closed before nonce consumption');
 fs.writeFileSync(path.join(stage,'auth-verification.json'),JSON.stringify({checks,scope:'real synthetic EOA cryptography and real route/nonce/session logic, isolated in-memory nonce query adapter; no network, actual wallet, live database or shared services'},null,2));
 }finally{dbModule.botsDb=oldDb;global.fetch=oldFetch;for(const [name,value] of[['NODE_ENV',saved.node],['BOTS_SEASON_V1',saved.flag],['BB_SESSION_SECRET',saved.secret],['BB_CARD_SECRET',saved.card]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
})().catch(e=>{console.error(e);process.exitCode=1;});
