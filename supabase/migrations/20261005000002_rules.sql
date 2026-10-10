-- Geometry, date and immutability rules. Server limits are 0.5 % looser than the browser UTM-based limits (spheroid vs UTM).
create or replace function public.gs_validate_investigation() returns trigger
language plpgsql set search_path = '' as $$
declare
  g extensions.geometry := new.geom::extensions.geometry;
begin
  -- frozen_at is never client-writable: a client role (anon, authenticated) can neither set nor clear it. Only a non-client
  -- role sets it, in practice the security-definer gs_freeze_on_frame (null to now(), on the first frame); nothing clears it.
  if tg_op = 'INSERT' then
    new.frozen_at := null;
  elsif old.frozen_at is not null or current_user in ('anon', 'authenticated') then
    new.frozen_at := old.frozen_at;
  end if;

  if tg_op = 'UPDATE' then
    if new.owner is distinct from old.owner then raise exception 'GS:OWNER_IMMUTABLE'; end if;
    if old.frozen_at is not null and (
      new.kind is distinct from old.kind or new.road_width_m is distinct from old.road_width_m
      or new.date_from is distinct from old.date_from or new.date_to is distinct from old.date_to
      or not extensions.st_equals(new.geom::extensions.geometry, old.geom::extensions.geometry)
    ) then
      raise exception 'GS:FROZEN';
    end if;
  end if;

  if new.kind = 'site' then
    if extensions.geometrytype(g) <> 'POLYGON' then raise exception 'GS:GEOM_TYPE'; end if;
    -- One ring: the browser draws no holes.
    if extensions.st_nrings(g) <> 1 then raise exception 'GS:GEOM_TYPE'; end if;
    if not extensions.st_isvalid(g) then raise exception 'GS:GEOM_INVALID'; end if;
    if extensions.st_npoints(g) - 1 > 200 then raise exception 'GS:TOO_MANY_VERTICES'; end if;
    if extensions.st_area(new.geom) > 9e6 * 1.005 then raise exception 'GS:TOO_LARGE'; end if;
    if (
      select max(extensions.st_distance(a.geom::extensions.geography, b.geom::extensions.geography))
      from extensions.st_dumppoints(g) a, extensions.st_dumppoints(g) b
    ) > 4250 * 1.005 then
      raise exception 'GS:TOO_WIDE';
    end if;
  else
    if extensions.geometrytype(g) <> 'LINESTRING' then raise exception 'GS:GEOM_TYPE'; end if;
    if extensions.st_npoints(g) > 200 then raise exception 'GS:TOO_MANY_VERTICES'; end if;
    if extensions.st_length(new.geom) < 200 * 0.995 or extensions.st_length(new.geom) > 10000 * 1.005 then
      raise exception 'GS:BAD_LENGTH';
    end if;
  end if;

  -- Today is the UTC date, as in the browser (src/new/draft.ts ymd), whatever the session's time zone is.
  if new.date_from < date '2017-01-01' or new.date_to > (now() at time zone 'utc')::date then raise exception 'GS:BAD_DATES'; end if;
  new.updated_at := now();
  return new;
end $$;

create trigger gs_investigations_validate
  before insert or update on public.investigations
  for each row execute function public.gs_validate_investigation();

-- The browser sends WGS 84 only; another geographic SRID would change what the measures above mean.
alter table public.investigations add constraint investigations_srid check (extensions.st_srid(geom) = 4326);

-- ponytail: count-based caps can race under concurrent inserts by one user; acceptable for small caps, use advisory locks if abused
create or replace function public.gs_limit_investigations() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.investigations where owner = new.owner) >= 50 then raise exception 'GS:LIMIT_INVESTIGATIONS'; end if;
  return new;
end $$;
create trigger gs_investigations_limit before insert on public.investigations for each row execute function public.gs_limit_investigations();

create or replace function public.gs_limit_notes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.annotations where investigation_id = new.investigation_id) >= 200 then raise exception 'GS:LIMIT_NOTES'; end if;
  return new;
end $$;
create trigger gs_annotations_limit before insert on public.annotations for each row execute function public.gs_limit_notes();

create or replace function public.gs_limit_frames() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Re-verifying a frame (upsert on the unique key) never counts against the cap.
  if exists (select 1 from public.frames where investigation_id = new.investigation_id and item_id = new.item_id and asset = new.asset and level = new.level) then return new; end if;
  if (select count(*) from public.frames where investigation_id = new.investigation_id) >= 50 then raise exception 'GS:LIMIT_FRAMES'; end if;
  return new;
end $$;
create trigger gs_frames_limit before insert on public.frames for each row execute function public.gs_limit_frames();

create or replace function public.gs_freeze_on_frame() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.investigations set frozen_at = coalesce(frozen_at, now()) where id = new.investigation_id and frozen_at is null;
  return new;
end $$;
create trigger gs_frames_freeze after insert on public.frames for each row execute function public.gs_freeze_on_frame();

create or replace function public.gs_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger gs_annotations_touch before update on public.annotations for each row execute function public.gs_touch();

-- A note never moves to another investigation or owner: moving notes would walk round the 200-note cap (the cap is insert-only).
create or replace function public.gs_annotation_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.investigation_id is distinct from old.investigation_id then raise exception 'GS:NOTE_MOVED'; end if;
  if new.owner is distinct from old.owner then raise exception 'GS:OWNER_IMMUTABLE'; end if;
  return new;
end $$;
create trigger gs_annotations_guard before update on public.annotations for each row execute function public.gs_annotation_guard();

revoke execute on function public.gs_validate_investigation(), public.gs_limit_investigations(), public.gs_limit_notes(), public.gs_limit_frames(), public.gs_freeze_on_frame(), public.gs_touch(), public.gs_annotation_guard() from public, anon, authenticated;
