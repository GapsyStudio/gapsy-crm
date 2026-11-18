// Смоук v0.25: без етапів / дат / ризиків проєктів, без ClickUp task id в Адмінці.
// Запуск: node server.js, потім node smoke31.js
const { chromium } = require('playwright');
const D = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (url, role, fix = {}) => {
    const ctx = await b.newContext();
    await ctx.addInitScript(({ role, fix }) => {
      window.__FIXPATCH = Object.assign({ profiles: [{ id: 'u1', email: 'm@gapsy.studio', full_name: 'Маша', role, clickup_task_id: 'cu-keep' }] }, fix);
    }, { role, fix });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${url}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(`${url}: ${m.text()}`); });
    await p.goto(`http://localhost:8765${url}`); await p.waitForTimeout(1300);
    return p;
  };
  const calls = (p, t) => p.evaluate((t) => window.__calls.filter((c) => c[1] === t).map((c) => [c[0], c[2]]), t);

  // /projects: список без етапу / дати / ризику, форма не пише stage / stage_due / deadline, огляд на 5 колонок
  const projects = [
    { id: 'p1', name: 'Бета', client: 'B', status: 'active', stage: 'development', stage_due: D(-3), deadline: D(2), feedback: [{ count: 2 }] },
    { id: 'p2', name: 'Альфа', client: 'A', status: 'active', stage: 'design', stage_due: null, deadline: null, feedback: [{ count: 0 }] },
  ];
  let p = await open('/projects', 'pm', { projects });
  console.log('order by name:', JSON.stringify(await p.$$eval('[data-list="projects"] > [data-rendered] [data-field="name"]', (x) => x.map((e) => e.textContent))));
  console.log('stage/due/risk untouched:', JSON.stringify(await p.$$eval('[data-list="projects"] > [data-rendered]', (x) => x.map((e) => ['stage', 'due', 'risk'].map((f) => e.querySelector(`[data-field="${f}"]`)?.textContent || '').join('|')))));
  const sel = (await calls(p, 'projects')).find((c) => c[0] === 'select');
  console.log('select has no stage cols:', !/stage|deadline/.test(JSON.stringify(sel || '')));
  await p.click('[data-list="projects"] > [data-rendered]', { modifiers: ['Shift'] }); await p.waitForTimeout(300);
  await p.click('[data-form="project"] [type="submit"]'); await p.waitForTimeout(300);
  const up = (await calls(p, 'projects')).find((c) => c[0] === 'update');
  console.log('update keys:', up ? Object.keys(up[1]).join(',') : 'none');
  await p.click('[data-view="overview"]'); await p.waitForTimeout(500);
  console.log('overview head:', await p.$eval('.pm_row.is-head', (e) => [...e.children].map((c) => c.textContent).join(' | ')));
  console.log('overview row cells:', await p.$eval('a.pm_row', (e) => e.children.length));
  await p.context().close();

  // /admin: колонки ClickUp немає в рядку, збереження не стирає clickup_task_id
  p = await open('/admin', 'admin');
  await p.click('[data-list="users"] > [data-rendered] [data-action="edit-user"]'); await p.waitForTimeout(300);
  console.log('clickup field left empty by JS:', await p.$eval('[name="clickup_task_id"]', (e) => e.value === ''));
  await p.click('[data-form="user"] [type="submit"]'); await p.waitForTimeout(400);
  console.log('admin_update_user:', JSON.stringify((await calls(p, 'admin_update_user'))[0]?.[1] || (await p.evaluate(() => window.__calls.filter((c) => c[1] === 'admin_update_user' || c[2]?.new_role).map((c) => c[2])))));
  await p.context().close();

  console.log(errs.length ? `errors: ${JSON.stringify(errs, null, 1)}` : 'errors: none');
  await b.close();
})();
