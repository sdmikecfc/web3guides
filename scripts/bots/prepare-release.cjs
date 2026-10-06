// Select Model Kombat changes without staging another project's working files.
// Writes a separate Git index and build candidate on D:. Does not commit/push.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=process.env.MK_RELEASE_DIR||'D:/Temp/modelkombat-release-20260928';
if(!/^D:[/\\]Temp[/\\]modelkombat-release-[\w-]+$/.test(out))throw Error('Use an isolated D-drive release directory');
fs.mkdirSync(out,{recursive:true});
const index=path.join(out,'release.index'),env={...process.env,GIT_INDEX_FILE:index};
function git(args,input){return cp.execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,...args],{cwd:root,env,input,maxBuffer:32*1024*1024,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trimEnd()}
const head=git(['rev-parse','HEAD']);git(['read-tree',head]);
const changed=git(['diff','--name-only','-z',head]).split('\0').filter(Boolean),untracked=git(['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean);
const allowed=p=>/^(src\/(app\/(api\/bots|bots)|lib\/bots)\/|art-src\/bots\/|public\/(bots-playtest|bots-art|bots-arcade|bots-display)\/|server-assets\/bots8\/|scripts\/bots\/|scripts\/bots[^/]*\.(cjs|mjs|ts|py)$|scripts\/sql\/bots-(workshop|token)[^/]*\.sql$|docs\/(model-kombat|bots)[^/]*\.md$)/.test(p)||['public/Workshop Groove.mp3','public/Combat Loop.mp3','.vercelignore','docs/model-kombat-internal-ai-instruction.txt','docs/model-kombat-guided-release.txt'].includes(p);
// Historical source investigations contain private attribution references.
// Keep them locally; they are not runtime dependencies or public release docs.
const localOnly=new Set(['docs/model-kombat-order-router-tracking.md','docs/model-kombat-tracking-source-request.md','scripts/bots/verify-order-router-sample.cjs']);
const files=[...new Set([...changed,...untracked].filter(p=>allowed(p)&&!localOnly.has(p)))].sort();
for(let i=0;i<files.length;i+=80)git(['add','-f','-A','--',...files.slice(i,i+80)]);
const shared={};
// Reviewed same-line framework security patch; reject unrelated manifest edits.
const basePackage=JSON.parse(git(['show',`${head}:package.json`]));
basePackage.dependencies.next='14.2.35';basePackage.devDependencies['eslint-config-next']='14.2.35';
const packageText=fs.readFileSync(path.join(root,'package.json'),'utf8');
if(JSON.stringify(JSON.parse(packageText))!==JSON.stringify(basePackage))throw Error('Review other shared dependency changes before preparing this release');
shared['package.json']=packageText;shared['package-lock.json']=fs.readFileSync(path.join(root,'package-lock.json'),'utf8');
let middleware=git(['show',`${head}:src/middleware.ts`]);
const current=fs.readFileSync(path.join(root,'src/middleware.ts'),'utf8');
const block=current.match(/    \/\/ The domain entrance[\s\S]*?    gameUrl.pathname = pathname.startsWith/);
if(!block)throw Error('Model Kombat entry block missing');
const priorBlock=/    \/\/ The domain entrance[\s\S]*?    gameUrl.pathname = pathname.startsWith/;
middleware=priorBlock.test(middleware)?middleware.replace(priorBlock,block[0]):middleware.replace('    gameUrl.pathname = pathname.startsWith',block[0]);
// Public soundtracks must bypass host-specific page rewrites on every game domain.
if(!middleware.includes('|mp3|ogg|wav'))middleware=middleware.replace('|mp4|webm)', '|mp4|webm|mp3|ogg|wav)');
if(!middleware.includes('|mp3|ogg|wav'))throw Error('Review soundtrack middleware exclusion');
shared['src/middleware.ts']=middleware+'\n';
let config=git(['show',`${head}:next.config.js`]);
if(!config.includes('outputFileTracingIncludes'))config=config.replace("  webpack(config) {","  experimental: { outputFileTracingIncludes: { '/api/bots/workshop/**': ['./server-assets/bots8/**'] } },\n  webpack(config) {");shared['next.config.js']=config+'\n';
const {projectRendererHeaders}=require('./lib/renderer-headers.cjs');
const baseVercel=JSON.parse(git(['show',`${head}:vercel.json`]));
const currentVercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
shared['vercel.json']=JSON.stringify(projectRendererHeaders(baseVercel,currentVercel),null,2)+'\n';
for(const [name,value] of Object.entries(shared)){const hash=git(['hash-object','-w','--stdin','--path',name],value);git(['update-index','--add','--cacheinfo','100644',hash,name]);}
const selected=git(['diff','--cached','--name-only']).split('\n').filter(Boolean);
if(selected.some(p=>!allowed(p)&&!(p in shared)))throw Error('Unexpected release path');
const tree=git(['write-tree']);
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({head,tree,index,files:selected,sourceHashes:Object.fromEntries(files.filter(f=>fs.existsSync(path.join(root,f))).map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]))},null,2));
const candidate=path.join(out,'candidate');
if(process.argv.includes('--refresh')){
 if(!fs.existsSync(path.join(candidate,'package.json')))throw Error('Create the clean candidate before refreshing');
 const present=selected.filter(p=>fs.existsSync(path.join(root,p))||p in shared);
 for(let i=0;i<present.length;i+=40){
  git(['archive','--format=tar','-o',path.join(out,'updates.tar'),tree,...present.slice(i,i+40)]);
  cp.execFileSync('tar',['-xf',path.join(out,'updates.tar'),'-C',candidate]);
 }
 for(const p of selected.filter(p=>!present.includes(p))){const target=path.resolve(candidate,p);if(!target.startsWith(path.resolve(candidate)+path.sep))throw Error('Outside candidate');if(fs.existsSync(target))fs.unlinkSync(target);}
}else{
 git(['archive','--format=tar','-o',path.join(out,'candidate.tar'),tree]);
 fs.mkdirSync(candidate,{recursive:true});cp.execFileSync('tar',['-xf',path.join(out,'candidate.tar'),'-C',candidate]);
}
// A refreshed candidate must not retain earlier copies of local-only reports.
for(const name of localOnly){
 const target=path.resolve(candidate,name);
 if(!target.startsWith(path.resolve(candidate)+path.sep))throw Error('Outside candidate');
 if(fs.existsSync(target))fs.unlinkSync(target);
}
// Preserve the existing Vercel project selection, never credentials or env files.
const projectFile=path.join(root,'.vercel/project.json');
if(fs.existsSync(projectFile)){
 const p=JSON.parse(fs.readFileSync(projectFile,'utf8'));
 if(typeof p.projectId!=='string'||typeof p.orgId!=='string')throw Error('Existing Vercel project link is incomplete');
 fs.mkdirSync(path.join(candidate,'.vercel'),{recursive:true});
 fs.writeFileSync(path.join(candidate,'.vercel/project.json'),JSON.stringify({projectId:p.projectId,orgId:p.orgId,...(typeof p.projectName==='string'?{projectName:p.projectName}:{})}));
}
console.log(JSON.stringify({head,tree,fileCount:selected.length,candidate,manifest:path.join(out,'manifest.json')},null,2));
