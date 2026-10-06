import {RECIPE_BY_ID} from './content';
import type { ServiceConfig, ServiceState } from './types';

export type PacingProfile='first'|'second'|'third'|'slow'|'standard'|'destination'|'relaxed'|'steady'|'rush'|'finale';
/** A separate seeded stream fixes the timetable before any player input. */
export function serviceSchedule(config:Pick<ServiceConfig,'seed'|'customers'|'arrivalTicks'|'specials'|'pacingProfile'|'menu'|'domain'>):number[]{
  let rng=2166136261;for(const ch of `${config.seed}:arrivals-v2`)rng=Math.imul(rng^ch.charCodeAt(0),16777619);
  const random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return (rng>>>0)/4294967296;};
  return Array.from({length:config.customers},(_,i)=>{
    const profile=config.pacingProfile;
    const workload=Math.max(10.3,...config.menu.map(id=>{const recipe=RECIPE_BY_ID[id];return recipe?recipe.steps.reduce((total,step)=>total+step.ticks/20,0)+(recipe.assemblyIngredients?.length??0)*2.8:10.3;}));
    const menuBuffer=Math.min(6,Math.max(0,(workload-10.3)/2))+(config.menu.length>2?2:0);
    const bounds=profile==='finale'?(i%3===2?[47,55]:[13,17]):profile==='relaxed'?[26,34]:profile==='steady'?[24,30]:profile==='rush'?(i%3===2?[32,38]:[18,22]):profile==='destination'?(i%4===3?[32,38]:i%4===1?[18,22]:[24,30]):profile==='first'||profile==='slow'?[26,34]:profile==='second'?[24,30]:profile==='third'?(i%2===0?[18,22]:[32,38]):[config.arrivalTicks/20*.8,config.arrivalTicks/20*1.2];
    if(['destination','relaxed','steady','rush','finale'].includes(profile??'')){bounds[0]+=menuBuffer;bounds[1]+=menuBuffer;}
    if(config.domain&&profile!=='steady'){
      const grouped=config.domain==='gochujang'?i%3!==2:config.domain==='smoothie'?i%4===1||i%4===2:false;
      if(grouped){bounds[0]=Math.min(bounds[0],18+menuBuffer);bounds[1]=Math.min(bounds[1],22+menuBuffer);}
      else if(config.domain==='gochujang'||config.domain==='smoothie'){bounds[0]=Math.max(bounds[0],34+menuBuffer);bounds[1]=Math.max(bounds[1],40+menuBuffer);}
    }
    const modifier=config.specials.includes('happy_hour')?1/1.2:1;
    const seconds=Math.max(bounds[0],Math.min(bounds[1],(bounds[0]+random()*(bounds[1]-bounds[0]))*modifier));
    return Math.round(seconds*20);
  });
}
export function protectedLesson(s:Pick<ServiceState,'config'|'lessonStatus'>):boolean{return s.config.lessonVersion===1&&s.lessonStatus==='active';}
export function earlyPatienceFloor(s:Pick<ServiceState,'config'>):{table:number;queue:number}{
  const early=s.config.pacingVersion===2&&['first','second','third'].includes(s.config.pacingProfile??'');
  const drain=s.config.spices.includes('rush_hour')?1.25:1;
  return {table:early?70*20*drain:0,queue:early?90*20*drain:0};
}
