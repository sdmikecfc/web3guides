-- Isolated, server-replayed domain journeys. Does not enable public entry.
create table if not exists public.diner_domain_journey_attempts(
 id uuid primary key, player_id uuid not null references auth.users(id), wallet text not null,
 domain text not null check(domain in ('gochujang','smoothie','wines')), season_id text not null,
 status text not null check(status in ('active','complete','abandoned')), revision bigint not null default 0,
 record jsonb not null, created_at timestamptz not null default now()
);
create unique index if not exists diner_domain_journey_one_active on public.diner_domain_journey_attempts(wallet) where status='active';
create table if not exists public.diner_domain_journey_commands(
 player_id uuid not null references auth.users(id),command_id uuid not null,
 attempt_id uuid not null references public.diner_domain_journey_attempts(id),fingerprint text not null,
 commands jsonb not null,primary key(player_id,command_id)
);
create table if not exists public.diner_domain_journey_rewards(
 wallet text not null,domain text not null check(domain in ('gochujang','smoothie','wines')),
 milestone integer not null check(milestone in(2,4,6,8)),receipt_key text not null,
 attempt_id uuid not null references public.diner_domain_journey_attempts(id),earned_at bigint not null,
 primary key(wallet,domain,milestone),unique(wallet,receipt_key)
);
alter table public.diner_domain_journey_attempts enable row level security;
alter table public.diner_domain_journey_commands enable row level security;
alter table public.diner_domain_journey_rewards enable row level security;
revoke all on public.diner_domain_journey_attempts,public.diner_domain_journey_commands,public.diner_domain_journey_rewards from public,anon,authenticated;
grant all on public.diner_domain_journey_attempts,public.diner_domain_journey_commands,public.diner_domain_journey_rewards to service_role;
create or replace function public.diner_domain_journey_start(p_player uuid,p_wallet text,p_record jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare saved diner_domain_journey_attempts%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('dk-domain-journey:'||p_wallet,0));
 select * into saved from diner_domain_journey_attempts where id=(p_record->>'id')::uuid;
 if found then
  if saved.player_id<>p_player or saved.wallet<>p_wallet or saved.domain<>p_record->>'domain' or (saved.record->>'practice') is distinct from (p_record->>'practice') then raise exception 'request identity mismatch'; end if;
  return saved.record;
 end if;
 select * into saved from diner_domain_journey_attempts where wallet=p_wallet and status='active';
 if found then
  if saved.player_id<>p_player then raise exception 'journey session mismatch'; end if;
  return saved.record;
 end if;
 if p_record->>'wallet'<>p_wallet or p_record->>'status'<>'active' or (p_record->>'revision')::bigint<>0 or jsonb_array_length(p_record->'rewards')<>0 then raise exception 'invalid journey'; end if;
 insert into diner_domain_journey_attempts(id,player_id,wallet,domain,season_id,status,record)
 values((p_record->>'id')::uuid,p_player,p_wallet,p_record->>'domain',p_record->>'seasonId','active',p_record);
 return p_record;
end $$;
create or replace function public.diner_domain_journey_commit(p_player uuid,p_command uuid,p_fingerprint text,p_expected_revision bigint,p_record jsonb,p_commands jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare saved diner_domain_journey_attempts%rowtype; prior diner_domain_journey_commands%rowtype; reward jsonb;
begin
 select * into saved from diner_domain_journey_attempts where id=(p_record->>'id')::uuid and player_id=p_player for update;
 if not found then return jsonb_build_object('ok',false); end if;
 select * into prior from diner_domain_journey_commands where player_id=p_player and command_id=p_command;
 if found then return jsonb_build_object('ok',prior.fingerprint=p_fingerprint and prior.attempt_id=saved.id,'duplicate',true,'record',saved.record); end if;
 if saved.revision<>p_expected_revision or saved.status<>'active' then return jsonb_build_object('ok',false); end if;
 if (p_record->>'revision')::bigint<>p_expected_revision+1 or p_record->>'wallet'<>saved.wallet or p_record->>'domain'<>saved.domain or p_record->>'seasonId'<>saved.season_id or p_record->'startedAt'<>saved.record->'startedAt' or p_record->'endsAt'<>saved.record->'endsAt' or p_record->'practice'<>saved.record->'practice' or jsonb_array_length(p_record->'rewards')>4 then raise exception 'invalid journey transition'; end if;
 update diner_domain_journey_attempts set record=p_record,status=p_record->>'status',revision=(p_record->>'revision')::bigint where id=saved.id;
 insert into diner_domain_journey_commands values(p_player,p_command,saved.id,p_fingerprint,p_commands);
 if coalesce((p_record->>'practice')::boolean,false)=false then
  for reward in select value from jsonb_array_elements(p_record->'rewards') loop
   if reward->>'domain'<>saved.domain or reward->>'key'<>'journey:'||saved.domain||':'||(reward->>'milestone') or (reward->>'milestone')::integer>jsonb_array_length(p_record->'completed') then raise exception 'invalid milestone'; end if;
   insert into diner_domain_journey_rewards(wallet,domain,milestone,receipt_key,attempt_id,earned_at)
   values(saved.wallet,saved.domain,(reward->>'milestone')::integer,reward->>'key',saved.id,(reward->>'earnedAt')::bigint) on conflict do nothing;
  end loop;
 end if;
 return jsonb_build_object('ok',true,'record',p_record);
end $$;
revoke all on function public.diner_domain_journey_start(uuid,text,jsonb),public.diner_domain_journey_commit(uuid,uuid,text,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.diner_domain_journey_start(uuid,text,jsonb),public.diner_domain_journey_commit(uuid,uuid,text,bigint,jsonb,jsonb) to service_role;
