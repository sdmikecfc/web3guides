"use client";

import type { PanelSnapshot } from "./DialsPanel";
import { IconChefHat } from "./_ui/icons";
import css from "./_ui/restaurant.module.css";

/** Progress is owned by the onboarding command state, never inferred here. */
export const INTRO_DONE = 6;
export interface IntroStep { title: string; body: string; action: string }
export const INTRO_STEPS: IntroStep[] = [
  { title: "A first plate to remember", body: "Your crew will cook and serve. Stay a moment and see your little kitchen welcome its first guest.", action: "Meet your first guest" },
  { title: "Make a corner your own", body: "Move your welcome plant or try a new finish. Your first little makeover is free.", action: "Make it yours" },
  { title: "A parcel at your door", body: "Something good is waiting inside. Open your delivery to start filling the pantry.", action: "Open delivery" },
  { title: "What will you be known for?", body: "Choose a signature dish, then use your ingredients to give its recipe a little more love.", action: "Choose a recipe" },
  { title: "This little place is yours", body: "Keep your kitchen for another visit. You can share a look around when you feel ready.", action: "Keep my kitchen" },
];

export function Coach({step,narrow,onSkip,onAction,busy=false}: {
  step:number; snap:PanelSnapshot; narrow:boolean; onSkip:()=>void; onAction:()=>void; busy?:boolean;
}) {
  const current=INTRO_STEPS[step-1];
  if(!current)return null;
  return <section className={css.coach} data-narrow={narrow||undefined} aria-label="Your first kitchen" aria-busy={busy}>
    <div className={css.coachHeading}>
      <span className={css.coachBadge} aria-hidden="true"><IconChefHat size={21}/></span>
      <span className={css.eyebrow}>Your opening day</span>
      <span className={css.coachCount}>{step} / {INTRO_STEPS.length}</span>
    </div>
    <div aria-live="polite" aria-atomic="true"><h3>{current.title}</h3><p>{current.body}</p></div>
    <div className={css.coachActions}>
      <button type="button" className={css.buy} onClick={onAction} disabled={busy}>{busy?"One little moment…":current.action}</button>
      <button type="button" className={css.textButton} onClick={onSkip}>Skip intro</button>
    </div>
    <div className={css.coachProgress} aria-hidden="true">{INTRO_STEPS.map((_,index)=><i key={index} data-reached={index<step||undefined}/>)}</div>
  </section>;
}
