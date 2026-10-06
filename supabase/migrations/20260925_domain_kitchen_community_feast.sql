-- Separate from beta restaurants and ranked rallies. Only server replay writes.
create table if not exists public.diner_community_events(id text primary key, meals bigint not null default 0 check(meals>=0));
insert into public.diner_community_events(id) values('neighbourhood-picnic-v1') on conflict do nothing;
create table if not exists public.diner_community_attempts(
 id uuid primary key,player_id uuid not null references auth.users(id),wallet text not null,event_id text not null references public.diner_community_events(id),
 status text not null check(status in('active','complete','abandoned')),revision bigint not null default 0,record jsonb not null,created_at timestamptz not null default now()
);
create unique index if not exists diner_community_one_active on public.diner_community_attempts(wallet) where status='active';
create table if not exists public.diner_community_commands(player_id uuid not null references auth.users(id),command_id uuid not null,attempt_id uuid not null references public.diner_community_attempts(id),fingerprint text not null,commands jsonb not null,primary key(player_id,command_id));
create table if not exists public.diner_community_meals(id text primary key,attempt_id uuid not null references public.diner_community_attempts(id),event_id text not null references public.diner_community_events(id),player_id uuid not null references auth.users(id),wallet text not null);
create index if not exists diner_community_contributions on public.diner_community_meals(event_id,wallet);
create table if not exists public.diner_community_entitlements(event_id text not null references public.diner_community_events(id),wallet text not null,player_id uuid not null references auth.users(id),claimed_at timestamptz not null default now(),primary key(event_id,wallet));
alter table public.diner_community_events enable row level security;
alter table public.diner_community_attempts enable row level security;
alter table public.diner_community_commands enable row level security;
alter table public.diner_community_meals enable row level security;
alter table public.diner_community_entitlements enable row level security;
revoke all on public.diner_community_events,public.diner_community_attempts,public.diner_community_commands,public.diner_community_meals,public.diner_community_entitlements from public,anon,authenticated;
grant all on public.diner_community_events,public.diner_community_attempts,public.diner_community_commands,public.diner_community_meals,public.diner_community_entitlements to service_role;

create or replace function public.diner_community_start(p_player uuid,p_wallet text,p_record jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare saved jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('dk-community:'||p_wallet,0));
 select record into saved from diner_community_attempts where id=(p_record->>'id')::uuid and player_id=p_player;
 if saved is not null then return saved; end if;
 select record into saved from diner_community_attempts where wallet=p_wallet and status='active';
 if saved is not null then return saved; end if;
 if p_record->>'wallet'<>p_wallet or p_record->>'eventId'<>'neighbourhood-picnic-v1' or p_record->>'status'<>'active' then raise exception 'invalid picnic attempt'; end if;
 insert into diner_community_attempts(id,player_id,wallet,event_id,status,record) values((p_record->>'id')::uuid,p_player,p_wallet,p_record->>'eventId','active',p_record);
 return p_record;
end $$;
create or replace function public.diner_community_commit(p_player uuid,p_command uuid,p_fingerprint text,p_expected_revision bigint,p_record jsonb,p_commands jsonb,p_meals jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare row_record diner_community_attempts%rowtype; previous diner_community_commands%rowtype; added integer;
begin
 select * into row_record from diner_community_attempts where id=(p_record->>'id')::uuid and player_id=p_player for update;
 if not found then return jsonb_build_object('ok',false); end if;
 select * into previous from diner_community_commands where player_id=p_player and command_id=p_command;
 if found then return jsonb_build_object('ok',previous.fingerprint=p_fingerprint and previous.attempt_id=row_record.id,'duplicate',true); end if;
 if row_record.revision<>p_expected_revision or row_record.status<>'active' then return jsonb_build_object('ok',false); end if;
 if (p_record->>'revision')::bigint<>p_expected_revision+1 or p_record->>'wallet'<>row_record.wallet or p_record->>'eventId'<>row_record.event_id or jsonb_array_length(p_meals)>6 then raise exception 'invalid picnic transition'; end if;
 if exists(select 1 from jsonb_array_elements_text(p_meals) m where m not like row_record.id::text||':%') then raise exception 'invalid meal receipt'; end if;
 update diner_community_attempts set record=p_record,status=p_record->>'status',revision=(p_record->>'revision')::bigint where id=row_record.id;
 insert into diner_community_commands values(p_player,p_command,row_record.id,p_fingerprint,p_commands);
 insert into diner_community_meals(id,attempt_id,event_id,player_id,wallet) select m,row_record.id,row_record.event_id,p_player,row_record.wallet from jsonb_array_elements_text(p_meals) m on conflict do nothing;
 get diagnostics added=row_count;
 update diner_community_events set meals=meals+added where id=row_record.event_id;
 return jsonb_build_object('ok',true,'added',added);
end $$;
create or replace function public.diner_community_claim(p_player uuid,p_wallet text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from diner_community_events where id='neighbourhood-picnic-v1' and meals>=300) or (select count(*) from diner_community_meals where event_id='neighbourhood-picnic-v1' and wallet=p_wallet)<3 then return false; end if;
 insert into diner_community_entitlements(event_id,wallet,player_id) values('neighbourhood-picnic-v1',p_wallet,p_player) on conflict do nothing;
 return true;
end $$;
revoke all on function public.diner_community_start(uuid,text,jsonb),public.diner_community_commit(uuid,uuid,text,bigint,jsonb,jsonb,jsonb),public.diner_community_claim(uuid,text) from public,anon,authenticated;
grant execute on function public.diner_community_start(uuid,text,jsonb),public.diner_community_commit(uuid,uuid,text,bigint,jsonb,jsonb,jsonb),public.diner_community_claim(uuid,text) to service_role;
