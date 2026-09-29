import {emptyCompetition,type WorkshopCompetition} from './competition';
import {type ZoneView} from '../token-zones';
/** Existing fight setup consumes this view; detailed token payouts use ZoneView. */
export function zoneWorkshopStatus(z:ZoneView):WorkshopCompetition{
 const p=z.personal,out=emptyCompetition(!!p,true);
 out.rules=z.rules;out.available=z.available;out.state=z.state;out.pool=4000;
 out.split={roi:600,profit:600,battles:400}; // Reference ceiling, never a guaranteed pool.
 out.startsAt=z.startsAt;out.endsAt=z.endsAt;out.updatedAt=z.confirmedThrough;
 out.enrollment=z.state==='draft'?'not_open':!z.available?'unavailable':p?.entered?'entered':'not_entered';
 out.weeks=(p?.weeks??[null,null,null,null]).map(days=>({days,status:z.state==='draft'?'upcoming':days===null?'unavailable':days>=3?'qualified':'in_progress'}));
 out.finalQualified=p?.qualified??null;out.attemptsRemaining=p?.attemptsRemaining??null;
 for(const k of ['roi','profit','battles'] as const){const score=p?.scores?.[k];out.categories[k]={rank:p?.ranks[k]??null,score:score==null?null:Number(score),provisional:z.state!=='frozen'};}
 out.points=out.categories.battles.score;
 out.nextAction=!z.available?'check':z.state!=='active'?'play':!p?'connect':!p.entered?(p.linkStatus==='linked'?'enroll':'check'):'fight';
 return out;
}
