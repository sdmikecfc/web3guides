-- Model Kombat: native ETH accounting asset support only.
-- Run once in Supabase SQL Editor. Safe to rerun. Existing records, function
-- permissions, campaign state/dates and the internal-AI role stay unchanged.
begin;
do $$begin
 if to_regprocedure('public.mkz_accounting_result(jsonb)') is null then
  raise exception 'Run the existing workshop setup before this patch';
 end if;
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
commit;
