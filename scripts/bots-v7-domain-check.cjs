// Pure local remaster fixtures. No network, environment files, or services.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(process.env.BOTS_V7_REPO_ROOT||path.join(__dirname,'..'));
const overlay=process.env.BOTS_V7_SOURCE_ROOT?path.resolve(process.env.BOTS_V7_SOURCE_ROOT):null;
const ts=require(require.resolve('typescript',{paths:[root]})),resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,isMain,options){if(request.startsWith('@/')){const candidate=overlay&&path.join(overlay,'src',request.slice(2));request=candidate&&(fs.existsSync(candidate+'.ts')||fs.existsSync(path.join(candidate,'index.ts')))?candidate:path.join(root,'src',request.slice(2));}return resolve.call(this,request,parent,isMain,options);};
require.extensions['.ts']=function(mod,filename){mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,resolveJsonModule:true}}).outputText,filename);};
const selected=process.argv[2]||'bots-v7-domain-check.ts';if(!/^bots-v7-[a-z-]+-check\.ts$/.test(selected))throw new Error('Choose a remaster fixture script.');require(path.join(__dirname,selected));
