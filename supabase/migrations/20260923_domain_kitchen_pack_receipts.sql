-- Launch preparation only. Applying this migration does not enable pack sales.
-- The trusted settlement worker writes only AFTER payment finality, a committed
-- randomness result and a successful NFT mint. No browser insert/update policy.
create table if not exists public.domain_kitchen_pack_openings (
  opening_id uuid primary key,
  wallet text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  pack text not null check (pack in ('regular','super')),
  collection_version integer not null check (collection_version = 1),
  item_id text not null check (item_id ~ '^collect_[a-z_]+$'),
  chain_id bigint not null check (chain_id > 0),
  contract_address text not null check (contract_address ~ '^0x[0-9a-f]{40}$'),
  transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  log_index integer not null check (log_index >= 0),
  token_id text not null check (token_id ~ '^(0|[1-9][0-9]*)$'),
  opened_at timestamptz not null,
  unique (chain_id, transaction_hash, log_index),
  unique (chain_id, contract_address, token_id),
  check ((pack = 'regular' and item_id in ('collect_lucky_bun', 'collect_pickle_diver', 'collect_mustard_rocket', 'collect_ketchup_robot', 'collect_noodle_radio', 'collect_pancake_clock', 'collect_dumpling_lantern', 'collect_fry_crown', 'collect_burger_globe', 'collect_neon_lunch', 'collect_lunch_express', 'collect_golden_spatula')) or
    (pack = 'super' and item_id in ('collect_burger_mech', 'collect_ramen_dragon', 'collect_octopus_chef', 'collect_sundae_ufo', 'collect_moon_noodles', 'collect_disco_fries', 'collect_capsule_cabinet', 'collect_jellyfish_tank', 'collect_midnight_express', 'collect_phoenix_grill', 'collect_diner_portal', 'collect_king_bun')))
);
alter table public.domain_kitchen_pack_openings enable row level security;
revoke all on public.domain_kitchen_pack_openings from anon, authenticated;
grant select, insert on public.domain_kitchen_pack_openings to service_role;
-- Immutable openings survive a subsequent sale, redemption or ownership change.
revoke update, delete, truncate on public.domain_kitchen_pack_openings from service_role;

create or replace view public.domain_kitchen_pack_leaderboard
with (security_invoker = true) as
select wallet, pack, count(*) as openings,
       dense_rank() over (partition by pack order by count(*) desc) as rank
from public.domain_kitchen_pack_openings
group by wallet, pack;
revoke all on public.domain_kitchen_pack_leaderboard from anon, authenticated;
grant select on public.domain_kitchen_pack_leaderboard to service_role;

comment on table public.domain_kitchen_pack_openings is
'Finalized paid openings only. No beta samples. Insert from the verified settlement worker, never from client commands. Item/pack/version, payment and mint must be checked by that worker.';
