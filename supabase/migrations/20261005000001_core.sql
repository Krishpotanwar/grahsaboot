create extension if not exists postgis schema extensions;

create table public.investigations (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('site', 'road')),
  geom extensions.geography not null,
  road_width_m integer check (road_width_m is null or road_width_m between 5 and 200),
  date_from date not null,
  date_to date not null,
  before_date date,
  after_date date,
  pinned date[] not null default '{}' check (cardinality(pinned) <= 24),
  claim_text text check (claim_text is null or char_length(claim_text) <= 2000),
  claim_date date,
  claim_criterion text check (claim_criterion is null or char_length(claim_criterion) <= 500),
  frozen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_to > date_from),
  check ((kind = 'road') = (road_width_m is not null)),
  check (before_date is null or after_date is null or before_date < after_date)
);
create index investigations_owner_updated on public.investigations (owner, updated_at desc);

create table public.frames (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  acquired_at timestamptz not null,
  frame_date date not null,
  collection text not null check (collection in ('sentinel-2-l2a', 'pc:sentinel-2-l2a')),
  -- Starts alphanumeric: a leading dot would let `items/..` normalise to the collection URL on the trusted host.
  item_id text not null check (item_id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$'),
  processing_baseline text,
  asset text not null check (asset in ('visual', 'scl')),
  level smallint not null check (level in (0, 1)),
  win integer[] not null check (cardinality(win) = 4),
  crs text not null,
  transform double precision[] not null check (cardinality(transform) = 6),
  href text not null,
  source_identity jsonb not null default '{}',
  recipe text not null check (recipe in ('frame-v1', 'scl-v2')),
  client_sha256 text not null check (client_sha256 ~ '^[0-9a-f]{64}$'),
  server_sha256 text not null check (server_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('verified', 'mismatch')),
  quality jsonb,
  verified_at timestamptz not null default now(),
  unique (investigation_id, item_id, asset, level)
);
create index frames_owner_verified on public.frames (owner, verified_at);

create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations (id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('change', 'no_clear_change', 'unsure')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  frame_date date,
  section_idx smallint check (section_idx is null or section_idx between 0 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index annotations_investigation on public.annotations (investigation_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  at timestamptz not null default now()
);
create index audit_log_at on public.audit_log (at);
-- verify's daily limit counts a user's frame checks here (inserts and re-checks alike).
create index audit_log_actor_at on public.audit_log (actor, entity, at);

-- Table privileges (RLS policies come in the security migration).
revoke all on public.investigations, public.frames, public.annotations, public.audit_log from anon, authenticated;
grant select, insert, update, delete on public.investigations to authenticated;
grant select, insert, update, delete on public.annotations to authenticated;
grant select on public.frames to authenticated;
grant all on public.investigations, public.frames, public.annotations, public.audit_log to service_role;
