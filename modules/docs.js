/* Gapsy CRM · modules/docs.js — База знань (/docs)
 * Розмітка: [data-element="docs"]
 *   дерево:  data-list="docs-tree" (шаблон посилання + [data-template="children"]) — малює CRM.docsTree
 *   список:  data-list="docs-recent" (поля icon, title, meta), заголовок секції [data-docs-recent-title]
 *   пошук:   input [data-docs-search] у формі data-form="docs-search"
 *   дія:     doc-create (PM/admin) → новий документ одразу в режимі редагування */
CRM.module('docs', async (root, { sb, render, onSubmit, action, toast, time, crumbs }) => {
  crumbs('База знань');
  const title = root.querySelector('[data-docs-recent-title]');
  const input = root.querySelector('[data-docs-search]');

  const { data: all, error } = await sb.from('docs').select('id, parent_id, title, icon, sort, updated_at').order('sort');
  if (error) return CRM.fail(error);
  CRM.docsTree(all, null);

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
