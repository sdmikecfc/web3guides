-- Review/apply before deploying save v8. This performs no token distribution.
-- Keep the exact pre-truck state and authority ledger on the first v8 write,
-- including accounts that had already migrated to authoritative home saves.
begin;

create table if not exists public.domain_kitchen_version_snapshots (
  game_key text not null,
  wallet text not null,
  target_version integer not null,
  state jsonb not null,
  authority_state jsonb,
  state_revision bigint not null,
  best_quality numeric,
  quality_now numeric,
  seats integer,
  captured_at timestamptz not null default now(),
  primary key (game_key, wallet, target_version)
);
alter table public.domain_kitchen_version_snapshots enable row level security;
revoke all on public.domain_kitchen_version_snapshots from public, anon, authenticated, service_role;
grant select on public.domain_kitchen_version_snapshots to service_role;

create or replace function public.dk_snapshot_before_truck() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.state->>'v' = '8' and old.state->>'v' is distinct from '8' then
    insert into public.domain_kitchen_version_snapshots
      (game_key, wallet, target_version, state, authority_state, state_revision, best_quality, quality_now, seats)
    values (old.game_key, old.wallet, 8, old.state, old.authority_state, old.state_revision, old.best_quality, old.quality_now, old.seats)
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.dk_snapshot_before_truck() from public, anon, authenticated, service_role;
drop trigger if exists dk_snapshot_before_truck on public.domain_kitchen_players;
create trigger dk_snapshot_before_truck before update of state on public.domain_kitchen_players
for each row execute function public.dk_snapshot_before_truck();

commit;
