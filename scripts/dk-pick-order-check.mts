/** Execute the actual scene picker functions with minimal sprite/container doubles.
 * Alpha sampling has its own real-PNG checks in dk-sprite-hit-check.mts; this
 * suite covers scene ordering, transparent misses, and the editor handoff.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const { sortMixin } = require("../node_modules/pixi.js/lib/scene/container/container-mixins/sortMixin.js");
const source = ts.createSourceFile("scene.ts", readFileSync("src/app/chef/game/_view/scene.ts", "utf8"), ts.ScriptTarget.Latest, true);
const functions = new Map<string, ts.FunctionDeclaration>();
function collect(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
  ts.forEachChild(node, collect);
}
collect(source);

interface FakeContainer { children: FakeSprite[]; sortDirty: boolean; sortChildren: () => void }
interface FakeSprite {
  _zIndex: number; visible: boolean; alpha: number; opaque: boolean;
  parent: FakeContainer; position: { x: number; y: number }; scale: { x: number; y: number };
}
function container(): FakeContainer {
  return { children: [], sortDirty: true, sortChildren() { sortMixin.sortChildren.call(this); } };
}
function sprite(parent: FakeContainer, z: number): FakeSprite {
  const s: FakeSprite = { _zIndex: z, visible: true, alpha: 1, opaque: true, parent, position: { x: 0, y: 0 }, scale: { x: 1, y: 1 } };
  parent.children.push(s); parent.sortDirty = true;
  return s;
}
const objC = container(), decorC = container();
const root = { position: { x: 110, y: 70 }, children: [decorC, objC] };
const furn = new Map<number, { sprite: FakeSprite; itemId: string }>();
const charSprites = new Map<number, FakeSprite>();
const scope = {
  root, objC, decorC, furn, charSprites, curScale: 2,
  spriteContainsPoint: (s: FakeSprite, lx: number, ly: number) => s.opaque && Math.abs(lx) < .01 && Math.abs(ly) < .01,
  itemDef: () => ({ layer: "furniture" }), hitsWallArt: () => true,
};
function picker(name: string): (x: number, y: number) => number {
  const node = functions.get(name);
  assert.ok(node, `${name} must exist in the real scene`);
  const js = ts.transpileModule(node.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(scope), `${js};return ${name};`)(...Object.values(scope));
}
const pickItem = picker("pickItem"), pickEntity = picker("pickEntity");
const first = sprite(objC, 60), second = sprite(objC, 40);
furn.set(1, { sprite: first, itemId: "table_basic" });
furn.set(2, { sprite: second, itemId: "chair_basic" });
assert.equal(pickItem(110, 70), 1);
assert.deepEqual(objC.children, [second, first]);
// Moving the first-created piece to equal depth preserves Pixi's current order,
// which now differs from the furniture Map's insertion order.
first._zIndex = 40; objC.sortDirty = true;
assert.equal(pickItem(110, 70), 1, "same-depth pick must follow the last drawn child after a move");
assert.equal(objC.children[objC.children.length - 1], first);
first.opaque = false;
assert.equal(pickItem(110, 70), 2, "transparent front sprite must reveal the visible chair behind it");
second.opaque = false;
assert.equal(pickItem(110, 70), -1, "transparent canvas must not produce a furniture target");
first.opaque = true; second.opaque = true;
objC.children = [first, second]; objC.sortDirty = true;
assert.equal(pickItem(110, 70), 2, "after reload the actual newly drawn order still determines the target");
const rug = sprite(decorC, 1000);
furn.set(3, { sprite: rug, itemId: "rug_basic" });
assert.equal(pickItem(110, 70), 2, "foreground container beats a higher numeric z in the floor container");
first.visible = false; second.alpha = 0;
assert.equal(pickItem(110, 70), 3);
assert.equal(pickItem(500, 500), -1, "blank floor remains unselected after camera conversion");
console.log("ok actual scene furniture picker: changed-depth ties, reload order, transparent misses, visibility, and parent layers");

objC.children = [];
const actorA = sprite(objC, 60), actorB = sprite(objC, 40);
charSprites.set(10, actorA); charSprites.set(11, actorB);
assert.equal(pickEntity(110, 70), 10);
actorA._zIndex = 40; objC.sortDirty = true;
assert.equal(pickEntity(110, 70), 10, "character picks obey the same actual equal-depth order");
actorA.opaque = false;
assert.equal(pickEntity(110, 70), 11);
actorB.opaque = false;
assert.equal(pickEntity(110, 70), -1);
console.log("ok actual scene character picker: changed-depth ties and transparent misses");

const stageSource = ts.createSourceFile("GameStage.tsx", readFileSync("src/app/chef/game/GameStage.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let hit: ts.VariableDeclaration | undefined;
function findEditorHit(node: ts.Node): void {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "hit" && node.initializer?.getText(stageSource).includes("bySprite")) hit = node;
  ts.forEachChild(node, findEditorHit);
}
findEditorHit(stageSource);
assert.ok(hit?.initializer, "editor must resolve the selected sprite to its placed item");
const hitJs = ts.transpileModule(`function findHit(world:any,bySprite:number,gx:number,gy:number){return ${hit.initializer.getText(stageSource)};}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const findHit = new Function("footprintCells", `${hitJs};return findHit;`)(() => [{ x: 2, y: 3 }]);
const layout = [{ uid: 5, itemId: "table_basic", gx: 2, gy: 3, facing: "se" }];
assert.equal(findHit({ layout }, -1, 2, 3), undefined, "alpha miss must stay a miss even inside an occupied footprint");
assert.equal(findHit({ layout }, 5, 2, 3), layout[0]);
console.log("ok actual editor handoff does not reinstate a footprint target after the sprite picker misses");
console.log("Domain Kitchen pick-order checks passed.");
