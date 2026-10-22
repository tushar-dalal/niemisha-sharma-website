-- Niemisha Sharma website: database, image storage and security.
-- Run this once in Supabase → SQL Editor → New query → paste → Run. It's safe to run again.
--
-- Who can do what:
--   • Visitors (not signed in) can read published content and see uploaded images. Nothing else.
--   • Only accounts listed in public.admins can add, edit or delete content and images.
--   Signing up is not enough to edit: an account must also be added to public.admins (step at the bottom).

-- ---------- admins ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "admins read own row" on public.admins;
create policy "admins read own row" on public.admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- ---------- content ----------
-- Site-wide content: one row per key ("site" for settings and page intros, "about" for the About page and CV).
create table if not exists public.site_content (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Sections of the art gallery (e.g. Painting, Cyanotype). Artworks belong to one section.
create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Artworks/series (kind = 'practice') and exhibitions (kind = 'curating').
create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  kind text not null check (kind in ('practice', 'curating')),
  section_id uuid references public.sections on delete set null,
  position int not null default 0,
  published boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Journal: writing, research notes, catalogue texts.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  published boolean not null default false,
  date date not null default current_date,
  position int not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;
alter table public.sections enable row level security;
alter table public.works enable row level security;
alter table public.posts enable row level security;

-- Everyone can read site content and sections.
drop policy if exists "read site content" on public.site_content;
create policy "read site content" on public.site_content for select using (true);
drop policy if exists "read sections" on public.sections;
create policy "read sections" on public.sections for select using (true);

-- Everyone can read published works and posts; admins can also read drafts.
drop policy if exists "read works" on public.works;
create policy "read works" on public.works for select using (published or public.is_admin());
drop policy if exists "read posts" on public.posts;
create policy "read posts" on public.posts for select using (published or public.is_admin());

-- Only admins can write.
drop policy if exists "admins write site content" on public.site_content;
create policy "admins write site content" on public.site_content for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins write sections" on public.sections;
create policy "admins write sections" on public.sections for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins write works" on public.works;
create policy "admins write works" on public.works for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins write posts" on public.posts;
create policy "admins write posts" on public.posts for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.site_content, public.sections, public.works, public.posts to anon, authenticated;
grant insert, update, delete on public.site_content, public.sections, public.works, public.posts to authenticated;
grant select on public.admins to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- image storage ----------
-- A public bucket: anyone can view an image by its address, only admins can upload, replace, list or delete.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists "media admins list" on storage.objects;
create policy "media admins list" on storage.objects for select to authenticated using (bucket_id = 'media' and public.is_admin());
drop policy if exists "media admins upload" on storage.objects;
create policy "media admins upload" on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
drop policy if exists "media admins update" on storage.objects;
create policy "media admins update" on storage.objects for update to authenticated using (bucket_id = 'media' and public.is_admin());
drop policy if exists "media admins delete" on storage.objects;
create policy "media admins delete" on storage.objects for delete to authenticated using (bucket_id = 'media' and public.is_admin());

-- ---------- make the owner an admin ----------
-- First create the owner's login in Supabase → Authentication → Users → Add user (email + password).
-- Then replace the email below with that address and run just this statement:
--
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'owner@example.com'
-- on conflict do nothing;
