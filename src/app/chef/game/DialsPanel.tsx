"use client";

/**
 * Chrome panels (ADR-0103/0104): the POSITION card (demo-config sliders
 * standing in for real chain reads until the chain milestone — your position
 * prints coins) and the SHOP, now tabbed: Essentials (hires) and one tab per
 * furniture collection. Bought furniture lands in your inventory; you place
 * it yourself in edit mode.
 *
 * DOM/React per ADR-0101 — no Pixi here. Player copy: 6th grade, kind, no
 * em-dashes, never "win $X".
 */

import { useState } from "react";
import { FONT } from "./_ui/tokens";
import {
  COLLECTION_LP_DAYS,
  ITEMS,
  MARKETS,
  type CollectionId,
  type ItemDef,
} from "./_engine/items";
import { SELL_BACK, type HireKind } from "./_engine/world";
import { THEME_IDS, THEME_META } from "./_view/preload";

export interface PanelSnapshot {
  tierName: string;
  seatsOpen: number;
  tables: number;
  stoves: number;
  waiters: number;
  chefs: number;
  speed: number;
  quality: number;
  presence: number;
  coins: number;
  clock: string;
  phase: string;
  line: string;
  parkedUsd: number;
  volumeUsd: number;
  gusHere: boolean;
  /** the wallet multiplier on what every plate pays (M11 inversion) */
  multLp: number;
  multVol: number;
  multTotal: number;
  multCapped: boolean;
  /** quality v2 parts (ADR-0106), all earned, none purchasable */
  qBase: number;
  qPresence: number;
  qClean: number;
  qDishes: number;
  bestQuality: number;
  trashCount: number;
  toiletsBroken: number;
  toiletsTotal: number;
  hireCosts: Record<HireKind, number | null>;
  chefNeedsStove: boolean;
  inventory: Record<string, number>;
  editing: boolean;
  /** which market the position sits at, and banked LP tenure per market */
  market: string;
  lpDays: Record<string, number>;
  /** true when the parked figure is read from the wallet, not the slider */
  liveParked: boolean;
  /** the public service ladder (ADR-0111) */
  tier: string;
  tierBlurb: string;
  topTier: boolean;
  toTopTier: number;
  /**
   * Counters the first-run coach watches (M8). They come from the same 600ms
   * snapshot everything else reads, so the intro can never disagree with what
   * the player is looking at.
   */
  arrived: number;
  hustles: number;
  /** has the player ever opened the money card (M10 coach step 5) */
  lpCardOpened: boolean;
  busedByPlayer: number;
  placements: number;
  dirtyTables: number;
  /** today's special: what it is and whether it has been cooked */
  dailyName: string;
  dailyPrepped: boolean;
  /** daily goals (CUTE+VIRAL): plates served today, and the hello */
  dailyPlates: number;
  dailyGreeted: boolean;
  dailyReady: boolean;
  /** regulars still expected today, by name (M8b) */
  dueNames: string[];
  /** the shell that can be bought next, or null at the biggest one (M8b) */
  nextShell: { label: string; cost: number; blurb: string } | null;
}

export interface LiveCampaign {
  market: string;
  endsAt: string;
  /** when the current 12h scoring window closes */
  windowEndsAt: string;
}

/**
 * THE CAMPAIGN LINE (M10). Shown only while a campaign is actually running.
 *
 * A campaign is one DROP: a set amount, roughly a fortnight, then it settles
 * and closes. Drops arrive irregularly, so most of the time there is nothing
 * here and this renders NOTHING. It never says "no rewards right now": the
 * kindness laws forbid telling a player they have missed something, and a
 * quiet week is not a failure they caused.
 *
 * ⚠️ No pot, no share, no dollar figure, ever. ADR-0042: the ladder is public
 * and the payout math is private, and a live mid-week forecast is forbidden
 * because pro-rata estimates can go DOWN.
 */
function CampaignLine({ campaign }: { campaign?: LiveCampaign | null }) {
  if (!campaign) return null;
  const left = Date.parse(campaign.windowEndsAt) - Date.now();
  const hrs = Math.max(0, Math.floor(left / 3_600_000));
  const mins = Math.max(0, Math.floor((left % 3_600_000) / 60_000));
  return (
    <div
      style={{
        marginTop: 8,
        paddingTop: 7,
        borderTop: "1px solid rgba(74,54,38,0.6)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontWeight: 800, color: "#e8a13d" }}>
          {campaign.market} is running a reward
        </span>
      </div>
      <div style={{ opacity: 0.7, marginTop: 3, lineHeight: 1.4 }}>
        Trading and liquidity at this market both count while it lasts. This
        round closes in {hrs}h {mins}m.
      </div>
    </div>
  );
}

export const PARKED_STEPS = [0, 5, 10, 25, 60, 120, 250, 500, 1000];
export const VOLUME_STEPS = [0, 20, 50, 100, 150, 300, 600, 1000];

/**
 * The floating panel shell.
 *
 * maxHeight + overflowY are LOAD-BEARING, not polish. These panels are
 * bottom-anchored and grow upward with their content, so without a ceiling the
 * shop grew to 1332px inside a 917px viewport and started at y = -427: the
 * first few items were literally off the top of the screen and unclickable,
 * with no scrollbar to hint that anything was missing. Measured in headless
 * Chrome via scripts/dk-shot.mjs, which is also the only reason it was ever
 * noticed.
 *
 * The panel is over the game art, so it also needs to read as ABOVE it. A
 * shadow plus a hairline top highlight does that; the old flat card sat in the
 * same visual plane as the room.
 */
const cardBase: React.CSSProperties = {
  position: "absolute",
  bottom: 12,
  background: "rgba(27,19,16,0.94)",
  border: "1px solid #4a3626",
  borderRadius: 14,
  color: "#f3e9d2",
  fontFamily: FONT,
  fontSize: 12,
  padding: "10px 12px",
  zIndex: 5,
  backdropFilter: "blur(6px)",
  maxHeight: "calc(100vh - 104px)",  // clears a wrapped chip bar
  overflowY: "auto",
  overscrollBehavior: "contain",
  boxShadow: "0 10px 28px rgba(8,4,2,0.5), inset 0 1px 0 rgba(255,240,214,0.07)",
  scrollbarWidth: "thin",
  scrollbarColor: "#6b5238 transparent",
};

export function DialsPanel({
  snap,
  collapsed,
  fullWidth,
  onToggle,
  onDials,
  onMarket,
  campaign,
  bare,
  section,
}: {
  snap: PanelSnapshot;
  collapsed: boolean;
  /** narrow layout: stretch to the container instead of a fixed 236px card */
  fullWidth?: boolean;
  onToggle: () => void;
  onDials: (parkedUsd: number, volumeUsd: number) => void;
  onMarket: (id: string) => void;
  /** the live campaign for THIS market, or null when none is running (M10) */
  campaign?: LiveCampaign | null;
  /**
   * Inside a Sheet (M11): the Sheet brings the title and the card chrome, so
   * the panel renders content only. Bare implies expanded.
   */
  bare?: boolean;
  /**
   * Which half to render (M11). The old card showed everything at once;
   * the HUD splits it into the Money sheet ("money") and the Service sheet
   * ("service"). Omitted = both, so nothing else changes behavior.
   */
  section?: "money" | "service";
}) {
  const pIdx = PARKED_STEPS.findIndex((v) => v >= snap.parkedUsd);
  const vIdx = VOLUME_STEPS.findIndex((v) => v >= snap.volumeUsd);
  const parkedIdx = pIdx < 0 ? PARKED_STEPS.length - 1 : pIdx;
  const volumeIdx = vIdx < 0 ? VOLUME_STEPS.length - 1 : vIdx;

  const open = bare || !collapsed;
  return (
    <div
      style={
        bare
          ? { fontFamily: FONT, fontSize: 12, color: "#f3e9d2", pointerEvents: "auto" }
          : { ...cardBase, position: "static", bottom: "auto", width: fullWidth ? "auto" : 236, alignSelf: fullWidth ? "stretch" : undefined, maxHeight: fullWidth ? "58vh" : cardBase.maxHeight, flexShrink: 1, minHeight: 0, pointerEvents: "auto" }
      }
    >
      {!bare && (
        <div
          onClick={onToggle}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            marginBottom: collapsed ? 0 : 6,
          }}
        >
          <span style={{ fontWeight: 800, letterSpacing: "0.04em" }}>
            {snap.phase} {snap.clock} · {snap.tierName}
          </span>
          <span style={{ opacity: 0.7 }}>{collapsed ? "▸" : "▾"}</span>
        </div>
      )}
      {open && (
        <>
          {section !== "service" && (
          <>
          {!snap.liveParked && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  color: "#8a7a63",
                  border: "1px solid #4a3626",
                  borderRadius: 999,
                  padding: "2px 8px",
                }}
              >
                PRACTICE
              </span>
              <span style={{ opacity: 0.65, lineHeight: 1.3 }}>
                Pretend numbers so you can see how earning works.
              </span>
            </div>
          )}
          <div style={{ opacity: 0.75, lineHeight: 1.35, marginBottom: 4 }}>
            Serving guests pays you coins. Money working here multiplies what every plate earns.
          </div>
          <div style={{ opacity: 0.75, marginBottom: 3 }}>Sourcing from</div>
          <div style={{ display: "flex", gap: 5, marginBottom: 5, flexWrap: "wrap" }}>
            {MARKETS.map((m) => {
              const on = snap.market === m.id;
              const days = snap.lpDays[m.id] ?? 0;
              return (
                <button
                  key={m.id}
                  onClick={() => onMarket(m.id)}
                  style={{
                    padding: "4px 9px",
                    borderRadius: 999,
                    border: `1px solid ${on ? "#e8a13d" : "#4a3626"}`,
                    background: on ? "#2f2016" : "#1f150f",
                    color: "#f3e9d2",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {m.label}
                  {days > 0 && (
                    <span style={{ opacity: 0.65, fontWeight: 500 }}>
                      {" "}
                      {days >= COLLECTION_LP_DAYS ? "★" : `${days}d`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ margin: "6px 0 2px", opacity: 0.75 }}>
            Parked in the market:{" "}
            <b style={{ color: snap.liveParked ? "#e8a13d" : "#c9b79a" }}>
              ${snap.liveParked ? snap.parkedUsd.toFixed(2) : snap.parkedUsd}
            </b>
            {snap.liveParked && <span style={{ color: "#6fe3a0", marginLeft: 6 }}>live</span>}
          </div>
          {snap.liveParked ? (
            <div style={{ opacity: 0.6, lineHeight: 1.35 }}>
              Read from your wallet. Untick the box on the position card to go back to practice.
            </div>
          ) : (
            <input
              type="range"
              min={0}
              max={PARKED_STEPS.length - 1}
              step={1}
              value={parkedIdx}
              onChange={(e) => onDials(PARKED_STEPS[Number(e.target.value)], VOLUME_STEPS[volumeIdx])}
              style={{ width: "100%", accentColor: "#e8a13d" }}
              aria-label="Parked dollars"
            />
          )}
          <div style={{ opacity: 0.65, marginTop: 1 }}>
            adds <b>x{snap.multLp.toFixed(2)}</b> to what every plate pays
          </div>
          <div style={{ margin: "8px 0 2px", opacity: 0.75 }}>
            {/* the SIM value, never the snapped slider step: this once showed
                $100 for a world running on 60, with the earnings line under it
                computed from the 60. Numbers on one card must agree. */}
            Trading this week:{" "}
            <b style={{ color: snap.liveParked ? "#e8a13d" : "#c9b79a" }}>${snap.volumeUsd}</b>
          </div>
          <input
            type="range"
            min={0}
            max={VOLUME_STEPS.length - 1}
            step={1}
            value={volumeIdx}
            onChange={(e) => onDials(PARKED_STEPS[parkedIdx], VOLUME_STEPS[Number(e.target.value)])}
            style={{ width: "100%", accentColor: "#e8a13d" }}
            aria-label="Weekly trading volume"
          />
          <div style={{ opacity: 0.65, marginTop: 1 }}>
            adds <b>x{snap.multVol.toFixed(2)}</b> to what every plate pays
            {snap.multCapped && <span style={{ opacity: 0.8 }}> · at the x2.5 cap</span>}
          </div>
          <div style={{ marginTop: 5, opacity: 0.8 }}>
            Every plate your kitchen serves pays <b style={{ color: "#e8a13d" }}>x{snap.multTotal.toFixed(2)}</b> right now.
          </div>
          <CampaignLine campaign={campaign} />
          </>
          )}
          {section !== "money" && (
          <>
          <div style={{ height: 6 }} />
          <div style={{ display: "flex", gap: 10, opacity: 0.8, flexWrap: "wrap" }}>
            <span>🪑 {snap.seatsOpen} seats</span>
            <span>🔥 {snap.stoves}</span>
            <span>👨‍🍳 {snap.chefs}</span>
            <span>🧑‍💼 {snap.waiters}</span>
          </div>
          <div style={{ margin: "8px 0 2px", opacity: 0.75, display: "flex", justifyContent: "space-between" }}>
            <span>Service quality</span>
            <span style={{ opacity: 0.75 }}>
              {Math.round(snap.quality)} · best {Math.round(snap.bestQuality)}
            </span>
          </div>
          {/* every segment is earned: hands, upkeep, and the pantry */}
          <div
            style={{
              height: 11,
              borderRadius: 999,
              background: "#31241b",
              border: "1px solid #4a3626",
              overflow: "hidden",
              display: "flex",
            }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(snap.quality)}
            title="Baseline + your hands + upkeep + the pantry"
          >
            <div style={{ width: `${snap.qBase}%`, background: "#8a6a45" }} />
            <div style={{ width: `${snap.qPresence}%`, background: "#e8a13d" }} />
            <div style={{ width: `${snap.qClean}%`, background: "#6fb0c9" }} />
            <div style={{ width: `${snap.qDishes}%`, background: "#8fbf6a" }} />
          </div>
          <div style={{ display: "flex", gap: 9, marginTop: 4, opacity: 0.7, flexWrap: "wrap", fontSize: 11 }}>
            <span><span style={{ color: "#e8a13d" }}>■</span> hands {Math.round(snap.qPresence)}</span>
            <span><span style={{ color: "#6fb0c9" }}>■</span> upkeep {Math.round(snap.qClean)}</span>
            <span><span style={{ color: "#8fbf6a" }}>■</span> dishes {Math.round(snap.qDishes)}</span>
          </div>
          {/* DAILY GOALS (CUTE+VIRAL). Three kind finish lines for a short
              session. Done rows get a check and warm color; undone rows are
              simply not-yet, never a debt: no streaks, nothing shown as
              missed, and at the day's end the card quietly resets. */}
          <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid rgba(74,54,38,0.6)" }}>
            <div style={{ opacity: 0.75, marginBottom: 4 }}>Today&apos;s goals</div>
            {[
              {
                done: snap.dailyPlates >= 10,
                text:
                  snap.dailyPlates >= 10
                    ? "Served 10 plates"
                    : `Serve 10 plates (${Math.min(10, snap.dailyPlates)}/10)`,
              },
              { done: snap.dailyPrepped, text: snap.dailyPrepped ? "Cooked the special" : "Cook today's special" },
              { done: snap.dailyGreeted, text: snap.dailyGreeted ? "Said hello to a guest" : "Say hello to a guest" },
            ].map((g2, i2) => (
              <div key={i2} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3 }}>
                <span
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: 999,
                    border: `1px solid ${g2.done ? "#8fbf6a" : "#4a3626"}`,
                    background: g2.done ? "rgba(143,191,106,0.18)" : "transparent",
                    color: "#8fbf6a",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 10,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {g2.done ? "✓" : ""}
                </span>
                <span style={{ opacity: g2.done ? 0.85 : 0.65, color: g2.done ? "#f3e9d2" : undefined }}>
                  {g2.text}
                </span>
              </div>
            ))}
          </div>
          {/* TODAY (M8). The one line that is different from yesterday, on the
              card the player already has open. Without it the daily special
              lives entirely inside a modal nobody has a reason to open. */}
          {snap.dailyName && (
            <div
              style={{
                marginTop: 8,
                paddingTop: 7,
                borderTop: "1px solid rgba(74,54,38,0.6)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              <span style={{ opacity: 0.75 }}>Today</span>
              <span
                style={{
                  fontWeight: 700,
                  color: snap.dailyPrepped ? "#e8a13d" : snap.dailyReady ? "#f3e9d2" : "#8a7a63",
                  textAlign: "right",
                }}
              >
                {snap.dailyName}
                {snap.dailyPrepped ? " · on" : snap.dailyReady ? " · ready to cook" : ""}
              </span>
            </div>
          )}
          {/* who is still expected (M8b). Only ever shown when somebody IS
              due: an empty "nobody today" line would read as a scolding, and
              a day without regulars is not a day you did anything wrong. */}
          {snap.dueNames.length > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 8,
                marginTop: 3,
              }}
            >
              <span style={{ opacity: 0.75 }}>Expected</span>
              <span style={{ fontWeight: 700, textAlign: "right" }}>
                {snap.dueNames.join(", ")}
              </span>
            </div>
          )}
          {/* the PUBLIC service ladder (ADR-0111): where you stand, never a
              dollar figure and never the payout math */}
          <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid rgba(74,54,38,0.6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ opacity: 0.75 }}>Service record</span>
              <span style={{ fontWeight: 800, color: snap.topTier ? "#e8a13d" : "#f3e9d2" }}>
                {snap.topTier ? "★ " : ""}
                {snap.tier}
              </span>
            </div>
            <div style={{ opacity: 0.6, marginTop: 3, lineHeight: 1.35 }}>{snap.tierBlurb}</div>
            {!snap.topTier && snap.toTopTier > 0 && (
              <div style={{ opacity: 0.6, marginTop: 3 }}>
                {Math.ceil(snap.toTopTier)} more quality reaches the top table.
              </div>
            )}
          </div>

          {(snap.trashCount > 0 || snap.toiletsBroken > 0) && (
            <div style={{ marginTop: 5, color: "#6fb0c9", lineHeight: 1.35 }}>
              {snap.toiletsBroken > 0
                ? "A restroom needs fixing. Tap it, or the crew will get to it."
                : `${snap.trashCount} bit${snap.trashCount === 1 ? "" : "s"} of litter on the floor. Tap to sweep.`}
            </div>
          )}
          {snap.toiletsTotal === 0 && (
            <div style={{ marginTop: 5, opacity: 0.6, lineHeight: 1.35 }}>
              A restroom would lift your service. The shop has one.
            </div>
          )}
          <div style={{ marginTop: 7, lineHeight: 1.35, opacity: 0.85 }}>{snap.line}</div>
          {snap.gusHere && (
            <div style={{ marginTop: 5, color: "#e8a13d", fontWeight: 700 }}>
              Gus is at his table. He always tips.
            </div>
          )}
          <div style={{ marginTop: 6, opacity: 0.6, lineHeight: 1.35 }}>
            Tap a messy table to bus it. Tap your crew to hustle them.
          </div>
          </>
          )}
        </>
      )}
    </div>
  );
}

// ── shop ───────────────────────────────────────────────────────────────────

// Country codes, not flag emoji: Windows renders regional indicators as bare
// letter pairs, so these tabs read as unexplained initials there. See the
// note on THEME_META in _view/art-manifest.ts.
const TABS: { id: CollectionId; label: string }[] = [
  { id: "essentials", label: "Basics" },
  ...THEME_IDS.map((t) => ({ id: t as CollectionId, label: THEME_META[t].code })),
  // one tab per domain (ADR-0105)
  ...MARKETS.map((m) => ({ id: m.collection, label: `🔗 ${m.label.split(".")[0]}` })),
];

const HIRES: { hire: HireKind; label: string; effect: string }[] = [
  { hire: "waiter", label: "Hire a waiter", effect: "More hands on the floor." },
  { hire: "chef", label: "Hire a chef", effect: "Cooks a second dish at once." },
];

/** the baked sprite for an item: its own art set, or the active style's */
export function itemArtSrc(item: ItemDef, theme: string): string {
  // a domain piece keeps its own set; everything else follows the style
  const folder = item.artSet ?? theme;
  return `/chef-art/room/${folder}/${item.art}.png`;
}

/**
 * Shop actions come in three flavours and they used to be one pill: Buy, Place
 * and Sell were identical weight, so a row of three offered no clue which one
 * you actually wanted. `primary` fills the button in the accent so the main
 * action reads first; everything else stays a quiet outline.
 */
const actionBtn = (
  enabled: boolean,
  accent = "#e8a13d",
  primary = false
): React.CSSProperties => ({
  padding: "4px 10px",
  borderRadius: 999,
  border: `1px solid ${enabled ? accent : "#4a3626"}`,
  background: !enabled ? "#241a14" : primary ? accent : "#2a1c14",
  color: !enabled ? "#8a7a63" : primary ? "#1b1310" : "#f3e9d2",
  fontSize: 11,
  fontWeight: 800,
  cursor: enabled ? "pointer" : "default",
  whiteSpace: "nowrap",
  boxShadow: enabled && primary ? "0 1px 6px rgba(232,161,61,0.28)" : "none",
});

/** A hire: no art, no storage, just the one button. */
function HireRow({
  label,
  effect,
  owned,
  cost,
  disabled,
  note,
  onBuy,
}: {
  label: string;
  effect: string;
  owned?: string;
  cost: number | null;
  disabled: boolean;
  note?: string;
  onBuy: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 0",
        borderTop: "1px solid rgba(74,54,38,0.6)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>
          {label} {owned && <span style={{ opacity: 0.55, fontWeight: 400 }}>{owned}</span>}
        </div>
        <div style={{ opacity: 0.65, fontSize: 11, lineHeight: 1.3 }}>{note ?? effect}</div>
      </div>
      <button onClick={() => !disabled && onBuy()} disabled={disabled} style={actionBtn(!disabled, "#e8a13d", true)}>
        {cost === null ? "MAX" : cost}
      </button>
    </div>
  );
}

/** A furniture row: what it looks like, what it costs, and what you can do. */
function ItemRow({
  item,
  theme,
  held,
  coins,
  locked,
  onBuy,
  onSell,
  onPlace,
}: {
  item: ItemDef;
  theme: string;
  held: number;
  coins: number;
  locked: boolean;
  onBuy: (id: string) => void;
  onSell: (id: string) => void;
  onPlace: (id: string) => void;
}) {
  const canBuy = !locked && coins >= item.cost;
  const canSellOrPlace = held > 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "7px 0",
        borderTop: "1px solid rgba(74,54,38,0.6)",
        opacity: locked ? 0.55 : 1,
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          flexShrink: 0,
          borderRadius: 9,
          background: "rgba(20,14,11,0.6)",
          border: "1px solid rgba(74,54,38,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {/* the real baked sprite, so the shop shows the actual piece */}
        {/*
          The baked sprite sits inside a 192x224 canvas with a lot of
          transparent margin around it (the registration box), so drawn to fit
          it came out ~20px tall in a 42px chip and read as an EMPTY square.
          Scaling up inside the clip lets the piece actually fill its box; the
          slight rise re-centres on the object rather than the canvas.
        */}
        <img
          src={itemArtSrc(item, theme)}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            transform: "scale(1.42) translateY(3%)",
          }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>
          {item.label}{" "}
          {held > 0 && <span style={{ opacity: 0.55, fontWeight: 400 }}>· {held} stored</span>}
        </div>
        <div style={{ opacity: 0.62, fontSize: 11, lineHeight: 1.3 }}>
          {locked ? "Opens with liquidity tenure" : item.desc}
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" }}>
          <button onClick={() => canBuy && onBuy(item.id)} disabled={!canBuy} style={actionBtn(canBuy, "#e8a13d", true)}>
            Buy {item.cost}
          </button>
          <button
            onClick={() => canSellOrPlace && onPlace(item.id)}
            disabled={!canSellOrPlace}
            style={actionBtn(canSellOrPlace, "#6fe3a0")}
          >
            Place
          </button>
          <button
            onClick={() => canSellOrPlace && onSell(item.id)}
            disabled={!canSellOrPlace}
            style={actionBtn(canSellOrPlace, "#a98d6a")}
          >
            Sell {Math.floor(item.cost * SELL_BACK)}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ShopPanel({
  snap,
  theme,
  collapsed,
  fullWidth,
  onToggle,
  onBuyHire,
  onBuyItem,
  onSellItem,
  onPlaceItem,
  onExpand,
  bare,
}: {
  snap: PanelSnapshot;
  theme: string;
  collapsed: boolean;
  /** narrow layout: a full-width bottom sheet instead of a pinned side card */
  fullWidth?: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onBuyHire: (hire: HireKind) => void;
  onBuyItem: (itemId: string) => void;
  onSellItem: (itemId: string) => void;
  onPlaceItem: (itemId: string) => void;
  /** inside a Sheet (M11): the Sheet brings the title and card chrome */
  bare?: boolean;
}) {
  const [tab, setTab] = useState<CollectionId>("essentials");
  const items: ItemDef[] = ITEMS.filter((i) => i.collection === tab && i.cost > 0);
  const market = MARKETS.find((m) => m.collection === tab);
  const tenure = market ? snap.lpDays[market.id] ?? 0 : 0;
  const unlocked = !market || tenure >= COLLECTION_LP_DAYS;

  const open = bare || !collapsed;
  return (
    <div
      style={
        bare
          ? { fontFamily: FONT, fontSize: 12, color: "#f3e9d2", pointerEvents: "auto" }
          : fullWidth
          ? { ...cardBase, position: "static", bottom: "auto", width: "auto", alignSelf: "stretch", maxHeight: "58vh", minHeight: 0, pointerEvents: "auto" }
          : { ...cardBase, right: 12, width: 244 }
      }
    >
      {!bare && (
        <div
          onClick={onToggle}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            marginBottom: collapsed ? 0 : 6,
          }}
        >
          <span style={{ fontWeight: 800, letterSpacing: "0.04em" }}>
            🛒 SHOP · <span style={{ color: "#e8a13d" }}>{snap.coins} coins</span>
          </span>
          <span style={{ opacity: 0.7 }}>{collapsed ? "▸" : "▾"}</span>
        </div>
      )}
      {open && (
        <>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: `1px solid ${tab === t.id ? "#e8a13d" : "#4a3626"}`,
                  background: tab === t.id ? "#2f2016" : "#1f150f",
                  color: "#f3e9d2",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {market ? (
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontWeight: 800, color: unlocked ? "#e8a13d" : "#f3e9d2" }}>
                {unlocked ? "★ " : "🔒 "}
                {market.collectionName}
              </div>
              <div style={{ opacity: 0.7, lineHeight: 1.35 }}>{market.blurb}</div>
              {!unlocked && (
                <>
                  <div style={{ opacity: 0.75, marginTop: 4, lineHeight: 1.35 }}>
                    Keep liquidity at {market.label} for {COLLECTION_LP_DAYS} days and this
                    collection opens.
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                    {Array.from({ length: COLLECTION_LP_DAYS }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: 7,
                          borderRadius: 999,
                          background: i < tenure ? "#e8a13d" : "#31241b",
                          border: "1px solid #4a3626",
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ opacity: 0.6, marginTop: 3 }}>
                    Day {Math.min(tenure, COLLECTION_LP_DAYS)} of {COLLECTION_LP_DAYS}
                    {snap.market !== market.id ? ` · your position is at ${snap.market}` : ""}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div style={{ opacity: 0.65, lineHeight: 1.35, marginBottom: 2 }}>
              Bought is bought. New furniture waits in your inventory until you place it.
            </div>
          )}

          {/* THE ROOM ITSELF (M8b). Sits at the top of Basics because it is
              the thing worth saving for, and because a player whose floor is
              full needs to know that more floor is even possible. Priced in
              weeks, not minutes: it is the only sink that survives week two. */}
          {tab === "essentials" && snap.nextShell && (
            <HireRow
              label={`Take the ${snap.nextShell.label}`}
              effect={snap.nextShell.blurb}
              cost={snap.nextShell.cost}
              disabled={snap.coins < snap.nextShell.cost}
              note={
                snap.coins < snap.nextShell.cost
                  ? `${snap.nextShell.cost - snap.coins} more coins`
                  : undefined
              }
              onBuy={onExpand}
            />
          )}

          {tab === "essentials" &&
            HIRES.map((h) => {
              const cost = snap.hireCosts[h.hire];
              const gated = h.hire === "chef" && snap.chefNeedsStove;
              const afford = cost !== null && snap.coins >= cost;
              return (
                <HireRow
                  key={h.hire}
                  label={h.label}
                  effect={h.effect}
                  owned={h.hire === "waiter" ? `${snap.waiters}/2` : `${snap.chefs}/2`}
                  cost={cost}
                  note={gated ? "Needs a stove of their own first" : undefined}
                  disabled={cost === null || gated || !afford}
                  onBuy={() => onBuyHire(h.hire)}
                />
              );
            })}

          {items.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              theme={theme}
              held={snap.inventory[it.id] ?? 0}
              coins={snap.coins}
              locked={!unlocked}
              onBuy={onBuyItem}
              onSell={onSellItem}
              onPlace={onPlaceItem}
            />
          ))}
        </>
      )}
    </div>
  );
}
