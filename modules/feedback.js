/* Gapsy CRM · modules/feedback.js — Правки (/feedback, /feedback?project=<id>)
 * Розмітка: [data-element="feedback"], таби data-tabs="status", список data-list="feedback",
 * форма data-form="feedback-new" з дропзоною data-dropzone="feedback" і прев'ю [data-upload-previews]. */
CRM.module('feedback', (root, { sb, user, render, onSubmit, modal, toast, badge, time, dropzone, upload, param, name, crumbs }) => {
  const STATUS = { new: ['New', 'is-blue'], in_progress: ['In Progress', 'is-yellow'], resolved: ['Resolved', 'is-green'] };
  const projectId = param('project');
  let rows = [];
  let tab = 'open';
  const shots = dropzone(root.querySelector('[data-dropzone="feedback"]'));

  async function load() {
    let q = sb.from('feedback')
      .select(`id, title, status, created_at, author_id, assignee_id,
        project:projects(id, name),
        assignee:profiles!feedback_assignee_id_fkey(full_name, email),
        feedback_files(count)`)
      .order('created_at', { ascending: false })
      .limit(200); // simplified: без пагінації; додати, коли правок стане > 200
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q;
    if (error) return CRM.fail(error);
    rows = data;
    if (projectId && data[0]?.project) crumbs(`Правки · ${data[0].project.name}`);
    draw();
  }

  function draw() {
    const list = rows.filter((f) =>
      tab === 'open' ? f.status !== 'resolved'
        : tab === 'mine' ? f.author_id === user.id || f.assignee_id === user.id
          : f.status === tab);
    render('feedback', list.map((f) => ({
      ...f,
      project: f.project?.name || '—',
      assignee: f.assignee ? name(f.assignee) : 'Не призначено',
      files: `📎 ${f.feedback_files?.[0]?.count || 0}`,
      time: time(f.created_at),
    })), (el, f) => {
      el.href = `/feedback-item?id=${f.id}`;
      badge(el.querySelector('[data-field="status"]'), f.status, STATUS);
    });
  }

  // Нова правка: якщо відкрито з фільтром проєкту — підставляємо його
  root.addEventListener('crm:open', async () => {
    if (!projectId) return;
    await CRM.options('projects');
    setTimeout(() => {
      const sel = root.querySelector('[data-form="feedback-new"] [name="project_id"]');
      if (sel) sel.value = projectId;
    }, 0);
  });

  onSubmit('feedback-new', async (d, form) => {
    const { data: item, error } = await sb.from('feedback').insert({
      title: d.title.trim(),
      project_id: d.project_id || null,
      assignee_id: d.assignee_id || null,
      page_url: d.page_url.trim() || null,
      description: d.description.trim() || null,
    }).select('id').single();
    if (error) throw error;
    if (shots.files.length) {
      const paths = await Promise.all(shots.files.map((f) => upload(f, `feedback/${item.id}`)));
      const { error: e2 } = await sb.from('feedback_files').insert(paths.map((path) => ({ feedback_id: item.id, path })));
      if (e2) throw e2;
    }
    form.reset();
    shots.reset();
    modal.close();
    toast('Правку створено');
    load();
  });

  root.addEventListener('crm:tab', (e) => { tab = e.detail.value; draw(); });
  load();
});
