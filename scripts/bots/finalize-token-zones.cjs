// Operator tool; dry-run by default. Never transfers tokens or opens competition.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {finalAwardsFromSnapshot}=require('../../src/lib/bots/token-zone-finalization.ts');
async function main(){
 const root=path.resolve(__dirname,'../..');require('@next/env').loadEnvConfig(root,false,{info(){},error(){throw Error('Settings unavailable')}});
 const {createClient}=require('@supabase/supabase-js');
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.rpc('mkz_read',{p_wallet:null});if(error)throw Error('Could not read complete source snapshot');
 const awards=finalAwardsFromSnapshot(data);
 console.log(`Calculated ${awards.length} participant/token awards. No transfers made.`);
 if(process.argv.includes('--freeze-reviewed-awards')){const r=await db.rpc('mkz_finalize',{p_snapshot:data,p_awards:awards});if(r.error)throw Error('Finalization refused; reconcile or recalculate before retrying');console.log('Final awards frozen. Token transfers remain a separate operation.');}
 else console.log('Dry run only. Nothing written.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
