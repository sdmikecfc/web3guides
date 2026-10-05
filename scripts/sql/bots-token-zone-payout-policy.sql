-- Model Kombat: rewards are funded at payout, not before opening.
-- Changes no balances, allocations, dates or campaign state. Safe to rerun.
begin;
create or replace function public.mkz_campaign_guard() returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp as $$
begin
 if old.state='frozen' and new is distinct from old then raise exception 'FINAL_RESULTS_FROZEN';end if;
 if new.state<>old.state and not ((old.state='draft' and new.state='active') or (old.state='active' and new.state='closed') or (old.state='closed' and new.state='frozen')) then raise exception 'INVALID_CAMPAIGN_TRANSITION';end if;
 if old.state<>'draft' and (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.rules<>old.rules or new.financial_method is distinct from old.financial_method) then raise exception 'FROZEN_RULES';end if;
 if old.state='draft' and new.state='active' then
  -- Funding is arranged at payout. Opening still requires exact token identities,
  -- representable quantities and eligible markets; no balance is inferred here.
  if (select count(*) from mkz_reward_assets)<>9 or exists(select 1 from mkz_reward_assets where trunc(required_quantity*power(10::numeric,decimals))<>required_quantity*power(10::numeric,decimals) or verified_at<now()-interval '1 day') or not exists(select 1 from mkz_markets)
  or exists(select 1 from (values ('USDC',1000::numeric,5000::numeric),('DEPIN.ai',3304.58,25000),('ALERT.ai',968.60,50000),('BRAG.com',3440.80,100000),('INVESTORS.xyz',13966.48,175000),('RIDES.com',3543.22,250000),('BONER.com',2261.22,400000),('GOCHUJANG.com',619.06,550000),('SOFTWARE.ai',2437.97,750000)) v(symbol,quantity,threshold) left join mkz_reward_assets a on a.symbol=v.symbol where a.symbol is null or a.required_quantity<>v.quantity or a.threshold<>v.threshold) then raise exception 'REWARDS_AND_MARKETS_UNVERIFIED';end if;
 end if;
 if new.state='frozen' and old.state<>'frozen' then
  if now()<new.ends_at+interval '48 hours' or not new.complete or not new.financial_complete or new.confirmed_through is null or new.confirmed_through<new.ends_at or new.disputes<>0 then raise exception 'RECONCILIATION_INCOMPLETE';end if;
  if not exists(select 1 from mkz_finalizations where campaign_id=new.id) then raise exception 'FINAL_AWARDS_REQUIRED';end if;
 end if;
 return new;
end $$;

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
 if exists(select 1 from mkz_awards w join mkz_reward_assets a on a.symbol=w.symbol where w.campaign_id=c.id group by a.symbol,a.threshold,a.required_quantity,a.decimals having a.threshold>(current_snapshot->>'volume')::numeric or sum(w.units)>a.required_quantity*power(10::numeric,a.decimals)) then raise exception 'AWARD_BUDGET_EXCEEDED';end if;
 insert into mkz_finalizations values(c.id,p_snapshot,p_awards,clock_timestamp());
 update mkz_campaigns set state='frozen' where id=c.id;
 return jsonb_build_object('ok',true,'replayed',false);
end $$;
commit;
