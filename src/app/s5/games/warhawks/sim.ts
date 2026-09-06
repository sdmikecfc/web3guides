/**
 * WARHAWKS — pure simulation (no React, no DOM, no "@/" imports). The page
 * composes { ...SIM, draw }; this module also runs headless in node (npx tsx)
 * to prove determinism: same seed + same input script + same stats = identical
 * final score, byte for byte.
 *
 * THE LOOP: a VERTICAL auto-scroll WW2 SORTIE (the S3 Asteroid Raid camera,
 * flown SLOWER). The camera is fixed and looks STRAIGHT DOWN: the whole screen
 * is enemy ground and it scrolls DOWNWARD past you while you hold station near
 * the bottom. You do not climb or dive — you STEER LATERALLY across a flight
 * corridor walled by lethal ridge lines. The run is a 3-LEG mission chain (the
 * tankbuster district grammar): surviving a leg pays an escalating clear bonus.
 * Clearing leg 3 does NOT end the sortie — it opens the STRIP (see LANDING
 * STRIP below), a real final stretch guarded by a FLAGSHIP BASE, and only
 * crossing the true touchdown line at the far end of the strip is the LANDING.
 * Skill EXTENDS the run — dying ends it — and the score is count-bound target
 * tables, never rate.
 *
 * DENSITY + GROWTH PASS (2026-07-26): the engineering-clean build that shipped
 * 07-25 played slow and sparse (1.8 gun shots/s, one bomb every 2.2s, 26
 * fighters over the whole 163s run, and the three legs differing only in
 * enemy COUNT). This pass makes the fixed ~176s run itself busier, not
 * shorter or faster-scrolling — SCROLL and every LEG_LEN stay exactly what
 * they were, that clock is the operator's own spec, not a lever. What moved:
 * the gun and bomb cooldowns (see ONE-THUMB GRAMMAR), three DISTINCT leg
 * identities instead of one table scaled three ways (see the mission tables'
 * own header), two announced mid-run capability jumps building on the intro
 * LOADOUT pick (GUNS HOT, TWIN RACK), a new FLANK fighter kind and a tougher
 * named ACE, and denser/overlapping climber pressure so idling is rarely
 * safe. Every one of it is CEILING-NEUTRAL except the new enemy counts
 * themselves, which ceiling() prices exactly like every other target.
 *
 * THE BOMB IS THE GAME. Forward guns are AIR-ONLY (fighters) and
 * pay 20. Bombs are GROUND-ONLY and pay 70 / 90 / 260 / 450 — an AA nest is 3.5
 * fighters, a tank 4.5, a BASE (3 bombs) is 13 fighters, and the FLAGSHIP (5
 * bombs, the strip's climax) is 22.5 fighters, the single biggest score event
 * in the game. Of the 5,670 target points on the front, 4,990 (88.0%, the same
 * shape as before this pass) can only come off the bomb rack. Strafing is how
 * you SURVIVE; bombing is how you SCORE.
 *
 * LANDING STRIP: leg 3 clears into a STRIP_LEN stretch of its own (still a
 * live, walled corridor — ridges are still lethal, hits still count) with one
 * fixed FLAGSHIP BASE partway down it: a bigger, tougher base (hp 5) that gets
 * the franchise's full boss treatment the first time it comes into range —
 * freeze, camera punch, screen shake, a named plate with an instruction
 * subtitle, a stinger. Bomb it down for the run's biggest single payout, or
 * fly past it. The strip also carries its own light ESCORT now (one climber,
 * one flanker: see the mission tables), so the final stretch is not a quiet
 * glide up to the boss alone. Either way the final stretch before the true
 * touchdown line is GEAR DOWN: bombing locks out (announced) and the verb
 * narrows to pure evasion — the second announced verb change of the run, the
 * first being intro -> full combat at "LEG 1".
 *
 * ONE-THUMB GRAMMAR (the S5 standard, warhawks verbs):
 * - HOLD anywhere = fly toward the held X (lateral is the whole stick; the
 *   plane banks into the turn). The held point is CLAMPED inside the corridor,
 *   so you can never command yourself into a ridge.
 * - Release and the torque roll takes over: an uncommanded single-engine
 *   fighter rolls LEFT and keeps going. That drift is real flight for everyone
 *   and it is also the whole AFK gate (see PACING below).
 * - QUICK TAP = forward machine guns: an auto-burst at what is AHEAD (up the
 *   screen). The burst picks its target DETERMINISTICALLY (nearest live AIR
 *   target inside the forward cone, intercept-led); no aim point is read from
 *   the tap. Tracers cannot touch the ground. GUN_CD is ~5.5 taps/s (was
 *   1.8/s before this pass), trimmed further to GUN_CD_HOT once GUNS HOT
 *   announces at leg 2 — see MID-RUN GROWTH below. FIGHTER_A_HP/FIGHTER_B_HP
 *   moved WITH it so a fixed target still takes real tracers, not one.
 * - DOUBLE TAP (or SPACE) = release a BOMB. It falls for BOMB_FALL seconds
 *   carrying your forward momentum, so it lands BOMB_LEAD px UP the screen from
 *   where the actual release fires. BOMB_CD (~1.6s, was 2.2s) is the cadence
 *   of the DECISION, not of the rack: once TWIN RACK announces at leg 3, the
 *   SAME press pairs a second bomb RACK_DX to the side (see MID-RUN GROWTH),
 *   so the decision never gets faster, only more valuable. THE PIPPER THE
 *   PAGE DRAWS LEADS FURTHER THAN THAT: a real double-tap is not instant — it
 *   is a full tap-release-tap-release gesture, modeled as BOMB_COMMIT_T =
 *   TAP_MAX_T + DOUBLE_GAP (~0.56s) of worst-case gesture time between "I
 *   have decided to drop" and the sim actually seeing the second release. A
 *   pipper drawn at the true ballistic BOMB_LEAD would have the target slide
 *   out from under it during that gesture (a systematic undershoot);
 *   PIPPER_LEAD = SCROLL*(BOMB_FALL+BOMB_COMMIT_T) is what the page actually
 *   draws, so a pilot who commits the instant the target crosses the pipper
 *   lands on it. BOMB_LEAD itself stays the true physics constant (what
 *   governs where a bomb someone drops via instant SPACE actually lands, and
 *   what the harness oracle — which always drops on a one-frame SPACE pulse,
 *   never a modeled double-tap — reasons from).
 *
 * MID-RUN GROWTH (builds on the paused intro LOADOUT pick): two automatic,
 * announced capability jumps tied to leg progress, universal regardless of
 * which loadout was picked. GUNS HOT (entering leg 2) trims the gun cooldown
 * to GUN_CD_HOT. TWIN RACK (entering leg 3) pairs every bomb into a two-bomb
 * salvo, RACK_DX apart. Both read s.leg directly at the point of use
 * (dropBomb, the gun trigger in stepWarhawks); WarState.sawGunsHot /
 * sawTwinRack are only the "already announced" latch, queued behind whatever
 * banner is already showing so they never stomp a leg-clear text. Both are
 * ceiling-neutral (see ceiling()'s own docstring): cadence and reach, never a
 * count or a value, so what you can do at the flagship is provably more than
 * what you could do at "LEG 1", without moving a single point on the board.
 *
 * THREATS: AA nests on the ground fire TELEGRAPHED flak (a reticle locks where
 * you are HEADING — your position plus half your lateral speed over the
 * telegraph — holds TELE seconds, then the burst blooms there: reverse, do not
 * keep sliding); enemy fighters arrive in seeded FORMATIONS — DIVERS descend
 * from the top in line / vee / echelon, CLIMBERS come up from behind, sit on
 * your tail where your guns cannot reach, then overtake and level off ahead
 * (that is the kill window, the classic loop), and FLANKERS cut straight
 * across the corridor at a fixed close row from one ridge to the other,
 * firing one aimed burst as they cross your own lane — never a body
 * collision (the row never closes on you), but a gun-cone/dodge choice that
 * can catch you mid bomb-run. BARRAGE BALLOONS were cut: a zero-point
 * obstacle whose cable killed on contact is a tax, not a mechanic. The lane
 * EDGES are a clamp, not a death — Mike: "dying immediately by going to the
 * edge is bad". 3 hits = down (4
 * with Armor >= 2), flak = 1 hit, an enemy bullet = 1 hit, a fighter
 * collision = down (RAM can survive exactly one). LEG 2 also carries one
 * seeded ACE per run: a climber at double HP (see ACE_HP_MUL) that announces
 * itself the moment it settles onto your six — same points, same speed, just
 * a real time-to-kill instead of one burst.
 *
 * TARGETS (fixed count-bound tables per leg; ceiling() below computes the exact
 * legit maximum from these same constants): fighters 34 x20 (29 across the 3
 * legs' own tables, +3 FLANKERS_PER_LEG debuting leg 2, +2 escorting the
 * strip), AA nests 17 x70, tanks 17 x90, BASES 7 x260 (multi-bomb, hp 3), one
 * FLAGSHIP x450 (multi-bomb, hp 5, strip-only). Leg-clear bonuses
 * 150/220/300, landing bonus 400. Balloons are OBSTACLES, worth 0 — popping
 * one with guns is a safety play, never points, so it cannot move the
 * ceiling. The three legs are NOT the same table scaled up: leg 1 leads on AA
 * (FLAK ALLEY), leg 2 on fighters incl. the FLANK debut and the ACE (THE
 * FURBALL), leg 3 on tanks/bases (THE GAUNTLET) — see the mission tables'
 * own header below for the exact shape and the named-beat placement bands.
 *
 * DETERMINISM: two RNG streams from the one seed. `rng` = gameplay, consumed
 * ENTIRELY inside createWarhawks in a fixed order (the whole mission plan:
 * every formation, lane, altitude band, cadence). stepWarhawks consumes ZERO
 * gameplay rng — flak aims at the plane's actual state, fighters fly their
 * seeded patterns — so replay identity is structural. `rngFx` = cosmetics only
 * (particles), so the reduced-motion cap can never shift a gameplay roll.
 * Math.random appears NOWHERE in this file.
 *
 * WORLD SPACE: the sim runs in world coordinates. `x` is LATERAL and is NOT
 * scrolled (world x == screen x, 0..viewW), `wy` is FORWARD PROGRESS and grows
 * as you fly, so an entity AHEAD of you has the LARGER wy. Screen y flips that
 * axis: sy(s, wy) = camY(s) - wy with camY(s) = s.wy + s.planeSy, both pure
 * reads of state. Because nothing scrolls laterally, RunShell needs NO
 * pointerTransform at all — the sim's input space IS canvas pixel space, which
 * is exactly the space input tapes are recorded in. Tap detection measures
 * pointer movement on X ONLY, deliberately: the world scrolls under a
 * stationary finger, so world-Y drift can never break a quick tap.
 *
 * PACING vs floorMs 60000, proven headless by scripts/s5-harness.ts:
 * - AFK (the STRICT gate): with no input ever, the uncommanded torque roll
 *   walks the plane into the LEFT ridge at ~8.7s and the run is over at ~10.6s
 *   (the 1.8s death animation) for a score of 0 — far under the 60s floor, so
 *   an idle run can never bank. No special AFK branch exists: the roll is the
 *   same physics a played run fights on every release, and none of this
 *   pass's tuning touches DRIFT/LANE_PAD/ROLL, so the AFK timing is unchanged.
 * - A full sortie (3 legs plus the strip) is ~176.4s of flying plus intro and
 *   landing; leg 1 alone is 50s, so a death that banks means the pilot pushed
 *   into leg 2 (the tankbuster pacing shape). A death before the floor shows
 *   its score but cannot bank.
 * - HEADROOM: the headless oracle now lands around a quarter of the (larger)
 *   ceiling before typically going down partway through leg 3 — TUNED DOWN
 *   once already from a first density pass that folded the bot in leg 2 to
 *   chase fire alone (see CLIMBERS_PER_LEG's own doc below): that is the one
 *   damage source neither a bot nor a player can fully out-position, so it is
 *   the number this pass moved most conservatively, checked against a live
 *   bot run each time rather than arithmetic on paper. maxScore is an
 *   anti-forge cap, not a target, and there is real room above a great human
 *   run.
 *
 * SCORING (the registry math, lib/s5/games maxScore): see ceiling() at the
 * bottom — fighters 20x34 + AA 70x17 + tanks 90x17 + bases 260x7 + flagship
 * 450x1 + leg bonuses 670 + landing 400 = 6740. Registry maxScore 7414 =
 * ceiling + 10%.
 *
 * UPGRADE STATS (ADR-0070 keys; see warMods below): a construction-time INPUT,
 * never a source of randomness. Engine = roll authority, Armor = the 4th hit at
 * level 2 plus i-frames, Smoke = longer post-hit i-frames, Caliber = burst width
 * at thresholds + tracer damage, Optics = longer flak telegraphs + fighter
 * formation warnings. Every one is CEILING-NEUTRAL: none touches a target
 * COUNT, a point value, SCROLL, the leg lengths or a bonus, so ceiling()
 * returns the same 6740 for a stock plane and a maxed one. The paused intro
 * LOADOUT pick (see the "intro" phase branch in stepWarhawks) is the same
 * shape: a hits/roll-speed trade, never a count or a value — and so are this
 * pass's own two mid-run jumps, GUNS HOT and TWIN RACK (see MID-RUN GROWTH
 * above).
 *
 * STAT SYNERGY COMBOS (the franchise's three, warhawks forms):
 * RAM            Armor >= 3 AND Engine >= 3: survive ONE fighter collision
 *                per run, destroying the fighter (it pays its normal kill
 *                points — fixed count, dies once, ceiling-neutral).
 * CONTRAIL VEIL  Engine >= 3 AND Smoke >= 3: sustained LATERAL weaving charges
 *                a brief untargetable window (flak will not aim at you, bullets
 *                pass through). Straight-and-level drains the charge.
 * RANGING SHOT   Optics >= 3 AND Caliber >= 15: the FIRST bomb of each leg
 *                MARKS the nearest ground target ahead — a wider blast window
 *                on the marked target and (for a base) one hp pip free, never
 *                below 1. Marks make the same fixed-value targets fall EARLIER,
 *                never add one.
 * Each announces itself with ONE banner the first time it fires in a run.
 * That banner is the whole tutorial.
 */

export interface SimInput {
  px: number | null; // pointer x = LATERAL steering (world x == screen x)
  py: number | null; // pointer y (read for nothing but the record; see header)
  down: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  downKey: boolean;
  space: boolean;
}

export function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── tuning (design px scale by k = viewW/480 at init) ───────────────────────
/** Long enough to read the mission brief AND make the paused loadout pick
 * (see LOADOUT below) before the sortie commits. */
export const INTRO_T = 2.0;
export const KO_T = 1.8;

/** The fixed world scroll rate, px/s x k. SLOWER on purpose (Mike, 2026-07-25:
 * "similar to asteroid raid game before but SLOWER"): the retired horizontal
 * sortie ran 96 px/s across a 480px-wide view = 0.20 screens/s; 68 px/s down a
 * 640px-tall view is 0.106 screens/s, so the world takes 9.4s to cross the
 * canvas instead of 5.0s. Calm but tense, and it is the whole mission clock —
 * no stat and no play pattern may touch it. */
export const SCROLL = 68;
/** The plane holds station this far down the view (fraction of h). */
export const PLANE_SY_FRAC = 0.74;
/** THE VERTICAL BAND, as fractions of screen height. The plane may sit
 *  anywhere between these and the clamp is SOFT: you stop, nothing else.
 *  Straight from the reference, which has no lethal boundary anywhere. */
export const PY_MIN_FRAC = 0.16;
export const PY_MAX_FRAC = 0.9;
/** Vertical authority, px/s over and under the scroll. Kept under ROLL so
 *  lateral remains the faster axis and the plane still reads as flying. */
export const PITCH_V = 96;
export const PLANE_R = 11;
/** Max lateral speed, px/s x k (Engine raises it). */
export const ROLL = 210;
export const VX_EASE = 7; // 1/s approach toward the wanted lateral speed
/** The uncommanded torque roll to the LEFT, px/s x k (the AFK gate). */
export const DRIFT = 30;
/** Ridge band on each side of the corridor, px x k. Lethal. */
export const LANE_PAD = 30;
/** How far inside the ridge a COMMANDED heading is clamped, px x k. */
const LANE_MARGIN = 10;

const TAP_MAX_T = 0.22;
const TAP_MAX_MOVE = 14; // px x k, X ONLY (world-y drifts under a held finger)
const TAP_STEER_MIN = TAP_MAX_T * 0.6;
export const DOUBLE_GAP = 0.34; // s from tap release to the second down

/** Base gun cooldown: ~5.5 taps/s, an actual arcade cadence (the retired 0.55
 * read as 1.8/s, sluggish next to the genre's usual 8-15). GUNS HOT (leg 2 on,
 * see stepWarhawks's gun trigger) trims it further to GUN_CD_HOT. Neither
 * number touches a target count or value, so both are ceiling-neutral: they
 * change how fast a fixed 20pt fighter can be reached, never how much it
 * pays. FIGHTER_A_HP/FIGHTER_B_HP are tuned against GUN_CD, not GUN_CD_HOT,
 * so time-to-kill stays real at the baseline and gets genuinely faster (not
 * instant) once the upgrade lands. */
export const GUN_CD = 0.18;
/** The leg-2 MID-RUN GROWTH beat, "GUNS HOT" (see WarState.sawGunsHot). */
export const GUN_CD_HOT = 0.13;
const BURST_DT = 0.055; // s between tracers inside one burst
export const TRACER_V = 520;
export const GUN_RANGE = 330;
export const GUN_CONE = 0.5; // rad off straight-ahead the pick may reach
const TRACER_R = 2.5;

/** Base bomb cooldown: faster than the retired 2.2s (a bomb every 2.2s was
 * the single biggest drag on the run) while staying a real decision, not a
 * spray — guns are the reflex weapon, bombs stay the aimed one. TWIN RACK
 * (leg 3 on, see dropBomb) does not touch this cooldown at all: it pairs a
 * second bomb onto the SAME press, so the decision cadence never changes,
 * only how much one decision buys. Ceiling-neutral either way: the target
 * table is a fixed set of counts, and a second bomb on an already-dead
 * target or a target already at 0 hp scores nothing extra (see
 * explodeBomb). */
export const BOMB_CD = 1.6;
/** TWIN RACK's lateral spread, px x k: the two bombs fall RACK_DX apart
 * (straddling a target's own hit-radius comfortably) rather than stacked, so
 * a rack drop reads as two falling shapes, not one double-size one. */
export const RACK_DX = 22;
/** Seconds from release to impact. */
export const BOMB_FALL = 1.15;
/** Where the bomb lands, px x k UP the screen from the release point: it keeps
 * the plane's forward momentum for the whole fall. This is the TRUE ballistic
 * lead — what actually governs impact position in explodeBomb's physics, and
 * what the harness oracle reasons from (it drops on a one-frame SPACE pulse,
 * so it never pays the double-tap's own gesture time). Do not draw this as the
 * pipper; see PIPPER_LEAD. */
export const BOMB_LEAD = SCROLL * BOMB_FALL;
/** Worst-case double-tap GESTURE time: tap1's own hold (up to TAP_MAX_T) plus
 * the release-to-release window (DOUBLE_GAP, which already folds in tap2's own
 * hold). A real double-tap is not instant, and BOMB_LEAD alone does not model
 * that gap — a pipper drawn at the bare ballistic lead has the target slide
 * out from under it while the gesture completes, a systematic undershoot. */
// 2026-07-28: a bomb is now a SINGLE tap, so there is no commit gesture to
// model and the pipper can sit on the true ballistic impact point.
export const BOMB_COMMIT_T = 0;
/** What the PAGE draws as the bombsight pipper: the ballistic lead plus the
 * modeled gesture time, so a pilot who commits the instant a target crosses
 * the pipper (not the instant the drop physically registers) still lands on
 * it. Physics (dropBomb/explodeBomb) never reads this — only BOMB_LEAD does —
 * so this constant is page-facing only, exported for the renderer. */
export const PIPPER_LEAD = SCROLL * (BOMB_FALL + BOMB_COMMIT_T);
export const BLAST = 46; // px x k bomb blast radius

/**
 * FOUR CHIPS, not three (Mike 2026-08-01: "you die too easy, maybe a bit more
 * health"). The midair softening above fixed the instant-death case, but the
 * harness oracle still went down to plain gunfire inside leg 1, which is the
 * complaint stated in numbers: three chips against a bullet-hell that ramps
 * for three legs left no room to learn a pattern. Armour and the ESCORT
 * loadout still stack on top (max 6), and the fuel clock -- not the hull -- is
 * still the AFK gate, so this moves survivability without touching the run's
 * length, its target roster or its ceiling.
 */
export const HITS_MAX = 4;

/* ── THE FUEL CLOCK (Asteroid Raid's pressure, and the new AFK gate) ───────
 * Drains constantly and is refilled ONLY by what your kills drop. An idle
 * plane runs dry and goes down; a live plane is pushed toward the fight rather
 * than away from it, which is the opposite of what a lethal corridor edge
 * does. The drain is set so an untouched run ends comfortably inside the 60s
 * bank floor, and so a player who is actually killing things never notices it.
 */
export const FUEL_MAX = 100;
export const FUEL_DRAIN = 3.1; // per second -> ~32s from full with no pickups
export const FUEL_PER_PICKUP = 26;

/** Gun levels raise rate of fire and spread. CEILING-NEUTRAL: the roster of
 *  targets and their point values are fixed, so a better gun only makes the
 *  same maximum easier to approach. */
export const GUN_LVL_MAX = 4;
/** How long a RAPID pickup keeps the guns hot. Cadence-only, so ceiling-safe. */
export const RAPID_T = 8;
/** What the guns do while rapid is up: a flat multiplier on the cooldown. */
export const RAPID_CD_MUL = 0.65;
/** Fire interval by gun level. Level 0 is the stock gun, unchanged. */
export const GUN_CD_BY_LVL = [0.2, 0.17, 0.15, 0.13, 0.11] as const;

/** How far off the plane a pickup is swept up. Generous on purpose: chasing a
 *  drop must never be more precise than shooting the thing that dropped it. */
export const DROP_R = 22;
/** Seconds a drop stays on the board before it is lost. */
export const DROP_LIFE = 7;

/** A dropped pickup. `kind` is what it gives; ALL of them pay ZERO points. */
export interface Drop {
  x: number;
  wy: number;
  kind: "fuel" | "gun" | "repair" | "rapid";
  life: number;
}
const IFRAMES = 1.4;

export const FLAK_TELE = 1.0; // s the reticle holds before the burst (Optics +)
/** Fraction of the plane's lateral speed the gunners lead by: hold your slide
 * and you fly into it, so the dodge is a REVERSAL, not just movement. */
export const FLAK_VX_LEAD = 0.4;
export const FLAK_R = 34; // px x k burst radius
export const FLAK_LIFE = 0.55;
/** The nest's firing window, px x k ahead / behind. Deliberately TIGHT: at
 * SCROLL 68 a 410px window is 6.0s of engagement, so a nest gets about two
 * telegraphed shots at you rather than four. Fifteen nests firing four times
 * each buried a 163s sortie in flak (measured: the oracle landed 3/16); two
 * each is a front that breathes. Ceiling-neutral — the nest is still worth its
 * 70 bomb points whether it fires once or ten times. */
const AA_AHEAD = 340;
const AA_BEHIND = 70;

const DIVE_V = 95; // px/s x k world-backward: closing rate is SCROLL + this
const DIVE_FIRE_D = 300; // px x k ahead the diver opens fire
const DIVE_TRACK = 26; // px/s x k the diver slides toward your lane
const CLIMB_APPROACH = 55; // px/s x k over SCROLL while closing from behind
export const CHASE_GAP = 130; // px x k the climber sits BEHIND (below) you
/** Seconds on your tail before it overtakes. This is UNANSWERABLE time (it sits
 * below you, where the forward guns cannot reach), so it is kept short: long
 * enough to feel hunted, not long enough to be a free two-hit tax. */
const CHASE_T = 4.8;
const CLIMB_OVERTAKE = 130; // px/s x k over SCROLL while climbing past
const AHEAD_LEAD = 175; // px x k ahead where it levels off
const AHEAD_V = 16; // px/s x k over SCROLL once ahead (the kill window)
const AHEAD_T = 5.0; // s shootable ahead before it breaks away
const TAIL_TRACK = 60; // px/s x k the climber matches your lane
export const FIGHTER_R = 12;
/** GRAZE: slipping a live bullet this close without being hit pays. It is the
 * bullet-hell verb that rewards holding your line instead of fleeing the
 * screen edge, and it is what makes a dense sky feel generous rather than
 * punishing. Capped so the ceiling stays a fixed sum: 50 x 2 = 100 points. */
export const GRAZE_R = 26;
export const GRAZE_PTS = 2;
export const GRAZE_CAP = 50;

/** CHAIN: one bomb blast that guts two or more scoring ground targets. Flat,
 * not a multiplier (see the header note), and capped: 10 x 30 = 300 points. */
export const CHAIN_PTS = 30;
export const CHAIN_CAP = 10;

const EB_V = 240; // px/s x k enemy bullet (kept for the legacy tracer maths)
const EB_R = 3.5;
/** Formation geometry, px x k: lateral spacing and fore/aft step. */
const FORM_DX = 46;
const FORM_DY = 34;

/** FLANK (debuts leg 2): enters just off a ridge at a fixed, CLOSE row ahead
 * (FLANK_LEAD) and holds that row — vwy tracks SCROLL exactly, so it never
 * closes or opens on you, it just cuts straight across the corridor at
 * FLANK_VX — until it clears the far edge. That fixed separation is
 * deliberately bigger than any collision radius (see the plane-collision
 * test in stepWarhawks): a flanker is never a body-check, it is a lane you
 * have to either clear with guns or fly around while it is briefly in it,
 * exactly the kind of threat that can make you choose against the bomb
 * line. It fires one aimed burst as it crosses your own x. */
const FLANK_LEAD = 92; // px x k ahead the row sits at (close: no time to ignore)
const FLANK_VX = 128; // px/s x k lateral sweep speed
const FLANK_FIRE_W = 60; // px x k: fires once its x is within this of the plane's
const FLANK_EDGE_PAD = 34; // px x k it sits outside the ridge at entry/exit

const CABLE_W = 3.5;
export const FIGHTER_A_HP = 3;
export const FIGHTER_B_HP = 6;
/** LEG 2's named ACE (see Fighter.ace): a flat HP multiplier on the normal
 * climber. Same points, same speed — just a real time-to-kill, which is the
 * whole beat: something that does not fold to a single burst. */
export const ACE_HP_MUL = 2.25;
// Mike, 2026-07-28: "impossible to hit certain targets 3 times". A base is
// still a multi-bomb target, it just no longer needs a perfect third pass.
export const BASE_HP = 2;

// ── the mission tables (count-bound: ceiling() reads exactly these) ─────────
/** px x k of forward progress per leg. 11,100 total / SCROLL 68 = 163s of
 * flying, the calm-but-tense 150-180s target. Leg 1 alone is ~50s. SCROLL and
 * these three numbers are the one thing this pass never touches: the run's
 * length and pace are the operator's own spec, not a lever. Everything below
 * is about what happens WITHIN that fixed clock, not how long it runs.
 *
 * THREE LEGS, THREE FRONTS (not "leg 2 but more"): each leg now leads with
 * one threat family and runs the other two light, so the tables below are
 * deliberately NOT monotonic leg to leg.
 *   LEG 1  FLAK ALLEY   — AA-heavy (8 nests, pinched into one band: see
 *                          AA_BAND), the corridor's first real threat, teaches
 *                          the telegraph-and-reverse dodge with everything
 *                          else kept light.
 *   LEG 2  THE FURBALL  — fighter-heavy (11 fighters + 1 FLANK debut + the
 *                          ACE, the leg's named single-target beat), ground
 *                          threats thin out so the sky is the whole fight.
 *   LEG 3  THE GAUNTLET — armor-heavy (10 tanks + 5 bases pinched into a
 *                          STRONGPOINT: see TANK_BAND/BASE_BAND), continuous
 *                          climber pressure carried over from leg 2, running
 *                          straight into the strip's own flagship beat.
 *
 * TUNED AGAINST THE ORACLE, NOT JUST ARITHMETIC: an early cut here (5
 * climbers in leg 2 on TIMER_FAC 0.82) folded the headless oracle at 19.7% of
 * ceiling, down leg 2 to gunfire around the 60% mark — chase fire (see
 * CLIMBERS_PER_LEG below) is the one damage source neither the player nor
 * the bot can fully out-position, so it is the one number this pass tunes
 * the most conservatively, against a LIVE bot run each time, not a target
 * count on paper. Ground density did not move: leg 1/leg 3 both still read
 * clean in the same runs, so nothing else needed pulling back.
 */
export const LEG_LEN = [3400, 3700, 4000] as const;
/** Total fighters per leg (FLANKERS_PER_LEG below is counted separately, on
 * top of this). Leg 2 leads (THE FURBALL); legs 1 and 3 stay lighter so their
 * own families (flak, armor) read as the dominant threat instead. */
// [12,22,28] -> [15,26,32] (Mike 2026-08-02: "Needs more air units attacking
// you from the front"): all +11 land as DIVERS since CLIMBERS_PER_LEG below
// is unchanged — the added pressure is head-on by construction.
export const FIGHTERS_PER_LEG = [15, 26, 32] as const;
/** Of FIGHTERS_PER_LEG, how many arrive as CLIMBERS from behind (singles).
 * The rest are DIVERS and enter in formations. Climbers ramp across the run
 * (2 -> 4 -> 5): each one is CHASE_GAP time on your tail where guns cannot
 * reach, so this table is the run's CONTINUOUS PRESSURE dial — by leg 3 a
 * new one is often entering chase before the last has finished overtaking,
 * so idling in a "safe" gap gets rarer as the run goes on. Kept off the
 * oracle's floor (see the header note above): CHASE fire is undodgeable by
 * position alone, so this is reach for a skilled human, not a wall. */
// TUNED AGAINST THE ORACLE, not on paper (the standing rule for this table).
// The first bullet-hell cut ran [4,6,7] and folded the headless oracle in leg 2
// at 17% of ceiling: chase fire is the one damage source neither a player nor
// the bot can out-position, so when the sky also fills with fans and rings, the
// climber count is what tips a dense run into an unfair one. Density lives in
// the DIVERS (16/24/28) and the new turrets instead.
export const CLIMBERS_PER_LEG = [3, 5, 6] as const;
/** FLANK debuts in leg 2 (the furball's own new threat family) and carries
 * into leg 3 as residual pressure while the ground fight takes over. Leg 1
 * stays flank-free on purpose: one new grammar element at a time. */
export const FLANKERS_PER_LEG = [0, 2, 3] as const;
/** LEG 1 leads (FLAK ALLEY, see AA_BAND for the pinch). */
export const AA_PER_LEG = [8, 5, 7] as const;
/** LEG 3 leads (THE GAUNTLET, see TANK_BAND for the pinch). */
export const TANKS_PER_LEG = [4, 4, 8] as const;
/** LEG 3's STRONGPOINT (see BASE_BAND) carries most of the run's bases. */
export const BASES_PER_LEG = [1, 2, 4] as const;
/** Balloons come DOWN in the bullet-hell pass, against every other count
 * going up. A cable is an instant kill with no counterplay once you are on
 * it, and a sky that is denser in INSTANT deaths is not a bullet-hell, it is
 * a coin flip. Density has to arrive as bullets you can read and slip. */
/** GROUND TURRETS: the bullet-hell pass's one new enemy family. They live in
 * the `grounds` array, so bomb collision, the share grid and the oracle's
 * target scan all inherit them for free; only their firing loop is new. They
 * shoot a slow aimed 2-fan straight up at you, which is trivial to dodge on
 * its own and vicious while you are already committed to a bomb run. */
export const TURRETS_PER_LEG = [1, 3, 4] as const;
export const TURRET_CD = 2.6; // seconds between fans, x TIMER_FAC
export const TURRET_AHEAD = 380; // px x k: only fires while you are approaching
export const TURRET_BEHIND = 40;
/** Later legs run hotter: every enemy cadence shrinks by this factor. Leg 2
 * stays close to the old pace (chase fire is already this leg's whole
 * pressure dial, see CLIMBERS_PER_LEG); leg 3 is where the run truly
 * quickens. */
export const TIMER_FAC = [1, 0.88, 0.74] as const;
/** Each leg's named beat spawns inside a PINCHED band (fraction of that leg's
 * own length) instead of spreading edge to edge: the pinch itself is the
 * beat (a run of nests / a wall of armor), not a banner alone. [0,1] on a
 * leg means "no pinch, spread the whole leg" — used by whichever two legs
 * are NOT that table's dominant family. Purely a placement detail: it moves
 * WHERE inside the leg a fixed count lands, never how many exist, so
 * ceiling() cannot see it. */
export const AA_BAND: readonly [number, number][] = [[0.26, 0.7], [0, 1], [0, 1]];
export const TANK_BAND: readonly [number, number][] = [[0, 1], [0, 1], [0.4, 0.86]];
export const BASE_BAND: readonly [number, number][] = [[0, 1], [0, 1], [0.46, 0.92]];
/** The strip's own escort (on top of the flagship): one climber to keep the
 * chase pressure alive into the final stretch, one flanker crossing the
 * approach to the boss fight itself. Counted in ceiling()'s fighters term;
 * grid-attributed to leg index 2 (the strip has no row of its own). */
export const STRIP_CLIMBERS = 1;
export const STRIP_FLANKERS = 1;

/** px x k of forward progress in the STRIP beyond leg 3's own end: a real
 * final stretch, not a canned glide-and-win. Still a live walled corridor —
 * ridges stay lethal — with the FLAGSHIP BASE anchored partway down it and
 * bombing locked out (GEAR_DOWN_ZONE, announced) for the final approach. */
export const STRIP_LEN = 900;
/** Where the flagship sits within the strip (fraction of STRIP_LEN), and how
 * far out its entrance triggers the one-time boss reveal. */
export const FLAGSHIP_AT = 0.4;
export const FLAGSHIP_REVEAL_RANGE = 460;
/** px x k of pure-evasion approach before the true touchdown line: bombs lock
 * out here (see gearDown()), the run's second announced verb change. */
export const GEAR_DOWN_ZONE = 260;

/** GUN target (air). Deliberately the smallest number on the board. */
export const FIGHTER_PTS = 20;
/** BOMB targets (ground). Guns cannot reach any of these. */
export const AA_PTS = 70;
export const TANK_PTS = 90;
/** A turret shoots back, so it pays more than a tank that does not. */
export const TURRET_PTS = 110;
export const BASE_PTS = 260;
/** The strip's climax: bigger and tougher than a base (hp 5 vs 3), one per
 * run, worth more than any other single event on the board. */
// The strip climax stays the biggest ask in the run, at a reachable size.
export const FLAGSHIP_HP = 3;
export const FLAGSHIP_PTS = 450;
export const FLAGSHIP_W = 44; // half-extent, px x k (bigger than a base's 34)
/** A leg is meaningfully harder to clear now (see the mission tables above),
 * so the reward for doing it moved with it. */
export const LEG_BONUS = [150, 220, 300] as const;
export const LANDING_BONUS = 400;
const GRID_CELLS = 5;

const PART_CAP = 170;
const TRAIL_CAP = 90;

// ── upgrade stats -> bounded sim modifiers + STAT SYNERGY COMBOS ────────────
/**
 * The five persistent stats, structurally identical to lib/s5/games
 * PlayerStats but re-declared here so this sim stays import-free and
 * node-runnable.
 *
 * TRUST BOUNDARY: /api/s5/run-start reads the hq JSONB SERVER-side and
 * returns clampStats() output alongside the nonce; the page hands that object
 * straight to this constructor. A tampered client can therefore claim maxed
 * stats. That is acceptable by construction: warMods clamps every field again
 * here and every modifier (flat or combo) is ceiling-neutral, so a forger
 * buys the feel of an upgraded plane and no point the server would otherwise
 * reject.
 */
export interface SimStats {
  botox: number; // Armor
  drugs: number; // Engine
  ozempic: number; // Smoke
  aura: number; // Caliber (legacy 0..30 ladder)
  optics: number; // Optics
}
export const NO_STATS: SimStats = { botox: 0, drugs: 0, ozempic: 0, aura: 0, optics: 0 };

function lvl(v: unknown, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, n));
}

export const COMBO_ARMOR_MIN = 3;
export const COMBO_ENGINE_MIN = 3;
export const COMBO_SMOKE_MIN = 3;
export const COMBO_OPTICS_MIN = 3;
export const COMBO_CALIBER_MIN = 15;
export const COMBO_RAM_NAME = "RAM";
export const COMBO_VEIL_NAME = "CONTRAIL VEIL";
export const COMBO_RANGING_NAME = "RANGING SHOT";
/** CONTRAIL VEIL: seconds of sustained weaving that buy VEIL_T untargetable. */
export const VEIL_CHARGE_T = 3.0;
export const VEIL_T = 1.0;
/** Straight-and-level this long and the contrail thins: the charge is lost.
 * The grace exists because a gun tap parks the stick for ~2 frames — without
 * it a pilot who ever shoots could never charge the combo at all. */
export const VEIL_BREAK_T = 0.4;
/** RANGING SHOT: extra blast window on the marked target, px x k. */
export const MARK_GRACE = 18;
const RANGING_RANGE = 620; // px x k ahead the mark may reach

export interface WarMods {
  rollMul: number; // Engine: lateral authority
  hits: number; // Armor: hits before the plane goes down
  iframes: number; // Armor + Smoke: post-hit invulnerability, seconds
  gunDmg: number; // Caliber: damage per tracer
  burstN: number; // Caliber thresholds: tracers per burst (width)
  teleBonus: number; // Optics: extra flak telegraph seconds
  warnLead: number; // Optics: formation warning lead, seconds
  ram: boolean; // COMBO Armor 3 + Engine 3
  veil: boolean; // COMBO Engine 3 + Smoke 3
  ranging: boolean; // COMBO Optics 3 + Caliber 15
}

/**
 * Engine  +6%/level lateral speed (max +24%): roll authority is the dodge stat
 *         in a fixed-scroll corridor. SCROLL itself is untouched — the run
 *         length is the schedule and no stat may move it.
 * Armor   a 4th hit from level 2 (capped +1, the tankbuster plate), plus
 *         +5%/level i-frames so 1 and 3+ are never dead money.
 * Smoke   +0.15s/level post-hit i-frames on the 1.2s base (the house formula).
 * Caliber tracer damage 1 + 0.35 x aura/30 (a climber's 4 hp falls in 3 tracers
 *         instead of 4 at full Caliber) and burst WIDTH at thresholds: 6
 *         tracers, +1 at aura 10, +1 more at aura 20.
 * Optics  flak telegraphs hold +0.15s/level (1.0 -> 1.6s) and the next
 *         formation flags its entry edge 0.3s/level early (read out by
 *         nextFighterWarning below; 0 at Optics 0 = never).
 *
 * CEILING-NEUTRAL, every one of them: counts, point values, SCROLL, leg
 * lengths, bonuses and hp tables are never touched. Caliber and the combos
 * only make the same fixed-count, fixed-value targets fall EARLIER or make the
 * pilot survive longer, which is reach, not points. Note that NOTHING here
 * touches the bomb: BOMB_CD, BOMB_FALL and BLAST are the same for every build,
 * so the 88.9% of the board that only bombs can reach is pure pilot skill.
 */
export function warMods(raw?: Partial<SimStats> | null): WarMods {
  const s = raw || NO_STATS;
  const engine = lvl(s.drugs, 4);
  const armor = lvl(s.botox, 4);
  const smoke = lvl(s.ozempic, 4);
  const aura = lvl(s.aura, 30);
  const optics = lvl(s.optics, 4);
  return {
    rollMul: 1 + 0.06 * engine,
    hits: HITS_MAX + (armor >= 2 ? 1 : 0),
    iframes: IFRAMES * (1 + 0.05 * armor) + 0.15 * smoke,
    gunDmg: 1 + 0.35 * (aura / 30),
    burstN: 6 + (aura >= 10 ? 1 : 0) + (aura >= 20 ? 1 : 0),
    teleBonus: 0.15 * optics,
    warnLead: 0.3 * optics,
    ram: armor >= COMBO_ARMOR_MIN && engine >= COMBO_ENGINE_MIN,
    veil: engine >= COMBO_ENGINE_MIN && smoke >= COMBO_SMOKE_MIN,
    ranging: optics >= COMBO_OPTICS_MIN && aura >= COMBO_CALIBER_MIN,
  };
}

// ── entities ────────────────────────────────────────────────────────────────
/** dive = descends from ahead in a formation; climb = comes up from behind
 * (the CHASE_GAP tail-sit) and, once on your six, is the game's one constant
 * threat (see CONTINUOUS PRESSURE below); flank = sweeps in from a corridor
 * edge and cuts laterally across a fixed row, debuting in leg 2. */
export type FighterKind = "dive" | "climb" | "flank";
export type FighterState =
  | "wait"
  | "dive"
  | "approach"
  | "chase"
  | "overtake"
  | "ahead"
  | "leave"
  | "flank"
  | "gone";
/** 0 line abreast, 1 vee (leader out front), 2 echelon (stepped). */
export type FormShape = 0 | 1 | 2;

export interface Fighter {
  kind: FighterKind;
  leg: number;
  cell: number; // grid fifth, by trigger wy
  trigger: number; // plane wy that activates it
  wave: number; // formation id (climbers and flankers are solo waves)
  entryX: number;
  offWy: number; // formation fore/aft offset at spawn, px x k
  /** flank only: which edge it enters from (-1 left, 1 right); unused (0)
   * otherwise. Sweep direction is always toward the OPPOSITE edge. */
  side: -1 | 0 | 1;
  /** LEG 2's named beat (see ACE below): a single seeded climber with double
   * HP and a one-shot reveal banner the moment it commits to your tail.
   * Never on more than one fighter per run; ceiling-neutral (still one
   * FIGHTER_PTS kill, just a longer time-to-kill). */
  ace: boolean;
  /** WEAVER: a diver that jinks across your lane instead of tracking straight
   * in. Same points, same speed, same fan out of PATTERNS.dive -- only the
   * BODY moves differently, so the dodgeability arithmetic that governs the
   * bullets is untouched and the ceiling does not move. Decided at
   * construction from the fighter's own index: no rng, no new roll. */
  weave: boolean;
  /** GUNSHIP (Mike 2026-08-02: "possibly a second type of plane"): a heavy
   * head-on airframe in the dive family. Triple HP, a wider slower 5-fan on
   * a quicker cadence, 1.3x the hitbox, its own dark art. Same FIGHTER_PTS
   * per kill, so ceiling() sees it only through the fighter COUNT. Decided
   * at construction from the wave index: no rng, no new roll. */
  gun: boolean;
  x: number;
  wy: number;
  vx: number;
  vwy: number;
  hp: number;
  r: number;
  state: FighterState;
  stateT: number;
  fireCd: number;
  period: number; // seeded at construction
  fired: boolean; // diver/flanker: the single pass burst is spent
  dead: boolean;
  ko: number;
  spin: number;
  hit: number;
}
export interface AA {
  x: number;
  wy: number;
  leg: number;
  cell: number;
  dead: boolean;
  cd: number;
  period: number; // seeded at construction
  hit: number;
  ko: number;
}
export interface GroundTarget {
  kind: "tank" | "turret" | "base" | "flagship";
  x: number;
  wy: number;
  w: number; // half-extent, px (already x k)
  leg: number;
  cell: number;
  hp: number;
  dead: boolean;
  hit: number;
  burn: number;
  marked: boolean; // RANGING SHOT
  /** turret only: seconds until its next fan. Unused by every other kind. */
  fireCd: number;
}
export interface Tele {
  x: number;
  wy: number;
  t: number;
  total: number;
  srcX: number; // the AA nest that fired it (page draws the rising shell)
  srcWy: number;
}
export interface FlakBurst {
  x: number;
  wy: number;
  r: number;
  life: number;
  hitDone: boolean;
}
export interface Tracer {
  x: number;
  wy: number;
  vx: number;
  vwy: number;
  life: number;
  dmg: number;
  dead: boolean;
}
export interface EBullet {
  x: number;
  wy: number;
  vx: number;
  vwy: number;
  dead: boolean;
  /** GRAZE: set once, the first frame this bullet passes inside GRAZE_R of the
   * plane without hitting it. Monotonic so one bullet can only ever pay once,
   * and a pure distance read so it costs no rng and replays exactly. */
  grazed: boolean;
}
export interface Bomb {
  x: number;
  wy: number;
  t: number; // seconds of fall left
  dead: boolean;
}
export interface Part {
  x: number;
  wy: number;
  vx: number;
  vwy: number;
  life: number;
  r: number;
  kind: "spark" | "smoke" | "flash";
}
export interface Floater {
  x: number;
  wy: number;
  txt: string;
  life: number;
  big: boolean;
}
export interface TrailDot {
  x: number;
  wy: number;
  life: number;
}

/** "terrain" and "cable" are now unreachable: the ridge lines stopped being
 *  lethal. Kept in the union so an old tape or an
 *  old score row still deserialises. "fuel" is the new one. */
export type DeathCause = "terrain" | "flak" | "gunfire" | "collision" | "cable" | "fuel" | "";

export interface WarState {
  W: number; // total world length, px (forward extent of the whole sortie)
  H: number; // view height
  viewW: number; // view width == the lateral world extent
  k: number;
  planeSy: number; // screen y the plane's BAND is centred on
  /** THE CAMERA's world y, advancing at exactly SCROLL forever. Split from the
   *  plane (`wy`) so the plane can move on BOTH axes without the world scroll
   *  rate -- and therefore the leg pacing and the run length -- changing. */
  camWy: number;
  /** Fuel, 0..FUEL_MAX. Drains constantly; refilled only by pickups. This is
   *  the AFK gate now that the ridge lines are no longer lethal, and it is
   *  also the reason a live run leans forward instead of loitering. */
  fuel: number;
  /** Gun level 0..GUN_LVL_MAX. Raises rate of fire and spread. Ceiling-neutral
   *  by construction: it changes how easily you hit a fixed roster of targets,
   *  never how many there are or what they pay. */
  gunLvl: number;
  drops: Drop[];
  laneMin: number; // lethal ridge edges, px
  laneMax: number;
  rng: () => number;
  rngFx: () => number;
  reduced: boolean;
  mods: WarMods; // frozen at construction; never rerolled, never random
  maxHits: number;

  phase: "intro" | "play" | "ko" | "over";
  phaseT: number;
  t: number;
  clock: number; // always-running (tap timing survives phases)
  freeze: number;

  score: number;
  kills: number;
  /** Score split, telemetry only: the proof that the bomb rack is the game. */
  gunScore: number;
  bombScore: number;
  bombsDropped: number;
  bombsLanded: number; // detonated
  bombsOnTarget: number; // detonated ON at least one live ground target

  leg: number; // 0..2 (3 once landed)
  legEnds: number[]; // cumulative wy boundaries

  x: number; // plane lateral position
  wy: number; // plane forward progress
  vx: number;
  targetX: number;
  hits: number;
  iframes: number;
  /** Seconds of RAPID pickup left. Cadence only; never touches counts. */
  rapidT: number;
  gunCd: number;
  burstLeft: number;
  burstT: number;
  burstIdx: number;
  bombCd: number;
  muzzle: number;

  ramUsed: boolean;
  sawRam: boolean;
  veilCharge: number;
  veilStill: number;
  veilT: number;
  sawVeil: boolean;
  rangingFiredLeg: number; // last leg (1-based) whose first-bomb mark was spent
  sawRanging: boolean;

  /** LOADOUT: the paused intro-phase build choice (see LOADOUT below).
   * 0 = STRIKE (baseline, the bot's and an untouched intro's default),
   * 1 = ESCORT (tankier, slower roll). Committed once, at the intro->play
   * transition; read-only afterward. */
  loadout: 0 | 1;

  /** The strip's boss beat: a one-shot latch (never re-triggers) plus a
   * decaying 0..1 window that drives the entrance freeze/punch/plate. */
  sawFlagship: boolean;
  flagshipRevealT: number;

  /** MID-RUN GROWTH (builds on the intro LOADOUT pick): two automatic,
   * announced capability jumps tied to leg progress, never a stat and never
   * hidden. GUNS HOT (leg 2 on) trims the gun cooldown further; TWIN RACK
   * (leg 3 on) doubles every bomb drop into a paired salvo. Both are
   * ceiling-neutral (cadence/reach only, see dropBomb and the gun trigger in
   * stepWarhawks) and read directly off s.leg, so these two fields are only
   * the ONE-SHOT "already announced" latches, not the gates themselves. */
  sawGunsHot: boolean;
  sawTwinRack: boolean;
  /** Each leg's named beat, one-shot: LEG 1's FLAK ALLEY (a pinched cluster
   * of nests), LEG 2's ACE (see the Fighter.ace doc), LEG 3's STRONGPOINT (a
   * pinched cluster of tanks/bases). Position/state-triggered, never timed,
   * so they survive any freeze/hitstop without drifting. */
  sawFlakAlley: boolean;
  sawAce: boolean;
  sawStrongpoint: boolean;

  fighters: Fighter[];
  aas: AA[];
  grounds: GroundTarget[];
  teles: Tele[];
  bursts: FlakBurst[];
  tracers: Tracer[];
  ebullets: EBullet[];
  grazes: number; // GRAZE events paid this run (capped at GRAZE_CAP)
  chains: number; // CHAIN events paid this run (capped at CHAIN_CAP)
  bombs: Bomb[];

  // probe counters (monotonic; the DOM probe and sfx hooks read deltas)
  telesFired: number;
  burstsBloomed: number;

  // tap detection (X-only movement: world-y drifts under a held finger)
  downT: number;
  downX: number;
  downMoved: number;
  wasDown: boolean;
  lastTapRel: number; // clock time of the last quick-tap release; -1 none
  wasSpace: boolean;

  parts: Part[];
  floats: Floater[];
  trail: TrailDot[];
  trailCd: number;
  shake: number;
  flash: number;
  banner: { txt: string; t: number } | null;

  won: boolean;
  died: boolean;
  diedLeg: number;
  deathCause: DeathCause;
  over: boolean;
}

/** Spread `climbers` climb-entries evenly through a leg's n entry slots. Pure. */
export function entryKinds(n: number, climbers: number): FighterKind[] {
  const out: FighterKind[] = [];
  for (let i = 0; i < n; i++) {
    const before = Math.floor((i * climbers) / n);
    const after = Math.floor(((i + 1) * climbers) / n);
    out.push(after > before ? "climb" : "dive");
  }
  return out;
}

/**
 * Partition n divers into formation sizes, preferring threes then twos. Pure
 * and rng-free so the ENTRY-SLOT COUNT per leg is a constant of the tables:
 * 4 -> [2,2], 5 -> [3,2], 6 -> [3,3]. ceiling() never reads this (points are
 * per fighter, not per formation), but the pacing does.
 */
export function formationSizes(n: number): number[] {
  const out: number[] = [];
  let left = n;
  while (left >= 5) {
    out.push(3);
    left -= 3;
  }
  if (left === 4) out.push(2, 2);
  else if (left > 0) out.push(left);
  return out;
}

/**
 * Build one run. `w`/`h` are the VIEW size (canvas CSS px). The world is
 * sum(LEG_LEN) x k long FORWARD and exactly `w` wide laterally; k = w/480
 * keeps every design constant's meaning.
 * ALL gameplay rng is consumed HERE, in this fixed order (per leg: fighter
 * entries, AA, tanks, bases) — stepWarhawks never rolls.
 */
export function createWarhawks(
  w: number,
  h: number,
  seed: string,
  reduced = false,
  stats?: Partial<SimStats> | null,
): WarState {
  const k = w / 480;
  const mods = warMods(stats);
  const legEnds: number[] = [];
  let acc = 0;
  for (const L of LEG_LEN) {
    acc += L * k;
    legEnds.push(acc);
  }
  // the world runs STRIP_LEN past legEnds[2]: legEnds stays the 3 leg
  // boundaries (gridEmoji, the leg-bonus chain), s.W is the TRUE far end.
  const worldLen = acc + STRIP_LEN * k;
  const laneMin = LANE_PAD * k;
  const laneMax = w - LANE_PAD * k;
  const s: WarState = {
    W: worldLen,
    H: h,
    viewW: w,
    k,
    planeSy: h * PLANE_SY_FRAC,
    camWy: 0,
    fuel: FUEL_MAX,
    gunLvl: 0,
    drops: [],
    laneMin,
    laneMax,
    rng: mulberry32(fnv1a("war-" + seed)),
    rngFx: mulberry32(fnv1a("warfx-" + seed)),
    reduced,
    mods,
    maxHits: mods.hits,
    phase: "intro",
    phaseT: INTRO_T,
    t: 0,
    clock: 0,
    freeze: 0,
    score: 0,
    kills: 0,
    gunScore: 0,
    bombScore: 0,
    bombsDropped: 0,
    bombsLanded: 0,
    bombsOnTarget: 0,
    leg: 0,
    legEnds,
    x: w / 2,
    wy: 0,
    vx: 0,
    targetX: w / 2,
    hits: 0,
    iframes: 0,
    gunCd: 0,
    rapidT: 0,
    burstLeft: 0,
    burstT: 0,
    burstIdx: 0,
    bombCd: 0,
    muzzle: 0,
    ramUsed: false,
    sawRam: false,
    veilCharge: 0,
    veilStill: 0,
    veilT: 0,
    sawVeil: false,
    rangingFiredLeg: 0,
    sawRanging: false,
    loadout: 0,
    sawFlagship: false,
    flagshipRevealT: 0,
    sawGunsHot: false,
    sawTwinRack: false,
    sawFlakAlley: false,
    sawAce: false,
    sawStrongpoint: false,
    fighters: [],
    aas: [],
    grounds: [],
    teles: [],
    bursts: [],
    tracers: [],
    ebullets: [],
    grazes: 0,
    chains: 0,
    bombs: [],
    telesFired: 0,
    burstsBloomed: 0,
    downT: 0,
    downX: 0,
    downMoved: 0,
    wasDown: false,
    lastTapRel: -1,
    wasSpace: false,
    parts: [],
    floats: [],
    trail: [],
    trailCd: 0,
    shake: 0,
    flash: 0,
    banner: null,
    won: false,
    died: false,
    diedLeg: -1,
    deathCause: "",
    over: false,
  };

  // the lane every spawn is placed inside (never on a ridge)
  const spawnLo = laneMin + 24 * k;
  const spawnHi = laneMax - 24 * k;
  const inLane = (x: number) => Math.max(spawnLo, Math.min(spawnHi, x));

  // ── the mission plan (every gameplay roll, fixed order per leg: fighter
  // entries incl. flankers, AA, tanks, bases; then the strip's own
  // escort and flagship) — stepWarhawks never rolls. ──
  let waveId = 0;
  // LEG 2's ACE (see Fighter.ace): the middle of that leg's climbers, never
  // more than one per run.
  const ACE_CLIMB_IDX = Math.floor(CLIMBERS_PER_LEG[1] / 2);
  for (let L = 0; L < 3; L++) {
    const legStart = L === 0 ? 0 : legEnds[L - 1];
    const legLen = LEG_LEN[L] * k;
    const cellOf = (wy: number) =>
      Math.max(0, Math.min(GRID_CELLS - 1, Math.floor(((wy - legStart) / legLen) * GRID_CELLS)));

    // fighter ENTRIES: climber singles + diver formations, stratified through
    // the leg (the first no earlier than ~9% in so takeoff is never an instant
    // furball)
    const nF = FIGHTERS_PER_LEG[L];
    const nClimb = CLIMBERS_PER_LEG[L];
    const sizes = formationSizes(nF - nClimb);
    const slots = sizes.length + nClimb;
    const kinds = entryKinds(slots, nClimb);
    let sizeIdx = 0;
    let climbIdx = 0;
    for (let i = 0; i < slots; i++) {
      const trigger = legStart + ((i + 0.35 + 0.3 * s.rng()) / slots) * legLen;
      const cell = cellOf(trigger);
      if (kinds[i] === "climb") {
        const ace = L === 1 && climbIdx === ACE_CLIMB_IDX;
        climbIdx++;
        s.fighters.push({
          kind: "climb",
          leg: L,
          cell,
          trigger,
          wave: waveId++,
          entryX: inLane(spawnLo + (spawnHi - spawnLo) * s.rng()),
          offWy: 0,
          side: 0,
          ace,
          weave: false, // climbers come from behind; the jink is a diver tell
          gun: false,
          x: 0,
          wy: 0,
          vx: 0,
          vwy: 0,
          hp: ace ? Math.round(FIGHTER_B_HP * ACE_HP_MUL) : FIGHTER_B_HP,
          r: FIGHTER_R * k,
          state: "wait",
          stateT: 0,
          fireCd: 0.6 + 0.5 * s.rng(),
          period: (1.7 + 0.5 * s.rng()) * TIMER_FAC[L],
          fired: false,
          dead: false,
          ko: 0,
          spin: 0,
          hit: 0,
        });
        continue;
      }
      const m = sizes[sizeIdx++];
      const shape = Math.floor(s.rng() * 3) as FormShape;
      const centerX = spawnLo + (spawnHi - spawnLo) * s.rng();
      const wave = waveId++;
      for (let j = 0; j < m; j++) {
        const lane = j - (m - 1) / 2;
        // every 4th formation in legs 2-3 leads with a GUNSHIP at its head
        const gun = L >= 1 && wave % 4 === 1 && j === 0;
        const offWy =
          shape === 0 ? 0 : shape === 1 ? -Math.abs(lane) * FORM_DY * k : -j * FORM_DY * k;
        s.fighters.push({
          kind: "dive",
          leg: L,
          cell,
          trigger,
          wave,
          entryX: inLane(centerX + lane * FORM_DX * k),
          offWy,
          side: 0,
          ace: false,
          weave: !gun && L >= 1 && wave % 5 === 3,
          gun,
          x: 0,
          wy: 0,
          vx: 0,
          vwy: 0,
          hp: gun ? FIGHTER_A_HP * 3 : FIGHTER_A_HP,
          r: (gun ? FIGHTER_R * 1.3 : FIGHTER_R) * k,
          state: "wait",
          stateT: 0,
          fireCd: 0.5 + 0.5 * s.rng(),
          period: (gun ? 1.25 + 0.35 * s.rng() : 1.7 + 0.5 * s.rng()) * TIMER_FAC[L],
          fired: false,
          dead: false,
          ko: 0,
          spin: 0,
          hit: 0,
        });
      }
    }
    // FLANKERS: a solo lateral pass from a corridor edge, stratified through
    // the leg same as the entries above but tracked separately (they are
    // never part of a dive/climb formation). Leg 1 carries none (FLANKERS_PER_LEG
    // [0]=0): one new grammar element at a time.
    const nFlank = FLANKERS_PER_LEG[L];
    for (let i = 0; i < nFlank; i++) {
      const trigger = legStart + ((i + 0.4 + 0.3 * s.rng()) / nFlank) * legLen;
      const side: -1 | 1 = s.rng() < 0.5 ? -1 : 1;
      s.fighters.push({
        kind: "flank",
        leg: L,
        cell: cellOf(trigger),
        trigger,
        wave: waveId++,
        entryX: side < 0 ? laneMin - FLANK_EDGE_PAD * k : laneMax + FLANK_EDGE_PAD * k,
        offWy: 0,
        side,
        ace: false,
        weave: false,
        gun: false,
        x: 0,
        wy: 0,
        vx: 0,
        vwy: 0,
        hp: FIGHTER_A_HP,
        r: FIGHTER_R * k,
        state: "wait",
        stateT: 0,
        fireCd: 0,
        period: 0,
        fired: false,
        dead: false,
        ko: 0,
        spin: 0,
        hit: 0,
      });
    }
    // AA nests (LEG 1's FLAK ALLEY pinches into AA_BAND; the other two legs
    // spread edge to edge)
    const nA = AA_PER_LEG[L];
    const [aaLo, aaHi] = AA_BAND[L];
    for (let i = 0; i < nA; i++) {
      const wy = legStart + (aaLo + ((aaHi - aaLo) * (i + 0.3 + 0.4 * s.rng())) / nA) * legLen;
      const x = inLane(spawnLo + (spawnHi - spawnLo) * s.rng());
      // Quicker and tighter than the pre-bullet-hell 3.4 + 0.9: flak is now a
      // RHYTHM the player learns to move against, so the spread between nests
      // narrows and the opening shot is staggered by index parity rather than
      // scattered by the roll. The roll stays (it keeps a row from firing in
      // perfect lockstep) but it no longer sets the beat.
      // NOT sped up. An early cut of the bullet-hell pass ran 2.6 + 0.5 here
      // and, stacked on the denser sky and the new turrets, it killed a
      // zero-stat run inside leg 1 - which is FLAK ALLEY, so leg 1 ate three
      // separate increases at once. Mike asked for a denser AIR fight, never
      // for more flak, so the flak cadence stays where it shipped and the new
      // pressure arrives as dodgeable bullet patterns instead.
      const period = (3.4 + 0.9 * s.rng()) * TIMER_FAC[L];
      s.aas.push({
        x,
        wy,
        leg: L,
        cell: cellOf(wy),
        dead: false,
        cd: (i % 2) * (period / 2) + 0.5,
        period,
        hit: 0,
        ko: 0,
      });
    }
    // NO BALLOONS. They were zero-point obstacles trailing a cable that killed
    // instantly "with no counterplay once you are on it" -- the sim's own words
    // -- and Mike's verdict was "the weird balloon thing you need to hit is
    // weird". The reference game has no analogue. The spawner is gone rather
    // than the eight call sites, so every remaining balloon loop now iterates
    // an array that can never be non-empty and no path can fire.
    // tanks (LEG 3's THE GAUNTLET pinches into TANK_BAND)
    const nT = TANKS_PER_LEG[L];
    const [tkLo, tkHi] = TANK_BAND[L];
    for (let i = 0; i < nT; i++) {
      const wy = legStart + (tkLo + ((tkHi - tkLo) * (i + 0.25 + 0.5 * s.rng())) / nT) * legLen;
      const x = inLane(spawnLo + (spawnHi - spawnLo) * s.rng());
      s.grounds.push({ kind: "tank", x, wy, w: 15 * k, leg: L, cell: cellOf(wy), hp: 1, dead: false, hit: 0, burn: 0, marked: false, fireCd: 0 });
    }
    // ground turrets: spread across the whole leg, never pinched. They are
    // ambient pressure, so a band would defeat the point.
    const nTur = TURRETS_PER_LEG[L];
    for (let i = 0; i < nTur; i++) {
      const wy = legStart + ((i + 0.3 + 0.4 * s.rng()) / nTur) * legLen;
      const x = inLane(spawnLo + (spawnHi - spawnLo) * s.rng());
      s.grounds.push({
        kind: "turret",
        x,
        wy,
        w: 13 * k,
        leg: L,
        cell: cellOf(wy),
        hp: 1,
        dead: false,
        hit: 0,
        burn: 0,
        marked: false,
        // index parity staggers the opening shot so a row of turrets fires in
        // an alternating rhythm rather than one wall. Deterministic, no rng.
        fireCd: (i % 2) * (TURRET_CD / 2),
      });
    }
    // bases (multi-bomb; LEG 3's STRONGPOINT pinches into BASE_BAND)
    const nBase = BASES_PER_LEG[L];
    const [bsLo, bsHi] = BASE_BAND[L];
    for (let i = 0; i < nBase; i++) {
      const wy = legStart + (bsLo + ((bsHi - bsLo) * (i + 0.45 + 0.25 * s.rng())) / nBase) * legLen;
      const x = inLane(spawnLo + (spawnHi - spawnLo) * s.rng());
      s.grounds.push({ kind: "base", x, wy, w: 34 * k, leg: L, cell: cellOf(wy), hp: BASE_HP, dead: false, hit: 0, burn: 0, marked: false, fireCd: 0 });
    }
  }
  // ── the strip's own escort: continuous pressure into the final stretch, on
  // top of the flagship's own boss beat below. Attributed to leg index 2 /
  // the last grid cell, since the strip has no row of its own. ──
  {
    const stripStart = legEnds[2];
    if (STRIP_CLIMBERS > 0) {
      const trigger = stripStart + 70 * k;
      s.fighters.push({
        kind: "climb",
        leg: 2,
        cell: GRID_CELLS - 1,
        trigger,
        wave: waveId++,
        entryX: inLane(spawnLo + (spawnHi - spawnLo) * s.rng()),
        offWy: 0,
        side: 0,
        ace: false,
        weave: false,
        gun: false,
        x: 0,
        wy: 0,
        vx: 0,
        vwy: 0,
        hp: FIGHTER_B_HP,
        r: FIGHTER_R * k,
        state: "wait",
        stateT: 0,
        fireCd: 0.6 + 0.5 * s.rng(),
        period: (1.7 + 0.5 * s.rng()) * TIMER_FAC[2],
        fired: false,
        dead: false,
        ko: 0,
        spin: 0,
        hit: 0,
      });
    }
    if (STRIP_FLANKERS > 0) {
      const trigger = stripStart + 300 * k;
      const side: -1 | 1 = s.rng() < 0.5 ? -1 : 1;
      s.fighters.push({
        kind: "flank",
        leg: 2,
        cell: GRID_CELLS - 1,
        trigger,
        wave: waveId++,
        entryX: side < 0 ? laneMin - FLANK_EDGE_PAD * k : laneMax + FLANK_EDGE_PAD * k,
        offWy: 0,
        side,
        ace: false,
        weave: false,
        gun: false,
        x: 0,
        wy: 0,
        vx: 0,
        vwy: 0,
        hp: FIGHTER_A_HP,
        r: FIGHTER_R * k,
        state: "wait",
        stateT: 0,
        fireCd: 0,
        period: 0,
        fired: false,
        dead: false,
        ko: 0,
        spin: 0,
        hit: 0,
      });
    }
  }
  // ── the strip's climax: one FLAGSHIP BASE, fixed order after every leg ────
  {
    const fx = inLane(spawnLo + (spawnHi - spawnLo) * s.rng());
    const fwy = legEnds[2] + STRIP_LEN * k * FLAGSHIP_AT;
    s.grounds.push({
      fireCd: 0,
      kind: "flagship",
      x: fx,
      wy: fwy,
      w: FLAGSHIP_W * k,
      leg: 2,
      cell: GRID_CELLS - 1,
      hp: FLAGSHIP_HP,
      dead: false,
      hit: 0,
      burn: 0,
      marked: false,
    });
  }
  return s;
}

/** The page camera is a pure read of state. World wy grows FORWARD, screen y
 * grows DOWN, so the two axes are opposed and sy() is the whole transform. */
/**
 * THE CAMERA. Reads `camWy`, not the plane -- that split is what lets the plane
 * move forward and back without dragging the world with it. camWy advances at
 * exactly SCROLL forever, so the leg pacing and the run's length in seconds are
 * identical to before this change.
 */
export function camY(s: WarState): number {
  return s.camWy + s.planeSy;
}
/** World forward coordinate -> screen y. The renderer's only projection. */
export function sy(s: WarState, wy: number): number {
  return s.camWy + s.planeSy - wy;
}
/** The plane's own screen y, which is now a thing that moves. */
export function planeScreenY(s: WarState): number {
  return sy(s, s.wy);
}

// ── helpers ────────────────────────────────────────────────────────────────
function burst(s: WarState, x: number, wy: number, n: number, sp: number, kind: Part["kind"], r = 2) {
  const cap = s.reduced ? PART_CAP / 3 : PART_CAP;
  for (let i = 0; i < n && s.parts.length < cap; i++) {
    const a = s.rngFx() * Math.PI * 2;
    const v = sp * (0.35 + s.rngFx() * 0.75);
    s.parts.push({
      x,
      wy,
      vx: Math.cos(a) * v,
      vwy: Math.sin(a) * v,
      life: kind === "smoke" ? 0.7 + s.rngFx() * 0.5 : 0.28 + s.rngFx() * 0.3,
      r: r * (0.7 + s.rngFx() * 0.8),
      kind,
    });
  }
}

function float(s: WarState, x: number, wy: number, txt: string, big = false) {
  if (s.floats.length < 18) s.floats.push({ x, wy, txt, life: big ? 1.3 : 0.95, big });
}

/** Bank a target's fixed value and record WHICH weapon earned it. */
function score(s: WarState, pts: number, from: "gun" | "bomb", x: number, wy: number, label: string, big = false) {
  s.score += pts;
  s.kills++;
  if (from === "gun") s.gunScore += pts;
  else s.bombScore += pts;
  float(s, x, wy, `${label} +${pts}`, big);

  // THE DROP HOOK. Every scoring kill in the game routes through here, which
  // is why the hook lives here and not at each call site: a new target class
  // gets drops for free and cannot be forgotten.
  //
  // The choice is a pure function of the KILL COUNT, not a roll. `stepWarhawks`
  // rolls nothing by law -- the level is rolled at construction -- and a
  // count-driven cadence is also better play: it is something the player can
  // feel and lean into rather than a slot machine.
  const n = s.kills;
  // Four kinds on one chain, primes so they interleave instead of colliding
  // (Mike 2026-08-01: "you need more upgrades if it is going to be this hard").
  // Rarest first: a repair is worth more than fuel, and rapid fire more again.
  // All four pay ZERO points, so the ceiling does not move.
  const kind: Drop["kind"] | null =
    n % 13 === 0 ? "rapid" : n % 11 === 0 ? "repair" : n % 7 === 0 ? "gun" : n % 3 === 0 ? "fuel" : null;
  if (kind && s.drops.length < 12) {
    s.drops.push({ x, wy, kind, life: DROP_LIFE });
  }
}

function downPlane(s: WarState, cause: DeathCause) {
  if (s.phase !== "play") return;
  s.died = true;
  s.diedLeg = Math.min(2, s.leg);
  s.deathCause = cause;
  s.phase = "ko";
  s.phaseT = KO_T;
  s.banner = {
    txt:
      cause === "fuel"
        ? "OUT OF FUEL"
        : cause === "cable"
          ? "INTO THE CABLE"
          : cause === "terrain"
            ? "INTO THE RIDGE"
            : "SHOT DOWN",
    t: KO_T,
  };
  s.shake = Math.max(s.shake, 12);
  s.flash = Math.max(s.flash, 0.35);
  s.freeze = Math.max(s.freeze, 0.08); // going down is the biggest moment the player causes
  burst(s, s.x, s.wy, 18, 220 * s.k, "spark", 2.6 * s.k);
  burst(s, s.x, s.wy, 10, 70 * s.k, "smoke", 5 * s.k);
}

function damagePlane(s: WarState, cause: DeathCause) {
  if (s.phase !== "play" || s.iframes > 0 || s.veilT > 0) return;
  s.hits++;
  s.flash = Math.max(s.flash, 0.26);
  s.shake = Math.max(s.shake, 8);
  burst(s, s.x, s.wy, 8, 150 * s.k, "spark", 2 * s.k);
  if (s.hits >= s.maxHits) {
    downPlane(s, cause);
    return;
  }
  s.iframes = s.mods.iframes;
  s.banner = { txt: s.maxHits - s.hits === 1 ? "ONE HIT LEFT" : "HIT", t: 1.0 };
}

function killFighter(s: WarState, f: Fighter) {
  f.dead = true;
  f.hp = 0;
  f.ko = 0.6;
  f.spin = f.kind === "climb" ? 5 : 8;
  score(s, FIGHTER_PTS, "gun", f.x, f.wy + 16 * s.k, "FIGHTER", false);
  burst(s, f.x, f.wy, 12, 190 * s.k, "spark", 2.3 * s.k);
  burst(s, f.x, f.wy, 5, 55 * s.k, "smoke", 4 * s.k);
  s.freeze = Math.max(s.freeze, 0.03);
}

/** THE PATTERN EMITTER.
 *
 * Every hostile bullet in the game comes out of here. The old
 * `fireEnemyBullets(s, x, wy, n)` was already this function with `mode` frozen
 * to "aimed" and `spread` frozen to 0.05 per bullet; generalizing it is what
 * makes a bullet-hell possible without touching the integration loop, the
 * collision gates, the cull, or the score plumbing.
 *
 * Angles are in the same (dx, dwy) space the whole sim uses: 0 points UP the
 * screen away from the emitter, and Math.PI points down-screen toward the
 * player's side. `spread` is the TOTAL fan width in radians for the fan modes,
 * and the per-emission angular STEP for "spiral".
 *
 * THE DODGEABILITY INVARIANT, which every entry in PATTERNS is checked
 * against: the plane must be able to thread the gap or slide off the fan.
 *   thread:  L * spread / (n - 1)  >=  34px   (plane hitbox is
 *            (PLANE_R 11 + EB_R 3.5) = 14.5px, so a gap needs ~29px + margin)
 *   slide:   tArrive * ROLL(210)   >=  fanHalfWidth + 30px
 * Satisfy ONE of the two and the pattern is fair. Adding a pattern that
 * satisfies neither is how this game would become unreadable, so do the
 * arithmetic in a comment next to the table entry, the way the current ones do.
 */
export type PatternMode = "aimed" | "fixed" | "ring" | "spiral";

export interface PatternSpec {
  n: number;
  /** fan width in radians (fan modes) or the per-emission step ("spiral"). */
  spread: number;
  speed: number;
  mode: PatternMode;
  /** ring/spiral only: where the arm starts. Callers advance their own. */
  phase?: number;
}

/** Hard cap on live hostile bullets. The array was UNBOUNDED in warhawks,
 * which was survivable at ~1.8 emissions/second and is not at bullet-hell
 * density. The cull drops the OLDEST bullet by emission order (index 0) and
 * never a distance heuristic: distance ties are float comparisons that can
 * order differently across builds, and a non-deterministic cull would break
 * replay byte-identity. The oldest bullet is also, always, the one furthest
 * behind the action. */
export const EB_CAP = 140;

export function firePattern(s: WarState, x: number, wy: number, spec: PatternSpec) {
  const n = Math.max(1, spec.n | 0);
  const base =
    spec.mode === "aimed"
      ? Math.atan2(s.x - x, s.wy - wy)
      : spec.mode === "fixed"
        ? Math.PI
        : (spec.phase ?? 0);
  for (let i = 0; i < n; i++) {
    let a: number;
    if (spec.mode === "ring" || spec.mode === "spiral") {
      a = base + (i * Math.PI * 2) / n;
    } else {
      // even fan, centred on base; a single bullet fires straight down base
      a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spec.spread);
    }
    if (s.ebullets.length >= EB_CAP) s.ebullets.shift();
    s.ebullets.push({
      x,
      wy,
      vx: Math.sin(a) * spec.speed * s.k,
      vwy: Math.cos(a) * spec.speed * s.k,
      dead: false,
      grazed: false,
    });
  }
}

/** THE PATTERN TABLE, indexed by emitter then by leg (0-2; the strip reuses
 * leg 2). Every entry carries the dodgeability arithmetic that clears the
 * invariant on firePattern. Fan gaps are quoted at the range the shot is
 * actually taken from, not at the muzzle.
 *
 *  DIVE_FAN     leg1/2 n3 spread .36 over L=300: gap 300*.36/2 = 54px  (thread)
 *               leg3   n5 spread .60 over L=300: gap 300*.60/4 = 45px  (thread)
 *               whole-fan slide: arrival ~300/(230+68) = 1.0s -> 210px of roll
 *               against a 27px half-fan, so sidestepping the volley also works.
 *  CHASE        n2 spread .12 from close astern; n3 spread .20 on leg 3. The
 *               chase shot is the un-outplayable tax, so it stays THIN.
 *  OVERTAKE     a ring, fired once as the climber crosses ahead. n8 at r=120
 *               spaces adjacent bullets 2*PI*120/8 = 94px; n10 gives 75px.
 *  ACE_SPIRAL   n2 arms, phase steps .55 rad per emission, 10 emissions at
 *               0.5s: successive rings sit 140*0.5 = 70px apart radially and
 *               the arm step dwarfs the hitbox at any radius past ~60px.
 *  FLANK        n4 spread .5 fired at FLANK_FIRE_W: a wide, slow, readable fan
 *               from the side; the counter is altitude, not speed.
 *  TURRET       n2 spread .24 at 155px/s from at most 380px ahead: arrival
 *               ~1.7s, trivially dodged in isolation. Turrets are a RHYTHM
 *               threat, not a reflex one: they are dangerous because they fire
 *               while you are already committed to a bomb run.
 */
const PATTERNS = {
  dive: [
    { n: 2, spread: 0.24, speed: 230, mode: "aimed" as const },
    { n: 3, spread: 0.36, speed: 230, mode: "aimed" as const },
    { n: 4, spread: 0.52, speed: 230, mode: "aimed" as const },
  ],
  chase: [
    { n: 2, spread: 0.12, speed: 240, mode: "aimed" as const },
    { n: 2, spread: 0.12, speed: 240, mode: "aimed" as const },
    { n: 3, spread: 0.2, speed: 240, mode: "aimed" as const },
  ],
  overtake: [
    { n: 8, spread: 0, speed: 150, mode: "ring" as const },
    { n: 8, spread: 0, speed: 150, mode: "ring" as const },
    { n: 10, spread: 0, speed: 160, mode: "ring" as const },
  ],
  flank: [
    { n: 4, spread: 0.5, speed: 220, mode: "aimed" as const },
    { n: 4, spread: 0.5, speed: 220, mode: "aimed" as const },
    { n: 4, spread: 0.5, speed: 220, mode: "aimed" as const },
  ],
  turret: [
    { n: 2, spread: 0.24, speed: 155, mode: "aimed" as const },
    { n: 2, spread: 0.24, speed: 155, mode: "aimed" as const },
    { n: 2, spread: 0.24, speed: 155, mode: "aimed" as const },
  ],
} as const;

/** The ace's signature: a slow rotating two-arm spiral it lays down once it is
 * AHEAD of you, so the sky fills from the front while the chase fire keeps
 * coming from behind. */
export const ACE_SPIRAL_STEP = 0.55;
export const ACE_SPIRAL_EVERY = 0.5;
export const ACE_SPIRAL_SHOTS = 10;

function legIdx(s: WarState): 0 | 1 | 2 {
  return (s.leg < 1 ? 0 : s.leg < 2 ? 1 : 2) as 0 | 1 | 2;
}

/** Fire a named pattern at this leg's intensity. */
function firePat(s: WarState, x: number, wy: number, key: keyof typeof PATTERNS, phase?: number) {
  const p = PATTERNS[key][legIdx(s)];
  firePattern(s, x, wy, { n: p.n, spread: p.spread, speed: p.speed, mode: p.mode, phase });
}

/** Deterministic in-cone pick for one tracer: nearest live AIR target ahead
 * inside GUN_CONE, intercept-led (fighter velocity known, no rng). Ground
 * targets are NOT candidates — guns cannot reach the deck, bombs are the only
 * way to score it. */
function fireOneTracer(s: WarState) {
  const k = s.k;
  let pick: { x: number; wy: number; vx: number; vwy: number } | null = null;
  let pickD = Infinity;
  for (const f of s.fighters) {
    if (f.dead || f.state === "wait" || f.state === "gone") continue;
    const dx = f.x - s.x;
    const dwy = f.wy - s.wy;
    if (dwy < 4 * k) continue;
    const d = Math.hypot(dx, dwy);
    if (d > GUN_RANGE * k || d >= pickD) continue;
    if (Math.abs(Math.atan2(dx, dwy)) > GUN_CONE) continue;
    pickD = d;
    pick = f;
  }
  let ang = 0;
  if (pick) {
    const tof = pickD / (TRACER_V * k);
    ang = Math.atan2(pick.x + pick.vx * tof - s.x, pick.wy + pick.vwy * tof - s.wy);
    if (Math.abs(ang) > GUN_CONE * 1.2) ang = Math.sign(ang) * GUN_CONE * 1.2;
  }
  // burst fan (Caliber width): tracer i wobbles around the solution
  const fan = ((s.burstIdx % 3) - 1) * 0.035;
  const a = ang + fan;
  s.burstIdx++;
  s.tracers.push({
    x: s.x + Math.sin(a) * (PLANE_R + 6) * k,
    wy: s.wy + Math.cos(a) * (PLANE_R + 6) * k,
    vx: Math.sin(a) * TRACER_V * k,
    vwy: Math.cos(a) * TRACER_V * k,
    life: GUN_RANGE / TRACER_V,
    dmg: s.mods.gunDmg,
    dead: false,
  });
  s.muzzle = 0.06;
}

function dropBomb(s: WarState) {
  if (s.bombCd > 0 || s.phase !== "play") return;
  // GEAR DOWN: bombing locks out for the final approach to the true
  // touchdown line (see gearDown() below) — the run's second announced verb
  // change, pure evasion for the close. Silent no-op, same as an on-cooldown
  // tap: the plane still flies, the bomb rack just will not open.
  if (s.leg >= 3 && s.W - s.wy < GEAR_DOWN_ZONE * s.k) return;
  s.bombCd = BOMB_CD;
  s.bombsDropped++;
  // released at the plane; it keeps the plane's forward momentum for the whole
  // fall, so it lands BOMB_LEAD ahead — the pipper offset, drawn on the HUD
  s.bombs.push({ x: s.x, wy: s.wy, t: BOMB_FALL, dead: false });
  // ── MID-RUN GROWTH, TWIN RACK (leg 3 on, see WarState.sawTwinRack) ───────
  // The SAME press pairs a second bomb RACK_DX to the side: one decision now
  // buys two falls, straddling a target's own hit-radius rather than
  // stacking on it. BOMB_CD is untouched, so the cadence of DECISIONS never
  // changes, only what one decision is worth — and it is still reach, not
  // points: a second bomb on a target already at 0 hp (or on bare ground)
  // scores nothing extra (see explodeBomb), so ceiling() never sees this.
  if (s.leg >= 2) {
    s.bombsDropped++;
    s.bombs.push({ x: s.x + RACK_DX * s.k, wy: s.wy, t: BOMB_FALL, dead: false });
  }
  // ── COMBO, RANGING SHOT (Optics >= 3 AND Caliber >= 15) ──────────────────
  // The FIRST bomb of each leg marks the nearest ground target ahead: a wider
  // blast window, and a base pays one hp pip (never below 1). Fixed counts,
  // fixed values — marks only make the same targets fall earlier.
  if (s.mods.ranging && s.rangingFiredLeg < s.leg + 1) {
    s.rangingFiredLeg = s.leg + 1;
    let best: GroundTarget | null = null;
    let bd = Infinity;
    for (const g of s.grounds) {
      if (g.dead || g.marked) continue;
      const dwy = g.wy - s.wy;
      if (dwy < 0 || dwy > RANGING_RANGE * s.k || dwy >= bd) continue;
      bd = dwy;
      best = g;
    }
    if (best) {
      best.marked = true;
      if (best.kind === "base") best.hp = Math.max(1, best.hp - 1);
      float(s, best.x, best.wy + 30 * s.k, "MARKED");
      if (!s.sawRanging) {
        s.sawRanging = true;
        s.banner = { txt: COMBO_RANGING_NAME, t: 1.1 };
      }
    }
  }
}

function explodeBomb(s: WarState, b: Bomb) {
  b.dead = true;
  s.bombsLanded++;
  const k = s.k;
  let onTarget = false;
  // CHAIN: scoring ground kills produced by THIS blast. A base left standing
  // on 1 hp does not count -- the bonus pays for the double kill, not for the
  // splash. Each bomb of a TWIN RACK pair runs its own explodeBomb, so each
  // can chain on its own.
  let blastKills = 0;
  burst(s, b.x, b.wy, 14, 200 * k, "spark", 2.4 * k);
  burst(s, b.x, b.wy, 7, 60 * k, "smoke", 5 * k);
  s.shake = Math.max(s.shake, 7);
  for (const g of s.grounds) {
    if (g.dead) continue;
    const reach = BLAST * k + g.w + (g.marked ? MARK_GRACE * k : 0);
    if (Math.hypot(b.x - g.x, b.wy - g.wy) < reach) {
      onTarget = true;
      g.hp--;
      g.hit = 0.2;
      if (g.hp <= 0) {
        g.dead = true;
        g.burn = 0.001;
        blastKills++;
        // hit-stop GRADUATED by target value: fighter 0.03 < AA 0.035 < tank
        // 0.045 < base 0.07 < flagship 0.14, monotonic with the point table
        if (g.kind === "tank") {
          score(s, TANK_PTS, "bomb", g.x, g.wy + 26 * k, "TANK", false);
          s.freeze = Math.max(s.freeze, 0.045);
        } else if (g.kind === "turret") {
          score(s, TURRET_PTS, "bomb", g.x, g.wy + 26 * k, "TURRET DOWN", false);
          s.freeze = Math.max(s.freeze, 0.05);
        } else if (g.kind === "flagship") {
          score(s, FLAGSHIP_PTS, "bomb", g.x, g.wy + 50 * k, "FLAGSHIP DOWN", true);
          s.freeze = Math.max(s.freeze, 0.14); // the biggest hit-stop in the game
          s.shake = Math.max(s.shake, 14);
          burst(s, g.x, g.wy, 26, 270 * k, "spark", 3.4 * k);
          burst(s, g.x, g.wy, 14, 100 * k, "smoke", 6.5 * k);
        } else {
          score(s, BASE_PTS, "bomb", g.x, g.wy + 40 * k, "BASE DOWN", true);
          s.freeze = Math.max(s.freeze, 0.07);
          burst(s, g.x, g.wy, 16, 230 * k, "spark", 2.8 * k);
        }
      } else if (g.kind === "base" || g.kind === "flagship") {
        float(s, g.x, g.wy + 40 * k, `${g.hp} TO GO`);
      }
    }
  }
  for (const a of s.aas) {
    if (a.dead) continue;
    if (Math.hypot(b.x - a.x, b.wy - a.wy) < BLAST * k + 13 * k) {
      onTarget = true;
      a.dead = true;
      a.ko = 0.5;
      blastKills++;
      score(s, AA_PTS, "bomb", a.x, a.wy + 26 * k, "AA NEST", false);
      s.freeze = Math.max(s.freeze, 0.035);
    }
  }
  if (blastKills >= 2 && s.chains < CHAIN_CAP) {
    s.chains++;
    s.score += CHAIN_PTS;
    float(s, b.x, b.wy - 18 * k, `CHAIN +${CHAIN_PTS}`);
    s.freeze = Math.max(s.freeze, 0.06);
  }
  if (onTarget) s.bombsOnTarget++;
}

/** Squared distance from a point to a segment (the balloon cable test). */
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t;
  const qy = ay + dy * t;
  return (px - qx) * (px - qx) + (py - qy) * (py - qy);
}

// ── step ───────────────────────────────────────────────────────────────────
/** Advance one frame. Pointer coords in `input` are CANVAS/VIEW coordinates:
 * nothing scrolls laterally, so world x == screen x and RunShell needs no
 * pointerTransform. Consumes ZERO gameplay rng: the plan was rolled at
 * construction. */
export function stepWarhawks(s: WarState, dt: number, input: SimInput): void {
  const k = s.k;

  // cosmetic clocks always run
  s.clock += dt;
  if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 26);
  if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 2);
  if (s.muzzle > 0) s.muzzle = Math.max(0, s.muzzle - dt);
  if (s.flagshipRevealT > 0) s.flagshipRevealT = Math.max(0, s.flagshipRevealT - dt);
  if (s.banner) {
    s.banner.t -= dt;
    if (s.banner.t <= 0) s.banner = null;
  }
  for (const p of s.parts) {
    p.x += p.vx * dt;
    p.wy += p.vwy * dt;
    p.life -= dt;
    if (p.kind === "smoke") p.r += 8 * dt;
  }
  s.parts = s.parts.filter((p) => p.life > 0);
  // floaters drift UP the screen: they must outrun the camera to do it
  for (const f of s.floats) {
    f.wy += (SCROLL + 26) * k * dt;
    f.life -= dt;
  }
  s.floats = s.floats.filter((f) => f.life > 0);
  for (const tr of s.trail) tr.life -= dt * 0.9;
  s.trail = s.trail.filter((tr) => tr.life > 0);
  for (const g of s.grounds) {
    if (g.hit > 0) g.hit = Math.max(0, g.hit - dt);
    if (g.dead && g.burn > 0 && g.burn < 1) g.burn = Math.min(1, g.burn + dt * 2);
  }
  for (const a of s.aas) {
    if (a.hit > 0) a.hit = Math.max(0, a.hit - dt);
    if (a.ko > 0) a.ko = Math.max(0, a.ko - dt);
  }

  // tap detection runs in every phase (X-only movement, see header)
  const freshDown = input.down && !s.wasDown;
  if (freshDown && input.px != null) {
    s.downT = 0;
    s.downX = input.px;
    s.downMoved = 0;
  }
  if (input.down) {
    s.downT += dt;
    if (input.px != null) s.downMoved = Math.max(s.downMoved, Math.abs(input.px - s.downX));
  }
  const released = !input.down && s.wasDown;
  s.wasDown = input.down;
  const spaceEdge = input.space && !s.wasSpace;
  s.wasSpace = input.space;

  if (s.phase === "intro") {
    // ── LOADOUT: the paused build-choice moment. The world is fully halted
    // (nothing below this advances during intro), so this is read, not timed
    // pressure. Left half of the corridor = ESCORT (tankier, slower roll),
    // right half = STRIKE (the baseline). Live preview while held; whichever
    // side was last held wins at commit. Deliberately resolved through the
    // EXISTING hold gesture (no new input grammar): the oracle bot always
    // returns NEUTRAL (down:false) before phase "play", so an unmodified
    // intro — and every recorded tape — commits the default (STRIKE,
    // loadout 0) with zero behavior change.
    if (input.down && input.px != null) {
      s.loadout = input.px < s.viewW / 2 ? 1 : 0;
    }
    s.phaseT -= dt;
    if (s.phaseT <= 0) {
      if (s.loadout === 1) {
        // ESCORT: committed once, here, never rerolled after
        s.maxHits += 1;
        s.mods.rollMul *= 0.88;
      }
      s.phase = "play";
      s.banner = { txt: "LEG 1", t: 1.2 };
    }
    return;
  }
  if (s.phase === "ko" || s.phase === "over") {
    if (s.phase === "ko") {
      // the doomed plane falls out of formation (cosmetic; run already decided)
      if (s.died) {
        s.vx *= 1 - Math.min(1, dt * 1.6);
        s.x += s.vx * dt;
        s.wy += SCROLL * 0.3 * k * dt; // drops back down the screen
      } else {
        // wheels down: it flies on and settles onto the strip
        s.x += (s.viewW / 2 - s.x) * Math.min(1, 2.4 * dt);
        s.wy += SCROLL * 0.7 * k * dt;
      }
      s.phaseT -= dt;
      if (s.phaseT <= 0) s.over = true;
    }
    return;
  }
  if (s.freeze > 0) {
    s.freeze = Math.max(0, s.freeze - dt);
    return;
  }

  s.t += dt;
  if (s.gunCd > 0) s.gunCd = Math.max(0, s.gunCd - dt);
  if (s.bombCd > 0) s.bombCd = Math.max(0, s.bombCd - dt);
  if (s.iframes > 0) s.iframes = Math.max(0, s.iframes - dt);
  if (s.rapidT > 0) s.rapidT = Math.max(0, s.rapidT - dt);

  // ── flying: hold = fly toward the held X; nothing held = the torque roll ──
  const maxV = ROLL * s.mods.rollMul * k;
  let wantVx: number;
  // VERTICAL AUTHORITY, the change that makes this the reference game again.
  // A held pointer is an absolute heading on BOTH axes now; the arrows drive
  // it. Fighters climbing onto your tail can finally be answered.
  let wantVy = 0;
  const steering = input.down && s.downT >= TAP_STEER_MIN && input.px != null;
  if (steering && input.px != null) {
    // the COMMANDED heading is clamped inside the corridor: a fat thumb on the
    // very edge can never fly you into a ridge.
    s.targetX = Math.max(s.laneMin + LANE_MARGIN * k, Math.min(s.laneMax - LANE_MARGIN * k, input.px));
    wantVx = Math.max(-maxV, Math.min(maxV, (s.targetX - s.x) * 3.2));
    if (input.py != null) {
      // Screen y falls as world y rises, hence the sign: dragging UP the
      // screen pushes the plane FORWARD along the road.
      const wantSy = Math.max(s.H * PY_MIN_FRAC, Math.min(s.H * PY_MAX_FRAC, input.py));
      const dSy = planeScreenY(s) - wantSy;
      wantVy = Math.max(-PITCH_V * k, Math.min(PITCH_V * k, dSy * 3.0));
    }
  } else if (input.left !== input.right && (input.left || input.right)) {
    wantVx = input.left ? -maxV : maxV;
  } else {
    wantVx = -DRIFT * k; // the torque roll: a drift now, not a death sentence
  }
  if (input.up !== input.downKey && (input.up || input.downKey)) {
    wantVy = input.up ? PITCH_V * k : -PITCH_V * k;
  }
  s.vx += (wantVx - s.vx) * Math.min(1, VX_EASE * dt);
  s.x += s.vx * dt;
  // THE EDGE IS A WALL, NOT A DEATH. This called downPlane("terrain") -- an
  // instant kill, on a boundary the uncommanded torque roll actively pushes
  // you toward. Mike, first thing: "Dying immediately by going to the edge is
  // bad." The reference (S3 Asteroid Raid) clamps and does nothing else, and
  // it is right: a shooter should threaten you with things you can shoot at,
  // not with the walls of its own corridor.
  if (s.x <= s.laneMin || s.x >= s.laneMax) {
    const atLeft = s.x <= s.laneMin;
    s.x = Math.max(s.laneMin, Math.min(s.laneMax, s.x));
    if (atLeft ? s.vx < 0 : s.vx > 0) s.vx = 0; // stop against it, never bounce
  }
  // THE CAMERA advances at exactly SCROLL, forever. That is what keeps the leg
  // pacing, the spawn schedule and the run's length in seconds identical to
  // before the plane could move on this axis at all.
  s.camWy += SCROLL * k * dt;
  s.wy += (SCROLL * k + wantVy) * dt;
  // SOFT BAND. Nothing here is lethal: you stop at the edge of the window and
  // keep flying, which is the reference's rule and the opposite of what this
  // game shipped with.
  {
    const top = s.camWy + s.planeSy - s.H * PY_MIN_FRAC;
    const bot = s.camWy + s.planeSy - s.H * PY_MAX_FRAC;
    if (s.wy > top) s.wy = top;
    if (s.wy < bot) s.wy = bot;
  }

  // ── FUEL. The clock that replaced the lethal corridor edge. ─────────────
  s.fuel -= FUEL_DRAIN * dt;
  if (s.fuel <= 0) {
    s.fuel = 0;
    downPlane(s, "fuel");
    return;
  }

  // ── PICKUPS, swept up by flying over them. Both pay ZERO points. ────────
  for (const d of s.drops) {
    if (d.life <= 0) continue;
    d.life -= dt;
    if (d.life <= 0) continue;
    if (Math.hypot(d.x - s.x, d.wy - s.wy) > (DROP_R + PLANE_R) * k) continue;
    d.life = 0;
    if (d.kind === "repair") {
      // The answer to the softened midair: hull back, one chip at a time.
      if (s.hits > 0) {
        s.hits--;
        float(s, d.x, d.wy, "PATCHED", true);
      } else {
        s.fuel = Math.min(FUEL_MAX, s.fuel + FUEL_PER_PICKUP);
        float(s, d.x, d.wy, "FUEL");
      }
    } else if (d.kind === "rapid") {
      // Cadence only, and timed: the documented ceiling-safe family (it cannot
      // add a target, a point value or a second to the run).
      s.rapidT = RAPID_T;
      float(s, d.x, d.wy, "GUNS HOT", true);
    } else if (d.kind === "fuel") {
      s.fuel = Math.min(FUEL_MAX, s.fuel + FUEL_PER_PICKUP);
      float(s, d.x, d.wy, "FUEL");
    } else if (s.gunLvl < GUN_LVL_MAX) {
      s.gunLvl++;
      float(s, d.x, d.wy, `GUNS ${s.gunLvl}`, true);
    } else {
      s.fuel = Math.min(FUEL_MAX, s.fuel + FUEL_PER_PICKUP);
      float(s, d.x, d.wy, "FUEL");
    }
  }
  s.drops = s.drops.filter((d) => d.life > 0);

  // contrail (cosmetic, deterministic): world-fixed dots left behind, so they
  // slide down the screen exactly like real smoke hanging in the air
  s.trailCd -= dt;
  if (s.trailCd <= 0 && s.trail.length < TRAIL_CAP) {
    s.trailCd = 0.05;
    s.trail.push({ x: s.x, wy: s.wy - 14 * k, life: 1 });
  }

  // ── COMBO, CONTRAIL VEIL (Engine >= 3 AND Smoke >= 3) ────────────────────
  if (s.mods.veil) {
    if (s.veilT > 0) {
      s.veilT = Math.max(0, s.veilT - dt);
      if (s.veilT === 0) {
        s.veilCharge = 0;
        s.veilStill = 0;
      }
    } else if (Math.abs(s.vx) > maxV * 0.45) {
      s.veilStill = 0;
      s.veilCharge += dt;
      if (s.veilCharge >= VEIL_CHARGE_T) {
        s.veilT = VEIL_T;
        burst(s, s.x, s.wy - 10 * k, 8, 60 * k, "smoke", 3.2 * k);
        if (!s.sawVeil) {
          s.sawVeil = true;
          s.banner = { txt: COMBO_VEIL_NAME, t: 1.1 };
        }
      }
    } else {
      s.veilStill += dt;
      if (s.veilStill >= VEIL_BREAK_T) s.veilCharge = 0;
    }
  }

  // ── the guns (AUTOMATIC) and the bomb (any tap, or space) ────────────────
  // 2026-07-28: the guns used to ride the same quick-tap the bomb double-tap
  // rode, so the player was tapping to shoot AND tapping twice to bomb off one
  // gesture. That is the "confusing controls" Mike hit. The guns now run
  // themselves on their own cooldown, exactly as fast as a perfect tapper
  // could have driven them, and the pointer is free to do ONE job: bombs.
  if (s.gunCd <= 0 && s.burstLeft <= 0) {
    // MID-RUN GROWTH, GUNS HOT (leg 2 on, see WarState.sawGunsHot): the SAME
    // trigger, just a shorter wait before it can fire again.
    // The gun level shortens the interval. Ceiling-neutral: the roster of
    // targets and their values are fixed, so a faster gun only makes the same
    // maximum easier to approach -- the same rule every stat modifier follows.
    s.gunCd =
      Math.min(
        s.leg >= 1 ? GUN_CD_HOT : GUN_CD,
        GUN_CD_BY_LVL[Math.max(0, Math.min(GUN_LVL_MAX, s.gunLvl))],
      ) * (s.rapidT > 0 ? RAPID_CD_MUL : 1);
    s.burstLeft = s.mods.burstN;
    s.burstT = 0;
    s.burstIdx = 0;
  }
  // ONE tap = ONE bomb. No double-tap gesture, so no commit delay, so the
  // pipper on the HUD is now the true impact point (see PIPPER_LEAD).
  if (released && s.downT < TAP_MAX_T && s.downMoved < TAP_MAX_MOVE * k) {
    dropBomb(s);
  }
  if (spaceEdge) dropBomb(s);
  if (s.burstLeft > 0) {
    s.burstT -= dt;
    while (s.burstT <= 0 && s.burstLeft > 0) {
      s.burstLeft--;
      s.burstT += BURST_DT;
      fireOneTracer(s);
    }
  }

  // ── leg chain ────────────────────────────────────────────────────────────
  if (s.leg < 3 && s.wy >= s.legEnds[s.leg]) {
    const bonus = LEG_BONUS[s.leg];
    s.score += bonus;
    float(s, s.x, s.wy + 34 * k, `LEG ${s.leg + 1} CLEAR +${bonus}`, true);
    s.leg++;
    if (s.leg >= 3) {
      // leg 3 clears into the STRIP, not an instant win: the flagship's home
      // stretch begins. Landing waits below, once s.wy crosses s.W.
      s.banner = { txt: "FINAL APPROACH", t: 1.4 };
    } else {
      s.banner = { txt: `LEG ${s.leg + 1}`, t: 1.2 };
    }
  }

  // ── MID-RUN GROWTH banners, GUNS HOT / TWIN RACK: the gun trigger and
  // dropBomb above already read s.leg directly, so these two flags are only
  // the "already announced" latch. Queued behind whatever is already
  // showing (the leg-clear banner above, most often) via the same
  // only-when-clear pattern the beats below and the flagship reveal's own
  // field use — the condition stays true every subsequent frame, so a busy
  // banner just delays the announcement, it never loses it. ──────────────
  if (!s.sawGunsHot && s.leg >= 1 && !s.banner) {
    s.sawGunsHot = true;
    s.banner = { txt: "GUNS HOT", t: 1.1 };
  }
  if (!s.sawTwinRack && s.leg >= 2 && !s.banner) {
    s.sawTwinRack = true;
    s.banner = { txt: "TWIN RACK", t: 1.1 };
  }
  // ── LEG 1's named beat, FLAK ALLEY: fires the instant you cross into the
  // pinched AA band (see AA_BAND). Position-triggered, not timed. ──────────
  if (!s.sawFlakAlley && s.leg === 0 && s.wy >= AA_BAND[0][0] * LEG_LEN[0] * k && !s.banner) {
    s.sawFlakAlley = true;
    s.banner = { txt: "FLAK ALLEY", t: 1.1 };
  }
  // ── LEG 3's named beat, STRONGPOINT: fires crossing into the pinched
  // armor band (see TANK_BAND). ─────────────────────────────────────────────
  if (
    !s.sawStrongpoint &&
    s.leg === 2 &&
    s.wy >= s.legEnds[1] + TANK_BAND[2][0] * LEG_LEN[2] * k &&
    !s.banner
  ) {
    s.sawStrongpoint = true;
    s.banner = { txt: "STRONGPOINT AHEAD", t: 1.1 };
  }

  // ── the flagship's boss reveal: one-shot, freeze + shake + a named plate
  // (the page owns the plate itself off flagshipRevealT; s.banner is never
  // touched here, so it can never collide with a leg/hit/combo banner) ──────
  if (!s.sawFlagship) {
    for (const g of s.grounds) {
      if (g.kind !== "flagship") continue;
      if (!g.dead && g.wy - s.wy < FLAGSHIP_REVEAL_RANGE * k) {
        s.sawFlagship = true;
        s.flagshipRevealT = 1.1;
        s.freeze = Math.max(s.freeze, 0.5);
        s.shake = Math.max(s.shake, 12);
      }
      break;
    }
  }

  // ── landing: only once the whole world (leg 3 + the strip) is behind you ─
  if (s.leg >= 3 && s.wy >= s.W) {
    s.score += LANDING_BONUS;
    s.won = true;
    s.banner = { txt: `WHEELS DOWN +${LANDING_BONUS}`, t: KO_T };
    s.phase = "ko";
    s.phaseT = KO_T;
    return;
  }

  // ── AA nests: telegraphed flak ───────────────────────────────────────────
  for (const a of s.aas) {
    if (a.dead) continue;
    const dwy = a.wy - s.wy;
    if (dwy > AA_AHEAD * k || dwy < -AA_BEHIND * k) continue;
    a.cd -= dt;
    if (a.cd <= 0) {
      if (s.veilT > 0) {
        a.cd = 0.3; // untargetable: the gunners lose the track, retry shortly
      } else {
        a.cd = a.period;
        // the lock lands exactly where flying straight would put you, and
        // leads half your current slide: hold the slide and you fly into it
        const tele = FLAK_TELE + s.mods.teleBonus;
        s.teles.push({
          x: s.x + s.vx * tele * FLAK_VX_LEAD,
          wy: s.wy + SCROLL * k * tele,
          t: tele,
          total: tele,
          srcX: a.x,
          srcWy: a.wy,
        });
        s.telesFired++;
      }
    }
  }
  // ── ground turrets: a slow aimed fan, straight up at you ────────────────
  // Same window logic as an AA nest, but the threat is completely different:
  // flak is a telegraphed area you must not be standing in, a turret fan is a
  // set of solid lines you have to be somewhere else for. Firing them on an
  // index-staggered clock (see the spawn) means a row of turrets reads as a
  // rhythm rather than a wall.
  for (const g of s.grounds) {
    if (g.dead || g.kind !== "turret") continue;
    const dwy = g.wy - s.wy;
    if (dwy > TURRET_AHEAD * k || dwy < -TURRET_BEHIND * k) continue;
    g.fireCd -= dt;
    if (g.fireCd <= 0) {
      if (s.veilT > 0) {
        g.fireCd = 0.3; // untargetable while the smoke holds
      } else {
        g.fireCd = TURRET_CD * TIMER_FAC[legIdx(s)];
        firePat(s, g.x, g.wy, "turret");
      }
    }
  }

  for (const tl of s.teles) {
    tl.t -= dt;
    if (tl.t <= 0) {
      s.bursts.push({ x: tl.x, wy: tl.wy, r: FLAK_R * k, life: FLAK_LIFE, hitDone: false });
      s.burstsBloomed++;
      burst(s, tl.x, tl.wy, 8, 120 * k, "smoke", 3 * k);
    }
  }
  s.teles = s.teles.filter((tl) => tl.t > 0);
  for (const fb of s.bursts) {
    fb.life -= dt;
    if (!fb.hitDone && Math.hypot(s.x - fb.x, s.wy - fb.wy) < fb.r + PLANE_R * k * 0.5) {
      fb.hitDone = true;
      damagePlane(s, "flak");
    }
  }
  s.bursts = s.bursts.filter((fb) => fb.life > 0);

  // ── fighters ─────────────────────────────────────────────────────────────
  const behindEdge = s.H - s.planeSy; // px of world visible BEHIND the plane
  for (const f of s.fighters) {
    if (f.hit > 0) f.hit = Math.max(0, f.hit - dt);
    if (f.dead) {
      if (f.ko > 0) {
        f.ko -= dt;
        f.wy -= 260 * k * dt; // the wreck falls away down the screen
        f.x += f.vx * 0.4 * dt;
      }
      continue;
    }
    if (f.state === "wait") {
      if (s.wy >= f.trigger) {
        if (f.kind === "dive") {
          f.state = "dive";
          // enter just off the TOP edge, in formation
          f.wy = s.wy + s.planeSy + 46 * k + f.offWy;
          f.x = f.entryX;
          f.vwy = -DIVE_V * k;
          f.vx = 0;
        } else if (f.kind === "climb") {
          f.state = "approach";
          // come up from just off the BOTTOM edge
          f.wy = s.wy - behindEdge - 46 * k;
          f.x = f.entryX;
          f.vwy = (SCROLL + CLIMB_APPROACH) * k;
          f.vx = 0;
        } else {
          // FLANK: enters already at speed, just off a ridge, at a fixed
          // close row ahead (FLANK_LEAD) it will hold for its whole pass —
          // see the FLANK_LEAD doc above for why that row never closes.
          f.state = "flank";
          f.wy = s.wy + FLANK_LEAD * k;
          f.x = f.entryX; // set at construction: laneMin-pad or laneMax+pad
          f.vwy = SCROLL * k;
          f.vx = -f.side * FLANK_VX * k; // entering from the left sweeps right
        }
      }
      continue;
    }
    if (f.state === "gone") continue;

    if (f.kind === "dive") {
      // slides toward your lane on the way down, one aimed burst, then past
      f.vx = Math.max(-DIVE_TRACK * k, Math.min(DIVE_TRACK * k, (s.x - f.x) * 0.6));
      // A WEAVER jinks while it comes. It still closes on your lane (the term
      // above is untouched), it is just no longer a straight line you can lead
      // by standing still. Pure function of sim time and the fighter's id, so
      // it replays identically.
      if (f.weave) f.vx += Math.cos(s.t * 3.2 + f.wave * 1.7) * 26 * k;
      f.x += f.vx * dt;
      f.wy += f.vwy * dt;
      const dwy = f.wy - s.wy;
      if (!f.fired && dwy < DIVE_FIRE_D * k && dwy > 0) {
        f.fireCd -= dt;
        if (f.fireCd <= 0) {
          if (s.veilT > 0) f.fireCd = 0.25;
          else {
            f.fired = true;
            if (f.gun) {
              // the gunship's signature: a wide slow 5-fan you WEAVE, not
              // outrun — distinct from every leg's dive fan by shape alone
              firePattern(s, f.x, f.wy, { n: 5, spread: 0.62, speed: 215, mode: "aimed" });
            } else {
              firePat(s, f.x, f.wy, "dive");
            }
          }
        }
      }
      if (dwy < -behindEdge - 60 * k) f.state = "gone"; // missed: it flew the pass
    } else if (f.kind === "climb") {
      f.stateT += dt;
      if (f.state === "approach") {
        f.vwy = (SCROLL + CLIMB_APPROACH) * k;
        f.vx = Math.max(-TAIL_TRACK * k, Math.min(TAIL_TRACK * k, (s.x - f.x) * 1.4));
        if (f.wy >= s.wy - CHASE_GAP * k) {
          f.state = "chase";
          f.stateT = 0;
          f.fireCd = 0.7;
        }
      } else if (f.state === "chase") {
        // LEG 2's named beat, ACE (see Fighter.ace): the reveal fires the
        // instant it settles onto your six, queued behind any banner already
        // showing exactly like the beats above.
        if (f.ace && !s.sawAce && !s.banner) {
          s.sawAce = true;
          s.banner = { txt: "ACE ON YOUR SIX", t: 1.1 };
        }
        // sits BELOW you on screen, where the forward guns cannot reach
        f.vwy = SCROLL * k;
        f.vx = Math.max(-TAIL_TRACK * k, Math.min(TAIL_TRACK * k, (s.x - f.x) * 1.4));
        f.fireCd -= dt;
        if (f.fireCd <= 0) {
          if (s.veilT > 0) f.fireCd = 0.25;
          else {
            f.fireCd = f.period;
            firePat(s, f.x, f.wy, "chase");
          }
        }
        if (f.stateT >= CHASE_T) {
          f.state = "overtake";
          f.stateT = 0;
        }
      } else if (f.state === "overtake") {
        f.vwy = (SCROLL + CLIMB_OVERTAKE) * k;
        f.vx = Math.max(-30 * k, Math.min(30 * k, (s.x + 40 * k - f.x) * 0.8));
        if (f.wy > s.wy + AHEAD_LEAD * k) {
          f.state = "ahead";
          f.stateT = 0;
        }
      } else if (f.state === "ahead") {
        // the kill window: it levels off ahead of your guns
        f.vwy = (SCROLL + AHEAD_V) * k;
        f.vx = 0;
        if (f.stateT >= AHEAD_T) {
          f.state = "leave";
          f.stateT = 0;
        }
      } else if (f.state === "leave") {
        f.vwy = (SCROLL + 110) * k;
        f.vx = (f.x < s.viewW / 2 ? -70 : 70) * k;
        if (f.wy > s.wy + s.planeSy + 90 * k) f.state = "gone"; // missed
      }
      f.x += f.vx * dt;
      f.wy += f.vwy * dt;
    } else {
      // FLANK: a straight cut across the corridor at a fixed row (see
      // FLANK_LEAD) — it never closes on your row, so it is never a body
      // collision (see the plane-collision test below: separation always
      // exceeds that radius), only a gun target and one aimed burst timed to
      // when it is roughly overhead, the moment it is most worth reacting to.
      f.x += f.vx * dt;
      f.wy += f.vwy * dt;
      if (!f.fired && Math.abs(f.x - s.x) < FLANK_FIRE_W * k) {
        f.fired = true;
        firePat(s, f.x, f.wy, "flank");
      }
      const clearedFar = f.side < 0 ? f.x > s.laneMax + FLANK_EDGE_PAD * k : f.x < s.laneMin - FLANK_EDGE_PAD * k;
      if (clearedFar) f.state = "gone"; // cleared the far edge: the pass is over
    }

    // plane collision: normally fatal; RAM survives exactly one, destroying it
    if (f.state !== "gone" && Math.hypot(f.x - s.x, f.wy - s.wy) < (FIGHTER_R + PLANE_R * 0.9) * k) {
      if (s.iframes > 0) continue;
      if (s.mods.ram && !s.ramUsed) {
        s.ramUsed = true;
        if (!s.sawRam) {
          s.sawRam = true;
          s.banner = { txt: COMBO_RAM_NAME, t: 1.1 };
        }
        killFighter(s, f);
        s.iframes = Math.max(s.iframes, 1.0);
        s.shake = Math.max(s.shake, 9);
      } else if (s.veilT > 0) {
        // Already phasing through: parity with damagePlane's dodge.
        continue;
      } else {
        // A MIDAIR IS EXPENSIVE, NOT INSTANT (Mike 2026-08-01: "you die too
        // easy"). Clipping a fighter used to end the run outright regardless
        // of how much hull was left, which is why most runs ended without the
        // hit counter ever mattering. It now costs TWO of the three chips and
        // buys a long mercy window -- fatal at full health only if you do it
        // twice, survivable once by anyone, and still the worst thing that can
        // happen to you short of the fuel running dry.
        //
        // The fighter is destroyed but pays NOTHING: ceiling() is an upper
        // bound, so forfeiting the points is always legal, and being paid for
        // a crash would make ramming a strategy.
        f.hp = 0;
        f.state = "gone";
        f.ko = 0.4;
        burst(s, f.x, f.wy, 14, 200 * k, "spark", 2.4 * k);
        s.hits += 2;
        s.shake = Math.max(s.shake, 12);
        if (s.hits >= s.maxHits) {
          downPlane(s, "collision");
          return;
        }
        s.iframes = Math.max(s.iframes, 1.6);
        s.banner = { txt: s.maxHits - s.hits === 1 ? "ONE HIT LEFT" : "MIDAIR", t: 1.0 };
      }
    }
  }


  // ── projectiles ──────────────────────────────────────────────────────────
  for (const tr of s.tracers) {
    if (tr.dead) continue;
    const SUB = 2;
    const sdt = dt / SUB;
    for (let i = 0; i < SUB && !tr.dead; i++) {
      tr.x += tr.vx * sdt;
      tr.wy += tr.vwy * sdt;
      tr.life -= sdt;
      if (tr.life <= 0) {
        tr.dead = true;
        break;
      }
      for (const f of s.fighters) {
        if (f.dead || f.state === "wait" || f.state === "gone") continue;
        if (Math.hypot(f.x - tr.x, f.wy - tr.wy) < f.r + TRACER_R * k) {
          f.hp -= tr.dmg;
          f.hit = 0.12;
          tr.dead = true;
          burst(s, tr.x, tr.wy, 3, 90 * k, "spark", 1.5 * k);
          if (f.hp <= 0) killFighter(s, f);
          break;
        }
      }
      if (tr.dead) break;
    }
  }
  s.tracers = s.tracers.filter((tr) => !tr.dead);

  for (const eb of s.ebullets) {
    if (eb.dead) continue;
    eb.x += eb.vx * dt;
    eb.wy += eb.vwy * dt;
    if (
      eb.wy < s.wy - behindEdge - 40 * k ||
      eb.wy > s.wy + s.planeSy + 40 * k ||
      eb.x < -40 * k ||
      eb.x > s.viewW + 40 * k
    ) {
      eb.dead = true;
      continue;
    }
    const near = Math.hypot(eb.x - s.x, eb.wy - s.wy);
    if (s.iframes <= 0 && s.veilT <= 0 && near < (PLANE_R + EB_R) * k) {
      eb.dead = true;
      damagePlane(s, "gunfire");
      continue;
    }
    // GRAZE. Deliberately NOT gated on iframes/veil: those exist so a hit does
    // not cascade, and taking the graze away in the moment right after a hit
    // would punish the recovery. One payment per bullet, ever.
    if (!eb.grazed && near < GRAZE_R * k) {
      eb.grazed = true;
      if (s.grazes < GRAZE_CAP) {
        s.grazes++;
        s.score += GRAZE_PTS;
      }
    }
  }
  s.ebullets = s.ebullets.filter((eb) => !eb.dead);

  // bombs: they keep the plane's forward momentum, so they hold the plane's
  // screen row while the ground scrolls down into the impact point
  for (const b of s.bombs) {
    if (b.dead) continue;
    b.wy += SCROLL * k * dt;
    b.t -= dt;
    if (b.t <= 0) explodeBomb(s, b);
  }
  s.bombs = s.bombs.filter((b) => !b.dead);
}

/**
 * OPTICS ("see first"): the next fighter formation about to enter, flagged
 * mods.warnLead seconds before its trigger. A pure READ of the seeded plan
 * (no rng, no state, no score); Optics 0 returns null forever.
 */
export function nextFighterWarning(
  s: WarState,
): { kind: FighterKind; x: number; heat: number } | null {
  const lead = s.mods.warnLead;
  if (lead <= 0 || s.phase !== "play") return null;
  let best: Fighter | null = null;
  let bestEta = Infinity;
  for (const f of s.fighters) {
    if (f.state !== "wait") continue;
    const eta = (f.trigger - s.wy) / (SCROLL * s.k);
    if (eta >= 0 && eta <= lead && eta < bestEta) {
      bestEta = eta;
      best = f;
    }
  }
  if (!best) return null;
  return { kind: best.kind, x: best.entryX, heat: Math.max(0, Math.min(1, 1 - bestEta / lead)) };
}

export function warDone(s: WarState): boolean {
  return s.over;
}
export function warScore(s: WarState): number {
  return s.score;
}

// ── the shareable grid (3 rows = legs; 5 cells = leg fifths by targets) ─────
export const SEG_RED = "\u{1F7E5}"; // every target in the fifth destroyed
export const SEG_ORANGE = "\u{1F7E7}"; // some destroyed
export const SEG_MISS = "⬛"; // none (or never reached)
export const MARK_DEATH = "\u{1F4A5}"; // the leg the plane went down in
export const MARK_LAND = "\u{1F3C1}"; // wheels down after leg 3

/** Pure read of the run's target tables (no rng, no mutation). Spoiler-free:
 * it encodes YOUR clears, never the layout. */
export function gridEmoji(s: WarState): string {
  const rows: string[] = [];
  for (let L = 0; L < 3; L++) {
    let row = "";
    for (let c = 0; c < GRID_CELLS; c++) {
      let total = 0;
      let dead = 0;
      for (const f of s.fighters) {
        if (f.leg === L && f.cell === c) {
          total++;
          if (f.dead) dead++;
        }
      }
      for (const a of s.aas) {
        if (a.leg === L && a.cell === c) {
          total++;
          if (a.dead) dead++;
        }
      }
      for (const g of s.grounds) {
        if (g.leg === L && g.cell === c) {
          total++;
          if (g.dead) dead++;
        }
      }
      row += total > 0 && dead >= total ? SEG_RED : dead > 0 ? SEG_ORANGE : SEG_MISS;
    }
    if (!s.won && s.diedLeg === L) row += MARK_DEATH;
    if (s.won && L === 2) row += MARK_LAND;
    rows.push(row);
  }
  return rows.join("\n");
}

/** 2340 -> "2,340" (manual so node/browser locales cannot diverge). */
export function fmtDamage(n: number): string {
  const str = String(Math.max(0, Math.round(n)));
  let out = "";
  for (let i = 0; i < str.length; i++) {
    const fromEnd = str.length - i;
    out += str[i];
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += ",";
  }
  return out;
}

/** The copyable share payload. MM-DD from the run's UTC day. Plain hyphen,
 * never an em-dash (the standing copy rule). */
export function sharePayload(dayKey: string, damage: number, grid: string): string {
  const mmdd = dayKey.slice(5);
  return `WARHAWKS ${mmdd} - ${fmtDamage(damage)} damage\n${grid}\nEvery sortie feeds the Column. tanks.web3guides.com`;
}

/**
 * The EXACT legit score ceiling, computed from the same tables the sim runs
 * on, so lib/s5/games maxScore can never drift from the game.
 *
 * Count-bound end to end: the corridor is a fixed length, every target exists
 * once at a seeded position (the flagship included — exactly one, always),
 * balloons pay nothing, and no stat, combo, the LOADOUT pick or either of
 * this pass's mid-run jumps (GUNS HOT, TWIN RACK) touches a count, a value or
 * SCROLL (LOADOUT trades hits-before-death and roll speed, GUNS HOT trades
 * gun cadence, TWIN RACK trades bombs-per-decision — the same
 * reach-not-points argument every stat makes, see their own docs above).
 * Takes NO stats and reads NO state on purpose: the answer is the same 6740
 * for a stock plane and a maxed one. Registry maxScore 7414 = ceiling + 10%
 * (harness check (e)).
 *
 * The `bombs` / `guns` split is the design contract in numbers: 4990 of the
 * 5670 target points (88.0%) can ONLY be taken off the bomb rack.
 */
export function ceiling(): {
  fighters: number;
  aa: number;
  tanks: number;
  turrets: number;
  graze: number;
  chains: number;
  bases: number;
  flagship: number;
  bonuses: number;
  landing: number;
  guns: number;
  bombs: number;
  total: number;
  maxRunSeconds: number;
} {
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  // FIGHTERS_PER_LEG (incl. its CLIMBERS_PER_LEG subset and the leg 2 ACE,
  // same points as any other) + FLANKERS_PER_LEG + the strip's own escort:
  // every air kill on the board, one FIGHTER_PTS each regardless of kind.
  const fighters =
    (sum(FIGHTERS_PER_LEG) + sum(FLANKERS_PER_LEG) + STRIP_CLIMBERS + STRIP_FLANKERS) * FIGHTER_PTS;
  const aa = sum(AA_PER_LEG) * AA_PTS;
  const tanks = sum(TANKS_PER_LEG) * TANK_PTS;
  const turrets = sum(TURRETS_PER_LEG) * TURRET_PTS;
  // Both new bonuses are FLAT and HARD-CAPPED, so each adds a constant the
  // ceiling can state exactly. That is the whole reason neither is a
  // percentage: a multiplier on the bomb economy would have to be priced at
  // full rate here and would push maxScore far past anything reachable.
  const graze = GRAZE_CAP * GRAZE_PTS;
  const chains = CHAIN_CAP * CHAIN_PTS;
  const bases = sum(BASES_PER_LEG) * BASE_PTS;
  const flagship = FLAGSHIP_PTS; // exactly one, always, on the strip
  const bonuses = sum(LEG_BONUS);
  const maxRunSeconds = INTRO_T + (sum(LEG_LEN) + STRIP_LEN) / SCROLL + KO_T;
  return {
    fighters,
    aa,
    tanks,
    turrets,
    graze,
    chains,
    bases,
    flagship,
    bonuses,
    landing: LANDING_BONUS,
    guns: fighters,
    bombs: aa + tanks + turrets + bases + flagship,
    maxRunSeconds,
    total:
      fighters +
      aa +
      tanks +
      turrets +
      bases +
      flagship +
      bonuses +
      LANDING_BONUS +
      graze +
      chains,
  };
}

/** True once bombing has locked out for the final approach to the true
 * touchdown line (see GEAR_DOWN_ZONE / dropBomb): the run's second announced
 * verb change, pure evasion for the close. Pure read, page-facing. */
export function gearDown(s: WarState): boolean {
  return s.leg >= 3 && s.W - s.wy < GEAR_DOWN_ZONE * s.k;
}

/** The one FLAGSHIP on the front, or undefined before construction finishes
 * (never null in practice — createWarhawks always pushes exactly one). Pure
 * read, page-facing: the renderer's entrance plate and HUD read off this
 * instead of re-deriving the search themselves. */
export function flagshipOf(s: WarState): GroundTarget | undefined {
  return s.grounds.find((g) => g.kind === "flagship");
}
