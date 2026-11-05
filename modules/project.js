/* Gapsy CRM · modules/project.js — Картка проєкту (/project?id=<id>)
 * Розмітка: [data-element="project"]
 *   шапка:      [data-item="name|client|status|summary|prefix"]; v0.10: [data-item="stage"] (бейдж), [data-item="dates"] (етап до … · запуск …),
 *               [data-item="risk"] (бейдж, ховається без ризику); у формі project-edit — stage (select data-options="stage"), stage_due, deadline
 *   списки:     data-list="project-stack | project-links | project-team | project-notes |
 *               project-feedback | project-showcase | project-snippets | handoff-items"
 *   хендофф:    [data-handoff] > форма data-form="handoff", кнопки [data-handoff-btn="save|submit|accept|return"],
 *               статус [data-handoff-status], підказка [data-handoff-hint], коментар [data-handoff-decision]
 *   модалки:    data-modal="project-edit" (форма data-form="project-edit"), data-modal="member" (data-form="member")
 *   дії:        project-edit, handoff-check, handoff-submit, handoff-accept, handoff-return,
 *               note-pin, note-delete, member-remove
 * Права: редагувати проєкт і команду — PM/admin (RLS). Нотатки й хендофф — уся команда. */
CRM.module('project', async (root, { sb, user, render, fill, onSubmit, modal, toast, action, badge, time, date, name, crumbs, param, can }) => {
  const id = param('id');
  if (!id) return location.replace('/projects');

  const STATUS = { active: ['Активний', 'is-blue'], paused: ['Пауза', 'is-yellow'], done: ['Завершений', 'is-green'] };
  const FB_STATUS = CRM.FEEDBACK_STATUS;
  const HO_STATUS = {
    draft: ['Чернетка', ''], submitted: ['Передано', 'is-blue'],
    accepted: ['Прийнято', 'is-green'], returned: ['Повернуто', 'is-red'],
  };
  const HO_HINT = {
    draft: 'Дизайнер відмічає чекліст, обирає розробника і передає макет.',
    submitted: 'Макет у розробника. Він приймає його або повертає з питаннями.',
    accepted: 'Макет прийнято в роботу.',
    returned: 'Розробник повернув макет. Подивись коментар, виправ і передай знову.',
  };
  // Базовий чекліст хендоффу. Змінюєш тут — нові хендоффи отримають новий список, старі лишаються як є.
  const DEFAULT_ITEMS = [
    'Адаптиви 991 / 767 / 479 готові',
    'Кольори й типографіка винесені в стилі / змінні',
    'Стани: hover, focus, active, disabled',
    'Анімації описані або є прототип',
    'Ассети експортовані (SVG, WebP), іконки в одному стилі',
    'Шрифти: файли й ліцензія',
    'Порожні стани, помилки форм, 404',
    'Тексти фінальні або позначено, де заглушки',
  ].map((label) => ({ label, done: false }));
  const LINKS = [
    ['live_url', 'Live'], ['staging_url', 'Staging'], ['figma_url', 'Figma'], ['webflow_url', 'Webflow'],
    ['github_url', 'GitHub'], ['clickup_url', 'ClickUp'], ['drive_url', 'Drive'],
  ];

  const $ = (s) => root.querySelector(s);
  const set = (k, v) => root.querySelectorAll(`[data-item="${k}"]`).forEach((el) => { el.textContent = v; });
  const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };
  const safeUrl = (u) => (u && /^https?:\/\//i.test(u) ? u : null);
  const list = (s) => String(s || '').split(',').map((t) => t.trim()).filter(Boolean);
  const orNull = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

  let project = null;
  let handoff = null;

  // =================================================================
  // ПРОЄКТ
  // =================================================================
  async function loadProject() {
    const { data, error } = await sb.from('projects').select('*').eq('id', id).maybeSingle();
    if (error) return CRM.fail(error);
    if (!data) {
      toast('Проєкт не знайдено');
      return setTimeout(() => location.replace('/projects'), 1200);
    }
    project = data;
    set('name', data.name);
    set('client', data.client || 'Без клієнта');
    set('summary', data.summary || 'Опису ще немає.');
    set('prefix', data.prefix || '—');
    $('[data-item="prefix"]')?.classList.toggle('is-empty', !data.prefix); // v0.15.2: порожній префікс — просто текст, без рамки чипа
    badge($('[data-item="status"]'), data.status, STATUS);
    badge($('[data-item="stage"]'), data.stage || 'design', CRM.STAGE);
    const short = (d) => date(d, { day: 'numeric', month: 'short' });
    set('dates', [data.stage_due && `Етап до ${short(data.stage_due)}`, data.deadline && `Запуск ${short(data.deadline)}`].filter(Boolean).join(' · ') || 'Дати не задані');
    const riskEl = $('[data-item="risk"]');
    const risk = CRM.projectRisk(data);
    if (riskEl) { riskEl.hidden = !risk; if (risk) badge(riskEl, 'r', { r: [risk.text, risk.combo] }); }
    crumbs(`Проєкти / ${data.name}`);
    document.title = `${data.name} | Gapsy CRM`;

    render('project-stack', (data.stack || []).map((tag) => ({ tag })));
    const links = LINKS.filter(([k]) => safeUrl(data[k])).map(([k, label]) => ({ label: `${label} ↗`, url: data[k] }));
    render('project-links', links, (el, l) => { el.href = l.url; el.rel = 'noopener'; });
    const fbLink = $('[data-project-feedback-link]');
    if (fbLink) fbLink.href = `/feedback?project=${id}`;
  }

  action('project-edit', () => {
    const m = modal.open('project-edit');
    const form = m?.querySelector('[data-form="project-edit"]');
    if (!form || !project) return;
    CRM.fillSelects(m).then(() => {
      ['name', 'client', 'status', 'stage', 'stage_due', 'deadline', 'prefix', 'summary', ...LINKS.map(([k]) => k)].forEach((k) => {
        if (form.elements[k]) form.elements[k].value = project[k] || '';
      });
    });
    if (form.elements.stack) form.elements.stack.value = (project.stack || []).join(', ');
    const del = m.querySelector('[data-action="project-delete"]');
    if (del) del.hidden = !can('pm,admin');
  });

  // v0.11: видалення проєкту (кнопка data-action="project-delete" у модалці project-edit, лише PM/admin)
  action('project-delete', async () => {
    if (await CRM.deleteProject(project)) { modal.close(); location.replace('/projects'); }
  });

  onSubmit('project-edit', async (d) => {
    const row = {
      name: d.name.trim(), client: orNull(d.client), status: d.status,
      prefix: orNull(d.prefix), summary: orNull(d.summary), stack: list(d.stack),
    };
    if ('stage' in d) row.stage = d.stage || 'design';
    if ('stage_due' in d) row.stage_due = d.stage_due || null;
    if ('deadline' in d) row.deadline = d.deadline || null;
    LINKS.forEach(([k]) => { row[k] = orNull(d[k]); });
    const { error } = await sb.from('projects').update(row).eq('id', id);
    if (error) throw error;
    modal.close();
    toast('Проєкт оновлено');
    loadProject();
  });

  // =================================================================
  // КОМАНДА
  // =================================================================
  async function loadTeam() {
    const { data, error } = await sb.from('project_members')
      .select('user_id, role_label, user:profiles(full_name, email, avatar_url)')
      .eq('project_id', id);
    if (error) return CRM.fail(error);
    render('project-team', data.map((m) => ({
      uid: m.user_id, name: name(m.user), role_label: m.role_label || '', avatar: m.user?.avatar_url,
    })), (el, m) => { el.dataset.uid = m.uid; });
  }

  onSubmit('member', async (d, form) => {
    if (!d.user_id) return toast('Обери людину');
    const { error } = await sb.from('project_members')
      .insert({ project_id: id, user_id: d.user_id, role_label: orNull(d.role_label) });
    if (error?.code === '23505') return toast('Вже в команді');
    if (error) throw error;
    form.reset();
    modal.close();
    loadTeam();
  });

  action('member-remove', async (el) => {
    const uid = el.closest('[data-uid]')?.dataset.uid;
    if (!uid || !confirm('Прибрати з команди проєкту?')) return;
    const { error } = await sb.from('project_members').delete().eq('project_id', id).eq('user_id', uid);
    if (error) return CRM.fail(error);
    loadTeam();
  });

  // =================================================================
  // НОТАТКИ ТА РІШЕННЯ (закріплені — зверху)
  // =================================================================
  async function loadNotes() {
    const { data, error } = await sb.from('project_notes')
      .select('id, body, pinned, created_at, author_id, author:profiles(full_name, email, avatar_url)')
      .eq('project_id', id)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) return CRM.fail(error);
    render('project-notes', data.map((n) => ({
      ...n,
      author: name(n.author),
      avatar: n.author?.avatar_url,
      time: n.pinned ? `${time(n.created_at)} · закріплено` : time(n.created_at),
      pin_label: n.pinned ? 'Відкріпити' : 'Закріпити',
    })), (el, n) => {
      el.dataset.id = n.id;
      el.dataset.pinned = n.pinned ? '1' : '';
      if (n.author_id !== user.id && !can('pm,admin')) {
        el.querySelectorAll('[data-action="note-pin"], [data-action="note-delete"]').forEach((b) => b.remove());
      }
    });
  }

  onSubmit('project-note', async (d, form) => {
    const body = (d.body || '').trim();
    if (!body) return;
    const { error } = await sb.from('project_notes').insert({ project_id: id, body });
    if (error) throw error;
    form.reset();
    loadNotes();
  });

  action('note-pin', async (el) => {
    const row = el.closest('[data-id]');
    const { error } = await sb.from('project_notes').update({ pinned: !row.dataset.pinned }).eq('id', row.dataset.id);
    if (error) return CRM.fail(error);
    loadNotes();
  });

  action('note-delete', async (el) => {
    if (!confirm('Видалити нотатку?')) return;
    const { error } = await sb.from('project_notes').delete().eq('id', el.closest('[data-id]').dataset.id);
    if (error) return CRM.fail(error);
    loadNotes();
  });

  // =================================================================
  // ХЕНДОФФ ДИЗАЙН → РОЗРОБКА
  // =================================================================
  const hoForm = $('[data-form="handoff"]');
  const hoBtn = (k) => root.querySelector(`[data-handoff-btn="${k}"]`);
  let items = DEFAULT_ITEMS.map((x) => ({ ...x }));
  const editable = () => !handoff || ['draft', 'returned'].includes(handoff.status);

  async function loadHandoff() {
    const { data, error } = await sb.from('handoffs').select('*').eq('project_id', id).maybeSingle();
    if (error) return CRM.fail(error);
    handoff = data;
    items = Array.isArray(data?.items) && data.items.length ? data.items : DEFAULT_ITEMS.map((x) => ({ ...x }));
    drawHandoff();
  }

  async function drawHandoff() {
    const status = handoff?.status || 'draft';
    const canEdit = editable();
    const canDecide = status === 'submitted' && can('developer,pm,admin');

    badge($('[data-handoff-status]'), status, HO_STATUS);
    const hint = $('[data-handoff-hint]');
    if (hint) hint.textContent = HO_HINT[status];
    drawItems();

    if (hoForm) {
      // спершу заповнюємо селекти людьми, потім ставимо значення
      for (const sel of hoForm.querySelectorAll('select[data-options]')) {
        if (sel.dataset.filled) continue;
        sel.dataset.filled = '1';
        (await CRM.options(sel.dataset.options)).forEach(([v, t]) => sel.add(new Option(t, v)));
      }
      ['figma_url', 'note', 'designer_id', 'developer_id', 'decision_comment'].forEach((k) => {
        const f = hoForm.elements[k];
        if (!f) return;
        f.value = handoff?.[k] || '';
        f.disabled = k === 'decision_comment' ? !canDecide : !canEdit;
      });
      if (!handoff && hoForm.elements.designer_id && CRM.role === 'designer') hoForm.elements.designer_id.value = user.id;
    }
    // коментар розробника: поле для рішення або вже залишений коментар
    show($('[data-handoff-decision]'), canDecide || !!handoff?.decision_comment);

    show(hoBtn('save'), canEdit);
    show(hoBtn('submit'), canEdit);
    show(hoBtn('accept'), canDecide);
    show(hoBtn('return'), canDecide);
  }

  function drawItems() {
    const canEdit = editable();
    render('handoff-items', items.map((it, i) => ({ ...it, i })), (el, it) => {
      el.dataset.i = it.i;
      el.setAttribute('aria-checked', String(!!it.done));
      el.classList.toggle('is-locked', !canEdit);
      el.querySelector('.check_box')?.classList.toggle('is-done', !!it.done);
    });
  }

  action('handoff-check', (el) => {
    if (!editable()) return;
    const it = items[+el.dataset.i];
    if (!it) return;
    it.done = !it.done;
    drawItems();
  });

  const formRow = () => {
    const f = hoForm.elements;
    return {
      project_id: id, items,
      figma_url: orNull(f.figma_url?.value), note: orNull(f.note?.value),
      designer_id: orNull(f.designer_id?.value), developer_id: orNull(f.developer_id?.value),
    };
  };

  async function saveDraft() {
    const { data, error } = await sb.from('handoffs').upsert(formRow(), { onConflict: 'project_id' }).select().single();
    if (error) throw error;
    handoff = data;
  }

  onSubmit('handoff', async () => {
    await saveDraft();
    toast('Хендофф збережено');
    drawHandoff();
  });

  action('handoff-submit', async () => {
    if (!hoForm.elements.developer_id?.value) return toast('Обери розробника, щоб він отримав сповіщення');
    const left = items.filter((x) => !x.done).length;
    if (left && !confirm(`Не відмічено пунктів: ${left}. Передати все одно?`)) return;
    try {
      await saveDraft(); // спершу рядок має існувати: сповіщення шле тригер на UPDATE
      const { data, error } = await sb.from('handoffs')
        .update({ status: 'submitted', submitted_at: new Date().toISOString(), decision_comment: null })
        .eq('id', handoff.id).select().single();
      if (error) throw error;
      handoff = data;
      toast('Передано в розробку');
      drawHandoff();
    } catch (err) { CRM.fail(err); }
  });

  async function decide(status) {
    const comment = orNull(hoForm.elements.decision_comment?.value);
    if (status === 'returned' && !comment) {
      hoForm.elements.decision_comment?.focus();
      return toast('Напиши, що незрозуміло або чого бракує');
    }
    const { data, error } = await sb.from('handoffs')
      .update({ status, decision_comment: comment, decided_at: new Date().toISOString() })
      .eq('id', handoff.id).select().single();
    if (error) return CRM.fail(error);
    handoff = data;
    toast(status === 'accepted' ? 'Макет прийнято' : 'Повернуто дизайнеру');
    drawHandoff();
  }
  action('handoff-accept', () => decide('accepted'));
  action('handoff-return', () => decide('returned'));

  // =================================================================
  // ПОВʼЯЗАНЕ: правки, showcase, сніпети
  // =================================================================
  async function loadRelated() {
    const [fb, sc, sn] = await Promise.all([
      sb.from('feedback').select('id, title, status').eq('project_id', id).neq('status', 'resolved')
        .order('created_at', { ascending: false }).limit(8),
      sb.from('showcase_items').select('id, title, url, category').eq('project_id', id).order('created_at', { ascending: false }),
      sb.from('snippet_projects').select('snippet:snippets(id, title)').eq('project_id', id),
    ]);
    if (fb.error) CRM.fail(fb.error);
    render('project-feedback', fb.data || [], (el, f) => {
      el.href = `/feedback-item?id=${f.id}`;
      badge(el.querySelector('[data-field="status"]'), f.status, FB_STATUS);
    });
    render('project-showcase', sc.data || [], (el, s) => { if (safeUrl(s.url)) el.href = s.url; });
    render('project-snippets', (sn.data || []).map((r) => r.snippet).filter(Boolean), (el, s) => { el.href = `/snippet?id=${s.id}`; });
  }

  // =================================================================
  await loadProject();
  await Promise.all([loadTeam(), loadNotes(), loadHandoff(), loadRelated()]);
  if (location.hash === '#handoff') $('[data-handoff]')?.scrollIntoView({ block: 'start' });
});
