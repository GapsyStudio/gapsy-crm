/* Gapsy CRM · modules/dashboard.js — Головна (/app)
 * Розмітка: [data-element="dashboard"], [data-today], списки my-feedback / recent-docs / pins, форма data-form="pin".
 * Баланс відпусток і нещодавні документи підключаться разом із модулями leave і docs. */
CRM.module('dashboard', (root, { sb, user, render, onSubmit, modal, toast, badge, crumbs }) => {
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

  // simplified: документи з'являться з модулем docs
  render('recent-docs', []);

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
