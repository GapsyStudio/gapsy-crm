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
 * Секрети ніколи не пишемо в консоль, тости чи DOM поза модалкою показу; модалка очищається при закритті й через 60 с.
 * v0.12:
 *   підписки — у формі access-item поля price, currency (select data-options="currency"), period (data-options="period"), renews_on;
 *     у картці поля price («15 USD / міс»), renews («Продовження 12 лист.», [data-field="renews"] отримує is-red, якщо ≤ 7 днів);
 *     підсумок [data-subs-total] («Підписки ≈ $45/міс»).
 *   тимчасовий доступ — у картці кнопки data-action="access-request" (попросити; для всіх, крім PM/admin)
 *     і data-action="access-reveal" з атрибутом data-access-grant (показати, поки діє схвалений запит; без data-crm-role);
 *     поле [data-field="grant"] («Доступ до 14:30» / «Запит надіслано»).
 *     Модалка data-modal="access-request" (форма data-form="access-request": reason).
 *     PM/admin: секція [data-access-requests] зі списком data-list="access-requests" (поля who, item, reason, time;
 *     кнопки data-action="areq-approve" data-hours="1|24|168" і data-action="areq-decline"). */
CRM.module('access', async (root, CRM) => {
  const { sb, render, onSubmit, modal, toast, action, param, can, time } = CRM;
  const KIND = { service: 'Сервіс', course: 'Курс / платформа' };
  CRM.optionLists['access-kind'] = Object.entries(KIND);
  const safeUrl = (u) => (u && /^https?:\/\//i.test(u) ? u : null);
  const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return ''; } };
  const isManager = can('pm,admin');
  CRM.optionLists.currency = [['USD', 'USD'], ['EUR', 'EUR'], ['UAH', 'UAH']];
  CRM.optionLists.period = [['month', 'Щомісяця'], ['year', 'Щороку'], ['once', 'Разово']];
  const PERIOD_SHORT = { month: 'міс', year: 'рік' };
  const SIGN = { USD: '$', EUR: '€', UAH: '₴' };
  const money = (v, c) => `${Number(v).toLocaleString('uk-UA', { maximumFractionDigits: 2 })} ${c || 'USD'}`;
  const daysTo = (d) => Math.ceil((new Date(`${d}T00:00:00`) - new Date(new Date().toDateString())) / 864e5);
  let mine = [];       // мої запити (для не-PM): pending або чинні approved
  let requests = [];   // запити, що чекають (для PM/admin)

  let items = [];
  let tab = 'service';
  let query = '';
  let current = null; // запис у модалці

  async function load() {
    const { data, error } = await sb.from('access_items')
      .select('id, kind, name, url, notes, secret_id, secret_set_at, updated_at, price, currency, period, renews_on').order('name');
    if (error) return CRM.fail(error);
    items = data || [];
    // запити доступу: свої (RLS віддає лише свої) або всі, що чекають (PM/admin)
    const { data: reqs } = await sb.from('access_requests')
      .select('id, item_id, requester, reason, status, expires_at, created_at, who:profiles!access_requests_requester_fkey(full_name, email)')
      .or(`status.eq.pending,expires_at.gt."${new Date().toISOString()}"`).order('created_at', { ascending: false });
    const me = CRM.user?.id;
    mine = (reqs || []).filter((r) => r.requester === me);
    requests = isManager ? (reqs || []).filter((r) => r.status === 'pending') : [];
    draw();
    drawRequests();
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
      price: i.price != null ? `${money(i.price, i.currency)}${PERIOD_SHORT[i.period] ? ` / ${PERIOD_SHORT[i.period]}` : ''}` : '',
      renews: i.renews_on ? `Продовження ${CRM.date(i.renews_on, { day: 'numeric', month: 'short' })}` : '',
      grant: grantText(i),
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
      // «Показати» — лише якщо доступ уже збережено (PM/admin); для інших — лише з чинним схваленим запитом
      const g = grantOf(i);
      el.querySelectorAll('[data-action="access-reveal"]').forEach((b) => {
        b.toggleAttribute('hidden', !i.secret_id || (b.hasAttribute('data-access-grant') ? isManager || !g.active : false));
      });
      el.querySelector('[data-action="access-request"]')?.toggleAttribute('hidden', isManager || !i.secret_id || g.active || g.pending);
      ['price', 'renews', 'grant'].forEach((k) => {
        const f = el.querySelector(`[data-field="${k}"]`);
        if (f) f.hidden = !f.textContent;
      });
      const ren = el.querySelector('[data-field="renews"]');
      if (ren) ren.classList.toggle('is-red', !!i.renews_on && daysTo(i.renews_on) <= 7);
    });
    drawTotal();
    ['service', 'course'].forEach((k) => root.querySelectorAll(`[data-count="${k}"]`)
      .forEach((c) => { c.textContent = items.filter((i) => i.kind === k).length; }));
  }

  function grantOf(i) {
    const rs = mine.filter((r) => r.item_id === i.id);
    const ok = rs.find((r) => r.status === 'approved' && new Date(r.expires_at) > new Date());
    return { active: !!ok, until: ok?.expires_at, pending: rs.some((r) => r.status === 'pending') };
  }
  function grantText(i) {
    if (isManager) return '';
    const g = grantOf(i);
    if (g.active) return `Доступ до ${new Date(g.until).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    return g.pending ? 'Запит надіслано' : '';
  }
  // підсумок підписок за місяць (річні ділимо на 12, разові не рахуємо), по валютах
  function drawTotal() {
    const el = root.querySelector('[data-subs-total]');
    if (!el) return;
    const sum = {};
    items.forEach((i) => {
      if (i.price == null || !['month', 'year'].includes(i.period)) return;
      sum[i.currency] = (sum[i.currency] || 0) + (i.period === 'year' ? i.price / 12 : Number(i.price));
    });
    const parts = Object.entries(sum).map(([c, v]) => `${SIGN[c] || ''}${Math.round(v).toLocaleString('uk-UA')}${SIGN[c] ? '' : ` ${c}`}`);
    const soon = items.filter((i) => i.renews_on && daysTo(i.renews_on) >= 0 && daysTo(i.renews_on) <= 7).length;
    el.textContent = parts.length ? `Підписки ≈ ${parts.join(' + ')} / міс${soon ? ` · продовження цього тижня: ${soon}` : ''}` : '';
    el.hidden = !parts.length;
  }
  function drawRequests() {
    const box = root.querySelector('[data-access-requests]');
    if (box) box.hidden = !requests.length;
    render('access-requests', requests.map((r) => ({
      ...r, who: CRM.name(r.who), item: items.find((i) => i.id === r.item_id)?.name || '—', reason: r.reason || '', time: time(r.created_at),
    })), (el, r) => {
      el.dataset.reqId = r.id;
      const rs = el.querySelector('[data-field="reason"]');
      if (rs) rs.hidden = !r.reason;
    });
  }

  // ---------- тимчасовий доступ ----------
  let requestFor = null;
  action('access-request', (el) => {
    requestFor = byEl(el);
    if (!requestFor) return;
    const m = modal.open('access-request');
    m?.querySelector('form')?.reset();
    titleIn(m, requestFor.name);
  });
  onSubmit('access-request', async (d) => {
    if (!requestFor) return;
    const { error } = await sb.from('access_requests').insert({ item_id: requestFor.id, reason: (d.reason || '').trim() || null });
    if (error) throw error;
    modal.close();
    toast('Запит надіслано PM');
    load();
  });
  async function decide(el, approve) {
    const id = el.closest('[data-req-id]')?.dataset.reqId;
    if (!id) return;
    const hours = Number(el.dataset.hours) || 24;
    const { error } = await sb.rpc('access_request_decide', { request: id, approve, grant_hours: approve ? hours : null });
    if (error) return CRM.fail(error);
    toast(approve ? `Доступ відкрито на ${hours === 1 ? '1 год' : hours === 24 ? '24 год' : '7 днів'}` : 'Запит відхилено');
    load();
  }
  action('areq-approve', (el) => decide(el, true));
  action('areq-decline', (el) => decide(el, false));

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
    if (f.elements.price) f.elements.price.value = i?.price ?? '';
    if (f.elements.currency) f.elements.currency.value = i?.currency || 'USD';
    if (f.elements.period) f.elements.period.value = i?.period || '';
    if (f.elements.renews_on) f.elements.renews_on.value = i?.renews_on || '';
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
    const price = String(d.price ?? '').replace(',', '.').trim();
    if (price && !(Number(price) >= 0)) return toast('Ціна — число, напр. 15 або 9.99');
    const row = {
      kind: d.kind === 'course' ? 'course' : 'service', name, url: url || null, notes: (d.notes || '').trim() || null,
      price: price ? Number(price) : null,
      currency: ['USD', 'EUR', 'UAH'].includes(d.currency) ? d.currency : 'USD',
      period: ['month', 'year', 'once'].includes(d.period) ? d.period : null,
      renews_on: /^\d{4}-\d{2}-\d{2}$/.test(d.renews_on || '') ? d.renews_on : null,
    };
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
  if (location.hash === '#requests') root.querySelector('[data-access-requests]')?.scrollIntoView({ block: 'start' });
  const openId = param('id');
  const target = openId && items.find((i) => i.id === openId);
  if (target) {
    tab = target.kind;
    syncTab();
    draw();
    root.querySelector(`[data-list="access"] > [data-id="${target.id}"]`)?.scrollIntoView({ block: 'center' });
  }
});
