-- Retain each account's last verified publication while a newer scan is delayed.
-- Run after bots-token-zone-account-isolation.sql. No scoring formula or final-award changes.
begin;
do $$begin
 if to_regprocedure('public.mkz_account_coverage_valid(text,text,timestamptz)') is null
 or public.mkz_accounting_capabilities()->>'accountIsolation' is distinct from 'per-account-coverage-1'
 then raise exception 'RESULT_PUBLICATION_PREREQUISITE_REQUIRED';end if;
end $$;
create table if not exists public.mkz_account_publications (
 campaign_id text not null references mkz_campaigns(id),participant text not null,
 kind text not null check(kind in ('trade','financial')),confirmed_through timestamptz not null,
 evidence_fingerprint text not null,fill_fingerprint text not null,payload jsonb not null,
 published_at timestamptz not null default now(),primary key(campaign_id,participant,kind)
);
alter table mkz_account_publications enable row level security;
revoke all on mkz_account_publications from public,anon,authenticated,service_role;

create or replace function public.mkz_account_fill_evidence(p_campaign text,p_participant text,p_through timestamptz) returns text
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select md5(coalesce(jsonb_agg(f.payload order by f.chain_id,f.economic_id),'[]')::text)
 from mkz_fills f join mkz_wallets w on w.trade_wallet=f.wallet and w.participant=p_participant
 join mkz_entries e on e.campaign_id=f.campaign_id and e.participant=p_participant
 join mkz_campaigns c on c.id=f.campaign_id
 where f.campaign_id=p_campaign and f.executed_at>=greatest(e.entered_at,c.starts_at)
 and f.executed_at<=p_through and f.executed_at<c.ends_at;
$$;
create or replace function public.mkz_publication_valid(p public.mkz_account_publications) returns boolean
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select p.evidence_fingerprint=mkz_account_evidence(p.campaign_id,p.participant,p.confirmed_through)
 and p.fill_fingerprint=mkz_account_fill_evidence(p.campaign_id,p.participant,p.confirmed_through)
 and exists(select 1 from mkz_entries e join mkz_campaigns c on c.id=e.campaign_id
  where e.campaign_id=p.campaign_id and e.participant=p.participant and c.state in ('active','closed')
  and greatest(c.starts_at,e.entered_at)<=p.confirmed_through and p.confirmed_through<=c.confirmed_through)
 and exists(select 1 from mkz_all_links where doma_user_id=p.participant and status='linked')
 and not exists(select 1 from mkz_account_coverage a where a.campaign_id=p.campaign_id and a.participant=p.participant
  and (a.problems ?| array['REORG_LOG','TRANSACTION_REORG','ACCOUNTING_ANCHOR_REORG','ACCOUNTING_ANCHOR_CHANGED','ACCOUNTING_CACHE_ANCHOR_CHANGED']
   or a.financial_problem=any(array['ACCOUNTING_ANCHOR_REORG','ACCOUNTING_ANCHOR_CHANGED','ACCOUNTING_CACHE_ANCHOR_CHANGED'])));
$$;
create or replace function public.mkz_account_trade_values(p_campaign text,p_participant text,p_through timestamptz) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 with fills as (
 select f.*,c.starts_at from mkz_fills f
 join mkz_wallets w on w.trade_wallet=f.wallet and w.participant=p_participant
 join mkz_entries e on e.campaign_id=f.campaign_id and e.participant=p_participant
 join mkz_campaigns c on c.id=f.campaign_id
 join mkz_markets m on m.chain_id=f.chain_id and m.domain_token=f.domain_token and m.quote_token=f.quote_token
 where f.campaign_id=p_campaign and f.status='verified' and f.executed_at>=greatest(c.starts_at,e.entered_at)
 and f.executed_at<=p_through and f.executed_at<c.ends_at)
 select jsonb_build_object('volume',coalesce((select sum(volume_usd)::text from fills),'0'),
 'times',(select coalesce(jsonb_agg(executed_at order by executed_at),'[]') from fills),
 'domains',(select count(distinct domain_token) from fills),
 'days',(select coalesce(jsonb_agg(d order by d.day),'[]') from
  (select floor(extract(epoch from (executed_at-starts_at))/86400)::int as day,sum(volume_usd)::text volume from fills group by 1)d));
$$;
create or replace function public.mkz_capture_publications() returns void
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare c mkz_campaigns;e mkz_entries;s mkz_accounting_snapshots;r jsonb;through_at timestamptz;v jsonb;
begin
 select * into c from mkz_campaigns where id='model-kombat-zones-1';
 if not found or c.state not in ('active','closed') or c.confirmed_through is null then return;end if;
 for e in select * from mkz_entries where campaign_id=c.id order by participant loop
  if greatest(e.entered_at,c.starts_at)>c.confirmed_through or not mkz_account_coverage_valid(c.id,e.participant,c.confirmed_through) then continue;end if;
  v:=mkz_account_trade_values(c.id,e.participant,c.confirmed_through);
  insert into mkz_account_publications values(c.id,e.participant,'trade',c.confirmed_through,
   mkz_account_evidence(c.id,e.participant,c.confirmed_through),mkz_account_fill_evidence(c.id,e.participant,c.confirmed_through),v,now())
  on conflict(campaign_id,participant,kind) do update set confirmed_through=excluded.confirmed_through,
   evidence_fingerprint=excluded.evidence_fingerprint,fill_fingerprint=excluded.fill_fingerprint,payload=excluded.payload,published_at=excluded.published_at
  where excluded.confirmed_through>mkz_account_publications.confirmed_through or (excluded.confirmed_through=mkz_account_publications.confirmed_through and (excluded.evidence_fingerprint is distinct from mkz_account_publications.evidence_fingerprint or excluded.fill_fingerprint is distinct from mkz_account_publications.fill_fingerprint or excluded.payload is distinct from mkz_account_publications.payload));
  -- An accepted older ledger may complete a resumable job. Current trade
  -- coverage proves its prefix; FIFO is independently recomputed at its own date.
  select * into s from mkz_accounting_snapshots where campaign_id=c.id and participant=e.participant;
  if not found or exists(select 1 from mkz_account_coverage where campaign_id=c.id and participant=e.participant and financial_problem is not null) then continue;end if;
  begin
   through_at:=(s.payload->>'confirmedThrough')::timestamptz;
   if through_at>c.confirmed_through or through_at<greatest(c.starts_at,e.entered_at) then continue;end if;
   v:=mkz_account_trade_values(c.id,e.participant,through_at);
   if jsonb_array_length(v->'times')=0 then continue;end if;
   r:=mkz_accounting_result(s.payload);
   insert into mkz_account_publications values(c.id,e.participant,'financial',through_at,
    mkz_account_evidence(c.id,e.participant,through_at),mkz_account_fill_evidence(c.id,e.participant,through_at),
    jsonb_build_object('roi',r->'roi','profit',r->'profit','trade',v),now())
   on conflict(campaign_id,participant,kind) do update set confirmed_through=excluded.confirmed_through,
    evidence_fingerprint=excluded.evidence_fingerprint,fill_fingerprint=excluded.fill_fingerprint,payload=excluded.payload,published_at=excluded.published_at
   where excluded.confirmed_through>mkz_account_publications.confirmed_through or (excluded.confirmed_through=mkz_account_publications.confirmed_through and (excluded.evidence_fingerprint is distinct from mkz_account_publications.evidence_fingerprint or excluded.fill_fingerprint is distinct from mkz_account_publications.fill_fingerprint or excluded.payload is distinct from mkz_account_publications.payload));
  exception when others then null; -- An affected account cannot erase another.
  end;
 end loop;
end $$;

do $$begin
 if to_regprocedure('public.mkz_worker_commit_before_retention(jsonb)') is null then alter function public.mkz_worker_commit(jsonb) rename to mkz_worker_commit_before_retention;end if;
 if to_regprocedure('public.mkz_read_before_retention(text)') is null then alter function public.mkz_read(text) rename to mkz_read_before_retention;end if;
 if to_regprocedure('public.mkz_verified_financials_before_retention()') is null then alter function public.mkz_verified_financials() rename to mkz_verified_financials_before_retention;end if;
 if to_regprocedure('public.mkz_accounting_capabilities_before_retention()') is null then alter function public.mkz_accounting_capabilities() rename to mkz_accounting_capabilities_before_retention;end if;
end $$;
create or replace function public.mkz_worker_commit(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;prior mkz_worker_runs;next_fingerprint text;
begin
 perform pg_advisory_xact_lock(1734590,0);perform pg_advisory_xact_lock(1734521,0);
 if coalesce(p->>'requestId','')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  select * into prior from mkz_worker_runs where id=(p->>'requestId')::uuid;
  if found then
   result:=mkz_worker_commit_before_retention(p); -- Retains exact request-hash validation.
   return result||jsonb_build_object('nextFingerprint',prior.report->>'nextFingerprint');
  end if;
 end if;
 perform mkz_capture_publications();
 result:=mkz_worker_commit_before_retention(p);
 perform mkz_capture_publications();
 next_fingerprint:=mkz_worker_snapshot()->>'fingerprint';
 update mkz_worker_runs set report=report||jsonb_build_object('nextFingerprint',next_fingerprint) where id=(p->>'requestId')::uuid;
 return result||jsonb_build_object('nextFingerprint',next_fingerprint);
end $$;
create or replace function public.mkz_read(p_wallet text default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;p jsonb;participants jsonb:='[]';c mkz_campaigns;t mkz_account_publications;f mkz_account_publications;
 values_at jsonb;trade_through timestamptz;financial_through timestamptz;current_trade boolean;verified_trade boolean;
 volume numeric:=0;days jsonb:='{}';d jsonb;oldest timestamptz;newest timestamptz;
begin
 result:=mkz_read_before_retention(p_wallet);
 select * into c from mkz_campaigns where id='model-kombat-zones-1';
 if c.state='frozen' then return result;end if;
 for p in select value from jsonb_array_elements(result->'participants') loop
  current_trade:=coalesce((p->>'tradeComplete')::boolean,false);values_at:=null;trade_through:=null;financial_through:=null;
  select * into t from mkz_account_publications a where a.campaign_id=c.id and a.participant=p->>'participant' and a.kind='trade' and mkz_publication_valid(a);
  select * into f from mkz_account_publications a where a.campaign_id=c.id and a.participant=p->>'participant' and a.kind='financial' and mkz_publication_valid(a);
  if current_trade then
   trade_through:=c.confirmed_through;values_at:=mkz_account_trade_values(c.id,p->>'participant',trade_through);
  elsif t.confirmed_through is not null and (f.confirmed_through is null or t.confirmed_through>=f.confirmed_through) then
   trade_through:=t.confirmed_through;values_at:=t.payload;
  elsif f.confirmed_through is not null then
   trade_through:=f.confirmed_through;values_at:=f.payload->'trade';
  end if;
  verified_trade:=trade_through is not null;
  if verified_trade then
   volume:=volume+(values_at->>'volume')::numeric;oldest:=least(oldest,trade_through);newest:=greatest(newest,trade_through);
   for d in select value from jsonb_array_elements(values_at->'days') loop
    days:=jsonb_set(days,array[d->>'day'],to_jsonb(coalesce((days->>(d->>'day'))::numeric,0)+(d->>'volume')::numeric),true);
   end loop;
  end if;
  if f.confirmed_through is not null and f.confirmed_through<=trade_through then financial_through:=f.confirmed_through;end if;
  p:=p||jsonb_build_object('tradeVerified',verified_trade,'tradeCurrent',current_trade,
   'tradeDelayed',verified_trade and not current_trade,'tradeThrough',trade_through,
   'volume',case when verified_trade then values_at->'volume' else 'null'::jsonb end,
   'times',case when verified_trade then values_at->'times' else '[]'::jsonb end,
   'domains',case when verified_trade then values_at->'domains' else 'null'::jsonb end,
   'financialThrough',financial_through,'financialDelayed',financial_through is not null and financial_through<c.confirmed_through,
   'roi',case when financial_through is not null then f.payload->'roi' else 'null'::jsonb end,
   'profit',case when financial_through is not null then f.payload->'profit' else 'null'::jsonb end);
  participants:=participants||jsonb_build_array(p);
 end loop;
 return result||jsonb_build_object('accountScope','retained-account-results-1','participants',participants,'volume',volume::text,
  'days',(select coalesce(jsonb_agg(jsonb_build_object('day',key::int,'volume',value#>>'{}') order by key::int),'[]') from jsonb_each(days)),
  'retainedAsOf',jsonb_build_object('oldest',oldest,'newest',newest));
end $$;
create or replace function public.mkz_verified_financials() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;b jsonb;p jsonb;rows jsonb:='[]';c mkz_campaigns;checked_count int:=0;pending_count int:=0;no_trade_count int:=0;later_count int:=0;trader_count int:=0;scope_pending_count int:=0;
begin
 select * into c from mkz_campaigns where id='model-kombat-zones-1';
 if c.state='frozen' then return mkz_verified_financials_before_retention();end if;
 b:=mkz_read(null);
 for p in select value from jsonb_array_elements(b->'participants') loop
  if greatest(c.starts_at,(p->>'entered_at')::timestamptz)>c.confirmed_through then later_count:=later_count+1;continue;end if;
  if p->'tradeVerified' is distinct from 'true'::jsonb then scope_pending_count:=scope_pending_count+1;pending_count:=pending_count+1;continue;end if;
  if jsonb_array_length(p->'times')=0 then no_trade_count:=no_trade_count+1;continue;end if;
  trader_count:=trader_count+1;
  if p->>'financialThrough' is null then pending_count:=pending_count+1;continue;end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('participant',p->>'participant','roi',p->>'roi','profit',p->>'profit',
   'confirmedThrough',p->>'financialThrough','current',(p->>'financialThrough')::timestamptz=c.confirmed_through,
   'retained',(p->>'financialThrough')::timestamptz<c.confirmed_through));
  checked_count:=checked_count+1;
 end loop;
 return jsonb_build_object('schemaVersion',1,'financialScope','retained-account-financials-1','methodology',c.financial_method,
 'available',c.state<>'draft' and c.confirmed_through is not null,'confirmedThrough',c.confirmed_through,'checked',checked_count,
 'pending',pending_count,'noTrades',no_trade_count,'notStarted',later_count,'tradingAccounts',trader_count,'scopePending',scope_pending_count,'rows',rows);
end $$;
create or replace function public.mkz_accounting_capabilities() returns jsonb
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select mkz_accounting_capabilities_before_retention()||jsonb_build_object('resultPublication','per-account-retained-1');
$$;
revoke all on function mkz_account_fill_evidence(text,text,timestamptz),mkz_publication_valid(mkz_account_publications),
 mkz_account_trade_values(text,text,timestamptz),mkz_capture_publications(),mkz_worker_commit_before_retention(jsonb),
 mkz_read_before_retention(text),mkz_verified_financials_before_retention(),mkz_accounting_capabilities_before_retention() from public,anon,authenticated,service_role;
revoke all on function mkz_worker_commit(jsonb),mkz_read(text),mkz_verified_financials(),mkz_accounting_capabilities() from public,anon,authenticated;
grant execute on function mkz_worker_commit(jsonb),mkz_read(text),mkz_verified_financials(),mkz_accounting_capabilities() to service_role;
-- Seed only currently proven accounts; pending history is never manufactured.
select mkz_capture_publications();
commit;
