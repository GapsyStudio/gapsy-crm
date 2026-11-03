-- =====================================================================
-- Gapsy CRM · 004_feedback2_mywork.sql  (v0.4.0)
-- Правки 2.0: пріоритет, дедлайн, позначки на скрінах.
-- «Моя робота» нових таблиць не потребує: читає feedback, handoffs, project_members.
-- Запускати в Supabase → SQL Editor один раз. Повторний запуск безпечний.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Пріоритет і дедлайн правки
--    low → normal → high → urgent; дедлайн — дата без часу.
-- ---------------------------------------------------------------------
alter table public.feedback
  add column if not exists priority text not null default 'normal',
  add column if not exists due_date date;

do $$ begin
  alter table public.feedback
    add constraint feedback_priority_check check (priority in ('low', 'normal', 'high', 'urgent'));
exception when duplicate_object then null; end $$;

create index if not exists feedback_assignee_idx on public.feedback (assignee_id) where status <> 'resolved';
create index if not exists feedback_due_idx      on public.feedback (due_date)    where status <> 'resolved';

-- ---------------------------------------------------------------------
-- 2. Позначки на скрінах
--    x, y — частки ширини й висоти зображення (0..1), тож пін стоїть на місці
--    за будь-якого розміру екрана. Номер позначки рахує фронт за порядком створення.
-- ---------------------------------------------------------------------
create table if not exists public.feedback_marks (
  id          uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback (id) on delete cascade,
  file_id     uuid not null references public.feedback_files (id) on delete cascade,
  x           real not null check (x between 0 and 1),
  y           real not null check (y between 0 and 1),
  note        text not null check (length(trim(note)) between 1 and 500),
  done        boolean not null default false,
  created_by  uuid not null references public.profiles (id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists feedback_marks_feedback_idx on public.feedback_marks (feedback_id);
alter table public.feedback_marks enable row level security;

-- Читає й ставить уся команда; «виконано» перемикає теж уся команда (як статус правки);
-- текст і видалення — автор позначки або PM/admin.
drop policy if exists "marks: staff read"   on public.feedback_marks;
drop policy if exists "marks: staff insert" on public.feedback_marks;
drop policy if exists "marks: staff update" on public.feedback_marks;
drop policy if exists "marks: owner delete" on public.feedback_marks;

create policy "marks: staff read"   on public.feedback_marks for select to authenticated using (public.is_staff());
create policy "marks: staff insert" on public.feedback_marks for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid());
create policy "marks: staff update" on public.feedback_marks for update to authenticated using (public.is_staff());
create policy "marks: owner delete" on public.feedback_marks for delete to authenticated
  using (created_by = auth.uid() or public.has_role('pm', 'admin'));

-- Змінювати можна лише done і note; решта (файл, координати, автор) — незмінні.
revoke update on public.feedback_marks from authenticated;
grant  update (done, note) on public.feedback_marks to authenticated;

-- Текст чужої позначки міняти не можна навіть через update-політику
create or replace function public.marks_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.note is distinct from old.note
     and old.created_by <> auth.uid()
     and not public.has_role('pm', 'admin') then
    raise exception 'Only the author can edit the note';
  end if;
  return new;
end $$;
drop trigger if exists marks_guard_trg on public.feedback_marks;
create trigger marks_guard_trg before update on public.feedback_marks
  for each row execute function public.marks_guard();

-- ---------------------------------------------------------------------
-- 3. Сповіщення: виконавцю, коли пріоритет став urgent або змінився дедлайн
-- ---------------------------------------------------------------------
create or replace function public.feedback_meta_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare link text := '/feedback-item?id=' || new.id;
begin
  if new.assignee_id is null or new.assignee_id = auth.uid() then return new; end if;
  if new.priority = 'urgent' and old.priority is distinct from 'urgent' then
    perform public.notify(new.assignee_id, 'feedback', 'Терміново: ' || new.title, link);
  elsif new.due_date is distinct from old.due_date and new.due_date is not null then
    perform public.notify(new.assignee_id, 'feedback',
      'Дедлайн ' || to_char(new.due_date, 'DD.MM') || ': ' || new.title, link);
  end if;
  return new;
end $$;
drop trigger if exists feedback_meta_notify_trg on public.feedback;
create trigger feedback_meta_notify_trg after update of priority, due_date on public.feedback
  for each row execute function public.feedback_meta_notify();
