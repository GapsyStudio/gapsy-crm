/* Gapsy CRM · modules/projects.js — Проєкти (/projects)
 * Розмітка: [data-element="projects"], таби data-tabs="status", список data-list="projects", форма data-form="project".
 * Рядок (v0.10): поля stage (бейдж етапу), due (найближча дата), risk (бейдж «Під ризиком» / «Прострочено», ховається, якщо ризику немає).
 * Форма: + поля stage (select data-options="stage"), stage_due, deadline (type=date). Активні проєкти під ризиком — угорі списку.
 * Клік по проєкту → картка проєкту (/project?id=). Shift+клік (PM/admin) → редагування.
 * v0.11: у модалці кнопка data-action="project-delete" (видна лише при редагуванні).
 * v0.18 (PM/admin): перемикач «Список / Огляд» [data-view-switch]. Огляд — таблиця .pm_table: проєкт і клієнт, етап, етап до,
 *   запуск, правки (відкриті / прострочені), хендофф, «чекаємо від клієнта» (кількість і найдовше), команда. Рядок веде в проєкт. */
CRM.module('projects', (root, { sb, render, onSubmit, modal, toast, badge, can, date, action }) => {
  const STATUS = { active: ['Активний', 'is-blue'], paused: ['Пауза', 'is-yellow'], done: ['Завершений', 'is-green'] };
  const plural = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'правка' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'правки' : 'правок'}`;
  let all = [];
  let tab = 'active';
  let editId = null;
  const FIELDS = ['name', 'client', 'status', 'stage', 'stage_due', 'deadline', 'staging_url', 'figma_url'];

  async function load() {
    const { data, error } = await sb.from('projects')
      .select('id, name, client, status, stage, stage_due, deadline, staging_url, figma_url, feedback(count)')
      .order('name');
    if (error) return CRM.fail(error);
    all = data;
    draw();
  }

  function draw() {
    const rows = all.filter((p) => tab === 'all' || p.status === tab)
      .map((p) => ({ ...p, _risk: CRM.projectRisk(p) }))
      .sort((a, b) => (a._risk?.days ?? 999) - (b._risk?.days ?? 999) || a.name.localeCompare(b.name));
    render('projects', rows.map((p) => ({
      ...p,
      client: p.client || '—',
      feedback_count: plural(p.feedback?.[0]?.count || 0),
      due: p.deadline ? `Запуск ${date(p.deadline, { day: 'numeric', month: 'short' })}` : '',
    })), (el, p) => {
      el.href = `/project?id=${p.id}`;
      badge(el.querySelector('[data-field="status"]'), p.status, STATUS);
      badge(el.querySelector('[data-field="stage"]'), p.stage || 'design', CRM.STAGE);
      const risk = el.querySelector('[data-field="risk"]');
      if (risk) {
        risk.hidden = !p._risk;
        if (p._risk) badge(risk, 'risk', { risk: [p._risk.text, p._risk.combo] });
      }
      if (can('admin,pm')) {
        el.title = 'Shift+клік — редагувати';
        el.addEventListener('click', (e) => { if (e.shiftKey) { e.preventDefault(); openEdit(p); } });
      }
    });
  }

  function openEdit(p) {
    editId = p?.id || null;
    const m = modal.open('project');
    const form = m.querySelector('[data-form="project"]');
    form.reset();
    CRM.fillSelects(m).then(() => {
      if (p) FIELDS.forEach((k) => { if (form.elements[k]) form.elements[k].value = p[k] || ''; });
    });
    const del = m.querySelector('[data-action="project-delete"]');
    if (del) del.hidden = !p;
    // v0.15.2: заголовок модалки залежить від режиму
    const title = m.querySelector('.modal_header .card_title');
    if (title) title.textContent = p ? 'Редагувати проєкт' : 'Новий проєкт';
  }
  // v0.11: видалення з модалки (лише в режимі редагування)
  action('project-delete', async () => {
    const p = all.find((x) => x.id === editId);
    if (await CRM.deleteProject(p)) { modal.close(); editId = null; load(); }
  });
  // кнопка «Новий проєкт» відкриває модалку через data-action="open:project" — скидаємо режим редагування
  root.querySelector('[data-action="open:project"]')?.addEventListener('click', () => {
    editId = null;
    const del = document.querySelector('[data-modal="project"] [data-action="project-delete"]');
    if (del) del.hidden = true;
  });

  onSubmit('project', async (d, form) => {
    const row = {
      name: d.name.trim(), client: d.client.trim() || null, status: d.status,
      staging_url: (d.staging_url || '').trim() || null, figma_url: (d.figma_url || '').trim() || null,
    };
    if ('stage' in d) row.stage = d.stage || 'design';
    if ('stage_due' in d) row.stage_due = d.stage_due || null;
    if ('deadline' in d) row.deadline = d.deadline || null;
    const { error } = editId
      ? await sb.from('projects').update(row).eq('id', editId)
      : await sb.from('projects').insert(row);
    if (error) throw error;
    form.reset();
    modal.close();
    toast(editId ? 'Проєкт оновлено' : 'Проєкт створено');
    editId = null;
    load();
  });

  // ---------- Огляд (PM/admin) ----------
  let view = 'list';
  let over = null;
  const listEl = root.querySelector('[data-list="projects"]');
  const HO = { draft: ['Чернетка', ''], submitted: ['Передано', 'is-blue'], accepted: ['Прийнято', 'is-green'], returned: ['Повернуто', 'is-red'] };
  if (can('pm,admin') && listEl && !root.querySelector('[data-view-switch]')) {
    const sw = document.createElement('div');
    sw.className = 'view_switch';
    sw.dataset.viewSwitch = '';
    sw.setAttribute('role', 'group');
    sw.setAttribute('aria-label', 'Вигляд');
    [['list', 'Список'], ['overview', 'Огляд']].forEach(([v, t]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `view_switch-btn${v === 'list' ? ' is-active' : ''}`; b.dataset.view = v; b.textContent = t;
      b.setAttribute('aria-pressed', String(v === 'list'));
      b.addEventListener('click', () => setView(v));
      sw.append(b);
    });
    const tabs = root.querySelector('[data-tabs="status"]');
    (tabs || listEl).after(sw);
    over = document.createElement('div');
    over.className = 'pm_table';
    over.hidden = true;
    listEl.after(over);
  }
  function setView(v) {
    view = v;
    root.querySelectorAll('[data-view]').forEach((b) => { b.classList.toggle('is-active', b.dataset.view === v); b.setAttribute('aria-pressed', String(b.dataset.view === v)); });
    listEl.hidden = v === 'overview';
    over.hidden = v !== 'overview';
    if (v === 'overview') loadOverview();
  }
  let detail = null;
  async function loadOverview() {
    if (!detail) {
      const [fb, ho, cw, mem] = await Promise.all([
        sb.from('feedback').select('project_id, due_date').neq('status', 'resolved'),
        sb.from('handoffs').select('project_id, status'),
        sb.from('client_waits').select('project_id, since').is('resolved_at', null),
        sb.from('project_members').select('project_id, user:profiles(full_name, email)'),
      ]);
      const err = [fb, ho, cw, mem].find((r) => r.error);
      if (err) return CRM.fail(err.error);
      detail = { fb: fb.data, ho: ho.data, cw: cw.data, mem: mem.data };
    }
    drawOverview();
  }
  function drawOverview() {
    if (!over || !detail) return;
    const today = new Date().toLocaleDateString('sv');
    const short = (d) => (d ? date(d, { day: 'numeric', month: 'short' }) : '—');
    const days = (d) => Math.round((new Date(new Date().toDateString()) - new Date(`${d}T00:00:00`)) / 864e5);
    const initials = (u) => (u?.full_name || u?.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('');
    const rows = all.filter((p) => tab === 'all' || p.status === tab)
      .map((p) => ({ ...p, _risk: CRM.projectRisk(p) }))
      .sort((a, b) => (a._risk?.days ?? 999) - (b._risk?.days ?? 999) || a.name.localeCompare(b.name));
    const head = ['Проєкт', 'Етап', 'Етап до', 'Запуск', 'Правки', 'Хендофф', 'Чекаємо', 'Команда'];
    over.replaceChildren();
    const hr = document.createElement('div');
    hr.className = 'pm_row is-head';
    head.forEach((t) => { const c = document.createElement('span'); c.textContent = t; hr.append(c); });
    over.append(hr);
    if (!rows.length) {
      const e = document.createElement('div'); e.className = 'empty_state';
      e.innerHTML = '<div class="text-size-small">Проєктів у цьому табі немає</div>';
      over.append(e);
      return;
    }
    rows.forEach((p) => {
      const a = document.createElement('a');
      a.className = 'pm_row';
      a.href = `/project?id=${p.id}`;
      const cell = (text, cls) => { const c = document.createElement('span'); if (cls) c.className = cls; c.textContent = text; a.append(c); return c; };
      const name = cell('', 'pm_name');
      const n1 = document.createElement('span'); n1.className = 'list_title'; n1.textContent = p.name;
      const n2 = document.createElement('span'); n2.className = 'list_meta'; n2.textContent = p.client || '—';
      name.append(n1, n2);
      const st = cell(''); const sb1 = document.createElement('span'); sb1.className = 'badge'; badge(sb1, p.stage || 'design', CRM.STAGE); st.append(sb1);
      const sd = cell(short(p.stage_due)); sd.classList.toggle('is-red', !!p.stage_due && p.stage_due < today && p.status === 'active');
      const dl = cell(short(p.deadline)); dl.classList.toggle('is-red', !!p.deadline && p.deadline < today && p.status === 'active');
      const fbs = detail.fb.filter((f) => f.project_id === p.id);
      const od = fbs.filter((f) => f.due_date && f.due_date < today).length;
      const fc = cell(fbs.length ? `${fbs.length}${od ? ` · ${od} простр.` : ''}` : '—'); fc.classList.toggle('is-red', od > 0);
      const h = detail.ho.find((x) => x.project_id === p.id);
      const hc = cell(''); if (h) { const b = document.createElement('span'); b.className = 'badge'; badge(b, h.status, HO); hc.append(b); } else hc.textContent = '—';
      const ws = detail.cw.filter((w) => w.project_id === p.id);
      const maxD = ws.length ? Math.max(...ws.map((w) => days(w.since))) : 0;
      const wc = cell(ws.length ? `${ws.length} · ${maxD} дн.` : '—'); wc.classList.toggle('is-red', maxD >= 5);
      const team = cell('', 'pm_team');
      detail.mem.filter((m) => m.project_id === p.id).slice(0, 5).forEach((m) => {
        const i = document.createElement('span'); i.className = 'pm_avatar'; i.textContent = initials(m.user); i.title = CRM.name(m.user);
        team.append(i);
      });
      if (!team.children.length) team.textContent = '—';
      over.append(a);
    });
  }

  root.addEventListener('crm:tab', (e) => { tab = e.detail.value; draw(); if (view === 'overview') drawOverview(); });
  load();
});
