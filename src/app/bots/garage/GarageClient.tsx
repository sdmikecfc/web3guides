/**
 * THE GARAGE SCREEN (screens doc 3.1 and 3.2): your numbered garage on
 * Sprocket Row. The street strip, the garage diorama (five bays on real
 * stands, the corkboard, the tool board, the crew), the three DOM panels
 * under it (Morning Paper, Bays, Tool Board), the bay sheet, the recycle
 * confirm and the five-bot cap.
 *
 * Client shell in the Build screen's shape (src/app/bots/garage/build/
 * BuildClient.tsx, itself the S7 Battlefield shape): owns the rAF, builds
 * the two canvases through the one pixi chain, fits them with a
 * ResizeObserver on the wrapper (never the canvas), and keeps every number
 * in the DOM. State comes from src/lib/bots/garage-state.ts (localStorage
 * until the server lands); the only clock read is here, once a second, and
 * it is handed down as a value.
 */
"use client";

import { useRouter } from "next/navigation";
import type { Texture } from "pixi.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "../_components/PageShell";
import { IconChevron, IconPin, IconPlay, IconRecycle, STAT_ICON } from "../_ui/icons";
import { Button, ChipTab, CoinChip, Dot, Panel, Sheet, uiCss } from "../_ui/primitives";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, FONT_TOY, K, M, PAINTS, R, TAP, TIER_COLOR } from "../_ui/tokens";
import { buildGarage, paintRigSockets, type BayTag, type GarageHandle, type TagDot } from "../_view/garage";
import { ART_OF_SOCKET, type PartArt } from "../_view/rig";
import { maskFile, partFile } from "../_view/rig-points";
import { buildStreet, type StreetHandle } from "../_view/street";
import {
  BAY_COUNT,
  CARD_OF_SOCKET,
  FIGHTS,
  ME,
  PAPER,
  SLOT_STATS,
  SOCKETS,
  SOCKETS_OF,
  botTier,
  botTotal,
  emptySockets,
  nameText,
  partArt,
  partTotal,
  recycleValue,
  type Build,
  type OwnedPart,
  type StrategyKind,
} from "@/lib/bots/fixtures";
import {
  bayStatus,
  firstEmptyBay,
  formatLeft,
  partByUid,
  putOnBay,
  recycleBay,
  recyclePart,
  recycleRows,
  resetGarage,
  spareParts,
  useGarage,
  type BayStatus,
  type GarageState,
} from "@/lib/bots/garage-state";
import { STRINGS, fill } from "@/lib/bots/strings";

const t = STRINGS.en;
const hexNum = (h: string): number => parseInt(h.slice(1), 16);

/** React StrictMode dev-mounts effects twice; two app.init() calls racing on
 * ONE canvas kill each other's shaders (the Battlefield law). Every build AND
 * destroy is chained through this promise. */
let pixiChain: Promise<void> = Promise.resolve();

/* ── the status chip (canvas tag and DOM chip share the table) ──────────── */

interface Chip {
  text: string;
  dot: TagDot;
  pulse?: boolean;
}

function chipOf(s: BayStatus): Chip {
  switch (s.kind) {
    case "ready":
      return { text: fill(t.garageUi.chip.ready, { n: s.attacksLeft }), dot: "good" };
    case "shop":
      return { text: fill(t.garageUi.chip.shop, { time: formatLeft(s.leftMs) }), dot: "warn" };
    case "battle":
      return { text: t.garageUi.chip.battle, dot: "bad", pulse: true };
    case "notReady":
      return { text: fill(t.garageUi.chip.notReady, { n: s.empty }), dot: "muted" };
    default:
      return { text: t.garageUi.chip.empty, dot: "dashed" };
  }
}

const DOT_COLOR: Record<Exclude<TagDot, "dashed">, string> = { good: M.good, warn: M.warn, bad: M.bad, muted: M.muted };

function StatusChip({ chip }: { chip: Chip }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: FONT_MONO, fontSize: 12, color: M.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      {chip.dot === "dashed" ? (
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: R.pill, border: `1px dashed ${M.muted}`, flex: "0 0 auto" }} />
      ) : (
        <Dot color={DOT_COLOR[chip.dot]} pulse={chip.pulse} />
      )}
      {chip.text}
    </span>
  );
}

/** A spare part on the tool board panel: thumb, name, tier dot, three stats, provenance. */
function SpareRow({ part, onClick }: { part: OwnedPart; onClick: () => void }) {
  const color = TIER_COLOR[part.tier];
  const keys = SLOT_STATS[part.slot];
  return (
    <button
      className={uiCss.press}
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "40px 1fr auto",
        gap: 10,
        alignItems: "center",
        width: "100%",
        minHeight: 56,
        padding: "6px 8px",
        borderRadius: R.inner,
        border: `1px solid ${M.border}`,
        background: M.surface2,
        color: M.text,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span style={{ width: 40, height: 40, borderRadius: 10, border: `2px solid ${color}`, background: K.floor, display: "grid", placeItems: "center", overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={partArt(part).base} alt="" style={{ width: 34, height: 34, objectFit: "contain" }} />
      </span>
      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700 }}>
          <Dot color={color} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{part.name}</span>
        </span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: M.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{part.provenance}</span>
      </span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.lore, display: "flex", gap: 8, fontVariantNumeric: "tabular-nums" }}>
        {keys.map((k, i) => (
          <span key={k}>
            {t.ui.statShort[k]} {part.s[i]}
          </span>
        ))}
      </span>
    </button>
  );
}

/* ── the screen ─────────────────────────────────────────────────────────── */

type SheetState =
  | { kind: "paper" }
  | { kind: "bay"; bay: number }
  | { kind: "recycle"; bay: number }
  | { kind: "tools" }
  | { kind: "part"; uid: string }
  | { kind: "pickBay"; uid: string }
  | { kind: "crew"; who: StrategyKind }
  | null;

export default function GarageClient() {
  const router = useRouter();
  // the one clock read on this screen: once at mount for the store, then once a second
  const mountNow = useRef(0);
  if (mountNow.current === 0 && typeof window !== "undefined") mountNow.current = Date.now();
  const st = useGarage(mountNow.current);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [small, setSmall] = useState(false);
  const [focus, setFocus] = useState(1);
  const [centre, setCentre] = useState<number>(ME.garageNo);
  const [botImg, setBotImg] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streetWrapRef = useRef<HTMLDivElement | null>(null);
  const streetRef = useRef<HTMLCanvasElement | null>(null);
  const garageRef = useRef<GarageHandle | null>(null);
  const streetHandle = useRef<StreetHandle | null>(null);
  const artCache = useRef(new Map<string, PartArt>());
  const spoke = useRef(false);

  const say = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  // ── derived ─────────────────────────────────────────────────────────────
  const bays = useMemo(() => Array.from({ length: BAY_COUNT }, (_, i) => i + 1), []);
  const statuses = useMemo(() => bays.map((b) => bayStatus(st, b, now)), [st, bays, now]);
  const spares = useMemo(() => spareParts(st), [st]);
  const tierOf = useCallback(
    (build: Build | undefined) => {
      if (!build || emptySockets(build).length > 0) return null;
      return botTier(botTotal(build, st.parts));
    },
    [st.parts],
  );

  // ── the garage canvas ───────────────────────────────────────────────────
  const openBayRef = useRef<(b: number) => void>(() => {});
  const sheetRef = useRef<(s: SheetState) => void>(() => {});
  sheetRef.current = setSheet;
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let dead = false;
    let raf = 0;
    let ro: ResizeObserver | null = null;
    const isSmall = typeof matchMedia !== "undefined" && matchMedia("(max-width: 899px)").matches;
    setSmall(isSmall);
    const toyFont = getComputedStyle(wrap).getPropertyValue("--font-bots-toy").trim() || "ui-rounded, Segoe UI, sans-serif";
    pixiChain = pixiChain
      .then(async () => {
        if (dead) return;
        return buildGarage(canvas, {
          small: isSmall,
          toyFont,
          onBayTap: (b) => openBayRef.current(b),
          onCorkboardTap: () => sheetRef.current({ kind: "paper" }),
          onToolBoardTap: () => sheetRef.current({ kind: "tools" }),
          onCrewTap: (who) => sheetRef.current({ kind: "crew", who }),
          onFocus: (b) => setFocus(b),
        });
      })
      .then((g) => {
        if (!g) return;
        if (dead) {
          g.destroy();
          return;
        }
        garageRef.current = g;
        const fit = () => {
          const r = wrap.getBoundingClientRect();
          g.resize(r.width, r.height, Math.min(2, devicePixelRatio || 1));
        };
        fit();
        ro = new ResizeObserver(fit);
        ro.observe(wrap);
        const loop = (nowMs: number) => {
          if (dead) return;
          g.render(nowMs);
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        setReady(true);
      });
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      setReady(false);
      pixiChain = pixiChain.then(() => {
        garageRef.current?.destroy();
        garageRef.current = null;
        artCache.current.clear();
      });
    };
  }, []);

  // ── the street strip ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = streetRef.current;
    const wrap = streetWrapRef.current;
    if (!canvas || !wrap) return;
    const isSmall = typeof matchMedia !== "undefined" && matchMedia("(max-width: 899px)").matches;
    const toyFont = getComputedStyle(wrap).getPropertyValue("--font-bots-toy").trim() || "ui-rounded, Segoe UI, sans-serif";
    const s = buildStreet(canvas, {
      small: isSmall,
      toyFont,
      mine: ME.garageNo,
      onDoorTap: (no) => {
        if (no === ME.garageNo) return;
        say(fill(t.garageUi.neighbour, { n: String(no).padStart(4, "0") }));
      },
    });
    streetHandle.current = s;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      s.resize(r.width, r.height, Math.min(2, devicePixelRatio || 1));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      s.destroy();
      streetHandle.current = null;
    };
  }, [say]);
  useEffect(() => {
    streetHandle.current?.setCentre(centre);
  }, [centre]);

  const loadArt = useCallback(async (g: GarageHandle, part: OwnedPart): Promise<PartArt> => {
    const hit = artCache.current.get(part.id);
    if (hit) return hit;
    const slot = ART_OF_SOCKET[SOCKETS_OF[part.slot][0]];
    const base = (await g.stage.pixi.Assets.load(partFile(slot, part.tier, part.design))) as Texture;
    let mask: Texture | null = null;
    try {
      mask = (await g.stage.pixi.Assets.load(maskFile(slot, part.tier, part.design))) as Texture;
    } catch {
      mask = null; // unpainted is better than unbuilt
    }
    const art = { base, mask };
    artCache.current.set(part.id, art);
    return art;
  }, []);

  // push every bay's build into its rig whenever the garage changes
  useEffect(() => {
    const g = garageRef.current;
    if (!g || !ready) return;
    let cancelled = false;
    (async () => {
      for (const b of bays) {
        const build = st.builds[b];
        const rig = g.rigs[b - 1];
        if (!build) {
          g.setBotVisible(b, false);
          continue;
        }
        const paints: Partial<Record<(typeof SOCKETS)[number], number>> = {};
        for (const socket of SOCKETS) {
          const part = partByUid(st, build.cards[CARD_OF_SOCKET[socket]]);
          const art = part ? await loadArt(g, part) : null;
          if (cancelled) return;
          rig.setArt(socket, art);
          if (part) paints[socket] = hexNum(PAINTS[part.paint]);
        }
        // the decal reads the torso's colour; then every socket takes its own
        const torso = partByUid(st, build.cards.torso);
        rig.setPaint(hexNum(PAINTS[torso?.paint ?? "mint"]));
        paintRigSockets(rig, paints);
        rig.setDecal(build.decal);
        g.setBotVisible(b, true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [st, ready, bays, loadArt]);

  // the tags: name and status, the countdown ticking once a second
  useEffect(() => {
    const g = garageRef.current;
    if (!g || !ready) return;
    bays.forEach((b, i) => {
      const build = st.builds[b];
      const chip = chipOf(statuses[i]);
      const tag: BayTag = {
        name: build ? nameText(build.name) : fill(t.ui.bayLabel, { n: b }),
        status: chip.text,
        dot: chip.dot,
        pulse: chip.pulse,
      };
      g.setTag(b, tag);
    });
  }, [st, statuses, ready, bays]);

  // the crew: one figure per live strategy, and the last fill's chip once
  useEffect(() => {
    const g = garageRef.current;
    if (!g || !ready) return;
    g.setCrew(st.crew.map((c) => c.kind));
    if (!spoke.current && st.crew.length) {
      spoke.current = true;
      const c = st.crew[0];
      g.speak(c.kind, fill(c.kind === "position" ? t.garageUi.speechAdded : t.garageUi.speech, { n: c.lastFillCoins }));
    }
  }, [st.crew, ready]);

  useEffect(() => {
    garageRef.current?.focusBay(focus);
  }, [focus]);

  // the bay sheet's picture: the bot alone, extracted from the stage
  useEffect(() => {
    if (sheet?.kind !== "bay") {
      setBotImg(null);
      return;
    }
    let live = true;
    garageRef.current?.extractBot(sheet.bay).then((url) => {
      if (live) setBotImg(url);
    });
    return () => {
      live = false;
    };
  }, [sheet]);

  // ── actions ─────────────────────────────────────────────────────────────
  const openBay = useCallback(
    (b: number) => {
      if (!st.builds[b]) {
        router.push(`/bots/garage/build?bay=${b}`);
        return;
      }
      setSheet({ kind: "bay", bay: b });
    },
    [st.builds, router],
  );
  openBayRef.current = openBay;

  const newBot = () => {
    const b = firstEmptyBay(st);
    if (b == null) {
      say(t.garage.full);
      return;
    }
    router.push(`/bots/garage/build?bay=${b}`);
  };

  const doRecycle = (b: number) => {
    const build = st.builds[b];
    const r = recycleBay(b);
    if (!r || !build) return;
    setSheet(null);
    say(fill(t.garageUi.recycledBot, { bot: nameText(build.name), coins: r.coins, n: b }));
  };

  const walk = (dir: -1 | 1) => setCentre((c) => Math.max(1, c + dir * 10));

  // ── the screenshot harness hook (dev only; bots-shot.mjs waits on it) ───
  useEffect(() => {
    if (!ready) return;
    const w = window as unknown as Record<string, unknown>;
    w.__bots = {
      ready: true,
      openPaper: () => setSheet({ kind: "paper" }),
      openBay: (b: number) => setSheet({ kind: "bay", bay: b }),
      openRecycle: (b: number) => setSheet({ kind: "recycle", bay: b }),
      openTools: () => setSheet({ kind: "tools" }),
      speak: (who: StrategyKind, text?: string) => garageRef.current?.speak(who, text ?? fill(t.garageUi.speech, { n: 14 })),
      focus: (b: number) => setFocus(b),
      reset: () => resetGarage(Date.now()),
      state: () => ({ coins: st.coins, bays: statuses, spares: spares.length }),
    };
    return () => {
      delete w.__bots;
    };
  }, [ready, st.coins, statuses, spares.length]);

  // ── pieces ──────────────────────────────────────────────────────────────
  const paperLine = (line: (typeof PAPER.lines)[number], i: number) => (
    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 32 }}>
      <span style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}>{line.text}</span>
      {line.link?.kind === "watch" ? (
        <button className={uiCss.press} onClick={() => router.push(`/bots/fight/${line.link && line.link.kind === "watch" ? line.link.id : ""}`)} style={{ minHeight: TAP, minWidth: TAP, padding: "0 12px", borderRadius: R.inner, border: `1px solid #cdbf9f`, background: "transparent", color: "inherit", fontFamily: FONT_BODY, fontWeight: 700, fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <IconPlay size={14} />
          {t.garageUi.watch}
        </button>
      ) : line.link?.kind === "shop" ? (
        <button className={uiCss.press} onClick={() => router.push("/bots/shop")} style={{ minHeight: TAP, minWidth: TAP, padding: "0 12px", borderRadius: R.inner, border: `1px solid #cdbf9f`, background: "transparent", color: "inherit", fontFamily: FONT_BODY, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
          {t.garageUi.shopLink}
        </button>
      ) : null}
    </div>
  );

  /** the cream paper block, shared by the panel and the sheet */
  const paper = (full: boolean) => (
    <div style={{ background: K.paper, color: K.ink, borderRadius: R.inner, padding: full ? "18px 18px 14px" : "12px 14px", position: "relative" }}>
      {full ? (
        <>
          <span aria-hidden style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", color: M.bad, display: "grid" }}>
            <IconPin size={22} />
          </span>
          <div style={{ fontFamily: FONT_TOY, fontSize: 22, fontWeight: 800, textAlign: "center", letterSpacing: 0.4, marginTop: 6 }}>{t.garageUi.masthead}</div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#8a7a63", textAlign: "center", marginBottom: 10 }}>{PAPER.date}</div>
          <div style={{ borderTop: "1px solid #cdbf9f", marginBottom: 6 }} />
        </>
      ) : null}
      {(full ? PAPER.lines : PAPER.lines.slice(0, 2)).map(paperLine)}
    </div>
  );

  const bayRow = (b: number, i: number, tall: boolean) => {
    const build = st.builds[b];
    const chip = chipOf(statuses[i]);
    const tier = tierOf(build);
    return (
      <button
        key={b}
        className={uiCss.press}
        onClick={() => openBay(b)}
        style={{
          display: "grid",
          gridTemplateColumns: "28px 1fr auto 20px",
          gap: 10,
          alignItems: "center",
          width: "100%",
          minHeight: tall ? 56 : TAP,
          padding: "0 6px 0 4px",
          borderRadius: R.inner,
          border: `1px solid ${M.border}`,
          background: M.surface2,
          color: M.text,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted }}>{b}</span>
        <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {build ? nameText(build.name) : fill(t.ui.bayLabel, { n: b })}
            {build ? <Dot color={tier ? TIER_COLOR[tier] : M.muted} /> : null}
            {build ? <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: M.muted, letterSpacing: "0.08em" }}>{tier ? fill(t.ui.tierBadge, { t: tier }) : t.ui.notReadyBadge}</span> : null}
          </span>
        </span>
        <StatusChip chip={chip} />
        <span style={{ color: M.muted, display: "grid" }}>
          <IconChevron size={16} />
        </span>
      </button>
    );
  };

  const canvasFrame: React.CSSProperties = {
    position: "relative",
    width: "100%",
    borderRadius: R.frame,
    border: `1px solid ${M.border}`,
    boxShadow: `inset 0 1px 0 ${M.highlight}`,
    background: K.vignette,
    overflow: "hidden",
  };

  const bayBuild = sheet?.kind === "bay" || sheet?.kind === "recycle" ? st.builds[sheet.bay] : undefined;
  const bayStatusNow = sheet?.kind === "bay" ? statuses[sheet.bay - 1] : null;
  const recycle = sheet?.kind === "recycle" ? recycleRows(st, sheet.bay) : null;
  const sparePart = sheet?.kind === "part" || sheet?.kind === "pickBay" ? partByUid(st, sheet.uid) : null;
  const crewCard = sheet?.kind === "crew" ? st.crew.find((c) => c.kind === sheet.who) ?? null : null;

  return (
    <PageShell wide>
      {/* ── SPROCKET ROW ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 10px" }}>
        <button className={uiCss.press} onClick={() => walk(-1)} aria-label={t.garageUi.walkLeft} title={t.garageUi.walkLeft} style={{ width: TAP, height: TAP, display: "grid", placeItems: "center", borderRadius: R.pill, border: `1px solid ${M.border}`, background: M.surface, color: M.muted, cursor: "pointer", transform: "scaleX(-1)" }}>
          <IconChevron size={18} />
        </button>
        <span style={{ flex: 1, textAlign: "center", fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "0.32em", textTransform: "uppercase", color: M.muted }}>
          {t.garageUi.street} . {fill(t.garage.title, { n: String(centre).padStart(4, "0") })}
          {centre === ME.garageNo ? ` . ${t.garageUi.yourDoor}` : ""}
        </span>
        <button className={uiCss.press} onClick={() => walk(1)} aria-label={t.garageUi.walkRight} title={t.garageUi.walkRight} style={{ width: TAP, height: TAP, display: "grid", placeItems: "center", borderRadius: R.pill, border: `1px solid ${M.border}`, background: M.surface, color: M.muted, cursor: "pointer" }}>
          <IconChevron size={18} />
        </button>
      </div>
      <div ref={streetWrapRef} style={{ ...canvasFrame, height: small ? 80 : 170 }}>
        <canvas ref={streetRef} style={{ display: "block", width: "100%", height: "100%" }} />
      </div>

      {/* ── THE GARAGE ────────────────────────────────────────────────────── */}
      <div ref={wrapRef} style={{ ...canvasFrame, marginTop: 16, aspectRatio: small ? "390 / 300" : "1400 / 520" }}>
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
        {small ? (
          <>
            <span style={{ position: "absolute", top: 8, left: 8 }}>
              <ChipTab onClick={() => setSheet({ kind: "paper" })}>{t.garageUi.paperChip}</ChipTab>
            </span>
            <span style={{ position: "absolute", top: 8, right: 8 }}>
              <ChipTab onClick={() => setSheet({ kind: "tools" })}>{t.garageUi.partsChip}</ChipTab>
            </span>
          </>
        ) : null}
      </div>
      {small ? (
        <div style={{ display: "flex", justifyContent: "center", gap: 2, marginTop: 4 }}>
          {bays.map((b) => (
            <button key={b} className={uiCss.press} onClick={() => setFocus(b)} aria-label={fill(t.garageUi.bayDot, { n: b })} aria-pressed={focus === b} style={{ width: TAP, height: 28, display: "grid", placeItems: "center", background: "transparent", border: "none", cursor: "pointer" }}>
              <span style={{ width: 7, height: 7, borderRadius: R.pill, background: focus === b ? M.accent : M.border, display: "block" }} />
            </button>
          ))}
        </div>
      ) : null}

      {/* ── the three panels (desktop) ────────────────────────────────────── */}
      <div className={uiCss.desktopOnly} style={{ marginTop: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 440fr) minmax(0, 500fr) minmax(0, 420fr)", gap: 20, alignItems: "start" }}>
          <Panel title={t.garage.paper} aside={<span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted }}>{PAPER.date}</span>}>
            {paper(false)}
            <div style={{ marginTop: 10 }}>
              <Button onClick={() => setSheet({ kind: "paper" })}>{t.garageUi.readAll}</Button>
            </div>
          </Panel>
          <Panel title={t.garageUi.bays} aside={<Button onClick={newBot} style={{ minHeight: 34, padding: "6px 12px", fontSize: 12.5 }}>{t.garageUi.newBot}</Button>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{bays.map((b, i) => bayRow(b, i, false))}</div>
          </Panel>
          <Panel title={t.garageUi.toolBoard} aside={<span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted }}>{fill(t.garageUi.spares, { n: spares.length })}</span>}>
            {spares.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto", scrollbarWidth: "thin" }}>
                {spares.map((p) => (
                  <SpareRow key={p.uid} part={p} onClick={() => setSheet({ kind: "part", uid: p.uid })} />
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12.5, color: M.muted }}>{t.garageUi.noSpares}</p>
            )}
          </Panel>
        </div>
      </div>

      {/* ── the five bay rows (phone) ─────────────────────────────────────── */}
      <div className={uiCss.mobileOnly} style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 700, letterSpacing: "0.32em", color: M.muted }}>{t.garageUi.bays}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CoinChip coins={st.coins} ariaLabel={t.nav.coinsAria} />
            <Button onClick={newBot} style={{ minHeight: 36, padding: "6px 12px", fontSize: 12.5 }}>{t.garageUi.newBot}</Button>
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{bays.map((b, i) => bayRow(b, i, true))}</div>
      </div>

      {/* ── the toast ─────────────────────────────────────────────────────── */}
      {toast ? (
        <div className={uiCss.toast} role="status" style={{ position: "fixed", left: 0, right: 0, top: 64, display: "flex", justifyContent: "center", zIndex: 1200, pointerEvents: "none" }}>
          <span style={{ padding: "10px 16px", borderRadius: R.pill, background: M.surface, border: `1px solid ${M.border}`, fontSize: 13, fontWeight: 600 }}>{toast}</span>
        </div>
      ) : null}

      {/* ── sheets ────────────────────────────────────────────────────────── */}
      {sheet?.kind === "paper" ? (
        <Sheet title={t.garage.paper} onClose={() => setSheet(null)}>
          {paper(true)}
        </Sheet>
      ) : null}

      {sheet?.kind === "bay" && bayBuild && bayStatusNow ? (
        <Sheet title={nameText(bayBuild.name)} onClose={() => setSheet(null)} action={<StatusChip chip={chipOf(bayStatusNow)} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <span style={{ width: 120, height: 120, borderRadius: 14, border: `1px solid ${M.border}`, background: `linear-gradient(180deg, ${K.wall}, ${K.floor})`, display: "grid", placeItems: "center", flex: "0 0 auto", overflow: "hidden" }}>
                {botImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={botImg} alt="" style={{ maxWidth: 104, maxHeight: 104, objectFit: "contain" }} />
                ) : null}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_MONO, fontSize: 12, letterSpacing: "0.12em" }}>
                  {(() => {
                    const tier = tierOf(bayBuild);
                    return (
                      <>
                        <Dot color={tier ? TIER_COLOR[tier] : M.muted} />
                        <span>{tier ? fill(t.ui.tierBadge, { t: tier }) : t.ui.notReadyBadge}</span>
                        <span style={{ color: M.muted, letterSpacing: 0 }}>{fill(t.ui.pts, { n: botTotal(bayBuild, st.parts) })}</span>
                      </>
                    );
                  })()}
                </div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 14, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
                  {fill(t.garageUi.record, { w: st.bays[sheet.bay]?.wins ?? 0, l: st.bays[sheet.bay]?.losses ?? 0 })}
                </div>
                {bayStatusNow.kind === "shop" ? (
                  <div style={{ fontSize: 12.5, color: M.warn, marginTop: 6 }}>{fill(t.garageUi.repairLine, { time: formatLeft(bayStatusNow.leftMs) })}</div>
                ) : null}
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${M.border}` }} />
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: "0.32em", color: M.muted }}>{t.garageUi.lastFights}</div>
            {(FIGHTS[sheet.bay] ?? []).length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(FIGHTS[sheet.bay] ?? []).map((f) => (
                  <div key={f.id} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto auto", gap: 10, alignItems: "center", minHeight: 52 }}>
                    <Dot color={f.result === "win" ? M.good : M.bad} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fill(f.result === "win" ? t.garageUi.beat : t.garageUi.lostTo, { bot: f.opponent })}
                        <span style={{ color: M.muted }}> . {f.wallet}</span>
                      </span>
                      <span style={{ display: "block", fontFamily: FONT_MONO, fontSize: 11, color: M.muted }}>
                        {f.finisher} . {f.date}
                      </span>
                    </span>
                    <Button onClick={() => router.push(`/bots/fight/${f.id}`)} style={{ minHeight: TAP, padding: "0 12px" }}>
                      <IconPlay size={16} />
                      {t.garageUi.watch}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12.5, color: M.muted }}>{t.garageUi.noFights}</p>
            )}
            <div style={{ borderTop: `1px solid ${M.border}` }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Button variant="primary" onClick={() => router.push(`/bots/garage/build?bay=${sheet.bay}`)}>
                {t.nav.build}
              </Button>
              <Button disabled={bayStatusNow.kind !== "ready"} onClick={() => router.push("/bots/battles")}>
                {t.build.toBattle}
              </Button>
              <span style={{ marginLeft: "auto" }}>
                <Button variant="sell" onClick={() => setSheet({ kind: "recycle", bay: sheet.bay })}>
                  <IconRecycle size={16} />
                  {t.garageUi.recycle}
                </Button>
              </span>
            </div>
          </div>
        </Sheet>
      ) : null}

      {sheet?.kind === "recycle" && bayBuild && recycle ? (
        <Sheet title={fill(t.recycle.title, { bot: nameText(bayBuild.name) })} onClose={() => setSheet({ kind: "bay", bay: sheet.bay })}>
          <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>{t.recycle.back}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: FONT_MONO, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            {recycle.rows.map((r) => (
              <div key={r.part.uid} style={{ display: "grid", gridTemplateColumns: "1fr 10px 40px 60px", gap: 10, alignItems: "center", minHeight: 28 }}>
                <span style={{ fontFamily: FONT_BODY, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.part.name} {t.ui.card[r.part.slot].toLowerCase()}
                  {r.count === 2 ? ` ${t.garageUi.pair}` : ""}
                </span>
                <Dot color={TIER_COLOR[r.part.tier]} />
                <span style={{ color: M.muted }}>T{r.part.tier}</span>
                <span style={{ textAlign: "right" }}>{r.coins}</span>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${M.border}`, marginTop: 6, paddingTop: 8, display: "grid", gridTemplateColumns: "1fr 60px", gap: 10 }}>
              <span style={{ color: M.muted }}>{t.garageUi.total}</span>
              <span style={{ textAlign: "right" }}>{recycle.total}</span>
            </div>
          </div>
          <p style={{ margin: "12px 0", fontSize: 12.5, color: M.muted }}>{fill(t.recycle.note, { n: sheet.bay })}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="sell" onClick={() => doRecycle(sheet.bay)}>
              {fill(t.recycle.confirm, { coins: recycle.total })}
            </Button>
            <Button onClick={() => setSheet({ kind: "bay", bay: sheet.bay })}>{t.recycle.keep}</Button>
          </div>
        </Sheet>
      ) : null}

      {sheet?.kind === "tools" ? (
        <Sheet title={t.garageUi.toolBoard} onClose={() => setSheet(null)} action={<span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted }}>{fill(t.garageUi.spares, { n: spares.length })}</span>}>
          {spares.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {spares.map((p) => (
                <SpareRow key={p.uid} part={p} onClick={() => setSheet({ kind: "part", uid: p.uid })} />
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12.5, color: M.muted }}>{t.garageUi.noSpares}</p>
          )}
        </Sheet>
      ) : null}

      {sheet?.kind === "part" && sparePart ? (
        <Sheet title={sparePart.name} onClose={() => setSheet(null)}>
          <SpareLore
            part={sparePart}
            onPutOn={() => setSheet({ kind: "pickBay", uid: sparePart.uid })}
            onRecycle={() => {
              const r = recyclePart(sparePart.uid);
              setSheet(null);
              if (r) say(fill(t.garageUi.recycledPart, { name: sparePart.name, coins: r.coins }));
            }}
          />
        </Sheet>
      ) : null}

      {sheet?.kind === "pickBay" && sparePart ? (
        <Sheet title={t.garageUi.pickBay} onClose={() => setSheet({ kind: "part", uid: sparePart.uid })}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {bays
              .filter((b) => st.builds[b])
              .map((b) => (
                <Button
                  key={b}
                  full
                  onClick={() => {
                    if (putOnBay(sparePart.uid, b)) {
                      setSheet(null);
                      say(fill(t.garageUi.swapped, { name: sparePart.name, n: b }));
                    }
                  }}
                >
                  {fill(t.garageUi.putOn, { n: b })} . {nameText(st.builds[b].name)}
                </Button>
              ))}
          </div>
        </Sheet>
      ) : null}

      {sheet?.kind === "crew" && crewCard ? (
        <Sheet title={fill(t.garageUi.crewTitle, { kind: t.garageUi.strategyKind[crewCard.kind] })} onClose={() => setSheet(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13.5 }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fill(t.garageUi.crewFills, { n: crewCard.fillsToday })}</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fill(t.garageUi.crewCoins, { n: crewCard.coinsToday })}</div>
            <div style={{ color: M.lore }}>{fill(t.garageUi.crewTokens, { tokens: crewCard.tokens.join(", ") })}</div>
            <div>
              <Button onClick={() => router.push("/bots/strategy")}>{t.garageUi.changeStrategy}</Button>
            </div>
          </div>
        </Sheet>
      ) : null}
    </PageShell>
  );
}

/** The lore card for a spare part (screens doc 5.1) with the tool board's two buttons. */
function SpareLore({ part, onPutOn, onRecycle }: { part: OwnedPart; onPutOn: () => void; onRecycle: () => void }) {
  const color = TIER_COLOR[part.tier];
  const keys = SLOT_STATS[part.slot];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <span style={{ width: 96, height: 96, borderRadius: 14, border: `3px solid ${color}`, background: `linear-gradient(180deg, ${K.paper}, ${K.floor})`, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={partArt(part).base} alt="" style={{ width: 80, height: 80, objectFit: "contain" }} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700 }}>{part.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_MONO, fontSize: 11, color: M.muted, marginTop: 4 }}>
            <Dot color={color} />
            {t.ui.card[part.slot]} . {fill(t.ui.tierWord, { t: part.tier })} . {fill(t.ui.pts, { n: partTotal(part) })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_MONO, fontSize: 11, color: M.muted, marginTop: 4 }}>
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: R.pill, background: PAINTS[part.paint], display: "inline-block" }} />
            {fill(t.set.line, { family: part.family, color: t.paintName[part.paint] })}
          </div>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${M.border}` }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {keys.map((k, i) => {
          const Icon = STAT_ICON[k];
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: M.muted, display: "grid" }}>
                <Icon size={16} />
              </span>
              <span style={{ fontSize: 12, color: M.text, flex: 1 }}>{t.ui.stat[k]}</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{part.s[i]}</span>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: `1px solid ${M.border}` }} />
      <p style={{ margin: 0, fontSize: 12.5, color: M.lore, lineHeight: 1.5 }}>{part.lore}</p>
      <div style={{ borderTop: `1px solid ${M.border}` }} />
      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: M.muted }}>{part.provenance}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Button variant="primary" onClick={onPutOn}>
          {t.garageUi.putOnAny}
        </Button>
        <Button variant="sell" onClick={onRecycle}>
          {fill(t.part.recycleFor, { coins: recycleValue(part) })}
        </Button>
      </div>
    </div>
  );
}

export type { GarageState };
