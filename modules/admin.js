/* Gapsy CRM · modules/admin.js — Адмінка (/admin, лише admin)
 * Розмітка: [data-element="admin"], списки users-pending / users, форма data-form="user" (модалка data-modal="user").
 * Зміна ролі й ClickUp task id — через RPC admin_update_user (перевірка ролі в базі).
 * v0.15: запити на роль — data-list="role-requests" (user, avatar, role, from_role, scores, note; дії rr-approve, rr-reject), секція #role-requests;
 *   питання квізів — таби [data-tabs="quiz-track"], data-list="quiz-questions" (question, answers, state; дії q-edit, q-toggle, q-delete), кнопка q-new,
 *   модалка data-modal="quiz-q" з формою data-form="quiz-q" (track, question, options — по рядку, ПЕРШИЙ рядок правильний, explanation, doc_id).
 * v0.13: поля hired_on (date), clickup_email, leave_vacation_hours, leave_sick_hours (порожньо = Time estimate задачі в ClickUp, якщо його немає — 120 / 40 + 8 за рік), чекбокс is_leave_approver → RPC admin_set_leave.
 * v0.12: чекбокс name="is_art_director" у формі user → RPC admin_set_art_director; у рядку поле [data-field="ad"] («Арт-директор»). */
/* v0.20: угорі — картка [data-admin-health] «Налаштування агенції» (що не налаштовано і як виправити),
 *   кнопки «Запросити в CRM» (копіює текст запрошення) і «Експорт бази» (JSON усіх таблиць, які бачить admin;
 *   паролів у ньому немає — вони у Vault). Колонка «Останній вхід» перейменована на «Зареєстровано» (це дата реєстрації). */
CRM.module('admin', (root, { sb, user, render, onSubmit, modal, toast, badge, action, name, time }) => {
  const ROLE = {
    pending: ['pending', 'is-yellow'], client: ['client', ''], designer: ['designer', 'is-blue'],
    developer: ['developer', 'is-blue'], pm: ['pm', 'is-green'], sales: ['sales', 'is-green'], admin: ['admin', 'is-red'],
  };
  let people = [];
  let editId = null;

  async function load() {
    const { data, error } = await sb.from('profiles')
      .select('id, email, full_name, avatar_url, role, clickup_task_id, created_at, is_art_director, hired_on, clickup_email, leave_vacation_hours, leave_sick_hours, is_leave_approver')
      .order('created_at', { ascending: false });
    if (error) return CRM.fail(error);
    people = data;
    const rows = data.map((p) => ({
      ...p, name: name(p), clickup: p.clickup_task_id || '—', last_sign_in: time(p.created_at),
      ad: [p.is_art_director && 'Арт-директор', p.is_leave_approver && 'Погоджує відпустки'].filter(Boolean).join(' · '),
    }));
    const fill = (el, p) => {
      el.dataset.id = p.id;
      const ad = el.querySelector('[data-field="ad"]');
      if (ad) ad.hidden = !(p.is_art_director || p.is_leave_approver);
      badge(el.querySelector('[data-field="role"]'), p.role, ROLE);
    };
    render('users-pending', rows.filter((p) => p.role === 'pending'), fill);
    render('users', rows.filter((p) => p.role !== 'pending'), fill);
    if (typeof loadHealth === 'function' && root.querySelector('[data-admin-health]')) loadHealth(); // v0.20: після зміни ролей
  }

  action('edit-user', (el) => {
    const p = people.find((x) => x.id === el.closest('[data-id]')?.dataset.id);
    if (!p) return;
    editId = p.id;
    const m = modal.open('user');
    const title = m.querySelector('[data-user-title]');
    if (title) title.textContent = name(p);
    const f = m.querySelector('[data-form="user"]');
    // v0.17: роль sales — додаємо варіант у select, якщо в Designer його ще немає
    const roleSel = f.elements.role;
    if (roleSel?.tagName === 'SELECT' && !roleSel.querySelector('option[value="sales"]')) {
      const o = new Option('Sales', 'sales');
      roleSel.insertBefore(o, roleSel.querySelector('option[value="admin"]'));
    }
    f.elements.role.value = p.role === 'pending' ? 'designer' : p.role;
    f.elements.clickup_task_id.value = p.clickup_task_id || '';
    if (f.elements.is_art_director) f.elements.is_art_director.checked = !!p.is_art_director;
    // v0.13 відпустки
    const set = (k, v) => { if (f.elements[k]) f.elements[k].value = v ?? ''; };
    set('hired_on', p.hired_on); set('clickup_email', p.clickup_email);
    set('leave_vacation_hours', p.leave_vacation_hours); set('leave_sick_hours', p.leave_sick_hours);
    if (f.elements.is_leave_approver) f.elements.is_leave_approver.checked = !!p.is_leave_approver;
  });

  onSubmit('user', async (d, f) => {
    if (editId === user.id && d.role !== 'admin' && !confirm('Ти знімаєш з себе роль admin. Продовжити?')) return;
    const { error } = await sb.rpc('admin_update_user', { user_id: editId, new_role: d.role, clickup: d.clickup_task_id || '' });
    if (error) throw error;
    const p = people.find((x) => x.id === editId);
    const ad = !!d.is_art_director;
    if (p && ad !== !!p.is_art_director) {
      const { error: e2 } = await sb.rpc('admin_set_art_director', { user_id: editId, flag: ad });
      if (e2) throw e2;
    }
    // v0.13 відпустки: дата початку роботи, власні ліміти (порожньо = за правилами), пошта в ClickUp, погоджувач
    if (f.elements.hired_on || f.elements.is_leave_approver) {
      const num = (v) => (v === '' || v == null ? null : Math.max(0, Math.round(Number(v))));
      const { error: e3 } = await sb.rpc('admin_set_leave', {
        user_id: editId, hired: d.hired_on || null, vacation_hours: num(d.leave_vacation_hours), sick_hours: num(d.leave_sick_hours),
        approver: !!d.is_leave_approver, cu_email: (d.clickup_email || '').trim() || null,
      });
      if (e3) throw e3;
    }
    modal.close();
    toast('Збережено');
    load();
  });

  load();

  // =================================================================
  // v0.15 ЗАПИТИ НА РОЛЬ
  // =================================================================
  const RNAME = { designer: 'Дизайнер', developer: 'Розробник', pm: 'PM', sales: 'Sales', pending: 'новачок', admin: 'admin', client: 'клієнт' };
  async function loadRequests() {
    const { data, error } = await sb.rpc('role_requests_admin');
    if (error) return CRM.fail(error);
    const box = root.querySelector('[data-role-requests]');
    if (box) box.hidden = !(data || []).length;
    // v0.15.1: посилання зі сповіщення /admin#role-requests — секція показується лише після завантаження, тож прокручуємо самі
    if (box && !box.hidden && location.hash === '#role-requests') requestAnimationFrame(() => box.scrollIntoView({ block: 'start' }));
    render('role-requests', (data || []).map((r) => ({
      ...r, user: name(r), avatar: r.avatar_url || '', role: RNAME[r.role] || r.role,
      from_role: r.from_role && r.from_role !== 'pending' ? `зараз ${RNAME[r.from_role] || r.from_role}` : 'новачок',
      scores: [r.crm_score && `CRM ${r.crm_score}`, r.role_score && `роль ${r.role_score}`].filter(Boolean).join(' · '),
      note: r.note || '', time: time(r.created_at),
    })), (el, r) => { el.dataset.id = r.id; });
  }
  action('rr-approve', async (el) => {
    const id = el.closest('[data-id]')?.dataset.id;
    if (!id || !confirm('Видати роль?')) return;
    const { error } = await sb.rpc('role_request_decide', { request: id, approve: true, reason: null });
    if (error) return CRM.fail(error);
    toast('Роль видано');
    loadRequests(); load();
  });
  action('rr-reject', async (el) => {
    const id = el.closest('[data-id]')?.dataset.id;
    const reason = prompt('Чому відхиляєш? Людина побачить коментар.');
    if (!id || reason == null) return;
    if (!reason.trim()) return toast('Потрібен коментар');
    const { error } = await sb.rpc('role_request_decide', { request: id, approve: false, reason });
    if (error) return CRM.fail(error);
    toast('Відхилено');
    loadRequests();
  });

  // =================================================================
  // v0.15 ПИТАННЯ КВІЗІВ
  // =================================================================
  const TRACKS = { crm: 'CRM (для всіх новачків)', designer: 'Дизайнер', developer: 'Розробник', pm: 'PM' };
  let qTrack = 'crm';
  let questions = [];
  let qEdit = null;
  let startDocs = null;
  async function loadStartDocs() {
    if (startDocs) return startDocs;
    const { data } = await sb.from('docs').select('id, title, parent_id, notion_id');
    const rows = data || [];
    const start = rows.find((d) => d.notion_id === 'group:start');
    const inStart = new Set(start ? [start.id] : []);
    let grew = true;
    while (grew) { grew = false; rows.forEach((d) => { if (d.parent_id && inStart.has(d.parent_id) && !inStart.has(d.id)) { inStart.add(d.id); grew = true; } }); }
    startDocs = rows.filter((d) => inStart.has(d.id) && d.id !== start?.id).sort((a, b) => a.title.localeCompare(b.title));
    CRM.optionLists['start-docs'] = [['', '— без документа —'], ...startDocs.map((d) => [d.id, d.title])];
    return startDocs;
  }
  async function loadQuestions() {
    const { data, error } = await sb.rpc('quiz_admin_list', { t: qTrack });
    if (error) return CRM.fail(error);
    questions = data || [];
    await loadStartDocs();
    const title = Object.fromEntries((startDocs || []).map((d) => [d.id, d.title]));
    render('quiz-questions', questions.map((q, i) => ({
      ...q, n: i + 1,
      answers: q.options.map((o, k) => (k === q.correct ? `✓ ${o}` : o)).join(' · '),
      state: q.active ? '' : 'вимкнено', doc: q.doc_id ? title[q.doc_id] || '' : '',
    })), (el, q) => {
      el.dataset.id = q.id;
      el.classList.toggle('is-muted', !q.active);
      const t = el.querySelector('[data-action="q-toggle"]');
      if (t) t.textContent = q.active ? 'Вимкнути' : 'Увімкнути';
    });
    const c = root.querySelector('[data-quiz-count]');
    if (c) c.textContent = `${questions.filter((q) => q.active).length} активних · прохідний бал 80% (${Math.ceil(questions.filter((q) => q.active).length * 0.8)})`;
  }
  // таби квізів: [data-tabs="quiz-track"] > [data-tab="crm|designer|developer|pm"]
  root.addEventListener('crm:tab', (e) => { if (e.detail.group === 'quiz-track') { qTrack = e.detail.value; loadQuestions(); } });
  const fillSel = (sel, list) => { if (!sel) return; const v = sel.value; sel.innerHTML = ''; list.forEach(([k, t]) => sel.add(new Option(t, k))); sel.value = v; };

  async function openQ(q) {
    qEdit = q || null;
    const m = modal.open('quiz-q');
    const f = m?.querySelector('[data-form="quiz-q"]');
    if (!f) return;
    f.reset();
    await loadStartDocs();
    // списки заповнюємо самі (data-options міг заповнитися раніше, ніж довідники завантажились)
    fillSel(f.elements.track, Object.entries(TRACKS));
    const docSel = f.elements.doc_id;
    fillSel(docSel, CRM.optionLists['start-docs']);
    if (f.elements.track) f.elements.track.value = q?.track || qTrack;
    if (f.elements.question) f.elements.question.value = q?.question || '';
    // правильний варіант — першим рядком
    if (f.elements.options) f.elements.options.value = q ? [q.options[q.correct], ...q.options.filter((_, k) => k !== q.correct)].join('\n') : '';
    if (f.elements.explanation) f.elements.explanation.value = q?.explanation || '';
    if (docSel) docSel.value = q?.doc_id || '';
  }
  action('q-new', () => openQ(null));
  action('q-edit', (el) => openQ(questions.find((q) => q.id === el.closest('[data-id]')?.dataset.id)));
  onSubmit('quiz-q', async (d) => {
    const opts = String(d.options || '').split('\n').map((s) => s.trim()).filter(Boolean);
    if (!(d.question || '').trim()) return toast('Напиши питання');
    if (opts.length < 2 || opts.length > 6) return toast('Від 2 до 6 варіантів, кожен з нового рядка');
    // перемішуємо, щоб правильний не був завжди першим (інакше його видно в запитах браузера)
    const order = opts.map((_, k) => k).sort(() => Math.random() - 0.5);
    const row = {
      track: d.track || qTrack, question: d.question.trim().slice(0, 500), options: order.map((k) => opts[k]),
      correct: order.indexOf(0), explanation: (d.explanation || '').trim() || null, doc_id: d.doc_id || null,
    };
    const { error } = qEdit
      ? await sb.from('quiz_questions').update(row).eq('id', qEdit.id)
      : await sb.from('quiz_questions').insert({ ...row, sort: (Math.max(0, ...questions.map((q) => q.sort)) || 0) + 10 });
    if (error) throw error;
    modal.close();
    toast(qEdit ? 'Питання оновлено' : 'Питання додано');
    if (row.track !== qTrack) CRM.showTab('quiz-track', row.track);
    qTrack = row.track;
    loadQuestions();
  });
  action('q-toggle', async (el) => {
    const q = questions.find((x) => x.id === el.closest('[data-id]')?.dataset.id);
    if (!q) return;
    const { error } = await sb.from('quiz_questions').update({ active: !q.active }).eq('id', q.id);
    if (error) return CRM.fail(error);
    loadQuestions();
  });
  action('q-delete', async (el) => {
    const q = questions.find((x) => x.id === el.closest('[data-id]')?.dataset.id);
    if (!q || !confirm('Видалити питання? Краще вимкнути, якщо воно може знадобитися.')) return;
    const { error } = await sb.from('quiz_questions').delete().eq('id', q.id);
    if (error) return CRM.fail(error);
    loadQuestions();
  });

  // =================================================================
  // v0.20 НАЛАШТУВАННЯ АГЕНЦІЇ, ЗАПРОШЕННЯ, ЕКСПОРТ
  // =================================================================
  const mk = (t, c, text) => { const e = document.createElement(t); if (c) e.className = c; if (text != null) e.textContent = text; return e; };
  // «Останній вхід» показував дату реєстрації — називаємо чесно
  root.querySelectorAll('*').forEach((el) => { if (!el.children.length && el.textContent.trim() === 'Останній вхід') el.textContent = 'Зареєстровано'; });

  const EXPORT_KEY = 'crm-last-export';
  const TABLES = ['profiles', 'projects', 'project_members', 'project_notes', 'project_checklist', 'client_waits', 'handoffs',
    'feedback', 'feedback_comments', 'feedback_marks', 'feedback_files', 'design_reviews', 'docs', 'snippets', 'snippet_projects',
    'fonts', 'font_files', 'font_projects', 'moodboard_items', 'inspo_links', 'showcase_items', 'showcase_categories',
    'access_items', 'access_requests', 'access_log', 'leave_requests', 'leave_balances', 'company_holidays',
    'leads', 'sales_templates', 'price_items', 'case_items', 'case_tags', 'case_item_tags', 'quiz_questions', 'role_requests'];

  const health = mk('section', 'card admin_health');
  health.dataset.adminHealth = '';
  const hh = mk('div', 'card_header');
  hh.append(mk('div', 'card_title', 'Налаштування агенції'));
  const tools = mk('div', 'home_tools');
  const inv = mk('a', 'button is-secondary is-small', 'Запросити в CRM'); inv.href = '#'; inv.dataset.action = 'admin-invite';
  const exp = mk('a', 'button is-small', 'Експорт бази'); exp.href = '#'; exp.dataset.action = 'admin-export';
  tools.append(inv, exp);
  hh.append(tools);
  const hl = mk('div', 'list');
  health.append(hh, hl);
  const firstSection = root.querySelector('.page_header');
  if (firstSection) firstSection.after(health); else root.prepend(health);

  async function loadHealth() {
    const count = async (t, f = (q) => q) => { const r = await f(sb.from(t).select('id', { count: 'exact', head: true })); return r.error ? null : r.count; };
    const { data: ppl } = await sb.from('profiles').select('email, role, is_art_director, is_leave_approver, clickup_email')
      .in('role', ['designer', 'developer', 'pm', 'sales', 'admin']);
    const team = ppl || [];
    const admins = team.filter((p) => p.role === 'admin');
    const sharedAdmin = admins.filter((p) => /^(info|hello|office|team|studio|admin)@/i.test(p.email || ''));
    const [acc, accSecret, prices, tpls, active] = await Promise.all([
      count('access_items'), count('access_items', (q) => q.not('secret_id', 'is', null)), count('price_items'), count('sales_templates'),
      count('projects', (q) => q.eq('status', 'active')),
    ]);
    let last = null;
    try { last = localStorage.getItem(EXPORT_KEY); } catch (e) {}
    const days = last ? Math.floor((Date.now() - Number(last)) / 864e5) : null;
    // [ok, що, як виправити]
    const rows = [
      [team.some((p) => p.is_art_director), 'Арт-директор призначений', 'Без нього погоджувати дизайн може лише admin. Користувачі → Змінити → «Арт-директор».'],
      [team.some((p) => p.is_leave_approver), 'Є хто погоджує відпустки', 'Інакше запити на відпустку бачить лише admin. Користувачі → Змінити → «Погоджує відпустки».'],
      [admins.length <= 2, `Адмінів: ${admins.length}`, 'Лиши 1–2 особисті акаунти admin, решті — їхню робочу роль.'],
      [!sharedAdmin.length, sharedAdmin.length ? `Спільний акаунт з правами admin: ${sharedAdmin.map((p) => p.email).join(', ')}` : 'Спільні акаунти без прав admin', 'Дії зі спільного акаунта в журналі не прив’язані до людини. Зміни йому роль або видали.'],
      [active == null || active > 1, `Активних проєктів у CRM: ${active ?? '—'}`, 'Заведи всі поточні проєкти — інакше Головна й «Пульс» порожні й команда йде в Slack.'],
      [acc == null || !acc || accSecret / acc >= 0.5, `Доступи з паролем: ${accSecret ?? '—'} з ${acc ?? '—'}`, 'Додай паролі до сервісів у «Доступах», спільні — позначай «Спільний».'],
      [!!prices, prices ? `Довідник цін: ${prices} позицій` : 'Довідник цін порожній', 'Кейси → Ціни → «+ Позиція». Без нього Sales і PM називають різні цифри.'],
      [!!tpls, tpls ? `Шаблонів відповідей: ${tpls}` : 'Шаблонів відповідей немає', 'Кейси → Шаблони й відповіді → «+ Шаблон» (3–5 типових відповідей).'],
      [days != null && days <= 7, days == null ? 'Експорту бази ще не було' : `Останній експорт: ${days} дн. тому`, 'Безкоштовний тариф Supabase без автобекапів: раз на тиждень натискай «Експорт бази» й зберігай файл у закритій папці (не в GitHub).'],
    ];
    const ok = rows.filter((r) => r[0]).length;
    hh.querySelector('.card_title').textContent = `Налаштування агенції · ${ok} з ${rows.length}`;
    hl.replaceChildren(...rows.sort((a, b) => a[0] - b[0]).map(([good, what, fix]) => {
      const r = mk('div', `list_row admin_health-row${good ? ' is-ok' : ''}`);
      r.append(mk('span', `badge ${good ? 'is-green' : 'is-yellow'}`, good ? 'Готово' : 'Зробити'));
      const t = mk('div', 'person_text');
      t.append(mk('span', 'list_title', what));
      if (!good) t.append(mk('span', 'list_meta', fix));
      r.append(t);
      return r;
    }));
  }

  action('admin-invite', async () => {
    const text = `Привіт! Це наша CRM Gapsy: ${location.origin}/login\nУвійди через Google робочою поштою, пройди короткий онбординг і надішли запит на роль — я підтверджу.`;
    try { await navigator.clipboard.writeText(text); toast('Текст запрошення скопійовано — надішли людині'); } catch (e) { prompt('Скопіюй текст запрошення:', text); }
  });

  action('admin-export', async (el) => {
    el.setAttribute('aria-disabled', 'true');
    const prev = el.textContent;
    const out = { exported_at: new Date().toISOString(), by: user?.email || null, note: 'Gapsy CRM export. Паролів немає (Vault). Містить персональні дані — не викладати в GitHub.', tables: {}, errors: {} };
    try {
      for (const [i, t] of TABLES.entries()) {
        el.textContent = `Експорт ${i + 1}/${TABLES.length}…`;
        const rows = [];
        for (let from = 0; from < 50000; from += 1000) {
          const { data, error } = await sb.from(t).select('*').range(from, from + 999);
          if (error) { out.errors[t] = error.message; break; }
          rows.push(...data);
          if (data.length < 1000) break;
        }
        if (!out.errors[t]) out.tables[t] = rows;
      }
      const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `gapsy-crm-${new Date().toLocaleDateString('sv')}.json`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      try { localStorage.setItem(EXPORT_KEY, String(Date.now())); } catch (e) {}
      const n = Object.values(out.tables).reduce((s, r) => s + r.length, 0);
      toast(`Експортовано ${n} рядків з ${Object.keys(out.tables).length} таблиць`);
      loadHealth();
    } catch (e) {
      CRM.fail(e);
    } finally {
      el.textContent = prev;
      el.removeAttribute('aria-disabled');
    }
  });

  loadHealth();
  loadRequests();
  if (root.querySelector('[data-list="quiz-questions"]')) loadQuestions();
});
