/* Gapsy CRM · modules/projects.js — Проєкти (/projects)
 * Розмітка: [data-element="projects"], таби data-tabs="status", список data-list="projects", форма data-form="project".
 * Клік по проєкту → правки цього проєкту. Shift+клік (PM/admin) → редагування. */
CRM.module('projects', (root, { sb, render, onSubmit, modal, toast, badge, can }) => {
  const STATUS = { active: ['Активний', 'is-blue'], paused: ['Пауза', 'is-yellow'], done: ['Завершений', 'is-green'] };
  const plural = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'правка' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'правки' : 'правок'}`;
  let all = [];
  let tab = 'active';
  let editId = null;

  async function load() {
    const { data, error } = await sb.from('projects')
      .select('id, name, client, status, staging_url, figma_url, feedback(count)')
      .order('name');
    if (error) return CRM.fail(error);
    all = data;
    draw();
  }

  function draw() {
    const rows = all.filter((p) => tab === 'all' || p.status === tab);
    render('projects', rows.map((p) => ({
      ...p,
      client: p.client || '—',
      feedback_count: plural(p.feedback?.[0]?.count || 0),
    })), (el, p) => {
      el.href = `/feedback?project=${p.id}`;
      badge(el.querySelector('[data-field="status"]'), p.status, STATUS);
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
    if (p) ['name', 'client', 'status', 'staging_url', 'figma_url'].forEach((k) => { if (form.elements[k]) form.elements[k].value = p[k] || ''; });
  }
  // кнопка «Новий проєкт» відкриває модалку через data-action="open:project" — скидаємо режим редагування
  root.querySelector('[data-action="open:project"]')?.addEventListener('click', () => { editId = null; });

  onSubmit('project', async (d, form) => {
    const row = {
      name: d.name.trim(), client: d.client.trim() || null, status: d.status,
      staging_url: d.staging_url.trim() || null, figma_url: d.figma_url.trim() || null,
    };
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
