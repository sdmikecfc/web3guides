-- Additive Model Kombat opening-basis representation. No score, campaign or inventory writes.
-- Untouched holdings retain exact entry capital; unknown costs can never be consumed.
begin;
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
  if e ? 'costKnown' and jsonb_typeof(e->'costKnown')<>'boolean' then raise exception 'ACCOUNTING_UNKNOWN_BASIS_INVALID';end if;
  if e ? 'acquisitionOrder' and coalesce(e->>'acquisitionOrder','')!~'^[0-9]{1,15}$' then raise exception 'ACCOUNTING_LOT_INVALID';end if;
  if e->'costKnown'='false'::jsonb and e ? 'costUsd' then raise exception 'ACCOUNTING_UNKNOWN_BASIS_INVALID';end if;
  foreach k in array case when e->'costKnown'='false'::jsonb then array['valueUsd'] else array['costUsd','valueUsd'] end loop
   if coalesce(e->>k,'')!~'^[0-9]{1,10}(\.[0-9]{1,6})?$' or (e->>k)::numeric>1000000000 then raise exception 'ACCOUNTING_VALUE_REQUIRED';end if;
  end loop;
  acquired:=(e->>'acquiredAt')::timestamptz;
  if acquired is null or acquired>start_at or (e->'costKnown'='false'::jsonb and acquired>=start_at) then raise exception 'ACCOUNTING_LOT_DATE';end if;
  capital:=capital+(e->>'valueUsd')::numeric*1000000;
  lots:=lots||jsonb_build_array(jsonb_build_object('wallet',e->>'wallet','token',e->>'token','units',(e->>'units')::numeric,'cost',case when e->'costKnown'='false'::jsonb then null else (e->>'costUsd')::numeric*1000000 end,'costKnown',coalesce((e->>'costKnown')::boolean,true),'at',acquired,'acquisitionOrder',e->'acquisitionOrder','origin',e->>'id'));
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
  if e ? 'acquisitionOrder' and (coalesce(e->>'acquisitionOrder','')!~'^[0-9]{1,15}$' or (e->>'acquisitionOrder')::bigint<>(e->>'order')::bigint) then raise exception 'ACCOUNTING_EVENT_INVALID';end if;
  if kind in ('buy','sell','in') then
   if coalesce(e->>'usd','')!~'^[0-9]{1,10}(\.[0-9]{1,6})?$' or (e->>'usd')::numeric>1000000000 then raise exception 'ACCOUNTING_VALUE_REQUIRED';end if;
   money:=(e->>'usd')::numeric*1000000;
  else money:=0;end if;
  if e ? 'costKnown' and (kind<>'in' or jsonb_typeof(e->'costKnown')<>'boolean') then raise exception 'ACCOUNTING_UNKNOWN_BASIS_INVALID';end if;
  if kind='in' then
   if e->'costKnown'='false'::jsonb then
    if e ? 'costUsd' then raise exception 'ACCOUNTING_UNKNOWN_BASIS_INVALID';end if;
   elsif coalesce(e->>'costUsd','')!~'^[0-9]{1,10}(\.[0-9]{1,6})?$' or (e->>'costUsd')::numeric>1000000000 then raise exception 'ACCOUNTING_BASIS_REQUIRED';end if;
   capital:=capital+money;
  end if;
  if kind in ('buy','in') then
   lots:=lots||jsonb_build_array(jsonb_build_object('wallet',e->>'wallet','token',e->>'token','units',qty,'cost',case when kind='in' and e->'costKnown'='false'::jsonb then null when kind='in' then (e->>'costUsd')::numeric*1000000 else money end,'costKnown',case when kind='in' then coalesce((e->>'costKnown')::boolean,true) else true end,'at',event_at,'acquisitionOrder',e->'acquisitionOrder','origin',e->>'id'));
  else
   if kind='transfer' and (coalesce(e->>'toWallet','')!~'^0x[0-9a-f]{40}$' or e->>'toWallet'=e->>'wallet') then raise exception 'ACCOUNTING_TRANSFER_INVALID';end if;
   need:=qty;consumed:=0;
   while need>0 loop
    select value,(ordinality-1)::int into l,at_index from jsonb_array_elements(lots) with ordinality
     where value->>'wallet'=e->>'wallet' and value->>'token'=e->>'token' and (value->>'units')::numeric>0
     order by (value->>'at')::timestamptz,(value->>'acquisitionOrder')::bigint nulls last,case when value->>'acquisitionOrder' is null then value->>'origin' end,ordinality limit 1;
    if not found then raise exception 'ACCOUNTING_MISSING_BASIS';end if;
    if l->'costKnown'='false'::jsonb or l->'cost'='null'::jsonb then raise exception 'ACCOUNTING_OPENING_BASIS_REQUIRED';end if;
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

-- Only the backend receives private IDs and unrounded financial scores.
-- Each row is recalculated against current eligible fills, ownership and cutoff.
create or replace function public.mkz_verified_financials() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare c mkz_campaigns; e mkz_entries; s mkz_accounting_snapshots; r jsonb; rows jsonb:='[]'; n int:=0; pending_count int:=0; later_count int:=0;
begin
 select * into c from mkz_campaigns where id='model-kombat-zones-1';
 if not found then return jsonb_build_object('schemaVersion',1,'available',false,'checked',0,'pending',0,'notStarted',0,'rows',rows);end if;
 for e in select * from mkz_entries where campaign_id=c.id order by participant loop
  if c.confirmed_through is not null and greatest(c.starts_at,e.entered_at)>c.confirmed_through then later_count:=later_count+1;continue;end if;
  if c.state='draft' or not c.complete or c.confirmed_through is null then pending_count:=pending_count+1;continue;end if;
  select * into s from mkz_accounting_snapshots where campaign_id=c.id and participant=e.participant;
  if not found then pending_count:=pending_count+1;continue;end if;
  begin
   if s.payload->>'participant' is distinct from e.participant or (s.payload->>'confirmedThrough')::timestamptz is distinct from c.confirmed_through then pending_count:=pending_count+1;continue;end if;
   r:=mkz_accounting_result(s.payload);
   rows:=rows||jsonb_build_array(jsonb_build_object('participant',e.participant,'roi',r->>'roi','profit',r->>'profit','confirmedThrough',s.payload->>'confirmedThrough'));
   n:=n+1;
  exception when others then pending_count:=pending_count+1;
  end;
 end loop;
 return jsonb_build_object('schemaVersion',1,'methodology',c.financial_method,'available',c.state<>'draft' and c.complete and c.confirmed_through is not null,'confirmedThrough',c.confirmed_through,'checked',n,'pending',pending_count,'notStarted',later_count,'rows',rows);
end $$;
create or replace function public.mkz_accounting_capabilities() returns jsonb
language sql immutable security definer set search_path=pg_catalog,public,pg_temp as $$
 select jsonb_build_object('schemaVersion',1,'methodology','mk-fifo-realized-capital-1','openingBasis','deferred-untouched-2','incomingBasis','deferred-direct-transfer-1','verifiedFinancials','per-account-current-cutoff-1');
$$;
revoke all on function public.mkz_fifo_calculate(jsonb,jsonb),public.mkz_verified_financials(),public.mkz_accounting_capabilities() from public,anon,authenticated;
grant execute on function public.mkz_verified_financials(),public.mkz_accounting_capabilities() to service_role;
commit;
