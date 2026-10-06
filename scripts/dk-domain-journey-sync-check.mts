import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DomainJourneySync} from '../src/app/chef/diner-preview/domain-journey-sync';
import {createDomainJourney,replayDomainJourney,journeyReachable} from '../src/lib/chef/diner/domain-journeys';
import {DOMAIN_SEASONS} from '../src/lib/chef/diner/domain-seasons';
async function main(){
 const now=Date.now(),wallet='0x1111111111111111111111111111111111111111',season={...DOMAIN_SEASONS[0],approved:true,startsAt:now-1000,endsAt:now+86400000};
 let canonical=createDomainJourney(randomUUID(),wallet,season,now),lost=false,drop=false,clock=now;
 const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}},receipts=new Map<string,string>();
 const request=async(path:string,body?:any)=>{
  if(path==='journey/current')return {attempt:canonical};
  if(receipts.has(body.id)){assert.equal(receipts.get(body.id),JSON.stringify(body));return {attempt:canonical,duplicate:true};}
  const result=replayDomainJourney(canonical,body,clock);canonical=result.attempt;receipts.set(body.id,JSON.stringify(body));if(drop){drop=false;lost=true;throw new Error('Lost response');}return result;
 };
 let shown=canonical,status='';let c=new DomainJourneySync(canonical,storage,request,(a,s)=>{shown=a;status=s;});
 assert(c.send({type:'choose',nodeId:journeyReachable(canonical)[0].id}));drop=true;await c.flush();assert(lost&&c.blocked);assert(values.has(c.key));const revision=canonical.revision;
 await c.flush();assert(!c.blocked);assert.equal(canonical.revision,revision);assert.equal(shown.phase,'service');
 assert(c.send({type:'service',action:{type:'prepare'}}));while(c.busy)await new Promise(r=>setTimeout(r,1));assert(!c.blocked);
 clock+=1000;for(let i=0;i<20;i++)c.send({type:'service',action:{type:'tick',ticks:1}});drop=true;await c.flush();assert(c.blocked);const ticks=canonical.service.tick;
 c.stop();c=new DomainJourneySync(canonical,storage,request,(a,s)=>{shown=a;status=s;});assert(c.blocked);await c.flush();assert.equal(canonical.service.tick,ticks);assert.equal(shown.service.tick,ticks);assert(!c.blocked);
 clock+=6000;c.send({type:'service',action:{type:'tick',ticks:1}});await c.flush();assert.equal(shown.service.phase,'paused');assert.match(status,/interrupted/);
 c.stop();assert.equal(c.send({type:'abandon'}),false);assert.equal(canonical.status,'active');
 console.log('PASS journey client: exact retries, lost acknowledgements, reload recovery, clock-start acknowledgement, pause on disconnect, stopped-wallet isolation.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
