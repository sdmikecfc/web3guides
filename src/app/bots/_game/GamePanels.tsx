"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CAMPAIGN_CATEGORIES, CAMPAIGN_LABEL, CAMPAIGN_PERIODS, CAMPAIGN_PRIZES, type CampaignCategory, type CampaignPeriod, type CampaignView } from "@/lib/bots/campaign-view";
import css from "./game.module.css";

export function GameDrawer({ title, onClose, children, wide = false, room = "workshop" }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; room?: "workshop" | "street" | "arena" | "cabinet" }) {
  const box = useRef<HTMLDivElement>(null), close = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); }
      if (event.key !== "Tab") return;
      const targets = Array.from(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], select, input, textarea, summary, [tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
      const first = targets[0], last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className={css.scrim} data-room={room} data-wide={wide || undefined} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={css.drawerScene} aria-hidden="true"><span className={css.roomSign}>{room === "street" ? "Community" : room === "arena" ? "Under the lights" : room === "cabinet" ? "The parts bench" : "Make yourself at home."}</span></div>
    <section ref={box} role="dialog" aria-modal="true" aria-labelledby="game-drawer-title" className={css.drawer}>
      <header className={css.drawerHeader}><h2 id="game-drawer-title">{title}</h2><button ref={close} className={css.close} onClick={onClose} aria-label="Close">×</button></header>
      <div className={css.drawerContent}>{children}</div>
    </section>
  </div>;
}
const when = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC" : "Not set yet";
const amount = (n: number | null | undefined) => n == null ? "Not available" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function CampaignPanel({ view, period, onPeriod }: { view: CampaignView | null; period: CampaignPeriod; onPeriod: (p: CampaignPeriod) => void }) {
  const [category, setCategory] = useState<CampaignCategory>("roi");
  const draft = !view?.campaign?.startsAt || view.campaign.status === "draft", rows = view?.standings[category] ?? [];
  const prizes = CAMPAIGN_PRIZES[category];
  return <>
    <div className={css.callout}><strong>Two weeks. Three ways to win.</strong><p>$2,000 in prizes: $800 for the best ROI percentage, $800 for the most profit in USD, and $400 for battle points.</p><p className={css.fine}>{draft ? "Launch date has not been set. The competition has not started." : `${when(view.campaign!.startsAt)} to ${when(view.campaign!.endsAt)}.`}</p></div>
    <div className={css.tabs} aria-label="Award period">{CAMPAIGN_PERIODS.map((p, i) => <button key={p} aria-pressed={period === p} onClick={() => onPeriod(p)}>{p === "final" ? "Two-week final" : `Week ${i + 1}`}</button>)}</div>
    <div className={css.tabs} aria-label="Leaderboard category">{CAMPAIGN_CATEGORIES.map(key => <button key={key} aria-pressed={category === key} onClick={() => setCategory(key)}>{CAMPAIGN_LABEL[key]}</button>)}</div>
    <h3>{CAMPAIGN_LABEL[category]}</h3>
    <p>{category === "roi" ? "Realized trading profit divided by your actual starting capital and added funds. A smaller bankroll does not receive an artificial boost." : category === "profit" ? "Realized profit from sold positions, measured in USD. Unsold gains do not count." : "Battle points from your real fights. Practice fights do not add points."}</p>
    {view?.source !== "available" ? <p className={css.callout}>Scores are not available yet. We will show confirmed results here.</p> : rows.length === 0 ? <p className={css.callout}>{draft ? "The first scores arrive after launch." : "No confirmed scores for this period yet."}</p> : <table className={css.table}><thead><tr><th>Place</th><th>Player</th><th>Score</th><th>Prize</th></tr></thead><tbody>{rows.map((row, i) => <tr key={`${row.rank}-${i}`}><td>{row.rank}</td><td>{row.name}</td><td>{category === "roi" ? `${amount(row.score)}%` : category === "battles" ? amount(row.score) : `$${amount(row.score)}`}</td><td>{row.prizeCents ? `$${amount(row.prizeCents / 100)}` : "—"}</td></tr>)}</tbody></table>}
    <p className={css.fine}>{view?.period.status === "frozen" ? "These awards are final." : view?.period.status === "checking" ? "The period has ended. Results are being checked." : "Places and prizes are provisional until results are checked."}{view?.updatedAt ? ` Updated ${when(view.updatedAt)}.` : ""}{view?.confirmedThrough ? ` Trades checked through ${when(view.confirmedThrough)}.` : ""}</p>
    <h3>{category === "battles" ? "$400 battle prize pot" : "$800 prize pot"}</h3><table className={css.table}><caption>Five paid places in each weekly round and in the final.</caption><thead><tr><th>Period</th><th>1st</th><th>2nd</th><th>3rd</th><th>4th</th><th>5th</th></tr></thead><tbody><tr><td>Each week</td>{prizes.weekly.map(value => <td key={value}>${value}</td>)}</tr><tr><td>Two-week final</td>{prizes.final.map(value => <td key={value}>${value}</td>)}</tr></tbody></table>
    <p>To qualify for a weekly prize, complete at least one Doma Strategy trade on three different days that week. Trades count after the game checks them. Do this in both weeks to qualify for the final.</p>
    <p>Trading volume does not determine any cash prize. More trades on the same day do not improve eligibility.</p>
    <p>There are 45 scheduled prize places. One player may place in more than one period or category. Tied players share the prizes for the places they occupy equally.</p>
    <p className={css.fine}>Trading losses can still appear in the rankings. ROI and profit cannot be ranked until the actual starting capital is known and greater than zero. Only verified activity inside the competition period can count.</p>
    <Link className={css.secondary} href="/bots/rules">Read the complete rules</Link>
  </>;
}

export function HelpPanel({ demo, onEarn, onCampaign, onReset, onSignOut }: { demo: boolean; onEarn: () => void; onCampaign: () => void; onReset: () => void; onSignOut: () => void }) {
  return <><div className={css.callout}><strong>Your robot lives here.</strong><p>Choose Parts to buy parts. Choose Build to make a new robot. Choose Fight to watch it battle.</p></div>
    <h3>Seven pieces. All yours.</h3><p>A head, a body, two separate arms, two separate legs, and a weapon. Mix any style. Your left and right sides can be different.</p>
    <h3>Room for five robots</h3><p>Your garage holds up to five robots. Once you finish a robot, its parts stay together. You can still change its name, face and stickers.</p><p>Recycle a robot to free its spot. You get 40% of its parts’ shop value back in coins. Free starter parts give no coins back. Recycling removes the robot and all of its parts.</p><h3>Your first build</h3><p>You get a free welcome robot and 250 coins reserved for seven starter parts. Choose the shapes you like. Every starter part has the same three stats: 1, 1, 1.</p><p>Head, body, and weapon cost 50 coins each. Each arm and each leg costs 25 coins. Together they use the 250 coins exactly.</p>
    <h3>Your first fight is practice</h3><p>Your new robot faces the welcome robot. Watch and enjoy. Nothing is lost. Practice gives no coins, points, wins, or repairs.</p>
    <h3>Real fights</h3><p>You choose a rival. Your robot does the fighting. Hits can knock off a head, arm, or leg. Losing a part changes the fight. Each robot can attack twice a day; losing a real fight can send it for repairs.</p>
    <h3>A new shipment every day</h3><p>Parts arrive in a colour and keep that colour. Save coins for a piece you like. Matching all six body pieces gives a set bonus; the weapon is separate.</p>
    <h3>Your progress stays</h3><p>Your saved parts and robot choices stay with you. Taking a day off does not erase them. Stars and other earned decorations show what your robot has done.</p>
    <button className={css.secondary} onClick={onEarn}>How to earn coins</button><button className={css.secondary} onClick={onCampaign}>Competition dates and prizes</button>
    {demo ? <><h3>This is a practice garage</h3><p>Your practice garage is saved in this browser. Connect to open your wallet’s garage. We keep your chosen starter appearance when you join with a new account. An existing account keeps its saved robots. Practice coins and fights do not count in the competition.</p><button className={css.secondary} onClick={onReset}>Start this practice garage again</button></> : <button className={css.secondary} onClick={onSignOut}>Sign out of this garage</button>}
    <div className={css.legalLinks}><Link href="/bots/rules">Rules</Link><Link href="/bots/privacy">Privacy</Link><Link href="/bots/terms">Terms</Link><Link href="/bots/disclaimer">Disclaimer</Link></div>
  </>;
}
