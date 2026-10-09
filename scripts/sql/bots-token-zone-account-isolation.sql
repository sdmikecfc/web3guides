-- Model Kombat: account-local verification failures. Run the whole file.
-- Requires financial-scope.sql. No dates, payout rules or accounting formula changes.
begin;
do $$begin
 if to_regprocedure('public.mkz_financial_scope(text,text,timestamptz)') is null
 or public.mkz_accounting_capabilities()->>'financialScope' not in ('eligible-traders-1','eligible-traders-2')
 then raise exception 'ACCOUNT_ISOLATION_PREREQUISITE_REQUIRED';end if;
end $$;
create table if not exists public.mkz_account_coverage (
 campaign_id text not null references mkz_campaigns(id),participant text not null,
 coverage_from timestamptz not null,confirmed_through timestamptz not null,
 complete boolean not null,problems jsonb not null default '[]',
 evidence_fingerprint text not null,financial_problem text,updated_at timestamptz not null default now(),
 primary key(campaign_id,participant),check(coverage_from<=confirmed_through)
);
alter table mkz_account_coverage enable row level security;
revoke all on mkz_account_coverage from public,anon,authenticated,service_role;
-- Cutoff-specific facts exclude heartbeat timestamps and future references.
create or replace function public.mkz_account_evidence(p_campaign text,p_participant text,p_through timestamptz) returns text
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select md5(jsonb_build_object(
 'campaign',(select jsonb_build_array(rules,starts_at,ends_at) from mkz_campaigns where id=p_campaign),
 'entry',(select entered_at from mkz_entries where campaign_id=p_campaign and participant=p_participant),
 'wallets',(select coalesce(jsonb_agg(jsonb_build_array(trade_wallet,mkz_agent_wallet(trade_wallet)) order by trade_wallet),'[]') from mkz_wallets where participant=p_participant),
 'links',(select coalesce(jsonb_agg(jsonb_build_array(wallet,mcp_wallet,status) order by wallet),'[]') from mkz_all_links where doma_user_id=p_participant),
 'refs',(select coalesce(jsonb_agg(payload order by id),'[]') from mkz_strategy_references where participant=p_participant and (payload->>'executedAt')::timestamptz<=p_through),
 'markets',(select coalesce(jsonb_agg(jsonb_build_array(chain_id,domain_token,quote_token) order by chain_id,domain_token,quote_token),'[]') from mkz_markets)
 )::text);
$$;
create or replace function public.mkz_account_coverage_valid(p_campaign text,p_participant text,p_through timestamptz) returns boolean
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from mkz_account_coverage a join mkz_campaigns c on c.id=a.campaign_id
 join mkz_strategy_coverage s on s.participant=a.participant
 where a.campaign_id=p_campaign and a.participant=p_participant and a.complete
 and a.confirmed_through=p_through and a.coverage_from=c.starts_at
 and s.complete and s.coverage_from<=c.starts_at and s.confirmed_through>=p_through
 and exists(select 1 from mkz_all_links where doma_user_id=a.participant and status='linked')
 and a.evidence_fingerprint=mkz_account_evidence(a.campaign_id,a.participant,p_through));
$$;
create or replace function public.mkz_financial_scope(p_campaign text,p_participant text,p_through timestamptz) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare c mkz_campaigns;e mkz_entries;n bigint;
begin
 select * into c from mkz_campaigns where id=p_campaign;
 if not found or c.state='draft' or c.confirmed_through is null or p_through is null or p_through is distinct from c.confirmed_through then return jsonb_build_object('status','pending','eligibleFills',null);end if;
 select * into e from mkz_entries where campaign_id=c.id and participant=p_participant;
 if not found then return jsonb_build_object('status','pending','eligibleFills',null);end if;
 if greatest(c.starts_at,e.entered_at)>p_through then return jsonb_build_object('status','not_started','eligibleFills',null);end if;
 if not mkz_account_coverage_valid(c.id,e.participant,p_through) then return jsonb_build_object('status','pending','eligibleFills',null);end if;
 select count(*) into n from mkz_fills f
 join mkz_wallets w on w.trade_wallet=f.wallet and w.participant=e.participant
 join mkz_markets m on m.chain_id=f.chain_id and m.domain_token=f.domain_token and m.quote_token=f.quote_token
 where f.campaign_id=c.id and f.status='verified' and f.executed_at>=greatest(c.starts_at,e.entered_at) and f.executed_at<=p_through and f.executed_at<c.ends_at;
 return jsonb_build_object('status',case when n=0 then 'no_trades' else 'trader' end,'eligibleFills',n);
end $$;
create or replace function public.mkz_worker_commit(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare packet jsonb;snap jsonb;rid uuid;report jsonb;prior mkz_worker_runs;chunk jsonb;ledger jsonb;
 rows jsonb;row jsonb;c mkz_campaigns;seen text[]:='{}';ledger_seen text[]:='{}';rejects jsonb:='[]';code text;uid text;
begin
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>40000000
 or coalesce(p->>'requestId','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(p->'packet') is distinct from 'object' or jsonb_typeof(p->'report') is distinct from 'object'
 or jsonb_typeof(p->'packet'->'fills') is distinct from 'array' or jsonb_array_length(p->'packet'->'fills')>50000
 then raise exception 'MK_WORKER_INVALID';end if;
 rid:=(p->>'requestId')::uuid;perform pg_advisory_xact_lock(1734590,0);perform pg_advisory_xact_lock(1734521,0);
 select * into prior from mkz_worker_runs where id=rid;
 if found then
  if prior.report->>'requestHash' is distinct from md5(p::text) then raise exception 'MK_WORKER_REQUEST_CONFLICT';end if;
  return jsonb_build_object('ok',true,'replayed',true,'accountingRejected',coalesce(prior.report->'accountingRejected','[]'::jsonb));
 end if;
 snap:=mkz_worker_snapshot();if p->>'fingerprint' is distinct from snap->>'fingerprint' then raise exception 'MK_WORKER_SOURCE_CHANGED';end if;
 packet:=p->'packet';
 if jsonb_typeof(packet->'financialComplete') is distinct from 'boolean' or packet->'financials' is distinct from '[]'::jsonb
 or jsonb_typeof(coalesce(p->'accounting','[]'))<>'array' then raise exception 'MK_WORKER_USE_VERIFIED_ACCOUNTING';end if;
 perform mkz_validate_collector_batch(packet||jsonb_build_object('fills','[]'::jsonb));
 select * into c from mkz_campaigns where id=packet->>'campaignId';
 rows:=p->'accountCoverage';
 -- Legacy complete scans remain accepted after verifying private source coverage.
 if rows is null then
  select coalesce(jsonb_agg(jsonb_build_object('participant',e.participant,'coverageFrom',packet->>'coverageFrom',
   'confirmedThrough',packet->>'confirmedThrough','complete',packet->'complete','problems',case when packet->'complete'='true' then '[]'::jsonb else '["LEGACY_SCAN_INCOMPLETE"]'::jsonb end)),'[]')
  into rows from mkz_entries e where e.campaign_id=c.id;
 end if;
 if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows)>20000 then raise exception 'MK_ACCOUNT_COVERAGE_INVALID';end if;
 for row in select value from jsonb_array_elements(rows) loop
  uid:=row->>'participant';
  if jsonb_typeof(row) is distinct from 'object' or coalesce(uid,'')!~'^[0-9]{1,30}$' or uid=any(seen)
  or jsonb_typeof(row->'complete') is distinct from 'boolean' or jsonb_typeof(row->'problems') is distinct from 'array'
  or jsonb_array_length(row->'problems')>50
  or exists(select 1 from jsonb_array_elements(row->'problems') v where jsonb_typeof(v)<>'string' or (v#>>'{}')!~'^[A-Z][A-Z0-9_]{0,119}$')
  or (row->>'coverageFrom')::timestamptz is distinct from c.starts_at
  or (row->>'confirmedThrough')::timestamptz is distinct from (packet->>'confirmedThrough')::timestamptz
  or not exists(select 1 from mkz_entries where campaign_id=c.id and participant=uid)
  or (row->'complete'='true' and row->'problems'<>'[]'::jsonb)
  then raise exception 'MK_ACCOUNT_COVERAGE_INVALID';end if;
  seen:=array_append(seen,uid);
  if row->'complete'='true' and (not exists(select 1 from mkz_strategy_coverage where participant=uid and complete
   and coverage_from<=c.starts_at and confirmed_through>=(row->>'confirmedThrough')::timestamptz)
   or not exists(select 1 from mkz_all_links where doma_user_id=uid and status='linked')) then raise exception 'MK_ACCOUNT_SOURCE_COVERAGE_REQUIRED';end if;
  insert into mkz_account_coverage values(c.id,uid,(row->>'coverageFrom')::timestamptz,(row->>'confirmedThrough')::timestamptz,
   (row->>'complete')::boolean,row->'problems',mkz_account_evidence(c.id,uid,(row->>'confirmedThrough')::timestamptz),null,now())
  on conflict(campaign_id,participant) do update set coverage_from=excluded.coverage_from,confirmed_through=excluded.confirmed_through,
   complete=excluded.complete,problems=excluded.problems,evidence_fingerprint=excluded.evidence_fingerprint,financial_problem=case when mkz_account_coverage.confirmed_through=excluded.confirmed_through then mkz_account_coverage.financial_problem end,updated_at=excluded.updated_at;
 end loop;
 if cardinality(seen)<>(select count(*) from mkz_entries where campaign_id=c.id) then raise exception 'MK_ACCOUNT_COVERAGE_MISSING';end if;
 if packet->'complete'='true' and exists(select 1 from jsonb_array_elements(rows) r where r->'complete'<>'true'::jsonb)
 then raise exception 'MK_ACCOUNT_GLOBAL_COMPLETE_INVALID';end if;
 -- Identity/campaign/cutoff errors are malformed batches, not account failures.
 for ledger in select value from jsonb_array_elements(coalesce(p->'accounting','[]')) loop
  uid:=ledger->>'participant';
  if jsonb_typeof(ledger) is distinct from 'object' or coalesce(uid,'')!~'^[0-9]{1,30}$' or uid=any(ledger_seen)
  or not uid=any(seen) or ledger->>'campaignId' is distinct from c.id
  or (ledger->>'confirmedThrough')::timestamptz is null or (ledger->>'confirmedThrough')::timestamptz>(packet->>'confirmedThrough')::timestamptz
  then raise exception 'MK_ACCOUNT_LEDGER_INVALID';end if;
  ledger_seen:=array_append(ledger_seen,uid);
 end loop;
 for chunk in select jsonb_agg(value order by ordinality) from jsonb_array_elements(packet->'fills') with ordinality group by (ordinality-1)/2000 loop
  perform mkz_collector_ingest(packet||jsonb_build_object('requestId',gen_random_uuid(),'fills',chunk,'complete',false,'financialComplete',false));
 end loop;
 for ledger in select value from jsonb_array_elements(coalesce(p->'accounting','[]')) loop
  begin
   if not mkz_account_coverage_valid(c.id,ledger->>'participant',(packet->>'confirmedThrough')::timestamptz) then raise exception 'MK_ACCOUNT_LEDGER_COVERAGE_REQUIRED';end if;
   perform mkz_collector_accounting(ledger);
   update mkz_account_coverage set financial_problem=null where campaign_id=c.id and participant=ledger->>'participant';
  exception when others then
   code:=case when SQLERRM~'^[A-Z][A-Z0-9_]{0,119}$' then SQLERRM else 'ACCOUNTING_VALIDATION_FAILED' end;
   rejects:=rejects||jsonb_build_array(jsonb_build_object('participant',ledger->>'participant','code',code));
   update mkz_account_coverage set financial_problem=code where campaign_id=c.id and participant=ledger->>'participant';
  end;
 end loop;
 if jsonb_array_length(rejects)>0 then packet:=packet||jsonb_build_object('financialComplete',false);end if;
 perform mkz_collector_ingest(packet||jsonb_build_object('requestId',gen_random_uuid(),'fills','[]'::jsonb));
 report:=(p->'report')||jsonb_build_object('requestHash',md5(p::text),'accountingRejected',rejects,'financialComplete',packet->'financialComplete');
 insert into mkz_worker_runs(id,report) values(rid,report);
 return jsonb_build_object('ok',true,'replayed',false,'accountingRejected',rejects);
end $$;
-- Preserve all handoff validation, revision and idempotency checks.
do $$begin
 if to_regprocedure('public.mkz_discovery_references_before_isolation(jsonb)') is null then alter function public.mkz_discovery_references(jsonb) rename to mkz_discovery_references_before_isolation;end if;
 if to_regprocedure('public.mkz_resolve_wallet_before_isolation(jsonb)') is null then alter function public.mkz_resolve_wallet(jsonb) rename to mkz_resolve_wallet_before_isolation;end if;
end $$;
create or replace function public.mkz_discovery_references(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare c mkz_campaigns;before_hash text;result jsonb;changed boolean;
begin
 perform pg_advisory_xact_lock(1734590,0);perform pg_advisory_xact_lock(1734521,0);
 select * into c from mkz_campaigns where id='model-kombat-zones-1';
 before_hash:=mkz_account_evidence(c.id,p->>'participant',c.confirmed_through);
 result:=mkz_discovery_references_before_isolation(p);
 changed:=before_hash is distinct from mkz_account_evidence(c.id,p->>'participant',c.confirmed_through)
 or not exists(select 1 from mkz_strategy_coverage where participant=p->>'participant' and complete
  and coverage_from<=c.starts_at and confirmed_through>=c.confirmed_through);
 if not changed or not exists(select 1 from mkz_entries where campaign_id=c.id and participant=p->>'participant') then
  update mkz_campaigns set complete=c.complete,financial_complete=c.financial_complete where id=c.id and state in ('active','closed');
 else
  update mkz_account_coverage set complete=false,problems='["STRATEGY_EVIDENCE_CHANGED"]',updated_at=now() where campaign_id=c.id and participant=p->>'participant';
 end if;
 return result;
end $$;
create or replace function public.mkz_resolve_wallet(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare c mkz_campaigns;before_hash jsonb:='{}';uids text[];uid text;result jsonb;
begin
 perform pg_advisory_xact_lock(1734590,0);perform pg_advisory_xact_lock(1734521,0);
 select * into c from mkz_campaigns where id='model-kombat-zones-1';
 select array_remove(array[(select doma_user_id from mkz_all_links where wallet=p_payload->>'wallet'),p_payload->>'domaUserId'],null) into uids;
 foreach uid in array uids loop before_hash:=before_hash||jsonb_build_object(uid,mkz_account_evidence(c.id,uid,c.confirmed_through));end loop;
 result:=mkz_resolve_wallet_before_isolation(p_payload);
 foreach uid in array uids loop
  if c.state in ('active','closed') and exists(select 1 from mkz_entries where campaign_id=c.id and participant=uid)
  and before_hash->>uid is distinct from mkz_account_evidence(c.id,uid,c.confirmed_through) then
   update mkz_account_coverage set complete=false,problems='["WALLET_EVIDENCE_CHANGED"]',updated_at=now() where campaign_id=c.id and participant=uid;
   update mkz_campaigns set complete=false,financial_complete=false where id=c.id;
  end if;
 end loop;
 return result;
end $$;

create or replace function public.mkz_verified_financials() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare c mkz_campaigns;e mkz_entries;s mkz_accounting_snapshots;r jsonb;scope jsonb;rows jsonb:='[]';n int:=0;pending_count int:=0;later_count int:=0;no_trade_count int:=0;trader_count int:=0;scope_pending_count int:=0;
begin
 select * into c from mkz_campaigns where id='model-kombat-zones-1';
 if not found then return jsonb_build_object('schemaVersion',1,'financialScope','eligible-traders-2','available',false,'checked',0,'pending',0,'notStarted',0,'noTrades',0,'tradingAccounts',0,'scopePending',0,'rows',rows);end if;
 for e in select * from mkz_entries where campaign_id=c.id order by participant loop
  scope:=mkz_financial_scope(c.id,e.participant,c.confirmed_through);
  if scope->>'status'='not_started' then later_count:=later_count+1;continue;end if;
  if scope->>'status'='no_trades' then no_trade_count:=no_trade_count+1;continue;end if;
  if scope->>'status'<>'trader' then pending_count:=pending_count+1;scope_pending_count:=scope_pending_count+1;continue;end if;
  trader_count:=trader_count+1;
  if exists(select 1 from mkz_account_coverage where campaign_id=c.id and participant=e.participant and financial_problem is not null) then pending_count:=pending_count+1;continue;end if;
  select * into s from mkz_accounting_snapshots where campaign_id=c.id and participant=e.participant;
  if not found then pending_count:=pending_count+1;continue;end if;
  begin
   if s.payload->>'participant' is distinct from e.participant or (s.payload->>'confirmedThrough')::timestamptz is distinct from c.confirmed_through then pending_count:=pending_count+1;continue;end if;
   r:=mkz_accounting_result(s.payload);
   rows:=rows||jsonb_build_array(jsonb_build_object('participant',e.participant,'roi',r->>'roi','profit',r->>'profit','confirmedThrough',s.payload->>'confirmedThrough'));n:=n+1;
  exception when others then pending_count:=pending_count+1;end;
 end loop;
 return jsonb_build_object('schemaVersion',1,'financialScope','eligible-traders-2','methodology',c.financial_method,
 'available',c.state<>'draft' and c.confirmed_through is not null,'confirmedThrough',c.confirmed_through,'checked',n,'pending',pending_count,
 'notStarted',later_count,'noTrades',no_trade_count,'tradingAccounts',trader_count,'scopePending',scope_pending_count,'rows',rows);
end $$;
create or replace function public.mkz_read(p_wallet text default null) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 with c as (select * from mkz_campaigns where id='model-kombat-zones-1'),
 scoped as (select e.*,greatest(e.entered_at,c.starts_at)<=c.confirmed_through as started,
 case when c.state='frozen' then c.complete else mkz_account_coverage_valid(c.id,e.participant,c.confirmed_through) and c.state<>'draft' and greatest(e.entered_at,c.starts_at)<=c.confirmed_through end as trade_complete,
 case when c.state='frozen' then c.confirmed_through else a.confirmed_through end as confirmed_through,
 a.confirmed_through=c.confirmed_through as current_cutoff,case when c.state='frozen' then '[]'::jsonb else a.problems end as problems,
 a.complete as last_complete,case when c.state='frozen' then null else a.financial_problem end as financial_problem
 from mkz_entries e join c on c.id=e.campaign_id left join mkz_account_coverage a on a.campaign_id=e.campaign_id and a.participant=e.participant),
 eligible as (select f.*,e.participant from mkz_fills f join mkz_wallets w on w.trade_wallet=f.wallet
 join scoped e on e.participant=w.participant and e.campaign_id=f.campaign_id join c on c.id=f.campaign_id
 join mkz_markets m on m.chain_id=f.chain_id and m.domain_token=f.domain_token and m.quote_token=f.quote_token
 where e.trade_complete and f.status='verified' and f.executed_at>=greatest(c.starts_at,e.entered_at)
 and f.executed_at<=c.confirmed_through and f.executed_at<c.ends_at),
 participants as (select e.participant,e.entered_at,e.trade_complete as "tradeComplete",
 (e.started and not e.trade_complete and (coalesce(jsonb_array_length(e.problems),0)>0 or (coalesce(e.last_complete,false) and coalesce(e.current_cutoff,false)))) as "tradeProblem",
 (e.financial_problem is not null) as "financialProblem",
 case when e.trade_complete then e.confirmed_through end as "tradeThrough",
 case when e.trade_complete then coalesce((select sum(volume_usd)::text from eligible f where f.participant=e.participant),'0') end volume,
 coalesce((select jsonb_agg(executed_at order by executed_at) from eligible f where f.participant=e.participant),'[]'::jsonb) times,
 case when e.trade_complete then (select count(distinct domain_token) from eligible f where f.participant=e.participant) end domains,
 case when e.trade_complete and e.financial_problem is null then (select roi::text from mkz_financials f where f.campaign_id=e.campaign_id and f.participant=e.participant) end roi,
 case when e.trade_complete and e.financial_problem is null then (select profit::text from mkz_financials f where f.campaign_id=e.campaign_id and f.participant=e.participant) end profit,
 coalesce((select sum(points)::text from mkz_attempts a where a.campaign_id=e.campaign_id and a.participant=e.participant),'0') battles,
 greatest(0,12-(select count(*) from mkz_attempts a where a.campaign_id=e.campaign_id and a.participant=e.participant and start_day=(now() at time zone 'UTC')::date)) remaining from scoped e)
 select jsonb_build_object('accountScope','per-account-coverage-1','campaign',(select to_jsonb(c) from c),
 'assets',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('funded_units',funded_units::text,'price_usd',price_usd::text)),'[]'::jsonb) from mkz_reward_assets a),
 'volume',coalesce((select sum(volume_usd)::text from eligible),'0'),
 'days',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select floor(extract(epoch from (f.executed_at-c.starts_at))/86400)::int as day,sum(f.volume_usd)::text volume from eligible f cross join c group by 1 order by 1)x),
 'participants',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from participants p),
 'own',(select participant from mkz_wallets where trade_wallet=p_wallet),
 'linkStatus',coalesce((select status from mkz_wallet_discovery where wallet=p_wallet),'pending'),
 'awards',(select coalesce(jsonb_agg(jsonb_build_object('participant',a.participant,'symbol',a.symbol,'units',a.units::text)),'[]'::jsonb) from mkz_awards a cross join c where a.campaign_id=c.id and c.state='frozen'));
$$;

-- A direct finalization call cannot bypass an account's unresolved ledger issue.
do $$begin
 if to_regprocedure('public.mkz_collector_ingest_before_isolation(jsonb)') is null then alter function public.mkz_collector_ingest(jsonb) rename to mkz_collector_ingest_before_isolation;end if;
end $$;
create or replace function public.mkz_collector_ingest(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if p_payload->'financialComplete'='true'::jsonb and exists(
  select 1 from mkz_entries e left join mkz_account_coverage a on a.campaign_id=e.campaign_id and a.participant=e.participant
  where e.campaign_id=p_payload->>'campaignId' and
  (a.financial_problem is not null or not mkz_account_coverage_valid(e.campaign_id,e.participant,(p_payload->>'confirmedThrough')::timestamptz))
 ) then raise exception 'FINANCIAL_COVERAGE_INCOMPLETE';end if;
 return mkz_collector_ingest_before_isolation(p_payload);
end $$;
revoke all on function mkz_collector_ingest_before_isolation(jsonb) from public,anon,authenticated,service_role;
revoke all on function mkz_collector_ingest(jsonb) from public,anon,authenticated;
grant execute on function mkz_collector_ingest(jsonb) to service_role;


-- Partial display never relaxes the all-account final-award gate. This also
-- catches material registry changes even if legacy global flags remained true.
create or replace function public.mkz_account_freeze_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if new.state='frozen' and old.state is distinct from 'frozen' and exists(
  select 1 from mkz_entries e left join mkz_account_coverage a on a.campaign_id=e.campaign_id and a.participant=e.participant
  where e.campaign_id=new.id and
  (not mkz_account_coverage_valid(new.id,e.participant,new.confirmed_through) or a.financial_problem is not null)
 ) then raise exception 'ACCOUNT_RECONCILIATION_INCOMPLETE';end if;
 return new;
end $$;
drop trigger if exists mkz_account_freeze_guard on mkz_campaigns;
create trigger mkz_account_freeze_guard before update of state on mkz_campaigns
 for each row execute function mkz_account_freeze_guard();
revoke all on function mkz_account_freeze_guard() from public,anon,authenticated,service_role;

create or replace function public.mkz_accounting_capabilities() returns jsonb
language sql immutable security definer set search_path=pg_catalog,public,pg_temp as $$
 select jsonb_build_object('schemaVersion',1,'methodology','mk-fifo-realized-capital-1','openingBasis','deferred-untouched-2',
 'incomingBasis','deferred-direct-transfer-1','verifiedFinancials','per-account-current-cutoff-1','financialScope','eligible-traders-2','accountIsolation','per-account-coverage-1');
$$;
revoke all on function mkz_account_evidence(text,text,timestamptz),mkz_account_coverage_valid(text,text,timestamptz),
 mkz_discovery_references_before_isolation(jsonb),mkz_resolve_wallet_before_isolation(jsonb) from public,anon,authenticated,service_role;
revoke all on function mkz_financial_scope(text,text,timestamptz),mkz_worker_commit(jsonb),mkz_discovery_references(jsonb),mkz_resolve_wallet(jsonb),
 mkz_verified_financials(),mkz_read(text),mkz_accounting_capabilities() from public,anon,authenticated;
grant execute on function mkz_financial_scope(text,text,timestamptz),mkz_worker_commit(jsonb),mkz_discovery_references(jsonb),mkz_resolve_wallet(jsonb),
 mkz_verified_financials(),mkz_read(text),mkz_accounting_capabilities() to service_role;
do $$begin
 if exists(select from pg_roles where rolname='doma_ai_mk') then
  revoke all on function mkz_discovery_references_before_isolation(jsonb),mkz_resolve_wallet_before_isolation(jsonb) from doma_ai_mk;
  grant execute on function mkz_discovery_references(jsonb) to doma_ai_mk;
 end if;
end $$;
commit;
