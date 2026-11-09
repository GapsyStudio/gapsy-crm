/* Gapsy CRM · modules/dashboard.js — Головна (/app)
 * Розмітка: [data-element="dashboard"], [data-today], списки my-feedback / recent-docs / pins, форма data-form="pin".
 * v0.10 «Пульс агенції» (лише PM/admin, обгортка [data-pulse] з data-crm-role="pm,admin"):
 *   лічильники [data-pulse-count="risk|overdue|handoffs|active"],
 *   data-list="pulse-risk" — проєкти під ризиком (поля name, stage, due; бейдж risk), посилання на картку;
 *   data-list="workload" — люди (поля name, role, projects, open, overdue), найзавантаженіші вгорі.
 * v0.12 (PM/admin): data-list="renewals" — підписки з продовженням у найближчі 30 днів (поля name, price, when; is-red ≤ 7 днів),
 *   обгортка [data-renewals] ховається, якщо нічого немає. Лічильник [data-pulse-count="reviews"] — дизайн на погодженні.
 * v0.17 Головна під роль (CRM.homeRole(): designer, art, developer, pm, sales, admin).
 *   Модуль сам додає картки (класи з Designer: card, card_header, card_title, list, list_row, badge, list_title, list_meta):
 *     [data-home="today"]    «Сьогодні» для всіх: нагадування, правки з терміном, хендоффи, погодження, відпустки, ліди, ClickUp;
 *                            форма data-form="reminder" (title, due_on), дії reminder-done, open-reminder;
 *     [data-home="tasks"]    «Мої задачі в ClickUp» (Edge Function my-tasks, лише перегляд);
 *     [data-home="projects"] «Мої проєкти» (designer, art, developer);
 *     [data-home="reviews"]  «Чекають погодження» (art, admin);
 *     [data-home="leads"]    Sales: «Мої ліди» + модалка data-modal="lead" (форма data-form="lead"); PM/admin: «Ліди від Sales» (дії lead-take, lead-decline);
 *     [data-home="links"]    Sales: швидкі розділи з меню.
 *   Порядок блоків — ORDER нижче. Наявні блоки (пульс, баланс, правки й документи, закріплене) лише переставляються. */
CRM.module('dashboard', (root, { sb, user, render, onSubmit, modal, toast, badge, crumbs, time, date, name, can, action }) => {
  crumbs('Головна');
  const STATUS = CRM.FEEDBACK_STATUS;
  const ROLE_HOME = CRM.homeRole();
  const todayStr = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD за місцевим часом
  const daysFrom = (d) => Math.round((new Date(`${String(d).slice(0, 10)}T00:00:00`) - new Date(new Date().toDateString())) / 864e5);
  const short = (d) => date(d, { day: 'numeric', month: 'short' });
  const whenText = (d) => {
    const n = daysFrom(d);
    if (n < 0) return { text: `прострочено ${-n} дн.`, red: true };
    if (n === 0) return { text: 'сьогодні', red: false };
    if (n === 1) return { text: 'завтра', red: false };
    return { text: short(d), red: false };
  };

  const today = root.querySelector('[data-today]');
  if (today) {
    const t = new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
    today.textContent = t.charAt(0).toUpperCase() + t.slice(1);
  }

  // ---------- конструктор карток (ті самі класи, що в Designer) ----------
  const h = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
  function card(key, title, { link, linkText = 'Усі', empty = 'Порожньо', row = 'a', fields = ['title', 'meta'] } = {}) {
    const box = h('section', 'card');
    box.dataset.home = key;
    const head = h('div', 'card_header');
    head.append(h('div', 'card_title', title));
    const tools = h('div', 'home_tools');
    if (link) { const a = h('a', 'button is-text is-small', linkText); a.href = link; tools.append(a); }
    head.append(tools);
    const list = h('div', 'list');
    list.dataset.list = `home-${key}`;
    const tpl = h(row, 'list_row');
    tpl.dataset.template = '';
    if (row === 'a') tpl.href = '#';
    fields.forEach((f) => {
      const el = h('span', f === 'title' ? 'list_title' : f === 'meta' ? 'list_meta' : 'badge');
      el.dataset.field = f;
      tpl.append(el);
    });
    const sk = h('div', 'list_row'); sk.dataset.skeleton = ''; sk.append(h('div', 'skeleton'));
    const em = h('div', 'empty_state'); em.dataset.empty = ''; em.append(h('div', 'text-size-small', empty));
    list.append(tpl, sk, em);
    box.append(head, list);
    return box;
  }
  const blocks = {
    pulse: root.querySelector('[data-pulse]'),
    balance: root.querySelector('[data-element="leave-balance"]')?.closest('section'),
    work: root.querySelector('[data-list="my-feedback"]')?.closest('.grid-2col'),
    pins: root.querySelector('[data-list="pins"]')?.closest('section'),
  };

  // Порядок блоків на Головній під роль. Блоки, яких немає в списку ролі, ховаються.
  const ORDER = {
    designer:  ['today', 'tasks', 'projects', 'work', 'pins', 'balance'],
    art:       ['today', 'reviews', 'tasks', 'projects', 'work', 'pins', 'balance'],
    developer: ['today', 'tasks', 'projects', 'work', 'pins', 'balance'],
    pm:        ['today', 'leads', 'pulse', 'tasks', 'work', 'pins', 'balance'],
    sales:     ['today', 'leads', 'pins', 'links', 'tasks', 'balance'],
    admin:     ['today', 'pulse', 'reviews', 'leads', 'tasks', 'pins', 'work', 'balance'],
  };
  const order = ORDER[ROLE_HOME] || (can('staff') ? ORDER.designer : ['work', 'pins']);
  const make = {
    today: () => card('today', 'Сьогодні', { empty: 'На сьогодні все чисто', fields: ['kind', 'title', 'meta'] }),
    tasks: () => card('tasks', 'Мої задачі в ClickUp', { empty: 'Відкритих задач на тобі немає', fields: ['status', 'title', 'list', 'meta'] }),
    projects: () => card('projects', 'Мої проєкти', { link: '/projects', empty: 'Тебе ще не додали в жоден активний проєкт', fields: ['title', 'stage', 'meta', 'risk'] }),
    reviews: () => card('reviews', 'Чекають погодження', { link: '/reviews', empty: 'Усе погоджено', fields: ['title', 'project', 'meta'] }),
    leads: () => card('leads', ROLE_HOME === 'sales' ? 'Мої ліди' : 'Ліди від Sales', {
      empty: ROLE_HOME === 'sales' ? 'Передай першого клієнта в PM — тут буде видно, хто його взяв' : 'Нових лідів немає',
      fields: ['status', 'title', 'meta'], row: ROLE_HOME === 'sales' ? 'a' : 'div',
    }),
    links: () => card('links', 'Швидкі розділи', { empty: '—', fields: ['title', 'meta'] }),
  };
  const anchor = root.querySelector(':scope > [data-modal]');
  const header = root.querySelector('.page_header');
  Object.entries(blocks).forEach(([k, el]) => { if (el && !order.includes(k)) el.hidden = true; });
  let prev = header;
  order.forEach((k) => {
    let el = blocks[k];
    if (!el && make[k] && can('staff')) el = blocks[k] = make[k]();
    if (!el) return;
    if (k === 'pulse' && !can('pm,admin')) return;
    if (prev && prev.parentNode === root) prev.after(el); else root.insertBefore(el, anchor);
    prev = el;
  });
  root.dataset.homeRole = ROLE_HOME || '';

  // ---------- Сьогодні ----------
  // Кожне джерело повертає рядки { kind: [текст, колір], title, meta, red, href, rid, sort }; помилка одного не ламає інші.
  const todayRows = {};
  function drawToday() {
    const list = root.querySelector('[data-list="home-today"]');
    if (!list) return;
    const rows = Object.values(todayRows).flat().sort((a, b) => a.sort - b.sort);
    render(list, rows.slice(0, 12).map((r) => ({ ...r, pair: r.kind, kind: r.kind[0] })), (el, r) => {
      badge(el.querySelector('[data-field="kind"]'), 'k', { k: r.pair });
      el.querySelector('[data-field="meta"]')?.classList.toggle('is-red', !!r.red);
      if (r.href) {
        el.href = r.href;
        if (/^https?:/i.test(r.href)) { el.target = '_blank'; el.rel = 'noopener'; }
      } else el.removeAttribute('href');
      if (r.rid) {
        el.dataset.id = r.rid;
        const b = h('button', 'check_box today_check', '✓');
        b.type = 'button';
        b.dataset.action = 'reminder-done';
        b.title = 'Готово';
        b.setAttribute('aria-label', `Позначити «${r.title}» виконаним`);
        el.prepend(b);
      }
    });
    const more = rows.length - 12;
    const tail = root.querySelector('[data-home="today"] [data-today-more]');
    if (tail) tail.textContent = more > 0 ? `і ще ${more}` : '';
  }
  const put = (key, rows) => { todayRows[key] = rows; drawToday(); };
  const sortKey = (d) => (d ? daysFrom(d) : 99);

  // форма нагадування — під списком «Сьогодні»
  const todayBox = root.querySelector('[data-home="today"]');
  if (todayBox) {
    const add = h('button', 'button is-text is-small', '+ Нагадування');
    add.type = 'button';
    add.dataset.action = 'open-reminder';
    todayBox.querySelector('.home_tools').append(h('span', 'list_meta', ''), add);
    todayBox.querySelector('.home_tools .list_meta').dataset.todayMore = '';
    const form = h('form', 'today_add');
    form.dataset.form = 'reminder';
    form.hidden = true;
    form.innerHTML = '<input class="form-input" name="title" maxlength="200" required placeholder="Що нагадати собі?" aria-label="Нагадування">'
      + '<input class="form-input" name="due_on" type="date" aria-label="Коли">'
      + '<button class="button is-small" type="submit">Додати</button>';
    todayBox.append(form);
  }
  action('open-reminder', () => {
    const f = root.querySelector('[data-form="reminder"]');
    if (!f) return;
    f.hidden = !f.hidden;
    if (!f.hidden) { f.elements.due_on.value ||= todayStr(); f.elements.title.focus(); }
  });
  onSubmit('reminder', async (d, form) => {
    const title = (d.title || '').trim();
    if (!title) return;
    const { error } = await sb.from('reminders').insert({ title, due_on: /^\d{4}-\d{2}-\d{2}$/.test(d.due_on || '') ? d.due_on : todayStr() });
    if (error) throw error;
    form.reset();
    form.hidden = true;
    loadReminders();
  });
  action('reminder-done', async (el, e) => {
    e?.preventDefault?.();
    const id = el.closest('[data-id]')?.dataset.id;
    if (!id) return;
    el.closest('[data-rendered]')?.classList.add('is-done');
    const { error } = await sb.from('reminders').update({ done_at: new Date().toISOString() }).eq('id', id);
    if (error) return CRM.fail(error);
    loadReminders();
  });

  async function loadReminders() {
    // на 3 дні вперед, щоб бачити, що наближається; минулі невиконані — теж
    const to = new Date(Date.now() + 3 * 864e5).toLocaleDateString('sv');
    const { data, error } = await sb.from('reminders').select('id, title, due_on, url').is('done_at', null).lte('due_on', to).order('due_on');
    if (error) return console.error(error);
    put('reminders', data.map((r) => {
      const w = whenText(r.due_on);
      return { kind: ['Нагадування', 'is-yellow'], title: r.title, meta: w.text, red: w.red, href: r.url, rid: r.id, sort: sortKey(r.due_on) };
    }));
  }

  async function loadTodayWork() {
    const to = new Date(Date.now() + 2 * 864e5).toLocaleDateString('sv');
    // правки на мені з терміном до післязавтра
    const fb = sb.from('feedback').select('id, title, due_date, project:projects(name)')
      .neq('status', 'resolved').eq('assignee_id', user.id).not('due_date', 'is', null).lte('due_date', to).limit(10)
      .then(({ data, error }) => {
        if (error) return console.error(error);
        put('feedback', data.map((f) => {
          const w = whenText(f.due_date);
          return { kind: ['Правка', 'is-blue'], title: f.title, meta: [f.project?.name, w.text].filter(Boolean).join(' · '), red: w.red, href: `/feedback-item?id=${f.id}`, sort: sortKey(f.due_date) };
        }));
      });
    // хендоффи: розробнику — передані йому; дизайнеру — повернуті
    const ho = sb.from('handoffs').select('id, status, project_id, designer_id, developer_id, project:projects(name)')
      .or(`and(status.eq.submitted,developer_id.eq.${user.id}),and(status.eq.returned,designer_id.eq.${user.id})`)
      .then(({ data, error }) => {
        if (error) return console.error(error);
        put('handoffs', data.map((x) => ({
          kind: ['Хендофф', x.status === 'returned' ? 'is-red' : 'is-green'],
          title: x.status === 'returned' ? `Повернуто з питаннями: ${x.project?.name || ''}` : `Прийняти макет: ${x.project?.name || ''}`,
          meta: '', href: `/project?id=${x.project_id}#handoff`, sort: 0,
        })));
      });
    // мої проєкти з етапом, що закінчується сьогодні/завтра або прострочений
    const st = sb.from('project_members').select('project:projects(id, name, status, stage, stage_due, deadline)').eq('user_id', user.id)
      .then(({ data, error }) => {
        if (error) return console.error(error);
        const mine = (data || []).map((m) => m.project).filter(Boolean);
        put('stages', mine.map((p) => ({ p, r: CRM.projectRisk(p) })).filter((x) => x.r && x.r.days <= 1).map(({ p, r }) => ({
          kind: ['Етап', r.combo], title: `${p.name}: ${(CRM.STAGE[p.stage] || [p.stage])[0]}`,
          meta: whenText(r.date).text, red: r.days < 0, href: `/project?id=${p.id}`, sort: r.days,
        })));
        drawProjects(mine);
      });
    // погодження дизайну — арт-директору й admin (лише лічильник)
    const rv = (ROLE_HOME === 'art' || can('admin'))
      ? sb.from('design_reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending').then(({ count }) => {
        put('reviews', count ? [{ kind: ['Погодження', 'is-yellow'], title: `Дизайн чекає погодження: ${count}`, meta: '', href: '/reviews', sort: 1 }] : []);
      }) : null;
    // відпустки — тому, хто погоджує
    const lv = CRM.profile?.is_leave_approver || can('admin')
      ? sb.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').neq('user_id', user.id).then(({ count }) => {
        put('leave', count ? [{ kind: ['Відпустка', 'is-green'], title: `Запити на відпустку: ${count}`, meta: '', href: '/leave#approvals', sort: 1 }] : []);
      }) : null;
    await Promise.all([fb, ho, st, rv, lv]);
  }

  // ---------- Мої проєкти ----------
  function drawProjects(mine) {
    const list = root.querySelector('[data-list="home-projects"]');
    if (!list) return;
    const rows = mine.filter((p) => p.status === 'active')
      .map((p) => ({ ...p, risk: CRM.projectRisk(p) }))
      .sort((a, b) => (a.risk?.days ?? 99) - (b.risk?.days ?? 99) || a.name.localeCompare(b.name));
    render(list, rows.slice(0, 6).map((p) => ({
      ...p, title: p.name, stageKey: p.stage, stage: '', risk: '',
      meta: p.stage_due ? `етап до ${short(p.stage_due)}` : p.deadline ? `запуск ${short(p.deadline)}` : '',
    })), (el, p) => {
      el.href = `/project?id=${p.id}`;
      badge(el.querySelector('[data-field="stage"]'), p.stageKey || 'design', CRM.STAGE);
      const rb = el.querySelector('[data-field="risk"]');
      if (p.risk) badge(rb, 'r', { r: [p.risk.text, p.risk.combo] }); else rb?.remove();
    });
  }

  // ---------- Чекають погодження ----------
  async function loadReviews() {
    const list = root.querySelector('[data-list="home-reviews"]');
    if (!list) return;
    const { data, error } = await sb.from('design_reviews').select('id, title, version, created_at, project:projects(name)')
      .eq('status', 'pending').order('created_at').limit(6);
    if (error) return console.error(error);
    render(list, data.map((r) => ({
      ...r, title: r.version > 1 ? `${r.title} · v${r.version}` : r.title, project: r.project?.name || '', meta: time(r.created_at),
    })), (el, r) => {
      el.href = `/reviews?id=${r.id}`;
      el.querySelector('[data-field="project"]').className = 'list_meta';
    });
  }

  // ---------- Мої задачі в ClickUp ----------
  async function loadTasks() {
    const box = root.querySelector('[data-home="tasks"]');
    if (!box) return;
    const list = box.querySelector('[data-list="home-tasks"]');
    const empty = list.querySelector('[data-empty] .text-size-small');
    let res;
    try {
      res = await sb.functions.invoke('my-tasks', { body: {} });
    } catch (e) { res = { error: e }; }
    if (res.error || !res.data) {
      console.warn('[CRM] my-tasks', res.error);
      empty.textContent = 'Не вдалося отримати задачі з ClickUp. Спробуй пізніше.';
      return render(list, []);
    }
    if (!res.data.matched) {
      empty.textContent = 'Не знайшли тебе в ClickUp за поштою. Попроси адміна вказати твою ClickUp-пошту в профілі.';
      return render(list, []);
    }
    const tasks = res.data.tasks.map((t) => ({ ...t, url: /^https:\/\/app\.clickup\.com\//.test(t.url || '') ? t.url : 'https://app.clickup.com/' })).sort((a, b) => (a.due ? daysFrom(a.due) : 999) - (b.due ? daysFrom(b.due) : 999));
    render(list, tasks.slice(0, 8).map((t) => {
      const w = t.due ? whenText(t.due) : null;
      return { ...t, title: t.name, list: t.list, meta: w ? w.text : '', red: w?.red };
    }), (el, t) => {
      el.href = /^https:\/\/app\.clickup\.com\//.test(t.url || '') ? t.url : '#';
      el.target = '_blank'; el.rel = 'noopener';
      el.querySelector('[data-field="list"]').className = 'list_meta';
      el.querySelector('[data-field="meta"]')?.classList.toggle('is-red', !!t.red);
    });
    const more = h('a', 'button is-text is-small', 'Відкрити ClickUp');
    more.href = 'https://app.clickup.com/'; more.target = '_blank'; more.rel = 'noopener';
    const tools = box.querySelector('.home_tools');
    if (!tools.children.length) tools.append(more);
    // задачі з терміном сьогодні/прострочені — ще й у «Сьогодні»
    put('clickup', tasks.filter((t) => t.due && daysFrom(t.due) <= 0).slice(0, 5).map((t) => {
      const w = whenText(t.due);
      return { kind: ['ClickUp', ''], title: t.name, meta: w.text, red: w.red, href: t.url, sort: daysFrom(t.due) };
    }));
  }

  // ---------- Ліди (Sales ↔ PM) ----------
  const LEAD = { new: ['Новий', 'is-blue'], taken: ['У роботі', 'is-green'], declined: ['Відхилено', ''] };
  function leadModal() {
    if (document.querySelector('[data-modal="lead"]')) return;
    const w = h('div', 'modal_wrapper');
    w.dataset.modal = 'lead';
    w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-label', 'Передати лід у PM');
    w.innerHTML = '<div class="modal"><form class="modal_form" data-form="lead">'
      + '<div class="modal_header"><div class="card_title">Передати лід у PM</div><a href="#" class="icon_button" data-action="close" aria-label="Закрити">×</a></div>'
      + '<div class="modal_body">'
      + '<div class="form_field"><label class="field-label" for="lead-title">Що робимо</label><input class="form-input" id="lead-title" name="title" maxlength="160" required placeholder="Сайт на Webflow для студії йоги"></div>'
      + '<div class="form_field"><label class="field-label" for="lead-client">Клієнт</label><input class="form-input" id="lead-client" name="client" maxlength="160" placeholder="Компанія, контактна особа"></div>'
      + '<div class="form_field"><label class="field-label" for="lead-brief">Бриф</label><textarea class="form-input" id="lead-brief" name="brief" rows="4" maxlength="5000" placeholder="Що хоче клієнт, обсяг, референси, побажання"></textarea></div>'
      + '<div class="grid-2col"><div class="form_field"><label class="field-label" for="lead-budget">Бюджет</label><input class="form-input" id="lead-budget" name="budget" maxlength="120" placeholder="$5–7k"></div>'
      + '<div class="form_field"><label class="field-label" for="lead-deadline">Бажаний запуск</label><input class="form-input" id="lead-deadline" name="deadline" type="date"></div></div>'
      + '<div class="form_field"><label class="field-label" for="lead-links">Посилання</label><input class="form-input" id="lead-links" name="links" maxlength="2000" placeholder="Pipedrive, листування, бриф у Google Docs"></div>'
      + '</div><div class="modal_footer"><a href="#" class="button is-text is-small" data-action="close">Скасувати</a><button class="button is-small" type="submit">Передати</button></div>'
      + '</form></div>';
    root.append(w);
  }
  async function loadLeads() {
    const box = root.querySelector('[data-home="leads"]');
    const isSales = ROLE_HOME === 'sales';
    if (isSales && box) {
      leadModal();
      const add = h('a', 'button is-small', '+ Передати в PM');
      add.href = '#'; add.dataset.action = 'open:lead';
      box.querySelector('.home_tools').append(add);
    }
    let q = sb.from('leads').select('id, title, client, budget, brief, status, project_id, note, created_at').order('created_at', { ascending: false });
    q = isSales ? q.eq('created_by', user.id).limit(8) : q.eq('status', 'new').limit(10);
    const { data, error } = await q;
    if (error) return console.error(error);
    if (!isSales) {
      put('leads', data.length ? [{ kind: ['Лід', 'is-blue'], title: `Нові ліди від Sales: ${data.length}`, meta: '', href: '#leads', sort: 1 }] : []);
      if (box) box.hidden = !data.length;
    }
    if (!box) return;
    box.id = 'leads';
    render(box.querySelector('[data-list="home-leads"]'), data.map((l) => ({
      ...l, status: l.status,
      meta: [l.client, l.budget, isSales ? (l.note || time(l.created_at)) : (l.brief || '').slice(0, 90)].filter(Boolean).join(' · '),
    })), (el, l) => {
      badge(el.querySelector('[data-field="status"]'), l.status, LEAD);
      el.dataset.id = l.id;
      if (isSales) {
        if (l.project_id) el.href = `/project?id=${l.project_id}`; else el.removeAttribute('href');
        return;
      }
      const take = h('button', 'button is-small', 'Взяти'); take.type = 'button'; take.dataset.action = 'lead-take';
      const no = h('button', 'button is-text is-small', 'Відхилити'); no.type = 'button'; no.dataset.action = 'lead-decline';
      const acts = h('span', 'home_row-actions'); acts.append(no, take);
      el.append(acts);
    });
    if (location.hash === '#leads' && !box.hidden) requestAnimationFrame(() => box.scrollIntoView({ block: 'start' }));
  }
  onSubmit('lead', async (d, form) => {
    const title = (d.title || '').trim();
    if (!title) return toast('Напиши, що робимо');
    const t = (k) => (d[k] || '').trim() || null;
    const { error } = await sb.from('leads').insert({
      title, client: t('client'), brief: t('brief'), budget: t('budget'), links: t('links'),
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(d.deadline || '') ? d.deadline : null,
    });
    if (error) throw error;
    form.reset();
    modal.close();
    toast('Передано в PM');
    loadLeads();
  });
  async function decideLead(el, take) {
    const id = el.closest('[data-id]')?.dataset.id;
    if (!id) return;
    let reason = null;
    if (!take) {
      reason = prompt('Чому відхиляємо? Sales побачить коментар.');
      if (reason === null) return;
    }
    el.disabled = true;
    const { data, error } = await sb.rpc('lead_decide', { lead: id, take, reason });
    if (error) { el.disabled = false; return CRM.fail(error); }
    if (take && data) location.href = `/project?id=${data}`;
    else { toast('Лід відхилено'); loadLeads(); }
  }
  action('lead-take', (el) => decideLead(el, true));
  action('lead-decline', (el) => decideLead(el, false));

  // ---------- Швидкі розділи (Sales) ----------
  function drawLinks() {
    const list = root.querySelector('[data-list="home-links"]');
    if (!list) return;
    const HINT = { '/cases': 'кейси за форматом і доменом', '/showcase': 'роботи студії', '/access': 'сервіси й паролі', '/docs': 'шаблони, відповіді, процеси', '/leave': 'відпустки й лікарняні' };
    const rows = [...document.querySelectorAll('[data-nav]')]
      .map((a) => ({ title: a.textContent.trim(), url: a.getAttribute('href') }))
      .filter((r) => r.url && r.url !== '/app' && HINT[r.url]);
    render(list, rows.map((r) => ({ ...r, meta: HINT[r.url] })), (el, r) => { el.href = r.url; });
  }

  // Мої відкриті правки: я автор або виконавець
  async function loadFeedback() {
    const { data, error } = await sb.from('feedback')
      .select('id, title, status, project:projects(name)')
      .neq('status', 'resolved')
      .or(`author_id.eq.${user.id},assignee_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return console.error(error);
    render('my-feedback', data.map((f) => ({ ...f, project: f.project?.name || '' })), (el, f) => {
      el.href = `/feedback-item?id=${f.id}`;
      badge(el.querySelector('[data-field="status"]'), f.status, STATUS);
    });
  }

  // Нещодавно змінені документи бази знань
  sb.from('docs').select('id, title, icon, updated_at, notion_id').order('updated_at', { ascending: false }).limit(9)
    .then(({ data, error }) => {
      if (error) return console.error(error);
      data = data.filter((d) => !String(d.notion_id || '').startsWith('group:')).slice(0, 5); // групи — не документи
      render('recent-docs', data.map((d) => ({ ...d, icon: d.icon || '', meta: time(d.updated_at) })),
        (el, d) => { el.href = `/doc?id=${d.id}`; });
    });

  // ---------- Швидкий доступ (v0.16) ----------
  // Закріплене — сторінки CRM (проєкт, документ, правка, розділ…) або зовнішні посилання. Дані й кеш — у ядрі (CRM.pins).
  // Картка: підпис = тип сторінки або домен; × у кутку прибирає (раніше — лише ПКМ).
  function renderPins(data) {
    render('pins', data.map((p) => ({ ...p, host: CRM.pinLabel(p.url) })), (el, p) => {
      el.href = p.url;
      el.dataset.id = p.id;
      if (/^https?:/i.test(p.url)) { el.target = '_blank'; el.rel = 'noopener'; }
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'pin_remove';
      x.textContent = '×';
      x.setAttribute('aria-label', `Прибрати «${p.title}» зі швидкого доступу`);
      x.title = 'Прибрати';
      x.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); CRM.unpin(p.id); });
      el.append(x);
    });
  }
  document.addEventListener('crm:pins', (e) => renderPins(e.detail));
  const loadPins = () => CRM.pins().then(renderPins);

  // Модалка «Закріпити»: пошук по сторінках CRM угорі; вибір підставляє назву й адресу. Можна й просто вставити посилання.
  const pinForm = document.querySelector('[data-form="pin"]');
  if (pinForm && !pinForm.querySelector('[data-pin-search]')) {
    const body = pinForm.querySelector('.modal_body') || pinForm;
    const titleIn = pinForm.querySelector('[name="title"]');
    const urlIn = pinForm.querySelector('[name="url"]');
    if (urlIn) { urlIn.type = 'text'; urlIn.placeholder = 'https://… або сторінка CRM'; urlIn.autocomplete = 'off'; }
    const head = pinForm.closest('[data-modal]')?.querySelector('.card_title');
    if (head) head.textContent = 'Додати в швидкий доступ';
    const field = document.createElement('div');
    field.className = 'form_field';
    field.innerHTML = '<label class="field-label" for="pin-search">Сторінка CRM</label>'
      + '<input class="form-input" id="pin-search" type="search" autocomplete="off" data-pin-search placeholder="Проєкт, документ, правка, розділ…">'
      + '<div class="pin_results" data-pin-results role="listbox" aria-label="Сторінки CRM"></div>'
      + '<div class="pin_or">або встав посилання</div>';
    body.prepend(field);
    const search = field.querySelector('[data-pin-search]');
    const box = field.querySelector('[data-pin-results]');
    let auto = '';      // назва, яку підставили ми (якщо людина її не правила — замінюємо при новому виборі)
    let timer = null;
    let token = 0;
    const choose = (r) => {
      if (titleIn && (!titleIn.value.trim() || titleIn.value === auto)) titleIn.value = auto = r.title;
      if (urlIn) urlIn.value = r.url;
      box.querySelectorAll('.pin_option').forEach((o) => o.classList.toggle('is-active', o.dataset.url === r.url));
    };
    const show = async () => {
      const my = ++token;
      const pinned = new Set((await CRM.pins()).map((p) => p.url));
      const rows = (await CRM.searchPages(search.value)).filter((r) => !pinned.has(r.url)).slice(0, 7);
      if (my !== token) return; // поки чекали, запит змінився
      box.replaceChildren(...rows.map((r) => {
        const o = document.createElement('button');
        o.type = 'button';
        o.className = 'pin_option';
        o.dataset.url = r.url;
        o.setAttribute('role', 'option');
        o.innerHTML = '<span class="pin_option-title"></span><span class="pin_option-type"></span>';
        o.firstChild.textContent = r.title;
        o.lastChild.textContent = r.type;
        o.addEventListener('click', () => choose(r));
        return o;
      }));
      if (!rows.length) box.innerHTML = '<div class="pin_option-empty">Нічого не знайшли — встав посилання нижче</div>';
    };
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(show, 200); });
    search.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault(); // Enter у пошуку — вибрати перший варіант, а не надіслати форму
      box.querySelector('.pin_option')?.click();
    });
    // відкрили модалку — свіжий список розділів, фокус у пошуку
    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-action="open:pin"]')) return;
      search.value = ''; auto = '';
      show();
      setTimeout(() => search.focus(), 50);
    });
  }

  onSubmit('pin', async (data, form) => {
    await CRM.pin(data.title, data.url);
    form.reset();
    form.querySelectorAll('.pin_option.is-active').forEach((o) => o.classList.remove('is-active'));
    modal.close();
  });

  // ---------- Пульс агенції (PM/admin) ----------
  const ROLE = { designer: 'Дизайн', developer: 'Розробка', pm: 'PM', sales: 'Sales', admin: 'Адмін' };
  async function loadPulse() {
    if (!can('pm,admin') || !root.querySelector('[data-pulse]')) return;
    const [pr, fb, ho, mem, ppl] = await Promise.all([
      sb.from('projects').select('id, name, status, stage, stage_due, deadline').eq('status', 'active'),
      sb.from('feedback').select('id, assignee_id, due_date').neq('status', 'resolved'),
      sb.from('handoffs').select('id, status, submitted_at').eq('status', 'submitted'),
      sb.from('project_members').select('user_id, project_id'),
      sb.from('profiles').select('id, full_name, email, role').in('role', ['designer', 'developer', 'pm', 'admin']),
    ]);
    const err = [pr, fb, ho, mem, ppl].find((r) => r.error);
    if (err) return console.error(err.error);
    const active = pr.data;
    const risky = active.map((p) => ({ ...p, risk: CRM.projectRisk(p) })).filter((p) => p.risk).sort((a, b) => a.risk.days - b.risk.days);
    const overdue = fb.data.filter((f) => f.due_date && f.due_date < todayStr());
    const stuck = ho.data.filter((h) => h.submitted_at && Date.now() - new Date(h.submitted_at) > 2 * 864e5);
    const counts = { risk: risky.length, overdue: overdue.length, handoffs: stuck.length, active: active.length };
    const { count: reviewsCount } = await sb.from('design_reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    counts.reviews = reviewsCount || 0;
    root.querySelectorAll('[data-pulse-count]').forEach((el) => { el.textContent = counts[el.dataset.pulseCount] ?? '0'; });
    loadRenewals();

    render('pulse-risk', risky.slice(0, 6).map((p) => ({ ...p, due: short(p.risk.date) })), (el, p) => {
      el.href = `/project?id=${p.id}`;
      badge(el.querySelector('[data-field="stage"]'), p.stage || 'design', CRM.STAGE);
      badge(el.querySelector('[data-field="risk"]'), 'r', { r: [p.risk.text, p.risk.combo] });
    });

    const activeIds = new Set(active.map((p) => p.id));
    const rows = ppl.data.map((u) => ({
      id: u.id, name: name(u), role: ROLE[u.role] || u.role,
      projects: mem.data.filter((m) => m.user_id === u.id && activeIds.has(m.project_id)).length,
      open: fb.data.filter((f) => f.assignee_id === u.id).length,
      overdue: overdue.filter((f) => f.assignee_id === u.id).length,
    })).filter((u) => u.role !== 'Адмін' || u.projects || u.open)
      .sort((a, b) => b.overdue - a.overdue || b.open + b.projects - (a.open + a.projects));
    render('workload', rows, (el, u) => {
      el.querySelector('[data-field="overdue"]')?.toggleAttribute('hidden', !u.overdue);
    });
  }

  // ---------- Скоро продовження підписок (PM/admin) ----------
  async function loadRenewals() {
    const box = root.querySelector('[data-renewals]');
    if (!box) return;
    const from = new Date().toLocaleDateString('sv');
    const to = new Date(Date.now() + 30 * 864e5).toLocaleDateString('sv');
    const { data, error } = await sb.from('access_items').select('id, name, price, currency, period, renews_on')
      .gte('renews_on', from).lte('renews_on', to).order('renews_on');
    if (error) return console.error(error);
    box.hidden = !data.length;
    const PER = { month: ' / міс', year: ' / рік' };
    render('renewals', data.map((i) => ({
      ...i,
      price: i.price != null ? `${Number(i.price).toLocaleString('uk-UA')} ${i.currency}${PER[i.period] || ''}` : '',
      when: date(i.renews_on, { day: 'numeric', month: 'short' }),
    })), (el, i) => {
      if (el.tagName === 'A') el.href = `/access?id=${i.id}`;
      const days = Math.ceil((new Date(`${i.renews_on}T00:00:00`) - new Date(new Date().toDateString())) / 864e5);
      el.querySelector('[data-field="when"]')?.classList.toggle('is-red', days <= 7);
    });
  }

  loadFeedback();
  loadPins();
  loadPulse();
  if (can('staff')) {
    loadReminders();
    loadTodayWork();
    if (root.querySelector('[data-home="reviews"]')) loadReviews();
    if (root.querySelector('[data-home="leads"]') || can('pm,admin')) loadLeads();
    if (root.querySelector('[data-home="tasks"]')) loadTasks();
    drawLinks();
  }
});
