-- REVIEW ONLY. No database was modified when this migration was authored.
-- Requires the diner preview schema and Supabase Ethereum Web3 auth to be enabled.
-- Configure DINER_PREVIEW_APP_URL and optional DINER_WALLET_ORIGINS on the server.
-- Configure the matching site/redirect origins in the Supabase auth project.
-- Localhost origins are accepted by application code only in development.
-- Issuance requires VERCEL=1 with its platform-owned x-vercel-forwarded-for,
-- or one shared local-development bucket. Set DINER_WALLET_RATE_SECRET to a
-- deployment secret of at least 32 characters (service-role key is fallback).
-- Requester addresses are HMAC-hashed; neither raw IPs nor wallet-selected rate
-- keys are persisted. These are resource caps, not unique-person verification.
-- No balance, inventory, legacy account, token, or payment migration is performed.
begin;

create table if not exists public.diner_preview_wallet_challenges (
  nonce text primary key check (nonce ~ '^[0-9a-f]{32}$'),
  wallet text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  chain_id bigint not null check (chain_id between 1 and 2147483647),
  origin text not null check (length(origin) between 1 and 512),
  message text not null check (length(message) between 1 and 2048),
  issued_at_ms bigint not null,
  expires_at_ms bigint not null check (expires_at_ms = issued_at_ms + 300000),
  consumed_at timestamptz,
  registered_session_id uuid
);
create index if not exists diner_preview_wallet_challenges_wallet_expiry
  on public.diner_preview_wallet_challenges(wallet, expires_at_ms);
create index if not exists diner_preview_wallet_challenges_expiry
  on public.diner_preview_wallet_challenges(expires_at_ms);

create table if not exists public.diner_preview_wallet_limits (
  bucket text primary key check (bucket = 'global' or bucket ~ '^(requester|origin):[0-9a-f]{64}$'),
  window_started_at_ms bigint not null,
  last_issued_at_ms bigint not null,
  issued_count integer not null check (issued_count between 0 and 300)
);
create index if not exists diner_preview_wallet_limits_age on public.diner_preview_wallet_limits(last_issued_at_ms);

create table if not exists public.diner_preview_wallet_sessions (
  session_id uuid primary key,
  player_id uuid not null references auth.users(id) on delete cascade,
  wallet text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  challenge_nonce text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists diner_preview_wallet_sessions_player on public.diner_preview_wallet_sessions(player_id);
alter table public.diner_preview_wallet_challenges enable row level security;
alter table public.diner_preview_wallet_limits enable row level security;
alter table public.diner_preview_wallet_sessions enable row level security;
revoke all on public.diner_preview_wallet_challenges, public.diner_preview_wallet_limits, public.diner_preview_wallet_sessions from public, anon, authenticated, service_role;
grant select on public.diner_preview_wallet_challenges, public.diner_preview_wallet_sessions to service_role;

create or replace function public.diner_preview_wallet_issue(
  p_nonce text, p_wallet text, p_chain_id bigint, p_origin text,
  p_message text, p_issued_at_ms bigint, p_expires_at_ms bigint,
  p_requester_hash text, p_origin_hash text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  wall_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  global_rate public.diner_preview_wallet_limits%rowtype;
  origin_rate public.diner_preview_wallet_limits%rowtype;
  requester_rate public.diner_preview_wallet_limits%rowtype;
  origin_key text := 'origin:' || p_origin_hash;
  requester_key text := 'requester:' || p_requester_hash;
begin
  if p_nonce is null or p_nonce !~ '^[0-9a-f]{32}$'
    or p_wallet is null or p_wallet !~ '^0x[0-9a-f]{40}$'
    or p_chain_id is null or p_chain_id not between 1 and 2147483647
    or p_origin is null or length(p_origin) not between 1 and 512
    or p_message is null or length(p_message) not between 1 and 2048
    or p_issued_at_ms is null or p_issued_at_ms not between wall_ms - 30000 and wall_ms + 5000
    or p_expires_at_ms is null or p_expires_at_ms <> p_issued_at_ms + 300000
    or p_requester_hash is null or p_requester_hash !~ '^[0-9a-f]{64}$'
    or p_origin_hash is null or p_origin_hash !~ '^[0-9a-f]{64}$'
  then return jsonb_build_object('ok', false, 'code', 'wallet_challenge_invalid'); end if;

  -- Lock the one global row BEFORE allocating origin/requester rows. Rejected
  -- fresh wallets or arbitrary requester addresses cannot create unbounded rows.
  insert into public.diner_preview_wallet_limits(bucket, window_started_at_ms, last_issued_at_ms, issued_count)
    values('global', wall_ms, wall_ms - 10000, 0) on conflict do nothing;
  select * into global_rate from public.diner_preview_wallet_limits where bucket = 'global' for update;

  -- Cleanup is bounded per call, including capped requests. A consumed proof can
  -- still register for five minutes; removing expired receipts keeps sessions.
  delete from public.diner_preview_wallet_challenges where nonce in (
    select nonce from public.diner_preview_wallet_challenges where expires_at_ms < wall_ms - 300000
      order by expires_at_ms limit 128
  );
  delete from public.diner_preview_wallet_limits where bucket in (
    select bucket from public.diner_preview_wallet_limits where bucket <> 'global' and last_issued_at_ms < wall_ms - 600000
      order by last_issued_at_ms limit 128
  );
  if global_rate.window_started_at_ms + 300000 <= wall_ms then
    global_rate.window_started_at_ms := wall_ms; global_rate.issued_count := 0;
  end if;
  if global_rate.issued_count >= 300 then
    return jsonb_build_object('ok', false, 'code', 'wallet_rate_limited', 'retryAfterMs', global_rate.window_started_at_ms + 300000 - wall_ms);
  end if;
  if (select count(*) from public.diner_preview_wallet_challenges) >= 2048
    or (select count(*) from public.diner_preview_wallet_limits) > 2045 then
    return jsonb_build_object('ok', false, 'code', 'wallet_rate_limited', 'retryAfterMs', 10000);
  end if;

  insert into public.diner_preview_wallet_limits(bucket, window_started_at_ms, last_issued_at_ms, issued_count)
    values(origin_key, wall_ms, wall_ms - 10000, 0) on conflict do nothing;
  select * into origin_rate from public.diner_preview_wallet_limits where bucket = origin_key;
  if origin_rate.window_started_at_ms + 300000 <= wall_ms then
    origin_rate.window_started_at_ms := wall_ms; origin_rate.issued_count := 0;
  end if;
  if origin_rate.issued_count >= 120 then
    return jsonb_build_object('ok', false, 'code', 'wallet_rate_limited', 'retryAfterMs', origin_rate.window_started_at_ms + 300000 - wall_ms);
  end if;
  insert into public.diner_preview_wallet_limits(bucket, window_started_at_ms, last_issued_at_ms, issued_count)
    values(requester_key, wall_ms, wall_ms - 10000, 0) on conflict do nothing;
  select * into requester_rate from public.diner_preview_wallet_limits where bucket = requester_key;
  if requester_rate.window_started_at_ms + 300000 <= wall_ms then
    requester_rate.window_started_at_ms := wall_ms; requester_rate.issued_count := 0;
  end if;
  if requester_rate.last_issued_at_ms + 10000 > wall_ms then
    return jsonb_build_object('ok', false, 'code', 'wallet_rate_limited', 'retryAfterMs', requester_rate.last_issued_at_ms + 10000 - wall_ms);
  end if;
  if requester_rate.issued_count >= 6 then
    return jsonb_build_object('ok', false, 'code', 'wallet_rate_limited', 'retryAfterMs', requester_rate.window_started_at_ms + 300000 - wall_ms);
  end if;
  insert into public.diner_preview_wallet_challenges(nonce, wallet, chain_id, origin, message, issued_at_ms, expires_at_ms)
    values(p_nonce, p_wallet, p_chain_id, p_origin, p_message, p_issued_at_ms, p_expires_at_ms);
  update public.diner_preview_wallet_limits set window_started_at_ms = global_rate.window_started_at_ms,
    last_issued_at_ms = wall_ms, issued_count = global_rate.issued_count + 1 where bucket = 'global';
  update public.diner_preview_wallet_limits set window_started_at_ms = origin_rate.window_started_at_ms,
    last_issued_at_ms = wall_ms, issued_count = origin_rate.issued_count + 1 where bucket = origin_key;
  update public.diner_preview_wallet_limits set window_started_at_ms = requester_rate.window_started_at_ms,
    last_issued_at_ms = wall_ms, issued_count = requester_rate.issued_count + 1 where bucket = requester_key;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.diner_preview_wallet_burn(p_nonce text, p_wallet text, p_origin text, p_message text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare used_nonce text; wall_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  -- One conditional UPDATE is the replay barrier. Only the first request can
  -- receive ok, even when several requests verified the signature concurrently.
  update public.diner_preview_wallet_challenges set consumed_at = clock_timestamp()
    where nonce = p_nonce and wallet = p_wallet and origin = p_origin and message = p_message
      and consumed_at is null and issued_at_ms <= wall_ms and expires_at_ms > wall_ms
    returning nonce into used_nonce;
  return jsonb_build_object('ok', used_nonce is not null);
end $$;

create or replace function public.diner_preview_wallet_register(p_session uuid, p_player uuid, p_nonce text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare challenge public.diner_preview_wallet_challenges%rowtype; registered public.diner_preview_wallet_sessions%rowtype;
begin
  select * into challenge from public.diner_preview_wallet_challenges where nonce = p_nonce for update;
  if not found or challenge.consumed_at is null or challenge.consumed_at < clock_timestamp() - interval '5 minutes'
    or p_session is null or p_player is null
  then return jsonb_build_object('ok', false, 'code', 'wallet_challenge_invalid'); end if;
  if challenge.registered_session_id is not null then
    select * into registered from public.diner_preview_wallet_sessions
      where session_id = p_session and player_id = p_player and challenge_nonce = p_nonce and revoked_at is null;
    if found and challenge.registered_session_id = p_session then
      return jsonb_build_object('ok', true, 'wallet', registered.wallet);
    end if;
    return jsonb_build_object('ok', false, 'code', 'wallet_challenge_used');
  end if;
  -- Called only after auth.getUser(access_token), never with client-supplied
  -- player/session IDs. Refresh keeps this verified JWT session_id.
  insert into public.diner_preview_wallet_sessions(session_id, player_id, wallet, challenge_nonce)
    values(p_session, p_player, challenge.wallet, p_nonce) on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'code', 'wallet_session_conflict'); end if;
  update public.diner_preview_wallet_challenges set registered_session_id = p_session where nonce = p_nonce;
  return jsonb_build_object('ok', true, 'wallet', challenge.wallet);
end $$;

create or replace function public.diner_preview_wallet_revoke(p_session uuid, p_player uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare revoked uuid;
begin
  update public.diner_preview_wallet_sessions set revoked_at = coalesce(revoked_at, clock_timestamp())
    where session_id = p_session and player_id = p_player returning session_id into revoked;
  return jsonb_build_object('ok', revoked is not null);
end $$;

revoke all on function public.diner_preview_wallet_issue(text,text,bigint,text,text,bigint,bigint,text,text) from public, anon, authenticated, service_role;
revoke all on function public.diner_preview_wallet_burn(text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.diner_preview_wallet_register(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.diner_preview_wallet_revoke(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.diner_preview_wallet_issue(text,text,bigint,text,text,bigint,bigint,text,text) to service_role;
grant execute on function public.diner_preview_wallet_burn(text,text,text,text) to service_role;
grant execute on function public.diner_preview_wallet_register(uuid,uuid,text) to service_role;
grant execute on function public.diner_preview_wallet_revoke(uuid,uuid) to service_role;
commit;
