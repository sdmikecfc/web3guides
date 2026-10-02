import assert from "node:assert/strict";
import { BEGINNER_OFFERS, BEGINNER_ORDER } from "../src/lib/bots/beginner-catalog";
import { demoWelcome, freshGameDemo, demoBuy } from "../src/lib/bots/game-demo";
import { socketsOf, EQUIPMENT_KIND } from "../src/lib/bots/equipment";
import { engineBuild } from "../src/lib/bots/fixtures";
import { aggregates } from "../src/lib/bots/combat";
import { combatPart } from "../src/lib/bots/combat-model";
const cssLoader = require.extensions[".css"];
require.extensions[".css"] = () => {}; // Node only: styles do not affect try-on state.
async function main() {
const { previewOffer } = await import("../src/app/bots/_game/BuildStats");
let game = demoWelcome(freshGameDemo());
for (const socket of BEGINNER_ORDER) {
  const build = game.builds.find(b => b.bay === game.onboarding.draftBay)!;
  const before = JSON.stringify(game), ids = socketsOf(build);
  for (const offer of BEGINNER_OFFERS.filter(o => o.part.slot === EQUIPMENT_KIND[socket])) {
    const trial = previewOffer(build, game.parts, socket, offer);
    assert.equal(JSON.stringify(game), before, "trying a part never spends coins or modifies saved choices");
    const engine = engineBuild(trial.build, trial.parts);
    assert.equal(combatPart(engine, socket).id, offer.part.id, "preview renders the selected identity");
    for (const other of BEGINNER_ORDER.filter(s => s !== socket)) assert.equal(socketsOf(trial.build)[other], ids[other], `${socket} preview preserves ${other}`);
    assert(Object.values(aggregates(engine)).every(Number.isFinite));
  }
  const offer = BEGINNER_OFFERS.filter(o => o.part.slot === EQUIPMENT_KIND[socket])[1];
  game = demoBuy(game, socket, offer.id);
}
console.log("PASS every starter offer previews on its chosen socket, preserves neighbours and leaves saved parts/currency untouched; all overall stats are finite");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { if (cssLoader) require.extensions[".css"] = cssLoader; else delete require.extensions[".css"]; });
