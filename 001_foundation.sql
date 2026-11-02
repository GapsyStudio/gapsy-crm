-- =====================================================================
-- Gapsy CRM · 001_foundation.sql
-- Профілі, ролі, RLS. Запускати один раз: Supabase → SQL Editor → Run.
-- Пара на фронті: src/crm-core.js (читає profiles.role).
-- =====================================================================

-- Ролі. 'pending' — новий акаунт без доступу, поки адмін не призначить роль.
create type public.crm_role as enum ('pending', 'client', 'designer', 'developer', 'pm', 'admin');

create table public.profiles (
  id              uuid primary key references auth.users on delete cascade,
  email           text not null,
  full_name       text,
  avatar_url      text,
  role            public.crm_role not null default 'pending',
  clickup_task_id text,        -- картка людини в ClickUp (облік відпусток/часу), заповнює адмін
  created_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------
-- Хелпери для RLS (security definer, щоб політики profiles не зациклювались)
-- ---------------------------------------------------------------------
create or replace function public.my_role()
returns public.crm_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- has_role('admin','pm') → true, якщо роль поточного користувача в списку
create or replace function public.has_role(variadic roles public.crm_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.my_role() = any(roles), false)
$$;

-- Команда агенції (усі, крім client і pending)
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_role('designer', 'developer', 'pm', 'admin')
$$;

-- ---------------------------------------------------------------------
-- Профіль створюється автоматично при реєстрації (email або Google)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Опційно: пускати лише корпоративні адреси. Розкоментуй і впиши домен.
  -- if new.email not ilike '%@gapsy.studio' then
  --   raise exception 'Only company accounts are allowed';
  -- end if;

  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- RLS для profiles
-- ---------------------------------------------------------------------
create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "profiles: staff read all"
  on public.profiles for select to authenticated
  using (public.is_staff());

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Користувач може змінити лише ім'я та аватар. Роль — тільки через set_user_role().
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- Зміна ролі (тільки admin). Виклик з фронту: CRM.sb.rpc('set_user_role', {...})
-- ---------------------------------------------------------------------
create or replace function public.set_user_role(user_id uuid, new_role public.crm_role)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'Only admin can change roles';
  end if;
  update public.profiles set role = new_role where id = user_id;
end
$$;

-- ---------------------------------------------------------------------
-- ПЕРШИЙ АДМІН: після свого першого входу запусти окремо (впиши свій email)
-- update public.profiles set role = 'admin' where email = 'you@example.com';
-- ---------------------------------------------------------------------
