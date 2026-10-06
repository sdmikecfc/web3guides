-- Model Kombat computes account-level FIFO profit and ROI from evidenced raw lots.
-- Additive: no Reporter writes, no opening, no funding, no new credentials.
begin;
create table if not exists public.mkz_accounting_snapshots (
 campaign_id text not null references public.mkz_campaigns(id), participant text not null,
 revision bigint not null check(revision>0), request_id uuid not null unique,
 payload jsonb not null, received_at timestamptz not null default now(),
 primary key(campaign_id,participant)
);
create table if not exists public.mkz_accounting_receipts (
 request_id uuid primary key, payload jsonb not null, result jsonb, received_at timestamptz not null default now()
);
alter table public.mkz_accounting_receipts add column if not exists result jsonb;
alter table public.mkz_accounting_snapshots enable row level security;
alter table public.mkz_accounting_receipts enable row level security;
revoke all on public.mkz_accounting_snapshots,public.mkz_accounting_receipts from public,anon,authenticated;
grant all on public.mkz_accounting_snapshots,public.mkz_accounting_receipts to service_role;

-- Quantities are integer token units; money is integer micro-USD internally.
-- An ordered complete snapshot is reconstructed on every calculation so corrections
-- can never leave stale realized gains behind. No wallet percentages are summed.
create or replace function public.mkz_fifo_calculate(p jsonb, eligible jsonb default '[]') returns jsonb
language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
declare lots jsonb:='[]'; e jsonb; l jsonb; acquired timestamptz; start_at timestamptz; stop_at timestamptz;
 seen text[]:='{}'; economic text[]:='{}'; capital numeric:=0; profit numeric:=0; proceeds numeric:=0;
 qty numeric; need numeric; take numeric; basis numeric; consumed numeric; money numeric; at_index int; n int:=0;
 kind text; event_at timestamptz; last_at timestamptz; last_order bigint:=-1; k text;
begin
 if jsonb_typeof(p->'openingLots') is distinct from 'array' or jsonb_typeof(p->'events') is distinct from 'array'
 or jsonb_array_length(p->'openingLots')>5000 or jsonb_array_length(p->'events')>10000
 or p->'complete' is distinct from 'true'::jsonb or length(btrim(coalesce(p->>'evidence','')))=0
 then raise exception 'ACCOUNTING_COVERAGE_REQUIRED';end if;
 start_at:=(p->>'periodStart')::timestamptz;stop_at:=(p->>'confirmedThrough')::timestamptz;
 if start_at is null or stop_at is null or start_at>stop_at then raise exception 'ACCOUNTING_PERIOD_INVALID';end if;
 for e in select value from jsonb_array_elements(p->'openingLots') loop
  if coalesce(e->>'id','')='' or e->>'id'=any(seen) or coalesce(e->>'units','')!~'^[1-9][0-9]{0,77}$'
  or coalesce(e->>'wallet','')!~'^0x[0-9a-f]{40}$' or coalesce(e->>'token','')!~'^0x[0-9a-f]{40}$'
  or length(btrim(coalesce(e->>'evidence','')))=0 then raise exception 'ACCOUNTING_LOT_INVALID';end if;
  seen:=array_append(seen,e->>'id');
  foreach k in array array['costUsd','valueUsd'] loop
   if coalesce(e->>k,'')!~'^[0-9]{1,10}(\.[0-9]{1,6})?$' or (e->>k)::numeric>1000000000 then raise exception 'ACCOUNTING_VALUE_REQUIRED';end if;
  end loop;
  acquired:=(e->>'acquiredAt')::timestamptz;
  if acquired is null or acquired>start_at then raise exception 'ACCOUNTING_LOT_DATE';end if;
  capital:=capital+(e->>'valueUsd')::numeric*1000000;
  lots:=lots||jsonb_build_array(jsonb_build_object('wallet',e->>'wallet','token',e->>'token','units',(e->>'units')::numeric,'cost',(e->>'costUsd')::numeric*1000000,'at',acquired,'origin',e->>'id'));
 end loop;
 seen:='{}';last_at:=start_at;
 for e in select value from jsonb_array_elements(p->'events') loop
  n:=n+1;kind:=e->>'kind';event_at:=(e->>'executedAt')::timestamptz;
  if coalesce(e->>'id','')='' or e->>'id'=any(seen) or kind is null or kind not in ('buy','sell','in','out','transfer')
  or coalesce(e->>'units','')!~'^[1-9][0-9]{0,77}$' or coalesce(e->>'wallet','')!~'^0x[0-9a-f]{40}$'
  or coalesce(e->>'token','')!~'^0x[0-9a-f]{40}$' or length(btrim(coalesce(e->>'evidence','')))=0
  or coalesce(e->>'order','')!~'^[0-9]{1,15}$' or event_at is null or event_at<start_at or event_at>stop_at
  or event_at<last_at or (event_at=last_at and (e->>'order')::bigint<=last_order)
  then raise exception 'ACCOUNTING_EVENT_INVALID';end if;
  seen:=array_append(seen,e->>'id');last_at:=event_at;last_order:=(e->>'order')::bigint;qty:=(e->>'units')::numeric;
  if kind in ('buy','sell','in') then
   if coalesce(e->>'usd','')!~'^[0-9]{1,10}(\.[0-9]{1,6})?$' or (e->>'usd')::numeric>1000000000 then raise exception 'ACCOUNTING_VALUE_REQUIRED';end if;
   money:=(e->>'usd')::numeric*1000000;
  else money:=0;end if;
  if kind='in' then
   if coalesce(e->>'costUsd','')!~'^[0-9]{1,10}(\.[0-9]{1,6})?$' or (e->>'costUsd')::numeric>1000000000 then raise exception 'ACCOUNTING_BASIS_REQUIRED';end if;
   capital:=capital+money;
  end if;
  if kind in ('buy','in') then
   lots:=lots||jsonb_build_array(jsonb_build_object('wallet',e->>'wallet','token',e->>'token','units',qty,'cost',case when kind='in' then (e->>'costUsd')::numeric*1000000 else money end,'at',event_at,'origin',e->>'id'));
  else
   if kind='transfer' and (coalesce(e->>'toWallet','')!~'^0x[0-9a-f]{40}$' or e->>'toWallet'=e->>'wallet') then raise exception 'ACCOUNTING_TRANSFER_INVALID';end if;
   need:=qty;consumed:=0;
   while need>0 loop
    select value,(ordinality-1)::int into l,at_index from jsonb_array_elements(lots) with ordinality
     where value->>'wallet'=e->>'wallet' and value->>'token'=e->>'token' and (value->>'units')::numeric>0
     order by (value->>'at')::timestamptz,value->>'origin',ordinality limit 1;
    if not found then raise exception 'ACCOUNTING_MISSING_BASIS';end if;
    take:=least(need,(l->>'units')::numeric);
    basis:=case when take=(l->>'units')::numeric then (l->>'cost')::numeric else trunc((l->>'cost')::numeric*take/(l->>'units')::numeric) end;
    lots:=jsonb_set(lots,array[at_index::text],l||jsonb_build_object('units',(l->>'units')::numeric-take,'cost',(l->>'cost')::numeric-basis));
    if kind='transfer' then lots:=lots||jsonb_build_array(l||jsonb_build_object('wallet',e->>'toWallet','units',take,'cost',basis));end if;
    need:=need-take;consumed:=consumed+basis;
   end loop;
   if kind='sell' and exists(select 1 from jsonb_array_elements(eligible) f where f->>'economicId'=e->>'economicId' and f->>'wallet'=e->>'wallet' and f->>'domainToken'=e->>'token' and (f->>'executedAt')::timestamptz=event_at) then
    if e->>'economicId'=any(economic) then raise exception 'ACCOUNTING_DUPLICATE_SALE';end if;
    economic:=array_append(economic,e->>'economicId');profit:=profit+money-consumed;proceeds:=proceeds+money;
   end if;
  end if;
 end loop;
 return jsonb_build_object('methodology','mk-fifo-realized-capital-1','capitalUsd',(capital/1000000)::text,
 'profit',(profit/1000000)::text,'roi',case when capital>0 then trunc(profit*100/capital,36)::text else null end,
 'eligibleProceedsUsd',(proceeds/1000000)::text,'eligibleSales',cardinality(economic),'events',n);
end $$;

create or replace function public.mkz_accounting_result(p jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare c mkz_campaigns; entry mkz_entries; e jsonb; eligible jsonb; start_at timestamptz; cutoff timestamptz; uid text;
begin
 if p->'schemaVersion' is distinct from '1'::jsonb or p->>'campaignId' is distinct from 'model-kombat-zones-1'
 or p->>'methodology' is distinct from 'mk-fifo-realized-capital-1' or coalesce(p->>'participant','')!~'^[0-9]{1,30}$'
 or octet_length(p::text)>4000000 then raise exception 'ACCOUNTING_PACKET_INVALID';end if;
 uid:=p->>'participant';select * into c from mkz_campaigns where id=p->>'campaignId';
 if not found or c.financial_method<>p->>'methodology' then raise exception 'FINANCIAL_METHOD_MISMATCH';end if;
 select * into entry from mkz_entries where campaign_id=c.id and participant=uid;
 if c.state<>'draft' and not found then raise exception 'PARTICIPANT_NOT_ENROLLED';end if;
 start_at:=(p->>'periodStart')::timestamptz;cutoff:=(p->>'confirmedThrough')::timestamptz;
 if cutoff>now()+interval '60 seconds' or (c.state<>'draft' and (start_at<>greatest(c.starts_at,entry.entered_at) or cutoff>c.ends_at)) then raise exception 'ACCOUNTING_PERIOD_INVALID';end if;
 for e in select value from jsonb_array_elements(p->'openingLots') union all select value from jsonb_array_elements(p->'events') loop
  if not exists(select 1 from mkz_wallets where participant=uid and trade_wallet=e->>'wallet')
  or (e->>'kind'='transfer' and not exists(select 1 from mkz_wallets where participant=uid and trade_wallet=e->>'toWallet')) then raise exception 'ACCOUNTING_WALLET_UNMAPPED';end if;
  -- The zero address denotes native Doma ETH in the accounting ledger only.
  -- It is never an eligible market, volume fill, reward token or WETH balance.
  if e->>'token'<>'0x0000000000000000000000000000000000000000' and not exists(select 1 from mkz_markets where chain_id=97477 and (domain_token=e->>'token' or quote_token=e->>'token')) then raise exception 'ACCOUNTING_ASSET_UNVERIFIED';end if;
 end loop;
 select coalesce(jsonb_agg(f.payload),'[]') into eligible from mkz_fills f
 join mkz_wallets w on w.trade_wallet=f.wallet and w.participant=uid
 join mkz_markets m on m.chain_id=f.chain_id and m.domain_token=f.domain_token and m.quote_token=f.quote_token
 where f.campaign_id=c.id and f.status='verified' and f.executed_at>=start_at and f.executed_at<=cutoff and f.executed_at<c.ends_at;
 if exists(select 1 from jsonb_array_elements(eligible) f where
  (select count(*) from jsonb_array_elements(p->'events') a where a->>'economicId'=f->>'economicId' and a->>'wallet'=f->>'wallet' and a->>'token'=f->>'domainToken' and a->>'kind' in ('buy','sell') and (a->>'executedAt')::timestamptz=(f->>'executedAt')::timestamptz and (a->>'notionalUsd')::numeric=(f->>'volumeUsd')::numeric)<>1)
 then raise exception 'ACCOUNTING_FILL_COVERAGE_INCOMPLETE';end if;
 return mkz_fifo_calculate(p,eligible);
end $$;

-- Same narrowly scoped existing collector login. Draft calls validate but never store.
create or replace function public.mkz_collector_accounting(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare c mkz_campaigns; r jsonb; prior jsonb; old mkz_accounting_snapshots; rid uuid;
begin
 if coalesce(p_payload->>'requestId','')!~'^[0-9a-f-]{36}$' or coalesce(p_payload->>'revision','')!~'^[1-9][0-9]{0,14}$' then raise exception 'ACCOUNTING_PACKET_INVALID';end if;
 rid:=(p_payload->>'requestId')::uuid;perform pg_advisory_xact_lock(1734590,0);
 select * into c from mkz_campaigns where id=p_payload->>'campaignId' for update;
 if not found or c.state='frozen' then raise exception 'CAMPAIGN_NOT_ACCEPTING';end if;
 select payload,result into prior,r from mkz_accounting_receipts where request_id=rid;
 if found then if prior<>p_payload then raise exception 'BATCH_CONFLICT';end if;return jsonb_build_object('ok',true,'replayed',true,'result',r);end if;
 r:=mkz_accounting_result(p_payload);
 if c.state='draft' then return jsonb_build_object('ok',true,'mode','read_only','writesPerformed',0,'result',r);end if;
 select * into old from mkz_accounting_snapshots where campaign_id=c.id and participant=p_payload->>'participant';
 if found and ((p_payload->>'revision')::bigint<=old.revision or (p_payload->>'confirmedThrough')::timestamptz<(old.payload->>'confirmedThrough')::timestamptz) then raise exception 'ACCOUNTING_REVISION_CONFLICT';end if;
 insert into mkz_accounting_snapshots(campaign_id,participant,revision,request_id,payload) values(c.id,p_payload->>'participant',(p_payload->>'revision')::bigint,rid,p_payload)
 on conflict(campaign_id,participant) do update set revision=excluded.revision,request_id=excluded.request_id,payload=excluded.payload,received_at=now();
 insert into mkz_accounting_receipts(request_id,payload,result) values(rid,p_payload,r);
 update mkz_campaigns set financial_complete=false where id=c.id;
 return jsonb_build_object('ok',true,'replayed',false,'result',r,'financialComplete',false);
end $$;

-- Volume continues to be summed from deduplicated verified fills by mkz_read.
-- Final batch asks for financial completion; scores are calculated here from raw
-- snapshots, never trusted from the collector's supplied roi/profit numbers.
create or replace function public.mkz_collector_ingest(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare next_payload jsonb:=p_payload; finances jsonb:='[]'; e mkz_entries; s mkz_accounting_snapshots; r jsonb; receipt jsonb; prior jsonb;
begin
 perform mkz_validate_collector_batch(p_payload);perform pg_advisory_xact_lock(1734590,0);
 select payload into prior from mkz_accounting_receipts where request_id=(p_payload->>'requestId')::uuid;
 if found then if prior<>p_payload then raise exception 'BATCH_CONFLICT';end if;return jsonb_build_object('ok',true,'replayed',true);end if;
 if (p_payload->>'financialComplete')::boolean then
  if jsonb_array_length(p_payload->'financials')<>0 or jsonb_array_length(p_payload->'fills')<>0 then raise exception 'ACCOUNTING_FINAL_BATCH_MUST_BE_EMPTY';end if;
  for e in select * from mkz_entries where campaign_id=p_payload->>'campaignId' order by participant loop
   select * into s from mkz_accounting_snapshots where campaign_id=e.campaign_id and participant=e.participant;
   if not found or (s.payload->>'confirmedThrough')::timestamptz<>(p_payload->>'confirmedThrough')::timestamptz then raise exception 'FINANCIAL_COVERAGE_INCOMPLETE';end if;
   r:=mkz_accounting_result(s.payload);
   finances:=finances||jsonb_build_array(jsonb_build_object('participant',e.participant,'roi',r->'roi','profit',r->'profit','evidence','Server FIFO from accounting receipt '||s.request_id::text));
  end loop;
  next_payload:=p_payload||jsonb_build_object('financials',finances);
 end if;
 receipt:=mkz_ingest(next_payload);
 if (p_payload->>'financialComplete')::boolean then insert into mkz_accounting_receipts(request_id,payload) values((p_payload->>'requestId')::uuid,p_payload);end if;
 return receipt;
end $$;
revoke all on function mkz_fifo_calculate(jsonb,jsonb),mkz_accounting_result(jsonb),mkz_collector_accounting(jsonb) from public,anon,authenticated;
grant execute on function mkz_collector_accounting(jsonb) to service_role;
do $$begin if exists(select 1 from pg_roles where rolname='doma_ai_mk') then grant execute on function mkz_collector_accounting(jsonb) to doma_ai_mk;end if;end $$;
commit;
