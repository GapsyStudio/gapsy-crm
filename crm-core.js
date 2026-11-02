/* =====================================================================
 * Gapsy CRM · crm-core.js v0.1.0
 * Supabase-клієнт, сесія, ролі, guard сторінок, вхід/вихід, лоадер модулів.
 * Репо: GapsyStudio/gapsy-crm (файли в корені, модулі в modules/).
 * Конфіг: window.CRM_CONFIG у Site Settings → Head (там же CSS crm-loading).
 *
 * Атрибути у Designer:
 *   data-crm-guard="guest|public|auth|staff|admin,pm,…"  на page-wrapper
 *   data-crm-role="admin,pm"        показати елемент лише цим ролям (решта — видаляється)
 *   data-crm-user="full_name|email|role|avatar_url"   підставити дані користувача
 *   data-element="auth-login"       форма входу (поля name="email", name="password")
 *   data-element="auth-google"      кнопка «Увійти через Google»
 *   data-element="auth-logout"      кнопка виходу
 *   data-element="auth-error"       блок для тексту помилки (за замовчуванням прихований)
 *   data-element="<module>"         модуль із MODULES нижче, вантажиться автоматично
 *
 * Безпека: це лише UI. Дані захищає RLS у Supabase, а не приховування елементів.
 * ===================================================================== */
(() => {
  const cfg = window.CRM_CONFIG;
  const html = document.documentElement;
  if (!cfg || !window.supabase) {
    html.classList.remove('crm-loading');
    return console.error('[CRM] Немає CRM_CONFIG або supabase-js');
  }

  // Модулі, які існують у репо (modules/<name>.js). Новий модуль → додати назву сюди.
  const MODULES = [];
  const STAFF = ['designer', 'developer', 'pm', 'admin'];
  const TEXT = {
    invalid: 'Невірний email або пароль',
    failed: 'Не вдалося увійти. Спробуй ще раз',
    ...cfg.text,
  };

  const sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  const registry = {};

  const CRM = (window.CRM = {
    sb,
    user: null,
    profile: null,
    role: null,
    /** Модуль реєструє себе: CRM.module('name', (el, CRM) => {...}) */
    module(name, init) {
      registry[name] = init;
    },
    /** CRM.can('admin,pm') / CRM.can('staff') / CRM.can('auth') */
    can(rule) {
      const r = CRM.role;
      if (!r || r === 'pending') return false;
      const list = String(rule).split(',').map((s) => s.trim());
      return list.includes('auth') || list.includes(r) || (list.includes('staff') && STAFF.includes(r));
    },
  });

  // ---------- навігація ----------
  const go = (path) => {
    if (location.pathname !== path) location.replace(path);
  };
  // ?next=/docs після логіну; лише внутрішні шляхи (захист від open redirect)
  const nextPath = () => {
    const n = new URLSearchParams(location.search).get('next');
    return n && n.startsWith('/') && !n.startsWith('//') ? n : cfg.homePath;
  };

  // ---------- сесія і профіль ----------
  async function loadProfile() {
    const { data } = await sb.auth.getSession(); // також підхоплює токен після Google-редіректу
    CRM.user = data.session?.user || null;
    if (!CRM.user) return;
    const { data: profile, error } = await sb.from('profiles').select('*').eq('id', CRM.user.id).single();
    if (error) console.error('[CRM] profile:', error.message);
    CRM.profile = profile || null;
    CRM.role = profile?.role || null;
  }

  // ---------- guard: true = лишаємось на сторінці ----------
  function guard() {
    const el = document.querySelector('[data-crm-guard]');
    const rule = el ? el.dataset.crmGuard : 'public';
    if (rule === 'public') return true;
    if (rule === 'guest') return CRM.can('auth') ? (go(nextPath()), false) : true;
    if (!CRM.user) return go(`${cfg.loginPath}?next=${encodeURIComponent(location.pathname)}`), false;
    if (!CRM.can('auth')) return go(cfg.pendingPath), false;
    if (!CRM.can(rule)) return go(cfg.homePath), false; // homePath має бути guard="auth", інакше цикл
    return true;
  }

  // ---------- UI за роллю і даними ----------
  function bindUI() {
    document.querySelectorAll('[data-crm-role]').forEach((el) => {
      if (!CRM.can(el.dataset.crmRole)) el.remove();
    });
    document.querySelectorAll('[data-crm-user]').forEach((el) => {
      const key = el.dataset.crmUser;
      const val = key === 'email' ? CRM.user?.email : CRM.profile?.[key];
      if (val == null || val === '') return;
      if (el.tagName === 'IMG') el.src = val;
      else el.textContent = val;
    });
  }

  // ---------- вхід / вихід ----------
  const errorEl = () => document.querySelector('[data-element="auth-error"]');
  function showError(msg) {
    const el = errorEl();
    if (!el) return alert(msg); // simplified: fallback, якщо блок помилки не зверстано
    el.textContent = msg;
    el.hidden = false;
    el.style.display = 'block';
  }

  // capture на document: перехоплюємо раніше за обробник Webflow-форм
  document.addEventListener(
    'submit',
    async (e) => {
      const form = e.target.closest('[data-element="auth-login"]');
      if (!form) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const fd = new FormData(form);
      const btn = form.querySelector('[type="submit"]');
      if (btn) btn.disabled = true;
      const { error } = await sb.auth.signInWithPassword({
        email: String(fd.get('email') || '').trim(),
        password: String(fd.get('password') || ''),
      });
      if (btn) btn.disabled = false;
      if (error) return showError(error.status === 400 ? TEXT.invalid : TEXT.failed);
      location.replace(nextPath());
    },
    true
  );

  document.addEventListener('input', (e) => {
    if (e.target.closest('[data-element="auth-login"]') && errorEl()) errorEl().style.display = 'none';
  });

  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-element="auth-google"]')) {
      e.preventDefault();
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + nextPath() },
      });
      if (error) showError(TEXT.failed);
    }
    if (e.target.closest('[data-element="auth-logout"]')) {
      e.preventDefault();
      await sb.auth.signOut();
      location.replace(cfg.loginPath);
    }
  });

  // Вихід в іншій вкладці → на захищених сторінках одразу на логін
  sb.auth.onAuthStateChange((event) => {
    const rule = document.querySelector('[data-crm-guard]')?.dataset.crmGuard;
    if (event === 'SIGNED_OUT' && rule && rule !== 'public' && rule !== 'guest') location.replace(cfg.loginPath);
  });

  // ---------- лоадер модулів ----------
  function loadModules() {
    MODULES.forEach((name) => {
      const els = document.querySelectorAll(`[data-element="${name}"]`);
      if (!els.length) return;
      const s = document.createElement('script');
      s.src = `${cfg.modulesBase}${name}.js`;
      s.onload = () =>
        els.forEach((el) => {
          try {
            registry[name]?.(el, CRM);
          } catch (err) {
            console.error(`[CRM] ${name}:`, err); // помилка одного модуля не ламає інші
          }
        });
      s.onerror = () => console.error(`[CRM] Не завантажився модуль ${name}`);
      document.head.appendChild(s);
    });
  }

  // ---------- старт ----------
  const domReady = new Promise((r) =>
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', r, { once: true }) : r()
  );

  Promise.all([loadProfile(), domReady])
    .then(() => {
      if (!guard()) return; // редірект — сторінку не показуємо
      bindUI();
      html.classList.remove('crm-loading');
      loadModules();
      document.dispatchEvent(new CustomEvent('crm:ready', { detail: CRM }));
    })
    .catch((err) => {
      console.error('[CRM] init:', err);
      html.classList.remove('crm-loading');
    });
})();
