"use client";
import { useRef, useState } from 'react';
import { STRATEGY_LINKS } from '@/lib/bots/strings';
import type { useWorkshopCompetition } from './WorkshopCompetition';
import css from './workshop-trading.module.css';

type Model=ReturnType<typeof useWorkshopCompetition>;
const money=(n:number|null)=>n===null?'Not available':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const rank=(n:number|null)=>n===null?'Rank not available':`#${n} · provisional`;
export function TradingBar({model,onOpen}:{model:Model;onOpen:()=>void}){
 const v=model.value,draft=v.state==='draft',known=v.available&&v.connected;
 return <aside className={css.bar} aria-label="Trading and competition summary">
  <button className={css.barAction} onClick={onOpen}>Trading & rewards <span>↗</span></button>
  <span>{draft?'$2,000 · Coming soon':!v.available?'$2,000 · Status unavailable':v.enrollment==='entered'?'Competition entered':'Not entered'}</span>
  <span>ROI <b>{known&&v.categories.roi.score!==null?`${v.categories.roi.score.toFixed(2)}%`:'—'}</b></span>
  <span>Profit <b>{known&&v.categories.profit.score!==null?money(v.categories.profit.score):'—'}</b></span>
  <span className={css.barRank}>Rank <b>{known&&v.categories.roi.rank!==null?`#${v.categories.roi.rank}*`:'—'}</b></span>
  <small>{draft?'Scoring has not started':!known?'Connect to check your stats':'* Provisional · See all stats'}</small>
 </aside>;
}

export default function WorkshopTrading({model,onConnect,onPlay,onRules}:{model:Model;onConnect:()=>void;onPlay:()=>void;onRules:()=>void}){
 const [method,setMethod]=useState<'strategy'|'mcp'>('strategy'),[copied,setCopied]=useState(false),[copyError,setCopyError]=useState(false);
 const setupRef=useRef<HTMLElement>(null);
 const v=model.value,draft=v.state==='draft',known=v.available&&v.connected;
 const copy=async()=>{try{await navigator.clipboard.writeText(STRATEGY_LINKS.mcp);setCopied(true);setCopyError(false)}catch{setCopyError(true)}};
 return <section className={css.hub} aria-label="Trading and rewards">
  <header className={css.hero}><div><span>DOMA TRADING × MODEL KOMBAT</span><h1>Trade. Track. Take a battle break.</h1><p>Set up Doma Strategies. Follow your return and profit here. Build and battle robots between trades.</p></div><button onClick={onRules}><strong>$2,000</strong><span>Cash prize pool · {draft?'Coming soon':'See status & rules'} →</span></button></header>
  <p className={css.state}>{draft?'Start date to be announced. You can set up now; prelaunch trades and fights will not count.':!v.available?'Competition data is unavailable. Setup does not confirm entry or rewards.':v.enrollment==='entered'?'You are entered. Verified activity determines eligibility and scores.':'You are not entered. Connect your wallet and enter when the competition is open.'}</p>
  <div className={css.quickActions}><a className={css.primary} href={STRATEGY_LINKS.doma} target="_blank" rel="noopener noreferrer">Set up Strategy ↗</a><button onClick={()=>{setMethod('mcp');setupRef.current?.scrollIntoView({block:'start'})}}>AI / MCP setup</button></div>
  <div className={css.stats} aria-label="Your verified competition stats">
   <article><span>Trading return · ROI</span><strong>{known&&v.categories.roi.score!==null?`${v.categories.roi.score.toFixed(2)}%`:draft?'Not started':'Not available'}</strong><small>{rank(known?v.categories.roi.rank:null)} · $800 category</small></article>
   <article><span>Realized profit</span><strong>{draft?'Not started':money(known?v.categories.profit.score:null)}</strong><small>{rank(known?v.categories.profit.rank:null)} · $800 category</small></article>
   <article><span>Battle points</span><strong>{draft?'Not started':known&&v.points!==null?v.points:'Not available'}</strong><small>{rank(known?v.categories.battles.rank:null)} · $400 category</small></article>
  </div>
  <div className={css.setup}>
   <section><span className={css.step}>01 · LINK YOUR RESULTS</span><h2>{v.connected?'Wallet connected':'Connect your wallet'}</h2><p>Use the same wallet here and on Doma so your trading results can be matched.</p><button onClick={onConnect}>{v.connected?'Wallet & saved garages':'Connect wallet'}</button><small>Wallet connection, trading setup and competition entry are separate.</small></section>
   <section ref={setupRef}><span className={css.step}>02 · SET UP TRADING</span><div className={css.methods} aria-label="Trading setup method"><button aria-pressed={method==='strategy'} onClick={()=>setMethod('strategy')}>Strategies</button><button aria-pressed={method==='mcp'} onClick={()=>setMethod('mcp')}>AI / MCP</button></div>
    {method==='strategy'?<><h2>Let a Strategy follow your rules.</h2><p>Choose the tokens, budget and buy/sell rules on Doma. Return here to check your verified results.</p><a className={css.primary} href={STRATEGY_LINKS.doma} target="_blank" rel="noopener noreferrer">Set up a Doma Strategy ↗</a></>:<><h2>Use Doma tools in your AI app.</h2><p>MCP connects your AI app to Doma. Add this address in the app’s MCP settings, then review its trading setup and permissions.</p><label>MCP server address<input readOnly value={STRATEGY_LINKS.mcp} onFocus={e=>e.target.select()}/></label><button onClick={()=>void copy()}>{copied?'Address copied':'Copy MCP address'}</button>{copyError&&<small role="status">Select and copy the address above.</small>}<strong className={css.pending}>Direct MCP trade scoring: not available yet.</strong><small>The current cash-prize rules require verified Strategy activity. Connecting MCP alone does not qualify.</small></>}
    <small>Trading uses real funds and can lose money. Opening setup does not turn trading on.</small>
   </section>
   <section><span className={css.step}>03 · CHECK YOUR PROGRESS</span><h2>{draft?'Be ready for opening.':'Stay eligible. Track your rank.'}</h2><p>All cash categories require Strategy trades on three distinct days each week. Qualify in both weeks for the final.</p><div className={css.days}>{v.weeks.map((w,i)=><span key={i}>Week {i+1}<b>{draft?'Not started':w.days===null?'Not verified':`${w.days}/3 days`}</b></span>)}</div><button disabled={model.loading} onClick={()=>v.nextAction==='enroll'?void model.enroll():void model.refresh()}>{v.nextAction==='enroll'?'Enter competition':model.loading?'Checking…':'Refresh my status'}</button>{model.error&&<small role="alert">{model.error}</small>}<small>Rank follows ROI, realized profit or battle wins—not trading volume. Prizes are not guaranteed.</small></section>
  </div>
  <div className={css.play}><div><h2>Your robot is the fun part.</h2><p>No trading budget? Build free, fight for game coins and share your best battles. Cash prizes still require trading eligibility.</p></div><button onClick={onPlay}>Build or battle →</button></div>
 </section>;
}
