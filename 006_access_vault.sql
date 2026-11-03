-- =====================================================================
-- Gapsy CRM · 006_access_vault.sql  (v0.5.0)
-- «Доступи»: сервіси, на які в агенції є підписка, і курси / навчальні платформи.
--   * Список (назва, посилання, нотатка) бачить уся команда.
--   * Логін і пароль лежать у Supabase Vault ЗАШИФРОВАНИМИ. Розшифрувати може лише PM/admin
--     через функцію access_reveal; кожен перегляд пишеться в access_log.
--   * У таблицях і в бекапах (pg_dump у crm-backups) є лише id секрету й шифротекст.
--   Номери карток, CVV тощо сюди НЕ зберігаємо.
-- Запускати в Supabase → SQL Editor один раз (від postgres). Повторний запуск безпечний.
-- =====================================================================

create extension if not exists supabase_vault with schema vault;

-- ---------------------------------------------------------------------
-- 1. Сервіси й курси
-- ---------------------------------------------------------------------
create table if not exists public.access_items (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'service' check (kind in ('service', 'course')),
  name        text not null check (length(trim(name)) between 1 and 120),
  url         text check (url is null or url ~* '^https?://'),
  notes       text check (notes is null or length(notes) <= 1000),
  secret_id   uuid,                         -- id секрету у vault.secrets (сам секрет тут не зберігається)
  secret_set_at timestamptz,
  created_by  uuid references public.profiles (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists access_items_touch on public.access_items;
create trigger access_items_touch before update on public.access_items
  for each row execute function public.touch_updated_at();
alter table public.access_items enable row level security;

drop policy if exists "access: staff read"   on public.access_items;
drop policy if exists "access: staff insert" on public.access_items;
drop policy if exists "access: staff update" on public.access_items;
drop policy if exists "access: pm delete"    on public.access_items;
create policy "access: staff read"   on public.access_items for select to authenticated using (public.is_staff());
create policy "access: staff insert" on public.access_items for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid());
create policy "access: staff update" on public.access_items for update to authenticated using (public.is_staff());
create policy "access: pm delete"    on public.access_items for delete to authenticated using (public.has_role('pm', 'admin'));
-- secret_id і secret_set_at змінюють лише функції нижче
revoke insert, update on public.access_items from authenticated;
grant insert (id, kind, name, url, notes, created_by) on public.access_items to authenticated;
grant update (kind, name, url, notes) on public.access_items to authenticated;

-- ---------------------------------------------------------------------
-- 2. Журнал: хто і коли дивився чи змінював доступ (читає PM/admin, пишуть лише функції)
-- ---------------------------------------------------------------------
create table if not exists public.access_log (
  id         bigint generated always as identity primary key,
  item_id    uuid references public.access_items (id) on delete set null,
  item_name  text,
  user_id    uuid references public.profiles (id),
  action     text not null check (action in ('reveal', 'set', 'clear')),
  created_at timestamptz not null default now()
);
create index if not exists access_log_item_idx on public.access_log (item_id, created_at desc);
alter table public.access_log enable row level security;
drop policy if exists "alog: pm read" on public.access_log;
create policy "alog: pm read" on public.access_log for select to authenticated using (public.has_role('pm', 'admin'));
revoke insert, update, delete on public.access_log from authenticated, anon;

-- ---------------------------------------------------------------------
-- 3. Функції доступу (security definer: лише вони торкаються vault)
-- ---------------------------------------------------------------------
-- Записати / замінити доступ. Порожній пароль = лишити старий.
create or replace function public.access_set_secret(item uuid, login text, password text, extra text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  it public.access_items;
  old jsonb := '{}'::jsonb;
  payload text;
begin
  if not public.has_role('pm', 'admin') then raise exception 'Only PM or admin can set access'; end if;
  select * into it from public.access_items where id = item for update;
  if not found then raise exception 'Item not found'; end if;
  if it.secret_id is not null then
    select coalesce(decrypted_secret, '{}')::jsonb into old from vault.decrypted_secrets where id = it.secret_id;
  end if;
  payload := jsonb_build_object(
    'login',    coalesce(nullif(trim(login), ''), old ->> 'login'),
    'password', coalesce(nullif(password, ''), old ->> 'password'),
    'extra',    coalesce(nullif(trim(extra), ''), old ->> 'extra')
  )::text;
  if it.secret_id is null then
    update public.access_items
       set secret_id = vault.create_secret(payload, 'access:' || item::text, 'Gapsy CRM access item'),
           secret_set_at = now()
     where id = item;
  else
    perform vault.update_secret(it.secret_id, payload);
    update public.access_items set secret_set_at = now() where id = item;
  end if;
  insert into public.access_log (item_id, item_name, user_id, action) values (item, it.name, auth.uid(), 'set');
end $$;

-- Показати доступ (логується кожен виклик)
create or replace function public.access_reveal(item uuid)
returns table (login text, password text, extra text)
language plpgsql security definer set search_path = '' as $$
declare it public.access_items;
begin
  if not public.has_role('pm', 'admin') then raise exception 'Only PM or admin can view access'; end if;
  select * into it from public.access_items where id = item;
  if not found or it.secret_id is null then return; end if;
  insert into public.access_log (item_id, item_name, user_id, action) values (item, it.name, auth.uid(), 'reveal');
  return query
    select (s.decrypted_secret::jsonb ->> 'login'), (s.decrypted_secret::jsonb ->> 'password'), (s.decrypted_secret::jsonb ->> 'extra')
      from vault.decrypted_secrets s where s.id = it.secret_id;
end $$;

-- Прибрати доступ
create or replace function public.access_clear_secret(item uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare it public.access_items;
begin
  if not public.has_role('pm', 'admin') then raise exception 'Only PM or admin can clear access'; end if;
  select * into it from public.access_items where id = item for update;
  if not found or it.secret_id is null then return; end if;
  delete from vault.secrets where id = it.secret_id;
  update public.access_items set secret_id = null, secret_set_at = null where id = item;
  insert into public.access_log (item_id, item_name, user_id, action) values (item, it.name, auth.uid(), 'clear');
end $$;

-- Видалили сервіс → видаляємо і його секрет
create or replace function public.access_items_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.secret_id is not null then delete from vault.secrets where id = old.secret_id; end if;
  return old;
end $$;
drop trigger if exists access_items_cleanup_trg on public.access_items;
create trigger access_items_cleanup_trg after delete on public.access_items
  for each row execute function public.access_items_cleanup();

revoke all on function public.access_set_secret(uuid, text, text, text) from public, anon;
revoke all on function public.access_reveal(uuid) from public, anon;
revoke all on function public.access_clear_secret(uuid) from public, anon;
revoke all on function public.access_items_cleanup() from public, anon, authenticated;
grant execute on function public.access_set_secret(uuid, text, text, text) to authenticated;
grant execute on function public.access_reveal(uuid) to authenticated;
grant execute on function public.access_clear_secret(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Пошук Cmd+K: + доступи (лише назви; решта як у 005)
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
  (select 'access', a.id, a.name, '/access?id=' || a.id
     from access_items a where a.name ilike '%' || q || '%' limit 4)
  union all
  (select 'showcase', s.id, s.title, s.url
     from showcase_items s where s.title ilike '%' || q || '%' limit 4)
$$;
