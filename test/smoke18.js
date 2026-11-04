// Смоук v0.13: відпустки. Запуск: node server.js, потім node smoke18.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const errs = [];
  const run = async (patch) => {
    const p = await ctx.newPage();
    if (patch) await p.addInitScript((x) => { window.__FIXPATCH = x; }, patch);
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicons|TUNNEL/.test(m.text())) errs.push(m.text()); });
    let answer = 'Вибач, проєкт горить'; p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? answer : undefined));
    return p;
  };
  const txt = (p, s) => p.$eval(s, (e) => e.textContent.trim()).catch(() => null);
  const calls = (p, k) => p.evaluate((k) => __calls.filter((c) => c[1] === k || c[0] === k), k);
  const D = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv');

  // --- admin (u1) ---
  let p = await run();
  await p.goto('http://localhost:8765/leave'); await p.waitForTimeout(1200);
  console.log('balance vac/sick:', await txt(p, '[data-balance="vacation"]'), '/', await txt(p, '[data-balance="sick"]'));
  console.log('sub:', await txt(p, '[data-balance-sub="vacation"]'));
  console.log('updated:', await txt(p, '[data-balance="updated"]'));
  console.log('approver sections visible:', await p.$$eval('[data-leave-approver]', (x) => x.map((e) => !e.hidden).join(',')));
  console.log('approvals:', JSON.stringify(await p.$$eval('[data-list="leave-approvals"] > [data-rendered]', (x) => x.map((e) => [e.querySelector('[data-field="user"]').textContent, e.querySelector('[data-field="days"]').textContent, e.querySelector('[data-field="comment"]').textContent]))));
  console.log('tracking:', JSON.stringify(await p.$$eval('[data-list="leave-tracking"] > [data-rendered]', (x) => x.map((e) => [e.querySelector('[data-field="type"]').textContent, e.querySelector('[data-clickup-link]').href]))));
  console.log('team:', JSON.stringify(await p.$$eval('[data-list="leave-team"] > [data-rendered]', (x) => x.map((e) => [e.querySelector('[data-field="user"]').textContent, e.querySelector('[data-field="vacation"]').textContent, e.querySelector('[data-field="sick"]').textContent, e.querySelector('[data-field="note"]').textContent]))));
  console.log('mine cancel visible:', await p.$$eval('[data-list="leave-mine"] > [data-rendered] [data-action="leave-cancel"]', (x) => x.map((e) => !e.hidden).join(',')));
  console.log('holidays:', await p.$$eval('[data-list="holidays"] > [data-rendered]', (x) => x.length));
  // новий запит: з найближчої п'ятниці по понеділок = 2 робочі дні
  const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7) + 21);
  const fri = d.toLocaleDateString('sv'); const mon = new Date(d.getTime() + 3 * 864e5).toLocaleDateString('sv');
  await p.click('[data-action="open:leave-new"]'); await p.waitForTimeout(300);
  console.log('kind options:', await p.$$eval('select[name=kind] option', (x) => x.map((o) => o.value + ':' + o.text).join(',')));
  await p.fill('[name=start_date]', fri); await p.fill('[name=end_date]', mon); await p.waitForTimeout(100);
  console.log('preview fri-mon:', await txt(p, '[data-leave-preview]'), '| hours field hidden:', await p.$eval('[data-leave-hours-field]', (e) => e.hidden));
  await p.fill('[name=end_date]', fri); await p.fill('[name=hours]', '4'); await p.waitForTimeout(100);
  console.log('preview single 4h:', await txt(p, '[data-leave-preview]'), '| hours field hidden:', await p.$eval('[data-leave-hours-field]', (e) => e.hidden));
  await p.fill('[name=start_date]', D(2)); await p.fill('[name=end_date]', D(2)); await p.waitForTimeout(100);
  console.log('warn soon:', await txt(p, '[data-leave-warn]'));
  await p.fill('[name=start_date]', fri); await p.fill('[name=end_date]', mon); await p.fill('[name=comment]', 'Гори');
  await p.click('[data-form="leave-new"] [type=submit]'); await p.waitForTimeout(400);
  console.log('insert:', JSON.stringify((await calls(p, 'leave_requests')).filter((c) => c[0] === 'insert').map((c) => c[2])));
  // рішення
  await p.click('[data-list="leave-approvals"] > [data-rendered] [data-action="leave-approve"]'); await p.waitForTimeout(300);
  await p.click('[data-list="leave-approvals"] > [data-rendered]:nth-of-type(2) [data-action="leave-reject"]'); await p.waitForTimeout(300);
  await p.click('[data-list="leave-tracking"] > [data-rendered] [data-action="leave-tracked"]'); await p.waitForTimeout(300);
  await p.click('[data-list="leave-mine"] > [data-rendered] [data-action="leave-cancel"]'); await p.waitForTimeout(300);
  await p.click('[data-action="leave-sync"]'); await p.waitForTimeout(300);
  await p.fill('[data-form="holiday"] [name=day]', D(40)); await p.fill('[data-form="holiday"] [name=title]', 'День Незалежності');
  await p.click('[data-form="holiday"] [type=submit]'); await p.waitForTimeout(300);
  const rpcs = (await p.evaluate(() => __calls.filter((c) => c[0] === 'rpc' && c[1] !== 'leave_summary' && c[1] !== 'search_all').map((c) => c[1] + ' ' + JSON.stringify(c[2]))));
  console.log('rpcs:', rpcs.join(' | '));
  console.log('fn:', JSON.stringify(await p.evaluate(() => __calls.filter((c) => c[0] === 'fn'))));
  console.log('holiday upsert:', JSON.stringify((await calls(p, 'company_holidays')).filter((c) => c[0] === 'upsert').map((c) => c[2])));
  await p.goto('http://localhost:8765/app'); await p.waitForTimeout(1000);
  console.log('/app balance shown:', await p.$eval('#bal', (e) => !e.hidden), '| vac', await txt(p, '#bal [data-balance="vacation"]'), '| pending card:', await p.$eval('[data-leave-approver]', (e) => !e.hidden), await txt(p, '[data-balance="pending-approvals"]'));
  await p.close();

  // --- дизайнер без прав погоджувача ---
  p = await run({ profiles: [{ id: 'u1', email: 'nelia@gapsy.studio', full_name: 'Нелія', role: 'designer', is_leave_approver: false, avatar_url: null, created_at: new Date().toISOString() }] });
  await p.goto('http://localhost:8765/leave'); await p.waitForTimeout(1200);
  console.log('designer approver sections visible:', await p.$$eval('[data-leave-approver]', (x) => x.map((e) => !e.hidden).join(',')), '| holidays section:', await p.$('[data-form="holiday"]') ? 'present' : 'removed');
  await p.goto('http://localhost:8765/app'); await p.waitForTimeout(900);
  console.log('designer pending card hidden:', await p.$eval('[data-leave-approver]', (e) => e.hidden));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
