/** Prove dangerous board-test configuration is rejected before DB client creation. */
import assert from "node:assert/strict";
import Module from "node:module";
const originalLoad=(Module as any)._load;
let created=0;
(Module as any)._load=function(id:string,...args:unknown[]) {
  if(id==="@supabase/supabase-js")return{createClient:()=>{created++;throw new Error("DB_CLIENT_CREATED");}};
  return originalLoad.call(this,id,...args);
};
const originalArgs=[...process.argv];
const oldUrl=process.env.DK_TEST_DATABASE_URL, oldKey=process.env.DK_TEST_SERVICE_KEY;
try {
  for(const test of [
    {name:"missing explicit database",app:"http://localhost:3000",db:undefined},
    {name:"remote database",app:"http://localhost:3000",db:"https://example.invalid"},
    {name:"remote app",app:"https://example.invalid",db:"http://127.0.0.1:54321"},
    {name:"invalid runner argument",app:"scripts/dk-board-check.mts",db:"http://127.0.0.1:54321"},
    {name:"credentials embedded in URL",app:"http://localhost:3000",db:"http://user:pass@127.0.0.1:54321"},
  ]) {
    process.argv=[process.argv[0],"scripts/dk-board-check.mts",test.app];
    if(test.db)process.env.DK_TEST_DATABASE_URL=test.db;else delete process.env.DK_TEST_DATABASE_URL;
    process.env.DK_TEST_SERVICE_KEY="deliberately-unused-test-value";
    const filename=require.resolve("./dk-board-check.mts");delete require.cache[filename];
    assert.throws(()=>require(filename),/explicit local URL|remote services are refused/);
    assert.equal(created,0);
    console.log(`ok ${test.name} refused before any database client or write`);
  }
} finally {
  (Module as any)._load=originalLoad;process.argv=originalArgs;
  if(oldUrl===undefined)delete process.env.DK_TEST_DATABASE_URL;else process.env.DK_TEST_DATABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.DK_TEST_SERVICE_KEY;else process.env.DK_TEST_SERVICE_KEY=oldKey;
}
