import {fighterArtKey} from '../../../lib/bots/arcade/art';
import {LADDERS,opponent,type LadderRun} from '../../../lib/bots/arcade/ladder';
import css from './arcade-kombat.module.css';

/** The portraits use the same seeded opponent builds as the actual ladder. */
export default function ArcadeLadderMap({run,compact=false,label}:{run:LadderRun;compact?:boolean;label?:string}){
 const position=run.cleared?'Ladder cleared':run.lives===0?'Run ended':`Opponent ${run.stage+1} of 6`;
 return <section className={`${css.ladderMap} ${compact?css.ladderMapCompact:''}`} aria-label={`${LADDERS[run.tier-1].name} ladder progress`}>
  <div className={css.ladderMapHeading}><strong>{label??position}</strong><span className={css.lives} aria-label={`${run.lives} of 3 lives remaining`}><span aria-hidden="true">{[0,1,2].map(n=><i key={n} className={n<run.lives?css.lifeFull:css.lifeSpent}>{n<run.lives?'◆':'◇'}</i>)}</span><b>{run.lives}/3 lives</b></span></div>
  <ol className={css.ladderRoute}>{Array.from({length:6},(_,stage)=>{
   const rival=opponent({...run,stage}),done=stage<run.stage,current=stage===run.stage&&!run.cleared&&run.lives>0,boss=stage===5;
   const name=boss?(run.tier===4?'Sovereign · Overload':'The Sovereign'):rival.name;
   const status=done?'Defeated':current?'Up next':boss?'Final boss':'Upcoming';
   return <li key={stage} className={`${css.ladderStop} ${done?css.ladderDefeated:''} ${current?css.ladderCurrent:''} ${boss?css.ladderBoss:''}`} aria-current={current?'step':undefined} aria-label={`${stage+1}. ${rival.name}${boss?', final boss':''}. ${status}`} title={`${rival.name} · ${status}`}>
    <div className={css.ladderPortrait}><img src={`/bots-arcade/v1/${fighterArtKey(rival)}-jab-0.png`} alt=""/><span className={css.ladderBadge} aria-hidden="true">{done?'✓':boss?'★':stage+1}</span></div>
    <b>{name}</b><small>{status}</small>
   </li>;
  })}</ol>
 </section>;
}
