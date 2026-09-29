import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { botsDb, type BotsDb } from './db';
import { sessionFromRequest } from './session';

type Dependencies = { db: () => BotsDb; env: Record<string,string|undefined>; now: () => number; session: typeof sessionFromRequest };
class TrackingError extends Error { constructor(public status:number,public code:string,message:string){super(message)} }
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const address=(v:unknown):v is string=>typeof v==='string'&&/^0x[0-9a-f]{40}$/.test(v)&&!/^0x0{40}$/.test(v);
const digest=(s:string)=>createHash('sha256').update(s).digest();
const invalid=():never=>{throw new TrackingError(400,'invalid_request','Use the documented wallet lookup format.')};

async function readPayload(req:Request,now:number){
 if(req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new TrackingError(415,'content_type','Send application/json.');
 const reader=req.body?.getReader()??invalid();
 const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const item=await reader.read();if(item.done)break;length+=item.value.byteLength;
  if(length>8192){await reader.cancel();throw new TrackingError(413,'body_too_large','Send one wallet lookup at a time.')}chunks.push(item.value);
 }}finally{reader.releaseLock()}
 let row:any;try{row=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{invalid()}
 const keys=['schemaVersion','requestId','wallet','mcpWallet','domaUserId','privyDid','status','checkedAt','expectedRevision'];
 if(!row||Array.isArray(row)||typeof row!=='object'||Object.keys(row).length!==keys.length||keys.some(k=>!(k in row))||row.schemaVersion!==1)invalid();
 for(const key of ['wallet','mcpWallet'])if(typeof row[key]==='string')row[key]=row[key].toLowerCase();
 if(!address(row.wallet)||typeof row.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.requestId)
  ||!Number.isInteger(row.expectedRevision)||row.expectedRevision<0||row.expectedRevision>999999999)invalid();
 if(typeof row.checkedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.checkedAt))invalid();
 const t=Date.parse(row.checkedAt);if(!Number.isFinite(t)||new Date(t).toISOString()!==row.checkedAt||t>now+60000||t<now-7*86400000)invalid();
 if(row.status==='linked'){
  if(!address(row.mcpWallet)||typeof row.domaUserId!=='string'||!/^\d{1,30}$/.test(row.domaUserId)
   ||(row.privyDid!==null&&(typeof row.privyDid!=='string'||!/^did:privy:[A-Za-z0-9_-]{1,100}$/.test(row.privyDid))))invalid();
 }else if(row.status!=='not_found'||row.mcpWallet!==null||row.domaUserId!==null||row.privyDid!==null)invalid();
 return row;
}

/** Reuses the existing Doma AI trade-feed credential. These routes only map wallets. */
export function createWalletTrackingHandlers(deps:Dependencies={db:botsDb,env:process.env,now:Date.now,session:sessionFromRequest}){
 function enabled(){if(deps.env.MK_WALLET_TRACKING_ENABLED!=='1')throw new TrackingError(503,'tracking_disabled','Wallet tracking setup is not enabled yet.')}
 function authorize(req:Request){
  enabled();const token=deps.env.MK_MCP_INGEST_TOKEN,auth=req.headers.get('authorization')??'';
  if(!token||token.length<32||token.length>512||/\s/.test(token))throw new TrackingError(503,'resolver_unconfigured','Wallet lookup is not configured.');
  if(auth.length>520||!auth.startsWith('Bearer ')||!timingSafeEqual(digest(auth.slice(7)),digest(token)))throw new TrackingError(401,'unauthorized','A valid wallet resolver credential is required.');
 }
 function failure(e:unknown){return e instanceof TrackingError?reply({ok:false,code:e.code,error:e.message},e.status):reply({ok:false,code:'tracking_unavailable',error:'Wallet tracking is unavailable. Retry safely.'},503)}
 return {
  async GET(req:Request){try{
   authorize(req);const q=new URL(req.url).searchParams,after=q.get('after'),scope=q.get('scope')??'pending';
   if([...q.keys()].some(k=>!['after','scope'].includes(k))||q.getAll('after').length>1||q.getAll('scope').length>1||(after!==null&&!address(after))||!['pending','all','monitor'].includes(scope))invalid();
   // Page by connected wallet; monitoring returns both addresses in each row.
   let query=deps.db().from(deps.env.BOTS_TOKEN_ZONES==='1'?'mkz_wallet_discovery':'mk8_wallet_discovery').select('wallet,since,status,mcp_wallet,revision,checked_at').order('wallet').limit(501);
   if(after)query=query.gt('wallet',after);if(scope==='pending')query=query.neq('status','linked');
   const {data,error}=await query;if(error||!Array.isArray(data))throw Error('Discovery unavailable');
   const rows=data.slice(0,500);let monitored:any[]=[];
   if(scope==='monitor'&&rows.length){const read=await deps.db().from(deps.env.BOTS_TOKEN_ZONES==='1'?'mkz_tracking_wallets':'mk8_tracking_wallets').select('player_wallet,trade_wallet,since').in('player_wallet',rows.map(r=>r.wallet)).limit(10001);if(read.error||!Array.isArray(read.data)||read.data.length>10000)throw Error('Watchlist unavailable');monitored=read.data;}
   return reply({ok:true,schemaVersion:1,generatedAt:new Date(deps.now()).toISOString(),lookupIntervalHours:4,
    wallets:rows.map(r=>({wallet:r.wallet,since:r.since,status:r.status,mcpWallet:r.mcp_wallet,expectedRevision:r.revision,checkedAt:r.checked_at,
      ...(scope==='monitor'?{tradeWallets:monitored.filter(x=>x.player_wallet===r.wallet).map(x=>x.trade_wallet)}:{})})),
    nextCursor:data.length>500?rows[rows.length-1].wallet:null});
  }catch(e){return failure(e)}},
  async POST(req:Request){try{
   authorize(req);const payload=await readPayload(req,deps.now()),{data,error}=await deps.db().rpc(deps.env.BOTS_TOKEN_ZONES==='1'?'mkz_resolve_wallet':'mk8_resolve_wallet',{p_payload:payload});
   if(error){
    if(/MK_LINK_(CONFLICT|REVIEW_REQUIRED)/.test(error.message))throw new TrackingError(409,'mapping_conflict','Refresh the lookup list. An existing or overlapping wallet mapping requires review.');
    if(error.message.includes('MK_LINK_UNREGISTERED'))throw new TrackingError(422,'unregistered_wallet','This wallet is not a registered game player.');
    if(error.message.includes('MK_LINK_INVALID'))invalid();throw error;
   }
   if(!data?.ok||data.wallet!==payload.wallet)throw Error('Invalid mapping receipt');return reply(data);
  }catch(e){return failure(e)}},
  async activity(req:Request){try{
   enabled();const session=deps.session(req);if(!session)throw new TrackingError(401,'sign_in','Connect and sign in to your wallet.');
   // Never accept a wallet supplied in the URL or body for the personal read.
   const {data,error}=await deps.db().rpc('mk8_linked_trade_activity',{p_wallet:session.wallet});
   if(error||!data||!Array.isArray(data.wallets)||!Array.isArray(data.recentObservedTrades))throw Error('Activity unavailable');
   return reply({ok:true,...data});
  }catch(e){return failure(e)}}
 };
}
