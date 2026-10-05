"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { defaultAppearance, preset, ENTRY_MAP } from "@/lib/bots/workshop8/catalogue";
import ConnectedModelRoom from "./ConnectedModelRoom";
import AnimatedFighter from "./AnimatedFighter";
import CompetitionPanel,{type useWorkshopCompetition} from './WorkshopCompetition';
import css from "./workshop-welcome.module.css";

export const WORKSHOP_INTRO_KEY = "mk8.welcome.3";
const styles = [
  { id: "tank", name: "Tank", line: "Take the hit. Hit back harder.", detail: "Heavy armour. Big hits. Slower feet." },
  { id: "speed", name: "Speed", line: "Get in. Strike. Get out.", detail: "Quick attacks. Fast feet. Lighter armour." },
  { id: "ranged", name: "Ranged", line: "Make space. Line up the shot.", detail: "Powerful shots. Needs room to aim." },
] as const;
const demo = { id: "welcome-demo-2", name: "Warden", choices: preset("tank", 3), appearance: defaultAppearance("warden"), rival: preset("speed", 3), seed: 75, arena: "colosseum", replay: true, inputs: [], startedAt: 0 };

export default function WorkshopWelcome({ gameEntry=false, hasRobots, hasDraft, coins, newPlayer, onBuild, onExplore, onTrading, music, connected=false, journeyPreview=false, competition }: { gameEntry?:boolean; competition?:ReturnType<typeof useWorkshopCompetition>; journeyPreview?:boolean; newPlayer: boolean; hasRobots: boolean; hasDraft: boolean; coins: number; onBuild(style?:'tank'|'speed'|'ranged'): void; onExplore(): void; onTrading(): void; music?:ReactNode; connected?:boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), [style, setStyle] = useState(0), [watching, setWatching] = useState(false),[prizes,setPrizes]=useState(false),[motionPaused,setMotionPaused]=useState(false);
  const fighter = styles[style];
  const example=journeyPreview?{...demo,id:`welcome-${fighter.id}`,demo:true,replay:false,choices:preset(fighter.id as 'tank'|'speed'|'ranged'),appearance:defaultAppearance(ENTRY_MAP.get(preset(fighter.id as 'tank'|'speed'|'ranged').torso)!.family),rival:preset(fighter.id==='tank'?'ranged':'tank')}:demo;
  useEffect(() => { const node=dialog.current, previous=document.activeElement as HTMLElement|null;node?.showModal();node?.querySelector<HTMLElement>('#welcome-title')?.focus({preventScroll:true});if(node)node.scrollTop=0;return()=>{node?.close();if(previous?.isConnected)previous.focus()}; }, []);
  return <dialog ref={dialog} className={css.dialog} aria-labelledby="welcome-title" onCancel={event=>{event.preventDefault();if(watching)setWatching(false);else onExplore()}}>
    {prizes&&competition?<section className={css.prizePage}><button onClick={()=>setPrizes(false)}>← Back to welcome</button><CompetitionPanel model={competition} onConnect={onExplore} onPlay={()=>onBuild(fighter.id)}/></section>:watching ? <section className={css.demo}>
      <header><div><span className={css.eyebrow}>{journeyPreview?`EXAMPLE FIGHT · ${fighter.name.toUpperCase()} STARTER`:'EXAMPLE FIGHT · TANK VS SPEED'}</span><h1 id="welcome-title" tabIndex={-1}>Meet your future fighters.</h1><p>Robots move and attack on their own. In your fights, you choose when to use your Special.</p></div><button onClick={()=>setWatching(false)}>← Back</button></header>
      <div className={css.arena}><ConnectedModelRoom view="practice" title="Example robot fight" payload={example}/></div>
      <footer><span>Watch these example robots, then build your own.</span><button className={css.primary} onClick={()=>onBuild(fighter.id)}>{hasDraft?"Continue my build":hasRobots?"Go to my garage":"Build my robot"} →</button></footer>
    </section> : <div className={css.layout}>
      <section className={css.showcase} aria-label="Meet the fighting styles">
        <div className={css.marquee}><span>MODEL</span><strong>KOMBAT</strong><small>A DOMA GAME</small></div>
        <div className={css.fighter}><AnimatedFighter key={fighter.id} style={fighter.id} paused={motionPaused}/><span className={css.example}>Style preview · upgraded equipment</span></div>
        <button className={css.motionToggle} onClick={()=>setMotionPaused(v=>!v)} aria-pressed={motionPaused}>{motionPaused?'Play motion':'Pause motion'}</button>
        <div className={css.personality}><h2>{fighter.line}</h2><p>{fighter.detail}</p></div>
        <div className={css.styles} aria-label="Preview a fighting style">{styles.map((item,index)=><button key={item.id} aria-pressed={index===style} onClick={()=>setStyle(index)}>{item.name}</button>)}</div>
        <small className={css.mix}>Start with a style. Mix parts to make it yours.</small>
      </section>
      <section className={css.copy}>
        <span className={css.eyebrow}>WELCOME TO MODEL KOMBAT</span>
        <h1 id="welcome-title" tabIndex={-1}>{gameEntry?<>Build your first robot.<br/><em>Make it yours.</em></>:<>Trade with Doma.<br/><em>Battle for fun.</em></>}</h1>
        <p className={css.pitch}>{gameEntry?"Pick Tank, Speed or Ranged. Start with a complete build, choose your name and colours, then try your first fight.":process.env.NEXT_PUBLIC_BOTS_TOKEN_ZONES==='1'?"Unlock shared token rewards initially valued at approximately $4,000. Set up trading, track your rank, and battle between trades.":"$2,000 in cash prizes. Set up trading, follow your rank, and take your robot into the ring between trades."}</p>{competition&&<button className={css.competitionEntry} onClick={()=>setPrizes(true)}>Token rewards competition · See status</button>}
        <ol className={css.steps}>{gameEntry?<>
          <li><span>01</span><div><strong>Choose your fighter.</strong><p>Tank takes the hits. Speed fights up close. Ranged needs room to shoot.</p></div></li>
          <li><span>02</span><div><strong>Name it. Paint it. Make it yours.</strong><p>Your 250 starter coins cover all seven parts. Review every choice before Finish.</p></div></li>
          <li><span>03</span><div><strong>Pick the moment for your Special.</strong><p>Your robot moves and attacks. You choose when to activate its special ability.</p></div></li>
        </>:<>
          <li><span>01</span><div><strong>Set up your trading.</strong><p>Use Doma Strategies or connect Doma tools to your AI app through MCP.</p></div></li>
          <li><span>02</span><div><strong>Track your results here.</strong><p>{process.env.NEXT_PUBLIC_BOTS_TOKEN_ZONES==='1'?'Volume unlocks shared rewards. Compete in volume, ROI, realized profit and battle points.':'Cash categories: $800 ROI · $800 realized profit · $400 battle points.'}</p></div></li>
          <li><span>03</span><div><strong>Build free. Battle between trades.</strong><p>Fights earn game coins for robot parts. Game coins are not cash.</p></div></li>
        </>}</ol>
        <div className={css.starter}><span aria-hidden>✦</span><div><strong>{hasRobots?"Your garage is waiting.":hasDraft?"Your build is saved. Pick up where you left off.":newPlayer?"Your first robot is on us.":"Ready for your next fighter?"}</strong><p>{hasRobots?"Keep building your crew, or take a robot back into the ring.":hasDraft?`${coins.toLocaleString()} game coins available. Your choices are still here.`:newPlayer?"Start with 250 game coins—enough to build your first robot.":`${coins.toLocaleString()} game coins available. Play more fights to earn parts for your next build.`}</p></div></div>
        <p className={css.requirement}><strong>Competition prizes require trading.</strong> {process.env.NEXT_PUBLIC_BOTS_TOKEN_ZONES==='1'?'Trade eligible domain-token pairs on three distinct UTC days in any one competition week, using verified Strategy or linked agent-wallet activity.':'Three verified Strategy trading days each week; both weeks for final prizes.'}</p>
        <div className={css.actions}>{gameEntry?<><button data-build-action className={css.primary} onClick={()=>onBuild(fighter.id)}>{hasDraft?"Continue my build":hasRobots?"Open my garage":"Build my robot"} →</button><button className={css.secondary} onClick={onTrading}>Trading & rewards</button></>:<><button className={css.primary} onClick={onTrading}>Set up trading & rewards →</button><button data-build-action className={css.secondary} onClick={()=>onBuild(fighter.id)}>{hasDraft?"Continue my build":hasRobots?"Open my garage":"Build a free robot"}</button></>}</div>
        <p className={css.trust}>{competition?.value.state==='draft'?'Coming soon. No start date. Prelaunch activity will not count.':'Check competition status before entering. Setup alone does not start scoring.'}</p>
        <p className={css.risk}>Trading uses real funds and can lose money. You can play free without trading.</p>
        <div className={css.faq}>
          <details><summary>What are game coins?</summary><p>Points you earn and spend inside this workshop. Use them for robot parts and faster repairs. They are not cryptocurrency, have no cash value, and cannot be withdrawn.</p></details>
          <details><summary>Where is my progress saved?</summary><p>{connected?'Your garage is saved to your wallet. Sign in with the same wallet on another device to continue.':journeyPreview?'Saved for this browser when you start building. Connect a wallet to open your garage on another device. Clearing this site’s browser data can remove access to an unlinked guest garage.':'On this device until you choose Save to wallet. Clearing this site’s saved data can erase an unsynced garage. Wallet saves become available when the server is ready.'}</p></details>
          <details><summary>What is Doma?</summary><p>Doma builds blockchain technology for internet domain names. Model Kombat combines a trading competition with robot battles. Free play needs no crypto; competition prizes require qualifying verified trading activity.</p></details>
        </div>
        <footer className={css.foot}><span>{connected?'Saved to your wallet.':journeyPreview?'Your garage saves when you start building.':'Progress saved on this device.'}</span>{music}<button onClick={onExplore}>Just look around →</button></footer>
      </section>
    </div>}
  </dialog>;
}
