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
import {
  COLLECTION_LP_DAYS,
  ITEMS,
  MARKETS,
  type CollectionId,
  type ItemDef,
} from "./_engine/items";
import { SELL_BACK, type HireKind } from "./_engine/world";

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
  incomeLp: number;
  incomeVol: number;
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
}

export const PARKED_STEPS = [0, 5, 10, 25, 60, 120, 250, 500, 1000];
export const VOLUME_STEPS = [0, 20, 50, 100, 150, 300, 600, 1000];

const cardBase: React.CSSProperties = {
  position: "absolute",
  bottom: 12,
  background: "rgba(27,19,16,0.92)",
  border: "1px solid #4a3626",
  borderRadius: 14,
  color: "#f3e9d2",
  fontFamily: 'ui-rounded, "Segoe UI", system-ui, sans-serif',
  fontSize: 12,
  padding: "10px 12px",
  zIndex: 5,
  backdropFilter: "blur(3px)",
};

export function DialsPanel({
  snap,
  collapsed,
  onToggle,
  onDials,
  onMarket,
}: {
  snap: PanelSnapshot;
  collapsed: boolean;
  onToggle: () => void;
  onDials: (parkedUsd: number, volumeUsd: number) => void;
  onMarket: (id: string) => void;
}) {
  const pIdx = PARKED_STEPS.findIndex((v) => v >= snap.parkedUsd);
  const vIdx = VOLUME_STEPS.findIndex((v) => v >= snap.volumeUsd);
  const parkedIdx = pIdx < 0 ? PARKED_STEPS.length - 1 : pIdx;
  const volumeIdx = vIdx < 0 ? VOLUME_STEPS.length - 1 : vIdx;

  return (
    <div style={{ ...cardBase, left: 12, width: 236 }}>
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
      {!collapsed && (
        <>
          <div style={{ opacity: 0.75, lineHeight: 1.35, marginBottom: 4 }}>
            Your position pays you coins. Spend them in the shop.
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
            <b style={{ color: "#e8a13d" }}>
              ${snap.liveParked ? snap.parkedUsd.toFixed(2) : PARKED_STEPS[parkedIdx]}
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
            earns <b>+{snap.incomeLp.toFixed(1)}</b> coins each hour
          </div>
          <div style={{ margin: "8px 0 2px", opacity: 0.75 }}>
            Trading this week: <b style={{ color: "#e8a13d" }}>${VOLUME_STEPS[volumeIdx]}</b>
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
            earns <b>+{snap.incomeVol.toFixed(1)}</b> coins each hour
          </div>
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
    </div>
  );
}

// ── shop ───────────────────────────────────────────────────────────────────

const TABS: { id: CollectionId; label: string }[] = [
  { id: "essentials", label: "Basics" },
  { id: "trattoria", label: "🇮🇹" },
  { id: "izakaya", label: "🇯🇵" },
  { id: "taqueria", label: "🇲🇽" },
  { id: "diner", label: "🇺🇸" },
  { id: "bistro", label: "🇫🇷" },
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

const actionBtn = (enabled: boolean, accent = "#e8a13d"): React.CSSProperties => ({
  padding: "4px 9px",
  borderRadius: 999,
  border: `1px solid ${enabled ? accent : "#4a3626"}`,
  background: enabled ? "#2a1c14" : "#241a14",
  color: enabled ? "#f3e9d2" : "#8a7a63",
  fontSize: 11,
  fontWeight: 800,
  cursor: enabled ? "pointer" : "default",
  whiteSpace: "nowrap",
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
      <button onClick={() => !disabled && onBuy()} disabled={disabled} style={actionBtn(!disabled)}>
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
        <img
          src={itemArtSrc(item, theme)}
          alt=""
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
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
          <button onClick={() => canBuy && onBuy(item.id)} disabled={!canBuy} style={actionBtn(canBuy)}>
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
  onToggle,
  onBuyHire,
  onBuyItem,
  onSellItem,
  onPlaceItem,
}: {
  snap: PanelSnapshot;
  theme: string;
  collapsed: boolean;
  onToggle: () => void;
  onBuyHire: (hire: HireKind) => void;
  onBuyItem: (itemId: string) => void;
  onSellItem: (itemId: string) => void;
  onPlaceItem: (itemId: string) => void;
}) {
  const [tab, setTab] = useState<CollectionId>("essentials");
  const items: ItemDef[] = ITEMS.filter((i) => i.collection === tab && i.cost > 0);
  const market = MARKETS.find((m) => m.collection === tab);
  const tenure = market ? snap.lpDays[market.id] ?? 0 : 0;
  const unlocked = !market || tenure >= COLLECTION_LP_DAYS;

  return (
    <div style={{ ...cardBase, right: 12, width: 244 }}>
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
      {!collapsed && (
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
