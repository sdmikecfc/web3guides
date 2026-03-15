-- ============================================================
--  Web3Guides — Supabase Schema
--  Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Enum: difficulty ────────────────────────────────────────
do $$ begin
  create type difficulty_level as enum ('beginner', 'intermediate', 'advanced');
exception
  when duplicate_object then null;
end $$;

-- ─── Table: guides ───────────────────────────────────────────
create table if not exists guides (
  id               uuid primary key default uuid_generate_v4(),
  subdomain        text not null,
  title            text not null,
  summary          text not null default '',
  difficulty       difficulty_level not null default 'beginner',
  tags             text[] not null default '{}',
  source_url       text not null,
  slug             text not null,
  cover_image      text,
  read_time_minutes integer,
  author           text,
  published_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Each guide slug must be unique within its subdomain
  constraint guides_subdomain_slug_unique unique (subdomain, slug)
);

-- Index for feed queries
create index if not exists guides_subdomain_published
  on guides (subdomain, published_at desc);

-- Index for tag filtering (GIN on array column)
create index if not exists guides_tags_gin
  on guides using gin (tags);

-- ─── Auto-update updated_at ──────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists guides_updated_at on guides;
create trigger guides_updated_at
  before update on guides
  for each row execute procedure set_updated_at();

-- ─── Row-Level Security ──────────────────────────────────────
alter table guides enable row level security;

-- Public can read all guides
create policy "guides_public_read"
  on guides for select
  using (true);

-- Only authenticated users (admins) can insert / update / delete
create policy "guides_admin_write"
  on guides for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ─── Realtime (optional) ─────────────────────────────────────
-- alter publication supabase_realtime add table guides;

-- ─── Helper view: guides_with_subdomain_count ────────────────
create or replace view guides_count_by_subdomain as
  select subdomain, count(*) as guide_count
  from guides
  group by subdomain
  order by guide_count desc;
