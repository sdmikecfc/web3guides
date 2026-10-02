"use client";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CARD_SLOTS, MONTHS_SHORT, WEEKDAYS, dayKey, type CardSlot } from "@/lib/bots/fixtures";
import { addDays, msToNextShipment, shipmentFor, t4Calendar, weekdayOf, type Listing, type Shipment } from "@/lib/bots/shipment";
import { buyListing, useGarage, utcParts } from "@/lib/bots/garage-state";
import { buyOnServer, stateFromMe, useLiveGarage, withBoughtPart } from "@/lib/bots/live-garage";
import { readBotsSession } from "../battles/session";
import { STRINGS, fill } from "@/lib/bots/strings";
import { SCREEN_WORDS, fillWords } from "@/lib/bots/naming-screens";
import CabinetShop from "./CabinetShop";
const t = STRINGS.en;
export default function ShopClient() {
  const params = useSearchParams();
  const slotParam = params.get("slot");
  const [slot] = useState<CardSlot | null>(
    slotParam && (CARD_SLOTS as readonly string[]).includes(slotParam) ? (slotParam as CardSlot) : null,
  );

  // the one clock read: at mount, then the date and the countdown are values
  const mountNow = useRef(0);
  if (mountNow.current === 0 && typeof window !== "undefined") mountNow.current = Date.now();

  /**
   * WHOSE COINS ARE ON SCREEN. A signed in player reads their own row through
   * GET /api/bots/me; a visitor with no wallet reads the demo garage, exactly
   * as before, and can still look around the whole shelf. The two never mix:
   * one object goes down to every card below.
   */
  const demo = useGarage(mountNow.current);
  const live = useLiveGarage();
  const st = useMemo(() => (live.me ? stateFromMe(live.me) : demo), [live.me, demo]);
  const [now, setNow] = useState(0);
  useEffect(() => setNow(Date.now()), []);
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  const cal = useMemo(() => (now ? utcParts(now) : null), [now]);
  /**
   * WHICH DAY'S SHELF THIS IS. The server's own day when there is one, so the
   * sixteen cards on screen are the sixteen the buy route will recompute; the
   * browser's UTC day otherwise. Both run the same pure module, so they agree
   * except in the minute a shipment lands, and in that minute agreeing with
   * the server is what stops a tap being refused for a reason nobody can see.
   */
  const day = live.me?.day || (cal ? dayKey(cal.year, cal.month, cal.day) : "");
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

  /** one tap at a time: two taps on one card must not both pay */
  const buying = useRef(false);

  /**
   * BUY ONE LISTING.
   *
   * SIGNED IN, THE SERVER DECIDES. POST /api/bots/shop/buy recomputes today's
   * shelf, then checks the four things in the order that gives the truest
   * answer: already bought today, then the level, then the coins, and it
   * writes the purchase row BEFORE it charges, so two taps cannot both pay.
   * Nothing here re-checks any of that, because a second copy of a rule is a
   * second place for it to drift; the card's own lock line is drawn from the
   * numbers the server sent, and the refusal a player reads is the route's
   * own sentence.
   *
   * SIGNED OUT, NOTHING CHANGES. A visitor with no wallet keeps the demo
   * garage they have always had, so the shop can be walked around and tried
   * without connecting anything.
   */
  const buy = useCallback(
    async (l: Listing) => {
      if (!cal || buying.current) return;
      // WHO IS BUYING, decided at the moment of the tap. A token in this
      // browser, or a garage that came off a row: either one means this is a
      // real player and the purchase belongs on the server. A player whose
      // /me read failed still buys there, because falling back to the browser
      // would take their coins in a place nobody can see. And a session that
      // ran out between opening the page and pressing Buy is told so, rather
      // than quietly moved into the demo garage.
      if (readBotsSession() || live.me) {
        buying.current = true;
        try {
          const r = await buyOnServer(l.id);
          if (r.ok) {
            if (live.me) live.put(withBoughtPart(live.me, l.id, r.value.part, r.value.coins));
            else void live.refresh();
            say(fill(t.shopUi.added, { name: l.card.name }));
          } else {
            say(r.message ?? t.enlist.signedOut);
          }
        } finally {
          buying.current = false;
        }
        return;
      }
      const provenance = `${fill(t.part.foundShipment, { day: weekday })} ${cal.day} ${MONTHS_SHORT[cal.month - 1]}`;
      const r = buyListing(l, day, provenance);
      if (r.ok) say(fill(t.shopUi.added, { name: l.card.name }));
      else if (r.reason === "bought") say(t.shopUi.bought);
      else if (r.reason === "level") say(fill(t.shopUi.needsLevel, { n: r.need }));
      else say(fill(t.shop.notEnough, { n: r.need }));
    },
    [cal, day, weekday, say, live],
  );

  // ── the screenshot harness hook (dev only; bots-shot.mjs waits on it) ───
  useEffect(() => {
    if (!shipment) return;
    const w = window as unknown as Record<string, unknown>;
    w.__bots = {
      ready: true,
      buy: (id: string) => {
        const l = shipment.listings.find((x) => x.id === id);
        if (l) void buy(l);
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

  return <CabinetShop shipment={shipment} st={st} day={day} initialSlot={slot}
    leftMs={leftMs} tomorrow={t4Line} returns={t4Again} toast={toast} onBuy={buy} />;
}
