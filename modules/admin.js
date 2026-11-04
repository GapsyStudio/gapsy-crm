/* Gapsy CRM · modules/admin.js — Адмінка (/admin, лише admin)
 * Розмітка: [data-element="admin"], списки users-pending / users, форма data-form="user" (модалка data-modal="user").
 * Зміна ролі й ClickUp task id — через RPC admin_update_user (перевірка ролі в базі).
 * v0.12: чекбокс name="is_art_director" у формі user → RPC admin_set_art_director; у рядку поле [data-field="ad"] («Арт-директор»). */
CRM.module('admin', (root, { sb, user, render, onSubmit, modal, toast, badge, action, name, time }) => {
  const ROLE = {
    pending: ['pending', 'is-yellow'], client: ['client', ''], designer: ['designer', 'is-blue'],
    developer: ['developer', 'is-blue'], pm: ['pm', 'is-green'], admin: ['admin', 'is-red'],
  };
  let people = [];
  let editId = null;

  async function load() {
    const { data, error } = await sb.from('profiles')
      .select('id, email, full_name, avatar_url, role, clickup_task_id, created_at, is_art_director')
      .order('created_at', { ascending: false });
    if (error) return CRM.fail(error);
    people = data;
    const rows = data.map((p) => ({
      ...p, name: name(p), clickup: p.clickup_task_id || '—', last_sign_in: time(p.created_at),
      ad: p.is_art_director ? 'Арт-директор' : '',
    }));
    const fill = (el, p) => {
      el.dataset.id = p.id;
      const ad = el.querySelector('[data-field="ad"]');
      if (ad) ad.hidden = !p.is_art_director;
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
    if (f.elements.is_art_director) f.elements.is_art_director.checked = !!p.is_art_director;
  });

  onSubmit('user', async (d) => {
    if (editId === user.id && d.role !== 'admin' && !confirm('Ти знімаєш з себе роль admin. Продовжити?')) return;
    const { error } = await sb.rpc('admin_update_user', { user_id: editId, new_role: d.role, clickup: d.clickup_task_id || '' });
    if (error) throw error;
    const p = people.find((x) => x.id === editId);
    const ad = !!d.is_art_director;
    if (p && ad !== !!p.is_art_director) {
      const { error: e2 } = await sb.rpc('admin_set_art_director', { user_id: editId, flag: ad });
      if (e2) throw e2;
    }
    modal.close();
    toast('Збережено');
    load();
  });

  load();
});
