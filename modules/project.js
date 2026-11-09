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
 * Права: редагувати проєкт і команду — PM/admin (RLS). Нотатки й хендофф — уся команда.
 * v0.17: нотатки мають тип (kind: note | decision | client | choice) і посилання (link: Slack, ClickUp, лист…).
 *   Модуль сам додає у форму project-note select kind і поле link, а над списком — фільтр [data-notes-filter].
 *   У рядку: бейдж типу перед текстом і кнопка «Джерело ↗». «Вибір клієнта» завжди зверху після закріплених.
 * v0.18: секція #waits «Чекаємо від клієнта» перед нотатками (client_waits): що чекаємо, відколи, скільки днів;
 *   «Отримали» закриває пункт. Додає будь-хто з команди; закриває автор або PM/admin. Модуль будує секцію сам.
 * v0.19: у хендоффі рядок [data-ho-review] — остання погоджена версія макета (design_reviews) і те, що зараз на погодженні;
 *   у нотатці кнопка «→ Правка» (дія note-to-feedback) створює правку з тексту й посилання нотатки;
 *   Sales бачить проєкт без хендоффу, правок і сніпетів (RLS віддає їй лише проєкти з її лідів). */
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
  const NOTE_KIND = {
    note: ['Нотатка', ''], decision: ['Рішення', 'is-blue'], client: ['Коментар клієнта', 'is-yellow'], choice: ['Вибір клієнта', 'is-green'],
  };
  const noteForm = root.querySelector('[data-form="project-note"]');
  if (noteForm && !noteForm.elements.kind) {
    const sel = document.createElement('select');
    sel.className = 'form-input notes_kind';
    sel.name = 'kind';
    sel.setAttribute('aria-label', 'Тип нотатки');
    Object.entries(NOTE_KIND).forEach(([v, [t]]) => sel.add(new Option(t, v)));
    const link = document.createElement('input');
    link.className = 'form-input notes_link';
    link.name = 'link';
    link.type = 'url';
    link.placeholder = 'Посилання на джерело (Slack, ClickUp…)';
    link.setAttribute('aria-label', 'Посилання на джерело');
    const extra = document.createElement('div');
    extra.className = 'notes_extra';
    extra.append(sel, link);
    noteForm.insertBefore(extra, noteForm.querySelector('[type="submit"]'));
  }
  let noteFilter = 'all';
  const notesList = root.querySelector('[data-list="project-notes"]');
  if (notesList && !root.querySelector('[data-notes-filter]')) {
    const bar = document.createElement('div');
    bar.className = 'notes_filter';
    bar.dataset.notesFilter = '';
    [['all', 'Усе'], ['decision', 'Рішення'], ['client', 'Від клієнта']].forEach(([v, t]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tabs_link' + (v === 'all' ? ' is-active' : '');
      b.dataset.value = v;
      b.textContent = t;
      b.setAttribute('aria-pressed', String(v === 'all'));
      b.addEventListener('click', () => {
        noteFilter = v;
        bar.querySelectorAll('.tabs_link').forEach((c) => { c.classList.toggle('is-active', c === b); c.setAttribute('aria-pressed', String(c === b)); });
        drawNotes();
      });
      bar.append(b);
    });
    notesList.before(bar);
  }
  let notes = [];
  async function loadNotes() {
    const { data, error } = await sb.from('project_notes')
      .select('id, body, pinned, kind, link, created_at, author_id, author:profiles(full_name, email, avatar_url)')
      .eq('project_id', id)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) return CRM.fail(error);
    notes = data;
    drawNotes();
  }
  function drawNotes() {
    const KEEP = { all: null, decision: ['decision', 'choice'], client: ['client', 'choice'] }[noteFilter];
    const rows = notes.filter((n) => !KEEP || KEEP.includes(n.kind || 'note'))
      .sort((a, b) => (b.pinned - a.pinned) || ((b.kind === 'choice') - (a.kind === 'choice')));
    render('project-notes', rows.map((n) => ({
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
      const head = el.querySelector('.comment_head') || el;
      const kind = n.kind || 'note';
      if (kind !== 'note') {
        const b = document.createElement('span');
        b.className = 'badge';
        head.querySelector('[data-field="time"]')?.after(b);
        badge(b, kind, NOTE_KIND);
      }
      if (CRM.role !== 'sales') {
        const fb = document.createElement('a');
        fb.href = '#'; fb.className = 'button is-text is-small'; fb.dataset.action = 'note-to-feedback';
        fb.textContent = '→ Правка'; fb.title = 'Створити правку з цієї нотатки';
        head.append(fb);
      }
      if (n.link && /^https?:\/\//i.test(n.link)) {
        const a = document.createElement('a');
        a.className = 'button is-text is-small';
        a.href = n.link; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = 'Джерело ↗';
        head.append(a);
      }
    });
  }

  onSubmit('project-note', async (d, form) => {
    const body = (d.body || '').trim();
    if (!body) return;
    const link = (d.link || '').trim();
    if (link && !/^https?:\/\//i.test(link)) return toast('Посилання має починатися з https://');
    const kind = NOTE_KIND[d.kind] ? d.kind : 'note';
    const { error } = await sb.from('project_notes').insert({ project_id: id, body, kind, link: link || null });
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

  // v0.19: нотатка → правка (заголовок = перший рядок, опис = увесь текст + джерело)
  action('note-to-feedback', async (el) => {
    const n = notes.find((x) => x.id === el.closest('[data-id]')?.dataset.id);
    if (!n) return;
    const first = n.body.split('\n').find((l) => l.trim()) || n.body;
    const title = first.trim().slice(0, 120);
    const description = [n.body.trim(), n.link ? `Джерело: ${n.link}` : ''].filter(Boolean).join('\n\n');
    el.setAttribute('aria-disabled', 'true');
    const { data, error } = await sb.from('feedback').insert({ title, description, project_id: id, priority: 'normal' }).select('id').single();
    el.removeAttribute('aria-disabled');
    if (error) return CRM.fail(error);
    toast('Правку створено');
    location.href = `/feedback-item?id=${data.id}`;
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

  // v0.19: яка версія макета погоджена — рядок над чеклістом хендоффу
  async function loadReviewLine() {
    const box = root.querySelector('[data-handoff]');
    if (!box) return;
    let line = box.querySelector('[data-ho-review]');
    if (!line) {
      line = document.createElement('div');
      line.className = 'ho_review';
      line.dataset.hoReview = '';
      const after = box.querySelector('[data-handoff-hint]') || box.querySelector('.card_header');
      if (after) after.after(line); else box.prepend(line);
    }
    const { data, error } = await sb.from('design_reviews').select('id, title, version, url, status, decided_at, created_at')
      .eq('project_id', id).order('created_at', { ascending: false }).limit(20);
    if (error) return console.warn('[CRM] design_reviews', error.message);
    const ok = data.filter((r) => r.status === 'approved').sort((a, b) => String(b.decided_at || b.created_at).localeCompare(String(a.decided_at || a.created_at)))[0];
    const wait = data.find((r) => r.status === 'pending');
    const mk = (t, c, text) => { const e = document.createElement(t); if (c) e.className = c; if (text != null) e.textContent = text; return e; };
    line.replaceChildren();
    if (ok) {
      line.append(mk('span', 'badge is-green', 'Погоджено'), mk('span', 'list_title', `${ok.title}${ok.version > 1 ? ` · v${ok.version}` : ''}`),
        mk('span', 'list_meta', ok.decided_at ? date(ok.decided_at, { day: 'numeric', month: 'short' }) : ''));
      if (safeUrl(ok.url)) { const a = mk('a', 'button is-text is-small', 'Відкрити макет ↗'); a.href = ok.url; a.target = '_blank'; a.rel = 'noopener'; line.append(a); }
    } else {
      line.append(mk('span', 'badge is-yellow', 'Не погоджено'), mk('span', 'list_meta', 'Погодженої версії макета ще немає'));
      const a = mk('a', 'button is-text is-small', 'Погодження'); a.href = '/reviews'; line.append(a);
    }
    if (wait) line.append(mk('span', 'list_meta ho_review-wait', `на погодженні: ${wait.title}${wait.version > 1 ? ` v${wait.version}` : ''}`));
  }

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
  let CATS = {};
  async function loadRelated() {
    const [fb, sc, sn] = await Promise.all([
      sb.from('feedback').select('id, title, status').eq('project_id', id).neq('status', 'resolved')
        .order('created_at', { ascending: false }).limit(8),
      sb.from('showcase_items').select('id, title, url, category').eq('project_id', id).order('created_at', { ascending: false }),
      sb.from('snippet_projects').select('snippet:snippets(id, title)').eq('project_id', id),
      sb.from('showcase_categories').select('slug, label'),
    ]).then((r) => { CATS = Object.fromEntries((r[3].data || []).map((c) => [c.slug, c.label])); return r; });
    if (fb.error) CRM.fail(fb.error);
    render('project-feedback', fb.data || [], (el, f) => {
      el.href = `/feedback-item?id=${f.id}`;
      badge(el.querySelector('[data-field="status"]'), f.status, FB_STATUS);
    });
    // v0.20.1: категорія — підписом з довідника (а не slug «site»)
    render('project-showcase', (sc.data || []).map((s) => ({ ...s, category: CATS[s.category] || s.category })), (el, s) => {
      if (safeUrl(s.url)) { el.href = s.url; el.target = '_blank'; el.rel = 'noopener'; }
    });
    render('project-snippets', (sn.data || []).map((r) => r.snippet).filter(Boolean), (el, s) => { el.href = `/snippet?id=${s.id}`; });
  }

  // =================================================================
  // ЧЕКЛІСТ СТАРТУ (v0.17) — PM/admin додають і відмічають; команда бачить.
  // Картка будується в JS і додається в root (.stack). Таблиця project_checklist, RLS: staff read / pm-admin write.
  // =================================================================
  function initChecklist() {
    if (root.querySelector('[data-pchk]')) return;
    const mk = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
    const canWrite = can('pm,admin');
    let DATA = [];
    const card = mk('div', 'card pchk_card'); card.setAttribute('data-pchk', '');
    const hd = mk('div', 'card_header'); const ttl = mk('div', 'card_title'); ttl.textContent = 'Чекліст старту'; hd.append(ttl);
    const prog = mk('div', 'text-color-secondary'); prog.style.fontSize = '.8125rem'; hd.append(prog); card.append(hd);
    const box = mk('div', 'pchk_list'); card.append(box);
    if (canWrite) {
      const form = mk('form', 'pchk_form');
      const inp = mk('input', 'form-input'); inp.type = 'text'; inp.placeholder = 'Новий пункт (напр. Бриф отримано)'; inp.required = true;
      const btn = mk('button', 'button is-small'); btn.type = 'submit'; btn.textContent = 'Додати';
      form.append(inp, btn); card.append(form);
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); const label = inp.value.trim(); if (!label) return;
        const sort = DATA.length ? Math.max(...DATA.map((x) => x.sort)) + 10 : 0;
        const { data, error } = await sb.from('project_checklist').insert({ project_id: id, label, sort }).select().single();
        if (error) return CRM.fail(error);
        DATA.push(data); inp.value = ''; draw();
      });
    }
    // v0.20.1: чекліст — частина табу «Огляд» (раніше висів під усіма табами на всю ширину)
    const overview = root.querySelector('[data-tab-panel="project:overview"]');
    if (overview) {
      card.dataset.tabPanel = 'project:overview';
      card.hidden = overview.hidden;
      overview.after(card);
    } else root.append(card);
    function draw() {
      box.replaceChildren();
      const done = DATA.filter((x) => x.done).length;
      prog.textContent = DATA.length ? `${done} / ${DATA.length}` : 'Порожньо';
      DATA.forEach((it) => {
        const row = mk('label', 'pchk_row');
        const cb = mk('input'); cb.type = 'checkbox'; cb.checked = !!it.done; cb.disabled = !canWrite;
        const sp = mk('span', 'pchk_label'); sp.textContent = it.label; sp.style.textDecoration = it.done ? 'line-through' : '';
        cb.addEventListener('change', async () => {
          const { error } = await sb.from('project_checklist').update({ done: cb.checked }).eq('id', it.id);
          if (error) { cb.checked = !cb.checked; return CRM.fail(error); }
          it.done = cb.checked; draw();
        });
        row.append(cb, sp);
        if (canWrite) {
          const del = mk('button', 'button is-text is-small pchk_del'); del.type = 'button'; del.textContent = '×'; del.title = 'Прибрати';
          del.addEventListener('click', async (ev) => {
            ev.preventDefault();
            const { error } = await sb.from('project_checklist').delete().eq('id', it.id);
            if (error) return CRM.fail(error);
            DATA = DATA.filter((x) => x.id !== it.id); draw();
          });
          row.append(del);
        }
        box.append(row);
      });
    }
    sb.from('project_checklist').select('id,label,done,sort').eq('project_id', id).order('sort').then(({ data, error }) => {
      if (error) return CRM.fail(error);
      DATA = data; draw();
    });
  }

  // =================================================================
  // ЧЕКАЄМО ВІД КЛІЄНТА (v0.18)
  // =================================================================
  function initWaits() {
    if (root.querySelector('[data-waits]')) return;
    const notesSec = root.querySelector('[data-list="project-notes"]')?.closest('section');
    if (!notesSec) return;
    const mk = (t, c, text) => { const e = document.createElement(t); if (c) e.className = c; if (text != null) e.textContent = text; return e; };
    const sec = mk('section', 'waits_section');
    sec.id = 'waits';
    sec.dataset.waits = '';
    const hd = mk('div', 'card_header');
    hd.append(mk('div', 'section_title', 'Чекаємо від клієнта'));
    const list = mk('div', 'list waits_list');
    const form = mk('form', 'waits_form');
    form.dataset.form = 'client-wait';
    form.innerHTML = '<input class="form-input" name="what" maxlength="300" required placeholder="Що чекаємо від клієнта…" aria-label="Що чекаємо від клієнта">'
      + '<input class="form-input" name="since" type="date" aria-label="Відколи чекаємо">'
      + '<button class="button is-secondary is-small" type="submit">Додати</button>';
    sec.append(hd, list, form);
    // v0.20.1: «Чекаємо від клієнта» — лише в табі «Огляд», як і нотатки
    if (notesSec.dataset.tabPanel) { sec.dataset.tabPanel = notesSec.dataset.tabPanel; sec.hidden = notesSec.hidden; }
    notesSec.before(sec);
    form.elements.since.value = new Date().toLocaleDateString('sv');
  }
  async function loadWaits() {
    const list = root.querySelector('[data-waits] .waits_list');
    if (!list) return;
    const { data, error } = await sb.from('client_waits').select('id, what, since, created_by').eq('project_id', id).is('resolved_at', null).order('since');
    if (error) return console.warn('[CRM] client_waits', error.message);
    const days = (d) => Math.round((new Date(new Date().toDateString()) - new Date(`${d}T00:00:00`)) / 864e5);
    list.replaceChildren();
    if (!data.length) {
      const e = document.createElement('div');
      e.className = 'empty_state';
      e.innerHTML = '<div class="text-size-small">Нічого не чекаємо — усе в наших руках</div>';
      list.append(e);
      return;
    }
    data.forEach((w) => {
      const row = document.createElement('div');
      row.className = 'list_row';
      row.dataset.id = w.id;
      const n = days(w.since);
      const t = document.createElement('span'); t.className = 'list_title'; t.textContent = w.what;
      const m = document.createElement('span'); m.className = `list_meta${n >= 5 ? ' is-red' : ''}`;
      m.textContent = n > 0 ? `з ${date(w.since, { day: 'numeric', month: 'short' })} · ${n} дн.` : 'з сьогодні';
      row.append(t, m);
      if (w.created_by === user.id || can('pm,admin')) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'button is-text is-small'; b.dataset.action = 'wait-done'; b.textContent = 'Отримали';
        row.append(b);
      }
      list.append(row);
    });
  }
  onSubmit('client-wait', async (d, form) => {
    const what = (d.what || '').trim();
    if (!what) return;
    const since = /^\d{4}-\d{2}-\d{2}$/.test(d.since || '') ? d.since : new Date().toLocaleDateString('sv');
    const { error } = await sb.from('client_waits').insert({ project_id: id, what, since });
    if (error) throw error;
    form.elements.what.value = '';
    loadWaits();
  });
  action('wait-done', async (el) => {
    const wid = el.closest('[data-id]')?.dataset.id;
    if (!wid) return;
    const { error } = await sb.from('client_waits').update({ resolved_at: new Date().toISOString() }).eq('id', wid);
    if (error) return CRM.fail(error);
    toast('Отримали — прибрано з очікування');
    loadWaits();
  });

  // =================================================================
  await loadProject();
  root.dataset.ready = '1'; // v0.20.1: до цього шаблонні «НАЗВА ПРОЄКТУ / Клієнт / Дати не задані» сховані (Head)
  // v0.19: Sales — лише огляд проєкту: без хендоффу, правок і сніпетів
  if (CRM.role === 'sales') {
    root.querySelector('[data-handoff]')?.setAttribute('hidden', '');
    // v0.20.1: таб-панелі перемикають hidden, тому ховаємо і самі таби
    root.querySelectorAll('[data-tab="handoff-tab"], [data-tab="feedback"]').forEach((t) => t.remove());
    ['project-feedback', 'project-snippets'].forEach((k) => root.querySelector(`[data-list="${k}"]`)?.closest('section')?.setAttribute('hidden', ''));
  }
  await Promise.all([loadTeam(), loadNotes(), loadHandoff(), loadRelated(), CRM.role === 'sales' ? null : loadReviewLine()]);
  initChecklist();
  initWaits();
  loadWaits();
  if (location.hash === '#handoff') root.querySelector('[data-handoff]')?.scrollIntoView({ block: 'start' });
  if (location.hash === '#waits') { CRM.showTab?.('project', 'overview'); root.querySelector('[data-waits]')?.scrollIntoView({ block: 'start' }); }
});
