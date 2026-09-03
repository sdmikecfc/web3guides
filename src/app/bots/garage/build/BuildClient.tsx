/**
 * THE BUILD SCREEN (screens doc 2.1 and 2.2): the mech-lab bay. A bot on a
 * lift, seven hotspots, a tier-coloured parts tray, a live mono readout with
 * delta chips and the live tier badge, the SET PANEL (the guide's matched
 * sets), the name sheet from two fixed tables, eight paints that now COST
 * coins, and six decals. Drag or tap on desktop, tap-then-sheet on a phone,
 * every target 44px.
 *
 * Client shell in the S7 Battlefield shape (src/app/s7/front/Battlefield.tsx):
 * owns the rAF, builds the bay through the one pixi chain, fits it with a
 * ResizeObserver on the wrapper (never the canvas), and keeps every number in
 * the DOM.
 *
 * WEEK 2: the tray reads the ONE catalog (fixtures.ts on the engine's
 * PartCard, field `s`); owned parts, coins and the saved builds live in
 * src/lib/bots/garage-state.ts. Paint is per PART (OwnedPart.paint): a
 * swatch tap opens a confirm that says "Paint job: 25 coins" and only a
 * confirm charges the coins and recolours the parts.
 */
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Texture } from "pixi.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "../../_components/PageShell";
import { IconCoin, IconPegboard, IconPencil, SLOT_ICON, STAT_ICON } from "../../_ui/icons";
import { Button, ChipTab, CoinChip, Dot, Panel, Sheet, uiCss, useCountUp } from "../../_ui/primitives";
import {
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  K,
  M,
  PAINTS,
  PAINT_IDS,
  R,
  T,
  TAP,
  TIER_COLOR,
  Z,
  type PaintId,
} from "../../_ui/tokens";
import { buildBay, type BayHandle, type RingState } from "../../_view/bay";
import { paintRigSockets } from "../../_view/garage";
import { ART_OF_SOCKET, type PartArt } from "../../_view/rig";
import { maskFile, partFile } from "../../_view/rig-points";
import {
  BAY_COUNT,
  BODY_SLOTS,
  CARD_OF_SOCKET,
  CARD_SLOTS,
  DECAL_IDS,
  FIRST_WORDS,
  PAINT_COST,
  SECOND_WORDS,
  SLOT_STATS,
  SOCKETS,
  SOCKETS_OF,
  STAT_KEYS,
  botStats,
  botTier,
  botTotal,
  emptySockets,
  nameText,
  partArt,
  partTotal,
  recycleValue,
  setProgress,
  starterBuild,
  type Build,
  type CardSlot,
  type DecalId,
  type OwnedPart,
  type Socket,
  type StatKey,
  type Tier,
} from "@/lib/bots/fixtures";
import { bayOfPart, isHydratedState, paintCost, paintParts, saveBuild, useGarage } from "@/lib/bots/garage-state";
import { STRINGS, fill } from "@/lib/bots/strings";

const t = STRINGS.en;
const hexNum = (h: string): number => parseInt(h.slice(1), 16);
const SNAP_CSS = 60;
const DRAG_START_PX = 4;
const LORE_HOVER_MS = 350;
const LONG_PRESS_MS = 450;

/** React StrictMode dev-mounts effects twice; two app.init() calls racing on
 * ONE canvas kill each other's shaders (the Battlefield law). Every build AND
 * destroy is chained through this promise. */
let pixiChain: Promise<void> = Promise.resolve();

/* ── sfx: a trimmed adapted copy of src/app/chef/game/_view/sfx.ts ──────── */

type SfxName = "clunk" | "ratchet" | "hum" | "back";
interface Preset {
  f0: number;
  f1: number;
  dur: number;
  type: OscillatorType;
  vol: number;
  attackMs: number;
  /** a lowpassed noise click of this many ms on top */
  noiseMs?: number;
}
/** the clunk: sine 140Hz to 90Hz over 90ms plus a 20ms noise click, jittered 4% */
const PRESETS: Record<SfxName, Preset> = {
  clunk: { f0: 140, f1: 90, dur: 0.09, type: "sine", vol: 0.18, attackMs: 2, noiseMs: 20 },
  ratchet: { f0: 1200, f1: 880, dur: 0.05, type: "square", vol: 0.05, attackMs: 1 },
  hum: { f0: 68, f1: 86, dur: 0.6, type: "triangle", vol: 0.07, attackMs: 40 },
  back: { f0: 320, f1: 220, dur: 0.08, type: "triangle", vol: 0.05, attackMs: 3 },
};

function createSfx() {
  let ctx: AudioContext | null = null;
  const ensure = (): AudioContext | null => {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      ctx = AC ? new AC() : null;
    } catch {
      ctx = null;
    }
    return ctx;
  };
  return {
    play(name: SfxName) {
      try {
        const c = ensure();
        if (!c) return;
        if (c.state === "suspended") void c.resume();
        const p = PRESETS[name];
        const now = c.currentTime;
        // Math.random() is allowed here: page-side only, never in a sim
        const vol = Math.max(0.0002, p.vol * (1 + (Math.random() * 2 - 1) * 0.04));
        const gain = c.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(vol, now + p.attackMs / 1000);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + p.dur);
        gain.connect(c.destination);
        const osc = c.createOscillator();
        osc.type = p.type;
        osc.frequency.setValueAtTime(p.f0, now);
        osc.frequency.exponentialRampToValueAtTime(p.f1, now + p.dur);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + p.dur + 0.03);
        if (p.noiseMs) {
          const len = Math.floor((c.sampleRate * p.noiseMs) / 1000);
          const buf = c.createBuffer(1, len, c.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
          const src = c.createBufferSource();
          src.buffer = buf;
          const lp = c.createBiquadFilter();
          lp.type = "lowpass";
          lp.frequency.value = 1800;
          const ng = c.createGain();
          ng.gain.value = vol * 0.6;
          src.connect(lp);
          lp.connect(ng);
          ng.connect(c.destination);
          src.start(now);
        }
      } catch {
        // audio must never break the screen
      }
    },
  };
}

/* ── the six decals, drawn (never images) ───────────────────────────────── */

function DecalGlyph({ id, size = 24 }: { id: DecalId; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true as const };
  const c = "currentColor";
  switch (id) {
    case "plate":
      return (
        <svg {...common} fill="none" stroke={c} strokeWidth={2}>
          <rect x="3" y="7.5" width="18" height="9" rx="2" />
          <circle cx="8" cy="12" r="1.2" fill={c} />
          <circle cx="16" cy="12" r="1.2" fill={c} />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common} fill={c}>
          <path d="M11 2 5 13h5l-1 9 8-12h-5z" />
        </svg>
      );
    case "star":
      return (
        <svg {...common} fill={c}>
          <path d="M12 2.5l2.8 6 6.5.7-4.9 4.5 1.4 6.4L12 16.8l-5.8 3.3 1.4-6.4-4.9-4.5 6.5-.7z" />
        </svg>
      );
    case "stripes":
      return (
        <svg {...common} fill={c}>
          <rect x="3" y="5" width="18" height="3" rx="1.5" />
          <rect x="3" y="10.5" width="18" height="3" rx="1.5" />
          <rect x="3" y="16" width="18" height="3" rx="1.5" />
        </svg>
      );
    case "wrenches":
      return (
        <svg {...common} fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round">
          <path d="M5 19 17 7M19 19 7 7" />
          <circle cx="18" cy="6" r="2.4" />
          <circle cx="6" cy="6" r="2.4" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common} fill={c}>
          <path d="M12 20.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 8.1a4.2 4.2 0 0 1 7.5 2.4c0 5.4-7.5 10-7.5 10z" />
        </svg>
      );
  }
}

/* ── small readout pieces ───────────────────────────────────────────────── */

/** A value that counts up, with a "+4" / "-2" chip beside it for 900ms. */
function useDelta(value: number): { shown: number; delta: number | null; key: number } {
  const shown = useCountUp(value, T.count);
  const prev = useRef(value);
  const [delta, setDelta] = useState<number | null>(null);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (value === prev.current) return;
    const d = value - prev.current;
    prev.current = value;
    setDelta(d);
    setKey((k) => k + 1);
    const id = setTimeout(() => setDelta(null), T.delta);
    return () => clearTimeout(id);
  }, [value]);
  return { shown, delta, key };
}

function DeltaChip({ delta, k }: { delta: number | null; k: number }) {
  if (delta == null || delta === 0) return null;
  return (
    <span
      key={k}
      className={uiCss.delta}
      style={{
        fontFamily: FONT_BODY,
        fontSize: 11,
        fontWeight: 700,
        color: delta > 0 ? M.good : M.bad,
        marginLeft: 6,
        minWidth: 22,
        display: "inline-block",
      }}
    >
      {delta > 0 ? `+${delta}` : `${delta}`}
    </span>
  );
}

function StatRow({ stat, value }: { stat: StatKey; value: number }) {
  const { shown, delta, key } = useDelta(value);
  const Icon = STAT_ICON[stat];
  return (
    <div style={{ display: "flex", alignItems: "center", height: 28, gap: 10 }}>
      <span style={{ color: M.muted, display: "grid" }}>
        <Icon size={16} />
      </span>
      <span style={{ flex: 1, fontFamily: FONT_BODY, fontSize: 12.5, color: M.text }}>{t.ui.stat[stat]}</span>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", minWidth: 60 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 14, fontVariantNumeric: "tabular-nums", color: M.text }}>
          {shown}
        </span>
        <DeltaChip delta={delta} k={key} />
      </span>
    </div>
  );
}

function StatTile({ stat, value }: { stat: StatKey; value: number }) {
  const { shown, delta, key } = useDelta(value);
  return (
    <div
      style={{
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 10px",
        borderRadius: R.inner,
        background: M.surface,
        border: `1px solid ${M.border}`,
      }}
    >
      <span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: M.muted }}>
        {t.ui.stat[stat]}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center" }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{shown}</span>
        <DeltaChip delta={delta} k={key} />
      </span>
    </div>
  );
}

function TierBadge({ tier, total, empty, pop }: { tier: Tier | null; total: number; empty: number; pop: number }) {
  const color = tier ? TIER_COLOR[tier] : M.muted;
  return (
    <span
      key={pop}
      className={pop ? uiCss.coinPop : undefined}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: FONT_MONO, fontSize: 12, letterSpacing: "0.12em" }}
    >
      <Dot color={color} />
      <span style={{ color: tier ? M.text : M.warn }}>
        {tier ? fill(t.ui.tierBadge, { t: tier }) : t.ui.notReadyBadge}
      </span>
      <span style={{ color: M.muted, letterSpacing: 0 }}>
        {tier ? fill(t.ui.pts, { n: total }) : fill(t.ui.emptyCount, { n: empty })}
      </span>
    </span>
  );
}

/** "Kettle . mint" with the colour as a small swatch (every card, the guide);
 * a weapon says so, since it never carries a family or paint. */
function SetLine({ part }: { part: OwnedPart }) {
  if (!part.familyName) {
    return <span style={{ fontFamily: FONT_BODY, fontSize: 11, color: M.muted, whiteSpace: "nowrap" }}>{t.set.weaponLine}</span>;
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: FONT_BODY, fontSize: 11, color: M.muted, whiteSpace: "nowrap" }}>
      {part.paint ? <span aria-hidden style={{ width: 8, height: 8, borderRadius: R.pill, background: PAINTS[part.paint], display: "inline-block", flex: "0 0 auto" }} /> : null}
      {fill(t.set.line, { family: part.familyName, color: part.paint ? t.paintName[part.paint] : t.set.noPaint })}
    </span>
  );
}

/* ── the tray card (264x88 on desktop, full width in the sheet) ─────────── */

function PartCard({
  part,
  onBot,
  selected,
  onSelect,
  onEquip,
  onPointerDown,
  onHoverStart,
  onHoverEnd,
  onLongPress,
  full,
}: {
  part: OwnedPart;
  onBot: boolean;
  selected: boolean;
  onSelect: () => void;
  onEquip: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onHoverStart?: (rect: DOMRect) => void;
  onHoverEnd?: () => void;
  onLongPress?: () => void;
  full?: boolean;
}) {
  const color = TIER_COLOR[part.tier];
  const keys = SLOT_STATS[part.slot];
  const pressTimer = useRef<number | null>(null);
  const longFired = useRef(false);
  return (
    <button
      className={uiCss.press}
      onClick={() => {
        if (longFired.current) {
          longFired.current = false;
          return;
        }
        if (selected) onEquip();
        else onSelect();
      }}
      onPointerDown={(e) => {
        longFired.current = false;
        if (onLongPress) {
          pressTimer.current = window.setTimeout(() => {
            longFired.current = true;
            onLongPress();
          }, LONG_PRESS_MS);
        }
        onPointerDown?.(e);
      }}
      onPointerUp={() => {
        if (pressTimer.current) clearTimeout(pressTimer.current);
      }}
      onPointerCancel={() => {
        if (pressTimer.current) clearTimeout(pressTimer.current);
      }}
      onMouseEnter={(e) => onHoverStart?.(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={onHoverEnd}
      aria-pressed={selected}
      style={{
        display: "grid",
        gridTemplateColumns: "3px 64px 1fr",
        gap: 10,
        alignItems: "center",
        width: full ? "100%" : 264,
        height: 88,
        padding: "0 10px 0 0",
        borderRadius: R.inner,
        border: `1px solid ${selected ? M.accent : M.border}`,
        background: selected ? M.surface2 : M.surface,
        color: M.text,
        textAlign: "left",
        cursor: "pointer",
        overflow: "hidden",
        touchAction: "pan-y",
      }}
    >
      <span style={{ width: 3, height: "100%", background: color, display: "block" }} />
      <span
        style={{
          width: 64,
          height: 64,
          borderRadius: 12,
          border: `2px solid ${color}`,
          background: K.floor,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={partArt(part).base} alt="" draggable={false} style={{ width: 56, height: 56, objectFit: "contain" }} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {part.name}
          </span>
          {onBot ? <Dot color={M.good} size={6} /> : null}
        </span>
        {/* "Legs . T2" then "Kettle . mint": the green dot already says "on bot",
            so the words make room for the set line inside 264px */}
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_BODY, fontSize: 11, color: M.muted, minWidth: 0 }}>
          <span style={{ whiteSpace: "nowrap" }}>
            {t.ui.card[part.slot]} . T{part.tier}
          </span>
          <SetLine part={part} />
        </span>
        {selected && !full ? (
          <span
            style={{
              fontFamily: FONT_BODY,
              fontSize: 12,
              fontWeight: 700,
              color: M.accent,
            }}
          >
            {t.build.equip}
          </span>
        ) : (
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.lore, display: "flex", gap: 8, fontVariantNumeric: "tabular-nums" }}>
            {keys.map((k, i) => (
              <span key={k}>
                {t.ui.statShort[k]} {part.s[i]}
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  );
}

/** The lore card body (screens doc 5.1), shared by the popover and the sheet. */
function LoreBody({ part, onEquip }: { part: OwnedPart; onEquip: () => void }) {
  const color = TIER_COLOR[part.tier];
  const keys = SLOT_STATS[part.slot];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <span
          style={{
            width: 96,
            height: 96,
            borderRadius: 14,
            border: `3px solid ${color}`,
            background: `linear-gradient(180deg, ${K.paper}, ${K.floor})`,
            display: "grid",
            placeItems: "center",
            flex: "0 0 auto",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={partArt(part).base} alt="" style={{ width: 80, height: 80, objectFit: "contain" }} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700 }}>{part.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_MONO, fontSize: 11, color: M.muted, marginTop: 4 }}>
            <Dot color={color} />
            {t.ui.card[part.slot]} . {fill(t.ui.tierWord, { t: part.tier })} . {fill(t.ui.pts, { n: partTotal(part) })}
          </div>
          <div style={{ marginTop: 4 }}>
            <SetLine part={part} />
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
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button variant="primary" onClick={onEquip}>
          {t.build.equip}
        </Button>
        <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.sell }}>{fill(t.part.recycleFor, { coins: recycleValue(part) })}</span>
      </div>
    </div>
  );
}

/* ── the screen ─────────────────────────────────────────────────────────── */

type SheetState =
  | { kind: "parts"; slot: CardSlot; socket: Socket }
  | { kind: "name" }
  | { kind: "decal" }
  | { kind: "paint"; paint: PaintId }
  | null;

type PaintTarget = "all" | CardSlot;

interface DragState {
  uid: string;
  x: number;
  y: number;
  /** set when springing back to the card */
  spring: boolean;
}

export default function BuildClient() {
  const params = useSearchParams();
  const router = useRouter();
  const bayNo = Math.min(BAY_COUNT, Math.max(1, Number(params.get("bay")) || 1));

  // the store: owned parts, coins and the saved builds (the one clock read is at mount)
  const mountNow = useRef(0);
  if (mountNow.current === 0 && typeof window !== "undefined") mountNow.current = Date.now();
  const st = useGarage(mountNow.current);
  // the tray shows every owned part that is not on ANOTHER saved bot
  const parts = useMemo(
    () =>
      st.parts.filter((p) => {
        const b = bayOfPart(st, p.uid);
        return b == null || b === bayNo;
      }),
    [st, bayNo],
  );

  const [build, setBuild] = useState<Build>(() => starterBuild(bayNo));
  const [filter, setFilter] = useState<CardSlot | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [paintTarget, setPaintTarget] = useState<PaintTarget>("all");
  const [loreSheet, setLoreSheet] = useState<string | null>(null);
  const [lore, setLore] = useState<{ uid: string; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tierPop, setTierPop] = useState(0);
  const [ready, setReady] = useState(false);
  const [small, setSmall] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bayRef = useRef<BayHandle | null>(null);
  const artCache = useRef(new Map<string, PartArt>());
  const sfx = useMemo(() => createSfx(), []);
  const pendingFlash = useRef<Socket[]>([]);
  const loreTimer = useRef<number | null>(null);
  const dragStart = useRef<{ uid: string; x: number; y: number; moved: boolean } | null>(null);

  const say = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  // ── derived numbers (whole numbers, in the DOM) ─────────────────────────
  const stats = useMemo(() => botStats(build, st.parts), [build, st.parts]);
  const total = useMemo(() => botTotal(build, st.parts), [build, st.parts]);
  const empties = useMemo(() => emptySockets(build), [build]);
  const sets = useMemo(() => setProgress(build, st.parts), [build, st.parts]);
  const complete = empties.length === 0;
  const tier: Tier | null = complete ? botTier(total) : null;
  const partOf = useCallback((uid: string | null) => (uid ? st.parts.find((p) => p.uid === uid) ?? null : null), [st.parts]);
  const rings = useMemo<Record<Socket, RingState>>(() => {
    const out = {} as Record<Socket, RingState>;
    for (const s of SOCKETS) {
      const p = partOf(build.cards[CARD_OF_SOCKET[s]]);
      out[s] = { filled: !!p, tier: p ? p.tier : null };
    }
    return out;
  }, [build, partOf]);
  const armingSlot: CardSlot | null = drag
    ? partOf(drag.uid)?.slot ?? null
    : selected
      ? partOf(selected)?.slot ?? null
      : sheet?.kind === "parts"
        ? sheet.slot
        : null;

  // ── the saved build, once the store has hydrated ────────────────────────
  const loadedBay = useRef<number | null>(null);
  useEffect(() => {
    if (!isHydratedState(st) || loadedBay.current === bayNo) return;
    loadedBay.current = bayNo;
    const saved = st.builds[bayNo];
    setBuild(saved ? { ...saved, cards: { ...saved.cards } } : starterBuild(bayNo));
  }, [st, bayNo]);

  // ── the bay ─────────────────────────────────────────────────────────────
  const tapRef = useRef<(s: Socket) => void>(() => {});
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let dead = false;
    let raf = 0;
    let ro: ResizeObserver | null = null;
    const isSmall = typeof matchMedia !== "undefined" && matchMedia("(max-width: 899px)").matches;
    setSmall(isSmall);
    const toyFont =
      getComputedStyle(wrap).getPropertyValue("--font-bots-toy").trim() || "ui-rounded, Segoe UI, sans-serif";
    pixiChain = pixiChain
      .then(async () => {
        if (dead) return;
        return buildBay(canvas, {
          small: isSmall,
          toyFont,
          onSocketTap: (s) => tapRef.current(s),
        });
      })
      .then((bay) => {
        if (!bay) return;
        if (dead) {
          bay.destroy();
          return;
        }
        bayRef.current = bay;
        const fit = () => {
          const r = wrap.getBoundingClientRect();
          bay.resize(r.width, r.height, Math.min(2, devicePixelRatio || 1));
        };
        fit();
        ro = new ResizeObserver(fit);
        ro.observe(wrap);
        bay.open();
        sfx.play("hum");
        const loop = (now: number) => {
          if (dead) return;
          bay.render(now);
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
        bayRef.current?.destroy();
        bayRef.current = null;
        artCache.current.clear();
      });
    };
  }, [sfx]);

  const loadArt = useCallback(async (bay: BayHandle, part: OwnedPart): Promise<PartArt> => {
    const hit = artCache.current.get(part.id);
    if (hit) return hit;
    const slot = ART_OF_SOCKET[SOCKETS_OF[part.slot][0]];
    const base = (await bay.stage.pixi.Assets.load(partFile(slot, part.tier, part.design))) as Texture;
    let mask: Texture | null = null;
    try {
      mask = (await bay.stage.pixi.Assets.load(maskFile(slot, part.tier, part.design))) as Texture;
    } catch {
      mask = null; // unpainted is better than unbuilt
    }
    const art = { base, mask };
    artCache.current.set(part.id, art);
    return art;
  }, []);

  // push the build into the bay whenever it changes (per-part paint included)
  useEffect(() => {
    const bay = bayRef.current;
    if (!bay || !ready) return;
    let cancelled = false;
    (async () => {
      const paints: Partial<Record<Socket, number>> = {};
      for (const socket of SOCKETS) {
        const part = partOf(build.cards[CARD_OF_SOCKET[socket]]);
        const art = part ? await loadArt(bay, part) : null;
        if (cancelled) return;
        bay.rig.setArt(socket, art);
        // an unpainted part (a weapon) keeps its clay: a white multiply is no tint
        if (part) paints[socket] = part.paint ? hexNum(PAINTS[part.paint]) : 0xffffff;
      }
      // the decal reads the torso's colour; then every socket takes its own
      const torso = partOf(build.cards.torso);
      bay.rig.setPaint(hexNum(PAINTS[torso?.paint ?? "mint"]));
      paintRigSockets(bay.rig, paints);
      bay.rig.setDecal(build.decal);
      bay.setName(nameText(build.name));
      bay.setRings(rings);
      for (const s of pendingFlash.current) bay.flashRing(s);
      pendingFlash.current = [];
    })();
    return () => {
      cancelled = true;
    };
  }, [build, ready, rings, partOf, loadArt]);

  // arming and the ghost preview
  useEffect(() => {
    const bay = bayRef.current;
    if (!bay || !ready) return;
    bay.setArming(armingSlot);
    let cancelled = false;
    (async () => {
      for (const s of SOCKETS) bay.rig.setGhost(s, null);
      const part = partOf(selected);
      if (!part || drag) return;
      const target = SOCKETS_OF[part.slot].find((s) => !build.cards[CARD_OF_SOCKET[s]]) ?? SOCKETS_OF[part.slot][0];
      const art = await loadArt(bay, part);
      if (cancelled) return;
      // a pair card ghosts both sockets
      for (const s of SOCKETS_OF[part.slot]) {
        if (s === target || !build.cards[CARD_OF_SOCKET[s]]) bay.rig.setGhost(s, art);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [armingSlot, selected, drag, build, ready, partOf, loadArt]);

  // the tier ratchet
  const prevTier = useRef<Tier | null>(tier);
  useEffect(() => {
    if (tier === prevTier.current) return;
    prevTier.current = tier;
    if (tier) {
      setTierPop((n) => n + 1);
      sfx.play("ratchet");
    }
  }, [tier, sfx]);

  // ── actions ─────────────────────────────────────────────────────────────
  const equip = useCallback(
    (uid: string) => {
      const part = partOf(uid);
      if (!part) return;
      setBuild((b) => ({ ...b, cards: { ...b.cards, [part.slot]: uid } }));
      pendingFlash.current = [...SOCKETS_OF[part.slot]];
      sfx.play("clunk");
      setSelected(null);
      setSheet(null);
      setLoreSheet(null);
      setLore(null);
    },
    [partOf, sfx],
  );

  tapRef.current = (socket: Socket) => {
    const slot = CARD_OF_SOCKET[socket];
    const sel = partOf(selected);
    if (sel && sel.slot === slot) {
      equip(sel.uid);
      return;
    }
    // a phone, or a desktop tap on a ring with nothing selected: the sheet
    setFilter(slot);
    setSheet({ kind: "parts", slot, socket });
  };

  const save = () => {
    saveBuild({ ...build, bay: bayNo });
    say(fill(t.ui.saved, { n: bayNo }));
  };

  const shuffleName = () => {
    // Math.random() is fine here: the tables are fixed, this only picks
    const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
    setBuild((b) => ({
      ...b,
      name: { first: pick(FIRST_WORDS), second: pick(SECOND_WORDS), num: Math.random() < 0.5 ? null : 1 + Math.floor(Math.random() * 99) },
    }));
  };

  // the paint job: the uids a target covers, the quote, the confirm
  const paintUids = useCallback(
    (target: PaintTarget): string[] =>
      BODY_SLOTS.filter((s) => target === "all" || s === target)
        .map((s) => build.cards[s])
        .filter((u): u is string => !!u),
    [build],
  );
  const quote = sheet?.kind === "paint" ? paintCost(st, paintUids(paintTarget), sheet.paint) : null;
  const confirmPaint = () => {
    if (sheet?.kind !== "paint") return;
    const uids = paintUids(paintTarget);
    const r = paintParts(uids, sheet.paint);
    if (!r.ok) {
      say(fill(t.paintJob.notEnough, { n: r.need }));
      return;
    }
    setSheet(null);
    say(r.cost ? fill(t.paintJob.done, { color: t.paintName[sheet.paint], coins: r.cost }) : fill(t.paintJob.free, { color: t.paintName[sheet.paint] }));
  };

  // Escape clears a selection or a popover (the sheets handle their own)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelected(null);
      setLore(null);
      setDrag(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── drag (desktop pointers only) ────────────────────────────────────────
  const onCardPointerDown = (uid: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "touch") return;
    dragStart.current = { uid, x: e.clientX, y: e.clientY, moved: false };
  };
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const st0 = dragStart.current;
      if (!st0) return;
      if (!st0.moved) {
        if (Math.hypot(e.clientX - st0.x, e.clientY - st0.y) < DRAG_START_PX) return;
        st0.moved = true;
        setLore(null);
        setSelected(null);
      }
      setDrag({ uid: st0.uid, x: e.clientX, y: e.clientY, spring: false });
    };
    const onUp = (e: PointerEvent) => {
      const st0 = dragStart.current;
      dragStart.current = null;
      if (!st0 || !st0.moved) return;
      const part = partOf(st0.uid);
      const bay = bayRef.current;
      const canvas = canvasRef.current;
      if (part && bay && canvas) {
        const r = canvas.getBoundingClientRect();
        const hit = bay.hitSocket(e.clientX - r.left, e.clientY - r.top, part.slot, SNAP_CSS);
        if (hit) {
          equip(st0.uid);
          setDrag(null);
          return;
        }
      }
      // spring back over 180ms, then gone
      setDrag({ uid: st0.uid, x: st0.x, y: st0.y, spring: true });
      sfx.play("back");
      window.setTimeout(() => setDrag(null), 180);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [equip, partOf, sfx]);

  // ── the screenshot harness hook (dev only; bots-shot.mjs waits on it) ───
  useEffect(() => {
    if (!ready) return;
    const w = window as unknown as Record<string, unknown>;
    w.__bots = {
      ready: true,
      select: (uid: string) => setSelected(uid),
      drag: (uid: string, x: number, y: number) => setDrag({ uid, x, y, spring: false }),
      sheet: (slot: CardSlot) => setSheet({ kind: "parts", slot, socket: SOCKETS_OF[slot][0] }),
      paint: (paint: PaintId) => setSheet({ kind: "paint", paint }),
      state: () => ({ build, total, tier, empties, sets, coins: st.coins }),
    };
    return () => {
      delete w.__bots;
    };
  }, [ready, build, total, tier, empties, sets, st.coins]);

  // ── tray ────────────────────────────────────────────────────────────────
  const onBotUids = useMemo(() => new Set(Object.values(build.cards).filter(Boolean) as string[]), [build]);
  const trayParts = useMemo(
    () => parts.filter((p) => filter === "all" || p.slot === filter),
    [parts, filter],
  );
  const hoverStart = (uid: string) => (rect: DOMRect) => {
    if (loreTimer.current) clearTimeout(loreTimer.current);
    loreTimer.current = window.setTimeout(() => {
      setLore({ uid, x: rect.right + 8, y: rect.top });
    }, LORE_HOVER_MS);
  };
  const hoverEnd = () => {
    if (loreTimer.current) clearTimeout(loreTimer.current);
    loreTimer.current = null;
    setLore(null);
  };

  const tray = (full: boolean, list: readonly OwnedPart[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {list.map((p) => (
        <PartCard
          key={p.uid}
          part={p}
          full={full}
          onBot={onBotUids.has(p.uid)}
          selected={selected === p.uid}
          onSelect={() => (full ? equip(p.uid) : setSelected(p.uid))}
          onEquip={() => equip(p.uid)}
          onPointerDown={full ? undefined : onCardPointerDown(p.uid)}
          onHoverStart={full ? undefined : hoverStart(p.uid)}
          onHoverEnd={full ? undefined : hoverEnd}
          onLongPress={full ? () => setLoreSheet(p.uid) : undefined}
        />
      ))}
      <Link
        href={`/bots/shop${filter === "all" ? "" : `?slot=${filter}`}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: full ? "100%" : 264,
          minHeight: TAP,
          borderRadius: R.inner,
          border: `1px dashed ${M.border}`,
          color: M.muted,
          fontSize: 12.5,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        <IconCoin size={16} />
        {t.ui.buyMore}
      </Link>
    </div>
  );

  const filterRow = (
    <div style={{ display: "flex", gap: 3, marginBottom: 12, flexWrap: "wrap" }}>
      <ChipTab square active={filter === "all"} onClick={() => setFilter("all")} title={t.ui.all}>
        <IconPegboard size={20} />
      </ChipTab>
      {CARD_SLOTS.map((slot) => {
        const Icon = SLOT_ICON[slot];
        return (
          <ChipTab key={slot} square active={filter === slot} onClick={() => setFilter(slot)} title={t.ui.card[slot]}>
            <Icon size={20} />
          </ChipTab>
        );
      })}
      <Link
        href="/bots/shop"
        title={t.nav.shop}
        aria-label={t.nav.shop}
        style={{
          width: 34,
          height: 34,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: R.inner,
          border: `1px solid ${M.border}`,
          color: M.muted,
        }}
      >
        <IconCoin size={20} />
      </Link>
    </div>
  );

  // ── paint and decals ────────────────────────────────────────────────────
  // the active swatch is the colour most of the body wears
  const swatches = (
    <>
      {PAINT_IDS.map((id: PaintId) => (
        <button
          key={id}
          className={uiCss.press}
          onClick={() => setSheet({ kind: "paint", paint: id })}
          aria-label={t.paintName[id]}
          aria-pressed={sets.color === id && sets.colorCount > 0}
          style={{
            width: 36,
            height: 36,
            flex: "0 0 auto",
            borderRadius: 10,
            background: PAINTS[id],
            border: `2px solid ${sets.color === id && sets.colorCount > 0 ? M.accent : "transparent"}`,
            outline: `1px solid ${M.border}`,
            cursor: "pointer",
          }}
        />
      ))}
    </>
  );
  const decalTiles = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {DECAL_IDS.map((id) => (
        <button
          key={id}
          className={uiCss.press}
          onClick={() => setBuild((b) => ({ ...b, decal: b.decal === id ? null : id }))}
          aria-label={id}
          aria-pressed={build.decal === id}
          style={{
            width: TAP,
            height: TAP,
            borderRadius: R.inner,
            border: `1px solid ${build.decal === id ? M.accent : M.border}`,
            background: build.decal === id ? M.surface2 : "transparent",
            color: build.decal === id ? M.text : M.muted,
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
          }}
        >
          <DecalGlyph id={id} />
        </button>
      ))}
    </div>
  );

  /** the set panel's three lines, shared by the readout and the phone stack */
  const setLines = (compact: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 2 : 6, fontFamily: FONT_MONO, fontSize: compact ? 12 : 13, fontVariantNumeric: "tabular-nums" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>{sets.family ? fill(t.set.family, { family: sets.family, n: sets.familyCount }) : t.set.noFamily}</span>
        <span style={{ color: sets.familyCount === 4 ? M.good : M.muted }}>{sets.familyCount === 4 ? "+2" : ""}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {sets.color ? <span aria-hidden style={{ width: 9, height: 9, borderRadius: R.pill, background: PAINTS[sets.color], display: "inline-block" }} /> : null}
          {fill(t.set.color, { n: sets.colorCount })}
        </span>
        <span style={{ color: sets.colorCount === 4 ? M.good : M.muted }}>{sets.colorCount === 4 ? "+1" : ""}</span>
      </div>
      <div style={{ color: sets.bonus ? M.good : M.muted }}>{sets.bonus ? fill(t.set.bonus, { n: sets.bonus }) : t.set.none}</div>
    </div>
  );

  const tierLine = complete
    ? fill(t.build.tier, { t: tier ?? 1, pts: total })
    : fill(t.build.notReady, { n: empties.length });

  const namePlate = nameText(build.name);
  const dragPart = drag ? partOf(drag.uid) : null;
  const lorePart = lore ? partOf(lore.uid) : null;
  const loreSheetPart = loreSheet ? partOf(loreSheet) : null;

  return (
    <PageShell wide>
      <div className={uiCss.buildGrid}>
        {/* ── LEFT: the parts tray ─────────────────────────────────────── */}
        <div className={uiCss.desktopOnly}>
          <Panel
            title={t.ui.parts}
            aside={<span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted }}>{fill(t.ui.owned, { n: parts.length })}</span>}
            style={{ padding: "16px 8px 16px 8px" }}
          >
            {filterRow}
            <div style={{ maxHeight: 560, overflowY: "auto", scrollbarWidth: "thin", paddingRight: 2 }}>{tray(false, trayParts)}</div>
          </Panel>
        </div>

        {/* ── CENTRE: the bay ──────────────────────────────────────────── */}
        <div className={uiCss.bayColumn}>
          <div
            ref={wrapRef}
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: small ? "390 / 420" : "760 / 700",
              borderRadius: R.frame,
              border: `1px solid ${M.border}`,
              boxShadow: `inset 0 1px 0 ${M.highlight}`,
              background: K.vignette,
              overflow: "hidden",
            }}
          >
            <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
          </div>

          <div className={uiCss.actionBar}>
            <Button variant="primary" onClick={save} style={{ minWidth: 220 }}>
              {fill(t.build.save, { n: bayNo })}
            </Button>
            <span className={uiCss.desktopOnly}>
              <Button
                disabled={!complete}
                title={complete ? undefined : tierLine}
                onClick={() => router.push("/bots/battles")}
                style={{ minWidth: 180 }}
              >
                {t.build.toBattle}
              </Button>
            </span>
            <span className={uiCss.desktopOnly} style={{ marginLeft: "auto", fontFamily: FONT_MONO, fontSize: 13, color: M.muted }}>
              {tierLine}
            </span>
          </div>

          {/* phone: the 3x3 stat grid, the name row, the set lines, the paint
              row; Save follows them by flex order (ui.module.css) */}
          <div className={uiCss.mobileStack}>
            <div className={uiCss.statGrid} style={{ marginTop: 8 }}>
              {STAT_KEYS.map((k) => (
                <StatTile key={k} stat={k} value={stats[k]} />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: TAP, marginTop: 8 }}>
              <span style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {namePlate}
              </span>
              <button
                className={uiCss.press}
                onClick={() => setSheet({ kind: "name" })}
                aria-label={t.ui.editName}
                style={{ width: TAP, height: TAP, display: "grid", placeItems: "center", borderRadius: R.pill, border: `1px solid ${M.border}`, background: "transparent", color: M.muted, cursor: "pointer" }}
              >
                <IconPencil size={18} />
              </button>
              <TierBadge tier={tier} total={total} empty={empties.length} pop={tierPop} />
            </div>
            <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: R.inner, border: `1px solid ${M.border}`, background: M.surface }}>{setLines(true)}</div>
            <div className={uiCss.paintRow} style={{ marginTop: 8, alignItems: "center" }}>
              <CoinChip coins={st.coins} ariaLabel={t.nav.coinsAria} />
              {swatches}
              <ChipTab active={sheet?.kind === "decal"} onClick={() => setSheet({ kind: "decal" })}>
                {t.ui.decal}
              </ChipTab>
            </div>
          </div>
        </div>

        {/* ── RIGHT: the readout ───────────────────────────────────────── */}
        <div className={uiCss.desktopOnly} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel title={t.ui.yourBot}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {namePlate}
              </span>
              <button
                className={uiCss.press}
                onClick={() => setSheet({ kind: "name" })}
                aria-label={t.ui.editName}
                style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: R.pill, border: `1px solid ${M.border}`, background: "transparent", color: M.muted, cursor: "pointer" }}
              >
                <IconPencil size={16} />
              </button>
            </div>
            <div style={{ marginTop: 6, marginBottom: 10 }}>
              <TierBadge tier={tier} total={total} empty={empties.length} pop={tierPop} />
            </div>
            {STAT_KEYS.map((k) => (
              <StatRow key={k} stat={k} value={stats[k]} />
            ))}
            <div style={{ borderTop: `1px solid ${M.border}`, marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontFamily: FONT_MONO, fontSize: 14 }}>
              <span style={{ color: M.muted }}>{t.ui.total}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{total}</span>
            </div>
          </Panel>
          <Panel title={t.set.title}>
            {setLines(false)}
            <p style={{ margin: "10px 0 0", fontSize: 11.5, color: M.muted, lineHeight: 1.45 }}>{t.set.hint}</p>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: M.muted }}>{t.set.weapon}</p>
          </Panel>
          <Panel title={t.ui.paint} aside={<CoinChip coins={st.coins} ariaLabel={t.nav.coinsAria} />}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 36px)", gap: 8, marginBottom: 12 }}>{swatches}</div>
            {decalTiles}
            <p style={{ margin: "12px 0 0", fontSize: 11.5, color: M.muted, lineHeight: 1.45 }}>{t.paintJob.rule}</p>
          </Panel>
        </div>
      </div>

      {/* ── the drag ghost ────────────────────────────────────────────── */}
      {drag && dragPart ? (
        <div
          className={drag.spring ? uiCss.springBack : undefined}
          style={{
            position: "fixed",
            left: drag.x - 32,
            top: drag.y - 32,
            width: 64,
            height: 64,
            zIndex: Z.drag,
            pointerEvents: "none",
            borderRadius: 12,
            border: `2px solid ${TIER_COLOR[dragPart.tier]}`,
            background: K.floor,
            display: "grid",
            placeItems: "center",
            opacity: drag.spring ? 0 : 0.92,
            boxShadow: "0 10px 24px rgba(0,0,0,0.4)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={partArt(dragPart).base} alt="" style={{ width: 56, height: 56, objectFit: "contain" }} />
        </div>
      ) : null}

      {/* ── the lore popover (desktop hover) ──────────────────────────── */}
      {lore && lorePart && !drag ? (
        <div
          className={uiCss.popover}
          onMouseEnter={() => {
            if (loreTimer.current) clearTimeout(loreTimer.current);
          }}
          onMouseLeave={hoverEnd}
          style={{
            position: "fixed",
            left: Math.min(lore.x, (typeof innerWidth === "number" ? innerWidth : 1440) - 336),
            top: Math.max(60, Math.min(lore.y, (typeof innerHeight === "number" ? innerHeight : 900) - 360)),
            width: 320,
            zIndex: Z.coach,
            background: M.surface,
            border: `1px solid ${M.border}`,
            borderRadius: R.card,
            padding: 16,
            color: M.text,
            fontFamily: FONT_BODY,
          }}
        >
          <LoreBody part={lorePart} onEquip={() => equip(lorePart.uid)} />
        </div>
      ) : null}

      {/* ── the toast ─────────────────────────────────────────────────── */}
      {toast ? (
        <div
          className={uiCss.toast}
          role="status"
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: 64,
            display: "flex",
            justifyContent: "center",
            zIndex: Z.coach,
            pointerEvents: "none",
          }}
        >
          <span style={{ padding: "10px 16px", borderRadius: R.pill, background: M.surface, border: `1px solid ${M.border}`, fontSize: 13, fontWeight: 600 }}>
            {toast}
          </span>
        </div>
      ) : null}

      {/* ── sheets ────────────────────────────────────────────────────── */}
      {sheet?.kind === "parts" ? (
        <Sheet
          title={fill(t.build.pick, { slot: t.ui.socket[sheet.socket] })}
          onClose={() => setSheet(null)}
          width={small ? 4000 : 480}
        >
          {tray(true, parts.filter((p) => p.slot === sheet.slot))}
        </Sheet>
      ) : null}

      {sheet?.kind === "paint" && quote ? (
        <Sheet
          title={fill(t.paintJob.job, { coins: quote.cost })}
          onClose={() => setSheet(null)}
          action={<span aria-hidden style={{ width: 22, height: 22, borderRadius: 7, background: PAINTS[sheet.paint], outline: `1px solid ${M.border}`, display: "inline-block" }} />}
        >
          <div style={{ fontSize: 12.5, color: M.muted, marginBottom: 8 }}>{t.paintJob.which}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            <ChipTab active={paintTarget === "all"} onClick={() => setPaintTarget("all")}>
              {t.paintJob.all}
            </ChipTab>
            {BODY_SLOTS.map((s) => (
              <ChipTab key={s} active={paintTarget === s} onClick={() => setPaintTarget(s)}>
                {t.ui.card[s]}
              </ChipTab>
            ))}
          </div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            {paintUids(paintTarget).length === 0
              ? t.paintJob.nothing
              : quote.parts === 0
                ? fill(t.paintJob.already, { color: t.paintName[sheet.paint] })
                : quote.parts === 1
                  ? t.paintJob.onePart
                  : fill(t.paintJob.parts, { n: quote.parts })}
          </div>
          {quote.cost > st.coins ? (
            <div style={{ fontSize: 12.5, color: M.bad, marginTop: 6 }}>{fill(t.paintJob.notEnough, { n: quote.cost - st.coins })}</div>
          ) : null}
          <p style={{ margin: "10px 0 14px", fontSize: 11.5, color: M.muted, lineHeight: 1.45 }}>{t.paintJob.rule}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="primary" disabled={quote.cost > st.coins || paintUids(paintTarget).length === 0} onClick={confirmPaint}>
              {fill(t.paintJob.confirm, { coins: quote.cost })}
            </Button>
            <Button onClick={() => setSheet(null)}>{t.paintJob.cancel}</Button>
          </div>
        </Sheet>
      ) : null}

      {sheet?.kind === "name" ? (
        <Sheet
          title={t.build.name}
          onClose={() => setSheet(null)}
          action={<Button onClick={shuffleName}>{t.build.shuffle}</Button>}
        >
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, margin: "4px 0 12px" }}>{namePlate}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {(
              [
                [t.ui.firstWord, FIRST_WORDS, "first"],
                [t.ui.secondWord, SECOND_WORDS, "second"],
              ] as const
            ).map(([label, words, key]) => (
              <div key={key}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: "0.32em", color: M.muted, marginBottom: 8 }}>{label}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {words.map((w) => (
                    <ChipTab
                      key={w}
                      active={build.name[key] === w}
                      onClick={() => setBuild((b) => ({ ...b, name: { ...b.name, [key]: w } }))}
                    >
                      {w}
                    </ChipTab>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
            <span style={{ fontSize: 12.5, color: M.muted }}>{t.ui.number}</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              value={build.name.num ?? ""}
              onChange={(e) => {
                const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                setBuild((b) => ({ ...b, name: { ...b.name, num: n >= 1 && n <= 99 ? n : null } }));
              }}
              aria-label={t.ui.number}
              style={{
                width: 64,
                height: TAP,
                borderRadius: R.inner,
                border: `1px solid ${M.border}`,
                background: M.surface2,
                color: M.text,
                fontFamily: FONT_MONO,
                fontSize: 15,
                textAlign: "center",
              }}
            />
            <ChipTab active={build.name.num == null} onClick={() => setBuild((b) => ({ ...b, name: { ...b.name, num: null } }))}>
              {t.ui.noNumber}
            </ChipTab>
            <span style={{ marginLeft: "auto" }}>
              <Button variant="primary" onClick={() => setSheet(null)}>
                {t.ui.done}
              </Button>
            </span>
          </div>
        </Sheet>
      ) : null}

      {sheet?.kind === "decal" ? (
        <Sheet title={t.ui.decal} onClose={() => setSheet(null)}>
          {decalTiles}
          <p style={{ margin: "12px 0 0", fontSize: 11.5, color: M.muted }}>{t.build.paintNote}</p>
        </Sheet>
      ) : null}

      {loreSheetPart ? (
        <Sheet title={loreSheetPart.name} onClose={() => setLoreSheet(null)}>
          <LoreBody part={loreSheetPart} onEquip={() => equip(loreSheetPart.uid)} />
        </Sheet>
      ) : null}
    </PageShell>
  );
}

// the guide's paint price, exported for the harness's cost check
export { PAINT_COST };
