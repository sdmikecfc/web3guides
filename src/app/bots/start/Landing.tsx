'use client';
import {useEffect,useState} from 'react';
import dynamic from 'next/dynamic';
import AnimatedFighter from '../_game/AnimatedFighter';
import EntryDialog from '../_game/EntryDialog';
import {emptyZoneView,type ZoneView} from '@/lib/bots/token-zones';
import {STRATEGY_LINKS} from '@/lib/bots/strings';
import {PLAY_ENTRY_URL} from '@/lib/bots/workshop8/entry';
import css from './landing.module.css';
const Wallet=dynamic(()=>import('../_game/WorkshopWalletConnect'),{ssr:false});
const DOC='https://docs.doma.xyz/agentic-commerce/mcp-server';
export default function Landing(){
 const [connect,setConnect]=useState(false),[address,setAddress]=useState(''),[copied,setCopied]=useState(false),[copyError,setCopyError]=useState(false);
 useEffect(()=>{try{setAddress(JSON.parse(sessionStorage.getItem('mk8.wallet-session.v1')||'null')?.address||'')}catch{}},[]);
 const [v,setV]=useState<ZoneView>(emptyZoneView); useEffect(()=>{void fetch('/api/bots/campaign/zones',{cache:'no-store'}).then(r=>r.json()).then(setV).catch(()=>setV(emptyZoneView()))},[]);
 const status=v.state==='draft'?'Coming soon':!v.available?'Status unavailable':v.state==='active'?'See entry & eligibility':'Competition closed';
 const signIn=(token:string,wallet:string)=>{sessionStorage.setItem('mk8.wallet-session.v1',JSON.stringify({token,address:wallet}));setAddress(wallet);setConnect(false)};
 return <main className={css.page}>
  <header className={css.nav}><a href='/bots/start' className={css.brand}>MODEL <b>KOMBAT</b><small>A DOMA GAME</small></a><nav aria-label='Main navigation'><a href='#steps'>How it works</a><a href='/bots/leaderboard'>Leaderboards</a><button onClick={()=>setConnect(true)}>{address?`${address.slice(0,6)}…${address.slice(-4)}`:'Connect wallet'}</button></nav></header>
  <section className={css.launchHero}><div><p className={css.eyebrow}>THE DOMA BOT-TRADING COMPETITION</p><h1>Trade with bots.<br/><em>Unlock nine token zones.</em></h1><p className={css.lead}>Connect your Doma wallet. Set up domain-token trading.<br/>Follow your rank. Battle robots while your bots work.</p><div className={css.prizeChips} aria-label='Prize categories'><span><b>60%</b> Volume</span><span><b>15%</b> ROI %</span><span><b>15%</b> Profit $</span><span><b>10%</b> Battles</span></div></div><div className={css.launchArt}><AnimatedFighter style='tank'/><span>Trade. Track. Take a battle break.</span></div></section>
  <div className={css.launchStatus} role='status'><strong>{status}</strong><span>{v.state==='draft'?'Start date to be announced. Prelaunch trades and fights do not count.':!v.available?'We cannot confirm competition status yet.':'Check your entry and verified eligibility before competing.'}</span><a href='/bots/rules'>Prize rules ↗</a></div>
  <section id='steps' className={css.quickSteps} aria-label='Get started in four steps'>
   <article className={css.firstStep}><span className={css.stepLabel}>01 · START HERE</span><h2>Connect your wallet.</h2><p>Use your Doma wallet. We’ll match the MCP wallet linked to your account.</p><button className={css.primary} onClick={()=>setConnect(true)}>{address?'Connected · Manage wallet':'Connect Doma wallet →'}</button><small>A sign-in message. No spending approval.</small></article>
   <article><span className={css.stepLabel}>02 · PUT YOUR BOT TO WORK</span><h2>Set up trading.</h2><p>Trade any verified domain-token/USDC or domain-token/ETH pair with a Doma Strategy or your linked agent wallet.</p><a className={css.stepAction} href={STRATEGY_LINKS.doma} target='_blank' rel='noopener noreferrer'>Open Doma Strategies ↗</a><a className={css.textAction} href='#mcp-setup'>Use MCP instead ↓</a><small>You choose the budget. Trading can lose money.</small></article>
   <article><span className={css.stepLabel}>03 · WATCH YOUR PROGRESS</span><h2>Check your rank.</h2><p>Your volume, return, realized profit and battle points. Four leaderboards and nine shared token unlocks.</p><a className={css.stepAction} href='/bots/leaderboard'>View rewards & ranks →</a><small>{v.state==='draft'?'Scoring has not started.':address?'Check verified results and eligibility.':'Connect to check your personal status.'} Verified eligible volume advances the shared reward zones.</small></article>
   <article className={css.gameStep}><span className={css.stepLabel}>04 · TAKE A BATTLE BREAK</span><h2>Build. Battle. Repeat.</h2><p>Your first robot is free. Fight for game coins and build your next fighter.</p><a className={css.stepAction} href={PLAY_ENTRY_URL}>Play · Build your robot →</a><small>250 starter game coins. No trading needed to play. Game coins are not cash.</small></article>
  </section>
  <p className={css.eligibility}><strong>For any cash prize:</strong> verified MCP/agent-wallet or Strategy trades on three distinct UTC days in any one of four competition weeks. Connection alone does not qualify. Prizes are not guaranteed.</p>
  <section id='mcp-setup' className={css.setupDetails} aria-labelledby='mcp-heading'><div><span className={css.stepLabel}>NEED THE MCP CONNECTION?</span><h2 id='mcp-heading'>Add Doma to your AI app.</h2><p>Paste this URL into its MCP connector settings. Sign in to Doma, choose your budget and review permissions before trading.</p></div><div><code>{STRATEGY_LINKS.mcp}</code><button onClick={async()=>{try{await navigator.clipboard.writeText(STRATEGY_LINKS.mcp);setCopied(true);setCopyError(false)}catch{setCopyError(true)}}}>{copied?'Copied!':'Copy MCP URL'}</button>{copyError&&<small role='status'>Copy the address shown above.</small>}<div className={css.links}><a href={`${DOC}/connect`} target='_blank' rel='noopener noreferrer'>Connection guide ↗</a><a href={`${DOC}/authorization`} target='_blank' rel='noopener noreferrer'>Budgets & permissions ↗</a><a href="https://app.doma.xyz/help/strategies-custom-trading-through-mcp" target="_blank" rel="noopener noreferrer">Strategy guide ↗</a></div></div></section>
  <footer className={css.footer}><span>MODEL KOMBAT · A DOMA GAME</span><a href='/bots/rules'>Competition rules</a><a href='/bots/privacy'>Privacy</a><a href='/bots/terms'>Terms</a></footer>
  {connect&&<EntryDialog title='One wallet. Your progress.' onClose={()=>setConnect(false)}><Wallet onConnected={signIn}/></EntryDialog>}
 </main>
}
