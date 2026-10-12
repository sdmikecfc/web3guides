import {DAY, ZONE_FRESH_MS, qualificationDays} from './token-zones';

export type QualificationProgress = {
 status: 'qualified'|'action'|'waiting'|'closed';
 label: string;
 detail: string;
};
type Input = {
 state: 'draft'|'active'|'closed'|'frozen'|'unavailable';
 startsAt: string|null;
 endsAt: string|null;
 entered?: boolean;
 qualified?: boolean|null;
 /** Omit times unless this account's trade evidence has been verified. */
 times?: string[];
 verifiedThrough?: string|null;
 delayed?: boolean;
 now?: number;
};
const waiting = ():QualificationProgress => ({status:'waiting',label:'Checking qualifying days',detail:'Your verified trading days will appear here.'});
const rule = 'Trade on 3 different days in one competition week.';
const utcDay = (time:number) => Math.floor(time/DAY);

/** Display guidance only. Scoring and eligibility still use the existing rules. */
export function qualificationProgress(input:Input):QualificationProgress {
 const {state,startsAt,endsAt,entered=true,qualified,times,verifiedThrough}=input;
 const now=input.now??Date.now(),start=Date.parse(startsAt??''),end=Date.parse(endsAt??'');
 if(state==='unavailable')return waiting();
 if(state==='draft')return {status:'waiting',label:'Trading has not started',detail:rule};
 if(!Number.isFinite(start)||end-start!==28*DAY||!Number.isFinite(now))return waiting();
 if(!entered)return {status:state==='active'&&now<end?'action':'closed',label:state==='active'&&now<end?'Enter the competition first':'Competition entry is closed',detail:state==='active'&&now<end?'Then '+rule.charAt(0).toLowerCase()+rule.slice(1):'Only entered players can qualify for rewards.'};
 const through=Date.parse(verifiedThrough??'');
 if(Number.isFinite(through)&&through>now)return waiting();
 const evidence=times&&Number.isFinite(through)&&through>=start&&through<=end
  ?times.filter(time=>{const t=Date.parse(time);return Number.isFinite(t)&&t<=through;}):undefined;
 const weeks=evidence?qualificationDays(evidence,startsAt!,endsAt!):null;
 const qualifiedWeek=weeks?.findIndex(days=>days>=3)??-1;
 if(qualified===true||qualifiedWeek>=0)return {status:'qualified',label:'Qualified for rewards',detail:qualifiedWeek>=0?`3 trading days completed in Week ${qualifiedWeek+1}.`:'The trading-day requirement is complete.'};
 if(state==='frozen')return qualified===false?{status:'closed',label:'Did not qualify',detail:'Needed trades on 3 different days in one week.'}:waiting();
 if(state==='closed'||now>=end)return {status:'closed',label:weeks?`${Math.min(3,Math.max(...weeks))}/3 trading days verified`:'Checking qualifying days',detail:'Trading has closed. Final checks are running.'};
 if(now<start)return {status:'waiting',label:'Trading has not started',detail:rule};
 if(!weeks)return waiting();
 const week=Math.floor((now-start)/(7*DAY)),weekStart=start+week*7*DAY,weekEnd=Math.min(end,weekStart+7*DAY);
 const days=weeks[week],needed=3-days;
 // Old coverage must never turn missing observations into a new trading demand.
 if(input.delayed||through<weekStart||now-through>ZONE_FRESH_MS||utcDay(through)!==utcDay(now))return {status:'waiting',label:through<weekStart?'Checking this week’s trading days':`${days}/3 trading days verified`,detail:'Newer trades are syncing. '+rule};
 const tradedToday=evidence!.some(time=>{const t=Date.parse(time);return t>=weekStart&&t<weekEnd&&utcDay(t)===utcDay(now);});
 const datesLeft=utcDay(weekEnd-1)-utcDay(now)+1-(tradedToday?1:0);
 if(needed>datesLeft){
  if(week<3){const next=new Date(weekEnd).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'UTC'});return {status:'action',label:`Qualify in Week ${week+2}`,detail:`Trade on 3 different days from ${next} UTC.`};}
  return {status:'closed',label:'Not enough trading days left',detail:'Needed trades on 3 different days in one week.'};
 }
 return {status:'action',label:`Trade on ${needed}${days?' more':' different'} day${needed===1?'':'s'} this week`,detail:`Week ${week+1} · ${days}/3 days verified. Each UTC day counts once.`};
}
