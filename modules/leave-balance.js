/* Gapsy CRM · modules/leave-balance.js — «Мій баланс» відпусток (v0.13). Працює на /leave і на /app.
 * Розмітка: [data-element="leave-balance"] (сітка карток) усередині секції, яку модуль показує, коли дані є.
 *   [data-balance="vacation|sick"] — скільки робочих днів лишилось (може бути з дробом: 11,5);
 *   [data-balance-sub="vacation|sick"] — «56 з 120 год · заплановано 16 год»;
 *   поза сіткою, у тій самій секції: [data-balance="updated"] — коли оновлено з ClickUp, [data-action="leave-sync"] — оновити.
 * Ліміт = власний з Адмінки → Time estimate задачі в ClickUp → правило (v0.14). Залишок = ліміт − затрекано в ClickUp − погоджене, але ще не внесене в ClickUp (leave_summary у Supabase).
 * Години з ClickUp оновлює Edge Function leave-sync (не частіше ніж раз на 10 хв). */
CRM.module('leave-balance', async (root, { sb, user, toast, action, time }) => {
  const section = root.closest('section') || root.parentElement || root;
  const $ = (s) => section.querySelector(s);
  const days = (h) => (Math.round((h / 8) * 10) / 10).toLocaleString('uk-UA');
  const hrs = (h) => `${(Math.round(h * 10) / 10).toLocaleString('uk-UA')} год`;
  let me = null;

  async function load() {
    const { data, error } = await sb.rpc('leave_summary');
    if (error) return CRM.fail(error);
    me = (data || []).find((r) => r.user_id === user.id) || null;
    draw();
    return me;
  }

  function draw() {
    if (!me) { section.hidden = true; return; }
    section.hidden = false;
    [['vacation', me.vacation_limit_h, me.vacation_used_h, me.vacation_planned_h], ['sick', me.sick_limit_h, me.sick_used_h, me.sick_planned_h]]
      .forEach(([k, limit, used, planned]) => {
        const left = Number(limit) - Number(used) - Number(planned);
        section.querySelectorAll(`[data-balance="${k}"]`).forEach((el) => {
          el.textContent = days(left);
          el.classList.toggle('text-color-error', left < 0);
          el.title = `${hrs(left)} із ${hrs(limit)}`;
        });
        section.querySelectorAll(`[data-balance-sub="${k}"]`).forEach((el) => {
          el.textContent = `робочих днів · використано ${hrs(used)} з ${hrs(limit)}${Number(planned) ? ` · заплановано ${hrs(planned)}` : ''}`;
        });
      });
    const upd = $('[data-balance="updated"]');
    if (upd) {
      upd.textContent = !me.synced_at ? 'Години з ClickUp ще не завантажені'
        : !me.matched ? 'Твоїх задач у ClickUp не знайдено (інша пошта?) — напиши admin'
          : `Години з ClickUp · оновлено ${time(me.synced_at)}`;
    }
  }

  async function sync(force) {
    const { data, error } = await sb.functions.invoke('leave-sync', { body: { force: !!force } });
    if (error || data?.error) {
      if (force) toast(data?.error || 'Не вдалося оновити з ClickUp');
      return null;
    }
    return data;
  }

  action('leave-sync', async (el) => {
    el.setAttribute('aria-busy', 'true');
    const r = await sync(true);
    el.removeAttribute('aria-busy');
    if (r) { toast(r.cached ? 'Дані вже свіжі' : 'Оновлено з ClickUp'); await load(); root.dispatchEvent(new CustomEvent('crm:leave-synced', { bubbles: true })); }
  });

  // картка «Очікують погодження» (на /app) — лише погоджувачу/admin
  const pendingCard = section.querySelector('[data-balance="pending-approvals"]')?.closest('[data-leave-approver]');
  if (pendingCard) {
    const approver = !!CRM.profile?.is_leave_approver || CRM.can('admin');
    pendingCard.hidden = !approver;
    if (approver) {
      const { count } = await sb.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      section.querySelectorAll('[data-balance="pending-approvals"]').forEach((el) => { el.textContent = String(count || 0); });
    }
  }

  await load();
  // автооновлення раз на 10 хв: функція сама відповість «cached», якщо дані свіжі
  if (!me?.synced_at || Date.now() - new Date(me.synced_at) > 10 * 60 * 1000) {
    const r = await sync(false);
    if (r && !r.cached) { await load(); root.dispatchEvent(new CustomEvent('crm:leave-synced', { bubbles: true })); }
  }
});
