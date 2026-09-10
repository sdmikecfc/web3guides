"use client";

import { useMemo, useState } from "react";
import { ToyDisplay, PartDisplay } from "../_components/ToyDisplay";
import { NamePicker } from "../_components/NamePicker";
import { engineBuild, nameText, type Build, type OwnedPart, type Socket } from "@/lib/bots/fixtures";
import { EQUIPMENT_KIND, EQUIPMENT_LABEL, EQUIPMENT_SOCKETS, equipmentPaints } from "@/lib/bots/equipment";
import type { OnboardingView } from "@/lib/bots/onboarding-types";
import { NO_LOOK, NO_MARKS } from "@/lib/bots/look";
import { rigLookOf } from "../_view/look-view";
import { OverallStats, PartNumbers } from "./BuildStats";
import css from "./starter.module.css";

export default function StarterBuilder({ build, parts, onboarding, socket, busy, signedIn, onSocket, onChoose, onName, onFinish, onExplore }: {
  build: Build; parts: OwnedPart[]; onboarding: OnboardingView; socket: Socket; busy: boolean; signedIn: boolean;
  onSocket: (socket: Socket) => void; onChoose: (socket: Socket, offer: string) => void;
  onName: (name: Build["name"]) => Promise<void>; onFinish: (name: Build["name"]) => Promise<void>; onExplore: () => void;
}) {
  const [review, setReview] = useState(false), name = build.name;
  const robot = useMemo(() => engineBuild(build, parts), [build, parts]);
  const look = useMemo(() => rigLookOf({ paints: equipmentPaints(build, parts), look: { ...(build.look ?? NO_LOOK), plateNumber: name.num }, marks: NO_MARKS, wins: 0 }, "mint"), [build, parts, name.num]);
  const offers = onboarding.offers.filter(o => o.part.slot === EQUIPMENT_KIND[socket]);
  const complete = onboarding.purchasedCount === 7;
  return <section className={css.builder} aria-label="Build your first robot">
    <header className={css.header}><div><small>YOUR FIRST ROBOT</small><h1>{review ? "Meet your robot." : "Make it yours."}</h1><p>{signedIn ? "Choices saved to your wallet" : "Choices saved in this browser"} · 250 starter coins</p></div><button onClick={onExplore} disabled={busy}>Look around</button></header>
    <div className={css.stats}><OverallStats build={build} parts={parts} before={build} beforeParts={parts} preview={false} /></div>
    <div className={css.preview}><ToyDisplay build={robot} look={look} mode="interactive" variant="workbench" ariaLabel={`${nameText(name)}, your chosen parts`} /><span>{onboarding.purchasedCount} of 7 parts chosen</span></div>
    <section className={css.choices} aria-label={review ? "Review your robot" : "Choose a part"}>
      <div className={css.choiceHead}><h2>{review ? "Give it a name." : EQUIPMENT_LABEL[socket]}</h2><p>{review ? "This is the robot you will keep." : "Try any shape. You can change it before you finish."}</p>
        <div className={css.sockets} role="group" aria-label="Robot parts">{EQUIPMENT_SOCKETS.map(s => <button key={s} disabled={busy} aria-pressed={!review && s === socket} onClick={() => { setReview(false); onSocket(s); }}><span>{({head:"Head",torso:"Body",armL:"L arm",armR:"R arm",legL:"L leg",legR:"R leg",weapon:"Weapon"})[s]}</span><small>{onboarding.purchases[s] ? "✓" : "○"}</small></button>)}</div>
      </div>
      <div className={css.items}>{review ? <><fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}><NamePicker name={name} onChange={next => void onName(next)} /></fieldset><p className={css.permanent}>Finished robots keep their parts. You can still change their name, face and stickers.</p><button className={css.back} disabled={busy} onClick={() => setReview(false)}>Back to parts</button></> : <div className={css.grid}>{offers.map(o => <button className={css.part} data-starter-offer={o.id} key={o.id} aria-pressed={onboarding.purchases[socket]?.offerId === o.id} disabled={busy} onClick={() => onChoose(socket, o.id)}><div><PartDisplay part={o.part} paint={o.color} variant="cutout" ariaLabel={o.part.name} /></div><strong>{o.part.name}</strong><span>{o.price} coins</span><PartNumbers part={o.part} /></button>)}</div>}</div>
      <footer><p>{complete ? "All seven parts are chosen." : "Your 250 starter coins cover all seven parts."}</p><button className={css.primary} disabled={!complete || busy} onClick={() => review ? void onFinish(name) : setReview(true)}>{busy ? "Saving…" : review ? "Finish robot" : complete ? "Name & finish" : `${7 - onboarding.purchasedCount} more ${onboarding.purchasedCount === 6 ? "part" : "parts"} to choose`}</button></footer>
    </section>
  </section>;
}
