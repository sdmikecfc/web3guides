-- Token-zone account grouping; old wallet mappings and historical reads stay intact.
begin;
-- A verified sign-in is sufficient for discovery; no game save or grant is needed.
create table if not exists public.mkz_registered_wallets (
 wallet text primary key check(wallet~'^0x[0-9a-f]{40}$' and wallet<>'0x0000000000000000000000000000000000000000'),
 registered_at timestamptz not null default clock_timestamp()
);
create or replace function public.mkz_register_wallet(p_wallet text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if p_wallet is null or p_wallet!~'^0x[0-9a-f]{40}$' or p_wallet='0x0000000000000000000000000000000000000000'
 then raise exception 'MK_LINK_INVALID';end if;
 if exists(select 1 from battle_bots_players where wallet=p_wallet and (is_test or is_operator)) then raise exception 'ACCOUNT_INELIGIBLE';end if;
 insert into mkz_registered_wallets(wallet) values(p_wallet) on conflict do nothing;
 return jsonb_build_object('ok',true);
end $$;
create or replace view public.mkz_tracking_players with(security_barrier=true) as
 select a.wallet,min(a.since) since from (
  select wallet,since from mk8_tracking_players
  union all select wallet,registered_at from mkz_registered_wallets
 ) a where not exists(select 1 from battle_bots_players p where p.wallet=a.wallet and (p.is_test or p.is_operator)) group by a.wallet;
create table if not exists public.mkz_wallet_links (
 wallet text primary key, mcp_wallet text, doma_user_id text, privy_did text,
 status text not null check(status in ('linked','not_found')),revision integer not null,
 checked_at timestamptz not null,updated_at timestamptz not null default now()
);
create table if not exists public.mkz_wallet_link_requests (
 request_id uuid primary key,wallet text not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
create or replace view public.mkz_all_links with(security_barrier=true) as
 select * from mkz_wallet_links union all select l.* from mk8_wallet_links l where not exists(select 1 from mkz_wallet_links n where n.wallet=l.wallet);
create or replace view public.mkz_wallet_discovery with(security_barrier=true) as
 select p.wallet,p.since,coalesce(l.status,'pending') status,l.mcp_wallet,coalesce(l.revision,0) revision,l.checked_at
 from mkz_tracking_players p left join mkz_all_links l on l.wallet=p.wallet;
create or replace view public.mkz_wallets with(security_barrier=true) as
 select doma_user_id participant,wallet trade_wallet from mkz_all_links where status='linked'
 union select doma_user_id,mcp_wallet from mkz_all_links where status='linked';
create or replace view public.mkz_tracking_wallets with(security_barrier=true) as
 select p.wallet player_wallet,w.trade_wallet,p.since from mkz_tracking_players p
 join mkz_all_links l on l.wallet=p.wallet and l.status='linked' join mkz_wallets w on w.participant=l.doma_user_id;
create or replace function public.mkz_resolve_wallet(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare old public.mkz_wallet_links%rowtype; prior public.mkz_wallet_link_requests%rowtype;
 w text; m text; uid text; did text; s text; checked timestamptz; expected int; rid uuid; receipt jsonb;
begin
 if jsonb_typeof(p_payload) is distinct from 'object'
 or not p_payload ?& array['schemaVersion','requestId','wallet','mcpWallet','domaUserId','privyDid','status','checkedAt','expectedRevision']
 or exists(select 1 from jsonb_object_keys(p_payload) k where k<>all(array['schemaVersion','requestId','wallet','mcpWallet','domaUserId','privyDid','status','checkedAt','expectedRevision']))
 or p_payload->'schemaVersion' is distinct from '1'::jsonb then raise exception 'MK_LINK_INVALID'; end if;
 w:=p_payload->>'wallet';m:=p_payload->>'mcpWallet';uid:=p_payload->>'domaUserId';did:=p_payload->>'privyDid';s:=p_payload->>'status';
 if w is null or w !~ '^0x[0-9a-f]{40}$' or s is null or s not in ('linked','not_found')
 or jsonb_typeof(p_payload->'expectedRevision') is distinct from 'number' or p_payload->>'expectedRevision' !~ '^(0|[1-9][0-9]{0,8})$'
 or p_payload->>'requestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(p_payload->'requestId') is distinct from 'string'
 or jsonb_typeof(p_payload->'checkedAt') is distinct from 'string' then raise exception 'MK_LINK_INVALID'; end if;
 rid:=(p_payload->>'requestId')::uuid;expected:=(p_payload->>'expectedRevision')::int;
 checked:=(p_payload->>'checkedAt')::timestamptz;
 if checked is null or checked>now()+interval '60 seconds' or checked<now()-interval '7 days' then raise exception 'MK_LINK_INVALID'; end if;
 if s='linked' then
  -- A verified Doma account can use Strategies without an embedded wallet.
  if (m is not null and (m !~ '^0x[0-9a-f]{40}$' or m='0x0000000000000000000000000000000000000000'))
   or uid is null or uid !~ '^[0-9]{1,30}$' or (did is not null and did !~ '^did:privy:[A-Za-z0-9_-]{1,100}$')
   then raise exception 'MK_LINK_INVALID'; end if;
 elsif m is not null or uid is not null or did is not null then raise exception 'MK_LINK_INVALID'; end if;
 perform pg_advisory_xact_lock(1734520,hashtext(rid::text));
 select * into prior from public.mkz_wallet_link_requests where request_id=rid;
 if found then
  if prior.payload is distinct from p_payload then raise exception 'MK_LINK_CONFLICT'; end if;
  return prior.result || jsonb_build_object('replayed',true);
 end if;
 -- Serialize discovery globally: low-volume four-hour jobs; protects overlapping
 -- address/user mappings even when two jobs resolve different connected wallets.
 perform pg_advisory_xact_lock(1734521,0);
 if not exists(select 1 from public.mkz_tracking_players where wallet=w) then raise exception 'MK_LINK_UNREGISTERED'; end if;
 select * into old from public.mkz_all_links where wallet=w for update;
 if coalesce(old.revision,0)<>expected then raise exception 'MK_LINK_CONFLICT'; end if;
 if old.status='linked' and (s<>'linked' or (old.mcp_wallet is not null and old.mcp_wallet is distinct from m) or old.doma_user_id is distinct from uid or (old.privy_did is not null and old.privy_did is distinct from did))
 then raise exception 'MK_LINK_REVIEW_REQUIRED'; end if;
 if old.checked_at>checked then raise exception 'MK_LINK_CONFLICT'; end if;
 if s='linked' and (
  exists(select 1 from public.mkz_all_links where wallet<>w and status='linked' and
   (((mcp_wallet in (w,m) or wallet=m) and doma_user_id<>uid)
    or (doma_user_id=uid and ((mcp_wallet is not null and m is not null and mcp_wallet<>m) or (privy_did is not null and did is not null and privy_did<>did)))))
 ) then raise exception 'MK_LINK_REVIEW_REQUIRED'; end if;
 if s='linked' and exists(select 1 from mkz_wallets where trade_wallet in (w,m) and participant<>uid) then raise exception 'MK_LINK_REVIEW_REQUIRED';end if;
 insert into public.mkz_wallet_links(wallet,mcp_wallet,doma_user_id,privy_did,status,revision,checked_at)
 values(w,m,uid,did,s,expected+1,checked)
 on conflict(wallet) do update set mcp_wallet=excluded.mcp_wallet,doma_user_id=excluded.doma_user_id,
  privy_did=excluded.privy_did,status=excluded.status,revision=excluded.revision,checked_at=excluded.checked_at,updated_at=now();
 receipt:=jsonb_build_object('ok',true,'wallet',w,'mcpWallet',m,'status',s,'revision',expected+1,'replayed',false);
 insert into public.mkz_wallet_link_requests values(rid,w,p_payload,receipt,now());
 return receipt;
exception when unique_violation then raise exception 'MK_LINK_REVIEW_REQUIRED';
 when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then raise exception 'MK_LINK_INVALID';
end $$;


-- Source ingestion validates agent addresses against the same grouped mapping.
create or replace function public.mkz_agent_wallet(p_wallet text) returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from mkz_all_links where status='linked' and mcp_wallet=p_wallet);
$$;
revoke all on function mkz_resolve_wallet(jsonb),mkz_agent_wallet(text) from public,anon,authenticated;
grant execute on function mkz_resolve_wallet(jsonb),mkz_agent_wallet(text) to service_role;
alter table mkz_wallet_links enable row level security;
alter table mkz_wallet_link_requests enable row level security;
alter table mkz_registered_wallets enable row level security;
revoke all on mkz_registered_wallets,mkz_tracking_players from public,anon,authenticated,service_role;
revoke all on function mkz_register_wallet(text) from public,anon,authenticated;
grant execute on function mkz_register_wallet(text) to service_role;
revoke all on mkz_wallet_links,mkz_wallet_link_requests,mkz_all_links,mkz_wallet_discovery,mkz_tracking_wallets from public,anon,authenticated;
grant select on mkz_wallet_links,mkz_all_links,mkz_wallet_discovery,mkz_tracking_wallets to service_role;
commit;
