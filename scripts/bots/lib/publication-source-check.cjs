'use strict';
// Read-only, first-publication revalidation. SQL still compares the exact fresh
// fingerprint atomically; this never accepts changed evidence used by a scan.
const {isDeepStrictEqual}=require('node:util');
function changed(reason){const e=Error('PUBLICATION_SOURCE_CHANGED');e.sourceReason=reason;throw e;}
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const without=(value,keys)=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));
function same(a,b,reason){if(!isDeepStrictEqual(a,b))changed(reason);}
function rows(value,key,reason){
 if(!Array.isArray(value))changed(reason);
 const map=new Map();for(const row of value){if(!object(row))changed(reason);const id=key(row);if(typeof id!=='string'||!id||map.has(id))changed(reason);map.set(id,row);}
 return [...map.entries()].sort(([a],[b])=>a.localeCompare(b));
}
const time=value=>typeof value==='string'?Date.parse(value):NaN;
function assertPublicationSourceUnchanged({original,current,packet,accountCoverage}){
 if(!object(original)||!object(current)||!object(packet)||!object(original.manifest)||!object(current.manifest)
  ||!object(original.manifest.campaign)||!object(current.manifest.campaign)||!/^[a-f0-9]{32}$/.test(current.fingerprint||''))changed('INVALID_SNAPSHOT');
 const before=original.manifest,after=current.manifest,c=before.campaign,through=time(packet.confirmedThrough),start=time(packet.coverageFrom);
 if(!Number.isFinite(through)||!Number.isFinite(start)||through<start||packet.campaignId!==c.id||packet.rules!==c.rules
  ||start!==time(c.starts_at)||!['active','closed'].includes(c.state))changed('INVALID_SCAN_WINDOW');
 // Display completeness may be invalidated by unrelated discovery activity.
 // Saved cutoff, dates, state, method, disputes and any future config stay exact.
 same(without(c,['complete','financial_complete']),without(after.campaign,['complete','financial_complete']),'CAMPAIGN');
 same(without(before,['campaign','participants','markets']),without(after,['campaign','participants','markets']),'MANIFEST');
 const entries=rows(before.participants,r=>r.participant,'ENTRIES'),nextEntries=rows(after.participants,r=>r.participant,'ENTRIES');
 same(entries,nextEntries,'ENTRIES');const enrolled=new Set(entries.map(([id])=>id));
 const coverage=rows(accountCoverage,r=>r.participant,'SCAN_COVERAGE');
 same(coverage.map(([id])=>id),entries.map(([id])=>id),'SCAN_COVERAGE');
 for(const[,a]of coverage)if(typeof a.complete!=='boolean'||a.coverageFrom!==packet.coverageFrom||a.confirmedThrough!==packet.confirmedThrough)changed('SCAN_COVERAGE');
 for(const s of [original,current])if(!Array.isArray(s.accounts)||!Array.isArray(s.wallets)||!Array.isArray(s.references)||!Array.isArray(s.fills)||!object(s.accountingRevisions))changed('INVALID_SNAPSHOT');
 const accounts=s=>rows(s.accounts.filter(a=>enrolled.has(a?.participant)),a=>a.participant,'ACCOUNTS');
 const oldAccounts=accounts(original),newAccounts=accounts(current);same(oldAccounts.map(([id])=>id),newAccounts.map(([id])=>id),'ACCOUNTS');
 const newMap=new Map(newAccounts),completeMap=new Map(coverage.map(([id,a])=>[id,a.complete]));
 for(const[id,old]of oldAccounts){
  const fresh=newMap.get(id);same(without(old,['coverage']),without(fresh,['coverage']),'ACCOUNT_IDENTITY');
  const a=old.coverage,b=fresh.coverage;
  if(a?.complete===true){
   if(b?.complete!==true||!Number.isFinite(time(b.coverage_from))||!Number.isFinite(time(b.confirmed_through))
    ||time(b.coverage_from)>time(a.coverage_from)||time(b.confirmed_through)<time(a.confirmed_through))changed('COVERAGE_DOWNGRADE');
  }
  if(completeMap.get(id)&&(!b||b.complete!==true||time(b.coverage_from)>start||time(b.confirmed_through)<through
   ||!Number.isFinite(time(b.coverage_from))||!Number.isFinite(time(b.confirmed_through))))changed('COVERAGE_INSUFFICIENT');
 }
 for(const[id,complete]of completeMap)if(complete&&!newMap.has(id))changed('COVERAGE_INSUFFICIENT');
 const wallets=s=>rows(s.wallets.filter(w=>enrolled.has(w?.participant)),w=>w.participant+':'+w.trade_wallet,'WALLETS');
 const oldWallets=wallets(original),newWallets=wallets(current);same(oldWallets,newWallets,'WALLETS');
 const addresses=new Set(oldWallets.map(([,w])=>w.trade_wallet));
 // A formerly unrelated account cannot acquire an enrolled wallet unnoticed.
 const ownership=s=>rows(s.wallets.filter(w=>addresses.has(w?.trade_wallet)),w=>w.participant+':'+w.trade_wallet,'WALLET_OWNERSHIP');
 same(ownership(original),ownership(current),'WALLET_OWNERSHIP');
 const markets=m=>rows(m.map(row=>without(row,['verified_at','evidence'])),r=>r.chain_id+':'+r.domain_token+':'+r.quote_token,'MARKETS');
 if(!Array.isArray(before.markets)||!Array.isArray(after.markets))changed('MARKETS');same(markets(before.markets),markets(after.markets),'MARKETS');
 const refs=s=>rows(s.references.filter(r=>enrolled.has(r?.participant)),r=>{if(typeof r.ref?.id!=='string'||!r.ref.id)changed('REFERENCES');return r.participant+':'+r.ref.id;},'REFERENCES');
 const oldRefs=new Map(refs(original)),newRefs=new Map(refs(current));
 for(const id of new Set([...oldRefs.keys(),...newRefs.keys()])){
  const a=oldRefs.get(id),b=newRefs.get(id);
  for(const ref of [a,b])if(ref&&(!object(ref.ref)||!Number.isFinite(time(ref.ref.executedAt))))changed('REFERENCES');
  // Include both versions: moving an old reference beyond cutoff is a correction.
  if((a&&time(a.ref.executedAt)<=through)||(b&&time(b.ref.executedAt)<=through))same(a,b,'REFERENCES');
 }
 // Any concurrent score writer or corrected saved fill needs a new scan.
 same(rows(original.fills,r=>r.chainId+':'+r.economicId,'FILLS'),rows(current.fills,r=>r.chainId+':'+r.economicId,'FILLS'),'FILLS');
 same(original.accountingRevisions,current.accountingRevisions,'ACCOUNTING_REVISIONS');
 return current.fingerprint;
}
module.exports={assertPublicationSourceUnchanged};
