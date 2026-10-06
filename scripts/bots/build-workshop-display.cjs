// Separate display derivative: historical combat and practice bundles stay byte-identical.
require('./personal-native-path.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'art-src/bots/personal-v8'),work='D:/Temp/modelkombat-display-build-20261006',target=path.join(root,'public/bots-display/v2');
async function main(){
 fs.mkdirSync(work,{recursive:true});
 const ts=require('typescript'),program=ts.createProgram([path.join(source,'display-entry.ts')],{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,skipLibCheck:true,esModuleInterop:true,lib:['lib.es2020.d.ts','lib.dom.d.ts'],types:[]});
 const diagnostics=ts.getPreEmitDiagnostics(program);if(diagnostics.length)throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
 const wp=require('next/dist/compiled/webpack/webpack');wp.init();
 await new Promise((resolve,reject)=>{const compiler=wp.webpack({mode:'production',optimization:{minimize:false},devtool:false,target:'web',entry:path.join(source,'display-entry.ts'),output:{path:work,filename:'display.js'},resolve:{extensions:['.ts','.js','.json'],modules:[path.join(root,'node_modules')]},module:{rules:[{test:/\.ts$/,use:path.join(__dirname,'personal-loader.cjs')}]},plugins:[new wp.webpack.DefinePlugin({'process.env.NODE_ENV':JSON.stringify('production')})]});compiler.run((error,stats)=>compiler.close(close=>error||close||stats.hasErrors()?reject(error||close||Error(stats.toString({all:false,errors:true}))):resolve()));});
 const input=fs.readFileSync(path.join(work,'display.js'),'utf8').replaceAll('/assets/','/bots-playtest/assets/');
 const {code}=await require('next/dist/compiled/terser').minify(input,{compress:true,mangle:true,format:{comments:false}}),hash=crypto.createHash('sha256').update(code).digest('hex').slice(0,12),name=`display-${hash}.js`;
 fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,name),code);
 fs.writeFileSync(path.join(target,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Your robot</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;color-scheme:light}.studio{position:relative;width:100%;height:100dvh}canvas{display:block;width:100%;height:100%;touch-action:none}#game-model-status{position:absolute;bottom:1rem;left:1rem;padding:.5rem .75rem;border-radius:.5rem;background:#243733;color:#eef3e9;font:14px system-ui}button{padding:.6rem .85rem;background:#d9bd80;border:0;border-radius:.5rem;font:14px system-ui;cursor:pointer}</style></head><body><main class="studio"></main><script src="'+name+'"></script></body></html>');
 console.log(JSON.stringify({renderer:'/bots-display/v2/index.html',script:name,bytes:Buffer.byteLength(code),types:'passed'}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
