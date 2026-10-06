'use strict';
// Narrow release validation/cleanup for the standalone Model Kombat collector.
// Never clean a parent directory, an unrecognized release, or a symbolic link.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const PURPOSE='Model Kombat public trade collector';
const PACKAGE='model-kombat-tracking-worker';
const RELEASES='/opt/model-kombat-tracking/releases';
const ID=/^[a-f0-9]{16}$/;
function fail(code){throw Error(code);}
function inside(parent,child){const relative=path.relative(parent,child);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
function noLinks(target){
 const absolute=path.resolve(target),root=path.parse(absolute).root;
 let cursor=root;
 for(const segment of absolute.slice(root.length).split(path.sep).filter(Boolean)){
  cursor=path.join(cursor,segment);
  if(fs.lstatSync(cursor).isSymbolicLink())fail('RELEASE_SYMLINK_REFUSED');
 }
 return absolute;
}
function realDirectory(target){const absolute=noLinks(target);if(!fs.lstatSync(absolute).isDirectory())fail('RELEASE_DIRECTORY_REQUIRED');return absolute;}
function regularFile(target){noLinks(target);if(!fs.lstatSync(target).isFile())fail('RELEASE_FILE_REQUIRED');return fs.readFileSync(target);}
function entries(manifest){
 if(!manifest||manifest.purpose!==PURPOSE||!Array.isArray(manifest.files)||manifest.files.length===0||manifest.files.length>1000)fail('RELEASE_MANIFEST_INVALID');
 const seen=new Set();
 const result=manifest.files.map(item=>{
  if(!item||typeof item.path!=='string'||item.path.length>240||!item.path.split('/').every(part=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part))||item.path==='manifest.json'||!/^[a-f0-9]{64}$/.test(item.sha256||''))fail('RELEASE_MANIFEST_INVALID');
  // Case-folding also avoids ambiguous packages prepared on Windows.
  const key=item.path.toLowerCase();if(seen.has(key))fail('RELEASE_MANIFEST_DUPLICATE');seen.add(key);
  return {path:item.path,sha256:item.sha256};
 });
 if(!seen.has('package.json'))fail('RELEASE_PACKAGE_MISSING');
 return result.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
function releaseId(manifest){return crypto.createHash('sha256').update(JSON.stringify(entries(manifest).map(item=>[item.path,item.sha256]))).digest('hex').slice(0,16);}
function verifyFiles(dir,expectedId){
 const absolute=realDirectory(dir),manifest=JSON.parse(regularFile(path.join(absolute,'manifest.json')).toString('utf8'));
 const id=releaseId(manifest);
 if(expectedId!==undefined&&(!ID.test(expectedId)||expectedId!==id))fail('RELEASE_ID_MISMATCH');
 for(const item of entries(manifest)){
  const file=path.resolve(absolute,...item.path.split('/'));
  if(!inside(absolute,file))fail('RELEASE_PATH_ESCAPE');
  if(crypto.createHash('sha256').update(regularFile(file)).digest('hex')!==item.sha256)fail('RELEASE_HASH_MISMATCH');
 }
 if(JSON.parse(regularFile(path.join(absolute,'package.json')).toString('utf8')).name!==PACKAGE)fail('RELEASE_PACKAGE_INVALID');
 return {releaseId:id,manifest};
}
function verifyRelease(dir,expectedId){
 const result=verifyFiles(dir,expectedId),absolute=path.resolve(dir);
 const marker=JSON.parse(regularFile(path.join(absolute,'.install-complete.json')).toString('utf8'));
 const nodeMajor=Number(process.versions.node.split('.')[0]);
 if(marker.releaseId!==result.releaseId||marker.nodeMajor!==nodeMajor)fail('RELEASE_INSTALL_MARKER_INVALID');
 const localRequire=createRequire(path.join(absolute,'package.json'));
 for(const name of ['@next/env','@supabase/supabase-js','viem']){
  let resolved;try{resolved=localRequire.resolve(name);}catch{fail('RELEASE_DEPENDENCY_MISSING');}
  if(!inside(path.join(absolute,'node_modules'),resolved))fail('RELEASE_DEPENDENCY_OUTSIDE_RELEASE');
  regularFile(resolved);
 }
 return {...result,nodeMajor};
}
function containsUnsafeLink(dir,releaseRoot=dir){
 for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  if(item.isSymbolicLink()){
   // npm creates executable shims here on Linux. They may only point to a
   // regular file inside this same release; fs.rm unlinks, never follows them.
   const target=fs.realpathSync(path.join(dir,item.name));
   if(path.relative(releaseRoot,dir)!==path.join('node_modules','.bin')||!inside(releaseRoot,target)||!fs.statSync(target).isFile())return true;
  }
  if(item.isDirectory()&&containsUnsafeLink(path.join(dir,item.name),releaseRoot))return true;
 }
 return false;
}
function retainedPath(base,target,required){
 if(!target){if(required)fail('RELEASE_CURRENT_REQUIRED');return null;}
 const absolute=path.resolve(target);
 if(path.dirname(absolute)!==base||!ID.test(path.basename(absolute)))fail('RELEASE_RETENTION_PATH_INVALID');
 if(!fs.existsSync(absolute)){if(required)fail('RELEASE_CURRENT_MISSING');return absolute;}
 realDirectory(absolute);
 return absolute;
}
function pruneReleases(base,current,previous=''){
 const absolute=realDirectory(base),keepCurrent=retainedPath(absolute,current,true),keepPrevious=retainedPath(absolute,previous,false);
 // An invalid active release must never authorize cleanup of its predecessors.
 verifyFiles(keepCurrent);
 const result={removed:[],preserved:[]};
 for(const item of fs.readdirSync(absolute,{withFileTypes:true})){
  const candidate=path.join(absolute,item.name);
  if(candidate===keepCurrent||candidate===keepPrevious||!ID.test(item.name)||!item.isDirectory()||item.isSymbolicLink()){
   result.preserved.push(item.name);continue;
  }
  try{
   // Old installers used an archive hash as the directory name. Validate the
   // package itself, without requiring that legacy name to equal its new ID.
   verifyFiles(candidate);
   if(containsUnsafeLink(candidate))throw Error('RELEASE_SYMLINK_REFUSED');
   // Recheck immediately before deletion; never follow a replaced directory.
   if(fs.lstatSync(candidate).isSymbolicLink()||path.dirname(noLinks(candidate))!==absolute)throw Error('RELEASE_PATH_ESCAPE');
   fs.rmSync(candidate,{recursive:true,force:false});
   result.removed.push(item.name);
  }catch{result.preserved.push(item.name);}
 }
 return result;
}
if(require.main===module){
 try{
  const [command,...args]=process.argv.slice(2);
  if(command==='id'&&args.length===1)console.log(releaseId(JSON.parse(regularFile(args[0]).toString('utf8'))));
  else if(command==='verify-files'&&args.length===2)console.log(JSON.stringify({releaseId:verifyFiles(args[0],args[1]).releaseId}));
  else if(command==='verify'&&args.length===2)console.log(JSON.stringify({releaseId:verifyRelease(args[0],args[1]).releaseId}));
  else if(command==='prune'&&(args.length===1||args.length===2))console.log(JSON.stringify(pruneReleases(RELEASES,args[0],args[1]||'')));
  else fail('RELEASE_COMMAND_INVALID');
 }catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'RELEASE_VALIDATION_FAILED');process.exitCode=1;}
}
module.exports={releaseId,verifyFiles,verifyRelease,pruneReleases};
