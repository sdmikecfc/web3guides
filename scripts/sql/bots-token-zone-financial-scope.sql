-- Model Kombat: no ROI/profit calculation or rank for a confirmed non-trader.
-- Additive only. Requires the opening-basis migration; no opening or score writes.
begin;
do $$declare capabilities jsonb;begin
 if to_regprocedure('public.mkz_accounting_capabilities()') is null then raise exception 'FINANCIAL_SCOPE_PREREQUISITE_REQUIRED';end if;
 capabilities:=public.mkz_accounting_capabilities();
 if capabilities->>'methodology' is distinct from 'mk-fifo-realized-capital-1'
 or capabilities->>'openingBasis' is distinct from 'deferred-untouched-2'
 or capabilities->>'incomingBasis' is distinct from 'deferred-direct-transfer-1'
 or capabilities->>'verifiedFinancials' is distinct from 'per-account-current-cutoff-1'
 then raise exception 'FINANCIAL_SCOPE_PREREQUISITE_REQUIRED';end if;
end $$;

-- Coverage, enrollment and current ownership are checked before an empty fill
-- set can mean no trades. The caller never supplies its own exemption list.
create or replace function public.mkz_financial_scope(p_campaign text,p_participant text,p_through timestamptz) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare c mkz_campaigns; e mkz_entries; n bigint;
begin
 select * into c from mkz_campaigns where id=p_campaign;
 if not found or c.state='draft' or not c.complete or c.confirmed_through is null or p_through is null
 or p_through is distinct from c.confirmed_through then return jsonb_build_object('status','pending','eligibleFills',null);end if;
 select * into e from mkz_entries where campaign_id=c.id and participant=p_participant;
 if not found then return jsonb_build_object('status','pending','eligibleFills',null);end if;
 if greatest(c.starts_at,e.entered_at)>p_through then return jsonb_build_object('status','not_started','eligibleFills',null);end if;
 if not exists(select 1 from mkz_wallets where participant=e.participant) then return jsonb_build_object('status','pending','eligibleFills',null);end if;
 select count(*) into n from mkz_fills f
 join mkz_wallets w on w.trade_wallet=f.wallet and w.participant=e.participant
 join mkz_markets m on m.chain_id=f.chain_id and m.domain_token=f.domain_token and m.quote_token=f.quote_token
 where f.campaign_id=c.id and f.status='verified'
 and f.executed_at>=greatest(c.starts_at,e.entered_at) and f.executed_at<=p_through and f.executed_at<c.ends_at;
 return jsonb_build_object('status',case when n=0 then 'no_trades' else 'trader' end,'eligibleFills',n);
end $$;

create or replace function public.mkz_collector_ingest(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare next_payload jsonb:=p_payload; finances jsonb:='[]'; e mkz_entries; s mkz_accounting_snapshots; r jsonb; receipt jsonb; prior jsonb; scope jsonb;
begin
 perform mkz_validate_collector_batch(p_payload);perform pg_advisory_xact_lock(1734590,0);
 select payload into prior from mkz_accounting_receipts where request_id=(p_payload->>'requestId')::uuid;
 if found then if prior<>p_payload then raise exception 'BATCH_CONFLICT';end if;return jsonb_build_object('ok',true,'replayed',true);end if;
 if (p_payload->>'financialComplete')::boolean then
  if p_payload->'complete' is distinct from 'true'::jsonb then raise exception 'FINANCIAL_TRADE_COVERAGE_REQUIRED';end if;
  if jsonb_array_length(p_payload->'financials')<>0 or jsonb_array_length(p_payload->'fills')<>0 then raise exception 'ACCOUNTING_FINAL_BATCH_MUST_BE_EMPTY';end if;
  -- Worker chunks and this final packet run in one transaction. Publish the
  -- complete trade cutoff internally before querying scope; a missing trader
  -- ledger below rolls back this staging and all preceding corrected fills.
  perform mkz_ingest(p_payload||jsonb_build_object('requestId',gen_random_uuid(),'financialComplete',false,'financials','[]'::jsonb));
  for e in select * from mkz_entries where campaign_id=p_payload->>'campaignId' order by participant loop
   scope:=mkz_financial_scope(e.campaign_id,e.participant,(p_payload->>'confirmedThrough')::timestamptz);
   if scope->>'status'='no_trades' then
    finances:=finances||jsonb_build_array(jsonb_build_object('participant',e.participant,'roi',null,'profit',null,'evidence','No eligible verified trades in complete current coverage; no financial rank.'));
   elsif scope->>'status'='trader' then
    select * into s from mkz_accounting_snapshots where campaign_id=e.campaign_id and participant=e.participant;
    if not found or s.payload->>'participant' is distinct from e.participant or (s.payload->>'confirmedThrough')::timestamptz is distinct from (p_payload->>'confirmedThrough')::timestamptz then raise exception 'FINANCIAL_COVERAGE_INCOMPLETE';end if;
    r:=mkz_accounting_result(s.payload);
    finances:=finances||jsonb_build_array(jsonb_build_object('participant',e.participant,'roi',r->'roi','profit',r->'profit','evidence','Server FIFO from accounting receipt '||s.request_id::text));
   else raise exception 'FINANCIAL_COVERAGE_INCOMPLETE';end if;
  end loop;
  next_payload:=p_payload||jsonb_build_object('financials',finances);
 end if;
 receipt:=mkz_ingest(next_payload);
 if (p_payload->>'financialComplete')::boolean then insert into mkz_accounting_receipts(request_id,payload) values((p_payload->>'requestId')::uuid,p_payload);end if;
 return receipt;
end $$;

-- Service-only, current-cutoff recomputation. noTrades are neither checked
-- financial accounts nor pending failures; no row exposes a made-up zero score.
create or replace function public.mkz_verified_financials() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare c mkz_campaigns; e mkz_entries; s mkz_accounting_snapshots; r jsonb; scope jsonb; rows jsonb:='[]'; n int:=0; pending_count int:=0; later_count int:=0; no_trade_count int:=0; trader_count int:=0; scope_pending_count int:=0;
begin
 select * into c from mkz_campaigns where id='model-kombat-zones-1';
 if not found then return jsonb_build_object('schemaVersion',1,'financialScope','eligible-traders-1','available',false,'checked',0,'pending',0,'notStarted',0,'noTrades',0,'tradingAccounts',0,'scopePending',0,'rows',rows);end if;
 for e in select * from mkz_entries where campaign_id=c.id order by participant loop
  scope:=mkz_financial_scope(c.id,e.participant,c.confirmed_through);
  if scope->>'status'='not_started' then later_count:=later_count+1;continue;end if;
  if scope->>'status'='no_trades' then no_trade_count:=no_trade_count+1;continue;end if;
  if scope->>'status'<>'trader' then pending_count:=pending_count+1;scope_pending_count:=scope_pending_count+1;continue;end if;
  trader_count:=trader_count+1;
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
 return jsonb_build_object('schemaVersion',1,'financialScope','eligible-traders-1','methodology',c.financial_method,'available',c.state<>'draft' and c.complete and c.confirmed_through is not null,'confirmedThrough',c.confirmed_through,'checked',n,'pending',pending_count,'notStarted',later_count,'noTrades',no_trade_count,'tradingAccounts',trader_count,'scopePending',scope_pending_count,'rows',rows);
end $$;

create or replace function public.mkz_accounting_capabilities() returns jsonb
language sql immutable security definer set search_path=pg_catalog,public,pg_temp as $$
 select jsonb_build_object('schemaVersion',1,'methodology','mk-fifo-realized-capital-1','openingBasis','deferred-untouched-2','incomingBasis','deferred-direct-transfer-1','verifiedFinancials','per-account-current-cutoff-1','financialScope','eligible-traders-1');
$$;
revoke all on function public.mkz_financial_scope(text,text,timestamptz),public.mkz_verified_financials(),public.mkz_accounting_capabilities(),public.mkz_collector_ingest(jsonb) from public,anon,authenticated;
grant execute on function public.mkz_financial_scope(text,text,timestamptz),public.mkz_verified_financials(),public.mkz_accounting_capabilities(),public.mkz_collector_ingest(jsonb) to service_role;
commit;
