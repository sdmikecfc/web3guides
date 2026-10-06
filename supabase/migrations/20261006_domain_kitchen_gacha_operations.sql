-- Follows the 20261005 foundation. Private operational state only; no scheduler,
-- contract, wallet or sale is enabled by applying this migration.
alter table public.diner_gacha_games add column cursor_timestamp bigint;
create table public.diner_gacha_round_intents (
  game_id text not null references public.diner_gacha_games(id),
  intent_key text not null, round_id numeric(78,0) not null,
  previous_hash text not null, template jsonb not null,
  status text not null default 'reserved' check(status in ('reserved','committed','expired')),
  secret_ref text, secret_hash text,
  primary key(game_id,intent_key)
);
create unique index diner_gacha_one_round_reservation on public.diner_gacha_round_intents(game_id) where status='reserved';
create unique index diner_gacha_operational_secret_once on public.diner_gacha_round_intents(secret_hash) where status='committed';
create function public.diner_gacha_pending_round(p_game text) returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object('key',intent_key,'id',round_id::text,'previousHash',previous_hash,'template',template,'state',status)
  from public.diner_gacha_round_intents where game_id=p_game and status='reserved';
$$;
create table public.diner_gacha_reveal_jobs (
  game_id text not null, round_id numeric(78,0) not null,
  status text not null default 'ready' check(status in ('ready','leased','submitted','done')),
  lease_token uuid, lease_until timestamptz, available_at timestamptz not null default now(),
  attempts integer not null default 0, transaction_hash text, last_error text,
  primary key(game_id,round_id),
  foreign key(game_id,round_id) references public.diner_gacha_rounds(game_id,round_id)
);
create table public.diner_gacha_recoveries (
  game_id text not null, nonce numeric(78,0) not null,
  fulfillment_key text not null, custody_reference text not null,
  checked_head numeric(78,0) not null, refund_timeout numeric(78,0) not null,
  created_at timestamptz not null default now(),
  primary key(game_id,nonce),
  foreign key(game_id,nonce) references public.diner_gacha_pulls(game_id,nonce)
);

-- Old callers cannot move the checkpoint without supplying its canonical timestamp.
create or replace function public.diner_gacha_advance_cursor(p_game text,p_revision bigint,p_block text,p_hash text)
returns boolean language plpgsql security definer set search_path=public as $$
begin raise exception 'gacha_cursor_timestamp_required'; end $$;
create function public.diner_gacha_advance_cursor(p_game text,p_revision bigint,p_block text,p_hash text,p_timestamp bigint)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if p_block !~ '^(0|[1-9][0-9]{0,77})$' or p_hash !~ '^0x[0-9a-f]{64}$' or p_timestamp is null or p_timestamp<0 or p_timestamp>9007199254740991 then raise exception 'gacha_cursor_invalid'; end if;
  update public.diner_gacha_games set cursor_block=p_block::numeric,cursor_hash=p_hash,cursor_timestamp=p_timestamp,revision=revision+1
    where id=p_game and revision=p_revision and not halted and (cursor_block is null or p_block::numeric=cursor_block+1) and (cursor_timestamp is null or p_timestamp>=cursor_timestamp);
  return found;
end $$;

create function public.diner_gacha_reserve_round(p_game text,p_template jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare g public.diner_gacha_games; prior public.diner_gacha_round_intents; previous public.diner_gacha_rounds;
  k text; start_ms bigint; end_ms bigint; rid numeric; prev text;
begin
  select * into g from public.diner_gacha_games where id=p_game for update;
  if not found or g.halted then raise exception 'gacha_game_unavailable'; end if;
  start_ms:=(p_template->>'startsAt')::bigint; end_ms:=(p_template->>'endsAt')::bigint; k:=start_ms::text;
  if p_template->>'gameId' is distinct from p_game or start_ms is null or end_ms is null or end_ms<=start_ms or octet_length(p_template::text)>32768 then raise exception 'gacha_round_template'; end if;
  select * into prior from public.diner_gacha_round_intents where game_id=p_game and intent_key=k;
  if found then
    if prior.template<>p_template then raise exception 'gacha_round_intent_conflict'; end if;
    return jsonb_build_object('key',prior.intent_key,'id',prior.round_id::text,'previousHash',prior.previous_hash,'template',prior.template,'state',prior.status);
  end if;
  if start_ms<=extract(epoch from clock_timestamp())*1000 then raise exception 'gacha_round_must_be_future'; end if;
  update public.diner_gacha_round_intents set status='expired' where game_id=p_game and status='reserved' and (template->>'startsAt')::bigint<=extract(epoch from clock_timestamp())*1000;
  if exists(select 1 from public.diner_gacha_round_intents where game_id=p_game and status='reserved') then raise exception 'gacha_round_reservation_busy'; end if;
  select * into previous from public.diner_gacha_rounds where game_id=p_game order by round_id desc limit 1;
  if found then
    if start_ms<previous.ends_at then raise exception 'gacha_round_overlap'; end if;
    rid:=previous.round_id+1; prev:=previous.definition->>'hash';
  else rid:=1; prev:=repeat('0',64); end if;
  insert into public.diner_gacha_round_intents(game_id,intent_key,round_id,previous_hash,template) values(p_game,k,rid,prev,p_template);
  return jsonb_build_object('key',k,'id',rid::text,'previousHash',prev,'template',p_template,'state','reserved');
end $$;
create function public.diner_gacha_commit_round(p_game text,p_key text,p_reference text,p_secret_hash text)
returns text language plpgsql security definer set search_path=public as $$
declare intent public.diner_gacha_round_intents; d jsonb; rh text;
begin
  perform 1 from public.diner_gacha_games where id=p_game and not halted for update;
  if not found then raise exception 'gacha_game_unavailable'; end if;
  select * into intent from public.diner_gacha_round_intents where game_id=p_game and intent_key=p_key for update;
  if not found then raise exception 'gacha_round_intent_missing'; end if;
  if p_reference is null or length(p_reference) not between 1 and 256 or p_reference ~* '^(0x)?[a-f0-9]{64}$' or p_secret_hash is null or p_secret_hash !~ '^[a-f0-9]{64}$' then raise exception 'gacha_secret_reference_invalid'; end if;
  if p_secret_hash=encode(sha256(decode(repeat('0',64),'hex')),'hex') then raise exception 'gacha_zero_secret'; end if;
  if intent.status='committed' then
    if intent.secret_ref is distinct from p_reference or intent.secret_hash is distinct from p_secret_hash then raise exception 'gacha_round_secret_conflict'; end if;
    return 'committed';
  end if;
  if intent.status='expired' or (intent.template->>'startsAt')::bigint<=extract(epoch from clock_timestamp())*1000 then
    update public.diner_gacha_round_intents set status='expired',secret_ref=p_reference,secret_hash=p_secret_hash where game_id=p_game and intent_key=p_key;
    return 'expired';
  end if;
  -- Secrets must not be reused across games or rounds, even though the legacy
  -- message itself intentionally has no additional game prefix.
  if exists(select 1 from public.diner_gacha_rounds where definition->>'secretHash'=p_secret_hash) then raise exception 'gacha_secret_reused'; end if;
  rh:=encode(sha256(convert_to(intent.previous_hash||':'||intent.round_id::text||':'||p_secret_hash||':'||(intent.template->>'configHash'),'UTF8')),'hex');
  d:=intent.template||jsonb_build_object('id',intent.round_id::text,'previousHash',intent.previous_hash,'secretHash',p_secret_hash,'hash',rh);
  insert into public.diner_gacha_rounds(game_id,round_id,definition,secret_ref) values(p_game,intent.round_id,d,p_reference);
  update public.diner_gacha_round_intents set status='committed',secret_ref=p_reference,secret_hash=p_secret_hash where game_id=p_game and intent_key=p_key;
  return 'committed';
end $$;

create function public.diner_gacha_can_reveal(p_game text,p_round numeric)
returns boolean language sql security definer set search_path=public as $$
  select exists(select 1 from public.diner_gacha_rounds r join public.diner_gacha_games g on g.id=r.game_id
    where r.game_id=p_game and r.round_id=p_round and not g.halted and r.revealed_secret is null
    and r.ends_at<=extract(epoch from clock_timestamp())*1000 and g.cursor_timestamp>=r.ends_at
    and not exists(select 1 from public.diner_gacha_pulls p where p.game_id=p_game and p.status='pending'
      and ((p.record->'request'->>'timestamp')::bigint>=r.starts_at and (p.record->'request'->>'timestamp')::bigint<r.ends_at))
    and not exists(select 1 from public.diner_gacha_jobs j join public.diner_gacha_pulls p using(game_id,nonce)
      where j.game_id=p_game and j.status not in ('done','cancelled')
      and (p.record->'request'->>'timestamp')::bigint>=r.starts_at and (p.record->'request'->>'timestamp')::bigint<r.ends_at));
$$;
create function public.diner_gacha_prepare_reveal(p_game text,p_round text,p_revision bigint,p_block text,p_hash text,p_timestamp bigint)
returns boolean language plpgsql security definer set search_path=public as $$
declare g public.diner_gacha_games;
begin
  select * into g from public.diner_gacha_games where id=p_game for update;
  if not found or g.halted or g.revision<>p_revision or g.cursor_block is distinct from p_block::numeric or g.cursor_hash is distinct from p_hash or g.cursor_timestamp is distinct from p_timestamp then return false; end if;
  if not public.diner_gacha_can_reveal(p_game,p_round::numeric) then return false; end if;
  insert into public.diner_gacha_reveal_jobs(game_id,round_id) values(p_game,p_round::numeric) on conflict do nothing;
  return found;
end $$;
create function public.diner_gacha_lease_reveal(p_game text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.diner_gacha_reveal_jobs;
begin
  perform 1 from public.diner_gacha_games where id=p_game and not halted for update;
  if not found then return null; end if;
  select * into j from public.diner_gacha_reveal_jobs where game_id=p_game and status in ('ready','leased','submitted')
    and available_at<=now() and (lease_until is null or lease_until<now()) and public.diner_gacha_can_reveal(game_id,round_id)
    order by round_id for update skip locked limit 1;
  if not found then return null; end if;
  update public.diner_gacha_reveal_jobs set status='leased',lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds',attempts=attempts+1
    where game_id=p_game and round_id=j.round_id returning * into j;
  return to_jsonb(j)||jsonb_build_object('round_id',j.round_id::text);
end $$;
create function public.diner_gacha_finish_reveal(p_game text,p_round text,p_lease uuid,p_tx text,p_error text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if (p_tx is not null and p_tx !~ '^0x[0-9a-f]{64}$') or length(coalesce(p_error,''))>240 then raise exception 'gacha_reveal_result_invalid'; end if;
  update public.diner_gacha_reveal_jobs set status=case when p_tx is null then 'ready' else 'submitted' end,
    transaction_hash=coalesce(p_tx,transaction_hash),last_error=p_error,lease_token=null,lease_until=null,available_at=now()+interval '30 seconds'
    where game_id=p_game and round_id=p_round::numeric and status='leased' and lease_token=p_lease and lease_until>now();
  return found;
end $$;
create function public.diner_gacha_reveal_ingested() returns trigger language plpgsql set search_path=public as $$
begin
  if new.revealed_secret is not null then
    update public.diner_gacha_reveal_jobs set status='done',lease_token=null,lease_until=null where game_id=new.game_id and round_id=new.round_id;
  end if;
  return new;
end $$;
create trigger diner_gacha_reveal_ingested after update of revealed_secret on public.diner_gacha_rounds for each row execute function public.diner_gacha_reveal_ingested();

create function public.diner_gacha_lease_recovery(p_game text,p_head text,p_timeout text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.diner_gacha_jobs;
begin
  if p_head !~ '^(0|[1-9][0-9]{0,77})$' or p_timeout !~ '^(0|[1-9][0-9]{0,77})$' then raise exception 'gacha_recovery_bounds'; end if;
  perform 1 from public.diner_gacha_games where id=p_game and not halted for update;
  if not found then return null; end if;
  select j0.* into j from public.diner_gacha_jobs j0 join public.diner_gacha_pulls p using(game_id,nonce)
    where j0.game_id=p_game and j0.kind='fulfill' and j0.status in ('ready','leased','submitted') and p.status='pending'
      and j0.available_at<=now() and (j0.lease_until is null or j0.lease_until<now())
      and p_head::numeric-(p.record->'request'->>'blockNumber')::numeric>p_timeout::numeric
    order by j0.available_at,j0.intent_key for update of j0 skip locked limit 1;
  if not found then return null; end if;
  update public.diner_gacha_jobs set status='leased',lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds',attempts=attempts+1
    where game_id=p_game and intent_key=j.intent_key returning * into j;
  return to_jsonb(j)||jsonb_build_object('nonce',j.nonce::text);
end $$;
create function public.diner_gacha_switch_refund(p_game text,p_key text,p_lease uuid,p_reference text,p_head text,p_timeout text)
returns boolean language plpgsql security definer set search_path=public as $$
declare j public.diner_gacha_jobs; p public.diner_gacha_pulls;
begin
  if p_reference is null or p_reference !~ '^[a-zA-Z0-9:_-]{1,160}$' or p_head !~ '^(0|[1-9][0-9]{0,77})$' or p_timeout !~ '^(0|[1-9][0-9]{0,77})$' then raise exception 'gacha_recovery_proof'; end if;
  perform 1 from public.diner_gacha_games where id=p_game and not halted for update;
  if not found then return false; end if;
  select * into j from public.diner_gacha_jobs where game_id=p_game and intent_key=p_key and kind='fulfill' and status='leased' and lease_token=p_lease and lease_until>now() for update;
  if not found then return false; end if;
  select * into p from public.diner_gacha_pulls where game_id=p_game and nonce=j.nonce and status='pending' for update;
  if not found or p_head::numeric-(p.record->'request'->>'blockNumber')::numeric<=p_timeout::numeric then return false; end if;
  insert into public.diner_gacha_recoveries(game_id,nonce,fulfillment_key,custody_reference,checked_head,refund_timeout) values(p_game,j.nonce,p_key,p_reference,p_head::numeric,p_timeout::numeric);
  update public.diner_gacha_jobs set status='cancelled',lease_token=null,lease_until=null,last_error='retired_before_refund' where game_id=p_game and intent_key=p_key;
  insert into public.diner_gacha_jobs(game_id,intent_key,nonce,kind) values(p_game,'refund:'||j.nonce::text,j.nonce,'refund');
  return true;
end $$;

do $$ declare t text; f record; begin
  foreach t in array array['diner_gacha_round_intents','diner_gacha_reveal_jobs','diner_gacha_recoveries'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update on public.%I to service_role',t);
  end loop;
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'diner_gacha_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
