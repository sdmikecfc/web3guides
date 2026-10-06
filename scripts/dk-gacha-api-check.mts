import assert from 'node:assert/strict';
import Module from 'node:module';
// Next normally provides this import guard; this Node harness is already server-side.
const loader=Module as unknown as { _load:(name:string,...args:unknown[])=>unknown };
const original=loader._load;
loader._load=function(name,...args){return name==='server-only'?{}:original.call(this,name,...args);};
async function main(){
  const { gachaReadEnabled,gachaReadEndpoint }=await import('../src/lib/chef/gacha/read-server');
  assert.equal(gachaReadEnabled({ NODE_ENV:'production',DINER_PACKS_RELEASE:'true',DINER_GACHA_REVIEW_ENABLED:'true' }),false);
  assert.equal(gachaReadEnabled({ NODE_ENV:'development' }),false);
  assert.equal(gachaReadEnabled({ NODE_ENV:'development',DINER_GACHA_REVIEW_ENABLED:'true' }),true);
  const env=process.env as Record<string,string|undefined>,prior={ NODE_ENV:env.NODE_ENV,DINER_GACHA_REVIEW_ENABLED:env.DINER_GACHA_REVIEW_ENABLED,DINER_PREVIEW_SERVER_ENABLED:env.DINER_PREVIEW_SERVER_ENABLED };
  try{
    env.NODE_ENV='production';env.DINER_GACHA_REVIEW_ENABLED='true';
    for(const view of ['pull','round','verification','leaderboard','collection','assets']){
      const result=await gachaReadEndpoint(new Request(`http://localhost/api/chef/gacha/gochujang?view=${view}&id=1`),'gochujang');
      assert.equal(result.status,404);assert.deepEqual(await result.json(),{ error:'not_found' });assert.equal(result.headers.get('cache-control'),'no-store');
    }
    env.NODE_ENV='development';env.DINER_PREVIEW_SERVER_ENABLED='false';
    assert.equal((await gachaReadEndpoint(new Request('http://localhost/api/chef/gacha/gochujang'),'gochujang')).status,503);
    console.log('PASS private read API: production closed, development opt-in, safe missing-config response');
  }finally{for(const [key,value]of Object.entries(prior)){if(value===undefined)delete env[key];else env[key]=value;}loader._load=original;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
