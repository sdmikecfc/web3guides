'use strict';
const {randomUUID}=require('node:crypto');
// Each commit uses the fingerprint returned by its own predecessor. Never adopt
// a freshly read fingerprint after concurrent source changes.
function progressivePublication({snapshot,packet,accountCoverage,rpc}){
 let fingerprint=snapshot.fingerprint,started=false,closed=false,stopped=false,published=0;
 const seen=new Set(),rejections=[];
 if(!/^[a-f0-9]{32}$/.test(fingerprint||''))throw Error('PUBLICATION_FINGERPRINT_REQUIRED');
 async function send({initial=false,ledger=null,final=false,report={}}={}){
  if(stopped||closed||initial===started)throw Error('PUBLICATION_STATE_INVALID');
  const accounting=ledger?[ledger]:[],body={requestId:randomUUID(),fingerprint,
   packet:{...packet,requestId:randomUUID(),fills:initial?packet.fills:[],financialComplete:final&&packet.financialComplete===true&&rejections.length===0,financials:[]},accountCoverage,accounting,report};
  try{
   const response=await rpc('mkz_worker_commit',{p:body});
   const rejected=response?.accountingRejected||[];
   if(response?.ok!==true||!/^[a-f0-9]{32}$/.test(response.nextFingerprint||'')||!Array.isArray(rejected)||rejected.length>accounting.length||rejected.some(r=>r.participant!==ledger?.participant||typeof r.code!=='string'))throw Error('PUBLICATION_RESPONSE_INVALID');
   fingerprint=response.nextFingerprint;started=true;closed=final;
   rejections.push(...rejected);if(ledger&&!rejected.length)published++;
   return rejected.length===0;
  }catch(e){stopped=true;throw e;}
 }
 return {
  start:report=>send({initial:true,report}),
  async ledger(ledger,report={}){if(seen.has(ledger.participant))throw Error('PUBLICATION_DUPLICATE_ACCOUNT');seen.add(ledger.participant);return send({ledger,report});},
  finish:report=>send({final:true,report}),
  get published(){return published;},get rejections(){return rejections.slice();},get stopped(){return stopped;}
 };
}
module.exports={progressivePublication};
