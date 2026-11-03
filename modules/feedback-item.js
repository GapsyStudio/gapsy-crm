/* Gapsy CRM · modules/feedback-item.js — Одна правка (/feedback-item?id=<id>)
 * Розмітка: [data-element="feedback-item"], поля [data-item="title|description|project|author|assignee|page_url|created"],
 * перемикач [data-status-switch] > [data-status], скріни data-list="feedback-files" (+ модалка data-modal="image"),
 * коментарі data-list="comments" + форма data-form="comment", дія data-action="feedback-delete".
 * v0.4:
 *  - форма data-form="feedback-meta" (select priority, input[type=date] due_date) — зберігається одразу при зміні;
 *    бейджі [data-item-badge="priority|due"] у шапці;
 *  - позначки на скрінах: у модалці image — [data-mark-stage] (обгортка картинки), усередині data-list="stage-marks"
 *    з шаблоном піна (a[data-template] > [data-field="n"]), підказка [data-mark-hint], блок [data-mark-form] з формою data-form="mark"
 *    (textarea note) і дією mark-cancel; на сторінці список data-list="marks" (поля n, note, author, file) з діями
 *    mark-open, mark-toggle (+ [data-mark-check] з is-done), mark-delete. Лічильник [data-field="marks"] на мініатюрі. */
CRM.module('feedback-item', async (root, { sb, user, render, onSubmit, modal, toast, action, signedUrls, time, date, name, crumbs, param, can, badge, due, PRIORITY, FEEDBACK_STATUS }) => {
  const id = param('id');
  const $ = (s) => root.querySelector(s);
  const set = (k, v) => root.querySelectorAll(`[data-item="${k}"]`).forEach((el) => { el.textContent = v; });
  if (!id) return location.replace('/feedback');

  const { data: f, error } = await sb.from('feedback')
    .select(`id, title, description, page_url, status, priority, due_date, created_at, author_id,
      project:projects(id, name),
      author:profiles!feedback_author_id_fkey(full_name, email),
      assignee:profiles!feedback_assignee_id_fkey(full_name, email)`)
    .eq('id', id).maybeSingle();
  if (error) return CRM.fail(error);
  if (!f) {
    toast('Правку не знайдено');
    return setTimeout(() => location.replace('/feedback'), 1200);
  }

  // ---------- шапка й метадані ----------
  set('title', f.title);
  crumbs(`Правки / ${f.title}`);
  document.title = `${f.title} | Gapsy CRM`;
  set('description', f.description || 'Без опису');
  set('project', f.project?.name || '—');
  set('author', name(f.author));
  set('assignee', f.assignee ? name(f.assignee) : 'Не призначено');
  set('created', date(f.created_at));
  const link = $('[data-item="page_url"]');
  if (link) {
    if (f.page_url) link.href = f.page_url;
    else link.parentElement.hidden = true;
  }
  if (f.author_id !== user.id && !can('pm,admin')) $('[data-action="feedback-delete"]')?.remove();

  // ---------- пріоритет і дедлайн ----------
  function drawBadges() {
    const pr = $('[data-item-badge="priority"]');
    if (pr) { badge(pr, f.priority, PRIORITY); pr.hidden = f.priority === 'normal'; }
    const du = $('[data-item-badge="due"]');
    if (du) {
      const d = due(f.due_date, f.status === 'resolved');
      du.hidden = !d;
      if (d) badge(du, 'x', { x: [d.text, d.combo] });
    }
  }
  const meta = $('[data-form="feedback-meta"]');
  if (meta) {
    await CRM.fillSelects(meta);
    if (meta.elements.priority) meta.elements.priority.value = f.priority || 'normal';
    if (meta.elements.due_date) meta.elements.due_date.value = f.due_date || '';
    // зберігаємо одразу при зміні поля; кнопка не потрібна
    meta.addEventListener('change', () => meta.requestSubmit());
  }
  onSubmit('feedback-meta', async (d) => {
    const patch = { priority: d.priority || 'normal', due_date: d.due_date || null };
    if (patch.priority === f.priority && patch.due_date === (f.due_date || null)) return;
    const { error: err } = await sb.from('feedback').update(patch).eq('id', id);
    if (err) {
      meta.elements.priority.value = f.priority;
      meta.elements.due_date.value = f.due_date || '';
      throw err;
    }
    Object.assign(f, patch);
    drawBadges();
    toast('Збережено');
  });
  drawBadges();

  // ---------- статус ----------
  const markStatus = (s) => root.querySelectorAll('[data-status-switch] [data-status]').forEach((o) => {
    o.classList.toggle('is-active', o.dataset.status === s);
    o.setAttribute('aria-pressed', o.dataset.status === s);
  });
  markStatus(f.status);
  root.querySelectorAll('[data-status-switch] [data-status]').forEach((o) => o.addEventListener('click', async (e) => {
    e.preventDefault();
    const s = o.dataset.status;
    if (s === f.status) return;
    markStatus(s);
    const { error: err } = await sb.from('feedback').update({ status: s }).eq('id', id);
    if (err) { markStatus(f.status); return CRM.fail(err); }
    f.status = s;
    drawBadges();
    toast(`Статус: ${FEEDBACK_STATUS[s]?.[0] || o.textContent.trim()}`);
  }));

  // ---------- скріни ----------
  const { data: files } = await sb.from('feedback_files').select('id, path').eq('feedback_id', id).order('created_at');
  const urls = await signedUrls((files || []).map((x) => x.path));
  const shots = (files || []).map((x, i) => ({ ...x, url: urls[x.path] || '', n: i + 1 }));
  let marks = [];

  function drawShots() {
    render('feedback-files', shots.map((x) => {
      const count = marks.filter((m) => m.file_id === x.id && !m.done).length;
      return { ...x, marks: count ? String(count) : '' };
    }), (el, x) => {
      el.href = x.url;
      el.dataset.url = x.url;
      el.dataset.fileId = x.id;
      const c = el.querySelector('[data-field="marks"]');
      if (c) c.hidden = !c.textContent;
    });
  }

  // ---------- позначки ----------
  const stage = root.querySelector('[data-mark-stage]');
  const markForm = root.querySelector('[data-mark-form]');
  const hint = root.querySelector('[data-mark-hint]');
  let openFile = null; // id скріна, відкритого в модалці
  let draft = null;    // { x, y } — ще не збережена позначка

  async function loadMarks() {
    const { data, error: err } = await sb.from('feedback_marks')
      .select('id, file_id, x, y, note, done, created_by, created_at, author:profiles!feedback_marks_created_by_fkey(full_name, email)')
      .eq('feedback_id', id).order('created_at');
    if (err) return CRM.fail(err);
    marks = data.map((m, i) => ({ ...m, n: i + 1 }));
    drawShots();
    drawMarkList();
    drawStage();
  }

  function drawMarkList() {
    render('marks', marks.map((m) => ({
      ...m,
      author: name(m.author),
      time: time(m.created_at),
      file: `Скрін ${shots.find((s) => s.id === m.file_id)?.n || ''}`,
    })), (el, m) => {
      el.dataset.id = m.id;
      el.classList.toggle('is-done', m.done);
      const check = el.querySelector('[data-mark-check]');
      if (check) {
        check.classList.toggle('is-done', m.done);
        check.setAttribute('role', 'checkbox');
        check.setAttribute('aria-checked', m.done);
        check.setAttribute('aria-label', `Позначка ${m.n} виконана`);
      }
      if (m.created_by !== user.id && !can('pm,admin')) el.querySelector('[data-action="mark-delete"]')?.remove();
    });
  }

  function drawStage() {
    if (!stage || !openFile) return;
    const rowsOnShot = marks.filter((m) => m.file_id === openFile);
    if (draft) rowsOnShot.push({ id: 'draft', n: '+', x: draft.x, y: draft.y, note: 'Нова позначка', draft: true });
    render('stage-marks', rowsOnShot, (el, m) => {
      el.style.left = `${m.x * 100}%`;
      el.style.top = `${m.y * 100}%`;
      el.dataset.id = m.id;
      el.title = m.note;
      el.setAttribute('aria-label', `Позначка ${m.n}: ${m.note}`);
      el.classList.toggle('is-done', !!m.done);
      el.classList.toggle('is-draft', !!m.draft);
    });
    if (markForm) markForm.hidden = !draft;
    if (hint) hint.hidden = !!draft;
  }

  function openShot(fileId, focusMark) {
    const shot = shots.find((s) => s.id === fileId);
    if (!shot) return;
    openFile = fileId;
    draft = null;
    const m = modal.open('image');
    const img = m?.querySelector('[data-lightbox-img]');
    if (img) { img.removeAttribute('srcset'); img.src = shot.url; }
    drawStage();
    if (focusMark) {
      const pin = stage?.querySelector(`[data-list="stage-marks"] > [data-id="${focusMark}"]`);
      pin?.classList.add('is-active');
      setTimeout(() => pin?.classList.remove('is-active'), 1600);
    }
  }
  action('open-image', (el) => openShot(el.dataset.fileId || el.closest('[data-file-id]')?.dataset.fileId));
  action('mark-open', (el) => {
    const m = marks.find((x) => x.id === el.closest('[data-id]')?.dataset.id);
    if (m) openShot(m.file_id, m.id);
  });

  // клік по скріну в модалці → чернетка позначки
  stage?.querySelector('[data-lightbox-img]')?.addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    draft = { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
    drawStage();
    setTimeout(() => markForm?.querySelector('textarea, input')?.focus(), 30);
  });
  stage?.querySelector('[data-lightbox-img]')?.style.setProperty('cursor', 'crosshair');

  // клік по піну в модалці — показати текст позначки
  action('mark-pin', (el) => {
    const m = marks.find((x) => x.id === el.dataset.id);
    if (m) toast(`${m.n}. ${m.note}`, 4000);
  });

  action('mark-cancel', () => {
    draft = null;
    markForm?.querySelector('form')?.reset();
    drawStage();
  });

  onSubmit('mark', async (d, form) => {
    const note = (d.note || '').trim();
    if (!draft || !openFile || !note) return;
    const { error: err } = await sb.from('feedback_marks').insert({
      feedback_id: id, file_id: openFile, x: draft.x, y: draft.y, note: note.slice(0, 500),
    });
    if (err) throw err;
    draft = null;
    form.reset();
    toast('Позначку додано');
    loadMarks();
  });

  action('mark-toggle', async (el) => {
    const m = marks.find((x) => x.id === el.closest('[data-id]')?.dataset.id);
    if (!m) return;
    m.done = !m.done;
    drawMarkList(); drawStage(); drawShots();
    const { error: err } = await sb.from('feedback_marks').update({ done: m.done }).eq('id', m.id);
    if (err) { m.done = !m.done; drawMarkList(); drawStage(); drawShots(); CRM.fail(err); }
  });

  action('mark-delete', async (el) => {
    const m = marks.find((x) => x.id === el.closest('[data-id]')?.dataset.id);
    if (!m || !confirm(`Видалити позначку ${m.n}?`)) return;
    const { error: err } = await sb.from('feedback_marks').delete().eq('id', m.id);
    if (err) return CRM.fail(err);
    loadMarks();
  });

  // модалку закрили (×, фон, Esc) — чернетку прибираємо
  const imageModal = root.querySelector('[data-modal="image"]');
  if (imageModal) new MutationObserver(() => {
    if (!imageModal.classList.contains('is-open')) { draft = null; openFile = null; }
  }).observe(imageModal, { attributes: true, attributeFilter: ['class'] });

  drawShots();
  loadMarks();

  // ---------- коментарі ----------
  async function loadComments() {
    const { data, error: err } = await sb.from('feedback_comments')
      .select('id, body, created_at, author:profiles!feedback_comments_author_id_fkey(full_name, email, avatar_url)')
      .eq('feedback_id', id).order('created_at');
    if (err) return CRM.fail(err);
    render('comments', data.map((c) => ({ ...c, author: name(c.author), time: time(c.created_at), avatar: c.author?.avatar_url })));
  }
  onSubmit('comment', async (d, form) => {
    const body = d.body.trim();
    if (!body) return;
    const { error: err } = await sb.from('feedback_comments').insert({ feedback_id: id, body });
    if (err) throw err;
    form.reset();
    loadComments();
  });
  loadComments();

  // ---------- видалення ----------
  action('feedback-delete', async () => {
    if (!confirm('Видалити правку разом зі скрінами й коментарями?')) return;
    const { error: err } = await sb.from('feedback').delete().eq('id', id);
    if (err) return CRM.fail(err);
    // simplified: файли в Storage лишаються; прибирання — окремою задачею, коли знадобиться
    location.replace('/feedback');
  });
});
