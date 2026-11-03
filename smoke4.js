// Смоук v0.4: Правки 2.0 (пріоритет, дедлайн, позначки) + Моя робота. Запуск: node server.js, потім node smoke4.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext();
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  p.on('dialog', (d) => d.accept());
  const go = async (u) => { await p.goto('http://localhost:8765' + u); await p.waitForTimeout(800); };
  const t = (s) => p.$eval(s, (e) => e.textContent.trim()).catch(() => 'MISSING ' + s);
  const n = (s) => p.$$eval(s, (x) => x.length);
  const calls = (f) => p.evaluate((f) => __calls.filter((c) => c[1] === f || c[0] === f), f);
  const hidden = (s) => p.$eval(s, (e) => e.hidden).catch(() => 'MISSING');
  const log = (...a) => console.log(...a);

  // ---------- /feedback
  await go('/feedback');
  const row = '[data-list="feedback"] [data-rendered]';
  log('FEEDBACK open rows:', await n(row), '| priority:', await t(`${row} [data-field="priority"]`), await p.$eval(`${row} [data-field="priority"]`, (e) => e.className),
    '| due:', await t(`${row} [data-field="due"]`), await p.$eval(`${row} [data-field="due"]`, (e) => e.className));
  log('  overdue count:', await t('[data-count="overdue"]'), '| hidden:', await hidden('[data-count="overdue"]'));
  await p.click('[data-tab="overdue"]'); log('  tab overdue rows:', await n(row));
  await p.click('[data-tab="resolved"]');
  log('  tab resolved rows:', await n(row), '| normal priority hidden:', await hidden(`${row} [data-field="priority"]`), '| no due hidden:', await hidden(`${row} [data-field="due"]`));
  await p.click('[data-action="open:feedback-new"]'); await p.waitForTimeout(300);
  log('  form priority options:', await n('[name=priority] option'), '| default:', await p.$eval('[name=priority]', (e) => e.value));
  await p.fill('[name=title]', 'Нова'); await p.selectOption('[name=priority]', 'high'); await p.fill('[name=due_date]', '2026-11-10');
  await p.click('[data-form="feedback-new"] [type=submit]'); await p.waitForTimeout(300);
  const ins = (await calls('insert')).find((c) => c[1] === 'feedback');
  log('  insert:', JSON.stringify({ priority: ins?.[2].priority, due_date: ins?.[2].due_date }));
  await p.click('[data-action="open:feedback-new"]'); await p.waitForTimeout(200);
  log('  after reset default:', await p.$eval('[name=priority]', (e) => e.value));

  // ---------- /feedback-item
  await go('/feedback-item?id=f1');
  log('ITEM badges:', await t('[data-item-badge="priority"]'), '|', await t('[data-item-badge="due"]'));
  log('  meta priority:', await p.$eval('[data-form="feedback-meta"] [name=priority]', (e) => e.value), '| options:', await n('[data-form="feedback-meta"] [name=priority] option'));
  await p.fill('[data-form="feedback-meta"] [name=due_date]', '2026-12-01');
  await p.$eval('[data-form="feedback-meta"] [name=due_date]', (e) => e.dispatchEvent(new Event('change', { bubbles: true })));
  await p.waitForTimeout(300);
  const up = (await calls('update')).filter((c) => c[1] === 'feedback');
  log('  meta update:', JSON.stringify(up.map((c) => c[2])), '| badge now:', await t('[data-item-badge="due"]'));
  const mrow = '[data-list="marks"] [data-rendered]';
  log('  marks:', await n(mrow), '| numbers:', await p.$$eval(`${mrow} [data-field="n"]`, (x) => x.map((e) => e.textContent).join(',')),
    '| done row:', await p.$$eval(mrow, (x) => x.map((e) => e.classList.contains('is-done')).join(',')),
    '| file:', await t(`${mrow} [data-field="file"]`));
  log('  thumb counts:', await p.$$eval('[data-list="feedback-files"] [data-rendered] [data-field="marks"]', (x) => x.map((e) => (e.hidden ? 'hidden' : e.textContent)).join(',')));
  // відкрити скрін і поставити позначку
  await p.click('[data-list="feedback-files"] [data-rendered]'); await p.waitForTimeout(200);
  log('  modal open:', await p.$eval('[data-modal="image"]', (e) => e.classList.contains('is-open')), '| pins:', await n('[data-list="stage-marks"] [data-rendered]'),
    '| pin left:', await p.$eval('[data-list="stage-marks"] [data-rendered]', (e) => e.style.left), '| form hidden:', await hidden('[data-mark-form]'));
  const box = await p.$eval('[data-lightbox-img]', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await p.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.25); await p.waitForTimeout(100);
  log('  draft pins:', await n('[data-list="stage-marks"] [data-rendered]'), '| draft:', await n('[data-list="stage-marks"] .is-draft'), '| form hidden:', await hidden('[data-mark-form]'), '| hint hidden:', await hidden('[data-mark-hint]'));
  await p.fill('[data-form="mark"] [name=note]', 'Іконка менша');
  await p.click('[data-form="mark"] [type=submit]'); await p.waitForTimeout(300);
  const mi = (await calls('insert')).find((c) => c[1] === 'feedback_marks');
  log('  mark insert:', JSON.stringify(mi?.[2]));
  // чернетка → скасувати
  await p.mouse.click(box.x + 10, box.y + 10); await p.click('[data-action="mark-cancel"]');
  log('  after cancel draft:', await n('[data-list="stage-marks"] .is-draft'), '| form hidden:', await hidden('[data-mark-form]'));
  await p.keyboard.press('Escape');
  // виконано
  await p.click(`${mrow} [data-action="mark-toggle"]`); await p.waitForTimeout(200);
  log('  toggle:', JSON.stringify((await calls('update')).filter((c) => c[1] === 'feedback_marks').map((c) => c[2])),
    '| aria:', await p.$eval(`${mrow} [data-mark-check]`, (e) => e.getAttribute('aria-checked')));
  // відкрити з рядка
  await p.click(`${mrow} [data-action="mark-open"]`); await p.waitForTimeout(100);
  log('  mark-open modal:', await p.$eval('[data-modal="image"]', (e) => e.classList.contains('is-open')), '| active pin:', await n('[data-list="stage-marks"] .is-active'));

  // ---------- /my-work
  await p.addInitScript(() => {
    window.__FIXPATCH = {
      feedback: [
        { id: 'a1', title: 'Хедер', status: 'new', priority: 'high', due_date: '2020-01-01', created_at: new Date().toISOString(), author_id: 'u2', assignee_id: 'u1', project_id: 'p1', project: { name: 'CloudVno' } },
        { id: 'a2', title: 'Футер', status: 'in_progress', priority: 'normal', due_date: null, created_at: new Date().toISOString(), author_id: 'u2', assignee_id: 'u1', project_id: 'p1', project: { name: 'CloudVno' } },
        { id: 'a3', title: 'Для дизайнера', status: 'new', priority: 'urgent', due_date: null, created_at: new Date().toISOString(), author_id: 'u1', assignee_id: 'u2', project_id: 'p1', project: { name: 'CloudVno' }, assignee: { full_name: 'Оля' } },
      ],
      handoffs: [
        { id: 'h1', status: 'submitted', developer_id: 'u1', designer_id: 'u2', project: { id: 'p1', name: 'CloudVno' } },
        { id: 'h2', status: 'accepted', developer_id: 'u1', designer_id: 'u2', project: { id: 'p2', name: 'Old' } },
        { id: 'h3', status: 'returned', developer_id: 'u2', designer_id: 'u1', project: { id: 'p3', name: 'Nova' } },
      ],
      project_members: [
        { role_label: 'розробка', project: { id: 'p1', name: 'CloudVno', client: 'Vno', status: 'active' } },
        { role_label: 'розробка', project: { id: 'p2', name: 'Old', client: null, status: 'done' } },
      ],
    };
  });
  await go('/my-work');
  log('MYWORK summary:', await t('[data-mywork-summary]'), '| crumbs:', await t('[data-crm-crumbs]'));
  log('  assigned:', await p.$$eval('[data-list="mywork-assigned"] [data-rendered] [data-field="title"]', (x) => x.map((e) => e.textContent).join(',')),
    '| counts:', await t('[data-count="assigned"]'), await t('[data-count="authored"]'), await t('[data-count="handoffs"]'), await t('[data-count="projects"]'));
  log('  authored:', await t('[data-list="mywork-authored"] [data-rendered] [data-field="assignee"]'));
  log('  handoffs:', JSON.stringify(await p.$$eval('[data-list="mywork-handoffs"] [data-rendered]', (x) => x.map((e) => [e.querySelector('[data-field="status"]').textContent, e.querySelector('[data-field="hint"]').textContent, e.getAttribute('href')]))));
  log('  projects:', JSON.stringify(await p.$$eval('[data-list="mywork-projects"] [data-rendered]', (x) => x.map((e) => e.textContent))));

  log('\nERRORS:', errs.length ? errs.join('\n') : 'none');
  await b.close();
})();
