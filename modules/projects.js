/* Gapsy CRM · modules/projects.js — Проєкти (/projects)
 * Розмітка: [data-element="projects"], таби data-tabs="status", список data-list="projects", форма data-form="project".
 * Рядок (v0.10): поля stage (бейдж етапу), due (найближча дата), risk (бейдж «Під ризиком» / «Прострочено», ховається, якщо ризику немає).
 * Форма: + поля stage (select data-options="stage"), stage_due, deadline (type=date). Активні проєкти під ризиком — угорі списку.
 * Клік по проєкту → картка проєкту (/project?id=). Shift+клік (PM/admin) → редагування.
 * v0.11: у модалці кнопка data-action="project-delete" (видна лише при редагуванні). */
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

  root.addEventListener('crm:tab', (e) => { tab = e.detail.value; draw(); });
  load();
});
