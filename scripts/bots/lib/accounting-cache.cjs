'use strict';
// Optional local evidence cache. A hit is not proof of financial completeness.
// Callers must revalidate the saved finalized anchor before reusing a namespace.
// Checkpoints may resume work, but never certify mutable Explorer pages by themselves.
// maxBytes bounds reserved entry bytes; the bounded index and one atomic-write
// temporary file add at most O(maxEntries) and maxEntryBytes storage overhead.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const FORMAT='mk-accounting-cache',VERSION=1;
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const fail=code=>{throw Error('ACCOUNTING_CACHE_'+code);};
const plain=x=>x!==null&&typeof x==='object'&&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const secret=/^(?:authorization|proxy-authorization|api[-_]?(?:key|token)|password|secret|client[-_]?secret|private[-_]?key|service[-_]?role[-_]?key|access[-_]?token|refresh[-_]?token|cookie|set-cookie|headers)$/i;
function encode(value){
 const seen=new Set();let nodes=0;
 function visit(v,depth){
  if(depth>48||++nodes>500000)fail('VALUE_TOO_COMPLEX');
  if(v===null)return [0];
  if(typeof v==='boolean')return [1,v];
  if(typeof v==='string')return [2,v];
  if(typeof v==='number'){
   if(!Number.isFinite(v)||(Number.isInteger(v)&&!Number.isSafeInteger(v)))fail('UNSAFE_NUMBER');
   return [3,Object.is(v,-0)?'-0':String(v)];
  }
  if(typeof v==='bigint')return [4,String(v)];
  if(!Array.isArray(v)&&!plain(v))fail('VALUE_UNSUPPORTED');
  if(seen.has(v))fail('VALUE_CYCLE');seen.add(v);
  let out;
  if(Array.isArray(v))out=[5,v.map(x=>visit(x,depth+1))];
  else out=[6,Object.keys(v).sort().map(k=>{
   if(k==='__proto__'||secret.test(k))fail('PRIVATE_FIELD');
   const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!('value'in d))fail('VALUE_UNSUPPORTED');
   return [k,visit(d.value,depth+1)];
  })];
  seen.delete(v);return out;
 }
 return visit(value,0);
}
function decode(encoded){
 let nodes=0;
 function visit(v,depth){
  if(depth>48||++nodes>500000||!Array.isArray(v))fail('CORRUPT');
  const [tag,data]=v;
  if(tag===0&&v.length===1)return null;
  if(v.length!==2)fail('CORRUPT');
  if(tag===1&&typeof data==='boolean')return data;
  if(tag===2&&typeof data==='string')return data;
  if(tag===3&&typeof data==='string'){
   const n=Number(data);if(!Number.isFinite(n)||(Number.isInteger(n)&&!Number.isSafeInteger(n))||(data!=='-0'&&String(n)!==data))fail('CORRUPT');return n;
  }
  if(tag===4&&typeof data==='string'&&/^-?(?:0|[1-9]\d*)$/.test(data))return BigInt(data);
  if(tag===5&&Array.isArray(data))return data.map(x=>visit(x,depth+1));
  if(tag===6&&Array.isArray(data)){
   const result={};let previous=null;
   for(const pair of data){
    if(!Array.isArray(pair)||pair.length!==2||typeof pair[0]!=='string'||pair[0]==='__proto__'||secret.test(pair[0])||(previous!==null&&pair[0]<=previous))fail('CORRUPT');
    previous=pair[0];Object.defineProperty(result,pair[0],{value:visit(pair[1],depth+1),enumerable:true,writable:true,configurable:true});
   }
   return result;
  }
  fail('CORRUPT');
 }
 return visit(encoded,0);
}
function checksum(body){return {...body,sha256:digest(JSON.stringify(body))};}
function verified(text){
 let record;try{record=JSON.parse(text);}catch{fail('CORRUPT');}
 if(!plain(record)||typeof record.sha256!=='string')fail('CORRUPT');
 const {sha256,...body}=record;if(digest(JSON.stringify(body))!==sha256)fail('CORRUPT');return body;
}
function positive(n,name){if(!Number.isSafeInteger(n)||n<=0)fail(name);return n;}
function inside(parent,child){const rel=path.relative(parent,child);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
function openAccountingCache(options={}){
 const {directory,chainId,schemaVersion='accounting-evidence-1',maxBytes=128*1024*1024,maxEntryBytes=4*1024*1024,maxEntries=20000}=options;
 if(typeof directory!=='string'||!path.isAbsolute(directory))fail('PATH_UNSAFE');
 const root=path.resolve(directory),release=path.resolve(__dirname,'../../..');
 if(root===path.parse(root).root||inside(release,root))fail('PATH_UNSAFE');
 positive(chainId,'CHAIN_INVALID');positive(maxBytes,'LIMIT_INVALID');positive(maxEntryBytes,'LIMIT_INVALID');positive(maxEntries,'LIMIT_INVALID');
 if(maxEntryBytes>maxBytes||typeof schemaVersion!=='string'||!/^[a-zA-Z0-9._-]{1,80}$/.test(schemaVersion))fail('CONFIG_INVALID');
 const nsPattern=/^ns-[a-f0-9]{64}$/,filePattern=/^[a-f0-9]{64}\.json$/,tmpPattern=/^\.tmp-[a-f0-9]{32}$/,lockPattern=/^\.lock-(\d+)-([a-f0-9]{32})$/;
 const indexPath=path.join(root,'index.json'),lockPath=path.join(root,'write.lock');
 function safePath(file,allowMissing=false){
  const full=path.resolve(file);if(!inside(root,full))fail('PATH_UNSAFE');
  let at=path.parse(full).root;
  for(const part of full.slice(at.length).split(path.sep).filter(Boolean)){
   at=path.join(at,part);let s;try{s=fs.lstatSync(at);}catch(e){if(e.code==='ENOENT'&&allowMissing)continue;throw e;}
   if(s.isSymbolicLink())fail('PATH_UNSAFE');
   if(at!==full&&!s.isDirectory())fail('PATH_UNSAFE');
  }
  return full;
 }
 safePath(root,true);fs.mkdirSync(root,{recursive:true,mode:0o700});safePath(root);fs.chmodSync(root,0o700);
 function read(file,limit){
  safePath(file);const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  try{const s=fs.fstatSync(fd);if(!s.isFile()||s.nlink!==1)fail('PATH_UNSAFE');if(s.size>limit)fail('CORRUPT');return fs.readFileSync(fd,'utf8');}finally{fs.closeSync(fd);}
 }
 function atomic(file,bytes){
  safePath(path.dirname(file));safePath(file,true);
  const temporary=path.join(path.dirname(file),'.tmp-'+crypto.randomBytes(16).toString('hex'));
  let fd;
  try{
   fd=fs.openSync(temporary,'wx',0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
   fs.renameSync(temporary,file);fs.chmodSync(file,0o600);
   if(process.platform!=='win32'){const dir=fs.openSync(path.dirname(file),fs.constants.O_RDONLY);try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
  }finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(temporary);}catch(e){if(e.code!=='ENOENT')throw e;}}
 }
 function alive(pid){if(!Number.isSafeInteger(pid)||pid<=0)return true;try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}}
 function processIdentity(pid){
  if(process.platform!=='linux')return null;
  try{const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8'),started=stat.slice(stat.lastIndexOf(')')+2).split(' ')[19];return fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim()+':'+started;}catch{return null;}
 }
 function ownerAlive(pid,file){
  if(!alive(pid))return false;
  try{const record=JSON.parse(read(file,1024)),current=processIdentity(pid);if(record.pid===pid&&typeof record.processIdentity==='string'&&current&&current!==record.processIdentity)return false;}catch{}
  return true;
 }
 function removeEmpty(dir){try{fs.rmdirSync(dir);}catch(e){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))throw e;}}
 function locked(task){
  const token=crypto.randomBytes(16).toString('hex'),owner='owner-'+process.pid+'-'+token+'.json',stage=path.join(root,'.lock-'+process.pid+'-'+token);
  fs.mkdirSync(stage,{mode:0o700});
  try{fs.writeFileSync(path.join(stage,owner),JSON.stringify({pid:process.pid,token,processIdentity:processIdentity(process.pid)}),{flag:'wx',mode:0o600});}
  catch(e){try{fs.unlinkSync(path.join(stage,owner));}catch{}removeEmpty(stage);throw e;}
  let acquired=false;
  try{
   for(let attempt=0;attempt<3;attempt++){
    try{safePath(lockPath,true);fs.renameSync(stage,lockPath);acquired=true;break;}
    catch(e){
     if(!['EEXIST','ENOTEMPTY','EPERM','EACCES'].includes(e.code))throw e;
     let owners;try{safePath(lockPath);if(!fs.lstatSync(lockPath).isDirectory())fail('PATH_UNSAFE');owners=fs.readdirSync(lockPath);}catch(error){if(error.code==='ENOENT')continue;throw error;}
     if(!owners.length){removeEmpty(lockPath);continue;}
     const match=owners.length===1&&/^owner-(\d+)-([a-f0-9]{32})\.json$/.exec(owners[0]);if(!match||ownerAlive(Number(match[1]),path.join(lockPath,owners[0])))fail('BUSY');
     // Delete only the dead owner's unique filename. A competing replacement
     // has a different filename, so it cannot be unlinked by this recovery.
     const stale=path.join(lockPath,owners[0]);safePath(stale,true);try{fs.unlinkSync(stale);}catch(error){if(error.code!=='ENOENT')throw error;}removeEmpty(lockPath);
    }
   }
   if(!acquired)fail('BUSY');return task();
  }finally{
   const dir=acquired?lockPath:stage,target=path.join(dir,owner);safePath(target,true);
   try{fs.unlinkSync(target);}catch(e){if(e.code!=='ENOENT')throw e;}removeEmpty(dir);
  }
 }
 function scan(){
  const entries=[];
  for(const name of fs.readdirSync(root)){
   if(['index.json','write.lock'].includes(name))continue;
   const target=path.join(root,name);try{safePath(target);}catch(e){if(e.code==='ENOENT')continue;throw e;}
   const lock=lockPattern.exec(name);
   if(lock){let stat;try{stat=fs.lstatSync(target);}catch(e){if(e.code==='ENOENT')continue;throw e;}if(!stat.isDirectory())fail('PATH_UNSAFE');const owner='owner-'+lock[1]+'-'+lock[2]+'.json';if(!ownerAlive(Number(lock[1]),path.join(target,owner))){const files=fs.readdirSync(target);if(files.some(f=>f!==owner))fail('LAYOUT_UNSAFE');if(files.length){const file=path.join(target,owner);safePath(file);fs.unlinkSync(file);}removeEmpty(target);}continue;}
   if(tmpPattern.test(name)){if(!fs.lstatSync(target).isFile())fail('LAYOUT_UNSAFE');fs.unlinkSync(target);continue;}
   if(!nsPattern.test(name)||!fs.lstatSync(target).isDirectory())fail('LAYOUT_UNSAFE');
   for(const file of fs.readdirSync(target)){
    const dest=path.join(target,file);safePath(dest);const s=fs.lstatSync(dest);if(!s.isFile()||s.nlink!==1)fail('PATH_UNSAFE');
    if(tmpPattern.test(file)){fs.unlinkSync(dest);continue;}
    if(!filePattern.test(file))fail('LAYOUT_UNSAFE');
    entries.push({namespace:name,file,bytes:s.size,at:s.mtimeMs});
   }
  }
  return entries;
 }
 function writeIndex(entries){atomic(indexPath,JSON.stringify(checksum({format:FORMAT,version:VERSION,entries})));}
 function loadIndex(){
  try{
   const index=verified(read(indexPath,Math.max(1024*1024,maxEntries*300)));
   if(index.format!==FORMAT||index.version!==VERSION||!Array.isArray(index.entries))fail('CORRUPT');
   const seen=new Set();for(const e of index.entries){const key=e.namespace+'/'+e.file;if(!nsPattern.test(e.namespace)||!filePattern.test(e.file)||!Number.isSafeInteger(e.bytes)||e.bytes<0||!Number.isFinite(e.at)||seen.has(key))fail('CORRUPT');seen.add(key);}
   return index.entries;
  }catch(e){if(e.message==='ACCOUNTING_CACHE_PATH_UNSAFE')throw e;const entries=scan();writeIndex(entries);return entries;}
 }
 function evict(entries,extraBytes=0,extraCount=0,protectedKey=null){
  let bytes=entries.reduce((s,e)=>s+e.bytes,0);entries.sort((a,b)=>a.at-b.at||a.file.localeCompare(b.file));
  while(bytes+extraBytes>maxBytes||entries.length+extraCount>maxEntries){
   const at=entries.findIndex(e=>e.namespace+'/'+e.file!==protectedKey);if(at<0)return false;
   const [entry]=entries.splice(at,1),file=path.join(root,entry.namespace,entry.file);safePath(file,true);
   try{fs.unlinkSync(file);}catch(e){if(e.code!=='ENOENT')throw e;}removeEmpty(path.dirname(file));bytes-=entry.bytes;
  }
  return true;
 }
 locked(()=>{const entries=scan();evict(entries);writeIndex(entries);});
 function namespace({kind,scope}={}){
  if(!['finalized-rpc','history-checkpoint','accounting'].includes(kind))fail('NAMESPACE_INVALID');
  if(!plain(scope))fail('NAMESPACE_INVALID');
  if(kind==='finalized-rpc'){
   const a=scope.anchor;
   if(!plain(a)||typeof a.hash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(a.hash)||(typeof a.number==='number'&&!Number.isSafeInteger(a.number))||!/^0x[0-9a-f]+$|^\d+$/i.test(String(a.number)))fail('ANCHOR_REQUIRED');
   scope={...scope,anchor:{...a,number:BigInt(a.number).toString(),hash:a.hash.toLowerCase()}};
  }
  const id=digest(JSON.stringify(encode({chainId,schemaVersion,kind,scope}))),name='ns-'+id,dir=path.join(root,name);
  function key(identity,type){
   if(kind==='finalized-rpc'&&type==='value'){
    if(!plain(identity)||typeof identity.method!=='string'||!Array.isArray(identity.params))fail('RPC_IDENTITY_REQUIRED');
    if(!['eth_getCode','eth_getBlockByNumber','eth_getBlockByHash','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getBalance','eth_getStorageAt','eth_call'].includes(identity.method))fail('MUTABLE_RPC');
    if(/"(?:latest|pending|safe|finalized)"/.test(JSON.stringify(encode(identity))))fail('MUTABLE_RPC');
    const at={eth_getCode:1,eth_getBlockByNumber:0,eth_getBalance:1,eth_getStorageAt:2,eth_call:1}[identity.method];
    if(at!==undefined){const block=identity.params[at];if(typeof block!=='string'||!/^0x[0-9a-f]+$/i.test(block)||BigInt(block)>BigInt(scope.anchor.number))fail('UNFINALIZED_RPC');}
   }
   return digest(JSON.stringify(encode({chainId,schemaVersion,kind,type,identity})));
  }
  function discard(){return locked(()=>{
   let entries=loadIndex();safePath(dir,true);
   if(fs.existsSync(dir)){for(const file of fs.readdirSync(dir)){if(!filePattern.test(file)&&!tmpPattern.test(file))fail('LAYOUT_UNSAFE');const target=path.join(dir,file);safePath(target);if(!fs.lstatSync(target).isFile())fail('PATH_UNSAFE');fs.unlinkSync(target);}fs.rmdirSync(dir);}
   entries=entries.filter(e=>e.namespace!==name);writeIndex(entries);
  });}
  function get(identity,type){
   const entry=key(identity,type),file=path.join(dir,entry+'.json');
   try{
    const body=verified(read(file,maxEntryBytes));
    if(body.format!==FORMAT||body.version!==VERSION||body.schemaVersion!==schemaVersion||body.chainId!==chainId||body.namespace!==id||body.entry!==entry||body.type!==type)fail('CORRUPT');
    return decode(body.value);
   }catch(e){
    if(e.code==='ENOENT')return undefined;
    if(e.message==='ACCOUNTING_CACHE_PATH_UNSAFE')throw e;
    try{discard();}catch(error){if(error.message!=='ACCOUNTING_CACHE_BUSY')throw error;}
    return undefined;
   }
  }
  function set(identity,value,type){
   if(kind==='history-checkpoint'&&type==='value')fail('CHECKPOINT_REQUIRED');
   const entry=key(identity,type),file=entry+'.json';
   if(kind==='finalized-rpc'&&type==='value'){
    const method=identity.method;
    if(['eth_getTransactionReceipt','eth_getTransactionByHash','eth_getBlockByHash','eth_getBlockByNumber'].includes(method)){
     const number=method.startsWith('eth_getBlock')?value?.number:value?.blockNumber,blockHash=method.startsWith('eth_getBlock')?value?.hash:value?.blockHash;
     if(!plain(value)||typeof number!=='string'||!/^0x[0-9a-f]+$/i.test(number)||BigInt(number)>BigInt(scope.anchor.number)||typeof blockHash!=='string'||!/^0x[0-9a-f]{64}$/i.test(blockHash))fail('UNFINALIZED_RPC');
     if(method==='eth_getBlockByNumber'&&BigInt(number)!==BigInt(identity.params[0]))fail('RPC_RESULT_MISMATCH');
     const actual=method==='eth_getTransactionReceipt'?value.transactionHash:value.hash;
     if(method!=='eth_getBlockByNumber'&&(typeof actual!=='string'||actual.toLowerCase()!==String(identity.params[0]).toLowerCase()))fail('RPC_RESULT_MISMATCH');
    }
   }
   const text=JSON.stringify(checksum({format:FORMAT,version:VERSION,schemaVersion,chainId,namespace:id,entry,type,value:encode(value)})),bytes=Buffer.byteLength(text);
   if(bytes>maxEntryBytes)return false;
   return locked(()=>{
    const entries=loadIndex(),old=entries.find(e=>e.namespace===name&&e.file===file),reserve=Math.max(bytes,old?.bytes||0),delta=reserve-(old?.bytes||0);
    if(!evict(entries,delta,old?0:1,name+'/'+file))return false;
    safePath(dir,true);fs.mkdirSync(dir,{recursive:true,mode:0o700});safePath(dir);fs.chmodSync(dir,0o700);
    const record={namespace:name,file,bytes:reserve,at:Date.now()};if(old)Object.assign(old,record);else entries.push(record);
    // Reserve space first. A crash can over-count a reservation, never make a
    // committed entry invisible to the quota. Reopening reconciles actual files.
    writeIndex(entries);atomic(path.join(dir,file),text);return true;
   });
  }
  return {get:identity=>get(identity,'value'),set:(identity,value)=>set(identity,value,'value'),getCheckpoint:identity=>get(identity,'checkpoint'),setCheckpoint:(identity,value)=>set(identity,value,'checkpoint'),clear:discard};
 }
 return {namespace,stats:()=>locked(()=>{const entries=loadIndex();return {entries:entries.length,bytes:entries.reduce((n,e)=>n+e.bytes,0),maxEntries,maxBytes};})};
}
module.exports={openAccountingCache};
