// Checks browser-workshop transactions without touching wallet or production data.
require('./personal-native-path.cjs');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'../..'),output=path.join(root,'.bots-preview/workshop-check');
async function main(){
 const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile).config;
 const options=ts.convertCompilerOptionsFromJson(config.compilerOptions,root).options;options.incremental=false;
 // Production excludes asset-authoring source. Fail here if a runtime import
 // starts depending on that local-only directory again.
 const host=ts.createCompilerHost(options),readFile=host.readFile,fileExists=host.fileExists;
 const authoring=file=>file.replaceAll('\\','/').includes('/art-src/');
 host.readFile=file=>authoring(file)?undefined:readFile(file);
 host.fileExists=file=>!authoring(file)&&fileExists(file);
 const program=ts.createProgram([path.join(root,'next-env.d.ts'),path.join(root,'src/app/bots/workshop/page.tsx')],options,host);
 const errors=ts.getPreEmitDiagnostics(program);if(errors.length)throw Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
 fs.mkdirSync(output,{recursive:true});
 const wp=require('next/dist/compiled/webpack/webpack');wp.init();
 await new Promise((resolve,reject)=>{const compiler=wp.webpack({mode:'development',target:'node',devtool:false,entry:path.join(__dirname,'workshop-state-check.cjs'),output:{path:output,filename:'check.cjs'},resolve:{extensions:['.ts','.tsx','.js','.json']},module:{rules:[{test:/\.tsx?$/,use:path.join(__dirname,'personal-loader.cjs')}]}});compiler.run((err,stats)=>compiler.close(close=>err||close||stats.hasErrors()?reject(err||close||Error(stats.toString({all:false,errors:true}))):resolve()))});
 require(path.join(output,'check.cjs'));
 console.log('Connected workshop: deployment without art-src, strict TypeScript and state checks passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
