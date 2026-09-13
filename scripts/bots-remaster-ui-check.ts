import assert from "node:assert/strict";
import { AFTERMATH_FRAMES_V7, MAX_FRAMES_V7, acceptSpecialV7, createFightV7, createHeroBuildV7, resultV7, stepFightV7, type BuildV7, type StyleV7 } from "../src/lib/bots/v7";
import { assertRemasterProof, readRemasterQuery, remasterFrame, remasterTime } from "../src/app/bots/fight/remaster/playback";

const pair = (a: StyleV7, b: StyleV7): [BuildV7, BuildV7] => [createHeroBuildV7(a), createHeroBuildV7(b)];
let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`PASS ${name}`); }

check("query parsing preserves seed zero and limits the isolated hero preview", () => {
  assert.deepEqual(readRemasterQuery({ style: "ranged", rival: "speed", seed: "0", mode: "weapon-demo", clean: "1" }), { style: "ranged", rival: "speed", seed: 0, mode: "weapon-demo", clean: true });
  for (const seed of ["-1", "Infinity", "1e3", "4294967296", " "]) assert.equal(readRemasterQuery({ seed }).seed, 75);
  assert.equal(readRemasterQuery({ seed: "4294967295" }).seed, 4294967295);
  assert.deepEqual(readRemasterQuery({ style: "legacy", rival: "unknown", mode: "fake" }), { style: "tank", rival: "speed", seed: 75, mode: "fight", clean: false });
  assert.equal(remasterTime(95), "1.5s");
});

check("all three advertised pairings seek to the exact automatic result", () => {
  for (const [a, b] of [["tank", "speed"], ["tank", "ranged"], ["speed", "ranged"]] as [StyleV7, StyleV7][]) {
    const builds = pair(a, b), original = createFightV7(builds, 75, { autoSpecial: [true, true], defensePlans: ["balanced", "balanced"] });
    while (!original.done && original.frame <= MAX_FRAMES_V7) stepFightV7(original);
    assert.ok(original.done, `${a}/${b} must end`);
    const expected = resultV7(original), rebuilt = remasterFrame(builds, 75, true, expected.commands, MAX_FRAMES_V7 + AFTERMATH_FRAMES_V7);
    assert.doesNotThrow(() => assertRemasterProof(builds, expected));
    const obsolete = structuredClone(expected); Object.assign(obsolete, { rulesVersion: "obsolete-preview-rules" });
    assert.throws(() => assertRemasterProof(builds, obsolete), /earlier rules/);
    assert.equal(expected.rulesVersion, builds[0].rulesVersion, "rejection must preserve the original result");
    assert.equal(resultV7(rebuilt.state).hash, expected.hash, `${a}/${b} result`);
    assert.deepEqual(rebuilt.state.events, original.events, `${a}/${b} contact and damage`);
    assert.equal(rebuilt.state.frame, expected.frames, "aftermath must not advance the simulation");
    assert.equal(rebuilt.displayFrame, expected.frames + AFTERMATH_FRAMES_V7);
  }
});

check("manual Special presses survive forward seek, rewind, and a complete replay", () => {
  const builds = pair("tank", "speed"), original = createFightV7(builds, 75, { autoSpecial: [false, true], defensePlans: ["balanced", "balanced"] });
  let accepted = 0;
  while (!original.done && original.frame <= MAX_FRAMES_V7) {
    if (original.fighters[0].meter >= 100 && !original.fighters[0].special) {
      const receipt = acceptSpecialV7(original, { id: `manual-${original.frame}`, who: 0, kind: "special", frame: original.frame });
      if (receipt.accepted) accepted++;
    }
    stepFightV7(original);
  }
  assert.ok(accepted > 0, "a real manual Special must be exercised");
  const expected = resultV7(original), bytes = JSON.stringify(expected), middle = Math.floor(expected.frames / 2);
  const first = remasterFrame(builds, 75, false, expected.commands, middle), rewind = remasterFrame(builds, 75, false, expected.commands, 0), again = remasterFrame(builds, 75, false, expected.commands, middle);
  assert.equal(rewind.state.frame, 0);
  assert.deepEqual(first.state, again.state, "rewind must not change replay history");
  const end = remasterFrame(builds, 75, false, expected.commands, expected.frames + AFTERMATH_FRAMES_V7);
  assert.equal(resultV7(end.state).hash, expected.hash);
  assert.deepEqual(end.state.commands, expected.commands);
  assert.equal(JSON.stringify(expected), bytes, "capture/replay must not mutate its source result");
});

check("seeking has bounded frame input and rejects an impossible recorded Special", () => {
  const builds = pair("speed", "ranged");
  assert.equal(remasterFrame(builds, 75, false, [], Number.NaN).displayFrame, 0);
  assert.equal(remasterFrame(builds, 75, false, [], -50).displayFrame, 0);
  assert.throws(() => remasterFrame(builds, 75, false, [{ id: "impossible", who: 0, kind: "special", frame: 0 }], 1));
});

console.log(`${checks} remaster playback groups passed. No wallet, storage, reward or live API was used.`);
