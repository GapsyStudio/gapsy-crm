/* Gapsy CRM · modules/dashboard.js — Головна (/app)
 * Розмітка: [data-element="dashboard"], [data-today], списки my-feedback / recent-docs / pins, форма data-form="pin".
 * Баланс відпусток підключиться разом із модулем leave.
 * v0.10 «Пульс агенції» (лише PM/admin, обгортка [data-pulse] з data-crm-role="pm,admin"):
 *   лічильники [data-pulse-count="risk|overdue|handoffs|active"],
 *   data-list="pulse-risk" — проєкти під ризиком (поля name, stage, due; бейдж risk), посилання на картку;
 *   data-list="workload" — люди (поля name, role, projects, open, overdue), найзавантаженіші вгорі. */
CRM.module('dashboard', (root, { sb, user, render, onSubmit, modal, toast, badge, crumbs, time, date, name, can }) => {
  crumbs('Головна');
  const STATUS = CRM.FEEDBACK_STATUS;

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

  // ---------- Пульс агенції (PM/admin) ----------
  const ROLE = { designer: 'Дизайн', developer: 'Розробка', pm: 'PM', admin: 'Адмін' };
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
    const todayStr = new Date().toLocaleDateString('sv'); // YYYY-MM-DD за місцевим часом
    const active = pr.data;
    const risky = active.map((p) => ({ ...p, risk: CRM.projectRisk(p) })).filter((p) => p.risk).sort((a, b) => a.risk.days - b.risk.days);
    const overdue = fb.data.filter((f) => f.due_date && f.due_date < todayStr);
    const stuck = ho.data.filter((h) => h.submitted_at && Date.now() - new Date(h.submitted_at) > 2 * 864e5);
    const counts = { risk: risky.length, overdue: overdue.length, handoffs: stuck.length, active: active.length };
    root.querySelectorAll('[data-pulse-count]').forEach((el) => { el.textContent = counts[el.dataset.pulseCount] ?? '0'; });

    const short = (d) => date(d, { day: 'numeric', month: 'short' });
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

  loadFeedback();
  loadPins();
  loadPulse();
});
