"use client";

import { useEffect, useMemo, useState } from "react";
import type { DashboardView } from "@/lib/bots/dashboard-view";
import { buildOf, ownedOf } from "@/lib/bots/live-garage";
import { engineBuild } from "@/lib/bots/fixtures";
import type { MeView } from "../_server/types";
import { rigLookOf } from "../_view/look-view";
import { ToyDisplay, type ToyDisplayProps } from "../_components/ToyDisplay";
import { CoinGuide, BattleCoinGuide } from "./CoinGuide";
import css from "./EarnDashboard.module.css";

const number = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const dollars = (n: number | null | undefined) => n == null ? "—" : `$${number(n)}`;
const date = (value: string) => new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const total = (...values: (number | null | undefined)[]) => values.every((n): n is number => n != null) ? values.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null;

export default function EarnDashboard({ token, me, practiceCoins, preview, onConnect, onWatch, onShop, onFight }: {
  token: string | null; me: MeView | null; practiceCoins: number;
  preview?: Pick<ToyDisplayProps, "build" | "look" | "ariaLabel">;
  onConnect: () => void; onWatch: (id: string) => void; onShop: () => void; onFight: () => void;
}) {
  const [result, setResult] = useState<{ token: string; value: DashboardView } | null>(null);
  const [error, setError] = useState<{ token: string; expired: boolean } | null>(null);
  const [reload, setReload] = useState(0), [copied, setCopied] = useState(false);
  const view = result?.token === token ? result.value : null;
  const failure = error?.token === token ? error : null;
  useEffect(() => {
    setCopied(false);
    if (!token) { setResult(null); setError(null); return; }
    const controller = new AbortController();
    let pending = false;
    const read = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/bots/dashboard", { cache: "no-store", signal: controller.signal, headers: { Authorization: `Bearer ${token}` } });
        const value = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || !value?.ok) { if (response.status === 401) setResult(null); setError({ token, expired: response.status === 401 }); return; }
        setResult({ token, value }); setError(null);
      } catch { if (!controller.signal.aborted) setError({ token, expired: false }); }
      finally { pending = false; }
    };
    void read();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void read(); }, 30000);
    const visible = () => { if (document.visibilityState === "visible") void read(); };
    document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [token, reload]);

  const champion = useMemo(() => {
    const bot = me?.bots.find(b => b.id === view?.bestBot.botId);
    if (!bot || !me) return null;
    return { name: bot.nameText, build: engineBuild(buildOf(bot), me.parts.map(ownedOf)), look: rigLookOf({ paints: bot.paints, look: bot.look, marks: bot.marks, wins: bot.wins }, bot.paint) };
  }, [me, view?.bestBot.botId]);
  const coinBalance = token ? view?.coins.balance : practiceCoins;
  const fights = view?.battles, trade = view?.trading.lifetime;
  const winRate = fights?.fought != null && fights.fought > 0 && fights.wins != null ? Math.round(100 * fights.wins / fights.fought) : null;
  const balanceHint = !token ? "Practice coins · saved in this browser" : view?.coins.balance == null ? "Your coin balance is not available yet." : view.coins.spendable == null ? "Your available spending balance is not known yet." : view.coins.reserved ? `${number(view.coins.spendable)} ready to spend · ${number(view.coins.reserved)} kept for your first build` : "Ready to spend on robot parts";
  const newBattleCoins = total(fights?.coins.rewards, fights?.coins.stakeWon, fights?.coins.houseBonus);
  return <div className={css.dashboard}>
    {failure && <div className={css.notice} role="status"><p>{failure.expired ? "Please connect your wallet again to see your account." : "We could not update your stats. Try again in a moment."}{view && " The last saved update is shown."}</p><button className={css.smallButton} onClick={failure.expired ? onConnect : () => setReload(n => n + 1)}>{failure.expired ? "Connect again" : "Try again"}</button></div>}
    <section className={css.hero} aria-label="Your coin balance">
      <div className={css.heroCopy}><span className={css.eyebrow}>{token ? "YOUR GARAGE ACCOUNT" : "YOUR PRACTICE GARAGE"}</span><h3>Your next great robot<br />starts here.</h3><div className={css.balance}><span aria-hidden="true">●</span>{number(coinBalance)} <small>coins</small></div><p>{token && !view && !failure ? "Loading your account…" : balanceHint}</p><div className={css.actions}><button className={css.button} onClick={token ? onShop : onConnect}>{token ? "Find new parts" : "Connect my wallet"}<span aria-hidden="true">↗</span></button><button className={css.textButton} onClick={onFight}>Go to fights →</button></div></div>
      <div className={css.champion}>{champion ? <ToyDisplay build={champion.build} look={champion.look} variant="cutout" ariaLabel={champion.name} /> : preview ? <ToyDisplay {...preview} variant="cutout" /> : <span className={css.emptyRobot} aria-hidden="true">★</span>}<div className={css.championLabel}><span>{champion && (view?.bestBot.wins ?? 0) > 0 ? "YOUR MOST WINS" : "YOUR ROBOT"}</span><strong>{champion?.name ?? preview?.ariaLabel ?? "A champion in the making"}</strong>{champion && <small>{number(view?.bestBot.wins)} wins · Level {number(view?.bestBot.level)}</small>}</div></div>
    </section>
    <div className={css.wallet}><span className={css.eyebrow}>YOUR WALLET</span>{token ? <><code>{view?.wallet ?? (failure?.expired ? "Connect again to see your wallet." : failure ? "Your wallet could not be loaded." : "Loading wallet…")}</code>{view?.wallet && <button className={css.smallButton} onClick={async () => { try { await navigator.clipboard.writeText(view.wallet); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied" : "Copy"}</button>}</> : <span>Connect to see your real trades, coins and fights here.</span>}</div>
    <div className={css.statGrid} aria-label="Your game totals">
      <Stat label="Dollars traded" value={dollars(trade?.countedUsd)} hint="Counted trades · all time" />
      <Stat label="Coins from trades" value={number(trade?.tradeCoins != null && trade.roiBonusCoins != null ? trade.tradeCoins + trade.roiBonusCoins : null)} hint="Trade coins + profit bonus" />
      <Stat label="Battles fought" value={number(fights?.fought)} hint="Real fights · all time" />
      <Stat label="New battle rewards" value={number(newBattleCoins)} hint="Rewards + winnings · excludes returned stakes" />
    </div>
    {!token ? <p className={css.note}>Practice fights do not earn coins or count in these stats.</p> : <p className={css.note}>{view ? `Updated ${date(view.updatedAt)}. A dash means this total is not available yet.` : failure ? "Your account stats are not available right now." : "Your stats will appear here when they finish loading."}{trade?.source === "partial" && " Some trade totals are incomplete or unavailable."}</p>}
    <div className={css.columns}><div className={css.stack}><CoinGuide /><BattleCoinGuide /></div><div className={css.stack}>
      <section className={css.card}><span className={css.eyebrow}>YOUR FIGHT RECORD</span><h3>Every battle tells a story.</h3><div className={css.record}><div><b>{number(fights?.wins)}</b><span>Wins</span></div><div><b>{number(fights?.losses)}</b><span>Losses</span></div><div><b>{winRate == null ? "—" : `${winRate}%`}</b><span>Win rate</span></div></div><dl className={css.breakdown}><div><dt>Computer fight and defence rewards</dt><dd>{number(fights?.coins.rewards)}</dd></div><div><dt>Your stake returned</dt><dd>{number(fights?.coins.stakeReturned)}</dd></div><div><dt>Coins won from challenges</dt><dd>{number(fights?.coins.stakeWon)}</dd></div><div><dt>Bonus for beating bigger robots</dt><dd>{number(fights?.coins.houseBonus)}</dd></div><div><dt>Coins spent on challenges</dt><dd>{number(fights?.coins.stakeSpent)}</dd></div><div><dt>Total battle gain or loss</dt><dd>{number(fights?.coins.net)}</dd></div></dl><p className={css.small}>Your stake is the coins you put into a player challenge. Getting your own stake back is not a new reward.</p></section>
      <section className={css.card}><span className={css.eyebrow}>CURRENT COMPETITION</span><h3>Follow your trades</h3><p>{view?.trading.campaign.title ?? "Your competition totals will appear here."}</p><dl className={css.breakdown}><div><dt>Dollars that count</dt><dd>{dollars(view?.trading.campaign.countedUsd)}</dd></div><div><dt>Trade coins</dt><dd>{number(view?.trading.campaign.tradeCoins)}</dd></div><div><dt>Profit bonus coins</dt><dd>{number(view?.trading.campaign.roiBonusCoins)}</dd></div></dl>{view?.trading.campaign.startsAt && <p className={css.small}>From {date(view.trading.campaign.startsAt)}{view.trading.campaign.endsAt ? ` to ${date(view.trading.campaign.endsAt)}` : ""}.</p>}<p className={css.small}>These are game coins. Cash prizes have separate scores and rules.</p><a className={css.textButton} href="/bots/rules">Read the rules →</a></section>
    </div></div>
    <section className={css.card} aria-labelledby="battle-history-title"><div className={css.sectionHeading}><div><span className={css.eyebrow}>BACK IN THE RING</span><h3 id="battle-history-title">Your latest battles</h3></div><button className={css.smallButton} onClick={onFight}>Find a fight →</button></div>{fights?.recent.length ? <div className={css.history}>{fights.recent.map(b => <button className={css.battle} key={b.id} onClick={() => onWatch(b.id)}><span className={css.outcome} data-win={b.outcome === "win"}>{b.outcome === "win" ? "WIN" : b.outcome === "loss" ? "LOSS" : "FIGHT"}</span><span><strong>{b.botName} <small>vs</small> {b.opponentName}</strong><small>{date(b.createdAt)} · {b.mode === "pve" ? "Computer rival" : "Player challenge"}</small></span><span className={css.battleReward}>{total(b.rewardCoins, b.stakePayout) == null ? "—" : `${number(total(b.rewardCoins, b.stakePayout))} coins received`}<small>{b.stakePayout ? "Includes stake payout · " : ""}Watch replay →</small></span></button>)}</div> : <div className={css.empty}><span aria-hidden="true">⚑</span><strong>{!token ? "Your fight history belongs here." : fights?.source === "available" ? "Your first real fight is waiting." : "Fight history is not available yet."}</strong><p>{!token ? "Connect your wallet to keep your real fight results together." : fights?.source === "available" ? "Choose a computer rival. Your robot handles the fighting." : "We will show your results after they load."}</p></div>}</section>
  </div>;
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className={css.stat}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}
