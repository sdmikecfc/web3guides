/**
 * THE FRONT (ADR-0121): client shell. Owns the rAF (fixed 1/60 timestep,
 * RunShell's accumulator law), the feed poll, the HUD chrome and the 8
 * place-buttons. The sim is decoration driven BY data: the front's x comes
 * from the season's TOTAL FDV RAISE (raise-weighted paid peaks across ALL
 * targets, ADR-0123 superseding 0122's bonded ladder), never from combat --
 * so the line advances with every dollar of progress even if the first
 * mainframe never bonds.
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  FRONT_H,
  FRONT_W,
  HUMAN_EDGE,
  WARDEN_EDGE,
  burstFront,
  createFrontSim,
  stepFront,
  type FrontSim,
  type NamedSpawn,
} from "./sim";
import { buildFrontScene, type FrontSceneHandle, type Milestone } from "./scene";
import { BasePopup } from "./BasePopup";
import { BuyPanel } from "../_components/BuyPanel";
import { useHqMe } from "../hq/useHqMe";
import { DEFAULT_THEME } from "@/lib/s6/theme";
import { STRINGS, fill, type S6Dict } from "@/lib/s6/strings";
import { clientLocale } from "@/lib/s6/locale";
import { rememberRef, track } from "@/lib/s6/track";

export interface LiteTarget {
  domain: string;
  name: string;
  status: string; // pending | live | bonded | failed
  peakPct: number; // 0..100 paid peak
  /** USD this mainframe has already EARNED for its own holders (display). */
  securedUsd?: number;
  /** THE SLICE: what this mainframe is WORTH out of the season pool
   * (lib/s6/data poolShare). The card shows one pair, worth and earned, which
   * is the whole point of the 2026-08-16 money rewrite: one mainframe, one
   * slice, one percent. Optional so the demo battle can omit it. */
  sliceUsd?: number;
  /** The FDV raise this mainframe represents (lib/s6/data targetWeightUsd);
   * weights the front line so big mainframes move it further. */
  raiseUsd?: number;
}

export interface FeedItem {
  t: number;
  kind: "game" | "hold" | "commit" | "bond" | "raid" | "trade" | "info";
  text: string;
}

interface Props {
  targets: LiteTarget[];
  named: NamedSpawn[];
  liberated: number;
  total: number;
  poolLineText: string;
  demo: boolean;
  /** today's free game href (the REAL daily run: guest scores bank, the
   * enlist panel shows), for the hero CTA + the mobile sticky bar */
  playHref: string;
  /** today's game display name ("Iron Jaw"), same day-index source as
   * playHref (computed once in page.tsx) */
  playGameName: string;
}

import { MILESTONE_SPOTS } from "./setdressing";

/** Milestone x positions across the ladder band: Mike's authored stands,
 * sorted west->east so the liberation ladder always reads in order. */
function milestoneXs(n: number): number[] {
  const xs = MILESTONE_SPOTS.slice(0, n).map((s) => s.x).sort((a, b) => a - b);
  while (xs.length < n) {
    xs.push(Math.round(640 + ((2360 - 640) * xs.length) / Math.max(1, n - 1)));
  }
  return xs;
}

function computeBoard(targets: LiteTarget[]): { milestones: Milestone[]; frontX: number } {
  const xs = milestoneXs(targets.length);
  const milestones: Milestone[] = targets.map((t, i) => ({
    x: xs[i],
    name: t.domain,
    state: (t.status === "bonded" ? "liberated" : "held") as Milestone["state"],
    pct: t.status === "bonded" ? 100 : t.peakPct,
  }));
  // ADR-0123: the line rides the TOTAL FDV RAISE, not the bonded ladder. Each
  // target contributes its paid peak weighted by its raise, so a $10k
  // mainframe at 50% moves the front as much as a $5k one fully freed -- and
  // a season where the first domain never bonds still shows a war being won.
  // Weightless targets (no FDVs yet, demo without raiseUsd) count equally.
  const w = (t: LiteTarget) => Math.max(0, t.raiseUsd ?? 0);
  const totW = targets.reduce((s, t) => s + w(t), 0);
  const pctOf = (t: LiteTarget) => (t.status === "bonded" ? 100 : Math.max(0, Math.min(100, t.peakPct)));
  const totalPct =
    targets.length === 0
      ? 0
      : totW > 0
        ? targets.reduce((s, t) => s + pctOf(t) * w(t), 0) / totW
        : targets.reduce((s, t) => s + pctOf(t), 0) / targets.length;
  const westX = HUMAN_EDGE + 130;
  const eastX = WARDEN_EDGE - 140;
  const frontX = Math.round(westX + ((eastX - westX) * totalPct) / 100);

  // THE ATTACK MARKER FOLLOWS THE LINE (Mike, 2026-08-19: supremacy.ai was
  // "at the front line stopping the line from moving up"). It used to mark
  // the first non-bonded target in ladder ORDER, so it parked on whatever
  // happened to be listed first even when the war had moved past it. Now it
  // marks the nearest unliberated wall AHEAD of the line - the one the front
  // is actually pushing into - falling back to the nearest behind it when
  // everything ahead is already free.
  const contested = milestones
    .map((m, i) => ({ i, m }))
    .filter((r) => r.m.state !== "liberated");
  if (contested.length) {
    const ahead = contested.filter((r) => r.m.x >= frontX);
    const pick = (ahead.length ? ahead : contested).reduce((best, r) =>
      Math.abs(r.m.x - frontX) < Math.abs(best.m.x - frontX) ? r : best,
    );
    milestones[pick.i].state = "active";
  }
  return { milestones, frontX };
}

/** React StrictMode dev-mounts effects twice; two app.init() calls racing on
 * ONE canvas kill each other's shaders (found live: "could not retrieve
 * shader source" x2 sets). Every build AND destroy is chained through this
 * promise so a canvas only ever hosts one stage at a time. */
let pixiChain: Promise<void> = Promise.resolve();

/** localStorage key for the intro bar's folded state. */
const CHROME_KEY = "s6_front_chrome";

/** localStorage key for the map legend's open state (CHROME_KEY pattern:
 * open by default, the choice is remembered, absent = never closed). */
const LEGEND_KEY = "s6_front_legend";

/** THE LOCKUP (second pass 2026-08-17, Mike: "It doesn't even say launch wars
 * anywhere"). Both lines derive from the ONE seasonName seam in theme.ts
 * ("Launch Wars S6: Uprising"), not retyped: eyebrow "LAUNCH WARS · SEASON 6",
 * display title "UPRISING". Brand nouns are proper names, so no dict key. */
const [SEASON_EYEBROW, SEASON_TITLE] = (() => {
  const [era, title] = DEFAULT_THEME.seasonName.split(":");
  return [
    era.trim().replace(/\bS(\d+)\b/, "· SEASON $1").toUpperCase(),
    (title ?? era).trim().toUpperCase(),
  ];
})();

const BUTTONS: Array<{ key: string; label: string; href: string; locked?: boolean }> = [
  { key: "basecamp", label: "Your Base", href: "/s6/hq" },
  { key: "commandpost", label: "Leaderboards", href: "/s6/board" },
  { key: "ironjaw", label: "Iron Jaw", href: "/s6/games/ironjaw" },
  { key: "strain", label: "Strain", href: "/s6/games/strain" },
  { key: "stopclock", label: "Stopclock", href: "/s6/games/stopclock" },
  { key: "riot", label: "Riot", href: "/s6/games/riot" },
  { key: "arcade", label: "Arcade", href: "/s6/play" },
  { key: "muster", label: "Challenges", href: "/s6/board" },
  { key: "domainkitchen", label: "Domain Kitchen", href: "#", locked: true },
];

export default function Battlefield({ targets, named, liberated, total, poolLineText, demo, playHref, playGameName }: Props) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<FrontSim | null>(null);
  const sceneRef = useRef<FrontSceneHandle | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  /** The intro bar's open state, remembered per browser. Defaults OPEN so a
   * first-time visitor still gets the pitch; a returning player who folded it
   * keeps their clean map. */
  const [chromeOpen, setChromeOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(CHROME_KEY) === "0") setChromeOpen(false);
    } catch {
      /* storage blocked: stay open */
    }
  }, []);
  /** THE LEGEND "READING THE FRONT" (CRO 2026-08-17): open by default so a
   * first-time visitor learns to read the map; closes to a "?" chip and the
   * choice is remembered (same law as the chrome bar). */
  const [legendOpen, setLegendOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(LEGEND_KEY) === "0") setLegendOpen(false);
    } catch {
      /* storage blocked: stay open */
    }
  }, []);
  const setLegend = (open: boolean) => {
    setLegendOpen(open);
    try {
      localStorage.setItem(LEGEND_KEY, open ? "1" : "0");
    } catch {
      /* storage blocked: the choice just does not persist */
    }
    track("cta_click", { ref: open ? "legend-open" : "legend-close" });
  };
  // THE FUNNEL FIX (CRO 2026-08-17): /s6 is the landing page, but the only
  // landing_view call site was the intercepted /s6/hq, so the top of every
  // funnel table read empty. Fire it here (track.ts dedupes per session per
  // day) and bank the first-touch ?ref on the actual front door.
  useEffect(() => {
    track("landing_view");
    rememberRef();
  }, []);
  const [fortCard, setFortCard] = useState<{ i: number; x: number; y: number } | null>(null);
  const lastFeedT = useRef(0);
  const boardRef = useRef(computeBoard(targets));

  // YOUR BASE, as a popup ON the map (Mike, 2026-08-17: "A pop up on the map,
  // not that ugly barracks thing"). The same { me, patchMe, ready } plumbing
  // the S5 world map lifted from the HQ - s6's useHqMe was extracted for
  // exactly this - plus the HqScene locale pattern (English on the server,
  // cookie locale applied client-side on mount, ISR-safe).
  const { me, patchMe, ready } = useHqMe();
  const [dict, setDict] = useState<S6Dict>(STRINGS.en);
  const [baseOpen, setBaseOpen] = useState(false);
  useEffect(() => {
    const loc = clientLocale();
    if (loc !== "en") setDict(STRINGS[loc]);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let dead = false;
    let raf = 0;
    const reduced =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = typeof innerWidth !== "undefined" && innerWidth < 760;
    // FIRST-VISIT PULSE: the PLAY marker pulses harder for its first 10s, but
    // ONLY while the legend has never been closed (absent key = new visitor).
    let firstVisit = false;
    try {
      firstVisit = localStorage.getItem(LEGEND_KEY) == null;
    } catch {
      /* storage blocked: no pulse */
    }
    const sim = createFrontSim({
      frontX: boardRef.current.frontX,
      scale: small ? 0.5 : 1,
      named,
    });
    simRef.current = sim;

    let ro: ResizeObserver | null = null;
    pixiChain = pixiChain
      .then(async () => {
        if (dead) return;
        return buildFrontScene(canvas, sim, {
          small,
          pulsePlay: firstVisit,
          // THE SEAM: bld-base's route is intercepted here so tapping YOUR
          // BASE opens the popup OVER the map instead of navigating. Only
          // bld-base carries /s6/hq (setdressing BUILDING_ROUTES); every
          // other building keeps navigating, and /s6/hq itself stays alive
          // for deep links.
          onNavigate: (href) => {
            if (href === "/s6/hq") setBaseOpen(true);
            else router.push(href);
          },
          onFortTap: (i, x, y) => setFortCard({ i, x, y }),
        });
      })
      .then((scene) => {
        if (!scene) return;
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
        scene.setData(boardRef.current.milestones, boardRef.current.frontX, false);

        // CAMERA: drag pans; wheel zooms ONLY when the visitor has engaged
        // the map (clicked it) or holds ctrl (trackpad pinch). A plain wheel
        // must keep scrolling the PAGE or nobody ever reaches the onboarding
        // strip below (found in the CRO cold-walk).
        let engaged = false;
        const onWheel = (ev: WheelEvent) => {
          if (!engaged && !ev.ctrlKey) return; // let the page scroll
          ev.preventDefault();
          const r = canvas.getBoundingClientRect();
          scene.zoomAt(ev.clientX - r.left, ev.clientY - r.top, ev.deltaY < 0 ? 1.15 : 1 / 1.15);
        };
        // map_view: the visitor ENGAGED the field (first pointer interaction),
        // once per scene mount; the event name is already allowlisted.
        let mapViewed = false;
        const onEngage = () => {
          engaged = true;
          if (!mapViewed) {
            mapViewed = true;
            track("map_view");
          }
        };
        const onLeave = () => (engaged = false);
        canvas.addEventListener("pointerdown", onEngage);
        canvas.addEventListener("mouseleave", onLeave);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        let dragging = false;
        let lastX = 0;
        let lastY = 0;
        const onDown = (ev: PointerEvent) => {
          setFortCard(null);
          dragging = true;
          lastX = ev.clientX;
          lastY = ev.clientY;
          canvas.setPointerCapture(ev.pointerId);
        };
        const onMove = (ev: PointerEvent) => {
          if (!dragging) return;
          scene.panBy(ev.clientX - lastX, ev.clientY - lastY);
          lastX = ev.clientX;
          lastY = ev.clientY;
        };
        const onUp = (ev: PointerEvent) => {
          dragging = false;
          try {
            canvas.releasePointerCapture(ev.pointerId);
          } catch {
            /* already released */
          }
        };
        canvas.addEventListener("pointerdown", onDown);
        canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerup", onUp);
        canvas.addEventListener("pointercancel", onUp);
        (scene as unknown as { __offInput?: () => void }).__offInput = () => {
          canvas.removeEventListener("wheel", onWheel);
          canvas.removeEventListener("pointerdown", onEngage);
          canvas.removeEventListener("mouseleave", onLeave);
          canvas.removeEventListener("pointerdown", onDown);
          canvas.removeEventListener("pointermove", onMove);
          canvas.removeEventListener("pointerup", onUp);
          canvas.removeEventListener("pointercancel", onUp);
        };

        if (reduced) {
          // one settled still frame; the change listener path can reload the page
          scene.render(1 / 60);
          return;
        }
        let last = performance.now();
        let acc = 0;
        const FIXED = 1 / 60;
        // ONE loop, ever (leak audit 2026-08-17): without this latch, a tab
        // that mounts hidden and is then fronted - or that flips visibility -
        // stacked a second rAF loop (RunShell always had the guard; the map
        // was the one surface missing it). N loops = N x sim speed + render.
        let rafOn = false;
        const loop = (now: number) => {
          if (dead || !rafOn) return;
          acc += Math.min(0.25, (now - last) / 1000);
          last = now;
          while (acc >= FIXED) {
            stepFront(sim, FIXED);
            acc -= FIXED;
          }
          scene.render(FIXED);
          raf = requestAnimationFrame(loop);
        };
        const startLoop = () => {
          if (rafOn || dead) return;
          rafOn = true;
          last = performance.now();
          acc = 0;
          raf = requestAnimationFrame(loop);
        };
        const stopLoop = () => {
          rafOn = false;
          cancelAnimationFrame(raf);
        };
        startLoop();
        const onVis = () => {
          if (document.hidden) stopLoop();
          else startLoop();
        };
        document.addEventListener("visibilitychange", onVis);
        (scene as unknown as { __onVis?: () => void }).__onVis = onVis;
      })
      .catch((err) => {
        // a failed stage leaves the DOM shell + feed working - but NEVER
        // silently (a swallowed build error cost a blank-canvas hunt)
        console.error("[front] stage build failed:", err);
      });

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      // destroy rides the same chain so it can never cross a pending init
      pixiChain = pixiChain.then(() => {
        const scene = sceneRef.current;
        if (scene) {
          const onVis = (scene as unknown as { __onVis?: () => void }).__onVis;
          if (onVis) document.removeEventListener("visibilitychange", onVis);
          (scene as unknown as { __offInput?: () => void }).__offInput?.();
          scene.destroy();
        }
        sceneRef.current = null;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // feed poll: new events become toasts AND spawn bursts on the field
  useEffect(() => {
    let dead = false;
    const poll = async () => {
      try {
        const r = await fetch("/api/s6/feed", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { items?: FeedItem[] };
        if (dead || !j.items) return;
        setFeed(j.items.slice(0, 7));
        const sim = simRef.current;
        if (!sim) return;
        // FIRST POLL = history, not news (leak audit 2026-08-17): with
        // lastFeedT at 0 every one of the up-to-18 items "just happened" and
        // burst ~144 units within a second of mount. Seed the mark instead;
        // bursts start with the first item that arrives AFTER the page did.
        if (lastFeedT.current === 0) {
          lastFeedT.current = Math.max(1, ...j.items.map((i) => i.t));
          return;
        }
        for (const it of j.items) {
          if (it.t <= lastFeedT.current) continue;
          if (it.kind === "game") burstFront(sim, 0, "tank", 3);
          else if (it.kind === "hold" || it.kind === "commit") burstFront(sim, 0, "inf", 6);
          else if (it.kind === "raid") burstFront(sim, 1, "drone", 4);
          else if (it.kind === "trade") burstFront(sim, 0, "inf", 5); // a buy reinforces the line
          if (it.kind !== "info") burstFront(sim, 1, "inf", 4); // the Warden always answers
        }
        lastFeedT.current = Math.max(lastFeedT.current, ...j.items.map((i) => i.t));
        // PARKED-RENDERER GUARD (leak audit 2026-08-17): consume() is the
        // only drain and it lives in render(). Reduced motion never starts a
        // loop and a hidden tab stops it, but this poll keeps pushing spawn
        // events - cap the queue so a parked tab cannot grow it for hours.
        if (sim.events.length > 400) sim.events.length = 0;
      } catch {
        /* offline is fine; the field just idles */
      }
    };
    void poll();
    const iv = setInterval(poll, 25000);
    return () => {
      dead = true;
      clearInterval(iv);
    };
  }, []);

  return (
    <div className="s6f-shell" id="s6-content">
      {/* THE CHROME LIVES ABOVE THE MAP (2026-08-14, Mike: "I cannot see the
          top of the map because of the toolbars... I want to see the full map,
          not a map covered in random stuff I cannot hide"). The hero line, the
          liberation meter and the demo chip used to be absolutely positioned
          OVER the battlefield and could not be dismissed. They are one bar in
          normal flow now, so the canvas below is the whole picture. */}
      <div className={`s6f-chrome${chromeOpen ? "" : " s6f-chrome-shut"}`}>
        {/* MIKE'S RULE (2026-08-14): "any tool bar covering the map whether
            for education or intro must be closeable". Nothing here overlaps
            the field any more, and the whole bar still folds away to a single
            line - and stays folded, because the choice is remembered. */}
        <button
          className="s6f-chrome-toggle"
          onClick={() => {
            const next = !chromeOpen;
            setChromeOpen(next);
            try {
              localStorage.setItem(CHROME_KEY, next ? "1" : "0");
            } catch {
              /* storage blocked: the choice just does not persist */
            }
          }}
          aria-expanded={chromeOpen}
        >
          {chromeOpen ? "HIDE" : "SHOW INTRO"}
        </button>
        {/* the brand never fully disappears: the folded bar keeps one line */}
        <span className="s6f-chrome-mini">{DEFAULT_THEME.seasonName.toUpperCase()}</span>
        <div className="s6f-chrome-in">
          <div className="s6f-hero">
            <p className="s6f-eyebrow">{SEASON_EYEBROW}</p>
            <h1 className="s6f-lockup" aria-label={DEFAULT_THEME.seasonName}>
              {SEASON_TITLE}
            </h1>
            <p className="s6f-tagline">{dict.front.heroTitle}</p>
            <p className="s6f-herosub">{dict.front.heroSub}</p>
            <div className="s6f-hero-ctas">
              <Link
                href={playHref}
                className="s6f-hero-play"
                onClick={() => track("cta_click", { ref: "hero-play" })}
              >
                {fill(dict.front.heroPlayCta, { game: playGameName.toUpperCase() })}
              </Link>
              <Link
                href="/s6/how-to-play"
                className="s6f-hero-how"
                onClick={() => track("cta_click", { ref: "hero-how" })}
              >
                {dict.front.heroHowCta}
              </Link>
            </div>
          </div>
          <div className="s6f-hud">
            <div className="s6f-title">THE FRONT</div>
            <div className="s6f-sub">
              <span className="s6f-amber">{liberated}</span> of {total} mainframes LIBERATED
              {demo ? <em className="s6f-demo">DEMO DATA</em> : null}
            </div>
            <div className="s6f-meter" role="img" aria-label={`${liberated} of ${total} mainframes liberated`}>
              <i style={{ width: `${total ? Math.round((100 * liberated) / total) : 0}%` }} />
            </div>
            <div className="s6f-pool">{poolLineText}</div>
          </div>
        </div>
      </div>

      {/* WHAT YOU ARE LOOKING AT (Mike 2026-08-17: "some text above the map
          to say what they are looking at"): one plain line between the intro
          and the field so a cold visitor reads the map correctly. */}
      <p className="s6f-mapline">{dict.front.mapLine}</p>

    <div ref={wrapRef} className="s6f-wrap">
      <canvas ref={canvasRef} className="s6f-canvas" aria-label="The Front: live battlefield" />
      {/* LIVE FEED ON THE FIELD (Mike 2026-08-17: "the live trades would look
          good over the map on the bottom left"). Same items and 25s poll as
          the spawn bursts. pointer-events none so it never blocks a fort tap;
          on mobile the under-map aside serves instead, because a panel over a
          phone-sized field would hide the war. */}
      <aside className="s6f-mapfeed" aria-label={dict.front.mapFeedHead}>
        <div className="s6f-mapfeed-head">
          {dict.front.mapFeedHead} <i className="s6f-live" />
        </div>
        {feed.length === 0 ? (
          <div className="s6f-mapfeed-row s6f-feed-dim">{dict.front.mapFeedEmpty}</div>
        ) : (
          feed.slice(0, 5).map((f, i) => (
            <div key={`${f.t}-${i}`} className="s6f-mapfeed-row">
              {f.text}
            </div>
          ))
        )}
      </aside>
      {/* the 8 places */}
      <nav className="s6f-rail" aria-label="Base">
        {BUTTONS.map((b) =>
          b.locked ? (
            <span key={b.key} className="s6f-btn s6f-btn-locked" aria-disabled>
              {b.label}
              <em>SOON</em>
            </span>
          ) : b.key === "basecamp" ? (
            // Same rule as the building on the field: YOUR BASE opens the
            // popup on the map, it does not navigate to the barracks page.
            <button key={b.key} type="button" className="s6f-btn s6f-btn-base" onClick={() => setBaseOpen(true)}>
              {b.label}
            </button>
          ) : (
            <Link key={b.key} className="s6f-btn" href={b.href}>
              {b.label}
            </Link>
          ),
        )}
      </nav>
      {fortCard && targets[fortCard.i] ? (
        <div
          className="s6f-fortcard"
          style={{ left: Math.max(8, Math.min(fortCard.x - 120, 9999)), top: Math.max(8, fortCard.y - 150) }}
        >
          <button className="s6f-fortcard-x" onClick={() => setFortCard(null)} aria-label="Close">
            x
          </button>
          <div className="s6f-fortcard-name">{targets[fortCard.i].domain}</div>
          <div className="s6f-fortcard-state">
            {targets[fortCard.i].status === "bonded"
              ? "LIBERATED"
              : fortCard.i === targets.findIndex((t) => t.status !== "bonded")
                ? "UNDER ASSAULT"
                : "MACHINE-HELD"}
            {targets[fortCard.i].status !== "bonded" ? ` · peak ${targets[fortCard.i].peakPct}%` : ""}
          </div>
          {/* ONE MAINFRAME, ONE SLICE, ONE PERCENT (2026-08-16). The card used
              to print a single "secured" figure with nothing to measure it
              against, so a player could not tell $28 from a good day or a bad
              one. Worth and earned are shown as a PAIR, and the second line is
              dropped entirely when the slice is unknown (the demo battle) so
              the card never invents a denominator. */}
          {(() => {
            const tg = targets[fortCard.i];
            const earned = tg.securedUsd ?? 0;
            const slice = tg.sliceUsd ?? 0;
            const money = (n: number) => `$${n.toFixed(2)}`;
            if (slice <= 0) {
              return <div className="s6f-fortcard-usd">{money(earned)} earned for its holders</div>;
            }
            return (
              <>
                <div className="s6f-fortcard-usd">
                  {tg.status === "bonded"
                    ? `${money(slice)} slice paid in full`
                    : `${money(earned)} earned of ${money(slice)}`}
                </div>
                <div className="s6f-fortcard-note">
                  {tg.status === "bonded"
                    ? "Liberated. It pays its whole slice to the pilots holding it."
                    : `Worth ${money(slice)} of the season pool. It pays its holders the percent it reaches.`}
                </div>
                {/* BUY FROM THE MAP (Mike 2026-08-17, the S5 grammar): the
                    real BuyPanel for a wall under assault - the same tested
                    money path the HQ uses, never a second implementation. */}
                {tg.status === "live" ? (
                  <div className="s6f-fortcard-buy">
                    <BuyPanel domain={tg.domain} name={tg.name} strings={dict.map.buy} />
                  </div>
                ) : null}
              </>
            );
          })()}
          <Link href="/s6/board" className="s6f-fortcard-link">
            View on the war board
          </Link>
        </div>
      ) : null}
      {/* THE LEGEND "READING THE FRONT" (CRO 2026-08-17): the four glyph rows
          that teach a cold visitor to read the map. Corner card on desktop,
          bottom sheet on mobile; closes to a "?" chip, remembered. */}
      {legendOpen ? (
        <aside className="s6f-legend" aria-label={dict.front.legendAria}>
          <div className="s6f-legend-head">
            <span>{dict.front.legendTitle}</span>
            <button className="s6f-legend-x" onClick={() => setLegend(false)} aria-label={dict.front.legendCloseAria}>
              x
            </button>
          </div>
          <div className="s6f-legend-row">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path d="M5 16V8l4-5 4 5v8" fill="none" stroke="#8fe2ff" strokeWidth="1.8" />
              <path d="M3 16h12" stroke="#8fe2ff" strokeWidth="1.8" />
            </svg>
            <span>{dict.front.legendTower}</span>
          </div>
          <div className="s6f-legend-row">
            <i className="s6f-lg-pct" aria-hidden>
              %
            </i>
            <span>{dict.front.legendPct}</span>
          </div>
          <div className="s6f-legend-row">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path d="M3 15C7 13 8 9 9 6s3-3 6-3" fill="none" stroke="#f0f0eb" strokeWidth="2" />
            </svg>
            <span>The white line is the whole war&apos;s progress</span>
          </div>
          <div className="s6f-legend-row">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <rect x="4" y="4" width="10" height="8" rx="2" fill="#ffd28a" />
              <path d="M6.5 12v4M11.5 12v4" stroke="#ffd28a" strokeWidth="2" />
              <circle cx="9" cy="8" r="1.6" fill="#0b0d12" />
            </svg>
            <span>{dict.front.legendMech}</span>
          </div>
          <div className="s6f-legend-tap">{dict.front.legendTap}</div>
        </aside>
      ) : (
        <button className="s6f-legend-chip" onClick={() => setLegend(true)} aria-label={dict.front.legendOpenAria}>
          ?
        </button>
      )}
    </div>
      {/* the full feed under the field is MOBILE ONLY since 2026-08-17:
          desktop reads the compact overlay on the field itself */}
      <aside className="s6f-feed" aria-label="Uplink feed">
        <div className="s6f-feed-head">
          UPLINK FEED <i className="s6f-live" /> LIVE
        </div>
        {feed.length === 0 ? (
          <div className="s6f-feed-row s6f-feed-dim">listening for resistance activity...</div>
        ) : (
          feed.map((f, i) => (
            <div key={`${f.t}-${i}`} className="s6f-feed-row">
              {f.text}
            </div>
          ))
        )}
      </aside>
      {baseOpen ? (
        <BasePopup
          d={dict}
          me={me}
          patchMe={patchMe}
          ready={ready}
          targets={targets}
          onClose={() => setBaseOpen(false)}
        />
      ) : null}
      {/* MOBILE STICKY PLAY BAR (CRO 2026-08-17): the one action, repeated,
          always visible over the page scroll on <=760px. No dismiss. */}
      <Link
        href={playHref}
        className="s6f-sticky-play"
        onClick={() => track("cta_click", { ref: "sticky-play" })}
      >
        PLAY A FREE ROUND · TODAY: {playGameName.toUpperCase()}
      </Link>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}

const CSS = `
/* transparent shell: the page's fixed backdrop + radial glow (page.tsx
   HOME_CSS) paint the ground; only the map wrap keeps an opaque floor */
.s6f-shell{display:block;background:transparent;}
.s6f-wrap{position:relative;width:100%;height:min(78vh,calc(100vw/${(FRONT_W / FRONT_H).toFixed(3)}));min-height:430px;background:#0b0d12;overflow:hidden;
  border-top:1px solid rgba(240,179,64,.14);border-bottom:1px solid rgba(240,179,64,.14);}
.s6f-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}
.s6f-wrap{border-radius:14px;border:1px solid #39424d;box-shadow:0 0 0 1px #05070b,0 1px 0 rgba(255,255,255,.06) inset,0 22px 55px rgba(0,0,0,.6);}
.s6f-wrap::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:6;border-radius:13px;
  box-shadow:inset 0 0 0 1px rgba(240,179,64,.22),inset 0 0 70px rgba(0,0,0,.55);}
.s6f-wrap::after{content:"";position:absolute;inset:7px;pointer-events:none;z-index:6;
  background:
    linear-gradient(#f0b340,#f0b340) top left/26px 2px,
    linear-gradient(#f0b340,#f0b340) top left/2px 26px,
    linear-gradient(#f0b340,#f0b340) top right/26px 2px,
    linear-gradient(#f0b340,#f0b340) top right/2px 26px,
    linear-gradient(#f0b340,#f0b340) bottom left/26px 2px,
    linear-gradient(#f0b340,#f0b340) bottom left/2px 26px,
    linear-gradient(#f0b340,#f0b340) bottom right/26px 2px,
    linear-gradient(#f0b340,#f0b340) bottom right/2px 26px;
  background-repeat:no-repeat;opacity:.65;}
.s6f-mapline{margin:10px 2px 8px;color:#aab4bd;font-size:14px;letter-spacing:.3px;}
.s6f-mapfeed{position:absolute;right:12px;bottom:12px;width:min(330px,44%);background:rgba(10,13,17,.82);border:1px solid rgba(240,179,64,.35);border-radius:10px;padding:8px 10px;backdrop-filter:blur(3px);pointer-events:none;z-index:4;}
.s6f-mapfeed-head{font-size:11px;font-weight:800;letter-spacing:2px;color:#f0b340;display:flex;align-items:center;gap:7px;margin-bottom:4px;}
.s6f-mapfeed-row{font-size:12.5px;color:#dfe5ea;padding:2px 0;border-top:1px solid rgba(255,255,255,.06);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.s6f-mapfeed-row:first-of-type{border-top:0;}
@media (max-width:760px){.s6f-mapfeed{display:none;}}
@media (min-width:761px){.s6f-feed{display:none;}}
/* THE CHROME BAR: above the field, in normal flow, foldable. */
/* the season's top nav is position:fixed and 52px tall, so the bar starts
   BELOW it - the whole point is that nothing hides anything else */
.s6f-chrome{position:relative;padding:78px 20px 28px;
  background:linear-gradient(180deg, rgba(11,13,18,.25) 0%, rgba(11,13,18,.7) 100%),
    radial-gradient(900px 420px at 24% 0%, rgba(224,102,46,.12), transparent 65%);}
.s6f-chrome-in{max-width:1120px;margin:0 auto;display:flex;gap:28px;align-items:flex-start;
  justify-content:space-between;flex-wrap:wrap;}
.s6f-chrome-shut .s6f-chrome-in{display:none;}
.s6f-chrome-shut{padding:60px 20px 12px;}
.s6f-chrome-mini{display:none;}
.s6f-chrome-shut .s6f-chrome-mini{display:block;max-width:1120px;margin:0 auto;
  font-size:11px;font-weight:800;letter-spacing:.26em;color:#8a93a2;}
.s6f-chrome-toggle{position:absolute;right:14px;top:60px;z-index:2;background:rgba(16,19,27,.9);color:#c9d1d9;
  border:1px solid #2a3345;border-radius:7px;font-size:10.5px;font-weight:800;letter-spacing:.12em;
  padding:5px 10px;cursor:pointer;}
.s6f-chrome-toggle:hover{border-color:#f0b340;color:#f0f0eb;}
.s6f-hero{flex:1 1 420px;max-width:620px;}
/* THE LOCKUP: house eyebrow, ember-gradient display title, dict tagline */
.s6f-eyebrow{margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.32em;
  text-transform:uppercase;color:#9aa7b4;}
.s6f-lockup{margin:0;font-size:clamp(38px,4.6vw,58px);line-height:1;font-weight:800;letter-spacing:.06em;
  background:linear-gradient(180deg,#ffe9c4 0%,#f0b340 52%,#e0662e 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 0 22px rgba(224,102,46,.3));}
.s6f-tagline{margin:12px 0 0;font-size:16.5px;font-weight:600;color:#f0f0eb;letter-spacing:.02em;}
.s6f-herosub{margin:6px 0 16px;font-size:13px;line-height:1.55;color:#c9d1d9;max-width:520px;}
.s6f-hero-ctas{display:flex;gap:12px;align-items:center;}
.s6f-hero-play{background:#e0662e;color:#0b0d10;font-weight:800;font-size:13px;border-radius:8px;
  padding:10px 16px;text-decoration:none;letter-spacing:.05em;transition:background .15s ease,box-shadow .15s ease;}
.s6f-hero-play:hover{background:#f0b340;box-shadow:0 0 18px rgba(240,179,64,.35);}
.s6f-hero-how{color:#7dd3fc;font-size:12.5px;text-decoration:none;}
@media (max-width:760px){
  .s6f-hero{max-width:calc(100vw - 36px);}
  .s6f-lockup{font-size:clamp(34px,11vw,44px);}
  .s6f-tagline{font-size:14.5px;}
}
/* the HUD: console panel, ember corner brackets (the map card's notched
   corner language), squared off so it reads instrument not card */
.s6f-hud{position:relative;flex:0 1 340px;text-align:center;background:rgba(14,17,24,.82);
  border:1px solid rgba(240,179,64,.38);border-radius:4px;padding:16px 24px 18px;
  backdrop-filter:blur(5px);}
.s6f-hud::before,.s6f-hud::after{content:"";position:absolute;width:16px;height:16px;pointer-events:none;}
.s6f-hud::before{top:-1px;left:-1px;border-top:2px solid #f0b340;border-left:2px solid #f0b340;}
.s6f-hud::after{bottom:-1px;right:-1px;border-bottom:2px solid #f0b340;border-right:2px solid #f0b340;}
.s6f-title{font-size:19px;font-weight:800;letter-spacing:.14em;color:#f0f0eb;}
.s6f-sub{font-size:13px;color:#c9d1d9;margin-top:2px;}
.s6f-amber{color:#f0b340;font-weight:700;font-variant-numeric:tabular-nums;}
.s6f-meter{height:7px;border-radius:4px;background:#1a2029;margin-top:8px;overflow:hidden;}
.s6f-meter i{display:block;height:100%;background:linear-gradient(90deg,#e0662e,#f0b340);border-radius:4px;transition:width .6s ease;}
.s6f-pool{font-size:11.5px;color:#8a93a2;margin-top:7px;}
.s6f-banner{position:absolute;top:16px;font-size:13px;font-weight:800;letter-spacing:.22em;padding:7px 14px;border-radius:9px;background:rgba(10,12,18,.8);}
.s6f-banner-w{left:16px;color:#f0b340;border:1px solid rgba(240,179,64,.6);}
.s6f-banner-e{right:16px;color:#8fe2ff;border:1px solid rgba(255,92,72,.65);}
.s6f-demo{font-style:normal;font-size:10px;color:#0b0d10;background:#f0b340;border-radius:6px;padding:2px 7px;font-weight:800;margin-left:8px;}
.s6f-rail{display:none;}
.s6f-btn{display:block;font-size:12.5px;font-weight:700;color:#f0f0eb;text-decoration:none;background:rgba(16,19,27,.88);border:1px solid #2a3345;border-left:3px solid #e0662e;border-radius:8px;padding:8px 12px;min-width:128px;transition:transform .12s ease,border-color .12s ease;}
.s6f-btn:hover,.s6f-btn:focus-visible{transform:translateX(3px);border-color:#f0b340;outline:none;}
.s6f-btn-locked{opacity:.55;border-left-color:#4a5568;cursor:default;}
/* the one rail entry that is a <button> (opens the base popup): kill the UA
   button chrome so it reads identically to its Link siblings */
.s6f-btn-base{appearance:none;font-family:inherit;text-align:left;cursor:pointer;width:auto;}
.s6f-btn-locked em{font-style:normal;font-size:9.5px;color:#f0b340;margin-left:7px;letter-spacing:.1em;}
/* the feed: a console card on the shared 1120 column, not a full-bleed strip */
.s6f-feed{display:block;width:min(1120px, calc(100% - 40px));margin:30px auto 0;
  padding:14px 18px 16px;background:rgba(14,17,24,.72);border:1px solid #242c3e;border-radius:14px;
  backdrop-filter:blur(4px);transition:border-color .15s ease;}
.s6f-feed:hover{border-color:#3a4560;}
.s6f-feed-head{font-size:11px;font-weight:800;letter-spacing:.22em;color:#8a93a2;display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.s6f-live{width:7px;height:7px;border-radius:50%;background:#34d399;display:inline-block;animation:s6fpulse 1.6s infinite;}
.s6f-feed-row{font-size:12px;color:#c9d1d9;padding:3.5px 0;border-top:1px solid rgba(42,51,69,.5);}
.s6f-feed-row:first-of-type{border-top:0;}
.s6f-feed-dim{color:#5d6673;}
@keyframes s6fpulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (max-width:760px){
  .s6f-wrap{min-height:60vh;}
  /* room under the page for the fixed sticky bar so the feed's last rows are
     never hidden behind it */
  .s6f-shell{padding-bottom:70px;}
  /* the rail keeps its spot on the field but rides 78px up so the sticky bar
     (fixed, ~60px tall) can never sit over it when the map bottom meets the
     viewport bottom */
  .s6f-rail{display:flex;position:absolute;z-index:5;gap:8px;top:auto;bottom:78px;left:10px;right:auto;flex-direction:row;flex-wrap:wrap;max-width:56vw;}
  .s6f-btn{min-width:0;padding:7px 10px;font-size:11.5px;}
  .s6f-hud{min-width:0;padding:12px 16px 14px;flex:1 1 100%;}
  .s6f-hero{flex:1 1 100%;}
  .s6f-feed{width:calc(100% - 32px);margin-top:24px;}
}
.s6f-fortcard{position:absolute;z-index:8;width:240px;background:rgba(10,12,18,.94);border:1px solid #2a5a74;
  border-radius:12px;padding:12px 14px;backdrop-filter:blur(4px);}
.s6f-fortcard-buy{margin-top:10px;max-height:46vh;overflow-y:auto;}
.s6f-fortcard-x{position:absolute;top:6px;right:8px;background:none;border:0;color:#8a93a2;font-weight:800;cursor:pointer;}
.s6f-fortcard-name{font-size:15px;font-weight:800;color:#f0f0eb;}
.s6f-fortcard-state{font-size:11px;font-weight:700;letter-spacing:.1em;color:#8fe2ff;margin-top:2px;}
.s6f-fortcard-usd{font-size:13px;color:#f0b340;font-weight:700;margin-top:8px;}
.s6f-fortcard-note{font-size:11px;color:#9aa7b4;line-height:1.5;margin-top:4px;}
.s6f-fortcard-link{display:inline-block;margin-top:8px;font-size:12px;color:#7dd3fc;text-decoration:none;}
/* THE LEGEND: corner card over the canvas (desktop), bottom sheet (mobile) */
.s6f-legend{position:absolute;z-index:9;top:12px;right:12px;width:300px;max-width:calc(100vw - 24px);
  background:rgba(10,12,18,.93);border:1px solid #2a3345;border-radius:12px;padding:12px 14px;
  backdrop-filter:blur(4px);}
.s6f-legend-head{display:flex;align-items:center;justify-content:space-between;font-size:11.5px;
  font-weight:800;letter-spacing:.14em;color:#f0b340;margin-bottom:7px;}
.s6f-legend-x{background:none;border:0;color:#8a93a2;font-weight:800;font-size:13px;cursor:pointer;padding:0 2px;}
.s6f-legend-x:hover{color:#f0f0eb;}
.s6f-legend-row{display:flex;gap:9px;align-items:flex-start;font-size:12px;line-height:1.45;color:#c9d1d9;padding:4px 0;}
.s6f-legend-row svg{flex:0 0 18px;margin-top:1px;}
.s6f-lg-pct{flex:0 0 18px;font-style:normal;font-weight:900;font-size:13px;color:#ffd28a;text-align:center;margin-top:1px;}
.s6f-legend-tap{margin-top:7px;padding-top:7px;border-top:1px solid rgba(42,51,69,.7);font-size:12px;font-weight:700;color:#7dd3fc;}
.s6f-legend-chip{position:absolute;z-index:9;top:12px;right:12px;width:30px;height:30px;border-radius:50%;
  background:rgba(16,19,27,.9);border:1px solid #2a3345;color:#f0b340;font-weight:900;font-size:15px;cursor:pointer;}
.s6f-legend-chip:hover{border-color:#f0b340;}
/* MOBILE STICKY PLAY BAR: hidden on desktop, fixed over the scroll on mobile */
.s6f-sticky-play{display:none;}
@media (max-width:760px){
  .s6f-sticky-play{display:block;position:fixed;left:10px;right:10px;bottom:10px;z-index:40;text-align:center;
    background:#e0662e;color:#0b0d10;font-weight:800;font-size:13.5px;letter-spacing:.05em;border-radius:10px;
    padding:13px 12px;text-decoration:none;box-shadow:0 6px 18px rgba(0,0,0,.45);}
  .s6f-sticky-play:active{background:#f0b340;}
  /* the legend becomes a bottom sheet: fixed above the sticky bar so neither
     it nor the bar sits over the rail's corner of the field */
  .s6f-legend{position:fixed;top:auto;left:10px;right:10px;bottom:74px;width:auto;z-index:30;
    max-height:52vh;overflow:auto;}
  .s6f-legend-chip{top:8px;right:8px;}
}
@media (prefers-reduced-motion: reduce){.s6f-live{animation:none}.s6f-meter i{transition:none}}
`;
