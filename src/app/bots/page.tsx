"use client";

/**
 * /bots: THE LANDING (screens doc 1 row 1, 7 row 0:00). The pit plate with a
 * fight replaying MUTED inside the lit frame, the headline, the one door
 * (connect, then play) and Watch a fight. Watching needs no wallet.
 *
 * THE THREE STEPS LIVE HERE (Mike, 2026-09-04). Come to this page, connect
 * the wallet, press Play. The list under the pit says exactly that in the
 * plainest words the game owns, and it is the real list: if a fourth step
 * ever appears in the product, this copy is the thing that has started
 * lying. Nothing on this page sends a new player to the Build screen or to
 * the strategy page before their first fight.
 *
 * WHICH FIGHT: the most recent public fight from GET /api/bots/battles when
 * that route is live, else the demo (seed 7, the T2 mirror), fail-soft on
 * anything else: a 404, a slow answer (2.5 s), an unreadable row, a build
 * that is not legal. Sparring rows are never shown (the guide: sparring is
 * private).
 *
 * THE PIT is the fight viewer's scene (_view/scene.ts) driven by the same
 * fixed-timestep loop the viewer runs (fight/FightClient.tsx: FIXED_DT,
 * MAX_SUBSTEPS, the hit-stop, the knockout slow motion, paused on
 * document.hidden), with no speaker, no controls and no commentary: after
 * the knockout it holds for a beat and starts over. prefers-reduced-motion
 * renders one settled frame at the end. The renderer decides nothing.
 *
 * A client page on purpose: the connect button and the canvas are both
 * client-only, and the metadata lives on the /bots layout.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useRef, useState } from "react";
import { useBotsSession } from "./battles/useBotsSession";
import { PageShell } from "./_components/PageShell";
import { uiCss } from "./_ui/primitives";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, M, R, TAP, type PaintId } from "./_ui/tokens";
import { buildFightScene, type FightSceneHandle } from "./_view/scene";
import { rigLookFromBuild } from "./_view/look-view";
import { SLOWMO_RATE, SLOWMO_S, TELL_F, mkFightFx, resetFightFx, tickFightFx } from "./_view/fightfx";
import { CANON } from "./_engine/catalog";
import { NO_ORDERS, isLegalBuild, isPaintId, type Build, type Mode, type Orders, type Side } from "./_engine/parts";
import { createFight, stepFight, type Fight } from "./_engine/resolve";
// type-only, as the file's own header allows for client components (erased at compile time)
import type { BattlesView, FightView } from "./_server/types";
import { STRINGS, fill } from "@/lib/bots/strings";
import css from "./fight/fight.module.css";

const t = STRINGS.en;
const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 8;
const KO_SLOW_FX = SLOWMO_S * SLOWMO_RATE;
/** presentation seconds after the knockout (or the time call) before the
 * pit starts the fight over: the slow motion, then three seconds on the
 * loser sitting */
const HOLD_FX = KO_SLOW_FX + 3;
const FETCH_MS = 2500;

/** React StrictMode dev-mounts effects twice; two app.init() calls racing on
 * ONE canvas kill each other's shaders (the Battlefield law). Every build AND
 * destroy is chained through this promise. */
let pixiChain: Promise<void> = Promise.resolve();

interface PitFight {
  seed: number;
  a: Build;
  b: Build;
  mode: Mode;
  /** the stored orders when the row carries them (a replay must use them) */
  orders?: [Orders, Orders];
  names: [string, string];
  paints: [PaintId, PaintId];
  recent: boolean;
}

/** the demo: the same fight /bots/fight/demo?seed=7&a=T2&b=T2 plays */
const DEMO: PitFight = {
  seed: 7,
  a: CANON.T2,
  b: CANON.T2,
  mode: "spar",
  // two ROBOT names, not the two reference fighters. "Barrel A against
  // Barrel B" was the first line a visitor read, and a barrel is not a robot.
  names: ["Speedy Otter", "Rusty Beetle"],
  paints: ["mint", "coral"],
  recent: false,
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function asBuild(v: unknown): Build | null {
  if (!isObj(v)) return null;
  try {
    return isLegalBuild(v as unknown as Build) ? (v as unknown as Build) : null;
  } catch {
    return null;
  }
}

function asOrders(v: unknown): Orders | null {
  if (!isObj(v)) return null;
  const st = v.stance;
  const fo = v.focus;
  if (st !== 0 && st !== 1 && st !== 2) return null;
  if (fo !== 0 && fo !== 1 && fo !== 2 && fo !== 3 && fo !== 4) return null;
  return { ...NO_ORDERS, stance: st, focus: fo };
}

/** One JSON GET with the shared deadline; null on anything but a 2xx. */
async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, cache: "no-store", credentials: "same-origin" });
  if (!res.ok) return null;
  return (await res.json()) as unknown;
}

/** A fight row (GET /api/bots/fight/[id], _server/types.ts FightView) as a
 * pit fight, or null. Every field is checked at runtime: the types are
 * lane A3's and may still move, and the pit must never throw.
 *
 * HANDOFF: the row also carries `looks`, both robots as they were at the bell
 * (the face, the sticker, the won hat and the earned marks). This page still
 * reads only the builds, so the landing pit shows the right COLOURS and a calm
 * face. Reading `looks` here needs a runtime check of its own, field by field,
 * the way every other field on this shape is checked. */
function fightOf(j: unknown): PitFight | null {
  if (!isObj(j)) return null;
  const row = j as Partial<FightView> & Record<string, unknown>;
  const seed = Number(row.seed);
  const a = asBuild(row.buildA);
  const b = asBuild(row.buildB);
  if (!Number.isFinite(seed) || !a || !b) return null;
  if (row.mode !== "pve" && row.mode !== "pvp") return null;
  const ids = Array.isArray(row.ids) ? row.ids : [];
  const names = Array.isArray(row.names) ? row.names : [];
  const name = (i: 0 | 1): string => {
    const v = names[i] ?? (isObj(ids[i]) ? (ids[i] as Record<string, unknown>).name : undefined);
    return typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : i === 0 ? "Bot A" : "Bot B";
  };
  const paint = (i: 0 | 1, fallback: PaintId): PaintId => {
    const v = isObj(ids[i]) ? (ids[i] as Record<string, unknown>).paint : undefined;
    return isPaintId(v) ? v : fallback;
  };
  const oa = Array.isArray(row.orders) ? asOrders(row.orders[0]) : null;
  const ob = Array.isArray(row.orders) ? asOrders(row.orders[1]) : null;
  return {
    seed: seed >>> 0,
    a,
    b,
    mode: row.mode,
    orders: oa && ob ? [oa, ob] : undefined,
    names: [name(0), name(1)],
    paints: [paint(0, "mint"), paint(1, "coral")],
    recent: true,
  };
}

/** The most recent public fight, in lane A3's two steps: GET /api/bots/battles
 * names it (live first, then recent; _server/types.ts BattlesView), and
 * GET /api/bots/fight/[id] carries the seed and both builds. One deadline
 * covers both requests. */
async function recentFight(): Promise<PitFight | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const shelf = (await getJson("/api/bots/battles", ctrl.signal)) as Partial<BattlesView> | null;
    if (!isObj(shelf)) return null;
    const rows: unknown[] = [...(Array.isArray(shelf.live) ? shelf.live : []), ...(Array.isArray(shelf.recent) ? shelf.recent : [])];
    const id = rows
      .map((r) => (isObj(r) && typeof r.id === "string" ? r.id : ""))
      .find((v) => /^[A-Za-z0-9_-]{1,80}$/.test(v));
    if (!id) return null;
    return fightOf(await getJson(`/api/bots/fight/${encodeURIComponent(id)}`, ctrl.signal));
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/* ── the pit ────────────────────────────────────────────────────────────── */

function LandingPit() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<FightSceneHandle | null>(null);
  const fightRef = useRef<Fight | null>(null);
  const fxRef = useRef(mkFightFx());
  const accRef = useRef(0);
  const lastRef = useRef(0);
  const [fight, setFight] = useState<PitFight | null>(null);
  const [ready, setReady] = useState(false);

  // 1. which fight: a recent public one when the route is live, else the demo
  useEffect(() => {
    let dead = false;
    recentFight().then((f) => {
      if (!dead) setFight(f ?? DEMO);
    });
    return () => {
      dead = true;
    };
  }, []);

  // 2. the pit: the viewer's scene and loop, muted, looping
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !fight) return;
    let dead = false;
    let raf = 0;
    let running = false;
    let ro: ResizeObserver | null = null;
    const isSmall = typeof matchMedia !== "undefined" && matchMedia("(max-width: 899px)").matches;
    const isReduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fx = fxRef.current;

    const restart = () => {
      const scene = sceneRef.current;
      scene?.reset();
      resetFightFx(fx);
      fightRef.current = createFight(fight.seed, fight.a, fight.b, fight.orders?.[0], fight.orders?.[1], fight.mode);
      accRef.current = 0;
    };

    /** one engine frame: new events go to the scene (never to a speaker) */
    const stepOnce = () => {
      const f = fightRef.current;
      const scene = sceneRef.current;
      if (!f || !scene) return;
      const before = f.st.log.length;
      if (!f.st.done) stepFight(f);
      for (let i = before; i < f.st.log.length; i++) scene.onEvent(f.st.log[i], f.st, fx);
      tickFightFx(fx, FIXED_DT);
      if (!f.st.done) {
        for (let side = 0; side < 2; side++) {
          const ss = f.st.sides[side];
          if (ss.staggerT === 0 && ss.swingT === TELL_F) scene.glint(side as Side);
        }
      }
    };

    const loop = (now: number) => {
      if (dead) return;
      raf = requestAnimationFrame(loop);
      const scene = sceneRef.current;
      const f = fightRef.current;
      if (!scene || !f) {
        lastRef.current = now;
        return;
      }
      let frameDt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (!(frameDt > 0) || frameDt > 0.25) frameDt = FIXED_DT;
      if (fx.hitStop > 0) {
        fx.hitStop = Math.max(0, fx.hitStop - frameDt);
      } else {
        const slow = fx.ko >= 0 && fx.ko < KO_SLOW_FX ? SLOWMO_RATE : 1;
        accRef.current += frameDt * slow;
        let steps = 0;
        while (accRef.current >= FIXED_DT && steps < MAX_SUBSTEPS) {
          stepOnce();
          accRef.current -= FIXED_DT;
          steps++;
          if (fx.hitStop > 0) {
            accRef.current = 0;
            break;
          }
        }
        if (steps >= MAX_SUBSTEPS) accRef.current = 0;
      }
      // the loop: a beat on the loser, then the bell again
      if (f.st.done && (fx.ko >= HOLD_FX || fx.timeout >= HOLD_FX)) restart();
      scene.render(fightRef.current!.st, fx);
    };
    function start() {
      if (running || isReduced) return;
      running = true;
      lastRef.current = performance.now();
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    const onVis = () => {
      if (document.hidden) stop();
      else start();
    };

    pixiChain = pixiChain
      .then(async () => {
        if (dead) return null;
        return buildFightScene(canvas, { small: isSmall, fightSeed: fight.seed });
      })
      .then(async (scene) => {
        if (!scene) return;
        if (dead) {
          scene.destroy();
          return;
        }
        // the pit takes a LOOK per robot now, not one colour: the builds this
        // page already reads carry the colour every part arrived in, so the
        // two bots down there wear their own four colours. The face, the
        // sticker, the hat and the marks live on the fight ROW, which this
        // page does not read yet (see the handoff note in fightOf above).
        await scene.setBuilds(fight.a, fight.b, [rigLookFromBuild(fight.a, fight.paints[0]), rigLookFromBuild(fight.b, fight.paints[1])]);
        if (dead) {
          scene.destroy();
          return;
        }
        sceneRef.current = scene;
        const fit = () => {
          const r = wrap.getBoundingClientRect();
          scene.resize(r.width, r.height, Math.min(2, devicePixelRatio || 1));
        };
        fit();
        ro = new ResizeObserver(fit);
        ro.observe(wrap);
        restart();
        const f = fightRef.current!;
        if (isReduced) {
          // one settled frame at the end, no loop at all (the viewer's rule)
          while (!f.st.done) stepFight(f);
          for (const e of f.st.log) scene.onEvent(e, f.st, fx);
          fx.time = (f.st.frame + 180) / 60;
          scene.settle(fx);
        }
        scene.render(f.st, fx);
        document.addEventListener("visibilitychange", onVis);
        if (!document.hidden) start();
        setReady(true);
        // the screenshot hook (dev only; scripts/bots-shot.mjs waits on it)
        (window as unknown as Record<string, unknown>).__bots = {
          ready: true,
          landing: true,
          plate: scene.plate,
          recent: fight.recent,
          seed: fight.seed,
        };
      });
    return () => {
      dead = true;
      stop();
      document.removeEventListener("visibilitychange", onVis);
      ro?.disconnect();
      setReady(false);
      delete (window as unknown as Record<string, unknown>).__bots;
      pixiChain = pixiChain.then(() => {
        sceneRef.current?.destroy();
        sceneRef.current = null;
      });
    };
  }, [fight]);

  // was three sentences in one nowrap label, so a phone cut the last one off
  // mid word. The names come first, the kind of fight second, and the row
  // wraps rather than swallowing either.
  const label = fight
    ? `${fill(t.landingUi.versus, { a: fight.names[0], b: fight.names[1] })}. ${fight.recent ? t.landingUi.recent : t.landingUi.demo}`
    : t.landingUi.opening;

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: "4px 12px",
          padding: "0 4px 8px",
          fontFamily: FONT_MONO,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: M.muted,
          whiteSpace: "normal",
          lineHeight: 1.4,
        }}
      >
        {/* the names come first; on a phone the second span wraps under them rather than eating them */}
        <span style={{ flex: "1 1 240px", minWidth: 0 }}>{label}</span>
        <span style={{ flex: "0 0 auto" }}>{t.landingUi.watchFree}</span>
      </div>
      {/* THE hairline: the lit pit inside the dark frame (the viewer's frame) */}
      <div ref={wrapRef} className={css.frame}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} aria-label="The ring" />
        {!ready ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: FONT_MONO,
              fontSize: 12,
              color: "#bfb5a6",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            {t.landingUi.opening}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── the doors ──────────────────────────────────────────────────────────── */

const door = (primary: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: TAP,
  padding: "10px 18px",
  borderRadius: R.inner,
  border: `1px solid ${primary ? M.accent : M.border}`,
  background: primary ? M.accent : M.surface2,
  color: primary ? "#ffffff" : M.text,
  fontFamily: FONT_BODY,
  fontWeight: 700,
  fontSize: 14,
  textDecoration: "none",
  cursor: "pointer",
});

/**
 * THE ONE DOOR: connect, then play (Mike, 2026-09-04: "Step 1: go to the
 * site. Step 2: connect wallet. Step 3: play. That's it brother.").
 *
 * PRESS ONE, not connected: the RainbowKit modal opens. When the wallet comes
 * back, useBotsSession spends the press it remembered and asks for the one
 * signature, so approving the wallet and proving it are a single motion and
 * not two steps (the hook's header says why nothing is chained onto the modal
 * itself). Nothing else is asked. There is no Discord, no bot command, no
 * form.
 *
 * PRESS TWO: play. A brand new wallet already owns an assembled robot
 * (_server/players.ts createStarterBot), so this starts its first fight
 * against Scrapper and goes straight to the viewer: a fight is watchable
 * within a minute of landing, with nothing built by hand first. A player who
 * has fought before goes to Battles instead and picks their own, because
 * spending somebody's two daily attacks for them is not a favour.
 *
 * IT NEVER DEAD ENDS. Every failure on the way to a fight falls through to
 * Battles, which is a screen with doors on it, rather than an error with none.
 */
function firstFightBot(view: unknown): number | null {
  if (!isObj(view)) return null;
  const bots = Array.isArray((view as { bots?: unknown }).bots) ? ((view as { bots: unknown[] }).bots) : [];
  for (const b of bots) {
    if (!isObj(b)) continue;
    const id = Number(b.id);
    const fights = (Number(b.wins) || 0) + (Number(b.losses) || 0);
    if (!Number.isFinite(id) || !b.complete || b.inShop) continue;
    if (fights === 0 && (Number(b.attacksLeft) || 0) > 0) return id;
  }
  return null;
}

/** Where pressing Play goes. Always a real screen, never an error. */
async function playHref(token: string): Promise<string> {
  const battles = "/bots/battles";
  try {
    const meRes = await fetch("/api/bots/me", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!meRes.ok) return battles;
    const botId = firstFightBot(await meRes.json());
    if (botId == null) return battles;
    const res = await fetch("/api/bots/fight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token, botId, mode: "pve", difficulty: "easy" }),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; fightId?: string } | null;
    if (res.ok && j?.ok && typeof j.fightId === "string" && j.fightId) {
      return `/bots/fight/${encodeURIComponent(j.fightId)}`;
    }
    return battles;
  } catch {
    return battles;
  }
}

function PlayDoor() {
  const sess = useBotsSession();
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  const press = async () => {
    // not signed in: this press is the connect step, and the hook carries it
    // through the one signature on its own
    if (!sess.token) {
      await sess.open();
      return;
    }
    setStarting(true);
    router.push(await playHref(sess.token));
  };

  return (
    <ConnectButton.Custom>
      {({ mounted }) => {
        if (!mounted || !sess.ready) {
          return (
            <span aria-hidden style={{ ...door(true), opacity: 0, pointerEvents: "none" }}>
              {t.landing.connect}
            </span>
          );
        }
        const working = starting || sess.busy || sess.pending;
        const label = starting
          ? t.landing.starting
          : sess.busy
            ? t.landing.signing
            : sess.pending
              ? t.landing.connecting
              : sess.token
                ? t.landing.play
                : t.landing.connect;
        return (
          <button
            type="button"
            className={uiCss.press}
            onClick={() => void press()}
            disabled={working}
            style={{ ...door(true), opacity: working ? 0.7 : 1 }}
          >
            {label}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

/* ── the page ───────────────────────────────────────────────────────────── */

export default function BotsLanding() {
  return (
    <PageShell wide>
      <div className={css.viewer}>
        <p style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "0.32em", textTransform: "uppercase", color: M.muted, margin: "24px 0 10px" }}>
          {t.nav.wordmark}
        </p>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(28px, 4.5vw, 44px)", lineHeight: 1.1, margin: "0 0 10px", color: M.text }}>
          {t.landing.headline}
        </h1>
        <p style={{ fontSize: 16, color: M.lore, margin: "0 0 18px" }}>{t.landing.sub}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
          <PlayDoor />
          <Link href="/bots/fight/demo?seed=7&a=T2&b=T2" className={uiCss.press} style={door(false)}>
            {t.landing.watch}
          </Link>
        </div>
        {/* nobody has to open the Build screen to see a fight */}
        <p style={{ fontSize: 13.5, color: M.muted, margin: "0 0 20px" }}>{t.landing.ready}</p>

        {/* THE THREE STEPS, above the pit: a story nobody scrolls to is a
            story nobody reads, and at 1440 the pit is tall enough to push
            this under the fold. */}
        <ol style={{ listStyle: "none", padding: 0, margin: "0 0 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {t.landingUi.how.map((line, i) => (
            <li
              key={line}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                minHeight: 52,
                padding: "8px 14px",
                borderRadius: R.card,
                border: `1px solid ${M.border}`,
                background: M.surface,
                fontSize: 14,
                color: M.text,
              }}
            >
              <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.accent, flex: "0 0 auto" }}>{i + 1}</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>

        <LandingPit />
      </div>
    </PageShell>
  );
}
