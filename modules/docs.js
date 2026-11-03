/* Gapsy CRM · modules/docs.js — База знань (/docs)
 * Розмітка: [data-element="docs"]
 *   дерево:  data-list="docs-tree" (шаблон посилання + [data-template="children"]) — малює CRM.docsTree
 *   список:  data-list="docs-recent" (поля icon, title, meta), заголовок секції [data-docs-recent-title]
 *   пошук:   input [data-docs-search] у формі data-form="docs-search"
 *   розділи: data-list="docs-sections" — картка на кожен розділ верхнього рівня: [data-section-link] (поля icon, title),
 *            рядки сторінок [data-section-item] (поля icon, title) у [data-section-items], [data-section-more] «Усі сторінки»;
 *            обгортка [data-docs-sections-wrap] ховається під час пошуку
 *   дія:     doc-create (PM/admin) → новий документ одразу в режимі редагування */
CRM.module('docs', async (root, { sb, render, onSubmit, action, toast, time, crumbs }) => {
  crumbs('База знань');
  const title = root.querySelector('[data-docs-recent-title]');
  const input = root.querySelector('[data-docs-search]');

  const { data: all, error } = await sb.from('docs').select('id, parent_id, title, icon, sort, updated_at').order('sort');
  if (error) return CRM.fail(error);
  CRM.docsTree(all, null);

  // розділи як на головній Notion: картка розділу і його сторінки
  const SHOW = 8;
  const kidsOf = (pid) => all.filter((d) => d.parent_id === pid).sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
  render('docs-sections', kidsOf(null).map((d) => ({ ...d, icon: d.icon || '📄' })), (card, d) => {
    const head = card.querySelector('[data-section-link]');
    if (head) head.href = `/doc?id=${d.id}`;
    const box = card.querySelector('[data-section-items]');
    const tpl = box?.querySelector('[data-section-item]');
    const kids = kidsOf(d.id);
    if (box && tpl) {
      tpl.remove();
      kids.slice(0, SHOW).forEach((k) => {
        const row = tpl.cloneNode(true);
        CRM.fill(row, { title: k.title, icon: k.icon || '📄' });
        row.href = `/doc?id=${k.id}`;
        box.appendChild(row);
      });
      box.hidden = !kids.length;
    }
    const more = card.querySelector('[data-section-more]');
    if (more) {
      more.hidden = kids.length <= SHOW;
      more.href = `/doc?id=${d.id}`;
      more.textContent = `Усі сторінки (${kids.length}) →`;
    }
  });
  const sectionsWrap = root.querySelector('[data-docs-sections-wrap]');

  // нещодавно змінені
  const recent = () => {
    if (title) title.textContent = 'Нещодавно змінені';
    const rows = [...all].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 8);
    render('docs-recent', rows.map((d) => ({ ...d, icon: d.icon || '📄', meta: time(d.updated_at) })),
      (el, d) => { el.href = `/doc?id=${d.id}`; });
  };
  recent();

  // пошук: назва миттєво на клієнті + текст документів запитом до бази
  let timer;
  input?.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (sectionsWrap) sectionsWrap.hidden = q.length >= 2;
    if (q.length < 2) return recent();
    timer = setTimeout(async () => {
      const safe = q.replace(/[,()%*\\]/g, ' ').trim();
      const { data, error: err } = await sb.from('docs').select('id, title, icon, updated_at')
        .or(`title.ilike.%${safe}%,search_text.ilike.%${safe}%`).order('updated_at', { ascending: false }).limit(20);
      if (err) return CRM.fail(err);
      if (input.value.trim() !== q) return; // поки чекали, запит змінився
      if (title) title.textContent = `Знайдено: ${data.length}`;
      const lower = q.toLowerCase();
      data.sort((a, b) => b.title.toLowerCase().includes(lower) - a.title.toLowerCase().includes(lower));
      render('docs-recent', data.map((d) => ({ ...d, icon: d.icon || '📄', meta: time(d.updated_at) })),
        (el, d) => { el.href = `/doc?id=${d.id}`; });
    }, 250);
  });
  onSubmit('docs-search', async () => {}); // Enter не відправляє форму у Webflow

  action('doc-create', async () => {
    const { data, error: err } = await sb.from('docs')
      .insert({ title: 'Нова сторінка', sort: all.filter((d) => !d.parent_id).length })
      .select('id').single();
    if (err) return CRM.fail(err);
    toast('Документ створено');
    location.href = `/doc?id=${data.id}&edit=1`;
  });
});
