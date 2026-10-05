-- REVIEW ONLY. Requires 20260920_diner_preview.sql; no production apply here.
begin;
-- A pair action can be recorded in both participants' audit streams. UUID
-- idempotency is enforced by the actor's command receipt, not by an observer's
-- audit entry (which can legitimately reference the same UUID).
alter table public.diner_preview_run_inputs drop constraint if exists diner_preview_run_inputs_player_id_command_id_key;
create table if not exists public.diner_preview_profiles (
  player_id uuid primary key references public.diner_preview_players(player_id) on delete cascade,
  handle text unique not null check (handle ~ '^diner-[a-f0-9]{16}$'),
  published boolean not null default false,
  social jsonb not null
);
create table if not exists public.diner_preview_friendships (
  left_id uuid not null references public.diner_preview_players(player_id) on delete cascade,
  right_id uuid not null references public.diner_preview_players(player_id) on delete cascade,
  state jsonb not null,
  primary key(left_id, right_id), check(left_id < right_id)
);
create table if not exists public.diner_preview_trades (
  id uuid primary key,
  from_id uuid not null references public.diner_preview_players(player_id) on delete cascade,
  to_id uuid not null references public.diner_preview_players(player_id) on delete cascade,
  status text not null check(status in ('pending','accepted','cancelled','expired')),
  state jsonb not null, check(from_id <> to_id)
);
alter table public.diner_preview_profiles enable row level security;
alter table public.diner_preview_friendships enable row level security;
alter table public.diner_preview_trades enable row level security;
revoke all on public.diner_preview_profiles, public.diner_preview_friendships, public.diner_preview_trades from public, anon, authenticated, service_role;
grant select on public.diner_preview_profiles, public.diner_preview_friendships, public.diner_preview_trades to service_role;
create or replace function public.diner_preview_social_initialize(p_player uuid,p_profile jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.diner_preview_profiles(player_id,handle,published,social)
  values(p_player,p_profile->>'handle',false,p_profile) on conflict(player_id) do nothing;
end $$;

create or replace function public.diner_preview_social_commit(
  p_actor uuid,p_target uuid,p_actor_revision bigint,p_target_revision bigint,
  p_command uuid,p_fingerprint text,p_actor_state jsonb,p_target_state jsonb,
  p_actor_social jsonb,p_target_social jsonb,p_pair jsonb,p_trade jsonb,
  p_input jsonb,p_server_time_ms bigint,p_content_version integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor public.diner_preview_players%rowtype; target public.diner_preview_players%rowtype; receipt public.diner_preview_commands%rowtype;
begin
  -- Main commands and pair operations lock the same canonical rows. Stable UUID
  -- ordering prevents opposite-direction requests from deadlocking each other.
  perform 1 from public.diner_preview_players where player_id=p_actor or player_id=p_target order by player_id for update;
  select * into actor from public.diner_preview_players where player_id=p_actor;
  if not found then return jsonb_build_object('ok',false,'code','missing_player'); end if;
  select * into receipt from public.diner_preview_commands where player_id=p_actor and command_id=p_command;
  if found then
    if receipt.fingerprint<>p_fingerprint then return jsonb_build_object('ok',false,'code','id_reused'); end if;
    return jsonb_build_object('ok',true,'duplicate',true,'revision',receipt.revision);
  end if;
  if actor.revision<>p_actor_revision then return jsonb_build_object('ok',false,'code','conflict'); end if;
  if p_target is not null then
    select * into target from public.diner_preview_players where player_id=p_target;
    if not found or target.revision<>p_target_revision then return jsonb_build_object('ok',false,'code','conflict'); end if;
    if p_target=p_actor then return jsonb_build_object('ok',false,'code','invalid_pair'); end if;
  end if;
  update public.diner_preview_players set state=p_actor_state,revision=revision+1,updated_at=now() where player_id=p_actor;
  update public.diner_preview_profiles set published=(p_actor_social->>'published')::boolean,social=p_actor_social where player_id=p_actor;
  if p_target is not null then
    update public.diner_preview_players set state=p_target_state,revision=revision+1,updated_at=now() where player_id=p_target;
    update public.diner_preview_profiles set published=(p_target_social->>'published')::boolean,social=p_target_social where player_id=p_target;
  end if;
  if p_pair is not null then
    insert into public.diner_preview_friendships(left_id,right_id,state) values((p_pair->>'left')::uuid,(p_pair->>'right')::uuid,p_pair)
    on conflict(left_id,right_id) do update set state=excluded.state;
  end if;
  if p_trade is not null then
    insert into public.diner_preview_trades(id,from_id,to_id,status,state) values((p_trade->>'id')::uuid,(p_trade->>'from')::uuid,(p_trade->>'to')::uuid,p_trade->>'status',p_trade)
    on conflict(id) do update set status=excluded.status,state=excluded.state;
  end if;
  insert into public.diner_preview_commands(player_id,command_id,fingerprint,revision) values(p_actor,p_command,p_fingerprint,p_actor_revision+1);
  insert into public.diner_preview_run_inputs(player_id,revision,command_id,run_id,content_version,commands,checkpoint,server_time_ms)
    values(p_actor,p_actor_revision+1,p_command,null,p_content_version,jsonb_build_array(p_input),p_actor_state,p_server_time_ms);
  if p_target is not null then
    insert into public.diner_preview_run_inputs(player_id,revision,command_id,run_id,content_version,commands,checkpoint,server_time_ms)
      values(p_target,p_target_revision+1,p_command,null,p_content_version,jsonb_build_array(p_input),p_target_state,p_server_time_ms);
  end if;
  return jsonb_build_object('ok',true,'revision',p_actor_revision+1);
end $$;
revoke all on function public.diner_preview_social_initialize(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.diner_preview_social_commit(uuid,uuid,bigint,bigint,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,bigint,integer) from public,anon,authenticated,service_role;
grant execute on function public.diner_preview_social_initialize(uuid,jsonb) to service_role;
grant execute on function public.diner_preview_social_commit(uuid,uuid,bigint,bigint,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,bigint,integer) to service_role;
commit;
