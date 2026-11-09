/* Gapsy CRM · modules/showcase.js — Showcase (/showcase)
 * Розмітка: [data-element="showcase"], таби data-tabs="category", списки showcase-best / showcase-all,
 * секція [data-showcase-best], форма data-form="showcase-item" з дропзоною data-dropzone="showcase-cover".
 * Додають і редагують PM/admin (RLS у Supabase).
 * v0.11: у модалці кнопка data-action="showcase-delete" (видна лише при редагуванні).
 * v0.12: пропозиції від команди. Кнопка data-action="showcase-propose" (для всіх, у кого немає права додавати) відкриває
 *   ту саму модалку; запис іде зі status='proposed' (поле is_best ховається — [data-showcase-best-field]).
 *   Секція [data-showcase-proposed] + список data-list="showcase-proposed" (поля title, category, who, status, review_note;
 *   дії showcase-publish / showcase-reject — PM/admin, showcase-withdraw — автор). PM/admin бачать усі пропозиції, автор — свої.
 * v0.14: категорії з таблиці showcase_categories. Таби будуються з першого [data-tab="all"] (лише категорії з роботами);
 *   select name="category" у формі заповнюється з довідника. Модалка data-modal="showcase-cats" (кнопка open:showcase-cats, PM/admin):
 *   список data-list="showcase-cats" (поля label — бейдж, count; дії cat-rename, cat-color, cat-delete) і форма data-form="showcase-cat" (label). */
CRM.module('showcase', async (root, { sb, render, onSubmit, modal, toast, badge, action, dropzone, upload, signedUrls, options, can, name }) => {
  // v0.20: Showcase — свіжі роботи; оформлені кейси для пропозицій — у «Кейсах» (Sales, PM, admin)
  if (can('sales,pm,admin') && !root.querySelector('[data-to-cases]')) {
    const a = document.createElement('a');
    a.href = '/cases'; a.className = 'button is-text is-small'; a.dataset.toCases = ''; a.textContent = 'Кейси для пропозицій →';
    const actions = root.querySelector('.page_header .page_actions');
    if (actions) actions.prepend(a); else root.querySelector('.page_header')?.append(a);
  }
  const isManager = can('pm,admin');
  const STATUS = { proposed: ['На розгляді', 'is-yellow'], rejected: ['Відхилено', 'is-red'] };
  let proposing = false; // модалка відкрита як «Запропонувати»
  let proposals = [];
  // v0.14: категорії з таблиці showcase_categories (PM/admin керують у модалці «Категорії»)
  let CAT = {};
  let cats = [];
  let items = [];
  let tab = 'all';
  let editId = null;
  const cover = dropzone(root.querySelector('[data-dropzone="showcase-cover"]'), { multiple: false });

  async function loadCats() {
    const { data, error } = await sb.from('showcase_categories').select('slug, label, color, sort').order('sort').order('label');
    if (error) return CRM.fail(error);
    cats = data || [];
    CAT = Object.fromEntries(cats.map((c) => [c.slug, [c.label, c.color || '']]));
    // select у модалці роботи: повністю з довідника (статичні опції Webflow прибираємо)
    document.querySelectorAll('[data-form="showcase-item"] select[name="category"]').forEach((sel) => {
      const keep = sel.value;
      sel.innerHTML = '';
      cats.forEach((c) => sel.add(new Option(c.label, c.slug)));
      if (CAT[keep]) sel.value = keep;
    });
  }

  // таби: «Усі» + усі категорії (v0.15: і порожні теж; ряд гортається горизонтально — клас .tabs.is-scroll)
  function drawTabs() {
    const g = root.querySelector('[data-tabs="category"]');
    if (!g) return;
    const all = g.querySelector('[data-tab="all"]') || g.querySelector('[data-tab]');
    if (!all) return;
    g.classList.add('is-scroll');
    g.querySelectorAll('[data-tab]').forEach((t) => { if (t !== all) t.remove(); });
    const count = {};
    items.forEach((i) => { count[i.category] = (count[i.category] || 0) + 1; });
    const setCount = (t, n) => { const c = t.querySelector('[data-tab-count]'); if (c) { c.textContent = n; c.hidden = false; } };
    setCount(all, items.length);
    cats.forEach((c) => {
      const t = all.cloneNode(true);
      t.dataset.tab = c.slug;
      t.classList.remove('is-active', 'w--current');
      t.classList.toggle('is-empty', !count[c.slug]);
      t.setAttribute('aria-selected', 'false');
      const label = t.querySelector('[data-tab-label]') || t;
      label.textContent = c.label;
      setCount(t, count[c.slug] || 0);
      g.appendChild(t);
    });
    if (!g.querySelector(`[data-tab="${CSS.escape(tab)}"]`)) tab = 'all';
    g.querySelectorAll('[data-tab]').forEach((t) => { const on = t.dataset.tab === tab; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', on); });
  }

  async function load() {
    const { data, error } = await sb.from('showcase_items')
      .select('id, title, url, category, cover_path, is_best, project_id, status, review_note, created_by, project:projects(name), author:profiles!showcase_items_created_by_fkey(full_name, email)')
      .order('sort').order('created_at', { ascending: false });
    if (error) return CRM.fail(error);
    const urls = await signedUrls(data.map((i) => i.cover_path));
    const all = data.map((i) => ({ ...i, project: i.project?.name || '', cover_url: urls[i.cover_path] || '' }));
    items = all.filter((i) => (i.status || 'published') === 'published');
    // RLS віддає пропозиції лише автору й PM/admin; PM не бачить чужих відхилених — вони вже вирішені
    proposals = all.filter((i) => i.status === 'proposed' || (i.status === 'rejected' && i.created_by === CRM.user?.id));
    drawProposals();
    drawTabs();
    draw();
    drawCats();
  }

  // ---------- v0.14: керування категоріями (модалка data-modal="showcase-cats", лише PM/admin) ----------
  const COLORS = ['is-blue', 'is-green', 'is-yellow', 'is-red', ''];
  const TR = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'yu', я: 'ya', ʼ: '', "'": '' };
  const slugify = (s) => String(s).toLowerCase().split('').map((ch) => TR[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || `cat-${Date.now().toString(36)}`;
  function drawCats() {
    const count = {};
    items.concat(proposals).forEach((i) => { count[i.category] = (count[i.category] || 0) + 1; });
    render('showcase-cats', cats.map((c) => ({ ...c, count: count[c.slug] ? `${count[c.slug]} ${count[c.slug] === 1 ? 'робота' : count[c.slug] < 5 ? 'роботи' : 'робіт'}` : 'порожньо' })), (el, c) => {
      el.dataset.id = c.slug;
      badge(el.querySelector('[data-field="label"]'), c.slug, CAT);
      el.querySelector('[data-action="cat-delete"]')?.toggleAttribute('hidden', cats.length < 2);
    });
  }
  const catOf = (el) => cats.find((c) => c.slug === el.closest('[data-id]')?.dataset.id);
  onSubmit('showcase-cat', async (d, f) => {
    const label = (d.label || '').trim().slice(0, 40);
    if (!label) return toast('Вкажи назву категорії');
    if (cats.some((c) => c.label.toLowerCase() === label.toLowerCase())) return toast('Така категорія вже є');
    let slug = slugify(label);
    while (CAT[slug]) slug = `${slug.slice(0, 36)}-${Math.random().toString(36).slice(2, 4)}`;
    const color = COLORS[cats.length % 4];
    const sort = (Math.max(0, ...cats.map((c) => c.sort)) || 0) + 10;
    const { error } = await sb.from('showcase_categories').insert({ slug, label, color, sort });
    if (error) throw error;
    f.reset();
    toast('Категорію додано');
    await loadCats(); drawTabs(); drawCats(); draw();
  });
  action('cat-rename', async (el) => {
    const c = catOf(el);
    if (!c) return;
    const label = prompt('Нова назва категорії', c.label);
    if (label == null || !label.trim() || label.trim() === c.label) return;
    const { error } = await sb.from('showcase_categories').update({ label: label.trim().slice(0, 40) }).eq('slug', c.slug);
    if (error) return CRM.fail(error);
    await loadCats(); drawTabs(); drawCats(); draw(); drawProposals();
  });
  action('cat-color', async (el) => {
    const c = catOf(el);
    if (!c) return;
    const color = COLORS[(COLORS.indexOf(c.color) + 1) % COLORS.length];
    const { error } = await sb.from('showcase_categories').update({ color }).eq('slug', c.slug);
    if (error) return CRM.fail(error);
    await loadCats(); drawCats(); draw(); drawProposals();
  });
  action('cat-delete', async (el) => {
    const c = catOf(el);
    if (!c) return;
    const rest = cats.filter((x) => x.slug !== c.slug);
    const n = items.concat(proposals).filter((i) => i.category === c.slug).length;
    if (!confirm(n ? `Видалити «${c.label}»? ${n} — перейдуть у «${rest[0].label}».` : `Видалити категорію «${c.label}»?`)) return;
    const { error } = await sb.rpc('showcase_category_delete', { cat: c.slug, move_to: rest[0].slug });
    if (error) return CRM.fail(error);
    if (tab === c.slug) tab = 'all';
    toast('Категорію видалено');
    await loadCats();
    load();
  });

  function fillCard(el, i) {
    badge(el.querySelector('[data-field="category"]'), i.category, CAT);
    el.dataset.id = i.id;
    // Webflow не дозволяє data-field-src на Image, тому обкладинку ставимо явно
    const img = el.querySelector('[data-field-src]') || el.querySelector('img');
    if (img) {
      img.alt = i.title;
      // v0.20.1: без обкладинки — не «бита» картинка з alt, а плашка з доменом (стилі .crm-nocover у Head)
      let ph = img.previousElementSibling?.classList.contains('crm-nocover') ? img.previousElementSibling : null;
      if (i.cover_url) { img.removeAttribute('srcset'); img.src = i.cover_url; img.hidden = false; ph?.remove(); }
      else {
        let host = '';
        try { host = new URL(i.url).hostname.replace(/^www\./, ''); } catch (e) { /* без url */ }
        if (!ph) { ph = document.createElement('div'); ph.className = 'crm-nocover'; ph.setAttribute('aria-hidden', 'true'); img.before(ph); }
        ph.textContent = host || i.title;
        img.hidden = true;
      }
    }
  }

  function draw() {
    const list = items.filter((i) => tab === 'all' || i.category === tab);
    const best = list.filter((i) => i.is_best).slice(0, 5);
    render('showcase-best', best, fillCard);
    const bestSection = root.querySelector('[data-showcase-best]');
    if (bestSection) bestSection.hidden = !best.length;
    render('showcase-all', list, fillCard);
  }

  function drawProposals() {
    const box = root.querySelector('[data-showcase-proposed]');
    if (box) box.hidden = !proposals.length;
    render('showcase-proposed', proposals.map((i) => ({
      ...i, who: name(i.author), review_note: i.review_note ? `Коментар: ${i.review_note}` : '',
    })), (el, i) => {
      el.dataset.id = i.id;
      badge(el.querySelector('[data-field="category"]'), i.category, CAT);
      badge(el.querySelector('[data-field="status"]'), i.status, STATUS);
      const link = el.querySelector('[data-proposal-link]');
      if (link && /^https?:\/\//.test(i.url)) { link.href = i.url; link.target = '_blank'; link.rel = 'noopener'; }
      const note = el.querySelector('[data-field="review_note"]');
      if (note) note.hidden = !i.review_note;
      el.querySelectorAll('[data-action="showcase-publish"], [data-action="showcase-reject"]').forEach((b) => { b.hidden = !isManager || i.status !== 'proposed'; });
      const w = el.querySelector('[data-action="showcase-withdraw"]');
      if (w) w.hidden = i.created_by !== CRM.user?.id;
    });
  }
  const byProposal = (el) => proposals.find((i) => i.id === el.closest('[data-id]')?.dataset.id);
  action('showcase-publish', async (el) => {
    const i = byProposal(el);
    if (!i) return;
    const { error } = await sb.from('showcase_items').update({ status: 'published', review_note: null }).eq('id', i.id);
    if (error) return CRM.fail(error);
    toast('Опубліковано в Showcase');
    load();
  });
  action('showcase-reject', async (el) => {
    const i = byProposal(el);
    if (!i) return;
    const note = prompt(`Чому відхиляємо «${i.title}»? Автор побачить цей коментар.`);
    if (note === null) return;
    if (!note.trim()) return toast('Напиши коротко причину');
    const { error } = await sb.from('showcase_items').update({ status: 'rejected', review_note: note.trim().slice(0, 1000) }).eq('id', i.id);
    if (error) return CRM.fail(error);
    toast('Пропозицію відхилено');
    load();
  });
  action('showcase-withdraw', async (el) => {
    const i = byProposal(el);
    if (!i || !confirm(`Прибрати пропозицію «${i.title}»?`)) return;
    const { error } = await sb.from('showcase_items').delete().eq('id', i.id);
    if (error) return CRM.fail(error);
    CRM.removeFiles([i.cover_path]);
    toast('Пропозицію прибрано');
    load();
  });

  const byEl = (el) => items.find((i) => i.id === el.closest('[data-id]')?.dataset.id);

  action('copy-link', async (el) => {
    const i = byEl(el);
    if (!i) return;
    await navigator.clipboard.writeText(i.url);
    toast('Посилання скопійовано');
  });

  action('edit', async (el) => {
    const i = byEl(el);
    if (!i) return;
    setProposing(false);
    editId = i.id;
    const m = modal.open('showcase-item');
    const f = m.querySelector('[data-form="showcase-item"]');
    f.reset();
    cover.reset();
    f.elements.title.value = i.title;
    f.elements.url.value = i.url;
    if (f.elements.category && ![...f.elements.category.options].some((o) => o.value === i.category)) await loadCats();
    f.elements.category.value = i.category;
    if (f.elements.is_best) f.elements.is_best.checked = i.is_best;
    await options('projects');
    setTimeout(() => { f.elements.project_id.value = i.project_id || ''; }, 0);
    const del = m.querySelector('[data-action="showcase-delete"]');
    if (del) del.hidden = false;
  });

  // v0.11: видалення роботи (кнопка data-action="showcase-delete" у модалці, лише при редагуванні; RLS — PM/admin)
  action('showcase-delete', async () => {
    const i = items.find((x) => x.id === editId);
    if (!i || !confirm(`Прибрати «${i.title}» з Showcase?`)) return;
    const { error } = await sb.from('showcase_items').delete().eq('id', i.id);
    if (error) return CRM.fail(error);
    CRM.removeFiles([i.cover_path]);
    modal.close();
    editId = null;
    toast('Прибрано з Showcase');
    load();
  });
  const setProposing = (on) => {
    proposing = on;
    const m = document.querySelector('[data-modal="showcase-item"]');
    m?.querySelectorAll('[data-showcase-best-field]').forEach((x) => { x.hidden = on; });
    m?.querySelectorAll('[data-showcase-modal-title]').forEach((t) => { t.textContent = on ? 'Запропонувати роботу' : 'Робота в Showcase'; });
  };
  action('showcase-propose', () => {
    editId = null;
    cover.reset();
    root.querySelector('[data-form="showcase-item"]')?.reset();
    const del = document.querySelector('[data-modal="showcase-item"] [data-action="showcase-delete"]');
    if (del) del.hidden = true;
    setProposing(true);
    modal.open('showcase-item');
  });
  root.querySelector('[data-action="open:showcase-item"]')?.addEventListener('click', () => {
    setProposing(false);
    editId = null;
    cover.reset();
    root.querySelector('[data-form="showcase-item"]')?.reset();
    const del = document.querySelector('[data-modal="showcase-item"] [data-action="showcase-delete"]');
    if (del) del.hidden = true;
  });

  onSubmit('showcase-item', async (d, form) => {
    const row = {
      title: d.title.trim(), url: d.url.trim(), category: d.category,
      project_id: d.project_id || null, is_best: proposing ? false : !!d.is_best,
    };
    if (!/^https?:\/\//i.test(row.url)) return toast('Посилання має починатися з https://');
    if (proposing && !editId) row.status = 'proposed';
    if (cover.files[0]) row.cover_path = await upload(cover.files[0], 'showcase');
    const { error } = editId
      ? await sb.from('showcase_items').update(row).eq('id', editId)
      : await sb.from('showcase_items').insert(row);
    if (error) throw error;
    form.reset();
    cover.reset();
    modal.close();
    toast(editId ? 'Роботу оновлено' : proposing ? 'Дякуємо! PM подивиться пропозицію' : 'Роботу додано');
    setProposing(false);
    editId = null;
    load();
  });

  root.addEventListener('crm:tab', (e) => { if (e.detail.group === 'category') { tab = e.detail.value; draw(); } });
  await loadCats();
  await load();
  if (location.hash === '#proposed') root.querySelector('[data-showcase-proposed]')?.scrollIntoView({ block: 'start' });
});
