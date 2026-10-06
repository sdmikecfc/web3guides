-- Collection v2. Preserves v1 receipt validation; does not enable paid sales.
begin;
create table if not exists public.domain_kitchen_collection_items (
 collection_version integer not null, item_id text not null, pack text not null check(pack in ('regular','super')),
 primary key(collection_version,item_id,pack)
);
alter table public.domain_kitchen_collection_items enable row level security;
revoke all on public.domain_kitchen_collection_items from anon,authenticated;
grant select on public.domain_kitchen_collection_items to service_role;
insert into public.domain_kitchen_collection_items(collection_version,item_id,pack) values
(1,'collect_lucky_bun','regular'),
(1,'collect_pickle_diver','regular'),
(1,'collect_mustard_rocket','regular'),
(1,'collect_ketchup_robot','regular'),
(1,'collect_noodle_radio','regular'),
(1,'collect_pancake_clock','regular'),
(1,'collect_dumpling_lantern','regular'),
(1,'collect_fry_crown','regular'),
(1,'collect_burger_globe','regular'),
(1,'collect_neon_lunch','regular'),
(1,'collect_lunch_express','regular'),
(1,'collect_golden_spatula','regular'),
(1,'collect_burger_mech','super'),
(1,'collect_ramen_dragon','super'),
(1,'collect_octopus_chef','super'),
(1,'collect_sundae_ufo','super'),
(1,'collect_moon_noodles','super'),
(1,'collect_disco_fries','super'),
(1,'collect_capsule_cabinet','super'),
(1,'collect_jellyfish_tank','super'),
(1,'collect_midnight_express','super'),
(1,'collect_phoenix_grill','super'),
(1,'collect_diner_portal','super'),
(1,'collect_king_bun','super'),
(2,'collect_lucky_cat_soda','regular'),
(2,'collect_rocket_shake','regular'),
(2,'collect_dumpling_bathhouse','regular'),
(2,'collect_sir_pickles','regular'),
(2,'collect_pancake_wheel','regular'),
(2,'collect_rabbit_tea','regular'),
(2,'collect_disco_lobster','regular'),
(2,'collect_croissant_mobile','regular'),
(2,'collect_kraken_espresso','regular'),
(2,'collect_bento_garden','regular'),
(2,'collect_noodle_theatre','regular'),
(2,'collect_last_fry','regular'),
(2,'collect_dragonfire_grill','super'),
(2,'collect_disco_burger_jukebox','super'),
(2,'collect_koi_boiler','super'),
(2,'collect_lunar_oven','super'),
(2,'collect_phoenix_fryer','super'),
(2,'collect_gelato_observatory','super'),
(2,'collect_octopus_orchestra','super'),
(2,'collect_burger_belt','super'),
(2,'collect_sushi_parade','super'),
(2,'collect_after_hours_diner','super'),
(2,'collect_cosmic_carousel','super'),
(2,'collect_world_on_plate','super')
on conflict do nothing;
alter table public.domain_kitchen_pack_openings drop constraint if exists domain_kitchen_pack_openings_collection_version_check;
alter table public.domain_kitchen_pack_openings drop constraint if exists domain_kitchen_pack_openings_check;
alter table public.domain_kitchen_pack_openings add constraint domain_kitchen_pack_catalogue_fk foreign key(collection_version,item_id,pack) references public.domain_kitchen_collection_items(collection_version,item_id,pack);
commit;
