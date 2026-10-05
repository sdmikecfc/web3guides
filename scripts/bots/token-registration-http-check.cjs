// Loopback-only route verification; dummy signatures never leave this fixture.
const assert=require('node:assert/strict'),{createHmac}=require('node:crypto');
const base=process.env.MK_TEST_ORIGIN||'http://127.0.0.1:3190';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Local fixture only');
const wallet='0x'+'9'.repeat(40),secret=process.env.MK_TEST_SESSION_SECRET||'local-token-zone-review-only-secret-20260929';
function token(isTest=false,exp=Date.now()+3600000){const p=Buffer.from(JSON.stringify({wallet,isTest,exp})).toString('base64url');return 'bb1.'+p+'.'+createHmac('sha256',secret).update(p).digest('base64url')}
async function post(t,origin=base){return fetch(base+'/api/bots/campaign/zones/register',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{})},body:JSON.stringify({wallet:'0x'+'8'.repeat(40)})})}
async function main(){
 assert.equal((await post()).status,401);assert.equal((await post(token(true))).status,403);
 assert.equal((await post(token(false,1))).status,401);assert.equal((await post(token(),'https://untrusted.example')).status,403);
 const signed=token();const attempts=await Promise.all([post(signed),post(signed)]);for(const r of attempts)assert.equal(r.status,200);
 const read=await fetch(base+'/api/bots/campaign/zones',{headers:{Authorization:'Bearer '+signed}});const view=await read.json();assert.equal(view.personal.connected,true);assert.equal(view.personal.entered,false);assert.equal(view.personal.linkStatus,'pending');assert.equal(view.state,'draft');
 // Only inspect this explicitly local fixture, never real user storage.
 const discovered=await (await fetch('http://127.0.0.1:3174/rest/v1/mkz_wallet_discovery?select=wallet,status')).json();
 assert.equal(discovered.filter(r=>r.wallet===wallet).length,1);assert.equal(discovered.some(r=>r.wallet==='0x'+'8'.repeat(40)),false);
 const players=await (await fetch('http://127.0.0.1:3174/rest/v1/mk8_players?select=wallet')).json();assert.equal(players.some(r=>r.wallet===wallet),false);
 console.log('PASS authenticated registration HTTP: rejects guests/test/expired/cross-origin sessions; ignores body identity; simultaneous retries discover only the signed wallet without game progression.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
