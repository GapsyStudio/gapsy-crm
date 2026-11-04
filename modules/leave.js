/* Gapsy CRM · modules/leave.js — Відпустки (/leave), v0.13.
 * Баланс малює окремий модуль leave-balance. Тут: запит, мої запити, погодження, команда, свята.
 * Розмітка: [data-element="leave"]
 *   кнопка data-action="open:leave-new"; модалка data-modal="leave-new" з формою data-form="leave-new":
 *     select name="kind" data-options="leave-kind"; input[type=date] start_date, end_date;
 *     [data-leave-hours-field] з input name="hours" (лише для одного дня, 1–8 год); підказки [data-leave-preview], [data-leave-warn].
 *   мої запити data-list="leave-mine" (period, type, days, status, comment; дія leave-cancel).
 *   для погоджувача/admin ([data-leave-approver], решті ховається):
 *     data-list="leave-approvals" (user, avatar, period, type, days, comment; дії leave-approve, leave-reject);
 *     data-list="leave-tracking" — погоджене, ще не внесене в ClickUp (user, period, type, days; [data-clickup-link]; дія leave-tracked);
 *     data-list="leave-team" — баланс команди (user, avatar, vacation, sick, note).
 *   свята (admin): data-list="holidays" (day, title; дія holiday-delete), форма data-form="holiday" (day, title).
 * Правила: дні робочі (без сб/нд і свят), 1 день = 8 год — рахує база (тригер), тут лише прев'ю.
 * Відпустку погоджують щонайменше за 2 тижні, про лікарняний — щонайменше за день (попередження, не блок). */
CRM.module('leave', async (root, CRM) => {
  const { sb, user, render, onSubmit, modal, toast, action, badge, name, can } = CRM;
  const KIND = { vacation: ['Відпустка', 'is-blue'], sick: ['Лікарняний', 'is-yellow'] };
  const STATUS = { pending: ['Очікує', 'is-yellow'], approved: ['Погоджено', 'is-green'], rejected: ['Відхилено', 'is-red'], cancelled: ['Скасовано', ''] };
  CRM.optionLists['leave-kind'] = Object.entries(KIND).map(([v, [t]]) => [v, t]);
  const approver = !!CRM.profile?.is_leave_approver || can('admin');
  const iso = (d) => d.toLocaleDateString('sv');
  const parse = (s) => new Date(`${s}T00:00:00`);
  const today = iso(new Date());
  let holidays = new Set();
  let mine = [];
  let summary = null;

  // ---------- форматування ----------
  const fmt = (d, o) => parse(d).toLocaleDateString('uk-UA', o);
  function period(a, b) {
    if (a === b) return fmt(a, { day: 'numeric', month: 'long' });
    const A = parse(a); const B = parse(b);
    if (A.getMonth() === B.getMonth() && A.getFullYear() === B.getFullYear()) return `${A.getDate()}–${fmt(b, { day: 'numeric', month: 'long' })}`;
    return `${fmt(a, { day: 'numeric', month: 'short' })} – ${fmt(b, { day: 'numeric', month: 'short' })}`;
  }
  const amount = (h) => (Number(h) % 8 === 0 ? `${Number(h) / 8} дн` : `${Number(h).toLocaleString('uk-UA')} год`);
  const leftDays = (lim, used, planned) => Math.round(((Number(lim) - Number(used) - Number(planned)) / 8) * 10) / 10;
  function workdays(a, b) {
    let n = 0;
    for (let d = parse(a); d <= parse(b); d.setDate(d.getDate() + 1)) {
      const wd = d.getDay();
      if (wd !== 0 && wd !== 6 && !holidays.has(iso(d))) n++;
    }
    return n;
  }

  // ---------- дані ----------
  async function loadHolidays() {
    const { data } = await sb.from('company_holidays').select('day, title').gte('day', `${new Date().getFullYear() - 1}-01-01`).order('day');
    holidays = new Set((data || []).map((h) => h.day));
    render('holidays', (data || []).map((h) => ({ ...h, id: h.day, day_label: fmt(h.day, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) })),
      (el, h) => { el.dataset.id = h.day; });
  }
  async function loadSummary() {
    const { data } = await sb.rpc('leave_summary');
    summary = data || [];
    return summary;
  }

  async function loadMine() {
    const { data, error } = await sb.from('leave_requests').select('*').eq('user_id', user.id).order('start_date', { ascending: false }).limit(50);
    if (error) return CRM.fail(error);
    mine = data;
    render('leave-mine', data.map((r) => ({
      ...r, period: period(r.start_date, r.end_date), type: KIND[r.kind][0], days: amount(r.hours),
      comment: r.decision_note || r.comment || '—',
    })), (el, r) => {
      el.dataset.id = r.id;
      badge(el.querySelector('[data-field="type"]'), r.kind, KIND);
      badge(el.querySelector('[data-field="status"]'), r.status, STATUS);
      const cancellable = r.status === 'pending' || (r.status === 'approved' && r.start_date > today && !r.tracked);
      el.querySelector('[data-action="leave-cancel"]')?.toggleAttribute('hidden', !cancellable);
    });
  }

  async function loadApprover() {
    const blocks = root.querySelectorAll('[data-leave-approver]');
    blocks.forEach((b) => { b.hidden = !approver; });
    if (!approver) return;
    const [{ data: reqs, error }, { data: bal }] = await Promise.all([
      sb.from('leave_requests').select('*, person:profiles!leave_requests_user_id_fkey(full_name, email, avatar_url)')
        .in('status', ['pending', 'approved']).order('start_date'),
      sb.from('leave_balances').select('user_id, vacation_task_id, sick_task_id'),
    ]);
    if (error) return CRM.fail(error);
    const tasks = Object.fromEntries((bal || []).map((b) => [b.user_id, b]));
    const byUser = Object.fromEntries((summary || []).map((s) => [s.user_id, s]));
    const row = (r) => ({ ...r, user: name(r.person), avatar: r.person?.avatar_url || '', period: period(r.start_date, r.end_date), type: KIND[r.kind][0], days: amount(r.hours) });
    render('leave-approvals', reqs.filter((r) => r.status === 'pending').map((r) => {
      const s = byUser[r.user_id];
      const left = s ? (r.kind === 'vacation' ? leftDays(s.vacation_limit_h, s.vacation_used_h, s.vacation_planned_h) : leftDays(s.sick_limit_h, s.sick_used_h, s.sick_planned_h)) : null;
      const warn = [];
      if (left !== null && Number(r.hours) / 8 > left) warn.push(`більше за залишок (${left.toLocaleString('uk-UA')} дн)`);
      const ahead = Math.round((parse(r.start_date) - parse(r.created_at.slice(0, 10))) / 864e5);
      if (r.kind === 'vacation' && ahead < 14) warn.push(`подано за ${Math.max(ahead, 0)} дн`);
      return { ...row(r), comment: [r.comment, warn.length ? `⚠ ${warn.join(', ')}` : ''].filter(Boolean).join(' · ') || '' };
    }), (el, r) => { el.dataset.id = r.id; badge(el.querySelector('[data-field="type"]'), r.kind, KIND); });
    render('leave-tracking', reqs.filter((r) => r.status === 'approved' && !r.tracked).map(row), (el, r) => {
      el.dataset.id = r.id;
      badge(el.querySelector('[data-field="type"]'), r.kind, KIND);
      const t = tasks[r.user_id]?.[r.kind === 'vacation' ? 'vacation_task_id' : 'sick_task_id'];
      const a = el.querySelector('[data-clickup-link]');
      if (a) { a.hidden = !t; if (t) { a.href = `https://app.clickup.com/t/${encodeURIComponent(t)}`; a.target = '_blank'; a.rel = 'noopener'; } }
    });
    render('leave-team', (summary || []).map((s) => ({
      ...s, user: name(s), avatar: s.avatar_url || '',
      vacation: `${leftDays(s.vacation_limit_h, s.vacation_used_h, s.vacation_planned_h).toLocaleString('uk-UA')} з ${Number(s.vacation_limit_h) / 8}`,
      sick: `${leftDays(s.sick_limit_h, s.sick_used_h, s.sick_planned_h).toLocaleString('uk-UA')} з ${Number(s.sick_limit_h) / 8}`,
      note: !s.synced_at ? '' : !s.matched ? 'Немає задачі в ClickUp — перевір пошту в Адмінці' : '',
    })), (el, s) => { el.dataset.id = s.user_id; });
  }

  async function reloadAll() {
    await loadSummary();
    await Promise.all([loadMine(), loadApprover()]);
  }

  // ---------- форма запиту ----------
  const form = () => document.querySelector('[data-form="leave-new"]');
  function preview() {
    const f = form();
    if (!f) return;
    const { kind, start_date: s, end_date: e } = f.elements;
    if (s?.value && e && (!e.value || e.value < s.value)) e.value = s.value;
    const single = s?.value && e?.value && s.value === e.value;
    const hoursField = f.querySelector('[data-leave-hours-field]');
    if (hoursField) hoursField.hidden = !single;
    const out = f.querySelector('[data-leave-preview]');
    const warn = f.querySelector('[data-leave-warn]');
    const msgs = [];
    let text = 'Обери дати';
    if (s?.value && e?.value) {
      const n = workdays(s.value, e.value);
      const h = single && f.elements.hours?.value ? Math.min(Math.max(Number(f.elements.hours.value) || 8, 1), 8) : n * 8;
      text = n ? `${n} ${n === 1 ? 'робочий день' : n < 5 ? 'робочі дні' : 'робочих днів'} · ${h.toLocaleString('uk-UA')} год` : 'У цих датах немає робочих днів';
      const me = (summary || []).find((x) => x.user_id === user.id);
      if (me && n) {
        const left = kind?.value === 'sick' ? leftDays(me.sick_limit_h, me.sick_used_h, me.sick_planned_h) : leftDays(me.vacation_limit_h, me.vacation_used_h, me.vacation_planned_h);
        if (h / 8 > left) msgs.push(`Це більше, ніж лишилось (${left.toLocaleString('uk-UA')} дн). Запит можна подати, вирішить погоджувач.`);
      }
      const ahead = Math.round((parse(s.value) - parse(today)) / 864e5);
      if (kind?.value !== 'sick' && ahead < 14) msgs.push('Відпустку погоджують щонайменше за 2 тижні.');
      if (kind?.value === 'sick' && ahead < 1) msgs.push('Про лікарняний попереджай щонайменше за день, коли це можливо.');
    }
    if (out) out.textContent = text;
    if (warn) { warn.textContent = msgs.join(' '); warn.hidden = !msgs.length; }
  }
  document.addEventListener('input', (e) => { if (e.target.closest('[data-form="leave-new"]')) preview(); });
  document.addEventListener('change', (e) => { if (e.target.closest('[data-form="leave-new"]')) preview(); });
  root.querySelector('[data-action="open:leave-new"]')?.addEventListener('click', () => {
    setTimeout(async () => { await CRM.fillSelects(document.querySelector('[data-modal="leave-new"]')); const f = form(); if (f?.elements.start_date) f.elements.start_date.min = ''; preview(); }, 0);
  });

  onSubmit('leave-new', async (d, f) => {
    if (!d.start_date || !d.end_date) return toast('Обери дати');
    if (d.end_date < d.start_date) return toast('Кінець раніше за початок');
    if (!workdays(d.start_date, d.end_date)) return toast('У цих датах немає робочих днів');
    const row = { kind: d.kind || 'vacation', start_date: d.start_date, end_date: d.end_date, comment: (d.comment || '').trim() || null, hours: 8 };
    if (d.start_date === d.end_date && d.hours) row.hours = Math.min(Math.max(Number(d.hours) || 8, 1), 8);
    const { error } = await sb.from('leave_requests').insert(row);
    if (error) throw error;
    f.reset();
    modal.close();
    toast('Запит надіслано на погодження');
    reloadAll();
  });

  // ---------- дії ----------
  const idOf = (el) => el.closest('[data-id]')?.dataset.id;
  action('leave-cancel', async (el) => {
    if (!confirm('Скасувати цей запит?')) return;
    const { error } = await sb.rpc('leave_cancel', { request: idOf(el) });
    if (error) return CRM.fail(error);
    toast('Скасовано');
    reloadAll();
  });
  action('leave-approve', async (el) => {
    const { error } = await sb.rpc('leave_decide', { request: idOf(el), approve: true, note: null });
    if (error) return CRM.fail(error);
    toast('Погоджено. Не забудь внести години в ClickUp');
    reloadAll();
  });
  action('leave-reject', async (el) => {
    const note = prompt('Чому відхиляєш? Людина побачить цей коментар.');
    if (note == null) return;
    if (!note.trim()) return toast('Потрібен коментар');
    const { error } = await sb.rpc('leave_decide', { request: idOf(el), approve: false, note });
    if (error) return CRM.fail(error);
    toast('Відхилено');
    reloadAll();
  });
  action('leave-tracked', async (el) => {
    if (!confirm('Години вже внесено в ClickUp? Після цього баланс рахуватиме їх лише з ClickUp.')) return;
    const { error } = await sb.rpc('leave_set_tracked', { request: idOf(el), flag: true });
    if (error) return CRM.fail(error);
    toast('Позначено');
    reloadAll();
  });

  // свята (admin)
  onSubmit('holiday', async (d, f) => {
    if (!d.day || !(d.title || '').trim()) return toast('Вкажи дату й назву');
    const { error } = await sb.from('company_holidays').upsert({ day: d.day, title: d.title.trim() });
    if (error) throw error;
    f.reset();
    toast('Свято додано');
    await loadHolidays();
  });
  action('holiday-delete', async (el) => {
    const day = idOf(el);
    if (!day || !confirm('Прибрати це свято?')) return;
    const { error } = await sb.from('company_holidays').delete().eq('day', day);
    if (error) return CRM.fail(error);
    await loadHolidays();
  });

  // баланс оновився з ClickUp → перерахувати команду
  document.addEventListener('crm:leave-synced', () => reloadAll());

  await loadHolidays();
  await reloadAll();
});
