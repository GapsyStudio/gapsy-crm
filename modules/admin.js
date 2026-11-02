/* Gapsy CRM · modules/admin.js — Адмінка (/admin, лише admin)
 * Розмітка: [data-element="admin"], списки users-pending / users, форма data-form="user" (модалка data-modal="user").
 * Зміна ролі й ClickUp task id — через RPC admin_update_user (перевірка ролі в базі). */
CRM.module('admin', (root, { sb, user, render, onSubmit, modal, toast, badge, action, name, time }) => {
  const ROLE = {
    pending: ['pending', 'is-yellow'], client: ['client', ''], designer: ['designer', 'is-blue'],
    developer: ['developer', 'is-blue'], pm: ['pm', 'is-green'], admin: ['admin', 'is-red'],
  };
  let people = [];
  let editId = null;

  async function load() {
    const { data, error } = await sb.from('profiles')
      .select('id, email, full_name, avatar_url, role, clickup_task_id, created_at')
      .order('created_at', { ascending: false });
    if (error) return CRM.fail(error);
    people = data;
    const rows = data.map((p) => ({
      ...p, name: name(p), clickup: p.clickup_task_id || '—', last_sign_in: time(p.created_at),
    }));
    const fill = (el, p) => {
      el.dataset.id = p.id;
      badge(el.querySelector('[data-field="role"]'), p.role, ROLE);
    };
    render('users-pending', rows.filter((p) => p.role === 'pending'), fill);
    render('users', rows.filter((p) => p.role !== 'pending'), fill);
  }

  action('edit-user', (el) => {
    const p = people.find((x) => x.id === el.closest('[data-id]')?.dataset.id);
    if (!p) return;
    editId = p.id;
    const m = modal.open('user');
    const title = m.querySelector('[data-user-title]');
    if (title) title.textContent = name(p);
    const f = m.querySelector('[data-form="user"]');
    f.elements.role.value = p.role === 'pending' ? 'designer' : p.role;
    f.elements.clickup_task_id.value = p.clickup_task_id || '';
  });

  onSubmit('user', async (d) => {
    if (editId === user.id && d.role !== 'admin' && !confirm('Ти знімаєш з себе роль admin. Продовжити?')) return;
    const { error } = await sb.rpc('admin_update_user', { user_id: editId, new_role: d.role, clickup: d.clickup_task_id || '' });
    if (error) throw error;
    modal.close();
    toast('Збережено');
    load();
  });

  load();
});
