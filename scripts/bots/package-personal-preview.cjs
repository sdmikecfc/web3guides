// Build an allowlisted, static practice deployment. No account/server code ships.
require('../../.bots-preview/class-lineup/native-path.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../..'),study=path.join(repo,'.bots-preview/tank-bible-rebuild'),viewer=path.join(study,'viewer');
const release=path.join(repo,'.bots-preview/hosted-personal-v8',new Date().toISOString().replace(/[:.]/g,'-'));
const output=path.join(release,'.vercel/output'),site=path.join(output,'static');
const wp=require(path.join(repo,'node_modules/next/dist/compiled/webpack/webpack'));wp.init();
const copied=new Map();
function asset(url){
 if(!url.startsWith('/assets/')||url.includes('..')||url.includes('?'))throw Error('Invalid asset path '+url);
 const relative=url.slice(1),source=path.join(study,relative),target=path.join(site,relative);
 if(copied.has(relative))return;
 const bytes=fs.readFileSync(source);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
 copied.set(relative,{path:relative,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 if(url.endsWith('.glb')){const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());for(const item of [...(json.images??[]),...(json.buffers??[])])if(item.uri&&!item.uri.startsWith('data:'))asset(path.posix.join(path.posix.dirname(url),item.uri));}
}
async function main(){
 fs.mkdirSync(site,{recursive:true});
 await new Promise((resolve,reject)=>wp.webpack({mode:'production',optimization:{minimize:false},devtool:false,target:'web',entry:path.join(viewer,'main.ts'),output:{path:site,filename:'viewer.js',chunkFilename:'chunk-[id].js',publicPath:'/'},resolve:{extensions:['.ts','.js','.json'],modules:[path.join(repo,'node_modules')]},module:{rules:[{test:/\.ts$/,use:path.join(viewer,'typescript-loader.cjs')}]},plugins:[new wp.webpack.DefinePlugin({'process.env.NODE_ENV':JSON.stringify('production')})]},(err,stats)=>err||stats.hasErrors()?reject(err||Error(stats.toString({all:false,errors:true}))):resolve()));
 const terser=require(path.join(repo,'node_modules/next/dist/compiled/terser'));for(const file of fs.readdirSync(site).filter(f=>f.endsWith('.js'))){const minified=await terser.minify(fs.readFileSync(path.join(site,file),'utf8'),{compress:true,mangle:true,format:{comments:false}});fs.writeFileSync(path.join(site,file),minified.code);}
 for(const name of ['catalogue-2','weapon-kits-1']){
  const manifestUrl='/assets/'+name+'/manifest.json';asset(manifestUrl);
  const manifest=JSON.parse(fs.readFileSync(path.join(study,manifestUrl.slice(1)),'utf8'));
  for(const e of manifest.entries){asset(e.url);if(e.sha256&&copied.get(e.url.slice(1)).sha256!==e.sha256)throw Error('Asset hash mismatch: '+e.id);for(const slot of [...new Set([...e.slots,...(name==='catalogue-2'?['whole']:[])])])asset(`${e.thumbnailRoot}/${e.id}.${slot}.png`);if(name==='catalogue-2'&&e.tier===3)asset(`/assets/catalogue-2/painted/${e.family}.png`);}
 }
 for(const name of ['tank-t3-warden-v1.glb','tank-t3-warden-hammer-motion-2.glb','speed-t3-duelist-v1.glb','ranged-t3-tracker-v1.glb','warden-support-hand.glb','weapon-kits-1/special-equipment.glb','speed-t3-duelist-v1-concept.png','ranged-t3-tracker-v1-concept.png','arena-crowd-loop.mp4'])asset('/assets/'+name);
 for(const arena of ['spaceship','colosseum','basement'])for(const extension of ['png','mp4'])asset(`/assets/arenas-1/${arena}.${extension}`);
 fs.copyFileSync(path.join(study,'concepts/tank-t3-warden-v1.png'),path.join(site,'concept.png'));
 fs.copyFileSync(path.join(viewer,'styles.css'),path.join(site,'styles.css'));
 let html=fs.readFileSync(path.join(viewer,'index.html'),'utf8').replace('<title>Warden — Model Kombat</title>','<title>Model Kombat — Playtest</title><meta name="robots" content="noindex,nofollow">');
 html=html.replace('<script src="/viewer.js"></script>','<script>if(!new URLSearchParams(location.search).has("view")){history.replaceState(null,"","/?view=practice")}</script><script src="/viewer.js"></script>');
 fs.writeFileSync(path.join(site,'index.html'),html);
 fs.writeFileSync(path.join(site,'robots.txt'),'User-agent: *\nDisallow: /\n');
 const receipt={createdAt:new Date().toISOString(),scope:'Static Model Kombat workbench and practice playtest; no accounts or rewards',assets:[...copied.values()],versions:fs.readFileSync(path.join(viewer,'asset-versions.ts'),'utf8'),sourceBuild:JSON.parse(fs.readFileSync(path.join(viewer,'dist/build-manifest.json'),'utf8'))};
 fs.writeFileSync(path.join(release,'release-receipt.json'),JSON.stringify(receipt,null,2));
 fs.writeFileSync(path.join(site,'release.json'),JSON.stringify({createdAt:receipt.createdAt,scope:receipt.scope,versions:receipt.versions}));
 fs.writeFileSync(path.join(output,'config.json'),JSON.stringify({version:3,routes:[{src:'/(.*)',headers:{'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'},continue:true},{handle:'filesystem'},{src:'/',dest:'/index.html'}],overrides:Object.fromEntries([...copied.keys()].filter(p=>p.endsWith('.glb')).map(p=>[p,{contentType:'model/gltf-binary'}]))},null,2));
 fs.copyFileSync(path.join(repo,'.vercel/project.json'),path.join(release,'.vercel/project.json'));
 fs.writeFileSync(path.join(release,'vercel.json'),JSON.stringify({framework:null}));
 fs.writeFileSync(path.join(release,'.vercelignore'),'release-receipt.json\n');
 fs.writeFileSync(path.join(repo,'.bots-preview/hosted-personal-v8/latest.json'),JSON.stringify({release,assets:copied.size,megabytes:[...copied.values()].reduce((n,a)=>n+a.bytes,0)/1024/1024},null,2));
 console.log(JSON.stringify({release,assets:copied.size,megabytes:[...copied.values()].reduce((n,a)=>n+a.bytes,0)/1024/1024}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
