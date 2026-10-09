'use strict';
const assert=require('node:assert/strict');
const {reconstruct}=require('./lib/public-accounting.cjs');
const {nativeLedgerFixture,NATIVE}=require('./public-native-accounting-check.cjs');
const {USDC,TRANSFER}=require('./lib/public-trade-worker.cjs');
const a=n=>'0x'+String(n).padStart(40,'0'),hex=n=>'0x'+BigInt(n).toString(16),topic=s=>'0x'+s.slice(2).padStart(64,'0');
function fixture(){
 const f=nativeLedgerFixture(),wallet=a(1),pool=a(4),t={n:35,tx:topic(hex(35)),block:hex(35),blockHash:topic(hex(135)),fee:2n,payer:wallet,moves:[{from:pool,to:wallet,units:500n}],logs:[{address:USDC,topics:[TRANSFER,topic(wallet),topic(pool)],data:topic(hex(2000))}]};f.rows.push(t);
 const original=f.source.balance;f.source.balance=async(w,token,b)=>{const n=await original(w,token,b);return w===wallet&&token===USDC&&b===hex(50)?n-2000n:n;};
 f.source.nativeBalance=async(w,b)=>w===a(2)?1000n:b===hex(29)?98995n:99488n;
 f.source.nativeQuoteOutput=async tx=>tx===t.tx?{wallet,inputToken:USDC,inputUnits:'2000',nativeReceived:'500',kind:'native_quote_conversion'}:null;
 return {...f,t};
}
(async()=>{let f=fixture(),ledger=await reconstruct(f.options);const conversion=ledger.events.filter(e=>e.id.startsWith('chain:'+f.t.tx+':'));assert.equal(conversion.length,3);assert.deepEqual(conversion.map(e=>[e.token,e.kind,e.units]),[[USDC,'out','2000'],[NATIVE,'out','2'],[NATIVE,'buy','500']]);assert.equal(conversion[2].usd,'0.002000');assert.ok(conversion.every(e=>e.economicId===undefined&&e.notionalUsd===undefined));assert.equal(ledger.events.find(e=>e.economicId==='sale').usd,'11.999995');assert.equal(ledger.events.find(e=>e.economicId==='sale').notionalUsd,'12.000000');assert.ok(!conversion.some(e=>e.kind==='in'),'converted capital is not an external deposit');
 f=fixture();f.source.nativeBalance=async(w,b)=>w===a(2)?1000n:b===hex(29)?98995n:99489n;await assert.rejects(()=>reconstruct(f.options),/NATIVE_CLOSING_BALANCE_MISMATCH/);
 for(const change of [p=>({...p,wallet:a(99)}),p=>({...p,inputToken:a(88)}),p=>({...p,inputUnits:'0'}),p=>({...p,nativeReceived:'0'}),p=>({...p,kind:'domain_trade'})]){f=fixture();const original=f.source.nativeQuoteOutput;f.source.nativeQuoteOutput=async(...args)=>{const p=await original(...args);return p?change(p):null;};await assert.rejects(()=>reconstruct(f.options),/NATIVE_QUOTE_ACCOUNT_MISMATCH/);}
 f=fixture();f.t.moves.push({from:a(4),to:a(2),units:1n});await assert.rejects(()=>reconstruct(f.options),/NATIVE_QUOTE_ACCOUNT_MISMATCH/);
 console.log('PASS native quote output ledger: exact USDC spend, native receipts and own gas reconcile; no extra volume, profit, external deposit or eligible fill; wrong/mixed owners and mismatched balances rejected.');
})().catch(e=>{console.error(e);process.exitCode=1});
