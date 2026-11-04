# Gapsy CRM v0.14.0: ліміти відпусток з ClickUp, категорії Showcase

## Що нового

- **Відпустки: ліміт кожної людини береться з ClickUp.** Поле **Time estimate** на задачах «GPS | Vacation» і «GPS | Sick Days» — річний ліміт (там уже враховано неповний рік роботи і стаж). **Track time** — використано.
  - Приклад: Time estimate 48h, Track time 43h → лишилось 5 год (0,6 дня).
  - Порядок: власний ліміт з Адмінки (якщо заповнений) → Time estimate з ClickUp → правило 120 / 40 + 8 за рік (якщо в ClickUp порожньо).
- **Showcase: 12 категорій** — Сайт, Figma, Презентація, Brand kit, SaaS, Fintech, E-commerce, Mobile app, Web3, Medical, Real Estate, Ілюстрації / 3D.
  - Кнопка **«Категорії»** (PM/admin): додати, перейменувати, змінити колір, видалити. Роботи з видаленої категорії переходять у першу зі списку.
  - Таби показують лише категорії, де є роботи, тож сторінка не перевантажена.

## Що в архіві

| Файл | Куди в репо | Що змінилось |
|---|---|---|
| `crm-core.js` | корінь (замінити) | підписи нових полів |
| `modules/showcase.js` | modules (замінити) | категорії з бази, керування |
| `modules/admin.js`, `modules/leave-balance.js` | modules (замінити) | коментарі про ліміти |
| `supabase/functions/leave-sync/index.ts` | (замінити) | читає Time estimate |
| `014_leave_limits_showcase_cats.sql` (+ `.txt`) | корінь | ліміти з ClickUp, таблиця категорій |
| `test/*` | test (замінити) | `smoke19.js`, оновлений `smoke.js` |

## Кроки

1. **Supabase → SQL Editor:** встав вміст `014_leave_limits_showcase_cats.txt` і запусти.
2. **Supabase → Edge Functions → leave-sync → Code:** заміни весь код вмістом `leave-sync.txt` → **Deploy** (секрет `CLICKUP_TOKEN` лишається).
3. **GitHub:** завантаж файли → Releases → тег **`v0.14.0`** → Publish.
4. Напиши «тег є». Я переключу Head, опублікую сайт, а на `/leave` треба буде натиснути «Оновити з ClickUp».

**Webflow не публікуй до кроку 4:** нова розмітка Showcase вже в Designer.
