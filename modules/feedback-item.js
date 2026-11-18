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
 *    mark-open, mark-toggle (+ [data-mark-check] з is-done), mark-delete. Лічильник [data-field="marks"] на мініатюрі.
 * v0.11: shot-delete у модалці image, comment-delete у рядку коментаря (свій або PM/admin); при видаленні правки скріни прибираються зі Storage.
 * v0.21: «Ревʼю за посиланням» — картка «Жива сторінка» (будує JS, перед скрінами) і повноекранний режим ревʼю:
 *   сторінка з feedback.page_url у iframe (?crm-review=1), ліворуч піни, Коментувати / Переглядати, ширини 1440 / 768 / 390.
 *   Піни на сайті малює review-bridge.js (має стояти у Footer сайту); зберігаються у feedback_marks з file_id = null і anchor {w, py, dh}.
 *   Відкрити одразу: /feedback-item?id=…#review. Потрібна міграція 023_url_review. Стилі — блок 17 у Head.
 * v0.23: піни на будь-якій сторінці сайту — anchor.path (без path = сторінка з page_url). У ревʼю є рядок адреси сторінки,
 *   «Переглядати» → перейти посиланням → «Коментувати»; список «На інших сторінках: /about · 2» перемикає сторінку.
 * v0.23.1: кнопка «Код мосту» (копіює рядок review-bridge.js для Footer сайту) — у картці «Жива сторінка» і в попередженні «Сайт не відповідає».
 * v0.22: скріни до пінів (таблиця feedback_mark_files, міграція 024): у формі нового піна — вставити (⌘V, напр. з Figma
 *   Shift+⌘+C), перетягнути або вибрати файл; до наявного піна — «+ Скрін» або перетягнути на рядок. Мініатюри в списках,
 *   клік — перегляд на весь екран. Картинки зменшуються до 2400 px перед завантаженням. Стилі — блок 18 у Head. */
CRM.module('feedback-item', async (root, { sb, user, render, onSubmit, modal, toast, action, signedUrls, time, date, name, crumbs, param, can, badge, due, PRIORITY, FEEDBACK_STATUS }) => {
  const id = param('id');
  const $ = (s) => root.querySelector(s);
  const set = (k, v) => root.querySelectorAll(`[data-item="${k}"]`).forEach((el) => { el.textContent = v; });
  const safePath = (u) => { try { return new URL(u).pathname.replace(/\/+$/, '') || '/'; } catch (e) { return '/'; } };
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
  root.dataset.ready = '1'; // v0.20.1: до цього шаблонні «Назва…» сховані (стилі в Head)
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
  const { data: files } = await sb.from('feedback_files').select('id, path, created_by').eq('feedback_id', id).order('created_at');
  const urls = await signedUrls((files || []).map((x) => x.path));
  const shots = (files || []).map((x, i) => ({ ...x, url: urls[x.path] || '', n: i + 1 }));
  let marks = [];

  // =================================================================
  // v0.22 СКРІНИ ДО ПІНІВ (feedback_mark_files) — спільне для пінів на сторінці й на скрінах
  // =================================================================
  const pinFiles = (() => {
    const MAX = 6;
    const MAXPX = 2400;
    const MAXMB = 15;
    let byMark = {};    // mark_id → [{id, path, url, created_by}]
    let ready = true;   // false, якщо міграції 024 ще немає
    const el = (t, c, text) => { const e = document.createElement(t); if (c) e.className = c; if (text != null) e.textContent = text; return e; };
    const isImg = (f) => /^image\/(png|jpe?g|webp|gif)$/i.test(f.type);

    // Великі PNG із Figma (2×, 4000+ px) зменшуємо до 2400 px по довшій стороні; маленькі — як є
    async function shrink(file) {
      if (!/^image\/(png|jpe?g|webp)$/i.test(file.type) || !window.createImageBitmap) return file;
      try {
        const bmp = await createImageBitmap(file);
        const k = Math.min(1, MAXPX / Math.max(bmp.width, bmp.height));
        if (k === 1 && file.size < 3 * 1048576) { bmp.close?.(); return file; }
        const c = document.createElement('canvas');
        c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close?.();
        const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
        const blob = await new Promise((r) => c.toBlob(r, type, 0.9));
        if (!blob || blob.size >= file.size) return file;
        const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
        return new File([blob], `pin.${ext}`, { type: blob.type });
      } catch (e) { return file; }
    }

    async function load() {
      const { data, error: err } = await sb.from('feedback_mark_files').select('id, mark_id, path, created_by, created_at').eq('feedback_id', id).order('created_at');
      if (err) { ready = false; byMark = {}; return; } // до міграції 024 — просто без скрінів
      ready = true;
      const urls = await signedUrls((data || []).map((x) => x.path));
      byMark = {};
      (data || []).forEach((x) => { (byMark[x.mark_id] = byMark[x.mark_id] || []).push({ ...x, url: urls[x.path] || '' }); });
    }

    async function save(markId, files) {
      if (!ready) { toast('Щоб прикріплювати скріни, запусти міграцію 024_mark_files у Supabase'); return 0; }
      const room = MAX - (byMark[markId]?.length || 0);
      const list = files.filter(isImg).slice(0, Math.max(0, room));
      if (files.length && !list.length) { toast(room <= 0 ? `До піна — не більше ${MAX} скрінів` : 'Можна лише картинки (PNG, JPG, WebP, GIF)'); return 0; }
      let ok = 0;
      for (const f of list) {
        if (f.size > MAXMB * 1048576) { toast(`Файл більший за ${MAXMB} МБ`); continue; }
        try {
          const path = await CRM.upload(await shrink(f), 'feedback-marks');
          const { error: err } = await sb.from('feedback_mark_files').insert({ mark_id: markId, feedback_id: id, path });
          if (err) { CRM.removeFiles([path]); throw err; }
          ok += 1;
        } catch (e) { CRM.fail(e); break; }
      }
      return ok;
    }

    async function remove(fileId) {
      const f = Object.values(byMark).flat().find((x) => x.id === fileId);
      if (!f || !confirm('Прибрати цей скрін із піна?')) return false;
      const { error: err } = await sb.from('feedback_mark_files').delete().eq('id', fileId);
      if (err) { CRM.fail(err); return false; }
      CRM.removeFiles([f.path]);
      return true;
    }

    // перегляд на весь екран
    function lightbox(markId, startId) {
      const list = byMark[markId] || [];
      let i = Math.max(0, list.findIndex((x) => x.id === startId));
      const wrap = el('div', 'pf_lightbox');
      wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', 'Скрін до піна');
      const img = el('img', 'pf_lightbox-img');
      const bar = el('div', 'pf_lightbox-bar');
      const count = el('span', 'pf_lightbox-count');
      const orig = el('a', 'pf_lightbox-link', 'Оригінал ↗'); orig.target = '_blank'; orig.rel = 'noopener';
      const close = el('button', 'pf_lightbox-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Закрити');
      bar.append(count, orig, close);
      wrap.append(img, bar);
      const show = () => { const f = list[i]; img.src = f.url; img.alt = `Скрін ${i + 1}`; orig.href = f.url; count.textContent = list.length > 1 ? `${i + 1} / ${list.length}` : ''; };
      const done = () => { wrap.remove(); document.removeEventListener('keydown', key, true); };
      const key = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); done(); }
        if (e.key === 'ArrowRight' && list.length > 1) { i = (i + 1) % list.length; show(); }
        if (e.key === 'ArrowLeft' && list.length > 1) { i = (i - 1 + list.length) % list.length; show(); }
      };
      wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target === close) done(); });
      document.addEventListener('keydown', key, true);
      document.body.append(wrap);
      show();
      close.focus();
    }

    // мініатюри піна (+ «+ Скрін», × для свого)
    function strip(markId, onChange) {
      const box = el('div', 'pf_strip');
      (byMark[markId] || []).forEach((f) => {
        const t = el('span', 'pf_thumb');
        const b = el('button', 'pf_thumb-btn'); b.type = 'button'; b.setAttribute('aria-label', 'Відкрити скрін');
        const img = el('img'); img.src = f.url; img.alt = ''; img.loading = 'lazy';
        b.append(img);
        b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); lightbox(markId, f.id); });
        t.append(b);
        if (f.created_by === user.id || can('pm,admin')) {
          const x = el('button', 'pf_thumb-del', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Прибрати скрін');
          x.addEventListener('click', async (e) => { e.preventDefault(); e.stopPropagation(); if (await remove(f.id)) onChange(); });
          t.append(x);
        }
        box.append(t);
      });
      if (ready && (byMark[markId]?.length || 0) < MAX) {
        const add = el('label', 'button is-text is-small pf_add', '+ Скрін');
        add.title = 'Додати скрін (або перетягни картинку на пін)';
        const inp = el('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/gif'; inp.multiple = true; inp.hidden = true;
        inp.addEventListener('change', async () => { const n = await save(markId, [...inp.files]); inp.value = ''; if (n) { toast(n > 1 ? `Скрінів додано: ${n}` : 'Скрін додано'); onChange(); } });
        add.addEventListener('click', (e) => e.stopPropagation());
        add.append(inp);
        box.append(add);
      }
      return box;
    }

    // перетягнути картинку на рядок піна
    function dropTarget(row, markId, onChange) {
      if (row.dataset.pfDrop) return;
      row.dataset.pfDrop = '1';
      row.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items || [])].some((x) => x.kind === 'file')) { e.preventDefault(); row.classList.add('is-dragover'); } });
      row.addEventListener('dragleave', () => row.classList.remove('is-dragover'));
      row.addEventListener('drop', async (e) => {
        e.preventDefault(); row.classList.remove('is-dragover');
        const n = await save(markId, [...(e.dataTransfer?.files || [])]);
        if (n) { toast('Скрін додано'); onChange(); }
      });
    }

    // поле вкладень у формі нового піна: ⌘V / перетягнути / вибрати; файли чекають збереження піна
    function picker(form) {
      const st = { files: [] };
      const box = el('div', 'pf_picker');
      const hint = el('div', 'pf_picker-hint');
      const pick = el('label', 'pf_picker-pick', 'вибери файл');
      const inp = el('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/gif'; inp.multiple = true; inp.hidden = true;
      pick.append(inp);
      hint.append('Скрін: встав ⌘V (з Figma — Shift+⌘+C), перетягни або ', pick);
      const list = el('div', 'pf_strip');
      box.append(hint, list);
      const draw = () => {
        list.replaceChildren();
        st.files.forEach((f, i) => {
          const t = el('span', 'pf_thumb');
          const img = el('img'); img.alt = ''; img.src = URL.createObjectURL(f); img.onload = () => URL.revokeObjectURL(img.src);
          const x = el('button', 'pf_thumb-del', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Прибрати');
          x.addEventListener('click', () => { st.files.splice(i, 1); draw(); });
          t.append(img, x); list.append(t);
        });
        box.classList.toggle('has-files', st.files.length > 0);
      };
      const add = (files) => {
        const imgs = [...files].filter(isImg);
        if (!imgs.length) return false;
        st.files = st.files.concat(imgs).slice(0, MAX);
        draw();
        return true;
      };
      inp.addEventListener('change', () => { add(inp.files); inp.value = ''; });
      form.addEventListener('paste', (e) => { if (add(e.clipboardData?.files || [])) e.preventDefault(); });
      box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('is-dragover'); });
      box.addEventListener('dragleave', () => box.classList.remove('is-dragover'));
      box.addEventListener('drop', (e) => { e.preventDefault(); box.classList.remove('is-dragover'); add(e.dataTransfer?.files || []); });
      form.addEventListener('reset', () => { st.files = []; draw(); });
      box.hidden = !ready;
      st.el = box;
      st.refresh = () => { box.hidden = !ready; };
      return st;
    }

    // шляхи файлів піна / усієї правки — щоб прибрати їх зі сховища разом із піном (рядки БД видаляє каскад)
    const paths = (markId) => (markId ? byMark[markId] || [] : Object.values(byMark).flat()).map((x) => x.path);
    return { load, save, strip, dropTarget, picker, paths, has: (m) => (byMark[m]?.length || 0) > 0, get ready() { return ready; } };
  })();

  function drawShots() {
    render('feedback-files', shots.map((x) => {
      const count = marks.filter((m) => m.file_id === x.id && !m.done).length;
      return { ...x, marks: count ? String(count) : '' };
    }), (el, x) => {
      el.href = x.url;
      el.dataset.url = x.url;
      el.dataset.fileId = x.id;
      // Webflow не дозволяє data-field-src на Image, тому мініатюру ставимо явно
      const img = el.querySelector('img');
      if (img && x.url) { img.removeAttribute('srcset'); img.loading = 'lazy'; img.src = x.url; }
      const c = el.querySelector('[data-field="marks"]');
      if (c) c.hidden = !c.textContent;
    });
  }

  // ---------- позначки ----------
  const stage = root.querySelector('[data-mark-stage]');
  const markForm = root.querySelector('[data-mark-form]');
  // v0.22: вкладення у формі піна на скріні
  const markFormEl = markForm?.querySelector('form');
  const markPicker = markFormEl ? pinFiles.picker(markFormEl) : null;
  if (markPicker) {
    const ta = markFormEl.querySelector('textarea');
    if (ta) ta.after(markPicker.el); else markFormEl.prepend(markPicker.el);
  }
  const hint = root.querySelector('[data-mark-hint]');
  let openFile = null; // id скріна, відкритого в модалці
  let draft = null;    // { x, y } — ще не збережена позначка

  async function loadMarks() {
    const { data, error: err } = await sb.from('feedback_marks')
      .select('id, file_id, x, y, note, done, created_by, created_at, anchor, author:profiles!feedback_marks_created_by_fkey(full_name, email)')
      .eq('feedback_id', id).order('created_at');
    if (err) return CRM.fail(err);
    marks = data.map((m, i) => ({ ...m, n: i + 1 }));
    await pinFiles.load();
    markPicker?.refresh();
    drawShots();
    drawMarkList();
    drawStage();
    review.sync();
  }

  function drawMarkList() {
    render('marks', marks.map((m) => ({
      ...m,
      author: name(m.author),
      time: time(m.created_at),
      file: m.file_id ? `Скрін ${shots.find((s) => s.id === m.file_id)?.n || ''}` : `На сторінці ${m.anchor?.path || (safePath(f.page_url))} · ${m.anchor?.w || ''}`,
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
      // v0.22: скріни до піна
      el.querySelector('.pf_strip')?.remove();
      if (pinFiles.ready) {
        const st = pinFiles.strip(m.id, loadMarks);
        (el.querySelector('[data-field="note"]')?.parentElement || el).append(st);
        pinFiles.dropTarget(el, m.id, loadMarks);
      }
    });
    // v0.20.1: без скрінів секція «Позначки» — лише друга порожня плашка, ховаємо
    const sec = root.querySelector('[data-list="marks"]')?.closest('section');
    if (sec) sec.hidden = !shots.length && !marks.length;
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
    m?.querySelector('[data-action="shot-delete"]')?.toggleAttribute('hidden', !(shot.created_by === user.id || can('pm,admin')));
    drawStage();
    if (focusMark) {
      const pin = stage?.querySelector(`[data-list="stage-marks"] > [data-id="${focusMark}"]`);
      pin?.classList.add('is-active');
      setTimeout(() => pin?.classList.remove('is-active'), 1600);
    }
  }
  // v0.11: видалити скрін (кнопка data-action="shot-delete" у модалці image; автор скріна або PM/admin)
  action('shot-delete', async () => {
    const shot = shots.find((x) => x.id === openFile);
    if (!shot || !confirm('Видалити цей скрін разом із позначками на ньому?')) return;
    const pinPaths = marks.filter((mk) => mk.file_id === shot.id).flatMap((mk) => pinFiles.paths(mk.id));
    const { error: err } = await sb.from('feedback_files').delete().eq('id', shot.id);
    if (err) return CRM.fail(err);
    CRM.removeFiles([shot.path, ...pinPaths]);
    shots.splice(shots.indexOf(shot), 1);
    shots.forEach((x, i) => { x.n = i + 1; });
    marks = marks.filter((mk) => mk.file_id !== shot.id);
    openFile = null;
    modal.close();
    drawShots();
    loadMarks();
    toast('Скрін видалено');
  });
  action('open-image', (el) => openShot(el.dataset.fileId || el.closest('[data-file-id]')?.dataset.fileId));
  action('mark-open', (el) => {
    const m = marks.find((x) => x.id === el.closest('[data-id]')?.dataset.id);
    if (!m) return;
    if (m.file_id) openShot(m.file_id, m.id);
    else review.open(m.id);
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
    const { data: row, error: err } = await sb.from('feedback_marks').insert({
      feedback_id: id, file_id: openFile, x: draft.x, y: draft.y, note: note.slice(0, 500),
    }).select('id').single();
    if (err) throw err;
    if (markPicker?.files.length && row?.id) await pinFiles.save(row.id, markPicker.files);
    draft = null;
    form.reset();
    toast('Позначку додано');
    loadMarks();
  });

  action('mark-toggle', async (el) => {
    const m = marks.find((x) => x.id === el.closest('[data-id]')?.dataset.id);
    if (!m) return;
    m.done = !m.done;
    drawMarkList(); drawStage(); drawShots(); review.sync();
    const { error: err } = await sb.from('feedback_marks').update({ done: m.done }).eq('id', m.id);
    if (err) { m.done = !m.done; drawMarkList(); drawStage(); drawShots(); review.sync(); CRM.fail(err); }
  });

  action('mark-delete', async (el) => {
    const m = marks.find((x) => x.id === el.closest('[data-id]')?.dataset.id);
    if (!m || !confirm(`Видалити позначку ${m.n}?`)) return;
    const files = pinFiles.paths(m.id);
    const { error: err } = await sb.from('feedback_marks').delete().eq('id', m.id);
    if (err) return CRM.fail(err);
    CRM.removeFiles(files); // v0.22.1: скріни піна — теж зі сховища
    loadMarks();
  });

  // модалку закрили (×, фон, Esc) — чернетку прибираємо
  const imageModal = root.querySelector('[data-modal="image"]');
  if (imageModal) new MutationObserver(() => {
    if (!imageModal.classList.contains('is-open')) { draft = null; openFile = null; }
  }).observe(imageModal, { attributes: true, attributeFilter: ['class'] });


  // =================================================================
  // v0.21 РЕВʼЮ ЗА ПОСИЛАННЯМ: жива сторінка в iframe + review-bridge.js на сайті
  // =================================================================
  // review_width окремим запитом: до міграції 023 колонки немає, і основний select не має падати
  const { data: rw } = await sb.from('feedback').select('review_width').eq('id', id).maybeSingle();
  if (rw?.review_width) f.review_width = rw.review_width;
  const review = (() => {
    const WIDTHS = [1440, 768, 390];
    const WLABEL = { 1440: 'Десктоп', 768: 'Планшет', 390: 'Мобайл' };
    const mk = (t, c, text) => { const e = document.createElement(t); if (c) e.className = c; if (text != null) e.textContent = text; return e; };
    const btn = (c, text, act) => { const b = mk('button', c, text); b.type = 'button'; if (act) b.dataset.rv = act; return b; };
    let width = WIDTHS.includes(f.review_width) ? f.review_width : 1440;
    let mode = 'comment';
    let ui = null;          // елементи режиму ревʼю, коли відкритий
    let ready = false;      // міст відповів
    let curPath = null;     // v0.23: сторінка, відкрита в iframe (pathname), — піни показуємо й ставимо для неї
    let draft = null;       // {x, y, py, dh} з мосту
    let focusAfter = null;  // id піна, до якого прокрутити після ready
    let waitTimer = null;
    let failed = false;     // міст так і не відповів

    const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x : null; } catch (e) { return null; } };
    // v0.23.1: рядок для Site Settings → Custom Code → Footer сайту, який ревʼюїмо (однаковий для всіх сайтів)
    const BRIDGE_VER = 'v0.21.1';
    const bridgeSnippet = () => `<script defer src="https://cdn.jsdelivr.net/gh/GapsyStudio/gapsy-crm@${BRIDGE_VER}/review-bridge.js" data-crm-origin="${location.origin}"></script>`;
    async function copyBridge() {
      try { await navigator.clipboard.writeText(bridgeSnippet()); toast('Код мосту скопійовано — встав у Site Settings → Custom Code → Footer сайту і опублікуй', 5000); }
      catch (e) { window.prompt('Скопіюй рядок для Footer сайту:', bridgeSnippet()); }
    }
    const target = () => safeUrl(f.page_url || '');
    const normPath = (p) => (p || '/').replace(/\/+$/, '') || '/';
    const urlPins = () => marks.filter((m) => !m.file_id && m.anchor);
    const startPath = () => normPath(target()?.pathname);
    const pinPath = (m) => normPath(m.anchor?.path || target()?.pathname);   // старі піни без path — на сторінці з page_url
    const onPath = (m) => pinPath(m) === normPath(curPath || startPath());
    const pinsHere = () => urlPins().filter((m) => (m.anchor.w || 1440) === width && onPath(m));

    // ---------- картка «Жива сторінка» на сторінці правки ----------
    const card = mk('section', 'card rv_card');
    card.dataset.reviewCard = '';
    const head = mk('div', 'card_header');
    head.append(mk('div', 'section_title', 'Жива сторінка'));
    const count = mk('span', 'list_meta');
    head.append(count);
    const body = mk('div', 'rv_card-body');
    const urlLine = mk('a', 'rv_card-url');
    urlLine.target = '_blank'; urlLine.rel = 'noopener';
    const openBtn = btn('button is-small', 'Відкрити ревʼю', 'open');
    const editBtn = btn('button is-text is-small', 'Змінити посилання', 'edit');
    const form = mk('form', 'rv_card-form');
    form.innerHTML = '<input class="form-input" name="url" type="url" required placeholder="https://site.webflow.io/сторінка" aria-label="Посилання на сторінку для ревʼю">'
      + '<button class="button is-small" type="submit">Зберегти</button>';
    const help = mk('div', 'list_meta rv_card-help', 'Сторінка відкриється жива, з анімаціями. Піни ставляться прямо на ній — на сайті має стояти review-bridge.js.');
    const bridgeBtn = btn('button is-text is-small rv_card-bridge', 'Код мосту', 'bridge');
    bridgeBtn.title = 'Скопіювати рядок для Footer сайту (один і той самий для всіх сайтів)';
    body.append(urlLine, openBtn, editBtn, bridgeBtn, form, help);
    card.append(head, body);
    const filesList = root.querySelector('[data-list="feedback-files"]');
    const before = filesList?.closest('section') || filesList;
    if (before) before.before(card); else root.append(card);

    function drawCard() {
      const t = target();
      const n = urlPins().filter((m) => !m.done).length;
      count.textContent = urlPins().length ? `Відкритих пінів: ${n}` : '';
      urlLine.hidden = !t;
      if (t) { urlLine.href = t.href; urlLine.textContent = t.host + (t.pathname === '/' ? '' : t.pathname); }
      openBtn.hidden = !t;
      editBtn.hidden = !t;
      form.hidden = !!t && !card.classList.contains('is-editing');
      help.hidden = !!t;
      if (!form.hidden) form.elements.url.value = f.page_url || '';
    }
    card.addEventListener('click', (e) => {
      const a = e.target.closest('[data-rv]')?.dataset.rv;
      if (a === 'open') open();
      if (a === 'edit') { card.classList.add('is-editing'); drawCard(); form.elements.url.focus(); }
      if (a === 'bridge') copyBridge();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = safeUrl(form.elements.url.value.trim());
      if (!t) return toast('Посилання має починатися з https://');
      const { error: err } = await sb.from('feedback').update({ page_url: t.href }).eq('id', id);
      if (err) return CRM.fail(err);
      f.page_url = t.href;
      card.classList.remove('is-editing');
      const link = $('[data-item="page_url"]');
      if (link) { link.href = t.href; link.parentElement.hidden = false; }
      drawCard();
      toast('Посилання збережено');
    });

    // ---------- повноекранний режим ----------
    function build() {
      const wrap = mk('div', 'rv');
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.setAttribute('aria-label', 'Ревʼю сторінки');
      const side = mk('aside', 'rv_side');
      const top = mk('div', 'rv_top');
      const back = btn('button is-text is-small rv_back', '← До правки', 'close');
      const ttl = mk('div', 'rv_title', f.title);
      top.append(back, ttl);
      const bar = mk('div', 'rv_bar');
      const modes = mk('div', 'view_switch rv_modes');
      modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'Режим');
      [['comment', 'Коментувати'], ['browse', 'Переглядати']].forEach(([k, l]) => { const b = btn('view_switch-btn', l, `mode:${k}`); modes.append(b); });
      const widths = mk('div', 'view_switch rv_widths');
      widths.setAttribute('role', 'group'); widths.setAttribute('aria-label', 'Ширина');
      WIDTHS.forEach((w) => { const b = btn('view_switch-btn', String(w), `width:${w}`); b.title = WLABEL[w]; widths.append(b); });
      bar.append(modes, widths);
      // v0.23: рядок адреси — яку сторінку сайту ревʼюїмо
      const nav = mk('form', 'rv_nav');
      const host = mk('span', 'rv_nav-host', target()?.host || '');
      const path = mk('input', 'form-input rv_nav-path');
      path.name = 'path'; path.type = 'text'; path.spellcheck = false; path.autocomplete = 'off';
      path.setAttribute('aria-label', 'Сторінка сайту'); path.placeholder = '/';
      const go = mk('button', 'button is-text is-small', 'Відкрити'); go.type = 'submit';
      nav.append(host, path, go);
      const status = mk('div', 'rv_status');
      status.setAttribute('role', 'status');
      const pinForm = mk('form', 'rv_form');
      pinForm.innerHTML = '<textarea class="form-input" name="note" maxlength="500" required rows="3" placeholder="Що змінити тут?" aria-label="Текст піна"></textarea>'
        + '<div class="rv_form-actions"><button class="button is-small" type="submit">Зберегти пін</button>'
        + '<button class="button is-text is-small" type="button" data-rv="cancel">Скасувати</button></div>';
      const picker = pinFiles.picker(pinForm);
      pinForm.querySelector('.rv_form-actions').before(picker.el);
      const list = mk('div', 'rv_list');
      const other = mk('div', 'rv_other');
      side.append(top, bar, nav, status, pinForm, list, other);
      const stage = mk('div', 'rv_stage');
      const scaleBox = mk('div', 'rv_scale');
      const frame = mk('iframe', 'rv_frame');
      frame.title = 'Сторінка для ревʼю';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
      frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      const zoom = mk('div', 'rv_zoom');
      scaleBox.append(frame);
      stage.append(scaleBox, zoom);
      wrap.append(side, stage);
      document.body.append(wrap);
      return { wrap, side, back, modes, widths, nav, path, status, pinForm, picker, list, other, stage, scaleBox, frame, zoom };
    }

    function post(msg) {
      const t = target();
      if (!ui || !t || !ui.frame.contentWindow) return;
      ui.frame.contentWindow.postMessage({ __crm: 1, ...msg }, t.origin);
    }
    const pinPayload = () => pinsHere().map((m) => ({ id: m.id, n: m.n, x: m.x, y: m.y, py: typeof m.anchor.py === 'number' ? m.anchor.py : undefined, done: !!m.done }));
    function sendState() {
      post({ type: 'mode', mode });
      post({ type: 'pins', pins: pinPayload() });
    }

    function fit() {
      if (!ui) return;
      const W = ui.stage.clientWidth - 32;
      const H = ui.stage.clientHeight - 32;
      const k = Math.min(1, W / width);
      ui.frame.style.width = `${width}px`;
      ui.frame.style.height = `${Math.max(320, Math.floor(H / k))}px`;
      ui.scaleBox.style.width = `${Math.round(width * k)}px`;
      ui.scaleBox.style.height = `${Math.round(H)}px`;
      ui.frame.style.transform = k < 1 ? `scale(${k})` : '';
      ui.zoom.textContent = `${width} · ${Math.round(k * 100)}%`;
    }

    function setStatus(text, kind) {
      if (!ui) return;
      ui.status.textContent = text;
      ui.status.className = `rv_status${kind ? ` is-${kind}` : ''}`;
    }
    function statusDefault() {
      if (!ready && failed) {
        setStatus('Сайт не відповідає: на ньому немає review-bridge.js або він не дозволяє вбудовування. Переглядати можна, піни — ні.', 'warn');
        const a = mk('a', 'button is-text is-small', 'Відкрити в новій вкладці ↗');
        a.href = target().href; a.target = '_blank'; a.rel = 'noopener';
        return ui.status.append(' ', btn('button is-text is-small', 'Скопіювати код мосту', 'bridge'), ' ', a);
      }
      if (!ready) return setStatus('Завантажуємо сторінку…');
      setStatus(mode === 'comment' ? 'Клікни по сторінці, щоб поставити пін. Скрол і анімації працюють.' : 'Сторінка повністю інтерактивна. Щоб ставити піни — «Коментувати».');
    }

    function drawUi() {
      if (!ui) return;
      ui.modes.querySelectorAll('[data-rv^="mode:"]').forEach((b) => {
        const on = b.dataset.rv === `mode:${mode}`;
        b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on);
      });
      ui.widths.querySelectorAll('[data-rv^="width:"]').forEach((b) => {
        const on = b.dataset.rv === `width:${width}`;
        b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on);
      });
      ui.pinForm.hidden = !draft;
      // список пінів цієї ширини
      ui.list.replaceChildren();
      const here = pinsHere();
      if (!here.length) ui.list.append(mk('div', 'list_meta rv_empty', mode === 'comment' ? 'На цій сторінці й ширині пінів ще немає.' : 'На цій сторінці й ширині пінів немає.'));
      if (document.activeElement !== ui.path) ui.path.value = curPath || startPath();
      here.forEach((m) => {
        const row = mk('div', `rv_pin${m.done ? ' is-done' : ''}`);
        row.dataset.id = m.id;
        const num = btn('rv_pin-n', String(m.n), 'focus');
        num.setAttribute('aria-label', `Показати пін ${m.n} на сторінці`);
        const txt = mk('div', 'rv_pin-text');
        txt.append(mk('div', 'rv_pin-note', m.note), mk('div', 'list_meta', `${name(m.author)} · ${time(m.created_at)}`));
        const acts = mk('div', 'rv_pin-actions');
        const done = btn('button is-text is-small', m.done ? 'Повернути' : 'Готово', 'toggle');
        acts.append(done);
        if (m.created_by === user.id || can('pm,admin')) acts.append(btn('button is-text is-small', 'Видалити', 'delete'));
        row.append(num, txt, acts);
        if (pinFiles.ready) { txt.append(pinFiles.strip(m.id, loadMarks)); pinFiles.dropTarget(row, m.id, loadMarks); }
        ui.list.append(row);
      });
      ui.other.replaceChildren();
      // інші ширини цієї сторінки
      const restW = urlPins().filter((m) => onPath(m) && (m.anchor.w || 1440) !== width);
      if (restW.length) {
        const by = {};
        restW.forEach((m) => { by[m.anchor.w] = (by[m.anchor.w] || 0) + 1; });
        const row = mk('div', 'rv_other-row');
        row.append(mk('span', 'list_meta', 'На інших ширинах: '));
        Object.keys(by).forEach((w) => row.append(btn('button is-text is-small', `${w} · ${by[w]}`, `width:${w}`)));
        ui.other.append(row);
      }
      // v0.23: інші сторінки сайту з пінами
      const restP = urlPins().filter((m) => !onPath(m));
      if (restP.length) {
        const by = {};
        restP.forEach((m) => { const k = pinPath(m); by[k] = (by[k] || 0) + (m.done ? 0 : 1); });
        const row = mk('div', 'rv_other-row');
        row.append(mk('span', 'list_meta', 'На інших сторінках: '));
        Object.keys(by).sort().forEach((pth) => {
          const b = btn('button is-text is-small rv_other-page', by[pth] ? `${pth} · ${by[pth]}` : `${pth} ✓`, 'goto');
          b.dataset.path = pth; b.title = `Відкрити ${pth}`;
          row.append(b);
        });
        ui.other.append(row);
      }
      statusDefault();
    }

    function load(path) {
      const t = target();
      if (!ui || !t) return;
      ready = false; failed = false; draft = null;
      curPath = normPath(path || curPath || t.pathname);
      clearTimeout(waitTimer);
      const u = new URL(t.href);
      if (curPath !== normPath(t.pathname)) { u.pathname = curPath; u.search = ''; u.hash = ''; }
      u.searchParams.set('crm-review', '1');
      ui.frame.src = u.href;
      drawUi();
      waitTimer = setTimeout(() => { if (!ready && ui) { failed = true; drawUi(); } }, 8000);
    }

    function onMessage(e) {
      const t = target();
      if (!ui || !t || e.source !== ui.frame.contentWindow || e.origin !== t.origin) return;
      const d = e.data || {};
      if (d.__crm !== 1) return;
      if (d.type === 'ready') {
        ready = true;
        clearTimeout(waitTimer);
        const p = typeof d.path === 'string' ? normPath(d.path.slice(0, 300)) : startPath();
        if (p !== curPath) draft = null;
        curPath = p;
        sendState();
        drawUi();
        const fm = focusAfter && marks.find((x) => x.id === focusAfter);
        if (fm && onPath(fm)) { post({ type: 'focus', id: focusAfter }); focusAfter = null; }
      } else if (d.type === 'newpin' && mode === 'comment') {
        const num = (k) => (typeof d[k] === 'number' && Number.isFinite(d[k]) ? d[k] : null);
        const x = num('x'); const y = num('y');
        if (x == null || y == null || x < 0 || x > 1 || y < 0 || y > 1) return;
        draft = { x, y, py: Math.max(0, Math.round(num('py') || 0)), dh: Math.max(0, Math.round(num('dh') || 0)) };
        drawUi();
        setTimeout(() => ui?.pinForm.elements.note.focus(), 20);
      } else if (d.type === 'pinClick') {
        const row = ui.list.querySelector(`[data-id="${CSS.escape(String(d.id))}"]`);
        if (row) { row.scrollIntoView({ block: 'nearest' }); row.classList.add('is-active'); setTimeout(() => row.classList.remove('is-active'), 1600); }
      }
    }

    async function savePin(e) {
      e.preventDefault();
      const note = ui.pinForm.elements.note.value.trim();
      if (!draft || !note) return;
      const btnSave = ui.pinForm.querySelector('[type="submit"]');
      btnSave.disabled = true;
      const { data: row, error: err } = await sb.from('feedback_marks').insert({
        feedback_id: id, file_id: null, x: draft.x, y: draft.y, note: note.slice(0, 500),
        anchor: { w: width, py: draft.py, dh: draft.dh, path: curPath || startPath() },
      }).select('id').single();
      if (!err && row?.id && ui.picker.files.length) await pinFiles.save(row.id, ui.picker.files);
      btnSave.disabled = false;
      if (err) {
        if (/anchor|file_id|null value/i.test(err.message || '')) return toast('Спершу запусти міграцію 023_url_review у Supabase');
        return CRM.fail(err);
      }
      draft = null;
      ui.pinForm.reset();
      toast('Пін додано');
      await loadMarks(); // → sync()
    }

    async function setWidth(w) {
      if (!WIDTHS.includes(w) || w === width) return;
      width = w;
      fit();
      draft = null;
      sendState();
      drawUi();
      const { error: err } = await sb.from('feedback').update({ review_width: w }).eq('id', id);
      if (!err) f.review_width = w; // без міграції колонки ще немає — ширина просто не запам'ятається
    }

    function onUiClick(e) {
      const b = e.target.closest('[data-rv]');
      if (!b || !ui.wrap.contains(b)) return;
      const a = b.dataset.rv;
      const rowId = b.closest('[data-id]')?.dataset.id;
      const m = rowId && marks.find((x) => x.id === rowId);
      if (a === 'close') close();
      else if (a.startsWith('mode:')) { mode = a.slice(5); if (mode !== 'comment') draft = null; sendState(); drawUi(); }
      else if (a.startsWith('width:')) setWidth(Number(a.slice(6)));
      else if (a === 'goto' && b.dataset.path) load(b.dataset.path);
      else if (a === 'bridge') copyBridge();
      else if (a === 'cancel') { draft = null; ui.pinForm.reset(); sendState(); drawUi(); }
      else if (a === 'focus' && m) post({ type: 'focus', id: m.id });
      else if (a === 'toggle' && m) toggleDirect(m);
      else if (a === 'delete' && m) deleteDirect(m);
    }
    async function toggleDirect(m) {
      m.done = !m.done; drawMarkList(); sync();
      const { error: err } = await sb.from('feedback_marks').update({ done: m.done }).eq('id', m.id);
      if (err) { m.done = !m.done; drawMarkList(); sync(); CRM.fail(err); }
    }
    async function deleteDirect(m) {
      if (!confirm(`Видалити пін ${m.n}?`)) return;
      const files = pinFiles.paths(m.id);
      const { error: err } = await sb.from('feedback_marks').delete().eq('id', m.id);
      if (err) return CRM.fail(err);
      CRM.removeFiles(files);
      loadMarks();
    }
    function onKey(e) {
      if (e.key !== 'Escape' || !ui) return;
      e.stopPropagation();
      if (draft) { draft = null; ui.pinForm.reset(); sendState(); drawUi(); } else close();
    }

    let lastFocus = null;
    function open(focusId) {
      if (!target()) { card.classList.add('is-editing'); drawCard(); form.elements.url.focus(); return toast('Додай посилання на сторінку'); }
      focusAfter = focusId || null;
      const fm = focusId && marks.find((x) => x.id === focusId);
      if (fm?.anchor?.w && WIDTHS.includes(fm.anchor.w)) width = fm.anchor.w;
      if (ui) {
        if (fm && !onPath(fm)) { load(pinPath(fm)); return; }
        fit(); sendState(); drawUi();
        if (focusAfter && ready) { post({ type: 'focus', id: focusAfter }); focusAfter = null; }
        return;
      }
      curPath = fm ? pinPath(fm) : null;
      lastFocus = document.activeElement;
      ui = build();
      document.documentElement.classList.add('crm-modal-open', 'crm-review-open');
      ui.wrap.addEventListener('click', onUiClick);
      ui.pinForm.addEventListener('submit', savePin);
      ui.nav.addEventListener('submit', (e) => {
        e.preventDefault();
        let v = ui.path.value.trim();
        try { if (/^https?:/i.test(v)) { const u = new URL(v); if (u.origin !== target().origin) return toast('Можна лише сторінки цього ж сайту'); v = u.pathname; } } catch (er) { return; }
        if (!v.startsWith('/')) v = `/${v}`;
        load(v.split(/[?#]/)[0].slice(0, 300));
      });
      // якщо перший ready загубився (міст стартував раніше за слухача) — питаємо ще раз після load
      ui.frame.addEventListener('load', () => post({ type: 'hello' }));
      window.addEventListener('message', onMessage);
      window.addEventListener('resize', fit);
      document.addEventListener('keydown', onKey, true);
      fit();
      load(curPath && curPath !== startPath() ? curPath : undefined);
      history.replaceState(null, '', `${location.pathname}${location.search}#review`);
      setTimeout(() => ui?.back.focus(), 30);
    }
    function close() {
      if (!ui) return;
      clearTimeout(waitTimer);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('resize', fit);
      document.removeEventListener('keydown', onKey, true);
      ui.wrap.remove();
      ui = null; ready = false; draft = null; curPath = null;
      document.documentElement.classList.remove('crm-review-open');
      if (!document.querySelector('[data-modal].is-open')) document.documentElement.classList.remove('crm-modal-open');
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      lastFocus?.focus?.();
    }
    function sync() {
      drawCard();
      if (!ui) return;
      if (ready) sendState();
      drawUi();
    }
    drawCard();
    return { open, close, sync };
  })();

  drawShots();
  await loadMarks();
  if (location.hash === '#review') review.open();

  // ---------- коментарі ----------
  async function loadComments() {
    const { data, error: err } = await sb.from('feedback_comments')
      .select('id, body, created_at, author_id, author:profiles!feedback_comments_author_id_fkey(full_name, email, avatar_url)')
      .eq('feedback_id', id).order('created_at');
    if (err) return CRM.fail(err);
    render('comments', data.map((c) => ({ ...c, author: name(c.author), time: time(c.created_at), avatar: c.author?.avatar_url })), (el, c) => {
      el.dataset.id = c.id;
      el.querySelector('[data-action="comment-delete"]')?.toggleAttribute('hidden', !(c.author_id === user.id || can('pm,admin')));
    });
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
  action('comment-delete', async (el) => {
    const cid = el.closest('[data-id]')?.dataset.id;
    if (!cid || !confirm('Видалити коментар?')) return;
    const { error: err } = await sb.from('feedback_comments').delete().eq('id', cid);
    if (err) return CRM.fail(err);
    loadComments();
  });

  // ---------- видалення ----------
  action('feedback-delete', async () => {
    if (!confirm('Видалити правку разом зі скрінами й коментарями?')) return;
    const { error: err } = await sb.from('feedback').delete().eq('id', id);
    if (err) return CRM.fail(err);
    await CRM.removeFiles(shots.map((x) => x.path).concat(pinFiles.paths())); // v0.11: скріни теж прибираємо зі Storage (v0.22.1: і скріни пінів)
    location.replace('/feedback');
  });
});
