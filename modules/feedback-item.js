/* Gapsy CRM · modules/feedback-item.js — Одна правка (/feedback-item?id=<id>)
 * Розмітка: [data-element="feedback-item"], поля [data-item="title|description|project|author|assignee|page_url|created"],
 * перемикач [data-status-switch] > [data-status], скріни data-list="feedback-files" (+ модалка data-modal="image"),
 * коментарі data-list="comments" + форма data-form="comment", дія data-action="feedback-delete". */
CRM.module('feedback-item', async (root, { sb, user, render, onSubmit, modal, toast, action, signedUrls, time, date, name, crumbs, param, can }) => {
  const id = param('id');
  const set = (k, v) => root.querySelectorAll(`[data-item="${k}"]`).forEach((el) => { el.textContent = v; });
  if (!id) return location.replace('/feedback');

  const { data: f, error } = await sb.from('feedback')
    .select(`id, title, description, page_url, status, created_at, author_id,
      project:projects(id, name),
      author:profiles!feedback_author_id_fkey(full_name, email),
      assignee:profiles!feedback_assignee_id_fkey(full_name, email)`)
    .eq('id', id).maybeSingle();
  if (error) return CRM.fail(error);
  if (!f) {
    toast('Правку не знайдено');
    return setTimeout(() => location.replace('/feedback'), 1200);
  }

  // ---------- шапка й метадані ----------
  set('title', f.title);
  crumbs(`Правки / ${f.title}`);
  document.title = `${f.title} | Gapsy CRM`;
  set('description', f.description || 'Без опису');
  set('project', f.project?.name || '—');
  set('author', name(f.author));
  set('assignee', f.assignee ? name(f.assignee) : 'Не призначено');
  set('created', date(f.created_at));
  const link = root.querySelector('[data-item="page_url"]');
  if (link) {
    if (f.page_url) link.href = f.page_url;
    else link.parentElement.hidden = true;
  }
  if (f.author_id !== user.id && !can('pm,admin')) root.querySelector('[data-action="feedback-delete"]')?.remove();

  // ---------- статус ----------
  const markStatus = (s) => root.querySelectorAll('[data-status-switch] [data-status]').forEach((o) => {
    o.classList.toggle('is-active', o.dataset.status === s);
    o.setAttribute('aria-pressed', o.dataset.status === s);
  });
  markStatus(f.status);
  root.querySelectorAll('[data-status-switch] [data-status]').forEach((o) => o.addEventListener('click', async (e) => {
    e.preventDefault();
    const s = o.dataset.status;
    if (s === f.status) return;
    markStatus(s);
    const { error: err } = await sb.from('feedback').update({ status: s }).eq('id', id);
    if (err) { markStatus(f.status); return CRM.fail(err); }
    f.status = s;
    toast(`Статус: ${o.textContent.trim()}`);
  }));

  // ---------- скріни ----------
  const { data: files } = await sb.from('feedback_files').select('id, path').eq('feedback_id', id).order('created_at');
  const urls = await signedUrls((files || []).map((x) => x.path));
  render('feedback-files', (files || []).map((x) => ({ ...x, url: urls[x.path] || '' })), (el, x) => {
    el.href = x.url;
    el.dataset.url = x.url;
  });
  action('open-image', (el) => {
    const m = modal.open('image');
    const img = m?.querySelector('[data-lightbox-img]');
    if (img) { img.removeAttribute('srcset'); img.src = el.dataset.url; }
  });

  // ---------- коментарі ----------
  async function loadComments() {
    const { data, error: err } = await sb.from('feedback_comments')
      .select('id, body, created_at, author:profiles!feedback_comments_author_id_fkey(full_name, email, avatar_url)')
      .eq('feedback_id', id).order('created_at');
    if (err) return CRM.fail(err);
    render('comments', data.map((c) => ({ ...c, author: name(c.author), time: time(c.created_at), avatar: c.author?.avatar_url })));
  }
  onSubmit('comment', async (d, form) => {
    const body = d.body.trim();
    if (!body) return;
    const { error: err } = await sb.from('feedback_comments').insert({ feedback_id: id, body });
    if (err) throw err;
    form.reset();
    loadComments();
  });
  loadComments();

  // ---------- видалення ----------
  action('feedback-delete', async () => {
    if (!confirm('Видалити правку разом зі скрінами й коментарями?')) return;
    const { error: err } = await sb.from('feedback').delete().eq('id', id);
    if (err) return CRM.fail(err);
    // simplified: файли в Storage лишаються; прибирання — окремою задачею, коли знадобиться
    location.replace('/feedback');
  });
});
