/* Portable local-only test launcher. BOTS_PGLITE_PATH may select a local PGlite installation. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),oldResolve=Module._resolveFilename,oldLoad=Module._load;
Module._load=function(r,p,m){if(r==='server-only')return {};return oldLoad.call(this,r,p,m);};
Module._resolveFilename=function(r,p,m,o){return oldResolve.call(this,r.startsWith('@/')?path.join(root,'src',r.slice(2)):r,p,m,o);};
require.extensions['.ts']=function(m,f){m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText,f);};
process.env.BOTS_REPO_ROOT=root;process.env.BOTS_SEASON_STAGE=root;process.env.BOTS_SEASON_V1='1';process.env.BOTS_SEASON_ID='fixture-season';
const check=process.argv[2]==='--cannon'?'./bots-season-cannon-check.cjs':process.argv[2]==='--auth'?'./bots-season-auth-check.cjs':process.argv[2]==='--playback'?'./bots-season-playback-check.cjs':process.argv[2]==='--mcp-extension'?'./bots-season-mcp-extension-check.cjs':'./bots-season-check.cjs';
require(check);
