/**
 * S7 SHARED GAME BOTS - the ONE copy of the three greedy per-game bots, used
 * by BOTH scripts/s7-harness.ts (merge-gate oracle runs + --record) and
 * scripts/s7-balance.ts (nightly gate (f)).
 *
 * Extracted 2026-08-25 from scripts/s7-harness.ts, where s7-balance.ts had
 * been forced to REPLICATE them verbatim (the harness executes its main() at
 * module scope, so it cannot be imported). Dependency law: harness -> bots
 * and balance -> bots; this file must NEVER import from either script.
 *
 * Each export is a FACTORY: call it once per run to get a fresh bot closure
 * (the gauntlet bot carries per-run tap-release state). W/H are the caller's
 * tape-pixel viewport; bots speak tape pixels and the caller's adapter
 * converts down to normalized sim input.
 *
 * The frozen baseline tapes replay WITHOUT these bots, so harness gate (a)
 * byte-identity is untouched by bot evolution; the live-bot gates ((c) in the
 * harness, (f) in the balance script) self-calibrate against the sim's rate
 * envelope on every run.
 */

import * as gl from "../src/app/s7/games/gauntlet/sim";
import * as glContent from "../src/app/s7/games/gauntlet/content";
import * as hd from "../src/app/s7/games/horde/sim";
import * as hdContent from "../src/app/s7/games/horde/content";
import * as cr from "../src/app/s7/games/crypt/sim";
import * as crContent from "../src/app/s7/games/crypt/content";

/** One frame of player intent in tape-pixel space (the S5/S6/S7 contract). */
export interface InputFrame {
  px: number | null;
  py: number | null;
  down: boolean;
  space: boolean;
}

export const NEUTRAL: InputFrame = { px: null, py: null, down: false, space: false };

/** GAUNTLET (Slay the Spire anchor): first affordable attack; when NO attack
 * is playable but a skill is, the cheapest playable skill (cost 0 first) -
 * skill awareness added 2026-08-25 so skill-heavy decks (bard) actually use
 * their kit; else end turn. Mid node; draft slot 0; space through events;
 * one-frame taps with a release frame between. The playability guard mirrors
 * the sim's own (cost <= energy, hp > hpCost so rage never suicides). */
export function gauntletBot(W: number, H: number): (s: gl.GauntletState, frame: number) => InputFrame {
  let rest = 0;
  const tap = (nx: number, ny: number): InputFrame => ({ px: nx * W, py: ny * H, down: true, space: false });
  return (s: gl.GauntletState) => {
    let out: InputFrame = NEUTRAL;
    if (rest > 0) {
      rest -= 1;
    } else if (s.busyF === 0) {
      if (s.phase === "node") {
        out = tap(0.5, 0.4);
        rest = 1;
      } else if (s.phase === "draft") {
        out = tap(1 / 6, 0.4);
        rest = 1;
      } else if (s.phase === "event") {
        out = { px: null, py: null, down: false, space: true };
        rest = 1;
      } else if (s.phase === "combat" && s.sub === "hero") {
        let idx = -1;
        for (let i = 0; i < s.hand.length; i++) {
          const c = glContent.CARD_INDEX[s.hand[i]];
          if (c && c.kind === "attack" && c.cost <= s.energy && (c.hpCost === 0 || s.hp > c.hpCost)) {
            idx = i;
            break;
          }
        }
        if (idx < 0) {
          // skill awareness: no attack is playable - play the cheapest
          // playable skill instead (cost 0 first; earliest hand slot on a
          // cost tie) before falling back to end-turn
          let bestCost = Infinity;
          for (let i = 0; i < s.hand.length; i++) {
            const c = glContent.CARD_INDEX[s.hand[i]];
            if (c && c.kind === "skill" && c.cost <= s.energy && (c.hpCost === 0 || s.hp > c.hpCost) && c.cost < bestCost) {
              bestCost = c.cost;
              idx = i;
            }
          }
        }
        out = idx >= 0 ? tap((idx + 0.5) / 5, 0.9) : tap(0.95, 0.4);
        rest = 1;
      }
    }
    return out;
  };
}

/** HORDE (Gauntlet Legends / Diablo II anchor): chase the nearest enemy and
 * play the sim's stop-and-fight contract - DOWN held means stand your ground
 * (the walk is suppressed) and the swing auto-faces, so the bot holds DOWN
 * inside true reach - holding at range would stall the approach forever
 * against a static ranged enemy (necromancers hold at 300px and never
 * close). While the belt holds it stands its ground and trades (the
 * attrition phase, where armor soak and weapon dice decide the run - gear
 * monotonicity lives here); once the belt is dry and hp is low it presses
 * DOWN only on fire frames and steps AWAY through the swing cooldown (the
 * kite loop the slow legion is authored to lose). Routes to a health potion
 * when hurt with an empty belt. Casts
 * (space) when mana covers the kit cost and the target sits inside the
 * skill's useful area OR mana is full - the mana-full dump (skill awareness,
 * 2026-08-25) is what lets caster kits spend at range instead of only at
 * melee contact. Kit costs come from the sim's exported content tables,
 * never re-derived. */
export function hordeBot(W: number, H: number): (s: hd.HordeState, frame: number) => InputFrame {
  const FW = hd.ROOM_W * hd.FINE;
  const FH = hd.ROOM_H * hd.FINE;
  const sq = (n: number) => n * n;
  return (s: hd.HordeState, f: number) => {
    const kit = hdContent.KITS[s.classId];
    let best: hd.EnemyState | null = null;
    let bd = -1;
    for (const en of s.enemies) {
      if (en.hp <= 0) continue;
      const dx = en.x - s.x;
      const dy = en.y - s.y;
      const d2 = dx * dx + dy * dy;
      if (bd < 0 || d2 < bd) {
        bd = d2;
        best = en;
      }
    }
    let tx = FW >> 1;
    let ty = FH >> 1;
    let routed = false;
    if (s.hp * 2 <= s.hpMax && s.hpPots === 0) {
      for (const it of s.items) {
        if (it.kind === "hpPot") {
          tx = it.x;
          ty = it.y;
          routed = true;
          break;
        }
      }
    }
    const reach2 = sq(kit.swingRange * hd.FINE);
    // hurt = the belt is dry and hp is low: switch from stand-and-trade to
    // the kite loop (swingCd <= 1 covers the in-step decrement so the fire
    // frame is never skipped)
    const hurt = s.hpPots === 0 && s.hp * 2 <= s.hpMax;
    const down = best !== null && bd <= reach2 && (!hurt || s.swingCd <= 1);
    if (!routed) {
      if (best && hurt && !down && bd <= reach2) {
        // kite: step away from the target through the swing cooldown - the
        // legion is slower than the hero, so range is held for free
        tx = s.x * 2 - best.x;
        ty = s.y * 2 - best.y;
      } else if (best) {
        tx = best.x;
        ty = best.y;
      } else if (s.exitOpen === 1) {
        const e = hdContent.CHUNKS[s.chunkIdx].exit;
        tx = (e.x + (e.w >> 1)) * hd.FINE;
        ty = (e.y + (e.h >> 1)) * hd.FINE;
      }
    }
    const tier = Math.min(hdContent.SPELL_TIER_MAX, s.spellTier);
    const space =
      best !== null &&
      s.mana >= kit.cost &&
      s.skillCd === 0 &&
      // skill awareness: cast inside the kit's useful area as before, and
      // ALSO dump when mana sits full - caster kits spend at range instead
      // of only at melee contact
      (bd <= sq((kit.area[tier] + 40) * hd.FINE) || s.mana >= s.manaMax) &&
      (f & 1) === 0;
    // bot speaks tape pixels; the caller's toSim converts back down
    const cx = tx < 0 ? 0 : tx > FW ? FW : tx;
    const cy = ty < 0 ? 0 : ty > FH ? FH : ty;
    return { px: (cx / FW) * W, py: (cy / FH) * H, down, space };
  };
}

/** CRYPT (Grimrock / Eye of the Beholder anchor, CRYPT DUELS rework
 * 2026-08-30): mirrors the sim's demoBrain duel policy exactly. Inside the
 * lock: dodge the published side late in a non-feint TELL (duelF <=
 * DEMO_EVADE_F, "any" resolves to L deterministically), and in VULN spend
 * the skill first (space) then strike on the atkCd gate - a deflected space
 * pays the FULL skill cooldown, so space is never thrown outside VULN.
 * Guard is skipped (dodging dominates); ENTER/GAP/RECOVER stay quiet, so
 * nothing ever deflects. Outside the lock (NONE / the NEXT breather):
 * BFS-hunt the nearest body, route to an unopened chest when hurt with a
 * dry belt (or when the floor is clear), else the stairs - the v1
 * exploration branch minus the retired windup-evade check (all combat lives
 * in the duel machine now). One-frame taps via frame-parity presses, as v1. */
export function cryptBot(W: number, H: number): (s: cr.CryptState, frame: number) => InputFrame {
  const px = (nx: number, ny: number, down: boolean, space: boolean): InputFrame => ({
    px: nx * W,
    py: ny * H,
    down,
    space,
  });
  return (s: cr.CryptState, f: number) => {
    const press = (f & 1) === 0;
    if (s.duelId !== "") {
      if (s.duelPhase === cr.DP_VULN) {
        if (s.skillCd === 0) return { px: null, py: null, down: false, space: press };
        if (s.atkCd === 0) return px(0.5, 0.25, press, false);
        return NEUTRAL;
      }
      if (
        s.duelPhase === cr.DP_TELL &&
        s.duelStyle !== "feint" &&
        s.dodgeCd === 0 &&
        s.duelF <= cr.DEMO_EVADE_F
      ) {
        return s.duelReq === "R" ? px(0.9, 0.5, press, false) : px(0.1, 0.5, press, false);
      }
      return NEUTRAL;
    }
    const ch = crContent.CHUNKS[s.chunkIdx];
    let tx = ch.stairs.x;
    let ty = ch.stairs.y;
    const chest = s.chests.find((c) => c.open === 0);
    if (s.enemies.length > 0) {
      let bd = -1;
      for (const e of s.enemies) {
        const dd = Math.abs(e.x - s.x) + Math.abs(e.y - s.y);
        if (bd < 0 || dd < bd) {
          bd = dd;
          tx = e.x;
          ty = e.y;
        }
      }
      if (s.hp * 2 <= s.hpMax && s.belt === 0 && chest) {
        tx = chest.x;
        ty = chest.y;
      }
    } else if (chest) {
      tx = chest.x;
      ty = chest.y;
    }
    const dir = cr.bfsNextDir(ch, s.x, s.y, tx, ty, (x, y) => cr.cryptEnemyAt(s, x, y) !== null && !(x === tx && y === ty));
    if (dir < 0) return NEUTRAL;
    if (dir === s.facing) return px(0.5, 0.25, press, false);
    const delta = (dir - s.facing + 4) & 3;
    return delta === 3 ? px(0.1, 0.5, press, false) : px(0.9, 0.5, press, false);
  };
}

/** THE SPIRE - full-charge vertical climber (moved verbatim from
 * scripts/s7-ascent-check.ts when the game joined the launch slate,
 * 2026-08-28): hold dead-centre while grounded (the meter auto-fires at
 * full, the Jump King idiom), hands off in the air (Foddy purity - the sim
 * ignores airborne input anyway). Climbs the authored on-ramp to 560. */
export function ascentBot(W: number, H: number): (s: { grounded: number }) => InputFrame {
  return (s) => (s.grounded === 1 ? { px: W / 2, py: H / 2, down: true, space: false } : NEUTRAL);
}
