/** Real public route + visitor hydration with local read-only transport doubles. */
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { starterLayout } from "../src/app/chef/game/_engine/rooms";
import { sanitizeSave } from "../src/app/chef/game/_engine/save";
import { operativeMenuForSave } from "../src/lib/chef/offline";
import type { VisitPayload } from "../src/app/chef/visit/[handle]/VisitClient";

const wallet = `0x${"a1".repeat(20)}`, handle = "0xa1a1…a1a1";
let data: { state: unknown; best_quality: number } | null = null, databaseReads = 0;
let authority = false;
const database = { from(table: string) {
  assert.equal(table, "domain_kitchen_players"); databaseReads++;
  return { select(columns: string) {
    assert.equal(columns, "state, best_quality");
    const query = { eq() { return query; }, async maybeSingle() { return { data, error: null }; } }; return query;
  } };
} };
const originalLoader = (Module as any)._load;
(Module as any)._load = function(id: string, ...args: unknown[]) {
  if (id === "next/server") return { NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) } };
  if (id === "@/lib/chef/server") return { dkDb: () => database };
  if (id === "@/lib/chef/board") return { walletForHandle: async (candidate: string) => candidate === handle ? wallet : null };
  if (id === "@/lib/chef/authority-server") return { authorityEnabled: () => authority, resolveKitchenHandle: async (_db: unknown, candidate: string) => candidate === handle ? wallet : null };
  if (id.startsWith("@/")) return originalLoader.call(this, path.resolve(process.cwd(), "src", id.slice(2)), ...args);
  if (id === "react" || id === "react/jsx-runtime" || id === "pixi.js" || id.endsWith(".module.css") || id.startsWith("../../game/_view/") || id.startsWith("../../game/_chain/") || id === "../../game/RestaurantUI" || id.startsWith("../../game/_ui/") || id === "../../board/CheerButton") return {};
  return originalLoader.call(this, id, ...args);
};
const { GET } = require("../src/app/api/chef/visit/[handle]/route");
const filename = path.resolve("src/app/chef/visit/[handle]/VisitClient.tsx"), compiled = new (Module as any)(filename, module);
compiled.filename = filename; compiled.paths = (Module as any)._nodeModulePaths(path.dirname(filename));
compiled._compile(ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
const { createVisitWorld, stepVisitWorld } = compiled.exports as typeof import("../src/app/chef/visit/[handle]/VisitClient");
(Module as any)._load = originalLoader;

const layout = [...starterLayout().map((piece, index) => ({ ...piece, uid: index + 1 })),
  { uid: 201, itemId: "drinks_basic", gx: 4, gy: 0, facing: "se" },
  { uid: 202, itemId: "fryer_basic", gx: 3, gy: 0, facing: "se" }];
const privateState = {
  v: 7, savedAt: 123456, name: "Neighborhood Kitchen", theme: "trattoria", shell: 0, layout,
  coins: 918273, inventory: { drinks_basic: 8 }, dials: { parkedUsd: 987654 }, crew: { chef: 1, waiter: 2, chefName: "PRIVATE CHEF" },
  equipment: { instances: {
    1: { uid: 1, itemId: "stove_basic", condition: 64 }, 201: { uid: 201, itemId: "drinks_basic", condition: 57 },
    202: { uid: 202, itemId: "fryer_basic", condition: 0 }, 999: { uid: 999, itemId: "drinks_basic", condition: 73 },
  } },
  pantry: { stock: { tomato: 54321 }, levels: { margherita: 2, fries: 3 } },
  truck: { version: 1, firstClears: [1, 2, 3], nextNode: 4, sign: "PRIVATE TRUCK" },
};
const get = async (candidate = handle) => GET(new Request(`http://localhost/api/chef/visit/${candidate}`), { params: { handle: candidate } });

(async () => {
  data = { state: privateState, best_quality: 80 };
  const original = JSON.stringify(privateState), response = await get(), body = await response.json() as VisitPayload;
  assert.equal(response.status, 200); assert.equal(JSON.stringify(privateState), original, "Public reads mutated the stored kitchen");
  assert.equal(Object.keys(body).sort().join(","), "condition,crew,design,equipment,hires,interactions,layout,menu,name,ok,shell,theme,tier");
  const raw = JSON.stringify(body);
  for (const privateField of ["coins", "inventory", "pantry", "stock", "dials", "truck", "firstClears", "chefName", "wallet"]) assert.ok(!raw.includes(`"${privateField}"`), `Leaked ${privateField}`);
  for (const secret of ["PRIVATE CHEF", "PRIVATE TRUCK", wallet, '"999"', "918273", "54321"]) assert.ok(!raw.includes(secret), `Leaked ${secret}`);
  assert.deepEqual(body.layout.map(piece => piece.uid), layout.map(piece => piece.uid));
  for (const piece of body.layout) assert.deepEqual(Object.keys(piece).sort(), ["facing", "gx", "gy", "itemId", "uid"]);
  assert.deepEqual(Object.keys(body.equipment!.instances).sort(), ["1", "201", "202"]);
  for (const instance of Object.values(body.equipment!.instances)) assert.deepEqual(Object.keys(instance).sort(), ["condition", "itemId", "uid"]);
  assert.equal(body.equipment!.instances[202].condition, 0); assert.equal(body.equipment!.instances[201].condition, 57);
  assert.deepEqual(body.menu!.selected, operativeMenuForSave(sanitizeSave(privateState)));
  assert.ok(body.menu!.selected.length > 4); assert.ok(body.menu!.selected.includes("lemonade")); assert.ok(!body.menu!.selected.includes("fries"));
  assert.deepEqual(Object.keys(body.menu!.levels).sort(), [...body.menu!.selected].sort());
  console.log("PASS public route exact allowlist, stable IDs, placed equipment only, full effective menu, and private data exclusion");

  const { world, room } = createVisitWorld(handle, body), beforeView = JSON.stringify(body), snapshot = structuredClone(world.equipment);
  assert.deepEqual(world.operations.menu, body.menu!.selected); assert.ok(world.operations.menu.length > 4);
  assert.equal(world.equipment.instances[202].condition, 0); assert.ok(!world.operations.stations.some(station => station.uid === 202));
  assert.equal(world.equipment.instances[201].condition, 57); assert.ok(!world.equipment.instances[999]);
  for (let tick = 0; tick < 3600; tick++) stepVisitWorld(world, room, snapshot);
  assert.ok(world.stats.served > 0); assert.deepEqual(world.equipment, snapshot); assert.equal(JSON.stringify(body), beforeView); assert.equal(JSON.stringify(privateState), original);
  assert.ok(!world.operations.menu.includes("fries")); assert.deepEqual(world.operations.menu, body.menu!.selected);
  console.log("PASS actual visitor hydration and animated preview preserve broken machines, menu, and read-only condition snapshot");

  const malicious = structuredClone(body); malicious.equipment!.instances[999] = { uid: 999, itemId: "drinks_basic", condition: 99 };
  const scrubbed = createVisitWorld(handle, malicious); assert.ok(!scrubbed.world.equipment.instances[999]);
  data = { state: { v: 6, layout: starterLayout(), theme: "trattoria" }, best_quality: 10 };
  const legacy = await (await get()).json() as VisitPayload, viewed = createVisitWorld(handle, legacy);
  assert.ok(legacy.layout.every(piece => Number.isInteger(piece.uid))); assert.ok(Object.values(legacy.equipment!.instances).every(instance => instance.condition === 100));
  assert.ok(viewed.world.operations.stations.length > 0); assert.ok(viewed.world.operations.menu.length > 4);
  const oldPayload = { ...legacy }; delete oldPayload.equipment; delete oldPayload.menu;
  oldPayload.layout = oldPayload.layout.map(({ uid, ...piece }) => piece);
  assert.ok(createVisitWorld(handle, oldPayload).world.operations.stations.length > 0);
  console.log("PASS legacy saves and cached older visit payloads remain viewable without importing private progression");

  const beforeReads = databaseReads; assert.equal((await get("not-a-handle")).status, 404); assert.equal(databaseReads, beforeReads);
  authority = true; assert.equal((await get()).status, 200); data = null; assert.equal((await get()).status, 404);
  console.log("PASS invalid/missing handles and both public lookup paths");
  console.log("PASS 4 public-visit integration groups (no network or database writes)");
})().catch(error => { console.error(error); process.exitCode = 1; });
