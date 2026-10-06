import {gameplayRecorder} from './gameplay-recorder';
import {predictRanked,rankedActive,type RankedAttempt,type RankedEnvelope,type RankedCommand} from '../../../lib/chef/diner/ranked-rally';
import type {ServiceState} from '../../../lib/chef/diner/types';
/** Separate storage and endpoints. This controller never reads a restaurant save. */
export type VerifiedAttempt=Pick<RankedAttempt,'id'|'wallet'|'revision'|'service'|'status'>;
export class RankedSync<T extends VerifiedAttempt=RankedAttempt> {
 canonical:T;service:ServiceState;queue:RankedCommand[]=[];flight:RankedEnvelope|null=null;busy=false;blocked=false;stopped=false;retryAt=0;
 constructor(attempt:T,private storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,private request:(path:string,body?:unknown)=>Promise<any>,private changed:(s:ServiceState,a:T,status:string)=>void,private protocol={base:'ranked',predict:predictRanked}){this.canonical=attempt;this.service=structuredClone(attempt.service);const saved=storage.getItem(this.key);if(saved){try{const e=JSON.parse(saved) as RankedEnvelope;if(e.attemptId===attempt.id)this.flight=e;}catch{/* A malformed local tape cannot become a verified result. */}}this.blocked=!!this.flight;this.emit(this.blocked?'Recovering saved actions…':'Connected');}
 private get key(){return `dk-${this.protocol.base}-pending-v1:${this.canonical.wallet}:${this.canonical.id}`;}
 private takeBatch(){let ticks=0,count=0;for(const c of this.queue){const add=c.type==='service'&&c.action.type==='tick'?c.action.ticks:0;if(count>=128||ticks+add>100)break;ticks+=add;count++;}return this.queue.splice(0,count);}
 private emit(status:string){this.changed(this.service,this.canonical,status);}
 send(c:RankedCommand){if(this.stopped||this.blocked||this.canonical.status!=='active')return false;try{const wasActive=rankedActive(this.service);if(c.type==='service')gameplayRecorder.before(this.service,c.action);this.service=this.protocol.predict(this.service,c);this.queue.push(c);
   // The server starts its clock at acceptance, so preparation/open/resume must
   // be acknowledged before predicting any new timed work.
   if(!wasActive&&rankedActive(this.service)){this.blocked=true;this.emit('Starting the cooking clock…');void this.flush();}
   else this.emit(this.busy?'Saving…':'Connected');return true;
  }catch(error){this.emit(error instanceof Error?error.message:'This action is unavailable.');return false;}}
 async flush(){if(this.busy||this.stopped||Date.now()<this.retryAt)return;if(!this.flight){if(!this.queue.length)return;this.flight={id:crypto.randomUUID(),attemptId:this.canonical.id,revision:this.canonical.revision,commands:this.takeBatch()};}
  try{this.storage.setItem(this.key,JSON.stringify(this.flight));}catch{this.blocked=true;this.emit('Browser storage is full. Free space before continuing.');return;}
  this.busy=true;
  try{const data=await this.request(`${this.protocol.base}/commands`,this.flight);if(this.stopped)return;this.canonical=data.attempt;this.service=structuredClone(data.attempt.service);this.flight=null;this.storage.removeItem(this.key);this.blocked=false;
   if(data.interrupted||data.duplicate||data.attempt.status!=='active')this.queue=[];else for(const c of this.queue)this.service=this.protocol.predict(this.service,c);
   this.blocked=!rankedActive(this.canonical.service)&&rankedActive(this.service);
   this.emit(data.interrupted?'Connection interrupted. Your service is paused; resume when ready.':this.blocked?'Starting the cooking clock…':data.attempt.status==='complete'?'Result verified':'Connected');
  }catch(error){const e=error as Error&{status?:number;retryAfterMs?:number};this.blocked=true;
   if(e.status===429){this.retryAt=Date.now()+Math.max(100,e.retryAfterMs??500);this.emit('Waiting for the cooking clock…');}
   else if(e.status===409){try{const current=await this.request(`${this.protocol.base}/current`);if(this.stopped)return;if(current.attempt?.id===this.canonical.id){this.canonical=current.attempt;this.service=structuredClone(current.attempt.service);this.queue=[];this.storage.removeItem(this.key);this.flight=null;this.blocked=false;this.emit('Recovered this attempt from the server.');this.pause();}else this.emit('This attempt finished in another window. Reopen this event to see its verified result.');}catch{this.emit('Reconnect to recover this attempt. Your restaurant is unchanged.');}}
   else this.emit(e.message||'Connection lost. Progress is paused; retry saved actions.');
  }finally{this.busy=false;if(!this.stopped&&this.blocked&&!this.flight&&this.queue.length)void this.flush();}
 }
 stop(){this.stopped=true;}
 pause(){if(rankedActive(this.service))this.send({type:'service',action:{type:'pause'}});void this.flush();}
}
