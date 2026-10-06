-- Apply before enabling NEXT_PUBLIC_DK_AUTHORITY_ENABLED=true. No token economics.
-- All mutations run through service-role-only functions; client roles have no policies.
begin;

alter table public.domain_kitchen_players
  add column if not exists authority_state jsonb,
  add column if not exists state_revision bigint not null default 0;

create table if not exists public.domain_kitchen_legacy_snapshots (
  game_key text not null,
  wallet text not null,
  state jsonb not null,
  best_quality numeric,
  captured_at timestamptz not null default now(),
  primary key (game_key, wallet)
);
create table if not exists public.domain_kitchen_commands (
  game_key text not null,
  wallet text not null,
  command_id uuid not null,
  fingerprint text not null,
  revision bigint not null,
  created_at timestamptz not null default now(),
  primary key (game_key, wallet, command_id)
);
alter table public.domain_kitchen_legacy_snapshots enable row level security;
alter table public.domain_kitchen_commands enable row level security;
revoke all on public.domain_kitchen_legacy_snapshots, public.domain_kitchen_commands from anon, authenticated;
grant all on public.domain_kitchen_legacy_snapshots, public.domain_kitchen_commands to service_role;

-- Prevent any obsolete save endpoint from overwriting a migrated restaurant.
create or replace function public.dk_guard_authority() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.authority_state is not null and
    (new.state is distinct from old.state or new.authority_state is distinct from old.authority_state
     or new.state_revision is distinct from old.state_revision or new.best_quality is distinct from old.best_quality
     or new.quality_now is distinct from old.quality_now or new.seats is distinct from old.seats)
    and current_setting('domain_kitchen.authority_write', true) is distinct from 'true' then
    raise exception 'use kitchen commands' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists dk_guard_authority on public.domain_kitchen_players;
create trigger dk_guard_authority before update on public.domain_kitchen_players
for each row execute function public.dk_guard_authority();

create or replace function public.dk_initialize_authority(
  p_game text, p_wallet text, p_save jsonb, p_authority jsonb, p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.domain_kitchen_players%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_game || ':' || p_wallet, 0));
  select * into r from public.domain_kitchen_players where game_key = p_game and wallet = p_wallet for update;
  if found and r.authority_state is not null then return jsonb_build_object('ok', true); end if;
  if found and r.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;
  if found then
    insert into public.domain_kitchen_legacy_snapshots(game_key, wallet, state, best_quality)
      values(p_game, p_wallet, r.state, r.best_quality) on conflict do nothing;
    update public.domain_kitchen_players set state = p_save, authority_state = p_authority,
      state_revision = 0, best_quality = 0, quality_now = 0
      where game_key = p_game and wallet = p_wallet;
  else
    insert into public.domain_kitchen_players(game_key, wallet, state, authority_state, state_revision, best_quality, quality_now, seats)
      values(p_game, p_wallet, p_save, p_authority, 0, 0, 0,
        (select count(*) from jsonb_array_elements(p_save->'layout') x where x->>'itemId' like '%chair%'));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- The trusted reducer supplies states; CAS, receipt insertion, and BOTH social
-- participants commit in one transaction. Sorted row locks avoid A->B/B->A deadlocks.
create or replace function public.dk_commit_command(
  p_game text, p_wallet text, p_command uuid, p_fingerprint text,
  p_expected_revision bigint, p_save jsonb, p_authority jsonb,
  p_quality integer, p_seats integer,
  p_target_wallet text default null, p_target_revision bigint default null,
  p_target_save jsonb default null, p_target_authority jsonb default null,
  p_target_quality integer default null, p_target_seats integer default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.domain_kitchen_players%rowtype; receipt public.domain_kitchen_commands%rowtype;
begin
  perform 1 from public.domain_kitchen_players
    where game_key = p_game and (wallet = p_wallet or wallet = p_target_wallet)
    order by wallet for update;
  select * into receipt from public.domain_kitchen_commands
    where game_key = p_game and wallet = p_wallet and command_id = p_command;
  if found then
    if receipt.fingerprint <> p_fingerprint then return jsonb_build_object('ok', false, 'code', 'id_reused'); end if;
    return jsonb_build_object('ok', true, 'duplicate', true, 'revision', receipt.revision);
  end if;
  select * into r from public.domain_kitchen_players where game_key = p_game and wallet = p_wallet;
  if not found or r.authority_state is null or r.state_revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;
  if p_target_wallet is not null then
    if p_target_wallet = p_wallet then return jsonb_build_object('ok', false, 'code', 'invalid_target'); end if;
    select * into r from public.domain_kitchen_players where game_key = p_game and wallet = p_target_wallet;
    if not found or r.authority_state is null or r.state_revision <> p_target_revision then
      return jsonb_build_object('ok', false, 'code', 'conflict');
    end if;
  end if;
  perform set_config('domain_kitchen.authority_write', 'true', true);
  update public.domain_kitchen_players set state = p_save, authority_state = p_authority,
    state_revision = state_revision + 1, best_quality = (p_authority->>'verifiedBestQuality')::numeric,
    quality_now = p_quality, seats = p_seats where game_key = p_game and wallet = p_wallet;
  if p_target_wallet is not null then
    update public.domain_kitchen_players set state = p_target_save, authority_state = p_target_authority,
      state_revision = state_revision + 1, best_quality = (p_target_authority->>'verifiedBestQuality')::numeric,
      quality_now = p_target_quality, seats = p_target_seats where game_key = p_game and wallet = p_target_wallet;
  end if;
  insert into public.domain_kitchen_commands(game_key, wallet, command_id, fingerprint, revision)
    values(p_game, p_wallet, p_command, p_fingerprint, p_expected_revision + 1);
  return jsonb_build_object('ok', true, 'revision', p_expected_revision + 1);
end $$;

revoke all on function public.dk_initialize_authority(text,text,jsonb,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.dk_commit_command(text,text,uuid,text,bigint,jsonb,jsonb,integer,integer,text,bigint,jsonb,jsonb,integer,integer) from public, anon, authenticated;
grant execute on function public.dk_initialize_authority(text,text,jsonb,jsonb,timestamptz) to service_role;
grant execute on function public.dk_commit_command(text,text,uuid,text,bigint,jsonb,jsonb,integer,integer,text,bigint,jsonb,jsonb,integer,integer) to service_role;

commit;
