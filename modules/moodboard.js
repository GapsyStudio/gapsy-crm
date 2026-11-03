/* Gapsy CRM · modules/moodboard.js — Мудборд у картці проєкту (/project?id=<id>)
 * Розмітка: [data-element="moodboard"] усередині сторінки проєкту.
 *   [data-mood-drop]       — зона «перетягни / клікни / ⌘V» (картинки завантажуються одразу)
 *   data-list="moodboard"  — сітка; у шаблоні [data-mood-img] (img або блок з фоном) і [data-mood-link] (блок посилання),
 *                            поля title, host, author; дії mood-open (посилання на оригінал), mood-delete
 *   data-modal="mood-link" + форма data-form="mood-link" (url, title)
 *   [data-count="moodboard"] — лічильник
 * Права: усе робить уся команда (RLS). Файли — bucket media, папка moodboard/<uid>/. */
CRM.module('moodboard', (root, { sb, render, onSubmit, modal, toast, action, upload, signedUrls, name, param }) => {
  const projectId = param('id');
  if (!projectId) return;
  const IMG = /^image\/(png|jpe?g|webp|gif|avif)$/;
  const MAX = 10 * 1024 * 1024;
  const safeUrl = (u) => (u && /^https?:\/\//i.test(u) ? u : null);
  const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return ''; } };
  let items = [];

  async function load() {
    const { data, error } = await sb.from('moodboard_items')
      .select('id, kind, path, url, title, created_at, author:profiles!moodboard_items_created_by_fkey(full_name, email)')
      .eq('project_id', projectId).order('created_at', { ascending: false });
    if (error) return CRM.fail(error);
    const urls = await signedUrls(data.filter((i) => i.kind === 'image').map((i) => i.path));
    items = data.map((i) => ({ ...i, src: i.kind === 'image' ? urls[i.path] || '' : '', host: i.kind === 'link' ? host(i.url) : '' }));
    draw();
  }

  function draw() {
    render('moodboard', items.map((i) => ({ ...i, title: i.title || '', author: name(i.author) })), (el, i) => {
      el.dataset.id = i.id;
      const img = el.querySelector('[data-mood-img]');
      const link = el.querySelector('[data-mood-link]');
      if (img) {
        img.hidden = i.kind !== 'image';
        // [data-mood-img] — <img> або блок із фоном (Webflow не дозволяє data-field-src на Image)
        if (i.kind === 'image' && i.src) {
          if (img.tagName === 'IMG') { img.removeAttribute('srcset'); img.src = i.src; img.alt = i.title || 'Референс'; }
          else Object.assign(img.style, { backgroundImage: `url("${i.src}")`, backgroundSize: 'cover', backgroundPosition: 'center' });
        }
      }
      if (link) link.hidden = i.kind !== 'link';
      const open = el.querySelector('[data-action="mood-open"]') || (el.matches('a') ? el : null);
      const href = i.kind === 'image' ? i.src : safeUrl(i.url);
      if (open && href) { open.href = href; open.target = '_blank'; open.rel = 'noopener'; }
      const t = el.querySelector('[data-field="title"]');
      if (t) t.hidden = !i.title;
    });
    root.querySelectorAll('[data-count="moodboard"]').forEach((c) => { c.textContent = items.length; });
  }

  // ---------- картинки: клік, перетягування, ⌘V ----------
  const zone = root.querySelector('[data-mood-drop]');
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  root.appendChild(input);
  let busy = false;

  async function addImages(list) {
    const files = [...list].filter((f) => IMG.test(f.type) && f.size <= MAX);
    if (files.length < list.length) toast('Лише зображення до 10 МБ');
    if (!files.length || busy) return;
    busy = true;
    zone?.classList.add('is-active');
    try {
      const paths = await Promise.all(files.map((f) => upload(f, 'moodboard')));
      const { error } = await sb.from('moodboard_items').insert(paths.map((path, k) => ({
        project_id: projectId, kind: 'image', path, title: files[k].name.replace(/\.[^.]+$/, '').slice(0, 200) || null,
      })));
      if (error) throw error;
      toast(files.length > 1 ? `Додано референсів: ${files.length}` : 'Референс додано');
      load();
    } catch (err) { CRM.fail(err); } finally {
      busy = false;
      zone?.classList.remove('is-active');
    }
  }

  if (zone) {
    zone.tabIndex = 0;
    zone.setAttribute('role', 'button');
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-active'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-active'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('is-active'); addImages(e.dataTransfer.files); });
  }
  input.addEventListener('change', () => { addImages(input.files); input.value = ''; });
  // ⌘V картинки — лише коли не відкрита модалка й фокус не в полі вводу
  document.addEventListener('paste', (e) => {
    if (document.querySelector('[data-modal].is-open')) return;
    if (root.closest('[hidden]') || root.hidden) return; // мудборд на іншому табі — ⌘V не перехоплюємо
    if (e.target.closest?.('input, textarea, [contenteditable]')) return;
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); addImages(files); }
  });

  // ---------- посилання ----------
  onSubmit('mood-link', async (d, form) => {
    const url = safeUrl((d.url || '').trim());
    if (!url) return toast('Посилання має починатися з https://');
    const { error } = await sb.from('moodboard_items').insert({
      project_id: projectId, kind: 'link', url, title: (d.title || '').trim().slice(0, 200) || null,
    });
    if (error) throw error;
    form.reset();
    modal.close();
    toast('Посилання додано');
    load();
  });

  const byEl = (el) => items.find((i) => i.id === el.closest('[data-id]')?.dataset.id);

  action('mood-delete', async (el) => {
    const i = byEl(el);
    if (!i || !confirm('Прибрати референс з мудборду?')) return;
    const { error } = await sb.from('moodboard_items').delete().eq('id', i.id);
    if (error) return CRM.fail(error);
    // файл у Storage прибираємо, якщо він наш (інакше лишиться — RLS Storage дозволяє видалити лише автору/PM)
    if (i.kind === 'image') Promise.resolve().then(() => sb.storage.from('media').remove([i.path])).catch(() => {});
    items = items.filter((x) => x.id !== i.id);
    draw();
  });

  load();
});
