/**
 * THE SHOP (screens doc 1 row 5, economy doc section 3): today's shelf.
 * Six listings picked by a deterministic seed from the engine catalog
 * (fixtures.shopListings: seed = fnv1a("bb:" + month + ":" + day); 2 T1,
 * 2 T2, 1 T3, and a T4 on Wednesdays and Saturdays), tier ring colours,
 * family and colour on every card ("Kettle . mint"), one purchase per
 * listing per day, "Buy for N" deducting local coins and adding an owned
 * instance with provenance "Found in the {day} shop", the rotation line,
 * and a level gate line on T3 and T4 cards ("Needs bot level 5").
 *
 * The one clock read is at mount; the date is handed to shopListings as a
 * value. The shelf diorama is a lit clay band in the dark frame (the one
 * visual rule): the shelf and crate props with the six thumbs on a plank,
 * every image hiding itself when the art folder is missing.
 */
"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "../_components/PageShell";
import { STAT_ICON } from "../_ui/icons";
import { Button, ChipTab, CoinChip, Dot, Panel, uiCss } from "../_ui/primitives";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, K, M, PAINTS, R, TAP, TIER_COLOR } from "../_ui/tokens";
import {
  CARD_SLOTS,
  LEVEL_FOR_TIER,
  MONTHS_SHORT,
  SLOT_STATS,
  WEEKDAYS,
  dayKey,
  partArt,
  partTotal,
  shopListings,
  type CardSlot,
  type ShopListing,
} from "@/lib/bots/fixtures";
import { boughtToday, buyListing, useGarage, utcParts, type GarageState } from "@/lib/bots/garage-state";
import { STRINGS, fill } from "@/lib/bots/strings";

const t = STRINGS.en;

type BuyState = { kind: "buy" } | { kind: "bought" } | { kind: "coins"; need: number } | { kind: "level"; need: number };

function buyState(st: GarageState, day: string, l: ShopListing): BuyState {
  if (boughtToday(st, day, l.id)) return { kind: "bought" };
  const need = LEVEL_FOR_TIER[l.card.tier];
  if (st.level < need) return { kind: "level", need };
  if (l.card.price > st.coins) return { kind: "coins", need: l.card.price - st.coins };
  return { kind: "buy" };
}

function ShopCard({ listing, state, onBuy }: { listing: ShopListing; state: BuyState; onBuy: () => void }) {
  const c = listing.card;
  const color = TIER_COLOR[c.tier];
  const keys = SLOT_STATS[c.slot];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "14px 14px 14px 12px",
        borderRadius: R.card,
        border: `1px solid ${M.border}`,
        borderLeft: `3px solid ${color}`,
        background: M.surface,
        color: M.text,
        fontFamily: FONT_BODY,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ width: 72, height: 72, borderRadius: 14, border: `3px solid ${color}`, background: `linear-gradient(180deg, ${K.paper}, ${K.floor})`, display: "grid", placeItems: "center", flex: "0 0 auto", overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={partArt(c).base} alt="" style={{ width: 60, height: 60, objectFit: "contain" }} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_MONO, fontSize: 11, color: M.muted, marginTop: 3 }}>
            <Dot color={color} />
            {t.ui.card[c.slot]} . {fill(t.ui.tierWord, { t: c.tier })} . {fill(t.ui.pts, { n: partTotal(c) })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: M.muted, marginTop: 4 }}>
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: R.pill, background: PAINTS[c.color], display: "inline-block", flex: "0 0 auto" }} />
            {fill(t.set.line, { family: c.family, color: t.paintName[c.color] })}
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {keys.map((k, i) => {
          const Icon = STAT_ICON[k];
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              <span style={{ color: M.muted, display: "grid" }}>
                <Icon size={14} />
              </span>
              <span style={{ fontSize: 11.5, color: M.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.ui.stat[k]}</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{c.s[i]}</span>
            </div>
          );
        })}
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: M.lore, lineHeight: 1.45, minHeight: 36 }}>{c.lore}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 14, fontVariantNumeric: "tabular-nums", flex: 1 }}>{fill(t.shopUi.coins, { n: c.price.toLocaleString("en-US") })}</span>
        {state.kind === "buy" ? (
          <Button variant="primary" onClick={onBuy}>
            {fill(t.shop.buy, { coins: c.price.toLocaleString("en-US") })}
          </Button>
        ) : state.kind === "bought" ? (
          <Button disabled>{t.shopUi.bought}</Button>
        ) : state.kind === "level" ? (
          <Button disabled title={fill(t.shopUi.needsLevel, { n: state.need })}>
            {fill(t.shop.buy, { coins: c.price.toLocaleString("en-US") })}
          </Button>
        ) : (
          <Button disabled title={fill(t.shop.notEnough, { n: state.need })}>
            {fill(t.shop.buy, { coins: c.price.toLocaleString("en-US") })}
          </Button>
        )}
      </div>
      {state.kind === "level" ? (
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: M.warn }}>{fill(t.shopUi.needsLevel, { n: state.need })}</div>
      ) : state.kind === "coins" ? (
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: M.muted }}>{fill(t.shop.notEnough, { n: state.need })}</div>
      ) : null}
    </div>
  );
}

/** a prop that hides itself when the art folder is missing */
function Prop({ src, height, style }: { src: string; height: number; style?: React.CSSProperties }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" onError={() => setOk(false)} style={{ height, width: "auto", display: "block", ...style }} />;
}

export default function ShopClient() {
  const params = useSearchParams();
  const slotParam = params.get("slot");
  const [slot, setSlot] = useState<CardSlot | null>(
    slotParam && (CARD_SLOTS as readonly string[]).includes(slotParam) ? (slotParam as CardSlot) : null,
  );
  // the one clock read: at mount, then the date is a value
  const mountNow = useRef(0);
  if (mountNow.current === 0 && typeof window !== "undefined") mountNow.current = Date.now();
  const st = useGarage(mountNow.current);
  const [now, setNow] = useState(0);
  useEffect(() => setNow(Date.now()), []);
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  const cal = useMemo(() => (now ? utcParts(now) : null), [now]);
  const day = cal ? dayKey(cal.year, cal.month, cal.day) : "";
  const weekday = cal ? WEEKDAYS[cal.weekday] : "";
  const listings = useMemo(() => (cal ? shopListings(cal.year, cal.month, cal.day, cal.weekday) : []), [cal]);
  const shown = useMemo(() => listings.filter((l) => !slot || l.card.slot === slot), [listings, slot]);

  const buy = (l: ShopListing) => {
    if (!cal) return;
    const provenance = `${fill(t.part.foundShop, { day: weekday })} . ${cal.day} ${MONTHS_SHORT[cal.month - 1]}`;
    const r = buyListing(l, day, provenance);
    if (r.ok) say(fill(t.shopUi.added, { name: l.card.name }));
    else if (r.reason === "bought") say(t.shopUi.bought);
    else if (r.reason === "level") say(fill(t.shopUi.needsLevel, { n: r.need }));
    else say(fill(t.shop.notEnough, { n: r.need }));
  };

  // ── the screenshot harness hook (dev only; bots-shot.mjs waits on it) ───
  useEffect(() => {
    if (!cal) return;
    const w = window as unknown as Record<string, unknown>;
    w.__bots = {
      ready: true,
      buy: (id: string) => {
        const l = listings.find((x) => x.id === id);
        if (l) buy(l);
      },
      state: () => ({ coins: st.coins, level: st.level, day, listings: listings.map((l) => l.id), bought: st.bought[day] ?? [] }),
    };
    return () => {
      delete w.__bots;
    };
    // buy closes over the latest store through buyListing's module state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cal, listings, st, day]);

  return (
    <PageShell wide>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", margin: "8px 0 12px" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "0.32em", textTransform: "uppercase", color: M.muted, margin: "0 0 6px" }}>
            {weekday ? fill(t.shopUi.today, { day: weekday }) : t.nav.shop}
          </p>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 28, margin: 0, color: M.text }}>{t.shop.title}</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted }}>{fill(t.shopUi.yourLevel, { n: st.level })}</span>
          <CoinChip coins={st.coins} ariaLabel={t.nav.coinsAria} />
        </div>
      </div>

      {/* ── the shelf: a lit clay band inside the dark frame ──────────────── */}
      <div
        style={{
          position: "relative",
          height: 200,
          borderRadius: R.frame,
          border: `1px solid ${M.border}`,
          boxShadow: `inset 0 1px 0 ${M.highlight}`,
          // six stepped wall bands (never a smooth gradient), then the floor
          background: `linear-gradient(180deg, #f1e8d9 0%, #f1e8d9 12%, #ece2d2 12%, #ece2d2 24%, #e9dfcf 24%, #e9dfcf 36%, #e3d8c7 36%, #e3d8c7 48%, #dccfbd 48%, #dccfbd 60%, #d4c7b4 60%, #d4c7b4 70%, ${K.floor} 70%, ${K.floor} 100%)`,
          overflow: "hidden",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "0 28px",
        }}
      >
        <Prop src="/bots-art/props/shop-shelf.png" height={186} style={{ marginBottom: 4 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0, margin: "0 16px 30px" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end", justifyContent: "center", flexWrap: "wrap" }}>
            {listings.map((l) => (
              <span key={l.id} style={{ width: 60, height: 60, borderRadius: 12, border: `3px solid ${TIER_COLOR[l.card.tier]}`, background: `linear-gradient(180deg, ${K.paper}, ${K.floor})`, display: "grid", placeItems: "center", overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={partArt(l.card).base} alt="" style={{ width: 50, height: 50, objectFit: "contain" }} />
              </span>
            ))}
          </div>
          {/* the plank they sit on, drawn */}
          <div style={{ width: "100%", maxWidth: 560, height: 14, borderRadius: 4, background: "#c48a4a", boxShadow: "0 6px 0 #a06f36" }} />
        </div>
        <Prop src="/bots-art/props/shop-crate.png" height={120} style={{ marginBottom: 6 }} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", margin: "12px 0 16px", fontSize: 12.5, color: M.muted }}>
        <span>{t.shop.rotates}</span>
        <span>{t.shopUi.one}</span>
        <span>{t.shopUi.t4Days}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 4, flexWrap: "wrap" }}>
          <ChipTab active={slot == null} onClick={() => setSlot(null)}>
            {t.ui.all}
          </ChipTab>
          {CARD_SLOTS.map((s) => (
            <ChipTab key={s} active={slot === s} onClick={() => setSlot(s)}>
              {t.ui.card[s]}
            </ChipTab>
          ))}
        </span>
      </div>

      {shown.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {shown.map((l) => (
            <ShopCard key={l.id} listing={l} state={buyState(st, day, l)} onBuy={() => buy(l)} />
          ))}
        </div>
      ) : (
        <Panel>
          <p style={{ margin: 0, fontSize: 13, color: M.muted }}>{cal ? t.shopUi.empty : ""}</p>
        </Panel>
      )}

      {toast ? (
        <div className={uiCss.toast} role="status" style={{ position: "fixed", left: 0, right: 0, top: 64, display: "flex", justifyContent: "center", zIndex: 1200, pointerEvents: "none" }}>
          <span style={{ padding: "10px 16px", borderRadius: R.pill, background: M.surface, border: `1px solid ${M.border}`, fontSize: 13, fontWeight: 600, minHeight: TAP, display: "inline-flex", alignItems: "center", fontFamily: FONT_BODY }}>
            {toast}
          </span>
        </div>
      ) : null}
    </PageShell>
  );
}
