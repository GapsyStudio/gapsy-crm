/* Gapsy CRM · modules/dashboard.js — Головна (/app)
 * Розмітка: [data-element="dashboard"], [data-today], списки my-feedback / recent-docs / pins, форма data-form="pin".
 * Баланс відпусток підключиться разом із модулем leave.
 * v0.10 «Пульс агенції» (лише PM/admin, обгортка [data-pulse] з data-crm-role="pm,admin"):
 *   лічильники [data-pulse-count="risk|overdue|handoffs|active"],
 *   data-list="pulse-risk" — проєкти під ризиком (поля name, stage, due; бейдж risk), посилання на картку;
 *   data-list="workload" — люди (поля name, role, projects, open, overdue), найзавантаженіші вгорі.
 * v0.12 (PM/admin): data-list="renewals" — підписки з продовженням у найближчі 30 днів (поля name, price, when; is-red ≤ 7 днів),
 *   обгортка [data-renewals] ховається, якщо нічого немає. Лічильник [data-pulse-count="reviews"] — дизайн на погодженні. */
CRM.module('dashboard', (root, { sb, user, render, onSubmit, modal, toast, badge, crumbs, time, date, name, can }) => {
  crumbs('Головна');
  const STATUS = CRM.FEEDBACK_STATUS;

  const today = root.querySelector('[data-today]');
  if (today) {
    const t = new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
    today.textContent = t.charAt(0).toUpperCase() + t.slice(1);
  }

  // Мої відкриті правки: я автор або виконавець
  async function loadFeedback() {
    const { data, error } = await sb.from('feedback')
      .select('id, title, status, project:projects(name)')
      .neq('status', 'resolved')
      .or(`author_id.eq.${user.id},assignee_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return console.error(error);
    render('my-feedback', data.map((f) => ({ ...f, project: f.project?.name || '' })), (el, f) => {
      el.href = `/feedback-item?id=${f.id}`;
      badge(el.querySelector('[data-field="status"]'), f.status, STATUS);
    });
  }

  // Нещодавно змінені документи бази знань
  sb.from('docs').select('id, title, icon, updated_at, notion_id').order('updated_at', { ascending: false }).limit(9)
    .then(({ data, error }) => {
      if (error) return console.error(error);
      data = data.filter((d) => !String(d.notion_id || '').startsWith('group:')).slice(0, 5); // групи — не документи
      render('recent-docs', data.map((d) => ({ ...d, icon: d.icon || '', meta: time(d.updated_at) })),
        (el, d) => { el.href = `/doc?id=${d.id}`; });
    });

  // ---------- Швидкий доступ (v0.16) ----------
  // Закріплене — сторінки CRM (проєкт, документ, правка, розділ…) або зовнішні посилання. Дані й кеш — у ядрі (CRM.pins).
  // Картка: підпис = тип сторінки або домен; × у кутку прибирає (раніше — лише ПКМ).
  function renderPins(data) {
    render('pins', data.map((p) => ({ ...p, host: CRM.pinLabel(p.url) })), (el, p) => {
      el.href = p.url;
      el.dataset.id = p.id;
      if (/^https?:/i.test(p.url)) { el.target = '_blank'; el.rel = 'noopener'; }
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'pin_remove';
      x.textContent = '×';
      x.setAttribute('aria-label', `Прибрати «${p.title}» зі швидкого доступу`);
      x.title = 'Прибрати';
      x.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); CRM.unpin(p.id); });
      el.append(x);
    });
  }
  document.addEventListener('crm:pins', (e) => renderPins(e.detail));
  const loadPins = () => CRM.pins().then(renderPins);

  // Модалка «Закріпити»: пошук по сторінках CRM угорі; вибір підставляє назву й адресу. Можна й просто вставити посилання.
  const pinForm = document.querySelector('[data-form="pin"]');
  if (pinForm && !pinForm.querySelector('[data-pin-search]')) {
    const body = pinForm.querySelector('.modal_body') || pinForm;
    const titleIn = pinForm.querySelector('[name="title"]');
    const urlIn = pinForm.querySelector('[name="url"]');
    if (urlIn) { urlIn.type = 'text'; urlIn.placeholder = 'https://… або сторінка CRM'; urlIn.autocomplete = 'off'; }
    const head = pinForm.closest('[data-modal]')?.querySelector('.card_title');
    if (head) head.textContent = 'Додати в швидкий доступ';
    const field = document.createElement('div');
    field.className = 'form_field';
    field.innerHTML = '<label class="field-label" for="pin-search">Сторінка CRM</label>'
      + '<input class="form-input" id="pin-search" type="search" autocomplete="off" data-pin-search placeholder="Проєкт, документ, правка, розділ…">'
      + '<div class="pin_results" data-pin-results role="listbox" aria-label="Сторінки CRM"></div>'
      + '<div class="pin_or">або встав посилання</div>';
    body.prepend(field);
    const search = field.querySelector('[data-pin-search]');
    const box = field.querySelector('[data-pin-results]');
    let auto = '';      // назва, яку підставили ми (якщо людина її не правила — замінюємо при новому виборі)
    let timer = null;
    let token = 0;
    const choose = (r) => {
      if (titleIn && (!titleIn.value.trim() || titleIn.value === auto)) titleIn.value = auto = r.title;
      if (urlIn) urlIn.value = r.url;
      box.querySelectorAll('.pin_option').forEach((o) => o.classList.toggle('is-active', o.dataset.url === r.url));
    };
    const show = async () => {
      const my = ++token;
      const pinned = new Set((await CRM.pins()).map((p) => p.url));
      const rows = (await CRM.searchPages(search.value)).filter((r) => !pinned.has(r.url)).slice(0, 7);
      if (my !== token) return; // поки чекали, запит змінився
      box.replaceChildren(...rows.map((r) => {
        const o = document.createElement('button');
        o.type = 'button';
        o.className = 'pin_option';
        o.dataset.url = r.url;
        o.setAttribute('role', 'option');
        o.innerHTML = '<span class="pin_option-title"></span><span class="pin_option-type"></span>';
        o.firstChild.textContent = r.title;
        o.lastChild.textContent = r.type;
        o.addEventListener('click', () => choose(r));
        return o;
      }));
      if (!rows.length) box.innerHTML = '<div class="pin_option-empty">Нічого не знайшли — встав посилання нижче</div>';
    };
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(show, 200); });
    search.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault(); // Enter у пошуку — вибрати перший варіант, а не надіслати форму
      box.querySelector('.pin_option')?.click();
    });
    // відкрили модалку — свіжий список розділів, фокус у пошуку
    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-action="open:pin"]')) return;
      search.value = ''; auto = '';
      show();
      setTimeout(() => search.focus(), 50);
    });
  }

  onSubmit('pin', async (data, form) => {
    await CRM.pin(data.title, data.url);
    form.reset();
    form.querySelectorAll('.pin_option.is-active').forEach((o) => o.classList.remove('is-active'));
    modal.close();
  });

  // ---------- Пульс агенції (PM/admin) ----------
  const ROLE = { designer: 'Дизайн', developer: 'Розробка', pm: 'PM', admin: 'Адмін' };
  async function loadPulse() {
    if (!can('pm,admin') || !root.querySelector('[data-pulse]')) return;
    const [pr, fb, ho, mem, ppl] = await Promise.all([
      sb.from('projects').select('id, name, status, stage, stage_due, deadline').eq('status', 'active'),
      sb.from('feedback').select('id, assignee_id, due_date').neq('status', 'resolved'),
      sb.from('handoffs').select('id, status, submitted_at').eq('status', 'submitted'),
      sb.from('project_members').select('user_id, project_id'),
      sb.from('profiles').select('id, full_name, email, role').in('role', ['designer', 'developer', 'pm', 'admin']),
    ]);
    const err = [pr, fb, ho, mem, ppl].find((r) => r.error);
    if (err) return console.error(err.error);
    const todayStr = new Date().toLocaleDateString('sv'); // YYYY-MM-DD за місцевим часом
    const active = pr.data;
    const risky = active.map((p) => ({ ...p, risk: CRM.projectRisk(p) })).filter((p) => p.risk).sort((a, b) => a.risk.days - b.risk.days);
    const overdue = fb.data.filter((f) => f.due_date && f.due_date < todayStr);
    const stuck = ho.data.filter((h) => h.submitted_at && Date.now() - new Date(h.submitted_at) > 2 * 864e5);
    const counts = { risk: risky.length, overdue: overdue.length, handoffs: stuck.length, active: active.length };
    const { count: reviewsCount } = await sb.from('design_reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    counts.reviews = reviewsCount || 0;
    root.querySelectorAll('[data-pulse-count]').forEach((el) => { el.textContent = counts[el.dataset.pulseCount] ?? '0'; });
    loadRenewals();

    const short = (d) => date(d, { day: 'numeric', month: 'short' });
    render('pulse-risk', risky.slice(0, 6).map((p) => ({ ...p, due: short(p.risk.date) })), (el, p) => {
      el.href = `/project?id=${p.id}`;
      badge(el.querySelector('[data-field="stage"]'), p.stage || 'design', CRM.STAGE);
      badge(el.querySelector('[data-field="risk"]'), 'r', { r: [p.risk.text, p.risk.combo] });
    });

    const activeIds = new Set(active.map((p) => p.id));
    const rows = ppl.data.map((u) => ({
      id: u.id, name: name(u), role: ROLE[u.role] || u.role,
      projects: mem.data.filter((m) => m.user_id === u.id && activeIds.has(m.project_id)).length,
      open: fb.data.filter((f) => f.assignee_id === u.id).length,
      overdue: overdue.filter((f) => f.assignee_id === u.id).length,
    })).filter((u) => u.role !== 'Адмін' || u.projects || u.open)
      .sort((a, b) => b.overdue - a.overdue || b.open + b.projects - (a.open + a.projects));
    render('workload', rows, (el, u) => {
      el.querySelector('[data-field="overdue"]')?.toggleAttribute('hidden', !u.overdue);
    });
  }

  // ---------- Скоро продовження підписок (PM/admin) ----------
  async function loadRenewals() {
    const box = root.querySelector('[data-renewals]');
    if (!box) return;
    const from = new Date().toLocaleDateString('sv');
    const to = new Date(Date.now() + 30 * 864e5).toLocaleDateString('sv');
    const { data, error } = await sb.from('access_items').select('id, name, price, currency, period, renews_on')
      .gte('renews_on', from).lte('renews_on', to).order('renews_on');
    if (error) return console.error(error);
    box.hidden = !data.length;
    const PER = { month: ' / міс', year: ' / рік' };
    render('renewals', data.map((i) => ({
      ...i,
      price: i.price != null ? `${Number(i.price).toLocaleString('uk-UA')} ${i.currency}${PER[i.period] || ''}` : '',
      when: date(i.renews_on, { day: 'numeric', month: 'short' }),
    })), (el, i) => {
      if (el.tagName === 'A') el.href = `/access?id=${i.id}`;
      const days = Math.ceil((new Date(`${i.renews_on}T00:00:00`) - new Date(new Date().toDateString())) / 864e5);
      el.querySelector('[data-field="when"]')?.classList.toggle('is-red', days <= 7);
    });
  }

  loadFeedback();
  loadPins();
  loadPulse();
});
