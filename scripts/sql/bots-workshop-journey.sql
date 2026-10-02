-- Game-only, additive. Apply bots-workshop-v8.sql first. Enable BOTS_WORKSHOP_JOURNEY
-- only after this migration and its acceptance checks. Existing rows are copied lazily
-- under lock at first sign-in, so an earlier migration cannot freeze stale inventories.
begin;
create table if not exists public.mk8_players (
 id uuid primary key default gen_random_uuid(), wallet text unique check(wallet ~ '^0x[0-9a-f]{40}$'), created_at timestamptz not null default now()
);
create table if not exists public.mk8_garages (
 id uuid primary key default gen_random_uuid(), player_id uuid not null references public.mk8_players(id),
 legacy_wallet text unique, name text not null default 'My garage', state jsonb not null,
 revision bigint not null default 0, updated_at timestamptz not null default now()
);
create index if not exists mk8_garage_owner on public.mk8_garages(player_id);
alter table public.mk8_players add column if not exists active_garage uuid references public.mk8_garages(id);
create table if not exists public.mk8_guest_sessions (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'), player_id uuid not null references public.mk8_players(id),
 expires_at timestamptz not null, revoked boolean not null default false
);
create table if not exists public.mk8_journey_requests (
 garage_id uuid not null references public.mk8_garages(id), request_id text not null, created_at timestamptz not null default now(), primary key(garage_id,request_id)
);
create table if not exists public.mk8_player_days (
 player_id uuid not null references public.mk8_players(id), day date not null, completed integer not null default 0 check(completed>=0),
 bonus_paid boolean not null default false, primary key(player_id,day)
);
create table if not exists public.mk8_guest_limits (
 bucket text primary key, count integer not null default 0, expires_at timestamptz not null
);
alter table public.mk8_players enable row level security;
alter table public.mk8_garages enable row level security;
alter table public.mk8_guest_sessions enable row level security;
alter table public.mk8_journey_requests enable row level security;
alter table public.mk8_player_days enable row level security;
alter table public.mk8_guest_limits enable row level security;
revoke all on public.mk8_players,public.mk8_garages,public.mk8_guest_sessions,public.mk8_journey_requests,public.mk8_player_days,public.mk8_guest_limits from public,anon,authenticated;
grant select,insert,update,delete on public.mk8_players,public.mk8_garages,public.mk8_guest_sessions,public.mk8_journey_requests,public.mk8_player_days,public.mk8_guest_limits to service_role;

create or replace function public.mk8_guest_enroll(p_hash text,p_bucket text,p_state jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare owner uuid; n integer;
begin
 if p_hash !~ '^[0-9a-f]{64}$' or length(p_bucket)>120 then raise exception 'INVALID_SESSION'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_hash,0));
 select player_id into owner from mk8_guest_sessions where token_hash=p_hash and not revoked and expires_at>now();
 if owner is not null then return owner; end if;
 if exists(select 1 from mk8_guest_sessions where token_hash=p_hash) then raise exception 'SESSION_EXPIRED'; end if;
 if (p_state->>'coins')::bigint<>250 or (p_state->>'revision')::bigint<>0 or jsonb_array_length(p_state->'robots')<>0
   or jsonb_array_length(p_state->'history')<>0 or jsonb_array_length(p_state->'spares')<>0 then raise exception 'INVALID_ENROLLMENT'; end if;
 insert into mk8_guest_limits(bucket,count,expires_at) values(p_bucket,1,now()+interval '2 hours')
 on conflict(bucket) do update set count=mk8_guest_limits.count+1 returning count into n;
 if n>10 then raise exception 'ENROLLMENT_LIMIT'; end if;
 insert into mk8_players default values returning id into owner;
 insert into mk8_garages(player_id,state) values(owner,p_state);
 insert into mk8_guest_sessions(token_hash,player_id,expires_at) values(p_hash,owner,now()+interval '60 days');
 delete from mk8_guest_limits where expires_at<now();
 return owner;
end $$;

create or replace function public.mk8_wallet_player(p_wallet text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare owner uuid; old public.mk8_workshops; d record;
begin
 if p_wallet !~ '^0x[0-9a-f]{40}$' then raise exception 'INVALID_WALLET'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_wallet,1));
 insert into mk8_players(wallet) values(p_wallet) on conflict(wallet) do nothing;
 select id into owner from mk8_players where wallet=p_wallet for update;
 select * into old from mk8_workshops where wallet=p_wallet for update;
 if found and not exists(select 1 from mk8_garages where legacy_wallet=p_wallet) then
   insert into mk8_garages(player_id,legacy_wallet,name,state,revision) values(owner,p_wallet,'Wallet garage',old.state,old.revision);
   for d in select key,value from jsonb_each_text(old.state->'days') loop
     insert into mk8_player_days(player_id,day,completed,bonus_paid) values(owner,d.key::date,d.value::integer,d.value::integer>=6)
     on conflict(player_id,day) do update set completed=mk8_player_days.completed+excluded.completed,bonus_paid=mk8_player_days.bonus_paid or excluded.bonus_paid;
   end loop;
 end if;
 return owner;
end $$;

create or replace function public.mk8_claim_guest(p_wallet text,p_hash text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid; source uuid; d record; session public.mk8_guest_sessions;
begin
 target:=mk8_wallet_player(p_wallet);
 select * into session from mk8_guest_sessions where token_hash=p_hash for update;
 if not found or session.expires_at<=now() then raise exception 'SESSION_EXPIRED'; end if;
 source:=session.player_id;
 if source=target then return target; end if;
 if session.revoked then raise exception 'SESSION_EXPIRED'; end if;
 -- Commit always locks the player before a garage; claiming uses that same order.
 perform id from mk8_players where id=source for update;
 if exists(select 1 from mk8_players where id=source and wallet is not null) then raise exception 'ALREADY_CLAIMED'; end if;
 for d in select * from mk8_player_days where player_id=source loop
   insert into mk8_player_days(player_id,day,completed,bonus_paid) values(target,d.day,d.completed,d.bonus_paid)
   on conflict(player_id,day) do update set completed=mk8_player_days.completed+excluded.completed,bonus_paid=mk8_player_days.bonus_paid or excluded.bonus_paid;
 end loop;
 delete from mk8_player_days where player_id=source;
 update mk8_garages set player_id=target where player_id=source;
 update mk8_guest_sessions set player_id=target,revoked=true where player_id=source;
 return target;
end $$;

-- Selection is a preference, never a transfer or a reward operation. Repeating it
-- is harmless; ownership is checked under the same lock as garage settlement.
create or replace function public.mk8_select_garage(p_player uuid,p_garage uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform id from mk8_players where id=p_player for update;
 if not exists(select 1 from mk8_garages where id=p_garage and player_id=p_player) then raise exception 'GARAGE_NOT_FOUND'; end if;
 update mk8_players set active_garage=p_garage where id=p_player;
 return p_garage;
end $$;
revoke all on function public.mk8_select_garage(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mk8_select_garage(uuid,uuid) to service_role;

create or replace function public.mk8_journey_commit(p_player uuid,p_garage uuid,p_revision bigint,p_request text,p_state jsonb,p_day date default null,p_public jsonb default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.mk8_garages; d public.mk8_player_days; award integer:=0; eligible boolean; training boolean; fight jsonb; next_state jsonb;
begin
 if p_request !~ '^[A-Za-z0-9_.:-]{8,120}$' then raise exception 'INVALID_REQUEST'; end if;
 perform id from mk8_players where id=p_player for update;
 select * into g from mk8_garages where id=p_garage and player_id=p_player for update;
 if not found then raise exception 'GARAGE_NOT_FOUND'; end if;
 if exists(select 1 from mk8_journey_requests where garage_id=p_garage and request_id=p_request) then return g.state; end if;
 if g.revision<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if (p_state->>'revision')::bigint<>p_revision+1 or (p_state->>'coins')::bigint<0 or jsonb_array_length(p_state->'robots')>5 then raise exception 'INVALID_STATE'; end if;
 if p_state->'active'<>'null'::jsonb and g.state->'active'='null'::jsonb and exists(select 1 from mk8_garages where player_id=p_player and id<>p_garage and state->'active'<>'null'::jsonb) then raise exception 'OTHER_FIGHT_ACTIVE'; end if;
 next_state:=p_state;
 if p_day is not null then
   fight:=p_state->'history'->0;
   if g.state->'active'='null'::jsonb or fight->>'id'<>g.state->'active'->>'id' or p_request<>'settle:'||(fight->>'id') then raise exception 'INVALID_SETTLEMENT'; end if;
   training:=coalesce(fight->>'mode','house')='training';
   eligible:=not training or not coalesce((g.state->'journey'->>'trainingCompleted')::boolean,false);
   insert into mk8_player_days(player_id,day) values(p_player,p_day) on conflict do nothing;
   select * into d from mk8_player_days where player_id=p_player and day=p_day for update;
   if eligible then
     if d.completed<12 then award:=75; end if;
     if d.completed>=5 and d.completed<12 and not d.bonus_paid then award:=award+100; end if;
     update mk8_player_days set completed=completed+1,bonus_paid=bonus_paid or (completed>=5 and completed<12) where player_id=p_player and day=p_day;
   end if;
   next_state:=jsonb_set(next_state,'{coins}',to_jsonb((g.state->>'coins')::bigint+award));
   next_state:=jsonb_set(next_state,'{history,0,coins}',to_jsonb(award));
   if next_state->'journey'->'retained' ? (fight->>'id') then
     next_state:=jsonb_set(next_state,array['journey','retained',fight->>'id','coins'],to_jsonb(award));
   end if;
 end if;
 update mk8_garages set state=next_state,revision=p_revision+1,updated_at=now() where id=p_garage;
 insert into mk8_journey_requests(garage_id,request_id) values(p_garage,p_request);
 if p_public is not null then
   if p_day is not null then p_public:=jsonb_set(p_public,'{coins}',to_jsonb(award)); end if;
   insert into mk8_public_fights(id,completed_at,replay) values((p_public->>'id')::uuid,to_timestamp((p_public->>'completedAt')::numeric/1000),p_public) on conflict(id) do nothing;
 end if;
 return next_state;
end $$;
revoke all on function public.mk8_guest_enroll(text,text,jsonb), public.mk8_wallet_player(text),public.mk8_claim_guest(text,text),public.mk8_journey_commit(uuid,uuid,bigint,text,jsonb,date,jsonb) from public,anon,authenticated;
grant execute on function public.mk8_guest_enroll(text,text,jsonb), public.mk8_wallet_player(text),public.mk8_claim_guest(text,text),public.mk8_journey_commit(uuid,uuid,bigint,text,jsonb,date,jsonb) to service_role;
commit;
