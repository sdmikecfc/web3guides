-- Additive Model Kombat competition. Apply after workshop, journey and wallet-links.
-- No Reporter writes. Never opens a competition or replaces existing records.
begin;
create table if not exists public.mkz_campaigns (
 id text primary key, rules text not null check(rules='mk-token-zones-1'),
 state text not null default 'draft' check(state in ('draft','active','closed','frozen')),
 starts_at timestamptz, ends_at timestamptz, financial_method text,
 confirmed_through timestamptz, complete boolean not null default false,
 financial_complete boolean not null default false, disputes integer not null default 0 check(disputes>=0),
 check((state='draft' and starts_at is null and ends_at is null) or
 (state<>'draft' and starts_at is not null and ends_at=starts_at+interval '28 days' and financial_method is not null))
);
insert into mkz_campaigns(id,rules) values('model-kombat-zones-1','mk-token-zones-1') on conflict do nothing;
create table if not exists public.mkz_reward_assets (
 symbol text primary key, chain_id integer not null check(chain_id=97477), address text not null check(address~'^0x[0-9a-f]{40}$'),
 decimals integer not null check(decimals between 0 and 36), funded_units numeric(78,0) not null check(funded_units>=0),
 required_quantity numeric not null check(required_quantity>0), threshold numeric not null check(threshold>0),
 liquid_pair text not null check(liquid_pair~'^0x[0-9a-f]{40}$'), verified_at timestamptz not null,
 price_usd numeric, price_at timestamptz, unique(chain_id,address)
);
-- Only verified registry entries belong here, never guessed ticker matches.
create table if not exists public.mkz_markets (
 chain_id integer not null check(chain_id=97477), domain_token text not null check(domain_token~'^0x[0-9a-f]{40}$'),
 quote_token text not null check(quote_token~'^0x[0-9a-f]{40}$'), domain_name text not null,
 quote_kind text not null check(quote_kind in ('USDC','ETH')), evidence text not null, verified_at timestamptz not null,
 primary key(chain_id,domain_token,quote_token), check(domain_token<>quote_token)
);
create table if not exists public.mkz_entries (
 campaign_id text not null references mkz_campaigns(id), participant text not null,
 wallet text not null check(wallet~'^0x[0-9a-f]{40}$'), entered_at timestamptz not null default clock_timestamp(),
 primary key(campaign_id,participant), unique(campaign_id,wallet)
);
create table if not exists public.mkz_fills (
 campaign_id text not null references mkz_campaigns(id), chain_id integer not null,
 economic_id text not null, revision bigint not null check(revision>0), wallet text not null check(wallet~'^0x[0-9a-f]{40}$'),
 transaction_hash text not null check(transaction_hash~'^0x[0-9a-f]{64}$'),
 domain_token text not null, quote_token text not null, executed_at timestamptz not null,
 volume_usd numeric(40,6) not null check(volume_usd>0), source text not null check(source in ('strategy','agent_wallet')),
 status text not null check(status in ('verified','revoked')), evidence text not null, payload jsonb not null,
 primary key(campaign_id,chain_id,economic_id), foreign key(chain_id,domain_token,quote_token) references mkz_markets
);
create table if not exists public.mkz_financials (
 campaign_id text not null references mkz_campaigns(id), participant text not null,
 roi numeric, profit numeric, methodology text not null, evidence text not null,
 primary key(campaign_id,participant)
);
-- Widen an earlier draft install without rounding or rewriting recorded values.
alter table public.mkz_financials alter column roi type numeric, alter column profit type numeric;
create table if not exists public.mkz_batches(request_id uuid primary key,payload jsonb not null,accepted_at timestamptz not null default now());
create table if not exists public.mkz_attempts (
 fight_id uuid primary key, campaign_id text not null references mkz_campaigns(id),participant text not null,
 garage_id uuid not null references mk8_garages(id),started_at timestamptz not null,start_day date not null,
 ordinal integer not null check(ordinal between 1 and 12),completed_at timestamptz,points integer check(points in (0,1)),
 unique(campaign_id,participant,start_day,ordinal),foreign key(campaign_id,participant) references mkz_entries
);
create table if not exists public.mkz_awards (
 campaign_id text not null references mkz_campaigns(id),participant text not null,symbol text not null references mkz_reward_assets(symbol),
 units numeric(78,0) not null check(units>=0), snapshot jsonb not null, primary key(campaign_id,participant,symbol)
);
create table if not exists public.mkz_finalizations (
 campaign_id text primary key references mkz_campaigns(id), source_snapshot jsonb not null,
 awards jsonb not null, finalized_at timestamptz not null default clock_timestamp()
);
create or replace view public.mkz_wallets with(security_barrier=true) as
 select doma_user_id participant,wallet trade_wallet from mk8_wallet_links where status='linked'
 union select doma_user_id,mcp_wallet from mk8_wallet_links where status='linked';

create or replace function public.mkz_enter(p_wallet text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare c mkz_campaigns%rowtype; uid text;
begin
 select * into c from mkz_campaigns where id='model-kombat-zones-1' for share;
 if not found or c.state<>'active' or now()<c.starts_at or now()>=c.ends_at then raise exception 'COMPETITION_NOT_OPEN';end if;
 if exists(select 1 from battle_bots_players where wallet=p_wallet and (is_test or is_operator)) then raise exception 'ACCOUNT_INELIGIBLE';end if;
 select participant into uid from mkz_wallets where trade_wallet=p_wallet;
 if uid is null then raise exception 'WALLET_LINK_PENDING';end if;
 insert into mkz_entries(campaign_id,participant,wallet) values(c.id,uid,p_wallet) on conflict(campaign_id,participant) do nothing;
 return jsonb_build_object('ok',true);
end $$;

-- Replaced by the account-grouping migration when additional wallets are linked.
create or replace function public.mkz_agent_wallet(p_wallet text) returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from mk8_wallet_links where status='linked' and mcp_wallet=p_wallet);
$$;
create or replace function public.mkz_ingest(p_payload jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare c mkz_campaigns%rowtype; prior jsonb; f jsonb; old mkz_fills%rowtype; rid uuid; through_at timestamptz; uid text;
begin
 rid:=(p_payload->>'requestId')::uuid;
 perform pg_advisory_xact_lock(1734590,0);
 select payload into prior from mkz_batches where request_id=rid;
 if found then if prior<>p_payload then raise exception 'BATCH_CONFLICT';end if;return jsonb_build_object('ok',true,'replayed',true);end if;
 select * into c from mkz_campaigns where id=p_payload->>'campaignId' for update;
 if not found or c.state not in ('active','closed') then raise exception 'CAMPAIGN_NOT_ACCEPTING';end if;
 through_at:=(p_payload->>'confirmedThrough')::timestamptz;
 if p_payload->>'rules'<>c.rules or (p_payload->>'coverageFrom')::timestamptz<>c.starts_at or through_at>now()+interval '60 seconds'
 or through_at<c.starts_at or through_at<coalesce(c.confirmed_through,c.starts_at) then raise exception 'COVERAGE_INVALID';end if;
 if jsonb_typeof(p_payload->'fills')<>'array' or jsonb_array_length(p_payload->'fills')>2000 then raise exception 'FILLS_INVALID';end if;
 for f in select value from jsonb_array_elements(p_payload->'fills') loop
  if (f->>'executedAt')::timestamptz>through_at or length(f->>'evidence')<1 then raise exception 'FILL_EVIDENCE_INVALID';end if;
  if not exists(select 1 from mkz_wallets w join mkz_entries e on e.participant=w.participant and e.campaign_id=c.id where w.trade_wallet=f->>'wallet') then raise exception 'WALLET_NOT_ENROLLED';end if;
  if f->>'source'='agent_wallet' and not mkz_agent_wallet(f->>'wallet') then raise exception 'AGENT_WALLET_UNVERIFIED';end if;
  select * into old from mkz_fills where campaign_id=c.id and chain_id=(f->>'chainId')::int and economic_id=f->>'economicId';
  if found and old.revision=(f->>'revision')::bigint and old.payload<>f then raise exception 'FILL_REVISION_CONFLICT';end if;
  insert into mkz_fills values(c.id,(f->>'chainId')::int,f->>'economicId',(f->>'revision')::bigint,f->>'wallet',f->>'transactionHash',f->>'domainToken',f->>'quoteToken',(f->>'executedAt')::timestamptz,(f->>'volumeUsd')::numeric,f->>'source',f->>'status',f->>'evidence',f)
  on conflict(campaign_id,chain_id,economic_id) do update set revision=excluded.revision,wallet=excluded.wallet,transaction_hash=excluded.transaction_hash,domain_token=excluded.domain_token,quote_token=excluded.quote_token,executed_at=excluded.executed_at,volume_usd=excluded.volume_usd,source=excluded.source,status=excluded.status,evidence=excluded.evidence,payload=excluded.payload where excluded.revision>mkz_fills.revision;
 end loop;
 -- Financial records are a COMPLETE participant-level snapshot from the reviewed
 -- existing methodology, not a sum of per-wallet percentages or trade volume.
 if coalesce((p_payload->>'financialComplete')::boolean,false) then
  if p_payload->>'methodology' is distinct from c.financial_method then raise exception 'FINANCIAL_METHOD_MISMATCH';end if;
  delete from mkz_financials where campaign_id=c.id;
  for f in select value from jsonb_array_elements(p_payload->'financials') loop
   uid:=f->>'participant';if not exists(select 1 from mkz_entries where campaign_id=c.id and participant=uid) or length(f->>'evidence')<1 then raise exception 'FINANCIAL_EVIDENCE_INVALID';end if;
   insert into mkz_financials values(c.id,uid,(f->>'roi')::numeric,(f->>'profit')::numeric,c.financial_method,f->>'evidence');
  end loop;
  if (select count(*) from mkz_financials where campaign_id=c.id)<>(select count(*) from mkz_entries where campaign_id=c.id) then raise exception 'FINANCIAL_COVERAGE_INCOMPLETE';end if;
 end if;
 update mkz_campaigns set confirmed_through=through_at,complete=(p_payload->>'complete')::boolean,financial_complete=(p_payload->>'financialComplete')::boolean where id=c.id;
 insert into mkz_batches(request_id,payload) values(rid,p_payload);
 return jsonb_build_object('ok',true,'replayed',false);
end $$;

create or replace function public.mkz_read(p_wallet text default null) returns jsonb language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 with c as (select * from mkz_campaigns where id='model-kombat-zones-1'),
 eligible as (
 select f.*,e.participant from mkz_fills f join mkz_wallets w on w.trade_wallet=f.wallet join mkz_entries e on e.participant=w.participant and e.campaign_id=f.campaign_id join c on c.id=f.campaign_id
 where c.state<>'draft' and f.status='verified' and f.executed_at>=greatest(c.starts_at,e.entered_at) and f.executed_at<c.ends_at
 ),
 participants as (select e.participant,e.entered_at,
 coalesce((select sum(volume_usd)::text from eligible f where f.participant=e.participant),'0') volume,
 coalesce((select jsonb_agg(executed_at order by executed_at) from eligible f where f.participant=e.participant),'[]'::jsonb) times,
 (select count(distinct domain_token) from eligible f where f.participant=e.participant) domains,
 (select roi::text from mkz_financials f where f.campaign_id=e.campaign_id and f.participant=e.participant) roi,
 (select profit::text from mkz_financials f where f.campaign_id=e.campaign_id and f.participant=e.participant) profit,
 coalesce((select sum(points)::text from mkz_attempts a where a.campaign_id=e.campaign_id and a.participant=e.participant),'0') battles,
 greatest(0,12-(select count(*) from mkz_attempts a where a.campaign_id=e.campaign_id and a.participant=e.participant and start_day=(now() at time zone 'UTC')::date)) remaining
 from mkz_entries e join c on c.id=e.campaign_id)
 select jsonb_build_object('campaign',(select to_jsonb(c) from c),
 'assets',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('funded_units',funded_units::text,'price_usd',price_usd::text)),'[]'::jsonb) from mkz_reward_assets a),
 'volume',coalesce((select sum(volume_usd)::text from eligible),'0'),
 'days',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select floor(extract(epoch from (f.executed_at-c.starts_at))/86400)::int as day,sum(f.volume_usd)::text volume from eligible f cross join c group by 1 order by 1)x),
 'participants',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from participants p),
 'own',(select participant from mkz_wallets where trade_wallet=p_wallet),
 'linkStatus',coalesce((select status from mk8_wallet_discovery where wallet=p_wallet),'pending'),
 'awards',(select coalesce(jsonb_agg(jsonb_build_object('participant',a.participant,'symbol',a.symbol,'units',a.units::text)),'[]'::jsonb) from mkz_awards a cross join c where a.campaign_id=c.id and c.state='frozen'));
$$;

-- Reservation, settlement and existing coin settlement share one transaction.
create or replace function public.mkz_commit(p_player uuid,p_garage uuid,p_revision bigint,p_request text,p_state jsonb,p_day date default null,p_public jsonb default null,p_wallet text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare g mk8_garages; c mkz_campaigns; a mkz_attempts; s jsonb:=p_state; f jsonb; info jsonb;
 n integer; started timestamptz; finished timestamptz; reason text; award integer; owner_wallet text; uid text;
begin
 select wallet into owner_wallet from mk8_players where id=p_player for update;
 select * into g from mk8_garages where id=p_garage and player_id=p_player for update;
 if not found then raise exception 'GARAGE_NOT_FOUND';end if;
 if exists(select 1 from mk8_journey_requests where garage_id=p_garage and request_id=p_request) then return g.state;end if;
 if g.revision<>p_revision then raise exception 'REVISION_CONFLICT';end if;
 select * into c from mkz_campaigns where id='model-kombat-zones-1' for share;
 if not found then raise exception 'TOKEN_ZONE_SETUP_MISSING';end if;
 select participant into uid from mkz_wallets where trade_wallet=p_wallet;
 if coalesce((g.state->'active'->>'waiting')::boolean,false) and s->'active'->>'waiting'='false' then
  f:=s->'active';if f->>'id' is distinct from g.state->'active'->>'id' then raise exception 'INVALID_FIGHT';end if;
  started:=clock_timestamp()+interval '1 second';s:=jsonb_set(s,'{active,startedAt}',to_jsonb(floor(extract(epoch from started)*1000)::bigint));
  reason:='Competition has not started.';
  if c.state in ('closed','frozen') then reason:='Competition is closed.';
  elsif c.state='active' and started>=c.starts_at and started<c.ends_at then
   if coalesce(f->>'mode','house')<>'house' or f->>'robotId' is null then reason:='Training and loaners do not earn competition points.';
   elsif p_wallet is null or p_wallet is distinct from owner_wallet or uid is null then reason:='Sign in and link your Doma account before scoring.';
   elsif not exists(select 1 from mkz_entries where campaign_id=c.id and participant=uid and entered_at<=started) then reason:='Enter the competition before starting a scored fight.';
   else
    perform pg_advisory_xact_lock(hashtextextended(c.id||uid,10));
    select count(*) into n from mkz_attempts where campaign_id=c.id and participant=uid and start_day=(started at time zone 'UTC')::date;
    if n>=12 then reason:='All 12 scored fights have been started today.';
    else insert into mkz_attempts(fight_id,campaign_id,participant,garage_id,started_at,start_day,ordinal) values((f->>'id')::uuid,c.id,uid,p_garage,started,(started at time zone 'UTC')::date,n+1);reason:=null;end if;
   end if;
  end if;
  info:=jsonb_build_object('rules',c.rules,'status',case when reason is null then 'reserved' else 'not_scored' end,'reason',coalesce(reason,'Scored house fight reserved. A win earns 1 point.'),'points',case when reason is null then null else 0 end,'campaignId',c.id);
  s:=jsonb_set(s,'{active,competition}',info);
 end if;
 if p_day is not null then
  f:=s->'history'->0;select * into a from mkz_attempts where fight_id=(f->>'id')::uuid and garage_id=p_garage for update;
  info:=g.state->'active'->'competition';
  if found then
   finished:=to_timestamp((f->>'completedAt')::numeric/1000);
   if finished<a.started_at or finished>clock_timestamp()+interval '2 seconds' or a.completed_at is not null then raise exception 'INVALID_COMPLETION';end if;
   award:=case when (f->>'winner')::int=0 and finished<c.ends_at and c.state in ('active','closed') then 1 else 0 end;
   update mkz_attempts set completed_at=finished,points=award where fight_id=a.fight_id;
   info:=jsonb_build_object('rules',c.rules,'status','settled','points',award,'campaignId',c.id,'reason',case when award=1 then 'Verified house win.' when finished>=c.ends_at then 'Finished after closing.' else 'Only a win earns a battle point.' end);
  end if;
  if info is null then info:=jsonb_build_object('rules',c.rules,'status','not_scored','points',0,'reason','This fight was not entered for competition scoring.');end if;
  s:=jsonb_set(s,'{history,0,competition}',info);
  if s->'journey'->'retained' ? (f->>'id') then s:=jsonb_set(s,array['journey','retained',f->>'id','competition'],info);end if;
  if p_public is not null then p_public:=jsonb_set(p_public,'{competition}',info);end if;
 end if;
 return mk8_journey_commit(p_player,p_garage,p_revision,p_request,s,p_day,p_public);
end $$;
revoke all on function mkz_commit(uuid,uuid,bigint,text,jsonb,date,jsonb,text) from public,anon,authenticated;
grant execute on function mkz_commit(uuid,uuid,bigint,text,jsonb,date,jsonb,text) to service_role;

-- Require explicit, reviewed funding/configuration before opening. Draft migrations
-- cannot enable enrollment, and an active configuration cannot be rewritten.
create or replace function public.mkz_campaign_guard() returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp as $$
begin
 if old.state='frozen' and new is distinct from old then raise exception 'FINAL_RESULTS_FROZEN';end if;
 if new.state<>old.state and not ((old.state='draft' and new.state='active') or (old.state='active' and new.state='closed') or (old.state='closed' and new.state='frozen')) then raise exception 'INVALID_CAMPAIGN_TRANSITION';end if;
 if old.state<>'draft' and (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.rules<>old.rules or new.financial_method is distinct from old.financial_method) then raise exception 'FROZEN_RULES';end if;
 if old.state='draft' and new.state='active' then
  if (select count(*) from mkz_reward_assets)<>9 or exists(select 1 from mkz_reward_assets where funded_units<required_quantity*power(10::numeric,decimals) or trunc(required_quantity*power(10::numeric,decimals))<>required_quantity*power(10::numeric,decimals) or verified_at<now()-interval '1 day') or not exists(select 1 from mkz_markets)
  or exists(select 1 from (values ('USDC',1000::numeric,5000::numeric),('DEPIN.ai',3304.58,25000),('ALERT.ai',968.60,50000),('BRAG.com',3440.80,100000),('INVESTORS.xyz',13966.48,175000),('RIDES.com',3543.22,250000),('BONER.com',2261.22,400000),('GOCHUJANG.com',619.06,550000),('SOFTWARE.ai',2437.97,750000)) v(symbol,quantity,threshold) left join mkz_reward_assets a on a.symbol=v.symbol where a.symbol is null or a.required_quantity<>v.quantity or a.threshold<>v.threshold) then raise exception 'FUNDING_AND_MARKETS_UNVERIFIED';end if;
 end if;
 if new.state='frozen' and old.state<>'frozen' then
  if now()<new.ends_at+interval '48 hours' or not new.complete or not new.financial_complete or new.confirmed_through is null or new.confirmed_through<new.ends_at or new.disputes<>0 then raise exception 'RECONCILIATION_INCOMPLETE';end if;
  if not exists(select 1 from mkz_finalizations where campaign_id=new.id) then raise exception 'FINAL_AWARDS_REQUIRED';end if;
 end if;
 return new;
end $$;
drop trigger if exists mkz_campaign_guard on mkz_campaigns;
create trigger mkz_campaign_guard before update on mkz_campaigns for each row execute function mkz_campaign_guard();

-- Price/funding observations may refresh, but the promised token contract,
-- precision, quantity and threshold cannot change after opening.
create or replace function public.mkz_asset_guard() returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp as $$
begin
 perform 1 from mkz_campaigns for share;
 if exists(select 1 from mkz_campaigns where state<>'draft') then
  if tg_op<>'UPDATE' then raise exception 'REWARD_DEFINITION_LOCKED';end if;
  if (new.symbol,new.chain_id,new.address,new.decimals,new.required_quantity,new.threshold) is distinct from (old.symbol,old.chain_id,old.address,old.decimals,old.required_quantity,old.threshold) then raise exception 'REWARD_DEFINITION_LOCKED';end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
drop trigger if exists mkz_asset_guard on mkz_reward_assets;
create trigger mkz_asset_guard before insert or update or delete on mkz_reward_assets for each row execute function mkz_asset_guard();

create or replace function public.mkz_record_guard() returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp as $$
declare cid text;
begin
 cid:=case when tg_op='DELETE' then old.campaign_id else new.campaign_id end;
 perform 1 from mkz_campaigns where id=cid for share;
 if exists(select 1 from mkz_campaigns where id=cid and state='frozen') then raise exception 'FINAL_RESULTS_FROZEN';end if;
 if tg_op='UPDATE' and old.campaign_id<>new.campaign_id then raise exception 'CAMPAIGN_ID_IMMUTABLE';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
do $$declare n text;begin
 foreach n in array array['mkz_fills','mkz_financials','mkz_attempts','mkz_entries','mkz_awards','mkz_finalizations'] loop
 execute format('drop trigger if exists mkz_record_guard on %I',n);
 execute format('create trigger mkz_record_guard before insert or update or delete on %I for each row execute function mkz_record_guard()',n);
 end loop;
end $$;

-- Operator-only finalization. The server's versioned integer allocator produces
-- this packet. Snapshot comparison rejects a correction racing the calculation.
-- This RPC neither pays tokens nor opens the campaign.
create or replace function public.mkz_finalize(p_snapshot jsonb,p_awards jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare c mkz_campaigns; prior mkz_finalizations; a jsonb; current_snapshot jsonb;
begin
 perform pg_advisory_xact_lock(1734590,0);
 select * into c from mkz_campaigns where id='model-kombat-zones-1' for update;
 select * into prior from mkz_finalizations where campaign_id=c.id;
 if found then
  if prior.source_snapshot=p_snapshot and prior.awards=p_awards then return jsonb_build_object('ok',true,'replayed',true);end if;
  raise exception 'FINALIZATION_CONFLICT';
 end if;
 if c.state<>'closed' or now()<c.ends_at+interval '48 hours' or not c.complete or not c.financial_complete or c.confirmed_through is null or c.confirmed_through<c.ends_at or c.disputes<>0 then raise exception 'RECONCILIATION_INCOMPLETE';end if;
 current_snapshot:=mkz_read(null);
 if p_snapshot is distinct from current_snapshot then raise exception 'SOURCE_CHANGED_RECALCULATE';end if;
 if jsonb_typeof(p_awards) is distinct from 'array' or jsonb_array_length(p_awards)>180000 then raise exception 'INVALID_AWARDS';end if;
 for a in select value from jsonb_array_elements(p_awards) loop
  if a->>'units' is null or a->>'units' !~ '^(0|[1-9][0-9]{0,77})$' or not exists(select 1 from mkz_entries where campaign_id=c.id and participant=a->>'id') then raise exception 'INVALID_AWARDS';end if;
  insert into mkz_awards values(c.id,a->>'id',a->>'symbol',(a->>'units')::numeric,jsonb_build_object('rules',c.rules));
 end loop;
 if exists(select 1 from mkz_awards w join mkz_reward_assets a on a.symbol=w.symbol where w.campaign_id=c.id group by a.symbol,a.threshold,a.required_quantity,a.decimals,a.funded_units having a.threshold>(current_snapshot->>'volume')::numeric or sum(w.units)>a.required_quantity*power(10::numeric,a.decimals) or sum(w.units)>a.funded_units) then raise exception 'AWARD_BUDGET_EXCEEDED';end if;
 insert into mkz_finalizations values(c.id,p_snapshot,p_awards,clock_timestamp());
 update mkz_campaigns set state='frozen' where id=c.id;
 return jsonb_build_object('ok',true,'replayed',false);
end $$;
revoke all on function mkz_finalize(jsonb,jsonb) from public,anon,authenticated;
grant execute on function mkz_finalize(jsonb,jsonb) to service_role;
do $$declare n text;begin
 foreach n in array array['mkz_campaigns','mkz_reward_assets','mkz_markets','mkz_entries','mkz_fills','mkz_financials','mkz_batches','mkz_attempts','mkz_awards','mkz_finalizations'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated',n);
 execute format('grant select,insert,update on public.%I to service_role',n);
 end loop;
end $$;
revoke insert,update on mkz_awards,mkz_finalizations from service_role;
revoke all on mkz_wallets from public,anon,authenticated;
grant select on mkz_wallets to service_role;
revoke all on function mkz_enter(text),mkz_read(text),mkz_ingest(jsonb) from public,anon,authenticated;
grant execute on function mkz_enter(text),mkz_read(text),mkz_ingest(jsonb) to service_role;
commit;
