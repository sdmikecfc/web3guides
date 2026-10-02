-- Apply after bots-workshop-journey.sql. Game-only; no shared campaign changes.
-- This creates a DRAFT with NULL dates. Opening requires a separately reviewed
-- campaign mapping, verified Strategy evidence and explicit owner authorization.
begin;
create table if not exists public.mk8_competitions (
 id text primary key, campaign_id text unique, rules text not null check(rules='workshop-house-1'),
 state text not null check(state in ('draft','active','closed','frozen')),
 starts_at timestamptz, ends_at timestamptz, pool_cents integer not null check(pool_cents=200000),
 check((state='draft' and starts_at is null and ends_at is null) or
 (state<>'draft' and campaign_id is not null and starts_at is not null and ends_at=starts_at+interval '14 days'))
);
insert into mk8_competitions(id,rules,state,pool_cents) values('workshop-competition-1','workshop-house-1','draft',200000) on conflict(id) do nothing;
create table if not exists public.mk8_competition_entries (
 competition_id text not null references mk8_competitions(id), wallet text not null check(wallet ~ '^0x[0-9a-f]{40}$'),
 entered_at timestamptz not null default clock_timestamp(), primary key(competition_id,wallet)
);
create table if not exists public.mk8_competition_attempts (
 fight_id uuid primary key, competition_id text not null references mk8_competitions(id),
 wallet text not null, garage_id uuid not null references mk8_garages(id), rules text not null,
 started_at timestamptz not null, start_day date not null, ordinal integer not null check(ordinal between 1 and 12),
 completed_at timestamptz, period text check(period in ('week1','week2')), winner integer check(winner in (-1,0,1)),
 points integer check(points in (0,1)), unique(competition_id,wallet,start_day,ordinal),
 foreign key(competition_id,wallet) references mk8_competition_entries(competition_id,wallet)
);
alter table mk8_competitions enable row level security;
alter table mk8_competition_entries enable row level security;
alter table mk8_competition_attempts enable row level security;
revoke all on mk8_competitions,mk8_competition_entries,mk8_competition_attempts from public,anon,authenticated;
grant select,insert,update on mk8_competitions,mk8_competition_entries,mk8_competition_attempts to service_role;

-- Called only after the existing wallet enrollment service confirms the same
-- mapped campaign. Repeated requests retain the original entry timestamp.
create or replace function public.mk8_competition_enter(p_id text,p_wallet text,p_campaign text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c mk8_competitions;
begin
 select * into c from mk8_competitions where id=p_id for share;
 if not found or c.state<>'active' or c.campaign_id is distinct from p_campaign or clock_timestamp()<c.starts_at or clock_timestamp()>=c.ends_at then raise exception 'COMPETITION_NOT_OPEN'; end if;
 insert into mk8_competition_entries(competition_id,wallet) values(c.id,p_wallet) on conflict do nothing;
end $$;

-- Wrapper runs reservation/result and the existing coin/replay transaction
-- atomically. Authenticated wallet is supplied by the server, never the client.
create or replace function public.mk8_competition_commit(p_player uuid,p_garage uuid,p_revision bigint,p_request text,p_state jsonb,p_day date default null,p_public jsonb default null,p_wallet text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare g mk8_garages; c mk8_competitions; a mk8_competition_attempts; s jsonb:=p_state; f jsonb; info jsonb;
 n integer; started timestamptz; finished timestamptz; reason text; award integer; owner_wallet text;
begin
 select wallet into owner_wallet from mk8_players where id=p_player for update;
 select * into g from mk8_garages where id=p_garage and player_id=p_player for update;
 if not found then raise exception 'GARAGE_NOT_FOUND'; end if;
 if exists(select 1 from mk8_journey_requests where garage_id=p_garage and request_id=p_request) then return g.state; end if;
 if g.revision<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 -- Only the authoritative waiting -> ready transition reserves a slot.
 if coalesce((g.state->'active'->>'waiting')::boolean,false) and s->'active'->>'waiting'='false' then
  f:=s->'active';
  if f->>'id' is distinct from g.state->'active'->>'id' then raise exception 'INVALID_FIGHT'; end if;
  started:=clock_timestamp()+interval '1 second';
  s:=jsonb_set(s,'{active,startedAt}',to_jsonb(floor(extract(epoch from started)*1000)::bigint));
  select * into c from mk8_competitions where id='workshop-competition-1' for share;
  reason:='Competition has not started.';
  if not found then raise exception 'COMPETITION_SETUP_MISSING';
  elsif c.state<>'draft' and (c.state<>'active' or started>=c.ends_at) then reason:='Competition is closed.';
  elsif c.state='active' and started>=c.starts_at and started<c.ends_at then
   if coalesce(f->>'mode','house')<>'house' then reason:='Training does not earn competition points.';
   elsif f->>'robotId' is null then reason:='Loaner fights do not earn competition points.';
   elsif p_wallet is null or p_wallet is distinct from owner_wallet then reason:='Sign in to your wallet before starting a scored fight.';
   elsif not exists(select 1 from mk8_competition_entries where competition_id=c.id and wallet=p_wallet and entered_at<=started) then reason:='Enter the competition before starting a scored fight.';
   else
    perform pg_advisory_xact_lock(hashtextextended(c.id||p_wallet,8));
    select count(*) into n from mk8_competition_attempts where competition_id=c.id and wallet=p_wallet and start_day=(started at time zone 'UTC')::date;
    if n>=12 then reason:='All 12 scored fights have been started today.';
    else
     insert into mk8_competition_attempts(fight_id,competition_id,wallet,garage_id,rules,started_at,start_day,ordinal)
     values((f->>'id')::uuid,c.id,p_wallet,p_garage,c.rules,started,(started at time zone 'UTC')::date,n+1);
     reason:=null;
    end if;
   end if;
  end if;
  info:=jsonb_build_object('rules',c.rules,'status',case when reason is null then 'reserved' else 'not_scored' end,'reason',coalesce(reason,'Scored house fight reserved. A win earns 1 point.'),'points',case when reason is null then null else 0 end,'campaignId',c.id);
  s:=jsonb_set(s,'{active,competition}',info);
 end if;
 if p_day is not null then
  f:=s->'history'->0;
  select * into a from mk8_competition_attempts where fight_id=(f->>'id')::uuid and garage_id=p_garage for update;
  info:=g.state->'active'->'competition';
  if found then
   select * into c from mk8_competitions where id=a.competition_id for share;
   finished:=to_timestamp((f->>'completedAt')::numeric/1000);
   if finished<a.started_at or finished>clock_timestamp()+interval '2 seconds' then raise exception 'INVALID_COMPLETION'; end if;
   award:=case when (f->>'winner')::integer=0 and finished<c.ends_at and c.state<>'draft' then 1 else 0 end;
   if a.completed_at is not null then raise exception 'ALREADY_SETTLED'; end if;
   update mk8_competition_attempts set completed_at=finished,winner=(f->>'winner')::integer,points=award,
    period=case when finished<c.starts_at+interval '7 days' then 'week1' else 'week2' end where fight_id=a.fight_id;
   info:=jsonb_build_object('rules',a.rules,'status','settled','points',award,'campaignId',a.competition_id,
    'period',case when finished<c.starts_at+interval '7 days' then 'week1' else 'week2' end,
    'reason',case when finished>=c.ends_at then 'Finished after the competition closed.' when award=1 then 'Verified house win.' else 'Only a win earns a battle point.' end);
  end if;
  if info is null then info:=jsonb_build_object('rules','workshop-house-1','status','not_scored','points',0,'reason','This fight was not entered for competition scoring.'); end if;
  s:=jsonb_set(s,'{history,0,competition}',info);
  if s->'journey'->'retained' ? (f->>'id') then s:=jsonb_set(s,array['journey','retained',f->>'id','competition'],info); end if;
  if p_public is not null then p_public:=jsonb_set(p_public,'{competition}',info); end if;
 end if;
 return mk8_journey_commit(p_player,p_garage,p_revision,p_request,s,p_day,p_public);
end $$;
revoke all on function mk8_competition_enter(text,text,text),mk8_competition_commit(uuid,uuid,bigint,text,jsonb,date,jsonb,text) from public,anon,authenticated;
grant execute on function mk8_competition_enter(text,text,text),mk8_competition_commit(uuid,uuid,bigint,text,jsonb,date,jsonb,text) to service_role;
create or replace function public.mk8_competition_scores(p_id text,p_wallet text,p_period text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 with totals as (
  select wallet,sum(points)::integer score from mk8_competition_attempts
  where competition_id=p_id and completed_at is not null and (p_period='final' or period=p_period) group by wallet
 ), ranked as (select *,rank() over(order by score desc)::integer score_rank from totals)
 select jsonb_build_object('points',coalesce((select score from ranked where wallet=p_wallet),0),
  'rank',(select score_rank from ranked where wallet=p_wallet),
  'remaining',greatest(0,12-(select count(*) from mk8_competition_attempts where competition_id=p_id and wallet=p_wallet and start_day=(now() at time zone 'UTC')::date)),
  'standings',coalesce((select jsonb_agg(jsonb_build_object('name',coalesce((select left(p.replay->>'name',32) from mk8_competition_attempts a join mk8_public_fights p on p.id=a.fight_id where a.competition_id=p_id and a.wallet=s.wallet order by a.completed_at desc limit 1),'Fighter '||score_rank),'rank',score_rank,'score',score,'prizeCents',0,'status','checking','eligibility','pending')) from (select * from ranked order by score_rank,wallet limit 100) s),'[]'::jsonb))
 $$;
revoke all on function mk8_competition_scores(text,text,text) from public,anon,authenticated;
grant execute on function mk8_competition_scores(text,text,text) to service_role;
commit;
