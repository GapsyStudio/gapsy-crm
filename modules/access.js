/* Gapsy CRM · modules/access.js — Доступи (/access, /access?id=<id>)
 * Сервіси з підписками й курси / навчальні платформи. Список бачить уся команда;
 * логін і пароль — лише PM/admin (Supabase Vault, функції access_reveal / access_set_secret / access_clear_secret).
 * Розмітка: [data-element="access"]
 *   таби data-tabs="access" (service | course), пошук [data-access-search] у формі data-form="access-search",
 *   список data-list="access" (поля name, host, notes, secret; дії access-edit, access-reveal, access-secret),
 *   лічильники [data-count="service|course"], кнопка data-action="access-new".
 *   Модалки: data-modal="access-item" (форма data-form="access-item": kind, name, url, notes; дія access-delete),
 *            data-modal="access-secret" (форма data-form="access-secret": login, password, extra; дія access-clear),
 *            data-modal="access-reveal" (поля [data-reveal="login|password|extra"], дії access-copy з data-copy, таймер [data-reveal-timer]).
 *   Кнопки лише для PM/admin позначені data-crm-role="pm,admin" (ядро прибирає їх для інших ролей).
 * Секрети ніколи не пишемо в консоль, тости чи DOM поза модалкою показу; модалка очищається при закритті й через 60 с. */
CRM.module('access', async (root, CRM) => {
  const { sb, render, onSubmit, modal, toast, action, param, can, time } = CRM;
  const KIND = { service: 'Сервіс', course: 'Курс / платформа' };
  CRM.optionLists['access-kind'] = Object.entries(KIND);
  const safeUrl = (u) => (u && /^https?:\/\//i.test(u) ? u : null);
  const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return ''; } };
  const isManager = can('pm,admin');

  let items = [];
  let tab = 'service';
  let query = '';
  let current = null; // запис у модалці

  async function load() {
    const { data, error } = await sb.from('access_items')
      .select('id, kind, name, url, notes, secret_id, secret_set_at, updated_at').order('name');
    if (error) return CRM.fail(error);
    items = data || [];
    draw();
  }

  function draw() {
    const q = query.toLowerCase();
    const rows = items.filter((i) => i.kind === tab
      && (!q || i.name.toLowerCase().includes(q) || (i.notes || '').toLowerCase().includes(q) || (i.url || '').toLowerCase().includes(q)));
    render('access', rows.map((i) => ({
      ...i,
      host: host(i.url),
      notes: i.notes || '',
      secret: i.secret_id ? 'Є доступ' : 'Без доступу',
      updated: i.secret_set_at ? `Доступ оновлено ${time(i.secret_set_at)}` : '',
    })), (el, i) => {
      el.dataset.id = i.id;
      const link = el.querySelector('[data-access-link]');
      if (link) {
        const url = safeUrl(i.url);
        link.hidden = !url;
        if (url) { link.href = url; link.target = '_blank'; link.rel = 'noopener'; }
      }
      const badge = el.querySelector('[data-field="secret"]');
      if (badge) { badge.classList.toggle('is-green', !!i.secret_id); }
      const notes = el.querySelector('[data-field="notes"]');
      if (notes) notes.hidden = !i.notes;
      // «Показати» — лише якщо доступ уже збережено
      el.querySelector('[data-action="access-reveal"]')?.toggleAttribute('hidden', !i.secret_id);
    });
    ['service', 'course'].forEach((k) => root.querySelectorAll(`[data-count="${k}"]`)
      .forEach((c) => { c.textContent = items.filter((i) => i.kind === k).length; }));
  }

  root.addEventListener('crm:tab', (e) => { if (e.detail.group === 'access') { tab = e.detail.value; draw(); } });
  const search = root.querySelector('[data-access-search]');
  search?.addEventListener('input', () => { query = search.value.trim(); draw(); });
  onSubmit('access-search', async () => {}); // Enter не відправляє форму у Webflow

  const byEl = (el) => items.find((i) => i.id === el.closest('[data-id]')?.dataset.id);
  const titleIn = (m, text) => m?.querySelectorAll('[data-access-title]').forEach((t) => { t.textContent = text; });

  // ---------- сервіс: створити / редагувати ----------
  async function openItem(i) {
    current = i || null;
    const m = modal.open('access-item');
    if (!m) return;
    await CRM.fillSelects(m);
    const f = m.querySelector('[data-form="access-item"]');
    f.reset();
    if (f.elements.kind) f.elements.kind.value = i?.kind || tab;
    if (f.elements.name) f.elements.name.value = i?.name || '';
    if (f.elements.url) f.elements.url.value = i?.url || '';
    if (f.elements.notes) f.elements.notes.value = i?.notes || '';
    titleIn(m, i ? i.name : (tab === 'course' ? 'Новий курс' : 'Новий сервіс'));
    m.querySelector('[data-action="access-delete"]')?.toggleAttribute('hidden', !i);
  }
  action('access-new', () => openItem(null));
  action('access-edit', (el) => openItem(byEl(el)));

  onSubmit('access-item', async (d) => {
    const name = (d.name || '').trim();
    const url = (d.url || '').trim();
    if (!name) return toast('Вкажи назву');
    if (url && !safeUrl(url)) return toast('Посилання має починатися з https://');
    const row = { kind: d.kind === 'course' ? 'course' : 'service', name, url: url || null, notes: (d.notes || '').trim() || null };
    let id = current?.id;
    if (id) {
      const { error } = await sb.from('access_items').update(row).eq('id', id);
      if (error) throw error;
    } else {
      const { data, error } = await sb.from('access_items').insert(row).select('id').single();
      if (error) throw error;
      id = data.id;
    }
    const wasNew = !current;
    modal.close();
    tab = row.kind;
    syncTab();
    await load();
    // новий запис: PM/admin одразу пропонуємо ввести доступ
    if (wasNew && isManager) openSecret(items.find((i) => i.id === id) || { id, ...row, secret_id: null });
    else toast(wasNew ? 'Додано' : 'Збережено');
  });

  action('access-delete', async () => {
    if (!current || !confirm(`Видалити «${current.name}» разом із доступом?`)) return;
    const { error } = await sb.from('access_items').delete().eq('id', current.id);
    if (error) return CRM.fail(error);
    modal.close();
    toast('Видалено');
    load();
  });

  // ---------- доступ: записати (PM/admin) ----------
  function openSecret(i) {
    if (!i) return;
    current = i;
    const m = modal.open('access-secret');
    if (!m) return;
    const f = m.querySelector('[data-form="access-secret"]');
    f.reset();
    titleIn(m, i.name);
    const hint = m.querySelector('[data-secret-hint]');
    if (hint) hint.textContent = i.secret_id
      ? 'Доступ уже збережено. Порожні поля лишать старі значення.'
      : 'Логін і пароль шифруються у Vault. Побачити їх зможуть лише PM і admin.';
    m.querySelector('[data-action="access-clear"]')?.toggleAttribute('hidden', !i.secret_id);
  }
  action('access-secret', (el) => openSecret(byEl(el)));

  onSubmit('access-secret', async (d, form) => {
    if (!current) return;
    const login = (d.login || '').trim();
    const password = d.password || '';
    const extra = (d.extra || '').trim();
    if (!current.secret_id && (!login || !password)) return toast('Вкажи логін і пароль');
    if (!login && !password && !extra) return toast('Нічого не змінено');
    const { error } = await sb.rpc('access_set_secret', { item: current.id, login, password, extra: extra || null });
    form.reset(); // пароль не лишаємо в полі
    if (error) throw error;
    modal.close();
    toast('Доступ збережено');
    load();
  });

  action('access-clear', async () => {
    if (!current?.secret_id || !confirm(`Прибрати збережений доступ до «${current.name}»?`)) return;
    const { error } = await sb.rpc('access_clear_secret', { item: current.id });
    if (error) return CRM.fail(error);
    modal.close();
    toast('Доступ прибрано');
    load();
  });

  // ---------- доступ: показати (PM/admin, логується) ----------
  const revealModal = document.querySelector('[data-modal="access-reveal"]');
  const revealed = {};
  let revealTimer = null;
  const clearReveal = () => {
    clearInterval(revealTimer);
    revealTimer = null;
    Object.keys(revealed).forEach((k) => { delete revealed[k]; });
    revealModal?.querySelectorAll('[data-reveal]').forEach((el) => { el.textContent = '—'; });
  };
  if (revealModal) new MutationObserver(() => {
    if (!revealModal.classList.contains('is-open')) clearReveal();
  }).observe(revealModal, { attributes: true, attributeFilter: ['class'] });

  action('access-reveal', async (el) => {
    const i = byEl(el);
    if (!i) return;
    const { data, error } = await sb.rpc('access_reveal', { item: i.id });
    if (error) return CRM.fail(error);
    const s = Array.isArray(data) ? data[0] : data;
    if (!s) return toast('Доступ не збережено');
    clearReveal();
    Object.assign(revealed, { login: s.login || '', password: s.password || '', extra: s.extra || '' });
    const m = modal.open('access-reveal');
    titleIn(m, i.name);
    m.querySelectorAll('[data-reveal]').forEach((r) => {
      const k = r.dataset.reveal;
      r.textContent = revealed[k] || '—';
      r.closest('[data-reveal-row]')?.toggleAttribute('hidden', k === 'extra' && !revealed.extra);
    });
    // автоприховування через 60 с
    let left = 60;
    const timer = m.querySelector('[data-reveal-timer]');
    const tick = () => { if (timer) timer.textContent = `Сховається через ${left} с`; };
    tick();
    revealTimer = setInterval(() => {
      left -= 1;
      tick();
      if (left <= 0) modal.close(m);
    }, 1000);
  });

  action('access-copy', async (el) => {
    const value = revealed[el.dataset.copy];
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast(el.dataset.copy === 'password' ? 'Пароль скопійовано' : 'Скопійовано');
    } catch (err) {
      // запасний варіант: виділити текст, щоб скопіювати вручну
      const node = revealModal?.querySelector(`[data-reveal="${el.dataset.copy}"]`);
      if (node) { const r = document.createRange(); r.selectNodeContents(node); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
      toast('Натисни ⌘C, щоб скопіювати');
    }
  });

  // ---------- старт ----------
  function syncTab() {
    root.querySelectorAll('[data-tabs="access"] [data-tab]').forEach((t) => {
      t.classList.toggle('is-active', t.dataset.tab === tab);
      t.setAttribute('aria-selected', t.dataset.tab === tab);
    });
  }
  await load();
  const openId = param('id');
  const target = openId && items.find((i) => i.id === openId);
  if (target) {
    tab = target.kind;
    syncTab();
    draw();
    root.querySelector(`[data-list="access"] > [data-id="${target.id}"]`)?.scrollIntoView({ block: 'center' });
  }
});
