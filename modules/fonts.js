/* Gapsy CRM · modules/fonts.js — Реєстр шрифтів
 * Два режими:
 *  1) Сторінка /fonts — [data-element="fonts"]:
 *     таби data-tabs="fonts" (all | problems), пошук [data-fonts-search] у формі data-form="font-search", список data-list="fonts"
 *     (поля name, foundry, license, allowed, owner, projects, files, warning; прев'ю [data-font-preview];
 *     дія font-edit), кнопка data-action="font-new".
 *     Модалка data-modal="font" + форма data-form="font" (name, foundry, license, owner, pageviews_limit, source_url, notes);
 *     чипи місць [data-allow="desktop|web|app"]; проєкти data-list="font-project-pick" (чипи, дія font-project-toggle);
 *     файли data-list="font-files" (filename, variant, дії font-file-download, font-file-delete),
 *     кнопки font-files-add, font-license-add, font-license-open, font-delete; заголовок [data-font-title].
 *     /fonts?id=<id> одразу відкриває шрифт.
 *  2) Блок у картці проєкту — [data-element="fonts"][data-fonts-mode="project"]: data-list="project-fonts"
 *     (name, license, warning), посилання на /fonts?id=.
 * Попередження: шрифт використано в проєкті, а web-ліцензії немає (крім free), або ліцензія пробна/невідома.
 * v0.11: кнопка data-action="font-upload" і перетягування файлів на сторінку ([data-font-drop] або весь root, клас is-dragover):
 *       сім'я з назви файлу, новий шрифт створюється сам (ліцензія «невідомо»), до наявного — файли додаються.
 * Права: усе редагує вся команда (RLS). Файли — bucket media, папка fonts/<uid>/. */
CRM.module('fonts', async (root, CRM) => {
  const { sb, render, onSubmit, modal, toast, action, upload, signedUrls, badge, param } = CRM;
  const LICENSE = {
    free: ['Безкоштовна', 'is-green'], commercial: ['Комерційна', 'is-blue'],
    trial: ['Пробна', 'is-yellow'], unknown: ['Ліцензію не вказано', 'is-red'],
  };
  const OWNER = { agency: 'Ліцензія агенції', client: 'Ліцензія клієнта' };
  const PLACES = { desktop: 'Desktop', web: 'Web', app: 'App' };
  const FONT_EXT = /\.(woff2?|ttf|otf)$/i;
  const WEIGHTS = [[/hairline|thin/i, 100], [/extra.?light|ultra.?light/i, 200], [/light/i, 300], [/semi.?bold|demi.?bold/i, 600],
    [/extra.?bold|ultra.?bold|heavy/i, 800], [/black/i, 900], [/medium/i, 500], [/bold/i, 700]];
  const safeUrl = (u) => (u && /^https?:\/\//i.test(u) ? u : null);
  // списки для select[data-options] у модалці (Webflow може загубити <option>, тож їх підставляє JS)
  CRM.optionLists['font-license'] = Object.entries(LICENSE).map(([v, [t]]) => [v, t === 'Ліцензію не вказано' ? 'Невідомо' : t]);
  CRM.optionLists['font-owner'] = Object.entries(OWNER).map(([v, t]) => [v, t.replace('Ліцензія ', '')]);
  const fontFamily = (id) => `crmfont-${id}`;

  /** Попередження для шрифту, що використовується в проєктах. */
  const warning = (f, usedIn) => {
    if (!usedIn) return '';
    if (f.license === 'unknown') return 'Ліцензію не вказано';
    if (f.license === 'trial') return 'Пробна ліцензія на живому проєкті';
    if (f.license !== 'free' && !(f.allowed || []).includes('web')) return 'Немає web-ліцензії';
    return '';
  };

  /** Вага і стиль з назви файлу: NeueMontreal-MediumItalic.woff2 → 500 italic. */
  const variantOf = (filename) => {
    const base = filename.replace(/\.[^.]+$/, '');
    const weight = (WEIGHTS.find(([re]) => re.test(base)) || [null, 400])[1];
    return { weight, style: /italic|oblique/i.test(base) ? 'italic' : 'normal' };
  };
  const variantLabel = (w, s) => `${w}${s === 'italic' ? ' italic' : ''}`;

  // ---------- прев'ю: підвантажуємо найближче до 400 normal накреслення ----------
  const loaded = new Set();
  async function loadPreviewFaces(fonts) {
    const pick = fonts.map((f) => {
      const files = (f.font_files || []).filter((x) => /\.(woff2?|ttf|otf)$/i.test(x.filename));
      const best = files.sort((a, b) => (a.style === 'normal' ? 0 : 1) - (b.style === 'normal' ? 0 : 1)
        || Math.abs(a.weight - 400) - Math.abs(b.weight - 400))[0];
      return best && !loaded.has(f.id) ? { f, file: best } : null;
    }).filter(Boolean);
    if (!pick.length || !('FontFace' in window)) return;
    const urls = await signedUrls(pick.map((p) => p.file.path));
    await Promise.all(pick.map(async ({ f, file }) => {
      const url = urls[file.path];
      if (!url) return;
      try {
        const face = new FontFace(fontFamily(f.id), `url("${url}")`, { weight: String(file.weight), style: file.style });
        document.fonts.add(await face.load());
        loaded.add(f.id);
        document.querySelectorAll(`[data-font-preview-id="${f.id}"]`).forEach((el) => {
          el.style.fontFamily = `"${fontFamily(f.id)}", sans-serif`;
          el.style.fontWeight = String(file.weight);
          el.style.fontStyle = file.style;
        });
      } catch (err) { console.warn('[CRM] font preview', f.name, err); }
    }));
  }

  // =================================================================
  // РЕЖИМ 2: шрифти в картці проєкту
  // =================================================================
  if (root.dataset.fontsMode === 'project') {
    const projectId = param('id');
    if (!projectId) return;
    const { data, error } = await sb.from('font_projects')
      .select('font:fonts(id, name, foundry, license, allowed)').eq('project_id', projectId);
    if (error) return CRM.fail(error);
    const fonts = (data || []).map((r) => r.font).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    render('project-fonts', fonts.map((f) => ({ ...f, foundry: f.foundry || '', warning: warning(f, 1) })), (el, f) => {
      el.href = `/fonts?id=${f.id}`;
      badge(el.querySelector('[data-field="license"]'), f.license, LICENSE);
      const w = el.querySelector('[data-field="warning"]');
      if (w) w.hidden = !f.warning;
    });
    return;
  }

  // =================================================================
  // РЕЖИМ 1: сторінка /fonts
  // =================================================================
  let fonts = [];
  let projects = [];
  let tab = 'all';
  let query = '';
  let edit = null; // шрифт у модалці (null — новий)
  let allowed = new Set();
  let picked = new Set();

  async function load() {
    const [f, p] = await Promise.all([
      sb.from('fonts').select('*, font_files(id, path, filename, weight, style), font_projects(project_id)').order('name'),
      sb.from('projects').select('id, name, status').order('name'),
    ]);
    if (f.error) return CRM.fail(f.error);
    fonts = f.data || [];
    projects = p.data || [];
    draw();
    loadPreviewFaces(fonts);
  }

  const projectNames = (f) => (f.font_projects || [])
    .map((r) => projects.find((p) => p.id === r.project_id)?.name).filter(Boolean);

  function draw() {
    const q = query.toLowerCase();
    const rows = fonts.map((f) => {
      const names = projectNames(f);
      return { ...f, names, warn: warning(f, names.length) };
    }).filter((f) => (tab !== 'problems' || f.warn)
      && (!q || f.name.toLowerCase().includes(q) || (f.foundry || '').toLowerCase().includes(q) || f.names.some((n) => n.toLowerCase().includes(q))));
    render('fonts', rows.map((f) => ({
      ...f,
      foundry: f.foundry || '',
      allowed: (f.allowed || []).map((a) => PLACES[a]).join(' · ') || 'Місця не вказані',
      owner: OWNER[f.owner] || '',
      projects: f.names.length ? f.names.join(', ') : 'Ще ніде не використано',
      files: (f.font_files || []).length ? `Файлів: ${f.font_files.length}` : 'Без файлів',
      warning: f.warn,
    })), (el, f) => {
      el.dataset.id = f.id;
      badge(el.querySelector('[data-field="license"]'), f.license, LICENSE);
      const w = el.querySelector('[data-field="warning"]');
      if (w) w.hidden = !f.warn;
      const pv = el.querySelector('[data-font-preview]');
      if (pv) {
        pv.dataset.fontPreviewId = f.id;
        if (loaded.has(f.id)) pv.style.fontFamily = `"${fontFamily(f.id)}", sans-serif`;
      }
    });
    const problems = fonts.filter((f) => warning(f, projectNames(f).length)).length;
    root.querySelectorAll('[data-count="font-problems"]').forEach((c) => { c.textContent = problems; c.hidden = !problems; });
  }

  root.addEventListener('crm:tab', (e) => { if (e.detail.group === 'fonts') { tab = e.detail.value; draw(); } });
  const search = root.querySelector('[data-fonts-search]');
  search?.addEventListener('input', () => { query = search.value.trim(); draw(); });
  onSubmit('font-search', async () => {}); // Enter не відправляє форму у Webflow

  // ---------- модалка шрифту ----------
  const form = () => document.querySelector('[data-form="font"]');
  const m$ = (s) => document.querySelector(`[data-modal="font"] ${s}`);

  function drawAllowed() {
    document.querySelectorAll('[data-modal="font"] [data-allow]').forEach((c) => {
      const on = allowed.has(c.dataset.allow);
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-pressed', on);
    });
  }
  function drawPicked() {
    const list = projects.filter((p) => p.status !== 'done' || picked.has(p.id));
    render('font-project-pick', list, (el, p) => {
      el.dataset.id = p.id;
      el.classList.toggle('is-active', picked.has(p.id));
      el.setAttribute('aria-pressed', picked.has(p.id));
    });
  }
  async function drawFiles() {
    const files = (edit?.font_files || []).slice().sort((a, b) => a.weight - b.weight || a.style.localeCompare(b.style));
    render('font-files', files.map((x) => ({ ...x, variant: variantLabel(x.weight, x.style) })), (el, x) => { el.dataset.id = x.id; });
    const lic = m$('[data-action="font-license-open"]');
    if (lic) lic.hidden = !edit?.license_path;
    const del = m$('[data-action="font-delete"]');
    if (del) del.hidden = !edit;
    const filesBlock = m$('[data-font-files-block]');
    if (filesBlock) filesBlock.hidden = !edit; // файли додаються після першого збереження
  }

  async function openFont(f) {
    edit = f || null;
    allowed = new Set(f?.allowed || []);
    picked = new Set((f?.font_projects || []).map((r) => r.project_id));
    const m = modal.open('font');
    if (!m) return;
    const fm = form();
    await CRM.fillSelects(m);
    fm.reset();
    const set = (k, v) => { if (fm.elements[k]) fm.elements[k].value = v ?? ''; };
    set('name', f?.name); set('foundry', f?.foundry); set('license', f?.license || 'unknown'); set('owner', f?.owner || 'agency');
    set('pageviews_limit', f?.pageviews_limit); set('source_url', f?.source_url); set('notes', f?.notes);
    const title = m$('[data-font-title]');
    if (title) title.textContent = f ? f.name : 'Новий шрифт';
    drawAllowed(); drawPicked(); drawFiles();
  }

  action('font-new', () => openFont(null));
  action('font-edit', (el) => openFont(fonts.find((f) => f.id === el.closest('[data-id]')?.dataset.id)));
  action('font-allow', (el) => {
    const k = el.dataset.allow;
    if (allowed.has(k)) allowed.delete(k); else allowed.add(k);
    drawAllowed();
  });
  action('font-project-toggle', (el) => {
    const id = el.closest('[data-id]')?.dataset.id;
    if (picked.has(id)) picked.delete(id); else picked.add(id);
    drawPicked();
  });

  onSubmit('font', async (d) => {
    const name = (d.name || '').trim();
    if (!name) return toast('Вкажи назву шрифту');
    const source = (d.source_url || '').trim();
    if (source && !safeUrl(source)) return toast('Посилання має починатися з https://');
    const limit = parseInt(d.pageviews_limit, 10);
    const row = {
      name, foundry: (d.foundry || '').trim() || null, license: d.license || 'unknown', owner: d.owner || 'agency',
      allowed: [...allowed], pageviews_limit: limit > 0 ? limit : null, source_url: source || null,
      notes: (d.notes || '').trim() || null,
    };
    let fontId = edit?.id;
    if (fontId) {
      const { error } = await sb.from('fonts').update(row).eq('id', fontId);
      if (error) throw error;
    } else {
      const { data, error } = await sb.from('fonts').insert(row).select('id').single();
      if (error) throw error;
      fontId = data.id;
    }
    // проєкти: прибрати зняті, додати нові
    const before = new Set((edit?.font_projects || []).map((r) => r.project_id));
    const removed = [...before].filter((p) => !picked.has(p));
    const added = [...picked].filter((p) => !before.has(p));
    if (removed.length) {
      const { error } = await sb.from('font_projects').delete().eq('font_id', fontId).in('project_id', removed);
      if (error) throw error;
    }
    if (added.length) {
      const { error } = await sb.from('font_projects').insert(added.map((project_id) => ({ font_id: fontId, project_id })));
      if (error) throw error;
    }
    const wasNew = !edit;
    toast(wasNew ? 'Шрифт додано. Тепер можна завантажити файли' : 'Збережено');
    await load();
    if (wasNew) openFont(fonts.find((f) => f.id === fontId));
    else modal.close();
  });

  // ---------- файли шрифту й ліцензії ----------
  const pickFiles = (accept, multiple) => new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept, multiple, hidden: true });
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });

  action('font-files-add', async () => {
    if (!edit) return;
    uploadFontFiles(await pickFiles('.woff2,.woff,.ttf,.otf', true), edit);
  });

  // ---------- v0.11: завантаження файлів одразу зі сторінки ----------
  // Кнопка data-action="font-upload" або перетягування файлів на сторінку.
  // Сім'ю беремо з назви файлу (NeueMontreal-BoldItalic.otf → «Neue Montreal»); якщо такий шрифт уже є — файли додаються до нього.
  const VARIANT_WORDS = /[-_ ]?(hairline|thin|extra.?light|ultra.?light|light|book|regular|normal|roman|medium|semi.?bold|demi.?bold|bold|extra.?bold|ultra.?bold|heavy|black|italic|oblique|variable|vf|web|webfont|\d{3})\b/gi;
  const familyOf = (filename) => {
    let base = filename.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
    for (let i = 0; i < 3; i++) base = base.replace(VARIANT_WORDS, '');
    base = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return base || filename.replace(/\.[^.]+$/, '');
  };
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9а-яіїєґ]/gi, '');

  async function uploadFontFiles(list, into = null) {
    const files = list.filter((f) => FONT_EXT.test(f.name));
    const big = files.filter((f) => f.size > 10 * 1024 * 1024);
    const ok = files.filter((f) => f.size <= 10 * 1024 * 1024);
    if (!ok.length) return toast(big.length ? 'Файли мають бути до 10 МБ' : 'Потрібні файли .woff2, .woff, .ttf або .otf');
    const groups = new Map();
    ok.forEach((f) => {
      const fam = into ? into.name : familyOf(f.name);
      const key = into ? 'into' : norm(fam);
      if (!groups.has(key)) groups.set(key, { name: fam, files: [] });
      groups.get(key).files.push(f);
    });
    toast(`Завантажую ${ok.length} ${ok.length === 1 ? 'файл' : 'файлів'}…`);
    const touched = [];
    try {
      for (const g of groups.values()) {
        let font = into || fonts.find((f) => norm(f.name) === norm(g.name));
        if (!font) {
          const { data, error } = await sb.from('fonts').insert({ name: g.name, license: 'unknown', owner: 'agency', allowed: [] })
            .select('id, name').single();
          if (error) throw error;
          font = { ...data, font_files: [] };
        }
        const have = new Set((font.font_files || []).map((x) => x.filename));
        const fresh = g.files.filter((f) => !have.has(f.name));
        if (fresh.length) {
          const paths = await Promise.all(fresh.map((f) => upload(f, 'fonts')));
          const { error } = await sb.from('font_files').insert(paths.map((path, k) => ({
            font_id: font.id, path, filename: fresh[k].name, ...variantOf(fresh[k].name),
          })));
          if (error) throw error;
        }
        touched.push(font.id);
      }
      await load();
      const skipped = big.length ? ` Пропущено завеликих: ${big.length}.` : '';
      toast(groups.size === 1 ? `Файли додано.${skipped} Перевір ліцензію шрифту` : `Додано шрифтів: ${groups.size}.${skipped} Перевір ліцензії`);
      if (into) { edit = fonts.find((f) => f.id === into.id); drawFiles(); } else if (touched.length === 1) openFont(fonts.find((f) => f.id === touched[0]));
    } catch (err) { CRM.fail(err); }
  }

  action('font-upload', async () => uploadFontFiles(await pickFiles('.woff2,.woff,.ttf,.otf', true)));

  // перетягування файлів на сторінку (поза модалкою)
  const drop = root.querySelector('[data-font-drop]') || root;
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
    drop.classList.add('is-dragover');
  }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => {
    if (t === 'dragleave' && drop.contains(e.relatedTarget)) return;
    drop.classList.remove('is-dragover');
  }));
  const onDrop = (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    e.stopPropagation();
    const inModal = e.target.closest?.('[data-modal="font"]');
    if (inModal && !edit) return toast('Спершу збережи шрифт, потім додай файли');
    uploadFontFiles([...e.dataTransfer.files], inModal ? edit : null);
  };
  drop.addEventListener('drop', onDrop);
  // модалка може лежати поза root — приймаємо файли й на неї
  const fontModal = document.querySelector('[data-modal="font"]');
  if (fontModal && !drop.contains(fontModal)) {
    ['dragenter', 'dragover'].forEach((t) => fontModal.addEventListener(t, (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); }));
    fontModal.addEventListener('drop', onDrop);
  }

  action('font-license-add', async () => {
    if (!edit) return;
    const [file] = await pickFiles('.pdf,.txt,.html,.png,.jpg,.jpeg,.zip', false);
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast('Файл ліцензії до 10 МБ');
    try {
      const path = await upload(file, 'fonts');
      const { error } = await sb.from('fonts').update({ license_path: path }).eq('id', edit.id);
      if (error) throw error;
      edit.license_path = path;
      toast('Ліцензію прикріплено');
      drawFiles();
      load();
    } catch (err) { CRM.fail(err); }
  });

  async function openSigned(path, filename) {
    const urls = await signedUrls([path]);
    const url = urls[path];
    if (!url) return toast('Файл недоступний');
    // Supabase віддає файл як завантаження, якщо додати ?download=<ім'я>
    const href = filename ? `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(filename)}` : url;
    const a = Object.assign(document.createElement('a'), { href, target: '_blank', rel: 'noopener' });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  action('font-license-open', () => edit?.license_path && openSigned(edit.license_path));
  action('font-file-download', (el) => {
    const x = (edit?.font_files || []).find((f) => f.id === el.closest('[data-id]')?.dataset.id);
    if (x) openSigned(x.path, x.filename);
  });
  action('font-file-delete', async (el) => {
    const x = (edit?.font_files || []).find((f) => f.id === el.closest('[data-id]')?.dataset.id);
    if (!x || !confirm(`Видалити файл ${x.filename}?`)) return;
    const { error } = await sb.from('font_files').delete().eq('id', x.id);
    if (error) return CRM.fail(error);
    Promise.resolve().then(() => sb.storage.from('media').remove([x.path])).catch(() => {});
    edit.font_files = edit.font_files.filter((f) => f.id !== x.id);
    drawFiles();
    load();
  });

  action('font-delete', async () => {
    if (!edit || !confirm(`Видалити шрифт «${edit.name}» разом із файлами?`)) return;
    const { error } = await sb.from('fonts').delete().eq('id', edit.id);
    if (error) return CRM.fail(error);
    const paths = (edit.font_files || []).map((f) => f.path).concat(edit.license_path ? [edit.license_path] : []);
    if (paths.length) Promise.resolve().then(() => sb.storage.from('media').remove(paths)).catch(() => {});
    modal.close();
    toast('Шрифт видалено');
    edit = null;
    load();
  });

  await load();
  const openId = param('id');
  if (openId) {
    const f = fonts.find((x) => x.id === openId);
    if (f) openFont(f);
  }
});
