"use client";

import { useState } from "react";
import { coinExample } from "@/lib/bots/coin-example";
import { STRATEGY_LINKS } from "@/lib/bots/strings";
import css from "./EarnDashboard.module.css";

export function CoinGuide() {
  const [dollars, setDollars] = useState("100"), [roi, setRoi] = useState("0");
  const example = coinExample(Number(dollars), Number(roi));
  return <section className={css.card} aria-labelledby="coin-guide-title">
    <span className={css.eyebrow}>HOW COINS WORK</span>
    <h3 id="coin-guide-title">$1 traded = 1 coin</h3>
    <p>Completed Doma Strategy trades earn coins. The limits below decide how many dollars count.</p>
    <div className={css.formula}><b>Trade coins + profit bonus = your coins</b><span>A positive return adds a bonus. The bonus is twice your return percentage, up to 100% extra.</span></div>
    <div className={css.examples} aria-label="Examples for 100 counted dollars">
      {[0, 10, 25, 50].map(n => <div key={n}><span>{n}% return</span><strong>{coinExample(100, n).total}</strong><small>coins per $100</small></div>)}
    </div>
    <p className={css.small}>A loss gives no bonus. It does not remove coins you already earned.</p>
    <details className={css.details}><summary>Try a coin example</summary>
      <div className={css.calculator}><label>Dollars that count<input type="number" min="0" max="100000000" step="1" value={dollars} onChange={e => setDollars(e.target.value)} /></label><label>Trading return (%)<input type="number" min="-100" max="10000" step="0.5" value={roi} onChange={e => setRoi(e.target.value)} /></label></div>
      <output className={css.result} aria-live="polite">{example.base.toLocaleString()} trade coins + {example.bonus.toLocaleString()} bonus = <strong>{example.total.toLocaleString()} coins</strong></output>
      <p className={css.small}>This example uses dollars left after the daily limits. Trade coins and bonus coins are each rounded to the nearest whole coin.</p>
    </details>
    <details className={css.details}><summary>Which dollars count?</summary>
      <ol><li>Use the same wallet here and on Doma. Only completed Strategy buys and sells after you join count.</li><li>Buy and sell the same token within 10 minutes? Only the larger trade counts.</li><li>Your daily limit is based on the wallet value recorded when you join, plus funds you add later. This starting amount is at least $50. Taking money out does not lower it.</li><li>Each token can count up to 3 times that amount per day. All tokens together can count up to 4 times that amount per day.</li></ol>
      <p>Example: with a $100 starting amount, one token can count up to $300 a day. Your total limit is $400 a day. The day starts at midnight UTC.</p>
      <p className={css.small}>The game values tokens using average prices. Your coin bonus uses profit from sold tokens and the current value of unsold tokens. The cash-prize return score only uses profit from sold tokens.</p>
    </details>
    <details className={css.details}><summary>When do coins arrive?</summary><p>We check completed trades before adding coins. Base coins usually arrive within 10 minutes after we find a trade. The profit bonus is added by the daily update.</p><p>Connecting your wallet lets us find your account. You earn trading coins after a Strategy completes a trade.</p></details>
    <div className={css.routes}><div><span className={css.badge}>DOMA STRATEGIES</span><p>Choose trading rules on Doma. Return here to see your trades and coins.</p><a className={css.button} href={STRATEGY_LINKS.doma} target="_blank" rel="noopener noreferrer">Open Doma ↗</a></div><div><span className={css.badge}>MCP · COMING SOON</span><p>MCP lets an AI app use Doma tools. Direct MCP trades will use this coin rule when support opens. They do not earn coins here yet.</p></div></div>
    <p className={css.small}>Trading uses real money and can lose money. Game coins cannot be exchanged for cash. Trading more does not win a cash prize.</p>
  </section>;
}

export function BattleCoinGuide() {
  return <section className={css.card}><span className={css.eyebrow}>IN THE RING</span><h3>Fights earn coins too</h3><p>Fight a computer rival to earn these coins:</p><table className={css.rewardTable}><thead><tr><th>Rival</th><th>You win</th><th>You lose</th></tr></thead><tbody>{[["Easy",10,3],["Medium",20,5],["Hard",40,8]].map(([label,win,loss])=><tr key={label}><th>{label}</th><td>{win} coins</td><td>{loss} coins</td></tr>)}</tbody></table><p className={css.small}>Practice gives no coins. Player challenges show their coin cost and payout before you start. Your own stake returned is shown separately from new rewards in your fight record.</p></section>;
}
