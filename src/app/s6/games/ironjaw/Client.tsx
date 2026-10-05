"use client";
/**
 * IRON JAW - the page client. The sim is frozen behind its harness baseline;
 * everything here is PRESENTATION (ADR-0119: Pixi renders, the sim rules).
 * The scene reads state every painted frame and keeps its own tiny
 * presentation memory (previous phase/counters) to fire swings, sparks and
 * shakes on deltas - none of it ever touches the sim, so tapes replay
 * byte-identical headless.
 *
 * Layout mirrors the approved mockup: opponent fills the upper frame, your
 * rig is a rim-lit silhouette at the bottom, tells glow on the cocked fist,
 * dodge zones live left/right, guard is the low strip.
 *
 * IT MUST ACTUALLY SHOW THE SIM (2026-08-15). This file imported five styles
 * worth of sim state and read NONE of it: tellStyle, tellPierce, tellTotalF,
 * comboLeft, oppX, pxOff, slipF, slipDir and whiffs all appeared zero times,
 * so a hand-authored five-style fighter rendered as one amber jab thrown from
 * one shoulder, and the game read as "a push right simulator" (Mike). Every
 * one of those is painted now:
 *   tellStyle   -> telegraph colour, shape and the word on the HUD
 *   comboLeft   -> pips, on the fist and beside the word
 *   tellPierce  -> "GUARD WILL NOT HOLD" over the guard strip
 *   tellTotalF  -> the tell ring's fill (the old local recompute was wrong for
 *                  combo links 2..n, which wind on innerTellF)
 *   oppX / pxOff-> both fighters stand where the sim says they stand
 *   slipF/Dir   -> the sidestep leaves streaks
 *   whiffs      -> a swing into air says MISS
 * and the arm that throws is ladders.ts's render-only `hand`, never the dodge
 * requirement, so the punching hand alternates like a fighter's.
 */

import { RunShell, type SceneHandle, type ShellView } from "../_shared/RunShell";
import { createPixiStage } from "../_shared/pixi";
// TYPE-ONLY (erased at compile): the real constructors come from stage.pixi,
// because a static pixi.js import 500s the server render (see _shared/pixi.ts).
import type { Graphics, Sprite, Text } from "pixi.js";
import {
  createIronjaw,
  stepIronjaw,
  ironjawDone,
  ironjawScore,
  HEAVY_CHARGE_F,
  type IronjawState,
} from "./sim";
import { OPPONENTS, TELL_FLOOR_F, type Strike, type StrikeStyle } from "./ladders";
import type { Sfx } from "../_shared/sfx";

/** THE PINNED DESIGN SPACE. Every coordinate in this file is authored in
 * these units and scaled by `k = s.W / 360`; the shell is told to hand the sim
 * exactly this box so the two can never disagree. Matches tape.ts TAPE_W/H. */
const DESIGN_W = 360;
const DESIGN_H = 480;

// ── palette (the mockup's) ──────────────────────────────────────────────────
const C = {
  bg: 0x0c0e15,
  floor: 0x141827,
  steel: 0x333b4f,
  steelHi: 0x48536d,
  steelDark: 0x2a3040,
  red: 0xff5340,
  redDeep: 0x7e2c22,
  amber: 0xffb454,
  amberHi: 0xffd894,
  violet: 0xb07cff,
  violetDeep: 0x3d2a6b,
  slate: 0x8794aa,
  slateDeep: 0x2b3446,
  cyan: 0x58d6f2,
  text: 0xc9d4e3,
  dim: 0x6b7a8f,
};

/**
 * THE TELEGRAPH TABLE - one row per authored style, which is the whole reason
 * the sim publishes `tellStyle` (2026-08-15: it published it and this file
 * read none of it, so five styles rendered as one amber jab and the fight
 * read as "still only does one punch"). Colour AND shape differ, and the word
 * is on screen: the pilot should be able to name what is coming at them.
 */
const STYLE_ART: Record<StrikeStyle, { tell: number; deep: number; word: string }> = {
  jab: { tell: C.amber, deep: 0x7e5a22, word: "JAB" },
  hook: { tell: C.red, deep: C.redDeep, word: "HOOK" },
  uppercut: { tell: C.violet, deep: C.violetDeep, word: "UPPERCUT" },
  combo: { tell: C.amberHi, deep: 0x7e5a22, word: "COMBO" },
  feint: { tell: C.slate, deep: C.slateDeep, word: "FEINT" },
};

/**
 * WHICH ARM THROWS IT, render-only (ladders.ts `hand`). The machine faces you,
 * so its LEFT arm draws on SCREEN RIGHT; combo links alternate off the
 * authored hand so a chain reads as two fists, not one piston. Returns the
 * screen side: +1 right, -1 left. NEVER feeds the sim.
 */
function armSide(st: Strike, comboI: number): 1 | -1 {
  const base = st.hand === "L" ? 1 : -1; // machine's left arm = screen right
  return (comboI % 2 === 1 ? -base : base) as 1 | -1;
}

// ── page-side audio deltas (reset per run in createSim; reads sim state,
// never touches it - the S5 games' exact onFrame pattern) ───────────────────
const audioPrev = { tell: false, dodgeF: 0, landed: 0, eaten: 0, vuln: false, koPts: 0, dead: false };
function resetAudioPrev(): void {
  audioPrev.tell = false;
  audioPrev.dodgeF = 0;
  audioPrev.landed = 0;
  audioPrev.eaten = 0;
  audioPrev.vuln = false;
  audioPrev.koPts = 0;
  audioPrev.dead = false;
}
function ironjawAudio(s: IronjawState, sfx: Sfx): void {
  const p = audioPrev;
  const inTell = s.oppPhase === "tell";
  const inVuln = s.oppPhase === "vuln";
  if (inTell && !p.tell) sfx.play("tap"); // tell onset: the wind-up cue
  if (s.dodgeF > p.dodgeF) sfx.play("fire"); // the dodge whoosh
  if (s.landed > p.landed) sfx.play("hit");
  if (inVuln && !p.vuln) sfx.play("hit"); // the strike sails past: stagger clang
  if (s.eaten > p.eaten) {
    sfx.play("hurt");
    sfx.buzz(24);
  }
  if (s.koPts > p.koPts) sfx.play("ko");
  if (s.phase === "dead" && !p.dead) {
    sfx.play("ko");
    sfx.buzz([30, 40, 60]);
  }
  p.tell = inTell;
  p.vuln = inVuln;
  p.dodgeF = s.dodgeF;
  p.landed = s.landed;
  p.eaten = s.eaten;
  p.koPts = s.koPts;
  p.dead = s.phase === "dead";
}

// ── no-WebGL fallback punch memory (page-side only, reset per run in
// createSim exactly like audioPrev; mirrors the Pixi scene's mem.punchT ramp
// so the flat build shows the same growing fist on the same frames) ─────────
const fbPunch = { prevThrown: 0, t: 0, side: 1, heavy: false };
function resetFbPunch(): void {
  fbPunch.prevThrown = 0;
  fbPunch.t = 0;
  fbPunch.side = 1;
  fbPunch.heavy = false;
}

function bar(g: Graphics, x: number, y: number, w: number, h: number, frac: number, color: number) {
  g.clear();
  g.roundRect(x, y, w, h, h / 2).fill(0x101826).stroke({ width: 1, color: 0x223047 });
  if (frac > 0) g.roundRect(x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2).fill(color);
}

/** The whole scene, built once per mount. All positions are in SIM px and
 * scale with s.k (the sim's own 360-design scale factor). */
async function buildScene(canvas: HTMLCanvasElement): Promise<SceneHandle<IronjawState>> {
  const stage = await createPixiStage(canvas, { background: C.bg });
  const { Container, Graphics, Text, TextStyle } = stage.pixi;
  const W = stage.world;
  const hud = (size: number, fill: number, bold = false) =>
    new TextStyle({ fontFamily: "Segoe UI, system-ui, sans-serif", fontSize: size, fill, fontWeight: bold ? "700" : "400", letterSpacing: 1 });

  // ── static pit ────────────────────────────────────────────────────────────
  const pit = new Container();
  W.addChild(pit);
  // Arena keyart under the vector rig (try-image-else-vector: a failed load
  // keeps the plain pit). Dimmed so the gameplay layer stays readable.
  let bgArt: Sprite | null = null;
  const bgDims = { w: 360, h: 560 };
  const fitBgArt = () => {
    if (!bgArt) return;
    const tw = bgArt.texture.width || 1;
    const th = bgArt.texture.height || 1;
    const sc = Math.max(bgDims.w / tw, bgDims.h / th);
    bgArt.scale.set(sc);
    bgArt.position.set((bgDims.w - tw * sc) / 2, (bgDims.h - th * sc) / 2);
  };
  // the painted pit (bg-pit.webp, 2026-08-14); card.webp is the fallback so a
  // missing plate still lands SOMETHING behind the fight.
  stage.pixi.Assets.load("/s6-art/games/ironjaw/bg-pit.webp")
    .catch(() => stage.pixi.Assets.load("/s6-art/games/ironjaw/card.webp"))
    .then((tex) => {
      if (!tex) return;
      bgArt = new stage.pixi.Sprite(tex);
      bgArt.alpha = 0.72;
      pit.addChildAt(bgArt, 0);
      fitBgArt();
      onArtLanded();
    })
    .catch(() => {});
  const bgG = new Graphics();
  pit.addChild(bgG);

  // ── opponent rig ──────────────────────────────────────────────────────────
  // the sidestep streaks live in WORLD space under the machine: they mark
  // where it just was, so a slip reads as travel instead of a teleport
  const slipTrail = new Graphics();
  W.addChild(slipTrail);
  const opp = new Container();
  W.addChild(opp);
  // PAINTED OPPONENTS (2026-08-14): each ladder machine has a keyed HD-pixel
  // render standing in its own guard. When one is loaded the vector body AND
  // the static guard arm hide, and only the STRIKING arm + tell glow keep
  // drawing on top, because the tell is the gameplay signal and must stay
  // crisp and procedural. Missing art simply never loads and the whole vector
  // rig draws exactly as before (try-image-else-vector, the S6 art law).
  const oppArt: Record<string, Sprite | null> = {};
  const oppArtLayer = new Container();
  opp.addChild(oppArtLayer);
  for (const key of Object.keys(OPPONENTS)) {
    oppArt[key] = null;
    stage.pixi.Assets.load(`/s6-art/games/ironjaw/opp-${key}.webp`)
      .then((tex) => {
        const sp = new stage.pixi.Sprite(tex);
        sp.anchor.set(0.5, 1);
        sp.visible = false;
        oppArt[key] = sp;
        oppArtLayer.addChild(sp);
      })
      .catch(() => {});
  }
  const oppBody = new Graphics();
  const armGuard = new Graphics(); // their guard arm (screen right)
  const armSwing = new Container(); // the striking arm + fist + tell glow
  const swingG = new Graphics();
  const tellGlow = new Graphics();
  const oppFlash = new Graphics(); // vuln stagger outline
  armSwing.addChild(tellGlow, swingG);
  opp.addChild(armGuard, oppBody, armSwing, oppFlash);
  const bang = new Text({ text: "!", style: hud(26, C.red, true) });
  bang.anchor.set(0.5);
  opp.addChild(bang);

  // ── dodge ghosts (under the player rig so they trail behind it) ───────────
  const ghostG = new Graphics();
  W.addChild(ghostG);

  // ── player rig (back view, rim-lit) ───────────────────────────────────────
  const player = new Container();
  W.addChild(player);
  const playerG = new Graphics();
  const fistL = new Graphics();
  const fistR = new Graphics();
  player.addChild(playerG, fistL, fistR);
  // YOUR OWN GAUNTLETS (2026-08-14): one render, mirrored for the left hand.
  // They ride ON TOP of the vector fists rather than replacing them, because
  // the charge ring and the jab lunge are both drawn off the vector circles -
  // the art follows the same coordinates, so a missing render just leaves the
  // original silhouette exactly as it shipped.
  let fistArtL: Sprite | null = null;
  let fistArtR: Sprite | null = null;
  stage.pixi.Assets.load("/s6-art/games/ironjaw/fist.webp")
    .then((tex) => {
      fistArtR = new stage.pixi.Sprite(tex);
      fistArtR.anchor.set(0.5, 0.42);
      fistArtL = new stage.pixi.Sprite(tex);
      fistArtL.anchor.set(0.5, 0.42);
      fistArtL.scale.x = -1; // mirror: one gauntlet, two hands
      player.addChild(fistArtL, fistArtR);
    })
    .catch(() => {});

  // ── fx layers ─────────────────────────────────────────────────────────────
  const spark = new Graphics();
  const dodgeFx = new Graphics(); // cyan success flash / grey whiff puff
  const chevronG = new Graphics(); // special tells: the dodge side to move TO
  const chargeRing = new Graphics(); // haymaker wind-up, closing on the player
  const chargeText = new Text({ text: "", style: hud(9, C.amber, true) });
  chargeText.visible = false;
  // A MISS THE PILOT CAN SEE (s.whiffs). A swing that finds air used to change
  // nothing on screen, so the game read as if it had ignored the input.
  const missT = new Text({ text: "MISS", style: hud(11, C.dim, true) });
  missT.anchor.set(0.5);
  missT.visible = false;
  const vignette = new Graphics();
  W.addChild(spark, dodgeFx, chevronG, chargeRing, chargeText, missT, vignette);

  // ── HUD ───────────────────────────────────────────────────────────────────
  const hudLayer = new Container();
  W.addChild(hudLayer);
  const oppName = new Text({ text: "", style: hud(9, C.red, true) });
  const youName = new Text({ text: "YOUR RIG", style: hud(9, C.amberHi, true) });
  const oppHpG = new Graphics();
  const youHpG = new Graphics();
  const stamG = new Graphics();
  const boutLabel = new Text({ text: "", style: hud(10, C.text, true) });
  const clock = new Text({ text: "", style: hud(12, C.text) });
  const scoreT = new Text({ text: "", style: hud(12, C.amber, true) });
  const zonesHint = new Text({ text: "SIDES / A D: DODGE · CENTER / W: JAB · HOLD: HAYMAKER · LOW / S: GUARD", style: hud(7.5, C.dim) });
  const transCard = new Text({ text: "", style: hud(26, C.amber, true) });
  transCard.anchor.set(0.5);
  // THE INCOMING MOVE, NAMED (s.tellStyle) with its chain length beside it in
  // pips (s.comboLeft), and the pierce warning (s.tellPierce) that tells the
  // pilot their shell is not an answer to this one.
  const styleWord = new Text({ text: "", style: hud(11, C.amber, true) });
  styleWord.anchor.set(0.5);
  styleWord.visible = false;
  const comboPips = new Graphics();
  const pierceT = new Text({ text: "GUARD WILL NOT HOLD", style: hud(8.5, C.violet, true) });
  pierceT.anchor.set(0.5);
  pierceT.visible = false;
  hudLayer.addChild(oppName, youName, oppHpG, youHpG, stamG, boutLabel, clock, scoreT, zonesHint, styleWord, comboPips, pierceT, transCard);

  // ── first-run teaching card (bout 1 only, dismissed by the first input) ───
  const teach = new Container();
  const teachBg = new Graphics();
  const teachStyle = () =>
    new TextStyle({ fontFamily: "Segoe UI, system-ui, sans-serif", fontSize: 8.5, fill: C.text, fontWeight: "700", letterSpacing: 0.3 });
  const teach1 = new Text({ text: "AMBER RING = DODGE NOW: tap a side or A/D", style: teachStyle() });
  const teach2 = new Text({ text: "Guard: hold the low strip or S (hooks and uppercuts pierce it)", style: teachStyle() });
  const teach3 = new Text({ text: "He staggers? W taps jab, hold SPACE = haymaker", style: teachStyle() });
  for (const t of [teach1, teach2, teach3]) t.anchor.set(0.5);
  teach.addChild(teachBg, teach1, teach2, teach3);
  teach.visible = false;
  hudLayer.addChild(teach);

  // ── presentation memory (page-side only, never sim) ───────────────────────
  const mem = {
    prevLanded: 0,
    prevEaten: 0,
    prevDodged: 0,
    prevBout: 0,
    swingT: 0, // frames of the strike lunge
    punchT: 0, // frames of the player jab lunge
    punchSide: 1,
    prevThrown: 0,
    heavy: false,
    sparkT: 0,
    shakeT: 0,
    dodgeLean: 0,
    lastSimW: 0,
    // dodge feedback + first-run teaching (page-side only, never sim)
    prevDodgeF: 0,
    dodgeGot: true,
    ghostT: 0,
    ghostSide: 0,
    flashT: 0,
    whiffT: 0,
    taught: false,
    // a punch that found air (the sidestep itself needs no memory: the sim
    // publishes its own animation frames in s.slipF / s.slipDir)
    prevWhiffs: 0,
    missT: 0,
    missX: 0,
    // what was winding up last frame, so the resolve can animate the right
    // thing (a block has no counter of its own; a feint never arrives)
    prevTell: false,
    tellWas: "" as StrikeStyle | "",
  };

  // The vector pit is the FALLBACK set now: its spotlights and floor ellipse
  // are the painted plate's own features, so drawing both double-exposes the
  // arena. With bg-pit.webp up, only the thin apron line survives to seat the
  // fighters on the platform.
  const layoutStatics = (k: number, simW: number, simH: number) => {
    void simH;
    bgG.clear();
    if (!bgArt) {
      // spotlights
      bgG.poly([110 * k, 0, 60 * k, 300 * k, 200 * k, 300 * k, 150 * k, 0]).fill({ color: 0xc8dcff, alpha: 0.06 });
      bgG.poly([250 * k, 0, 180 * k, 300 * k, 320 * k, 300 * k, 290 * k, 0]).fill({ color: 0xc8dcff, alpha: 0.06 });
      // floor
      bgG.ellipse(simW / 2, 392 * k, 200 * k, 86 * k).fill(C.floor).stroke({ width: 2, color: 0x232b42 });
    }
    bgG.rect(0, 330 * k, simW, 3 * k).fill({ color: 0x1a2136, alpha: bgArt ? 0.5 : 1 });
  };
  // the plate lands after the first resize, so re-lay the statics once it does
  const onArtLanded = () => {
    if (mem.lastSimW > 0) layoutStatics(mem.lastSimW / 360, mem.lastSimW, bgDims.h);
  };

  return {
    resize(cssW, cssH, dpr, simW, simH) {
      stage.resize(cssW, cssH, dpr, simW, simH);
      const k = simW / 360;
      if (mem.lastSimW !== simW) {
        mem.lastSimW = simW;
        bgDims.w = simW;
        bgDims.h = simH;
        fitBgArt();
        layoutStatics(k, simW, simH);
      }
    },
    destroy() {
      stage.destroy();
    },
    render(s: IronjawState, view: ShellView) {
      const k = s.k;
      const cx = s.W / 2;

      // ── deltas -> fx triggers ───────────────────────────────────────────
      if (s.eaten > mem.prevEaten) {
        mem.shakeT = 14;
        mem.swingT = 8;
      }
      // a dodge ATTEMPT started (dodgeF rising edge): ghosts peel off the rig
      if (s.dodgeF > mem.prevDodgeF) {
        mem.ghostT = 10;
        mem.ghostSide = s.dodgeSide === "L" ? -1 : 1;
        mem.dodgeGot = false;
      }
      if (s.dodged > mem.prevDodged) {
        mem.swingT = 8; // the whiff sails past
        mem.flashT = 10; // cyan: the dodge WORKED
        mem.dodgeGot = true;
      }
      // the i-frame window closed with nothing dodged: grey puff, it whiffed
      if (mem.prevDodgeF > 0 && s.dodgeF === 0 && !mem.dodgeGot) {
        mem.whiffT = 9;
        mem.dodgeGot = true;
      }
      mem.prevDodgeF = s.dodgeF;
      // EVERY THROW ANIMATES, not only the ones that land. Driving this off
      // `s.landed` meant a swing into a guard produced nothing at all and the
      // hand never alternated, so the game read as "tap tap tap" with a fist
      // that only ever moved on the right (Mike, 2026-08-14).
      if (s.thrown > mem.prevThrown) {
        mem.heavy = s.lastThrow === "heavy";
        mem.punchT = mem.heavy ? 11 : 7;
        mem.punchSide = -mem.punchSide;
      }
      if (s.landed > mem.prevLanded) {
        mem.sparkT = mem.heavy ? 13 : 9;
        if (mem.heavy) mem.shakeT = Math.max(mem.shakeT, 8);
      }
      // A WHIFF IS A RESULT TOO (s.whiffs): the word pops where the machine is
      // standing, so a swing at a machine that was not open reads as a miss
      // rather than as an input the game threw away.
      if (s.whiffs > mem.prevWhiffs) {
        mem.missT = 13;
        mem.missX = s.oppX;
      }
      mem.prevWhiffs = s.whiffs;
      mem.prevThrown = s.thrown;
      mem.prevEaten = s.eaten;
      mem.prevDodged = s.dodged;
      mem.prevLanded = s.landed;
      if (mem.swingT > 0) mem.swingT--;
      if (mem.punchT > 0) mem.punchT--;
      if (mem.sparkT > 0) mem.sparkT--;
      if (mem.shakeT > 0) mem.shakeT--;
      if (mem.ghostT > 0) mem.ghostT--;
      if (mem.flashT > 0) mem.flashT--;
      if (mem.whiffT > 0) mem.whiffT--;
      if (mem.missT > 0) mem.missT--;

      // camera shake
      const shake = mem.shakeT > 0 ? (mem.shakeT % 2 === 0 ? 3 : -3) * k : 0;
      W.pivot.set(-shake, 0);

      // ── opponent ────────────────────────────────────────────────────────
      const def = OPPONENTS[s.oppKey];
      const inTell = s.oppPhase === "tell";
      const inVuln = s.oppPhase === "vuln";
      // THE STYLE IS THE READ (s.tellStyle), not the dodge requirement. The
      // requirement still drives the chevrons and the arc; the colour, the
      // shape, the word and the pierce warning all come off the style.
      const style: StrikeStyle | "" = s.tellStyle;
      const art3 = style ? STYLE_ART[style] : null;
      const isFeint = style === "feint";
      // A BLOCKED STRIKE STILL COMES OUT. The swing animation used to fire off
      // the eaten/dodged counters only, so a strike stopped by the shell
      // resolved with the arm still cocked. Fire it on the tell ENDING instead,
      // and never for a feint, which by definition never arrives.
      if (inTell) mem.tellWas = style;
      if (mem.prevTell && !inTell) {
        if (mem.tellWas !== "feint") mem.swingT = 8;
        mem.tellWas = "";
      }
      mem.prevTell = inTell;
      // gait: a live fighter, not a statue - bob + horizontal sway, THE SIM'S
      // OWN LATERAL OFFSET (s.oppX: the drift and the slip, the thing that
      // makes the machine work the floor instead of standing on a spot), and
      // the WHOLE sprite lunges at you on the strike frame.
      const bob = Math.sin(s.t * 4.4) * 7 * k;
      const sway = Math.sin(s.t * 2.2) * 4 * k;
      const bodyLunge = mem.swingT > 0 ? mem.swingT / 8 : 0;
      const oppScreenX = cx + sway + s.oppX * k;
      opp.position.set(oppScreenX, 190 * k + bob + bodyLunge * 26 * k);
      opp.rotation = inVuln ? -0.09 : s.slipF > 0 ? s.slipDir * 0.06 : 0;

      // THE SIDESTEP, VISIBLE (s.slipF / s.slipDir): streaks left behind on the
      // side it came from, so a slipped mash reads as the machine moving.
      slipTrail.clear();
      if (s.slipF > 0) {
        const sa = Math.min(1, s.slipF / 10);
        for (let i = 1; i <= 3; i++) {
          const tx = oppScreenX - s.slipDir * i * 13 * k;
          slipTrail
            .roundRect(tx - 26 * k, 150 * k, 52 * k, 120 * k, 10 * k)
            .stroke({ width: 1.5 * k, color: C.cyan, alpha: sa * (0.22 - i * 0.05) });
        }
      }

      // painted machine, when its render has landed: bottom-anchored on the
      // vector rig's own foot line so every opponent stands at one height,
      // width-locked so k88 looms by its own art, not by a scale hack.
      const art = oppArt[s.oppKey] ?? null;
      for (const key of Object.keys(oppArt)) {
        const sp = oppArt[key];
        if (sp) sp.visible = key === s.oppKey;
      }
      if (art && art.texture.width > 0) {
        const wanted = 178 * k;
        art.scale.set(wanted / art.texture.width);
        art.position.set(0, 130 * k);
        // vuln = the opening: the machine flashes amber instead of the vector
        // stroke doing it; the tell tint follows the STYLE, so a hook does not
        // wear a jab's face.
        const styleTint: Record<StrikeStyle, number> = {
          jab: 0xffe3b8,
          hook: 0xffc9c0,
          uppercut: 0xdcc8ff,
          combo: 0xffedc8,
          feint: 0xc4ccd8,
        };
        art.tint = inVuln ? 0xffd08a : style ? styleTint[style] : 0xffffff;
      }
      const vectorBody = !art;
      oppBody.visible = vectorBody;
      armGuard.visible = vectorBody;

      oppBody.clear();
      if (!vectorBody) {
        armGuard.clear();
      } else {
      // legs + hips
      oppBody.roundRect(-38 * k, 78 * k, 30 * k, 52 * k, 8 * k).fill(0x232837);
      oppBody.roundRect(10 * k, 78 * k, 30 * k, 52 * k, 8 * k).fill(0x232837);
      oppBody.roundRect(-43 * k, 56 * k, 86 * k, 34 * k, 10 * k).fill(C.steelDark);
      // torso
      oppBody.poly([-61 * k, -40 * k, 61 * k, -40 * k, 47 * k, 62 * k, -47 * k, 62 * k]).fill(C.steel).stroke({ width: 2, color: inVuln ? C.amber : C.steelHi });
      // core
      oppBody.circle(0, 22 * k, 16 * k).fill(0x20263a).stroke({ width: 2, color: 0x4d283a });
      oppBody.circle(0, 22 * k, 6 * k).fill(C.red);
      // head + eye
      oppBody.roundRect(-24 * k, -88 * k, 48 * k, 42 * k, 10 * k).fill(C.steelDark).stroke({ width: 2, color: C.steelHi });
      oppBody.roundRect(-16 * k, -72 * k, 32 * k, 8 * k, 4 * k).fill(inTell ? C.red : 0xb8402f);
      // shoulders
      oppBody.poly([-77 * k, -42 * k, -51 * k, -58 * k, -35 * k, -32 * k, -65 * k, -20 * k]).fill(C.steelHi);
      oppBody.poly([77 * k, -42 * k, 51 * k, -58 * k, 35 * k, -32 * k, 65 * k, -20 * k]).fill(C.steelHi);

      // guard arm (static-ish, screen right)
      armGuard.clear();
      armGuard.moveTo(61 * k, -22 * k).bezierCurveTo(85 * k, -8 * k, 87 * k, 24 * k, 77 * k, 48 * k).stroke({ width: 20 * k, color: C.steel, cap: "round" });
      armGuard.circle(71 * k, 58 * k, 19 * k).fill(C.steelHi).stroke({ width: 2, color: C.steelHi });
      }

      // the striking arm: cocks back through the tell, whips in on the swing
      const st = def.pattern[s.patIdx % def.pattern.length];
      // THE SIM PUBLISHES THE TELL LENGTH (s.tellTotalF) precisely so this
      // file does not recompute it. The old recompute used the strike's OUTER
      // tellF for every link of a chain, so links 2..n (which wind on the
      // tighter innerTellF) drew a ring that never filled. The floor below is
      // only the out-of-tell fallback.
      const tellTotal = s.tellTotalF > 0 ? s.tellTotalF : Math.max(TELL_FLOOR_F, Math.round(st.tellF * s.oppGapMul));
      const tellFrac = inTell ? 1 - s.phaseF / tellTotal : 0;
      // WHICH ARM (ladders.ts `hand`), NOT which dodge side. Deriving this from
      // s.tellSide meant 18 of 19 strikes plus every idle frame drew the same
      // arm on the same side: "every punch is to the right always" (Mike).
      const arm = armSide(st, s.comboI);
      const lunge = mem.swingT > 0 ? (8 - mem.swingT) / 8 : 0;
      const cock = inTell ? tellFrac : 0;
      armSwing.position.set(0, 0);
      // rest -> cocked -> thrown at the camera (down-screen, and bigger)
      const restX = arm * 61 * k;
      const cockX = arm * (61 + cock * 34) * k;
      const fx = cockX + (restX * 0.5 - cockX) * lunge;
      const fy = (44 + cock * 26) * k + lunge * 74 * k;
      const fistRad = (19 + cock * 5 + lunge * 13) * k; // (fistR is the player's gauntlet)
      const tellC = art3 ? art3.tell : C.amber;
      const tellDeep = art3 ? art3.deep : 0x7e5a22;
      // THE VECTOR LIMB IS A FALLBACK, and only a fallback. Layered over a
      // painted machine it drew a 20px bar with a 19px ball hanging in front
      // of the sprite even at rest: Mike's "weird line with a dot". The tell
      // glow below keeps drawing either way, because that is the gameplay
      // signal and it has to be procedural and crisp.
      swingG.visible = vectorBody;
      swingG.clear();
      if (vectorBody) {
        swingG
          .moveTo(arm * 61 * k, -22 * k)
          .bezierCurveTo(arm * 95 * k, -14 * k + cock * 10 * k, fx + arm * 18 * k, fy - 24 * k, fx, fy)
          .stroke({ width: 20 * k, color: C.steel, cap: "round" });
        swingG.circle(fx, fy, fistRad).fill(inTell ? tellDeep : C.steelHi).stroke({ width: 3, color: inTell ? tellC : C.steelHi });
      }
      tellGlow.clear();
      if (inTell) {
        // over a painted machine the glow IS the fist: a filled core so the
        // wind-up has a body to read even with no vector arm under it
        if (!vectorBody) {
          tellGlow.circle(fx, fy, fistRad).fill({ color: tellDeep, alpha: 0.9 }).stroke({ width: 3, color: tellC });
        }
        tellGlow.circle(fx, fy, (30 + tellFrac * 16) * k).fill({ color: tellC, alpha: 0.1 + tellFrac * 0.16 });
        tellGlow.circle(fx, fy, (24 + tellFrac * 8) * k).stroke({ width: 3, color: tellC, alpha: 0.35 + tellFrac * 0.4 });
        // ── the per-style SHAPE, so the five styles are not five tints of one
        // picture ────────────────────────────────────────────────────────────
        if (style === "uppercut") {
          // it comes from underneath: a rising arrow under the cocked fist
          const ry = fy + (26 + tellFrac * 10) * k;
          tellGlow
            .moveTo(fx - 13 * k, ry)
            .lineTo(fx, ry - 17 * k)
            .lineTo(fx + 13 * k, ry)
            .stroke({ width: 4 * k, color: C.violet, alpha: 0.5 + tellFrac * 0.5, cap: "round", join: "round" });
        } else if (style === "hook") {
          // it comes around: an arc sweeping toward the side you must vacate
          const dir = s.tellSide === "L" ? -1 : 1;
          const a0h = dir > 0 ? -Math.PI * 0.85 : -Math.PI * 0.15;
          tellGlow
            .arc(fx, fy, (44 + tellFrac * 10) * k, a0h, a0h + dir * Math.PI * 0.75, dir < 0)
            .stroke({ width: 5 * k, color: C.red, alpha: 0.35 + tellFrac * 0.5, cap: "round" });
        } else if (style === "combo") {
          // the chain, drawn as the links still to come
          for (let i = 0; i < Math.max(1, s.comboLeft); i++) {
            tellGlow
              .circle(fx - arm * (34 + i * 13) * k, fy - 30 * k, 4 * k)
              .fill({ color: i === 0 ? C.amberHi : C.amber, alpha: i === 0 ? 0.95 : 0.5 });
          }
        }
        // THE DODGE WINDOW: an arc around the cocked fist fills across the
        // tell and flips AMBER exactly when the sim's legal window opens
        // (s.phaseF <= s.dodgeWinF), so "dodge NOW" is on screen, not felt out.
        // A FEINT NEVER LIGHTS IT. It resolves into nothing, so promising a
        // window it cannot pay is what made a feint pixel-identical to a jab.
        if (!isFeint) {
          const winOpen = s.phaseF <= s.dodgeWinF;
          const arcR = (34 + tellFrac * 6) * k;
          const a0 = -Math.PI / 2;
          tellGlow
            .arc(fx, fy, arcR, a0, a0 + Math.PI * 2 * Math.min(1, Math.max(0, tellFrac)))
            .stroke({ width: 4 * k, color: winOpen ? C.amber : 0x6b7a8f, alpha: winOpen ? 0.95 : 0.55 });
          if (winOpen) {
            tellGlow.circle(fx, fy, arcR + 5 * k).stroke({ width: 1.5 * k, color: C.amberHi, alpha: 0.45 + 0.35 * Math.sin(s.t * 20) });
          }
        } else {
          // the bluff: a broken ring that never closes and never turns amber
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            tellGlow
              .arc(fx, fy, 34 * k, a, a + Math.PI / 7)
              .stroke({ width: 3 * k, color: C.slate, alpha: 0.4 });
          }
        }
      }
      // SPECIAL chevrons: pulse in the dodge zone the pilot must move TO
      chevronG.clear();
      if (inTell && (s.tellSide === "L" || s.tellSide === "R")) {
        const dir = s.tellSide === "L" ? -1 : 1;
        const bx2 = s.tellSide === "L" ? 54 * k : 306 * k;
        const pulse = 0.5 + 0.5 * Math.sin(s.t * 12);
        for (let i = 0; i < 3; i++) {
          const x = bx2 + dir * i * 15 * k;
          const a = (0.3 + 0.55 * pulse) * (1 - i * 0.24);
          chevronG
            .moveTo(x - dir * 9 * k, 232 * k)
            .lineTo(x + dir * 5 * k, 248 * k)
            .lineTo(x - dir * 9 * k, 264 * k)
            .stroke({ width: 3.5 * k, color: C.red, alpha: a, cap: "round", join: "round" });
        }
      }
      // bang + vuln flash geometry derive from the SPRITE bounds (painted or
      // vector), so the painted machines flash around their own bodies rather
      // than the old vector torso's
      const artH = art && art.texture.width > 0 ? ((178 * k) / art.texture.width) * art.texture.height : 0;
      const bTop = artH > 0 ? 130 * k - artH : -88 * k; // art anchors (0.5, 1) at y = 130k
      const bBot = artH > 0 ? 130 * k : 64 * k;
      const bHalfW = artH > 0 ? 89 * k : 63 * k;
      // the "!" is the HERE IT COMES cue, so a feint never earns one
      bang.visible = inTell && !isFeint && s.phaseF <= tellTotal * 0.55;
      bang.style.fill = tellC;
      bang.position.set(0, bTop - 14 * k);
      oppFlash.clear();
      if (inVuln && Math.floor(s.t * 8) % 2 === 0) {
        if (artH > 0) {
          oppFlash.roundRect(-bHalfW, bTop, bHalfW * 2, bBot - bTop, 12 * k).stroke({ width: 3, color: C.amber, alpha: 0.85 });
        } else {
          oppFlash.poly([-63 * k, -42 * k, 63 * k, -42 * k, 49 * k, 64 * k, -49 * k, 64 * k]).stroke({ width: 3, color: C.amber, alpha: 0.85 });
        }
      }

      // ── player ──────────────────────────────────────────────────────────
      // YOUR LEAN IS SIM STATE (s.pxOff), painted straight: the renderer used
      // to ease its own private copy toward its own private amplitude, so the
      // picture and the state agreed only by luck. Scaled up a touch because
      // 34 design px reads small on a phone; the sign and the timing are the
      // sim's, exactly.
      const lean = s.pxOff * 1.6 * k;
      mem.dodgeLean = lean;
      player.position.set(cx + lean, 0);
      const painted = !!fistArtR;
      playerG.clear();
      playerG.poly([-84 * k, s.H, -62 * k, 386 * k, 62 * k, 386 * k, 84 * k, s.H]).fill(0x171b28).stroke({ width: 2.5, color: C.amber });
      // THE COCKPIT BLOCK IS A FALLBACK TOO. Ungated it drew a grey slab one
      // pixel off the painted gauntlets (Mike's "grey rectangle between the
      // gauntlets"); with the render up, the gauntlets are the rig.
      if (!painted) {
        playerG.roundRect(-28 * k, 356 * k, 56 * k, 40 * k, 9 * k).fill(0x1c2131).stroke({ width: 2, color: C.amber });
        playerG.roundRect(-14 * k, 366 * k, 28 * k, 7 * k, 3.5 * k).fill({ color: C.amber, alpha: 0.8 });
      }
      const guardLift = s.guarding ? -16 * k : 0;
      const chargeFrac = s.charging ? Math.min(1, s.chargeF / HEAVY_CHARGE_F) : 0;
      // ── THE GROWING FIST (2026-08-15, Mike round 5: "wish there was more of
      // a graphic for a punch than just the circle and line. Maybe a growing
      // fist?"). Punch-Out grammar: the punching gauntlet flies INTO the scene
      // at the machine and SCALES UP as it travels away from the camera - a
      // jab peaks at 1.9x across 62% of the distance to the hit point, the
      // haymaker at 2.6x across 78% (further, and slower: 11 frames vs 7),
      // and both snap back to guard on the recovery frame exactly as before.
      // The target is the machine's own hit-spark point, so the fist flies at
      // where the blow will land; the non-punching hand never leaves guard.
      // Timing is the existing thrown-delta ramp (mem.punchT), nothing new.
      const punchDur = mem.heavy ? 11 : 7;
      const punch = mem.punchT > 0 ? (punchDur - mem.punchT) / punchDur : 0;
      const punchEase = punch * (2 - punch); // fast launch, peak on the hit frame
      const travelFrac = mem.heavy ? 0.78 : 0.62;
      const fistScaleMul = 1 + ((mem.heavy ? 2.6 : 1.9) - 1) * punchEase;
      const guardX = mem.punchSide * 58 * k;
      const guardY = 404 * k + guardLift;
      // the machine's body in PLAYER-LOCAL coords (this container sits at
      // cx + lean); matches the hit spark at (oppScreenX + side * 14, 210)
      const tgtX = oppScreenX + mem.punchSide * 14 * k - (cx + lean);
      const tgtY = 210 * k;
      const travX = guardX + (tgtX - guardX) * travelFrac * punchEase;
      const travY = guardY + (tgtY - guardY) * travelFrac * punchEase;
      const punching = punch > 0;
      const fistLX = punching && mem.punchSide < 0 ? travX : -58 * k;
      const fistRX = punching && mem.punchSide > 0 ? travX : 58 * k;
      const fistLY = punching && mem.punchSide < 0 ? travY : 404 * k + guardLift;
      const fistRY = punching && mem.punchSide > 0 ? travY : 404 * k + guardLift;
      fistL.clear();
      fistR.clear();
      // motion streaks trail the traveling fist along its own line of flight,
      // and the peak frames ring it with a brief impact flash (the dodge-flash
      // idiom, in the amber family). Both draw into the punching hand's own
      // Graphics, which sits UNDER the gauntlet art, so the streaks read as
      // BEHIND the fist. The haymaker throws one streak more, thicker, longer.
      if (punching) {
        const pg = mem.punchSide < 0 ? fistL : fistR;
        const dxT = tgtX - guardX;
        const dyT = tgtY - guardY;
        const dlT = Math.hypot(dxT, dyT) || 1;
        const ux = dxT / dlT;
        const uy = dyT / dlT;
        const nStreaks = mem.heavy ? 3 : 2;
        const streakW = (mem.heavy ? 5 : 3) * k;
        const tail = (mem.heavy ? 52 : 34) * k * (0.35 + punchEase * 0.65);
        const gapB = 20 * k * fistScaleMul; // start just behind the fist's edge
        for (let i = 0; i < nStreaks; i++) {
          const off = (i - (nStreaks - 1) / 2) * 15 * k;
          const px2 = -uy * off;
          const py2 = ux * off;
          pg.moveTo(travX + px2 - ux * gapB, travY + py2 - uy * gapB)
            .lineTo(travX + px2 - ux * (gapB + tail), travY + py2 - uy * (gapB + tail))
            .stroke({ width: streakW, color: i === 0 ? C.amberHi : C.amber, alpha: (0.55 - i * 0.14) * punchEase, cap: "round" });
        }
        const ringT = (punch - 0.7) / 0.3;
        if (ringT > 0) {
          pg.circle(travX, travY, (24 * fistScaleMul + ringT * (mem.heavy ? 34 : 24)) * k)
            .stroke({ width: (mem.heavy ? 4 : 3) * k, color: C.amberHi, alpha: 0.9 - ringT * 0.55 });
        }
      }
      if (!painted) {
        // no-art build: the vector fist itself is the growing circle
        fistL.circle(fistLX, fistLY, 21 * k * (punching && mem.punchSide < 0 ? fistScaleMul : 1)).fill(0x232837).stroke({ width: 2.5, color: chargeFrac > 0 ? C.amberHi : C.amber });
        fistR.circle(fistRX, fistRY, 21 * k * (punching && mem.punchSide > 0 ? fistScaleMul : 1)).fill(0x232837).stroke({ width: 2.5, color: chargeFrac > 0 ? C.amberHi : C.amber });
      } else {
        // the gauntlets sit ON the same points the vector fists used, sized to
        // the same 21px radius at rest, so every existing beat (guard lift,
        // charge ring) drives the art with no new timing of its own; only the
        // punching hand carries the travel and the scale
        const fw = 62 * k;
        for (const [sp, x, y, mul] of [
          [fistArtL, fistLX, fistLY, punching && mem.punchSide < 0 ? fistScaleMul : 1],
          [fistArtR, fistRX, fistRY, punching && mem.punchSide > 0 ? fistScaleMul : 1],
        ] as const) {
          if (!sp || sp.texture.width <= 0) continue;
          const base = (fw / sp.texture.width) * mul;
          sp.scale.set(base * (sp === fistArtL ? -1 : 1), base);
          sp.position.set(x, y);
          sp.tint = chargeFrac > 0 ? 0xffe6b0 : 0xffffff;
        }
      }
      if (chargeFrac > 0) {
        fistR.circle(58 * k, 404 * k + guardLift, (24 + chargeFrac * 14) * k).stroke({ width: 3, color: C.amber, alpha: 0.25 + chargeFrac * 0.5 });
        // THE HAYMAKER HAS TO ANNOUNCE ITSELF (Mike: "the hold for the
        // haymaker doesn't seem to work or I can't tell it works"). Both
        // gauntlets wind, the ring closes, and at full charge the word says so.
        fistL.circle(-58 * k, 404 * k + guardLift, (24 + chargeFrac * 14) * k).stroke({ width: 3, color: C.amber, alpha: 0.25 + chargeFrac * 0.5 });
        const ready = chargeFrac >= 1;
        chargeRing.clear();
        // it closes on YOUR RIG, which stands at cx + the lean. chargeRing is
        // parented to the world, not to the player container, so the old (0, y)
        // drew this ring half off the left edge of the arena.
        chargeRing
          .circle(cx + lean, 404 * k + guardLift, (86 - chargeFrac * 40) * k)
          .stroke({ width: ready ? 5 : 3, color: ready ? C.amberHi : C.amber, alpha: 0.25 + chargeFrac * 0.6 });
        chargeText.text = ready ? "HAYMAKER READY" : "CHARGING";
        chargeText.style.fill = ready ? C.amberHi : C.dim;
        chargeText.position.set(cx - chargeText.width / 2, 336 * k);
        chargeText.visible = true;
      } else {
        chargeRing.clear();
        chargeText.visible = false;
      }
      if (s.guarding) {
        playerG.arc(0, 396 * k, 74 * k, Math.PI * 1.15, Math.PI * 1.85).stroke({ width: 4 * k, color: 0x58d6f2, alpha: 0.7 });
      }

      // ── dodge feedback: ghost silhouettes on the attempt, a cyan flash
      // when it WORKED, a grey puff when it whiffed (page-side only) ───────
      ghostG.clear();
      if (mem.ghostT > 0) {
        const ga = mem.ghostT / 10;
        for (let i = 1; i <= 3; i++) {
          const a = ga * (0.3 - i * 0.07);
          if (a <= 0) continue;
          const gx = cx + mem.dodgeLean * (1 - i * 0.28);
          ghostG
            .poly([gx - 84 * k, s.H, gx - 62 * k, 386 * k, gx + 62 * k, 386 * k, gx + 84 * k, s.H])
            .stroke({ width: 2 * k, color: 0x58d6f2, alpha: a });
        }
      }
      dodgeFx.clear();
      if (mem.flashT > 0) {
        const fa = mem.flashT / 10;
        dodgeFx
          .circle(cx + mem.dodgeLean, 398 * k, (28 + (1 - fa) * 46) * k)
          .stroke({ width: 4 * k, color: 0x58d6f2, alpha: fa * 0.9 });
      }
      if (mem.whiffT > 0) {
        const wa = mem.whiffT / 9;
        const wx = cx + mem.dodgeLean + mem.ghostSide * 46 * k;
        dodgeFx.circle(wx, 402 * k, (9 + (1 - wa) * 16) * k).fill({ color: 0x6b7a8f, alpha: wa * 0.3 });
        dodgeFx.circle(wx + 10 * k, 394 * k, (6 + (1 - wa) * 10) * k).fill({ color: 0x6b7a8f, alpha: wa * 0.22 });
      }

      // hit spark ON THE MACHINE (which is not at centre any more: s.oppX)
      spark.clear();
      if (mem.sparkT > 0) {
        const a = mem.sparkT / 9;
        const sy = 210 * k;
        spark.star(oppScreenX + mem.punchSide * 14 * k, sy, 6, 16 * k * a + 6 * k, 5 * k).fill({ color: 0xffd23e, alpha: 0.5 + a * 0.5 });
      }
      // ...and the miss, where the machine was standing when the swing sailed
      if (mem.missT > 0) {
        const ma = mem.missT / 13;
        missT.visible = true;
        missT.alpha = ma;
        missT.scale.set(k);
        missT.position.set(cx + mem.missX * k, (250 - (1 - ma) * 22) * k);
      } else {
        missT.visible = false;
      }
      // damage vignette
      vignette.clear();
      if (mem.shakeT > 0) {
        vignette.rect(0, 0, s.W, s.H).stroke({ width: 14 * k, color: C.red, alpha: mem.shakeT / 24 });
      }

      // ── HUD ─────────────────────────────────────────────────────────────
      oppName.text = def.name;
      oppName.position.set(14 * k, 10 * k);
      bar(oppHpG, 14 * k, 25 * k, 150 * k, 9 * k, s.oppHp / s.oppHpMax, C.red);
      youName.position.set(s.W - 14 * k - youName.width, 10 * k);
      bar(youHpG, s.W - 164 * k, 25 * k, 150 * k, 9 * k, s.hp / s.hpMax, C.amber);
      stamG.clear();
      for (let i = 0; i < 5; i++) {
        const px = s.W - 164 * k + i * 14 * k + 4 * k;
        if (i < s.stamina) stamG.circle(px, 44 * k, 3.6 * k).fill(C.amber);
        else stamG.circle(px, 44 * k, 3.6 * k).stroke({ width: 1.4, color: 0x3a3124 });
      }
      boutLabel.text = s.bout <= 2 ? `BOUT ${s.bout + 1}/3` : `DEFENSE ${s.bout - 2}`;
      boutLabel.position.set(cx - boutLabel.width / 2, 46 * k);
      // ── THE INCOMING MOVE, NAMED. The sim has published tellStyle,
      // comboLeft and tellPierce all along and nothing on screen read them,
      // which is why five authored styles played as one punch. ──────────────
      styleWord.visible = inTell && !!art3;
      comboPips.clear();
      if (inTell && art3) {
        styleWord.text = art3.word;
        styleWord.style.fill = tellC;
        styleWord.scale.set(k);
        styleWord.position.set(cx, 74 * k);
        // the chain length, in pips beside the word (s.comboLeft counts this
        // link and the ones still to come)
        if (s.comboLeft > 1) {
          const pw = styleWord.width / 2;
          for (let i = 0; i < s.comboLeft; i++) {
            comboPips
              .circle(cx + pw + (8 + i * 9) * k, 74 * k, 3 * k)
              .fill({ color: i === 0 ? C.amberHi : C.amber, alpha: i === 0 ? 1 : 0.55 });
          }
        }
      }
      // THE SHELL IS NOT AN ANSWER TO THIS ONE (s.tellPierce). A hook or an
      // uppercut goes straight through a guard, and a pilot holding one had no
      // way to know until it hit them.
      pierceT.visible = inTell && s.tellPierce;
      if (pierceT.visible) {
        pierceT.style.fill = tellC;
        pierceT.scale.set(k);
        pierceT.alpha = 0.65 + 0.35 * Math.sin(s.t * 12);
        // just above the apron line, clear of the charge caption at 336
        pierceT.position.set(cx, 322 * k);
      }
      clock.text = `${Math.max(0, Math.ceil(75 - s.boutT))}`;
      clock.position.set(cx - clock.width / 2, 12 * k);
      scoreT.text = `${ironjawScore(s)}`;
      scoreT.position.set(s.W - 14 * k - scoreT.width, 56 * k);
      zonesHint.position.set(cx - zonesHint.width / 2, s.H - 18 * k);
      zonesHint.alpha = s.t < 6 ? 1 : Math.max(0.35, 1 - (s.t - 6) * 0.2);
      if (s.phase === "transition") {
        transCard.visible = true;
        const next = s.bout + 1;
        transCard.text = next <= 2 ? `BOUT ${next + 1}` : `TITLE DEFENSE ${next - 2}`;
        transCard.position.set(cx, s.H * 0.42);
        transCard.alpha = 0.9;
        mem.prevBout = s.bout;
      } else {
        transCard.visible = false;
      }

      // ── first-run teaching: bout 1, before the pilot has touched anything;
      // the first input (pointer or key, read off the sim's own prev flags)
      // dismisses it for the rest of the run. Presentation only. ────────────
      if (
        !mem.taught &&
        (s.prevDown || s.guarding || s.charging || s.dodgeF > 0 || s.prevLeft || s.prevRight || s.prevUp || s.prevSpace)
      ) {
        mem.taught = true;
      }
      const teachOn = s.phase === "bout" && s.bout === 0 && !mem.taught && s.t < 20;
      teach.visible = teachOn;
      if (teachOn) {
        teach.position.set(cx, 302 * k);
        for (const t of [teach1, teach2, teach3]) t.scale.set(k);
        teachBg.clear();
        teachBg
          .roundRect(-168 * k, -34 * k, 336 * k, 68 * k, 9 * k)
          .fill({ color: 0x0c0e15, alpha: 0.82 })
          .stroke({ width: 1.5, color: 0x2c3550 });
        teach1.position.set(0, -19 * k);
        teach2.position.set(0, 0);
        teach3.position.set(0, 19 * k);
      }

      void view;
      stage.renderFrame();
    },
  };
}

const scene = (canvas: HTMLCanvasElement) => buildScene(canvas);

/** No-WebGL fallback: the whole fight in flat 2d vectors. Ugly on purpose,
 * playable by law (kit §4: ships playable before art, works without WebGL). */
function drawFallback(ctx: CanvasRenderingContext2D, s: IronjawState) {
  const k = s.k;
  const cx = s.W / 2;
  ctx.fillStyle = "#0c0e15";
  ctx.fillRect(0, 0, s.W, s.H);
  const def = OPPONENTS[s.oppKey];
  // the machine works the floor here too (s.oppX), or the flat build teaches a
  // fight that does not exist
  const ox = cx + s.oppX * k;
  ctx.fillStyle = s.oppPhase === "vuln" ? "#48536d" : "#333b4f";
  ctx.fillRect(ox - 60 * k, 110 * k, 120 * k, 150 * k);
  if (s.oppPhase === "tell" && s.tellStyle) {
    // same five-style code as the Pixi scene, in flat colour: a feint's ring
    // never lights and the pierce warning still shows
    const fill: Record<StrikeStyle, string> = {
      jab: "#ffb454",
      hook: "#ff5340",
      uppercut: "#b07cff",
      combo: "#ffd894",
      feint: "#8794aa",
    };
    const stf = def.pattern[s.patIdx % def.pattern.length];
    const arm = armSide(stf, s.comboI);
    ctx.fillStyle = fill[s.tellStyle];
    ctx.beginPath();
    ctx.arc(ox + arm * 90 * k, 240 * k, 22 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${11 * k}px system-ui`;
    ctx.fillText(
      `${s.tellStyle.toUpperCase()}${s.comboLeft > 1 ? ` x${s.comboLeft}` : ""}${s.tellPierce ? " (PIERCES GUARD)" : ""}`,
      12 * k,
      68 * k,
    );
    if (s.tellStyle !== "feint" && s.phaseF <= s.dodgeWinF) {
      ctx.fillText(`DODGE ${s.tellSide === "any" ? "EITHER WAY" : s.tellSide === "L" ? "LEFT" : "RIGHT"}`, 12 * k, 84 * k);
    }
  }
  ctx.fillStyle = "#171b28";
  ctx.strokeStyle = "#ffb454";
  ctx.lineWidth = 2;
  const lean = s.pxOff * 1.6 * k;
  ctx.fillRect(cx - 70 * k + lean, 380 * k, 140 * k, s.H - 380 * k);
  ctx.strokeRect(cx - 70 * k + lean, 380 * k, 140 * k, s.H - 380 * k);
  // THE GROWING FIST, flat build: same thrown-delta timing as the Pixi scene
  // (7/11 frame ramp off s.thrown / s.lastThrow), a circle that travels at
  // the machine and scales up (1.9x jab / 2.6x haymaker) with streaks behind.
  if (s.thrown > fbPunch.prevThrown) {
    fbPunch.heavy = s.lastThrow === "heavy";
    fbPunch.t = fbPunch.heavy ? 11 : 7;
    fbPunch.side = -fbPunch.side;
  }
  fbPunch.prevThrown = s.thrown;
  if (fbPunch.t > 0) fbPunch.t--;
  const fpd = fbPunch.heavy ? 11 : 7;
  const fp = fbPunch.t > 0 ? (fpd - fbPunch.t) / fpd : 0;
  if (fp > 0) {
    const fe = fp * (2 - fp);
    const tf = fbPunch.heavy ? 0.78 : 0.62;
    const gx = cx + lean + fbPunch.side * 46 * k;
    const gy = 402 * k;
    const tx = ox + fbPunch.side * 14 * k;
    const ty = 210 * k;
    const fx2 = gx + (tx - gx) * tf * fe;
    const fy2 = gy + (ty - gy) * tf * fe;
    const dl = Math.hypot(tx - gx, ty - gy) || 1;
    const ux = (tx - gx) / dl;
    const uy = (ty - gy) / dl;
    const rad = 16 * k * (1 + ((fbPunch.heavy ? 2.6 : 1.9) - 1) * fe);
    ctx.strokeStyle = "#ffb454";
    ctx.lineWidth = (fbPunch.heavy ? 4 : 2.5) * k;
    for (let i = 0; i < (fbPunch.heavy ? 3 : 2); i++) {
      const off = (i - (fbPunch.heavy ? 1 : 0.5)) * 12 * k;
      ctx.globalAlpha = Math.max(0, (0.5 - i * 0.12) * fe);
      ctx.beginPath();
      ctx.moveTo(fx2 - uy * off - ux * rad * 1.2, fy2 + ux * off - uy * rad * 1.2);
      ctx.lineTo(fx2 - uy * off - ux * (rad * 1.2 + 30 * k * fe), fy2 + ux * off - uy * (rad * 1.2 + 30 * k * fe));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffd894";
    ctx.strokeStyle = "#ffb454";
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.arc(fx2, fy2, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = "#c9d4e3";
  ctx.font = `${11 * k}px system-ui`;
  ctx.fillText(`${def.name}  HP ${Math.max(0, Math.ceil(s.oppHp))}/${s.oppHpMax}`, 12 * k, 20 * k);
  ctx.fillText(`YOU ${s.hp}/${s.hpMax}  STAM ${s.stamina}  ${s.bout <= 2 ? `BOUT ${s.bout + 1}/3` : `DEF ${s.bout - 2}`}  ${ironjawScore(s)}`, 12 * k, 36 * k);
}

export default function IronjawClient() {
  return (
    <RunShell<IronjawState>
      game="ironjaw"
      title="IRON JAW"
      accent="#ff5340"
      // PIN THE ARENA (2026-08-14, Mike: "not framed correct, I can only see
      // part of the screen"). Without worldSize the sim box takes the CSS box
      // dimensions, so `k = W/360` scaled everything horizontally while the
      // height stayed whatever the browser gave it: the design's lower band
      // (the player rig and its gauntlets at y 356-404 of 480) fell straight
      // off the bottom edge, and the opponent sat low and cropped. Pinned, the
      // sim is always 360x480 and the stage letterboxes it, exactly like
      // stopclock does.
      aspect={DESIGN_W / DESIGN_H}
      worldSize={() => ({ w: DESIGN_W, h: DESIGN_H })}
      createSim={(w, h, seed, reduced, stats) => {
        resetAudioPrev(); // per-run page state reset, per the RunShell contract
        resetFbPunch();
        return createIronjaw(w, h, seed, false, stats);
      }}
      step={(s, dt, input) => stepIronjaw(s, dt, input)}
      draw={(ctx, s) => drawFallback(ctx, s)}
      scene={scene}
      onFrame={ironjawAudio}
      sfxPack={["tap", "fire", "hit", "hurt", "ko"]}
      done={ironjawDone}
      score={ironjawScore}
      resultHeadline={(s) =>
        s.phase === "timeout"
          ? "THE CLOCK BEAT YOU"
          : s.bout <= 2
            ? `KO'D IN BOUT ${s.bout + 1}`
            : `FELL IN TITLE DEFENSE ${s.bout - 2}`
      }
      resultSub={(s) => `${s.dodged} dodges · ${s.landed} punches landed · ${s.eaten} taken`}
      shareBuild={(s, dayKey) => {
        const kos = Math.min(s.bout, 3);
        const defs = Math.max(0, s.bout - 3);
        const grid = `${"\u{1F94A}".repeat(kos)}${defs > 0 ? `⚔️×${defs}` : ""}\u{1F480}`;
        return {
          grid,
          payload: `IRON JAW ${dayKey} · ${ironjawScore(s)} pts · ${s.bout <= 2 ? `bout ${s.bout + 1}` : `defense ${s.bout - 2}`}\n${grid}\nlaunchwars.xyz/s6/games/ironjaw`,
        };
      }}
      intro={
        <div>
          <p style={{ margin: "0 0 8px" }}>
            The Warden&apos;s champions, one at a time, until you drop. Read the glowing wind-up and answer it:
          </p>
          <p style={{ margin: 0, opacity: 0.85 }}>
            TAP LEFT or RIGHT to dodge when the ring around his fist turns AMBER. Every machine throws five different
            things and the wind-up names them: amber JAB (either dodge, or guard), red HOOK (one side only, and it
            goes through your guard), violet UPPERCUT (either side, also pierces), amber COMBO with a pip per link,
            and a washed-out FEINT whose ring never lights, thrown to spend your dodge before the real one. TAP CENTER
            to jab an opening. HOLD CENTER for the haymaker. HOLD the LOW strip to guard. Punches cost stamina, so
            pick your windows. Three bouts take the belt, then the TITLE DEFENSES never stop coming.
          </p>
        </div>
      }
      strings={{
        scoreUnit: "",
        startIdle: "FIGHT",
        keyboardHint: "Keyboard: A/D or arrows to dodge, S to guard, W to jab, hold Space for the haymaker.",
      }}
    />
  );
}
