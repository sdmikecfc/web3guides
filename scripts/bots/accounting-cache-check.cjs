'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const {openAccountingCache}=require('./lib/accounting-cache.cjs');
const tempBase=process.platform==='win32'?'D:/Temp':os.tmpdir();
const root=fs.mkdtempSync(path.join(tempBase,'mk-accounting-cache-test-'));
const modulePath=path.join(__dirname,'lib/accounting-cache.cjs');
const anchor={number:'0x100',hash:'0x'+'a'.repeat(64)};
const identity=n=>({method:'eth_call',params:[{to:'0x'+'b'.repeat(40),data:'0x'+n.toString(16)},'0x80']});
const open=(name,extra={})=>openAccountingCache({directory:path.join(root,name),chainId:97477,...extra});
const rpc=cache=>cache.namespace({kind:'finalized-rpc',scope:{anchor}});
const nsDirs=dir=>fs.readdirSync(dir).filter(n=>n.startsWith('ns-')).map(n=>path.join(dir,n));
const records=dir=>nsDirs(dir).flatMap(n=>fs.readdirSync(n).filter(f=>/^[a-f0-9]{64}\.json$/.test(f)).map(f=>path.join(n,f)));
const childPrefix=`const fs=require('fs');const native=fs.realpathSync.native;fs.realpathSync=native;fs.realpathSync.native=native;const {openAccountingCache}=require(${JSON.stringify(modulePath)});`;
function child(code){return cp.spawnSync(process.execPath,['-e',childPrefix+code],{encoding:'utf8',timeout:10000,windowsHide:true,env:{SystemRoot:process.env.SystemRoot||'',TEMP:tempBase,TMP:tempBase}});}
async function concurrent(code){
 return new Promise((resolve,reject)=>{const p=cp.spawn(process.execPath,['-e',childPrefix+code],{windowsHide:true,env:{SystemRoot:process.env.SystemRoot||'',TEMP:tempBase,TMP:tempBase},stdio:['ignore','pipe','pipe']});let output='';const timer=setTimeout(()=>{p.kill();reject(Error('CACHE_TEST_CHILD_TIMEOUT'));},15000);p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('error',reject);p.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('CACHE_TEST_CHILD_FAILED:'+code+':'+output));});});
}
async function main(){
 const cache=open('roundtrip'),store=rpc(cache),value={amount:123456789012345678901234567890n,negative:-9n,text:'123456789012345678901234567890',array:[null,true,-0,1.25],nested:{tag:[4,'not a bigint']}};
 assert.equal(store.get(identity(1)),undefined);assert.equal(store.set(identity(1),value),true);assert.deepEqual(store.get(identity(1)),value);
 assert.deepEqual(rpc(open('roundtrip')).get(identity(1)),value,'new process instance reuses durable values');
 assert.equal(openAccountingCache({directory:path.join(root,'roundtrip'),chainId:1}).namespace({kind:'finalized-rpc',scope:{anchor}}).get(identity(1)),undefined);
 assert.equal(rpc(open('roundtrip',{schemaVersion:'accounting-evidence-2'})).get(identity(1)),undefined);
 assert.equal(cache.namespace({kind:'finalized-rpc',scope:{anchor:{...anchor,hash:'0x'+'c'.repeat(64)}}}).get(identity(1)),undefined);
 assert.throws(()=>cache.namespace({kind:'finalized-rpc',scope:{anchor:{...anchor,number:9007199254740992}}}),/ANCHOR_REQUIRED/);
 assert.throws(()=>cache.namespace({kind:'finalized-rpc',scope:{}}),/ANCHOR_REQUIRED/);
 assert.throws(()=>store.set({method:'eth_call',params:[{},'latest']},1n),/MUTABLE_RPC/);
 assert.throws(()=>store.set({method:'eth_blockNumber',params:[]},'0x100'),/MUTABLE_RPC/);
 assert.throws(()=>store.set('latest',1),/RPC_IDENTITY_REQUIRED/);
 assert.throws(()=>store.set({method:'eth_getBalance',params:['0x'+'b'.repeat(40)]},'0x1'),/UNFINALIZED_RPC/);
 assert.throws(()=>store.set({method:'eth_getBalance',params:['0x'+'b'.repeat(40),'0x101']},'0x1'),/UNFINALIZED_RPC/);
 const receiptIdentity={method:'eth_getTransactionReceipt',params:['0x'+'d'.repeat(64)]},receipt={transactionHash:'0x'+'d'.repeat(64),blockHash:'0x'+'e'.repeat(64),blockNumber:'0x90',logs:[]};
 assert.throws(()=>store.set(receiptIdentity,null),/UNFINALIZED_RPC/);
 assert.throws(()=>store.set(receiptIdentity,{...receipt,blockNumber:'0x101'}),/UNFINALIZED_RPC/);
 assert.throws(()=>store.set(receiptIdentity,{...receipt,transactionHash:'0x'+'f'.repeat(64)}),/RPC_RESULT_MISMATCH/);
 assert.equal(store.set(receiptIdentity,receipt),true);assert.deepEqual(store.get(receiptIdentity),receipt);
 assert.throws(()=>store.set({method:'eth_getBlockByNumber',params:['0x90',false]},{number:'0x91',hash:receipt.blockHash}),/RPC_RESULT_MISMATCH/);
 assert.throws(()=>store.set(identity(2),{amount:9007199254740992}),/UNSAFE_NUMBER/);
 assert.throws(()=>store.set({...identity(2),apiKey:'CACHE_TEST_SECRET_CANARY'},value),/PRIVATE_FIELD/);
 assert.throws(()=>store.set(identity(2),{authorization:'CACHE_TEST_SECRET_CANARY'}),/PRIVATE_FIELD/);
 const circular={};circular.circular=circular;assert.throws(()=>store.set(identity(2),circular),/VALUE_CYCLE/);
 const scope={anchor,wallet:'PUBLIC_IDENTITY_CANARY',from:1,through:2,pass:1};
 const checkpoint=cache.namespace({kind:'history-checkpoint',scope});
 assert.equal(checkpoint.setCheckpoint({scan:1},{cursor:{block_number:123n,index:7},complete:false,rows:[value]}),true);
 assert.deepEqual(checkpoint.getCheckpoint({scan:1}),{cursor:{block_number:123n,index:7},complete:false,rows:[value]});
 assert.equal(checkpoint.get({scan:1}),undefined);assert.throws(()=>checkpoint.set({scan:2},value),/CHECKPOINT_REQUIRED/);
 for(const file of records(path.join(root,'roundtrip'))){const text=fs.readFileSync(file,'utf8');assert.ok(!text.includes('PUBLIC_IDENTITY_CANARY'));assert.ok(!text.includes('CACHE_TEST_SECRET_CANARY'));if(process.platform!=='win32')assert.equal(fs.statSync(file).mode&0o777,0o600);}
 // Corrupt one record: the entire namespace becomes misses, independent
 // namespaces survive, and no malformed value reaches financial calculations.
 const corrupt=open('corruption'),a=rpc(corrupt),b=corrupt.namespace({kind:'accounting',scope:{run:1}});
 a.set(identity(1),10n);a.set(identity(2),20n);b.set('keep',30n);
 const damaged=records(path.join(root,'corruption')).find(f=>fs.readFileSync(f,'utf8').includes('"10"'));fs.writeFileSync(damaged,'{"partial":');
 assert.equal(a.get(identity(1)),undefined);assert.equal(a.get(identity(2)),undefined);assert.equal(b.get('keep'),30n);
 a.set(identity(3),40n);const unsupported=records(path.join(root,'corruption')).find(f=>fs.readFileSync(f,'utf8').includes('"40"'));
 const body=JSON.parse(fs.readFileSync(unsupported,'utf8'));delete body.sha256;body.version=999;body.sha256=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');fs.writeFileSync(unsupported,JSON.stringify(body));assert.equal(a.get(identity(3)),undefined);
 // A child really exits between fsync of the temporary entry and rename.
 // Reopening reclaims only its dead-owner lock, removes the orphan temp file,
 // reconciles reservations, and preserves the previous committed value.
 const crashDir=path.join(root,'interrupted'),crash=open('interrupted'),crashStore=rpc(crash);crashStore.set(identity(1),{old:1n});
 const exited=child(`const cache=openAccountingCache({directory:${JSON.stringify(crashDir)},chainId:97477});const store=cache.namespace({kind:'finalized-rpc',scope:{anchor:${JSON.stringify(anchor)}}});const rename=fs.renameSync;fs.renameSync=(a,b)=>{if(require('path').basename(require('path').dirname(b)).startsWith('ns-')&&b.endsWith('.json'))process.exit(77);return rename(a,b)};store.set(${JSON.stringify(identity(1))},{new:2n});`);
 assert.equal(exited.status,77,exited.stderr);assert.deepEqual(rpc(open('interrupted')).get(identity(1)),{old:1n});
 assert.ok(nsDirs(crashDir).every(d=>fs.readdirSync(d).every(f=>!f.startsWith('.tmp-'))));
 fs.writeFileSync(path.join(crashDir,'index.json'),'broken index');assert.deepEqual(rpc(open('interrupted')).get(identity(1)),{old:1n});
 // Bounded storage evicts old evidence, never returns another key's value,
 // and rejects oversized values without damaging committed entries.
 const bounded=open('bounded',{maxBytes:1800,maxEntryBytes:1200,maxEntries:2}),boundedStore=rpc(bounded);
 for(let i=1;i<=8;i++){assert.equal(boundedStore.set(identity(i),{n:i,big:BigInt(i),padding:'x'.repeat(200)}),true);const stats=bounded.stats();assert.ok(stats.bytes<=1800&&stats.entries<=2);}
 assert.equal(boundedStore.get(identity(1)),undefined);assert.equal(boundedStore.get(identity(8)).big,8n);
 assert.equal(boundedStore.set(identity(9),'x'.repeat(4000)),false);assert.equal(boundedStore.get(identity(8)).big,8n);
 // Release/source trees, directory links, namespace links and unsafe paths
 // cannot redirect cache writes or cleanup into unrelated files.
 assert.throws(()=>openAccountingCache({directory:'relative',chainId:97477}),/PATH_UNSAFE/);
 assert.throws(()=>openAccountingCache({directory:path.join(__dirname,'cache'),chainId:97477}),/PATH_UNSAFE/);
 const outside=path.join(root,'outside'),link=path.join(root,'linked');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'keep.txt'),'untouched');fs.symlinkSync(outside,link,process.platform==='win32'?'junction':'dir');
 assert.throws(()=>openAccountingCache({directory:link,chainId:97477}),/PATH_UNSAFE/);assert.equal(fs.readFileSync(path.join(outside,'keep.txt'),'utf8'),'untouched');
 const hostile=open('hostile'),hostileStore=rpc(hostile);hostileStore.set(identity(1),1n);const ns=nsDirs(path.join(root,'hostile'))[0];for(const f of fs.readdirSync(ns))fs.unlinkSync(path.join(ns,f));fs.rmdirSync(ns);fs.symlinkSync(outside,ns,process.platform==='win32'?'junction':'dir');
 assert.throws(()=>hostileStore.get(identity(1)),/PATH_UNSAFE/);assert.throws(()=>hostileStore.clear(),/PATH_UNSAFE/);assert.equal(fs.readFileSync(path.join(outside,'keep.txt'),'utf8'),'untouched');
 // Two real writers share the quota and atomic index under a process lock.
 const concurrentDir=path.join(root,'concurrent');
 const writer=id=>`const wait=()=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);function retry(f){for(let i=0;i<200;i++)try{return f()}catch(e){if(e.message!=='ACCOUNTING_CACHE_BUSY')throw e;wait()}throw Error('CACHE_TEST_BUSY_TIMEOUT')}const cache=retry(()=>openAccountingCache({directory:${JSON.stringify(concurrentDir)},chainId:97477,maxEntries:3,maxBytes:3000,maxEntryBytes:1200}));const store=cache.namespace({kind:'accounting',scope:{worker:${id}}});for(let i=0;i<25;i++)retry(()=>store.set({i},{number:BigInt(i),padding:'x'.repeat(100)}));`;
 const writers=await Promise.allSettled([concurrent(writer(1)),concurrent(writer(2))]);for(const result of writers)if(result.status==='rejected')throw result.reason;
 const combined=openAccountingCache({directory:concurrentDir,chainId:97477,maxEntries:3,maxBytes:3000,maxEntryBytes:1200});assert.ok(combined.stats().entries<=3&&combined.stats().bytes<=3000);
 console.log('PASS durable accounting cache: lossless BigInt, version/anchor isolation, safe immutable identities, atomic interruption recovery, namespace corruption quarantine, bounded concurrent writes, checkpoints, permissions and path confinement. No network or database calls.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
 const resolved=path.resolve(root),base=path.resolve(tempBase);assert.ok(resolved.startsWith(base+path.sep)&&path.basename(resolved).startsWith('mk-accounting-cache-test-'));
 fs.rmSync(resolved,{recursive:true,force:true});
});
