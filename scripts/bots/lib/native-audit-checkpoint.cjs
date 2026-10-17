'use strict';
// Resumable proof checkpoints belong only to one unfinished accounting audit.
// They are not permanent facts about an Explorer index.
const {createHash}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {nativeSettlement}=require('./public-native-accounting.cjs');
const VERSION='native-unfinished-audit-1',MAX_AGE_MS=4*60*60*1000;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const hex=(x,n)=>typeof x==='string'&&new RegExp('^0x[0-9a-f]{'+n+'}$','i').test(x);
const fail=code=>{throw Error('NATIVE_'+code);};
const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x;
function namespace(cache,anchor,scope){return cache.namespace({kind:'history-checkpoint',scope:{source:VERSION,anchor,audit:scope}});}
function clearNativeAudit(cache,anchor,scope){if(!cache||!scope)return;const ns=namespace(cache,anchor,scope);if(ns.clear)ns.clear();else ns.setCheckpoint({kind:'state'},{invalidated:true});}
function nativeAuditProgress(cache,anchor,scope){if(!scope)return 0;const value=namespace(cache,anchor,scope).getCheckpoint({kind:'progress'});return Number.isSafeInteger(value?.sealed)&&value.sealed>0?value.sealed:0;}
function validScope(scope,anchor){
 if(!scope||scope.version!==1||typeof scope.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(scope.id)||!Number.isSafeInteger(scope.startedAt)||!hex(anchor?.hash,64)||!/^0x[0-9a-f]+$/.test(anchor?.number||'')||!/^[a-f0-9]{64}$/.test(scope.fingerprint||'')||!/^\d+$/.test(scope.participant||'')||!Array.isArray(scope.wallets)||!scope.wallets.length||scope.wallets.some(w=>!hex(w,40)||w!==w.toLowerCase())||new Set(scope.wallets).size!==scope.wallets.length||scope.wallets.some((w,i)=>i>0&&scope.wallets[i-1]>=w)||!Number.isFinite(Date.parse(scope.periodStart))||!Number.isFinite(Date.parse(scope.through))||Date.parse(scope.through)<Date.parse(scope.periodStart))fail('AUDIT_SCOPE_INVALID');
}
function cursor(value){if(value==null)return null;if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(value).length)fail('TRACE_CURSOR_INVALID');for(const[k,v]of Object.entries(value))if(!/^[a-z_]+$/.test(k)||!(v===null||typeof v==='string'||typeof v==='number'&&Number.isSafeInteger(v)))fail('TRACE_CURSOR_INVALID');return ordered(value);}
function normalizeTrace(t,tx,receipt){
 if(!t||!hex(t.transaction_hash,64)||t.transaction_hash.toLowerCase()!==tx||!Number.isSafeInteger(t.index)||t.index<0||!/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(String(t.block_number))||BigInt(t.block_number)!==BigInt(receipt.blockNumber)||t.block_hash!=null&&t.block_hash.toLowerCase()!==receipt.blockHash.toLowerCase())fail('TRACE_MISMATCH');
 if(typeof t.value==='number'&&!Number.isSafeInteger(t.value)||!/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(String(t.value)))fail('UNSAFE_AMOUNT');
 const address=a=>a?.hash==null?null:hex(a.hash,40)?a.hash.toLowerCase():fail('TRACE_ADDRESS_INVALID');
 return {transaction_hash:tx,block_number:BigInt(t.block_number).toString(),index:t.index,from:{hash:address(t.from)},to:{hash:address(t.to)},created_contract:{hash:address(t.created_contract)},type:t.type??null,value:BigInt(t.value).toString(),success:t.success??null,error:t.error??null};
}
async function scanTraces({tx,receipt,page,checkBudget=()=>{},maxPages=1000,maxTraces=50000}){
 let params={},pages=0;const cursors=new Set(),indices=new Set(),rows=[],boundaries=[];
 while(pages<maxPages){checkBudget();const p=await page(tx,params);checkBudget();if(!p||!Array.isArray(p.items))fail('TRACES_UNAVAILABLE');const next=cursor(p.next_page_params),items=p.items.map(t=>normalizeTrace(t,tx,receipt));
  for(const t of items){if(indices.has(t.index))fail('TRACE_MISMATCH');indices.add(t.index);rows.push(t);if(rows.length>maxTraces)fail('TRACE_ROW_LIMIT');}
  boundaries.push({params:ordered(params),next,count:items.length});pages++;
  if(!next)return {rows:rows.sort((a,b)=>a.index-b.index),boundaries};
  if(!items.length)fail('TRACE_EMPTY_PAGE');const key=hash(next);if(cursors.has(key))fail('TRACE_CURSOR_REPEATED');cursors.add(key);params=next;
 }
 fail('TRACE_PAGE_LIMIT');
}
async function completeTraces(options){const first=await scanTraces(options),second=await scanTraces(options);options.checkBudget?.();if(!isDeepStrictEqual(first,second))fail('TRACE_INDEX_CHANGED');return second.rows;}
const resumable=e=>['ACCOUNTING_TIME_BUDGET_EXCEEDED','PUBLIC_REQUEST_TIMEOUT','PUBLIC_NETWORK_UNAVAILABLE','PUBLIC_RETRIES_EXHAUSTED'].includes(e?.message);
function nativeAuditCheckpoint({cache,anchor,scope,checkBudget=()=>{},verifyBoundary,now=Date.now,onCache=()=>{}}){
 validScope(scope,anchor);if(!cache||typeof verifyBoundary!=='function')fail('AUDIT_SCOPE_INVALID');const ns=namespace(cache,anchor,scope);let started=null,invalidated=false,used=false;const pending=new Map();
 function invalidate(){invalidated=true;clearNativeAudit(cache,anchor,scope);}
 function check(){checkBudget();const age=now()-scope.startedAt;if(invalidated||ns.getCheckpoint({kind:'state'})?.invalidated)fail('AUDIT_INVALIDATED');if(age<0||age>MAX_AGE_MS){invalidate();fail('AUDIT_EXPIRED');}}
 async function boundary(){check();try{await verifyBoundary(anchor);check();}catch(e){if(!resumable(e))invalidate();throw e;}}
 async function begin(){check();if(!started){started=boundary();started.catch(()=>{started=null;});}await started;check();}
 async function read(tx,transaction,receipt,loader){
  check();used=true;if(!hex(tx,64)||transaction?.hash?.toLowerCase()!==tx||receipt?.transactionHash?.toLowerCase()!==tx||!hex(transaction.blockHash,64)||transaction.blockHash.toLowerCase()!==receipt.blockHash?.toLowerCase()||!/^0x[0-9a-f]+$/i.test(transaction.blockNumber||'')||BigInt(transaction.blockNumber)!==BigInt(receipt.blockNumber)||BigInt(receipt.blockNumber)>BigInt(anchor.number)){invalidate();fail('CHECKPOINT_IDENTITY_CHANGED');}
  const identity=hash(ordered({transaction,receipt}));if(pending.has(tx)){const p=pending.get(tx);if(p.identity!==identity){invalidate();fail('CHECKPOINT_IDENTITY_CHANGED');}return p.work;}
  const work=(async()=>{try{await begin();const saved=ns.getCheckpoint({tx});let traces;
   if(saved!==undefined){if(saved.version!==VERSION||saved.identity!==identity||!Array.isArray(saved.traces)||saved.traceHash!==hash(ordered(saved.traces))){invalidate();fail('CHECKPOINT_IDENTITY_CHANGED');}traces=saved.traces;onCache(true);}
   else {traces=await loader();onCache(false);}
   // Re-run the full native fee/value verifier even for a sealed checkpoint.
   const result=nativeSettlement(transaction,receipt,traces);check();
   if(saved===undefined&&ns.setCheckpoint({tx},{version:VERSION,identity,traces,traceHash:hash(ordered(traces))})===true){const prior=ns.getCheckpoint({kind:'progress'});ns.setCheckpoint({kind:'progress'},{sealed:(Number.isSafeInteger(prior?.sealed)?prior.sealed:0)+1});}
   check();return result;
  }catch(e){if(!resumable(e))invalidate();throw e;}})();pending.set(tx,{identity,work});try{return await work;}finally{pending.delete(tx);}
 }
 return {read,finish:boundary,invalidate,check,get used(){return used;}};
}
module.exports={VERSION,MAX_AGE_MS,completeTraces,nativeAuditCheckpoint,clearNativeAudit,nativeAuditProgress,validScope};