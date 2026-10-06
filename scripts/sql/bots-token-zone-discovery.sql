-- Minimal private Doma handoff. Our worker owns trade collection and accounting.
-- Apply after bots-token-zone-accounting.sql. No new login, dates or rewards.
begin;
create table if not exists public.mkz_strategy_references (
 participant text not null, id text not null, revision bigint not null check(revision>0),
 wallet text not null check(wallet~'^0x[0-9a-f]{40}$'), payload jsonb not null,
 primary key(participant,id)
);
create table if not exists public.mkz_strategy_coverage (
 participant text primary key, coverage_from timestamptz not null, confirmed_through timestamptz not null,
 complete boolean not null, problem text, updated_at timestamptz not null default now(),
 check(coverage_from<=confirmed_through)
);
create table if not exists public.mkz_discovery_requests (
 request_id uuid primary key,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
create table if not exists public.mkz_worker_runs (
 id uuid primary key, checked_at timestamptz not null default now(), report jsonb not null
);

-- A Strategy execution reference proves association, not volume or profitability.
-- Revoked references retain the wallet association for historical accounting.
create or replace view public.mkz_wallets with(security_barrier=true) as
 select doma_user_id participant,wallet trade_wallet from mkz_all_links where status='linked'
 union select doma_user_id,mcp_wallet from mkz_all_links where status='linked' and mcp_wallet is not null
 union select participant,wallet from mkz_strategy_references;

create or replace function public.mkz_discovery_manifest() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare m jsonb;
begin
 m:=mkz_collector_manifest();
 return (m-'accounting')||jsonb_build_object('handoff','mk-discovery-1','mode','identity_and_strategy_references_only',
  'accounting',jsonb_build_object('owner','Model Kombat backend','aiCalculatesScores',false),
  'references',jsonb_build_object('rpc','mkz_discovery_references','maxRows',2000,'maxBytes',2000000,
   'fields',jsonb_build_array('id','revision','chainId','wallet','strategyId','orderId','transactionHash','domainToken','quoteToken','domainUnits','quoteUnits','side','executedAt','status','evidence'),
   'instructions','Use completed Strategy order settlements only. Units are positive raw integers, not decimals. Stable source fill IDs; corrections increment revision; revoke withdrawn fills. A transaction hash alone is insufficient. Fetch from registration/opening through the cutoff, including corrections. No balances, prices, fills for agent wallets, or accounting.'),
  'coverage',jsonb_build_object('fields',jsonb_build_array('schemaVersion','requestId','participant','coverageFrom','confirmedThrough','complete','problem','refs'),
   'instructions','Send each linked account, including zero Strategy fills. A failed or incomplete query must send complete=false and a short problem. Missing accounts are never assumed to have zero activity.'));
end $$;

create or replace function public.mkz_discovery_accounts() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if (select count(distinct doma_user_id) from mkz_all_links where status='linked')>20000 then raise exception 'MKZ_REGISTRY_LIMIT';end if;
 return coalesce((select jsonb_agg(x order by x.participant) from (
  select l.doma_user_id participant,min(p.since) registered_at,
   coalesce(c.starts_at,min(p.since)) reference_since,
   array_agg(distinct l.wallet order by l.wallet) registered_wallets,
   array_remove(array_agg(distinct l.mcp_wallet order by l.mcp_wallet),null) agent_wallets,
   (select to_jsonb(v) from mkz_strategy_coverage v where v.participant=l.doma_user_id) coverage
  from mkz_all_links l join mkz_tracking_players p on p.wallet=l.wallet
  cross join mkz_campaigns c where l.status='linked' and c.id='model-kombat-zones-1'
  group by l.doma_user_id,c.starts_at
 )x),'[]');
end $$;

create or replace function public.mkz_discovery_references(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r jsonb; old jsonb; prior mkz_discovery_requests; cv mkz_strategy_coverage;
 uid text; rid uuid; start_at timestamptz; stop_at timestamptz; required_from timestamptz; k text; ids text[]:='{}'; result jsonb;
begin
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>2000000
 or p->'schemaVersion' is distinct from '1'::jsonb
 or coalesce(p->>'participant','')!~'^[0-9]{1,30}$'
 or coalesce(p->>'requestId','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(p->'complete') is distinct from 'boolean' or jsonb_typeof(p->'refs') is distinct from 'array'
 or jsonb_array_length(p->'refs')>2000 or not p? 'problem'
 or (p->'problem'<>'null'::jsonb and (jsonb_typeof(p->'problem')<>'string' or length(p->>'problem')>500))
 or (p->'complete'='false'::jsonb and length(btrim(coalesce(p->>'problem','')))=0)
 or (p->'complete'='true'::jsonb and p->'problem'<>'null'::jsonb)
 or exists(select 1 from jsonb_object_keys(p) as fields(name) where fields.name<>all(array['schemaVersion','requestId','participant','coverageFrom','confirmedThrough','complete','problem','refs']))
 then raise exception 'MK_DISCOVERY_INVALID';end if;
 uid:=p->>'participant';rid:=(p->>'requestId')::uuid;
 foreach k in array array['coverageFrom','confirmedThrough'] loop
  if coalesce(p->>k,'')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$' then raise exception 'MK_DISCOVERY_INVALID';end if;
 end loop;
 start_at:=(p->>'coverageFrom')::timestamptz;stop_at:=(p->>'confirmedThrough')::timestamptz;
 if start_at>stop_at or stop_at>now()+interval '60 seconds' then raise exception 'MK_DISCOVERY_INVALID';end if;
 -- Lock ordering shared with the worker and identity resolver.
 perform pg_advisory_xact_lock(1734590,0);perform pg_advisory_xact_lock(1734521,0);
 select * into prior from mkz_discovery_requests where request_id=rid;
 if found then
  if prior.payload is distinct from p then raise exception 'MK_DISCOVERY_REQUEST_CONFLICT';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if not exists(select 1 from mkz_all_links where doma_user_id=uid and status='linked') then raise exception 'MK_DISCOVERY_ACCOUNT_UNLINKED';end if;
 if exists(select 1 from mkz_campaigns where state='frozen') then raise exception 'FINAL_RESULTS_FROZEN';end if;
 select coalesce(c.starts_at,min(t.since)) into required_from from mkz_tracking_players t join mkz_all_links l on l.wallet=t.wallet cross join mkz_campaigns c
  where l.doma_user_id=uid and l.status='linked' group by c.starts_at;
 select * into cv from mkz_strategy_coverage where participant=uid;
 if start_at>coalesce(case when cv.complete then cv.confirmed_through end,required_from)
 or stop_at<coalesce(cv.confirmed_through,start_at) then raise exception 'MK_DISCOVERY_COVERAGE_GAP';end if;
 for r in select value from jsonb_array_elements(p->'refs') loop
  if jsonb_typeof(r) is distinct from 'object' or r->'chainId' is distinct from '97477'::jsonb
  or coalesce(r->>'id','')!~'^[A-Za-z0-9:_./-]{1,120}$' or r->>'id'=any(ids)
  or coalesce(r->>'revision','')!~'^[1-9][0-9]{0,14}$' or jsonb_typeof(r->'revision') is distinct from 'number'
  or coalesce(r->>'strategyId','')!~'^[0-9]{1,30}$' or coalesce(r->>'orderId','')!~'^[0-9]{1,30}$'
  or coalesce(r->>'transactionHash','')!~'^0x[0-9a-f]{64}$'
  or coalesce(r->>'side','') not in ('buy','sell') or coalesce(r->>'status','') not in ('verified','revoked')
  or length(btrim(coalesce(r->>'evidence','')))=0 or length(r->>'evidence')>500
  or coalesce(r->>'executedAt','')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$'
  or (r->>'executedAt')::timestamptz>stop_at
  or exists(select 1 from jsonb_object_keys(r) as fields(name) where fields.name<>all(array['id','revision','chainId','wallet','strategyId','orderId','transactionHash','domainToken','quoteToken','domainUnits','quoteUnits','side','executedAt','status','evidence']))
  then raise exception 'MK_DISCOVERY_REF_INVALID';end if;
  foreach k in array array['wallet','domainToken','quoteToken'] loop
   if coalesce(r->>k,'')!~'^0x[0-9a-f]{40}$' or r->>k='0x0000000000000000000000000000000000000000' then raise exception 'MK_DISCOVERY_REF_INVALID';end if;
  end loop;
  foreach k in array array['domainUnits','quoteUnits'] loop
   if jsonb_typeof(r->k) is distinct from 'string' or coalesce(r->>k,'')!~'^[1-9][0-9]{0,77}$' then raise exception 'MK_DISCOVERY_REF_INVALID';end if;
  end loop;
  if r->>'domainToken'=r->>'quoteToken' then raise exception 'MK_DISCOVERY_REF_INVALID';end if;
  if exists(select 1 from mkz_wallets where trade_wallet=r->>'wallet' and participant<>uid) then raise exception 'MK_DISCOVERY_WALLET_CONFLICT';end if;
  ids:=array_append(ids,r->>'id');
  select payload into old from mkz_strategy_references where participant=uid and id=r->>'id';
  if found and old->>'wallet' is distinct from r->>'wallet' then raise exception 'MK_DISCOVERY_OWNER_REVIEW_REQUIRED';end if;
  if found and ((old->>'revision')::bigint>(r->>'revision')::bigint or ((old->>'revision')::bigint=(r->>'revision')::bigint and old<>r)) then raise exception 'MK_DISCOVERY_REVISION_CONFLICT';end if;
  insert into mkz_strategy_references values(uid,r->>'id',(r->>'revision')::bigint,r->>'wallet',r)
   on conflict(participant,id) do update set revision=excluded.revision,wallet=excluded.wallet,payload=excluded.payload;
 end loop;
 insert into mkz_strategy_coverage values(uid,least(start_at,cv.coverage_from),stop_at,(p->>'complete')::boolean,p->>'problem',now())
  on conflict(participant) do update set coverage_from=excluded.coverage_from,confirmed_through=excluded.confirmed_through,complete=excluded.complete,problem=excluded.problem,updated_at=excluded.updated_at;
 -- Any changed private evidence makes the old public completeness claims pending
 -- until our worker rechecks it. No stale ROI remains advertised as reconciled.
 update mkz_campaigns set complete=false,financial_complete=false where state in ('active','closed');
 result:=jsonb_build_object('ok',true,'references',cardinality(ids),'replayed',false);
 insert into mkz_discovery_requests values(rid,p,result,now());return result;
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then raise exception 'MK_DISCOVERY_INVALID';
end $$;

create or replace function public.mkz_worker_snapshot() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;
begin
 if (select count(*) from mkz_strategy_references)>50000 or (select count(*) from mkz_fills)>50000 then raise exception 'MK_WORKER_PAGE_LIMIT';end if;
 result:=jsonb_build_object('manifest',mkz_collector_manifest(),'accounts',mkz_discovery_accounts(),
  'wallets',(select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('agent',mkz_agent_wallet(w.trade_wallet)) order by participant,trade_wallet),'[]') from mkz_wallets w),
  'references',(select coalesce(jsonb_agg(jsonb_build_object('participant',participant,'ref',payload) order by participant,id),'[]') from mkz_strategy_references),
  'fills',(select coalesce(jsonb_agg(payload order by economic_id),'[]') from mkz_fills where campaign_id='model-kombat-zones-1'),
  'accountingRevisions',(select coalesce(jsonb_object_agg(participant,revision),'{}') from mkz_accounting_snapshots where campaign_id='model-kombat-zones-1'));
 return result||jsonb_build_object('fingerprint',md5(result::text));
end $$;

create or replace function public.mkz_worker_commit(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare packet jsonb; snap jsonb; rid uuid; report jsonb; prior mkz_worker_runs; chunk jsonb; ledger jsonb;
begin
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>40000000
 or coalesce(p->>'requestId','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(p->'packet') is distinct from 'object' or jsonb_typeof(p->'report') is distinct from 'object'
 or jsonb_typeof(p->'packet'->'fills') is distinct from 'array' or jsonb_array_length(p->'packet'->'fills')>50000
 then raise exception 'MK_WORKER_INVALID';end if;
 rid:=(p->>'requestId')::uuid;
 perform pg_advisory_xact_lock(1734590,0);perform pg_advisory_xact_lock(1734521,0);
 select * into prior from mkz_worker_runs where id=rid;
 if found then
  if prior.report->>'requestHash' is distinct from md5(p::text) then raise exception 'MK_WORKER_REQUEST_CONFLICT';end if;
  return jsonb_build_object('ok',true,'replayed',true);
 end if;
 snap:=mkz_worker_snapshot();
 if p->>'fingerprint' is distinct from snap->>'fingerprint' then raise exception 'MK_WORKER_SOURCE_CHANGED';end if;
 packet:=p->'packet';
 if jsonb_typeof(packet->'financialComplete') is distinct from 'boolean' or packet->'financials' is distinct from '[]'::jsonb
 or jsonb_typeof(coalesce(p->'accounting','[]'))<>'array' then raise exception 'MK_WORKER_USE_VERIFIED_ACCOUNTING';end if;
 -- Each normal batch is validated and written in ONE transaction. The final
 -- empty packet advances completeness only after every correction is stored.
 for chunk in select jsonb_agg(value order by ordinality) from jsonb_array_elements(packet->'fills') with ordinality group by (ordinality-1)/2000 loop
  perform mkz_collector_ingest(packet||jsonb_build_object('requestId',gen_random_uuid(),'fills',chunk,'complete',false,'financialComplete',false));
 end loop;
 for ledger in select value from jsonb_array_elements(coalesce(p->'accounting','[]')) loop
  perform mkz_collector_accounting(ledger);
 end loop;
 perform mkz_collector_ingest(packet||jsonb_build_object('requestId',gen_random_uuid(),'fills','[]'::jsonb));
 report:=(p->'report')||jsonb_build_object('requestHash',md5(p::text));
 insert into mkz_worker_runs(id,report) values(rid,report);
 return jsonb_build_object('ok',true,'replayed',false);
end $$;

do $$declare n text;begin
 foreach n in array array['mkz_strategy_references','mkz_strategy_coverage','mkz_discovery_requests','mkz_worker_runs'] loop
  execute format('alter table %I enable row level security',n);
  execute format('revoke all on %I from public,anon,authenticated,service_role',n);
 end loop;
end $$;
revoke all on function mkz_discovery_manifest(),mkz_discovery_accounts(),mkz_discovery_references(jsonb),mkz_worker_snapshot(),mkz_worker_commit(jsonb) from public,anon,authenticated;
grant execute on function mkz_discovery_manifest(),mkz_discovery_accounts(),mkz_discovery_references(jsonb),mkz_worker_snapshot(),mkz_worker_commit(jsonb) to service_role;
do $$begin
 if exists(select from pg_roles where rolname='doma_ai_mk') then
  grant execute on function mkz_discovery_manifest(),mkz_discovery_accounts(),mkz_discovery_references(jsonb) to doma_ai_mk;
  -- The previous AI task can no longer submit financial ledgers or scored fills.
  -- Historical Bot Battle RPC permissions are not touched.
  revoke execute on function mkz_collector_ingest(jsonb),mkz_collector_accounting(jsonb) from doma_ai_mk;
 end if;
end $$;
commit;
