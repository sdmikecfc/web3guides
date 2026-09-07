"use client";

import { progressMilestones, type ProgressView } from "@/lib/bots/progress-view";
import css from "./ProgressPanel.module.css";

export function ProgressPanel({ view, signedIn, onConnect }: { view: ProgressView | null; signedIn: boolean; onConnect: () => void }) {
  const available = signedIn && view?.source === "available";
  const rows = progressMilestones(signedIn ? view : null);
  return <section className={css.card} aria-label="Your little milestones">
    <div className={css.heading}><div><p className={css.eyebrow}>Little milestones</p><h3>Small things to come back for.</h3></div><span className={css.badge} aria-label={available ? `${view.activeDays} active days` : "Visit days"}>{available ? view.activeDays : "·"}<small>{available && view.activeDays === 1 ? "day" : "days"}</small></span></div>
    <p className={css.intro}>{available ? "Every day you visit counts. Miss a day? Keep everything." : signedIn ? view ? "Your finds are safe. We cannot check your progress right now." : "Checking your little milestones…" : "Connect to keep your finds and count the days you visit."}</p>
    <ul className={css.rows}>{rows.map(m => <li key={m.id} className={css.row} data-earned={m.earned || undefined}><span className={css.dot} style={{ background: m.swatch }} aria-hidden>{m.earned ? "✓" : ""}</span><div><strong>{m.label}</strong><small>{m.reward}</small></div><span className={css.state}>{m.earned ? "Yours" : available && m.days ? `${Math.min(view.activeDays ?? 0, m.days)} / ${m.days}` : "To find"}</span></li>)}</ul>
    {signedIn ? <p className={css.note}>Earned hats appear in your hat picker. Wear one whenever you like.</p> : <button className={css.connect} onClick={onConnect}>Connect to keep your progress</button>}
  </section>;
}
