/** Existing display-only links must work without becoming fictional server records. */
import assert from "node:assert/strict";
import { FIGHTS, FIXTURE_BUILDS, OWNED_PARTS, engineBuild, nameText } from "../src/lib/bots/fixtures";
import { fixturePractice } from "../src/lib/bots/fixture-replay";
import { assertModularBuild, combatPart, combatPaints } from "../src/lib/bots/combat-model";
import { EQUIPMENT_SOCKETS } from "../src/lib/bots/equipment";
import { resolveFight } from "../src/lib/bots/combat";
import { resolveFight as resolveLegacy } from "../src/app/bots/_engine/resolve";
import { NO_MARKS } from "../src/lib/bots/look";

const before = JSON.stringify({FIGHTS,FIXTURE_BUILDS,OWNED_PARTS});
const hashes: Record<string,string> = {};
for (const [bay, rows] of Object.entries(FIGHTS)) for (const row of rows) {
  const sample = fixturePractice(row.id)!;
  assert.ok(sample, row.id);
  assertModularBuild(sample.a);
  assertModularBuild(sample.b);
  const original = engineBuild(FIXTURE_BUILDS[Number(bay)], OWNED_PARTS);
  for (const socket of EQUIPMENT_SOCKETS) {
    assert.deepEqual(combatPart(sample.a,socket), combatPart(original,socket), `${row.id}: actual ${socket}`);
  }
  assert.deepEqual(sample.looks![0].paints,combatPaints(sample.a));
  assert.equal(sample.ids[0].name,nameText(FIXTURE_BUILDS[Number(bay)].name));
  assert.equal(sample.ids[1].name,row.opponent);
  assert.equal(sample.mode,"spar");
  assert.match(sample.modeLabel,/demo practice.*sample fight/i);
  assert.deepEqual(sample.ids.map(p=>[p.wins,p.losses]),[[0,0],[0,0]]);
  sample.looks!.forEach(look=>assert.deepEqual(look.marks,NO_MARKS));
  assert.match(sample.rewardLines!.join(" "),/No rewards or record changes/);
  assert.equal(sample.replayUrl,`/bots/fight/${row.id}`);
  const result=resolveFight(sample.seed,sample.a,sample.b,undefined,undefined,sample.mode);
  const clone=JSON.parse(JSON.stringify(fixturePractice(row.id)));
  const repeated=resolveFight(clone.seed,clone.a,clone.b,undefined,undefined,clone.mode);
  assert.deepEqual(repeated,result,`${row.id}: serialized replay is identical`);
  hashes[row.id]=result.hash.toString(16).padStart(8,"0");
}
assert.equal(Object.keys(hashes).length,10);
assert.equal(JSON.stringify({FIGHTS,FIXTURE_BUILDS,OWNED_PARTS}),before,"Demo resolution is read-only");
for(const id of ["1041","f_999999","demo-spar","", "f_1041?win=1"]) assert.equal(fixturePractice(id),null);
console.log("[OK] All ten display links preserve their bay's seven pieces, colours and name; deterministic sample results, no records or rewards.");
console.log(JSON.stringify(hashes));

// Exercise the actual page branch while replacing only the browser component.
const clientPath=require.resolve("../src/app/bots/fight/FightClient");
const clientBefore=require.cache[clientPath];
function Client() { return null; }
function Server() { return null; }
require.cache[clientPath]={id:clientPath,filename:clientPath,loaded:true,exports:{__esModule:true,default:Client,ServerFight:Server}} as NodeModule;
const dbModule=require("../src/app/bots/_server/db");
const oldDb=dbModule.botsDb;
let dbReads=0;
dbModule.botsDb=()=>{dbReads++;throw Error("Fixture previews must not query the database");};
(async()=>{
  const page=require("../src/app/bots/fight/[id]/page");
  for(const id of Object.keys(hashes)) {
    const element=page.default({params:{id}});
    assert.equal(element.type,Client);
    assert.equal(element.props.expectedHash.toString(16).padStart(8,"0"),hashes[id]);
    const metadata=await page.generateMetadata({params:{id}});
    assert.match(metadata.title,/Demo practice/);
    assert.equal(metadata.openGraph,undefined,"No fictional historical victory share card");
  }
  assert.equal(dbReads,0);
  for(const id of ["1041","f_unknown"]) {
    const element=page.default({params:{id}});
    assert.equal(element.type,Server);
    assert.equal(element.props.id,id);
  }
  for(const id of ["demo-look","demo-old","demo-spar","demo-pve-easy","demo-pve-medium","demo-pve-hard","demo-pvp"]) {
    const element=page.default({params:{id}}), p=element.props;
    assert.equal(element.type,Client);
    assert.equal(p.expectedHash,resolveLegacy(p.seed,p.a,p.b,undefined,undefined,p.mode).hash);
  }
  console.log("[OK] Actual route handles fixture IDs locally; numeric server routing and all seven legacy demo outcomes are preserved.");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
  dbModule.botsDb=oldDb;
  if(clientBefore)require.cache[clientPath]=clientBefore;else delete require.cache[clientPath];
});
