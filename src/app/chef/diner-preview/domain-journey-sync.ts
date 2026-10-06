import {applyJourneyCommand,type DomainJourneyAttempt,type JourneyCommand,type JourneyEnvelope} from '@/lib/chef/diner/domain-journeys';
import {rankedActive} from '@/lib/chef/diner/ranked-rally';
const live=(a:DomainJourneyAttempt)=>a.status==='active'&&a.phase==='service'&&rankedActive(a.service);
/** The ordered tape and its retry ID are isolated from restaurant and rally storage. */
export class DomainJourneySync {
 canonical:DomainJourneyAttempt;shown:DomainJourneyAttempt;queue:JourneyCommand[]=[];flight:JourneyEnvelope|null=null;
 busy=false;blocked=false;stopped=false;retryAt=0;
 constructor(attempt:DomainJourneyAttempt,private storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,private request:(path:string,body?:unknown)=>Promise<any>,private changed:(attempt:DomainJourneyAttempt,status:string)=>void){
  this.canonical=structuredClone(attempt);this.shown=structuredClone(attempt);
  try{const e=JSON.parse(storage.getItem(this.key)??'null');if(e?.attemptId===attempt.id)this.flight=e;}catch{}
  this.blocked=!!this.flight;this.emit(this.blocked?'Recovering saved actions…':'');
 }
 get key(){return `dk-domain-journey-pending-v1:${this.canonical.wallet}:${this.canonical.id}`;}
 private emit(status:string){this.changed(this.shown,status);}
 send(c:JourneyCommand){
  if(this.stopped||this.blocked||this.shown.status!=='active')return false;
  try{const before=live(this.shown),next=structuredClone(this.shown);applyJourneyCommand(next,c,Date.now());this.shown=next;this.queue.push(c);
   if(!before&&live(next)){this.blocked=true;this.emit('Starting the cooking clock…');void this.flush();}else this.emit('');return true;
  }catch(error){this.emit(error instanceof Error?error.message:'This action is unavailable.');return false;}
 }
 async flush(){
  if(this.busy||this.stopped||Date.now()<this.retryAt)return;
  if(!this.flight){if(!this.queue.length)return;let ticks=0,count=0;for(const c of this.queue){const add=c.type==='service'&&c.action.type==='tick'?c.action.ticks:0;if(count>=128||ticks+add>100)break;ticks+=add;count++;}this.flight={id:crypto.randomUUID(),attemptId:this.canonical.id,revision:this.canonical.revision,commands:this.queue.splice(0,count)};}
  try{this.storage.setItem(this.key,JSON.stringify(this.flight));}catch{this.blocked=true;this.emit('Browser storage is full. Free space before continuing.');return;}
  this.busy=true;
  try{
   const result=await this.request('journey/commands',this.flight);if(this.stopped)return;
   if(result.attempt?.id!==this.canonical.id||result.attempt?.wallet!==this.canonical.wallet)throw new Error('This response belongs to another journey.');
   this.canonical=result.attempt;this.shown=structuredClone(result.attempt);this.flight=null;this.storage.removeItem(this.key);this.blocked=false;
   if(result.interrupted||result.duplicate||this.canonical.status!=='active')this.queue=[];
   else for(const c of this.queue)applyJourneyCommand(this.shown,c,Date.now());
   this.blocked=!live(this.canonical)&&live(this.shown);
   this.emit(result.interrupted?'Connection interrupted. Your service is paused.':this.blocked?'Starting the cooking clock…':'');
  }catch(error){
   const e=error as Error&{status?:number;retryAfterMs?:number};this.blocked=true;
   if(e.status===429){this.retryAt=Date.now()+Math.max(100,e.retryAfterMs??500);this.emit('Waiting for the cooking clock…');}
   else if(e.status===409){try{const result=await this.request('journey/current');if(this.stopped)return;if(result.attempt?.id===this.canonical.id&&result.attempt.wallet===this.canonical.wallet){this.canonical=result.attempt;this.shown=structuredClone(result.attempt);this.queue=[];this.flight=null;this.storage.removeItem(this.key);this.blocked=false;this.emit('Recovered your saved journey.');this.pause();}else this.emit('This journey ended in another window. Reopen it to see your rewards.');}catch{this.emit('Reconnect to recover this journey.');}}
   else this.emit(e.message||'Connection lost. Retry your saved actions.');
  }finally{this.busy=false;if(!this.stopped&&this.blocked&&!this.flight&&this.queue.length)void this.flush();}
 }
 pause(){if(live(this.shown))this.send({type:'service',action:{type:'pause'}});void this.flush();}
 stop(){this.stopped=true;}
}
