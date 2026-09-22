/**
 * WARPATH — pure simulation (no React, no DOM, no three.js, no "@/"
 * imports). The page composes { ...SIM, draw }; this module also runs headless
 * in node (npx tsx) to prove determinism: same seed + same input script =
 * identical final score, byte for byte.
 *
 * THE LOOP: you are the LAST TANK guarding a stalled supply convoy on the
 * valley road. Five trucks sit in a line across the middle of the map. Threats
 * push in from BOTH FLANKS at once, north bank and south bank: sappers with
 * satchel charges (they walk to a truck, plant, and blow it; the page draws
 * them as tracked DEMOLITION DRONES, machines-only), armored cars (stand off
 * and shell the convoy), and HEAVIES that need real focus to kill. Your gun
 * has a hard RANGE and your TURRET SLEWS, so you physically cannot cover both
 * banks. The game is POSITIONAL TRIAGE: read which wave is the real threat,
 * commit to it, and race your turret back when you guess wrong.
 *
 * WORLD-SPACE (the 2026-07 rework, slate plan section 6): the sim runs in
 * WORLD coordinates. createWarpath takes the VIEW size and builds a world
 * WORLD_SCALE_X (1.9) view widths wide by WORLD_SCALE_Y (1.6) view heights
 * tall; k stays VIEW-scaled (k = viewW / 480) so every tuning constant keeps
 * its meaning. The convoy spreads its five trucks along CONVOY_SPREAD (1.4)
 * view widths of road, so one screen can no longer see the whole line and
 * DRIVING becomes the core verb, not just the crate run. Spawn banks stay
 * north/south (now the world's edges), drops keep DROP_KEEPOUT against the
 * road in world coords. The page owns the camera; RunShell's pointerTransform
 * hands this sim WORLD pointer coordinates, so the input contract is
 * unchanged in kind and input tapes replay identically headless.
 *
 * THE SIGNATURE MECHANIC, SUPPLY DROPS: a crate parachutes into the OPEN FIELD
 * away from the road every DROP_INTERVAL seconds. You have to physically drive
 * out and take it, which means abandoning your post on purpose. It is an
 * anti-camping mechanic and a risk dial in one: greedy players lose trucks,
 * timid players run dry.
 *
 * POWER-UP CRATES (the 2026-07-25 round-2 tune): every OTHER crate carries a
 * timed POWER-UP instead of the repair kit; the parity is a plain counter off
 * the time-based drop schedule, so seed + inputs still fix the whole
 * sequence. The pool (picked by the SAME single rng roll spawnDrop always
 * made, so the draw order never forks): AMMO (faster cycle) and TWIN GUN (the
 * two originals), SPREAD SHOT (a 3-shell fan, SPREAD_T), DOUBLE SHOT (half
 * fire cooldown, RAPID_T), SPEED BOOST (HASTE_MUL hull speed, HASTE_T) and
 * RANGE BOOST (RANGE_MUL shell reach, RANGE_T). Odd crates are the repair
 * kit. CEILING DISCIPLINE, the clear-bound-safe argument: every buff raises
 * fire DENSITY or REACH only. Kills are count-bound per wave (waveComp fixes
 * the roster and each kill pays its SPAWN wave's multiplier), so clearing
 * faster only ever advances a wave EARLY, which SHORTENS the run and a
 * shorter run sees FEWER crates. No buff adds a count, a value or a wave, and
 * every crate still pays the same flat DROP_POINTS whatever its kind, so no
 * power-up crate has ever moved ceiling() below: it returns exactly 6357 (the
 * VARIETY & ARC pass's number; see that function's own docstring).
 *
 * NO TIMER, SKILL EXTENDS THE RUN: waves escalate until the convoy dies.
 * Losing a truck does NOT end the run, only the LAST truck does, which is what
 * gives the run its "barely held" drama arc. A wave advances when it is
 * cleared OR when WAVE_MAX_T runs out, so clearing fast is how a good player
 * buys more waves per minute. RUN_MAX_WAVES caps the run at a relief column
 * arriving, which is what makes the score ceiling finite and provable.
 *
 * DETERMINISM: two RNG streams from the one seed. `rng` = gameplay (spawn
 * side, spawn lane, enemy fire jitter, drop kind and drop position) consumed
 * in a FIXED order and never from draw. `rngFx` = cosmetics only (particles,
 * scenery), so the prefers-reduced-motion particle cap can never shift a
 * gameplay roll. Math.random appears NOWHERE in this file.
 * RNG DISCIPLINE ACROSS THE WORLD-SPACE REWORK: the draw ORDER is preserved
 * exactly. Construction still makes the SAME single gameplay roll (the
 * opening flank); every per-frame draw site (spawn lane x + enemy fire
 * cooldowns in spawnFoe, kind/x/bank/y in spawnDrop, the fire-cadence reroll)
 * is untouched; the rework's new mechanics (RANGING SHOT, the unmanned-line
 * collapse, the wave log) consume ZERO rng, so nothing needed appending at
 * the end of any frame's consumption. Only the RANGES the existing draws are
 * scaled into changed (world width/height instead of view width/height),
 * which is exactly the "constants + placement ranges" license the slate plan
 * grants. Old tapes are invalidated once by design; tape.ts carries the
 * re-recorded baseline (and notes the superseded pre-rework one).
 * RNG DISCIPLINE ACROSS THE ROUND-2 TUNE (2026-07-25): still zero new draws.
 * spawnDrop consumes its four rolls in the identical order (kind roll first,
 * then x, bank, y); the power-up parity gate only changes how the SAME kind
 * roll is INTERPRETED (even crates map it over the six-strong power pool, odd
 * crates ignore it and hand out the repair kit). The buff timers, the foe age
 * clock and the minimap feed are pure state, no rng. Tapes were re-recorded
 * once for the speed/slew retune, by design.
 *
 * PACING vs floorMs 60000, proven headless by scripts/s5-harness.ts:
 * - AFK (the STRICT gate): an input-less run triggers the UNMANNED LINE
 *   COLLAPSE (see detonate below): with nobody in the fight, the demolition
 *   charges gut the whole line and the convoy is lost in ~23s, far under the
 *   60s floor, scoring 0. It dies AND it can never bank. `touched` flips on
 *   the first real input (pointer down, any drive key, or space) and the
 *   collapse rule is inert from then on, so it can never alter the counts,
 *   values or schedule of a played run - only the survival of an idle one.
 * - A weak gunner (the stock-stats tape bot) still clears the floor with
 *   room; a strong one clears waves, banks repair crates and pushes deep into
 *   Act III. A death before the 60s floor shows its score but cannot bank
 *   (server floor). THE VARIETY & ARC PASS MEASURED (2026-07-26, see the
 *   pass's own note below): mid-skill zero-stat tape reaches wave 7 (~171s,
 *   score 1014); the max-stat oracle reaches wave 11 (~253s, score 2222,
 *   comfortably under ceiling 6357); idle still collapses at ~24s scoring 0.
 *   The speed/range buffs cannot rescue an idle run: picking a crate up
 *   requires driving out past DROP_KEEPOUT, which requires input, which flips
 *   `touched` first.
 *
 * SCORING (the registry math, lib/s5/games maxScore): see ceiling() at the
 * bottom, which computes the exact legit maximum from these same constants.
 *
 * UPGRADE STATS (ADR-0070 keys; see warpathMods below): a construction-time INPUT,
 * never a source of randomness, so seed + inputs + stats replays byte-
 * identically. Engine drives the hull, Armor thickens the hull and shortens the
 * track-out, Smoke lengthens the post-hit window, Caliber puts more weight
 * behind each shell, Optics flags the bank the next spawn walks in from. Every
 * one is CEILING-NEUTRAL: none of them touches waveComp, KILL_PTS, waveMult,
 * TRUCK_BONUS, DROP_POINTS, RELIEF_BONUS or RUN_MAX_WAVES, so ceiling() below
 * still computes exactly 6357 and maxScore 6993 still holds.
 *
 * THE CALIBER QUESTION, answered honestly: this game's waves are CLEAR-bound as
 * well as timeout-bound (advanceWave fires when the queue is empty AND the field
 * is clear, or at WAVE_MAX_T), so killing faster really does move the schedule.
 * It moves it the SAFE way: a cleared wave rolls on EARLY, which SHORTENS the
 * run, and a shorter run sees FEWER supply crates. RUN_MAX_WAVES caps the wave
 * count either way and every kill is worth its SPAWN wave's multiplier, so no
 * amount of Caliber adds a target, a wave or a crate. ceiling() deliberately
 * prices the LONGEST possible run (every wave riding out its full WAVE_MAX_T),
 * which is the strictly generous side of that trade.
 *
 * STAT SYNERGY COMBOS (see warpathMods below): named abilities that only exist
 * when TWO persistent stats both cross a threshold. DUST CLOUD (Engine >= 3 AND
 * Smoke >= 3) turns sustained driving into brief untargetability; RAM (Armor >=
 * 3 AND Engine >= 3) lets a moving hull crush a sapper on contact; RANGING SHOT
 * (Optics >= 3 AND Caliber >= 15, the franchise's third named combo) makes the
 * first shell of each wave MARK the wave's first heavy - a crit window: wider
 * hit grace on the marked hull and one armor pip free. They are derived from
 * the same frozen stats block, so they are inputs and not rolls. All three are
 * CEILING-NEUTRAL (the mark only makes the same fixed-count, fixed-value heavy
 * fall EARLIER, which shortens the run - the safe direction, same argument as
 * Caliber), and each announces itself with ONE banner the first time it fires
 * in a run. That banner is the whole tutorial: no tooltip, no menu.
 *
 * THE FINAL ACT (2026-07-26 B+ pass): waves 1-10 are UNCHANGED (same waveComp
 * formula, same ceiling contribution). Waves 11-15 now read LATE_COMP, a
 * hand-authored table replacing the formula's flat tail (which produced the
 * identical 5/6/3 mix for every wave from 10 through 15 - the "run peaks
 * early and coasts" defect). Each late wave has a distinct shape: 11 FLANK
 * SURGE (cars up), 12 ARMORED PUSH (heavies up), 13 SATCHEL STORM (a sapper
 * swarm), 14 STEEL WALL (heavies capped at 5, the toughest single wave), 15
 * FINAL ASSAULT (everything, the biggest wave in the game). startWave() also
 * now names the ACT on the wave-6 and wave-11 transitions (a visible
 * three-act arc: Act I 1-5, Act II 6-10, Act III 11-15) and gives wave 15 its
 * own entrance beat (freeze + shake, a "major entrance" same as a boss).
 *
 * THE FINAL ASSAULT GATE (a paused build-choice moment): when wave 14 clears,
 * advanceWave sets choicePending instead of the normal WAVE_BREAK. The run
 * PAUSES (spawns and the wave clock hold their breath, same philosophy as
 * highnoon's openChoices) for CHOICE_T seconds while a plate offers ONE tap:
 * LEFT of the hull (relative to s.px, camera-agnostic) picks IRON HULL
 * (+18% max hull, refilled); RIGHT picks HOT SHELLS (+25% shell damage for
 * the rest of the run, via choiceCaliberMul - a SEPARATE multiplier from
 * mods.shellDmg, because mods is frozen at construction and never mutated).
 * No pick before the timer runs out defaults to HOT SHELLS. Either buff is
 * the same ceiling-neutral family as Armor/Caliber (survival or clear-speed
 * only, never a count/value/wave), so it cannot move ceiling(). The GATE
 * ITSELF does: it replaces one WAVE_BREAK with (CHOICE_T + a short
 * CHOICE_CONFIRM_T breather before wave 15's entrance), and ceiling()'s
 * maxRunSeconds now derives that exactly instead of assuming 14 uniform
 * breaks, so maxDrops (and so ceiling().total) still cannot drift from what
 * the sim actually runs on.
 *
 * HIT-STOP, ROLLED OUT (was one call site: a heavy kill only): now graduated
 * by the moment's weight via the hitstop() helper below. Every kill (sapper
 * lightest, car mid, heavy heaviest), a detonation, a truck lost, an ordinary
 * hit and a track-out each bump s.freeze by their own amount; act transitions
 * and the two "major entrance" beats (FINAL ASSAULT, RELIEF COLUMN) bump it
 * hardest. s.freeze already made the whole step() function return early
 * (decrement and skip), so this was always a legal, deterministic pause - it
 * is simply used more often now, at magnitudes proven safe by the original
 * heavy-kill call site.
 *
 * KO PHYSICS: a killed foe's knockback (kvx/kvy) now decays under drag each
 * frame instead of sliding at constant speed for its whole s.ko window, which
 * reads as a real deceleration rather than a linear slide-and-vanish. KO'd
 * foes still take no part in any collision, scoring or targeting code (see
 * the `if (f.ko > 0) { ...; continue; }` guard at the top of the enemies
 * loop), so this is cosmetic-adjacent state with zero ceiling or determinism
 * risk - drag is a pure function of dt, no rng.
 *
 * TELEGRAPHS ON THE ENEMY: cars and heavies now carry f.telegraph, a 0..1
 * read of "how close is this shot" derived from the SAME f.fireCd the sim
 * already ran (no new rng, no new decision), so the page can draw a charging
 * glow on the hostile's own body instead of inferring it from a UI countdown.
 *
 * ALL OF THIS IS RNG-FREE. No new call to s.rng() or s.rngFx() was added
 * anywhere in this pass; the late-wave table, the choice gate, hitstop and KO
 * drag are all either fixed data or pure functions of dt/state, so the
 * existing "rng draw order is untouched" guarantee from the two passes above
 * still holds and old tapes are invalidated the same documented way (a
 * deliberate sim change), not by any new randomness.
 *
 * THE VARIETY & ARC PASS (2026-07-26): the operator's read after the B+ pass
 * scored 15/15 on the quality checklist - "just not good enough". The
 * checklist was twelve parts presentation and two parts mechanics, so a game
 * could pass it completely and still be dull, which is what had happened:
 * waves 1-10 all came from ONE growth formula (bigger numbers, same fight),
 * WAVE_BREAK was a dead 1.8s repeated fourteen times, a supply drop was the
 * only forced decision and it arrived once every 25s, and the "line is
 * longer than the screen" idea (this game's best one) was never leaned on -
 * threats never overlapped on purpose. Explicit operator instruction: improve
 * the games, don't cut them shorter. RUN_MAX_WAVES and WAVE_MAX_T, the two
 * knobs that actually set run length, are UNTOUCHED by this pass.
 * WHAT CHANGED:
 *  - waveComp/LATE_COMP/ASSAULT_NAME collapsed into ONE table, WAVE_SPEC,
 *    covering all fifteen waves: a hand-authored composition, a spawn
 *    PATTERN (trickle/pincer/burst/surge/chaos - see PATTERN_GAP) and a
 *    banner name for every one of them, so a wave is recognisable, not a
 *    number. Three acts that differ in KIND: Act I (1-5) teaches each threat
 *    alone, zero flank/shift; Act II (6-10) turns flank/shift ON (the new
 *    verb); Act III (11-15, the pre-existing B+ comps) wears that verb at
 *    higher volume plus the FINAL ASSAULT gate, so it compounds Act II
 *    instead of being Act I with more health.
 *  - FLANKING + SHIFTING (farthestTruckFromPlayer, SHIFT_INTERVAL): a tagged
 *    spawn targets the truck FARTHEST from the player instead of nearest,
 *    once at spawn for a sapper and repeatedly for a car/heavy while it
 *    holds. This is the "punish camping, force off station" mechanic and the
 *    "choose what to lose" mechanic in one: it is what makes two threats land
 *    in different places on purpose. Reads only s.px/s.py, zero rng.
 *  - WAVE_BREAK 1.8 -> 1.2 (kills the dead beats without touching the two
 *    run-length knobs); DROP_INTERVAL 25 -> 17 and FIRST_DROP_T 18 -> 13
 *    (raises decision frequency: this game's core verb is choosing where to
 *    be, and one forced choice every 25s was sparse for that).
 * TUNING, MEASURED NOT GUESSED: the first pass at WAVE_SPEC (busier totals,
 * heavier flank counts) sent the mid-skill oracle from wave 8 to wave 7 - fine
 * - but the max-stat oracle from wave 10 to wave 7, a real regression in
 * reachability, not just difficulty. The cause: startWave() never clears
 * s.foes, so a wave that times out without fully clearing bleeds its
 * survivors into the next wave, and busier waves + the pincer pattern's bank-
 * to-bank travel cost pushed several early waves past what either oracle
 * could clear inside WAVE_MAX_T, snowballing fast. Retuned down (see
 * WAVE_SPEC and PATTERN_GAP's current values) until the max-stat oracle
 * matched-or-beat the pre-pass baseline (wave 10 -> wave 11) while the
 * mid-skill oracle stayed close (wave 8 -> wave 7): both measured live via
 * the harness's own bot, not estimated.
 * CEILING: moved on purpose (kills 4387->4283, drops 510->720, total
 * 6251->6357) because DROP_INTERVAL and WAVE_BREAK are read directly by
 * ceiling()'s maxRunSeconds/maxDrops math; see ceiling()'s own docstring for
 * the full re-derivation. Flanking/shifting itself is ceiling-neutral by the
 * same argument as every prior targeting-only change in this file: it only
 * ever changes WHICH truck a fixed-count, fixed-value spawn walks toward or
 * re-aims at, never a count, a value or a wave.
 * RNG DISCIPLINE: still zero new draws. spawnFoe's two rolls (x-position,
 * fire-cooldown jitter) and spawnDrop's four rolls keep their exact order;
 * flank/shift/pattern selection are pure reads of state (s.px, s.py, s.wave,
 * a spawn index) or fixed data (WAVE_SPEC, PATTERN_GAP), so they consume
 * NOTHING from either stream. What changed is only how many times spawnFoe
 * and spawnDrop are CALLED over a run (the wave table and the drop interval),
 * the same category of change as every earlier pass. Tapes are invalidated
 * the same documented way (a deliberate sim change) and were re-recorded
 * once.
 */

export interface SimInput {
  px: number | null; // pointer x in canvas CSS px (null if never moved)
  py: number | null;
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

// ── tuning (view-space values scale by k = viewW/480 at init; the WORLD is
// WORLD_SCALE_X/Y times the view, so px-x-k constants keep their meaning) ────
export const INTRO_T = 1.6;
export const KO_T = 1.8;

// world (the camera rework). The state's W/H are WORLD dims from construction.
// Round-2 tune: 1.9/1.6 -> 1.8/1.5 (Mike: "a bit hard because its bigger");
// the convoy keeps its 1.4-view-width spread, so DRIVING stays the core verb
// and only the empty margins shrank.
// 1.8 -> 1.26 (Mike 2026-08-02: "The map is too big now, it takes forever
// just to drive around and find enemies. Increase the number of enemies and
// reduce the map by 30%"). X only: hunting is horizontal, the valley's
// vertical shape (banks, road) is the game's structure and stays.
export const WORLD_SCALE_X = 1.26; // world width = 1.26 x view width
export const WORLD_SCALE_Y = 1.5; // world height = 1.5 x view height
export const CONVOY_SPREAD = 1.4; // the truck line spans 1.4 view widths

// convoy
/**
 * THERE IS NO CONVOY. You are the spearhead.
 *
 * Mike, 2026-08-01: "The friendly vehicles are trucks that slide sideways and
 * do not shoot? I am confused what the purpose is." He was right to be. They
 * were friendly TANKS carrying Holdline's truck plumbing, disarmed weeks ago
 * (FRIENDS_SHOOT below), so what shipped was two allies that could not help,
 * drifted sideways when they crowded each other, and existed only to be
 * protected. A thing on screen that does nothing is worse than no thing.
 *
 * Removed the way this franchise removes things: THE SPAWNER GOES TO ZERO, not
 * a hundred and fifty call sites (the Warhawks balloon precedent). Every loop
 * over `s.trucks` now iterates an array that can never be non-empty, and the
 * consequences fall out of code that was already written for them:
 *   - foe targeting: `nearestTruck` returns -1 on an empty convoy, and -1
 *     already means THE PLAYER throughout the engage loop, so every enemy on
 *     the field now hunts your hull. The sim's own comment there anticipated
 *     exactly this ("a foe with no squadmate to shoot comes for your hull").
 *   - the AFK gate still bites: sappers walk to you, plant, and detonate, and
 *     the splash at the end of `detonate` is unconditional. Four charges kill
 *     an idle run against PLAYER_HP 100 (see the rewritten note there).
 *   - `ceiling()`'s survival term is `TRUCK_BONUS * TRUCKS * mult`, so it
 *     zeroes itself and the ceiling re-derives from the same tables.
 * The dead squad code below is left in place, unreachable, for one release
 * rather than ripped out mid-sprint; the registry comment carries the date.
 */
export const TRUCKS = 0;
export const FRIEND_NAMES = ["SARGE", "DIESEL"] as const;
export const FRIEND_HP = 60;
export const FRIEND_SPEED = 110;
/**
 * THE CONVOY DOES NOT SHOOT.
 *
 * Typed `boolean` rather than `false` on purpose: a literal-false const makes
 * the guarded block unreachable, which stops TypeScript narrowing `target`
 * inside it and buries the code under errors the moment anyone flips it back.
 */
export const FRIENDS_SHOOT: boolean = false;

export const FRIEND_RANGE = 110;
/**
 * HOW FAR FROM YOU A FRIENDLY WILL SHOOT.
 *
 * The real fix for "friendly AI still over powered". Cutting their count and
 * their range only slowed them down; they were still clearing the far side of
 * the field before the player got there, because nothing tied their engagement
 * to where the player actually was. Now they cover YOUR fight: a foe more than
 * this far from your hull is simply not their business, whatever their own
 * range says. They follow. They do not lead.
 */
export const SQUAD_LEAD_R = 210;
export const FRIEND_DMG = 1;
/* Raised from 1.9: about a third less damage per second from the squad, which
 * is the difference between "they cover me" and "they do it for me". */
export const FRIEND_FIRE_CD = 2.7;
/** How far a friendly will stray from you before it breaks off and rallies. */
export const FRIEND_LEASH = 260;
/** Aim error on a friendly shell, radians, full width. They cover you; they do
 *  not do it for you. */
export const FRIEND_SPREAD = 0.20;
/** Minimum spacing between friendly hulls, so the squad never stacks into one
 * dot. Resolved pairwise in fixed index order, so it is deterministic. */
export const FRIEND_SEP = 34;
export const TRUCK_HP = 160;
const TRUCK_W = 30; // px x k
const TRUCK_H = 15;
const TRUCK_R = 17; // collision radius, px x k

// player tank
const PLAYER_R = 13;
// 108 -> 118 (world-space rework) -> 140 (round-2 tune, Mike: "the tank needs
// to be a bit faster" on the bigger map; +18.6% on 118). Reach is not a bound
// in the generous-side ceiling arithmetic, so this is ceiling-neutral by
// construction.
const PLAYER_SPEED = 140; // px/s x k
const HULL_TURN = 5.2; // rad/s the hull swings toward its heading
// 3.8 -> 4.8 (round-2 tune, +26%): the slew is still THE triage cost, a 180
// turn now costs ~0.65s instead of ~0.83s. Mike: "the turret head of the tank
// needs to swivel faster."
/* rad/s. THE triage cost, and the whole reason positioning matters: a 180
 * traverse is 0.41s. Raised from 4.8 (0.65s) because Mike wanted the aim-first
 * rule back but faster -- the wait has to be short enough to feel responsive
 * and long enough that where you stand decides what you can shoot next. */
export const TURRET_SLEW = 7.6;
/** A queued shot older than this is forgotten: an order you gave a second ago
 *  was about a target you have probably stopped caring about. */
export const FIRE_QUEUE_T = 1.0;
/** Display only now. The gun NO LONGER waits to be inside this: a shot fired
 * mid-slew leaves along the current barrel angle and misses, which is the
 * whole skill. The client draws the reticle "aligned" state off this. */
const AIM_TOL = 0.1;

/** THE LOCK.
 *
 * The turret tracks the nearest live enemy by itself. Two rules keep that from
 * becoming a twitchy mess when a dozen tanks are milling around at similar
 * range:
 *   LOCK_MIN_T      a lock has to be at least this old before anything can
 *                   steal it, so two foes trading places at 0.1px do not make
 *                   the barrel stutter between them;
 *   LOCK_SWITCH_FRAC a challenger must be meaningfully closer (this fraction
 *                   of the current lock's distance), not merely closer.
 * The lock is held by monotonic foe ID, never an array index: the foes array
 * is filtered every frame, so an index would silently re-point at a different
 * tank the moment anything died. */
export const LOCK_MIN_T = 0.4;
export const LOCK_SWITCH_FRAC = 0.72;
export const LOCK_KEEP_RANGE_MUL = 1.15;
// Gunner training: at the moment of firing the shell snaps onto an INTERCEPT
// solution for any live foe already inside this cone. It never adds range and
// never picks a target the turret was not already pointed at, so the range +
// slew triage is untouched; it only forgives the fact that a tapped point goes
// stale while the turret slews. Deterministic, no rng.
const AIM_ASSIST = 0.16;
const STOP_R = 16; // px x k deadzone: hold near the tank to hold position
export const PLAYER_HP = 100;
const DISABLED_T = 3.0; // tracked out, not dead: the convoy eats the wave
const PLAYER_IFRAMES = 1.6;
const FIRE_CD = 0.55;
const FIRE_CD_AMMO = 0.34;
export const SHELL_SPEED = 430; // px/s x k
export const SHELL_RANGE = 165; // px x k. You cannot cover both banks at once
const SHELL_R = 4;

// enemies
const SAPPER_SPEED = 30;
const CAR_SPEED = 52;
const HEAVY_SPEED = 24;
const SAPPER_HP = 1;
const CAR_HP = 2;
const HEAVY_HP = 5;
const CAR_RANGE = 105; // px x k standoff from its target
const HEAVY_RANGE = 135;
const PLANT_R = 24; // px x k the sapper stops and plants
export const FUSE_T = 2.2;
const SAPPER_DMG = 45; // to the truck
const SAPPER_SPLASH = 46; // px x k
const SAPPER_SPLASH_DMG = 30; // to your tank
const CAR_DMG = 6;
const HEAVY_DMG = 22;
const CAR_SHELL_SPEED = 190;
const HEAVY_SHELL_SPEED = 150;
const AGGRO_R = 115; // px x k: park in front of the convoy and they shoot YOU
/** the sapper's stinger reach (px x k): inside your dodge circle, well short
 * of a car's stand-off - it pressures, it does not besiege */
const SAPPER_ZAP_R = 120;

// wave director
// NINE skirmish waves, then the Siegebreaker. Holdline ran fifteen because
// surviving them WAS the game; here the skirmish is the approach march and the
// boss is the point, so the run stays a sane arcade length instead of fifteen
// waves PLUS a boss fight.
export const RUN_MAX_WAVES = 9;
export const WAVE_MAX_T = 26; // a wave rolls on even if you never clear it
// THE VARIETY & ARC PASS (2026-07-26): 1.8 -> 1.2. This was fourteen identical
// dead seconds (the checklist could not see it, Mike could): WAVE_MAX_T and
// RUN_MAX_WAVES (the two knobs that actually set run length) are UNTOUCHED, so
// the run is not shortened, only the confirmed-nothing-happening gap between
// waves is. ceiling()'s maxRunSeconds derives from this constant, so the
// ceiling and the registry maxScore below were re-measured against it.
export const WAVE_BREAK = 1.2;
// per-wave spawn RHYTHM replaces this flat constant (see PATTERN_GAP below);
// kept only as the "trickle" pattern's own gap.
// the three-act arc (display only: waveComp/waveMult do not branch on this)
const ACT_II_WAVE = 6;
const ACT_III_WAVE = 11;
// the FINAL ASSAULT gate (wave 14 -> 15): replaces ONE WAVE_BREAK with a
// paused build-choice window plus a short confirmation breather before the
// wave-15 entrance. ceiling()'s maxRunSeconds derives from these exactly.
export const CHOICE_T = 3.0; // seconds to pick before the default applies
// exported (the VARIETY & ARC pass): Client.tsx's wave-incoming ring needs the
// real value to tell a normal WAVE_BREAK apart from this one-time breather
// now that WAVE_BREAK no longer sits far enough above it to eyeball.
export const CHOICE_CONFIRM_T = 1.1; // breather after resolving, before startWave()
export const CHOICE_HULL_MUL = 1.18; // IRON HULL: max hull bump, refilled
export const CHOICE_CALIBER_MUL = 1.25; // HOT SHELLS: shell damage bump
// the RELIEF COLUMN cinematic: longer than a normal KO_T so the page has room
// for a slow-mo beat + a camera move instead of a frozen world with words
export const RELIEF_T = 3.6;

// hit-stop, graduated by the moment's weight (see hitstop() below)
const FREEZE_SAPPER = 0.02;
const FREEZE_CAR = 0.032;
const FREEZE_HEAVY = 0.06;
const FREEZE_DETONATE = 0.045;
const FREEZE_TRUCK_LOST = 0.045;
const FREEZE_HIT = 0.03;
const FREEZE_TRACKED_OUT = 0.075;
const FREEZE_CHOICE_PICK = 0.05;
const FREEZE_ACT = 0.15;
const FREEZE_FINAL_GATE = 0.3;
const FREEZE_FINAL_ENTRANCE = 0.35;
const FREEZE_RELIEF = 0.5;
// a car/heavy shows a charging telegraph on its own body this long before it
// actually fires, read straight off f.fireCd (no new state, no new rng)
const TELEGRAPH_WINDOW = 0.4;
// KO knockback drag: 1/s decay applied to kvx/kvy each frame while f.ko > 0
const KO_DRAG = 4.2;

// FLANKING + SHIFTING (the VARIETY & ARC pass): a spawn tagged `flank` targets
// whichever truck is FARTHEST from the player's position, instead of the
// nearest truck to where it walks in. On a sapper that is a one-time choice at
// spawn (it commits to a truck like a real flanking run); on a car or heavy it
// also RETARGETS every SHIFT_INTERVAL seconds while it is standing off and
// holding fire, so a position that was safe stops being safe. Both read only
// s.px/s.py (already-existing state) and consume ZERO rng - see farthestTruck-
// FromPlayer below. Never fires while the unit has aggroed onto the player
// (the tank-plug play): retargeting the truck out from under a fight the
// player is already winning by standing in the way would be the "unfair"
// this file's laws forbid.
const SHIFT_INTERVAL = 7.0; // seconds a flagged car/heavy holds before it moves

// supply drops (the signature mechanic). VARIETY & ARC pass: 25 -> 17 and
// 18 -> 13 (this game's core verb is "choosing where to be", and one forced
// choice every 25s was sparse for that). ceiling()'s drops term re-derives
// from these automatically.
export const DROP_INTERVAL = 17;
export const FIRST_DROP_T = 13;
export const DROP_FALL_T = 2.6;
export const DROP_LIFE = 14; // seconds on the ground before the crate is lost
export const DROP_PICKUP_R = 28; // px x k
export const DROP_KEEPOUT = 150; // px x k clear of the road: you must drive out
const REPAIR_AMOUNT = 65;
export const BOOST_T = 18; // ammo / twin gun duration
// round-2 power-ups (every other crate; see the POWER-UP CRATES header note)
export const SPREAD_T = 12; // SPREAD SHOT: 3-shell fan
export const RAPID_T = 12; // DOUBLE SHOT: half fire cooldown
export const HASTE_T = 10; // SPEED BOOST
export const RANGE_T = 10; // RANGE BOOST
export const HASTE_MUL = 1.35; // hull speed while SPEED BOOST runs
export const RANGE_MUL = 1.18; // shell reach while RANGE BOOST runs
const SPREAD_FAN = 0.2; // rad each side of center in the 3-shell fan

// scoring
export const KILL_PTS = { sapper: 5, car: 12, heavy: 30, boss: 400 } as const;

/** THE SIEGEBREAKER: the run's whole second half in one hull.
 *
 * hp is banded into three armor PLATES over a core. Crossing a band boundary
 * breaks that plate: it pays, it staggers the boss, and the stagger is your
 * window. The bands are plain hp thresholds rather than separate entities, so
 * there is no second health system to keep in sync. */
export const BOSS_HP = 46;
export const BOSS_PLATES = [36, 26, 16] as const; // cross one -> a plate falls
export const BOSS_PLATE_PTS = 40;
export const BOSS_R = 34;
export const BOSS_SPEED = 22;
export const BOSS_STANDOFF = 200;
export const BOSS_VOLLEY_CD = 2.6;
export const BOSS_VOLLEY_DMG = 12;
export const BOSS_HEAVY_CD = 9;
export const BOSS_HEAVY_TELE = 1.1;
export const BOSS_HEAVY_DMG = 22;
export const BOSS_STAGGER_T = 2.2;
export const BOSS_CHARGE_TELE = 0.9;
export const BOSS_CHARGE_T = 1.1;
export const BOSS_CHARGE_SPEED = 300;
export const BOSS_CHARGE_DMG = 26;
/** After a charge the engine is cooked: the crit window the fight is built on. */
export const BOSS_OVERHEAT_T = 2.0;
export const BOSS_OVERHEAT_MUL = 1.5;
export const TRUCK_BONUS = 8; // x trucks alive x wave multiplier, every wave
export const DROP_POINTS = 0; // crates are power-ups, never points (see ceiling())
export const RELIEF_BONUS = 250; // survive all RUN_MAX_WAVES waves
export const WAVE_MULT_STEP = 0.12;

const PART_CAP = 170;
const TREAD_CAP = 90;

// ── upgrade stats -> bounded sim modifiers + STAT SYNERGY COMBOS ────────────
/**
 * The five persistent stats, structurally identical to lib/s5/games PlayerStats
 * but re-declared here so this sim stays import-free and node-runnable.
 *
 * TRUST BOUNDARY: /api/s5/run-start reads the hq JSONB SERVER-side and returns
 * clampStats() output alongside the nonce; the page hands that object straight
 * to this constructor. A tampered client can therefore claim maxed stats. That
 * is acceptable by construction: warpathMods clamps every field again here and
 * every modifier (flat or combo) is ceiling-neutral, so a forger buys the feel
 * of an upgraded tank and no point the server would otherwise reject.
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
/** DUST CLOUD: seconds of unbroken driving that buy DUST_T untargetable. */
export const DUST_CHARGE_T = 3.0;
export const DUST_T = 1.0;
/** How long the hull may be stationary before the dust settles and the charge
 * is lost. This is NOT slack for camping: firing costs a quick tap, and a tap
 * is a release plus a press, which parks the hull for the ~0.15s the hold-to-
 * steer gesture takes to re-arm. Without this grace a gunner who ever shoots
 * could never charge the combo at all, which would make it dead on arrival. */
export const DUST_BREAK_T = 0.35;
/** RAM: seconds before the tracks can crush another sapper. Without it a single
 * pass along the road mows a whole wave, which is a lot more than "driving into
 * a sapper hurts it". One at a time keeps it a positioning play. */
export const RAM_CD = 0.7;
export const COMBO_DUST_NAME = "DUST CLOUD";
export const COMBO_RAM_NAME = "RAM";
/** RANGING SHOT (the franchise's third named combo, ADR-0070 follow-up):
 * Optics >= 3 AND Caliber >= 15 on the legacy 0..30 aura ladder. The FIRST
 * shell of each wave marks the wave's first HEAVY: the marked hull carries
 * RANGING_GRACE extra hit window (a crit window for a slewing turret) and one
 * armor pip comes free. Ceiling-neutral: heavies are a fixed count at fixed
 * KILL_PTS, and falling earlier only ever advances a wave EARLY, which
 * SHORTENS the run (the documented Caliber argument). No rng anywhere. */
export const COMBO_OPTICS_MIN = 3;
export const COMBO_CALIBER_MIN = 15;
export const RANGING_GRACE = 6; // px x k wider hit window on the marked heavy
export const COMBO_RANGING_NAME = "RANGING SHOT";

export interface WarpathMods {
  speedMul: number; // Engine: hull drive speed
  turnMul: number; // Engine: hull traverse (never TURRET_SLEW)
  hp: number; // Armor: hull integrity before the tracks go
  disabledT: number; // Armor: seconds tracked out, the convoy eats the wave
  iframes: number; // Smoke: invulnerability after a track-out recovery, seconds
  hitIframes: number; // Smoke: invulnerability after an ordinary hit, seconds
  shellDmg: number; // Caliber: damage per shell
  rangeMul: number; // Caliber: shell reach (the round-2 visible-ring growth)
  spawnLead: number; // Optics: seconds a bank is flagged before a foe walks in
  dust: boolean; // COMBO Engine 3 + Smoke 3: DUST CLOUD
  ram: boolean; // COMBO Armor 3 + Engine 3: RAM
  ranging: boolean; // COMBO Optics 3 + Caliber 15: RANGING SHOT
}

/**
 * Engine  +5%/level hull speed + hull traverse (max +20%). The TURRET slew is
 *         deliberately untouched: the slew IS the triage cost this game is
 *         built on, and Engine's fantasy here is reaching the supply drop, not
 *         covering both banks at once.
 * Armor   +10%/level hull integrity (100 -> 140) and a 5%/level shorter
 *         track-out (3.0s -> 2.4s), so the wave you sit out costs the convoy
 *         less. This is the analogue of the extra LIFE the other games give:
 *         losing your tracks does not end a run here, the convoy does, so the
 *         plate is spent on hp and on getting back up.
 * Smoke   +10%/level on the track-out recovery window, stacking with Armor's
 *         +5%/level (1.6s -> 2.56s at Smoke 4 + Armor 4), the same formula as
 *         the other three games. That window ALONE measured as dead money here,
 *         because unlike the other games this hull has never had post-hit
 *         i-frames at all: it just gets chipped. So Smoke also BUYS that window,
 *         0.15s/level (0 -> 0.6s). It starts at zero on purpose, so a stock tank
 *         is chipped exactly as hard as it always was and Smoke 0 balance is
 *         untouched.
 * Caliber shell damage 1 + 0.35 * aura/30 (1 -> 1.35), the franchise-standard
 *         shell-body coefficient. Heavies carry 5 hp (up to 7 in the
 *         late waves), so at full Caliber a heavy falls in 4 shells instead of 5
 *         and a 7 hp one in 6 instead of 7. Cars keep their 2-shell beat and
 *         sappers were always one shell, so the change lands exactly on the unit
 *         the "commit to it" design is about.
 *         ROUND-2: Caliber also grows shell REACH, 1 + 0.15 * aura/30 (up to
 *         +15%), because the range ring is now drawn on screen and Mike asked
 *         for a radius that visibly grows with upgrades. Reach-only and
 *         clear-bound-safe (the same schedule argument as the damage), so it
 *         stays ceiling-neutral; the slew triage is untouched.
 * Optics  the next spawn's BANK flagged 0.15s/level early (0 -> 0.6s, against
 *         the 0.55s SPAWN_STAGGER), read out by nextSpawnPreview below.
 *
 * COMBOS (two stats, one named ability, discovered by play):
 * DUST CLOUD  Engine >= 3 AND Smoke >= 3. Drive without stopping for
 *             DUST_CHARGE_T and the hull trails enough dust to go untargetable
 *             for DUST_T, then the charge resets to zero. Standing on your post
 *             never charges it, so it pays exactly the play the supply drops
 *             already ask for: leave the line and run for the crate.
 * RAM         Armor >= 3 AND Engine >= 3. A moving hull that touches a SAPPER
 *             crushes it, fuse and all, then needs RAM_CD before the tracks
 *             will do it again. Cars and heavies are untouched.
 * RANGING SHOT Optics >= 3 AND Caliber >= 15. The first shell fired in each
 *             wave marks the wave's first heavy (already spawned, or the
 *             moment it walks in): RANGING_GRACE wider hit window plus one
 *             armor pip free. Waves without a heavy simply spend the trigger.
 *
 * CEILING-NEUTRAL, every one of them. Nothing here touches waveComp, KILL_PTS,
 * waveMult, TRUCK_BONUS, DROP_POINTS, RELIEF_BONUS or RUN_MAX_WAVES, so
 * ceiling() still returns 6357. The only modifier that touches the SCHEDULE at
 * all is Caliber, and it only ever ends a wave EARLY, which shortens the run and
 * so can only reduce the number of crates a run sees: see the Caliber note in
 * the file header. A rammed sapper scores exactly the KILL_PTS.sapper x
 * waveMult(spawn wave) a shot one scores, and the count of sappers that can ever
 * exist is fixed.
 */
export function warpathMods(raw?: Partial<SimStats> | null): WarpathMods {
  const s = raw || NO_STATS;
  const engine = lvl(s.drugs, 4);
  const armor = lvl(s.botox, 4);
  const smoke = lvl(s.ozempic, 4);
  const aura = lvl(s.aura, 30);
  const optics = lvl(s.optics, 4);
  const cal = aura / 30;
  return {
    speedMul: 1 + 0.05 * engine,
    turnMul: 1 + 0.05 * engine,
    hp: PLAYER_HP * (1 + 0.1 * armor),
    disabledT: DISABLED_T * (1 - 0.05 * armor),
    iframes: PLAYER_IFRAMES * (1 + 0.1 * smoke + 0.05 * armor),
    hitIframes: 0.15 * smoke,
    shellDmg: 1 + 0.35 * cal,
    rangeMul: 1 + 0.15 * cal,
    spawnLead: 0.15 * optics,
    dust: engine >= COMBO_ENGINE_MIN && smoke >= COMBO_SMOKE_MIN,
    ram: armor >= COMBO_ARMOR_MIN && engine >= COMBO_ENGINE_MIN,
    ranging: optics >= COMBO_OPTICS_MIN && aura >= COMBO_CALIBER_MIN,
  };
}

export type FoeKind = "sapper" | "car" | "heavy" | "boss";

/**
 * A ROCK. Terrain, not a target: it has no hp, pays nothing, and cannot be
 * destroyed. It stops shells and bodies, which is the entire contribution --
 * an empty field makes every fight a damage race with no reason to stand
 * anywhere in particular.
 */
export interface Rock {
  x: number;
  y: number;
  r: number;
  /** 0..2, picked at construction: which silhouette the client draws. */
  shape: number;
}

/** How many rocks the valley carries. Fixed, and terrain, so ceiling() is
 *  untouched -- they change how the same roster is fought, never what it is. */
export const ROCK_COUNT = 7;
export const ROCK_R_MIN = 15;
export const ROCK_R_MAX = 30;
export type DropKind = "repair" | "ammo" | "twin" | "spread" | "rapid" | "haste" | "range";

/** A friendly tank. Still named Truck through the plumbing it inherits (the
 * minimap, the chevrons, the damage flash) because renaming 57 call sites buys
 * nothing; everything player-facing calls them the squad. */
export interface Truck {
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  burn: number; // 0..1 wreck fade-in
  hit: number; // flash timer
  smokeCd: number; // seconds to the wreck's next smoke wisp (rngFx only)
  /** hull heading, radians. Friendlies point where they drive. */
  a: number;
  /** seconds to this tank's next shot. Jittered once at construction so three
   * tanks never volley in lockstep. */
  fireCd: number;
  /** the base cadence this tank fires at (its own jittered value). */
  firePeriod: number;
  /** id of the foe it is engaging, -1 for none. An ID, never an index. */
  claim: number;
  /** callsign, for the kill/loss banners. */
  name: string;
}
export interface Foe {
  /** Monotonic, stamped at spawn. The turret lock holds an ID and never an
   * index, because the foes array is filtered every frame: an index would
   * quietly re-point at a different tank the instant anything died. */
  id: number;
  kind: FoeKind;
  /** A heavy that came in from the east or west with double the hull. Carried
   *  explicitly rather than inferred from `r`, so tuning the radius can never
   *  silently change what the renderer thinks this unit IS. */
  bruiser: boolean;
  x: number;
  y: number;
  a: number;
  r: number;
  hp: number;
  speed: number;
  vx: number; // last frame velocity, px/s (drives the intercept solution)
  vy: number;
  side: number; // -1 north bank, 1 south bank
  target: number; // truck index, -1 = the player
  fireCd: number;
  plant: number; // sapper fuse, 0 = not planting
  wave: number; // the wave it spawned in: the multiplier is locked at spawn
  hit: number;
  ko: number;
  kvx: number;
  kvy: number;
  spin: number;
  marked: boolean; // RANGING SHOT: wider hit grace, one armor pip already paid
  age: number; // seconds since spawn (drives the minimap spawn flash; no rng)
  telegraph: number; // 0..1: how close to firing, read off fireCd (cars/heavies)
  flank: boolean; // VARIETY & ARC pass: targets the truck FARTHEST from the player
  shiftT: number; // cars/heavies only: seconds to the next reposition while flank
}
export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  mine: boolean;
  life: number;
  dmg: number;
  pierce: number;
  dead: boolean;
}
export interface Drop {
  x: number;
  y: number;
  kind: DropKind;
  fall: number; // >0 = still under the chute
  life: number; // ground seconds left
  gone: boolean;
}
export interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
  kind: "spark" | "smoke" | "flash";
}
export interface Floater { x: number; y: number; txt: string; life: number; big: boolean }
export interface Tread { x: number; y: number; a: number; life: number }

export interface WarpathState {
  W: number;
  H: number;
  k: number;
  roadY: number;
  rng: () => number;
  rngFx: () => number;
  reduced: boolean;
  mods: WarpathMods; // frozen at construction; never rerolled, never random
  maxHp: number; // what the HUD bar is a fraction of (Armor can raise it)

  phase: "intro" | "play" | "ko" | "over";
  phaseT: number;
  t: number; // play seconds elapsed
  freeze: number;

  score: number;
  kills: number;
  dropsTaken: number;
  trucksLost: number;

  wave: number;
  waveT: number;
  waveBreakT: number;
  spawnQueue: QueueEntry[]; // {kind, flank} - see the VARIETY & ARC pass note
  spawnSide: number;
  spawnT: number;
  spawnIdx: number; // this wave's spawn count so far: drives PATTERN_GAP's shape

  trucks: Truck[];
  /** Cover. Rolled at construction; never changes during a run. */
  rocks: Rock[];
  foes: Foe[];
  bullets: Bullet[];
  drop: Drop | null;
  dropT: number;

  px: number;
  py: number;
  pa: number; // hull angle
  /** Player velocity in px/s, derived from the position delta each step so it
   *  stays a pure function of the sim. Foes LEAD their shots with it. */
  pvx: number;
  pvy: number;
  ta: number; // turret angle
  wantA: number; // turret target angle
  /** How long the queued shot has been waiting for the barrel to come round. */
  fireQueueT: number;
  fireQueued: boolean;
  fireCd: number;
  muzzle: number;
  hp: number;
  disabled: number;
  iframes: number;
  ammoT: number;
  twinT: number;
  spreadT: number; // SPREAD SHOT seconds left (3-shell fan)
  rapidT: number; // DOUBLE SHOT seconds left (half fire cooldown)
  hasteT: number; // SPEED BOOST seconds left (HASTE_MUL hull speed)
  rangeT: number; // RANGE BOOST seconds left (RANGE_MUL shell reach)
  dropCount: number; // crates spawned so far: the power-up/repair parity gate
  dustCharge: number; // seconds of unbroken driving banked toward DUST CLOUD
  dustStill: number; // seconds parked; past DUST_BREAK_T the charge is lost
  dustT: number; // seconds of untargetability left
  ramCd: number; // seconds before the tracks can crush another sapper
  sawDust: boolean; // the one-per-run HUD flash has fired
  sawRam: boolean;
  sawRanging: boolean;
  rangingFiredWave: number; // last wave whose first-shell trigger was spent
  rangingMarkedWave: number; // last wave whose heavy actually got marked

  // the AFK gate: false until the first real input (pointer down, drive key,
  // or space). While false, detonations run the UNMANNED LINE COLLAPSE.
  touched: boolean;
  warnedIdle: boolean; // the one-time UNDEFENDED banner has shown

  // share-grid bookkeeping (pure derived data, no rng, no score effect):
  // one entry per COMPLETED wave, 0 = held every truck, 1 = lost one or more
  waveLog: number[];
  lostThisWave: boolean;

  // tap detection
  downT: number;
  downX: number;
  downY: number;
  downMoved: number;
  wasDown: boolean;
  // a qualifying release, captured the instant it happens (in the always-run
  // top-of-frame block) so a hit-stop freeze or the FINAL ASSAULT pause can
  // never silently eat it - see the file header's "HIT-STOP, ROLLED OUT" note
  // and pendingTap's two consumers below (the choice gate and the turret).
  pendingTap: boolean;
  /** id of the foe the turret is tracking, -1 for none. NEVER an index. */
  /** true once the Siegebreaker has rolled out (one-shot). */
  bossOut: boolean;
  /** how many armor plates have fallen (0-3). */
  bossPlates: number;
  /** the boss's own clock machine. */
  bossState: "advance" | "stagger" | "chargeTele" | "charge" | "overheat";
  bossStateT: number;
  bossVolleyCd: number;
  bossHeavyCd: number;
  bossHeavyTele: number;
  bossChargeA: number;
  lockId: number;
  /** seconds the current lock has been held (gates LOCK_MIN_T). */
  lockT: number;
  /** monotonic id stamped on every foe at spawn. */
  nextFoeId: number;

  parts: Part[];
  floats: Floater[];
  treads: Tread[];
  treadCd: number;
  shake: number;
  flash: number;
  // sub/big are optional so every existing `{ txt, t }` literal still type-
  // checks unchanged; the page treats a `big` banner as a plate (bigger
  // type, letterbox) and renders `sub` as an instruction subtitle under it.
  banner: { txt: string; t: number; sub?: string; big?: boolean } | null;
  win: boolean;
  over: boolean;

  // THE FINAL ASSAULT GATE: a paused build-choice between wave 14 and 15 (see
  // the file header). While choicePending is true, step() returns immediately
  // after tap detection: spawns, the wave clock and enemy/bullet simulation
  // all hold their breath, same as highnoon's level-up pause.
  choicePending: boolean;
  choiceT: number; // seconds left before the default (HOT SHELLS) applies
  choicePick: -1 | 0 | 1; // -1 undecided, 0 IRON HULL, 1 HOT SHELLS
  choiceCaliberMul: number; // HOT SHELLS: separate from mods.shellDmg (frozen)
}

const TAP_MAX_T = 0.25;
/** How long the hull takes to reach full speed after a pointer press.
 * Mike, 2026-07-28: "the controls are so bad now its hard to even play."
 * The hull used to REFUSE to move until the press had been held for
 * TAP_MAX_T * 0.6 (150ms), a gate meant to keep a quick fire-tap from
 * nudging the tank. 150ms of nothing on every single drive input is a
 * dead control, and the tap gate never needed it: a tap is detected
 * purely on RELEASE (downT < TAP_MAX_T and downMoved < TAP_MAX_MOVE),
 * which this does not touch. So the hull now turns and rolls from the
 * first frame, and only its SPEED eases in across this window, which
 * keeps a 250ms tap to a few pixels of drift instead of a lurch. */
const DRIVE_RAMP_T = 0.16;
const TAP_MAX_MOVE = 12;

/** VARIETY & ARC pass: how a wave's spawns are PACED, not just what they are.
 * "trickle" is the old flat cadence (calm, single-file). "pincer" fires in
 * near-simultaneous PAIRS with a breather between (the both-banks-at-once
 * lesson, repeated on purpose: this is the shape that makes two threats land
 * in different places at the same moment, so you have to choose which one you
 * lose). "burst" is fast and sustained (no breathers, a wall of pressure).
 * "surge" starts calm and compresses as the wave goes on (rising tension).
 * "chaos" (wave 15 only) is fast throughout: the biggest wave in the game
 * should never feel like it is trickling in. */
export type WavePattern = "trickle" | "pincer" | "burst" | "surge" | "chaos";

const PATTERN_GAP: Record<WavePattern, (i: number) => number> = {
  trickle: () => 0.62,
  burst: () => 0.4,
  pincer: (i) => (i % 2 === 0 ? 0.18 : 1.35),
  surge: (i) => Math.max(0.38, 0.72 - 0.05 * i),
  chaos: () => 0.26,
};

interface WaveSpec {
  sappers: number;
  cars: number;
  heavies: number;
  flankSappers: number; // of `sappers`, how many target the truck FARTHEST
  flankCars: number; // from the player instead of nearest - see farthestTruck-
  flankHeavies: number; // FromPlayer's header note
  pattern: WavePattern;
  name: string; // the wave's own banner ("WAVE N: NAME"); Act-opening waves
  // (1, ACT_II_WAVE, ACT_III_WAVE, RUN_MAX_WAVES) show the bigger act plate
  // instead - see startWave.
}

/**
 * ALL FIFTEEN WAVES, hand-authored (the VARIETY & ARC pass). Before this pass
 * waves 1-10 came from one growth formula (every wave the same 5-ish sapper /
 * ramping car / late heavy mix, just bigger) and only 11-15 had real identity.
 * Two thirds of the run was the same fight with bigger numbers. Every wave
 * below has its own dominant threat and its own PATTERN (see WavePattern), so
 * a wave is recognisable, not a number.
 *
 * THE ARC, three acts that differ in KIND, not just in size:
 *  ACT I  (1-5)  FIRST CONTACT: each threat is taught alone before it is
 *         taught in combination - sappers, then cars, then the both-banks
 *         pincer lesson, then the first heavy, then a combined-arms close.
 *         Zero flank/shift: the read is always "nearest truck wins".
 *  ACT II (6-10) THE PUSH: flanking and shifting are INTRODUCED here (see
 *         flankSappers/flankCars) - the new verb this act adds is that some
 *         threats now go looking for wherever you are not standing, so the
 *         line you solved five minutes ago stops staying solved.
 *  ACT III (11-15) THE LAST STRETCH: the hand-tuned finale comps from the
 *         earlier B+ pass, kept, now WEARING Act II's verb at higher volume
 *         (flank/shift counts step up again) plus the FINAL ASSAULT gate and
 *         entrance cinematic - so Act III compounds Act II's new mechanic
 *         instead of just being Act I with more health.
 *
 * Total enemy counts changed (busier, per the brief - "harder and busier,
 * never unfair"): Act I 35 -> 43, Act II 60 -> 69, Act III unchanged at 76
 * (the same hand-tuned counts as the earlier B+ pass, only flank/pattern
 * flags added). ceiling()'s kills term re-derives from this table exactly;
 * see that function's own docstring for the measured total.
 */
// Waves 3-15 carry ~1.35x counts (2026-08-02, same directive as the world
// shrink above): with WORLD_SCALE_X down 30% the field density roughly
// doubles, which is the "stop hunting for enemies" Mike asked for. Waves 1-2
// stay as the two teaching beats. ceiling() recomputes from this table.
const WAVE_SPEC: Record<number, WaveSpec> = {
  // ── ACT I: FIRST CONTACT (1-5) - one lesson at a time, no flank/shift ──
  1: { sappers: 5, cars: 0, heavies: 0, flankSappers: 0, flankCars: 0, flankHeavies: 0, pattern: "trickle", name: "FIRST CONTACT" },
  2: { sappers: 3, cars: 3, heavies: 0, flankSappers: 0, flankCars: 0, flankHeavies: 0, pattern: "trickle", name: "ARMOR SCOUTS" },
  3: { sappers: 7, cars: 3, heavies: 0, flankSappers: 0, flankCars: 0, flankHeavies: 0, pattern: "pincer", name: "DOUBLE FLANK" },
  4: { sappers: 5, cars: 4, heavies: 1, flankSappers: 0, flankCars: 0, flankHeavies: 0, pattern: "surge", name: "FIRST STEEL" },
  5: { sappers: 7, cars: 4, heavies: 1, flankSappers: 0, flankCars: 0, flankHeavies: 0, pattern: "surge", name: "THE CROSSING" },
  // ── ACT II: THE PUSH (6-10) - flank/shift come online, deliberately light ──
  6: { sappers: 8, cars: 5, heavies: 1, flankSappers: 1, flankCars: 1, flankHeavies: 0, pattern: "pincer", name: "PINCER PUSH" },
  7: { sappers: 5, cars: 8, heavies: 1, flankSappers: 1, flankCars: 1, flankHeavies: 0, pattern: "burst", name: "CAR SWARM" },
  8: { sappers: 5, cars: 4, heavies: 4, flankSappers: 1, flankCars: 1, flankHeavies: 0, pattern: "burst", name: "STEEL FOCUS" },
  9: { sappers: 11, cars: 4, heavies: 1, flankSappers: 2, flankCars: 1, flankHeavies: 0, pattern: "pincer", name: "SATCHEL RUSH" },
  10: { sappers: 8, cars: 7, heavies: 4, flankSappers: 2, flankCars: 1, flankHeavies: 0, pattern: "surge", name: "THE LINE BENDS" },
  // ── ACT III: THE LAST STRETCH (11-15) - the B+ pass comps, flank/shift light ──
  11: { sappers: 7, cars: 9, heavies: 4, flankSappers: 1, flankCars: 2, flankHeavies: 0, pattern: "pincer", name: "FLANK SURGE" },
  12: { sappers: 5, cars: 8, heavies: 5, flankSappers: 1, flankCars: 2, flankHeavies: 0, pattern: "burst", name: "ARMORED PUSH" },
  13: { sappers: 11, cars: 5, heavies: 4, flankSappers: 2, flankCars: 1, flankHeavies: 0, pattern: "pincer", name: "SATCHEL STORM" },
  14: { sappers: 5, cars: 7, heavies: 7, flankSappers: 1, flankCars: 1, flankHeavies: 1, pattern: "burst", name: "STEEL WALL" },
  15: { sappers: 8, cars: 9, heavies: 7, flankSappers: 2, flankCars: 2, flankHeavies: 1, pattern: "chaos", name: "FINAL ASSAULT" },
};

function waveSpec(k: number): WaveSpec {
  const kk = Math.min(RUN_MAX_WAVES, Math.max(1, Math.floor(k)));
  return WAVE_SPEC[kk];
}

/** Fixed composition per wave. Deterministic by design: the score ceiling is
 * count-bound, never rate-bound, so ceiling() below can be exact. */
export function waveComp(k: number): { sappers: number; cars: number; heavies: number } {
  const { sappers, cars, heavies } = waveSpec(k);
  return { sappers, cars, heavies };
}

function wavePattern(k: number): WavePattern {
  return waveSpec(k).pattern;
}

/** Late waves are worth far more: the score curve steepens with survival. */
export function waveMult(k: number): number {
  return 1 + WAVE_MULT_STEP * (Math.max(1, k) - 1);
}

/**
 * Build one run. `w`/`h` are the VIEW size (the canvas CSS px the camera
 * shows); the WORLD this sim runs in is WORLD_SCALE_X/Y times that, and every
 * coordinate in the state (player, foes, trucks, drops, pointer input) is a
 * WORLD coordinate. k stays view-scaled so speeds/radii keep their tuning.
 */
export function createWarpath(
  w: number,
  h: number,
  seed: string,
  reduced = false,
  stats?: Partial<SimStats> | null,
): WarpathState {
  const k = w / 480;
  const W = Math.round(w * WORLD_SCALE_X);
  const H = Math.round(h * WORLD_SCALE_Y);
  const roadY = H * 0.5;
  const mods = warpathMods(stats);
  const s: WarpathState = {
    W,
    H,
    k,
    roadY,
    rng: mulberry32(fnv1a("hold-" + seed)),
    rngFx: mulberry32(fnv1a("holdfx-" + seed)),
    reduced,
    mods,
    maxHp: mods.hp,
    phase: "intro",
    phaseT: INTRO_T,
    t: 0,
    freeze: 0,
    score: 0,
    kills: 0,
    dropsTaken: 0,
    trucksLost: 0,
    wave: 0,
    waveT: 0,
    waveBreakT: 0,
    spawnQueue: [],
    spawnSide: 1,
    spawnT: 0,
    spawnIdx: 0,
    trucks: [],
    rocks: [],
    foes: [],
    bullets: [],
    drop: null,
    dropT: FIRST_DROP_T,
    px: W / 2,
    py: roadY + 54 * k,
    pa: -Math.PI / 2,
    pvx: 0,
    pvy: 0,
    ta: -Math.PI / 2,
    wantA: -Math.PI / 2,
    fireQueueT: 0,
    fireQueued: false,
    fireCd: 0,
    muzzle: 0,
    hp: mods.hp, // Armor: a thicker hull
    disabled: 0,
    iframes: 0,
    ammoT: 0,
    twinT: 0,
    spreadT: 0,
    rapidT: 0,
    hasteT: 0,
    rangeT: 0,
    dropCount: 0,
    dustCharge: 0,
    dustStill: 0,
    dustT: 0,
    ramCd: 0,
    sawDust: false,
    sawRam: false,
    sawRanging: false,
    rangingFiredWave: 0,
    rangingMarkedWave: 0,
    touched: false,
    warnedIdle: false,
    waveLog: [],
    lostThisWave: false,
    downT: 0,
    downX: 0,
    downY: 0,
    downMoved: 0,
    wasDown: false,
    pendingTap: false,
    bossOut: false,
    bossPlates: 0,
    bossState: "advance",
    bossStateT: 0,
    bossVolleyCd: BOSS_VOLLEY_CD,
    bossHeavyCd: BOSS_HEAVY_CD,
    bossHeavyTele: 0,
    bossChargeA: 0,
    lockId: -1,
    lockT: 0,
    nextFoeId: 1,
    parts: [],
    floats: [],
    treads: [],
    treadCd: 0,
    shake: 0,
    flash: 0,
    banner: null,
    win: false,
    over: false,
    choicePending: false,
    choiceT: 0,
    choicePick: -1,
    choiceCaliberMul: 1,
  };
  // THE SQUAD: three friendly tanks, formed up abreast of you at the start.
  // They advance and fight on their own; you do not defend them.
  for (let i = 0; i < TRUCKS; i++) {
    const f = TRUCKS > 1 ? i / (TRUCKS - 1) : 0.5;
    s.trucks.push({
      x: s.px + (f - 0.5) * 120 * k,
      y: s.py + 74 * k,
      hp: FRIEND_HP,
      alive: true,
      burn: 0,
      hit: 0,
      smokeCd: 0.4 + (i / Math.max(1, TRUCKS - 1)) * 0.3,
      a: 0,
      // one roll each, in fixed index order: the whole squad firing on the
      // same tick reads as a single loud gun rather than three tanks
      firePeriod: FRIEND_FIRE_CD + s.rng() * 0.5,
      fireCd: 0.6 + i * 0.25,
      claim: -1,
      name: FRIEND_NAMES[i % FRIEND_NAMES.length],
    });
  }
  // seeded opening flank (fixed order in the stream, same as always)
  s.spawnSide = s.rng() < 0.5 ? -1 : 1;
  // COVER, scattered last so it is rolled after everything that depends on an
  // earlier position in the stream. Terrain only: no scoring body moves, so
  // ceiling() is untouched by every rock on the board.
  placeRocks(s);
  return s;
}

// ── helpers ────────────────────────────────────────────────────────────────
/** Hit-stop, graduated: only ever raises s.freeze, never lowers it, so two
 * events landing the same frame (a kill plus a hit, say) keep the BIGGER
 * pause rather than the last one written. Pure function of a fixed amount,
 * no rng, no score effect - see the FREEZE_* table above and the file
 * header's "HIT-STOP, ROLLED OUT" note. */
function hitstop(s: WarpathState, amt: number) {
  if (amt > s.freeze) s.freeze = amt;
}

function burst(s: WarpathState, x: number, y: number, n: number, sp: number, kind: Part["kind"], r = 2) {
  const cap = s.reduced ? PART_CAP / 3 : PART_CAP;
  for (let i = 0; i < n && s.parts.length < cap; i++) {
    const a = s.rngFx() * Math.PI * 2;
    const v = sp * (0.35 + s.rngFx() * 0.75);
    s.parts.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: kind === "smoke" ? 0.7 + s.rngFx() * 0.5 : 0.28 + s.rngFx() * 0.3,
      r: r * (0.7 + s.rngFx() * 0.8),
      kind,
    });
  }
}

function float(s: WarpathState, x: number, y: number, txt: string, big = false) {
  if (s.floats.length < 18) s.floats.push({ x, y, txt, life: big ? 1.3 : 0.95, big });
}

function nearestTruck(s: WarpathState, x: number, y: number): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < s.trucks.length; i++) {
    const tk = s.trucks[i];
    if (!tk.alive) continue;
    const d = (tk.x - x) * (tk.x - x) + (tk.y - y) * (tk.y - y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** VARIETY & ARC pass: the alive truck FARTHEST from the player's CURRENT
 * position. A pure read of s.px/s.py (already-existing state, no rng), used
 * by `flank` sappers at spawn and `flank` cars/heavies on their periodic
 * reposition - see SHIFT_INTERVAL's header note. This is the one mechanic
 * that punishes camping one spot: the game actively routes some threats to
 * wherever the player is NOT. */
function farthestTruckFromPlayer(s: WarpathState): number {
  let best = -1;
  let bd = -1;
  for (let i = 0; i < s.trucks.length; i++) {
    const tk = s.trucks[i];
    if (!tk.alive) continue;
    const d = (tk.x - s.px) * (tk.x - s.px) + (tk.y - s.py) * (tk.y - s.py);
    if (d > bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function trucksAlive(s: WarpathState): number {
  let n = 0;
  for (const tk of s.trucks) if (tk.alive) n++;
  return n;
}

function damageTruck(s: WarpathState, i: number, dmg: number) {
  const tk = s.trucks[i];
  if (!tk || !tk.alive) return;
  tk.hp -= dmg;
  tk.hit = 0.25;
  if (tk.hp <= 0) {
    tk.hp = 0;
    tk.alive = false;
    tk.burn = 0.001;
    tk.smokeCd = 0.5 + s.rngFx() * 0.4; // the wreck starts smoldering shortly
    s.trucksLost++;
    s.lostThisWave = true; // share-grid bookkeeping only
    s.shake = Math.max(s.shake, 11);
    s.flash = Math.max(s.flash, 0.3);
    hitstop(s, FREEZE_TRUCK_LOST);
    burst(s, tk.x, tk.y, 18, 210 * s.k, "spark", 2.6 * s.k);
    burst(s, tk.x, tk.y, 9, 60 * s.k, "smoke", 6 * s.k);
    // The squad dying does NOT end the run. Mike's brief is "don't get
    // destroyed, destroy the enemy boss tank": the run is about YOUR tank, and
    // fighting on alone after losing all three is a real (bad) position to be
    // in, not a game-over screen.
    const left = trucksAlive(s);
    s.banner =
      left <= 0
        ? { txt: "SQUAD WIPED", t: 2.0, sub: "You are on your own." }
        : { txt: `TANK DOWN: ${tk.name}`, t: 1.4 };
  }
}

function damagePlayer(s: WarpathState, dmg: number) {
  // DUST CLOUD: while the dust is up nothing can find you
  if (s.disabled > 0 || s.iframes > 0 || s.dustT > 0 || s.phase !== "play") return;
  s.hp -= dmg;
  s.flash = Math.max(s.flash, 0.24);
  s.shake = Math.max(s.shake, 7);
  hitstop(s, FREEZE_HIT);
  burst(s, s.px, s.py, 7, 150 * s.k, "spark", 2 * s.k);
  if (s.hp <= 0) {
    // YOUR TANK IS THE RUN. Holdline could afford to track you out and hand
    // the hull back, because losing the CONVOY was the real failure state.
    // Warpath'''s brief is "dont get destroyed", so being destroyed ends it.
    s.hp = 0;
    s.win = false;
    s.banner = { txt: "HULL BREACHED", t: KO_T, sub: "The advance dies here.", big: true };
    s.phase = "ko";
    s.phaseT = KO_T;
    hitstop(s, FREEZE_TRACKED_OUT);
    burst(s, s.px, s.py, 22, 240 * s.k, "spark", 3 * s.k);
    burst(s, s.px, s.py, 14, 190 * s.k, "smoke", 5 * s.k);
    return;
  }
  // Smoke: a screen of smoke off the hull after a hit. Zero at Smoke 0, which
  // is exactly the stock behaviour (this hull just gets chipped).
  if (s.mods.hitIframes > 0) s.iframes = Math.max(s.iframes, s.mods.hitIframes);
}

/** Named per kind, the scoring vocabulary a kill floater speaks (checklist:
 * "5+ named events with floater words"). DRONE matches the display re-skin
 * (KIND_LABEL in Client.tsx); CAR and HEAVY match their HUD/minimap labels. */
const KILL_CALL: Record<FoeKind, string> = { sapper: "DRONE DOWN", car: "CAR DOWN", heavy: "HEAVY DOWN", boss: "SIEGEBREAKER DOWN" };

function killFoe(s: WarpathState, f: Foe) {
  if (f.kind === "boss") {
    // THE RUN'S WIN CONDITION. Flat points, not wave-scaled: there is exactly
    // one Siegebreaker and ceiling() prices it exactly once.
    s.score += KILL_PTS.boss;
    s.kills++;
    s.win = true;
    f.hp = 0;
    f.ko = 1.2;
    s.banner = { txt: "THE SIEGEBREAKER FALLS", t: RELIEF_T, sub: "The field is yours.", big: true };
    s.phase = "ko";
    s.phaseT = RELIEF_T;
    hitstop(s, FREEZE_RELIEF);
    s.shake = Math.max(s.shake, 16);
    burst(s, f.x, f.y, 30, 300 * s.k, "spark", 3.6 * s.k);
    burst(s, f.x, f.y, 16, 110 * s.k, "smoke", 7 * s.k);
    float(s, f.x, f.y - 40 * s.k, `SIEGEBREAKER +${KILL_PTS.boss}`, true);
    return;
  }
  const pts = Math.round(KILL_PTS[f.kind] * waveMult(f.wave));
  s.score += pts;
  s.kills++;
  f.hp = 0;
  f.ko = 0.6;
  const away = Math.atan2(f.y - s.py, f.x - s.px);
  f.kvx = Math.cos(away) * 150 * s.k;
  f.kvy = Math.sin(away) * 150 * s.k;
  f.spin = f.kind === "heavy" ? 4 : 9;
  // hit-stop + shake, graduated by target value: the cheapest mob still gets
  // a twinge, the heaviest gets the full beat (checklist: "hit-stop graduated
  // by target value", cross-referenced against every kill, not one call site)
  hitstop(s, f.kind === "heavy" ? FREEZE_HEAVY : f.kind === "car" ? FREEZE_CAR : FREEZE_SAPPER);
  s.shake = Math.max(s.shake, f.kind === "heavy" ? 8 : f.kind === "car" ? 5 : 3);
  burst(s, f.x, f.y, f.kind === "heavy" ? 16 : 10, 190 * s.k, "spark", 2.3 * s.k);
  if (f.kind !== "sapper") burst(s, f.x, f.y, 5, 55 * s.k, "smoke", 4.5 * s.k);
  const call = `${KILL_CALL[f.kind]} +${pts}`;
  if (f.kind === "heavy") {
    float(s, f.x, f.y - 20 * s.k, call, true);
  } else {
    float(s, f.x, f.y - 16 * s.k, call);
  }
}

function detonate(s: WarpathState, f: Foe) {
  // ── THE AFK GATE, sim-side ────────────────────────────────────────────────
  // It used to live in the branch below: an untouched run had every satchel gut
  // every truck, and the convoy died in ~23s. There is no convoy now (TRUCKS 0),
  // so the gate is the SPLASH on the last line of this block, and it is
  // stronger than the old one because it is aimed at you rather than at your
  // escorts. An untouched run never answers the push, so sappers walk straight
  // to your hull (target -1 = the player), plant, and blow: SAPPER_SPLASH_DMG
  // 30 against PLAYER_HP 100 means the fourth charge ends it, well inside the
  // 60s floor, scoring 0 (no kills, no completed wave). No rng, one boolean.
  // The truck branches below are unreachable while TRUCKS is 0 and are kept
  // only so the removal stays a one-line revert.
  if (!s.touched) {
    for (let i = 0; i < s.trucks.length; i++) damageTruck(s, i, SAPPER_DMG);
  } else if (f.target >= 0) damageTruck(s, f.target, SAPPER_DMG);
  if (Math.hypot(f.x - s.px, f.y - s.py) < SAPPER_SPLASH * s.k) damagePlayer(s, SAPPER_SPLASH_DMG);
  burst(s, f.x, f.y, 16, 230 * s.k, "spark", 2.6 * s.k);
  burst(s, f.x, f.y, 6, 70 * s.k, "smoke", 5 * s.k);
  s.shake = Math.max(s.shake, 9);
  hitstop(s, FREEZE_DETONATE);
  f.hp = 0;
  f.ko = 0.35;
  f.kvx = 0;
  f.kvy = 0;
  f.spin = 12;
}

// ── wave director ──────────────────────────────────────────────────────────
interface QueueEntry {
  kind: FoeKind;
  flank: boolean; // see farthestTruckFromPlayer's header note
}

/** Spread `count` true flags evenly across `n` slots (Bresenham-style), so a
 * wave's flankers land THROUGHOUT its spawn order instead of bunched at one
 * end. Deterministic, no rng: it only ever reads two integers. */
function spreadFlags(n: number, count: number): boolean[] {
  const out: boolean[] = new Array(Math.max(0, n)).fill(false);
  const c = Math.max(0, Math.min(count, n));
  for (let i = 0; i < c; i++) out[Math.floor((i * n) / c)] = true;
  return out;
}

function buildQueue(k: number): QueueEntry[] {
  const spec = waveSpec(k);
  const mk = (n: number, kind: FoeKind, flankN: number): QueueEntry[] => {
    const flags = spreadFlags(n, flankN);
    const arr: QueueEntry[] = [];
    for (let i = 0; i < n; i++) arr.push({ kind, flank: flags[i] });
    return arr;
  };
  // interleave so both the mix and the pressure arrive spread out, not blocked
  const buckets: QueueEntry[][] = [
    mk(spec.sappers, "sapper", spec.flankSappers),
    mk(spec.cars, "car", spec.flankCars),
    mk(spec.heavies, "heavy", spec.flankHeavies),
  ];
  const out: QueueEntry[] = [];
  let guard = 0;
  while (guard++ < 200) {
    let pushed = false;
    for (const b of buckets) {
      const v = b.pop();
      if (v) {
        out.push(v);
        pushed = true;
      }
    }
    if (!pushed) break;
  }
  return out;
}

function startWave(s: WarpathState) {
  s.wave++;
  s.waveT = 0;
  s.spawnQueue = buildQueue(s.wave);
  s.spawnT = 0;
  s.spawnIdx = 0;
  // the visible three-act arc: named beats at each act's opening wave (wave 1
  // included, the VARIETY & ARC pass - the run's structure reads the same way
  // from its first second as it does at wave 6/11), and the FINAL ASSAULT gets
  // its own "major entrance" (freeze + shake), the same treatment a boss intro
  // gets in the donor game. Every other wave shows its OWN name from
  // WAVE_SPEC (all fifteen now have one, not just 11-14): a wave is
  // recognisable, not a number.
  if (s.wave === 1) {
    s.banner = { txt: "ACT I: FIRST CONTACT", t: 1.8, sub: "Two banks, one gun. Learn the trade.", big: true };
    hitstop(s, FREEZE_ACT);
  } else if (s.wave === ACT_II_WAVE) {
    s.banner = { txt: "ACT II: THE PUSH", t: 1.8, sub: "Both banks lean in. Hold the crossing.", big: true };
    hitstop(s, FREEZE_ACT);
  } else if (s.wave === ACT_III_WAVE) {
    s.banner = { txt: "ACT III: THE LAST STRETCH", t: 1.8, sub: "Five waves left. This is where it's won.", big: true };
    hitstop(s, FREEZE_ACT);
  } else if (s.wave === RUN_MAX_WAVES) {
    s.banner = { txt: "FINAL ASSAULT", t: 2.1, sub: "Everything they have, all at once. Hold.", big: true };
    hitstop(s, FREEZE_FINAL_ENTRANCE);
    s.shake = Math.max(s.shake, 10);
  } else {
    s.banner = { txt: `WAVE ${s.wave}: ${waveSpec(s.wave).name}`, t: 1.4 };
  }
}

/** IRON HULL (left of the hull) or HOT SHELLS (right): resolves the FINAL
 * ASSAULT gate. Ceiling-neutral, same family as Armor/Caliber (survival or
 * clear-speed only): see the file header's "THE FINAL ASSAULT GATE" note. */
function resolveChoice(s: WarpathState, pick: 0 | 1) {
  s.choicePending = false;
  s.choiceT = 0;
  s.choicePick = pick;
  // swallow the eventual release so it can never also register as a normal
  // turret tap the instant the gate closes (see the file header's gate note)
  s.downT = TAP_MAX_T;
  hitstop(s, FREEZE_CHOICE_PICK);
  s.shake = Math.max(s.shake, 6);
  if (pick === 0) {
    s.maxHp = Math.round(s.maxHp * CHOICE_HULL_MUL);
    s.hp = s.maxHp;
    s.banner = { txt: "IRON HULL", t: 1.3, sub: "Armor plate welded on. Hull integrity raised." };
    float(s, s.px, s.py - 30 * s.k, "IRON HULL", true);
  } else {
    s.choiceCaliberMul = CHOICE_CALIBER_MUL;
    s.banner = { txt: "HOT SHELLS", t: 1.3, sub: "Shells run hotter for the rest of the siege." };
    float(s, s.px, s.py - 30 * s.k, "HOT SHELLS", true);
  }
  s.waveBreakT = CHOICE_CONFIRM_T; // a short breather before wave 15's entrance
}

/** Pay the per-truck survival bonus and roll the wave on (cleared or timed
 * out). Clearing fast is the whole reason to be good: more waves per minute. */
function advanceWave(s: WarpathState) {
  const alive = trucksAlive(s);
  const bonus = Math.round(TRUCK_BONUS * alive * waveMult(s.wave));
  s.score += bonus;
  // grid bookkeeping: this wave is complete; a loss during the following
  // break attributes to the NEXT wave (the honest reading of "held it")
  s.waveLog.push(s.lostThisWave ? 1 : 0);
  s.lostThisWave = false;
  // anchored to the player: in world space the road's center is usually
  // off-camera, and the payout should land where the eyes are
  float(s, s.px, s.py - 40 * s.k, `CONVOY HELD +${bonus}`, true);
  if (s.wave >= RUN_MAX_WAVES) {
    // The skirmish is over and the thing you actually came for rolls out.
    // Warpath ended here on a relief column; warpath ends on a fight.
    if (!s.bossOut) {
      s.bossOut = true;
      spawnBoss(s);
      s.banner = {
        txt: "THE SIEGEBREAKER",
        t: 2.6,
        sub: "Break its plates. Kill the core.",
        big: true,
      };
      s.freeze = Math.max(s.freeze, 0.45);
      s.shake = Math.max(s.shake, 10);
    }
    return;
  }
  if (s.wave === RUN_MAX_WAVES - 1) {
    // THE FINAL ASSAULT GATE: a paused build-choice instead of a plain break
    // (see the file header). Replaces exactly one WAVE_BREAK; ceiling()'s
    // maxRunSeconds accounts for CHOICE_T + CHOICE_CONFIRM_T here instead.
    s.choicePending = true;
    s.choiceT = CHOICE_T;
    s.banner = {
      txt: "FINAL ASSAULT INCOMING",
      t: CHOICE_T,
      sub: "Tap LEFT: reinforce the hull. Tap RIGHT: hot-load the gun.",
      big: true,
    };
    hitstop(s, FREEZE_FINAL_GATE);
    s.shake = Math.max(s.shake, 8);
    return;
  }
  s.waveBreakT = WAVE_BREAK;
}

/** The Siegebreaker rolls in from the far bank, dead centre. No rng: the one
 * fight in the run that is the same for everybody. */
function spawnBoss(s: WarpathState) {
  s.foes.push({
    id: s.nextFoeId++,
    kind: "boss",
    // The Siegebreaker is the run's real boss, not a flanking heavy. It keeps
    // its own art and its own plate mechanic.
    bruiser: false,
    x: s.W / 2,
    y: -40 * s.k,
    a: Math.PI / 2,
    r: BOSS_R * s.k,
    hp: BOSS_HP,
    speed: BOSS_SPEED * s.k,
    vx: 0,
    vy: 0,
    side: -1,
    target: -1,
    fireCd: 2.0,
    plant: 0,
    wave: s.wave,
    hit: 0,
    ko: 0,
    kvx: 0,
    kvy: 0,
    spin: 0,
    marked: false,
    age: 0,
    telegraph: 0,
    flank: false,
    shiftT: 0,
  });
}

/** Find the boss, if it is alive. */
function theBoss(s: WarpathState): Foe | null {
  for (const f of s.foes) if (f.kind === "boss" && f.hp > 0 && f.ko <= 0) return f;
  return null;
}

/** THE SIEGEBREAKER's machine. Entirely timer-driven and rng-free, so the
 * fight is identical for every player on the daily seed and the tape replays
 * it exactly.
 *
 *   ADVANCE     closes to BOSS_STANDOFF and shells you on a steady clock,
 *               with a separate heavy-shell timer that telegraphs first
 *   STAGGER     entered whenever an armor plate falls: it stops dead, which
 *               is your free damage
 *   CHARGE      telegraphs a lane, then dashes down it
 *   OVERHEAT    the price of charging: BOSS_OVERHEAT_MUL damage taken, the
 *               window the whole fight is built around
 */
function stepBoss(s: WarpathState, dt: number) {
  const b = theBoss(s);
  if (!b) return;
  const k = s.k;
  s.bossStateT -= dt;

  // plates fall on hp band crossings
  while (s.bossPlates < BOSS_PLATES.length && b.hp <= BOSS_PLATES[s.bossPlates]) {
    s.bossPlates++;
    s.score += BOSS_PLATE_PTS;
    float(s, b.x, b.y - 30 * k, `PLATE DOWN +${BOSS_PLATE_PTS}`, true);
    s.banner = { txt: "PLATE DOWN", t: 1.2 };
    hitstop(s, 0.12);
    s.shake = Math.max(s.shake, 10);
    burst(s, b.x, b.y, 16, 220 * k, "spark", 2.8 * k);
    s.bossState = "stagger";
    s.bossStateT = BOSS_STAGGER_T;
  }

  const dx = s.px - b.x;
  const dy = s.py - b.y;
  const d = Math.hypot(dx, dy) || 1;
  b.a = Math.atan2(dy, dx);

  if (s.bossState === "stagger") {
    b.vx = 0;
    b.vy = 0;
    if (s.bossStateT <= 0) {
      // every stagger is paid for with a charge: the fight keeps escalating
      s.bossState = "chargeTele";
      s.bossStateT = BOSS_CHARGE_TELE;
      s.bossChargeA = b.a;
      s.banner = { txt: "CHARGE INCOMING", t: 1.0 };
    }
    return;
  }

  if (s.bossState === "chargeTele") {
    b.vx = 0;
    b.vy = 0;
    b.telegraph = 1 - Math.max(0, s.bossStateT) / BOSS_CHARGE_TELE;
    if (s.bossStateT <= 0) {
      s.bossState = "charge";
      s.bossStateT = BOSS_CHARGE_T;
    }
    return;
  }

  if (s.bossState === "charge") {
    const sp = BOSS_CHARGE_SPEED * k;
    b.vx = Math.cos(s.bossChargeA) * sp;
    b.vy = Math.sin(s.bossChargeA) * sp;
    b.x = Math.max(20 * k, Math.min(s.W - 20 * k, b.x + b.vx * dt));
    b.y = Math.max(20 * k, Math.min(s.H - 20 * k, b.y + b.vy * dt));
    if (d < (BOSS_R + PLAYER_R) * k) damagePlayer(s, BOSS_CHARGE_DMG);
    if (s.bossStateT <= 0) {
      s.bossState = "overheat";
      s.bossStateT = BOSS_OVERHEAT_T;
      s.banner = { txt: "OVERHEATED", t: 1.0 };
      burst(s, b.x, b.y, 12, 90 * k, "smoke", 5 * k);
    }
    return;
  }

  if (s.bossState === "overheat") {
    b.vx = 0;
    b.vy = 0;
    if (s.bossStateT <= 0) s.bossState = "advance";
    return;
  }

  // ADVANCE: close to standoff, shell on the clock, heavy shell on its own
  if (d > BOSS_STANDOFF * k) {
    const sp = b.speed * dt;
    b.x += (dx / d) * sp;
    b.y += (dy / d) * sp;
  }
  b.vx = 0;
  b.vy = 0;
  s.bossVolleyCd -= dt;
  if (s.bossVolleyCd <= 0) {
    s.bossVolleyCd = BOSS_VOLLEY_CD;
    for (const off of [-0.14, 0, 0.14]) bossShot(s, b, b.a + off, BOSS_VOLLEY_DMG, false);
  }
  if (s.bossHeavyTele > 0) {
    s.bossHeavyTele -= dt;
    b.telegraph = 1 - Math.max(0, s.bossHeavyTele) / (BOSS_HEAVY_TELE + s.mods.spawnLead);
    if (s.bossHeavyTele <= 0) {
      bossShot(s, b, b.a, BOSS_HEAVY_DMG, true);
      b.telegraph = 0;
    }
  } else {
    s.bossHeavyCd -= dt;
    if (s.bossHeavyCd <= 0) {
      s.bossHeavyCd = BOSS_HEAVY_CD;
      s.bossHeavyTele = BOSS_HEAVY_TELE + s.mods.spawnLead;
    }
  }
}

/**
 * SCATTER THE COVER, once, at construction.
 *
 * Kept clear of three things, and each exclusion is load-bearing:
 *  - THE ROAD, because the squad drives it and a rock in the lane would wall
 *    off the game's main axis of movement.
 *  - EACH OTHER, so two rocks never fuse into one long wall the auto-aim can
 *    never see past.
 *  - THE SCREEN EDGES, so nothing is half off the board where a player cannot
 *    read whether they are behind it or not.
 *
 * Rejection sampling with a bounded try count: if a spot cannot be found the
 * rock is simply skipped, because a level with six rocks is fine and a level
 * that hangs is not.
 */
function placeRocks(s: WarpathState) {
  const k = s.k;
  const roadKeep = 52 * k;
  for (let i = 0; i < ROCK_COUNT; i++) {
    const r = (ROCK_R_MIN + s.rng() * (ROCK_R_MAX - ROCK_R_MIN)) * k;
    let placed = false;
    for (let tries = 0; tries < 12 && !placed; tries++) {
      const x = r + 20 * k + s.rng() * (s.W - (r + 20 * k) * 2);
      const y = r + 20 * k + s.rng() * (s.H - (r + 20 * k) * 2);
      if (Math.abs(y - s.roadY) < roadKeep + r) continue;
      let clash = false;
      for (const o of s.rocks) {
        if (Math.hypot(o.x - x, o.y - y) < o.r + r + 34 * k) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      s.rocks.push({ x, y, r, shape: Math.floor(s.rng() * 3) % 3 });
      placed = true;
    }
  }
}

/** Is this point inside any rock? The one test both shells and bodies use, so
 *  there is exactly one answer to "can I be here". */
export function inRock(s: WarpathState, x: number, y: number, pad = 0): boolean {
  for (const o of s.rocks) {
    if (Math.hypot(o.x - x, o.y - y) < o.r + pad) return true;
  }
  return false;
}

function spawnFoe(s: WarpathState, kind: FoeKind, flank: boolean) {
  const side = s.spawnSide;
  s.spawnSide = -side; // alternate banks: both flanks push at once, always
  const margin = 46 * s.k;
  /**
   * BRUISERS COME IN FROM THE SIDES.
   *
   * Until now `y` was always off the top or the bottom and `x` was random, so
   * in the whole game nothing had ever entered from the left or the right. That
   * one line is why the fight was a north-south metronome. Every third wave, a
   * heavy enters from the east or west instead, twice as tough and visibly
   * bigger. It scores as an ordinary heavy, so ceiling() is untouched.
   *
   * Which wave and which edge are pure reads of s.wave and s.spawnSide, so this
   * rolls no dice the replay does not already have.
   */
  const bruiser = kind === "heavy" && s.wave % 3 === 0;
  let x: number;
  let y: number;
  if (bruiser) {
    x = side < 0 ? -30 * s.k : s.W + 30 * s.k;
    y = margin + s.rng() * (s.H - margin * 2);
  } else {
    x = margin + s.rng() * (s.W - margin * 2);
    y = side < 0 ? -26 * s.k : s.H + 26 * s.k;
  }
  // Speed ramps harder too: +28% by wave 9 (was +16%). Same ceiling-neutral
  // family as the cadence -- how fast a foe arrives, never how many arrive.
  const ramp = Math.min(1.35, 1 + 0.035 * (s.wave - 1));
  const base = kind === "sapper" ? SAPPER_SPEED : kind === "car" ? CAR_SPEED : HEAVY_SPEED;
  const baseHp = kind === "sapper" ? SAPPER_HP : kind === "car" ? CAR_HP : HEAVY_HP + Math.min(2, Math.floor(s.wave / 5));
  // A bruiser is a heavy that took the long way round: same points, twice the
  // hull, slower. It has to be worth steering away from.
  const hp = bruiser ? Math.round(baseHp * 2.2) : baseHp;
  // VARIETY & ARC pass: `flank` targets the truck farthest from the player
  // instead of the truck nearest its own spawn point - see farthestTruck-
  // FromPlayer's header note. Falls back to nearestTruck if that ever comes
  // back empty (defensive only: it cannot, since spawning stops once the
  // convoy is lost).
  const farTarget = flank ? farthestTruckFromPlayer(s) : -1;
  const target = farTarget >= 0 ? farTarget : nearestTruck(s, x, y);
  s.foes.push({
    id: s.nextFoeId++,
    kind,
    bruiser,
    x,
    y,
    a: bruiser ? (side < 0 ? 0 : Math.PI) : side < 0 ? Math.PI / 2 : -Math.PI / 2,
    r: (kind === "sapper" ? 8 : kind === "car" ? 12 : bruiser ? 22 : 16) * s.k,
    hp,
    speed: base * ramp * (bruiser ? 0.8 : 1) * s.k,
    vx: 0,
    vy: 0,
    side,
    target,
    fireCd: 1.0 + s.rng() * 0.9,
    plant: 0,
    wave: s.wave,
    hit: 0,
    ko: 0,
    kvx: 0,
    kvy: 0,
    spin: 0,
    marked: false,
    age: 0,
    telegraph: 0,
    flank,
    // cars/heavies only: gives a freshly landed shifter a moment to settle
    // into its first position before it can move again
    shiftT: flank && kind !== "sapper" ? SHIFT_INTERVAL * 0.6 : 0,
  });
  // RANGING SHOT, late half: the wave's first shell already went out before
  // its first heavy walked in, so the mark lands the moment it spawns.
  if (
    kind === "heavy" &&
    s.mods.ranging &&
    s.rangingFiredWave === s.wave &&
    s.rangingMarkedWave < s.wave
  ) {
    markHeavy(s, s.foes[s.foes.length - 1]);
  }
}

// ── supply drops ───────────────────────────────────────────────────────────
/** The six-strong power pool an even crate maps its kind roll over. Fixed
 * order: the roll is the SAME first rng draw spawnDrop always made, so the
 * gameplay stream never forks (see the header's round-2 rng note). */
const POWER_POOL: readonly DropKind[] = ["ammo", "twin", "spread", "rapid", "haste", "range"];

function spawnDrop(s: WarpathState) {
  const roll = s.rng();
  // parity gate: crates 1,3,5,... (0-based even) carry a POWER-UP, the rest
  // carry the repair kit. Deterministic: the schedule is time-based and the
  // parity is a counter, so seed + inputs fix the whole sequence, and every
  // crate pays the same flat DROP_POINTS whatever its kind (ceiling-neutral).
  const kind: DropKind =
    s.dropCount % 2 === 0
      ? POWER_POOL[Math.min(POWER_POOL.length - 1, Math.floor(roll * POWER_POOL.length))]
      : "repair";
  s.dropCount++;
  const margin = 52 * s.k;
  const x = margin + s.rng() * (s.W - margin * 2);
  const keep = DROP_KEEPOUT * s.k;
  const north = s.rng() < 0.5;
  // land in the OPEN FIELD, clear of the road: taking it means leaving the post
  const lo = north ? margin : s.roadY + keep;
  const hi = north ? s.roadY - keep : s.H - margin;
  const y = lo + s.rng() * Math.max(1, hi - lo);
  s.drop = { x, y, kind, fall: DROP_FALL_T, life: DROP_LIFE, gone: false };
  s.banner = { txt: "SUPPLY DROP INBOUND", t: 1.5 };
}

function collectDrop(s: WarpathState, d: Drop) {
  d.gone = true;
  s.dropsTaken++;
  s.score += DROP_POINTS;
  if (d.kind === "repair") {
    for (const tk of s.trucks) if (tk.alive) tk.hp = Math.min(TRUCK_HP, tk.hp + REPAIR_AMOUNT);
    s.hp = s.maxHp;
    float(s, d.x, d.y - 18 * s.k, `REPAIR KIT +${DROP_POINTS}`, true);
  } else if (d.kind === "ammo") {
    s.ammoT = BOOST_T;
    float(s, d.x, d.y - 18 * s.k, `AMMO UP +${DROP_POINTS}`, true);
  } else if (d.kind === "twin") {
    s.twinT = BOOST_T;
    float(s, d.x, d.y - 18 * s.k, `TWIN GUN +${DROP_POINTS}`, true);
  } else if (d.kind === "spread") {
    s.spreadT = SPREAD_T;
    float(s, d.x, d.y - 18 * s.k, `SPREAD SHOT +${DROP_POINTS}`, true);
  } else if (d.kind === "rapid") {
    s.rapidT = RAPID_T;
    float(s, d.x, d.y - 18 * s.k, `DOUBLE SHOT +${DROP_POINTS}`, true);
  } else if (d.kind === "haste") {
    s.hasteT = HASTE_T;
    float(s, d.x, d.y - 18 * s.k, `SPEED BOOST +${DROP_POINTS}`, true);
  } else {
    s.rangeT = RANGE_T;
    float(s, d.x, d.y - 18 * s.k, `RANGE BOOST +${DROP_POINTS}`, true);
  }
  burst(s, d.x, d.y, 12, 160 * s.k, "spark", 2.2 * s.k);
}

// ── firing ─────────────────────────────────────────────────────────────────
/** RANGING SHOT lands: wider hit grace + one armor pip free (never below 1 hp,
 * so a mark can never kill by itself). No rng, no score, fixed counts. */
function markHeavy(s: WarpathState, f: Foe) {
  f.marked = true;
  f.hp = Math.max(1, f.hp - 1);
  s.rangingMarkedWave = s.wave;
  float(s, f.x, f.y - 22 * s.k, "MARKED");
  if (!s.sawRanging) {
    s.sawRanging = true;
    s.banner = { txt: COMBO_RANGING_NAME, t: 1.1 };
  }
}

/**
 * Effective shell reach in VIEW px (multiply by s.k at use sites): base
 * SHELL_RANGE grown by Caliber's rangeMul and, while RANGE BOOST runs, by
 * RANGE_MUL. Reach-only and clear-bound-safe (the header's Caliber argument),
 * so ceiling() is untouched. The page draws its range ring from this too, so
 * the ring can never lie about the gun.
 */
export function effRange(s: WarpathState): number {
  return SHELL_RANGE * s.mods.rangeMul * (s.rangeT > 0 ? RANGE_MUL : 1);
}

/** THE SQUAD.
 *
 * Three friendly tanks that pick their own fights, keep station on you, and
 * never shoot you in the back (friendly shells test enemies only -- an
 * auto-squad that can kill you is a griefer, not an ally).
 *
 * While the run is UNTOUCHED they hold fire completely. That is what keeps an
 * idle run from scoring: the squad would otherwise happily farm the field
 * while the player was away from the keyboard.
 */
function stepSquad(s: WarpathState, dt: number) {
  const k = s.k;
  const claimed: number[] = [];
  for (let i = 0; i < s.trucks.length; i++) {
    const t = s.trucks[i];
    if (!t.alive) continue;

    // 1. CLAIM: nearest live enemy nobody lower-indexed already took. Falling
    //    back to "nearest regardless" means a lone enemy still gets swarmed,
    //    which is correct: three tanks should gang up on the last one.
    let pick: Foe | null = null;
    let pickD = Infinity;
    let fallback: Foe | null = null;
    let fallbackD = Infinity;
    for (const f of s.foes) {
      if (f.hp <= 0 || f.ko > 0) continue;
      const d = Math.hypot(f.x - t.x, f.y - t.y);
      if (d < fallbackD) {
        fallbackD = d;
        fallback = f;
      }
      if (claimed.indexOf(f.id) >= 0) continue;
      if (d < pickD) {
        pickD = d;
        pick = f;
      }
    }
    const target = pick ?? fallback;
    t.claim = target ? target.id : -1;
    if (pick) claimed.push(pick.id);

    // 2. MOVE: rally to the player if the leash is stretched, else close to
    //    firing range and hold. A friendly that chases across the whole map is
    //    a friendly that dies alone.
    const dpx = s.px - t.x;
    const dpy = s.py - t.y;
    const dp = Math.hypot(dpx, dpy);
    let mx = 0;
    let my = 0;
    if (dp > FRIEND_LEASH * k) {
      mx = dpx / (dp || 1);
      my = dpy / (dp || 1);
    } else if (target) {
      const dx = target.x - t.x;
      const dy = target.y - t.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > FRIEND_RANGE * k) {
        mx = dx / d;
        my = dy / d;
      }
    }
    if (mx !== 0 || my !== 0) {
      t.a = Math.atan2(my, mx);
      const sp = FRIEND_SPEED * k * dt;
      t.x = Math.max(14 * k, Math.min(s.W - 14 * k, t.x + mx * sp));
      t.y = Math.max(14 * k, Math.min(s.H - 14 * k, t.y + my * sp));
    } else if (target) {
      t.a = Math.atan2(target.y - t.y, target.x - t.x);
    } else {
      // NOTHING TO DO: WANDER. A friendly holding a perfect firing line with
      // no target is three turrets in a row, not a squad -- and a squad that
      // never moves settles into a wall nothing can get past. The drift is a
      // slow deterministic circle around its own post, seeded on the tank's
      // index so the three never move in step.
      const ph = s.t * 0.6 + i * 2.1;
      const wx = Math.cos(ph);
      const wy = Math.sin(ph * 0.83);
      t.a = Math.atan2(wy, wx);
      const sp = FRIEND_SPEED * 0.34 * k * dt;
      t.x = Math.max(14 * k, Math.min(s.W - 14 * k, t.x + wx * sp));
      t.y = Math.max(14 * k, Math.min(s.H - 14 * k, t.y + wy * sp));
    }

    // 3. FIRE — DISARMED. The convoy is CARGO, not a second gun crew.
    //
    // Mike: "you don't even need the friendlies tbh, it's so easy". They were
    // clearing waves before the player got there, which made the run a
    // spectator sport. Disarmed rather than deleted: WARPATH's premise is "you
    // are the last tank guarding a stalled convoy", and a convoy defence with
    // no convoy is an arena with no objective. They still drive, still take
    // fire, still pay survival points — and every kill on the board is now
    // yours.
    //
    // `false &&` rather than deleting the block: if this is ever reversed, the
    // SQUAD_LEAD_R tuning that made them cover-not-lead comes back with it
    // instead of being reinvented from scratch.
    t.fireCd -= dt;
    if (FRIENDS_SHOOT && s.touched && t.fireCd <= 0 && target) {
      const d = Math.hypot(target.x - t.x, target.y - t.y);
      // THEY COVER YOUR FIGHT, NOT THE WHOLE FIELD. See SQUAD_LEAD_R: without
      // this the squad farms waves the player has not reached yet, which is
      // what "overpowered" actually meant.
      const dFromYou = Math.hypot(target.x - s.px, target.y - s.py);
      if (d <= FRIEND_RANGE * k * 1.05 && dFromYou <= SQUAD_LEAD_R * k) {
        t.fireCd = t.firePeriod;
        const tof = d / (SHELL_SPEED * s.k);
        // THEY MISS. A perfect intercept solution on every shell is what made
        // three allies sufficient on their own. The error is drawn from the
        // sim's own gameplay stream at a fixed point in the frame, so this
        // stays byte-identical on replay.
        const spread = (s.rng() - 0.5) * FRIEND_SPREAD;
        const a =
          Math.atan2(
            target.y + target.vy * tof - t.y,
            target.x + target.vx * tof - t.x,
          ) + spread;
        s.bullets.push({
          x: t.x + Math.cos(a) * (PLAYER_R + 8) * k,
          y: t.y + Math.sin(a) * (PLAYER_R + 8) * k,
          vx: Math.cos(a) * SHELL_SPEED * k,
          vy: Math.sin(a) * SHELL_SPEED * k,
          r: SHELL_R * k,
          life: (effRange(s) * k) / (SHELL_SPEED * k),
          dmg: FRIEND_DMG,
          // mine:true = a friendly shell, tested against foes exactly like your
          // own. Enemy shells (mine:false) are the ones that test allies, so a
          // squadmate can never shoot you.
          mine: true,
          pierce: 0,
          dead: false,
        });
      }
    }
  }

  // 4. SEPARATION: one pass, i<j, so the squad never collapses into one dot.
  //    Fixed order and symmetric pushes keep it replay-identical.
  for (let i = 0; i < s.trucks.length; i++) {
    const a = s.trucks[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < s.trucks.length; j++) {
      const b = s.trucks[j];
      if (!b.alive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = FRIEND_SEP * k;
      if (d > 0.001 && d < min) {
        const push = (min - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
      }
    }
  }
}

/** Per-frame target acquisition. Deterministic to the letter: strict `<`
 * comparisons, iteration in array order (spawn order), first index wins every
 * tie, and not one call into any rng stream. */
function updateLock(s: WarpathState, dt: number) {
  const reach = effRange(s) * s.k;
  let lock: Foe | null = null;
  let lockD = Infinity;
  let best: Foe | null = null;
  let bestD = Infinity;
  for (const f of s.foes) {
    if (f.hp <= 0 || f.ko > 0) continue;
    const d = Math.hypot(f.x - s.px, f.y - s.py);
    if (f.id === s.lockId) {
      lock = f;
      lockD = d;
    }
    if (d < bestD && d <= reach) {
      bestD = d;
      best = f;
    }
  }
  // the current lock survives while it lives and stays roughly in reach
  const lockAlive = lock !== null && lockD <= reach * LOCK_KEEP_RANGE_MUL;
  if (!lockAlive) {
    s.lockId = best ? best.id : -1;
    s.lockT = 0;
  } else {
    s.lockT += dt;
    // a challenger must be MEANINGFULLY closer, and only once the lock has
    // had time to be worth something
    if (best && best.id !== s.lockId && s.lockT >= LOCK_MIN_T && bestD < lockD * LOCK_SWITCH_FRAC) {
      s.lockId = best.id;
      s.lockT = 0;
    }
  }
  let tgt: Foe | null = null;
  if (s.lockId >= 0) {
    for (const f of s.foes) {
      if (f.id === s.lockId && f.hp > 0 && f.ko <= 0) {
        tgt = f;
        break;
      }
    }
  }
  if (tgt) {
    // lead the shell: same intercept solution the old in-cone snap used
    const d = Math.hypot(tgt.x - s.px, tgt.y - s.py);
    const tof = d / (SHELL_SPEED * s.k);
    s.wantA = Math.atan2(tgt.y + tgt.vy * tof - s.py, tgt.x + tgt.vx * tof - s.px);
  } else {
    // nothing to shoot: the barrel eases back to the hull's heading so the
    // tank never sits pointing at empty field
    let d = s.pa - s.wantA;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    s.wantA += Math.sign(d) * Math.min(Math.abs(d), TURRET_SLEW * 0.5 * dt);
  }
}

function fireGun(s: WarpathState) {
  // DOUBLE SHOT: the whole cycle at half cooldown (stacks with the ammo crate)
  s.fireCd = (s.ammoT > 0 ? FIRE_CD_AMMO : FIRE_CD) * (s.rapidT > 0 ? 0.5 : 1);
  s.muzzle = 0.07;
  // ── COMBO, RANGING SHOT (Optics >= 3 AND Caliber >= 15) ──────────────────
  // The FIRST shell of each wave spends the trigger; it marks the wave's
  // first heavy if one is already on the field, else spawnFoe marks the
  // first one to walk in. Waves without a heavy spend the trigger on nothing.
  if (s.mods.ranging && s.rangingFiredWave < s.wave) {
    s.rangingFiredWave = s.wave;
    for (const f of s.foes) {
      if (f.kind === "heavy" && f.wave === s.wave && f.hp > 0 && f.ko <= 0 && !f.marked) {
        markHeavy(s, f);
        break;
      }
    }
  }
  // NO SNAP-ON-FIRE. Warpath nudged the barrel onto an intercept at the
  // instant of firing, which was the right call when a tap both aimed and
  // fired. Here the lock has been aiming continuously, so snapping again would
  // hand back exactly the timing skill this game is built on: a shot taken
  // mid-slew is supposed to miss.
  // SPREAD SHOT beats TWIN while both run (a 3-fan already covers the pair)
  const shots = s.spreadT > 0 ? [-SPREAD_FAN, 0, SPREAD_FAN] : s.twinT > 0 ? [-0.06, 0.06] : [0];
  for (const off of shots) {
    const a = s.ta + off;
    s.bullets.push({
      x: s.px + Math.cos(a) * (PLAYER_R + 8) * s.k,
      y: s.py + Math.sin(a) * (PLAYER_R + 8) * s.k,
      vx: Math.cos(a) * SHELL_SPEED * s.k,
      vy: Math.sin(a) * SHELL_SPEED * s.k,
      r: SHELL_R * s.k,
      mine: true,
      // reach: Caliber + RANGE BOOST via effRange; SHELL_SPEED is left alone
      // so the slew triage keeps its timing.
      life: effRange(s) / SHELL_SPEED,
      // HOT SHELLS (the FINAL ASSAULT gate) is a separate multiplier, never a
      // mutation of mods: mods is frozen at construction by design.
      dmg: s.mods.shellDmg * s.choiceCaliberMul,
      pierce: s.ammoT > 0 ? 1 : 0,
      dead: false,
    });
  }
  burst(s, s.px + Math.cos(s.ta) * 16 * s.k, s.py + Math.sin(s.ta) * 16 * s.k, 3, 55 * s.k, "smoke", 2 * s.k);
}

/** The Siegebreaker's own shell: it carries a damage value rather than reading
 * one off its kind, because its volley and its heavy shell hit very
 * differently and both come from the same hull. */
function bossShot(s: WarpathState, f: Foe, aim: number, dmg: number, heavy: boolean) {
  const sp = (heavy ? 170 : 190) * s.k;
  s.bullets.push({
    x: f.x + Math.cos(aim) * (f.r + 5),
    y: f.y + Math.sin(aim) * (f.r + 5),
    vx: Math.cos(aim) * sp,
    vy: Math.sin(aim) * sp,
    r: (heavy ? 8 : 5.5) * s.k,
    mine: false,
    life: 5,
    dmg,
    pierce: 0,
    dead: false,
  });
}

function enemyShot(s: WarpathState, f: Foe, tx: number, ty: number) {
  const sp =
    (f.kind === "heavy" ? HEAVY_SHELL_SPEED : f.kind === "sapper" ? CAR_SHELL_SPEED * 0.72 : CAR_SHELL_SPEED) * s.k;
  // THEY LEAD THE SHOT NOW.
  //
  // Firing at where you ARE is free to dodge: hold any steady orbit and every
  // shell lands behind you, which is exactly the "strafe in circles and win"
  // Mike described. Aiming where you WILL BE punishes a predictable path and
  // rewards changing direction, so the counterplay becomes breaking the circle
  // rather than holding it.
  //
  // Only the PLAYER is led (the convoy is slow and cannot dodge, so leading it
  // would just be a flat accuracy buff), and only partially -- LEAD_FRAC below
  // 1 keeps a hard, committed turn genuinely evasive.
  const LEAD_FRAC = 0.7;
  let ax = tx;
  let ay = ty;
  const isPlayer = Math.hypot(tx - s.px, ty - s.py) < 1;
  if (isPlayer) {
    const tof = Math.hypot(tx - f.x, ty - f.y) / sp;
    ax = tx + s.pvx * tof * LEAD_FRAC;
    ay = ty + s.pvy * tof * LEAD_FRAC;
  }
  const a = Math.atan2(ay - f.y, ax - f.x);
  s.bullets.push({
    x: f.x + Math.cos(a) * (f.r + 5),
    y: f.y + Math.sin(a) * (f.r + 5),
    vx: Math.cos(a) * sp,
    vy: Math.sin(a) * sp,
    r: (f.kind === "heavy" ? 6 : 4.5) * s.k,
    mine: false,
    life: 4.5,
    dmg: f.kind === "heavy" ? HEAVY_DMG : CAR_DMG,
    pierce: 0,
    dead: false,
  });
}

// ── step ───────────────────────────────────────────────────────────────────
/** Advance one frame. Pointer coords in `input` are WORLD coordinates (the
 * page's pointerTransform adds the camera offset before the sim sees them).
 * The trailing params are legacy no-ops: the world is fixed at construction
 * and mid-run resize is not a thing under RunShell; they stay so existing
 * call sites (the harness passes s.W/s.H) keep compiling unchanged. */
export function stepWarpath(s: WarpathState, dt: number, input: SimInput, _w?: number, _h?: number): void {

  // cosmetic clocks always run
  if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 26);
  if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 2);
  if (s.muzzle > 0) s.muzzle = Math.max(0, s.muzzle - dt);
  if (s.banner) {
    s.banner.t -= dt;
    if (s.banner.t <= 0) s.banner = null;
  }
  for (const p of s.parts) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.kind === "smoke") p.r += 8 * dt;
  }
  s.parts = s.parts.filter((p) => p.life > 0);
  for (const f of s.floats) {
    f.y -= 30 * dt;
    f.life -= dt;
  }
  s.floats = s.floats.filter((f) => f.life > 0);
  for (const tr of s.treads) tr.life -= dt * 0.28;
  s.treads = s.treads.filter((tr) => tr.life > 0);
  for (const tk of s.trucks) {
    if (tk.hit > 0) tk.hit = Math.max(0, tk.hit - dt);
    if (!tk.alive && tk.burn > 0 && tk.burn < 1) tk.burn = Math.min(1, tk.burn + dt * 2);
    // the wreck keeps smoldering: a periodic smoke wisp so a destroyed truck
    // reads as an ongoing scene, never a static opacity-adjusted sprite
    if (!tk.alive) {
      tk.smokeCd -= dt;
      if (tk.smokeCd <= 0) {
        tk.smokeCd = 0.55 + s.rngFx() * 0.45;
        burst(s, tk.x + (s.rngFx() - 0.5) * 10 * s.k, tk.y - 5 * s.k, 2, 16 * s.k, "smoke", 3 * s.k);
      }
    }
  }

  // tap detection runs in every phase so it cannot misfire across pauses
  const freshDown = input.down && !s.wasDown;
  if (freshDown && input.px != null && input.py != null) {
    s.downT = 0;
    s.downX = input.px;
    s.downY = input.py;
    s.downMoved = 0;
  }
  if (input.down) {
    s.downT += dt;
    if (input.px != null && input.py != null) {
      s.downMoved = Math.max(s.downMoved, Math.hypot(input.px - s.downX, input.py - s.downY));
    }
  }
  const released = !input.down && s.wasDown;
  s.wasDown = input.down;
  // capture a qualifying quick-tap release HERE, before any phase/freeze/
  // choice-gate early return can skip it: a hit-stop freeze that lands on
  // exactly the down->up frame would otherwise erase the local `released`
  // forever (it is never persisted). pendingTap IS persisted, so it survives
  // any number of frozen or paused frames until a live consumer reads it -
  // see the choice-gate and turret-tap consumers below. Mirrors the
  // original gate exactly (phase play, hull not tracked out).
  if (s.phase === "play" && s.disabled <= 0 && released && s.downT < TAP_MAX_T && s.downMoved < TAP_MAX_MOVE * s.k) {
    s.pendingTap = true;
  }
  // the AFK gate reads INTENT: a press, a drive key or space is playing.
  // Hover alone is not (it can neither steer nor fire). Once touched, the
  // unmanned-line collapse below is inert for the rest of the run.
  if (input.down || input.left || input.right || input.up || input.downKey || input.space) {
    s.touched = true;
  }

  if (s.phase === "intro") {
    s.phaseT -= dt;
    if (s.phaseT <= 0) {
      s.phase = "play";
      startWave(s);
    }
    return;
  }
  if (s.phase === "ko" || s.phase === "over") {
    if (s.phase === "ko") {
      s.phaseT -= dt;
      if (s.phaseT <= 0) s.over = true;
    }
    return;
  }
  if (s.freeze > 0) {
    s.freeze = Math.max(0, s.freeze - dt);
    return;
  }

  // ── THE FINAL ASSAULT GATE: a paused build-choice moment ─────────────────
  // Spawns, the wave clock and enemy/bullet simulation all hold their breath
  // (same philosophy as highnoon's level-up pause). Keyed off pendingTap (a
  // qualifying release, captured above the freeze check - see its comment)
  // rather than freshDown, so a press that lands on the entrance's own
  // freeze bump still resolves the pick the moment the gate can read it,
  // instead of being silently dropped. Uses downX (the press-time point,
  // consistent with the turret's own tap grammar), not input.px (the
  // release-time point, which TAP_MAX_MOVE keeps close but is not the same
  // read the rest of the game uses). No press before the timer runs out
  // defaults to HOT SHELLS. See resolveChoice and the file header.
  if (s.choicePending) {
    if (s.choiceT > 0) s.choiceT = Math.max(0, s.choiceT - dt);
    if (s.pendingTap) {
      s.pendingTap = false;
      resolveChoice(s, s.downX < s.px ? 0 : 1);
    } else if (s.choiceT <= 0) {
      resolveChoice(s, 1);
    }
    return;
  }

  s.t += dt;
  // one early, honest warning while the line is unmanned (cosmetic only)
  if (!s.touched && !s.warnedIdle && s.t >= 4) {
    s.warnedIdle = true;
    s.banner = { txt: "CONVOY UNDEFENDED", t: 1.6 };
  }
  if (s.fireCd > 0) s.fireCd = Math.max(0, s.fireCd - dt);
  if (s.iframes > 0) s.iframes = Math.max(0, s.iframes - dt);
  if (s.ammoT > 0) s.ammoT = Math.max(0, s.ammoT - dt);
  if (s.twinT > 0) s.twinT = Math.max(0, s.twinT - dt);
  if (s.spreadT > 0) s.spreadT = Math.max(0, s.spreadT - dt);
  if (s.rapidT > 0) s.rapidT = Math.max(0, s.rapidT - dt);
  if (s.hasteT > 0) s.hasteT = Math.max(0, s.hasteT - dt);
  if (s.rangeT > 0) s.rangeT = Math.max(0, s.rangeT - dt);
  if (s.ramCd > 0) s.ramCd = Math.max(0, s.ramCd - dt);
  if (s.disabled > 0) {
    s.disabled = Math.max(0, s.disabled - dt);
    if (s.disabled === 0) {
      s.hp = s.maxHp;
      s.iframes = s.mods.iframes; // Smoke: a longer post-hit window
      s.banner = { txt: "BACK IN THE FIGHT", t: 1.1 };
    }
  }

  // ── player: hold-to-steer hull + slewing turret ──────────────────────────
  const live = s.disabled <= 0;
  let dirx = 0;
  let diry = 0;
  // Keys are unambiguous, so they drive at full speed immediately. Only the
  // pointer ramps in (see DRIVE_RAMP_T).
  let driveMul = 1;
  if (live) {
    const kx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const ky = (input.downKey ? 1 : 0) - (input.up ? 1 : 0);
    if (kx !== 0 || ky !== 0) {
      const m = Math.hypot(kx, ky) || 1;
      dirx = kx / m;
      diry = ky / m;
    } else if (input.down && input.px != null && input.py != null) {
      const dx = input.px - s.px;
      const dy = input.py - s.py;
      const d = Math.hypot(dx, dy);
      if (d > STOP_R * s.k) {
        dirx = dx / d;
        diry = dy / d;
        driveMul = Math.min(1, s.downT / DRIVE_RAMP_T);
      }
    }
  }
  // Standing still means standing still: without this the last velocity would
  // persist and foes would keep leading a tank that stopped moving.
  if (dirx === 0 && diry === 0) {
    s.pvx = 0;
    s.pvy = 0;
  }
  if (dirx !== 0 || diry !== 0) {
    const want = Math.atan2(diry, dirx);
    let dh = want - s.pa;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    // Engine: the HULL turns and rolls harder. TURRET_SLEW is untouched on
    // purpose: the slew is the triage cost the whole game is built on.
    s.pa += Math.sign(dh) * Math.min(Math.abs(dh), HULL_TURN * s.mods.turnMul * dt);
    // SPEED BOOST: HASTE_MUL on the hull while the crate's clock runs. Input
    // is still required to move at all, so an idle run gains nothing from it.
    const sp = PLAYER_SPEED * s.mods.speedMul * (s.hasteT > 0 ? HASTE_MUL : 1) * driveMul * s.k * dt;

    // DRIVE ALONG THE HULL, NOT ALONG THE INPUT.
    //
    // This used to move the tank straight down dirx/diry while s.pa was still
    // rotating to catch up, so the hull pointed one way and the tank travelled
    // another: a hovercraft with a tank painted on it. Worse, it made
    // circle-strafing free, which is how you could orbit an enemy and win
    // without ever committing to a direction.
    //
    // Now the drag sets a heading you WANT and the tank drives where it is
    // actually pointing. `align` is the cost of turning: pointed 90 degrees off
    // your drag you barely move, so holding a circle bleeds speed continuously.
    // Negative align is left in on purpose -- backing up slowly beats forcing a
    // full three-point turn to retreat.
    const hx = Math.cos(s.pa);
    const hy = Math.sin(s.pa);
    const align = hx * dirx + hy * diry;
    const drive = align >= 0 ? 0.25 + 0.75 * align : align * 0.45;
    // COVER IS SOLID. Each axis is tested on its own so a hull that meets a
    // rock at an angle SLIDES along it rather than stopping dead -- getting
    // stuck on a corner is the classic way cover turns from tactical into
    // annoying.
    {
      const nx = Math.max(14 * s.k, Math.min(s.W - 14 * s.k, s.px + hx * sp * drive));
      const ny = Math.max(14 * s.k, Math.min(s.H - 14 * s.k, s.py + hy * sp * drive));
      const pad = PLAYER_R * s.k * 0.8;
      const wasX = s.px;
      const wasY = s.py;
      if (!inRock(s, nx, s.py, pad)) s.px = nx;
      if (!inRock(s, s.px, ny, pad)) s.py = ny;
      // Velocity from the ACTUAL delta, after cover has had its say: a hull
      // grinding along a rock is barely moving, and a foe leading it should
      // aim where it really goes, not where the input asked.
      if (dt > 0) {
        s.pvx = (s.px - wasX) / dt;
        s.pvy = (s.py - wasY) / dt;
      }
    }
    s.treadCd -= dt;
    if (s.treadCd <= 0 && s.treads.length < TREAD_CAP) {
      s.treadCd = 0.11;
      s.treads.push({ x: s.px, y: s.py, a: s.pa, life: 1 });
    }
  }
  const driving = live && (dirx !== 0 || diry !== 0);

  // ── COMBO, DUST CLOUD (Engine >= 3 AND Smoke >= 3) ───────────────────────
  // A pure read of whether the hull moved this frame: no rng, no score, no
  // schedule. It buys nothing but your own skin, and standing still resets it.
  if (s.mods.dust) {
    if (s.dustT > 0) {
      s.dustT = Math.max(0, s.dustT - dt);
      if (s.dustT === 0) {
        s.dustCharge = 0;
        s.dustStill = 0;
      }
    } else if (driving) {
      s.dustStill = 0;
      s.dustCharge += dt;
      if (s.dustCharge >= DUST_CHARGE_T) {
        s.dustT = DUST_T;
        burst(s, s.px, s.py, 8, 60 * s.k, "smoke", 3.4 * s.k);
        if (!s.sawDust) {
          s.sawDust = true;
          s.banner = { txt: COMBO_DUST_NAME, t: 1.1 };
        }
      }
    } else {
      s.dustStill += dt;
      if (s.dustStill >= DUST_BREAK_T) s.dustCharge = 0;
    }
  }
  // the convoy is solid: you drive around it, never through it
  for (const tk of s.trucks) {
    if (!tk.alive) continue;
    const dx = s.px - tk.x;
    const dy = s.py - tk.y;
    const rr = (TRUCK_R + PLAYER_R) * s.k;
    const d = Math.hypot(dx, dy);
    if (d > 0.001 && d < rr) {
      s.px = tk.x + (dx / d) * rr;
      s.py = tk.y + (dy / d) * rr;
    }
  }

  // a quick tap aims the turret and queues the shot; the gun waits for the
  // slew. Keyed off pendingTap (captured above, before the freeze check),
  // not the local `released`: a tap whose release lands on a hit-stop frame
  // is deferred to the next live frame instead of silently dropped - see
  // pendingTap's declaration for why this matters now that hit-stop fires on
  // every kill instead of one call site.
  if (live) stepSquad(s, dt);
  if (live && s.bossOut) stepBoss(s, dt);

  // ── THE LOCK: pick, then slew, then let the player pull the trigger ──────
  if (live) updateLock(s, dt);

  // A tap (or SPACE) is now ONLY the trigger. It does not aim, it does not
  // wait for the slew: the shell leaves along the barrel's CURRENT angle, so
  // firing while the turret is still swinging misses on purpose.
  if (live && s.pendingTap) {
    s.pendingTap = false;
    s.fireQueued = true;
    s.fireQueueT = 0;
  }
  if (live && input.space && !s.fireQueued) {
    s.fireQueued = true;
    s.fireQueueT = 0;
  }
  let da = s.wantA - s.ta;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  s.ta += Math.sign(da) * Math.min(Math.abs(da), TURRET_SLEW * dt);
  // FIRE WHEN THE GUN IS ON TARGET, not when the finger moves. The tap is an
  // ORDER; the shell leaves as the barrel comes round. That is the version
  // Mike liked, and it is what makes the traverse cost anything at all.
  if (s.fireQueued) {
    s.fireQueueT += dt;
    if (s.fireQueueT > FIRE_QUEUE_T) {
      s.fireQueued = false;
      s.fireQueueT = 0;
    }
  }
  if (live && s.fireQueued && s.fireCd <= 0 && Math.abs(da) <= AIM_TOL) {
    s.fireQueued = false;
    s.fireQueueT = 0;
    fireGun(s);
  }

  // ── wave director ────────────────────────────────────────────────────────
  s.waveT += dt;
  if (s.waveBreakT > 0) {
    s.waveBreakT -= dt;
    if (s.waveBreakT <= 0) startWave(s);
  } else if (s.spawnQueue.length > 0) {
    s.spawnT -= dt;
    if (s.spawnT <= 0) {
      const next = s.spawnQueue.shift();
      if (next) {
        spawnFoe(s, next.kind, next.flank);
        // VARIETY & ARC pass: the gap to the NEXT spawn depends on this wave's
        // pattern, not one flat constant - see PATTERN_GAP's header note.
        s.spawnT = PATTERN_GAP[wavePattern(s.wave)](s.spawnIdx);
        s.spawnIdx++;
      } else {
        s.spawnT = 0.5;
      }
    }
  } else if (!s.bossOut && (s.foes.length === 0 || s.waveT >= WAVE_MAX_T)) {
    // The director STOPS once the Siegebreaker is out. Without this guard the
    // boss phase keeps satisfying `waveT >= WAVE_MAX_T` every single frame,
    // and each call paid another wave-clear bonus: the oracle banked 21,601
    // against a 2,346 ceiling before this was caught. The boss fight has no
    // wave clock by design - it ends when one of you is dead.
    advanceWave(s);
    if (s.phase !== "play") return;
  }

  // ── supply drops ─────────────────────────────────────────────────────────
  if (!s.drop) {
    s.dropT -= dt;
    if (s.dropT <= 0) {
      spawnDrop(s);
      s.dropT = DROP_INTERVAL;
    }
  } else {
    const d = s.drop;
    if (d.fall > 0) {
      d.fall = Math.max(0, d.fall - dt);
    } else {
      d.life -= dt;
      if (live && Math.hypot(d.x - s.px, d.y - s.py) < DROP_PICKUP_R * s.k) collectDrop(s, d);
      else if (d.life <= 0) {
        d.gone = true;
        float(s, d.x, d.y - 14 * s.k, "SUPPLY LOST");
        burst(s, d.x, d.y, 6, 70 * s.k, "smoke", 4 * s.k);
      }
    }
    if (d.gone) s.drop = null;
  }

  // ── enemies ──────────────────────────────────────────────────────────────
  for (const f of s.foes) {
    f.age += dt; // pure clock: the minimap spawn flash reads it, nothing else
    if (f.hit > 0) f.hit = Math.max(0, f.hit - dt);
    if (f.ko > 0) {
      f.ko -= dt;
      f.x += f.kvx * dt;
      f.y += f.kvy * dt;
      // knockback decays under drag instead of sliding at constant speed for
      // the whole ko window: a real deceleration, not a linear vanish. Pure
      // function of dt; the corpse takes no part in any collision/scoring/
      // targeting code (the `continue` below), so this is cosmetic-adjacent
      // state with zero determinism or ceiling risk.
      const drag = Math.max(0, 1 - KO_DRAG * dt);
      f.kvx *= drag;
      f.kvy *= drag;
      continue;
    }
    // keep the target honest: a dead truck means pick the next one, still
    // respecting flank (a flanker whose truck dies re-aims at the farthest
    // survivor, not the nearest - it does not un-become a flanker)
    if (f.target < 0 || !s.trucks[f.target] || !s.trucks[f.target].alive) {
      // UNTOUCHED RUN: every enemy comes straight for YOUR hull. Holdline
      // ended an idle run by losing the convoy; warpath does not end on a
      // squad wipe, so without this an untouched run would simply never
      // finish. Target -1 means "the player" throughout the engage loop.
      f.target = !s.touched ? -1 : f.flank ? farthestTruckFromPlayer(s) : nearestTruck(s, f.x, f.y);
      f.plant = 0;
    }
    // target -1 means THE PLAYER: either the run is untouched (see the
    // retarget above) or the squad is gone. Holdline could `continue` here
    // because losing the convoy ended the run; warpath fights on, so a foe
    // with no squadmate to shoot comes for your hull instead.
    const tgtTruck = f.target >= 0 ? s.trucks[f.target] : null;
    const tk = tgtTruck ?? { x: s.px, y: s.py };

    if (f.kind === "sapper") {
      // ── COMBO, RAM (Armor >= 3 AND Engine >= 3) ─────────────────────────
      // A hull that is actually moving crushes a sapper on contact, lit fuse
      // and all. Ceiling-neutral: killFoe pays the same points a shell would,
      // and a sapper can only die once. Cars and heavies shrug it off.
      if (s.mods.ram && driving && s.ramCd <= 0 && Math.hypot(f.x - s.px, f.y - s.py) < PLAYER_R * s.k + f.r) {
        s.ramCd = RAM_CD;
        if (!s.sawRam) {
          s.sawRam = true;
          s.banner = { txt: COMBO_RAM_NAME, t: 1.1 };
        }
        killFoe(s, f);
        continue;
      }
      if (f.plant > 0) {
        f.vx = 0;
        f.vy = 0;
        f.plant -= dt;
        if (f.plant <= 0) detonate(s, f);
        continue;
      }
      // THE ZAP (Mike 2026-08-02: "the smallest enemies should shoot
      // something too"). A short-range stinger at the PLAYER only, never the
      // squad: long cadence, a slower shell (enemyShot's sapper case), fully
      // telegraphed through the same f.telegraph channel cars use, and never
      // while planting - a sapper is a breacher first, a gunner second.
      if (live) {
        const zd = Math.hypot(s.px - f.x, s.py - f.y);
        f.fireCd -= dt;
        if (f.fireCd <= 0 && zd <= SAPPER_ZAP_R * s.k) {
          f.fireCd = Math.max(2.2, 2.9 - 0.06 * f.wave) + s.rng() * 0.5;
          enemyShot(s, f, s.px, s.py);
          f.telegraph = 0;
        } else if (f.fireCd <= 0) {
          f.fireCd = 0.2; // out of reach: retest soon, never burn an rng roll
          f.telegraph = 0;
        } else if (zd <= SAPPER_ZAP_R * s.k * 1.05 && f.fireCd < TELEGRAPH_WINDOW) {
          f.telegraph = 1 - f.fireCd / TELEGRAPH_WINDOW;
        } else {
          f.telegraph = 0;
        }
      }
      const dx = tk.x - f.x;
      const dy = tk.y - f.y;
      const d = Math.hypot(dx, dy) || 1;
      f.a = Math.atan2(dy, dx);
      if (d < PLANT_R * s.k) {
        f.plant = FUSE_T;
        f.vx = 0;
        f.vy = 0;
      } else {
        f.vx = (dx / d) * f.speed;
        f.vy = (dy / d) * f.speed;
        // Cover is solid for them too, and per-axis so a foe slides along a
        // rock instead of grinding into it forever.
        {
          const fnx = f.x + f.vx * dt;
          const fny = f.y + f.vy * dt;
          if (!inRock(s, fnx, f.y, f.r * 0.8)) f.x = fnx;
          if (!inRock(s, f.x, fny, f.r * 0.8)) f.y = fny;
        }
      }
      continue;
    }

    // cars + heavies: stand off and shell. Park your hull in front of the
    // convoy and they will shoot YOU instead: the tank-plug play.
    const pd = Math.hypot(s.px - f.x, s.py - f.y);
    // f.target === -1 means "the player" (set for every foe while the run is
    // untouched, see the spawn/retarget site). Otherwise the usual rule: park
    // your hull in front of a squadmate and they shoot YOU instead.
    const onPlayer = live && (f.target < 0 || pd < AGGRO_R * s.k);
    const tx = onPlayer ? s.px : tk.x;
    const ty = onPlayer ? s.py : tk.y;
    const dx = tx - f.x;
    const dy = ty - f.y;
    const d = Math.hypot(dx, dy) || 1;
    f.a = Math.atan2(dy, dx);
    const range = (f.kind === "heavy" ? HEAVY_RANGE : CAR_RANGE) * s.k;
    if (d > range) {
      f.vx = (dx / d) * f.speed;
      f.vy = (dy / d) * f.speed;
      // COVER IS SOLID FOR THEM TOO, tested per axis so a foe meeting a rock
      // at an angle SLIDES along it and keeps coming. Stopping dead on a
      // corner is how cover turns from tactical into annoying, on both sides.
      const fnx = f.x + f.vx * dt;
      const fny = f.y + f.vy * dt;
      if (!inRock(s, fnx, f.y, f.r * 0.8)) f.x = fnx;
      if (!inRock(s, f.x, fny, f.r * 0.8)) f.y = fny;
    } else {
      f.vx = 0;
      f.vy = 0;
    }
    f.fireCd -= dt;
    if (f.fireCd <= 0 && d <= range * 1.05) {
      // FASTER AGAIN, and steeper (Mike, 2026-08-01: "the game is still too
      // easy. Maybe enemies shoot faster each wave?"). The ramp already
      // existed; it was too shallow to feel and both floors capped out before
      // the run did. Heavies close from 2.22s at wave 1 to 1.13s at wave 9
      // (was 1.58), cars from 1.08s to 0.50s (was 0.66) -- so the last three
      // waves are a genuinely different fight rather than the same one with
      // more bodies. Cadence appears NOWHERE in ceiling(): counts, point
      // values and the schedule are untouched, so this is ceiling-neutral.
      const base =
        f.kind === "heavy"
          ? Math.max(1.05, 2.3 - 0.13 * f.wave)
          : Math.max(0.5, 1.15 - 0.075 * f.wave);
      f.fireCd = base + s.rng() * 0.6;
      enemyShot(s, f, tx, ty);
      f.telegraph = 0;
    } else if (f.fireCd <= 0) {
      f.fireCd = 0.2; // closing: retest soon, but never burn an rng roll
      f.telegraph = 0;
    } else if (d <= range * 1.05 && f.fireCd < TELEGRAPH_WINDOW) {
      // charging, drawn ON the hostile's own body: a pure read of the SAME
      // fireCd the sim already runs, no new rng, no new decision
      f.telegraph = 1 - f.fireCd / TELEGRAPH_WINDOW;
    } else {
      f.telegraph = 0;
    }
    // ── SHIFTER (VARIETY & ARC pass): a flagged car/heavy periodically
    // abandons a solved position for the truck farthest from the player, so a
    // good read goes stale. Timer-driven, no rng. Never fires mid-approach
    // (only while it is actually holding, d <= range) and never while it has
    // aggroed the player (onPlayer): pulling the target out from under a
    // fight the player is already winning by standing in the way would be
    // exactly the "unfair" this file's laws forbid.
    if (f.flank && !onPlayer && d <= range) {
      f.shiftT -= dt;
      if (f.shiftT <= 0) {
        f.shiftT = SHIFT_INTERVAL;
        const nt = farthestTruckFromPlayer(s);
        if (nt >= 0) f.target = nt;
      }
    }
  }
  s.foes = s.foes.filter((f) => (f.hp > 0 ? true : f.ko > 0.001));

  // ── bullets ──────────────────────────────────────────────────────────────
  for (const b of s.bullets) {
    if (b.dead) continue;
    const SUB = 2; // substep so fast shells cannot tunnel a small hitbox
    const sdt = dt / SUB;
    for (let i = 0; i < SUB && !b.dead; i++) {
      b.x += b.vx * sdt;
      b.y += b.vy * sdt;
      b.life -= sdt;
      if (b.life <= 0) {
        b.dead = true;
        if (b.mine) burst(s, b.x, b.y, 3, 60 * s.k, "smoke", 1.6 * s.k);
        break;
      }
      // COVER STOPS SHELLS, yours and theirs alike. This is the whole reason
      // rocks are in the sim rather than painted on: a rock you can shoot
      // through is scenery, and scenery does not make position matter.
      if (inRock(s, b.x, b.y)) {
        b.dead = true;
        burst(s, b.x, b.y, 4, 70 * s.k, "spark", 1.5 * s.k);
        break;
      }
      if (b.mine) {
        for (const f of s.foes) {
          if (f.hp <= 0 || f.ko > 0) continue;
          // RANGING SHOT's crit window: the marked heavy is easier to land on
          if (Math.hypot(f.x - b.x, f.y - b.y) < f.r + b.r + (f.marked ? RANGING_GRACE * s.k : 0)) {
            // OVERHEAT is the fight's reward loop, so it has to be felt: a
            // cooked Siegebreaker takes multiplied damage. Applied at the one
            // place damage enters a foe, so nothing routes around it.
            f.hp -= b.dmg * (f.kind === "boss" && s.bossState === "overheat" ? BOSS_OVERHEAT_MUL : 1);
            f.hit = 0.14;
            burst(s, b.x, b.y, 3, 90 * s.k, "spark", 1.6 * s.k);
            if (f.hp <= 0) killFoe(s, f);
            if (b.pierce > 0) b.pierce--;
            else b.dead = true;
            break;
          }
        }
      } else {
        if (live && s.iframes <= 0 && s.dustT <= 0 && Math.hypot(b.x - s.px, b.y - s.py) < PLAYER_R * s.k + b.r) {
          b.dead = true;
          damagePlayer(s, b.dmg);
          break;
        }
        for (let ti = 0; ti < s.trucks.length; ti++) {
          const tk = s.trucks[ti];
          if (!tk.alive) continue;
          if (Math.abs(b.x - tk.x) < TRUCK_W * 0.5 * s.k + b.r && Math.abs(b.y - tk.y) < TRUCK_H * 0.5 * s.k + b.r) {
            b.dead = true;
            damageTruck(s, ti, b.dmg);
            burst(s, b.x, b.y, 4, 100 * s.k, "spark", 1.8 * s.k);
            break;
          }
        }
      }
    }
    if (b.x < -40 || b.x > s.W + 40 || b.y < -60 || b.y > s.H + 60) b.dead = true;
  }
  s.bullets = s.bullets.filter((b) => !b.dead);
}

/**
 * OPTICS ("see first"): the BANK the next foe of this wave will walk down, and
 * what it is, flagged `mods.spawnLead` seconds before it arrives. Spawns
 * alternate flanks by design, so this is the one warning that actually helps the
 * triage read: you learn which way to start slewing before the shape appears.
 * A pure READ of state the sim already holds (spawnSide + spawnQueue + the
 * stagger timer), so it adds no rng, no state and no score. With Optics 0 the
 * lead is 0 and this always returns null.
 */
export function nextSpawnPreview(s: WarpathState): { side: number; kind: FoeKind; heat: number } | null {
  const lead = s.mods.spawnLead;
  if (lead <= 0 || s.phase !== "play" || s.spawnQueue.length === 0) return null;
  if (s.waveBreakT > 0 || s.spawnT > lead) return null;
  const next = s.spawnQueue[0];
  if (!next) return null;
  return { side: s.spawnSide, kind: next.kind, heat: Math.max(0, Math.min(1, 1 - s.spawnT / lead)) };
}

export function warpathDone(s: WarpathState): boolean {
  return s.over;
}
export function warpathScore(s: WarpathState): number {
  return s.score;
}

/** Trucks still rolling: the page HUD and the run meta both read this. */
export function warpathSquadAlive(s: WarpathState): number {
  return trucksAlive(s);
}

// ── the shareable grid (3 rows x 5 cells = waves 1-5 / 6-10 / 11-15) ────────
export const SEG_RED = "\u{1F7E5}"; // wave survived, every truck still rolling
export const SEG_ORANGE = "\u{1F7E7}"; // wave survived, but a truck burned
export const SEG_MISS = "⬛"; // unreached
export const MARK_DEATH = "\u{1F4A5}"; // the wave the convoy died in
export const MARK_EXTRACT = "\u{1F3C1}"; // the relief column arrived

/** Pure read of the run's wave log (no rng, no mutation). The fatal wave
 * shows the death mark even if it was technically completed first (a convoy
 * that dies in the wave break died holding that wave: the mark is honest). */
export function gridEmoji(s: WarpathState): string {
  const fatal = s.win ? 0 : Math.max(1, s.wave);
  const rows: string[] = [];
  for (let r = 0; r < 3; r++) {
    let row = "";
    for (let c = 0; c < 5; c++) {
      const wv = r * 5 + c + 1;
      if (!s.win && wv === fatal) row += MARK_DEATH;
      else if (wv <= s.waveLog.length) row += s.waveLog[wv - 1] ? SEG_ORANGE : SEG_RED;
      else row += SEG_MISS;
    }
    if (s.win && r === 2) row += MARK_EXTRACT;
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

/**
 * The copyable share payload. MM-DD from the run's UTC day. No em-dashes
 * anywhere; the middle dot is deliberate (the tankbuster precedent).
 */
export function sharePayload(dayKey: string, damage: number, trucks: number, grid: string): string {
  const mmdd = dayKey.slice(5);
  return `WARPATH ${mmdd} · ${fmtDamage(damage)} damage · ${trucks}/${TRUCKS} trucks\n${grid}\nTonight's raid needs every shot. tanks.web3guides.com`;
}

/**
 * The EXACT legit score ceiling, computed from the same constants the sim
 * runs on, so lib/s5/games maxScore can never drift from the game.
 *
 * Every kill is worth its SPAWN wave's multiplier (never the current wave), so
 * the ceiling is count-bound: waveComp fixes exactly how many of each unit can
 * ever exist across RUN_MAX_WAVES. The survival bonus assumes all TRUCKS alive
 * every wave. The drop term assumes the longest possible run (every wave rides
 * out its full WAVE_MAX_T, which a score-maximiser would do to farm crates)
 * and a crate every DROP_INTERVAL with zero fall or travel time, which is
 * strictly generous.
 *
 * It takes NO stats and reads NO state on purpose: every modifier warpathMods (or
 * a FINAL ASSAULT gate pick) derives is ceiling-neutral, so the answer is the
 * same for a stock tank, a fully upgraded one, and either gate choice.
 *
 * THE WORLD-SPACE REWORK and THE ROUND-2 TUNE touched none of this (world
 * geometry, feel constants and the power-up crates are all reach/rate/kind
 * only - see the git history on this function for the full arguments).
 *
 * THE VARIETY & ARC PASS (2026-07-26) MOVED IT AGAIN, on purpose, and this is
 * the derivation (see the file header for what changed and why):
 *   kills    : waveComp over waves 1..15, now WAVE_SPEC for every wave (not
 *              just 11-15) = 4283, each unit rounded at its own spawn wave's
 *              multiplier
 *   survival : 8 x 5 trucks x sum(waveMult, waves 1..15), rounded per wave = 1104
 *              (waveComp never touches the survival term, so this is unchanged
 *              from every earlier pass)
 *   drops    : longest possible run = INTRO_T + 15xWAVE_MAX_T + 13xWAVE_BREAK +
 *              (CHOICE_T + CHOICE_CONFIRM_T) = 411.3s (13, not 14, normal
 *              breaks: the wave14->15 FINAL ASSAULT gate replaces the 14th;
 *              WAVE_BREAK is now 1.2, down from 1.8 - the dead-beat cut).
 *              First crate at 13s then one every 17s => 24 crates x30 = 720
 *   relief   : +250 for surviving all 15 waves
 *   TOTAL 4283 + 1104 + 720 + 250 = 6357, which assumes a perfect run that
 *   also stalls every wave to its full 26s timeout to farm crates (the two
 *   goals fight each other, so 6357 is unreachable in practice: the live
 *   max-stat oracle scores 2222, wave 11, comfortably under it). 6993 = this
 *   ceiling + ~10% margin (see lib/s5/games.ts).
 *
 * AT MAX STATS: still 6357, re-asserted from this function itself (it takes
 * no stats argument). Armor/Smoke/Engine buy survival and reach only; Optics
 * is a pure readout; Caliber and the FINAL ASSAULT'S HOT SHELLS pick both
 * raise shell damage, which (the documented Caliber argument) only ever rolls
 * a cleared wave on SOONER - a SHORTER run sees FEWER crates, never more. The
 * IRON HULL pick is the same argument as Armor: more hp, not more score.
 * Flanking/shifting (the VARIETY & ARC pass) never appears in this function
 * at all: it changes WHICH truck a spawn walks toward, never the spawn table
 * waveComp reads from, so it cannot move a single term above.
 */
export function ceiling(): {
  kills: number;
  survival: number;
  drops: number;
  boss: number;
  relief: number;
  total: number;
  maxRunSeconds: number;
  maxDrops: number;
} {
  let kills = 0;
  let survival = 0;
  for (let k = 1; k <= RUN_MAX_WAVES; k++) {
    const c = waveComp(k);
    const m = waveMult(k);
    kills += c.sappers * Math.round(KILL_PTS.sapper * m);
    kills += c.cars * Math.round(KILL_PTS.car * m);
    kills += c.heavies * Math.round(KILL_PTS.heavy * m);
    survival += Math.round(TRUCK_BONUS * TRUCKS * m);
  }
  // RUN_MAX_WAVES - 1 breaks total; ONE of them (wave 14 -> 15) is the FINAL
  // ASSAULT gate (CHOICE_T + CHOICE_CONFIRM_T) instead of a plain WAVE_BREAK,
  // so this derives the exact same seconds the sim actually runs on instead
  // of assuming (RUN_MAX_WAVES - 1) uniform breaks.
  const maxRunSeconds =
    INTRO_T +
    RUN_MAX_WAVES * WAVE_MAX_T +
    (RUN_MAX_WAVES - 2) * WAVE_BREAK +
    (CHOICE_T + CHOICE_CONFIRM_T);
  const maxDrops = Math.floor((maxRunSeconds - FIRST_DROP_T) / DROP_INTERVAL) + 1;
  // Crates pay ZERO. Warpath has no wave timeout on the boss phase, so the run
  // has no hard length bound, and ANY time-based income would make the ceiling
  // unbounded. Crates stay in the game as pure power-ups (the tankbuster
  // supply-cache precedent, games.ts).
  const drops = 0;
  // THE BOSS: three armor plates plus the kill, each priced exactly once,
  // because there is exactly one Siegebreaker in a run.
  const boss = KILL_PTS.boss + BOSS_PLATE_PTS * BOSS_PLATES.length;
  return {
    kills,
    survival,
    drops,
    boss,
    relief: RELIEF_BONUS,
    maxRunSeconds,
    maxDrops,
    total: kills + survival + drops + boss + RELIEF_BONUS,
  };
}
