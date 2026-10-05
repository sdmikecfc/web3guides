-- Model Kombat only. Apply after workshop + journey. No Reporter writes.
-- Wallet discovery is not competition enrollment, a trade receipt or a coin grant.
begin;
create table if not exists public.mk8_wallet_links (
 wallet text primary key check(wallet ~ '^0x[0-9a-f]{40}$' and wallet <> '0x0000000000000000000000000000000000000000'),
 mcp_wallet text unique check(mcp_wallet ~ '^0x[0-9a-f]{40}$' and mcp_wallet <> '0x0000000000000000000000000000000000000000'),
 doma_user_id text unique, privy_did text,
 status text not null check(status in ('linked','not_found')),
 revision integer not null check(revision > 0), checked_at timestamptz not null,
 updated_at timestamptz not null default now(),
 check((status='linked' and mcp_wallet is not null and doma_user_id is not null) or
       (status='not_found' and mcp_wallet is null and doma_user_id is null and privy_did is null))
);
create table if not exists public.mk8_wallet_link_requests (
 request_id uuid primary key, wallet text not null, payload jsonb not null,
 result jsonb not null, created_at timestamptz not null default now()
);
alter table public.mk8_wallet_links enable row level security;
alter table public.mk8_wallet_link_requests enable row level security;

-- Include connected workshop accounts and existing registered players. Browsing
-- and guest sessions do not enqueue discovery. Garages cannot duplicate a wallet.
create or replace view public.mk8_tracking_players with (security_barrier=true) as
 select a.wallet,min(a.since) as since from (
  select wallet,created_at as since from public.mk8_players where wallet is not null
  union all select w.wallet,coalesce((select min(r.created_at) from public.mk8_requests r where r.wallet=w.wallet),w.updated_at) from public.mk8_workshops w
  union all select wallet,enlisted_at from public.battle_bots_players where enlisted_at is not null
 ) a where a.wallet ~ '^0x[0-9a-f]{40}$' and a.wallet <> '0x0000000000000000000000000000000000000000'
 and not exists(select 1 from public.battle_bots_players p where p.wallet=a.wallet and (p.is_test or p.is_operator))
 group by a.wallet;

create or replace view public.mk8_wallet_discovery with (security_barrier=true) as
 select p.wallet,p.since,coalesce(l.status,'pending') as status,l.mcp_wallet,
 coalesce(l.revision,0) as revision,l.checked_at
 from public.mk8_tracking_players p left join public.mk8_wallet_links l on l.wallet=p.wallet;

-- One monitored address per player even when the connected wallet IS the MCP wallet.
-- Ambiguous cross-account ownership is withheld rather than double-attributed.
create or replace view public.mk8_tracking_wallets with (security_barrier=true) as
 with candidates as (
  select p.wallet as player_wallet,p.wallet as trade_wallet,p.since from public.mk8_tracking_players p
  union select p.wallet,l.mcp_wallet,p.since from public.mk8_tracking_players p
    join public.mk8_wallet_links l on l.wallet=p.wallet and l.status='linked'
 ) select c.* from candidates c where not exists(
  select 1 from candidates x where x.trade_wallet=c.trade_wallet and x.player_wallet<>c.player_wallet
 );

create or replace function public.mk8_resolve_wallet(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare old public.mk8_wallet_links%rowtype; prior public.mk8_wallet_link_requests%rowtype;
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
  if m is null or m !~ '^0x[0-9a-f]{40}$' or m='0x0000000000000000000000000000000000000000'
   or uid is null or uid !~ '^[0-9]{1,30}$' or (did is not null and did !~ '^did:privy:[A-Za-z0-9_-]{1,100}$')
   then raise exception 'MK_LINK_INVALID'; end if;
 elsif m is not null or uid is not null or did is not null then raise exception 'MK_LINK_INVALID'; end if;
 perform pg_advisory_xact_lock(1734520,hashtext(rid::text));
 select * into prior from public.mk8_wallet_link_requests where request_id=rid;
 if found then
  if prior.payload is distinct from p_payload then raise exception 'MK_LINK_CONFLICT'; end if;
  return prior.result || jsonb_build_object('replayed',true);
 end if;
 -- Serialize discovery globally: low-volume four-hour jobs; protects overlapping
 -- address/user mappings even when two jobs resolve different connected wallets.
 perform pg_advisory_xact_lock(1734521,0);
 if not exists(select 1 from public.mk8_tracking_players where wallet=w) then raise exception 'MK_LINK_UNREGISTERED'; end if;
 select * into old from public.mk8_wallet_links where wallet=w for update;
 if coalesce(old.revision,0)<>expected then raise exception 'MK_LINK_CONFLICT'; end if;
 if old.status='linked' and (s<>'linked' or old.mcp_wallet is distinct from m or old.doma_user_id is distinct from uid or old.privy_did is distinct from did)
 then raise exception 'MK_LINK_REVIEW_REQUIRED'; end if;
 if old.checked_at>checked then raise exception 'MK_LINK_CONFLICT'; end if;
 if s='linked' and (
  exists(select 1 from public.mk8_tracking_players where wallet=m and wallet<>w)
  or exists(select 1 from public.mk8_wallet_links where wallet<>w and (mcp_wallet in (w,m) or wallet=m or doma_user_id=uid))
 ) then raise exception 'MK_LINK_REVIEW_REQUIRED'; end if;
 insert into public.mk8_wallet_links(wallet,mcp_wallet,doma_user_id,privy_did,status,revision,checked_at)
 values(w,m,uid,did,s,expected+1,checked)
 on conflict(wallet) do update set mcp_wallet=excluded.mcp_wallet,doma_user_id=excluded.doma_user_id,
  privy_did=excluded.privy_did,status=excluded.status,revision=excluded.revision,checked_at=excluded.checked_at,updated_at=now();
 receipt:=jsonb_build_object('ok',true,'wallet',w,'mcpWallet',m,'status',s,'revision',expected+1,'replayed',false);
 insert into public.mk8_wallet_link_requests values(rid,w,p_payload,receipt,now());
 return receipt;
exception when unique_violation then raise exception 'MK_LINK_REVIEW_REQUIRED';
 when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then raise exception 'MK_LINK_INVALID';
end $$;

-- Read existing observed fills only. No new reward or ranking calculation.
-- Absence here does not establish complete coverage of upstream Doma activity.
create or replace function public.mk8_linked_trade_activity(p_wallet text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare addresses jsonb; fills jsonb; link jsonb;
begin
 if p_wallet is null or p_wallet !~ '^0x[0-9a-f]{40}$' then raise exception 'MK_LINK_INVALID'; end if;
 select jsonb_build_object('status',status,'mcpWallet',mcp_wallet,'checkedAt',checked_at,'revision',revision)
 into link from public.mk8_wallet_discovery where wallet=p_wallet;
 select coalesce(jsonb_agg(trade_wallet order by trade_wallet),'[]'::jsonb) into addresses
 from public.mk8_tracking_wallets where player_wallet=p_wallet;
 select coalesce(jsonb_agg(to_jsonb(f) order by f."executedAt" desc,f.id desc),'[]'::jsonb) into fills from (
  select id::text,tx_hash as "txHash",wallet,occurred_at as "executedAt",leg,
   usd_value::text as "usdValue",attribution as "reportedAttribution"
  from public.battle_bots_fills f
  where f.chain_id=97477 and f.role='buyer'
   and lower(f.token_address)='0x68e359b4a6d25448daaff1745059f3e716e22cf8'
   and exists(select 1 from public.mk8_tracking_wallets w where w.player_wallet=p_wallet and w.trade_wallet=f.wallet and f.occurred_at>=w.since)
  order by occurred_at desc,id desc limit 20
 ) f;
 return jsonb_build_object('link',link,'wallets',addresses,'recentObservedTrades',fills,
  'coverage','unverified','rewardsCalculated',false,'domain','gochujang.com');
end $$;

revoke all on public.mk8_wallet_links,public.mk8_wallet_link_requests,public.mk8_tracking_players,public.mk8_wallet_discovery,public.mk8_tracking_wallets from public,anon,authenticated,service_role;
revoke all on function public.mk8_resolve_wallet(jsonb),public.mk8_linked_trade_activity(text) from public,anon,authenticated;
grant select on public.mk8_wallet_discovery,public.mk8_tracking_wallets to service_role;
grant execute on function public.mk8_resolve_wallet(jsonb),public.mk8_linked_trade_activity(text) to service_role;
do $$ begin
 if exists(select 1 from pg_roles where rolname='doma_ai_ro') then
  revoke all on public.mk8_wallet_links,public.mk8_wallet_link_requests from doma_ai_ro;
  revoke all on function public.mk8_resolve_wallet(jsonb),public.mk8_linked_trade_activity(text) from doma_ai_ro;
  grant select on public.mk8_wallet_discovery,public.mk8_tracking_wallets to doma_ai_ro;
 end if;
end $$;
commit;
