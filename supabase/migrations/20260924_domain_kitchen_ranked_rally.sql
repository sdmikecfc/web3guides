-- Ranked cooking is isolated from diner_preview_players and browser beta saves.
create table if not exists public.diner_ranked_attempts (
 id uuid primary key, player_id uuid not null references auth.users(id), wallet text not null,
 week_id text not null, status text not null check(status in ('active','complete','abandoned')),
 revision bigint not null default 0, record jsonb not null, created_at timestamptz not null default now()
);
create unique index if not exists diner_ranked_one_active on public.diner_ranked_attempts(player_id) where status='active';
create table if not exists public.diner_ranked_commands (
 player_id uuid not null references auth.users(id), command_id uuid not null, attempt_id uuid not null references public.diner_ranked_attempts(id),
 fingerprint text not null, commands jsonb not null, primary key(player_id,command_id)
);
create table if not exists public.diner_ranked_bests (
 week_id text not null, wallet text not null, player_id uuid not null references auth.users(id),
 score integer not null check(score>=0), attempt_id uuid not null references public.diner_ranked_attempts(id),
 served integer not null, coins integer not null, combo integer not null, strikes integer not null, completed boolean not null,
 primary key(week_id,wallet)
);
create table if not exists public.diner_ranked_entitlements (
 player_id uuid primary key references auth.users(id), first_completion uuid not null references public.diner_ranked_attempts(id)
);
alter table public.diner_ranked_attempts enable row level security;
alter table public.diner_ranked_commands enable row level security;
alter table public.diner_ranked_bests enable row level security;
alter table public.diner_ranked_entitlements enable row level security;
revoke all on public.diner_ranked_attempts,public.diner_ranked_commands,public.diner_ranked_bests,public.diner_ranked_entitlements from anon,authenticated;

create or replace function public.diner_ranked_start(p_player uuid,p_wallet text,p_record jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare found_record jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('dk-ranked:'||p_player::text,0));
 select record into found_record from diner_ranked_attempts where id=(p_record->>'id')::uuid and player_id=p_player;
 if found_record is not null then return found_record; end if;
 select record into found_record from diner_ranked_attempts where player_id=p_player and status='active';
 if found_record is not null then return found_record; end if;
 insert into diner_ranked_attempts(id,player_id,wallet,week_id,status,record) values((p_record->>'id')::uuid,p_player,p_wallet,p_record->>'weekId','active',p_record);
 return p_record;
end $$;

create or replace function public.diner_ranked_commit(p_player uuid,p_command uuid,p_fingerprint text,p_expected_revision bigint,p_record jsonb,p_commands jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare row_record diner_ranked_attempts%rowtype; previous diner_ranked_commands%rowtype; s jsonb;
begin
 select * into row_record from diner_ranked_attempts where id=(p_record->>'id')::uuid and player_id=p_player for update;
 if not found then return jsonb_build_object('ok',false,'code','not_found'); end if;
 select * into previous from diner_ranked_commands where player_id=p_player and command_id=p_command;
 if found then return jsonb_build_object('ok',previous.fingerprint=p_fingerprint and previous.attempt_id=row_record.id,'duplicate',true); end if;
 if row_record.revision<>p_expected_revision or row_record.status<>'active' then return jsonb_build_object('ok',false,'code','conflict'); end if;
 if (p_record->>'revision')::bigint<>p_expected_revision+1 or p_record->>'wallet'<>row_record.wallet or p_record->>'weekId'<>row_record.week_id then raise exception 'invalid ranked transition'; end if;
 update diner_ranked_attempts set record=p_record,status=p_record->>'status',revision=(p_record->>'revision')::bigint where id=row_record.id;
 insert into diner_ranked_commands values(p_player,p_command,row_record.id,p_fingerprint,p_commands);
 s=p_record->'service';
 if p_record->>'status'='complete' then
  if s->>'phase'='complete' then insert into diner_ranked_entitlements values(p_player,row_record.id) on conflict(player_id) do nothing; end if;
  if (p_record->>'eligible')::boolean then
   insert into diner_ranked_bests values(row_record.week_id,row_record.wallet,p_player,(p_record->>'score')::integer,row_record.id,(s->>'paid')::integer,(s->>'coins')::integer,(s->>'combo')::integer,(s->>'strikes')::integer,s->>'phase'='complete')
   on conflict(week_id,wallet) do update set score=excluded.score,attempt_id=excluded.attempt_id,served=excluded.served,coins=excluded.coins,combo=excluded.combo,strikes=excluded.strikes,completed=excluded.completed where excluded.score>diner_ranked_bests.score;
  end if;
 end if;
 return jsonb_build_object('ok',true,'duplicate',false);
end $$;

create or replace function public.diner_ranked_standings(p_week text)
returns table(rank bigint,wallet_label text,score integer,served integer,coins integer,combo integer,strikes integer,completed boolean)
language sql security definer set search_path=public,pg_temp stable as $$
 select rank() over(order by b.score desc),left(b.wallet,6)||'…'||right(b.wallet,4),b.score,b.served,b.coins,b.combo,b.strikes,b.completed
 from diner_ranked_bests b where b.week_id=p_week order by b.score desc,b.wallet limit 100;
$$;
revoke all on function public.diner_ranked_start(uuid,text,jsonb),public.diner_ranked_commit(uuid,uuid,text,bigint,jsonb,jsonb),public.diner_ranked_standings(text) from public,anon,authenticated;
grant execute on function public.diner_ranked_start(uuid,text,jsonb),public.diner_ranked_commit(uuid,uuid,text,bigint,jsonb,jsonb),public.diner_ranked_standings(text) to service_role;
