/* Gapsy CRM · modules/dashboard.js — Головна (/app)
 * Розмітка: [data-element="dashboard"], [data-today], списки my-feedback / recent-docs / pins, форма data-form="pin".
 * Баланс відпусток підключиться разом із модулем leave. */
CRM.module('dashboard', (root, { sb, user, render, onSubmit, modal, toast, badge, crumbs, time }) => {
  crumbs('Головна');
  const STATUS = { new: ['New', 'is-blue'], in_progress: ['In Progress', 'is-yellow'], resolved: ['Resolved', 'is-green'] };

  const today = root.querySelector('[data-today]');
  if (today) {
    const t = new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
    today.textContent = t.charAt(0).toUpperCase() + t.slice(1);
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

  // Закріплене
  async function loadPins() {
    const { data, error } = await sb.from('pins').select('id, title, url').order('sort').order('created_at');
    if (error) return console.error(error);
    render('pins', data.map((p) => ({ ...p, host: safeHost(p.url) })), (el, p) => {
      el.href = p.url;
      el.dataset.id = p.id;
      el.addEventListener('contextmenu', async (e) => {
        // ПКМ по картці — відкріпити
        e.preventDefault();
        if (!confirm(`Відкріпити «${p.title}»?`)) return;
        await sb.from('pins').delete().eq('id', p.id);
        loadPins();
      });
    });
  }
  const safeHost = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return u; } };

  onSubmit('pin', async (data, form) => {
    const { error } = await sb.from('pins').insert({ title: data.title.trim(), url: data.url.trim() });
    if (error) throw error;
    form.reset();
    modal.close();
    toast('Закріплено');
    loadPins();
  });

  loadFeedback();
  loadPins();
});
