-- =====================================================================
--  WARD NO. 65 - PUBLIC SERVICE & DEVELOPMENT PORTAL
--  Supabase / PostgreSQL schema
--
--  HOW TO RUN: Supabase Dashboard -> SQL Editor -> New query ->
--  paste this whole file -> Run.  Safe to run again (it is re-runnable).
--
--  SECURITY MODEL (short version)
--   * Residents never touch tables directly. They call two functions:
--       submit_complaint()  and  track_complaint()
--     Both are rate-limited and validate every input on the server.
--   * Residents' personal details (name, mobile, description) are only
--     readable by signed-in staff. Nothing about complaints is public
--     except aggregate counts (public_stats()).
--   * Two staff roles:  admin  = everything
--                       staff  = complaints only (view, update, export)
--   * All tables have Row Level Security switched on.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Small helpers
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1. Staff (administrators and authorised staff)
--    The login itself lives in Supabase Auth; this table says WHO is
--    allowed in and with WHAT role.
-- ---------------------------------------------------------------------
create table if not exists public.staff_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null check (char_length(full_name) between 2 and 100),
  role       text not null check (role in ('admin', 'staff')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.staff_profiles enable row level security;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid() and is_active
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid() and is_active and role = 'admin'
  );
$$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.staff_profiles
  where user_id = auth.uid() and is_active;
$$;

drop policy if exists staff_profiles_read on public.staff_profiles;
create policy staff_profiles_read on public.staff_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- 2. Site settings (office address, phone, WhatsApp, map, banner...)
-- ---------------------------------------------------------------------
create table if not exists public.site_settings (
  key        text primary key,
  value      text not null default '',
  is_public  boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;

drop trigger if exists site_settings_touch on public.site_settings;
create trigger site_settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();

drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated using (is_public);

drop policy if exists site_settings_admin_all on public.site_settings;
create policy site_settings_admin_all on public.site_settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Empty value = that item is simply hidden on the website.
insert into public.site_settings (key, value) values
  ('office_name',      'Ward No. 65 Office'),
  ('office_address',   ''),
  ('office_address_kn',''),
  ('office_phone',     ''),
  ('office_email',     ''),
  ('office_hours',     ''),
  ('office_hours_kn',  ''),
  ('whatsapp_number',  ''),
  ('maps_url',         ''),
  ('maps_embed_url',   ''),
  ('emergency_phone',  ''),
  ('emergency_info',   ''),
  ('emergency_info_kn',''),
  ('banner_path',      ''),
  ('require_phone_verification', 'false')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 3. Complaints
-- ---------------------------------------------------------------------
create table if not exists public.complaints (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,                 -- public complaint ID, e.g. W65-2611-K7M2Q
  name               text not null check (char_length(name) between 2 and 100),
  mobile             text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  area               text not null check (char_length(area) between 2 and 150),
  ward_no            int  not null default 65 check (ward_no between 1 and 99),
  category           text not null check (category in (
                       'water','drainage','garbage','road','streetlight',
                       'rainwater','sanitation','encroachment','health','other')),
  description        text not null check (char_length(description) between 10 and 2000),
  landmark           text check (char_length(landmark) <= 200),
  latitude           double precision check (latitude  between -90  and 90),
  longitude          double precision check (longitude between -180 and 180),
  status             text not null default 'submitted' check (status in (
                       'submitted','under_review','assigned','in_progress','resolved','closed')),
  department         text check (char_length(department) <= 150),
  resolution_details text check (char_length(resolution_details) <= 2000),
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists complaints_created_idx  on public.complaints (created_at desc);
create index if not exists complaints_status_idx   on public.complaints (status);
create index if not exists complaints_category_idx on public.complaints (category);
create index if not exists complaints_mobile_idx   on public.complaints (mobile);
alter table public.complaints enable row level security;

drop trigger if exists complaints_touch on public.complaints;
create trigger complaints_touch before update on public.complaints
  for each row execute function public.touch_updated_at();

drop policy if exists complaints_staff_read on public.complaints;
create policy complaints_staff_read on public.complaints
  for select to authenticated using (public.is_staff());

drop policy if exists complaints_admin_delete on public.complaints;
create policy complaints_admin_delete on public.complaints
  for delete to authenticated using (public.is_admin());

-- Progress reports / status history
create table if not exists public.complaint_updates (
  id               bigint generated always as identity primary key,
  complaint_id     uuid not null references public.complaints (id) on delete cascade,
  status           text not null,
  note             text check (char_length(note) <= 2000),
  is_public        boolean not null default true,   -- note visible to the resident?
  is_status_change boolean not null default false,  -- shown as a step on the resident's timeline
  created_by       uuid,
  created_by_name  text,
  created_at       timestamptz not null default now()
);
create index if not exists complaint_updates_idx on public.complaint_updates (complaint_id, created_at);
alter table public.complaint_updates enable row level security;

drop policy if exists complaint_updates_staff_read on public.complaint_updates;
create policy complaint_updates_staff_read on public.complaint_updates
  for select to authenticated using (public.is_staff());

-- Photos / videos attached to complaints (files live in Storage)
create table if not exists public.complaint_media (
  id           bigint generated always as identity primary key,
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  storage_path text not null unique,
  kind         text not null check (kind in ('image', 'video')),
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);
create index if not exists complaint_media_idx on public.complaint_media (complaint_id);
alter table public.complaint_media enable row level security;

drop policy if exists complaint_media_staff_read on public.complaint_media;
create policy complaint_media_staff_read on public.complaint_media
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------
-- 4. Rate limiting (spam protection)
--    No policies on purpose: nobody can read or write this table
--    directly, only the SECURITY DEFINER functions below.
-- ---------------------------------------------------------------------
create table if not exists public.rate_events (
  id         bigint generated always as identity primary key,
  bucket     text not null,
  key        text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_events_idx on public.rate_events (bucket, key, created_at desc);
alter table public.rate_events enable row level security;

create or replace function public.client_ip()
returns text language plpgsql stable as $$
declare
  h jsonb;
  v text;
begin
  v := nullif(current_setting('request.headers', true), '');
  if v is null then return null; end if;
  h := v::jsonb;
  return nullif(btrim(coalesce(
           h ->> 'cf-connecting-ip',
           split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)
         )), '');
exception when others then
  return null;
end $$;

create or replace function public.rate_check(p_bucket text, p_key text, p_max int, p_window interval)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count int;
begin
  if p_key is null or p_key = '' then return; end if;

  select count(*) into v_count
  from public.rate_events
  where bucket = p_bucket and key = p_key and created_at > now() - p_window;

  if v_count >= p_max then
    raise exception 'rate_limited';
  end if;

  insert into public.rate_events (bucket, key) values (p_bucket, p_key);

  -- housekeeping: occasionally drop old rows
  if random() < 0.02 then
    delete from public.rate_events where created_at < now() - interval '3 days';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. Resident-facing functions
-- ---------------------------------------------------------------------
create or replace function public.norm_mobile(p text)
returns text language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if length(d) = 12 and left(d, 2) = '91' then
    d := right(d, 10);
  elsif length(d) = 11 and left(d, 1) = '0' then
    d := right(d, 10);
  end if;
  return d;
end $$;

create or replace function public.gen_complaint_code()
returns text language plpgsql volatile as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I/L
  v_code   text;
  v_suffix text;
  i        int;
begin
  loop
    v_suffix := '';
    for i in 1..5 loop
      v_suffix := v_suffix || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    v_code := 'W65-' || to_char(now() at time zone 'Asia/Kolkata', 'YYMM') || '-' || v_suffix;
    exit when not exists (select 1 from public.complaints c where c.code = v_code);
  end loop;
  return v_code;
end $$;

-- Register a complaint. Returns {id, code, created_at}.
-- The returned id is a one-time key that lets the browser attach photos
-- for the next 30 minutes; it is never shown publicly.
create or replace function public.submit_complaint(
  p_name        text,
  p_mobile      text,
  p_area        text,
  p_ward        int,
  p_category    text,
  p_description text,
  p_landmark    text default null,
  p_lat         double precision default null,
  p_lng         double precision default null,
  p_hp          text default null            -- honeypot: real people leave this empty
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_mobile  text := public.norm_mobile(p_mobile);
  v_name    text := btrim(coalesce(p_name, ''));
  v_area    text := btrim(coalesce(p_area, ''));
  v_desc    text := btrim(coalesce(p_description, ''));
  v_land    text := nullif(btrim(coalesce(p_landmark, '')), '');
  v_ward    int  := coalesce(p_ward, 65);
  v_verify  boolean;
  v_jwtph   text;
  v_id      uuid;
  v_code    text;
  v_created timestamptz;
begin
  if coalesce(p_hp, '') <> '' then raise exception 'invalid_request'; end if;

  if char_length(v_name) < 2 or char_length(v_name) > 100 then raise exception 'invalid_name'; end if;
  if v_mobile !~ '^[6-9][0-9]{9}$'                        then raise exception 'invalid_mobile'; end if;
  if char_length(v_area) < 2 or char_length(v_area) > 150 then raise exception 'invalid_area'; end if;
  if v_ward < 1 or v_ward > 99                            then raise exception 'invalid_ward'; end if;
  if p_category is null or p_category not in
     ('water','drainage','garbage','road','streetlight','rainwater','sanitation','encroachment','health','other')
                                                          then raise exception 'invalid_category'; end if;
  if char_length(v_desc) < 10 or char_length(v_desc) > 2000 then raise exception 'invalid_description'; end if;
  if v_land is not null and char_length(v_land) > 200     then raise exception 'invalid_landmark'; end if;
  if (p_lat is not null and (p_lat < -90 or p_lat > 90))
     or (p_lng is not null and (p_lng < -180 or p_lng > 180)) then
    p_lat := null; p_lng := null;
  end if;

  -- Optional mobile-number verification (OTP). Switch on in Admin -> Settings
  -- after an SMS provider is configured in Supabase Auth.
  select (value = 'true') into v_verify from public.site_settings where key = 'require_phone_verification';
  if coalesce(v_verify, false) then
    v_jwtph := regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '\D', '', 'g');
    if right(v_jwtph, 10) <> v_mobile then raise exception 'phone_not_verified'; end if;
  end if;

  -- Spam protection
  perform public.rate_check('submit:mobile', v_mobile, 5, interval '1 day');
  perform public.rate_check('submit:ip', public.client_ip(), 15, interval '1 day');

  v_code := public.gen_complaint_code();

  insert into public.complaints
    (code, name, mobile, area, ward_no, category, description, landmark, latitude, longitude)
  values
    (v_code, v_name, v_mobile, v_area, v_ward, p_category, v_desc, v_land, p_lat, p_lng)
  returning id, created_at into v_id, v_created;

  insert into public.complaint_updates (complaint_id, status, note, is_public, is_status_change, created_by_name)
  values (v_id, 'submitted', null, true, true, 'System');

  return jsonb_build_object('id', v_id, 'code', v_code, 'created_at', v_created);
end $$;

-- Can this storage path still receive a resident's upload?
-- Only: a complaint created in the last 30 minutes, <= 6 files, sane file name.
create or replace function public.can_upload_complaint_media(p_name text)
returns boolean language plpgsql stable security definer set search_path = public, storage, pg_temp as $$
declare
  v_cid  uuid;
  v_file text;
begin
  begin
    v_cid := split_part(p_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  v_file := substr(p_name, length(split_part(p_name, '/', 1)) + 2);
  if v_file is null or v_file !~* '^[a-z0-9][a-z0-9._-]{0,80}\.(jpg|jpeg|png|webp|mp4|webm|mov)$' then
    return false;
  end if;
  return exists (
           select 1 from public.complaints c
           where c.id = v_cid and c.created_at > now() - interval '30 minutes'
         )
     and (select count(*) from storage.objects o
          where o.bucket_id = 'complaint-media' and o.name like v_cid::text || '/%') < 6;
end $$;

-- Record an uploaded file against the complaint it belongs to.
create or replace function public.add_complaint_media(
  p_complaint uuid, p_path text, p_kind text, p_mime text, p_size bigint
) returns void
language plpgsql security definer set search_path = public, storage, pg_temp as $$
begin
  if p_kind not in ('image', 'video') then raise exception 'invalid_request'; end if;
  if p_path is null or left(p_path, 37) <> p_complaint::text || '/' then raise exception 'invalid_request'; end if;
  if not exists (select 1 from public.complaints c
                 where c.id = p_complaint and c.created_at > now() - interval '30 minutes') then
    raise exception 'upload_window_closed';
  end if;
  if (select count(*) from public.complaint_media m where m.complaint_id = p_complaint) >= 6 then
    raise exception 'too_many_files';
  end if;
  if not exists (select 1 from storage.objects o
                 where o.bucket_id = 'complaint-media' and o.name = p_path) then
    raise exception 'file_not_found';
  end if;
  insert into public.complaint_media (complaint_id, storage_path, kind, mime_type, size_bytes)
  values (p_complaint, p_path, p_kind, left(p_mime, 100), p_size)
  on conflict (storage_path) do nothing;
end $$;

-- Resident looks up a complaint with its ID + the mobile number used.
-- Returns NULL when nothing matches. Never returns the resident's name
-- or mobile number. Failed guessing is rate-limited.
create or replace function public.track_complaint(p_code text, p_mobile text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_code   text := upper(btrim(coalesce(p_code, '')));
  v_mobile text := public.norm_mobile(p_mobile);
  v_result jsonb;
begin
  if v_code !~ '^W65-[0-9]{4}-[A-Z0-9]{5}$' or v_mobile !~ '^[6-9][0-9]{9}$' then
    raise exception 'invalid_request';
  end if;

  perform public.rate_check('track:mobile', v_mobile, 10, interval '15 minutes');
  perform public.rate_check('track:ip', public.client_ip(), 40, interval '15 minutes');

  select jsonb_build_object(
           'code', c.code,
           'created_at', c.created_at,
           'category', c.category,
           'area', c.area,
           'description', c.description,
           'status', c.status,
           'department', c.department,
           'resolution_details', c.resolution_details,
           'resolved_at', c.resolved_at,
           'updated_at', c.updated_at,
           'timeline', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'status', u.status,
                       'step', u.is_status_change,
                       'note', case when u.is_public then u.note end,
                       'at', u.created_at) order by u.created_at, u.id)
              from public.complaint_updates u
              where u.complaint_id = c.id and (u.is_status_change or u.is_public)
           ), '[]'::jsonb))
    into v_result
  from public.complaints c
  where c.code = v_code and c.mobile = v_mobile;

  return v_result;
end $$;

-- ---------------------------------------------------------------------
-- 6. Public content: representatives, development works, announcements
-- ---------------------------------------------------------------------
create table if not exists public.representatives (
  id             uuid primary key default gen_random_uuid(),
  role_key       text not null default 'other' check (role_key in ('corporator','second_corporator','mla','other')),
  name           text not null,
  name_kn        text,
  designation    text not null,
  designation_kn text,
  intro          text,
  intro_kn       text,
  work           text,
  work_kn        text,
  phone          text,
  email          text,
  photo_path     text,
  display_order  int  not null default 0,
  is_published   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.representatives enable row level security;
drop trigger if exists representatives_touch on public.representatives;
create trigger representatives_touch before update on public.representatives
  for each row execute function public.touch_updated_at();
drop policy if exists representatives_public_read on public.representatives;
create policy representatives_public_read on public.representatives
  for select to anon, authenticated using (is_published);
drop policy if exists representatives_admin_all on public.representatives;
create policy representatives_admin_all on public.representatives
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.development_works (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  title_kn       text,
  description    text,
  description_kn text,
  area           text not null,
  category       text not null check (category in
                   ('road','drainage','water','lighting','cleanliness','infrastructure')),
  status         text not null default 'completed' check (status in ('planned','ongoing','completed')),
  before_path    text,
  after_path     text,
  photo_paths    text[] not null default '{}',
  completed_on   date,
  is_published   boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists development_works_idx on public.development_works (is_published, created_at desc);
alter table public.development_works enable row level security;
drop trigger if exists development_works_touch on public.development_works;
create trigger development_works_touch before update on public.development_works
  for each row execute function public.touch_updated_at();
drop policy if exists development_works_public_read on public.development_works;
create policy development_works_public_read on public.development_works
  for select to anon, authenticated using (is_published);
drop policy if exists development_works_admin_all on public.development_works;
create policy development_works_admin_all on public.development_works
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  title_kn    text,
  body        text,
  body_kn     text,
  type        text not null default 'announcement' check (type in
                ('new_project','ongoing_work','completed_project','public_notice','announcement','community_programme')),
  location    text,
  location_kn text,
  event_date  date not null default current_date,
  image_paths text[] not null default '{}',
  is_pinned   boolean not null default false,
  is_published boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists announcements_idx on public.announcements (is_published, is_pinned desc, event_date desc);
alter table public.announcements enable row level security;
drop trigger if exists announcements_touch on public.announcements;
create trigger announcements_touch before update on public.announcements
  for each row execute function public.touch_updated_at();
drop policy if exists announcements_public_read on public.announcements;
create policy announcements_public_read on public.announcements
  for select to anon, authenticated using (is_published);
drop policy if exists announcements_admin_all on public.announcements;
create policy announcements_admin_all on public.announcements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Representatives: names and designations from the brief. Photos, the second
-- corporator's details, and longer biographies are added from Admin -> Representatives.
-- The second corporator stays hidden (unpublished) until a name is entered.
insert into public.representatives
  (role_key, name, designation, designation_kn, intro, intro_kn, display_order, is_published)
select * from (values
  ('corporator', 'Smt. Sunita Prakash Burabure', 'Corporator, Ward No. 65',
   'ಪಾಲಿಕೆ ಸದಸ್ಯರು, ವಾರ್ಡ್ ಸಂಖ್ಯೆ 65',
   'Elected Corporator of Ward No. 65, Hubballi-Dharwad Municipal Corporation.',
   'ಹುಬ್ಬಳ್ಳಿ-ಧಾರವಾಡ ಮಹಾನಗರ ಪಾಲಿಕೆಯ ವಾರ್ಡ್ ಸಂಖ್ಯೆ 65ರ ಚುನಾಯಿತ ಪಾಲಿಕೆ ಸದಸ್ಯರು.', 1, true),
  ('second_corporator', 'Second Corporator (name to be added)', 'Corporator',
   'ಪಾಲಿಕೆ ಸದಸ್ಯರು', null, null, 2, false),
  ('mla', 'Shri Prasad Abbayya', 'MLA',
   'ಶಾಸಕರು',
   'Member of the Legislative Assembly (MLA).',
   'ವಿಧಾನಸಭಾ ಸದಸ್ಯರು (ಶಾಸಕರು).', 3, true)
) as v(role_key, name, designation, designation_kn, intro, intro_kn, display_order, is_published)
where not exists (select 1 from public.representatives);

-- ---------------------------------------------------------------------
-- 7. Aggregate numbers (the ONLY complaint data that is public)
-- ---------------------------------------------------------------------
create or replace function public.public_stats()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'total_complaints',   (select count(*) from public.complaints),
    'pending',            (select count(*) from public.complaints where status in ('submitted','under_review')),
    'in_process',         (select count(*) from public.complaints where status in ('assigned','in_progress')),
    'resolved',           (select count(*) from public.complaints where status in ('resolved','closed')),
    'projects_total',     (select count(*) from public.development_works where is_published),
    'projects_completed', (select count(*) from public.development_works where is_published and status = 'completed')
  );
$$;

-- ---------------------------------------------------------------------
-- 8. Staff functions
-- ---------------------------------------------------------------------
create or replace function public.staff_update_complaint(
  p_id         uuid,
  p_status     text,
  p_department text,
  p_note       text,
  p_is_public  boolean,
  p_resolution text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old  public.complaints%rowtype;
  v_name text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_res  text := nullif(btrim(coalesce(p_resolution, '')), '');
  v_dept text;
  v_changed boolean;
begin
  if not public.is_staff() then raise exception 'not_authorised'; end if;
  if p_status is null or p_status not in
     ('submitted','under_review','assigned','in_progress','resolved','closed') then
    raise exception 'invalid_status';
  end if;

  select * into v_old from public.complaints where id = p_id for update;
  if not found then raise exception 'not_found'; end if;

  if p_status = 'resolved' and coalesce(v_res, v_old.resolution_details) is null then
    raise exception 'resolution_required';
  end if;

  v_dept := case when p_department is null then v_old.department
                 else nullif(btrim(p_department), '') end;
  v_changed := (p_status <> v_old.status);

  update public.complaints set
    status             = p_status,
    department         = v_dept,
    resolution_details = coalesce(v_res, resolution_details),
    resolved_at        = case when p_status in ('resolved', 'closed') then coalesce(resolved_at, now())
                              else null end
  where id = p_id;

  if v_changed or v_note is not null then
    select full_name into v_name from public.staff_profiles where user_id = auth.uid();
    insert into public.complaint_updates
      (complaint_id, status, note, is_public, is_status_change, created_by, created_by_name)
    values
      (p_id, p_status, v_note, coalesce(p_is_public, true), v_changed, auth.uid(), v_name);
  end if;
end $$;

create or replace function public.staff_overview()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_staff() then raise exception 'not_authorised'; end if;
  return jsonb_build_object(
    'last_30_days', (select count(*) from public.complaints where created_at > now() - interval '30 days'),
    'by_category', coalesce((select jsonb_object_agg(category, n)
                             from (select category, count(*) as n from public.complaints group by category) q),
                            '{}'::jsonb),
    'by_status', coalesce((select jsonb_object_agg(status, n)
                           from (select status, count(*) as n from public.complaints group by status) q),
                          '{}'::jsonb),
    'top_areas', coalesce((select jsonb_agg(jsonb_build_object('area', a, 'n', n) order by n desc)
                           from (select lower(btrim(area)) as a, count(*) as n
                                 from public.complaints group by 1 order by n desc limit 5) q),
                          '[]'::jsonb)
  );
end $$;

create or replace function public.admin_list_staff()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'not_authorised'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', s.user_id, 'email', u.email, 'full_name', s.full_name,
             'role', s.role, 'is_active', s.is_active) order by s.created_at)
    from public.staff_profiles s join auth.users u on u.id = s.user_id
  ), '[]'::jsonb);
end $$;

-- The person must first exist in Supabase Auth (Authentication -> Users -> Invite / Add user).
create or replace function public.admin_upsert_staff(
  p_email text, p_name text, p_role text, p_active boolean
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
begin
  if not public.is_admin() then raise exception 'not_authorised'; end if;
  if p_role not in ('admin', 'staff') then raise exception 'invalid_role'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_name'; end if;

  select id into v_uid from auth.users where lower(email) = lower(btrim(p_email));
  if v_uid is null then raise exception 'user_not_found'; end if;

  if v_uid = auth.uid() and (p_role <> 'admin' or not coalesce(p_active, true)) then
    raise exception 'cannot_lock_yourself_out';
  end if;

  insert into public.staff_profiles (user_id, full_name, role, is_active)
  values (v_uid, btrim(p_name), p_role, coalesce(p_active, true))
  on conflict (user_id) do update
    set full_name = excluded.full_name, role = excluded.role, is_active = excluded.is_active;
end $$;

-- ---------------------------------------------------------------------
-- 9. Storage buckets and rules
--    complaint-media : PRIVATE. Residents can add files to a complaint they
--                      just filed; only staff can read them.
--    site-media      : PUBLIC read (banner, photos, gallery). Admin writes.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('complaint-media', 'complaint-media', false, 26214400,
   array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']),
  ('site-media', 'site-media', true, 10485760,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "complaint media: resident upload" on storage.objects;
create policy "complaint media: resident upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'complaint-media' and public.can_upload_complaint_media(name));

drop policy if exists "complaint media: staff read" on storage.objects;
create policy "complaint media: staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'complaint-media' and public.is_staff());

drop policy if exists "complaint media: admin delete" on storage.objects;
create policy "complaint media: admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'complaint-media' and public.is_admin());

drop policy if exists "site media: public read" on storage.objects;
create policy "site media: public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'site-media');

drop policy if exists "site media: admin insert" on storage.objects;
create policy "site media: admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-media' and public.is_admin());

drop policy if exists "site media: admin update" on storage.objects;
create policy "site media: admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-media' and public.is_admin())
  with check (bucket_id = 'site-media' and public.is_admin());

drop policy if exists "site media: admin delete" on storage.objects;
create policy "site media: admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-media' and public.is_admin());

-- ---------------------------------------------------------------------
-- 10. Permissions (explicit, least-privilege)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- public website content (rows are filtered by RLS policies above)
grant select on public.representatives, public.development_works,
                public.announcements, public.site_settings to anon, authenticated;
grant insert, update, delete on public.representatives, public.development_works,
                public.announcements, public.site_settings to authenticated;

-- staff-only data (RLS restricts to signed-in staff / admins)
grant select on public.staff_profiles, public.complaints, public.complaint_updates,
                public.complaint_media to authenticated;
grant delete on public.complaints to authenticated;

-- functions residents may call
grant execute on function public.submit_complaint(text,text,text,int,text,text,text,double precision,double precision,text) to anon, authenticated;
grant execute on function public.track_complaint(text,text)   to anon, authenticated;
grant execute on function public.add_complaint_media(uuid,text,text,text,bigint) to anon, authenticated;
grant execute on function public.public_stats()                to anon, authenticated;
grant execute on function public.can_upload_complaint_media(text) to anon, authenticated;
grant execute on function public.is_staff(), public.is_admin(), public.my_role() to anon, authenticated;

-- functions for staff (each one re-checks the role inside)
grant execute on function public.staff_update_complaint(uuid,text,text,text,boolean,text) to authenticated;
grant execute on function public.staff_overview()  to authenticated;
grant execute on function public.admin_list_staff() to authenticated;
grant execute on function public.admin_upsert_staff(text,text,text,boolean) to authenticated;

commit;

-- =====================================================================
--  AFTER RUNNING: create the first administrator
--  1. Supabase -> Authentication -> Users -> Add user (email + password)
--  2. Run this (change the email and name):
--
--     insert into public.staff_profiles (user_id, full_name, role)
--     select id, 'Your Name', 'admin' from auth.users where email = 'you@example.com'
--     on conflict (user_id) do update set role = 'admin', is_active = true;
-- =====================================================================
