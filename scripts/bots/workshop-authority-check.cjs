// Local compile/bundle harness. No credentials, live DB or account mutations.
require('./personal-native-path.cjs');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'../..'),out=path.join(process.env.TEMP||'D:/Temp','modelkombat-authority-check');
async function main(){
 const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile).config,options=ts.convertCompilerOptionsFromJson(config.compilerOptions,root).options;options.incremental=false;
 const dependencies=process.env.MK_NODE_MODULES||path.join(root,'node_modules');
 const entry=['next-env.d.ts','src/app/api/bots/workshop/route.ts','src/app/api/bots/workshop/auth/route.ts','src/app/bots/workshop/page.tsx'].map(p=>path.join(root,p)),host=ts.createCompilerHost(options);
 const read=host.readFile;host.readFile=f=>f.replaceAll('\\','/').includes('/art-src/')?undefined:read(f);
 const program=ts.createProgram(entry,options,host),errors=ts.getPreEmitDiagnostics(program);
 if(errors.length)throw Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
 console.log('Workshop and server compile without authoring source.');
 fs.mkdirSync(out,{recursive:true});const wp=require('next/dist/compiled/webpack/webpack');wp.init();
 await new Promise((resolve,reject)=>{const c=wp.webpack({mode:'development',target:'node',devtool:false,entry:path.join(__dirname,'workshop-authority-tests.cjs'),output:{path:out,filename:'tests.cjs'},resolve:{modules:[dependencies,'node_modules'],extensions:['.ts','.tsx','.js','.json'],alias:{'@':path.join(root,'src'),'server-only':path.join(root,'scripts/_shims/server-only.ts')}},module:{rules:[{test:/\.tsx?$/,use:path.join(__dirname,'personal-loader.cjs')}]}});c.run((e,s)=>c.close(ce=>e||ce||s.hasErrors()?reject(e||ce||Error(s.toString({all:false,errors:true}))):resolve()))});
 require(path.join(out,'tests.cjs'));
}
main().catch(e=>{console.error(e);process.exitCode=1});
