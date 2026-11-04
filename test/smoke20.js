// Смоук v0.15: онбординг-квіз і запит на роль. Запуск: node server.js, потім node smoke20.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const errs = [];
  const page = async (patch) => {
    const p = await ctx.newPage();
    if (patch) await p.addInitScript((x) => { window.__FIXPATCH = x; }, patch);
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Ще рано' : undefined));
    return p;
  };
  const pendingProfile = { profiles: [{ id: 'u1', email: 'nelia@gapsy.studio', full_name: 'Новачок', role: 'pending', avatar_url: null, created_at: new Date().toISOString() }] };
  const txt = (p, s) => p.$eval(s, (e) => e.textContent.trim()).catch(() => null);
  const steps = (p) => p.$$eval('[data-list="onb-steps"] > [data-rendered]', (x) => x.map((e) => e.querySelector('[data-field="title"]').textContent + ' [' + e.querySelector('[data-field="status"]').textContent + '] docs:' + [...e.querySelectorAll('[data-onb-docs] > a:not([data-template])')].map((a) => a.textContent).join('|')));
  // ---- новачок ----
  let p = await page(pendingProfile);
  await p.goto('http://localhost:8765/onboarding'); await p.waitForTimeout(1200);
  console.log('path:', new URL(p.url()).pathname, '| current:', await txt(p, '[data-onb-current]'));
  console.log('nav for pending:', await p.$$eval('.app_nav [data-nav]', (x) => x.map((a) => a.textContent).join(',')), '| groups hidden:', await p.$eval('.app_nav-group', (e) => e.hidden));
  console.log('steps before pick:', JSON.stringify(await steps(p)));
  await p.click('[data-action="onb-pick"][data-role="designer"]'); await p.waitForTimeout(500);
  console.log('steps after pick:', JSON.stringify(await steps(p)));
  console.log('request btn disabled:', await p.$eval('[data-action="role-request"]', (e) => e.classList.contains('is-disabled')), '|', await txt(p, '[data-onb-request-status]'));
  // CRM квіз з помилкою
  const answer = async (wanted) => {
    for (let i = 0; i < 5; i++) {
      const q = await txt(p, '[data-quiz-question]');
      if (!q || !(await p.isVisible('[data-quiz-body]'))) break;
      const opt = wanted[q];
      await p.click(`[data-list="quiz-options"] > [data-rendered]:text-is("${opt}")`);
      await p.click('[data-action="quiz-next"]'); await p.waitForTimeout(300);
    }
  };
  await p.click('[data-list="onb-steps"] > [data-rendered] [data-action="onb-start"]'); await p.waitForTimeout(400);
  console.log('quiz progress:', await txt(p, '[data-quiz-progress]'));
  await answer({ 'Що робить ⌘K?': 'Копіює', 'Де правки?': 'Правки', 'Пошта?': 'Робоча' });
  console.log('fail result:', await txt(p, '[data-quiz-score]'), '|', await txt(p, '[data-quiz-verdict]'), '| mistakes:', await p.$$eval('[data-list="quiz-mistakes"] > [data-rendered]', (x) => x.map((e) => e.textContent).join('/')), '| retry visible:', await p.isVisible('[data-action="quiz-retry"]'), '| next hidden:', !(await p.isVisible('[data-action="quiz-next"]')));
  await p.click('[data-action="quiz-retry"]'); await p.waitForTimeout(400);
  await answer({ 'Що робить ⌘K?': 'Пошук і перехід', 'Де правки?': 'Правки', 'Пошта?': 'Робоча' });
  console.log('pass result:', await txt(p, '[data-quiz-verdict]'));
  await p.click('[data-modal="quiz"] [data-action="close"]').catch(() => p.keyboard.press('Escape')); await p.waitForTimeout(300);
  // квіз ролі
  await p.click('[data-list="onb-steps"] > [data-rendered]:nth-of-type(3) [data-action="onb-start"]'); await p.waitForTimeout(400);
  await answer({ 'Що робить ⌘K?': 'Пошук і перехід', 'Де правки?': 'Правки', 'Пошта?': 'Робоча' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  console.log('steps after quizzes:', JSON.stringify(await steps(p)));
  console.log('request btn enabled:', !(await p.$eval('[data-action="role-request"]', (e) => e.classList.contains('is-disabled'))), '|', await txt(p, '[data-onb-request-status]'));
  await p.click('[data-action="role-request"]'); await p.waitForTimeout(500);
  console.log('after request:', await txt(p, '[data-onb-request-status]'), '| cancel visible:', await p.isVisible('[data-action="role-request-cancel"]'));
  console.log('rpcs:', (await p.evaluate(() => __calls.filter((c) => c[0] === 'rpc').map((c) => c[1] + (c[1] === 'quiz_submit' ? ':' + c[2].t + '=' + JSON.stringify(c[2].answers) : '')))).join(' | '));
  await p.close();
  // ---- admin ----
  p = await page();
  await p.goto('http://localhost:8765/admin'); await p.waitForTimeout(1200);
  console.log('admin requests visible:', !(await p.$eval('[data-role-requests]', (e) => e.hidden)), '|', await p.$$eval('[data-list="role-requests"] > [data-rendered]', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ')).join('/')));
  console.log('questions crm:', await p.$$eval('[data-list="quiz-questions"] > [data-rendered] [data-field="answers"]', (x) => x.map((e) => e.textContent).join(' / ')), '|', await txt(p, '[data-quiz-count]'));
  await p.click('[data-tabs="quiz-track"] [data-tab="designer"]'); await p.waitForTimeout(300);
  console.log('questions designer:', await p.$$eval('[data-list="quiz-questions"] > [data-rendered] [data-field="question"]', (x) => x.map((e) => e.textContent).join(',')));
  await p.click('[data-action="q-new"]'); await p.waitForTimeout(300);
  console.log('track opts:', await p.$$eval('[data-form="quiz-q"] [name=track] option', (x) => x.map((o) => o.value).join(',')), '| track value:', await p.$eval('[data-form="quiz-q"] [name=track]', (e) => e.value));
  await p.fill('[name=question]', 'Тестове питання'); await p.fill('[name=options]', 'Правильна\nНеправильна 1\nНеправильна 2');
  await p.click('[data-form="quiz-q"] [type=submit]'); await p.waitForTimeout(400);
  const ins = await p.evaluate(() => __calls.filter((c) => c[0] === 'insert' && c[1] === 'quiz_questions').map((c) => c[2]));
  console.log('insert ok (correct points to «Правильна»):', ins.length === 1 && ins[0].options[ins[0].correct] === 'Правильна', JSON.stringify(ins[0] && { track: ins[0].track, n: ins[0].options.length }));
  await p.click('[data-list="role-requests"] > [data-rendered] [data-action="rr-approve"]'); await p.waitForTimeout(300);
  console.log('decide:', JSON.stringify(await p.evaluate(() => __calls.filter((c) => c[1] === 'role_request_decide').map((c) => c[2]))));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
