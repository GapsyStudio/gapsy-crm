/* Gapsy CRM · modules/reviews.js — Погодження дизайну (/reviews, /reviews?id=<id>)  · v0.12
 * Дизайнер (будь-хто з команди) надсилає макет на погодження; арт-директор (позначка в адмінці) або admin
 * погоджує чи повертає з коментарем. Повторне надсилання = нова версія (parent_id, version + 1), історія видна в модалці.
 * Розмітка: [data-element="reviews"]
 *   таби data-tabs="reviews": pending | changes | approved | mine; лічильники [data-count="pending|changes|approved|mine"]
 *   список data-list="reviews" (рядок: поля title, meta, status; дія review-open)
 *   кнопка data-action="review-new"; підказка [data-review-noad] (для admin, якщо арт-директора не призначено)
 *   модалка data-modal="review-new": форма data-form="review" (project_id — select data-options="projects", title, url, description),
 *     заголовок [data-review-form-title]
 *   модалка data-modal="review": [data-review="title|meta|note|decision"], посилання [data-review-link],
 *     історія data-list="review-history" (поля version, status, time, decision_note),
 *     блок рішення [data-review-decide] (textarea name="comment" у формі data-form="review-decide"; дії review-approve, review-changes),
 *     дії автора: review-version (нова версія), review-delete. */
CRM.module('reviews', async (root, CRM) => {
  const { sb, render, onSubmit, modal, toast, action, badge, name, time, param, can } = CRM;
  const STATUS = { pending: ['На погодженні', 'is-yellow'], approved: ['Погоджено', 'is-green'], changes: ['Потрібні правки', 'is-red'] };
  const me = CRM.user?.id;
  const isAD = !!CRM.profile?.is_art_director;
  const canDecide = isAD || can('admin');
  // v0.19: розробник лише переглядає погодження (яку версію верстати), не надсилає нові
  if (CRM.role === 'developer') document.querySelectorAll('[data-action="review-new"], [data-action="review-version"]').forEach((b) => b.remove());
  let rows = [];
  let tab = canDecide ? 'pending' : 'mine';
  let current = null;   // відкритий запит
  let base = null;      // для «нової версії»

  async function load() {
    const { data, error } = await sb.from('design_reviews')
      .select('*, project:projects(name), author:profiles!design_reviews_requested_by_fkey(full_name, email), reviewer:profiles!design_reviews_reviewer_id_fkey(full_name, email)')
      .order('created_at', { ascending: false });
    if (error) return CRM.fail(error);
    rows = data || [];
    draw();
  }

  // показуємо лише останню версію кожного ланцюжка
  const latest = () => rows.filter((r) => !rows.some((x) => x.parent_id === r.id));
  const inTab = (r, t) => (t === 'mine' ? r.requested_by === me : r.status === t);

  function draw() {
    const list = latest();
    render('reviews', list.filter((r) => inTab(r, tab)).map((r) => ({
      ...r,
      meta: [r.project?.name, r.version > 1 ? `v${r.version}` : '', name(r.author), time(r.created_at)].filter(Boolean).join(' · '),
    })), (el, r) => {
      el.dataset.id = r.id;
      badge(el.querySelector('[data-field="status"]'), r.status, STATUS);
    });
    ['pending', 'changes', 'approved', 'mine'].forEach((t) => root.querySelectorAll(`[data-count="${t}"]`)
      .forEach((c) => { c.textContent = list.filter((r) => inTab(r, t)).length; }));
  }

  function syncTab() {
    root.querySelectorAll('[data-tabs="reviews"] [data-tab]').forEach((t) => {
      t.classList.toggle('is-active', t.dataset.tab === tab);
      t.setAttribute('aria-selected', t.dataset.tab === tab);
    });
  }
  root.addEventListener('crm:tab', (e) => { if (e.detail.group === 'reviews') { tab = e.detail.value; draw(); } });

  // ---------- новий запит / нова версія ----------
  async function openForm(prev) {
    base = prev || null;
    const m = modal.open('review-new');
    if (!m) return;
    await CRM.fillSelects(m);
    const f = m.querySelector('[data-form="review"]');
    f.reset();
    if (prev) {
      f.elements.title.value = prev.title;
      f.elements.url.value = prev.url;
      if (f.elements.project_id) f.elements.project_id.value = prev.project_id || '';
    }
    m.querySelectorAll('[data-review-form-title]').forEach((t) => {
      t.textContent = prev ? `Нова версія (v${prev.version + 1})` : 'Новий запит на погодження';
    });
    setTimeout(() => f.elements[prev ? 'description' : 'title']?.focus(), 30);
  }
  action('review-new', () => openForm(null));

  onSubmit('review', async (d) => {
    const title = (d.title || '').trim();
    const url = (d.url || '').trim();
    if (!title) return toast('Вкажи, що погоджуємо');
    if (!/^https:\/\//i.test(url)) return toast('Посилання на макет має починатися з https://');
    const row = {
      title: title.slice(0, 160), url, note: (d.description || '').trim().slice(0, 2000) || null,
      project_id: d.project_id || null,
    };
    if (base) Object.assign(row, { parent_id: base.id, version: Math.min(base.version + 1, 99) });
    const { data, error } = await sb.from('design_reviews').insert(row).select('id').single();
    if (error) throw error;
    modal.close();
    toast(base ? 'Нову версію надіслано' : 'Надіслано на погодження');
    tab = 'mine';
    syncTab();
    await load();
    openReview(data.id);
  });

  // ---------- деталі ----------
  function chain(r) {
    const out = [];
    for (let x = r; x; x = rows.find((y) => y.id === x.parent_id)) out.push(x);
    return out; // від новішої до старішої
  }
  function openReview(id) {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    current = r;
    const m = modal.open('review');
    if (!m) return;
    const set = (k, v) => m.querySelectorAll(`[data-review="${k}"]`).forEach((el) => { el.textContent = v; el.hidden = !v; });
    set('title', r.title);
    set('meta', [r.project?.name, `v${r.version}`, name(r.author), CRM.date(r.created_at)].filter(Boolean).join(' · '));
    set('note', r.note || '');
    set('decision', r.status === 'pending' ? '' : `${STATUS[r.status][0]}${r.reviewer ? ` · ${name(r.reviewer)}` : ''}${r.decision_note ? `: ${r.decision_note}` : ''}`);
    badge(m.querySelector('[data-review="status"]'), r.status, STATUS);
    const link = m.querySelector('[data-review-link]');
    if (link) { link.href = r.url; link.target = '_blank'; link.rel = 'noopener'; }
    const versions = chain(r);
    render('review-history', versions.slice(1).map((x) => ({
      ...x, version: `v${x.version}`, time: CRM.date(x.created_at), decision_note: x.decision_note || '',
    })), (el, x) => {
      badge(el.querySelector('[data-field="status"]'), x.status, STATUS);
      const a = el.querySelector('[data-review-history-link]') || (el.tagName === 'A' ? el : null);
      if (a) { a.href = x.url; a.target = '_blank'; a.rel = 'noopener'; }
    });
    m.querySelectorAll('[data-review-history]').forEach((b) => { b.hidden = versions.length < 2; });
    const decide = m.querySelector('[data-review-decide]');
    if (decide) { decide.hidden = !(canDecide && r.status === 'pending'); decide.querySelector('form')?.reset(); }
    const mineAndOpen = r.requested_by === me;
    const isLatest = !rows.some((x) => x.parent_id === r.id);
    m.querySelectorAll('[data-action="review-version"]').forEach((b) => { b.hidden = !(mineAndOpen && isLatest && r.status !== 'pending'); });
    m.querySelectorAll('[data-action="review-delete"]').forEach((b) => { b.hidden = !((mineAndOpen && r.status === 'pending') || can('pm,admin')); });
    history.replaceState(null, '', `${location.pathname}?id=${r.id}`);
  }
  action('review-open', (el) => openReview(el.closest('[data-id]')?.dataset.id));

  async function decide(decision) {
    if (!current) return;
    const ta = document.querySelector('[data-modal="review"] [data-form="review-decide"] [name="comment"]');
    const comment = (ta?.value || '').trim();
    if (decision === 'changes' && !comment) { ta?.focus(); return toast('Напиши, що змінити'); }
    const { error } = await sb.rpc('review_decide', { review: current.id, decision, comment: comment || null });
    if (error) return CRM.fail(error);
    toast(decision === 'approved' ? 'Погоджено' : 'Повернуто з коментарем');
    const id = current.id;
    await load();
    openReview(id);
  }
  action('review-approve', () => decide('approved'));
  action('review-changes', () => decide('changes'));
  onSubmit('review-decide', async () => {}); // Enter у полі коментаря нічого не відправляє

  // нова версія завжди продовжує останню в ланцюжку
  const latestOf = (r) => { let x = r; for (let n; (n = rows.find((y) => y.parent_id === x.id));) x = n; return x; };
  action('review-version', () => { const r = latestOf(current); modal.close(); openForm(r); });
  action('review-delete', async () => {
    if (!current || !confirm(`Видалити запит «${current.title}» (v${current.version})?`)) return;
    const { error } = await sb.from('design_reviews').delete().eq('id', current.id);
    if (error) return CRM.fail(error);
    modal.close();
    toast('Видалено');
    load();
  });

  // ---------- старт ----------
  if (can('admin')) {
    const { count } = await sb.from('profiles').select('id', { count: 'exact', head: true }).eq('is_art_director', true);
    root.querySelectorAll('[data-review-noad]').forEach((h) => { h.hidden = !!count; });
  }
  syncTab();
  await load();
  const openId = param('id');
  if (openId && rows.some((r) => r.id === openId)) {
    const r = rows.find((x) => x.id === openId);
    tab = r.status === 'pending' && canDecide ? 'pending' : inTab(r, 'mine') ? 'mine' : r.status;
    syncTab();
    draw();
    openReview(openId);
  }
});
