/* Gapsy CRM · modules/showcase.js — Showcase (/showcase)
 * Розмітка: [data-element="showcase"], таби data-tabs="category", списки showcase-best / showcase-all,
 * секція [data-showcase-best], форма data-form="showcase-item" з дропзоною data-dropzone="showcase-cover".
 * Додають і редагують PM/admin (RLS у Supabase). */
CRM.module('showcase', (root, { sb, render, onSubmit, modal, toast, badge, action, dropzone, upload, signedUrls, options }) => {
  const CAT = { site: ['Сайт', 'is-blue'], figma: ['Figma', 'is-yellow'], presentation: ['Презентація', 'is-green'], brand: ['Brand kit', 'is-red'] };
  let items = [];
  let tab = 'all';
  let editId = null;
  const cover = dropzone(root.querySelector('[data-dropzone="showcase-cover"]'), { multiple: false });

  async function load() {
    const { data, error } = await sb.from('showcase_items')
      .select('id, title, url, category, cover_path, is_best, project_id, project:projects(name)')
      .order('sort').order('created_at', { ascending: false });
    if (error) return CRM.fail(error);
    const urls = await signedUrls(data.map((i) => i.cover_path));
    items = data.map((i) => ({ ...i, project: i.project?.name || '', cover_url: urls[i.cover_path] || '' }));
    draw();
  }

  function fillCard(el, i) {
    badge(el.querySelector('[data-field="category"]'), i.category, CAT);
    el.dataset.id = i.id;
    const img = el.querySelector('[data-field-src]');
    if (img) img.alt = i.title;
  }

  function draw() {
    const list = items.filter((i) => tab === 'all' || i.category === tab);
    const best = list.filter((i) => i.is_best).slice(0, 5);
    render('showcase-best', best, fillCard);
    const bestSection = root.querySelector('[data-showcase-best]');
    if (bestSection) bestSection.hidden = !best.length;
    render('showcase-all', list, fillCard);
  }

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
    editId = i.id;
    const m = modal.open('showcase-item');
    const f = m.querySelector('[data-form="showcase-item"]');
    f.reset();
    cover.reset();
    f.elements.title.value = i.title;
    f.elements.url.value = i.url;
    f.elements.category.value = i.category;
    if (f.elements.is_best) f.elements.is_best.checked = i.is_best;
    await options('projects');
    setTimeout(() => { f.elements.project_id.value = i.project_id || ''; }, 0);
  });
  root.querySelector('[data-action="open:showcase-item"]')?.addEventListener('click', () => {
    editId = null;
    cover.reset();
    root.querySelector('[data-form="showcase-item"]')?.reset();
  });

  onSubmit('showcase-item', async (d, form) => {
    const row = {
      title: d.title.trim(), url: d.url.trim(), category: d.category,
      project_id: d.project_id || null, is_best: !!d.is_best,
    };
    if (cover.files[0]) row.cover_path = await upload(cover.files[0], 'showcase');
    const { error } = editId
      ? await sb.from('showcase_items').update(row).eq('id', editId)
      : await sb.from('showcase_items').insert(row);
    if (error) throw error;
    form.reset();
    cover.reset();
    modal.close();
    toast(editId ? 'Роботу оновлено' : 'Роботу додано');
    editId = null;
    load();
  });

  root.addEventListener('crm:tab', (e) => { tab = e.detail.value; draw(); });
  load();
});
