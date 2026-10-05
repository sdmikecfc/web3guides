-- Additive Model Kombat tables only. No Reporter/shared accounting writes.
begin;
create table if not exists public.mk8_workshops (
  wallet text primary key check (wallet ~ '^0x[0-9a-f]{40}$'),
  revision bigint not null default 0 check (revision >= 0),
  state jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.mk8_requests (
  wallet text not null references public.mk8_workshops(wallet),
  request_id text not null, created_at timestamptz not null default now(),
  primary key(wallet, request_id)
);
create table if not exists public.mk8_public_fights (
  id uuid primary key, completed_at timestamptz not null,
  replay jsonb not null
);
create index if not exists mk8_public_fights_recent on public.mk8_public_fights(completed_at desc);
alter table public.mk8_workshops enable row level security;
alter table public.mk8_requests enable row level security;
alter table public.mk8_public_fights enable row level security;
revoke all on public.mk8_workshops, public.mk8_requests, public.mk8_public_fights from public, anon, authenticated;
grant select, insert, update on public.mk8_workshops, public.mk8_requests, public.mk8_public_fights to service_role;

create or replace function public.mk8_commit(p_wallet text, p_revision bigint, p_request text, p_state jsonb, p_public jsonb default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_row public.mk8_workshops;
begin
  if p_wallet !~ '^0x[0-9a-f]{40}$' or p_request !~ '^[A-Za-z0-9_.:-]{8,120}$' then raise exception 'INVALID_REQUEST'; end if;
  -- Enrollment has exactly one winner, even on concurrent first connections.
  if p_revision = -1 then
    if (p_state->>'revision')::bigint <> 0 or (p_state->>'coins')::bigint <> 250
       or jsonb_array_length(p_state->'robots') <> 0 or jsonb_array_length(p_state->'history') <> 0
       or jsonb_array_length(p_state->'spares') <> 0 then raise exception 'INVALID_ENROLLMENT'; end if;
    insert into public.mk8_workshops(wallet,revision,state) values(p_wallet,0,p_state) on conflict do nothing;
    select * into current_row from public.mk8_workshops where wallet=p_wallet for update;
    return jsonb_build_object('state',current_row.state,'created',current_row.revision=0);
  end if;
  select * into current_row from public.mk8_workshops where wallet=p_wallet for update;
  if not found then raise exception 'NOT_ENROLLED'; end if;
  if exists(select 1 from public.mk8_requests where wallet=p_wallet and request_id=p_request) then
    return jsonb_build_object('state',current_row.state,'repeated',true);
  end if;
  if current_row.revision <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
  if (p_state->>'revision')::bigint <> p_revision+1 or (p_state->>'coins')::bigint < 0
     or jsonb_array_length(p_state->'robots') > 5 then raise exception 'INVALID_STATE'; end if;
  update public.mk8_workshops set state=p_state,revision=p_revision+1,updated_at=now() where wallet=p_wallet;
  insert into public.mk8_requests(wallet,request_id) values(p_wallet,p_request);
  if p_public is not null then
    insert into public.mk8_public_fights(id,completed_at,replay)
      values((p_public->>'id')::uuid,to_timestamp((p_public->>'completedAt')::numeric/1000),p_public)
      on conflict(id) do nothing;
  end if;
  return jsonb_build_object('state',p_state,'repeated',false);
end $$;
revoke all on function public.mk8_commit(text,bigint,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.mk8_commit(text,bigint,text,jsonb,jsonb) to service_role;
commit;
