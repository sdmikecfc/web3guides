-- Finalized NFT ownership is separate from permanent opening/discovery history.
-- No contract registration, public endpoint or sales are enabled here.
create table public.diner_gacha_ownership_cursors (
  game_id text primary key references public.diner_gacha_games(id),
  start_block numeric(78,0) not null, block_number numeric(78,0), block_hash text
);
create table public.diner_gacha_ownership_blocks (
  game_id text not null references public.diner_gacha_games(id), block_number numeric(78,0) not null,
  block_hash text not null, events_hash text not null, primary key(game_id,block_number)
);
create table public.diner_gacha_assets (
  game_id text not null, token_id numeric(78,0) not null, item_id text not null,
  catalogue_version integer not null, opener text not null,
  owner text check(owner ~ '^0x[0-9a-f]{40}$' and owner<>'0x0000000000000000000000000000000000000000'),
  burned boolean not null default false, block_number numeric(78,0) not null,
  primary key(game_id,token_id), foreign key(game_id,token_id) references public.diner_gacha_openings(game_id,nonce),
  check(burned=(owner is null))
);
create index diner_gacha_assets_owner on public.diner_gacha_assets(owner,game_id) where not burned;
create table public.diner_gacha_asset_assignments (
  game_id text not null, token_id numeric(78,0) not null, owner text not null,
  location text not null check(location in ('home','truck')), target_id text not null check(target_id ~ '^[a-zA-Z0-9:_-]{1,120}$'),
  mode text not null check(mode in ('display','skin')),
  primary key(game_id,token_id), unique(owner,location,target_id),
  foreign key(game_id,token_id) references public.diner_gacha_assets(game_id,token_id)
);

create function public.diner_gacha_ownership_block(p_game text,p_start text,p_block jsonb,p_events jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare g public.diner_gacha_games; c public.diner_gacha_ownership_cursors; prior public.diner_gacha_ownership_blocks;
  b numeric; h text; e jsonb; n numeric; o public.diner_gacha_openings; a public.diner_gacha_assets;
  source text; dest text; idx integer; last_idx integer:=-1;
begin
  select * into g from public.diner_gacha_games where id=p_game for update;
  if not found or g.halted then raise exception 'gacha_ownership_unavailable'; end if;
  if p_start is null or p_start !~ '^(0|[1-9][0-9]{0,77})$' or coalesce(p_block->>'number','') !~ '^(0|[1-9][0-9]{0,77})$'
    or coalesce(p_block->>'hash','') !~ '^0x[0-9a-f]{64}$' or coalesce(p_block->>'parentHash','') !~ '^0x[0-9a-f]{64}$'
    or p_events is null or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>2000 or octet_length(p_events::text)>1048576 then raise exception 'gacha_ownership_input'; end if;
  b:=(p_block->>'number')::numeric; h:=encode(sha256(convert_to(p_events::text,'UTF8')),'hex');
  if g.cursor_block is null or b>g.cursor_block or (b=g.cursor_block and p_block->>'hash'<>g.cursor_hash) then raise exception 'gacha_ownership_wait_settlement'; end if;
  select * into prior from public.diner_gacha_ownership_blocks where game_id=p_game and block_number=b;
  if found then
    if prior.block_hash<>p_block->>'hash' or prior.events_hash<>h then raise exception 'gacha_ownership_replay_conflict'; end if;
    return false;
  end if;
  insert into public.diner_gacha_ownership_cursors(game_id,start_block) values(p_game,p_start::numeric) on conflict do nothing;
  select * into c from public.diner_gacha_ownership_cursors where game_id=p_game for update;
  if c.start_block<>p_start::numeric or b<>coalesce(c.block_number+1,c.start_block)
    or (c.block_hash is not null and c.block_hash<>p_block->>'parentHash') then raise exception 'gacha_ownership_cursor_conflict'; end if;
  for e in select value from jsonb_array_elements(p_events) loop
    source:=e->>'from'; dest:=e->>'to'; idx:=(e->>'logIndex')::integer;
    if e->>'gameId' is distinct from p_game or (e->>'chainId')::bigint is distinct from g.chain_id or e->>'contract' is distinct from g.contract
      or e->>'blockNumber' is distinct from b::text or e->>'blockHash' is distinct from p_block->>'hash'
      or coalesce(e->>'transactionHash','') !~ '^0x[0-9a-f]{64}$' or coalesce(e->>'tokenId','') !~ '^(0|[1-9][0-9]{0,77})$'
      or idx is null or idx<=last_idx or coalesce(source,'') !~ '^0x[0-9a-f]{40}$' or coalesce(dest,'') !~ '^0x[0-9a-f]{40}$'
      or (source='0x0000000000000000000000000000000000000000' and source=dest) then raise exception 'gacha_ownership_event_scope'; end if;
    last_idx:=idx; n:=(e->>'tokenId')::numeric;
    select * into o from public.diner_gacha_openings where game_id=p_game and nonce=n and not invalidated;
    if not found then raise exception 'gacha_ownership_unverified_mint'; end if;
    select * into a from public.diner_gacha_assets where game_id=p_game and token_id=n for update;
    if source='0x0000000000000000000000000000000000000000' then
      if found or dest<>o.opener or e->>'transactionHash' is distinct from lower(o.record->>'transactionHash')
        or b::text is distinct from o.record->>'blockNumber' or idx>=(o.record->>'logIndex')::integer then raise exception 'gacha_ownership_mint_conflict'; end if;
      insert into public.diner_gacha_assets values(p_game,n,o.item_id,(o.record->>'catalogueVersion')::integer,o.opener,dest,false,b);
    else
      if not found or a.burned or a.owner<>source then raise exception 'gacha_ownership_previous_owner'; end if;
      update public.diner_gacha_assets set owner=nullif(dest,'0x0000000000000000000000000000000000000000'),burned=dest='0x0000000000000000000000000000000000000000',block_number=b where game_id=p_game and token_id=n;
      -- Release the visual assignment only. Never delete or downgrade equipment.
      if source<>dest then delete from public.diner_gacha_asset_assignments where game_id=p_game and token_id=n; end if;
    end if;
  end loop;
  insert into public.diner_gacha_ownership_blocks values(p_game,b,p_block->>'hash',h);
  update public.diner_gacha_ownership_cursors set block_number=b,block_hash=p_block->>'hash' where game_id=p_game;
  return true;
end $$;

-- Called only after the existing editor validates the destination/compatibility.
-- No public assignment API is enabled in this increment.
create function public.diner_gacha_assign_asset(p_game text,p_token text,p_owner text,p_location text,p_target text,p_mode text,p_block text,p_hash text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.diner_gacha_assets; g public.diner_gacha_games; c public.diner_gacha_ownership_cursors;
begin
  select * into g from public.diner_gacha_games where id=p_game and not halted for update;
  if not found then raise exception 'gacha_assignment_unavailable'; end if;
  select * into c from public.diner_gacha_ownership_cursors where game_id=p_game;
  if c.block_number is null or c.block_number<>g.cursor_block or c.block_hash<>g.cursor_hash
    or c.block_number::text is distinct from p_block or c.block_hash is distinct from p_hash then raise exception 'gacha_assignment_sync_required'; end if;
  if p_token is null or p_token !~ '^(0|[1-9][0-9]{0,77})$' or p_owner is null or p_owner !~ '^0x[0-9a-f]{40}$' then raise exception 'gacha_assignment_input'; end if;
  select a0.* into a from public.diner_gacha_assets a0 join public.diner_gacha_openings o on o.game_id=a0.game_id and o.nonce=a0.token_id
    where a0.game_id=p_game and a0.token_id=p_token::numeric and a0.owner=p_owner and not a0.burned and not o.invalidated for update of a0;
  if not found then raise exception 'gacha_assignment_not_owned'; end if;
  if p_target is null then delete from public.diner_gacha_asset_assignments where game_id=p_game and token_id=a.token_id; return true; end if;
  insert into public.diner_gacha_asset_assignments values(p_game,a.token_id,p_owner,p_location,p_target,p_mode)
    on conflict(game_id,token_id) do update set owner=excluded.owner,location=excluded.location,target_id=excluded.target_id,mode=excluded.mode;
  return true;
end $$;

create table public.diner_gacha_collection_rules (
  domain text not null check(domain in ('gochujang','smoothie','wines')), catalogue_version integer not null,
  required_items text[] not null check(cardinality(required_items)=24), primary key(domain,catalogue_version)
);
insert into public.diner_gacha_collection_rules values
('gochujang',3,string_to_array('domain_gochujang_fireant_brigade,domain_gochujang_pepper_lanterns,domain_gochujang_mandu_mountain,domain_gochujang_spice_drawers,domain_gochujang_pepper_prep,domain_gochujang_tiger_coffee,domain_gochujang_chilli_canopy,domain_gochujang_night_stall,domain_gochujang_rice_griddle,domain_gochujang_kimchi_orchard,domain_gochujang_spice_moon,domain_gochujang_last_lantern,domain_gochujang_volcano_boiler,domain_gochujang_fireant_doorman,domain_gochujang_mandu_steamer,domain_gochujang_spice_drinks,domain_gochujang_hanok_roof,domain_gochujang_pepper_band,domain_gochujang_ant_delivery,domain_gochujang_steam_gate,domain_gochujang_spice_aquarium,domain_gochujang_fermentation_clockwork,domain_gochujang_midnight_express,domain_gochujang_fireant_city',',')),
('smoothie',3,string_to_array('domain_smoothie_toucan_bar,domain_smoothie_papaya_planter,domain_smoothie_citrus_mobile,domain_smoothie_fruit_skate,domain_smoothie_watermelon_prep,domain_smoothie_citrus_juicer,domain_smoothie_berry_nest,domain_smoothie_mango_pendant,domain_smoothie_palm_fountain,domain_smoothie_fruit_tide,domain_smoothie_mango_lagoon,domain_smoothie_fruit_atoll,domain_smoothie_orbit_blender,domain_smoothie_pineapple_cabana,domain_smoothie_berry_fridge,domain_smoothie_coconut_coffee,domain_smoothie_fruit_flamingo,domain_smoothie_tropical_fan,domain_smoothie_sorbet_cloud,domain_smoothie_banana_hammock,domain_smoothie_citrus_reef,domain_smoothie_tropical_station,domain_smoothie_toucan_palace,domain_smoothie_sun_in_glass',',')),
('wines',3,string_to_array('domain_wines_midnight_decanter,domain_wines_cork_garden,domain_wines_harvest_lamp,domain_wines_cellar_library,domain_wines_tasting_station,domain_wines_walnut_prep,domain_wines_vine_chandelier,domain_wines_cheese_dome,domain_wines_cellar_chiller,domain_wines_harvest_procession,domain_wines_bottle_vineyard,domain_wines_endless_vintage,domain_wines_sommelier_orrery,domain_wines_tartine_oven,domain_wines_cellar_coffee,domain_wines_vine_cooler,domain_wines_cork_captain,domain_wines_harvest_bear,domain_wines_cellar_window,domain_wines_grape_gazebo,domain_wines_moonlit_press,domain_wines_velvet_stage,domain_wines_vintage_airship,domain_wines_world_vintage',','));
create table public.diner_gacha_room_receipts (
  owner text not null, domain text not null, catalogue_version integer not null,
  receipt_key text not null unique, earned_at bigint not null, valid boolean not null default true,
  primary key(owner,domain,catalogue_version), foreign key(domain,catalogue_version) references public.diner_gacha_collection_rules(domain,catalogue_version)
);
create function public.diner_gacha_collection_immutable() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  -- A reviewed canonical correction can invalidate evidence, not rewrite the
  -- opening's identity or silently change what an existing catalogue requires.
  if tg_op='DELETE' or (to_jsonb(new)-'invalidated') is distinct from (to_jsonb(old)-'invalidated') then raise exception 'gacha_history_immutable'; end if;
  return new;
end $$;
create trigger diner_gacha_opening_identity before update or delete on public.diner_gacha_openings for each row execute function public.diner_gacha_collection_immutable();
create trigger diner_gacha_collection_rule_identity before update or delete on public.diner_gacha_collection_rules for each row execute function public.diner_gacha_collection_immutable();
create function public.diner_gacha_collection(p_owner text,p_domain text,p_version integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare required text[]; discovered text[]; completion bigint; r public.diner_gacha_room_receipts;
begin
  if p_owner is null or p_owner !~ '^0x[0-9a-f]{40}$' then raise exception 'gacha_collection_wallet'; end if;
  select required_items into required from public.diner_gacha_collection_rules where domain=p_domain and catalogue_version=p_version;
  if not found then raise exception 'gacha_collection_version'; end if;
  select array_agg(item_id order by item_id),max(first_time) into discovered,completion from (
    select o.item_id,min((o.record->>'openedAt')::bigint) as first_time from public.diner_gacha_openings o
    join public.diner_gacha_games g on g.id=o.game_id
    where o.opener=p_owner and not o.invalidated and g.domain=p_domain and (o.record->>'catalogueVersion')::integer=p_version
      and o.item_id=any(required) group by o.item_id
  ) firsts;
  select * into r from public.diner_gacha_room_receipts where owner=p_owner and domain=p_domain and catalogue_version=p_version and valid;
  return jsonb_build_object('domain',p_domain,'catalogueVersion',p_version,'found',coalesce(cardinality(discovered),0),'total',24,
    'discoveredIds',coalesce(discovered,array[]::text[]),'missingIds',array(select unnest(required) except select unnest(coalesce(discovered,array[]::text[]))),
    'complete',coalesce(cardinality(discovered),0)=24,'completedAt',case when cardinality(discovered)=24 then completion else null end,
    'receipt',case when r.receipt_key is not null and cardinality(discovered)=24 then jsonb_build_object('id',r.receipt_key,'earnedAt',r.earned_at) else null end);
end $$;
create function public.diner_gacha_refresh_room_receipt() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare d text; v integer; progress jsonb;
begin
  if new.invalidated then delete from public.diner_gacha_asset_assignments where game_id=new.game_id and token_id=new.nonce; end if;
  select domain into d from public.diner_gacha_games where id=new.game_id; v:=(new.record->>'catalogueVersion')::integer;
  if not exists(select 1 from public.diner_gacha_collection_rules where domain=d and catalogue_version=v) then return new; end if;
  -- Serialize different game contracts completing the same wallet/domain set.
  perform pg_advisory_xact_lock(hashtextextended('dk-collection:'||new.opener||':'||d||':'||v::text,0));
  progress:=public.diner_gacha_collection(new.opener,d,v);
  if (progress->>'complete')::boolean then
    insert into public.diner_gacha_room_receipts values(new.opener,d,v,'collection:'||d||':v'||v::text||':'||new.opener,(progress->>'completedAt')::bigint,true)
      on conflict(owner,domain,catalogue_version) do update set valid=true,earned_at=excluded.earned_at;
  else update public.diner_gacha_room_receipts set valid=false where owner=new.opener and domain=d and catalogue_version=v; end if;
  return new;
end $$;
create trigger diner_gacha_room_discovery_receipt after insert or update of invalidated on public.diner_gacha_openings for each row execute function public.diner_gacha_refresh_room_receipt();

-- Existing finalized history qualifies too; there is no client-submitted count.
insert into public.diner_gacha_room_receipts(owner,domain,catalogue_version,receipt_key,earned_at)
select opener,domain,catalogue_version,'collection:'||domain||':v'||catalogue_version::text||':'||opener,max(first_time)
from (
  select o.opener,g.domain,r.catalogue_version,o.item_id,min((o.record->>'openedAt')::bigint) as first_time
  from public.diner_gacha_openings o join public.diner_gacha_games g on g.id=o.game_id
  join public.diner_gacha_collection_rules r on r.domain=g.domain and r.catalogue_version=(o.record->>'catalogueVersion')::integer
  where not o.invalidated and o.item_id=any(r.required_items) group by o.opener,g.domain,r.catalogue_version,o.item_id
) firsts group by opener,domain,catalogue_version having count(*)=24;

create function public.diner_gacha_owned_assets(p_game text,p_owner text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare g public.diner_gacha_games; c public.diner_gacha_ownership_cursors; items jsonb;
begin
  if p_owner is null or p_owner !~ '^0x[0-9a-f]{40}$' then raise exception 'gacha_assets_wallet'; end if;
  select * into g from public.diner_gacha_games where id=p_game;
  if not found then raise exception 'gacha_assets_game'; end if;
  select * into c from public.diner_gacha_ownership_cursors where game_id=p_game;
  if g.halted or c.block_number is null or c.block_number<>g.cursor_block or c.block_hash<>g.cursor_hash then
    return jsonb_build_object('ready',false,'items','[]'::jsonb,'reason','ownership_sync_required');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('tokenId',a.token_id::text,'itemId',a.item_id,'catalogueVersion',a.catalogue_version,
    'backingAmount',p.record->>'prizeTokenAmount','assignment',case when s.token_id is not null then jsonb_build_object('location',s.location,'targetId',s.target_id,'mode',s.mode) else null end) order by a.token_id),'[]'::jsonb)
    into items from public.diner_gacha_assets a
    join public.diner_gacha_openings o on o.game_id=a.game_id and o.nonce=a.token_id and not o.invalidated
    join public.diner_gacha_pulls p on p.game_id=a.game_id and p.nonce=a.token_id
    left join public.diner_gacha_asset_assignments s on s.game_id=a.game_id and s.token_id=a.token_id and s.owner=p_owner
    where a.game_id=p_game and a.owner=p_owner and not a.burned;
  return jsonb_build_object('ready',true,'items',items,'checkpoint',jsonb_build_object('block',c.block_number::text,'hash',c.block_hash,'timestamp',g.cursor_timestamp));
end $$;

do $$ declare t text; f record; begin
  foreach t in array array['diner_gacha_ownership_cursors','diner_gacha_ownership_blocks','diner_gacha_assets','diner_gacha_asset_assignments','diner_gacha_collection_rules','diner_gacha_room_receipts'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to service_role',t);
  end loop;
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in ('diner_gacha_ownership_block','diner_gacha_assign_asset','diner_gacha_collection','diner_gacha_refresh_room_receipt','diner_gacha_owned_assets','diner_gacha_collection_immutable') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
