-- =====================================================================
-- Gapsy CRM · 005_moodboard_fonts.sql  (v0.5.0)
-- Мудборд проєкту (картинки й посилання) і реєстр шрифтів з ліцензіями.
-- Права: усе читає й редагує вся команда (staff). Клієнти не бачать нічого.
-- Файли — у приватному bucket media: moodboard/<uid>/…, fonts/<uid>/…
-- Запускати в Supabase → SQL Editor один раз. Повторний запуск безпечний.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Мудборд: кожен референс належить проєкту
--    image — картинка в Storage (path); link — зовнішнє посилання (url)
-- ---------------------------------------------------------------------
create table if not exists public.moodboard_items (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  kind        text not null check (kind in ('image', 'link')),
  path        text,
  url         text check (url is null or url ~* '^https?://'),
  title       text check (title is null or length(title) <= 200),
  created_by  uuid not null references public.profiles (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint moodboard_kind_payload check (
    (kind = 'image' and path is not null) or (kind = 'link' and url is not null)
  )
);
create index if not exists moodboard_project_idx on public.moodboard_items (project_id, created_at desc);
alter table public.moodboard_items enable row level security;

drop policy if exists "mood: staff read"   on public.moodboard_items;
drop policy if exists "mood: staff insert" on public.moodboard_items;
drop policy if exists "mood: staff update" on public.moodboard_items;
drop policy if exists "mood: staff delete" on public.moodboard_items;
create policy "mood: staff read"   on public.moodboard_items for select to authenticated using (public.is_staff());
create policy "mood: staff insert" on public.moodboard_items for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid());
create policy "mood: staff update" on public.moodboard_items for update to authenticated using (public.is_staff());
create policy "mood: staff delete" on public.moodboard_items for delete to authenticated using (public.is_staff());
-- змінювати можна лише підпис; тип, файл і автор незмінні
revoke update on public.moodboard_items from authenticated;
grant  update (title) on public.moodboard_items to authenticated;

-- ---------------------------------------------------------------------
-- 2. Шрифти
--    license: free | commercial | trial | unknown
--    allowed: де ліцензія дозволяє використання — підмножина {desktop, web, app}
--    owner:   чия ліцензія — agency | client
-- ---------------------------------------------------------------------
create table if not exists public.fonts (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(trim(name)) between 1 and 120),
  foundry          text,
  license          text not null default 'unknown' check (license in ('free', 'commercial', 'trial', 'unknown')),
  allowed          text[] not null default '{}' check (allowed <@ array['desktop', 'web', 'app']::text[]),
  owner            text not null default 'agency' check (owner in ('agency', 'client')),
  pageviews_limit  integer check (pageviews_limit is null or pageviews_limit > 0),
  source_url       text check (source_url is null or source_url ~* '^https?://'),
  license_path     text,                 -- файл ліцензії (PDF тощо) у media
  notes            text,
  created_by       uuid references public.profiles (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
drop trigger if exists fonts_touch on public.fonts;
create trigger fonts_touch before update on public.fonts
  for each row execute function public.touch_updated_at();
alter table public.fonts enable row level security;

-- Накреслення: woff2 / woff / ttf / otf у media
create table if not exists public.font_files (
  id          uuid primary key default gen_random_uuid(),
  font_id     uuid not null references public.fonts (id) on delete cascade,
  path        text not null,
  filename    text not null,
  weight      smallint not null default 400 check (weight between 100 and 900),
  style       text not null default 'normal' check (style in ('normal', 'italic')),
  created_by  uuid references public.profiles (id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists font_files_font_idx on public.font_files (font_id);
alter table public.font_files enable row level security;

-- Де використано
create table if not exists public.font_projects (
  font_id    uuid not null references public.fonts (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  primary key (font_id, project_id)
);
create index if not exists font_projects_project_idx on public.font_projects (project_id);
alter table public.font_projects enable row level security;

do $$
declare t text;
begin
  foreach t in array array['fonts', 'font_files', 'font_projects'] loop
    execute format('drop policy if exists "%s: staff all" on public.%I', t, t);
    execute format('create policy "%s: staff all" on public.%I for all to authenticated
                    using (public.is_staff()) with check (public.is_staff())', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Пошук Cmd+K: + шрифти (решта як у 003)
-- ---------------------------------------------------------------------
create or replace function public.search_all(q text)
returns table (kind text, id uuid, title text, url text)
language sql stable set search_path = public as $$
  (select 'project', p.id, p.name, '/project?id=' || p.id
     from projects p where p.name ilike '%' || q || '%' or p.client ilike '%' || q || '%' limit 5)
  union all
  (select 'snippet', s.id, s.title, '/snippet?id=' || s.id
     from snippets s
    where s.title ilike '%' || q || '%' or s.description ilike '%' || q || '%'
       or exists (select 1 from unnest(s.tags) t where t ilike q || '%')
    order by s.updated_at desc limit 6)
  union all
  (select 'feedback', f.id, f.title, '/feedback-item?id=' || f.id
     from feedback f where f.title ilike '%' || q || '%' order by f.created_at desc limit 6)
  union all
  (select 'font', fo.id, fo.name, '/fonts?id=' || fo.id
     from fonts fo where fo.name ilike '%' || q || '%' or fo.foundry ilike '%' || q || '%' limit 4)
  union all
  (select 'showcase', s.id, s.title, s.url
     from showcase_items s where s.title ilike '%' || q || '%' limit 4)
$$;
