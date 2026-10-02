// Local acceptance fixture only. An isolated, in-memory PostgreSQL database.
// Never contacts Supabase; bind exclusively to loopback. Run Next with this URL
// and a dummy key to exercise the actual server routes without live accounts.
const {createServer}=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.BOTS_PGLITE_PATH||'D:/Temp/modelkombat-sql-check/node_modules/@electric-sql/pglite');
const tables=new Set(['mk8_players','mk8_garages','mk8_guest_sessions','mk8_journey_requests','mk8_player_days','mk8_workshops','mk8_public_fights','mk8_competitions','mk8_competition_entries','mk8_competition_attempts']);
const functions={mk8_competition_commit:['p_player','p_garage','p_revision','p_request','p_state','p_day','p_public','p_wallet'],mk8_competition_enter:['p_id','p_wallet','p_campaign'],mk8_competition_scores:['p_id','p_wallet','p_period'],mk8_guest_enroll:['p_hash','p_bucket','p_state'],mk8_wallet_player:['p_wallet'],mk8_claim_guest:['p_wallet','p_hash'],mk8_select_garage:['p_player','p_garage'],mk8_journey_commit:['p_player','p_garage','p_revision','p_request','p_state','p_day','p_public']};
async function main(){
 const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls');
 for(const name of ['bots-workshop-v8.sql','bots-workshop-journey.sql','bots-workshop-competition.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../sql',name),'utf8'));
 if(process.env.MK_ZONE_FIXTURE==='1'){
  await db.exec('create table battle_bots_players(wallet text primary key,enlisted_at timestamptz,is_test boolean default false,is_operator boolean default false)');
  for(const name of ['bots-workshop-wallet-links.sql','bots-token-zones.sql','bots-token-zone-wallets.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../sql',name),'utf8'));
  Object.assign(functions,{mkz_read:['p_wallet'],mkz_register_wallet:['p_wallet'],mkz_commit:['p_player','p_garage','p_revision','p_request','p_state','p_day','p_public','p_wallet']});
  tables.add('mkz_wallet_discovery');
 }
 await db.exec('set role service_role');
 let failCommunity=false;
 const server=createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');try{
  const url=new URL(req.url,'http://127.0.0.1'),parts=url.pathname.split('/').filter(Boolean);let data;
  if(url.pathname==='/__fixture/community-failure'&&req.method==='POST'){failCommunity=url.searchParams.get('enabled')==='1';res.end(JSON.stringify({fixture:true,failCommunity}));return;}
  if(parts[0]!=='rest'||parts[1]!=='v1')throw Error('Local fixture only supports game storage');
  if(parts[2]==='rpc'){
   const name=parts[3],keys=functions[name];if(req.method!=='POST'||!keys)throw Error('Unknown fixture operation');
   let text='';for await(const chunk of req){text+=chunk;if(text.length>2000000)throw Error('Body too large')}
   const body=JSON.parse(text),values=keys.map(k=>typeof body[k]==='object'&&body[k]!==null?JSON.stringify(body[k]):body[k]??null);
   data=(await db.query(`select ${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) as value`,values)).rows[0].value;
  }else{
   const table=parts[2];if(failCommunity&&table==='mk8_public_fights'&&url.searchParams.get('limit')==='12')throw Error('Simulated unavailable feed');if(req.method!=='GET'||!tables.has(table))throw Error('Unknown fixture table');
   const fields=url.searchParams.get('select')||'*';if(!/^(\*|[a-z_,]+)$/.test(fields))throw Error('Invalid fields');
   const values=[],where=[];for(const [key,value]of url.searchParams){if(['select','order','limit'].includes(key))continue;if(!/^[a-z_]+$/.test(key)||!value.startsWith('eq.'))throw Error('Invalid filter');values.push(value.slice(3));where.push(`${key}=$${values.length}`)}
   let sql=`select ${fields} from ${table}${where.length?' where '+where.join(' and '):''}`;
   const order=url.searchParams.get('order');if(order){if(!/^[a-z_]+\.(asc|desc)$/.test(order))throw Error('Invalid order');sql+=' order by '+order.replace('.',' ')}
   sql+=' limit '+Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||100)));data=(await db.query(sql,values)).rows;
   if(req.headers.accept?.includes('vnd.pgrst.object'))data=data[0]??null;
  }
  res.end(JSON.stringify(data));
 }catch(e){res.statusCode=400;res.end(JSON.stringify({code:e.code||'FIXTURE',message:e.message,details:null,hint:null}))}});
 server.listen(3174,'127.0.0.1',()=>console.log('Isolated journey SQL fixture: http://127.0.0.1:3174 (empty, temporary game database)'));
 process.on('SIGINT',()=>server.close(()=>void db.close().then(()=>process.exit())));
}
main().catch(e=>{console.error(e);process.exitCode=1});
