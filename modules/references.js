/* Gapsy CRM · modules/references.js — Референси (/references): бібліотека посилань для дизайнерів.
 * Лише посилання (без завантаження картинок): у картці домен, іконка сайту, назва, нотатка, теги.
 * Бачать і додають designer, pm, admin (RLS у 010). Видаляє автор або PM/admin.
 * Розмітка: [data-element="references"]
 *   пошук [data-refs-search] у формі data-form="refs-search"; теги data-list="ref-tags" (поле tag, клас is-active для обраного)
 *   картки data-list="refs" (поля title, host, note, author; [data-ref-icon] — іконка сайту фоном; data-tags — чипи тегів;
 *          дії ref-delete, ref-copy; уся картка — посилання на сайт)
 *   модалка data-modal="ref-new" з формою data-form="ref-new" (url, title, tags через кому, note) */
CRM.module('references', async (root, { sb, user, render, onSubmit, modal, toast, action, can, name }) => {
  const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return ''; } };
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);
  const tagsOf = (s) => [...new Set(String(s || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
  let all = [];
  let tag = null;
  let query = '';

  async function load() {
    const { data, error } = await sb.from('inspo_links')
      .select('id, url, title, note, tags, created_by, created_at, author:profiles!inspo_links_created_by_fkey(full_name, email)')
      .order('created_at', { ascending: false });
    if (error) return CRM.fail(error);
    all = data || [];
    draw();
  }

  function draw() {
    const q = query.toLowerCase();
    const rows = all.filter((r) => (!tag || r.tags.includes(tag))
      && (!q || [r.title, r.note, r.url, ...r.tags].some((v) => String(v || '').toLowerCase().includes(q))));
    render('refs', rows.map((r) => ({
      ...r, title: r.title || host(r.url), host: host(r.url), note: r.note || '', author: name(r.author),
    })), (el, r) => {
      el.dataset.id = r.id;
      const link = el.matches('a') ? el : el.querySelector('[data-ref-link]');
      if (link) { link.href = safeUrl(r.url) || '#'; link.target = '_blank'; link.rel = 'noopener'; }
      const icon = el.querySelector('[data-ref-icon]');
      if (icon && host(r.url)) icon.style.backgroundImage = `url("https://www.google.com/s2/favicons?domain=${encodeURIComponent(host(r.url))}&sz=64")`;
      el.querySelector('[data-field="note"]')?.toggleAttribute('hidden', !r.note);
      const tags = el.querySelector('[data-tags]');
      if (tags) {
        const tpl = tags.querySelector('[data-template]') || tags.firstElementChild;
        tags.querySelectorAll(':scope > :not([data-template])').forEach((n) => n.remove());
        r.tags.forEach((t) => {
          const chip = tpl ? tpl.cloneNode(true) : document.createElement('span');
          chip.removeAttribute('data-template');
          chip.textContent = `#${t}`;
          tags.appendChild(chip);
        });
      }
      el.querySelector('[data-action="ref-delete"]')?.toggleAttribute('hidden', !(r.created_by === user.id || can('pm,admin')));
    });
    // теги-фільтри
    const counts = {};
    all.forEach((r) => r.tags.forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
    const list = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 16);
    render('ref-tags', [{ tag: 'Усі', value: null }, ...list.map(([t]) => ({ tag: `#${t}`, value: t }))], (el, t) => {
      el.classList.toggle('is-active', t.value === tag);
      el.addEventListener('click', (e) => { e.preventDefault(); tag = t.value; draw(); });
    });
  }

  const search = root.querySelector('[data-refs-search]');
  search?.addEventListener('input', () => { query = search.value.trim(); draw(); });
  onSubmit('refs-search', async () => {}); // Enter не відправляє форму у Webflow

  onSubmit('ref-new', async (d, form) => {
    const url = (d.url || '').trim();
    if (!safeUrl(url)) return toast('Посилання має починатися з https://');
    if (all.some((r) => r.url === url)) return toast('Таке посилання вже є');
    const { error } = await sb.from('inspo_links').insert({
      url, title: (d.title || '').trim() || null, note: (d.note || '').trim() || null, tags: tagsOf(d.tags),
    });
    if (error) throw error;
    form.reset();
    modal.close();
    toast('Додано');
    load();
  });

  // вставили посилання в буфер і натиснули ⌘V на сторінці — одразу відкриваємо форму з ним
  document.addEventListener('paste', (e) => {
    if (e.target.closest('input, textarea, [contenteditable="true"]') || document.querySelector('.modal_wrapper.is-open')) return;
    const text = (e.clipboardData?.getData('text') || '').trim();
    if (!safeUrl(text)) return;
    const m = modal.open('ref-new');
    const f = m?.querySelector('[data-form="ref-new"]');
    if (f?.elements.url) { f.elements.url.value = text; f.elements.title?.focus(); }
  });

  action('ref-delete', async (el) => {
    const id = el.closest('[data-id]')?.dataset.id;
    if (!id || !confirm('Прибрати референс?')) return;
    const { error } = await sb.from('inspo_links').delete().eq('id', id);
    if (error) return CRM.fail(error);
    toast('Прибрано');
    load();
  });

  action('ref-copy', async (el) => {
    const r = all.find((x) => x.id === el.closest('[data-id]')?.dataset.id);
    if (!r) return;
    try { await navigator.clipboard.writeText(r.url); toast('Посилання скопійовано'); } catch (e) { toast(r.url); }
  });

  await load();
});
