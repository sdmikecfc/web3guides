import 'server-only';
import {createHash,timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {REPORT_LIMITS,validateProblemReport} from './problem-reports';
const configured=()=>process.env.DINER_REPORTS_ENABLED==='true'&&process.env.DINER_REPORTS_VERIFIED==='true'&&!!process.env.NEXT_PUBLIC_SUPABASE_URL&&!!process.env.SUPABASE_SERVICE_ROLE_KEY&&!!process.env.DINER_REPORTS_ADMIN_USER&&!!process.env.DINER_REPORTS_ADMIN_PASSWORD;
const db=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const response=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export function reportAdmin(authorization:string|null){const user=process.env.DINER_REPORTS_ADMIN_USER,pass=process.env.DINER_REPORTS_ADMIN_PASSWORD;if(!user||!pass)return false;const expected=Buffer.from(`Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`),actual=Buffer.from(authorization??'');return expected.length===actual.length&&timingSafeEqual(expected,actual);}
export async function reportsReady(){if(!configured())return false;try{const {data,error}=await db().rpc('diner_reports_retention_ready');return !error&&data===true;}catch{return false;}}
export async function submitProblemReport(req:Request){
 if(!await reportsReady())return response({error:'Reporting is not ready. Download your report instead.'},503);
 if(req.headers.get('origin')!==new URL(req.url).origin)return response({error:'Open reporting from the game.'},403);
 const reader=req.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 if(!reader)return response({error:'Choose a report.'},400);
 while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>REPORT_LIMITS.bytes){await reader.cancel();return response({error:'This report is too large.'},413);}chunks.push(chunk.value);}
 const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}const text=new TextDecoder().decode(buffer);
 let report;try{report=validateProblemReport(JSON.parse(text));}catch{}if(!report)return response({error:'This report could not be read.'},400);
 const ip=req.headers.get('x-forwarded-for')?.split(',')[0].trim()??'unknown';
 const key=createHash('sha256').update(`${process.env.DINER_REPORTS_ADMIN_PASSWORD}:${ip}`).digest('hex');
 const fingerprint=createHash('sha256').update(JSON.stringify(report)).digest('hex');
 const {data,error}=await db().rpc('diner_submit_problem_report',{p_id:report.id,p_rate_key:key,p_fingerprint:fingerprint,p_report:report});
 if(error)return response({error:'Your report has not been confirmed. Retry the same report.'},503);
 if(!data?.ok)return response({error:data?.reason==='limit'?'Please wait before sending another report. Your draft is saved.':'This report ID was already used.'},data?.reason==='limit'?429:409);
 return response({ok:true,id:report.id});
}
export async function reportInbox(req:Request){
 if(!configured())return response({error:'Not found'},404);
 if(!reportAdmin(req.headers.get('authorization')))return new Response('Authentication required',{status:401,headers:{'WWW-Authenticate':'Basic realm="Domain Kitchen reports", charset="UTF-8"','Cache-Control':'no-store'}});
 if(req.method!=='GET'&&req.headers.get('origin')!==new URL(req.url).origin)return response({error:'Use the developer inbox to update reports.'},403);
 const client=db(),cutoff=new Date(Date.now()-REPORT_LIMITS.days*86400000).toISOString();await client.from('diner_problem_reports').delete().lt('created_at',cutoff);
 if(req.method==='GET'){const query=new URL(req.url).searchParams,id=query.get('id');let select=client.from('diner_problem_reports').select(id?'id,created_at,status,payload':'id,created_at,status,category,build').order('created_at',{ascending:false}).limit(100);if(id)select=select.eq('id',id);if(query.get('category'))select=select.eq('category',query.get('category')!);if(query.get('build'))select=select.eq('build',query.get('build')!);const {data,error}=await select;return error?response({error:'Reports could not be loaded.'},503):response({ok:true,reports:data});}
 let body;try{body=await req.json();}catch{return response({error:'Choose a report.'},400);}if(typeof body.id!=='string'||!/^[a-f0-9-]{36}$/i.test(body.id))return response({error:'Choose a report.'},400);
 const result=req.method==='DELETE'?await client.from('diner_problem_reports').delete().eq('id',body.id):['new','investigating','resolved'].includes(body.status)?await client.from('diner_problem_reports').update({status:body.status}).eq('id',body.id):{error:true};return result.error?response({error:'That update was not saved.'},400):response({ok:true});
}
