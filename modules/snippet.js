/* Gapsy CRM · modules/snippet.js — Один сніпет (/snippet?id=<id>)
 * Розмітка: [data-element="snippet"]
 *   поля:    [data-item="title|description|language|code|attributes|placement|demo_url|author|updated"], [data-tags]
 *   проєкти: data-list="snippet-projects" + форма data-form="snippet-project" (select name="project_id")
 *   модалка: data-modal="snippet" з формою data-form="snippet" (редагування)
 *   дії:     snippet-copy, snippet-edit, snippet-delete */
CRM.module('snippet', async (root, { sb, user, render, onSubmit, modal, toast, action, date, name, crumbs, param, can }) => {
  const id = param('id');
  if (!id) return location.replace('/snippets');

  const set = (k, v) => root.querySelectorAll(`[data-item="${k}"]`).forEach((el) => { el.textContent = v; });
  const safeUrl = (u) => (u && /^https?:\/\//i.test(u) ? u : null);
  let s = null;

  async function load() {
    const { data, error } = await sb.from('snippets')
      .select('*, author:profiles!snippets_created_by_fkey(full_name, email)')
      .eq('id', id).maybeSingle();
    if (error) return CRM.fail(error);
    if (!data) {
      toast('Сніпет не знайдено');
      return setTimeout(() => location.replace('/snippets'), 1200);
    }
    s = data;
    set('title', s.title);
    set('description', s.description || '');
    set('language', s.language);
    set('code', s.code);
    set('attributes', s.attributes || '—');
    set('placement', s.placement || '—');
    set('author', name(s.author));
    set('updated', date(s.updated_at));
    crumbs(`Сніпети / ${s.title}`);
    document.title = `${s.title} | Gapsy CRM`;

    const demo = root.querySelector('[data-item="demo_url"]');
    if (demo) {
      if (safeUrl(s.demo_url)) { demo.href = s.demo_url; demo.rel = 'noopener'; demo.closest('.meta_row')?.style.removeProperty('display'); }
      else demo.closest('.meta_row')?.style.setProperty('display', 'none');
    }
    const box = root.querySelector('[data-tags]');
    if (box) {
      box.textContent = '';
      (s.tags || []).forEach((t) => {
        const a = document.createElement('a');
        a.className = 'tag_chip';
        a.href = `/snippets#${encodeURIComponent(t)}`;
        a.textContent = t;
        box.appendChild(a);
      });
      if (!s.tags?.length) box.textContent = '—';
    }
    if (s.created_by !== user.id && !can('pm,admin')) root.querySelector('[data-action="snippet-delete"]')?.remove();
  }

  // ---------- копіювання ----------
  action('snippet-copy', async () => {
    try {
      await navigator.clipboard.writeText(s?.code || '');
      toast('Код скопійовано');
    } catch {
      // запасний варіант: виділяємо код, щоб скопіювати вручну
      const code = root.querySelector('[data-item="code"]');
      const r = document.createRange();
      r.selectNodeContents(code);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      toast('Натисни ⌘C, щоб скопіювати');
    }
  });

  // ---------- редагування ----------
  action('snippet-edit', () => {
    const m = modal.open('snippet');
    const form = m?.querySelector('[data-form="snippet"]');
    if (!form || !s) return;
    ['title', 'language', 'description', 'code', 'attributes', 'placement', 'demo_url']
      .forEach((k) => { if (form.elements[k]) form.elements[k].value = s[k] || ''; });
    if (form.elements.tags) form.elements.tags.value = (s.tags || []).join(', ');
  });

  onSubmit('snippet', async (d) => {
    const row = {
      title: d.title.trim(), language: d.language || 'js', code: d.code,
      description: d.description.trim() || null, attributes: (d.attributes || '').trim() || null,
      placement: d.placement.trim() || null, demo_url: d.demo_url.trim() || null,
      tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean), updated_by: user.id,
    };
    const { error } = await sb.from('snippets').update(row).eq('id', id);
    if (error) throw error;
    modal.close();
    toast('Сніпет оновлено');
    load();
  });

  action('snippet-delete', async () => {
    if (!confirm('Видалити сніпет? Звʼязки з проєктами теж зникнуть.')) return;
    const { error } = await sb.from('snippets').delete().eq('id', id);
    if (error) return CRM.fail(error);
    location.replace('/snippets');
  });

  // ---------- де використано ----------
  async function loadProjects() {
    const { data, error } = await sb.from('snippet_projects').select('project:projects(id, name)').eq('snippet_id', id);
    if (error) return CRM.fail(error);
    render('snippet-projects', data.map((r) => r.project).filter(Boolean), (el, p) => { el.href = `/project?id=${p.id}`; });
  }

  onSubmit('snippet-project', async (d, form) => {
    if (!d.project_id) return;
    const { error } = await sb.from('snippet_projects').insert({ snippet_id: id, project_id: d.project_id });
    if (error && error.code !== '23505') throw error;
    form.reset();
    loadProjects();
  });

  // селект проєктів поза модалкою — заповнюємо самі
  const sel = root.querySelector('[data-form="snippet-project"] select[data-options]');
  if (sel && !sel.dataset.filled) {
    sel.dataset.filled = '1';
    (await CRM.options('projects')).forEach(([v, t]) => sel.add(new Option(t, v)));
  }

  await load();
  loadProjects();
});
