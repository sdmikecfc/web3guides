import { FIGHTS, FIXTURE_BUILDS, OWNED_PARTS } from "./fixtures";
import { splitLegacyEquipment } from "./equipment";
import { practiceLink, readPracticeRobot } from "./demo-replay";
import { fnv1a } from "@/app/bots/_engine/rng";
import type { FightClientProps } from "@/app/bots/fight/FightClient";

/** The old display rows have no stored result. Their links open an explicitly
 * labelled sample using the display bay's kit, never a fabricated history row.
 * Only IDs present in FIGHTS qualify; numeric server IDs stay on their own path.
 * A fixed seed and static fixture snapshots make these samples replayable.
 */
export function fixturePractice(id: string): FightClientProps | null {
  const entry = Object.entries(FIGHTS).find(([, rows]) => rows.some(row => row.id === id));
  if (!entry) return null;
  const [bayText, rows] = entry;
  const bay = Number(bayText), row = rows.find(row => row.id === id)!;
  const state = splitLegacyEquipment({ parts: [...OWNED_PARTS], builds: { ...FIXTURE_BUILDS } });
  const seed = fnv1a(`fixture-practice-v1|${id}`);
  const capture = (n: number) => {
    const url = new URL(practiceLink(state.builds[n], state.parts, seed), "https://demo.invalid");
    return readPracticeRobot(url.searchParams.get("robot")!)!;
  };
  const a = capture(bay);
  // The fixture never supplied an opponent kit. Choose another complete display
  // kit deterministically; retain the name on the link without asserting that
  // its old win/loss story is the outcome of this newly simulated sample.
  const opponents = [1, 2, 3].filter(n => n !== bay);
  const b = capture(opponents[seed % opponents.length]);
  return {
    seed, a: a.build, b: b.build,
    ids: [
      { name: a.name, wallet: "Demo garage", wins: 0, losses: 0, strategy: "Practice", paint: a.look.paints.torso ?? "cream" },
      { name: row.opponent, wallet: "Demo opponent", wins: 0, losses: 0, strategy: "Practice", paint: b.look.paints.torso ?? "cream" },
    ],
    looks: [a.look, { ...b.look, look: { ...b.look.look, plateNumber: null } }],
    mode: "spar", modeLabel: "Demo practice · sample fight",
    rewardLines: ["This is a sample fight for the demo. No rewards or record changes."],
    replayUrl: `/bots/fight/${id}`,
    watchAnotherHref: "/bots/fight/demo?seed=7&showcase=1",
  };
}
