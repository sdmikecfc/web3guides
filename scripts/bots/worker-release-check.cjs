'use strict';
// Cleanup tests use only a unique disposable D-drive fixture, never server paths.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {releaseId,verifyFiles,verifyRelease,pruneReleases}=require('./lib/worker-release.cjs');
const tempRoot=process.platform==='win32'?'D:/Temp':require('node:os').tmpdir();
const fixture=fs.mkdtempSync(path.join(tempRoot,'mk-release-check-'));
function makeRelease(base,name,content='one'){
 const dir=path.join(base,name);fs.mkdirSync(dir,{recursive:true});
 const files={'package.json':JSON.stringify({name:'model-kombat-tracking-worker'}),'scripts/worker.cjs':content};
 const manifest={purpose:'Model Kombat public trade collector',createdAt:new Date().toISOString(),files:[]};
 for(const [file,text] of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),text);manifest.files.push({path:file,sha256:crypto.createHash('sha256').update(text).digest('hex')});}
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));return {dir,manifest};
}
try{
 const base=path.join(fixture,'releases');fs.mkdirSync(base);
 const current=makeRelease(base,'1111111111111111'),previous=makeRelease(base,'2222222222222222'),obsolete=makeRelease(base,'3333333333333333');
 const id=releaseId(current.manifest),reordered={...current.manifest,createdAt:'2099-01-01',files:[...current.manifest.files].reverse()};
 assert.equal(releaseId(reordered),id,'timestamps and manifest order do not create new releases');
 const changed=makeRelease(base,'4444444444444444','two');assert.notEqual(releaseId(changed.manifest),id,'changed source creates a new release');
 assert.equal(verifyFiles(current.dir,id).releaseId,id);
 assert.throws(()=>verifyFiles(current.dir,'ffffffffffffffff'),/RELEASE_ID_MISMATCH/);
 for(const bad of ['../outside','/absolute','nested/../../escape','C:/escape','scripts\\escape','scripts//empty'])assert.throws(()=>releaseId({...current.manifest,files:[...current.manifest.files,{path:bad,sha256:'a'.repeat(64)}]}),/RELEASE_MANIFEST_INVALID/);
 assert.throws(()=>releaseId({...current.manifest,files:[...current.manifest.files,current.manifest.files[0]]}),/RELEASE_MANIFEST_DUPLICATE/);
 assert.throws(()=>releaseId({...current.manifest,purpose:'Other project'}),/RELEASE_MANIFEST_INVALID/);
 assert.throws(()=>verifyRelease(current.dir,id),'an incomplete install is never reusable');
 fs.writeFileSync(path.join(current.dir,'.install-complete.json'),JSON.stringify({releaseId:id,nodeMajor:Number(process.versions.node.split('.')[0])}));
 assert.throws(()=>verifyRelease(current.dir,id),'marker without dependencies is never reusable');
 for(const name of ['@next/env','@supabase/supabase-js','viem']){const mod=path.join(current.dir,'node_modules',name);fs.mkdirSync(mod,{recursive:true});fs.writeFileSync(path.join(mod,'package.json'),JSON.stringify({name,main:'index.js'}));fs.writeFileSync(path.join(mod,'index.js'),'module.exports = {};');}
 assert.equal(verifyRelease(current.dir,id).releaseId,id);
 fs.writeFileSync(path.join(current.dir,'.install-complete.json'),JSON.stringify({releaseId:id,nodeMajor:-1}));assert.throws(()=>verifyRelease(current.dir,id),/RELEASE_INSTALL_MARKER_INVALID/);
 fs.writeFileSync(path.join(changed.dir,'scripts/worker.cjs'),'tampered');assert.throws(()=>verifyFiles(changed.dir),/RELEASE_HASH_MISMATCH/);
 const unrelated=path.join(base,'5555555555555555');fs.mkdirSync(unrelated);fs.writeFileSync(path.join(unrelated,'keep.txt'),'unrelated');
 const unexpected=makeRelease(base,'do-not-remove');
 const outside=makeRelease(fixture,'6666666666666666');
 assert.throws(()=>pruneReleases(base,outside.dir,previous.dir),/RELEASE_RETENTION_PATH_INVALID/);
 assert.throws(()=>pruneReleases(base,current.dir,outside.dir),/RELEASE_RETENTION_PATH_INVALID/);
 const linked=path.join(base,'7777777777777777');fs.symlinkSync(outside.dir,linked,process.platform==='win32'?'junction':'dir');
 const linkInside=makeRelease(base,'8888888888888888');fs.symlinkSync(outside.dir,path.join(linkInside.dir,'external'),process.platform==='win32'?'junction':'dir');
 const linkedBase=path.join(fixture,'linked-base');fs.symlinkSync(base,linkedBase,process.platform==='win32'?'junction':'dir');
 assert.throws(()=>pruneReleases(linkedBase,path.join(linkedBase,path.basename(current.dir))),/RELEASE_SYMLINK_REFUSED/);
 assert.throws(()=>pruneReleases(base,linked),/RELEASE_SYMLINK_REFUSED/);
 const bin=path.join(obsolete.dir,'node_modules','.bin'),tool=path.join(obsolete.dir,'node_modules','test-tool','index.js');
 fs.mkdirSync(bin,{recursive:true});fs.mkdirSync(path.dirname(tool),{recursive:true});fs.writeFileSync(tool,'');
 try{fs.symlinkSync(tool,path.join(bin,'test-tool'),'file');}
 catch(e){if(process.platform!=='win32'||e.code!=='EPERM')throw e;console.log('SKIP Windows file-symlink permission: Linux npm executable-link cleanup case.');}
 const result=pruneReleases(base,current.dir,previous.dir);
 assert.deepEqual(result.removed,['3333333333333333'],'only verified obsolete releases are removed');
 for(const retained of [current.dir,previous.dir,changed.dir,unrelated,unexpected.dir,outside.dir,linked,linkInside.dir])assert.ok(fs.existsSync(retained),'retained '+path.basename(retained));
 assert.ok(!fs.existsSync(obsolete.dir));assert.equal(fs.readFileSync(path.join(outside.dir,'scripts/worker.cjs'),'utf8'),'one');
 console.log('PASS worker releases: stable content identity, integrity, completed local dependencies, current/previous retention, and refusal of unknown paths or symlinks.');
}finally{
 // This fixture is freshly created above, directly beneath our known temp root.
 const absolute=path.resolve(fixture);assert.equal(path.dirname(absolute),path.resolve(tempRoot));assert.ok(path.basename(absolute).startsWith('mk-release-check-'));
 // Remove fixture links explicitly without traversing their targets.
 for(const name of ['linked-base','releases/7777777777777777','releases/8888888888888888/external']){const link=path.join(absolute,name);try{if(fs.lstatSync(link).isSymbolicLink())fs.unlinkSync(link);}catch(e){if(e.code!=='ENOENT')throw e;}}
 fs.rmSync(absolute,{recursive:true,force:true});
}
