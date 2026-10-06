-- Private custody support. No keys, contracts, worker schedules or sales enabled.
-- Vault must already be installed by the Supabase project owner. No plaintext fallback.
create table public.diner_gacha_secret_refs (
  operation_key text primary key,
  game_id text not null, intent_key text not null,
  vault_id uuid not null unique, secret_hash text not null check(secret_hash ~ '^[0-9a-f]{64}$'),
  unique(game_id,intent_key),
  foreign key(game_id,intent_key) references public.diner_gacha_round_intents(game_id,intent_key)
);
create function public.diner_gacha_secret_create(p_key text,p_candidate text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.diner_gacha_round_intents; r public.diner_gacha_secret_refs; v uuid; h text;
begin
  if p_key is null or length(p_key)>240 or p_candidate is null or p_candidate !~ '^[0-9a-f]{64}$' or p_candidate=repeat('0',64) then raise exception 'gacha_secret_input'; end if;
  select ri.* into i from public.diner_gacha_round_intents ri join public.diner_gacha_games g on g.id=ri.game_id
    where 'domain-kitchen:'||g.chain_id::text||':'||g.contract||':round:'||ri.intent_key=p_key and not g.halted for update of ri;
  if not found then raise exception 'gacha_secret_reservation_missing'; end if;
  select * into r from public.diner_gacha_secret_refs where operation_key=p_key;
  if found then return jsonb_build_object('reference','dk-vault:'||r.vault_id::text,'hash',r.secret_hash); end if;
  if i.status<>'reserved' or (i.template->>'startsAt')::bigint<=extract(epoch from clock_timestamp())*1000 then raise exception 'gacha_secret_reservation_expired'; end if;
  if to_regprocedure('vault.create_secret(text,text,text,uuid)') is null and to_regprocedure('vault.create_secret(text,text,text)') is null then raise exception 'gacha_vault_unavailable'; end if;
  h:=encode(sha256(decode(p_candidate,'hex')),'hex');
  -- Vault creation and our reference are one database transaction. A lost HTTP
  -- response therefore cannot orphan a second secret on retry.
  select vault.create_secret(p_candidate,'dk-gacha-round-'||encode(sha256(convert_to(p_key,'UTF8')),'hex'),'Domain Kitchen round secret') into v;
  insert into public.diner_gacha_secret_refs values(p_key,i.game_id,i.intent_key,v,h);
  return jsonb_build_object('reference','dk-vault:'||v::text,'hash',h);
end $$;
create function public.diner_gacha_secret_read(p_reference text)
returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.diner_gacha_secret_refs; s text;
begin
  if p_reference is null or p_reference !~ '^dk-vault:[0-9a-f-]{36}$' then raise exception 'gacha_secret_reference'; end if;
  select sr.* into r from public.diner_gacha_secret_refs sr
    join public.diner_gacha_rounds ro on ro.game_id=sr.game_id and ro.secret_ref=p_reference and ro.definition->>'secretHash'=sr.secret_hash
    where sr.vault_id::text=substring(p_reference from 10);
  if not found then raise exception 'gacha_secret_not_committed'; end if;
  select decrypted_secret into s from vault.decrypted_secrets where id=r.vault_id;
  if s is null or s !~ '^[0-9a-f]{64}$' or encode(sha256(decode(s,'hex')),'hex')<>r.secret_hash then raise exception 'gacha_secret_integrity'; end if;
  return s;
end $$;

-- A dedicated signer address must use this nonce journal exclusively on its chain.
create table public.diner_gacha_signer_lanes (
  chain_id bigint not null check(chain_id>0), signer text not null check(signer ~ '^0x[0-9a-f]{40}$'),
  next_nonce bigint not null check(next_nonce between 0 and 9007199254740991),
  primary key(chain_id,signer)
);
create table public.diner_gacha_transactions (
  operation_key text primary key check(length(operation_key) between 1 and 240),
  chain_id bigint not null, signer text not null, game_id text references public.diner_gacha_games(id),
  call jsonb, nonce bigint check(nonce between 0 and 9007199254740991), unsigned_tx jsonb,
  raw_tx text, transaction_hash text check(transaction_hash ~ '^0x[0-9a-f]{64}$'),
  status text not null check(status in ('reserved','signed','confirmed','reverted','retired')),
  lease_token uuid, lease_until timestamptz,
  final_block text, final_block_hash text,
  unique(chain_id,signer,nonce),
  check(raw_tx is null or (raw_tx ~ '^0x[0-9a-f]+$' and length(raw_tx)<=32768)),
  check((status='retired') or (game_id is not null and call is not null and nonce is not null)),
  check((status not in ('signed','confirmed','reverted')) or (raw_tx is not null and transaction_hash is not null and unsigned_tx is not null))
);
create unique index diner_gacha_one_unsigned_per_lane on public.diner_gacha_transactions(chain_id,signer) where status='reserved';

create function public.diner_gacha_tx_reserve(p_key text,p_game text,p_signer text,p_call jsonb,p_pending bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare g public.diner_gacha_games; t public.diner_gacha_transactions; n bigint;
begin
  select * into g from public.diner_gacha_games where id=p_game and not halted;
  if not found or p_signer is null or p_signer !~ '^0x[0-9a-f]{40}$' or p_signer='0x0000000000000000000000000000000000000000'
    or p_pending is null or p_pending not between 0 and 9007199254740990 then raise exception 'gacha_tx_scope'; end if;
  if p_key is null or p_key !~ ('^'||g.chain_id::text||':'||g.contract||':(fulfill|refund|reveal):[0-9]+$') or length(p_key)>240
    or p_call->>'to' is distinct from g.contract or (p_call->>'chainId')::bigint is distinct from g.chain_id
    or p_call->>'value' is distinct from '0' or coalesce(p_call->>'data','') !~ '^0x[0-9a-f]+$' or octet_length(p_call::text)>20000 then raise exception 'gacha_tx_call'; end if;
  insert into public.diner_gacha_signer_lanes values(g.chain_id,p_signer,p_pending) on conflict do nothing;
  select next_nonce into n from public.diner_gacha_signer_lanes where chain_id=g.chain_id and signer=p_signer for update;
  select * into t from public.diner_gacha_transactions where operation_key=p_key for update;
  if found then
    if t.signer<>p_signer or t.chain_id<>g.chain_id or (t.call is not null and (t.call<>p_call or t.game_id<>p_game)) then raise exception 'gacha_tx_conflict'; end if;
    if t.status<>'reserved' then return to_jsonb(t); end if;
    if t.lease_until>now() then return null; end if;
  else
    if exists(select 1 from public.diner_gacha_transactions where chain_id=g.chain_id and signer=p_signer and status='reserved') then return null; end if;
    n:=greatest(n,p_pending);
    insert into public.diner_gacha_transactions(operation_key,chain_id,signer,game_id,call,nonce,status) values(p_key,g.chain_id,p_signer,p_game,p_call,n,'reserved');
    update public.diner_gacha_signer_lanes set next_nonce=n+1 where chain_id=g.chain_id and signer=p_signer;
  end if;
  update public.diner_gacha_transactions set lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds' where operation_key=p_key returning * into t;
  return to_jsonb(t);
end $$;
create function public.diner_gacha_tx_prepare(p_key text,p_lease uuid,p_unsigned jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.diner_gacha_transactions;
begin
  select * into t from public.diner_gacha_transactions where operation_key=p_key and status='reserved' and lease_token=p_lease and lease_until>now() for update;
  if not found then return false; end if;
  if p_unsigned is null or octet_length(p_unsigned::text)>24000 or p_unsigned->>'to' is distinct from t.call->>'to'
    or p_unsigned->>'data' is distinct from t.call->>'data' or p_unsigned->>'value' is distinct from '0'
    or p_unsigned->>'nonce' is distinct from t.nonce::text or p_unsigned->>'chainId' is distinct from t.chain_id::text then raise exception 'gacha_tx_unsigned'; end if;
  if t.unsigned_tx is not null and t.unsigned_tx<>p_unsigned then raise exception 'gacha_tx_unsigned_conflict'; end if;
  update public.diner_gacha_transactions set unsigned_tx=p_unsigned where operation_key=p_key;
  return true;
end $$;
create function public.diner_gacha_tx_signed(p_key text,p_lease uuid,p_raw text,p_hash text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_raw is null or p_raw !~ '^0x[0-9a-f]+$' or length(p_raw)>32768 or p_hash is null or p_hash !~ '^0x[0-9a-f]{64}$' then raise exception 'gacha_tx_signed_input'; end if;
  update public.diner_gacha_transactions set raw_tx=p_raw,transaction_hash=p_hash,status='signed',lease_token=null,lease_until=null
    where operation_key=p_key and status='reserved' and unsigned_tx is not null and lease_token=p_lease and lease_until>now();
  return found;
end $$;
create function public.diner_gacha_tx_final(p_key text,p_hash text,p_status text,p_block text,p_block_hash text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_status is null or p_status not in ('confirmed','reverted') or p_block is null or p_block !~ '^(0|[1-9][0-9]{0,77})$'
    or p_block_hash is null or p_block_hash !~ '^0x[0-9a-f]{64}$' then raise exception 'gacha_tx_final_input'; end if;
  -- Only the private adapter supplies this evidence after checking the canonical finalized block.
  update public.diner_gacha_transactions set status=p_status,final_block=p_block,final_block_hash=p_block_hash
    where operation_key=p_key and status='signed' and transaction_hash=p_hash;
  return found;
end $$;
create function public.diner_gacha_tx_retire(p_key text,p_chain bigint,p_signer text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.diner_gacha_transactions;
begin
  if p_chain is null or p_chain<=0 or p_signer is null or p_signer !~ '^0x[0-9a-f]{40}$' or p_key is null
    or p_key !~ ('^'||p_chain::text||':0x[0-9a-f]{40}:fulfill:[0-9]+$') or length(p_key)>240 then raise exception 'gacha_tx_retire_input'; end if;
  -- Same lane lock as submission: a tombstone prevents even a stale worker from
  -- ever creating a transaction for an operation retired before signing began.
  insert into public.diner_gacha_signer_lanes values(p_chain,p_signer,0) on conflict do nothing;
  perform 1 from public.diner_gacha_signer_lanes where chain_id=p_chain and signer=p_signer for update;
  select * into t from public.diner_gacha_transactions where operation_key=p_key for update;
  if not found then
    insert into public.diner_gacha_transactions(operation_key,chain_id,signer,status) values(p_key,p_chain,p_signer,'retired') returning * into t;
  elsif t.chain_id<>p_chain or t.signer<>p_signer then raise exception 'gacha_tx_retire_scope';
  elsif t.status='reverted' then
    update public.diner_gacha_transactions set status='retired' where operation_key=p_key returning * into t;
  end if;
  -- A reservation may have an in-flight remote signing response. Never retire it
  -- or release/reuse its nonce based on a timeout, dropped tx or RPC error.
  return jsonb_build_object('idempotencyKey',p_key,'state',case when t.status='retired' then 'retired' when t.status='confirmed' then 'confirmed' else 'pending' end,
    'reference',case when t.status='retired' then 'dk-retired:'||encode(sha256(convert_to(p_key,'UTF8')),'hex') else null end);
end $$;

do $$ declare t text; f record; begin
  foreach t in array array['diner_gacha_secret_refs','diner_gacha_signer_lanes','diner_gacha_transactions'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to service_role',t);
  end loop;
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace
    and (proname like 'diner_gacha_secret_%' or proname like 'diner_gacha_tx_%') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
