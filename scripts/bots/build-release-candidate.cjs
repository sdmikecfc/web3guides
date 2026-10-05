// Local build only. Existing settings are loaded into process memory, never copied.
const path=require('node:path'),fs=require('node:fs'),cp=require('node:child_process');
const source=path.resolve(__dirname,'../..'),out=process.env.MK_RELEASE_DIR;
if(!out||!/^D:[/\\]Temp[/\\]modelkombat-release-[\w-]+$/.test(out))throw Error('Set the reviewed D-drive release directory');
const candidate=path.join(out,'candidate');if(!fs.existsSync(path.join(out,'manifest.json')))throw Error('Missing reviewed manifest');
require('@next/env').loadEnvConfig(source,false,{info(){},error(){throw Error('Could not load existing site settings')}});
const env={...process.env,NEXT_TELEMETRY_DISABLED:'1',TEMP:'D:/Temp',TMP:'D:/Temp',DK_PREVIEW_DIST:'.mk-token-build',BOTS_TOKEN_ZONES:'1',NEXT_PUBLIC_BOTS_TOKEN_ZONES:'1'};
const log=fs.openSync(path.join(out,'production-build.log'),'w');
const r=cp.spawnSync(process.execPath,[path.join(candidate,'node_modules/next/dist/bin/next'),'build'],{cwd:candidate,env,stdio:['ignore',log,log]});fs.closeSync(log);
console.log(r.status===0?'PASS clean candidate production build.':'FAIL production build; inspect the local build log.');process.exitCode=r.status??1;
