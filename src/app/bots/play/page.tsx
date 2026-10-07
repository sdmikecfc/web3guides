import Link from 'next/link';
import QuickHelp from '../_game/QuickHelp';
import {ARCADE_ENTRY_URL,BUILD_ENTRY_URL} from '@/lib/bots/workshop8/entry';
import css from './play.module.css';
import {modelKombatMetadata} from '@/lib/bots/social-metadata';

export const metadata=modelKombatMetadata('/bots/play','Choose your fight · Model Kombat','Take control in Arcade, or build a robot for automatic battles. Two ways to play, free to start.','games');

export default function PlayPage(){return <main className={css.page}>
 <header className={css.nav}><Link className={css.brand} href="/bots/start">MODEL <b>KOMBAT</b></Link><nav aria-label="Game navigation"><Link href="/bots/leaderboard">Rewards</Link><QuickHelp topic="play"/></nav></header>
 <div className={css.intro}><p>THE MACHINES ARE READY.</p><h1>Choose your kind of fight.</h1><span>Two games. Free to start. No wallet needed.</span></div>
 <section className={css.games} aria-label="Choose your game">
  <article className={`${css.game} ${css.arcade}`} aria-labelledby="arcade-title">
   <div className={css.visual}>
    <div className={css.wordmark}><span className={css.tag}>01 / YOU CONTROL</span><h2 id="arcade-title"><span>ARCADE</span><span>FIGHTING</span></h2></div>
    <img className={css.arcadeFighter} src="/bots-arcade/v1/speed-jab-0.png" width="367" height="441" alt="Blue and ivory cartoon fighter with fists raised"/>
    <span className={css.artCaption}>MOVE · FIGHT · COMBO</span>
   </div>
   <div className={css.copy}><p>Six rivals. Three lives. One boss. Move, jump and land combos to climb the ladder.</p><small>Free to play · No coins or prize points</small><Link className={css.playButton} prefetch={false} href={ARCADE_ENTRY_URL}>PLAY ARCADE <span aria-hidden="true">↗</span></Link></div>
  </article>
  <article className={`${css.game} ${css.build}`} aria-labelledby="build-title">
   <div className={css.visual}>
    <div className={css.wordmark}><span className={css.tag}>02 / YOU BUILD</span><h2 id="build-title"><span>BUILD</span><span>&amp; BATTLE</span></h2></div>
    <img className={css.builderFighter} src="/bots-playtest/intro/tank.png" width="560" height="660" alt="Customizable teal robot holding its warhammer on a garage stand"/>
    <span className={css.artCaption}>ASSEMBLE · PERSONALIZE · WIN</span>
   </div>
   <div className={css.copy}><p>Build your robot. Fight for coins. Upgrade its parts or build another. In battle, you time its Special.</p><small>First robot free · Room for five in your garage</small><Link className={css.playButton} prefetch={false} href={BUILD_ENTRY_URL}>BUILD MY ROBOT <span aria-hidden="true">↗</span></Link></div>
  </article>
 </section>
 <footer className={css.footer}><Link className={css.garage} prefetch={false} href="/bots/workshop?view=garage">My garage <span aria-hidden="true">→</span></Link><p>Want token prizes? Automatic battle wins can earn points. You must also qualify through trading. <Link href="/bots/rules">How prizes work ↗</Link></p></footer>
 </main>}
