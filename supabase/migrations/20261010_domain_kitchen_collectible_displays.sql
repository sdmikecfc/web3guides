create or replace function public.diner_gacha_equipment_inventory(p_game text,p_owner text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare base jsonb; rev bigint; entries jsonb;
begin
  base:=public.diner_gacha_owned_assets(p_game,p_owner);
  select revision into rev from public.diner_gacha_assignment_heads where owner=p_owner;
  select coalesce(jsonb_agg(jsonb_build_object('tokenId',i->>'tokenId','itemId',i->>'itemId','catalogueVersion',(i->>'catalogueVersion')::integer,
    'destination',case when i->'assignment'->>'mode'=case when b.destination->>'display'='true' then 'display' else 'skin' end and i->'assignment'->>'targetId'=b.target_key then b.destination else null end) order by (i->>'tokenId')::numeric),'[]'::jsonb)
  into entries from jsonb_array_elements(base->'items') i
    left join public.diner_gacha_equipment_bindings b on b.game_id=p_game and b.token_id=(i->>'tokenId')::numeric;
  return jsonb_build_object('ready',base->'ready','checkpoint',base->'checkpoint','revision',coalesce(rev,0)::text,'items',entries);
end $$;

-- Authenticated server supplies owner and canonical indexed block. A browser can
-- describe its LOCAL beta machine, but cannot supply the owned item or wallet.
-- Catalogue compatibility is also checked in the server adapter before this RPC.
create or replace function public.diner_gacha_assign_equipment(p_game text,p_owner text,p_request jsonb,p_target text,p_block text,p_hash text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare fingerprint text; previous text; rev bigint; target jsonb; token text;
begin
  perform 1 from public.diner_gacha_games where id=p_game and not halted for update;
  if not found then raise exception 'gacha_assignment_unavailable'; end if;
  insert into public.diner_gacha_assignment_heads(owner) values(p_owner) on conflict do nothing;
  select revision into rev from public.diner_gacha_assignment_heads where owner=p_owner for update;
  -- Store exact canonical request text; deduplication needs no lossy hash.
  fingerprint:=jsonb_build_object('game',p_game,'request',p_request,'target',p_target)::text;
  select r.fingerprint into previous from public.diner_gacha_assignment_requests r where owner=p_owner and request_id=(p_request->>'requestId')::uuid;
  if found then
    if previous<>fingerprint then raise exception 'gacha_assignment_retry_conflict'; end if;
    return false; -- Lost replies never recreate an assignment after transfer/removal.
  end if;
  if rev::text is distinct from p_request->>'revision' then raise exception 'gacha_assignment_revision_conflict'; end if;
  target:=nullif(p_request->'destination','null'::jsonb); token:=p_request->>'tokenId';
  if target is not null and (p_target is null or p_target !~ '^0x[0-9a-f]{64}$' or target->>'room' !~ '^0x[0-9a-f]{64}$'
    or target->>'location' not in ('home','truck') or target->>'id' !~ '^[a-zA-Z0-9:_-]{1,100}$' or target->>'kind' !~ '^[a-z_0-9]{1,40}$') then raise exception 'gacha_assignment_input'; end if;
  perform public.diner_gacha_assign_asset(p_game,token,p_owner,coalesce(target->>'location','home'),case when target is null then null else p_target end,case when target->>'display'='true' then 'display' else 'skin' end,p_block,p_hash);
  delete from public.diner_gacha_equipment_bindings where game_id=p_game and token_id=token::numeric;
  if target is not null then insert into public.diner_gacha_equipment_bindings values(p_game,token::numeric,p_target,target); end if;
  update public.diner_gacha_assignment_heads set revision=revision+1 where owner=p_owner;
  insert into public.diner_gacha_assignment_requests values(p_owner,(p_request->>'requestId')::uuid,fingerprint);
  return true;
end $$;


