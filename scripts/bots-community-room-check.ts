import assert from "node:assert/strict";
import { communityVisitors } from "../src/lib/bots/community-room";
import { SHOWCASE } from "../src/lib/bots/showcase";
import { plainPracticeLook } from "../src/lib/bots/demo-replay";
import type { BattlesView, FightSummary } from "../src/app/bots/_server/types";

const summary = (id: string): FightSummary => ({
  id, mode: "pvp", difficulty: null, createdAt: "2026-09-10T00:00:00Z", frames: 600, seconds: 10,
  end: "ko", winner: 0, names: [`${id} A`, `${id} B`], walletNames: ["Player A", "Player B"], paints: ["mint", "coral"],
  looks: [plainPracticeLook(SHOWCASE.a), plainPracticeLook(SHOWCASE.b)], winnerName: `${id} A`, loserName: `${id} B`,
  winnerWallet: "", loserWallet: "", winnerTier: 1, loserTier: 2, finisher: "body cracked", chain: "test", upset: 0,
  builds: [SHOWCASE.a, SHOWCASE.b],
});
const view = (recent: FightSummary[], upset: FightSummary | null = null, fastestKo: FightSummary | null = null): BattlesView => ({
  ok: true, day: "2026-09-10", me: null, pve: [], defenders: [], defendersAvailable: true, live: [], featured: { upset, fastestKo, longest: null }, recent,
});

const cold = communityVisitors(null);
assert.equal(cold.featured, null); assert.equal(cold.visitors.length, 5);
assert.deepEqual(cold.visitors.map(v => v.bay), [1, 2, 3, 4, 5]);
assert(cold.visitors.every(v => v.fightId === null));
assert(cold.visitors.slice(0, 4).every(v => v.label === "Practice robot"));
assert.equal(cold.visitors[4].label, "Workshop helper"); assert.equal(cold.visitors[4].name, "Wrench");
assert.equal(cold.visitors[4].build, SHOWCASE.b);

const upset = summary("upset"), fastest = summary("fastest"), recent = summary("recent");
const source = view([recent, fastest], upset, fastest), untouched = JSON.stringify(source);
const result = communityVisitors(source);
assert.equal(result.featured, upset);
assert.deepEqual(result.visitors.slice(0, 2).map(v => v.fightId), ["upset", "upset"]);
assert.deepEqual(result.visitors.slice(2, 4).map(v => v.fightId), ["recent", "recent"]);
assert.equal(result.visitors[0].look, upset.looks[0]);
assert.equal(result.visitors[0].build, (upset as any).builds[0]);
assert.equal(result.visitors[1].paint, upset.paints[1]);
assert.equal(JSON.stringify(source), untouched, "display construction cannot alter a saved replay or appearance");
assert.equal(communityVisitors(view([recent], null, fastest)).featured, fastest);
assert.equal(communityVisitors(view([recent])).featured, recent);

const single = communityVisitors(view([recent], recent));
assert(single.visitors.slice(2).every(v => !v.fightId), "a single recorded pair does not pretend to be two different fights");
const cached = { ...summary("cached"), builds: undefined } as unknown as FightSummary;
const stale = communityVisitors(view([cached, recent], cached));
assert.equal(stale.featured, recent, "old cached summaries cannot place a different model under the player's name");
const missing = communityVisitors(view([cached]));
assert.equal(missing.featured, null); assert(missing.visitors.every(v => !v.fightId));
const malformed = { ...summary("malformed"), builds: [{ head: { id: "bad", s: [NaN, 0, 0] } }, SHOWCASE.b] } as unknown as FightSummary;
assert.equal(communityVisitors(view([malformed])).featured, null);
console.log("Community checks passed: five honest occupants, saved identity/build/appearance, featured priority, independent visitors, cached and missing snapshots, no invented fights.");
