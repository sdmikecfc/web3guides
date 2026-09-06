/**
 * THE BUILD SCREEN (screens doc 2.1 and 2.2): the mech-lab bay. A bot on a
 * lift, seven hotspots, a tier-coloured parts tray, a live mono readout with
 * delta chips and the live tier badge, the SET PANEL (the guide's matched
 * sets), the name sheet from two fixed tables, a READ-ONLY colour line and
 * six decals. Drag or tap on desktop, tap-then-sheet on a phone, every
 * target 44px.
 *
 * Client shell in the S7 Battlefield shape (src/app/s7/front/Battlefield.tsx):
 * owns the rAF, builds the bay through the one pixi chain, fits it with a
 * ResizeObserver on the wrapper (never the canvas), and keeps every number in
 * the DOM.
 *
 * WEEK 2: the tray reads the ONE catalog (fixtures.ts on the engine's
 * PartCard, field `s`); owned parts, coins and the saved builds live in
 * src/lib/bots/garage-state.ts.
 *
 * WEEK 3 (ADR-0141, the Junkyard): there is no paint job. A card wears the
 * colour it arrived in, for life, so the eight swatches are gone and Panel B
 * is a READ-ONLY colour line, one chip per body part, over the unchanged set
 * panel and decal tiles. Nothing on this screen spends a coin on a colour;
 * colours are bought in the Junkyard, on the day that colour lands. The rig
 * keeps tinting each part's paint mask by its own colour, so the fight and
 * every stored replay hash exactly as before.
 */
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "../../_components/PageShell";
import { ColourPips } from "../../_components/ColourPips";
import { NamePicker } from "../../_components/NamePicker";
import { IconCoin, IconPegboard, IconPencil, SLOT_ICON, STAT_ICON } from "../../_ui/icons";
import { Button, ChipTab, CoinChip, Dot, Panel, Sheet, uiCss, useCountUp } from "../../_ui/primitives";
import {
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  K,
  M,
  PAINTS,
  R,
  T,
  TAP,
  TIER_COLOR,
  Z,
  type PaintId,
} from "../../_ui/tokens";
import {
  BRAND_INDEX,
  BRAND_OF_FAMILY,
  BRAND_OF_WEAPON,
  SCRAP_NOTE,
  SET_LINES,
  STAT_MEANING,
  leadStat,
  statChip,
  type BrandId,
} from "@/lib/bots/naming";
import { SCREEN_WORDS, STAT_NAME_OF, fillWords } from "@/lib/bots/naming-screens";
import { buildBay, type BayHandle, type RingState } from "../../_view/bay";
import { bodyTintOf, rigLookOf } from "../../_view/look-view";
import { ART_OF_SOCKET, type PartArt } from "../../_view/rig";
import { loadPartArt } from "../../_view/part-art";
import type { EarnedBotView, LookView } from "../../_server/types";
import {
  BAY_COUNT,
  BODY_SLOTS,
  CARD_OF_SOCKET,
  CARD_SLOTS,
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
  type OwnedPart,
  type Socket,
  type StatKey,
  type Tier,
} from "@/lib/bots/fixtures";
import { bayOfPart, earnedOfBuild, isHydratedState, saveBuild, saveLook, useGarage } from "@/lib/bots/garage-state";
import { loadEarnedBots, saveLookToServer } from "@/lib/bots/earned-client";
import { LookPicker, type LookChange } from "../../_components/LookPicker";
import {
  FACE_IDS,
  LookRefused,
  STICKER_IDS,
  STICKER_SPOTS,
  earnedMarks,
  faceAllowed,
  normalizeLook,
  ownColours,
  socketPaints,
  suggestLook,
  type BotLookRaw,
} from "@/lib/bots/look";
import { STRINGS, fill, starWord } from "@/lib/bots/strings";

const t = STRINGS.en;
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

/* ── the six stickers ───────────────────────────────────────────────────── */
/**
 * GONE FROM HERE, ON PURPOSE. This file used to carry its own six sticker
 * drawings and its own six sticker NAMES (a "wrenches" tile that read
 * "Crossed wrenches" while every other surface called it "Spanners"). Both
 * now live once: the drawings in _components/LookPicker.tsx beside the face
 * and the place, and the names in src/lib/bots/look.ts STICKERS, which is the
 * table the server checks a save against. One sticker, one name, one picture.
 */

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
      {/* was "TIER 3" in capitals, then "Class 3 of 4". Stars are the one
          word for how good a thing is, and one star is never "1 stars". */}
      <span style={{ color: tier ? M.text : M.warn }}>
        {tier ? starWord(tier) : SCREEN_WORDS.botNotReady}
      </span>
      <span style={{ color: M.muted, letterSpacing: 0 }}>
        {tier ? fillWords(SCREEN_WORDS.points, { n: total }) : fillWords(SCREEN_WORDS.botEmptySlots, { n: empty })}
      </span>
    </span>
  );
}

/** The brand a card belongs to, or null for starter scrap. A body part goes
 * by its family (which IS the brand plus the model number), a weapon by id. */
function brandOfPart(part: { id: string; slot: CardSlot; family?: string }): BrandId | null {
  if (part.slot === "weapon") return BRAND_OF_WEAPON[part.id] ?? null;
  return part.family ? (BRAND_OF_FAMILY[part.family] ?? null) : null;
}

/**
 * The colour, as a swatch and one word. Was "Kettle . mint": the family name
 * repeated what the title already says, and "no color" on a weapon read like
 * a missing value rather than a fact about weapons. The title now carries
 * the brand and the model number, so this line carries only the colour.
 */
function SetLine({ part }: { part: OwnedPart }) {
  if (part.slot === "weapon") {
    return <span style={{ fontFamily: FONT_BODY, fontSize: 11, color: M.muted, whiteSpace: "nowrap" }}>{SCREEN_WORDS.noColor}</span>;
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: FONT_BODY, fontSize: 11, color: M.muted, whiteSpace: "nowrap" }}>
      {part.paint ? <span aria-hidden style={{ width: 8, height: 8, borderRadius: R.pill, background: PAINTS[part.paint], display: "inline-block", flex: "0 0 auto" }} /> : null}
      {part.paint ? t.paintName[part.paint] : SCREEN_WORDS.noColor}
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
  // the one stat the tray has room for, read off this card's own numbers
  const lead = leadStat(part.slot, [part.s[0], part.s[1], part.s[2]]);
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
        {/* the socket word plus the colour. The title already carries the
            brand and the model number, so "T2" has nothing left to add. */}
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_BODY, fontSize: 11, color: M.muted, minWidth: 0 }}>
          <span style={{ whiteSpace: "nowrap" }}>{t.ui.card[part.slot]}</span>
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
          /* was "SPD 6 STR 3 DGE 4": three short forms nothing on the screen
             ever spelled out. 264px will not hold three spelled out stats, so
             the tray shows the one that matters, read off the card's own
             numbers, and the part sheet shows all three in full. */
          <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: M.lore, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <span style={{ color: M.muted }}>{SCREEN_WORDS.bestAt} </span>
            {statChip(lead.name, lead.value)}
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
  const lead = leadStat(part.slot, [part.s[0], part.s[1], part.s[2]]);
  const brand = brandOfPart(part);
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
          {/* the socket word above the name, so the sheet answers "which part
              is this" before it answers anything else */}
          <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, letterSpacing: "0.22em", textTransform: "uppercase", color: color, fontWeight: 700 }}>
            {t.ui.card[part.slot]}
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700 }}>{part.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_MONO, fontSize: 11, color: M.muted, marginTop: 4 }}>
            <Dot color={color} />
            {fillWords(SCREEN_WORDS.points, { n: partTotal(part) })}
          </div>
          <div style={{ marginTop: 4 }}>
            <SetLine part={part} />
          </div>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${M.border}` }} />
      {/* all three stats, each with the sentence saying what it does. This is
          the roomiest surface a part gets, so nothing is shortened here. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {keys.map((k, i) => {
          const Icon = STAT_ICON[k];
          const isLead = STAT_NAME_OF[k] === lead.name;
          return (
            <div key={k} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ color: isLead ? M.accent : M.muted, display: "grid", marginTop: 2 }}>
                <Icon size={16} />
              </span>
              <span style={{ fontSize: 12, color: M.text, flex: 1, lineHeight: 1.4 }}>
                <span style={{ fontWeight: isLead ? 700 : 400 }}>{t.ui.stat[k]}</span>
                <span style={{ color: M.muted }}> {STAT_MEANING[STAT_NAME_OF[k]]}</span>
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 15, fontVariantNumeric: "tabular-nums", fontWeight: isLead ? 700 : 400 }}>{part.s[i]}</span>
            </div>
          );
        })}
      </div>
      {brand ? (
        <p style={{ margin: 0, fontSize: 12, color: M.lore, lineHeight: 1.45 }}>
          <span style={{ fontWeight: 700, color: M.text }}>{BRAND_INDEX[brand].name}</span>
          <span style={{ color: M.muted }}> ({BRAND_INDEX[brand].short.toLowerCase()}). </span>
          {BRAND_INDEX[brand].character}
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: M.muted, lineHeight: 1.45 }}>{SCRAP_NOTE}</p>
      )}
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
  | { kind: "look" }
  | null;

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
  const [loreSheet, setLoreSheet] = useState<string | null>(null);
  const [lore, setLore] = useState<{ uid: string; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tierPop, setTierPop] = useState(0);
  const [ready, setReady] = useState(false);
  /** every socket of the current build is on the rig (the --art-ready flag) */
  const [artDone, setArtDone] = useState(false);
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
  // ── what the SERVER says this robot has earned (the ninth law) ──────────
  // The builds on this screen live in the browser, and the browser is not
  // allowed to say what a robot earned, so the wins, the level, the lost
  // fights, the crown and the hats come off GET /api/bots/earned and from
  // nowhere else. Read AFTER mount, like every other stored value here, so the
  // server render and the first client render agree. Three states, and they
  // are not the same thing: null is "we did not find out" (no wallet, expired
  // token, dead route), a row is the answer, and no row for this spot is a
  // robot the server has never met.
  const [serverEarned, setServerEarned] = useState<EarnedBotView[] | null>(null);
  useEffect(() => {
    let live = true;
    loadEarnedBots().then((rows) => {
      if (live) setServerEarned(rows);
    });
    return () => {
      live = false;
    };
  }, []);
  const serverRow = useMemo(
    () => serverEarned?.find((e) => e.bay === bayNo) ?? null,
    [serverEarned, bayNo],
  );

  // ── the look: what it has earned, what it chose, and what the lift draws ─
  // WHERE THE ANSWER COMES FROM, in one line: the server when it has a row for
  // this spot, this browser's own rows when it does not. It is never a mix.
  // The row is what POST /api/bots/bot/look checks a claim against, so taking
  // half of it from here would mean offering a face the route then refuses,
  // and "it let me pick it and then it vanished" is the worst thing a screen
  // like this can do. With no wallet connected the local rows are the only
  // rows there are, and they are read through look.ts's own findsOf, so the
  // rule is the same rule either way.
  const lookEarned = useMemo(
    () => serverRow?.earned ?? earnedOfBuild(build, st.parts, st.bays[bayNo], st.level),
    [serverRow, build, st.parts, st.bays, st.level, bayNo],
  );
  const look = useMemo(() => normalizeLook(build.look, lookEarned), [build.look, lookEarned]);

  // THE SERVER'S LOOK WINS, ONCE, when it arrives. A player who put a face on
  // in the garage and walked over here must find that face already on, and the
  // only way that holds is for the row to overwrite the browser's copy rather
  // than the other way round. It runs once per spot: after that the player is
  // editing, and re-seeding under their hands would undo the tap they just
  // made.
  const seededBay = useRef<number | null>(null);
  useEffect(() => {
    if (!serverRow || seededBay.current === bayNo) return;
    seededBay.current = bayNo;
    setBuild((b) => ({
      ...b,
      look: serverRow.look,
      decal: serverRow.look.sticker && serverRow.look.spot === "chest" ? serverRow.look.sticker : null,
    }));
  }, [serverRow, bayNo]);
  /** the colours this robot is wearing, which are the only colours it may use */
  const ownPaints = useMemo(() => ownColours(lookEarned.paints), [lookEarned]);

  /**
   * THE FIRST TIME A HAT EVER TURNS UP, and only then.
   *
   * A hat cannot be bought, cannot be found on the shelf and cannot be asked
   * for, so the first one arrives with no explanation at all unless the game
   * gives it one. That sentence is worth exactly one showing: it is the coach
   * law again, and Pride.tsx already keeps once-only moments in localStorage
   * under its own key, so this uses the same idea with a key of its own.
   *
   * It is read AFTER mount, never during render, so a player who has seen it
   * never gets a flash of it; and it is written on the first render that
   * actually HAS a hat, so a player who has none is never told about a thing
   * they cannot see.
   */
  const HAT_SEEN = "bots.look.hatSeen";
  const [firstHat, setFirstHat] = useState(false);
  const hasHat = lookEarned.hats.length > 0;
  useEffect(() => {
    if (!hasHat) return;
    let seen = false;
    try {
      seen = localStorage.getItem(HAT_SEEN) === "1";
    } catch {
      /* storage blocked: the line shows this visit and that is the safe way round */
    }
    if (seen) return;
    setFirstHat(true);
    try {
      localStorage.setItem(HAT_SEEN, "1");
    } catch {
      /* storage blocked: the sentence lasts for this page */
    }
  }, [hasHat]);
  /** the same three-part answer the server hands every other surface, so the
   *  lift and a fight draw one robot through one translation (look-view.ts) */
  const lookView = useMemo<LookView>(
    () => ({
      paints: socketPaints((slot) => partOf(build.cards[slot])?.paint),
      look,
      marks: earnedMarks(lookEarned),
      wins: lookEarned.wins,
    }),
    [build, look, lookEarned, partOf],
  );

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

  // the shared loader, so the lift keeps its bot when public/bots-art is
  // gone: a missing file falls back to the drawn clay part the Fight Viewer
  // already used (the house law; see _view/part-art.ts)
  const loadArt = useCallback(
    (bay: BayHandle, part: OwnedPart): Promise<PartArt> =>
      loadPartArt(
        bay.stage.pixi,
        bay.stage.app.renderer,
        ART_OF_SOCKET[SOCKETS_OF[part.slot][0]],
        part.tier,
        part.design,
        artCache.current,
      ),
    [],
  );

  // push the build into the bay whenever it changes (per-part paint included).
  // artDone is the TRUTH the screenshot harness waits on: false the moment the
  // build changes, true only when every socket of this build is on the rig.
  // Before 2026-09-04 only the Garage set this flag, so `--art-ready` was a
  // no-op here and the first 1440 shot caught a floating head over six empty
  // sockets while the readout claimed a whole bot.
  useEffect(() => {
    const bay = bayRef.current;
    if (!bay || !ready) return;
    let cancelled = false;
    setArtDone(false);
    (async () => {
      for (const socket of SOCKETS) {
        const part = partOf(build.cards[CARD_OF_SOCKET[socket]]);
        const art = part ? await loadArt(bay, part) : null;
        if (cancelled) return;
        bay.rig.setArt(socket, art);
      }
      // EVERYTHING THAT IS NOT A PART, in one call. setLook carries the seven
      // socket colours, the face, the sticker in its place, the plate number
      // and every earned mark, and it takes the WHOLE look every time, so a
      // field left out is a field turned off and no half of an old look can
      // survive a rebuild. It replaces the old setPaint plus paintRigSockets
      // plus setDecal, which between them could only ever show one colour and
      // one sticker; the weapon now rides the arm, which is what makes a
      // normal robot read as four colours instead of one.
      const torso = partOf(build.cards.torso);
      const rigLook = rigLookOf(lookView, torso?.paint ?? "mint");
      // the body tint is still set on its own: the one thing left reading it
      // is the chip a lost limb leaves on the body (rig.ts drawScar)
      bay.rig.setPaint(bodyTintOf(rigLook));
      bay.rig.setLook(rigLook);
      bay.setName(nameText(build.name));
      bay.setRings(rings);
      for (const s of pendingFlash.current) bay.flashRing(s);
      pendingFlash.current = [];
      setArtDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [build, ready, rings, partOf, loadArt, lookView]);

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

  /**
   * PUT A LOOK ON, THROUGH THE GATE, AND KEEP IT.
   *
   * The whole chosen look goes out every time, never a patch of it, because
   * that is what parseLook takes and what the save route stores; a partial
   * claim would leave the two halves able to disagree. saveLook runs the
   * route's own two functions and THROWS the sentence the player reads when a
   * claim does not hold up, so a screen that has drifted says so out loud
   * instead of quietly storing something else.
   *
   * It saves on the press. A face costs nothing and the game asks for no step
   * to wear one (the joint law), so the tap IS the save and there is nothing
   * to lose by walking away.
   */
  const applyLook = useCallback(
    (change: LookChange, tell?: string) => {
      const next: BotLookRaw = {
        face: change.face ?? look.face,
        sticker: change.sticker !== undefined ? change.sticker : look.sticker,
        spot: change.spot ?? look.spot,
        stickerPaint: change.stickerPaint !== undefined ? change.stickerPaint : look.stickerPaint,
        // A HAT IS WON, NEVER PICKED, and the row only ever offers a hat this
        // wallet has a row for, so a press here can name one and nothing else.
        // Left out of a change, it rides along untouched: no other control on
        // this screen can take a hat off by accident.
        hat: change.hat !== undefined ? change.hat : look.hat,
      };
      const before = look;
      let stored;
      try {
        stored = saveLook(bayNo, next, { ...build, bay: bayNo });
      } catch (e) {
        if (e instanceof LookRefused) {
          say(e.message);
          return;
        }
        throw e;
      }
      const put = (l: typeof stored) =>
        setBuild((b) => ({
          ...b,
          look: l,
          // one sticker, never two: a chest sticker IS the old decal field, so
          // every surface still reading `decal` gets the same answer
          decal: l.sticker && l.spot === "chest" ? l.sticker : null,
        }));
      put(stored);
      if (tell) say(tell);
      // AND THE SERVER, which is the one that counts. The robot on screen has
      // already changed, because a face that waits for a round trip feels
      // broken on a phone; if the row refuses it, the robot changes back and
      // the row's own sentence is what the player reads. A wallet that is not
      // connected, and a spot the server has never met, are silent: neither is
      // something the player did wrong, and the browser keeps the look.
      void saveLookToServer(bayNo, stored).then((r) => {
        if (r.ok) {
          put(r.view.look);
          return;
        }
        if (r.message === null) return;
        put(before);
        try {
          saveLook(bayNo, before, { ...build, bay: bayNo });
        } catch {
          /* the browser refused its own old look: it will be normalised on the
             next read, and the sentence below is still the true answer */
        }
        say(r.message);
      });
    },
    [build, bayNo, look, say],
  );

  /** Pick for me: the same look for the same robot every time, so a player who
   *  presses it twice is not being shown a slot machine. */
  const pickForMe = useCallback(() => {
    const seed = bayNo * 977 + (build.name.num ?? 0) * 31 + build.name.first.length * 7 + build.name.second.length;
    applyLook(suggestLook(seed, lookEarned), t.look.done);
  }, [applyLook, bayNo, build.name, lookEarned]);

  /** Surprise me: a real roll, over ONLY what this player has unlocked. It can
   *  never turn up a locked face or a colour the robot is not wearing. */
  const surprise = useCallback(() => {
    const faces = FACE_IDS.filter((f) => faceAllowed(f, lookEarned));
    const pick = <X,>(xs: readonly X[]): X | null => (xs.length ? xs[Math.floor(Math.random() * xs.length)] : null);
    applyLook(
      {
        face: pick(faces) ?? "calm",
        sticker: pick(STICKER_IDS),
        spot: pick(STICKER_SPOTS) ?? "chest",
        stickerPaint: pick(ownPaints),
      },
      t.look.done,
    );
  }, [applyLook, lookEarned, ownPaints]);

  /** Back to normal: the plain robot. Nothing earned is lost, because nothing
   *  earned was ever stored here; the stars and the patches stay on the body. */
  const backToPlain = useCallback(() => {
    applyLook({ face: "calm", sticker: null, spot: "chest", stickerPaint: null }, t.look.done);
  }, [applyLook]);

  // the colours on the bot: read only. A card wears the colour it arrived
  // in (ADR-0141), so this reads the parts and never writes them.
  const bodyColors = useMemo(
    () =>
      BODY_SLOTS.map((s) => {
        const uid = build.cards[s];
        const p = uid ? parts.find((x) => x.uid === uid) : undefined;
        return { slot: s, color: (p?.paint ?? null) as PaintId | null };
      }),
    [build, parts],
  );
  const allOneColor = bodyColors.every((c) => c.color && c.color === bodyColors[0].color);

  /** The maker most of this robot came from, once at least two body parts
   * agree. It is what the player has been collecting, so the panel can say
   * the maker's one line of character back to them. */
  const bodyBrand = useMemo<BrandId | null>(() => {
    const tally = new Map<BrandId, number>();
    for (const s of BODY_SLOTS) {
      const uid = build.cards[s];
      const p = uid ? parts.find((x) => x.uid === uid) : undefined;
      const b = p ? brandOfPart(p) : null;
      if (b) tally.set(b, (tally.get(b) ?? 0) + 1);
    }
    let best: BrandId | null = null;
    let n = 0;
    for (const [k, c] of Array.from(tally.entries())) {
      if (c > n) {
        best = k;
        n = c;
      }
    }
    return n >= 2 ? best : null;
  }, [build, parts]);

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
      artReady: artDone,
      select: (uid: string) => setSelected(uid),
      drag: (uid: string, x: number, y: number) => setDrag({ uid, x, y, spring: false }),
      sheet: (slot: CardSlot) => setSheet({ kind: "parts", slot, socket: SOCKETS_OF[slot][0] }),
      // the look, for the click through: ask for one, and read back what was
      // actually STORED, so a proof that a choice survives a reload reads the
      // same value the store wrote and not the one the test asked for
      setLook: (c: LookChange) => applyLook(c),
      look: () => ({ look, earned: lookEarned, colours: ownPaints }),
      state: () => ({ build, total, tier, empties, sets, coins: st.coins }),
    };
    return () => {
      delete w.__bots;
    };
  }, [ready, artDone, build, total, tier, empties, sets, st.coins, applyLook, look, lookEarned, ownPaints]);

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

  // ── colours and decals ──────────────────────────────────────────────────
  // READ ONLY (ADR-0141): one chip per body part showing the colour that
  // part arrived in. No picker, no swatches, nothing to spend.
  const colorChips = (
    <>
      {bodyColors.map(({ slot, color }) => (
        <span
          key={slot}
          title={fill(t.set.slotColor, { slot: t.ui.card[slot], color: color ? t.paintName[color] : t.set.empty })}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            flex: "0 0 auto",
            minHeight: 36,
            padding: "0 10px",
            borderRadius: R.pill,
            border: `1px solid ${M.border}`,
            background: M.surface,
            fontFamily: FONT_MONO,
            fontSize: 11.5,
            color: color ? M.text : M.muted,
            whiteSpace: "nowrap",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 12,
              height: 12,
              borderRadius: R.pill,
              background: color ? PAINTS[color] : "transparent",
              border: color ? "none" : `1px dashed ${M.border}`,
              flex: "0 0 auto",
            }}
          />
          {fill(t.set.slotColor, { slot: t.ui.card[slot], color: color ? t.paintName[color] : t.set.empty })}
        </span>
      ))}
    </>
  );
  /**
   * MAKING IT YOURS: the face, the sticker, where it goes, the colour it
   * wears and the number plate, in one panel with a live robot beside it.
   *
   * IT REPLACED THE SIX DECAL TILES. Those tiles were the only look control on
   * the screen and they could put ONE sticker in ONE place; keeping them
   * beside this panel would have given the screen two sticker pickers and a
   * robot able to wear two stickers at once. `build.decal` is not gone: a
   * chest sticker still mirrors into it (garage-state withLook), so every
   * surface that reads the old field keeps reading the right thing.
   */
  const lookPanel = (compact: boolean) => (
    <LookPicker
      look={look}
      earned={lookEarned}
      colours={ownPaints}
      compact={compact}
      firstHat={firstHat}
      onChange={(c) => applyLook(c)}
      onPickForMe={pickForMe}
      onSurprise={surprise}
      onPlain={backToPlain}
      onEditNumber={() => setSheet({ kind: "name" })}
    />
  );

  /** the set panel's three lines, shared by the readout and the phone stack */
  const setLines = (compact: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 2 : 6, fontFamily: FONT_MONO, fontSize: compact ? 12 : 13, fontVariantNumeric: "tabular-nums" }}>
      {/* "Kettle set: 3 of 4" named a style nothing else on the screen used.
          The family display name IS the maker's name plus the star count now,
          so this line reads straight off the four titles above it. */}
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
      {/* THE COLOURS AS A THING, not as a number: four swatches in body-part
          order with the odd one out named, so "what do I buy next" is
          answered on the same row it is asked (_components/ColourPips.tsx) */}
      <div style={{ paddingTop: 2 }}>
        <ColourPips colors={bodyColors} size={compact ? 16 : 18} />
      </div>
      <div style={{ color: sets.bonus ? M.good : M.muted }}>
        {sets.bonus ? fill(SET_LINES.bonus, { n: sets.bonus }) : SET_LINES.noBonus}
      </div>
      {/* the maker's one line of character. A player collecting Spark parts
          is collecting a promise, and this is the promise in plain words. */}
      {bodyBrand ? (
        <p style={{ margin: "2px 0 0", fontFamily: FONT_BODY, fontSize: 11.5, color: M.lore, lineHeight: 1.45 }}>
          <span style={{ fontWeight: 700, color: M.text }}>{fill(t.maker.mostly, { maker: BRAND_INDEX[bodyBrand].name })}</span>{" "}
          {BRAND_INDEX[bodyBrand].character}
        </p>
      ) : null}
    </div>
  );

  const tierLine = complete
    ? // was "Tier 2 bot. 51 points.": a rank word and a short form, beside a
      // readout that now says the same thing in words a player has met
      fill(tier === 1 ? t.build.tierOne : t.build.tier, { t: tier ?? 1, size: total })
    : // the number is gone on purpose: it counted sockets (7) while the shop
      // sells cards (5), so "2 parts missing" sent a player looking for two
      // things that one card fills
      t.build.notReady;

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
            <span style={{ fontSize: 12, color: M.muted }}>{t.build.costsNothing}</span>
            <span className={uiCss.desktopOnly}>
              <Button disabled={!complete} onClick={() => router.push("/bots/battles")} style={{ minWidth: 180 }}>
                {t.build.toBattle}
              </Button>
            </span>
            <span className={uiCss.desktopOnly} style={{ marginLeft: "auto", fontFamily: FONT_MONO, fontSize: 13, color: M.muted }}>
              {tierLine}
            </span>
          </div>

          {/* HOW IT LOOKS, DIRECTLY UNDER THE ROBOT IT CHANGES.
              It was in the right rail with the two readouts, which was the
              wrong place twice over: at 1440 the rail ran nine hundred pixels
              past the bay while the whole width under the lift sat empty, and
              a 300 pixel column broke every row onto two lines. Here the rows
              are one line each and the robot is directly above the tile being
              pressed, which is the only way to see what a face did. The phone
              keeps its sheet, which is why this is desktop only. */}
          <div className={uiCss.desktopOnly} style={{ marginTop: 16 }}>
            <Panel title={t.ui.color} aside={<CoinChip coins={st.coins} ariaLabel={t.nav.coinsAria} />}>
              <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>{colorChips}</div>
              {lookPanel(false)}
              <p style={{ margin: "12px 0 0", fontSize: 11.5, color: M.muted, lineHeight: 1.45 }}>
                {t.shopUi.keepsColor} {allOneColor ? "" : t.shopUi.wantSet}
              </p>
            </Panel>
          </div>

          {/* phone: the 3x3 stat grid, the name row, the set lines, the paint
              row; Save follows them by flex order (ui.module.css) */}
          <div className={uiCss.mobileStack}>
            <div className={uiCss.statGrid} style={{ marginTop: 8 }}>
              {STAT_KEYS.map((k) => (
                <StatTile key={k} stat={k} value={stats[k]} />
              ))}
            </div>
            {/* THE NAME KEEPS THE LINE. The badge used to share this row and
                won it: "Dusty Teapot" came out "Dusty Te..." on a 390 phone
                beside "Not ready, 2 parts missing". The name is the one word
                on this screen the player chose, so the badge wraps under it
                and nothing is cut. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minHeight: TAP, marginTop: 8 }}>
              <span style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {namePlate}
              </span>
              <button
                className={uiCss.press}
                onClick={() => setSheet({ kind: "name" })}
                aria-label={t.ui.editName}
                style={{ width: TAP, height: TAP, flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: R.pill, border: `1px solid ${M.border}`, background: "transparent", color: M.muted, cursor: "pointer" }}
              >
                <IconPencil size={18} />
              </button>
              <span style={{ flex: "1 0 100%" }}>
                <TierBadge tier={tier} total={total} empty={empties.length} pop={tierPop} />
              </span>
            </div>
            <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: R.inner, border: `1px solid ${M.border}`, background: M.surface }}>
              {setLines(true)}
              <p style={{ margin: "8px 0 0", fontSize: 11.5, color: M.muted, lineHeight: 1.45 }}>{t.teach.matching}</p>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: M.muted, lineHeight: 1.45 }}>{SET_LINES.weapon}</p>
            </div>
            {/* THE ONE DOOR TO THE LOOK PANEL GOES FIRST. This row scrolls
                sideways, and the chip used to sit behind the coins and four
                colour chips, which is off the right edge of a 390 phone: the
                only way to give a robot a face was to discover a scroll. The
                colours are a readout and can wait; the thing you press comes
                first. */}
            <div className={uiCss.paintRow} style={{ marginTop: 8, alignItems: "center" }}>
              <ChipTab active={sheet?.kind === "look"} onClick={() => setSheet({ kind: "look" })}>
                {t.ui.color}
              </ChipTab>
              <CoinChip coins={st.coins} ariaLabel={t.nav.coinsAria} />
              {colorChips}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: M.muted, lineHeight: 1.45 }}>
              {t.shopUi.keepsColor} {allOneColor ? "" : t.shopUi.wantSet}
            </p>
          </div>
        </div>

        {/* ── RIGHT: the readout ───────────────────────────────────────── */}
        {/* AN INLINE `display` BEATS THE CLASS THAT HIDES IT. This column
            carried style={{ display: "flex" }} beside .desktopOnly, and an
            inline rule wins over a stylesheet rule, so the phone rendered the
            whole desktop rail UNDER the phone stack: a second copy of the
            readout, the matching panel and the name row, below the Save
            button where nobody scrolled to find them. The flex lives on an
            inner box now, so the class is the only thing setting `display`
            and the media query can do its job. */}
        <div className={uiCss.desktopOnly}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: M.muted, lineHeight: 1.45 }}>{t.teach.size}</p>
          </Panel>
          <Panel title={t.set.title}>
            {setLines(false)}
            <p style={{ margin: "10px 0 0", fontSize: 11.5, color: M.muted, lineHeight: 1.45 }}>{t.teach.matching}</p>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: M.muted, lineHeight: 1.45 }}>{SET_LINES.weapon}</p>
          </Panel>
        </div>
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

      {/* the naming is the ONE place a robot becomes theirs, so it is the
          same picker here and at the first meeting in the garage: word
          tables, one tap, and never a text box (_components/NamePicker.tsx) */}
      {sheet?.kind === "name" ? (
        <Sheet
          title={t.build.name}
          onClose={() => setSheet(null)}
          action={
            <Button variant="primary" onClick={() => setSheet(null)}>
              {t.ui.done}
            </Button>
          }
        >
          <NamePicker name={build.name} onChange={(name) => setBuild((b) => ({ ...b, name }))} />
        </Sheet>
      ) : null}

      {/* the phone's copy of the same panel: one component, so a face row on a
          390 wide screen can never be a different face row */}
      {sheet?.kind === "look" ? (
        <Sheet title={t.ui.color} onClose={() => setSheet(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, alignItems: "flex-start" }}>{colorChips}</div>
          {lookPanel(true)}
          {/* the last button sits on the phone's 64px dock without this */}
          <p style={{ margin: "12px 0 24px", fontSize: 11.5, color: M.muted }}>{t.build.decalNote}</p>
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
