-- =====================================================================
-- Gapsy CRM · 002_modules.sql
-- Проєкти, Showcase, правки (+ скріни, коментарі), закріплене, сповіщення,
-- сховище файлів, пошук Cmd+K, редагування користувача адміном.
-- Запуск: Supabase → SQL Editor → вставити весь файл → Run (ОДИН раз).
-- Потребує 001_foundation.sql (ролі, has_role, is_staff).
-- =====================================================================

-- ---------- службове: updated_at ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- =====================================================================
-- ПРОЄКТИ — читає команда, змінюють PM і admin
-- =====================================================================
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  client      text,
  status      text not null default 'active' check (status in ('active', 'paused', 'done')),
  staging_url text,
  figma_url   text,
  created_by  uuid references public.profiles (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
alter table public.projects enable row level security;

create policy "projects: staff read"  on public.projects for select to authenticated using (public.is_staff());
create policy "projects: pm insert"   on public.projects for insert to authenticated with check (public.has_role('pm', 'admin'));
create policy "projects: pm update"   on public.projects for update to authenticated using (public.has_role('pm', 'admin'));
create policy "projects: pm delete"   on public.projects for delete to authenticated using (public.has_role('pm', 'admin'));

-- =====================================================================
-- SHOWCASE — читає команда, змінюють PM і admin
-- =====================================================================
create table public.showcase_items (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects (id) on delete set null,
  category    text not null check (category in ('site', 'figma', 'presentation', 'brand')),
  title       text not null,
  url         text not null,
  cover_path  text,                 -- шлях у Storage (bucket media), не URL
  is_best     boolean not null default false,
  sort        int not null default 0,
  created_by  uuid references public.profiles (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger showcase_touch before update on public.showcase_items
  for each row execute function public.touch_updated_at();
alter table public.showcase_items enable row level security;

create policy "showcase: staff read" on public.showcase_items for select to authenticated using (public.is_staff());
create policy "showcase: pm insert"  on public.showcase_items for insert to authenticated with check (public.has_role('pm', 'admin'));
create policy "showcase: pm update"  on public.showcase_items for update to authenticated using (public.has_role('pm', 'admin'));
create policy "showcase: pm delete"  on public.showcase_items for delete to authenticated using (public.has_role('pm', 'admin'));

-- =====================================================================
-- ПРАВКИ — створює й змінює статус уся команда; видаляє автор або PM/admin
-- =====================================================================
create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects (id) on delete set null,
  title       text not null,
  description text,
  page_url    text,
  status      text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  author_id   uuid not null references public.profiles (id) default auth.uid(),
  assignee_id uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index feedback_project_idx on public.feedback (project_id);
create index feedback_status_idx  on public.feedback (status);
create trigger feedback_touch before update on public.feedback
  for each row execute function public.touch_updated_at();
alter table public.feedback enable row level security;

create policy "feedback: staff read"   on public.feedback for select to authenticated using (public.is_staff());
create policy "feedback: staff insert" on public.feedback for insert to authenticated
  with check (public.is_staff() and author_id = auth.uid());
create policy "feedback: staff update" on public.feedback for update to authenticated using (public.is_staff());
create policy "feedback: owner delete" on public.feedback for delete to authenticated
  using (author_id = auth.uid() or public.has_role('pm', 'admin'));

create table public.feedback_files (
  id          uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback (id) on delete cascade,
  path        text not null,        -- шлях у Storage (bucket media)
  created_by  uuid references public.profiles (id) default auth.uid(),
  created_at  timestamptz not null default now()
);
alter table public.feedback_files enable row level security;
create policy "ffiles: staff read"   on public.feedback_files for select to authenticated using (public.is_staff());
create policy "ffiles: staff insert" on public.feedback_files for insert to authenticated with check (public.is_staff());
create policy "ffiles: owner delete" on public.feedback_files for delete to authenticated
  using (created_by = auth.uid() or public.has_role('pm', 'admin'));

create table public.feedback_comments (
  id          uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) default auth.uid(),
  body        text not null,
  created_at  timestamptz not null default now()
);
alter table public.feedback_comments enable row level security;
create policy "fcomments: staff read"   on public.feedback_comments for select to authenticated using (public.is_staff());
create policy "fcomments: staff insert" on public.feedback_comments for insert to authenticated
  with check (public.is_staff() and author_id = auth.uid());
create policy "fcomments: own delete"   on public.feedback_comments for delete to authenticated using (author_id = auth.uid());

-- =====================================================================
-- ЗАКРІПЛЕНЕ — кожен бачить і змінює лише своє
-- =====================================================================
create table public.pins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  title      text not null,
  url        text not null,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.pins enable row level security;
create policy "pins: own" on public.pins for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- СПОВІЩЕННЯ — створюються тригерами; користувач читає й позначає своє
-- =====================================================================
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,
  title      text not null,
  url        text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy "notif: own read"   on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notif: own update" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Створити сповіщення (не собі ж)
create or replace function public.notify(target uuid, kind text, msg text, link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if target is not null and target is distinct from auth.uid() then
    insert into public.notifications (user_id, type, title, url) values (target, kind, msg, link);
  end if;
end $$;

create or replace function public.feedback_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare link text := '/feedback-item?id=' || new.id;
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.assignee_id, 'feedback', 'Нова правка для вас: ' || new.title, link);
  else
    if new.assignee_id is distinct from old.assignee_id then
      perform public.notify(new.assignee_id, 'feedback', 'Вам призначили правку: ' || new.title, link);
    end if;
    if new.status is distinct from old.status then
      perform public.notify(new.author_id, 'feedback',
        'Статус правки «' || new.title || '»: ' ||
        case new.status when 'in_progress' then 'In Progress' when 'resolved' then 'Resolved' else 'New' end, link);
    end if;
  end if;
  return new;
end $$;
create trigger feedback_notify_trg after insert or update on public.feedback
  for each row execute function public.feedback_notify();

create or replace function public.comment_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare f public.feedback;
begin
  select * into f from public.feedback where id = new.feedback_id;
  perform public.notify(f.author_id, 'comment', 'Новий коментар: ' || f.title, '/feedback-item?id=' || f.id);
  if f.assignee_id is distinct from f.author_id then
    perform public.notify(f.assignee_id, 'comment', 'Новий коментар: ' || f.title, '/feedback-item?id=' || f.id);
  end if;
  return new;
end $$;
create trigger comment_notify_trg after insert on public.feedback_comments
  for each row execute function public.comment_notify();

-- Realtime для дзвіночка (у Supabase публікація вже існує)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- =====================================================================
-- ПОШУК Cmd+K — працює з правами користувача (RLS діє)
-- =====================================================================
create or replace function public.search_all(q text)
returns table (kind text, id uuid, title text, url text)
language sql stable set search_path = public as $$
  (select 'project', p.id, p.name, '/feedback?project=' || p.id
     from projects p where p.name ilike '%' || q || '%' or p.client ilike '%' || q || '%' limit 5)
  union all
  (select 'feedback', f.id, f.title, '/feedback-item?id=' || f.id
     from feedback f where f.title ilike '%' || q || '%' order by f.created_at desc limit 8)
  union all
  (select 'showcase', s.id, s.title, s.url
     from showcase_items s where s.title ilike '%' || q || '%' limit 5)
$$;

-- =====================================================================
-- АДМІНКА: роль + ClickUp task id одним викликом (лише admin)
-- =====================================================================
create or replace function public.admin_update_user(user_id uuid, new_role public.crm_role, clickup text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('admin') then
    raise exception 'Only admin can edit users';
  end if;
  update public.profiles
     set role = new_role, clickup_task_id = nullif(trim(clickup), '')
   where id = user_id;
end $$;

-- =====================================================================
-- STORAGE
--   media   — приватний: скріни правок, обкладинки Showcase (signed URL)
--   avatars — публічний: фото профілю, папка = id користувача
-- =====================================================================
insert into storage.buckets (id, name, public) values
  ('media', 'media', false),
  ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "media: staff read"   on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_staff());
create policy "media: staff upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_staff());
create policy "media: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (owner = auth.uid() or public.has_role('pm', 'admin')));

create policy "avatars: own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
