'use strict';
// Native ETH is a distinct ledger asset, never a pretend WETH transfer.
// All quantities stay in wei. Only successful value calls move ETH; a failed
// transaction still pays its evidenced network fee.
const NATIVE='0x0000000000000000000000000000000000000000';
const addr=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/i.test(x)?x.toLowerCase():null;
function units(x){if(typeof x==='number'&&!Number.isSafeInteger(x))throw Error('NATIVE_UNSAFE_AMOUNT');if(!/^(0x[0-9a-f]+|[0-9]+)$/i.test(String(x)))throw Error('NATIVE_AMOUNT_UNAVAILABLE');return BigInt(x);}
function nativeSettlement(transaction,receipt,traces){
 const tx=transaction,ok=receipt.status==='0x1',failed=receipt.status==='0x0';
 if(!tx||!ok&&!failed||tx.hash?.toLowerCase()!==receipt.transactionHash?.toLowerCase()||tx.blockHash?.toLowerCase()!==receipt.blockHash?.toLowerCase())throw Error('NATIVE_RECEIPT_MISMATCH');
 const payer=addr(tx.from),to=addr(tx.to),moves=[],seen=new Set();
 if(!payer)throw Error('NATIVE_SENDER_UNAVAILABLE');
 // OP deposits/minting require their own verifier. On Jovian, blobGasUsed
 // measures DA footprint, not an additional Ethereum blob fee:
 // https://specs.optimism.io/protocol/jovian/exec-engine.html
 if(units(tx.type||'0x0')===126n)throw Error('NATIVE_DEPOSIT_FLOW_REVIEW_REQUIRED');
 if((receipt.operatorFeeScalar==null)!==(receipt.operatorFeeConstant==null))throw Error('NATIVE_OPERATOR_FEE_INCOMPLETE');
 if(![0n,1n,2n,4n].includes(units(tx.type||'0x0'))||receipt.blobGasPrice!=null||units(receipt.blobGasUsed||'0x0')!==0n&&receipt.daFootprintGasScalar==null||units(receipt.opGasRefund||'0x0')!==0n)throw Error('NATIVE_FEE_TYPE_UNSUPPORTED');
 // Doma is an OP chain: omitting its L1 data fee would understate the debit.
 const gas=units(receipt.gasUsed),scalar=units(receipt.operatorFeeScalar||'0x0');
 const operator=(receipt.daFootprintGasScalar!=null?gas*scalar*100n:gas*scalar/1000000n)+units(receipt.operatorFeeConstant||'0x0');
 const fee=gas*units(receipt.effectiveGasPrice)+units(receipt.l1Fee)+operator;
 const value=units(tx.value);
 if(ok&&value){if(!to)throw Error('NATIVE_CREATION_FLOW_UNSUPPORTED');moves.push({from:payer,to,units:value,index:-1});}
 for(const t of traces){
  if(t.transaction_hash?.toLowerCase()!==tx.hash.toLowerCase()||BigInt(t.block_number)!==BigInt(receipt.blockNumber)||!Number.isSafeInteger(t.index)||seen.has(t.index))throw Error('NATIVE_TRACE_MISMATCH');
  seen.add(t.index);
  const n=units(t.value),from=addr(t.from?.hash),target=addr(t.to?.hash||t.created_contract?.hash);
  if(!ok||t.success===false||t.error)continue;
  if(t.success!==true)throw Error('NATIVE_TRACE_STATUS_UNAVAILABLE');
  // delegatecall/callcode expose the parent's msg.value but transfer no ETH.
  if(['delegatecall','callcode','staticcall'].includes(t.type)||!n)continue;
  if(!['call','create','create2','selfdestruct','suicide'].includes(t.type)||!from||!target)throw Error('NATIVE_TRACE_TYPE_UNSUPPORTED');
  // Some explorers include the root call, others start at its first child.
  if(t.index===0&&from===payer&&target===to&&n===value)continue;
  moves.push({from,to:target,units:n,index:t.index});
 }
 return {moves,fee,payer};
}
module.exports={NATIVE,nativeSettlement};
