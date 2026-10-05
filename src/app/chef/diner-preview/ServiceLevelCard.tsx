import type { DinerState } from '@/lib/chef/diner/progression';
import { serviceLevelProgress, unlockedTruckHelpers } from '@/lib/chef/diner/service-level';
import { DinerIcon } from './DinerIcon';
import css from './diner.module.css';

export function ServiceLevelCard({state,openCrew}:{state:DinerState;openCrew?:()=>void}){
  const progress=serviceLevelProgress(state),helpers=unlockedTruckHelpers(state);
  return <section className={css.serviceLevelCard} aria-label="Cooking service level">
    <div><span className={css.eyebrow}>Service level {progress.level}</span><h3>{helpers?'Room for a helping hand':'Earn your first helper'}</h3><p>{helpers?`${helpers} helper ${helpers===1?'seat':'seats'} unlocked. Assign a crew member to clear dishes, serve or prepare.`:`${progress.cleared} / ${progress.target} cooking rounds cleared. Five successful services unlock a helper seat.`}</p></div>
    {!helpers&&<progress aria-label="Services toward your first helper" max={progress.target} value={Math.min(progress.cleared,progress.target)}/>}
    {helpers>0&&openCrew&&<button className={css.button} onClick={openCrew}><DinerIcon name="friends" size={18}/>Assign helper</button>}
    <small>Progress stays between trips. Practice and rally attempts do not count.</small>
  </section>;
}
