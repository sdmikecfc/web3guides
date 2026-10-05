-- Reuse the original Doma AI database login and already-approved Supabase host.
-- No password, API key, Reporter function, campaign state or reward is changed.
begin;

create or replace function public.mkz_validate_collector_batch(p jsonb) returns void
language plpgsql set search_path=pg_catalog,public,pg_temp as $$
declare f jsonb; k text; t timestamptz; seen text[]:='{}'; people text[]:='{}';
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>2000000
 or p->'schemaVersion' is distinct from '1'::jsonb or p->>'rules' is distinct from 'mk-token-zones-1'
 or p->>'campaignId' is distinct from 'model-kombat-zones-1'
 or coalesce(p->>'requestId','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(p->'complete') is distinct from 'boolean' or jsonb_typeof(p->'financialComplete') is distinct from 'boolean'
 or jsonb_typeof(p->'fills') is distinct from 'array' or jsonb_typeof(p->'financials') is distinct from 'array'
 then raise exception 'MKZ_BATCH_INVALID';end if;
 if jsonb_array_length(p->'fills')>2000 or jsonb_array_length(p->'financials')>20000 then raise exception 'MKZ_BATCH_INVALID';end if;
 foreach k in array array['coverageFrom','confirmedThrough'] loop
  if coalesce(p->>k,'')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$' then raise exception 'MKZ_BATCH_INVALID';end if;
  t:=(p->>k)::timestamptz;
  if to_char(t at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>(case when p->>k like '%.%' then p->>k else replace(p->>k,'Z','.000Z') end) then raise exception 'MKZ_BATCH_INVALID';end if;
 end loop;
 if (p->>'coverageFrom')::timestamptz>(p->>'confirmedThrough')::timestamptz or (p->>'confirmedThrough')::timestamptz>now()+interval '60 seconds' then raise exception 'MKZ_BATCH_INVALID';end if;
 for f in select value from jsonb_array_elements(p->'fills') loop
  if jsonb_typeof(f) is distinct from 'object' or f->'chainId' is distinct from '97477'::jsonb
  or jsonb_typeof(f->'economicId') is distinct from 'string' or length(btrim(coalesce(f->>'economicId','')))=0 or length(f->>'economicId')>160 or f->>'economicId'=any(seen)
  or jsonb_typeof(f->'revision') is distinct from 'number' or coalesce(f->>'revision','')!~'^[1-9][0-9]{0,15}$' or (f->>'revision')::numeric>9007199254740991
  or coalesce(f->>'transactionHash','')!~'^0x[0-9a-f]{64}$'
  or coalesce(f->>'status','') not in ('verified','revoked') or coalesce(f->>'source','') not in ('strategy','agent_wallet')
  or jsonb_typeof(f->'volumeUsd') is distinct from 'string' or coalesce(f->>'volumeUsd','')!~'^[0-9]{1,34}(\.[0-9]{1,6})?$'
  or (f->>'volumeUsd')::numeric<=0 or jsonb_typeof(f->'evidence') is distinct from 'string'
  or length(btrim(coalesce(f->>'evidence','')))=0 or length(f->>'evidence')>1000
  then raise exception 'MKZ_BATCH_INVALID';end if;
  seen:=array_append(seen,f->>'economicId');
  foreach k in array array['wallet','domainToken','quoteToken'] loop
   if coalesce(f->>k,'')!~'^0x[0-9a-f]{40}$' or f->>k='0x0000000000000000000000000000000000000000' then raise exception 'MKZ_BATCH_INVALID';end if;
  end loop;
  if f->>'domainToken'=f->>'quoteToken' or coalesce(f->>'executedAt','')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$' then raise exception 'MKZ_BATCH_INVALID';end if;
  t:=(f->>'executedAt')::timestamptz;
  if t>(p->>'confirmedThrough')::timestamptz or to_char(t at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>(case when f->>'executedAt' like '%.%' then f->>'executedAt' else replace(f->>'executedAt','Z','.000Z') end) then raise exception 'MKZ_BATCH_INVALID';end if;
 end loop;
 if (p->>'financialComplete')::boolean then
  if jsonb_typeof(p->'methodology') is distinct from 'string' or length(btrim(coalesce(p->>'methodology','')))=0 or length(p->>'methodology')>160 then raise exception 'MKZ_BATCH_INVALID';end if;
 elsif jsonb_array_length(p->'financials')<>0 then raise exception 'MKZ_BATCH_INVALID';end if;
 for f in select value from jsonb_array_elements(p->'financials') loop
  if jsonb_typeof(f) is distinct from 'object' or jsonb_typeof(f->'participant') is distinct from 'string'
  or coalesce(f->>'participant','')!~'^[0-9]{1,30}$' or f->>'participant'=any(people)
  or jsonb_typeof(f->'evidence') is distinct from 'string' or length(btrim(coalesce(f->>'evidence','')))=0 or length(f->>'evidence')>1000 then raise exception 'MKZ_BATCH_INVALID';end if;
  people:=array_append(people,f->>'participant');
  foreach k in array array['roi','profit'] loop
   if not (f?k) or (f->k<>'null'::jsonb and (jsonb_typeof(f->k)<>'string' or (f->>k)!~'^-?[0-9]{1,40}(\.[0-9]{1,36})?$')) then raise exception 'MKZ_BATCH_INVALID';end if;
  end loop;
 end loop;
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then raise exception 'MKZ_BATCH_INVALID';
end $$;

create or replace function public.mkz_collector_manifest() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare c mkz_campaigns; markets jsonb; entries jsonb; assets jsonb;
begin
 select * into c from mkz_campaigns where id='model-kombat-zones-1';if not found then raise exception 'MKZ_SETUP_MISSING';end if;
 if (select count(*) from mkz_markets)>10000 or (select count(*) from mkz_entries where campaign_id=c.id)>20000 then raise exception 'MKZ_REGISTRY_LIMIT';end if;
 select coalesce(jsonb_agg(to_jsonb(m) order by chain_id,domain_token,quote_token),'[]') into markets from mkz_markets m;
 select coalesce(jsonb_agg(jsonb_build_object('participant',participant,'wallet',wallet,'entered_at',entered_at) order by participant),'[]') into entries from mkz_entries where campaign_id=c.id;
 select coalesce(jsonb_agg(jsonb_build_object('symbol',symbol,'address',address,'decimals',decimals,'quantity',required_quantity::text,'threshold',threshold::text) order by threshold),'[]') into assets from mkz_reward_assets;
 return jsonb_build_object('schemaVersion',1,'campaign',to_jsonb(c),'markets',markets,'participants',entries,'rewardAssets',assets,
  'intervalHours',4,'transport','existing Supabase database connection','limits',jsonb_build_object('maxBytes',2000000,'maxFills',2000,'maxFinancials',20000),
  'setupIssues',to_jsonb(array_remove(array[case when jsonb_array_length(markets)=0 then 'No verified eligible markets' end,case when c.financial_method is null then 'Financial method is not configured' end,case when jsonb_array_length(assets)<>9 then 'Reward registry is incomplete' end],null)));
end $$;

create or replace function public.mkz_collector_wallets(p_scope text default 'pending',p_after text default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare rows jsonb; next_cursor text;
begin
 if p_scope is null or p_scope not in ('pending','all','monitor') or (p_after is not null and p_after!~'^0x[0-9a-f]{40}$') then raise exception 'MKZ_LOOKUP_INVALID';end if;
 with page as(select * from mkz_wallet_discovery where (p_after is null or wallet>p_after) and (p_scope<>'pending' or status<>'linked') order by wallet limit 501), visible as(select * from page order by wallet limit 500)
 select coalesce(jsonb_agg(jsonb_build_object('wallet',v.wallet,'since',v.since,'status',v.status,'mcpWallet',v.mcp_wallet,'expectedRevision',v.revision,'checkedAt',v.checked_at,
 'tradeWallets',case when p_scope='monitor' then (select coalesce(jsonb_agg(distinct t.trade_wallet),'[]') from mkz_tracking_wallets t where t.player_wallet=v.wallet) else '[]'::jsonb end) order by v.wallet),'[]'),
 case when (select count(*) from page)>500 then max(v.wallet) else null end into rows,next_cursor from visible v;
 return jsonb_build_object('schemaVersion',1,'wallets',rows,'nextCursor',next_cursor,'lookupIntervalHours',4);
end $$;

create or replace function public.mkz_collector_resolve(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if p_payload is null or octet_length(p_payload::text)>8192 then raise exception 'MK_LINK_INVALID';end if;
 return mkz_resolve_wallet(p_payload);
end $$;

create or replace function public.mkz_collector_check(p_payload jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare c mkz_campaigns; f jsonb; uid text; owners int; mapped int:=0; registered int:=0; eligible int:=0; market boolean; source_ok boolean; entry mkz_entries; issues jsonb:='[]';
begin
 perform mkz_validate_collector_batch(p_payload);
 select * into c from mkz_campaigns where id='model-kombat-zones-1';if not found then raise exception 'MKZ_SETUP_MISSING';end if;
 for f in select value from jsonb_array_elements(p_payload->'fills') loop
  select count(distinct participant),min(participant) into owners,uid from mkz_wallets where trade_wallet=f->>'wallet';
  if owners<>1 then issues:=issues||jsonb_build_array(jsonb_build_object('code','wallet_unmapped','economicId',f->>'economicId'));else mapped:=mapped+1;end if;
  select exists(select 1 from mkz_markets where chain_id=(f->>'chainId')::int and domain_token=f->>'domainToken' and quote_token=f->>'quoteToken') into market;
  if market then registered:=registered+1;else issues:=issues||jsonb_build_array(jsonb_build_object('code','market_unverified','economicId',f->>'economicId'));end if;
  source_ok:=f->>'source'<>'agent_wallet' or mkz_agent_wallet(f->>'wallet');
  if not source_ok then issues:=issues||jsonb_build_array(jsonb_build_object('code','agent_wallet_unverified','economicId',f->>'economicId'));end if;
  select * into entry from mkz_entries where campaign_id=c.id and participant=uid;
  if c.state<>'draft' and entry.participant is null then issues:=issues||jsonb_build_array(jsonb_build_object('code','participant_not_enrolled','economicId',f->>'economicId'));end if;
  if owners=1 and entry.participant is not null and market and source_ok and f->>'status'='verified' and (f->>'executedAt')::timestamptz>=greatest(entry.entered_at,c.starts_at) and (f->>'executedAt')::timestamptz<c.ends_at then eligible:=eligible+1;end if;
 end loop;
 if c.state<>'draft' and ((p_payload->>'coverageFrom')::timestamptz<>c.starts_at or (p_payload->>'confirmedThrough')::timestamptz<coalesce(c.confirmed_through,c.starts_at)) then issues:=issues||jsonb_build_array(jsonb_build_object('code','coverage_invalid'));end if;
 if (p_payload->>'financialComplete')::boolean then
  if c.financial_method is null or p_payload->>'methodology' is distinct from c.financial_method then issues:=issues||jsonb_build_array(jsonb_build_object('code','financial_method'));end if;
  if jsonb_array_length(p_payload->'financials')<>(select count(*) from mkz_entries where campaign_id=c.id) or exists(select 1 from jsonb_array_elements(p_payload->'financials') item where not exists(select 1 from mkz_entries e where e.campaign_id=c.id and e.participant=item->>'participant')) then issues:=issues||jsonb_build_array(jsonb_build_object('code','financial_coverage'));end if;
 end if;
 return jsonb_build_object('ok',jsonb_array_length(issues)=0,'mode','read_only','writesPerformed',0,'competitionState',c.state,'requestId',p_payload->>'requestId',
 'checked',jsonb_build_object('fills',jsonb_array_length(p_payload->'fills'),'mappedFills',mapped,'registeredMarketFills',registered,'currentlyEligibleFills',eligible,'financials',jsonb_array_length(p_payload->'financials')),
 'ingestionOpen',c.state in ('active','closed'),'issues',issues,'warnings',to_jsonb(array_remove(array[
 case when c.state='draft' then 'Draft: historical samples are diagnostic only and record no trades or scores.' end,
 case when jsonb_array_length(p_payload->'fills')=0 then 'No real trade sample supplied. This does not prove attribution.' end,
 'Source evidence and completeness require collector reconciliation. Check performs no writes; transactional acceptance is checked during ingestion.'],null)));
end $$;

create or replace function public.mkz_collector_ingest(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 perform mkz_validate_collector_batch(p_payload);
 return mkz_ingest(p_payload);
end $$;

-- No broad table grants, role creation, password change, campaign opening,
-- enrollment, coins, awards or Reporter mutation privileges for the collector.
revoke all on function mkz_validate_collector_batch(jsonb),mkz_collector_manifest(),mkz_collector_wallets(text,text),mkz_collector_resolve(jsonb),mkz_collector_check(jsonb),mkz_collector_ingest(jsonb) from public,anon,authenticated;
grant execute on function mkz_collector_manifest(),mkz_collector_wallets(text,text),mkz_collector_resolve(jsonb),mkz_collector_check(jsonb),mkz_collector_ingest(jsonb) to service_role;
do $$begin
 if exists(select 1 from pg_roles where rolname='doma_ai_mk') then
  grant usage on schema public to doma_ai_mk;
  grant execute on function mkz_collector_manifest(),mkz_collector_wallets(text,text),mkz_collector_resolve(jsonb),mkz_collector_check(jsonb),mkz_collector_ingest(jsonb) to doma_ai_mk;
 else
  raise notice 'Existing doma_ai_mk role absent. No login was created. Confirm the collector database and role before granting access.';
 end if;
end $$;
commit;
