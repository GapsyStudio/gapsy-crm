/* Gapsy CRM · modules/my-work.js — Моя робота (/my-work)
 * Розмітка: [data-element="my-work"], підсумок [data-mywork-summary], лічильники [data-count="assigned|authored|handoffs|projects"].
 * Списки:
 *  - data-list="mywork-assigned"  — правки на мені (поля status, priority, due, title, project);
 *  - data-list="mywork-handoffs"  — хендоффи, що чекають на мою дію (project, status, hint);
 *  - data-list="mywork-authored"  — мої відкриті правки, які виконує хтось інший (status, priority, due, title, assignee);
 *  - data-list="mywork-projects"  — активні проєкти, де я в команді (name, client, role, open).
 * Нічого не змінює — лише збирає дані з feedback, handoffs, project_members (RLS як скрізь). */
CRM.module('my-work', async (root, { sb, user, render, crumbs, badge, name, feedbackSort, feedbackBadges, due }) => {
  crumbs('Моя робота');
  const me = user.id;
  const HANDOFF = {
    draft: ['Чернетка', ''], submitted: ['Передано', 'is-blue'],
    accepted: ['Прийнято', 'is-green'], returned: ['Повернуто', 'is-red'],
  };
  const count = (key, n) => root.querySelectorAll(`[data-count="${key}"]`).forEach((el) => { el.textContent = n; });
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  };

  const [fb, ho, pm] = await Promise.all([
    sb.from('feedback')
      .select(`id, title, status, priority, due_date, created_at, author_id, assignee_id,
        project:projects(name), assignee:profiles!feedback_assignee_id_fkey(full_name, email)`)
      .neq('status', 'resolved')
      .or(`assignee_id.eq.${me},author_id.eq.${me}`)
      .limit(200),
    sb.from('handoffs')
      .select('id, status, designer_id, developer_id, updated_at, project:projects(id, name)')
      .or(`designer_id.eq.${me},developer_id.eq.${me}`),
    sb.from('project_members')
      .select('role_label, project:projects(id, name, client, status)')
      .eq('user_id', me),
  ]);
  [fb, ho, pm].forEach((r) => r.error && console.error('[CRM] my-work', r.error));

  // ---------- правки ----------
  const feedback = (fb.data || []).slice().sort(feedbackSort);
  const assigned = feedback.filter((f) => f.assignee_id === me);
  // створені мною, але виконує інший (або ще ніхто) — щоб не дублювати перший список
  const authored = feedback.filter((f) => f.author_id === me && f.assignee_id !== me);
  const link = (el, f) => { el.href = `/feedback-item?id=${f.id}`; feedbackBadges(el, f); };

  render('mywork-assigned', assigned.map((f) => ({ ...f, project: f.project?.name || '—' })), link);
  render('mywork-authored', authored.map((f) => ({
    ...f, project: f.project?.name || '—', assignee: f.assignee ? name(f.assignee) : 'Не призначено',
  })), link);

  // ---------- хендоффи, що чекають на мене ----------
  const waiting = (ho.data || []).map((h) => {
    if (h.developer_id === me && h.status === 'submitted') return { ...h, hint: 'Чекає на твоє рішення', rank: 0 };
    if (h.designer_id === me && h.status === 'returned') return { ...h, hint: 'Повернуто з питаннями — доопрацювати', rank: 1 };
    if (h.designer_id === me && h.status === 'draft') return { ...h, hint: 'Чернетка — передай, коли буде готово', rank: 2 };
    return null;
  }).filter(Boolean).sort((a, b) => a.rank - b.rank);
  render('mywork-handoffs', waiting.map((h) => ({ ...h, project_id: h.project?.id, project: h.project?.name || '—' })), (el, h) => {
    el.href = `/project?id=${h.project_id}#handoff`;
    badge(el.querySelector('[data-field="status"]'), h.status, HANDOFF);
  });

  // ---------- мої проєкти ----------
  const projects = (pm.data || []).filter((m) => m.project && m.project.status !== 'done');
  const openBy = {};
  if (projects.length) {
    const { data } = await sb.from('feedback').select('project_id')
      .neq('status', 'resolved').in('project_id', projects.map((m) => m.project.id));
    (data || []).forEach((r) => { openBy[r.project_id] = (openBy[r.project_id] || 0) + 1; });
  }
  render('mywork-projects', projects
    .map((m) => ({ ...m.project, role: m.role_label || '', open: openBy[m.project.id] || 0 }))
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name, 'uk'))
    .map((p) => ({ ...p, client: p.client || '', open: p.open ? `${p.open} ${plural(p.open, 'відкрита правка', 'відкриті правки', 'відкритих правок')}` : 'Без відкритих правок' })),
  (el, p) => { el.href = `/project?id=${p.id}`; });

  // ---------- підсумок ----------
  const overdue = assigned.filter((f) => due(f.due_date)?.overdue).length;
  count('assigned', assigned.length);
  count('authored', authored.length);
  count('handoffs', waiting.length);
  count('projects', projects.length);
  const parts = [];
  if (assigned.length) parts.push(`${assigned.length} ${plural(assigned.length, 'правка', 'правки', 'правок')} на тобі`);
  if (overdue) parts.push(`${overdue} ${plural(overdue, 'прострочена', 'прострочені', 'прострочених')}`);
  if (waiting.length) parts.push(`${waiting.length} ${plural(waiting.length, 'хендофф чекає', 'хендоффи чекають', 'хендоффів чекають')}`);
  const summary = root.querySelector('[data-mywork-summary]');
  if (summary) summary.textContent = parts.length ? `${parts.join(' · ')}.` : 'Усе чисто: нічого не чекає на тебе.';
});
