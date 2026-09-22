"use client";

import { useMemo, useState } from "react";
import { ToyDisplay, PartDisplay } from "../_components/ToyDisplay";
import { NamePicker } from "../_components/NamePicker";
import { engineBuild, nameText, SLOT_STATS, type Build, type OwnedPart, type Socket } from "@/lib/bots/fixtures";
import { EQUIPMENT_KIND, EQUIPMENT_LABEL, equipmentPaints, socketsOf } from "@/lib/bots/equipment";
import { beginnerOrderFor } from "@/lib/bots/beginner-catalog";
import { FIGHTING_STYLES, STYLE_GUIDE, stylePreviewHref, type FightingStyle } from "@/lib/bots/style-guide";
import { styleCardOf, styleSpecialInfo } from "@/lib/bots/style-catalog";
import type { OnboardingView } from "@/lib/bots/onboarding-types";
import { NO_LOOK, NO_MARKS } from "@/lib/bots/look";
import { rigLookOf } from "../_view/look-view";
import { OverallStats, PartNumbers, previewOffer } from "./BuildStats";
import css from "./starter.module.css";

export default function StarterBuilder({ build, parts, onboarding, socket, busy, signedIn, onSocket, onChoose, onName, onFinish, onExplore }: {
  build: Build; parts: OwnedPart[]; onboarding: OnboardingView; socket: Socket; busy: boolean; signedIn: boolean;
  onSocket: (socket: Socket) => void; onChoose: (socket: Socket, offer: string) => void;
  onName: (name: Build["name"]) => Promise<void>; onFinish: (name: Build["name"]) => Promise<void>; onExplore: () => void;
}) {
  const [review, setReview] = useState(false), name = build.name;
  const [guidance, setGuidance] = useState<FightingStyle | null>(null);
  const [hover, setHover] = useState<{ socket: Socket; id: string } | null>(null);
  const styled = onboarding.catalogueVersion === 2;
  const offers = onboarding.offers.filter(o => o.part.slot === EQUIPMENT_KIND[socket]);
  const preview = !review && hover?.socket === socket ? offers.find(o => o.id === hover.id) : undefined;
  const trial = useMemo(() => previewOffer(build, parts, socket, preview), [build, parts, socket, preview]);
  const robot = useMemo(() => engineBuild(trial.build, trial.parts), [trial]);
  const look = useMemo(() => rigLookOf({ paints: equipmentPaints(trial.build, trial.parts), look: { ...(build.look ?? NO_LOOK), plateNumber: name.num }, marks: NO_MARKS, wins: 0 }, "mint"), [build.look, trial, name.num]);
  const fitted = parts.find(p => p.uid === socketsOf(build)[socket]);
  const body = trial.parts.find(p => p.uid === socketsOf(trial.build).torso);
  const special = styleSpecialInfo(body?.id);
  const ordered = [...offers].sort((a, b) => Number(styleCardOf(b.id)?.style === guidance) - Number(styleCardOf(a.id)?.style === guidance));
  const order = beginnerOrderFor(onboarding.catalogueVersion);
  const complete = onboarding.purchasedCount === 7;
  return <section className={`${css.builder} ${styled ? css.styled : ""}`} aria-label="Build your first robot" data-catalogue={onboarding.catalogueVersion ?? 1}>
    <header className={css.header}><div><small>YOUR FIRST ROBOT</small><h1>{review ? "Meet your robot." : styled ? "How will yours fight?" : "Make it yours."}</h1><p>{signedIn ? "Choices saved to your wallet" : "Choices saved in this browser"} · 250 starter coins</p></div><button onClick={onExplore} disabled={busy}>Look around</button></header>
    {styled && <div className={css.styleGuide} aria-label="Choose optional build guidance"><div><strong>Pick a guide, or mix your own.</strong><span>Guides suggest parts. They never change your choices.</span></div><div className={css.styleOptions}>{FIGHTING_STYLES.map(style => <div className={css.styleOption} data-style={style} key={style}><button aria-pressed={guidance === style} onClick={() => setGuidance(guidance === style ? null : style)}><strong>{STYLE_GUIDE[style].label}</strong><span>{STYLE_GUIDE[style].strength} {STYLE_GUIDE[style].weakness}</span></button><a href={stylePreviewHref(style)} aria-disabled={busy} onClick={e => { if (busy) e.preventDefault(); }}>See it fight ↗</a></div>)}</div></div>}
    <div className={css.stats}><OverallStats build={trial.build} parts={trial.parts} before={build} beforeParts={parts} preview={!!preview && preview.id !== fitted?.id} styleRules={styled} />{styled && <div className={css.bodySpecial}><small>YOUR BODY SPECIAL</small><strong>{special?.current?.name ?? "Choose your body first"}</strong>{special?.current ? <details><summary>Move details · Tier 3 upgrade</summary><p>{special.current.description}</p>{special.upgraded && <p><b>{special.unlocked ? "Tier 3 unlocked" : "At Tier 3"}: {special.upgraded.name}</b><br />{special.upgraded.description}</p>}<small>Try specials in practice. No prizes or coin rewards.</small></details> : <p>Your body gives you a special move. Mix the other parts however you like.</p>}</div>}</div>
    <div className={css.preview}><ToyDisplay build={robot} look={look} mode="interactive" variant="workbench" ariaLabel={`${nameText(name)}, ${preview ? "trying a part" : "your chosen parts"}`} /><span>{preview && preview.id !== fitted?.id ? `Trying ${preview.part.name}` : `${onboarding.purchasedCount} of 7 parts chosen`}</span>{styled && special?.current && <details className={css.mobileSpecial}><summary>Body special: {special.current.name}</summary><p>{special.current.description}</p>{special.upgraded && <p>Tier 3 unlock: <b>{special.upgraded.name}</b>. {special.upgraded.description}</p>}</details>}</div>
    <section className={css.choices} aria-label={review ? "Review your robot" : "Choose a part"}>
      <div className={css.choiceHead}><h2>{review ? "Give it a name." : `Choose your ${EQUIPMENT_LABEL[socket].toLowerCase()}.`}</h2><p>{review ? "This is the robot you will keep." : styled ? socket === "torso" ? "Your body gives your robot a special move." : guidance ? `${STYLE_GUIDE[guidance].label} parts come first below. You can choose any part.` : "Every part changes how you fight. Mix any style." : "Try any shape. You can change it before you finish."}</p>
        <div className={css.sockets} role="group" aria-label="Robot parts">{order.map(s => <button key={s} disabled={busy} aria-pressed={!review && s === socket} onClick={() => { setReview(false); setHover(null); onSocket(s); }}><span>{({head:"Head",torso:"Body",armL:"L arm",armR:"R arm",legL:"L leg",legR:"R leg",weapon:"Weapon"})[s]}</span><small>{onboarding.purchases[s] ? "✓" : "○"}</small></button>)}</div>
      </div>
      <div className={css.items}>{review ? <><fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}><NamePicker name={name} onChange={next => void onName(next)} /></fieldset><p className={css.permanent}>Finished robots keep their parts. You can still change their name, face and stickers.</p>{styled && <p className={css.permanent}>This robot can fight in practice and against house robots. Player fights need a later update.</p>}<button className={css.back} disabled={busy} onClick={() => setReview(false)}>Back to parts</button></> : <div className={css.grid} onMouseLeave={() => setHover(null)}>{ordered.map(o => { const card = styleCardOf(o.id), selected = onboarding.purchases[socket]?.offerId === o.id; return <button className={`${css.part} ${card && guidance === card.style ? css.recommended : ""}`} data-starter-offer={o.id} data-style={card?.style} key={o.id} aria-pressed={selected} disabled={busy} onMouseEnter={() => setHover({ socket, id: o.id })} onFocus={() => setHover({ socket, id: o.id })} onBlur={() => setHover(null)} onClick={() => { setHover(null); onChoose(socket, o.id); }}><div><PartDisplay part={o.part} paint={o.color} variant="cutout" ariaLabel={o.part.name} /></div><strong>{o.part.name}</strong><span>{o.price} coins{card && guidance === card.style ? " · Suggested" : selected ? " · Chosen" : ""}</span>{card ? <><span className={css.partStyle}>{STYLE_GUIDE[card.style].label}</span><dl className={css.partDeltas}>{SLOT_STATS[o.part.slot].map((stat, i) => { const delta = o.part.s[i] - (fitted?.s[i] ?? 0); return <div key={stat}><dt>{({ attackSpeed: "Attack speed", damage: "Damage", strength: "Strength", block: "Block", health: "Health", luck: "Luck", speed: "Speed", dodge: "Dodge", accuracy: "Accuracy" })[stat]}</dt><dd>{o.part.s[i]} <em data-change={delta > 0 ? "gain" : delta < 0 ? "loss" : "same"}>{delta > 0 ? "+" : ""}{delta}</em></dd></div>; })}</dl>{card.special && <span className={css.partAbility}>{card.special.name}</span>}</> : <PartNumbers part={o.part} />}</button>; })}</div>}</div>
      <footer><p>{review ? "Parts stay on this robot after Finish." : styled ? "+ gain · − loss · 0 unchanged. All seven parts cost 250 coins." : complete ? "All seven parts are chosen." : "Your 250 starter coins cover all seven parts."}</p><button className={css.primary} disabled={!complete || busy} onClick={() => { setHover(null); review ? void onFinish(name) : setReview(true); }}>{busy ? "Saving…" : review ? "Finish robot" : complete ? "Name & finish" : `${7 - onboarding.purchasedCount} more ${onboarding.purchasedCount === 6 ? "part" : "parts"} to choose`}</button></footer>
    </section>
  </section>;
}
