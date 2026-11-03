/* =====================================================================
 * Gapsy CRM · crm-core.js v0.6.0
 * Репо: GapsyStudio/gapsy-crm (файли в корені, модулі в modules/).
 * Конфіг: window.CRM_CONFIG у Site Settings → Head (там же CSS станів і теми).
 *
 * Що робить ядро:
 *  - сесія, профіль, ролі, guard сторінок (data-crm-guard), вхід / вихід;
 *  - UI за роллю (data-crm-role) і дані користувача (data-crm-user, data-crm-avatar);
 *  - оболонка: активний пункт меню (data-nav), хлібні крихти (data-crm-crumbs),
 *    модалки (data-modal + data-action="open:<key>" / "close"), таби (data-tabs/data-tab),
 *    тема (data-action="toggle-theme", data-theme-switch), toast-и, пошук Cmd+K,
 *    сповіщення з realtime;
 *  - хелпери для модулів: CRM.render, CRM.fill, CRM.badge, CRM.onSubmit, CRM.action,
 *    CRM.dropzone, CRM.upload, CRM.signedUrls, CRM.options, CRM.time.
 *
 * Безпека: це лише UI. Дані захищає RLS у Supabase.
 * ===================================================================== */
(() => {
  const cfg = window.CRM_CONFIG;
  const html = document.documentElement;
  if (!cfg || !window.supabase) {
    html.classList.remove('crm-loading');
    return console.error('[CRM] Немає CRM_CONFIG або supabase-js');
  }

  // Модулі в репо (modules/<name>.js). Новий модуль → додати назву сюди.
  const MODULES = ['dashboard', 'docs', 'doc', 'my-work', 'projects', 'project', 'moodboard', 'fonts', 'access', 'snippets', 'snippet', 'showcase', 'feedback', 'feedback-item', 'admin', 'profile'];
  const STAFF = ['designer', 'developer', 'pm', 'admin'];
  const TEXT = {
    invalid: 'Невірний email або пароль',
    failed: 'Не вдалося увійти. Спробуй ще раз',
    error: 'Щось пішло не так. Спробуй ще раз',
    saved: 'Збережено',
    ...cfg.text,
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  const registry = {};
  const actions = {};
  const forms = {};

  const CRM = (window.CRM = {
    sb, $, $$, TEXT,
    user: null,
    profile: null,
    role: null,
    module(name, init) { registry[name] = init; },
    can(rule) {
      const r = CRM.role;
      if (!r || r === 'pending') return false;
      const list = String(rule).split(',').map((s) => s.trim());
      return list.includes('auth') || list.includes(r) || (list.includes('staff') && STAFF.includes(r));
    },
    param: (k) => new URLSearchParams(location.search).get(k),
  });

  // ===================================================================
  // ХЕЛПЕРИ ДЛЯ МОДУЛІВ
  // ===================================================================

  /** Підставляє дані в елемент: data-field (текст), data-field-src (img), data-field-href (a). */
  CRM.fill = (root, row) => {
    const each = (attr, fn) => {
      if (root.hasAttribute(attr)) fn(root, root.getAttribute(attr));
      root.querySelectorAll(`[${attr}]`).forEach((el) => fn(el, el.getAttribute(attr)));
    };
    each('data-field', (el, k) => { if (k in row) el.textContent = row[k] ?? ''; });
    each('data-field-src', (el, k) => { if (row[k]) el.src = row[k]; else el.removeAttribute('srcset'); });
    each('data-field-href', (el, k) => { if (row[k]) el.href = row[k]; });
    each('data-field-bg', (el, k) => {
      if (!row[k]) return;
      Object.assign(el.style, { backgroundImage: `url("${row[k]}")`, backgroundSize: 'cover', backgroundPosition: 'center' });
    });
  };

  /**
   * Рендер списку за шаблоном [data-template] усередині [data-list="key"].
   * fill(el, row) — додаткове заповнення. Ставить data-state = ready | empty.
   */
  CRM.render = (key, rows, fill) => {
    const list = typeof key === 'string' ? $(`[data-list="${key}"]`) : key;
    if (!list) return [];
    const tpl = list.querySelector(':scope > [data-template]:not([data-template="children"])');
    list.querySelectorAll(':scope > [data-rendered]').forEach((n) => n.remove());
    if (!tpl) return [];
    const anchor = list.querySelector(':scope > [data-empty]');
    const out = rows.map((row) => {
      const el = tpl.cloneNode(true);
      el.removeAttribute('data-template');
      el.setAttribute('data-rendered', '');
      CRM.fill(el, row);
      fill && fill(el, row);
      list.insertBefore(el, anchor);
      return el;
    });
    list.dataset.state = rows.length ? 'ready' : 'empty';
    return out;
  };

  /**
   * Дерево документів у [data-list="docs-tree"]: шаблон посилання [data-template] і контейнер дітей [data-template="children"].
   * rows: [{ id, parent_id, title, icon, sort }]. Розгорнута лише гілка до активного документа.
   */
  CRM.docsTree = (rows, activeId) => {
    const list = $('[data-list="docs-tree"]');
    if (!list) return;
    const linkTpl = list.querySelector(':scope > [data-template]:not([data-template="children"])');
    const kidsTpl = list.querySelector(':scope > [data-template="children"]');
    list.querySelectorAll(':scope > [data-rendered]').forEach((n) => n.remove());
    if (!linkTpl) return;
    const byParent = {};
    rows.forEach((r) => (byParent[r.parent_id || 'root'] ||= []).push(r));
    Object.values(byParent).forEach((a) => a.sort((x, y) => x.sort - y.sort || x.title.localeCompare(y.title)));
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    const open = new Set();
    for (let d = byId[activeId]; d; d = byId[d.parent_id]) open.add(d.id);
    const anchor = list.querySelector(':scope > [data-skeleton], :scope > [data-empty]');
    const draw = (parentKey, into, before) => {
      (byParent[parentKey] || []).forEach((d) => {
        const a = linkTpl.cloneNode(true);
        a.removeAttribute('data-template');
        a.setAttribute('data-rendered', '');
        CRM.fill(a, { title: d.title, icon: d.icon || '📄' });
        a.href = `/doc?id=${d.id}`;
        if (d.id === activeId) { a.classList.add('is-active'); a.setAttribute('aria-current', 'page'); }
        into.insertBefore(a, before);
        if (open.has(d.id) && byParent[d.id] && kidsTpl) {
          const box = kidsTpl.cloneNode(false);
          box.removeAttribute('data-template');
          box.setAttribute('data-rendered', '');
          into.insertBefore(box, before);
          draw(d.id, box, null);
        }
      });
    };
    draw('root', list, anchor);
    list.dataset.state = rows.length ? 'ready' : 'empty';
  };

  /** Бейдж статусу: map = { value: [текст, 'is-blue'] }. */
  const BADGE_COMBOS = ['is-blue', 'is-yellow', 'is-green', 'is-red'];
  CRM.badge = (el, value, map) => {
    if (!el) return;
    const [label, combo] = map[value] || [value, ''];
    el.textContent = label;
    el.classList.remove(...BADGE_COMBOS);
    if (combo) el.classList.add(combo);
  };

  /** Відносний час українською: «5 хв тому», «вчора». */
  const rtf = new Intl.RelativeTimeFormat('uk', { numeric: 'auto' });
  CRM.time = (iso) => {
    if (!iso) return '—';
    const s = (new Date(iso) - Date.now()) / 1000;
    const steps = [[60, 'second'], [3600, 'minute', 60], [86400, 'hour', 3600], [604800, 'day', 86400]];
    if (Math.abs(s) < 60) return 'щойно';
    for (const [lim, unit, div] of steps.slice(1)) {
      if (Math.abs(s) < lim) return rtf.format(Math.round(s / div), unit);
    }
    return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
  };
  CRM.date = (iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) =>
    iso ? new Date(iso).toLocaleDateString('uk-UA', opts) : '—';
  CRM.name = (p) => (p && (p.full_name || p.email)) || '—';

  // ---------- правки: статус, пріоритет, дедлайн (v0.4) ----------
  CRM.FEEDBACK_STATUS = { new: ['New', 'is-blue'], in_progress: ['In Progress', 'is-yellow'], resolved: ['Resolved', 'is-green'] };
  CRM.PRIORITY = { urgent: ['Терміново', 'is-red'], high: ['Високий', 'is-yellow'], normal: ['Звичайний', ''], low: ['Низький', ''] };
  const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };

  /** Дедлайн (рядок 'YYYY-MM-DD') → { text, combo, overdue } або null. Для закритої правки без кольору. */
  CRM.due = (d, closed = false) => {
    if (!d) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(`${d}T00:00:00`);
    const diff = Math.round((day - today) / 864e5);
    const text = diff === 0 ? 'Сьогодні' : diff === 1 ? 'Завтра' : diff === -1 ? 'Вчора'
      : day.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
    if (closed) return { text, combo: '', overdue: false };
    const overdue = diff < 0;
    return { text: overdue ? `Прострочено · ${text}` : text, combo: overdue ? 'is-red' : diff <= 1 ? 'is-yellow' : '', overdue };
  };

  /** Порядок правок: пріоритет → найближчий дедлайн (без дедлайну в кінці) → новіші. */
  CRM.feedbackSort = (a, b) =>
    (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2)
    || (a.due_date || '9999').localeCompare(b.due_date || '9999')
    || String(b.created_at || '').localeCompare(String(a.created_at || ''));

  /** Бейджі правки в рядку: [data-field="status|priority|due"]. Звичайний пріоритет і порожній дедлайн ховаються. */
  CRM.feedbackBadges = (el, f) => {
    CRM.badge(el.querySelector('[data-field="status"]'), f.status, CRM.FEEDBACK_STATUS);
    const pr = el.querySelector('[data-field="priority"]');
    if (pr) {
      CRM.badge(pr, f.priority || 'normal', CRM.PRIORITY);
      pr.hidden = !f.priority || f.priority === 'normal';
    }
    const du = el.querySelector('[data-field="due"]');
    if (du) {
      const d = CRM.due(f.due_date, f.status === 'resolved');
      du.hidden = !d;
      if (d) CRM.badge(du, 'x', { x: [d.text, d.combo] });
    }
  };

  /** Toast унизу праворуч. */
  CRM.toast = (text, ms = 3000) => {
    const region = $('[data-toast-region]');
    const tpl = region && region.querySelector('[data-template]');
    if (!tpl) return console.log('[CRM]', text);
    const el = tpl.cloneNode(true);
    el.removeAttribute('data-template');
    el.textContent = text;
    region.appendChild(el);
    setTimeout(() => el.remove(), ms);
  };
  CRM.fail = (err) => {
    console.error('[CRM]', err);
    CRM.toast(TEXT.error);
  };

  /** Кастомна дія: CRM.action('approve', (el, event) => {...}) для data-action="approve". */
  CRM.action = (name, fn) => { actions[name] = fn; };

  /**
   * Форма: CRM.onSubmit('pin', async (data, form) => {...}) для [data-form="pin"].
   * Перехоплює сабміт раніше за Webflow. Кнопка блокується на час запиту.
   */
  CRM.onSubmit = (key, fn) => { forms[key] = fn; };
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-form]');
    if (!form || !forms[form.dataset.form]) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const btn = form.querySelector('[type="submit"]');
    const data = Object.fromEntries(new FormData(form));
    form.querySelectorAll('input[type="checkbox"]').forEach((c) => { if (c.name) data[c.name] = c.checked; });
    if (btn) btn.disabled = true;
    try {
      await forms[form.dataset.form](data, form);
    } catch (err) {
      CRM.fail(err);
    } finally {
      if (btn) btn.disabled = false;
    }
  }, true);

  /** Опції для <select data-options="projects | staff | <статичний список>">. data-default="normal" — значення за замовчуванням.
   *  Статичні списки реєструються в CRM.optionLists (модуль може додати свій: CRM.optionLists['font-license'] = [[v, текст], …]). */
  const optionsCache = {};
  CRM.optionLists = {
    priority: ['low', 'normal', 'high', 'urgent'].map((v) => [v, CRM.PRIORITY[v][0]]),
  };
  CRM.options = async (kind) => {
    if (CRM.optionLists[kind]) return CRM.optionLists[kind];
    if (!optionsCache[kind]) {
      optionsCache[kind] = (kind === 'projects'
        ? sb.from('projects').select('id, name').neq('status', 'done').order('name')
            .then(({ data }) => (data || []).map((p) => [p.id, p.name]))
        : sb.from('profiles').select('id, full_name, email').in('role', STAFF).order('full_name')
            .then(({ data }) => (data || []).map((p) => [p.id, CRM.name(p)])));
    }
    return optionsCache[kind];
  };
  async function fillOne(sel) {
    const def = sel.dataset.default;
    const have = new Set([...sel.options].map((o) => o.value));
    (await CRM.options(sel.dataset.options)).forEach(([v, t]) => {
      if (!have.has(v)) sel.add(new Option(t, v));
    });
    // значення за замовчуванням переживає form.reset()
    if (def) [...sel.options].forEach((o) => { o.defaultSelected = o.value === def; o.selected = o.value === def; });
    sel.dataset.filled = '1';
  }
  /** Заповнює select[data-options]. Повторний виклик чекає на той самий проміс, тож опції вже на місці. */
  async function fillSelects(root = document) {
    await Promise.all($$('select[data-options]', root).map((sel) => sel._crmFill || (sel._crmFill = fillOne(sel))));
  }
  CRM.fillSelects = fillSelects;

  // ---------- файли ----------
  const IMG = /^image\/(png|jpe?g|webp|gif)$/;
  const MAX = 10 * 1024 * 1024;

  /**
   * Дропзона: клік, перетягування, Cmd+V (поки відкрита модалка з дропзоною).
   * Повертає { files, reset }. Прев'ю — у [data-upload-previews] за шаблоном img[data-template].
   */
  CRM.dropzone = (zone, { multiple = true } = {}) => {
    const state = { files: [] };
    if (!zone) return state;
    const box = zone.parentElement.querySelector('[data-upload-previews]');
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple, hidden: true });
    zone.after(input);
    zone.tabIndex = 0;
    zone.setAttribute('role', 'button');
    zone.style.cursor = 'pointer';

    const add = (list) => {
      const ok = [...list].filter((f) => IMG.test(f.type) && f.size <= MAX);
      if (ok.length < list.length) CRM.toast('Лише зображення до 10 МБ');
      state.files = multiple ? state.files.concat(ok) : ok.slice(0, 1);
      draw();
    };
    const label = zone.firstElementChild;
    const labelText = label?.textContent;
    const draw = () => {
      if (box) CRM.render(box, state.files, (el, f) => { el.src = URL.createObjectURL(f); });
      else if (label) label.textContent = state.files[0] ? `✓ ${state.files[0].name}` : labelText;
    };
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => { add(input.files); input.value = ''; });
    zone.addEventListener('dragover', (e) => e.preventDefault());
    zone.addEventListener('drop', (e) => { e.preventDefault(); add(e.dataTransfer.files); });
    document.addEventListener('paste', (e) => {
      if (!zone.offsetParent) return; // дропзона прихована (модалка закрита) — вставку не чіпаємо
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); add(files); }
    });
    state.reset = () => { state.files = []; draw(); };
    return state;
  };

  /** Завантаження у Storage. bucket media — приватний (повертає шлях), avatars — публічний (повертає URL). */
  CRM.upload = async (file, folder, bucket = 'media') => {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    // avatars: перша папка = id користувача (так вимагає RLS); media: <folder>/<user>/<файл>
    const path = bucket === 'avatars' ? `${CRM.user.id}/${stamp}` : `${folder}/${CRM.user.id}/${stamp}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return bucket === 'avatars' ? sb.storage.from(bucket).getPublicUrl(path).data.publicUrl : path;
  };

  /** Тимчасові посилання на приватні файли: { path: url }. */
  CRM.signedUrls = async (paths) => {
    const list = [...new Set(paths.filter(Boolean))];
    if (!list.length) return {};
    const { data, error } = await sb.storage.from('media').createSignedUrls(list, 3600);
    if (error) { console.error('[CRM] signedUrls', error); return {}; }
    return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  };

  // ===================================================================
  // НАВІГАЦІЯ ТА ВХІД
  // ===================================================================
  const go = (path) => { if (location.pathname !== path) location.replace(path); };
  const nextPath = () => {
    const n = CRM.param('next');
    return n && n.startsWith('/') && !n.startsWith('//') ? n : cfg.homePath;
  };

  async function loadProfile() {
    const { data } = await sb.auth.getSession();
    CRM.user = data.session?.user || null;
    if (!CRM.user) return;
    const { data: profile, error } = await sb.from('profiles').select('*').eq('id', CRM.user.id).single();
    if (error) console.error('[CRM] profile:', error.message);
    CRM.profile = profile || null;
    CRM.role = profile?.role || null;
  }

  function guard() {
    const rule = $('[data-crm-guard]')?.dataset.crmGuard || 'public';
    if (rule === 'public') return true;
    if (rule === 'guest') return CRM.can('auth') ? (go(nextPath()), false) : true;
    if (!CRM.user) return go(`${cfg.loginPath}?next=${encodeURIComponent(location.pathname + location.search)}`), false;
    if (!CRM.can('auth')) return go(cfg.pendingPath), false;
    if (!CRM.can(rule)) return go(cfg.homePath), false;
    return true;
  }

  CRM.bindUser = () => {
    $$('[data-crm-user]').forEach((el) => {
      const key = el.dataset.crmUser;
      const val = key === 'email' ? CRM.user?.email : CRM.profile?.[key];
      // Запам'ятовуємо текст із Designer («колего»), щоб повернути його, якщо значення стерли
      if (el.tagName !== 'IMG' && el.dataset.crmFallback == null) el.dataset.crmFallback = el.textContent;
      if (val == null || val === '') {
        if (el.tagName !== 'IMG') el.textContent = el.dataset.crmFallback;
        return;
      }
      if (el.tagName === 'IMG') el.src = val;
      else el.textContent = val;
    });
    const avatar = CRM.profile?.avatar_url || CRM.user?.user_metadata?.avatar_url;
    if (avatar) $$('[data-crm-avatar]').forEach((el) => {
      el.style.backgroundImage = `url("${avatar}")`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    });
  };

  function bindUI() {
    $$('[data-crm-role]').forEach((el) => { if (!CRM.can(el.dataset.crmRole)) el.remove(); });
    CRM.bindUser();
    // активний пункт меню
    const path = location.pathname.replace(/\/$/, '') || '/';
    $$('[data-nav]').forEach((a) => {
      const on = a.dataset.nav.split(',').map((s) => s.trim()).includes(path);
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    // хлібні крихти = заголовок сторінки (модуль може перевизначити через CRM.crumbs)
    const h1 = $('[data-page-content] h1');
    if (h1) CRM.crumbs(h1.textContent.trim());
  }
  CRM.crumbs = (text) => { const c = $('[data-crm-crumbs]'); if (c) c.textContent = text; };

  // вхід email + пароль (capture: раніше за Webflow)
  const errorEl = () => $('[data-element="auth-error"]');
  function showError(msg) {
    const el = errorEl();
    if (!el) return CRM.toast(msg);
    el.textContent = msg;
    el.style.display = 'block';
  }
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-element="auth-login"]');
    if (!form) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const fd = new FormData(form);
    const btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({
      email: String(fd.get('email') || '').trim(),
      password: String(fd.get('password') || ''),
    });
    if (btn) btn.disabled = false;
    if (error) return showError(error.status === 400 ? TEXT.invalid : TEXT.failed);
    location.replace(nextPath());
  }, true);
  document.addEventListener('input', (e) => {
    if (e.target.closest('[data-element="auth-login"]') && errorEl()) errorEl().style.display = 'none';
  });

  sb.auth.onAuthStateChange((event) => {
    const rule = $('[data-crm-guard]')?.dataset.crmGuard;
    if (event === 'SIGNED_OUT' && rule && rule !== 'public' && rule !== 'guest') location.replace(cfg.loginPath);
  });

  // ===================================================================
  // МОДАЛКИ
  // ===================================================================
  let lastFocus = null;
  CRM.modal = {
    open(key) {
      const m = $(`[data-modal="${key}"]`);
      if (!m) return null;
      lastFocus = document.activeElement;
      m.classList.add('is-open');
      html.classList.add('crm-modal-open');
      fillSelects(m);
      setTimeout(() => m.querySelector('input:not([type="hidden"]), textarea, select')?.focus(), 30);
      m.dispatchEvent(new CustomEvent('crm:open', { bubbles: true }));
      return m;
    },
    close(m) {
      m = m || $('[data-modal].is-open');
      if (!m) return;
      m.classList.remove('is-open');
      if (!$('[data-modal].is-open')) html.classList.remove('crm-modal-open');
      lastFocus?.focus?.();
    },
  };

  // ===================================================================
  // ТЕМА
  // ===================================================================
  const media = matchMedia('(prefers-color-scheme: dark)');
  CRM.theme = (value) => {
    try {
      if (value === 'system') localStorage.removeItem('crm-theme');
      else if (value) localStorage.setItem('crm-theme', value);
    } catch (e) {}
    let saved = null;
    try { saved = localStorage.getItem('crm-theme'); } catch (e) {}
    html.setAttribute('data-theme', saved || (media.matches ? 'dark' : 'light'));
    $$('[data-theme-switch] [data-theme-value]').forEach((o) =>
      o.classList.toggle('is-active', o.dataset.themeValue === (saved || 'system')));
  };
  media.addEventListener?.('change', () => CRM.theme());

  // ===================================================================
  // ПОШУК Cmd+K
  // ===================================================================
  const KIND = { project: 'Проєкт', snippet: 'Сніпет', feedback: 'Правка', font: 'Шрифт', access: 'Доступ', showcase: 'Showcase', doc: 'Документ' };
  let searchInput = null;
  let searchTimer = null;
  function openSearch() {
    const m = CRM.modal.open('search');
    if (!m) return;
    if (!searchInput) {
      const slot = m.querySelector('[data-search-field]');
      searchInput = Object.assign(document.createElement('input'), {
        type: 'search', className: slot.className, placeholder: slot.textContent.trim(), autocomplete: 'off',
      });
      searchInput.setAttribute('aria-label', 'Пошук');
      searchInput.style.border = '0';
      searchInput.style.outline = 'none';
      slot.replaceWith(searchInput);
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(runSearch, 200);
      });
    }
    searchInput.value = '';
    CRM.render('search', []);
    $('[data-list="search"]').dataset.state = '';
    setTimeout(() => searchInput.focus(), 30);
  }
  async function runSearch() {
    const q = searchInput.value.trim();
    if (q.length < 2) return CRM.render('search', []);
    const { data, error } = await sb.rpc('search_all', { q });
    if (error) return CRM.fail(error);
    const items = CRM.render('search', data.map((r) => ({ ...r, type: KIND[r.kind] || r.kind })), (el, r) => {
      el.href = r.url;
      if (r.kind === 'showcase') el.target = '_blank';
    });
    items[0]?.classList.add('is-active');
  }
  function searchKeys(e) {
    const m = $('[data-modal="search"].is-open');
    if (!m) return;
    const items = $$('[data-list="search"] > [data-rendered]');
    if (!items.length) return;
    let i = items.findIndex((x) => x.classList.contains('is-active'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[i]?.classList.remove('is-active');
      i = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[i].classList.add('is-active');
      items[i].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && items[i]) {
      e.preventDefault();
      items[i].click();
    }
  }

  // ===================================================================
  // СПОВІЩЕННЯ
  // ===================================================================
  async function loadNotifications() {
    if (!CRM.can('auth')) return;
    const { data, error } = await sb.from('notifications')
      .select('id, title, url, read_at, created_at').order('created_at', { ascending: false }).limit(20);
    if (error) return console.error('[CRM] notifications', error);
    CRM.render('notifications', data.map((n) => ({ ...n, time: CRM.time(n.created_at) })), (el, n) => {
      el.href = n.url || '#';
      el.classList.toggle('is-unread', !n.read_at);
      el.dataset.id = n.id;
    });
    const unread = data.filter((n) => !n.read_at).length;
    $$('[data-notif-count]').forEach((b) => {
      b.textContent = unread > 9 ? '9+' : unread;
      b.style.display = unread ? '' : 'none';
    });
  }
  function watchNotifications() {
    sb.channel('crm-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${CRM.user.id}` },
        (p) => { loadNotifications(); CRM.toast(p.new.title); })
      .subscribe();
  }
  async function readNotifications(id) {
    let q = sb.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
    if (id) q = q.eq('id', id);
    await q;
    loadNotifications();
  }

  // ===================================================================
  // ДЕЛЕГОВАНІ ПОДІЇ
  // ===================================================================
  document.addEventListener('click', async (e) => {
    // клік по фону модалки
    if (e.target.matches('[data-modal]')) return CRM.modal.close(e.target);

    const panel = $('[data-notif-panel]');
    if (panel && panel.classList.contains('is-open') && !e.target.closest('[data-notif-panel], [data-action="toggle:notifications"]')) {
      panel.classList.remove('is-open');
    }

    // сповіщення: позначити прочитаним при переході
    const notif = e.target.closest('[data-list="notifications"] > [data-rendered]');
    if (notif?.classList.contains('is-unread')) readNotifications(notif.dataset.id);

    // таби
    const tab = e.target.closest('[data-tabs] [data-tab]');
    if (tab) {
      e.preventDefault();
      const group = tab.closest('[data-tabs]');
      $$('[data-tab]', group).forEach((t) => {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-selected', t === tab);
      });
      group.dispatchEvent(new CustomEvent('crm:tab', { bubbles: true, detail: { group: group.dataset.tabs, value: tab.dataset.tab } }));
      return;
    }

    // тема в профілі
    const themeOpt = e.target.closest('[data-theme-switch] [data-theme-value]');
    if (themeOpt) { e.preventDefault(); return CRM.theme(themeOpt.dataset.themeValue); }

    // вхід через Google / вихід
    if (e.target.closest('[data-element="auth-google"]')) {
      e.preventDefault();
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + nextPath() } });
      if (error) showError(TEXT.failed);
      return;
    }
    if (e.target.closest('[data-element="auth-logout"]')) {
      e.preventDefault();
      await sb.auth.signOut();
      return location.replace(cfg.loginPath);
    }

    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'open:search') { e.preventDefault(); return openSearch(); }
    if (a.startsWith('open:')) { e.preventDefault(); return CRM.modal.open(a.slice(5)); }
    if (a === 'close') { e.preventDefault(); return CRM.modal.close(el.closest('[data-modal]')); }
    if (a === 'toggle:notifications') { e.preventDefault(); return panel?.classList.toggle('is-open'); }
    if (a === 'notifications-read-all') { e.preventDefault(); return readNotifications(); }
    if (a === 'toggle-theme') {
      e.preventDefault();
      return CRM.theme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    }
    if (actions[a]) { e.preventDefault(); actions[a](el, e); }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && $('[data-modal="search"]')) {
      e.preventDefault();
      return openSearch();
    }
    if (e.key === 'Escape') {
      $('[data-notif-panel]')?.classList.remove('is-open');
      return CRM.modal.close();
    }
    searchKeys(e);
  });

  // ===================================================================
  // МОДУЛІ
  // ===================================================================
  function loadModules() {
    MODULES.forEach((name) => {
      const els = $$(`[data-element="${name}"]`);
      if (!els.length) return;
      const s = document.createElement('script');
      s.src = `${cfg.modulesBase}${name}.js`;
      s.onload = () => els.forEach((el) => {
        try { registry[name]?.(el, CRM); } catch (err) { console.error(`[CRM] ${name}:`, err); }
      });
      s.onerror = () => console.error(`[CRM] Не завантажився модуль ${name}`);
      document.head.appendChild(s);
    });
  }

  // ===================================================================
  // СТАРТ
  // ===================================================================
  const domReady = new Promise((r) =>
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', r, { once: true }) : r());

  Promise.all([loadProfile(), domReady])
    .then(() => {
      if (!guard()) return;
      CRM.theme();
      bindUI();
      html.classList.remove('crm-loading');
      if (CRM.can('auth') && $('[data-notif-panel]')) { loadNotifications(); watchNotifications(); }
      loadModules();
      document.dispatchEvent(new CustomEvent('crm:ready', { detail: CRM }));
    })
    .catch((err) => {
      console.error('[CRM] init:', err);
      html.classList.remove('crm-loading');
    });
})();
