// A separate D-drive workspace; no Next output or dependency moves on C:.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),base='D:/Temp/modelkombat-release-reactor-pit-20260930/candidate',work='D:/Temp/modelkombat-arcade-20261005',deps='D:/Temp/modelkombat-tracking-deps-20261002/node_modules';
function copyChanged(from,to){
 if(fs.statSync(from).isDirectory()){fs.mkdirSync(to,{recursive:true});for(const name of fs.readdirSync(from))copyChanged(path.join(from,name),path.join(to,name));return;}
 const bytes=fs.readFileSync(from);if(fs.existsSync(to)&&fs.readFileSync(to).equals(bytes))return;
 fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,bytes);
}
if(!fs.existsSync(path.join(deps,'pixi.js')))throw Error('Existing Model Kombat D-drive dependencies are unavailable.');
fs.mkdirSync(work,{recursive:true});
if(!fs.existsSync(path.join(work,'src/app/layout.tsx'))){fs.cpSync(path.join(base,'src'),path.join(work,'src'),{recursive:true});}
for(const file of ['package.json','tsconfig.json','next-env.d.ts','postcss.config.js','tailwind.config.ts']){if(!fs.existsSync(path.join(work,file))&&fs.existsSync(path.join(base,file)))fs.copyFileSync(path.join(base,file),path.join(work,file));}
if(!fs.existsSync(path.join(work,'next.config.js')))fs.writeFileSync(path.join(work,'next.config.js'),"module.exports={distDir:'.arcade-preview',webpack(c){c.resolve.alias={...c.resolve.alias,'@react-native-async-storage/async-storage$':false};return c;}};\n");
if(!fs.existsSync(path.join(work,'node_modules')))fs.symlinkSync(deps,path.join(work,'node_modules'),'junction');
for(const folder of ['src/lib/bots/arcade','src/app/bots/arcade','public/bots-arcade','server-assets/bots8'])copyChanged(path.join(root,folder),path.join(work,folder));
for(const file of ['src/app/bots/_game/ArcadeKombat.tsx','src/app/bots/_game/ArcadeGarage.tsx','src/app/bots/_game/arcade-kombat.module.css','src/app/bots/_components/BotsRouteProviders.tsx','src/lib/bots/pit/controls.ts'])copyChanged(path.join(root,file),path.join(work,file));
for(const folder of ['public/bots-playtest/assets/catalogue-2','public/bots-playtest/assets/weapon-kits-1']){fs.mkdirSync(path.join(work,folder),{recursive:true});fs.copyFileSync(path.join(root,folder,'manifest.json'),path.join(work,folder,'manifest.json'));}
for(const name of ['Combat Loop.mp3','Workshop Groove.mp3'])if(fs.existsSync(path.join(root,'public',name)))fs.copyFileSync(path.join(root,'public',name),path.join(work,'public',name));
fs.cpSync(path.join(root,'public/bots-art/fonts'),path.join(work,'public/bots-art/fonts'),{recursive:true});
if(process.argv.includes('--sync')){console.log('Arcade source and sprite sheets synchronized to D:.');process.exit(0);}
console.log('Local arcade review: http://127.0.0.1:3194/bots/arcade');
const child=cp.spawn(process.execPath,[path.join(deps,'next/dist/bin/next'),'dev',work,'-p','3194','-H','127.0.0.1'],{env:{...process.env,NODE_PATH:deps,TEMP:'D:/Temp',TMP:'D:/Temp',NEXT_TELEMETRY_DISABLED:'1'},stdio:'inherit'});child.on('exit',c=>process.exitCode=c??1);
