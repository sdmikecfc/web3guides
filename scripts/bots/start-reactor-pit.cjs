// Local preview only. All generated output remains on D:, away from other apps.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const source=path.resolve(__dirname,'../..'),release='D:/Temp/modelkombat-release-reactor-pit-20260930',candidate=path.join(release,'candidate'),deps='D:/Temp/modelkombat-launch-work/node_modules';
const env={...process.env,MK_RELEASE_DIR:release,NODE_PATH:deps,DK_PREVIEW_DIST:'.mk-pit-preview',NEXT_TELEMETRY_DISABLED:'1',TEMP:'D:/Temp',TMP:'D:/Temp'};
if(!fs.existsSync(path.join(deps,'next/dist/bin/next')))throw Error('The existing D-drive Model Kombat dependencies are missing.');
if(!fs.existsSync(path.join(candidate,'package.json')))cp.execFileSync(process.execPath,[path.join(__dirname,'prepare-release.cjs')],{cwd:source,env,stdio:'inherit'});
if(!fs.existsSync(path.join(candidate,'node_modules')))fs.symlinkSync(deps,path.join(candidate,'node_modules'),'junction');
for(const name of ['src/lib/bots/pit','src/app/bots/pit'])fs.cpSync(path.join(source,name),path.join(candidate,name),{recursive:true});
for(const name of ['src/app/bots/_game/ReactorPit.tsx','src/app/bots/_game/reactor-pit.module.css','src/app/bots/_components/BotsRouteProviders.tsx','src/app/bots/_game/ConnectedWorkshop.tsx','src/app/bots/_game/useWorkshopMusic.tsx','src/lib/bots/workshop8/runtime/parts-assembly.ts','src/lib/bots/workshop8/runtime/source-receipt.json'])fs.copyFileSync(path.join(source,name),path.join(candidate,name));
console.log('Reactor Pit: http://127.0.0.1:3192/bots/pit — local practice only.');
const child=cp.spawn(process.execPath,[path.join(deps,'next/dist/bin/next'),'dev',candidate,'-p','3192','-H','127.0.0.1'],{env,stdio:'inherit'});child.on('exit',code=>{process.exitCode=code??1});
