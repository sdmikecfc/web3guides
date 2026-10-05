require('./personal-native-path.cjs');
const path=require('node:path'),fs=require('node:fs');
const out=process.env.MK_MANUAL_OUTPUT||'D:/Temp/modelkombat-manual-review';if(!/^D:[/\\]/i.test(out))throw Error('D-drive output required');
async function main(){fs.mkdirSync(out,{recursive:true});const wp=require('next/dist/compiled/webpack/webpack');wp.init();await new Promise((resolve,reject)=>{const c=wp.webpack({mode:'development',target:'node',devtool:false,entry:path.join(__dirname,'manual-combat-tests.cjs'),output:{path:out,filename:'tests.cjs'},resolve:{modules:[path.resolve('node_modules')],extensions:['.ts','.js','.json']},module:{rules:[{test:/\.ts$/,use:path.join(__dirname,'personal-loader.cjs')}]}});c.run((e,s)=>c.close(ce=>e||ce||s.hasErrors()?reject(e||ce||Error(s.toString({all:false,errors:true}))):resolve()));});await require(path.join(out,'tests.cjs'));}
main().catch(e=>{console.error(e);process.exitCode=1});
