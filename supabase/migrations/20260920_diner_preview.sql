-- REVIEW ONLY. Apply in an isolated staging project before explicitly enabling
-- DINER_PREVIEW_SERVER_ENABLED. No legacy domain_kitchen_* tables are touched.
begin;
create table if not exists public.diner_preview_players (
  player_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  clock jsonb not null,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.diner_preview_commands (
  player_id uuid not null references public.diner_preview_players(player_id) on delete cascade,
  command_id uuid not null,
  fingerprint text not null,
  revision bigint not null,
  created_at timestamptz not null default now(),
  primary key (player_id, command_id)
);
create table if not exists public.diner_preview_run_inputs (
  player_id uuid not null references public.diner_preview_players(player_id) on delete cascade,
  revision bigint not null,
  command_id uuid not null,
  run_id text,
  content_version integer not null,
  commands jsonb not null,
  checkpoint jsonb not null,
  server_time_ms bigint not null,
  created_at timestamptz not null default now(),
  primary key (player_id, revision)
);
alter table public.diner_preview_players enable row level security;
alter table public.diner_preview_commands enable row level security;
alter table public.diner_preview_run_inputs enable row level security;
revoke all on public.diner_preview_players, public.diner_preview_commands, public.diner_preview_run_inputs from public, anon, authenticated, service_role;
grant select on public.diner_preview_players, public.diner_preview_commands, public.diner_preview_run_inputs to service_role;

create or replace function public.diner_preview_initialize(p_player uuid, p_state jsonb, p_clock jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.diner_preview_players(player_id, state, clock)
    values(p_player, p_state, p_clock) on conflict do nothing;
end $$;

create or replace function public.diner_preview_commit(
  p_player uuid, p_command uuid, p_fingerprint text, p_expected_revision bigint,
  p_state jsonb, p_clock jsonb, p_commands jsonb, p_run_id text,
  p_content_version integer, p_server_time_ms bigint
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare player public.diner_preview_players%rowtype; receipt public.diner_preview_commands%rowtype;
begin
  select * into player from public.diner_preview_players where player_id = p_player for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'missing_player'); end if;
  select * into receipt from public.diner_preview_commands where player_id = p_player and command_id = p_command;
  if found then
    if receipt.fingerprint <> p_fingerprint then return jsonb_build_object('ok', false, 'code', 'id_reused'); end if;
    return jsonb_build_object('ok', true, 'duplicate', true, 'revision', receipt.revision);
  end if;
  if player.revision <> p_expected_revision then return jsonb_build_object('ok', false, 'code', 'conflict'); end if;
  update public.diner_preview_players set state = p_state, clock = p_clock,
    revision = revision + 1, updated_at = now() where player_id = p_player;
  insert into public.diner_preview_commands(player_id, command_id, fingerprint, revision)
    values(p_player, p_command, p_fingerprint, p_expected_revision + 1);
  -- Preserve accepted ordered inputs and a canonical checkpoint together with
  -- every receipt. Later balance/content changes cannot rewrite this history.
  insert into public.diner_preview_run_inputs(player_id, revision, command_id, run_id, content_version, commands, checkpoint, server_time_ms)
    values(p_player, p_expected_revision + 1, p_command, p_run_id, p_content_version, p_commands, p_state, p_server_time_ms);
  return jsonb_build_object('ok', true, 'revision', p_expected_revision + 1);
end $$;
revoke all on function public.diner_preview_initialize(uuid,jsonb,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.diner_preview_commit(uuid,uuid,text,bigint,jsonb,jsonb,jsonb,text,integer,bigint) from public, anon, authenticated, service_role;
grant execute on function public.diner_preview_initialize(uuid,jsonb,jsonb) to service_role;
grant execute on function public.diner_preview_commit(uuid,uuid,text,bigint,jsonb,jsonb,jsonb,text,integer,bigint) to service_role;
commit;
