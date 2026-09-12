"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CATALOG_V6 } from "@/lib/bots/v6";
import { BUILD_ORDER, collectionBuildQuote, emptySeasonDraft, seasonCollectionPracticeHref, SOCKET_NAME, socketKind } from "@/lib/bots/season/workshop";
import type { SeasonBot, SeasonStateResponse } from "@/lib/bots/season/types";
import type { CombatSocket } from "@/lib/bots/combat-model";
import V6ToyPicture from "../_components/V6ToyPicture";
import css from "./season-workshop.module.css";
import collectionCss from "./season-collection.module.css";

function SavedCollectionRobot({ bot, seasonName }: { bot: SeasonBot; seasonName: string }) {
  const href = useMemo(() => seasonCollectionPracticeHref(bot), [bot.build, bot.name]);
  return <article className={collectionCss.card} aria-label={`${bot.name}, saved collection robot`}>
    {href && <div className={collectionCss.picture}><V6ToyPicture build={bot.build} title={`${bot.name}, exact saved parts`} /></div>}
    <div className={collectionCss.details}><small>{seasonName}</small><h3>{bot.name}</h3><p>{bot.gp} GP · {bot.wins} wins · {bot.losses} losses</p>
      {href ? <><Link className={collectionCss.practice} href={href}>Practice with {bot.name} →</Link><p className={collectionCss.note}>Free practice. No coins, rank or repairs.</p></> : <p className={collectionCss.note}>This robot uses earlier fight rules. Its saved parts and record are safe. Practice is not available for this version.</p>}
      <details><summary>Its seven parts</summary>{BUILD_ORDER.map(socket => <p key={socket}>{SOCKET_NAME[socket]}: {bot.build.parts[socket].name}</p>)}</details>
    </div>
  </article>;
}

export default function SeasonCollection({ view, busy, onBuild, onBack }: { view: SeasonStateResponse | null; busy: boolean; onBuild(seasonId: string, name: string, parts: Partial<Record<CombatSocket, string>>): Promise<boolean>; onBack(): void }) {
  const collections = view?.collections ?? [];
  const [source, setSource] = useState(""), [draft, setDraft] = useState(emptySeasonDraft), [review, setReview] = useState(false);
  const selected = collections.find(c => c.seasonId === source) ?? collections[0], quote = useMemo(() => collectionBuildQuote(draft, collections), [draft, collections]);
  return <section className={css.archive}><header className={css.heading}><div><small>PAST SEASONS · YOUR COLLECTION</small><h1>Old friends. New ideas.</h1></div><button onClick={onBack}>Current season →</button></header><p>Keep your older robots. Use coins left from a past season to make more collection robots. They do not enter the current league.</p><Link href="/bots?collection=classic&tour=1">Open my original garage and coins →</Link>{!selected ? <div className={css.callout}><span>No past season collection yet. At the end of a season, your robots and remaining coins come here.</span></div> : <div className={css.archiveGrid}><section className={css.clipboard}><label>Use coins from<select value={selected.seasonId} disabled={busy} onChange={e => { setSource(e.target.value); setReview(false); }}>{collections.map(c => <option key={c.seasonId} value={c.seasonId}>{c.name} · {c.spendable} coins</option>)}</select></label><strong>{selected.spendable} coins left</strong><p>You can reuse designs from any past season. New designs are paid for once. Your old robots keep their parts.</p><label>New collection robot name<input maxLength={32} value={draft.name} disabled={busy} onChange={e => { setDraft({ ...draft, name: e.target.value }); setReview(false); }} /></label>{BUILD_ORDER.map(socket => <label key={socket}>{SOCKET_NAME[socket]}<select disabled={busy} value={draft.parts[socket] ?? ""} onChange={e => { const parts = { ...draft.parts }; if (e.target.value) parts[socket] = e.target.value; else delete parts[socket]; setDraft({ ...draft, parts }); setReview(false); }}><option value="">Choose a {SOCKET_NAME[socket].toLowerCase()}</option>{CATALOG_V6.filter(c => c.slot === socketKind(socket)).map(c => <option value={c.id} key={c.id}>{c.name} · T{c.tier} · {c.gp} GP</option>)}</select></label>)}<strong>{quote.stats.gp} GP · {quote.coins} coins for new designs</strong>{quote.compatibility.reason && <p>{quote.compatibility.reason}</p>}{review ? <div className={css.callout}><span>Use {quote.coins} coins from {selected.name} to build {draft.name}? The finished robot keeps these seven parts.</span><button className={css.primary} disabled={busy} onClick={async () => { if (await onBuild(selected.seasonId, draft.name, draft.parts)) { setDraft(emptySeasonDraft()); setReview(false); } }}>{busy ? "Building…" : `Finish · ${quote.coins} coins`}</button><button disabled={busy} onClick={() => setReview(false)}>Keep choosing</button></div> : <button className={css.primary} disabled={busy || !quote.complete || !draft.name.trim() || draft.name.trim().length > 32 || quote.coins > selected.spendable} onClick={() => setReview(true)}>Review my collection robot</button>}<small>{quote.missing.length ? `New designs: ${quote.missing.map(c => c.name).join(", ")}.` : "Every chosen design is already in your collection."}</small></section><section><h2>Your saved collection</h2><div className={css.archiveCards}>{(view?.archive ?? []).map(bot => <SavedCollectionRobot key={bot.id} bot={bot} seasonName={collections.find(c => c.seasonId === bot.seasonId)?.name ?? "Past season"} />)}</div></section></div>}</section>;
}
