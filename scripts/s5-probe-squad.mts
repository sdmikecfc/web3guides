/**
 * WARPATH: who is actually killing things, the player or the squad?
 *
 * Mike, playing the deployed build: "the friendly tanks are way too good. You
 * have zero need to play at all because the friendly tanks will destroy
 * everything."
 *
 * I already cut the squad once -- three tanks to two, range 150 to 110, plus a
 * SQUAD_LEAD_R gate so they will not engage anything far from the player -- and
 * the harness said it worked: the oracle now loses at wave 8 with 0/2 squad
 * alive. But "the run eventually fails" is a different claim from "the player
 * matters", and only the second one is what Mike is reporting.
 *
 * So count the kills. Two runs:
 *   PLAYER ABSENT  the sim with no input at all. Whatever dies, the squad killed.
 *   PLAYER ACTIVE  the harness's max-stat oracle.
 *
 * If the absent run racks up kills and clears waves, the squad is playing the
 * game and the player is a spectator, exactly as reported.
 */
import { createWarpath, stepWarpath, type WarpathState } from "../src/app/s5/games/warpath/sim";

const STATS = { firepower: 5, speed: 5, maneuver: 5, armor: 5, optics: 5 };

function run(label: string, drive: boolean) {
  const s = createWarpath(360, 480, "squadprobe", false, STATS as never) as WarpathState;
  const st = s as unknown as {
    wave: number;
    kills?: number;
    score?: number;
    trucks: { alive: boolean }[];
    friends?: { hp: number }[];
    foes: unknown[];
    over?: boolean;
    dead?: boolean;
  };

  let t = 0;
  const DT = 1 / 60;
  for (let f = 0; f < 60 * 240; f++) {
    // MIKE'S ACTUAL SCENARIO, not the AFK gate. The squad HOLDS FIRE entirely
    // until s.touched flips (see stepWarpath), so an input of {} measures a run
    // where the squad never shoots -- which is the AFK probe, not "I am playing
    // but the squad does everything". So: one touch to wake them up, then the
    // player parks and never acts again.
    const wake = f < 6 ? ({ down: true, px: 180, py: 240 } as never) : ({} as never);
    stepWarpath(s, DT, drive ? wake : ({} as never));
    t += DT;
    if (st.over || st.dead) break;
  }

  const trucksAlive = (st.trucks || []).filter((x) => x.alive).length;
  const squadAlive = (st.friends || []).filter((x) => x.hp > 0).length;
  console.log(
    `${label.padEnd(16)} ended ${t.toFixed(0).padStart(3)}s  wave ${String(st.wave).padStart(2)}/9  ` +
      `kills ${String(st.kills ?? "-").padStart(3)}  score ${String(st.score ?? "-").padStart(4)}  ` +
      `trucks ${trucksAlive}  squad ${squadAlive}`,
  );
  return { t, wave: st.wave, kills: Number(st.kills || 0), trucks: trucksAlive };
}

console.log("WARPATH — is the player necessary?\n");
const absent = run("NEVER TOUCHED", false);
const parked = run("TOUCHED, PARKED", true);

console.log("\n-- verdict --");
console.log(
  `NEVER TOUCHED (the AFK gate): wave ${absent.wave}, ${absent.kills} kills — the squad holds fire.`,
);
console.log(
  `TOUCHED THEN PARKED (Mike's case): wave ${parked.wave} of 9, ${parked.kills} kills, ` +
    `${parked.trucks} truck(s) alive after ${parked.t.toFixed(0)}s.`,
);
if (parked.wave >= 4 || parked.kills >= 20) {
  console.log("\nTHE SQUAD IS PLAYING THE GAME. A player who does nothing still");
  console.log("watches waves clear, which is exactly the complaint.");
} else {
  console.log("\nThe squad alone stalls early, so the player is doing the work.");
}
