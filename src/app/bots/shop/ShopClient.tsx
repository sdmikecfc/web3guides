/**
 * THE JUNKYARD (screens doc 3.3, economy doc section 3, ADR-0141).
 *
 * Mike, 2026-09-03: "I want it to be like a junkyard and shipments of parts
 * arrive everyday so they can buy certain ones each day with a lot of tier
 * 1s, less of the higher tiers with one one part in one color for tier 4
 * each day. Giving them reason to come check the shops to buy parts when
 * they want."
 *
 * One shipment a day at 00:00 UTC, 16 listings in five rows: 8 model 1, 4
 * model 2, 2 model 3, one model 4 in one colour, one weapon on the rack. Every
 * body listing carries a colour and the card keeps it for life, so the shelf
 * PRINTS the colour on every card and the calendar is published: knowing
 * when legs day is IS the reason to come back. The maths is pure and lives
 * in src/lib/bots/shipment.ts; this file only draws it.
 *
 * The one clock read is at mount. The date, and the countdown to the next
 * shipment, are values from there on (the tokens.ts no-clock law).
 *
 * Every image hides itself when the art folder is missing and a drawn clay
 * thumb takes its place, so the screen still reads with public/bots-art gone
 * (the house law, exercised by bots-shot.mjs --block bots-art).
 */
"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "../_components/PageShell";
import { HeapProp, TruckProp } from "./YardScene";
import { STAT_ICON } from "../_ui/icons";
import { Button, ChipTab, CoinChip, Panel, uiCss } from "../_ui/primitives";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, K, M, PAINTS, R, TAP, TIER_COLOR, type PaintId } from "../_ui/tokens";
import {
  CARD_SLOTS,
  MONTHS_SHORT,
  SLOT_STATS,
  WEEKDAYS,
  dayKey,
  partArt,
  partTotal,
  type CardSlot,
  type StatKey,
} from "@/lib/bots/fixtures";
import {
  PALETTE,
  addDays,
  msToNextShipment,
  shipmentFor,
  t4Calendar,
  weekdayOf,
  type Listing,
  type RowKey,
  type Shipment,
} from "@/lib/bots/shipment";
import { boughtToday, buyListing, useGarage, utcParts, type GarageState } from "@/lib/bots/garage-state";
import { STRINGS, fill, starWord } from "@/lib/bots/strings";
import {
  BODY_BRANDS,
  BRAND_INDEX,
  BRAND_OF_FAMILY,
  BRAND_OF_WEAPON,
  PART_WORD,
  SCRAP_NOTE,
  SHELF_WORDS,
  STAT_MEANING,
  WEAPON_BRANDS,
  leadStat,
  statChip,
  type BrandId,
} from "@/lib/bots/naming";
import { SCREEN_WORDS, STAT_NAME_OF, fillWords } from "@/lib/bots/naming-screens";
import css from "./shop.module.css";

const t = STRINGS.en;

/** Every brand a player can filter by, the two weapon brands last, because
 * the rack sits last on the shelf too. */
const ALL_BRANDS: readonly BrandId[] = [...BODY_BRANDS, ...WEAPON_BRANDS];

/**
 * The brand a shipped card belongs to. A body part goes by its family (the
 * family IS the brand plus the model number since the catalog rename); a
 * weapon goes by its own id. Starter scrap has no brand, and says so.
 */
function brandOf(card: { id: string; slot: CardSlot; family?: string }): BrandId | null {
  if (card.slot === "weapon") return BRAND_OF_WEAPON[card.id] ?? null;
  return card.family ? (BRAND_OF_FAMILY[card.family] ?? null) : null;
}

/**
 * The eyebrow over the name: ALWAYS the socket word, never the weapon's own
 * kind. A title already ends in "Hammer"; what a stranger does not know is
 * that a hammer is the weapon slot, so the label above says "WEAPON" and the
 * title says "Forge 4 Hammer". The two together teach the kind word.
 */
function socketWordOf(card: { slot: CardSlot }): string {
  return PART_WORD[card.slot];
}

/** Monday first, from the shared weekday table (no second copy of the words). */
const CAL_DAYS = [1, 2, 3, 4, 5, 6, 0].map((i) => WEEKDAYS[i]);

/**
 * The five rows, in plain words. Was "TIER 1 . 8 parts": a rank word a new
 * player cannot place. The star count now lives inside every card title, so
 * the row says the same thing the titles under it say.
 */
const ROW_TITLE: Record<RowKey, string> = {
  t1: SHELF_WORDS.rowModel1,
  t2: SHELF_WORDS.rowModel2,
  t3: SHELF_WORDS.rowModel3,
  t4: SHELF_WORDS.rowModel4,
  rack: SHELF_WORDS.rowRack,
};

/** "14 hours" or "45 minutes" from ms left, in whole numbers and in words.
 * It used to print "14:22", which reads as twenty two minutes past two.
 * (garage-state.ts has the same helper and the same words; this screen
 * cannot import it without its React store.) */
function formatLeft(ms: number): string {
  const mins = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(mins / 60);
  if (h > 0) return `${h} ${h === 1 ? "hour" : "hours"}`;
  return `${mins} ${mins === 1 ? "minute" : "minutes"}`;
}

type BuyState =
  | { kind: "buy" }
  | { kind: "bought" }
  | { kind: "coins"; need: number }
  | { kind: "level"; need: number; have: number };

function buyState(st: GarageState, day: string, l: Listing): BuyState {
  if (boughtToday(st, day, l.id)) return { kind: "bought" };
  if (st.level < l.needsLevel) return { kind: "level", need: l.needsLevel, have: st.level };
  if (l.price > st.coins) return { kind: "coins", need: l.price - st.coins };
  return { kind: "buy" };
}

/**
 * "Can I use it yet", in one plain sentence, or null when the answer is yes.
 * Was a bare "Needs bot level 10" with no way to tell how far off you are.
 */
function blockLine(state: BuyState): string | null {
  if (state.kind === "level") return fillWords(SCREEN_WORDS.needLevel, { n: state.need, have: state.have });
  if (state.kind === "coins") return fillWords(SCREEN_WORDS.needCoins, { n: state.need });
  if (state.kind === "bought") return SCREEN_WORDS.boughtToday;
  return null;
}

/* ── drawn fallbacks: the screen keeps working with the art folder gone ──── */

/**
 * A part thumb, IN THE COLOUR YOU WOULD BUY.
 *
 * The junkyard's whole economy is "buy the right colour on the right day"
 * (ADR-0141), so a shelf that draws every listing in the colour the art was
 * painted in is a shelf that lies. This composites the part the same way the
 * rig does: the grey base, then the white paint mask tinted with the
 * LISTING's colour at multiply. Two files that already ship, no new art.
 *
 * Three ways it can degrade, all of them still readable:
 *   the base is missing  -> the drawn clay plate in the listing's colour;
 *   the mask is missing  -> the untinted base plus the colour dot;
 *   no mask-image support -> the same, through @supports in shop.module.css.
 */
function Thumb({ listing, size }: { listing: Listing; size: number }) {
  const [ok, setOk] = useState(true);
  const [maskOk, setMaskOk] = useState(true);
  const art = partArt(listing.card);
  const ring = TIER_COLOR[listing.tier];
  const inner = Math.round(size * 0.86);
  const tint = listing.color ? PAINTS[listing.color] : null;
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 5),
        border: `3px solid ${ring}`,
        /*
         * A LIGHT BOX, ALWAYS. Mike, 2026-09-06: "a black part on a dark card
         * is unreadable". Six of today's sixteen parts ship in the ink paint,
         * and the plate under them used to end on the concrete grey, which put
         * a near-black part on a mid grey ground at 44 pixels. The plate is
         * near white at the top now and never goes below the paper cream, so
         * every paint in the game has something to be seen against.
         */
        background: `linear-gradient(180deg, #fffdf7 0%, ${K.paper} 68%, #e6dac0 100%)`,
        boxShadow: "inset 0 -6px 10px rgba(120,96,66,0.10)",
        display: "grid",
        placeItems: "center",
        flex: "0 0 auto",
        overflow: "hidden",
        // keep the multiply inside this box: it must meet the part, never the
        // card behind it
        isolation: "isolate",
      }}
    >
      {ok ? (
        <span style={{ position: "relative", width: inner, height: inner, display: "block" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={art.base}
            alt=""
            onError={() => setOk(false)}
            style={{
              width: inner,
              height: inner,
              objectFit: "contain",
              display: "block",
              /*
               * A LINE OF DARK, THEN A RIM OF LIGHT, THEN A SHADOW.
               *
               * Every part is drawn on a near white plate, and the paints run
               * from ink to cream, so ONE rim colour cannot outline all of
               * them: a white rim made the ink parts read and made the cream
               * ones vanish. The dark line goes on first and hugs the part, so
               * it is the pale end's edge; the white rim is cast off the dark
               * line and lands outside it, so it is the ink end's edge. A part
               * of any paint now ends on something the plate is not, and the
               * last shadow sits it down instead of floating it.
               *
               * The order is the whole trick. Light first put the dark line
               * two soft pixels out, where it was too weak to outline a cream
               * hand at 58 pixels.
               */
              filter:
                "drop-shadow(0 0 0.8px rgba(58,46,30,0.98)) drop-shadow(0 0 0.8px rgba(58,46,30,0.8)) drop-shadow(0 0 1.6px rgba(255,255,255,0.92)) drop-shadow(0 3px 3px rgba(96,80,58,0.24))",
            }}
          />
          {tint && maskOk ? (
            <>
              <span
                aria-hidden
                className={css.paint}
                style={{
                  background: tint,
                  WebkitMaskImage: `url(${art.mask})`,
                  maskImage: `url(${art.mask})`,
                }}
              />
              {/* the only way to hear that the mask 404ed: a mask-image that
                  fails to load leaves the element UNMASKED, which would put a
                  solid colour square over the part */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={art.mask} alt="" aria-hidden onError={() => setMaskOk(false)} style={{ display: "none" }} />
            </>
          ) : null}
        </span>
      ) : (
        <span
          aria-hidden
          style={{
            width: inner,
            height: inner,
            borderRadius: Math.round(size / 7),
            background: tint ?? K.clay,
            // the same drawn edge the photographed part gets, for the same
            // reason: a cream plate on a cream plate is not a plate
            border: "1px solid rgba(84,68,46,0.55)",
            boxShadow: `inset 0 -${Math.max(2, Math.round(size / 18))}px 0 rgba(0,0,0,0.16)`,
          }}
        />
      )}
    </span>
  );
}

/**
 * A drawn prop, hidden on a phone, where the 390 band is 168 tall and the
 * sixteen parts need the whole width (screens doc 3.3, mobile).
 *
 * It used to be an `<img>` onto public/bots-art/props. The two files it
 * pointed at were a mint and coral bookcase with a flower on its crown and a
 * pastel picnic crate, which made the yard read as a toy shop; they are drawn
 * now (YardScene.tsx), so there is no file to load and nothing to 404.
 */
function Prop({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span className={css.desktopOnly} style={style}>
      {children}
    </span>
  );
}

/**
 * EVERY COLOUR DOT WEARS A PALE RING. The cards and the two strips are dark
 * surfaces, and two of the eight paints are dark: the ink dot on a listing
 * that reads "black" was a dark circle on a dark card, which is the one dot
 * on the page a player most needs to see. The ring is a hairline, so a mint
 * or a butter dot looks the same as before.
 */
const DOT_RING = "0 0 0 1px rgba(255,253,247,0.42)";

/** The colour dot and its word, the pair that appears on every body listing.
 * Was "no color" in lower case, which read like a missing value rather than
 * a fact about weapons. */
function ColorChip({ color, size = 9 }: { color: PaintId | null; size?: number }) {
  if (!color) return <span style={{ color: M.muted }}>{SCREEN_WORDS.noColor}</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: R.pill,
          background: PAINTS[color],
          boxShadow: DOT_RING,
          display: "inline-block",
          flex: "0 0 auto",
        }}
      />
      {t.paintName[color]}
    </span>
  );
}

/* ── one stat row: the word, what it does, the number ────────────────────── */

/**
 * Was a three across grid of "SPD 6", which asks a new player to already
 * know what SPD is and what 6 buys. Now: the spelled out word, a three word
 * tail saying what it does, and the number. The card's leading stat is
 * marked, and the mark is computed from the card's own three numbers, so it
 * can never point at a strength the card does not have.
 */
function StatRow({ statKey, value, best }: { statKey: StatKey; value: number; best: boolean }) {
  const Icon = STAT_ICON[statKey];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, minHeight: 19 }}>
      <span style={{ color: best ? M.accent : M.muted, display: "grid", flex: "0 0 auto" }}>
        <Icon size={14} />
      </span>
      {/* spelled out, always. The nine short forms Mike called jargon (SPD
          STR DGE DMG BLK HP LCK ACC ASP) have nowhere to come back from if
          the long word is the only word the game ever prints. The sentence
          saying what the stat DOES rides on the card's leading stat above,
          and on all three stats in the part sheet, which has the room. */}
      <span
        style={{
          fontSize: 11.5,
          fontWeight: best ? 700 : 400,
          color: best ? M.text : M.lore,
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={STAT_MEANING[STAT_NAME_OF[statKey]]}
      >
        {t.ui.stat[statKey]}
      </span>
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 14,
          fontVariantNumeric: "tabular-nums",
          color: best ? M.text : M.lore,
          fontWeight: best ? 700 : 400,
          flex: "0 0 auto",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ── one listing card ────────────────────────────────────────────────────── */

function ShopCard({
  listing,
  state,
  onBuy,
  note,
}: {
  listing: Listing;
  state: BuyState;
  onBuy: () => void;
  /** the Tier 4 spotlight's calendar line; nothing on the other rows */
  note?: string;
}) {
  const c = listing.card;
  const color = TIER_COLOR[listing.tier];
  const keys = SLOT_STATS[c.slot];
  const price = listing.price.toLocaleString("en-US");
  // brand, model number, part: the title is the catalog's, the part word and
  // the brand come from the naming module, and nothing is restated here
  const brand = brandOf(c);
  const word = socketWordOf(c);
  // what this card is best at, read off its OWN three numbers, so the line
  // can never point at a strength the card does not have
  const lead = leadStat(c.slot, [c.s[0], c.s[1], c.s[2]]);
  const leadIndex = keys.findIndex((k) => STAT_NAME_OF[k] === lead.name);
  const blocked = blockLine(state);
  return (
    <div
      id={`listing-${listing.id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "14px 14px 14px 12px",
        borderRadius: R.card,
        border: `1px solid ${state.kind === "bought" ? M.border : color}22`,
        borderLeft: `3px solid ${color}`,
        outline: `1px solid ${M.border}`,
        background: M.surface,
        color: M.text,
        fontFamily: FONT_BODY,
        scrollMarginTop: 84,
        // fill the grid cell, so every card in a row ends on the same line and
        // the price rows (marginTop auto, below) line up across the row
        height: "100%",
        // a bought card sits back, but its art stays bright: it is yours now
        opacity: state.kind === "bought" ? 0.7 : 1,
      }}
    >
      {/* 1. WHAT PART IS THIS. The socket word sits above the name, in the
             tier colour, because it is the first thing a player needs and
             the old card never said it at all. */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* 72 was too small to tell a head from a body at a glance, and far
            too small for an ink part, which arrives as a silhouette */}
        <Thumb listing={listing} size={94} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: color,
              fontWeight: 700,
            }}
          >
            {word}
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
            {c.name}
          </div>
          {/* the colour is a swatch and a word beside the name, never inside it */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: M.lore, marginTop: 4, flexWrap: "wrap" }}>
            <ColorChip color={listing.color} />
            <span style={{ color: M.muted }}>{fillWords(SCREEN_WORDS.points, { n: partTotal(c) })}</span>
            {listing.dayColor ? (
              <span
                style={{
                  fontSize: 11,
                  color: M.accent,
                  border: `1px solid ${M.border}`,
                  borderRadius: R.pill,
                  padding: "1px 8px",
                }}
              >
                {SHELF_WORDS.todayColor}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* 2. WHAT IS IT GOOD AT. The leading stat spelled out with its number
             and what it does, then all three stats with a plain tail each. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {/* the ONE line that answers "what is it good at": the stat this card
            leads on, spelled out with its number, and the sentence saying
            what that buys in a fight */}
        <p style={{ margin: "0 0 3px", fontSize: 12.5, color: M.text, lineHeight: 1.4 }}>
          <span style={{ color: M.accent, fontWeight: 700 }}>{SCREEN_WORDS.bestAt} </span>
          <span style={{ fontWeight: 700 }}>{statChip(lead.name, lead.value)}.</span>{" "}
          <span style={{ color: M.lore }}>{STAT_MEANING[lead.name]}</span>
        </p>
        {keys.map((k, i) => (
          <StatRow key={k} statKey={k as StatKey} value={c.s[i]} best={i === leadIndex} />
        ))}
      </div>

      {/* 3. WHAT THE BRAND STANDS FOR, so using the shop is how the brands
             get learned. Starter scrap says it has no brand rather than
             leaving a player to wonder why it never joins a set. */}
      {/* THE BRAND, in one chip. The full sentence is on the brand filter
          above and in the part sheet: printed in full on all sixteen cards
          it said the word "Spark" three times a card and forty times a page,
          which is its own kind of noise. */}
      {brand ? (
        <span
          title={BRAND_INDEX[brand].character}
          style={{
            alignSelf: "flex-start",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: FONT_MONO,
            fontSize: 10.5,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: M.lore,
            border: `1px solid ${M.border}`,
            borderRadius: R.pill,
            padding: "3px 9px",
          }}
        >
          <span style={{ fontWeight: 700, color: M.text }}>{BRAND_INDEX[brand].name}</span>
          <span aria-hidden style={{ color: M.border }}>|</span>
          {BRAND_INDEX[brand].short}
        </span>
      ) : (
        <p style={{ margin: 0, fontSize: 11.5, color: M.muted, lineHeight: 1.4 }}>{SCRAP_NOTE}</p>
      )}
      {note ? <p style={{ margin: 0, fontSize: 12, color: M.warn, lineHeight: 1.45 }}>{note}</p> : null}

      {/* 4. WHAT IT COSTS, then whether you can use it yet. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 14, fontVariantNumeric: "tabular-nums", flex: 1 }}>{fill(t.shopUi.coins, { n: price })}</span>
        {state.kind === "buy" ? (
          <Button variant="primary" onClick={onBuy}>
            {t.shop.buy}
          </Button>
        ) : state.kind === "bought" ? (
          <Button disabled>{t.shopUi.bought}</Button>
        ) : (
          <Button disabled>{t.shop.buy}</Button>
        )}
      </div>
      {blocked ? (
        <div style={{ fontSize: 11.5, color: state.kind === "level" ? M.warn : M.muted, lineHeight: 1.4 }}>{blocked}</div>
      ) : null}
    </div>
  );
}

/* ── the screen ──────────────────────────────────────────────────────────── */

export default function ShopClient() {
  const params = useSearchParams();
  const slotParam = params.get("slot");
  const [slot, setSlot] = useState<CardSlot | null>(
    slotParam && (CARD_SLOTS as readonly string[]).includes(slotParam) ? (slotParam as CardSlot) : null,
  );
  const [colorFilter, setColorFilter] = useState<PaintId | null>(null);
  const [brandFilter, setBrandFilter] = useState<BrandId | null>(null);

  // the one clock read: at mount, then the date and the countdown are values
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
  const shipment: Shipment | null = useMemo(() => (day ? shipmentFor(day) : null), [day]);

  // the countdown: seeded once from the mount clock, then it ticks itself
  const [leftMs, setLeftMs] = useState<number | null>(null);
  useEffect(() => {
    if (!now) return;
    setLeftMs(msToNextShipment(now));
    const id = window.setInterval(() => setLeftMs((ms) => (ms == null ? ms : Math.max(0, ms - 60000))), 60000);
    return () => window.clearInterval(id);
  }, [now]);

  const buy = useCallback(
    (l: Listing) => {
      if (!cal) return;
      const provenance = `${fill(t.part.foundShipment, { day: weekday })} ${cal.day} ${MONTHS_SHORT[cal.month - 1]}`;
      const r = buyListing(l, day, provenance);
      if (r.ok) say(fill(t.shopUi.added, { name: l.card.name }));
      else if (r.reason === "bought") say(t.shopUi.bought);
      else if (r.reason === "level") say(fill(t.shopUi.needsLevel, { n: r.need }));
      else say(fill(t.shop.notEnough, { n: r.need }));
    },
    [cal, day, weekday, say],
  );

  // ── the screenshot harness hook (dev only; bots-shot.mjs waits on it) ───
  useEffect(() => {
    if (!shipment) return;
    const w = window as unknown as Record<string, unknown>;
    w.__bots = {
      ready: true,
      buy: (id: string) => {
        const l = shipment.listings.find((x) => x.id === id);
        if (l) buy(l);
      },
      state: () => ({
        coins: st.coins,
        level: st.level,
        day,
        listings: shipment.listings.map((l) => l.id),
        colors: shipment.colors,
        t4: shipment.t4,
        bought: st.bought[day] ?? [],
      }),
    };
    return () => {
      delete w.__bots;
    };
  }, [shipment, st, day, buy]);

  const shown = useCallback(
    (row: RowKey): Listing[] => {
      if (!shipment) return [];
      return shipment.rows[row].filter(
        (l) =>
          (!slot || l.slot === slot) &&
          (!colorFilter || l.color === colorFilter) &&
          (!brandFilter || brandOf(l.card) === brandFilter),
      );
    },
    [shipment, slot, colorFilter, brandFilter],
  );

  /** "Tomorrow brings model 4 legs." */
  const t4Line = useMemo(() => {
    if (!shipment) return "";
    // Always what TOMORROW brings, weapon day included. The weapon day's own
    // line (the model 4 weapon note) is the first line of the card's
    // note; returning it here as well printed it twice in a row.
    const next = t4Calendar(shipment.t4.week + (shipment.t4.weekday === 6 ? 1 : 0), shipment.t4.weekday === 6 ? 0 : shipment.t4.weekday + 1);
    return fillWords(SCREEN_WORDS.t4Tomorrow, { slot: t.ui.card[next.slot].toLowerCase() });
  }, [shipment]);

  /** "Shows again on Saturday." for today's model 4 slot and colour. */
  const t4Again = useMemo(() => {
    if (!shipment || shipment.t4.slot === "weapon") return "";
    for (let n = 1; n <= 56; n++) {
      const week = Math.floor((shipment.dayIndex + n) / 7) + 1;
      const wd = ((shipment.dayIndex + n) % 7 + 7) % 7;
      const c = t4Calendar(week, wd);
      if (c.slot !== shipment.t4.slot || c.color !== shipment.t4.color) continue;
      const key = addDays(shipment.dayKey, n);
      const name = WEEKDAYS[weekdayOf(key)];
      if (n <= 7) return fill(t.shopUi.t4Again, { day: name });
      const parts = key.split("-").map(Number);
      return fill(t.shopUi.t4Again, { day: `${name} ${parts[2]} ${MONTHS_SHORT[parts[1] - 1]}` });
    }
    return "";
  }, [shipment]);

  const scrollTo = (id: string) => {
    document.getElementById(`listing-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const bandThumb = (l: Listing, size: number) => {
    const shelfName = l.card.name;
    const shelfLabel = l.color ? `${shelfName}, ${t.paintName[l.color]}` : shelfName;
    return (
    <button
      key={l.id}
      className={uiCss.press}
      onClick={() => scrollTo(l.id)}
      title={shelfLabel}
      aria-label={shelfLabel}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, border: "none", background: "transparent", padding: 0, cursor: "pointer" }}
    >
      {/* the plate casts a shadow on the dirt, so the parts stand in the yard */}
      <span style={{ display: "block", filter: "drop-shadow(0 4px 4px rgba(96,80,58,0.32))" }}>
        <Thumb listing={l} size={size} />
      </span>
      {/*
       * THE COLOUR DOT, on a white ring. It used to be a bare 10px circle,
       * which put the ink dot on dirt at almost no contrast and lost the day's
       * colour exactly on the parts a player most needs to tell apart. The
       * ring reads on any ground the band can draw.
       */}
      <span
        aria-hidden
        style={{
          width: 13,
          height: 13,
          borderRadius: R.pill,
          background: l.color ? PAINTS[l.color] : K.paper,
          border: `2px solid ${l.color ? "#fffdf7" : K.floor}`,
          // a dark outer ring, not a faint one: the cream dot inside a white
          // border, standing on pale dirt, had nothing to end on
          boxShadow: "0 0 0 1.5px rgba(74,60,40,0.72)",
        }}
      />
    </button>
    );
  };

  return (
    <PageShell wide>
      {/* ── header ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", margin: "8px 0 12px" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "0.32em", textTransform: "uppercase", color: M.muted, margin: "0 0 6px" }}>
            {t.shopUi.yard}
          </p>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 28, margin: 0, color: M.text }}>{t.shopUi.title}</h1>
          {/* THE ONE LINE. What the picture above means, before anything else
              on the page asks for attention. */}
          <p style={{ margin: "7px 0 0", fontSize: 15, color: M.text, lineHeight: 1.45, maxWidth: 640 }}>{t.shopUi.yardLine}</p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: M.lore }}>{shipment ? shipment.name : ""}</p>
          {/* the two lines that teach the whole naming convention. A player who
              reads them once can read every card on the page, so they stay,
              but quietly and behind a rule: on a phone they used to be three
              stacked paragraphs and the first thing on the screen. */}
          <div
            style={{
              margin: "10px 0 0",
              paddingLeft: 10,
              borderLeft: `2px solid ${M.border}`,
              maxWidth: 640,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <p style={{ margin: 0, fontSize: 12, color: M.muted, lineHeight: 1.4 }}>{t.teach.stars}</p>
            <p style={{ margin: 0, fontSize: 12, color: M.muted, lineHeight: 1.4 }}>{SHELF_WORDS.howToRead}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted }}>{fill(t.shopUi.yourLevel, { n: st.level })}</span>
          <CoinChip coins={st.coins} ariaLabel={t.nav.coinsAria} />
          <span
            className={css.tap}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "0 14px",
              borderRadius: R.pill,
              border: `1px solid ${M.border}`,
              background: M.surface,
              fontFamily: FONT_MONO,
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
              color: leftMs === 0 ? M.accent : M.muted,
            }}
          >
            {leftMs == null ? "" : leftMs === 0 ? t.shopUi.landed : fill(t.shopUi.nextIn, { time: formatLeft(leftMs) })}
          </span>
        </div>
      </div>

      {/* ── the yard: the truck that brought today's parts, and the parts ── */}
      <div
        className={css.band}
        style={{
          borderRadius: R.frame,
          border: `1px solid ${M.border}`,
          boxShadow: `inset 0 1px 0 ${M.highlight}`,
        }}
      >
        {/* the set: dusty air, a fence of corrugated tin, dirt (shop.module.css) */}
        <span aria-hidden className={css.sky} />
        <span aria-hidden className={css.fence} />
        <span aria-hidden className={css.dirt} />

        <Prop style={{ marginBottom: 2 }}>
          <TruckProp height={200} />
        </Prop>

        <div className={css.planks}>
          {/* top rack: the eight 1 star parts */}
          <div className={css.rack}>
            <div className={css.plankRow}>{shipment ? shipment.rows.t1.map((l) => bandThumb(l, 58)) : null}</div>
            <div className={`${css.plankBar} ${css.girder}`} />
          </div>
          {/* bottom rack: 2 star, then 3 star, then the day's big part and the weapon */}
          <div className={css.rack}>
            <div className={css.plankRow}>
              {shipment ? [...shipment.rows.t2, ...shipment.rows.t3].map((l) => bandThumb(l, 58)) : null}
              {shipment ? (
                <span style={{ position: "relative", display: "inline-flex", flexDirection: "column", alignItems: "center", marginLeft: 10 }}>
                  {/* the spotlight: a warm cone drawn behind the day's big part */}
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: -30,
                      width: 92,
                      height: 92,
                      background: "radial-gradient(circle at 50% 20%, rgba(255,209,102,0.6), rgba(255,209,102,0) 70%)",
                      pointerEvents: "none",
                    }}
                  />
                  {bandThumb(shipment.rows.t4[0], 68)}
                </span>
              ) : null}
              {shipment ? <span style={{ marginLeft: 10 }}>{bandThumb(shipment.rows.rack[0], 58)}</span> : null}
            </div>
            <div className={`${css.plankBar} ${css.girder}`} />
          </div>
        </div>

        <Prop style={{ marginBottom: 2 }}>
          <HeapProp height={168} />
        </Prop>
      </div>

      {/* ── the colour strip ─────────────────────────────────────────────── */}
      <div className={css.strip} style={{ margin: "12px 0 0", fontSize: 12.5, color: M.lore }}>
        {shipment
          ? ([1, 2, 3] as const).map((tier) => {
              const c = shipment.colors[`t${tier}` as "t1" | "t2" | "t3"];
              return (
                <span
                  key={tier}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: R.pill, border: `1px solid ${M.border}`, background: M.surface, whiteSpace: "nowrap" }}
                >
                  <span aria-hidden style={{ width: 9, height: 9, borderRadius: R.pill, background: PAINTS[c], boxShadow: DOT_RING }} />
                  {fillWords(SCREEN_WORDS.colorOf, { stars: starWord(tier), color: t.paintName[c] })}
                </span>
              );
            })
          : null}
        <span style={{ color: M.muted, whiteSpace: "nowrap" }}>{t.shopUi.comesBack}</span>
        <span style={{ color: M.muted, whiteSpace: "nowrap" }}>{t.shopUi.keepsColor}</span>
      </div>

      {/* ── the Tier 4 calendar strip: the reason to come back ────────────── */}
      <div className={css.strip} style={{ margin: "8px 0 0" }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: M.muted, whiteSpace: "nowrap" }}>
          {SCREEN_WORDS.t4Calendar}
        </span>
        {shipment ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: M.text, whiteSpace: "nowrap" }}>
            {/* THE WEEK's colour, read off Monday, not today's. Friday is the
                weapon day and its listing carries no colour, so reading the
                colour off today printed "This week: no color" on a week that
                has a perfectly good colour and six coloured days in it. */}
            {(() => {
              const weekColor = t4Calendar(shipment.t4.week, 0).color;
              return (
                <>
                  {weekColor ? <span aria-hidden style={{ width: 9, height: 9, borderRadius: R.pill, background: PAINTS[weekColor], boxShadow: DOT_RING }} /> : null}
                  {fillWords(SCREEN_WORDS.t4Week, { color: weekColor ? t.paintName[weekColor] : SCREEN_WORDS.noColor.toLowerCase() })}
                </>
              );
            })()}
          </span>
        ) : null}
        {shipment
          ? CAL_DAYS.map((name, wd) => {
              const c = t4Calendar(shipment.t4.week, wd);
              const isToday = wd === shipment.t4.weekday;
              const past = wd < shipment.t4.weekday;
              return (
                <span
                  key={name}
                  title={isToday ? t.shopUi.today : name}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "6px 10px",
                    borderRadius: R.pill,
                    border: `1px solid ${isToday ? M.accent : M.border}`,
                    background: isToday ? M.surface2 : "transparent",
                    color: past ? M.muted : M.text,
                    fontFamily: FONT_MONO,
                    fontSize: 11.5,
                    whiteSpace: "nowrap",
                  }}
                >
                  {name.slice(0, 3)} {t.ui.card[c.slot].toLowerCase()}
                </span>
              );
            })
          : null}
      </div>

      {/* ── filters: the part first, then the brand, then the colour ─────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", margin: "14px 0 16px" }}>
        <span className={css.strip} style={{ gap: 4 }}>
          <ChipTab active={slot == null} onClick={() => setSlot(null)}>
            {t.ui.all}
          </ChipTab>
          {CARD_SLOTS.map((s) => (
            <ChipTab key={s} active={slot === s} onClick={() => setSlot(s)}>
              {t.ui.card[s]}
            </ChipTab>
          ))}
        </span>
        {/* the brand filter is new: a player who wants a set needs to see one
            brand at a time, and using it is how the four brands get learned */}
        <span className={css.strip} style={{ gap: 4 }}>
          <ChipTab active={brandFilter == null} onClick={() => setBrandFilter(null)}>
            {SCREEN_WORDS.allBrands}
          </ChipTab>
          {ALL_BRANDS.map((b) => (
            <ChipTab
              key={b}
              active={brandFilter === b}
              onClick={() => setBrandFilter(brandFilter === b ? null : b)}
              title={`${BRAND_INDEX[b].name}. ${BRAND_INDEX[b].character}`}
            >
              {BRAND_INDEX[b].name}
            </ChipTab>
          ))}
        </span>
        <span className={css.strip} style={{ gap: 4, marginLeft: "auto" }} role="group" aria-label={t.shopUi.colorFilter}>
          <span style={{ fontSize: 12.5, color: M.muted, whiteSpace: "nowrap" }}>{t.shopUi.colorFilter}</span>
          <ChipTab active={colorFilter == null} onClick={() => setColorFilter(null)}>
            {t.shopUi.allColors}
          </ChipTab>
          {PALETTE.map((c) => (
            <button
              key={c}
              className={`${uiCss.press} ${css.tap}`}
              onClick={() => setColorFilter(colorFilter === c ? null : c)}
              title={t.paintName[c]}
              aria-label={t.paintName[c]}
              aria-pressed={colorFilter === c}
              style={{
                display: "grid",
                placeItems: "center",
                borderRadius: R.inner,
                border: `1px solid ${colorFilter === c ? M.accent : M.border}`,
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <span aria-hidden style={{ width: 20, height: 20, borderRadius: 7, background: PAINTS[c], outline: `1px solid ${M.border}` }} />
            </button>
          ))}
        </span>
      </div>

      {/* ── the five rows ────────────────────────────────────────────────── */}
      {shipment ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {(["t4", "t3", "t2", "t1", "rack"] as RowKey[]).map((row) => {
            const list = shown(row);
            return (
              <section key={row}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, margin: "0 0 10px" }}>
                  <span style={{ fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 700, letterSpacing: "0.32em", textTransform: "uppercase", color: M.muted }}>
                    {ROW_TITLE[row]}
                  </span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted, fontVariantNumeric: "tabular-nums" }}>
                    {fillWords(shipment.rows[row].length === 1 ? SCREEN_WORDS.rowCountOne : SCREEN_WORDS.rowCount, { shown: list.length, count: shipment.rows[row].length })}
                  </span>
                </div>
                {list.length ? (
                  <div className={row === "t4" ? `${css.cards} ${css.heroRow}` : css.cards}>
                    {list.map((l) => (
                      <div key={l.id} className={row === "t4" ? css.wide : undefined}>
                        <ShopCard
                          listing={l}
                          state={buyState(st, day, l)}
                          onBuy={() => buy(l)}
                          note={
                            row === "t4"
                              ? [
                                  l.color
                                    ? fillWords(SCREEN_WORDS.t4Today, {
                                        name: l.card.name,
                                        color: t.paintName[l.color],
                                      })
                                    : SCREEN_WORDS.t4Weapon,
                                  t4Line,
                                  t4Again,
                                ]
                                  .filter(Boolean)
                                  .join(" ")
                              : undefined
                          }
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <Panel>
                    {/* an empty row now says WHY it is empty and offers the
                        way out, instead of "Nothing in this row today." */}
                    <p style={{ margin: 0, fontSize: 13, color: M.muted }}>
                      {colorFilter && !slot && !brandFilter
                        ? fill(t.shopUi.filterCure, { colour: t.paintName[colorFilter] })
                        : slot || brandFilter
                          ? SCREEN_WORDS.emptyFiltered
                          : SCREEN_WORDS.emptyToday}
                    </p>
                    {slot || colorFilter || brandFilter ? (
                      <div style={{ marginTop: 10 }}>
                        <Button
                          onClick={() => {
                            setSlot(null);
                            setColorFilter(null);
                            setBrandFilter(null);
                          }}
                        >
                          {SCREEN_WORDS.clearFilters}
                        </Button>
                      </div>
                    ) : null}
                  </Panel>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <Panel>
          <p style={{ margin: 0, fontSize: 13, color: M.muted }}>Loading today's parts.</p>
        </Panel>
      )}

      {/* ── the two quiet lines ──────────────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, margin: "20px 0 0", fontSize: 12.5, color: M.muted }}>
        <span>{t.shopUi.oncePerDay}</span>
        <span>{t.shopUi.samePlace}</span>
        <span>{t.shop.rotates}</span>
        <span>{t.shopUi.wantSet}</span>
      </div>

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
