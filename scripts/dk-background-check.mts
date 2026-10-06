/** Execute the real GameStage background handlers with a clock and DOM double.
 * No renderer, browser session, credentials, or network calls are involved. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { applyAction, applyCanonicalLaunch, createWorld, deriveService, hireCost, qualityOf, qualityParts, REGULAR_NAMES, setCareJobsActive } from "../src/app/chef/game/_engine/world";
import { serializeSave, sanitizeSave } from "../src/app/chef/game/_engine/save";
import { SHELL, SHELL_SIZES } from "../src/app/chef/game/_engine/rooms";
import { DAILY_SPECIALS } from "../src/app/chef/game/_engine/pantry";
import { createOnboarding, createDelivery, onboardingStep } from "../src/app/chef/game/_engine/onboarding";
import { settleRestaurant } from "../src/lib/chef/offline";
import { isTruckCommand } from "../src/app/chef/game/_chain/truck-tape";

const file = readFileSync("src/app/chef/game/GameStage.tsx", "utf8");
const source = ts.createSourceFile("GameStage.tsx", file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const bodies: Record<string, string> = {};
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ["passiveAt", "settleGuestAbsence", "truckOwnsPrediction"].includes(node.name.text)) {
    bodies[node.name.text] = `let ${node.getText(source)};`;
  }
  if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left) && ["onVis", "poll"].includes(node.left.text) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    bodies[node.left.text] = `let ${node.getText(source)};`;
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "id" && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(source) === "setInterval" && node.initializer.arguments[1]?.getText(source) === "15000") {
    bodies.serverPoll = `let serverPoll = ${node.initializer.getText(source)};`;
  }
  ts.forEachChild(node, visit);
}
visit(source);
for (const key of ["passiveAt", "settleGuestAbsence", "onVis", "poll", "serverPoll"]) assert.ok(bodies[key], `Missing ${key} handler`);
const handlers = ts.transpileModule(`${Object.values(bodies).join("\n")}\n({onVis,poll,serverPoll,getPassiveAt:()=>passiveAt});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const start = Date.UTC(2026, 8, 16, 12);
const INTRO_DONE = onboardingStep(createOnboarding(true), createDelivery());
const SAVE_KEY = "dk_background_test";

function session(connected = false) {
  let now = start;
  const world = createWorld("background-check", SHELL, { utcDay: Math.floor(now / 86_400_000), playMoney: 0 });
  world.launch.passive.lastSettledAt = now;
  world.maintenance.lastSettledAt = now;
  const writes: string[] = [], commands: unknown[] = [];
  const cloud = { wallet: connected ? "test-player" : null, authorityRef: { current: null as any }, status: "off", pendingCommand: ():any=>null };
  const document = { visibilityState: "visible" };
  let stopped = 0, started = 0;
  const context = {
    world, worldRef: { current: world }, roomRef: { current: SHELL }, cloudRef: { current: cloud },
    truckOpenRef:{current:false},truckSendingRef:{current:false},truckActionsRef:{current:[] as any[]},truckUncertainRef:{current:false},isTruckCommand,
    cancelled: false, AUTHORITY_ENABLED: true, document, structuredClone,
    app: { ticker: { stop: () => { stopped++; }, start: () => { started++; } } },
    Date: class extends Date { static now() { return now; } },
    setInterval: (callback: () => void) => callback,
    runCommand: (command: unknown) => { commands.push(command); },
    runCommandRef: { current: (command: unknown) => { commands.push(command); } },
    dayBusRef: { current: () => {
      const utcDay = Math.floor(now / 86_400_000);
      if (!cloud.wallet && utcDay > world.utcDay) applyAction(world, SHELL, { type: "newDay", utcDay, banked: 1, tenure: 0, deferDelivery: true });
    } },
    themeRef: { current: "trattoria" }, crewRef: { current: {chef:0,waiter:0,chefName:""} }, introRef: { current: INTRO_DONE as number }, roomTitleRef: { current: "Test kitchen" },
    onboardingRef: { current: createOnboarding(true) }, deliveryRef: { current: createDelivery(world.utcDay, true) },
    serializeSave: (...args: Parameters<typeof serializeSave>) => ({ ...serializeSave(...args), savedAt: now }),
    settleRestaurant, applyAction, applyCanonicalLaunch, setCareJobsActive, INTRO_DONE, deriveService, qualityParts, qualityOf, hireCost, REGULAR_NAMES, SHELL_SIZES, DAILY_SPECIALS,
    localStorage: { setItem: (key: string, value: string) => { assert.equal(key, SAVE_KEY); writes.push(value); } },
    SAVE_KEY, setToast: () => {}, setCourses: () => {}, setSnap: () => {},
    serviceTier: () => ({ name: "Test tier" }), SERVICE_TIERS: [{ name: "Test tier", minQuality: 0 }],
    clockText: () => "12:00", phaseIcon: () => "day", kindLine: () => "Open",
    liveRef: { current: null }, lpSeenRef: { current: false }, cookbookSeenRef: { current: false }, lastPushRef: { current: 0 },
  };
  const callbacks = vm.runInNewContext(handlers, context) as { onVis: () => void; poll: () => void; serverPoll: () => void; getPassiveAt: () => number };
  return { world, cloud, document, writes, commands, callbacks, context, introRef: context.introRef, setTime: (time: number) => { now = time; }, ticker: () => ({ stopped, started }) };
}

{
  const s = session();
  s.document.visibilityState = "hidden"; s.callbacks.onVis();
  for (let day = 1; day <= 3; day++) { s.setTime(start + day * 86_400_000); s.callbacks.poll(); }
  assert.equal(s.world.playMoney, 0); assert.equal(s.writes.length, 0);
  assert.equal(s.callbacks.getPassiveAt(), start);
  s.document.visibilityState = "visible"; s.callbacks.onVis();
  assert.ok(s.world.playMoney >= 60 && s.world.playMoney <= 80);
  assert.ok(s.world.maintenance.cleanliness < 50 && s.world.maintenance.equipment < 80);
  assert.equal(s.writes.length, 1);
  assert.equal(s.world.launch.passive.lastSettledAt, start + 3 * 86_400_000);
  const coins = s.world.playMoney;
  s.callbacks.onVis(); s.callbacks.poll();
  assert.equal(s.world.playMoney, coins, "same-time resume and poll cannot replay the absence");
  const saved = sanitizeSave(JSON.parse(s.writes[s.writes.length - 1]));
  assert.equal(settleRestaurant(saved, { condition: { ...saved.maintenance, lastSettledAt: saved.savedAt }, coinRemainder: 0, plateRemainder: 0, passive: saved.launch.passive }, saved.savedAt).coins, 0);
  console.log("ok three hidden days settle once, decay condition, persist the receipt, and cannot replay on reload");
}
{
  const suspended = session(), hidden = session();
  hidden.document.visibilityState = "hidden"; hidden.callbacks.onVis();
  for (const s of [suspended, hidden]) s.setTime(start + 8 * 3_600_000);
  suspended.callbacks.poll(); hidden.document.visibilityState = "visible"; hidden.callbacks.onVis();
  assert.equal(suspended.world.playMoney, hidden.world.playMoney);
  assert.deepEqual(suspended.world.maintenance, hidden.world.maintenance);
  assert.deepEqual(suspended.world.launch.passive, hidden.world.launch.passive);
  console.log("ok a suspended foreground timer uses the same eight-hour settlement as a hidden tab");
}
{
  const s = session();
  applyAction(s.world, SHELL, { type: "edit", on: true });
  s.document.visibilityState = "hidden"; s.callbacks.onVis(); s.setTime(start + 86_400_000);
  s.document.visibilityState = "visible"; s.callbacks.onVis();
  assert.equal(s.world.playMoney, 0); assert.equal(s.writes.length, 0);
  assert.equal(s.world.launch.passive.lastSettledAt, start + 86_400_000);
  s.setTime(start); s.callbacks.onVis(); s.callbacks.poll();
  assert.equal(s.callbacks.getPassiveAt(), start + 86_400_000);
  assert.ok(s.world.launch.passive);
  console.log("ok a background editor earns nothing or saves its draft, and backwards clocks retain the purse");
}
{
  const s = session(true);
  s.setTime(start + 3_600_000); s.callbacks.poll();
  assert.equal(s.world.playMoney, 0, "missing canonical state must not fall back to guest earnings");
  s.document.visibilityState = "hidden"; s.callbacks.serverPoll();
  assert.equal(s.commands.length, 0);
  s.document.visibilityState = "visible"; s.callbacks.onVis();
  assert.equal(s.commands.length, 1);
  const save = serializeSave(s.world, "trattoria");
  const repair = save.launch.careTasks.find(task => task.kind === "repair")!;
  repair.progress = repair.steps; save.maintenance = { cleanliness: 61, equipment: 100, lastSettledAt: start + 3_600_000 };
  s.cloud.authorityRef.current = { save, authority: { currentQuality: 70, verifiedBestQuality: 0 } };
  s.world.maintenance.cleanliness = 99;
  s.callbacks.poll();
  const toilet = s.world.toilets.find(t => t.gx === repair.target.gx && t.gy === repair.target.gy)!;
  assert.equal(toilet.broken, false); assert.equal(s.world.maintenance.cleanliness, 61);
  toilet.broken = true; s.callbacks.poll();
  assert.equal(toilet.broken, true, "later polls must not repair an incidental breakdown using an old receipt");
  console.log("ok connected polling uses canonical condition, clears each care target once, and pauses hidden settlements");
}
{
  const s = session(true);
  const save = serializeSave(s.world, "trattoria");
  const receipt = structuredClone(save.launch);
  s.cloud.authorityRef.current = { save, authority: { currentQuality: 70, verifiedBestQuality: 0 } };
  s.introRef.current = 1;
  s.callbacks.poll();
  assert.equal(s.world.careJobsActive, false);
  assert.ok(s.world.toilets.every(t => !t.broken));
  s.introRef.current = INTRO_DONE;
  s.callbacks.poll();
  assert.equal(s.world.careJobsActive, true);
  assert.equal(s.world.toilets.filter(t => t.broken).length, 1);
  assert.deepEqual(s.world.launch, receipt);
  console.log("ok canonical polling keeps introductory toilets pristine and arms the unchanged care jobs after the guide");
}
{
  const s=session(true),save=serializeSave(s.world,"trattoria");
  save.coins=5;s.cloud.authorityRef.current={save,authority:{currentQuality:70,verifiedBestQuality:0}};
  for(const field of ["truckOpenRef","truckSendingRef","truckUncertainRef"] as const){
    s.context[field].current=true;s.world.playMoney=42;
    s.callbacks.serverPoll();s.callbacks.onVis();s.callbacks.poll();
    assert.equal(s.commands.length,0);assert.equal(s.world.playMoney,42,"home polling must preserve truck prediction ownership");
    s.context[field].current=false;
  }
  s.context.truckActionsRef.current=[{type:"tick",ticks:1}];s.callbacks.serverPoll();s.callbacks.onVis();assert.equal(s.commands.length,0);
  s.context.truckActionsRef.current=[];s.cloud.pendingCommand=()=>({type:"truckBatch",actions:[{type:"tick",ticks:1}]});
  s.callbacks.serverPoll();s.callbacks.onVis();assert.equal(s.commands.length,0);
  s.cloud.pendingCommand=()=>null;s.callbacks.serverPoll();assert.equal(s.commands.length,1);
  console.log("ok home settlement/polling yields to open, in-flight, queued, and uncertain truck commands");
}
console.log("Domain Kitchen background lifecycle checks passed.");
