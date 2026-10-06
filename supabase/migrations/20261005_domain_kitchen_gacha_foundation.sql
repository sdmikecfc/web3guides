-- Private, multi-game settlement storage. This migration enables NO sales,
-- registers NO production contracts, and schedules NO workers.
create table public.diner_gacha_games (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  domain text not null check (domain in ('gochujang','smoothie','wines')),
  chain_id bigint not null check (chain_id > 0),
  contract text not null check (contract ~ '^0x[0-9a-f]{40}$' and contract <> '0x0000000000000000000000000000000000000000'),
  definition jsonb not null,
  revision bigint not null default 0,
  cursor_block numeric(78,0), cursor_hash text,
  halted boolean not null default true,
  halt_reason text,
  unique (chain_id, contract),
  check (definition->>'id' = id and definition->>'domain' = domain and (definition->>'chainId')::bigint = chain_id and lower(definition->>'contract') = contract)
);
create table public.diner_gacha_rounds (
  game_id text not null references public.diner_gacha_games(id),
  round_id numeric(78,0) not null check (round_id >= 0),
  definition jsonb not null,
  secret_ref text not null, -- Opaque reference to an approved secret store; never the secret.
  starts_at bigint generated always as ((definition->>'startsAt')::bigint) stored not null,
  ends_at bigint generated always as ((definition->>'endsAt')::bigint) stored not null,
  revealed_secret text check (revealed_secret ~ '^[0-9a-f]{64}$'),
  primary key (game_id, round_id),
  check (definition->>'gameId' = game_id and definition->>'id' = round_id::text),
  check (ends_at > starts_at)
);
create index diner_gacha_round_window on public.diner_gacha_rounds(game_id,starts_at,ends_at);
create function public.diner_gacha_round_window() returns trigger language plpgsql set search_path = public as $$
declare previous public.diner_gacha_rounds;
begin
  perform 1 from public.diner_gacha_games where id=new.game_id for update;
  if exists(select 1 from public.diner_gacha_rounds where game_id=new.game_id
    and starts_at < (new.definition->>'endsAt')::bigint and ends_at > (new.definition->>'startsAt')::bigint) then raise exception 'gacha_round_overlap'; end if;
  select * into previous from public.diner_gacha_rounds where game_id=new.game_id order by round_id desc limit 1;
  if found then
    if new.round_id <= previous.round_id or new.definition->>'previousHash' is distinct from previous.definition->>'hash' or (new.definition->>'startsAt')::bigint < previous.ends_at then raise exception 'gacha_round_chain'; end if;
  elsif new.definition->>'previousHash' is distinct from repeat('0',64) then raise exception 'gacha_round_genesis'; end if;
  return new;
end $$;
create trigger diner_gacha_round_window before insert on public.diner_gacha_rounds for each row execute function public.diner_gacha_round_window();
create table public.diner_gacha_pulls (
  game_id text not null references public.diner_gacha_games(id),
  nonce numeric(78,0) not null check (nonce >= 0),
  round_id numeric(78,0),
  status text not null check (status in ('pending','fulfilled','refunded')),
  record jsonb not null,
  primary key (game_id, nonce),
  foreign key (game_id, round_id) references public.diner_gacha_rounds(game_id, round_id),
  check (record->>'gameId' = game_id and record->>'nonce' = nonce::text and record->>'status' = status)
);
create table public.diner_gacha_events (
  game_id text not null references public.diner_gacha_games(id),
  event_key text not null,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  envelope jsonb not null, -- Position/kind only. In particular, no reveal secret.
  created_at timestamptz not null default now(),
  primary key (game_id, event_key)
);
create table public.diner_gacha_openings (
  game_id text not null,
  nonce numeric(78,0) not null,
  season_id text not null,
  pack text not null check (pack in ('regular','super')),
  opener text not null check (opener ~ '^0x[0-9a-f]{40}$'),
  item_id text not null,
  record jsonb not null,
  invalidated boolean not null default false,
  primary key (game_id, nonce),
  foreign key (game_id, nonce) references public.diner_gacha_pulls(game_id, nonce)
);
create index diner_gacha_opening_board on public.diner_gacha_openings(game_id, season_id, pack, opener) where not invalidated;
create table public.diner_gacha_jobs (
  game_id text not null references public.diner_gacha_games(id),
  intent_key text not null,
  nonce numeric(78,0) not null,
  kind text not null check (kind in ('fulfill','refund')),
  status text not null default 'ready' check (status in ('ready','leased','submitted','done','cancelled')),
  lease_token uuid, lease_until timestamptz,
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  transaction_hash text,
  last_error text,
  primary key (game_id,intent_key),
  foreign key (game_id,nonce) references public.diner_gacha_pulls(game_id,nonce)
);
create index diner_gacha_due_jobs on public.diner_gacha_jobs(available_at, lease_until) where status in ('ready','leased','submitted');

-- Games' identities and round snapshots cannot be edited after admission.
create function public.diner_gacha_immutable_definition() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'diner_gacha_games' then
    if new.id <> old.id or new.domain <> old.domain or new.chain_id <> old.chain_id or new.contract <> old.contract or new.definition <> old.definition then
      raise exception 'gacha_game_immutable';
    end if;
  elsif new.game_id <> old.game_id or new.round_id <> old.round_id or new.definition <> old.definition or new.secret_ref <> old.secret_ref or (old.revealed_secret is not null and new.revealed_secret is distinct from old.revealed_secret) then
    raise exception 'gacha_round_immutable';
  end if;
  return new;
end $$;
create trigger diner_gacha_game_immutable before update on public.diner_gacha_games for each row execute function public.diner_gacha_immutable_definition();
create trigger diner_gacha_round_immutable before update on public.diner_gacha_rounds for each row execute function public.diner_gacha_immutable_definition();

-- Event receipt, pull, opening credit and outbox intent are ONE transaction.
-- All money/game decisions are derived by the private worker, never a client RPC.
create function public.diner_gacha_commit_event(p_game text, p_revision bigint, p_key text, p_fingerprint text, p_envelope jsonb, p_effect jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.diner_gacha_games; prior public.diner_gacha_events; old_pull public.diner_gacha_pulls; v jsonb; n numeric; r numeric;
begin
  select * into g from public.diner_gacha_games where id=p_game for update;
  if not found then raise exception 'gacha_game_missing'; end if;
  select * into prior from public.diner_gacha_events where game_id=p_game and event_key=p_key;
  if found then
    if prior.fingerprint <> p_fingerprint then raise exception 'gacha_event_conflict'; end if;
    return jsonb_build_object('replayed',true,'revision',g.revision);
  end if;
  if g.halted then raise exception 'gacha_game_halted'; end if;
  if g.revision <> p_revision then raise exception 'gacha_revision_conflict'; end if;
  if octet_length(p_effect::text) > 65536 or octet_length(p_envelope::text) > 4096 or p_envelope->>'gameId' is distinct from p_game or (p_envelope->>'chainId')::bigint is distinct from g.chain_id or lower(p_envelope->>'contract') is distinct from g.contract then raise exception 'gacha_event_scope'; end if;
  if p_effect ? 'pull' then
    v := p_effect->'pull'; n := (v->>'nonce')::numeric; r := (v->>'roundId')::numeric;
    if v->>'gameId' is distinct from p_game then raise exception 'gacha_pull_scope'; end if;
    if not ((p_envelope->>'kind'='requested' and v->>'status'='pending') or (p_envelope->>'kind'='fulfilled' and v->>'status'='fulfilled') or (p_envelope->>'kind'='refunded' and v->>'status'='refunded') or (p_envelope->>'kind'='burned' and v->>'status'='fulfilled' and v->>'redeemed'='true')) then raise exception 'gacha_effect_kind'; end if;
    select * into old_pull from public.diner_gacha_pulls where game_id=p_game and nonce=n;
    if found then
      if (old_pull.record - 'status' - 'prizeTokenAmount' - 'redeemed') <> (v - 'status' - 'prizeTokenAmount' - 'redeemed') then raise exception 'gacha_draw_immutable'; end if;
      if old_pull.status <> 'pending' and (v->>'status' <> old_pull.status or old_pull.status <> 'fulfilled' or old_pull.record ? 'redeemed' or v->>'redeemed' <> 'true' or v->>'prizeTokenAmount' is distinct from old_pull.record->>'prizeTokenAmount') then raise exception 'gacha_terminal_pull'; end if;
      update public.diner_gacha_pulls set status=v->>'status',record=v where game_id=p_game and nonce=n;
    else
      if v->>'status' is distinct from 'pending' then raise exception 'gacha_missing_request'; end if;
      insert into public.diner_gacha_pulls values(p_game,n,r,v->>'status',v);
    end if;
  end if;
  if p_effect ? 'opening' then
    v := p_effect->'opening';
    if n is null or p_envelope->>'kind' is distinct from 'fulfilled' or v->>'tokenId' is distinct from n::text or v->>'domain' is distinct from g.domain or v->>'source' is distinct from 'chain' or v->>'settlement' is distinct from 'finalized' or lower(v->>'contractAddress') is distinct from g.contract or v->>'seasonId' is distinct from p_effect->'pull'->>'seasonId' or (p_effect->'pull'->>'status') is distinct from 'fulfilled' or v->>'itemId' is distinct from p_effect->'pull'->>'itemId' or v->>'pack' is distinct from p_effect->'pull'->>'pack' or lower(v->>'opener') is distinct from lower(p_effect->'pull'->>'player') or v->>'openedAt' is distinct from p_effect->'pull'->'request'->>'timestamp' or v->>'catalogueVersion' is distinct from p_effect->'pull'->>'catalogueVersion' then raise exception 'gacha_opening_scope'; end if;
    insert into public.diner_gacha_openings(game_id,nonce,season_id,pack,opener,item_id,record)
    values(p_game,n,v->>'seasonId',v->>'pack',lower(v->>'opener'),v->>'itemId',v);
  end if;
  if p_effect ? 'cancelJobsForNonce' then
    if p_effect->>'cancelJobsForNonce' is distinct from n::text or p_effect->'pull'->>'status' not in ('fulfilled','refunded') then raise exception 'gacha_cancel_scope'; end if;
    update public.diner_gacha_jobs set status='done',lease_token=null,lease_until=null where game_id=p_game and nonce=(p_effect->>'cancelJobsForNonce')::numeric and status not in ('done','cancelled');
  end if;
  if p_effect ? 'job' then
    v := p_effect->'job';
    if v->>'gameId' is distinct from p_game or v->>'nonce' is distinct from n::text or p_envelope->>'kind' is distinct from 'requested' or v->>'kind' is distinct from (case when p_effect->'pull' ? 'refusal' then 'refund' else 'fulfill' end) then raise exception 'gacha_job_scope'; end if;
    insert into public.diner_gacha_jobs(game_id,intent_key,nonce,kind) values(p_game,v->>'key',n,v->>'kind');
  end if;
  if p_effect ? 'reveal' then
    -- The worker verifies the secret hash and canonical contract event. A second
    -- time gate here prevents exposing live secrets even if a caller is mistaken.
    v := p_effect->'reveal';
    if p_envelope->>'kind' is distinct from 'revealed' then raise exception 'gacha_reveal_kind'; end if;
    update public.diner_gacha_rounds set revealed_secret=v->>'secret'
      where game_id=p_game and round_id=(v->>'roundId')::numeric
      and (definition->>'endsAt')::bigint <= (p_envelope->>'timestamp')::bigint
      and (definition->>'endsAt')::bigint <= extract(epoch from clock_timestamp())*1000
      and encode(sha256(decode(v->>'secret','hex')),'hex')=definition->>'secretHash';
    if not found then raise exception 'gacha_reveal_not_ended'; end if;
  end if;
  insert into public.diner_gacha_events(game_id,event_key,fingerprint,envelope) values(p_game,p_key,p_fingerprint,p_envelope);
  update public.diner_gacha_games set revision=revision+1 where id=p_game;
  return jsonb_build_object('replayed',false,'revision',g.revision+1);
end $$;

create function public.diner_gacha_lease_job(p_game text) returns jsonb language plpgsql security definer set search_path = public as $$
declare j public.diner_gacha_jobs;
begin
  if not exists(select 1 from public.diner_gacha_games where id=p_game and not halted) then return null; end if;
  select * into j from public.diner_gacha_jobs where game_id=p_game
    and status in ('ready','leased','submitted') and available_at <= now() and (lease_until is null or lease_until < now())
    order by available_at,intent_key for update skip locked limit 1;
  if not found then return null; end if;
  update public.diner_gacha_jobs set status='leased',lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds',attempts=attempts+1
    where game_id=j.game_id and intent_key=j.intent_key returning * into j;
  -- Nonces are text at the API boundary; JS numbers cannot represent uint256.
  return to_jsonb(j) || jsonb_build_object('nonce',j.nonce::text);
end $$;
create function public.diner_gacha_finish_job(p_game text,p_key text,p_lease uuid,p_status text,p_tx text,p_error text,p_delay integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('ready','submitted','cancelled') or p_delay < 1 or p_delay > 3600 or length(coalesce(p_error,'')) > 240 or (p_tx is not null and p_tx !~ '^0x[0-9a-f]{64}$') then raise exception 'gacha_job_result_invalid'; end if;
  update public.diner_gacha_jobs set status=p_status,transaction_hash=coalesce(p_tx,transaction_hash),last_error=p_error,
    lease_token=null,lease_until=null,available_at=now()+make_interval(secs=>p_delay)
    where game_id=p_game and intent_key=p_key and lease_token=p_lease and lease_until>now() and status='leased';
  return found;
end $$;
create function public.diner_gacha_advance_cursor(p_game text,p_revision bigint,p_block text,p_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_block !~ '^(0|[1-9][0-9]{0,77})$' or p_hash !~ '^0x[0-9a-f]{64}$' then raise exception 'gacha_cursor_invalid'; end if;
  update public.diner_gacha_games set cursor_block=p_block::numeric,cursor_hash=p_hash,revision=revision+1
    where id=p_game and revision=p_revision and not halted and (cursor_block is null or p_block::numeric=cursor_block+1);
  return found;
end $$;

-- Redemption/transfer never deletes opening history. Deep-finality conflicts
-- halt the worker and require reviewed recovery; no silent redraw or leaderboard repair.
create view public.diner_gacha_leaderboards with (security_invoker=true) as
  select game_id,season_id,pack,opener,count(*) as openings,
    rank() over(partition by game_id,season_id,pack order by count(*) desc) as rank
  from public.diner_gacha_openings where not invalidated group by game_id,season_id,pack,opener;
create view public.diner_gacha_discoveries with (security_invoker=true) as
  select game_id,opener,item_id,min((record->>'openedAt')::bigint) as first_opened_at
  from public.diner_gacha_openings where not invalidated group by game_id,opener,item_id;

do $$ declare t text; f record; begin
  foreach t in array array['diner_gacha_games','diner_gacha_rounds','diner_gacha_pulls','diner_gacha_events','diner_gacha_openings','diner_gacha_jobs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select,insert,update on public.%I to service_role',t);
  end loop;
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'diner_gacha_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
revoke all on public.diner_gacha_leaderboards,public.diner_gacha_discoveries from public,anon,authenticated;
grant select on public.diner_gacha_leaderboards,public.diner_gacha_discoveries to service_role;
