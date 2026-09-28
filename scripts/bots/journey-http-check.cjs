// Runs only against the explicit local test server and dummy session secret.
const assert=require('node:assert/strict'),{createHmac,randomUUID}=require('node:crypto');
const base=process.env.MK_TEST_ORIGIN||'http://127.0.0.1:3173';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('HTTP fixture checks are loopback-only');
async function main(){
 async function client(){let cookie='',token='';return {setToken(t){token=t},async call(path='',body,origin=base){const r=await fetch(base+'/api/bots/workshop'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,...(token?{Authorization:'Bearer '+token}:{}),Origin:origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {status:r.status,data:await r.json(),cookieHeader:set}},cookie:()=>cookie};}
 const crossSite=await fetch(base+'/api/bots/workshop/session',{headers:{'Sec-Fetch-Site':'cross-site'}});assert.equal(crossSite.status,403);assert.equal(crossSite.headers.get('set-cookie'),null);
 const a=await client(),b=await client();
 const boot=await a.call('/session');assert.equal(boot.status,200);assert.match(boot.cookieHeader,/HttpOnly/i);assert.match(boot.cookieHeader,/SameSite=strict/i);assert.equal((await a.call()).data.state,null);
 assert.equal((await a.call('/session',{},'https://untrusted.example')).status,403);
 assert.equal((await a.call('/session',{})).status,200);assert.equal((await a.call('/session',{})).status,200);
 const initial=(await a.call()).data;assert.equal(initial.state.coins,250);assert.equal(initial.garages.length,1);
 const body={garageId:initial.garageId,revision:0,requestId:randomUUID(),action:{kind:'welcome'}};
 const [first,duplicate]=await Promise.all([a.call('',body),a.call('',body)]);assert.equal(first.status,200);assert.equal(duplicate.status,200);assert.equal(first.data.state.revision,1);assert.equal(duplicate.data.state.coins,250);
 assert.equal((await a.call('',{...body,requestId:randomUUID()})).status,409);
 assert.equal((await a.call('',{...body,revision:1,requestId:randomUUID(),action:{kind:'complete',winner:0,coins:999999}})).status,400);
 await b.call('/session');await b.call('/session',{});const other=(await b.call()).data;
 assert.equal((await b.call('?garage='+initial.garageId)).status,404);
 assert.equal((await b.call('/select',{garageId:initial.garageId})).status,404);
 const payload=Buffer.from(JSON.stringify({wallet:'0x'+'d'.repeat(40),isTest:true,exp:Date.now()+3600000})).toString('base64url');
 const token='bb1.'+payload+'.'+createHmac('sha256','journey-local-test-only-secret').update(payload).digest('base64url');
 a.setToken(token);const claim=await a.call('/claim',{});assert.equal(claim.status,200);assert.notEqual(claim.cookieHeader,boot.cookieHeader);assert.ok(claim.data.garages.some(g=>g.id===initial.garageId));
 b.setToken(token);const both=await b.call('/claim',{});assert.equal(both.status,200);assert.ok(both.data.garages.some(g=>g.id===other.garageId));assert.ok(both.data.garages.some(g=>g.id===initial.garageId));
 assert.equal((await a.call('?garage='+initial.garageId)).data.state.coins,250);assert.equal((await b.call('?garage='+other.garageId)).data.state.coins,250);
 assert.equal((await b.call('/select',{garageId:initial.garageId})).status,200);
 assert.equal((await a.call()).data.garageId,initial.garageId);
 assert.equal((await a.call('/select',{garageId:other.garageId})).status,200);
 assert.equal((await b.call()).data.garageId,other.garageId);
 console.log('PASS: real HTTP guest enrollment, secure cookie attributes, cross-origin denial, concurrent duplicate idempotency, stale revisions, client result rejection, garage isolation, atomic linking, cookie rotation, cross-site bootstrap denial and persistent garage selection. Test credentials stay local.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
