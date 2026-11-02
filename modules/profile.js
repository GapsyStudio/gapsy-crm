/* Gapsy CRM · modules/profile.js — Профіль (/profile)
 * Розмітка: [data-element="profile"], форма data-form="profile" (поле full_name), [data-crm-avatar],
 * кнопка data-action="avatar-upload". Тема перемикається ядром ([data-theme-switch]). */
CRM.module('profile', (root, { sb, user, profile, onSubmit, toast, action, upload, bindUser }) => {
  const form = root.querySelector('[data-form="profile"]');
  if (form?.elements.full_name) form.elements.full_name.value = profile?.full_name || '';

  onSubmit('profile', async (d) => {
    const full_name = (d.full_name || '').trim() || null;
    // .select() повертає оновлений рядок: якщо RLS нічого не оновив, побачимо помилку, а не фальшиве «збережено»
    const { data, error } = await sb.from('profiles').update({ full_name }).eq('id', user.id).select('full_name').single();
    if (error) throw error;
    CRM.profile.full_name = data.full_name;
    bindUser();
    toast('Профіль збережено');
  });

  // Фото: публічний bucket avatars, папка = id користувача
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
  root.appendChild(input);
  action('avatar-upload', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast('Фото до 2 МБ');
    try {
      const url = await upload(file, 'avatar', 'avatars');
      const { error } = await sb.from('profiles').update({ avatar_url: url }).eq('id', user.id);
      if (error) throw error;
      CRM.profile.avatar_url = url;
      bindUser();
      toast('Фото оновлено');
    } catch (err) { CRM.fail(err); }
  });
});
