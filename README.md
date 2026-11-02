# Gapsy CRM — фундамент + Auth (v0.1.0)

Webflow (фронт, Client-First) + Supabase (Auth, БД, RLS). Webflow site: `6ae8bb466d45cd2bbd127d84`.

```
001_foundation.sql   профілі, ролі, RLS, set_user_role()  (запускати в Supabase SQL Editor)
crm-core.js          ядро: сесія, guard, вхід/вихід, ролі в UI, лоадер модулів
site-head.html       вставка в Webflow → Site Settings → Head
modules/             майбутні модулі (створювати через Add file → Create new file → modules/<name>.js)
```

## 1. Supabase

1. supabase.com → New project → регіон **Central EU (Frankfurt)**. Пароль БД збережи в менеджері паролів.
2. **SQL Editor** → встав `001_foundation.sql` → Run.
3. **Authentication → URL Configuration**
   - Site URL: `https://pet-project-a0d67a.webflow.io`
   - Redirect URLs: `https://pet-project-a0d67a.webflow.io/**` (пізніше додати кастомний домен)
4. **Authentication → Providers → Google**: увімкнути, вставити Client ID / Secret з Google Cloud Console
   (OAuth client «Web application», Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`).
5. **Email**: лишити увімкненим. Реєстрацію не вимикаємо (інакше Google-вхід для нових людей теж заблокується):
   будь-хто новий отримує роль `pending` і нічого не бачить, поки адмін не призначить роль.
   Клієнтів з паролем створюй вручну: Authentication → Users → Add user → Create new user (Auto Confirm).
6. Увійди на сайт сама (Google), потім у SQL Editor:
   `update public.profiles set role = 'admin' where email = 'твій@email';`
7. **Project Settings → API**: скопіюй Project URL і **anon public** key у `CRM_CONFIG`.
   `service_role` key ніколи не вставляти у Webflow.

## 2. GitHub + jsDelivr

1. Створи **публічний** репо `GapsyStudio/gapsy-crm` (jsDelivr не віддає файли з приватних) і залий цю папку.
   У коді немає секретів: anon key публічний за задумом, захист — RLS.
2. Реліз: `git tag v0.1.0 && git push --tags`. Файл буде на
   `https://cdn.jsdelivr.net/gh/GapsyStudio/gapsy-crm@v0.1.0/crm-core.js`.
3. Кожна зміна коду = новий тег (`v0.1.1`…) і заміна версії в Head. Теги кешуються назавжди, гілки — до 12 год.

## 3. Webflow

**Site Settings → Custom Code → Head**: замінити весь вміст на `site-head.html` (з твоїми URL і anon key).

**Сторінки** (Client-First, атрибут ставиш на `page-wrapper`):

| Сторінка | slug | `data-crm-guard` | Що на ній |
|---|---|---|---|
| Login | `/login` | `guest` | форма входу, кнопка Google, блок помилки |
| Pending | `/pending` | `public` | «Акаунт чекає на підтвердження адміном» + кнопка виходу |
| App (дашборд) | `/app` | `auth` | оболонка: сайдбар, ім'я, аватар, вихід |
| 404, style-guide | — | без атрибута | публічні |

Значення guard: `guest` (лише для невходжених, увійшов → на `/app`), `public`, `auth` (будь-яка підтверджена роль),
`staff` (команда без клієнтів) або список ролей: `admin,pm`.
`/app` має бути `auth`, бо туди редіректить, коли роль не підходить.

**Атрибути (Element Settings → Custom attributes):**

| Елемент | Атрибут |
|---|---|
| Form Block → сам `form` | `data-element="auth-login"` |
| Поле email | Name: `email`, Type: Email, required |
| Поле пароля | Name: `password`, Type: Password, required |
| Кнопка Google (`a` або `button`) | `data-element="auth-google"` |
| Текст помилки (div у формі) | `data-element="auth-error"`, `aria-live="polite"` |
| Кнопка виходу | `data-element="auth-logout"` |
| Ім'я / email / роль | `data-crm-user="full_name"` / `"email"` / `"role"` |
| Аватар (`img`) | `data-crm-user="avatar_url"` |
| Пункт меню лише для частини ролей | `data-crm-role="admin,pm"` (або `staff`) |

Webflow-блоки Success/Error форми входу не використовуються: їх можна сховати.

## Ролі

`pending` → нема доступу · `client` → лише свій проєкт (з модулем Feedback) · `designer`, `developer` → свої таски, сніпети, відпустки ·
`pm` → проєкти, документація, правки, погодження відпусток · `admin` → усе + ролі (`CRM.sb.rpc('set_user_role', { user_id, new_role })`).

## Що перевірити після публікації

1. `/app` без входу → редірект на `/login?next=/app`; після входу повертає на `/app`.
2. Вхід через Google новим акаунтом → `/pending`; після `role = 'designer'` у БД → `/app`.
3. Невірний пароль → текст помилки під формою, зникає при введенні; Webflow не показує свій Success.
4. Вихід в одній вкладці → інша вкладка на `/app` сама йде на `/login`.
5. Елемент з `data-crm-role="admin"` відсутній у DOM для designer.

## v0.2.0 — оболонка і перші модулі

Нові файли:
```
002_modules.sql       проєкти, Showcase, правки (+скріни, коментарі), закріплене, сповіщення, Storage, пошук
crm-core.js           ядро v0.2.0: модалки, таби, тема, Cmd+K, сповіщення, toast, форми, дропзона
modules/*.js          dashboard, projects, showcase, feedback, feedback-item, admin, profile
```

### Порядок оновлення
1. **Supabase → SQL Editor:** вставити весь `002_modules.sql` → Run (один раз). Має бути «Success».
2. **GitHub:** замінити `crm-core.js` у корені (Add file → Upload files).
3. **Папка `modules/`:** Add file → Create new file → у назві `modules/README.md`, текст будь-який → Commit.
   Відкрити папку `modules` → Add file → Upload files → перетягнути 7 файлів `.js` → Commit.
4. **Releases → Create a new release → тег `v0.2.0` → Publish.**
5. Перевірити: `https://cdn.jsdelivr.net/gh/GapsyStudio/gapsy-crm@v0.2.0/modules/feedback.js` відкривається.
6. Написати Claude «v0.2.0 готовий» — він перемкне Head сайту на нову версію і опублікує.

### Конвенції модулів
- `CRM.render(key, rows, fill)` — рендер списку за `[data-template]` у `[data-list="key"]`.
- Поля шаблону: `data-field` (текст), `data-field-src` (img), `data-field-href` (посилання), `data-field-bg` (фон, аватари).
- `CRM.onSubmit('form-key', async (data, form) => …)` — для `[data-form="form-key"]`.
- `CRM.action('name', (el) => …)` — для `data-action="name"`.
- Файли: bucket `media` (приватний, signed URL на 1 год), `avatars` (публічний, папка = id користувача).
