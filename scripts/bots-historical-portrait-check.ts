/** Historical portraits must read the same frozen appearance as the replay. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CANON } from "../src/app/bots/_engine/catalog";
import { SHOWCASE } from "../src/lib/bots/showcase";
import { NO_LOOK, NO_MARKS, socketPaints } from "../src/lib/bots/look";
import { renderPortrait } from "../src/app/api/bots/portrait/render";
import { looksOf, canonicalBuild, type ResultJson } from "../src/app/bots/_server/fight-read";
import type { LookView } from "../src/app/bots/_server/types";

const dbModule = require("../src/app/bots/_server/db");
const fightModule = require("../src/app/bots/_server/fight-read");
const botsModule = require("../src/app/bots/_server/bots");
const { GET } = require("../src/app/api/bots/portrait/route");
const original = { db: dbModule.botsDb, loadBattle: fightModule.loadBattle, loadBot: botsModule.loadBot, fetch: globalThis.fetch };
const loadArt = async (url: string) => new Uint8Array(readFileSync(path.join(process.cwd(), "public", url)));
const captured: LookView = {
  paints: socketPaints(() => "mint"),
  look: { ...NO_LOOK, face: "happy", sticker: "heart", spot: "cheek", stickerPaint: "mint", hat: {kind:"bow",color:"butter"}, plateNumber:7 },
  marks: { ...NO_MARKS, stars:2 }, wins:8,
};
const result = {
  buildA: SHOWCASE.a, buildB: SHOWCASE.b,
  ids: [{name:"Tiny Biscuit 7",paint:"butter",wins:8},{name:"Rusty Beetle",paint:"coral",wins:0}],
  looks: [captured,{paints:socketPaints(()=>"coral"),look:NO_LOOK,marks:NO_MARKS,wins:0}],
} as unknown as ResultJson;
let currentReads=0;
let currentLook={...NO_LOOK,face:"calm",sticker:null};
const rows: Record<string,unknown> = {
  "901": {id:901,status:"resolved",mode:"pvp",result,challenger_bot_id:1,defender_bot_id:2,resolved_at:"2026-09-06T00:00:00Z"},
  "902": {id:902,status:"resolved",mode:"pvp",result:{...result,buildA:CANON.T2,looks:undefined},challenger_bot_id:1,defender_bot_id:2,resolved_at:"2026-09-05T00:00:00Z"},
  "903": {id:903,status:"resolved",mode:"spar",result,challenger_bot_id:1,defender_bot_id:2,resolved_at:"2026-09-06T00:00:00Z"},
  "904": {id:904,status:"open",mode:"pvp",result:null},
};

async function picture(id:string) {
  const response=await GET(new Request(`http://portrait.test/api/bots/portrait?f=${id}&w=0&s=120`));
  assert.equal(response.status,200);
  return {response,bytes:new Uint8Array(await response.arrayBuffer())};
}

(async()=>{
  dbModule.botsDb=()=>({});
  fightModule.loadBattle=async (_db:unknown,id:string)=>rows[id]??null;
  botsModule.loadBot=async ()=>{currentReads++;return {id:1,build:{look:currentLook},wins:99,losses:40,level:20};};
  globalThis.fetch=async (input: RequestInfo | URL)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    assert.ok(url.pathname.startsWith('/bots-art/'));
    return new Response(await loadArt(url.pathname));
  };

  const first=await picture("901");
  const expected=await renderPortrait({build:canonicalBuild(result.buildA),look:captured.look,marks:captured.marks,paints:captured.paints},120,loadArt);
  assert.deepEqual(first.bytes,new Uint8Array(expected.png),"The shared picture must use the stored look, marks and colours");
  const wrongPaint=await renderPortrait({build:canonicalBuild(result.buildA),look:captured.look,marks:captured.marks},120,loadArt);
  assert.notDeepEqual(first.bytes,new Uint8Array(wrongPaint.png),"Snapshot colours must override build/default colours exactly as the replay does");
  currentLook={...NO_LOOK,face:"stars",sticker:null};
  const later=await picture("901");
  assert.deepEqual(later.bytes,first.bytes,"A later makeover cannot change the old share picture");
  assert.equal(currentReads,0,"Historical portraits must never query today's bot cosmetics");
  console.log('[OK] Stored face, sticker, hat, marks and colours survive a later makeover; no current bot reads.');

  const legacy=await picture("902");
  const legacyResult=(rows["902"] as {result:ResultJson}).result;
  const legacyLook=looksOf(legacyResult)[0];
  const expectedLegacy=await renderPortrait({build:canonicalBuild(legacyResult.buildA),look:legacyLook.look,marks:legacyLook.marks,paints:legacyLook.paints},120,loadArt);
  assert.deepEqual(legacy.bytes,new Uint8Array(expectedLegacy.png));
  assert.equal(legacyLook.look.hat,null);
  assert.deepEqual(legacyLook.marks,NO_MARKS);
  console.log('[OK] Old fights without a look use the replay compatibility fallback, never present-day cosmetics.');

  for(const id of ['903','904','999']){
    const fallback=await picture(id);
    assert.match(fallback.response.headers.get('etag')??'',/starter/);
    assert.equal(fallback.response.headers.get('cache-control'),'public, max-age=60');
  }
  console.log('[OK] Private, unfinished and missing fights retain the plain fallback portrait.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
  dbModule.botsDb=original.db;
  fightModule.loadBattle=original.loadBattle;
  botsModule.loadBot=original.loadBot;
  globalThis.fetch=original.fetch;
});
