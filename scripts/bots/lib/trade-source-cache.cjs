'use strict';
// Public chain evidence only. The caller must validate the saved finalized
// anchor before reuse; account identity, Strategy references and index results
// are deliberately absent. Reuse the bounded, checksummed, atomic disk store.
const {openAccountingCache}=require('./accounting-cache.cjs');
function openTradeSourceCache({directory,maxBytes=128*1024*1024,maxEntryBytes=4*1024*1024,maxEntries=20000}={}){
 const cache=openAccountingCache({directory,chainId:97477,schemaVersion:'trade-source-evidence-1',maxBytes,maxEntryBytes,maxEntries});
 function namespace(kind,scope={}){
  const ns=cache.namespace({kind:'history-checkpoint',scope:{source:kind,...scope}});
  return {get:identity=>ns.getCheckpoint(identity),set:(identity,value)=>ns.setCheckpoint(identity,value),clear:()=>ns.clear()};
 }
 return {facts:namespace('finalized-rpc-facts-1'),ranges:scope=>namespace('finalized-erc20-ranges-1',scope),stats:()=>cache.stats()};
}
module.exports={openTradeSourceCache};
