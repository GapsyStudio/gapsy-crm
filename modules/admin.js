/* Gapsy CRM · modules/admin.js — Адмінка (/admin, лише admin)
 * Розмітка: [data-element="admin"], списки users-pending / users, форма data-form="user" (модалка data-modal="user").
 * Зміна ролі й ClickUp task id — через RPC admin_update_user (перевірка ролі в базі).
 * v0.13: поля hired_on (date), clickup_email, leave_vacation_hours, leave_sick_hours (порожньо = Time estimate задачі в ClickUp, якщо його немає — 120 / 40 + 8 за рік), чекбокс is_leave_approver → RPC admin_set_leave.
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
      .select('id, email, full_name, avatar_url, role, clickup_task_id, created_at, is_art_director, hired_on, clickup_email, leave_vacation_hours, leave_sick_hours, is_leave_approver')
      .order('created_at', { ascending: false });
    if (error) return CRM.fail(error);
    people = data;
    const rows = data.map((p) => ({
      ...p, name: name(p), clickup: p.clickup_task_id || '—', last_sign_in: time(p.created_at),
      ad: [p.is_art_director && 'Арт-директор', p.is_leave_approver && 'Погоджує відпустки'].filter(Boolean).join(' · '),
    }));
    const fill = (el, p) => {
      el.dataset.id = p.id;
      const ad = el.querySelector('[data-field="ad"]');
      if (ad) ad.hidden = !(p.is_art_director || p.is_leave_approver);
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
    // v0.13 відпустки
    const set = (k, v) => { if (f.elements[k]) f.elements[k].value = v ?? ''; };
    set('hired_on', p.hired_on); set('clickup_email', p.clickup_email);
    set('leave_vacation_hours', p.leave_vacation_hours); set('leave_sick_hours', p.leave_sick_hours);
    if (f.elements.is_leave_approver) f.elements.is_leave_approver.checked = !!p.is_leave_approver;
  });

  onSubmit('user', async (d, f) => {
    if (editId === user.id && d.role !== 'admin' && !confirm('Ти знімаєш з себе роль admin. Продовжити?')) return;
    const { error } = await sb.rpc('admin_update_user', { user_id: editId, new_role: d.role, clickup: d.clickup_task_id || '' });
    if (error) throw error;
    const p = people.find((x) => x.id === editId);
    const ad = !!d.is_art_director;
    if (p && ad !== !!p.is_art_director) {
      const { error: e2 } = await sb.rpc('admin_set_art_director', { user_id: editId, flag: ad });
      if (e2) throw e2;
    }
    // v0.13 відпустки: дата початку роботи, власні ліміти (порожньо = за правилами), пошта в ClickUp, погоджувач
    if (f.elements.hired_on || f.elements.is_leave_approver) {
      const num = (v) => (v === '' || v == null ? null : Math.max(0, Math.round(Number(v))));
      const { error: e3 } = await sb.rpc('admin_set_leave', {
        user_id: editId, hired: d.hired_on || null, vacation_hours: num(d.leave_vacation_hours), sick_hours: num(d.leave_sick_hours),
        approver: !!d.is_leave_approver, cu_email: (d.clickup_email || '').trim() || null,
      });
      if (e3) throw e3;
    }
    modal.close();
    toast('Збережено');
    load();
  });

  load();
});
