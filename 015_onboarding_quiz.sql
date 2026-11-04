-- =====================================================================
-- Gapsy CRM · 015_onboarding_quiz.sql  (v0.15.0) — онбординг-квіз і запит на роль
--   * Новачок (роль pending) бачить сторінку /onboarding і групу бази знань «Старт».
--   * Маршрут: квіз по CRM (track 'crm') + квіз ролі ('designer' | 'developer' | 'pm').
--     Той, хто вже в команді й хоче іншу роль, проходить лише квіз нової ролі.
--   * Правильні відповіді в браузер не потрапляють: перевіряє quiz_submit у базі. Прохідний бал 80%, перездача без ліміту.
--   * Після проходження — role_request_create → admin погоджує (role_request_decide) і роль змінюється.
--   * Питання й документ «Онбординг розробника» — у 015b_onboarding_seed.sql (НЕ в публічний репо).
-- Запускати в Supabase → SQL Editor один раз. Повторний запуск безпечний.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Новачок читає групу «Старт» бази знань
-- ---------------------------------------------------------------------
create or replace function public.doc_in_group(doc uuid, group_key text)
returns boolean language sql stable security definer set search_path = public as $$
  with recursive up as (
    select id, parent_id, notion_id from public.docs where id = doc
    union all
    select d.id, d.parent_id, d.notion_id from public.docs d join up on d.id = up.parent_id
  )
  select exists (select 1 from up where notion_id = group_key)
$$;

drop policy if exists "docs: pending read start" on public.docs;
create policy "docs: pending read start" on public.docs for select to authenticated
  using (public.my_role() = 'pending' and public.doc_in_group(id, 'group:start'));

-- ---------------------------------------------------------------------
-- 2. Питання квізу
-- ---------------------------------------------------------------------
create table if not exists public.quiz_questions (
  id          uuid primary key default gen_random_uuid(),
  track       text not null check (track in ('crm', 'designer', 'developer', 'pm')),
  question    text not null check (length(trim(question)) between 3 and 500),
  options     text[] not null check (array_length(options, 1) between 2 and 6),
  correct     int not null check (correct >= 0),
  explanation text check (explanation is null or length(explanation) <= 1000),
  doc_id      uuid references public.docs (id) on delete set null,
  sort        int not null default 100,
  active      boolean not null default true,
  seed_key    text unique,                 -- для ідемпотентного seed
  created_at  timestamptz not null default now(),
  constraint quiz_correct_in_range check (correct < array_length(options, 1))
);
alter table public.quiz_questions enable row level security;
drop policy if exists "quiz: read active" on public.quiz_questions;
drop policy if exists "quiz: admin write" on public.quiz_questions;
create policy "quiz: read active" on public.quiz_questions for select to authenticated using (active or public.has_role('admin'));
create policy "quiz: admin write" on public.quiz_questions for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
-- колонку correct і пояснення браузер напряму не читає (лише через функції нижче)
revoke select on public.quiz_questions from authenticated;
grant select (id, track, question, options, doc_id, sort, active) on public.quiz_questions to authenticated;
grant insert, update, delete on public.quiz_questions to authenticated;

-- для Адмінки: питання з правильною відповіддю
create or replace function public.quiz_admin_list(t text default null)
returns setof public.quiz_questions language sql stable security definer set search_path = public as $$
  select * from public.quiz_questions
   where public.has_role('admin') and (t is null or track = t)
   order by track, sort, created_at
$$;

-- ---------------------------------------------------------------------
-- 3. Спроби
-- ---------------------------------------------------------------------
create table if not exists public.quiz_attempts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  track      text not null,
  score      int not null,
  total      int not null,
  passed     boolean not null,
  answers    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists quiz_attempts_user_idx on public.quiz_attempts (user_id, track, created_at desc);
alter table public.quiz_attempts enable row level security;
drop policy if exists "qa: read" on public.quiz_attempts;
create policy "qa: read" on public.quiz_attempts for select to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));
revoke insert, update, delete on public.quiz_attempts from authenticated;

/** Перевірити відповіді. answers = {"<question id>": <номер варіанта>, …}. Повертає бал і де помилки (без правильних варіантів). */
create or replace function public.quiz_submit(t text, answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  q record; total int := 0; score int := 0; mistakes jsonb := '[]'::jsonb; ok boolean; passed boolean;
begin
  if auth.uid() is null then raise exception 'Потрібен вхід'; end if;
  if t not in ('crm', 'designer', 'developer', 'pm') then raise exception 'Невідомий квіз'; end if;
  for q in select * from public.quiz_questions where track = t and active order by sort, created_at loop
    total := total + 1;
    ok := (answers ? q.id::text) and (answers ->> q.id::text) ~ '^\d+$' and (answers ->> q.id::text)::int = q.correct;
    if ok then score := score + 1;
    else mistakes := mistakes || jsonb_build_object('id', q.id, 'question', q.question, 'explanation', q.explanation, 'doc_id', q.doc_id);
    end if;
  end loop;
  if total = 0 then raise exception 'У цьому квізі ще немає питань'; end if;
  passed := score * 100 >= total * 80;
  insert into public.quiz_attempts (user_id, track, score, total, passed, answers)
  values (auth.uid(), t, score, total, passed, coalesce(answers, '{}'::jsonb));
  return jsonb_build_object('score', score, 'total', total, 'passed', passed, 'mistakes', mistakes);
end $$;

-- ---------------------------------------------------------------------
-- 4. Запит на роль
-- ---------------------------------------------------------------------
create table if not exists public.role_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  role          public.crm_role not null check (role in ('designer', 'developer', 'pm')),
  from_role     public.crm_role,
  note          text check (note is null or length(note) <= 1000),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by    uuid references public.profiles (id),
  decided_at    timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 1000),
  created_at    timestamptz not null default now()
);
create unique index if not exists role_requests_one_pending on public.role_requests (user_id) where status = 'pending';
alter table public.role_requests enable row level security;
drop policy if exists "rr: read" on public.role_requests;
create policy "rr: read" on public.role_requests for select to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));
revoke insert, update, delete on public.role_requests from authenticated;

/** Чи пройдено квізи для ролі (новачку — CRM + роль, у команді — лише роль). */
create or replace function public.quiz_ready(target public.crm_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.quiz_attempts a where a.user_id = auth.uid() and a.track = target::text and a.passed)
     and (public.my_role() <> 'pending'
          or exists (select 1 from public.quiz_attempts a where a.user_id = auth.uid() and a.track = 'crm' and a.passed))
$$;

create or replace function public.role_request_create(target public.crm_role, msg text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; who text; cur public.crm_role;
begin
  if auth.uid() is null then raise exception 'Потрібен вхід'; end if;
  if target not in ('designer', 'developer', 'pm') then raise exception 'Цю роль видає лише admin'; end if;
  select role, coalesce(nullif(full_name, ''), email) into cur, who from public.profiles where id = auth.uid();
  if cur = target then raise exception 'Ця роль у тебе вже є'; end if;
  if not public.quiz_ready(target) then raise exception 'Спершу пройди квізи'; end if;
  insert into public.role_requests (user_id, role, from_role, note) values (auth.uid(), target, cur, nullif(trim(msg), ''))
  returning id into rid;
  perform public.notify(p.id, 'role', who || ' просить роль ' || target::text || ' (квізи пройдено)', '/admin#role-requests')
     from public.profiles p where p.role = 'admin';
  return rid;
end $$;

create or replace function public.role_request_cancel(request uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.role_requests set status = 'cancelled' where id = request and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Запит не знайдено'; end if;
end $$;

drop function if exists public.role_request_decide(uuid, boolean, text);
create or replace function public.role_request_decide(request uuid, approve boolean, reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.role_requests;
begin
  if not public.has_role('admin') then raise exception 'Only admin'; end if;
  if not approve and coalesce(trim(reason), '') = '' then raise exception 'Comment required'; end if;
  update public.role_requests
     set status = case when approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(reason), '')
   where id = request and status = 'pending'
   returning * into r;
  if not found then raise exception 'Request not found or already decided'; end if;
  if approve then update public.profiles set role = r.role where id = r.user_id; end if;
  perform public.notify(r.user_id, 'role',
    case when approve then 'Твою роль погоджено: ' || r.role::text else 'Запит на роль відхилено: ' || coalesce(r.decision_note, '') end,
    case when approve then '/app' else '/onboarding' end);
end $$;

-- для Адмінки: запити з результатами квізів
create or replace function public.role_requests_admin()
returns table (id uuid, user_id uuid, full_name text, email text, avatar_url text, role text, from_role text, note text,
               status text, created_at timestamptz, crm_score text, role_score text)
language sql stable security definer set search_path = public as $$
  select r.id, r.user_id, p.full_name, p.email, p.avatar_url, r.role::text, r.from_role::text, r.note, r.status, r.created_at,
         (select a.score || '/' || a.total from public.quiz_attempts a where a.user_id = r.user_id and a.track = 'crm' and a.passed order by a.created_at desc limit 1),
         (select a.score || '/' || a.total from public.quiz_attempts a where a.user_id = r.user_id and a.track = r.role::text and a.passed order by a.created_at desc limit 1)
    from public.role_requests r join public.profiles p on p.id = r.user_id
   where public.has_role('admin') and r.status = 'pending'
   order by r.created_at
$$;

-- ---------------------------------------------------------------------
-- 5. Документ «Як користуватися Gapsy CRM» у групі «Старт» (на нього посилаються питання квізу CRM)
-- ---------------------------------------------------------------------
insert into public.docs (id, parent_id, title, icon, sort, notion_id, content)
values ('a1000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-000000000001', 'Як користуватися Gapsy CRM', '🧭', 5, 'crm:guide',
$json${"blocks":[
{"type":"paragraph","data":{"text":"Gapsy CRM — внутрішній інструмент агенції: проєкти, правки, база знань, відпустки й доступи в одному місці. Тут коротко про головне."}},
{"type":"header","data":{"text":"Навігація","level":2}},
{"type":"list","data":{"style":"unordered","meta":{},"items":[
 {"content":"<b>⌘K</b> (Ctrl+K) — пошук і швидкий перехід: проєкти, документи, правки, шрифти.","meta":{},"items":[]},
 {"content":"<b>Моя робота</b> — правки, призначені на тебе, передачі, що чекають на тебе, і твої проєкти.","meta":{},"items":[]},
 {"content":"Меню показує лише розділи, доступні твоїй ролі.","meta":{},"items":[]}]}},
{"type":"header","data":{"text":"Проєкти і правки","level":2}},
{"type":"list","data":{"style":"unordered","meta":{},"items":[
 {"content":"Кожна правка — окремий запис у розділі <b>Правки</b>: назва, сторінка, скрін і позначки прямо на скріні. Не в особистих повідомленнях.","meta":{},"items":[]},
 {"content":"Пріоритет правки задає дедлайн; статус (Нова → В роботі → Закрита) може змінювати вся команда.","meta":{},"items":[]},
 {"content":"У проєкті є етап і дати; «Під ризиком» означає, що до дати лишилось 3 дні або менше.","meta":{},"items":[]},
 {"content":"<b>Передача</b> (handoff): дизайнер передає макет за чеклістом, розробник або PM приймає чи повертає з коментарем.","meta":{},"items":[]}]}},
{"type":"header","data":{"text":"Погодження і Showcase","level":2}},
{"type":"list","data":{"style":"unordered","meta":{},"items":[
 {"content":"<b>Погодження</b>: дизайн погоджує арт-директор. Повернути на доопрацювання можна лише з коментарем.","meta":{},"items":[]},
 {"content":"<b>Showcase</b>: запропонувати роботу може кожен, публікують PM або admin.","meta":{},"items":[]}]}},
{"type":"header","data":{"text":"База знань","level":2}},
{"type":"paragraph","data":{"text":"Правила компанії, онбординг і інструкції — у розділі <b>База знань</b>. Група «Старт» — те, що треба прочитати першим. Правило діє, лише якщо воно записане."}},
{"type":"header","data":{"text":"Відпустки і лікарняні","level":2}},
{"type":"list","data":{"style":"unordered","meta":{},"items":[
 {"content":"Запит — на сторінці <b>Відпустки</b> → «Новий запит». Погоджує операційний директор.","meta":{},"items":[]},
 {"content":"Рахуються робочі дні: субота, неділя і свята компанії не віднімаються. 1 день = 8 год, можна взяти й частину дня.","meta":{},"items":[]},
 {"content":"Баланс береться з ClickUp: ліміт мінус затрекане.","meta":{},"items":[]}]}},
{"type":"header","data":{"text":"Доступи","level":2}},
{"type":"paragraph","data":{"text":"Логіни й паролі до сервісів лежать у розділі <b>Доступи</b> у зашифрованому сховищі. Показати їх може PM або admin; якщо тобі потрібен доступ — натисни «Попросити доступ». Ніколи не пиши паролі в чати, нотатки чи коментарі."}}
]}$json$::jsonb)
on conflict (id) do nothing;

commit;
