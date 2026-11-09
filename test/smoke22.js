// Смоук v0.17: Головна під роль, «Сьогодні», нагадування, ClickUp, ліди, спільні доступи, типи нотаток.
// Запуск: node server.js, потім node smoke22.js
const { chromium } = require('playwright');
const D = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (url, role, extra = {}) => {
    const ctx = await b.newContext();
    await ctx.addInitScript(({ role, extra, D0, D1, Dm2 }) => {
      const me = { id: 'u1', email: 'nelia@gapsy.studio', full_name: 'Нелія', role: role === 'art' ? 'designer' : role, is_art_director: role === 'art', is_leave_approver: role === 'admin', avatar_url: null };
      window.__FIXPATCH = Object.assign({
        profiles: [me],
        reminders: [{ id: 'r1', title: 'Подзвонити клієнту', due_on: Dm2, url: null }, { id: 'r2', title: 'Здати макет', due_on: D0, url: '/project?id=p1' }],
        feedback: [{ id: 'f1', title: 'Кнопка в хедері', status: 'new', due_date: D0, assignee_id: 'u1', author_id: 'u1', project: { name: 'CloudVno' } }],
        handoffs: [{ id: 'h1', status: 'submitted', project_id: 'p1', developer_id: 'u1', project: { name: 'CloudVno' } }],
        project_members: [{ user_id: 'u1', project: { id: 'p1', name: 'CloudVno', status: 'active', stage: 'development', stage_due: D1, deadline: null } }],
        leads: [{ id: 'ld1', title: 'Сайт для Acme', client: 'Acme', budget: '$5k', brief: 'Лендинг', status: 'new', project_id: null, created_at: new Date().toISOString() }],
      }, extra);
      window.__FN = { 'my-tasks': { data: { matched: true, tasks: [
        { id: 't1', name: 'Анімація хедера', status: 'in progress', due: new Date(Date.now() - 864e5).toISOString(), url: 'https://app.clickup.com/t/t1', list: 'CloudVno' },
        { id: 't2', name: 'Без терміну', status: 'to do', due: null, url: 'javascript:alert(1)', list: 'Gapsy' },
      ] }, error: null } };
      window.__RPC = { lead_decide: 'pNEW' };
    }, { role, extra, D0: D(0), D1: D(1), Dm2: D(-2) });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${role} ${url}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(`${role} ${url}: ${m.text()}`); });
    await p.goto(`http://localhost:8765${url}`); await p.waitForTimeout(1200);
    return p;
  };
  const order = (p) => p.$$eval('[data-element="dashboard"] > :not([hidden]):not([data-modal]):not(.page_header)', (x) => x.map((e) => e.dataset.home || (e.matches('[data-pulse]') ? 'pulse' : e.querySelector('[data-list="pins"]') ? 'pins' : e.querySelector('[data-list="my-feedback"]') ? 'work' : e.id || e.className)).join(' > '));
  const rows = (p, k) => p.$$eval(`[data-list="${k}"] > [data-rendered]`, (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));

  for (const role of ['designer', 'art', 'developer', 'pm', 'sales', 'admin']) {
    const p = await open('/app', role);
    console.log(`\n[${role}] order:`, await order(p));
    console.log(`[${role}] today:`, JSON.stringify(await rows(p, 'home-today')));
    await p.context().close();
  }

  // нагадування: додати / виконати
  let p = await open('/app', 'developer');
  console.log('\nreminder form hidden:', await p.$eval('[data-form="reminder"]', (f) => f.hidden));
  await p.click('[data-action="open-reminder"]');
  console.log('date default today:', (await p.$eval('[name="due_on"]', (e) => e.value)) === D(0));
  await p.fill('[data-form="reminder"] [name="title"]', 'Відписати Ксенії');
  await p.click('[data-form="reminder"] button[type="submit"]'); await p.waitForTimeout(300);
  await p.click('[data-list="home-today"] > [data-rendered] [data-action="reminder-done"]'); await p.waitForTimeout(300);
  console.log('calls:', JSON.stringify(await p.evaluate(() => window.__calls.filter((c) => c[1] === 'reminders').map((c) => [c[0], Object.keys(c[2] || {}).join(',')]))));
  console.log('tasks:', JSON.stringify(await rows(p, 'home-tasks')), await p.$$eval('[data-list="home-tasks"] > [data-rendered]', (x) => x.map((e) => e.href + ' ' + e.target)));
  console.log('projects:', JSON.stringify(await rows(p, 'home-projects')));
  await p.context().close();

  // ClickUp: людину не знайдено
  p = await open('/app', 'designer');
  await p.evaluate(() => {});
  await p.context().close();
  const ctx2 = await b.newContext();
  await ctx2.addInitScript(() => { window.__FIXPATCH = { profiles: [{ id: 'u1', email: 'x@x', role: 'designer' }] }; window.__FN = { 'my-tasks': { data: { matched: false, tasks: [] }, error: null } }; });
  p = await ctx2.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8765/app'); await p.waitForTimeout(1000);
  console.log('unmatched:', await p.$eval('[data-home="tasks"] [data-empty]', (e) => e.textContent.trim()));
  await ctx2.close();

  // Sales: передати лід
  p = await open('/app', 'sales');
  await p.click('[data-action="open:lead"]'); await p.waitForTimeout(200);
  await p.fill('#lead-title', 'Магазин для Beta'); await p.fill('#lead-client', 'Beta'); await p.fill('#lead-deadline', D(30));
  await p.click('[data-form="lead"] button[type="submit"]'); await p.waitForTimeout(300);
  console.log('\nlead insert:', JSON.stringify(await p.evaluate(() => window.__calls.filter((c) => c[1] === 'leads' && c[0] === 'insert').map((c) => c[2]))));
  console.log('modal closed:', !(await p.$('[data-modal="lead"].is-open')));
  console.log('links:', JSON.stringify(await rows(p, 'home-links')));
  await p.context().close();

  // PM: взяти лід
  p = await open('/app#leads', 'pm');
  console.log('\npm lead row:', JSON.stringify(await rows(p, 'home-leads')));
  await Promise.all([p.waitForURL(/project\?id=pNEW/, { timeout: 3000 }).catch(() => {}), p.click('[data-action="lead-take"]')]);
  console.log('after take url:', p.url().replace('http://localhost:8765', ''));
  await p.context().close();

  // Доступи: спільний запис для дизайнера
  p = await open('/access', 'designer', { access_items: [
    { id: 'ac1', kind: 'service', name: 'Figma', url: 'https://figma.com', secret_id: 's1', secret_set_at: new Date(Date.now() - 5 * 864e5).toISOString(), is_shared: true },
    { id: 'ac2', kind: 'service', name: 'Webflow', url: 'https://webflow.com', secret_id: 's2', secret_set_at: null, is_shared: false },
  ] });
  console.log('\naccess:', JSON.stringify(await p.$$eval('[data-list="access"] > [data-rendered]', (x) => x.map((e) => [
    e.querySelector('[data-field="name"]')?.textContent, e.querySelector('[data-field="secret"]')?.textContent,
    [...e.querySelectorAll('[data-action="access-reveal"][data-access-grant]')].some((b) => !b.hidden),
    !e.querySelector('[data-action="access-request"]')?.hidden]))));
  await p.context().close();

  // PM: чекбокс «Спільний» → RPC
  p = await open('/access', 'pm', { access_items: [{ id: 'ac1', kind: 'service', name: 'Figma', url: 'https://figma.com', secret_id: 's1', is_shared: false }] });
  await p.click('[data-list="access"] > [data-rendered] [data-action="access-edit"]'); await p.waitForTimeout(300);
  console.log('shared checkbox:', !!(await p.$('[data-form="access-item"] [name="is_shared"]')));
  await p.check('[name="is_shared"]');
  await p.click('[data-form="access-item"] [type="submit"]'); await p.waitForTimeout(400);
  console.log('rpc:', JSON.stringify(await p.evaluate(() => window.__calls.filter((c) => c[1] === 'access_set_shared'))));
  await p.context().close();

  // Проєкт: тип нотатки + фільтр
  p = await open('/project?id=p1', 'designer', { project_notes: [
    { id: 'n1', body: 'Lenis + GSAP', pinned: false, kind: 'decision', link: null, created_at: new Date().toISOString(), author_id: 'u1', author: { full_name: 'Нелія' } },
    { id: 'n2', body: 'Клієнт обрав варіант B', pinned: false, kind: 'choice', link: 'https://gapsy.slack.com/archives/x', created_at: new Date().toISOString(), author_id: 'u1', author: { full_name: 'Нелія' } },
    { id: 'n3', body: 'Звичайна', pinned: false, kind: 'note', link: null, created_at: new Date().toISOString(), author_id: 'u1', author: { full_name: 'Нелія' } },
  ] });
  const notes = () => p.$$eval('[data-list="project-notes"] > [data-rendered]', (x) => x.map((e) => [e.querySelector('[data-field="body"]').textContent, e.querySelector('.badge')?.textContent || '', !!e.querySelector('a[target="_blank"]')].join('|')));
  console.log('\nnotes:', JSON.stringify(await notes()));
  await p.click('[data-notes-filter] [data-value="client"]'); await p.waitForTimeout(100);
  console.log('client filter:', JSON.stringify(await notes()));
  await p.selectOption('[data-form="project-note"] [name="kind"]', 'client');
  await p.fill('[data-form="project-note"] [name="body"]', 'Хоче темніший фон');
  await p.fill('[data-form="project-note"] [name="link"]', 'https://gapsy.slack.com/x');
  await p.click('[data-form="project-note"] [type="submit"]'); await p.waitForTimeout(300);
  console.log('note insert:', JSON.stringify(await p.evaluate(() => window.__calls.filter((c) => c[1] === 'project_notes' && c[0] === 'insert').map((c) => c[2]))));
  await p.context().close();

  console.log('\nerrors:', errs.length ? errs : 'none');
  await b.close();
})();
