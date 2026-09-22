import assert from 'node:assert/strict';
import { CANON } from '../src/app/bots/_engine/catalog';
import { NO_ORDERS } from '../src/app/bots/_engine/parts';
import { runFightAtVersion, createFightAtVersion, resultOf, aggregatesAtVersion } from '../src/lib/bots/combat';
import { runFight as oldRun, resultOf as oldResult } from '../src/app/bots/_engine/resolve';
import { aggregates as oldStats } from '../src/app/bots/_engine/derive';
import { practiceBuildV5 } from '../src/lib/bots/style-practice';
import { presetV5 } from '../src/lib/bots/v5';
const a = CANON.T2, b = CANON.T3;
const modularShape = { ...a, limbs: { armL: a.arms, armR: a.arms, legL: a.legs, legR: a.legs } };
for (const seed of [0, 1, 75, 1024, 0xffffffff]) {
  assert.deepEqual(resultOf(runFightAtVersion(2, seed, modularShape, b)), oldResult(oldRun(seed, modularShape, b, NO_ORDERS, NO_ORDERS, 'spar')));
  assert.equal(createFightAtVersion(2, seed, modularShape, b).st.v, 2);
  assert.equal(createFightAtVersion(3, seed, a, b).st.v, 3);
}
assert.deepEqual(aggregatesAtVersion(2, modularShape), oldStats(modularShape, NO_ORDERS));
const mixed = presetV5('tank', 2).appearanceBuild;
mixed.limbs!.armL = presetV5('speed', 2).appearanceBuild.limbs!.armL;
const snapshot = practiceBuildV5({ robot: JSON.stringify(mixed), style: 'ranged', tier: '4' });
assert.equal(snapshot.parts.torso.id, mixed.torso.id); assert.equal(snapshot.parts.armL.id, mixed.limbs!.armL.id);
assert.equal(practiceBuildV5({ style: 'speed', part: 'mk5.t2.ranged.weapon', tier: '2' }).capabilities.weapon, 'rifle');
assert.throws(() => practiceBuildV5({ robot: 'not-json' }));
assert.throws(() => practiceBuildV5({ robot: JSON.stringify({ ...mixed, torso: { ...mixed.torso, s: [12, 12, 12] } }) }));
console.log('PASS explicit historical replay versions, old stat derivation, exact mixed preview links and invalid-link refusal.');
