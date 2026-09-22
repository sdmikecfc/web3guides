/**
 * STRAIN - the S6 Carrion-style virus game, Mike's spec: top-down, you are
 * the rogue code the Resistance released into the Warden's network. Work
 * through FIVE walled quarantine chambers, corrupt the machines, break the
 * tier-locked doors, and eat THE WARDEN.
 *
 * PURE AND HEADLESS (kit §4): no Math.random, no Date. There is no in-run
 * rng at all: every machine walks an authored waypoint loop (chambers.ts),
 * every camera sweeps a pure function of s.t, and the daily seed ONLY selects
 * the authored chamber set.
 *
 * THE 2026-08-15 STEALTH REBUILD. Mike played the walled build and rejected
 * it: "no challenge, no excitement... make it more like a stealth game. Hide
 * from enemies who do patrols, dense building with lots of walls. There are
 * cameras. If the enemies see you for more than 3 seconds before you eat them
 * the alarm goes off and the warden starts perma chasing you for that level."
 * Four things changed here and each one is load-bearing:
 *   1. SIGHT IS A CONE, NOT A RING. The old build aggroed off an
 *      omnidirectional radius that reached straight through steel, so cover
 *      was decorative. Every machine now has a FACING, a vision radius by
 *      tier and a half-angle (chambers.ts authors the tables), and the test
 *      is range -> angle -> line of sight. Break the line and it FORGETS: the
 *      detection meter drains, so a corner is a real answer.
 *   2. THE HYBRID CORRUPT. Reach a machine that has not clocked you and you
 *      corrupt it WHATEVER its tier, the warden included. Let it clock you
 *      first and the old tier rule applies: your size or it hurts you. Stealth
 *      is now the fastest route to the big prey, which is the whole fantasy.
 *   3. CAMERAS. Fixed eyes at the chokepoints, sweeping an authored arc. They
 *      cannot be eaten. They are geometry, and they trip the alarm.
 *   4. THE ALARM. Three seconds inside anything's sight (Mike's number,
 *      exactly) and the chamber goes loud: its hunter perma-chases for that
 *      floor, every other machine sweeps the trip point for four seconds, and
 *      a permanently-aware warden can never be taken quietly again. The floor
 *      stays CLEARABLE - the alarm is a price, not a loss state.
 * The 2026-08-14 rebuild's four pillars still hold underneath: walls the blob
 * and every bot collide with, five chambers, the funded INVERSION (outgrow a
 * hunter and it FLEES faster than prey), and the warden as the win.
 *
 * THE 2026-08-16 ROUND-6 REBUILD - WHY ROUNDS 4 AND 5 DID NOT LAND. Mike,
 * third complaint on the same game: "Strain, still way too easy". Rounds 4
 * and 5 both multiplied constants (cones, speeds, thresholds) and the
 * measurements say the constants were never the problem. Probed with a LAZY
 * player (walk at the nearest machine, touch it, never hide, never retreat)
 * and with the harness oracle, on the shipped round-5 build:
 *   - the player was inside SOME machine's cone 3.8% (max stats) to 17.6%
 *     (zero stats) of all chamber frames. UNSEEN WAS THE DEFAULT STATE OF THE
 *     WORLD, not something earned;
 *   - 60-68% of every corrupt landed on a machine that OUTRANKED the player,
 *     because the eat gate was one boolean (`!clocked`) with no tier term;
 *   - the average victim's detection meter at the moment it died was 0.03s
 *     out of a 0.45s aware threshold, INCLUDING the 22% of victims that had
 *     the blob in their cone within the previous two seconds: the meter
 *     decayed to zero and the machine forgot, every time, forever;
 *   - a lazy max-stat player ran 720 seconds, reached depth 21, ate 288
 *     machines including 4 WARDENS, tripped ZERO alarms, was clocked for
 *     0.0% of the run and took ZERO damage. HP was never spent. The oracle
 *     took zero damage too, at both stat builds. NO RUN HAS EVER ENDED IN
 *     DEATH; every one ends on the harness frame cap.
 * The mechanism, not the tuning, was broken: BEING UNSEEN WAS FREE, PERMANENT
 * AND INSTANTLY LETHAL TO ANYTHING. Five linked systems replace it, and each
 * one costs the player something that round 5 gave away:
 *   1. FEEDING IS A COMMITMENT AND IT IS LOUD. Contact no longer kills;
 *      it LATCHES. The corrupt completes after sustained contact that scales
 *      with the tier gap, the blob is ANCHORED for the whole channel (space
 *      releases it), and the feed makes NOISE in a radius that scales with
 *      the meal: machines that hear it come to LOOK. Unseen is now a resource
 *      you spend, exactly once per meal.
 *   2. TIER MATTERS EVEN UNSEEN. QUIET_GAP caps the quiet corrupt at two
 *      tiers above you. Touch anything bigger and you bounce off it and WAKE
 *      it. The warden cannot be soloed at T1 by walking behind it; the growth
 *      ladder is the only road to the warden's floor.
 *   3. MACHINES REMEMBER. Losing the line no longer resets anything: a
 *      machine that has clocked you walks to your LAST KNOWN POSITION and
 *      sweeps it, and it stays aware (uneatable) the whole time. A corner
 *      buys you seconds now, not amnesia.
 *   4. THE ALARM IS A LOCKDOWN, AND A LOCKDOWN ARMS THE FLOOR. The exit JAMS
 *      (x3 channel, and whatever you had banked on it is wiped), every machine
 *      searches the trip point, the cameras stop sweeping and TRACK your last
 *      known position, every hunter is pinned aware for the rest of the floor,
 *      and - the part that finally gives being seen a price - EVERY AWARE
 *      MACHINE ARMS: it charges instead of backpedalling and it takes a plate
 *      off you on contact WHATEVER ITS TIER. Under the old rule only a machine
 *      that outranked you could do damage, so a grown blob could not be hurt
 *      by 65 of a floor's 66 machines. The lockdown lifts after ALARM_CLEAR_S
 *      calm seconds (or ALARM_MAX_S hard), so it is a storm to survive, not a
 *      dead end; the pinned hunter is the part that never lifts.
 *   5. THE PURGE. Every chamber runs a clock. Past PURGE_GRACE_S the purge
 *      ramps: cones grow (visibly - the sim rewrites visionR, so the drawn
 *      cone IS the live cone), machines speed up, and at FULL purge the Warden
 *      is pinned on you permanently AND the floor arms itself exactly like a
 *      lockdown. Camping a safe corner is now the losing line, and the deep
 *      tail ends runs by killing them (ADR-0120) instead of by a frame cap.
 *
 * THE 2026-08-17 ROUND-7 PASS. Mike, FOURTH complaint on this game: "Strain is
 * still really easy. Need faster detection, there is now this weird freeze
 * thing while it collects smaller people which is weird. Maybe we need cameras
 * and turrets that cannot be destroyed and have to be avoided. Also half walls
 * or boxes you can hide behind and sneak behind to get around enemies or
 * turrets." He named the mechanics, so they are the spec. Four changes:
 *   1. THE FREEZE ON CHEAP MEALS IS GONE. Round 6 latched EVERY meal; round 7
 *      splits the rule at your own tier. At or under it, a corrupt is INSTANT
 *      - no anchor, no channel, no noise, no cooldown - so the hunt through a
 *      floor of small prey flows again. ABOVE your tier the round-6 latch
 *      survives whole, re-derived for a table whose cheapest entry is now a
 *      +1 gap: that is where the commitment was ever the point.
 *   2. FASTER DETECTION, ON BOTH AXES. The thresholds tightened (alarm 3 ->
 *      2.0s, clocked 0.45 -> 0.30s, decay 0.6 -> 0.45, spawn grace 1.1 ->
 *      0.7) AND - the half that round 6's own numbers said mattered more -
 *      COVERAGE went up, because round 6 measured the player inside SOME
 *      machine's cone only 3.8-17.6% of chamber frames. Turrets are eyes that
 *      cannot walk away from their post, and they are what makes the tighter
 *      thresholds bite.
 *   3. TURRETS. Static authored cones on the chokepoints; indestructible and
 *      un-corruptible at every tier; touching one does nothing in either
 *      direction (a turret is a mount, not a body - contact damage on top of a
 *      cone would punish the panic sprint past it that the cone already
 *      prices, and it would be a second rule where one reads better). What
 *      they do is LOCK on a drawn meter and then SHOOT for a real plate on a
 *      cadence. They are the first thing in this game that costs HP without a
 *      body touching the blob.
 *   4. LOW COVER, and this is the piece that makes 3 fair. Crates the blob and
 *      every machine cross freely, opaque to EVERY eye in the game. Simple
 *      occlusion, no press-against verb: being behind it IS the hide. Routing
 *      becomes the puzzle Mike described - read the wedge, find the crate, go.
 * chambers.ts proves per turret that its cone has a crate-shadowed pocket, so
 * an unavoidable hazard is never an unanswerable one.
 *
 * THE 2026-08-17 ROUND-8 PASS (same day; Mike playing the DEPLOYED round 7):
 * "There is a weird line coming to you on strain when you interact with
 * something. Also the turret doesn't seem to work and needs to be dodgeable.
 * The detection time needs to go down as well furthering the need to be
 * stealthy." Three changes, each measured before and after:
 *   1. THE GHOST LASER IS DEAD. The weird line was the turret aim laser
 *      outliving its own sight: lockS had no cap, a feed latch under a wedge
 *      banked seconds of lock, and the Client drew the laser off the decaying
 *      meter alone - measured, 3.1s of red line tracking the blob THROUGH
 *      WALLS after every line of sight was broken. lockS is capped at the
 *      live need and the turret publishes `sees`; no tell outlives sight.
 *   2. TURRET ROUNDS ARE PROJECTILES (stopclock's bullet grammar): spawned at
 *      the muzzle with real travel time, killed by walls AND crates, dodged
 *      by sidestepping. The tell ladder is lock ring -> aim laser -> muzzle
 *      flash -> tracer in flight. Turrets stay indestructible, un-corruptible
 *      and contact-harmless; the shot is the whole threat, and it is honest.
 *   3. DETECTION FASTER AGAIN, third cut on this dial: alarm 2.2 -> 1.6s,
 *      clocked 0.30 -> 0.22s. The cliff was re-swept at the new neighbourhood
 *      (the two plateaus and the 1.6/1.7 branch are recorded at SEEN_ALARM_S);
 *      1.6 ships on the harsh plateau deliberately - fifth "too easy" - and
 *      the AFK gate and the lazy probe still die where they must.
 *
 * THE 2026-08-15 ROUND-5 STEALTH MANDATE (superseded in part by round 6 above;
 * kept because its diagnosis of the loud half was right). Mike played the
 * coned build and rejected it: "It's still too easy... I can run directly at
 * enemies and take them, no skill or stealth involved. Maybe all characters
 * move too quick and the search to warden timer is too long. Make it more
 * stealthy."
 * Three things changed and each is load-bearing:
 *   1. AWARE = UNEATABLE. A machine whose meter has crossed awareS CANNOT be
 *      corrupted at all - contact does nothing while it is aware, whatever
 *      the tiers. The hybrid corrupt's loud half (clocked-but-smaller still
 *      dies) was exactly the run-straight-at-it strategy, so it is gone.
 *      Aware prey DODGES: it backpedals directly away, faster than the old
 *      flee, and it keeps FACING the blob while it does - so chasing it
 *      head-on keeps it aware forever. Breaking its line of sight (or its
 *      cone, for machines that are not tracking you) is the only way to make
 *      it forget, and eating happens from behind or after the decay. The
 *      tier chase survives as the LOUD fallback: run something down until it
 *      stops seeing you, then take it. The warden included: it dies only to
 *      an approach it never saw.
 *   2. EVERYTHING MORE DELIBERATE. Bot patrol/chase x0.75, blob x0.88, and
 *      detection tighter: alarm at 1.8s of sight (was Mike's original 3 -
 *      superseded by this round's "the search to warden timer is too long"),
 *      clocked at 0.45s (was 0.7). Decay unchanged: corners still forgive.
 *   3. THE WARDEN IS EVERY FLOOR'S HUNTER, fictionally: presentation renders
 *      each chamber's apex as an avatar of the one Warden (Client.tsx), and
 *      the alarm line says THE WARDEN on every floor. Sim semantics of the
 *      `warden` flag (win on eat, chamber 5 only) are untouched.
 *
 * SCORES NEVER CAP (ADR-0120). Past the warden the authored set CYCLES and
 * the escalation is real: hunter speed scales per chamber AND per lap
 * (deepMul), and every deep-lap hunter outranks the player's tier ceiling, so
 * the purge is un-eatable and eventually inescapable. Score measures how deep
 * you got. VALIDITY is rate-bound via rate(); the registry maxScore is only a
 * far-off sanity clamp. Equal rosters per lap keep every daily fair.
 *
 * STATS ARE CEILING-NEUTRAL (ADR-0070), re-pointed at the round-6 verbs:
 * Plating = hits survivable, Reactor = move speed, Cloak = enemy cones shrink
 * AND your feed is quieter, Payload = door-break AND feed channel speed,
 * Sensors = longer before a machine has clocked you. None touches a roster
 * count, a point value, or the clock.
 * TWO OF THEM WERE DELETING THE GAME and round 6 cut them back on evidence,
 * not taste: measured on the shipped build, Cloak 4 (-28% cone radius) plus
 * Sensors 4 (awareS 0.45 -> 0.93s) made the crossing time of a T1..T5 cone
 * SHORTER than the aware threshold, so a max-stat player could sprint
 * head-on at anything up to T5 and arrive unclocked - which is Mike's "I can
 * run directly at enemies and take them", in arithmetic. Cloak is 5%/pt and
 * Sensors 0.07s/pt now, and the feed channel means arriving unseen is no
 * longer the whole job anyway.
 */

import {
  BLOB_R_BY_TIER,
  BOT_R_BY_TIER,
  botR,
  CHAMBER_SETS,
  CHAMBERS_PER_LAP,
  chamberSetForSeed,
  EAT_PTS,
  HUNTER_VISION_HALF_DEG,
  HUNTER_VISION_R,
  MAX_TIER,
  SPAWN,
  TIER_THRESHOLDS,
  VISION_HALF_DEG,
  visionR,
  WARDEN_VISION_HALF_DEG,
  WARDEN_VISION_R,
  WARDEN_PTS,
  type ChamberSet,
} from "./chambers";

// re-exported so the Client keeps one import surface (it draws from these)
export { BLOB_R_BY_TIER, BOT_R_BY_TIER, botR, MAX_TIER, CHAMBERS_PER_LAP, WARDEN_PTS };

export interface SimInput {
  px: number | null;
  py: number | null;
  down: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  downKey: boolean;
  space: boolean;
}

export interface Stats {
  botox: number;
  drugs: number;
  ozempic: number;
  aura: number;
  optics: number;
}

export function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── scoring constants ───────────────────────────────────────────────────────
export const DOOR_PTS = 120;
/** Paid ONCE, at the fifth door: the quarantine is broken and the DEEP
 * NETWORK opens (ADR-0120: endless). */
export const ESCAPE_PTS = 300;
/** Anti-hang backstop only (the FRAME_CAP analog): the hunter escalation
 * ends every real run long before this. Never a score-shaving clock. */
export const MISSION_T = 3600;
/** ESCALATION THAT IS ACTUALLY REAL: +5% per chamber within a lap and +22%
 * per lap, uncapped. Chase speed rides it, so the purge eventually outruns
 * every build. */
const DEEP_CHAMBER_STEP = 0.05;
const DEEP_LAP_STEP = 0.22;

// ── movement / fight constants ──────────────────────────────────────────────
/** ROUND 5 SLOWED THE WHOLE FLOOR ("all characters move too quick"): blob
 * x0.88 (95 -> 83.6), bot patrol/chase x0.75 below. The two flee speeds are
 * NOT patrol or chase - they are the payoff chases - so they hold. */
const BASE_SPEED = 83.6; // 95 * 0.88
/** Bigger is a little slower, but gently: the ladder is 7 tiers deep now. */
const TIER_SLOW = 0.03;
/** AWARE PREY DODGES (round 5): a machine that has clocked you backpedals
 * directly away, faster than the old 52 flee, FACING you the whole time -
 * uneatable until you break its line and come back unseen. */
const PREY_DODGE_SPEED = 74;
/** AN OUTGROWN HUNTER RUNS. Faster than prey on purpose: the inversion's
 * payoff is a chase you have to win, not a free meal standing still. */
const HUNTER_FLEE_SPEED = 66;
const WANDER_SPEED = 30; // 40 * 0.75
const HUNTER_SPEED = 48; // 64 * 0.75
/** A prey machine that has clocked you and OUTRANKS you comes at you. Slower
 * than the blob at rest, so it is outrunnable - it is pressure, not a death
 * sentence, and it is Mike's "the bigger ones become a threat". */
const PREY_CHASE_SPEED = 45; // 60 * 0.75
const PREY_FLEE_R = 150;
/** Round 6 widened this 60 -> 75: an armed floor sends every aware machine at
 * you at once, and a one-second window let a swarm take three plates in three
 * seconds with no room to run. */
const TOUCH_IFRAMES_F = 75;
const DOOR_R = 34;
const DOOR_CHANNEL_T = 2.5; // s (Payload shortens)
const PLAYER_HP_BASE = 3;
const TRANSITION_F = 60;
/** The payoff beat after the warden goes down, in frames. */
const WIN_BEAT_F = 96;

// ── perception constants ────────────────────────────────────────────────────
/** Continuous seconds in something's sight before the chamber goes loud.
 * BACK TO MIKE'S ORIGINAL 3 (round 6). Round 5 cut it to 1.8 for pacing, when
 * a lockdown was only a hunter that followed you around; round 6 made the
 * lockdown ARM THE WHOLE FLOOR, and a 1.8s window onto a consequence that
 * heavy is a tax on existing rather than a punished mistake - measured, a
 * zero-stat oracle tripped it at T1 and was dead 3 seconds later, 17s into
 * the run. Hard to trip, brutal when tripped, is the curve. */
/** ROUND 7 TIGHTENED IT AGAIN, 3 -> 2.2, on Mike's "need faster detection".
 * Round 6 restored Mike's original 3 because a lockdown had just become a
 * whole-floor arming and 1.8s was a tax on existing. What changed since is
 * COUNTERPLAY: low cover now breaks any eye's line from anywhere on the floor,
 * so two seconds of being stared at is a mistake with an answer, not a coin
 * flip. Round 6's own measurement is the reason the threshold alone was never
 * going to be enough - the player was inside SOME cone 3.8-17.6% of frames -
 * which is why turrets landed in the same pass.
 * 2.2 WAS A MEASURED CHOICE and its cliff note is kept below for the method.
 * ROUND 8 (2026-08-17, Mike's fifth pass: "The detection time needs to go
 * down as well furthering the need to be stealthy") CUT IT AGAIN, 2.2 -> 1.6,
 * a 27% cut on top of round 7's 27%. THE CLIFF WAS RE-SWEPT at the new
 * neighbourhood, because round 7 proved this dial moves in branch points, not
 * slopes. Measured, max-stat oracle, 1.4 through 1.8:
 *   1.4: dies 17.3s, depth 1   1.5: dies 20.1s, depth 1   1.6: dies 21.6s, depth 1
 *   1.7: dies 117.2s, depth 3  1.8: dies 124.4s, depth 3
 * TWO plateaus, one branch between 1.6 and 1.7. The high plateau (1.7-1.8) is
 * the round-7 run shape (110-125s, depth 3) with a 23% faster alarm; the low
 * plateau (1.4-1.6) is a chamber-1 game for the oracle - one tripped alarm at
 * T1 and the armed floor ends it. 1.6 SHIPS, ON THE HARSH PLATEAU, EYES OPEN:
 * this is Mike's FIFTH "too easy" on this game, he has out-played every
 * oracle-calibrated tuning so far (the oracle died at 110s on the build he
 * just called easy), and the envelope is an upper bound, not a target. If the
 * harsh side overshoots for humans, 1.7 is the measured fallback - one edit,
 * plateau already mapped. (Round-7 record, for the method: 2.1/2.2/2.3
 * agreed at 110-125s depth 3; 2.4 slipped one trip and ran 440s to depth 13.) */
export const SEEN_ALARM_S = 1.6;
/** Above this the machine has CLOCKED you: it reacts, and corruption is off
 * the table entirely until the meter decays back under (round 5: aware =
 * uneatable). Sensors raises it. Was 0.7 pre-round-5, 0.45 in round 6, 0.30
 * in round 7. ROUND 8: 0.22. THIS is the number Mike feels as "detection
 * speed" - it is how long you can stand in a cone before the machine reacts
 * at all - and at under a quarter second a patrol you could walk past is now
 * a patrol you route around, which is his "furthering the need to be
 * stealthy" verbatim. Sensors still adds 0.05/pt on top (maxed: 0.42s, which
 * is UNDER round 7's zero-stat base plus its own max, so no build got laxer
 * detection out of this cut than it had before it). */
export const SEEN_AWARE_S = 0.22;
/** The meter drains this fast once you break the cone or the line of sight,
 * which is what makes a corner a real answer instead of a delay.
 * ROUND 7 SLOWED IT 0.6 -> 0.45: with crates everywhere, breaking a line is
 * cheap now, so forgetting has to cost something or cover would erase the
 * tighter thresholds above the moment they landed. */
export const SEEN_DECAY = 0.45;
/** HOLD STILL: detection fills at this rate while you are pressed flat. */
export const HIDE_SEEN_MUL = 0.35;
/** SPAWN GRACE. Every eye on a floor starts its meter this far BELOW zero, so
 * a player who lands in an unlucky cone gets a beat to read the room instead
 * of being clocked on frame 1. It is real slack, not a shield: it is spent the
 * instant something looks at you, and it never comes back (the decay branch
 * floors at 0), so the alarm math from second two onward is untouched. */
export const SPAWN_GRACE_S = 0.7;
/** Chase speed gains this much per tier the chaser outranks you by. */
const CHASE_TIER_STEP = 0.06;

// ── THE FEED CHANNEL (round 6), SPLIT IN TWO BY ROUND 7 ─────────────────────
/**
 * MIKE, FOURTH COMPLAINT: "there is now this weird freeze thing while it
 * collects smaller people which is weird". He is describing round 6's latch
 * landing on trash. Round 6 anchored the blob for EVERY meal, chaff included,
 * and at 0.35s a piece that is a stutter every few strides: the hunt through a
 * floor of small prey stopped flowing, which is the one thing this game has
 * always had going for it.
 *
 * ROUND 7 SPLITS THE RULE AT YOUR OWN TIER:
 *   at or BELOW your tier  -> INSTANT. No anchor, no channel, no noise, no
 *                             cooldown, exactly as it was before round 6. You
 *                             flow through chaff.
 *   ABOVE your tier        -> the round-6 latch, unchanged in spirit and
 *                             re-derived below, because THAT is where the
 *                             commitment was ever the point.
 * The tension round 6 bought did not live in the 0.35s on a T1; it lived in
 * standing still for two seconds on something bigger than you while the noise
 * went out. That half is kept whole, and the constants are re-derived for a
 * table whose smallest entry is now a ONE-tier gap rather than a zero-tier one.
 */
/** The fixed grip on any OVER-tier meal. Round 6's 0.35 priced a zero-gap
 * meal that no longer exists, so the base moves up to 0.5: the cheapest
 * channel in the game is now a +1 meal at 1.45s, and a channel you can start
 * and finish without thinking is not a commitment. */
export const FEED_BASE_S = 0.5;
/** ...plus this per tier the meal outranks you by (0.85 -> 0.95 for the same
 * reason). A +2 meal is a 2.4s commitment with the blob anchored and loud,
 * and a +2 HUNTER is 3.7s: big prey is SUSTAINED CONTACT, not a touch. */
export const FEED_GAP_S = 0.95;
/** Hunters and the Warden are a bigger job than their tier alone says. */
const FEED_HUNTER_MUL = 1.55;
/** THE QUIET CORRUPT HAS A CEILING (round 6). Unseen no longer beats every
 * tier: reach something more than this many tiers above you and you bounce
 * off it and WAKE it. The warden is T7, so the warden needs T5 - which is a
 * near-full clear of four chambers, exactly like the loud ladder always
 * claimed. Deep-lap hunters (MAX_TIER + lap) pass out of reach entirely from
 * lap 3, which is what turns the endless tail into a purge. */
export const QUIET_GAP = 2;
/** FEEDING IS LOUD. Earshot in design px: this much, plus per tier of meal. */
const NOISE_R_BASE = 86;
const NOISE_R_PER_TIER = 14;
/** Seconds inside earshot of a live feed before a machine comes to look. */
const HEAR_S = 0.5;
/** Frames before the blob can grip again after letting go of a meal.
 * ROUND 7 RAISED IT 30 -> 40 AND NARROWED WHAT IT TOUCHES. It exists so that
 * "let go and run" is not a half-speed stutter (a blob that releases while
 * still overlapping re-latches on the very next step), and now that only
 * OVER-tier meals latch at all it can no longer stall a chaff run: an instant
 * swallow neither sets it nor reads it, so the floor of small prey stays
 * continuous no matter what you just spat out. */
const FEED_REGRIP_F = 40;

// ── ROUND 7: THE TURRETS ────────────────────────────────────────────────────
/** THE TELL, IN SECONDS. A turret that has the blob in its wedge spends this
 * long acquiring before the first round lands, and the Client draws the meter
 * AND the aiming line for every frame of it: the standing law is that nothing
 * which damages the player may be invisible or art-only. Sensors buys the same
 * extra seconds here that it buys against a machine's eyes (additively, not as
 * a ratio - a multiplier on a base this small would make max Sensors immune to
 * a hazard that is supposed to be unavoidable). */
export const TURRET_LOCK_S = 0.85;
/** ...and once it is locked it keeps firing at this cadence. Deliberately a
 * hair LONGER than TOUCH_IFRAMES_F, so a round that lands is never eaten by
 * the invulnerability window of the round before it (flight is under 0.6s,
 * so at most one round per turret is ever in the air). Standing in a cone
 * costs a plate every ~1.5s; sidestepping is the new out (round 8, below). */
const TURRET_SHOT_CD_S = 1.4;
/** The acquisition meter drains this fast once the line breaks - faster than
 * it fills, so ducking behind a crate genuinely resets the shot. */
const TURRET_LOCK_DECAY = 1.2;
/** Frames of muzzle flash the Client draws after a round goes off. */
const TURRET_FLASH_F = 10;
// ── ROUND 8 (2026-08-17, Mike playing the deployed round 7): "the turret
// doesn't seem to work and needs to be dodgeable". Two findings, one fix:
//   1. THE GHOST LASER. lockS had no ceiling (it filled the whole time the
//      blob was stared at, so a long feed under a wedge banked SECONDS of
//      lock), and the Client drew the aim laser off the meter alone - so
//      after breaking every line of sight the red laser kept tracking the
//      blob THROUGH WALLS for 3+ measured seconds, from a gun that could not
//      fire. That is Mike's "weird line coming to you when you interact with
//      something": the latch anchored him in a wedge, the meter inflated, and
//      the laser followed him around the floor afterwards. Fixed on both
//      ends: lockS is CAPPED at the live need, and the turret publishes
//      `sees` so no tell can outlive the sight that justifies it.
//   2. THE SHOT IS A PROJECTILE NOW, stopclock's grammar: a fired round is a
//      real body with travel time, spawned at the muzzle aimed at where the
//      blob IS, and the blob SIDESTEPS it. The tell ladder is lock ring ->
//      aim laser -> muzzle flash -> tracer in flight, and every rung is
//      drawn in both render paths. The round dies on walls AND on crates
//      (blocksSight, the one union), so ducking behind low cover beats a
//      round already in the air - which is exactly the counterplay the
//      crates were authored to sell.
/** Round speed, design px/s. THE DODGE ARITHMETIC, so the number is a
 * contract: the blob walks 83.6 (T1) to 68.6 (T7). A round fired from 65 px
 * out flies 0.33s, in which a T1 covers ~27 px against the ~14 it needs to
 * clear (its radius plus the round's) - a read-and-react dodge. From inside
 * ~30 px the flight is shorter than any reaction, so point-blank still lands,
 * deliberately: the wedge prices proximity, the sidestep answers range. */
export const TURRET_SHOT_SPEED = 200;
/** Round radius, design px. */
const TURRET_SHOT_R = 3.5;
/** Muzzle offset along the facing, design px - mirrors the drawn barrel, so
 * the tracer leaves exactly where the flash happens. */
const TURRET_MUZZLE = 13;

// ── ROUND 6: MEMORY, LOCKDOWN, PURGE ────────────────────────────────────────
/** A machine that loses you SEARCHES for this long: it walks your last known
 * position and sweeps it, and it stays aware (uneatable) throughout. This is
 * the number that killed "hide behind a wall for 1.5s and it forgets". */
export const SEARCH_S = 5;
const SEARCH_F = Math.round(SEARCH_S * 60);
/** Search walk speed and the radius of the sweep around your last position. */
const SEARCH_SPEED = 40;
const SEARCH_R = 44;
/** Radians the sweep advances per frame of the countdown (pure, deterministic). */
const SEARCH_SWEEP = 0.05;
/** Calm seconds (nothing clocked, no meter above a hair) that lift a lockdown. */
export const ALARM_CLEAR_S = 6;
/** ...and a hard ceiling on one, so a lockdown can never become a dead end.
 * Measured: tracking cameras on a purged floor keep the calm timer at zero
 * forever, and a zero-stat oracle sat behind a slab for 300 seconds because
 * the door was still tier-locked and the alarm could not be cleared by any
 * legal play. The pinned hunter is the permanent price; the lockdown is not. */
const ALARM_MAX_S = 30;
/** THE LOCKDOWN DOES NOT SEAL THE EXIT, IT JAMS IT. Measured: a hard seal
 * plus tracking cameras plus a purged floor is a dead end, not a difficulty -
 * the oracle sat in a corner for 700 seconds because no legal move existed.
 * x3 on the channel is the price instead: leaving a loud floor means seven
 * seconds parked on the hatch with the room hunting you, which is a decision.
 * The trip still wipes whatever progress you had banked. */
const ALARM_DOOR_MUL = 3;
/** THE PURGE. Free seconds in a chamber before the facility starts closing
 * in, then the ramp to full purge. */
export const PURGE_GRACE_S = 26;
export const PURGE_RAMP_S = 40;
/** At full purge every cone is this much longer and every machine this much
 * faster; the effects keep growing to 2x purge and then hold, because the
 * chamber is meant to become unlivable, not literally infinite. */
const PURGE_VISION = 0.85;
const PURGE_SPEED = 0.45;

export interface Bot {
  tier: number;
  x: number;
  y: number;
  wps: { x: number; y: number }[];
  wi: number;
  eaten: boolean;
  hunter: boolean;
  warden: boolean;
  /** unit facing; sight is a cone around it (derived every step, never authored) */
  fx: number;
  fy: number;
  /** sim px, LIVE: the purge rewrites it every step off visionR0, so the cone
   * the Client draws is always the cone the sim tests. */
  visionR: number;
  /** the authored/statted base the purge scales */
  visionR0: number;
  /** cos of the cone half-angle */
  visionCos: number;
  /** continuous seconds this machine has had eyes on the blob */
  seenS: number;
  /** ROUND 6 MEMORY: frames of search left, and where it last had you. */
  searchF: number;
  lastX: number;
  lastY: number;
  /** seconds of a live feed heard from inside earshot */
  hearS: number;
  /** the alarm (or a full purge) pinned this hunter for the rest of the floor */
  pinned: boolean;
}

export interface Cam {
  x: number;
  y: number;
  a0: number;
  a1: number;
  period: number;
  /** live radius (the purge scales it off r0) */
  r: number;
  r0: number;
  visionCos: number;
  /** live facing: the sweep is a pure function of s.t, and under a lockdown
   * it stops sweeping and TRACKS your last known position instead. */
  fx: number;
  fy: number;
  seenS: number;
}

/**
 * A TURRET (round 7). Mike named it, so it is the spec: indestructible, and
 * it must be AVOIDED. It cannot be corrupted at any tier, it cannot be
 * destroyed, and touching it does nothing at all in either direction.
 * Its cone does NOT sweep - a static wedge is a thing the player can read and
 * plan around, which is what makes the low-cover counterplay a puzzle instead
 * of a stopwatch - and inside that wedge it LOCKS and then SHOOTS.
 */
export interface Turret {
  x: number;
  y: number;
  /** live facing; static (fx0,fy0) except under a lockdown, when it tracks */
  fx: number;
  fy: number;
  fx0: number;
  fy0: number;
  /** live radius (the purge scales it off r0), sim px */
  r: number;
  r0: number;
  visionCos: number;
  /** the alarm meter, exactly a camera's grammar: turrets are eyes too */
  seenS: number;
  /** THE ACQUISITION METER. It fills while the turret has the blob and drains
   * fast when it loses it. The Client draws it, and the sim never fires
   * without it having filled first: the tell can never be skipped.
   * ROUND 8: CAPPED at the live lock need. Uncapped it banked seconds of
   * lock during a long stare (a feed under a wedge), and the drained-off tail
   * kept the aim laser alive for 3+ seconds after every line was broken. */
  lockS: number;
  /** seconds until it can fire again once locked */
  cd: number;
  /** frames of muzzle flash left, presentation only (0 = not firing) */
  flash: number;
  /** ROUND 8: does this turret have the blob RIGHT NOW (range, angle, line)?
   * Published so the Client's aim laser can never outlive the sight that
   * justifies it - the ghost-laser bug was the Client inferring sight from
   * the decaying meter. Presentation reads it; the sim writes it every step. */
  sees: boolean;
}

/** A ROUND IN FLIGHT (round 8). The one thing in the game that crosses the
 * floor to hurt you, so it is a real simulated body with travel time - the
 * blob sidesteps it, low cover and walls stop it - never an instant hit. */
export interface TurretShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StrainState {
  W: number;
  H: number;
  k: number;
  demo: boolean;
  t: number;
  phase: "chamber" | "transition" | "won" | "dead" | "timeout";
  setIdx: number;
  chamber: number; // 0-based, cycles the authored 5 forever
  transF: number;
  wonF: number;
  // player
  px: number;
  py: number;
  tier: number;
  growth: number; // cumulative units
  hp: number;
  hpMax: number;
  iframes: number;
  speedMul: number;
  /** Cloak: every enemy cone is scaled by this */
  visionMul: number;
  /** Sensors: seconds of sight before a machine has CLOCKED you */
  awareS: number;
  /** Cloak: the feed's earshot is scaled by this */
  noiseMul: number;
  /** Payload: the feed channel is scaled by this (and the door channel) */
  feedMul: number;
  /** HOLD STILL is engaged this frame (presentation reads it) */
  hiding: boolean;
  doorChannelT: number;
  doorProgress: number; // 0..1
  // ── THE FEED (round 6): the blob is latched to bots[feedIdx] and anchored
  /** index into bots, or -1 */
  feedIdx: number;
  feedT: number;
  feedNeed: number;
  /** earshot of the live feed in sim px (0 when not feeding); the Client
   * draws this ring, so the noise is never an invisible rule */
  feedNoiseR: number;
  /** frames before the blob can grip again after letting go. Without it a
   * player who releases while still overlapping re-latches on the very next
   * step, which turns "let go and run" into a half-speed stutter. */
  feedCd: number;
  // world
  walls: Wall[];
  /** LOW COVER: crossed freely by every body, OPAQUE to every eye. Movement
   * never reads this array; sight always does. */
  lows: Wall[];
  bots: Bot[];
  cams: Cam[];
  turrets: Turret[];
  /** ROUND 8: every turret round currently in flight (cleared per chamber) */
  shots: TurretShot[];
  doorX: number;
  doorY: number;
  doorTier: number;
  doorBlown: boolean; // the warden's death forces this chamber's door open
  /** THE LOCKDOWN (round 6): chamber-scoped, seals the exit, and CLEARS after
   * ALARM_CLEAR_S calm seconds. Hunters it pinned stay pinned for the floor. */
  alarm: boolean;
  alarmX: number;
  alarmY: number;
  alarmCalmT: number;
  /** seconds this lockdown has been live (hard-expires at ALARM_MAX_S) */
  alarmT: number;
  alarmsTripped: number;
  /** seconds spent in this chamber, and the purge it drives (0 = quiet) */
  chamberT: number;
  purge: number;
  // tally
  eatPts: number;
  doorPts: number;
  bonusPts: number;
  eatenCount: number;
  quietEats: number;
  huntersEaten: number;
  wardensEaten: number;
  /** bounced off something more than QUIET_GAP tiers up (and woke it) */
  startles: number;
  /** feeds broken by a hit landing mid-channel */
  feedsBroken: number;
  /** rounds a turret has put into the blob this run (the round-7 pressure
   * readout: a run that never got shot never crossed a cone badly) */
  turretHits: number;
  rng: () => number;
}

/** THE VALIDITY ENVELOPE (ADR-0120): the maximum sustainable scoring rate.
 * THE STEALTH REBUILD MOVED IT. The old 85/s priced a chase loop that ate
 * roughly its own tier: one meal per ~1.2s at ~120 points. The quiet corrupt
 * pays much better per second, because a machine that has not clocked you
 * dies whatever its tier - a T5 walked up on is 190 points for the same
 * approach that used to buy a T2 - and unaware prey does not run, so the
 * approach itself is shorter. Measured against the stealth oracle a full
 * clear now runs ~110/s, and 145/s bounds it with the same margin the old
 * number carried. Burst still covers the one genuinely lumpy moment: the
 * WARDEN's head (1200) landing beside the fifth door (120) and the escape
 * bonus (300), which is why it stays at 1800.
 * ROUND 5 SLOWED THE HONEST PACE (aware = uneatable, blob x0.88, bots x0.75)
 * so the measured oracle now runs well UNDER this envelope. That is fine by
 * design - the envelope is an upper bound, not a target - and 145/s stays:
 * shrinking it to hug the new pace would turn a validity bound into a skill
 * cap the moment someone plays better than the oracle.
 * ROUND 6 SLOWED IT FURTHER AND THE NUMBER STILL DOES NOT MOVE. Every meal is
 * now a channel (0.35s of chaff, ~2s two tiers up) with the blob anchored, so
 * the measured max-stat oracle runs ~37/s over a 686-second run - a quarter of
 * the bound. 145/s stays for the same reason it stayed in round 5: it is the
 * ceiling a submission has to clear to be called forged, and hugging the
 * oracle's pace would make it a skill cap instead. The registry mirrors it
 * (gate e), so moving it is a two-file decision, not a tuning knob. */
export function rate(): { perSec: number; burst: number } {
  return { perSec: 145, burst: 1800 };
}

/** Speed escalation for the chamber we are standing in. */
function deepMul(s: StrainState): number {
  const lap = Math.floor(s.chamber / CHAMBERS_PER_LAP);
  const idx = s.chamber % CHAMBERS_PER_LAP;
  return 1 + DEEP_CHAMBER_STEP * idx + DEEP_LAP_STEP * lap;
}

const DEG = Math.PI / 180;

function loadChamber(s: StrainState, set: ChamberSet, chamber: number): void {
  // past the warden the authored set CYCLES (the seed-selects law holds:
  // depth changes the pressure, never the layout authorship)
  const def = set[chamber % CHAMBERS_PER_LAP];
  const lap = Math.floor(chamber / CHAMBERS_PER_LAP);
  s.chamber = chamber;
  s.px = SPAWN[0] * s.k;
  s.py = SPAWN[1] * s.k;
  s.walls = def.walls.map(([x, y, w, h]) => ({ x: x * s.k, y: y * s.k, w: w * s.k, h: h * s.k }));
  // LOW COVER: same shape as a wall, deliberately kept in its OWN array so
  // that every collision path (slide, walkLoop, routeAround) physically
  // cannot see it and every sight path has to opt in.
  s.lows = def.low.map(([x, y, w, h]) => ({ x: x * s.k, y: y * s.k, w: w * s.k, h: h * s.k }));
  s.doorX = def.door[0] * s.k;
  s.doorY = def.door[1] * s.k;
  s.doorTier = def.doorTier;
  s.doorBlown = false;
  s.doorProgress = 0;
  // THE ALARM IS CHAMBER-SCOPED. You take the consequence for the floor you
  // tripped it on and the next floor is quiet again.
  s.alarm = false;
  s.alarmX = 0;
  s.alarmY = 0;
  s.alarmCalmT = 0;
  s.alarmT = 0;
  // THE PURGE CLOCK RESTARTS ON EVERY FLOOR: moving on is the answer to it.
  s.chamberT = 0;
  s.purge = 0;
  s.feedIdx = -1;
  s.feedT = 0;
  s.feedNeed = 0;
  s.feedNoiseR = 0;
  s.feedCd = 0;
  s.cams = def.cams.map((c) => ({
    x: c.x * s.k,
    y: c.y * s.k,
    a0: c.a0 * DEG,
    a1: c.a1 * DEG,
    period: c.period,
    r: c.r * s.visionMul * s.k,
    r0: c.r * s.visionMul * s.k,
    visionCos: Math.cos(c.half * DEG),
    fx: 1,
    fy: 0,
    seenS: -SPAWN_GRACE_S,
  }));
  // THE GUNS. Static wedges, authored on the chokepoints the walls create;
  // chambers.ts proves each one is crossable under authored low cover.
  s.turrets = def.turrets.map((t) => {
    const fx = Math.cos(t.a * DEG);
    const fy = Math.sin(t.a * DEG);
    return {
      x: t.x * s.k,
      y: t.y * s.k,
      fx,
      fy,
      fx0: fx,
      fy0: fy,
      r: t.r * s.visionMul * s.k,
      r0: t.r * s.visionMul * s.k,
      visionCos: Math.cos(t.half * DEG),
      seenS: -SPAWN_GRACE_S,
      lockS: 0,
      cd: 0,
      flash: 0,
      sees: false,
    };
  });
  // no round survives a chamber change: the gun that fired it is gone
  s.shots = [];
  const hunterTier = lap === 0 ? def.hunter.tier : MAX_TIER + lap;
  const mk = (
    tier: number,
    x: number,
    y: number,
    wps: [number, number][],
    hunter: boolean,
    warden: boolean,
  ): Bot => {
    const vr = warden ? WARDEN_VISION_R : hunter ? HUNTER_VISION_R : visionR(tier);
    const vh = warden ? WARDEN_VISION_HALF_DEG : hunter ? HUNTER_VISION_HALF_DEG : VISION_HALF_DEG;
    const w0 = wps[hunter ? 1 % wps.length : 0];
    const dx = w0[0] * s.k - x * s.k;
    const dy = w0[1] * s.k - y * s.k;
    const dl = Math.hypot(dx, dy) || 1;
    return {
      tier,
      x: x * s.k,
      y: y * s.k,
      wps: wps.map(([wx, wy]) => ({ x: wx * s.k, y: wy * s.k })),
      wi: hunter ? 1 % wps.length : 0,
      eaten: false,
      hunter,
      warden,
      fx: dx / dl,
      fy: dy / dl,
      visionR: vr * s.visionMul * s.k,
      visionR0: vr * s.visionMul * s.k,
      visionCos: Math.cos(vh * DEG),
      seenS: -SPAWN_GRACE_S,
      searchF: 0,
      lastX: x * s.k,
      lastY: y * s.k,
      hearS: 0,
      pinned: false,
    };
  };
  s.bots = [
    ...def.bots.map((b) => mk(b.tier, b.x, b.y, b.wps, false, false)),
    // PAST THE FIRST LAP the hunters are reinforcements the blob can never
    // outgrow (MAX_TIER + lap), which is what turns the endless tail into a
    // real purge instead of a farm: the warden was the win, once.
    mk(hunterTier, def.hunter.wps[0][0], def.hunter.wps[0][1], def.hunter.wps, true, !!def.hunter.warden),
  ];
}

export function createStrain(
  w: number,
  h: number,
  seed: string,
  demo: boolean,
  stats: Stats | null,
): StrainState {
  const st: Stats = stats || { botox: 0, drugs: 0, ozempic: 0, aura: 0, optics: 0 };
  const hash = fnv1a(seed || "strain");
  const hpMax = PLAYER_HP_BASE + Math.max(0, Math.min(4, st.botox));
  const s: StrainState = {
    W: w,
    H: h,
    k: w / 360,
    demo,
    t: 0,
    phase: "chamber",
    setIdx: ((hash % CHAMBER_SETS.length) + CHAMBER_SETS.length) % CHAMBER_SETS.length,
    chamber: 0,
    transF: 0,
    wonF: 0,
    px: 0,
    py: 0,
    tier: 1,
    growth: 0,
    hp: hpMax,
    hpMax,
    iframes: 0,
    speedMul: 1 + 0.08 * Math.max(0, Math.min(4, st.drugs)),
    // CLOAK shrinks what the network can see. ROUND 6 CUT IT 7%/pt -> 5%/pt
    // on measured evidence: at -28% the cone crossing time fell under the
    // aware threshold for everything up to T5, which deleted the perception
    // game outright (0.0% clocked across a 720s probe). The purge re-widens
    // cones over time, so Cloak buys TIME now, never immunity.
    visionMul: 1 - 0.05 * Math.max(0, Math.min(4, st.ozempic)),
    // ...and it muffles the feed: a quieter monster is the same fantasy,
    // pointed at the round-6 verb that actually costs you something.
    noiseMul: 1 - 0.06 * Math.max(0, Math.min(4, st.ozempic)),
    // SENSORS buys the seconds before a machine has clocked you (the quiet
    // corrupt stays open longer), the old grace period's honest heir. ROUND 6
    // CUT IT 0.12 -> 0.07/pt on measured evidence; ROUND 7 CUT IT AGAIN to
    // 0.05/pt because the BASE moved down to 0.30 and 0.07/pt would have
    // handed a maxed build 0.58s - nearly double the base - which is how a
    // stat stops being an edge and starts being the deletion of a system.
    // At 0.05 the maxed window is 0.50s, +67% of base, and it reads on the
    // new hazard too: turretLockNeedFor() adds the same seconds to every
    // turret's acquisition, so Sensors buys reaction time under a gun.
    awareS: SEEN_AWARE_S + 0.05 * Math.max(0, Math.min(4, st.optics)),
    // PAYLOAD breaks things down faster: the door channel it always drove,
    // and now the feed channel, which is the round-6 verb with real risk on it.
    feedMul: 1 - 0.01 * Math.max(0, Math.min(30, st.aura)),
    hiding: false,
    doorChannelT: DOOR_CHANNEL_T * (1 - 0.02 * Math.max(0, Math.min(30, st.aura))),
    doorProgress: 0,
    feedIdx: -1,
    feedT: 0,
    feedNeed: 0,
    feedNoiseR: 0,
    feedCd: 0,
    walls: [],
    lows: [],
    bots: [],
    cams: [],
    turrets: [],
    shots: [],
    doorX: 0,
    doorY: 0,
    doorTier: 2,
    doorBlown: false,
    alarm: false,
    alarmX: 0,
    alarmY: 0,
    alarmCalmT: 0,
    alarmT: 0,
    alarmsTripped: 0,
    chamberT: 0,
    purge: 0,
    eatPts: 0,
    doorPts: 0,
    bonusPts: 0,
    eatenCount: 0,
    quietEats: 0,
    huntersEaten: 0,
    wardensEaten: 0,
    startles: 0,
    feedsBroken: 0,
    turretHits: 0,
    rng: mulberry32(hash),
  };
  loadChamber(s, chamberSetForSeed(hash), 0);
  return s;
}

function playerR(s: StrainState): number {
  return BLOB_R_BY_TIER[Math.min(MAX_TIER, s.tier)] * s.k;
}

// ── walls: the same collision grammar the sibling game ships ────────────────

/** AABB test with a radius pad (stopclock/sim.ts inBarrier, verbatim shape). */
function inWall(s: StrainState, x: number, y: number, pad: number): boolean {
  for (const w of s.walls) {
    if (x > w.x - pad && x < w.x + w.w + pad && y > w.y - pad && y < w.y + w.h + pad) return true;
  }
  return false;
}

/**
 * Axis-slide: try both axes, then each alone, so a body brushing a slab
 * slides along it instead of sticking. The one addition over the sibling's
 * version is the OVERLAP ESCAPE: the blob GROWS mid-chamber, so its pad can
 * swallow a wall it was legally standing beside. A body already overlapping
 * moves freely for that step and walks itself out, instead of locking solid.
 */
function slide(s: StrainState, x: number, y: number, nx: number, ny: number, pad: number): { x: number; y: number } {
  if (inWall(s, x, y, pad)) return { x: nx, y: ny };
  let ox = nx;
  let oy = ny;
  if (inWall(s, ox, y, pad)) ox = x;
  if (inWall(s, x, oy, pad)) oy = y;
  if (inWall(s, ox, oy, pad)) {
    ox = x;
    oy = y;
  }
  return { x: ox, y: oy };
}

/**
 * OPAQUE AT THIS POINT? Walls plus LOW COVER (round 7). This is the ONE place
 * the two arrays are unioned, and it is a sight function only: the crate is a
 * thing you walk over, so no collision path may ever call it. That asymmetry
 * IS the mechanic Mike asked for - "half walls or boxes you can hide behind
 * and sneak behind to get around enemies or turrets".
 */
function blocksSight(s: StrainState, x: number, y: number): boolean {
  for (const w of s.walls) {
    if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
  }
  for (const w of s.lows) {
    if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
  }
  return false;
}

/**
 * LINE OF SIGHT: the same segment walk the set validator uses, at pad 0,
 * because sight is thin where a body is fat. THE THIRD AND MOST EXPENSIVE
 * PERCEPTION TEST ON PURPOSE - range and angle prune almost everything
 * before a single one of these runs.
 * ROUND 7: it marches crates too, so a blob standing behind (or on top of)
 * low cover is invisible to machine cones, cameras and turrets alike. One
 * function, so a new eye can never be born knowing less than the old ones.
 */
function hasSight(s: StrainState, x1: number, y1: number, x2: number, y2: number): boolean {
  const steps = Math.max(6, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (5 * s.k)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (blocksSight(s, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
  }
  return true;
}

/**
 * DOES THIS EYE SEE THE BLOB? Range, then angle, then the raycast: cheap
 * first, so a chamber of seventeen machines and four cameras costs one or two
 * casts a frame, not twenty-one.
 */
function eyeSees(s: StrainState, x: number, y: number, fx: number, fy: number, r: number, cosHalf: number): boolean {
  const dx = s.px - x;
  const dy = s.py - y;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return false;
  const d = Math.sqrt(d2);
  if (d < 1) return true;
  if ((dx / d) * fx + (dy / d) * fy < cosHalf) return false;
  return hasSight(s, x, y, s.px, s.py);
}

/**
 * HAS THIS MACHINE CLOCKED THE BLOB? Aware means UNEATABLE (round 5), so this
 * one predicate is the whole eat gate and everything that reads it - the
 * Client's red rim, the harness oracle's target list - MUST import it rather
 * than re-derive it (the standing lesson: a gate that reimplements the rule
 * it checks reproduces the author's assumptions and passes).
 * ROUND 6 ADDED MEMORY. It is no longer a pure function of the live meter:
 *   - `searchF > 0` keeps a machine aware for the whole search after it loses
 *     the line, which is what killed "step behind a wall for 1.5s";
 *   - `pinned` is the alarm's (and the full purge's) permanent mark on a
 *     hunter for the rest of the floor.
 */
export function botAware(s: StrainState, b: Bot): boolean {
  return b.seenS >= s.awareS || b.searchF > 0 || b.pinned || (s.alarm && b.hunter);
}

/** IS THIS MEAL A SWALLOW OR A JOB? Round 7's whole answer to "the weird
 * freeze thing": at or under your own tier it is a swallow and nothing about
 * it takes time. Above it, it is a job. One predicate, imported everywhere
 * (Client, oracle) so nothing can disagree about which it is. */
export function isInstantMeal(s: StrainState, b: Bot): boolean {
  return b.tier <= s.tier;
}

/** THE MEAL'S PRICE IN SECONDS OF STANDING STILL. Zero for anything at or
 * under your tier (it never latches at all); above that, the tier gap is the
 * price, and a hunter is a bigger job than its tier alone says. */
export function feedNeedFor(s: StrainState, b: Bot): number {
  if (isInstantMeal(s, b)) return 0;
  const gap = b.tier - s.tier;
  return (FEED_BASE_S + FEED_GAP_S * gap) * (b.hunter ? FEED_HUNTER_MUL : 1) * s.feedMul;
}

/** Earshot of a feed on this meal, sim px. Bigger prey screams louder. */
function noiseRFor(s: StrainState, b: Bot): number {
  return (NOISE_R_BASE + NOISE_R_PER_TIER * Math.min(MAX_TIER, b.tier)) * s.noiseMul * s.k;
}

/**
 * THE CORRUPT LANDS. Shared by both roads to a meal - the instant swallow and
 * the completed channel - so growth, tiering, scoring and the win can never
 * drift apart between them (round 7 created the second road; this function is
 * why that did not create a second set of rules).
 * Returns TRUE when the caller must return immediately: the warden is down and
 * the payoff beat owns the sim.
 */
function swallow(s: StrainState, b: Bot): boolean {
  const wasOver = b.tier > s.tier;
  b.eaten = true;
  s.growth += Math.min(MAX_TIER, b.tier);
  s.eatenCount += 1;
  if (wasOver) s.quietEats += 1;
  if (b.hunter) s.huntersEaten += 1;
  while (s.tier < MAX_TIER && s.growth >= TIER_THRESHOLDS[s.tier + 1]) s.tier += 1;
  s.feedIdx = -1;
  s.feedT = 0;
  s.feedNoiseR = 0;
  if (b.warden) {
    // THE WIN. Generous, once per lap, and it blows the door: the way out of
    // the warden's floor is the warden.
    s.bonusPts += WARDEN_PTS;
    s.wardensEaten += 1;
    s.doorBlown = true;
    s.phase = "won";
    s.wonF = WIN_BEAT_F;
    return true;
  }
  s.eatPts += EAT_PTS[Math.min(MAX_TIER, b.tier)] ?? 40;
  return false;
}

/**
 * A PLATE COMES OFF. One function for every source of damage in the game -
 * an armed machine's charge and, since round 7, a turret's round - so the
 * iframe window, the torn-out meal and the death check can never disagree
 * about what a hit is. Returns TRUE when the run just ended.
 */
function takeHit(s: StrainState): boolean {
  if (s.iframes > 0) return false;
  s.hp -= 1;
  s.iframes = TOUCH_IFRAMES_F;
  // A HIT BREAKS THE FEED. Being caught mid-meal is the round-6 death: you
  // were anchored, something arrived, and the meal is gone with the plate.
  // Round 7 gave the turrets the same power, which is what makes taking a big
  // meal inside a turret's wedge the worst idea on the floor.
  if (s.feedIdx >= 0) {
    s.feedIdx = -1;
    s.feedT = 0;
    s.feedNoiseR = 0;
    s.feedCd = FEED_REGRIP_F;
    s.feedsBroken += 1;
  }
  if (s.hp <= 0) {
    s.phase = "dead"; // banked eat + door points keep
    return true;
  }
  return false;
}

/** SOMETHING CAUGHT ITS ATTENTION: sight, noise, or an alarm. It remembers the
 * point and goes to look. The one place search is armed, so memory can never
 * be set half-way. */
function alertTo(b: Bot, x: number, y: number): void {
  b.lastX = x;
  b.lastY = y;
  b.searchF = SEARCH_F;
}

/**
 * Straight when the line is clear, around the blocking wall's near end when
 * it is not (the sibling's rusher routing, same shape). A hunter that
 * charges straight into a slab wedges under it, and a wedged hunter behind
 * cover is a stalemate the harness would find and a human would exploit.
 */
function routeAround(
  s: StrainState,
  bx: number,
  by: number,
  tx: number,
  ty: number,
  pad: number,
): { x: number; y: number } {
  for (const w of s.walls) {
    let hit = false;
    for (let i = 1; i < 12; i++) {
      const t = i / 12;
      const x = bx + (tx - bx) * t;
      const y = by + (ty - by) * t;
      if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;
    const leftEnd = w.x - pad - 6 * s.k;
    const rightEnd = w.x + w.w + pad + 6 * s.k;
    const gx = Math.abs(bx - leftEnd) < Math.abs(bx - rightEnd) ? leftEnd : rightEnd;
    const gy = by < w.y ? w.y - pad - 6 * s.k : w.y + w.h + pad + 6 * s.k;
    return { x: gx, y: gy };
  }
  return { x: tx, y: ty };
}

function botPad(s: StrainState, b: Bot): number {
  return botR(b.tier) * s.k;
}

/** Machines look where they are going. Facing is DERIVED every step from the
 * move it intends, never from where the wall shoved it. */
function face(b: Bot, dx: number, dy: number): void {
  const d = Math.hypot(dx, dy);
  if (d < 0.0001) return;
  b.fx = dx / d;
  b.fy = dy / d;
}

/** Walk the authored loop. A body that cannot move at all this step advances
 * its waypoint instead of grinding a wall: the deterministic un-wedge. */
function walkLoop(s: StrainState, b: Bot, speed: number, dt: number): void {
  const wp = b.wps[b.wi];
  const dx = wp.x - b.x;
  const dy = wp.y - b.y;
  const d = Math.hypot(dx, dy);
  if (d < 3 * s.k) {
    b.wi = (b.wi + 1) % b.wps.length;
    return;
  }
  face(b, dx, dy);
  const step = Math.min(speed * dt, d);
  const pad = botPad(s, b);
  const m = slide(s, b.x, b.y, b.x + (dx / d) * step, b.y + (dy / d) * step, pad);
  if (m.x === b.x && m.y === b.y) b.wi = (b.wi + 1) % b.wps.length;
  b.x = m.x;
  b.y = m.y;
}

/** Move a bot toward a point with wall sliding and world clamping. */
function stepToward(s: StrainState, b: Bot, tx: number, ty: number, speed: number, dt: number): void {
  const dx = tx - b.x;
  const dy = ty - b.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.0001) return;
  face(b, dx, dy);
  const step = Math.min(speed * dt, d);
  const pad = botPad(s, b);
  const m = slide(s, b.x, b.y, b.x + (dx / d) * step, b.y + (dy / d) * step, pad);
  b.x = Math.max(pad, Math.min(s.W - pad, m.x));
  b.y = Math.max(pad, Math.min(s.H - pad, m.y));
}

/**
 * THE CHAMBER GOES INTO LOCKDOWN (round 6 promoted this from a chase to a
 * state). Four things, and the exit is the load-bearing one:
 *   - THE DOOR SEALS while the lockdown holds, so you cannot trip the alarm
 *     on the way out and shrug;
 *   - every machine on the floor SEARCHES the trip point;
 *   - every hunter is PINNED aware for the rest of the floor, permanently,
 *     which is Mike's original "the warden perma chases you for that level"
 *     and which costs you the warden itself on chamber five;
 *   - the lockdown lifts after ALARM_CLEAR_S calm seconds. It is a state with
 *     a way out, and the way out is going quiet.
 */
function tripAlarm(s: StrainState): void {
  if (s.alarm) return;
  s.alarm = true;
  s.alarmX = s.px;
  s.alarmY = s.py;
  s.alarmCalmT = 0;
  s.alarmT = 0;
  s.alarmsTripped += 1;
  s.doorProgress = 0; // the exit seals: whatever you had channelled is gone
  for (const b of s.bots) {
    if (b.eaten) continue;
    if (b.hunter) b.pinned = true;
    else alertTo(b, s.px, s.py);
  }
}

/**
 * IT LOST YOU AND IT IS LOOKING. Walks the last known point, then sweeps a
 * ring around it off its own countdown - pure, deterministic, no rng - and
 * stays aware (uneatable) the whole way. Breaking the line buys seconds now.
 */
function searchStep(s: StrainState, b: Bot, speed: number, dt: number): void {
  b.searchF -= 1;
  const pad = botPad(s, b);
  if (Math.hypot(b.lastX - b.x, b.lastY - b.y) > 13 * s.k) {
    const to = routeAround(s, b.x, b.y, b.lastX, b.lastY, pad);
    stepToward(s, b, to.x, to.y, speed, dt);
    return;
  }
  const a = b.searchF * SEARCH_SWEEP;
  stepToward(
    s,
    b,
    b.lastX + Math.cos(a) * SEARCH_R * s.k,
    b.lastY + Math.sin(a) * SEARCH_R * s.k,
    speed,
    dt,
  );
}

export function stepStrain(s: StrainState, dt: number, input: SimInput): void {
  if (s.phase === "dead" || s.phase === "timeout") return;
  s.t += dt;
  if (s.t >= MISSION_T) {
    s.phase = "timeout"; // the anti-hang backstop; banked points keep
    return;
  }
  if (s.phase === "won") {
    // THE PAYOFF BEAT. The warden is down, its door hangs open, and the run
    // does NOT end (ADR-0120): the network keeps going, deeper.
    s.wonF -= 1;
    if (s.wonF <= 0) s.phase = "chamber";
    return;
  }
  if (s.phase === "transition") {
    s.transF -= 1;
    if (s.transF <= 0) {
      s.phase = "chamber";
      loadChamber(s, CHAMBER_SETS[s.setIdx] as ChamberSet, s.chamber + 1);
    }
    return;
  }

  if (s.iframes > 0) s.iframes -= 1;

  // ── THE PURGE CLOCK (round 6): the reason to keep moving ──────────────────
  // Free seconds, then a ramp that never gives the floor back. Every effect
  // below is REWRITTEN INTO THE SAME FIELDS THE CLIENT DRAWS (visionR, c.r),
  // so a cone that reaches further is a cone that LOOKS further: no invisible
  // rule, ever.
  s.chamberT += dt;
  // ...AND THE DEEP FLOORS GIVE YOU LESS OF IT. The same deepMul that scales
  // hunter speed shortens both the grace and the ramp, so a lap-3 chamber
  // arms itself in ~40 seconds where chamber one takes 66. Without this the
  // escalation was speed alone and a strong player simply cleared floors at
  // leisure forever; with it, the clock is what finally ends the run.
  const pace = deepMul(s);
  s.purge = Math.max(0, (s.chamberT - PURGE_GRACE_S / pace) / (PURGE_RAMP_S / pace));
  // vision stops growing at full purge (a cone that swallows the floor is not
  // a tell any more); SPEED keeps climbing to 2x purge, which is the part that
  // eventually makes a chamber unlivable rather than merely loud.
  const purgeVision = 1 + PURGE_VISION * Math.min(1, s.purge);
  const purgeSpeed = 1 + PURGE_SPEED * Math.min(2, s.purge);
  // ── A LOUD FLOOR FIGHTS BACK (round 6) ──────────────────────────────────
  // THE reason the old build could never hurt a grown blob: only a machine
  // that OUTRANKED you could take a plate, so from T5 on, 65 of a floor's 66
  // machines were literally incapable of damage and being seen cost nothing.
  // Under a lockdown - or once the purge is full - every aware machine ARMS:
  // it stops backpedalling, it charges, and it costs a plate on contact
  // whatever its tier. Getting seen is now the thing that kills you, which is
  // the whole fantasy: hunting AND being hunted.
  const armed = floorArmed(s);

  // ── the feed: latched means ANCHORED ──────────────────────────────────────
  // The blob is holding a machine down while it dissolves. It cannot walk, it
  // cannot dodge, and it is making noise. SPACE RELEASES THE LATCH: a real
  // decision when something you did not hear is closing.
  const feeding = s.feedIdx >= 0 && !!s.bots[s.feedIdx] && !s.bots[s.feedIdx].eaten;
  if (s.feedCd > 0) s.feedCd -= 1;
  if (feeding && input.space) {
    s.feedIdx = -1;
    s.feedT = 0;
    s.feedNoiseR = 0;
    s.feedCd = FEED_REGRIP_F;
  }
  const latched = s.feedIdx >= 0;

  // ── player: HOLD STILL beats everything, then keys, then the pointer ──────
  // SPACE IS THE HIDE VERB (it was a declared-but-dead input channel): press
  // flat against the floor, stop moving, and the network's eyes fill their
  // meters at a third the rate. A real answer to a cone crossing your lane.
  s.hiding = input.space && !latched;
  const speed = BASE_SPEED * s.speedMul * (1 - TIER_SLOW * (s.tier - 1)) * s.k;
  const r = playerR(s);
  let kx = 0;
  let ky = 0;
  if (input.left) kx -= 1;
  if (input.right) kx += 1;
  if (input.up) ky -= 1;
  if (input.downKey) ky += 1;
  if (latched) {
    // ANCHORED to the meal: nothing moves the blob until the channel ends
  } else if (s.hiding) {
    // held flat: no movement at all this step
  } else if (kx !== 0 || ky !== 0) {
    // HELD KEYS STEER, normalised so a diagonal is not faster than a
    // cardinal, and they take priority over the pointer whenever any key is
    // down (the shell delivers them as held booleans).
    const kl = Math.hypot(kx, ky);
    const step = speed * dt;
    const m = slide(s, s.px, s.py, s.px + (kx / kl) * step, s.py + (ky / kl) * step, r);
    s.px = m.x;
    s.py = m.y;
  } else if (input.down && input.px != null && input.py != null) {
    const dx = input.px - s.px;
    const dy = input.py - s.py;
    const d = Math.hypot(dx, dy);
    if (d > 3 * s.k) {
      const step = Math.min(speed * dt, d);
      const m = slide(s, s.px, s.py, s.px + (dx / d) * step, s.py + (dy / d) * step, r);
      s.px = m.x;
      s.py = m.y;
    }
  }
  s.px = Math.max(r, Math.min(s.W - r, s.px));
  s.py = Math.max(r, Math.min(s.H - r, s.py));

  const fill = dt * (s.hiding ? HIDE_SEEN_MUL : 1);
  /** anything at all has the blob clocked this step (drives the lockdown's
   * calm timer, which is the only way out of a sealed floor) */
  let anyClocked = false;

  // ── the cameras: a pure triangle sweep of s.t, no state to drift ──────────
  // UNDER LOCKDOWN THEY STOP SWEEPING AND TRACK (round 6): every camera snaps
  // to face the network's last known position for the blob, which the eyes
  // keep refreshing. Standing still under a tracking camera is how a lockdown
  // becomes permanent, and moving is how it lifts.
  for (const c of s.cams) {
    c.r = c.r0 * purgeVision;
    if (s.alarm) {
      const dx = s.alarmX - c.x;
      const dy = s.alarmY - c.y;
      const d = Math.hypot(dx, dy) || 1;
      c.fx = dx / d;
      c.fy = dy / d;
    } else {
      const ph = (s.t % c.period) / c.period;
      const tri = ph < 0.5 ? ph * 2 : 2 - ph * 2;
      const a = c.a0 + (c.a1 - c.a0) * tri;
      c.fx = Math.cos(a);
      c.fy = Math.sin(a);
    }
    if (eyeSees(s, c.x, c.y, c.fx, c.fy, c.r, c.visionCos)) {
      c.seenS += fill;
      if (s.alarm) {
        // the network updates its own last-known: the cameras hand you off
        s.alarmX = s.px;
        s.alarmY = s.py;
      }
    } else c.seenS = Math.max(0, c.seenS - SEEN_DECAY * dt);
    if (c.seenS >= s.awareS) anyClocked = true;
    if (c.seenS >= SEEN_ALARM_S) tripAlarm(s);
  }

  // ── THE TURRETS (round 7) ─────────────────────────────────────────────────
  // Mike: "cameras and turrets that cannot be destroyed and have to be
  // avoided". Nothing below can be eaten, shoved, outgrown or switched off; a
  // turret is geometry with a trigger. Three things happen here and in this
  // order, and the order is the fairness contract:
  //   1. it is an EYE, so it feeds the alarm exactly like a camera does. This
  //      is the coverage half of "faster detection": round 6 measured the
  //      player inside SOME cone only 3.8-17.6% of chamber frames, and no
  //      threshold tightening fixes a floor nobody is looking at;
  //   2. it ACQUIRES over TURRET_LOCK_S, and every frame of that is drawn
  //      (meter + aiming line). The shot is never the first thing you learn;
  //   3. only then does it FIRE, on a cadence, for a real plate.
  // Low cover is the answer to all three at once, which is why the two landed
  // in the same pass and why chambers.ts refuses to ship a cone without one.
  const turretLockNeed = TURRET_LOCK_S + (s.awareS - SEEN_AWARE_S);
  for (const tu of s.turrets) {
    tu.r = tu.r0 * purgeVision;
    if (tu.flash > 0) tu.flash -= 1;
    if (tu.cd > 0) tu.cd = Math.max(0, tu.cd - dt);
    if (s.alarm) {
      // UNDER LOCKDOWN THE GUNS TRACK, like the cameras: the network hands
      // your last known position around. Tracking buys the turret an angle,
      // never a wall - it still needs range and a clear line to fire, so a
      // crate answers a lockdown exactly like it answers a quiet floor.
      const dx = s.alarmX - tu.x;
      const dy = s.alarmY - tu.y;
      const d = Math.hypot(dx, dy) || 1;
      tu.fx = dx / d;
      tu.fy = dy / d;
    } else {
      tu.fx = tu.fx0;
      tu.fy = tu.fy0;
    }
    tu.sees = eyeSees(s, tu.x, tu.y, tu.fx, tu.fy, tu.r, tu.visionCos);
    if (tu.sees) {
      tu.seenS += fill;
      // HOLDING STILL SLOWS THE LOCK TOO (fill carries HIDE_SEEN_MUL), which
      // is the one thing pressing flat is worth inside a wedge: it buys you
      // time to read the room, it does not make you safe.
      // CAPPED AT THE LIVE NEED (round 8): an uncapped meter banked seconds
      // of lock during a long stare and its drained-off tail kept the aim
      // laser pointing at the blob through walls - the measured ghost was
      // 3.1s of red line from a gun with no line of sight.
      tu.lockS = Math.min(turretLockNeed, tu.lockS + fill);
      if (s.alarm) {
        s.alarmX = s.px;
        s.alarmY = s.py;
      }
      if (tu.lockS >= turretLockNeed && tu.cd <= 0) {
        // THE ROUND LEAVES THE BARREL (round 8): a projectile aimed at where
        // the blob is THIS frame, at a speed the blob can beat from range.
        // Damage moved to the round's own flight (below) - a turret shot is
        // no longer an instant hit, which is Mike's "needs to be dodgeable".
        tu.cd = TURRET_SHOT_CD_S;
        tu.flash = TURRET_FLASH_F;
        const mx = tu.x + tu.fx * TURRET_MUZZLE * s.k;
        const my = tu.y + tu.fy * TURRET_MUZZLE * s.k;
        const sdx = s.px - mx;
        const sdy = s.py - my;
        const sd = Math.hypot(sdx, sdy) || 1;
        s.shots.push({
          x: mx,
          y: my,
          vx: (sdx / sd) * TURRET_SHOT_SPEED * s.k,
          vy: (sdy / sd) * TURRET_SHOT_SPEED * s.k,
        });
      }
    } else {
      tu.seenS = Math.max(0, tu.seenS - SEEN_DECAY * dt);
      tu.lockS = Math.max(0, tu.lockS - TURRET_LOCK_DECAY * dt);
    }
    if (tu.seenS >= s.awareS) anyClocked = true;
    if (tu.seenS >= SEEN_ALARM_S) tripAlarm(s);
  }

  // ── THE ROUNDS IN FLIGHT (round 8) ────────────────────────────────────────
  // Each one is a body: it flies, it dies on the first opaque thing it meets
  // (walls AND crates - blocksSight, the same union every eye uses, so the
  // cover that hides you also STOPS the round already in the air), and it
  // lands only if it physically reaches the blob. turretHits still counts
  // rounds that LANDED, so the pressure readout keeps its meaning: a run
  // that sidesteps every round reads zero exactly like a run that was never
  // fired at.
  for (let i = s.shots.length - 1; i >= 0; i--) {
    const sh = s.shots[i];
    sh.x += sh.vx * dt;
    sh.y += sh.vy * dt;
    if (sh.x < 0 || sh.x > s.W || sh.y < 0 || sh.y > s.H || blocksSight(s, sh.x, sh.y)) {
      s.shots.splice(i, 1);
      continue;
    }
    if (Math.hypot(sh.x - s.px, sh.y - s.py) < playerR(s) + TURRET_SHOT_R * s.k) {
      s.shots.splice(i, 1);
      if (s.iframes <= 0) s.turretHits += 1; // rounds that LANDED, not fired
      if (takeHit(s)) return;
    }
  }

  // ── the room reacts ────────────────────────────────────────────────────────
  const deep = deepMul(s);
  // THE FEED IS LOUD: earshot for this step, and the point it radiates from.
  const meal = latched ? s.bots[s.feedIdx] : null;
  s.feedNoiseR = meal ? noiseRFor(s, meal) : 0;
  for (let i = 0; i < s.bots.length; i++) {
    const b = s.bots[i];
    if (b.eaten) continue;
    const dx = s.px - b.x;
    const dy = s.py - b.y;
    const d = Math.hypot(dx, dy);
    const eatable = b.tier <= s.tier;
    // THE MEAL IS CAUGHT. It does not look, it does not run, it does not
    // scream on its own behalf: the noise below is what it costs you.
    const isMeal = i === s.feedIdx;

    // perception first: everything below reads the meter, never a radius
    b.visionR = b.visionR0 * purgeVision;
    let sees = false;
    if (!isMeal) {
      sees = eyeSees(s, b.x, b.y, b.fx, b.fy, b.visionR, b.visionCos);
      if (sees) {
        b.seenS += fill;
        // MEMORY (round 6): it keeps a running fix on you the whole time it
        // has the line, and that fix is what it walks back to.
        b.lastX = s.px;
        b.lastY = s.py;
        if (b.seenS >= s.awareS) b.searchF = SEARCH_F;
      } else b.seenS = Math.max(0, b.seenS - SEEN_DECAY * dt);
      if (b.seenS >= s.awareS) anyClocked = true;
      if (b.seenS >= SEEN_ALARM_S) tripAlarm(s);
      // HEARING (round 6): a live feed inside earshot brings it to look. This
      // is the price of every meal and the reason a big one is a decision.
      if (meal && !isMeal && Math.hypot(s.px - b.x, s.py - b.y) < s.feedNoiseR) {
        b.hearS += dt;
        if (b.hearS >= HEAR_S) {
          b.hearS = 0;
          alertTo(b, s.px, s.py);
        }
      } else b.hearS = Math.max(0, b.hearS - dt);
    }
    // A FULL PURGE SENDS THE WARDEN. Past purge 1 the floor's hunter is pinned
    // on you permanently, exactly like a tripped alarm: staying is the mistake.
    if (b.hunter && s.purge >= 1) b.pinned = true;
    const clocked = botAware(s, b);
    /** it has a live line on you, or the network is feeding it one */
    const knows = sees || (b.hunter && (b.pinned || s.alarm));

    if (isMeal) {
      // held down and dissolving: no move, no facing change
    } else if (!clocked) {
      // IT DOES NOT KNOW YOU ARE THERE. It walks its loop. Unaware prey does
      // NOT flee, which is exactly why stealth is faster than a chase loop.
      walkLoop(s, b, (b.hunter ? HUNTER_SPEED * 0.8 * deep : WANDER_SPEED) * purgeSpeed * s.k, dt);
    } else if (!knows && b.searchF > 0) {
      // IT LOST YOU AND IT IS LOOKING (round 6). The corner is a delay now,
      // not an eraser: it walks your last known position and sweeps it, and
      // it is uneatable the whole way.
      searchStep(s, b, SEARCH_SPEED * purgeSpeed * s.k, dt);
    } else if (b.hunter && !eatable) {
      // THE HUNT. It routes around walls rather than charging into them, so
      // cover buys you TIME but never a permanent safe pocket. Equal tier is
      // outrunnable; once it outranks you it closes.
      const to = routeAround(s, b.x, b.y, s.px, s.py, botPad(s, b));
      const chase = HUNTER_SPEED * deep * purgeSpeed * (1 + CHASE_TIER_STEP * (b.tier - s.tier));
      stepToward(s, b, to.x, to.y, chase * s.k, dt);
    } else if (b.hunter && eatable) {
      // THE INVERSION. Outgrown and it RUNS, faster than prey, and the walls
      // it used to hide behind are what let you corner it.
      if (d < PREY_FLEE_R * 1.6 * s.k && d > 1) {
        const fx = b.x - (dx / d) * 200 * s.k;
        const fy = b.y - (dy / d) * 200 * s.k;
        const to = routeAround(s, b.x, b.y, fx, fy, botPad(s, b));
        stepToward(s, b, to.x, to.y, HUNTER_FLEE_SPEED * s.k, dt);
      } else {
        walkLoop(s, b, WANDER_SPEED * s.k, dt);
      }
    } else if (eatable && !armed) {
      // THE AWARE DODGE (round 5): clocked prey is UNEATABLE and it knows
      // it - it backpedals directly away, faster than the old flee, and it
      // keeps its eyes ON the blob while it does. Chasing it head-on keeps
      // its meter full forever; the only answers are breaking the line of
      // sight or outrunning its cone until the search gives up.
      if (d > 1) {
        stepToward(s, b, b.x - (dx / d) * 200 * s.k, b.y - (dy / d) * 200 * s.k, PREY_DODGE_SPEED * s.k, dt);
        face(b, dx, dy); // it watches you, not where it is going
      }
    } else {
      // MIKE'S "THE BIGGER ONES BECOME A THREAT": clocked, and it outranks
      // you (or the floor is ARMED and it no longer cares how small it is),
      // so it comes. Outrunnable, and it gives up when the search ends.
      const to = routeAround(s, b.x, b.y, s.px, s.py, botPad(s, b));
      stepToward(s, b, to.x, to.y, PREY_CHASE_SPEED * deep * purgeSpeed * s.k, dt);
    }

    // ── CONTACT (round 6: the feed channel) ─────────────────────────────────
    // Contact does not kill any more, it LATCHES, and the corrupt lands after
    // sustained contact priced by the tier gap. Three gates, in order:
    //   CLOCKED  -> nothing to eat here. It is aware; if it outranks you it
    //               takes a plate off you and BREAKS whatever you were eating.
    //   TOO BIG  -> more than QUIET_GAP tiers up: you bounce off it and WAKE
    //               it. This is what stops a T1 walking up behind the Warden.
    //   OTHERWISE-> latch, and stand still, and be loud, until it is yours.
    const br = botR(b.tier) * s.k;
    const touching = Math.hypot(s.px - b.x, s.py - b.y) < r + br;
    if (isMeal) {
      s.feedT += dt;
      if (s.feedT >= s.feedNeed) {
        if (swallow(s, b)) return;
      }
    } else if (touching) {
      if (clocked) {
        if ((!eatable || armed) && takeHit(s)) return;
        // clocked && eatable on a QUIET floor: nothing happens - it is aware
        // and mid-dodge. On an armed floor it just took a plate off you.
      } else if (b.tier - s.tier > QUIET_GAP) {
        // TOO BIG TO SWALLOW. The mass is simply not there: you bounce, and
        // the thing you just shoved WAKES UP and starts looking for you.
        b.seenS = Math.max(b.seenS, s.awareS);
        alertTo(b, s.px, s.py);
        s.startles += 1;
      } else if (isInstantMeal(s, b)) {
        // ROUND 7: CHAFF IS A SWALLOW, NOT A JOB. At or under your own tier
        // there is no latch, no anchor, no channel, no noise and no regrip
        // cooldown - touch it and it is gone, exactly as it was before round
        // 6. This is Mike's "weird freeze thing while it collects smaller
        // people", deleted at the source: the hunt through a floor of small
        // prey is continuous again, and it does not even check feedCd, so
        // releasing a big meal never stutters the small ones behind it.
        if (swallow(s, b)) return;
      } else if (s.feedIdx < 0 && s.feedCd <= 0) {
        // ...AND ANYTHING BIGGER STILL COSTS YOU EVERYTHING ROUND 6 CHARGED:
        // the blob anchors, the channel runs on the tier gap, the feed is
        // loud, and a hit lands on a body that cannot move.
        s.feedIdx = i;
        s.feedT = 0;
        s.feedNeed = feedNeedFor(s, b);
      }
    }
  }

  // ── THE LOCKDOWN LIFTS WHEN THE FLOOR GOES QUIET ──────────────────────────
  // Calm seconds, not distance: nothing on the floor has you clocked and the
  // trackers have lost their fix. Hunters it pinned stay pinned regardless -
  // the alarm on the warden's floor still costs you the warden.
  if (s.alarm) {
    s.alarmT += dt;
    if (anyClocked) s.alarmCalmT = 0;
    else s.alarmCalmT += dt;
    if (s.alarmCalmT >= ALARM_CLEAR_S || s.alarmT >= ALARM_MAX_S) {
      s.alarm = false;
      s.alarmCalmT = 0;
      s.alarmT = 0;
    }
  }

  // ── the door: park on it at tier to channel the break ──────────────────────
  // A LOCKDOWN JAMS IT (round 6): the way out of a loud floor is three times
  // the channel, or going quiet first. Feeding blocks it outright - the blob
  // has its mouth full.
  const channelT = s.doorChannelT * (s.alarm ? ALARM_DOOR_MUL : 1);
  const canBreak = (s.doorBlown || s.tier >= s.doorTier) && s.feedIdx < 0;
  if (canBreak && Math.hypot(s.px - s.doorX, s.py - s.doorY) < DOOR_R * s.k) {
    s.doorProgress += dt / channelT;
    if (s.doorProgress >= 1) {
      s.doorPts += DOOR_PTS;
      // the fifth door breaks the quarantine, and pays ONCE
      if (s.chamber === CHAMBERS_PER_LAP - 1) s.bonusPts += ESCAPE_PTS;
      s.phase = "transition"; // ALWAYS deeper (ADR-0120: the run never stops)
      s.transF = TRANSITION_F;
    }
  } else if (s.doorProgress > 0) {
    s.doorProgress = Math.max(0, s.doorProgress - dt / channelT);
  }
}

/** THE FLOOR IS ARMED: every aware machine charges and bites whatever its
 * tier. Presentation MUST shout this (it is the difference between a room of
 * prey and a room of teeth), and it imports the rule rather than re-deriving
 * it. */
export function floorArmed(s: StrainState): boolean {
  return s.alarm || s.purge >= 1;
}

/** THE FEED CHANNEL, 0..1. Presentation draws it on the blob; 0 when the
 * blob's mouth is empty. */
export function feedFrac(s: StrainState): number {
  if (s.feedIdx < 0 || s.feedNeed <= 0) return 0;
  return Math.min(1, s.feedT / s.feedNeed);
}

/** THE PURGE, 0..1 to full and past it for the deep tail. Presentation draws
 * the bar off this; the sim scales cones and speeds off the same number. */
export function purgeFrac(s: StrainState): number {
  return Math.min(1, s.purge);
}

/** THE LOUDEST METER IN THE ROOM, 0..1 toward the alarm. Presentation reads
 * it for the rim warning; the sim never branches on it. Turrets are eyes, so
 * they count here too - a rim that stayed cold while a gun was two thirds of
 * the way to calling a lockdown would be lying. */
export function alarmHeat(s: StrainState): number {
  let m = 0;
  for (const b of s.bots) if (!b.eaten && b.seenS > m) m = b.seenS;
  for (const c of s.cams) if (c.seenS > m) m = c.seenS;
  for (const t of s.turrets) if (t.seenS > m) m = t.seenS;
  return Math.min(1, m / SEEN_ALARM_S);
}

/** SECONDS OF ACQUISITION THIS TURRET NEEDS before the first round. Sensors
 * buys the same slack it buys against a machine's eyes. Presentation MUST
 * import this rather than assume TURRET_LOCK_S, or the drawn tell would be
 * wrong for exactly the builds that paid for a longer one. */
export function turretLockNeedFor(s: StrainState): number {
  return TURRET_LOCK_S + (s.awareS - SEEN_AWARE_S);
}

/** THE TELL, 0..1. 1 means the next round is already on its way. */
export function turretLockFrac(s: StrainState, t: Turret): number {
  const need = turretLockNeedFor(s);
  return need <= 0 ? 1 : Math.min(1, t.lockS / need);
}

/** IS ANY GUN ABOUT TO FIRE ON US? The one plain line the HUD needs. */
export function turretThreat(s: StrainState): number {
  let m = 0;
  for (const t of s.turrets) {
    const f = turretLockFrac(s, t);
    if (f > m) m = f;
  }
  return m;
}

export function strainDone(s: StrainState): boolean {
  return s.phase === "dead" || s.phase === "timeout";
}

export function strainScore(s: StrainState): number {
  return s.eatPts + s.doorPts + s.bonusPts;
}
