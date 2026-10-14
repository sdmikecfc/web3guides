import 'server-only';
import {botsDb} from './db';
import {ZONE_CAMPAIGN} from '@/lib/bots/token-zones';

// Entry wallets are stable display metadata. Never cache scores or session data.
const labels=new Map<string,{name:string;checkedAt:number}>();
const MAX_LABELS=20000,MAX_AGE=24*60*60*1000;

export async function readEntryWalletLabels(participants:string[]):Promise<Map<string,string>>{
 const ids=[...new Set(participants)].slice(0,MAX_LABELS),requested=new Set(ids);
 const controller=new AbortController();
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  await Promise.race([
   (async()=>{
    // Small targeted batches stay below PostgREST's row limit. A single large
    // range does not override that limit and can silently omit entry wallets.
    for(let start=0;start<ids.length;start+=500){
     if(controller.signal.aborted)return;
     const batch=ids.slice(start,start+500);
     const {data,error}=await botsDb().from('mkz_entries').select('participant,wallet')
      .eq('campaign_id',ZONE_CAMPAIGN).in('participant',batch).range(0,499).abortSignal(controller.signal);
     if(controller.signal.aborted||error||!Array.isArray(data))return;
     for(const entry of data){
      if(!entry||typeof entry.participant!=='string'||!requested.has(entry.participant)||typeof entry.wallet!=='string'||!/^0x[0-9a-f]{40}$/i.test(entry.wallet))continue;
      const wallet=entry.wallet.toLowerCase();
      labels.delete(entry.participant);
      labels.set(entry.participant,{name:wallet.slice(0,6)+'…'+wallet.slice(-4),checkedAt:Date.now()});
     }
    }
   })(),
   new Promise<void>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve()},3000)}),
  ]);
 }catch{/* Keep known entry labels when this optional lookup is unavailable. */}
 finally{clearTimeout(timer);controller.abort()}
 const now=Date.now();
 for(const [id,label] of labels)if(now-label.checkedAt>MAX_AGE)labels.delete(id);
 while(labels.size>MAX_LABELS)labels.delete(labels.keys().next().value!);
 return new Map(ids.flatMap(id=>{const label=labels.get(id);return label?[[id,label.name] as const]:[]}));
}
