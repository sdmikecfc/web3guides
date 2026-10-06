-- Private operational status only. Never stores wallets, credentials or trades.
-- It neither opens a campaign nor writes scores or financial snapshots.
begin;
create table if not exists public.mkz_worker_health_state (
 id boolean primary key default true check(id),
 current_report jsonb not null,
 completed_report jsonb,
 updated_at timestamptz not null default now()
);
alter table public.mkz_worker_health_state enable row level security;
revoke all on public.mkz_worker_health_state from public,anon,authenticated,service_role;

create or replace function public.mkz_worker_health(p jsonb default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare old mkz_worker_health_state; k text; e jsonb; t timestamptz; started timestamptz;
begin
 if p is not null and p<>'null'::jsonb then
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>16000
  or coalesce(p->>'workerVersion','')!~'^mk-public-worker-[a-z0-9-]{1,60}$'
  or coalesce(p->>'phase','') not in ('READING_REGISTRY','VERIFYING_PUBLIC_TRADES','RECONSTRUCTING_ACCOUNTING','AUDIT_COMPLETE','AUDIT_FAILED')
  or exists(select 1 from jsonb_object_keys(p) f(name) where f.name<>all(array['workerVersion','phase','runStartedAt','updatedAt','state','coverageFrom','confirmedThrough','complete','financialComplete','counts','problems','accountingProblems','status','code','scoreWrites']))
  then raise exception 'MK_HEALTH_INVALID';end if;
  foreach k in array array['runStartedAt','updatedAt'] loop
   if coalesce(p->>k,'')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then raise exception 'MK_HEALTH_TIME_INVALID';end if;
  end loop;
  t:=(p->>'updatedAt')::timestamptz;started:=(p->>'runStartedAt')::timestamptz;
  if t>now()+interval '60 seconds' or started>t then raise exception 'MK_HEALTH_TIME_INVALID';end if;
  foreach k in array array['coverageFrom','confirmedThrough'] loop
   if p?k and coalesce(p->>k,'')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$' then raise exception 'MK_HEALTH_TIME_INVALID';end if;
  end loop;
  if p?'state' and p->>'state' not in ('draft','active','closed','frozen') then raise exception 'MK_HEALTH_INVALID';end if;
  if p?'status' and p->>'status' not in ('FAILED','PENDING','TRACKING_VERIFIED','VOLUME_VERIFIED_FINANCIALS_PENDING') then raise exception 'MK_HEALTH_INVALID';end if;
  foreach k in array array['complete','financialComplete','scoreWrites'] loop
   if p?k and jsonb_typeof(p->k) is distinct from 'boolean' then raise exception 'MK_HEALTH_INVALID';end if;
  end loop;
  if p?'code' and coalesce(p->>'code','')!~'^[A-Z][A-Z0-9_]{2,100}$' then raise exception 'MK_HEALTH_INVALID';end if;
  foreach k in array array['problems','accountingProblems'] loop
   if p?k then
    if jsonb_typeof(p->k)<>'array' or jsonb_array_length(p->k)>100 then raise exception 'MK_HEALTH_INVALID';end if;
    for e in select value from jsonb_array_elements(p->k) loop
     if jsonb_typeof(e)<>'object' or e<>jsonb_build_object('code',e->>'code') or coalesce(e->>'code','')!~'^[A-Z][A-Z0-9_]{2,100}$' then raise exception 'MK_HEALTH_INVALID';end if;
    end loop;
   end if;
  end loop;
  if p?'counts' then
   if jsonb_typeof(p->'counts')<>'object' or exists(select 1 from jsonb_object_keys(p->'counts') f(name) where f.name<>all(array['accounts','wallets','verifiedFills','volumeUsd','strategyFills','agentFills'])) then raise exception 'MK_HEALTH_INVALID';end if;
   for k in select jsonb_object_keys(p->'counts') loop
    if coalesce(p->'counts'->>k,'')!~(case when k='volumeUsd' then '^\d{1,16}\.\d{6}$' else '^\d{1,10}$' end) then raise exception 'MK_HEALTH_INVALID';end if;
   end loop;
  end if;
  perform pg_advisory_xact_lock(1734591,0);
  select * into old from mkz_worker_health_state where id=true for update;
  if found and (started<(old.current_report->>'runStartedAt')::timestamptz or (started=(old.current_report->>'runStartedAt')::timestamptz and t<(old.current_report->>'updatedAt')::timestamptz)) then raise exception 'MK_HEALTH_STALE';end if;
  insert into mkz_worker_health_state(id,current_report,completed_report,updated_at)
   values(true,p,case when p->>'phase' in ('AUDIT_COMPLETE','AUDIT_FAILED') then p else old.completed_report end,now())
   on conflict(id) do update set current_report=excluded.current_report,completed_report=excluded.completed_report,updated_at=excluded.updated_at;
 end if;
 select * into old from mkz_worker_health_state where id=true;
 return jsonb_build_object('available',found,'nativeAccountingReady',coalesce(position('0x0000000000000000000000000000000000000000' in pg_get_functiondef(to_regprocedure('public.mkz_accounting_result(jsonb)')))>0,false),'current',old.current_report,'lastCompleted',old.completed_report,'receivedAt',old.updated_at);
end $$;
revoke all on function public.mkz_worker_health(jsonb) from public,anon,authenticated;
grant execute on function public.mkz_worker_health(jsonb) to service_role;
commit;
