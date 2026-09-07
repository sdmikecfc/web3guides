"use client";

import { useRef, useState, type CSSProperties } from "react";
import { PartDisplay } from "../_components/ToyDisplay";
import { PageShell } from "../_components/PageShell";
import { PAINTS, type PaintId } from "../_ui/tokens";
import { CARD_SLOTS, SLOT_STATS, type CardSlot } from "@/lib/bots/fixtures";
import { PALETTE, t4Calendar, type Listing, type Shipment } from "@/lib/bots/shipment";
import { boughtToday, type GarageState } from "@/lib/bots/garage-state";
import { STRINGS, fill } from "@/lib/bots/strings";
import { BODY_BRANDS, WEAPON_BRANDS, BRAND_INDEX, BRAND_OF_FAMILY, BRAND_OF_WEAPON, STAT_MEANING, leadStat, type BrandId } from "@/lib/bots/naming";
import { SCREEN_WORDS, STAT_NAME_OF, fillWords } from "@/lib/bots/naming-screens";
import css from "./cabinet.module.css";

const t = STRINGS.en;
const BRANDS = [...BODY_BRANDS, ...WEAPON_BRANDS];
const words = {
  eyebrow: "THE DAILY SHIPMENT", title: "Little parts. Big personality.",
  subtitle: "Find the next piece of your robot.", shelf: "On the shelves",
  inspect: "Pick a part to take a closer look.", special: "TODAY’S SPECIAL", selected: "ON THE COUNTER",
  buy: "Buy for", buying: "Adding to your parts…", owned: "In your collection",
  pair: "One arm or leg · fits either side", single: "One part · ready for your robot",
  calendar: "Coming to the special shelf", receipt: "New parts, every morning.",
  empty: "Nothing on this shelf matches yet.", clear: "Show all parts", close: "Back to the shelves",
  unavailable: "Couldn’t add this part. Please try again.", loading: "Unpacking today’s shipment…",
};
function brandOf(l: Listing): BrandId | null {
  return l.slot === "weapon" ? BRAND_OF_WEAPON[l.card.id] ?? null : l.card.family ? BRAND_OF_FAMILY[l.card.family] ?? null : null;
}
function timeLeft(ms: number) {
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} ${hours === 1 ? "hour" : "hours"}` : `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}
function Stars({ n }: { n: number }) {
  return <span className={css.stars} aria-label={`${n} ${n === 1 ? "star" : "stars"}`}><span aria-hidden>{"★".repeat(n)}<span className={css.dimStars}>{"☆".repeat(4 - n)}</span></span></span>;
}
function Coin() { return <span className={css.coin} aria-hidden>●</span>; }

/** Every shelf piece is the same physical geometry worn in the workbench. */
function PartArt({listing}:{listing:Listing}){
  return <span className={css.art} data-slot={listing.slot}><PartDisplay part={listing.card} paint={listing.color} ariaLabel={listing.card.name}/></span>;
}

type Props = {
  shipment: Shipment | null; st: GarageState; day: string; initialSlot: CardSlot | null;
  leftMs: number | null; tomorrow: string; returns: string; toast: string | null;
  onBuy: (listing: Listing) => Promise<void>;
  embedded?: boolean;
  browseOnly?: { label: string; message: string; onAction: () => void };
};

export default function CabinetShop({ shipment, st, day, initialSlot, leftMs, tomorrow, returns, toast, onBuy, embedded = false, browseOnly }: Props) {
  const [slot, setSlot] = useState<CardSlot | null>(initialSlot);
  const [color, setColor] = useState<PaintId | null>(null);
  const [brand, setBrand] = useState<BrandId | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const filtered = (shipment?.listings ?? []).filter(l => (!slot || l.slot === slot) && (!color || l.color === color) && (!brand || brandOf(l) === brand));
  const ordered = [...filtered].sort((a, b) => b.tier - a.tier);
  const selected = ordered.find(l => l.id === selectedId) ?? ordered[0] ?? null;
  const rows: Listing[][] = [];
  for (let i = 0; i < ordered.length; i += 4) rows.push(ordered.slice(i, i + 4));
  const reset = () => { setSlot(null); setColor(null); setBrand(null); };
  function choose(l: Listing) {
    setSelectedId(l.id); setError(null);
    if (window.matchMedia("(max-width: 900px)").matches) dialog.current?.showModal();
  }
  async function purchase(l: Listing) {
    if (pending) return;
    setPending(true); setError(null);
    try { await onBuy(l); } catch { setError(words.unavailable); } finally { setPending(false); }
  }
  function inspection(mobile = false) {
    if (!selected) return <div className={css.noSelection}>{words.inspect}</div>;
    const l = selected;
    const bought = boughtToday(st, day, l.id);
    const levelBlocked = st.level < l.needsLevel;
    const coinsBlocked = st.coins < l.price;
    const disabled = bought || levelBlocked || coinsBlocked || pending;
    const brandId = brandOf(l);
    const lead = leadStat(l.slot, [l.card.s[0], l.card.s[1], l.card.s[2]]);
    return <>
      <div className={css.counterHeading}><span>{l.tier === 4 ? words.special : words.selected}</span><Stars n={l.tier} /></div>
      <div className={css.counterStage}><PartArt key={l.id} listing={l} /><span className={css.counterStand} aria-hidden /></div>
      <div className={css.paper}>
        <div className={css.partMeta}>{t.ui.card[l.slot]}<span>{l.color ? <><i style={{ background: PAINTS[l.color] }} />{t.paintName[l.color]}</> : SCREEN_WORDS.noColor}</span></div>
        <h2>{l.card.name}</h2>
        <p className={css.pairNote}>{l.slot === "arms" || l.slot === "legs" ? words.pair : words.single}</p>
        {brandId ? <p className={css.character}>{BRAND_INDEX[brandId].character}</p> : null}
        <dl className={css.stats}>{SLOT_STATS[l.slot].map((key, index) => <div key={key}><dt>{t.ui.stat[key]}</dt><dd>{l.card.s[index]}</dd></div>)}</dl>
        <p className={css.statMeaning}><strong>{t.ui.stat[SLOT_STATS[l.slot][Math.max(0, SLOT_STATS[l.slot].findIndex(k => STAT_NAME_OF[k] === lead.name))]]}:</strong> {STAT_MEANING[lead.name]}</p>
        <button className={css.buy} disabled={!browseOnly && disabled} onClick={() => { if (browseOnly) { dialog.current?.close(); browseOnly.onAction(); } else void purchase(l); }}>
          {browseOnly ? browseOnly.label : pending ? words.buying : bought ? `✓ ${words.owned}` : <>{words.buy} <Coin /> {l.price.toLocaleString("en-US")} <span>coins</span></>}
        </button>
        <p className={css.restriction}>{browseOnly ? browseOnly.message : bought ? t.shopUi.bought : levelBlocked ? fillWords(SCREEN_WORDS.needLevel, { n: l.needsLevel, have: st.level }) : coinsBlocked ? fillWords(SCREEN_WORDS.needCoins, { n: l.price - st.coins }) : t.shopUi.oncePerDay}</p>
        {error ? <p role="alert">{error}</p> : null}
        {l.tier === 4 ? <p className={css.returnNote}>{tomorrow} {returns}</p> : null}
        {mobile ? <button className={css.backButton} onClick={() => dialog.current?.close()}>{words.close}</button> : null}
      </div>
    </>;
  }
  const contents = <>
    <div className={css.store}>
      <header className={css.header}>
        <div><p className={css.eyebrow}><span aria-hidden>✦</span> {words.eyebrow}</p><h1>{words.title}</h1><p className={css.subtitle}>{words.subtitle} <span>{shipment?.name}</span></p></div>
        <div className={css.purse}><span className={css.purseLabel}>YOUR COINS</span><strong><Coin /> {st.coins.toLocaleString("en-US")}</strong><small>{fill(t.shopUi.yourLevel, { n: st.level })}</small></div>
      </header>

      <div className={css.arrival}><span><i aria-hidden />{shipment ? `${shipment.listings.length} parts unpacked today` : words.loading}</span><span>{leftMs == null ? "…" : leftMs === 0 ? t.shopUi.landed : fill(t.shopUi.nextIn, { time: timeLeft(leftMs) })}{leftMs === 0 ? <button onClick={() => window.location.reload()}>Reload</button> : null}</span></div>

      <div className={css.shopLayout}>
        <section className={css.browse} aria-label={words.shelf}>
          <div className={css.toolbar}>
            <div className={css.tabs} role="group" aria-label="Part type"><button aria-pressed={slot == null} onClick={() => setSlot(null)}>All parts</button>{CARD_SLOTS.map(s => <button key={s} aria-pressed={slot === s} onClick={() => setSlot(s)}>{t.ui.card[s]}</button>)}</div>
            <div className={css.filters}>
              <label><span>Colour</span><select value={color ?? ""} onChange={e => setColor((e.target.value || null) as PaintId | null)}><option value="">All colours</option>{PALETTE.map(c => <option key={c} value={c}>{t.paintName[c]}</option>)}</select></label>
              <label><span>Family</span><select value={brand ?? ""} onChange={e => setBrand((e.target.value || null) as BrandId | null)}><option value="">All families</option>{BRANDS.map(b => <option key={b} value={b}>{BRAND_INDEX[b].name}</option>)}</select></label>
              <span className={css.resultCount} aria-live="polite">{ordered.length} / {shipment?.listings.length ?? 0} parts</span>
            </div>
          </div>
          <div className={css.cabinet}>
            <div className={css.cabinetCrown}><span className={css.screw} aria-hidden /><span>{t.shopUi.title}</span><span className={css.screw} aria-hidden /></div>
            {!shipment ? <div className={css.empty}>{words.loading}</div> : !ordered.length ? <div className={css.empty}><span aria-hidden>⌕</span><h2>{words.empty}</h2><button onClick={reset}>{words.clear}</button></div> : rows.map((row, i) => <div className={css.shelf} key={i}>
              {row.map(l => {
                const bought = boughtToday(st, day, l.id);
                return <button id={`listing-${l.id}`} key={l.id} className={`${css.item} ${selected?.id === l.id ? css.chosen : ""}`} aria-pressed={selected?.id === l.id} aria-label={`${l.card.name}, ${l.tier} stars, ${l.color ? t.paintName[l.color] + ", " : ""}${l.price} coins${bought ? ", bought" : ""}`} onClick={() => choose(l)} style={{ "--part-colour": l.color ? PAINTS[l.color] : "#d3b67f" } as CSSProperties}>
                  <span className={css.shelfStars}><Stars n={l.tier} /></span>
                  <span className={css.display}><PartArt key={l.id} listing={l} /><span className={css.plinth} aria-hidden /></span>
                  <span className={css.tag}><span className={css.tagName}>{l.card.name}</span><span className={css.tagBottom}>{bought ? <b>✓ Yours</b> : <b><Coin /> {l.price.toLocaleString("en-US")}</b>}<span>{l.color ? t.paintName[l.color] : t.ui.card[l.slot]}</span></span></span>
                </button>;
              })}
            </div>)}
            <div className={css.cabinetFoot}><span>{words.receipt}</span><span>✦</span></div>
          </div>
          <p className={css.shelfNote}>{t.shopUi.samePlace}</p>
        </section>
        <aside className={css.counter} aria-label="Selected part">{inspection()}</aside>
      </div>

      <section className={css.calendar} aria-label={words.calendar}><div><p className={css.eyebrow}>A LITTLE SOMETHING TO COME BACK FOR</p><h2>{words.calendar}</h2><p>{t.shopUi.comesBack}</p></div><div className={css.days}>{shipment ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name, wd) => { const c = t4Calendar(shipment.t4.week, wd); return <div className={wd === shipment.t4.weekday ? css.today : ""} key={name}><span>{wd === shipment.t4.weekday ? t.shopUi.today : name}</span><strong>{t.ui.card[c.slot]}</strong><i style={{ background: c.color ? PAINTS[c.color] : "#bc9b63" }} /><small>★★★★</small></div>; }) : null}</div></section>
      <p className={css.footerNote}>{t.shopUi.keepsColor}</p>
    </div>
    <dialog ref={dialog} aria-label="Inspect part" className={css.dialog} onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}><div>{inspection(true)}</div></dialog>
    {toast ? <div className={css.toast} role="status">✓ {toast}</div> : null}
  </>;
  return embedded ? <div className={css.embedded}>{contents}</div> : <PageShell wide backdrop={{ background: "radial-gradient(ellipse at 16% 0%, #514337 0%, #302921 45%, #211d19 100%)" }}>{contents}</PageShell>;
}
