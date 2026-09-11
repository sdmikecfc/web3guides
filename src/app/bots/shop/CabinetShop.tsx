"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PartDisplay } from "../_components/ToyDisplay";
import { PageShell } from "../_components/PageShell";
import { PAINTS, type PaintId } from "../_ui/tokens";
import { CARD_SLOTS, SLOT_STATS, emptySockets, nameText, type CardSlot, type Socket } from "@/lib/bots/fixtures";
import { EQUIPMENT_LABEL } from "@/lib/bots/equipment";
import { compareShopPart, type ShopComparisonContext } from "@/lib/bots/shop-comparison";
import { PALETTE, t4Calendar, type Listing } from "@/lib/bots/shipment";
import { boughtToday, type GarageState } from "@/lib/bots/garage-state";
import { STRINGS, fill } from "@/lib/bots/strings";
import { BODY_BRANDS, WEAPON_BRANDS, BRAND_INDEX, BRAND_OF_FAMILY, BRAND_OF_WEAPON, STAT_MEANING, leadStat, type BrandId } from "@/lib/bots/naming";
import { SCREEN_WORDS, STAT_NAME_OF, fillWords } from "@/lib/bots/naming-screens";
import css from "./cabinet.module.css";
import LegacyCabinetShop from "./LegacyCabinetShop";
import { styleCardOf, styleSpecialInfo } from "@/lib/bots/style-catalog";
import { FIGHTING_STYLES, STYLE_GUIDE, stylePreviewHref, stylesPreviewEnabled, type FightingStyle } from "@/lib/bots/style-guide";
import { styleShipmentFor, type CabinetShipment } from "@/lib/bots/style-shipment";

const t = STRINGS.en;
const BRANDS = [...BODY_BRANDS, ...WEAPON_BRANDS];
const statLabels = { speed: "Speed", strength: "Strength", dodge: "Dodge", damage: "Damage", block: "Block", health: "Health", luck: "Luck", accuracy: "Accuracy", attackSpeed: "Attack speed" };
const words = {
  eyebrow: "THE PARTS SHOP", title: "Little parts. Big personality.",
  subtitle: "Find the next piece of your robot.", shelf: "On the shelves",
  inspect: "Pick a part to take a closer look.", special: "FEATURED PART", selected: "ON THE COUNTER",
  buy: "Buy for", buying: "Adding to your parts…", owned: "In your collection",
  pair: "One arm or leg · fits either side", single: "One part · ready for your robot",
  calendar: "Upcoming Tier 4 parts", receipt: "New parts, every morning.",
  empty: "Nothing on this shelf matches yet.", clear: "Show all parts", close: "Back to the shelves",
  unavailable: "Couldn’t add this part. Please try again.", loading: "Setting out today's parts…",
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
function Delta({ value }: { value: number }) { return <span className={value > 0 ? css.gain : value < 0 ? css.loss : css.same} aria-label={`Change ${value > 0 ? "+" : ""}${value}`}>{value > 0 ? "+" : ""}{value}</span>; }

/** Every shelf piece is the same physical geometry worn in the workbench. */
function PartArt({listing}:{listing:Listing}){
  return <span className={css.art} data-slot={listing.slot}><PartDisplay part={listing.card} paint={listing.color} variant="cutout" ariaLabel={listing.card.name}/></span>;
}

type Props = {
  shipment: CabinetShipment | null; st: GarageState; day: string; initialSlot: CardSlot | null;
  leftMs: number | null; tomorrow: string; returns: string; toast: string | null;
  onBuy: (listing: Listing) => Promise<void | { ok: boolean; message?: string }>;
  embedded?: boolean;
  comparison?: ShopComparisonContext;
  browseOnly?: { label: string; message: string; onAction: () => void };
};

export default function CabinetShop(props: Props) {
  return process.env.NEXT_PUBLIC_BOTS_ROOM_PREVIEW === "1" || stylesPreviewEnabled() || props.shipment?.v === 2 ? <CompactCabinetShop {...props} /> : <LegacyCabinetShop {...props} shipment={props.shipment?.v === 1 ? props.shipment : null} onBuy={async listing => { await props.onBuy(listing); }} />;
}

function CompactCabinetShop({ shipment, st, day, initialSlot, leftMs, tomorrow, returns, toast, onBuy, embedded = false, browseOnly, comparison }: Props) {
  const [slot, setSlot] = useState<CardSlot | null>(initialSlot);
  const [color, setColor] = useState<PaintId | null>(null);
  const [brand, setBrand] = useState<BrandId | null>(null);
  const [style, setStyle] = useState<FightingStyle | null>(null);
  const [sort, setSort] = useState("tier");
  const [selection, setSelection] = useState<{ id: string; day: string } | null>(null);
  const [comparisonBay, setComparisonBay] = useState<number | null>(null);
  const [side, setSide] = useState<"left" | "right">("left");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const calendarDialog = useRef<HTMLDialogElement>(null);
  const buying = useRef(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { dialog.current?.close(); calendarDialog.current?.close(); setSelection(null); setError(null); }, [day]);
  const styledShelf = shipment?.v === 2;
  const styleWeek = useMemo(() => shipment?.v === 2 ? Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${shipment.dayKey}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - shipment.t4.weekday + i);
    return styleShipmentFor(date.toISOString().slice(0, 10), shipment.dayIndex - shipment.t4.weekday + i).rows.t4[0];
  }) : [], [shipment]);
  const filtered = (shipment?.listings ?? []).filter(l => (!slot || l.slot === slot) && (!color || l.color === color) && (!brand || brandOf(l) === brand) && (!style || styleCardOf(l.partKey)?.style === style));
  const ordered = [...filtered].sort((a, b) => sort === "price-low" ? a.price - b.price : sort === "price-high" ? b.price - a.price : sort === "name" ? a.card.name.localeCompare(b.card.name) : b.tier - a.tier);
  // An open popup keeps its exact listing even when a filter or purchase updates.
  const selected = selection?.day === day ? shipment?.listings.find(l => l.id === selection.id) ?? null : null;
  const context = comparison ?? { builds: Object.values(st.builds), parts: st.parts, finishedBays: Object.values(st.builds).filter(b => !emptySockets(b).length).map(b => b.bay) };
  const compareBuild = context.builds.find(b => b.bay === comparisonBay) ?? context.builds.find(b => b.bay === context.selectedBay) ?? context.builds[0];
  const target: Socket | undefined = selected?.slot === "arms" ? side === "left" ? "armL" : "armR" : selected?.slot === "legs" ? side === "left" ? "legL" : "legR" : undefined;
  const compared = useMemo(() => selected && compareBuild ? compareShopPart(compareBuild, context.parts, selected, target) : null, [selected, compareBuild, context.parts, target]);
  const finished = !!compareBuild && (context.finishedBays ? context.finishedBays.includes(compareBuild.bay) : !emptySockets(compareBuild).length);
  const reset = () => { setSlot(null); setColor(null); setBrand(null); setStyle(null); };
  function choose(l: Listing) {
    setSelection({ id: l.id, day }); setError(null);
    dialog.current?.showModal();
    if (dialog.current) dialog.current.scrollTop = 0;
  }
  async function purchase(l: Listing) {
    if (buying.current || selection?.day !== day || leftMs === 0 || boughtToday(st, day, l.id) || st.level < l.needsLevel || st.coins < l.price) return;
    buying.current = true;
    setPending(true); setError(null);
    try {
      const answer = await onBuy(l);
      if (answer && !answer.ok && live.current) setError(answer.message || words.unavailable);
    } catch { if (live.current) setError(words.unavailable); } finally { buying.current = false; if (live.current) setPending(false); }
  }
  function inspection() {
    if (!selected) return <div className={css.noSelection}>{words.inspect}</div>;
    const l = selected;
    const bought = boughtToday(st, day, l.id);
    const levelBlocked = st.level < l.needsLevel;
    const coinsBlocked = st.coins < l.price;
    const disabled = bought || levelBlocked || coinsBlocked || pending || leftMs === 0;
    const brandId = brandOf(l);
    const lead = leadStat(l.slot, [l.card.s[0], l.card.s[1], l.card.s[2]]);
    const styledPart = styleCardOf(l.partKey), special = styleSpecialInfo(l.partKey);
    return <>
      <div className={css.counterHeading}><span>{l.tier === 4 ? words.special : "TAKE A CLOSER LOOK"}</span><Stars n={l.tier} /><button autoFocus className={css.closeButton} aria-label={words.close} onClick={() => dialog.current?.close()}>×</button></div>
      <div className={css.inspectionLayout}>
      <div className={css.counterStage}><PartArt key={l.id} listing={l} /><span className={css.counterStand} aria-hidden /></div>
      <div className={css.paper}>
        <div className={css.partMeta}>{t.ui.card[l.slot]}<span>{l.color ? <><i style={{ background: PAINTS[l.color] }} />{t.paintName[l.color]}</> : SCREEN_WORDS.noColor}</span></div>
        <h2 id="shop-part-title">{l.card.name}</h2>
        {styledPart && <section className={css.styleInfo} aria-label="Fighting style"><strong>{STYLE_GUIDE[styledPart.style].label}</strong><p>{STYLE_GUIDE[styledPart.style].strength} {STYLE_GUIDE[styledPart.style].weakness}</p>{styledPart.weaponKind === "rifle" ? <p>Fires real shots. Needs space to aim.</p> : styledPart.weaponKind === "paired_blades" ? <p>One blade in each hand. A surviving arm can keep fighting.</p> : <p>{l.card.lore}</p>}{special?.current && <p><b>Body special: {special.current.name}.</b> {special.current.description}</p>}{special?.upgraded && !special.unlocked && <p><b>Tier 3 unlock: {special.upgraded.name}.</b> {special.upgraded.description}</p>}<a href={`${stylePreviewHref(styledPart.style, styledPart.tier)}&part=${encodeURIComponent(l.partKey)}`}>See this part fight ↗</a><small>Use these parts in practice and against house robots. Player fights need a later update.</small></section>}
        {compareBuild ? <div className={css.compareControls}><label>Compare with<select value={compareBuild.bay} onChange={e => setComparisonBay(Number(e.target.value))}>{context.builds.map(b => <option key={b.bay} value={b.bay}>{nameText(b.name)}</option>)}</select></label>{target ? <div role="group" aria-label="Compare one limb"><button aria-pressed={side === "left"} onClick={() => setSide("left")}>{l.slot === "arms" ? "Left arm" : "Left leg"}</button><button aria-pressed={side === "right"} onClick={() => setSide("right")}>{l.slot === "arms" ? "Right arm" : "Right leg"}</button></div> : null}</div> : null}
        <dl className={css.stats} aria-label="Part stats">{SLOT_STATS[l.slot].map((key, index) => <div key={key}><dt>{styledPart ? statLabels[key] : t.ui.stat[key]}</dt><dd>{l.card.s[index]}{compared ? <Delta value={compared.partStats[index].delta} /> : null}</dd></div>)}</dl>
        {compared ? <p className={css.comparisonNote}>Compared with {compared.previous?.name ?? `your empty ${EQUIPMENT_LABEL[compared.socket].toLowerCase()} slot`}. + gain · − loss · 0 unchanged</p> : null}
        <button className={css.buy} disabled={pending || !browseOnly && disabled} onClick={() => { if (browseOnly) { dialog.current?.close(); browseOnly.onAction(); } else void purchase(l); }}>
          {browseOnly ? browseOnly.label : pending ? words.buying : bought ? `✓ ${words.owned}` : <>{words.buy} <Coin /> {l.price.toLocaleString("en-US")} <span>coins</span></>}
        </button>
        <p className={css.restriction}>{browseOnly ? browseOnly.message : leftMs === 0 ? "New parts have arrived. Refresh the shop before buying." : bought ? t.shopUi.bought : levelBlocked ? fillWords(SCREEN_WORDS.needLevel, { n: l.needsLevel, have: st.level }) : coinsBlocked ? fillWords(SCREEN_WORDS.needCoins, { n: l.price - st.coins }) : "Added to your spare parts. One of each item per day."}</p>
        {error ? <p role="alert">{error}</p> : null}
        {compared ? <section className={css.overall} aria-label="Overall stat comparison"><h3>{finished ? "Plan another robot" : "Your build with this part"}</h3><p>{finished ? "Finished robots keep their parts. Use this comparison to plan a new robot." : "A preview only. Buying adds this part to your spare parts."}</p>{compared.assemblyIssue ? <p role="status">{compared.assemblyIssue} Choose that body to see the final fight totals.</p> : <><table><thead><tr><th scope="col">Overall stats</th><th scope="col">Now</th><th scope="col">With part</th><th scope="col">Change</th></tr></thead><tbody>{compared.totals.map(stat => <tr key={stat.key}><th scope="row">{stat.label}</th><td>{stat.before}</td><td>{stat.after}</td><td><Delta value={stat.delta} /></td></tr>)}</tbody></table><p>{compared.styled ? "Uses the new style fight rules. Parts of any style can work together; colours give no extra stats." : "Uses fight stats, including matching sets and mixed limbs."}</p>{compared.styled && <dl className={css.capabilities}>{compared.capabilities.map(c => <div key={c.key}><dt>{c.label}</dt><dd>{c.changed ? <><span>{c.before}</span> → <b>{c.after}</b></> : c.after}</dd></div>)}</dl>}</>}</section> : null}
        <details className={css.partDetails}><summary>About this part</summary>
          <p className={css.pairNote}>{l.slot === "arms" || l.slot === "legs" ? words.pair : words.single}</p>
          {brandId ? <p className={css.character}>{BRAND_INDEX[brandId].character}</p> : null}
          <p className={css.statMeaning}><strong>{t.ui.stat[SLOT_STATS[l.slot][Math.max(0, SLOT_STATS[l.slot].findIndex(k => STAT_NAME_OF[k] === lead.name))]]}:</strong> {STAT_MEANING[lead.name]}</p>
          {l.tier === 4 ? <p className={css.returnNote}>{tomorrow} {returns}</p> : null}
        </details>
        <button className={css.backButton} onClick={() => dialog.current?.close()}>{words.close}</button>
      </div>
      </div>
    </>;
  }
  const contents = <>
    <div className={`${css.store} ${styledShelf ? css.styledStore : ""}`} data-room="parts-shop" data-shipment-version={shipment?.v}>
      <div className={css.roomArt} aria-hidden />
      <header className={css.header}>
        <div><p className={css.eyebrow}><span aria-hidden>✦</span> {words.eyebrow}</p><h1>{words.title}</h1><p className={css.subtitle}>{words.subtitle} <span>{shipment?.name}</span></p></div>
        <div className={css.purse}><span className={css.purseLabel}>YOUR COINS</span><strong><Coin /> {st.coins.toLocaleString("en-US")}</strong><small>{fill(t.shopUi.yourLevel, { n: st.level })}</small></div>
      </header>

      <div className={css.arrival}><span><i aria-hidden />{shipment ? `${shipment.listings.length} parts today` : words.loading}</span><span>{leftMs == null ? "…" : leftMs === 0 ? t.shopUi.landed : fill(t.shopUi.nextIn, { time: timeLeft(leftMs) })}{leftMs === 0 ? <button onClick={() => window.location.reload()}>Refresh</button> : null}</span><button className={css.calendarButton} onClick={() => calendarDialog.current?.showModal()}>Delivery calendar</button></div>

      <div className={css.shopLayout}>
        <section className={css.browse} aria-label={words.shelf}>
          <div className={css.cabinet}>
            <div className={css.cabinetCrown}><span className={css.screw} aria-hidden /><span>{t.shopUi.title}</span><span className={css.screw} aria-hidden /></div>
            <div className={css.shelfViewport} tabIndex={0} role="region" aria-label="Browse the parts shelves">
            {!shipment ? <div className={css.empty}>{words.loading}</div> : !ordered.length ? <div className={css.empty}><span aria-hidden>⌕</span><h2>{words.empty}</h2><button onClick={reset}>{words.clear}</button></div> : <div className={css.shelf}>
              {ordered.map(l => {
                const bought = boughtToday(st, day, l.id);
                return <button id={`listing-${l.id}`} key={l.id} className={`${css.item} ${selected?.id === l.id ? css.chosen : ""}`} aria-haspopup="dialog" aria-label={`${l.card.name}, ${l.tier} stars, ${l.color ? t.paintName[l.color] + ", " : ""}${l.price} coins${bought ? ", bought" : ""}`} onClick={() => choose(l)} style={{ "--part-colour": l.color ? PAINTS[l.color] : "#d3b67f" } as CSSProperties}>
                  <span className={css.shelfStars}><Stars n={l.tier} /></span>{styleCardOf(l.partKey) && <span className={css.styleBadge} data-style={styleCardOf(l.partKey)!.style} title={`${STYLE_GUIDE[styleCardOf(l.partKey)!.style].strength} ${STYLE_GUIDE[styleCardOf(l.partKey)!.style].weakness}`}>{STYLE_GUIDE[styleCardOf(l.partKey)!.style].label}</span>}
                  <span className={css.display}><PartArt key={l.id} listing={l} /><span className={css.plinth} aria-hidden /></span>
                  <span className={css.tag}><span className={css.tagName}>{l.card.name}</span><span className={css.tagBottom}>{bought ? <b>✓ Yours</b> : <b><Coin /> {l.price.toLocaleString("en-US")}</b>}<span>{l.color ? t.paintName[l.color] : styleCardOf(l.partKey)?.weaponKind === "rifle" ? "Rifle" : styleCardOf(l.partKey)?.weaponKind === "paired_blades" ? "Two blades" : t.ui.card[l.slot]}</span></span></span>
                </button>;
              })}
            </div>}
            </div>
            <div className={css.cabinetFoot}><span>{words.receipt}</span><span>✦</span></div>
          </div>
          <p className={css.shelfNote}>{t.shopUi.samePlace}</p>
        </section>
      </div>

          <div className={`${css.toolbar} ${css.underShop}`} role="group" aria-label="Sort and filter the shop">
            <div className={css.tabs} role="group" aria-label="Part type"><button aria-pressed={slot == null} onClick={() => setSlot(null)}>All parts</button>{CARD_SLOTS.map(s => <button key={s} aria-pressed={slot === s} onClick={() => setSlot(s)}>{t.ui.card[s]}</button>)}</div>
            <div className={css.filters}>
              <label><span>Colour</span><select aria-label="Filter by colour" value={color ?? ""} onChange={e => setColor((e.target.value || null) as PaintId | null)}><option value="">All colours</option>{PALETTE.map(c => <option key={c} value={c}>{t.paintName[c]}</option>)}</select></label>
              {styledShelf ? <label><span>Style</span><select aria-label="Filter by style" value={style ?? ""} onChange={e => setStyle((e.target.value || null) as FightingStyle | null)}><option value="">All styles</option>{FIGHTING_STYLES.map(s => <option key={s} value={s}>{STYLE_GUIDE[s].label}</option>)}</select></label> : <label><span>Maker</span><select aria-label="Filter by maker" value={brand ?? ""} onChange={e => setBrand((e.target.value || null) as BrandId | null)}><option value="">All makers</option>{BRANDS.map(b => <option key={b} value={b}>{BRAND_INDEX[b].name}</option>)}</select></label>}
              <label><span>Sort</span><select aria-label="Sort parts" value={sort} onChange={e => setSort(e.target.value)}><option value="tier">Most stars</option><option value="price-low">Lowest price</option><option value="price-high">Highest price</option><option value="name">Name A to Z</option></select></label>
              <span className={css.resultCount} aria-live="polite">{ordered.length} / {shipment?.listings.length ?? 0} parts</span>
            </div>
          </div>

      <p className={css.footerNote}>{t.shopUi.keepsColor}</p>
    </div>
    <dialog ref={dialog} aria-labelledby={selected ? "shop-part-title" : undefined} aria-label={selected ? undefined : "Inspect part"} className={css.dialog} onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}><div>{inspection()}</div></dialog>
    <dialog ref={calendarDialog} aria-labelledby="shop-calendar-title" className={`${css.dialog} ${css.calendarDialog}`} onClick={e => { if (e.target === e.currentTarget) calendarDialog.current?.close(); }}><div className={css.counterHeading}><h2 id="shop-calendar-title">{words.calendar}</h2><button autoFocus className={css.closeButton} aria-label="Close delivery calendar" onClick={() => calendarDialog.current?.close()}>×</button></div><div className={css.calendarContents}><p>{styledShelf ? "The shop always has a starter weapon for Tank, Speed and Ranged. The Tier 4 part changes each day." : t.shopUi.comesBack}</p><div className={css.days}>{shipment ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name, wd) => { const offer = styleWeek[wd], c = offer ? { slot: offer.slot, color: offer.color } : t4Calendar(shipment.t4.week, wd); return <div className={wd === shipment.t4.weekday ? css.today : ""} key={name}><span>{wd === shipment.t4.weekday ? t.shopUi.today : name}</span><strong>{offer?.card.name ?? t.ui.card[c.slot]}</strong><i style={{ background: c.color ? PAINTS[c.color] : "#bc9b63" }} /><small>★★★★</small></div>; }) : null}</div><p>{styledShelf ? "Colours change the look, not the stats." : t.shopUi.keepsColor}</p><button className={css.backButton} onClick={() => calendarDialog.current?.close()}>{words.close}</button></div></dialog>
    {toast ? <div className={css.toast} role="status">✓ {toast}</div> : null}
  </>;
  return embedded ? <div className={css.embedded}>{contents}</div> : <PageShell wide backdrop={{ background: "radial-gradient(ellipse at 16% 0%, #514337 0%, #302921 45%, #211d19 100%)" }}>{contents}</PageShell>;
}
