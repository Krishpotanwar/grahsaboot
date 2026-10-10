-- Owner-only row level security, IDs-only audit, consent, keep-alive and purge.
-- Supabase grants every new public function to anon, authenticated and service_role by default privileges, so revoking from
-- public alone closes nothing: every function below is revoked from public, anon and authenticated, then granted explicitly.

alter table public.investigations enable row level security;
alter table public.frames enable row level security;
alter table public.annotations enable row level security;
alter table public.audit_log enable row level security;

create policy investigations_owner on public.investigations for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

create policy annotations_owner on public.annotations for all to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()) and exists (select 1 from public.investigations i where i.id = investigation_id and i.owner = (select auth.uid())));

-- Frames are written only by the verify function (service role): clients read their own and never write.
create policy frames_owner_read on public.frames for select to authenticated using (owner = (select auth.uid()));
-- audit_log: RLS on, no policy and no client grant, so it is invisible to clients.

-- PostgREST computed field (select=geom_geojson). SECURITY INVOKER: it sees only the row it is given, and that row came
-- through the caller's own row-security-filtered scan.
create or replace function public.geom_geojson(i public.investigations) returns jsonb
language sql stable set search_path = '' as $$ select extensions.st_asgeojson(i.geom)::jsonb $$;

-- IDs and action names only: never a name, a geometry, a note or an email. A service role write has no JWT, so it is
-- attributed to the owner of the row.
create or replace function public.gs_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (actor, action, entity, entity_id)
  values (coalesce(auth.uid(), (r ->> 'owner')::uuid), lower(tg_op), tg_table_name, (r ->> 'id')::uuid);
  return coalesce(new, old);
end $$;
create trigger gs_investigations_audit after insert or update or delete on public.investigations for each row execute function public.gs_audit();
create trigger gs_frames_audit after insert or update or delete on public.frames for each row execute function public.gs_audit();
create trigger gs_annotations_audit after insert or update or delete on public.annotations for each row execute function public.gs_audit();

-- One row per user and version, so a loop calling this cannot grow the audit table. It throws when nobody is signed in and
-- when the version is malformed: the client relies on the call throwing, never on a silent skip.
-- ponytail: two concurrent first calls can both insert (a harmless duplicate fact), a partial unique index if that ever matters
create or replace function public.record_consent(version text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'GS:NOT_SIGNED_IN'; end if;
  if version is null or version !~ '^[a-z0-9.-]{1,20}$' then raise exception 'GS:BAD_VERSION'; end if;
  insert into public.audit_log (actor, action, entity, entity_id)
  select auth.uid(), 'consent:' || version, 'users', auth.uid()
  where not exists (
    select 1 from public.audit_log l where l.actor = auth.uid() and l.action = 'consent:' || version
  );
end $$;

create or replace function public.keep_alive() returns integer language sql stable set search_path = '' as $$ select 1 $$;

-- Called daily by pg_cron (the ops_cron migration) as the owner. No API role may call it.
create or replace function public.purge_expired() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare inv_n integer; log_n integer;
begin
  delete from public.investigations i using auth.users u
    where i.owner = u.id and u.last_sign_in_at < now() - interval '12 months';
  get diagnostics inv_n = row_count;
  -- Consent is kept while the account exists, so it can still be shown. Whether that proves consent under the DPDP Act is
  -- the owner legal question, this is the conservative reading. exists, not in: a null actor counts as no account.
  delete from public.audit_log l
    where l.at < now() - interval '365 days'
      and not (l.action like 'consent:%' and exists (select 1 from auth.users u where u.id = l.actor));
  get diagnostics log_n = row_count;
  return jsonb_build_object('investigations', inv_n, 'audit', log_n);
end $$;

revoke execute on function public.geom_geojson(public.investigations), public.gs_audit(), public.record_consent(text), public.keep_alive(), public.purge_expired() from public, anon, authenticated;
-- The trigger function and the purge are internal: the triggers and the cron job run them as the owner, so the service role
-- does not need them either (it would otherwise keep the default privilege).
revoke execute on function public.gs_audit(), public.purge_expired() from service_role;
grant execute on function public.geom_geojson(public.investigations) to authenticated, service_role;
grant execute on function public.record_consent(text) to authenticated;
grant execute on function public.keep_alive() to anon, authenticated;

-- Append-only for every API role: a bug in a handler cannot erase the `check` rows the daily verify limit counts. The purge and
-- the audit trigger run as the owner, and the handlers only select and insert.
revoke update, delete, truncate on public.audit_log from service_role;
