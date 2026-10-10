'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import QuickHelp from '../_game/QuickHelp';
import {emptyZoneView,type ZoneView} from '@/lib/bots/token-zones';
import {STRATEGY_LINKS} from '@/lib/bots/strings';
import {PLAY_ENTRY_URL} from '@/lib/bots/workshop8/entry';
import css from './landing.module.css';
const Wallet=dynamic(()=>import('../_game/WorkshopWalletConnect'),{ssr:false,loading:()=> <p role="status">Opening wallet sign-in…</p>});
const SESSION='mk8.wallet-session.v1',GUIDE='mk.trading-guide.2',DOC='https://docs.doma.xyz/agentic-commerce/mcp-server';
type Method='strategy'|'mcp';
function credential():string{try{const s=JSON.parse(sessionStorage.getItem(SESSION)||'null');return typeof s?.token==='string'?s.token:''}catch{return ''}}
function auth(token:string):Record<string,string>{return token?{Authorization:`Bearer ${token}`}:{}}
function statusFailure(kind:'auth'|'identity'|'unavailable'){return Object.assign(new Error(),{kind})}
function failureText(error:unknown){const kind=(error as {kind?:string})?.kind;return kind==='auth'?'Sign in again to check your progress.':kind==='identity'?'Your wallet changed. Check its status before continuing.':(error as Error)?.name==='AbortError'?'The connection is slow. Please retry.':'Could not check progress. Please retry.'}
function statusText(v:ZoneView){if(!v.available)return 'Competition status unavailable';if(v.state==='draft')return v.startsAt?`Opens ${new Date(v.startsAt).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}`:'Start date to be announced';if(v.state==='active')return v.endsAt?`Ends ${new Date(v.endsAt).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}`:'Competition open';return v.state==='frozen'?'Final results':'Competition closed · checking results';}
export default function Landing(){
 const [view,setView]=useState<ZoneView>(emptyZoneView),[loading,setLoading]=useState(true),[error,setError]=useState(''),[authExpired,setAuthExpired]=useState(false),[guide,setGuide]=useState(false),[guideReady,setGuideReady]=useState(false),[step,setStep]=useState(1),[method,setMethod]=useState<Method|null>(null),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false);
 const headline=useRef<HTMLHeadingElement>(null),requestId=useRef(0),alive=useRef(true),controller=useRef<AbortController|null>(null),identity=useRef<string|null>(null),confirmedIdentity=useRef<string|null>(null),entering=useRef(false);
 const clearPersonal=useCallback(()=>{confirmedIdentity.current=null;setView(v=>({...v,personal:null}))},[]);
 const refresh=useCallback(async()=>{
  if(entering.current)return false;
  const token=credential(),id=++requestId.current;
  if(identity.current!==token){identity.current=token;clearPersonal()}
  controller.current?.abort();const c=new AbortController();controller.current=c;const timeout=setTimeout(()=>c.abort(),12000);setLoading(true);setError('');
  try{
   const r=await fetch('/api/bots/campaign/zones',{headers:auth(token),cache:'no-store',signal:c.signal});if(!r.ok)throw statusFailure(r.status===401?'auth':'unavailable');
   const v=await r.json();if(v.schemaVersion!==1)throw statusFailure('unavailable');
   if(!alive.current||id!==requestId.current)return false;
   if(credential()!==token)throw statusFailure('identity');
   // The public endpoint may return an anonymous 200 for an expired bearer.
   if(token&&v.available&&!v.personal?.connected)throw statusFailure('auth');
   confirmedIdentity.current=token;setView({...v,personal:token?v.personal:null});setAuthExpired(false);return true;
  }catch(e){if(alive.current&&id===requestId.current){clearPersonal();setAuthExpired((e as {kind?:string})?.kind==='auth');setError(failureText(e))}return false}
  finally{clearTimeout(timeout);if(alive.current&&id===requestId.current)setLoading(false)}
 },[clearPersonal]);
 useEffect(()=>{alive.current=true;try{const s=JSON.parse(localStorage.getItem(GUIDE)||'null');if([1,2,3].includes(s?.step))setStep(s.step);if(['strategy','mcp'].includes(s?.method))setMethod(s.method)}catch{}setGuideReady(true);const sync=()=>setGuide(new URL(location.href).searchParams.get('setup')==='1'||location.hash==='#steps'||location.hash==='#mcp-setup');sync();window.addEventListener('popstate',sync);void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh()},60000);return()=>{alive.current=false;controller.current?.abort();clearInterval(timer);window.removeEventListener('popstate',sync)}},[refresh]);
 useEffect(()=>{if(!guideReady)return;try{localStorage.setItem(GUIDE,JSON.stringify({step,method}))}catch{}},[step,method,guideReady]);
 useEffect(()=>{if(guide)headline.current?.focus({preventScroll:true})},[step,method,guide]);
 const p=view.personal,connected=!!p?.connected,linked=p?.linkStatus==='linked';
 function openGuide(){setStep(p?.entered?3:connected?Math.max(2,step):1);setGuide(true);const u=new URL(location.href);u.searchParams.set('setup','1');u.hash='';history.pushState(null,'',u.pathname+u.search)}
 function closeGuide(){setGuide(false);const u=new URL(location.href);u.searchParams.delete('setup');u.hash='';history.replaceState(null,'',u.pathname+u.search)}
 async function signedIn(token:string,address:string){try{sessionStorage.setItem(SESSION,JSON.stringify({token,address}))}catch{setError('Browser storage is blocked. Allow site storage, then sign in again.');return}clearPersonal();if(await refresh())setStep(2)}
 async function enter(){
  if(entering.current||loading||error)return;
  const token=credential();if(!token||confirmedIdentity.current!==token){clearPersonal();setError('Your wallet changed. Check its status before continuing.');return}
  if(!view.available||view.state!=='active'||!p?.connected||!linked||p.entered)return;
  entering.current=true;setBusy(true);setError('');const id=++requestId.current,c=new AbortController();controller.current?.abort();controller.current=c;const timeout=setTimeout(()=>c.abort(),12000);
  try{
   const r=await fetch('/api/bots/campaign/zones',{method:'POST',headers:auth(token),signal:c.signal}),v=await r.json();if(!r.ok||v.zones?.schemaVersion!==1)throw statusFailure(r.status===401?'auth':'unavailable');
   if(!alive.current||id!==requestId.current)return;if(credential()!==token)throw statusFailure('identity');
   if(!v.zones.personal?.connected)throw statusFailure('auth');confirmedIdentity.current=token;setView(v.zones);setAuthExpired(false);
  }catch(e){if(alive.current&&id===requestId.current){clearPersonal();setAuthExpired((e as {kind?:string})?.kind==='auth');setError((e as {kind?:string})?.kind==='auth'||(e as {kind?:string})?.kind==='identity'?failureText(e):'Entry could not be confirmed. Refresh your status before trading for points.')}}
  finally{clearTimeout(timeout);entering.current=false;if(alive.current)setBusy(false)}
 }
 const awaitingEntry=view.available&&connected&&!p?.entered&&view.state==='active';
 const needsLink=awaitingEntry&&!linked&&p?.linkStatus!=='unavailable';
 const canTrade=!loading&&!error&&view.available&&view.state==='active'&&connected&&!!p?.entered;
 const tracking=error||!view.available?'Account status unavailable':!connected?'Sign in to check your account':view.state==='closed'||view.state==='frozen'?'Entry is closed':p?.entered?'You’re entered':view.state==='draft'?'Competition not open':p?.linkStatus==='unavailable'?'Wallet link needs a retry':!linked?'Not entered yet':'Ready to enter';
 const trackingDescription=error||!view.available?'We couldn’t confirm your entry. Check again before trading for rewards.':!connected?'Sign in to check your competition entry.':view.state==='closed'||view.state==='frozen'?'Trading has ended. View the competition results.':p?.entered?'Use Doma Strategies or MCP.':view.state==='draft'?'Your setup is saved. You can enter when the competition opens.':p?.linkStatus==='unavailable'?'We couldn’t check your Doma wallet link. Please retry.':p?.linkStatus==='not_found'?'We haven’t found your Doma account. Check that this wallet is linked in Doma. We recheck every 4 hours.':!linked?'We’re linking your Doma wallets. Checks run every 4 hours.':'Your Doma wallet is linked. Click below to join.';
 return <main className={css.page}>
  <header className={css.nav}><Link href="/bots/start" className={css.brand} onClick={e=>{if(!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();closeGuide()}}}>MODEL <b>KOMBAT</b></Link><nav aria-label="Main navigation"><Link href="/bots/leaderboard">Rewards</Link><QuickHelp topic={guide?'trading':'home'}/></nav></header>
  {!guide?<>
   <section className={css.hero} aria-labelledby="home-title"><div className={css.heroCopy}><p className={css.eyebrow}>THE DOMA COMMUNITY CHALLENGE</p><h1 id="home-title">Trade with bots.<br/><em>Climb the ranks.</em></h1><p className={css.lead}>Trade together to unlock token prizes initially worth up to <strong>$4,000.</strong></p><div className={css.actions}><button className={css.primary} onClick={openGuide}>{p?.entered?'My competition status':connected?'Continue trading setup':'Join trading competition'} <span aria-hidden>→</span></button><Link className={css.secondary} href={PLAY_ENTRY_URL}>Play mini-games <span aria-hidden>↗</span></Link></div><p className={css.risk}>Trade on 3 days in one competition week to qualify. Trading can lose money.</p><p className={css.status} role="status">{loading&&!view.available?'Checking competition status…':statusText(view)}</p></div><div className={css.heroArt} aria-hidden="true"><div className={css.orbit}/><img className={css.backFighter} src="/bots-arcade/v1/speed-jab-0.png" alt=""/><img className={css.frontFighter} src="/bots-arcade/v1/tank-jab-0.png" alt=""/><span className={css.artTag}>YOUR NEXT CHALLENGE</span></div></section>
   <ol className={css.steps} aria-label="How it works"><li><span>01</span><div><h2>Connect your wallet</h2><p>Trade with Doma Strategies or MCP.</p></div></li><li><span>02</span><div><h2>Track trades &amp; rewards</h2><p>Follow your progress and rank.</p></div></li><li><span>03</span><div><h2>Play mini-games</h2><p>Build robots or play the arcade.</p></div></li></ol>
   <section className={css.payout} aria-labelledby="payout-title">
    <div className={css.payoutHeader}><h2 id="payout-title">How rewards are split</h2><Link href="/bots/leaderboard">Reward details →</Link></div>
    <ul className={css.payoutShares}>
     <li><strong>60%</strong><div><h3>Trading volume</h3><p>Top 3 + other qualifying traders</p></div></li>
     <li><strong>15%</strong><div><h3>Trading profit ($)</h3><p>Top 3</p></div></li>
     <li><strong>15%</strong><div><h3>Return (ROI %)</h3><p>Top 3</p></div></li>
     <li><strong>10%</strong><div><h3>Robot battle points</h3><p>Top 3</p></div></li>
    </ul>
    <p className={css.payoutNote}>Shares of the unlocked prize pool. Trading is required for every prize.</p>
   </section>
   {p&&<aside className={css.returning}><div><small>Your account</small><strong>{tracking}</strong></div><div><small>Verified volume</small><strong>{p.volumeUsd===null?'Pending':`$${Number(p.volumeUsd).toLocaleString(undefined,{maximumFractionDigits:2})}`}</strong></div>{awaitingEntry?<button className={css.textButton} onClick={()=>{openGuide();setStep(3)}}>Continue entry →</button>:<Link href="/bots/leaderboard">{p.entered?'My rewards →':'View competition →'}</Link>}</aside>}
  </>:<section className={css.guide} aria-labelledby="guide-title">
   <div className={css.guideTop}><button className={css.textButton} onClick={()=>step===1?closeGuide():step===2&&method?setMethod(null):setStep(step-1)}>← Back</button><span>Trading setup · {step} of 3</span><button className={css.textButton} onClick={closeGuide}>Close</button></div><div className={css.progress} aria-hidden="true">{[1,2,3].map(n=><span key={n} data-done={n<=step}/>)}</div>
   <h1 id="guide-title" ref={headline} tabIndex={-1}>{step===1?'Connect your wallet.':step===2?!method?'How do you want to trade?':method==='strategy'?'Set up a Strategy.':'Connect Doma to your AI.':canTrade?'You’re entered':'Your competition entry.'}</h1>
   {step===1?<div className={css.signIn}>{connected?<><p>Your wallet is saved.</p><button className={css.primary} onClick={()=>setStep(2)}>Continue →</button></>:<><Wallet onConnected={(token,address)=>void signedIn(token,address)}/></>}</div>:step===2?!method?<div className={css.methods}><button onClick={()=>setMethod('strategy')}><span className={css.methodIcon} aria-hidden>↗</span><h2>Doma Strategies</h2><p>Set rules. Let Doma trade for you.</p><strong>Choose Strategies →</strong></button><button onClick={()=>setMethod('mcp')}><span className={css.methodIcon} aria-hidden>✦</span><h2>Doma MCP</h2><p>Tell your AI how to trade.</p><strong>Choose MCP →</strong></button></div>:<div className={css.methodDetail}>
    <p>{method==='strategy'?'Open Doma, choose a strategy and review your budget.':'Add Doma to your AI app. When trading, sign in and set a spending limit.'}</p>
    <p className={css.small}>{canTrade?'You’re entered. You can trade now.':'Return here to enter the competition before your first scored trade.'}</p>
    {method==='mcp'&&<div className={css.copyField}><code>{STRATEGY_LINKS.mcp}</code><button onClick={async()=>{try{await navigator.clipboard.writeText(STRATEGY_LINKS.mcp);setCopied(true)}catch{setError('Copy the connector address shown above.')}}}>{copied?'Copied':'Copy URL'}</button></div>}
    <a className={css.primary} href={method==='strategy'?STRATEGY_LINKS.doma:`${DOC}/connect`} target="_blank" rel="noopener noreferrer">{method==='strategy'?'Open Doma Strategies ↗':'Open connection guide ↗'}</a><p className={css.small}>Trade Doma domain tokens. ETH/USDC pairs don’t count.</p>
    <details className={css.details}><summary>Need a hand?</summary><ol>{(method==='strategy'?['Sign in to Doma with the same account.','Choose your domain token and trading rules.','Review the budget and permissions in Doma.']:['Open your AI app’s connector settings.','Add the Doma MCP URL above.','Before trading, complete Doma authorization and set your spending limit.']).map((t,i)=><li key={t}><b>{i+1}</b>{t}</li>)}</ol><a href={method==='strategy'?'https://app.doma.xyz/help#help-category-trade':`${DOC}/authorization`} target="_blank" rel="noopener noreferrer">{method==='strategy'?'All Doma trading guides ↗':'Full Doma guide ↗'}</a></details><button className={css.secondary} onClick={()=>{setStep(3);void refresh()}}>Check my status →</button>
   </div>:<div className={css.tracking}><span className={css.trackingIcon} aria-hidden>{p?.entered?'✓':'◷'}</span><h2 aria-live="polite">{canTrade?'Start trading now.':loading?'Checking your account…':tracking}</h2>{!loading&&<><p>{trackingDescription}</p>{awaitingEntry&&!error&&<p className={css.entryNotice}>{needsLink?'When ready, return here and click Enter competition. Earlier trades won’t count.':'Only eligible trades made after you enter count.'}</p>}</>}
    {canTrade?<div className={css.tradeActions}><div><a className={css.primary} href={STRATEGY_LINKS.doma} target="_blank" rel="noopener noreferrer">Open Doma Strategies ↗</a><a className={css.tradeHelp} href="https://app.doma.xyz/help#help-category-trade" target="_blank" rel="noopener noreferrer">Strategy help ↗</a></div><div><a className={css.primary} href={`${DOC}/connect`} target="_blank" rel="noopener noreferrer">MCP setup help ↗</a><small>Already connected? Trade in your AI app.</small></div></div>:loading?<button className={css.primary} disabled>Checking status…</button>:authExpired?<button className={css.primary} onClick={()=>{setStep(1);setError('')}}>Sign in again →</button>:error||!view.available||p?.linkStatus==='unavailable'?<button className={css.primary} onClick={()=>void refresh()}>Check status again →</button>:awaitingEntry&&linked?<button className={css.primary} disabled={busy} onClick={()=>void enter()}>{busy?'Saving entry…':'Enter competition →'}</button>:!connected?<button className={css.primary} onClick={()=>setStep(1)}>Sign in →</button>:needsLink?<button className={css.primary} onClick={()=>void refresh()}>Check linking status →</button>:<Link className={css.primary} href="/bots/leaderboard">{p?.entered?'View my rewards →':'View competition →'}</Link>}{canTrade?<Link className={css.rewardsLink} href="/bots/leaderboard">View my rewards →</Link>:needsLink?<Link className={css.textButton} href="/bots/leaderboard">View competition →</Link>:<button className={css.textButton} disabled={loading||busy} onClick={()=>void refresh()}>Refresh status</button>}<details className={css.details}><summary>Reward rules &amp; updates</summary>{canTrade&&<button className={css.textButton} disabled={loading||busy} onClick={()=>void refresh()}>Refresh status</button>}<p>Enter first, then trade Doma domain tokens through Strategies or your linked Doma AI wallet. ETH/USDC trades don’t count. Trade on 3 separate UTC days in one competition week to qualify for any token prize, including battle prizes.</p><Link href="/bots/rules">Competition rules →</Link><p>Wallet linking is checked every 4 hours. This page refreshes your status once a minute while visible. After entry, trade verification runs about every 15 minutes; new wallet links and Strategy updates may take longer.</p></details>
   </div>}
  </section>}
  {error&&<div className={css.error} role="alert">{error}<button onClick={()=>void refresh()}>Retry</button></div>}<footer className={css.footer}><span>A community game by @sdmike</span><Link href="/bots/rules">Rules</Link><Link href="/bots/terms">Terms</Link><Link href="/bots/privacy">Privacy</Link><a href="https://discord.gg/doma" target="_blank" rel="noopener noreferrer">Discord ↗</a><a href="https://x.com/sdmikecm" target="_blank" rel="noopener noreferrer">X ↗</a></footer>
 </main>;
}
