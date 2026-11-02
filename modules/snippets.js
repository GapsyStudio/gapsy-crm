/* Gapsy CRM · modules/snippets.js — Бібліотека сніпетів (/snippets)
 * Розмітка: [data-element="snippets"]
 *   пошук:   input [data-snippet-search] (у формі data-form="snippet-search")
 *   теги:    data-list="snippet-tags" (статичний чип [data-tag=""] = «Усі» + шаблон чипа)
 *   картки:  data-list="snippets", у шаблоні [data-field="title|language|description|meta"], [data-tags]
 *   модалка: data-modal="snippet" з формою data-form="snippet" (створення; права — developer/pm/admin)
 * Фільтр працює на клієнті: сніпетів десятки, не тисячі. */
CRM.module('snippets', (root, { sb, render, onSubmit, modal, toast, time }) => {
  let all = [];
  let tag = decodeURIComponent(location.hash.slice(1)); // /snippets#GSAP — одразу фільтр за тегом
  let q = '';

  const tagsHtml = (box, tags) => {
    if (!box) return;
    box.textContent = '';
    (tags || []).forEach((t) => {
      const s = document.createElement('span');
      s.className = 'tag_chip';
      s.textContent = t;
      box.appendChild(s);
    });
  };

  async function load() {
    const { data, error } = await sb.from('snippets')
      .select('id, title, description, tags, language, updated_at')
      .order('updated_at', { ascending: false });
    if (error) return CRM.fail(error);
    all = data;
    drawTags();
    draw();
  }

  function drawTags() {
    const counts = {};
    all.forEach((s) => (s.tags || []).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
    const tags = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
    render('snippet-tags', tags.map((t) => ({ tag: t })), (el, t) => { el.dataset.tag = t.tag; });
    markTag();
  }

  function markTag() {
    root.querySelectorAll('[data-list="snippet-tags"] [data-tag]').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.tag === tag);
      el.setAttribute('aria-pressed', el.dataset.tag === tag);
    });
  }

  function draw() {
    const needle = q.toLowerCase();
    const rows = all.filter((s) =>
      (!tag || (s.tags || []).includes(tag)) &&
      (!needle || `${s.title} ${s.description || ''} ${(s.tags || []).join(' ')}`.toLowerCase().includes(needle)));
    render('snippets', rows.map((s) => ({
      ...s, description: s.description || '', meta: `Оновлено ${time(s.updated_at)}`,
    })), (el, s) => {
      el.href = `/snippet?id=${s.id}`;
      tagsHtml(el.querySelector('[data-tags]'), s.tags);
    });
  }

  // фільтр за тегом (делегування: чипи перемальовуються)
  root.querySelector('[data-list="snippet-tags"]')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-tag]');
    if (!chip) return;
    e.preventDefault();
    tag = chip.dataset.tag === tag ? '' : chip.dataset.tag;
    markTag();
    draw();
  });

  const search = root.querySelector('[data-snippet-search]');
  search?.addEventListener('input', () => { q = search.value.trim(); draw(); });
  onSubmit('snippet-search', async () => {}); // Enter не відправляє форму у Webflow

  onSubmit('snippet', async (d, form) => {
    const row = {
      title: d.title.trim(), language: d.language || 'js', code: d.code,
      description: d.description.trim() || null, attributes: (d.attributes || '').trim() || null,
      placement: d.placement.trim() || null, demo_url: d.demo_url.trim() || null,
      tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    const { data, error } = await sb.from('snippets').insert(row).select('id').single();
    if (error) throw error;
    form.reset();
    modal.close();
    toast('Сніпет додано');
    location.href = `/snippet?id=${data.id}`;
  });

  load();
});
