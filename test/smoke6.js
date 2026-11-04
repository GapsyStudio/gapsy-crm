// Смоук v0.5 (доступи): сервіси й курси, показ доступу PM/admin, ролі. Запуск: node server.js, потім node smoke6.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext();
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  const p = await ctx.newPage(); const errs = []; const logs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { logs.push(m.text()); if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  p.on('dialog', (d) => d.accept());
  const go = async (u) => { await p.goto('http://localhost:8765' + u); await p.waitForTimeout(900); };
  const t = (s) => p.$eval(s, (e) => e.textContent.trim()).catch(() => 'MISSING ' + s);
  const n = (s) => p.$$eval(s, (x) => x.length);
  const calls = (f) => p.evaluate((f) => __calls.filter((c) => c[1] === f || c[0] === f), f);
  const hidden = (s) => p.$eval(s, (e) => e.hidden).catch(() => 'MISSING');
  const open = (s) => p.$eval(`[data-modal="${s}"]`, (e) => e.classList.contains('is-open'));
  const log = (...a) => console.log(...a);
  const row = '[data-list="access"] [data-rendered]';

  // ---------- admin
  await go('/access');
  log('ACCESS services:', await n(row), '| counts:', await t('[data-count="service"]'), await t('[data-count="course"]'));
  log('  rows:', JSON.stringify(await p.$$eval(row, (x) => x.map((e) => [e.querySelector('[data-field="name"]').textContent, e.querySelector('[data-field="host"]').textContent,
    e.querySelector('[data-field="secret"]').textContent + (e.querySelector('[data-field="secret"]').classList.contains('is-green') ? '+green' : ''),
    e.querySelector('[data-action="access-reveal"]')?.hidden ? 'reveal-hidden' : 'reveal', e.querySelector('[data-access-link]').target, e.querySelector('[data-field="notes"]').hidden ? 'no-notes' : 'notes']))));
  await p.click('[data-tab="course"]'); log('  courses:', await n(row), await t(`${row} [data-field="name"]`));
  await p.click('[data-tab="service"]'); await p.fill('[data-access-search]', 'web'); await p.waitForTimeout(100); log('  search web:', await n(row));
  await p.fill('[data-access-search]', '');
  // показати доступ
  await p.click(`${row} [data-action="access-reveal"]`); await p.waitForTimeout(300);
  log('  reveal: open', await open('access-reveal'), '| title', await t('[data-modal="access-reveal"] [data-access-title]'), '| login', await t('[data-reveal="login"]'),
    '| password shown', (await t('[data-reveal="password"]')) === 'S3cret!', '| extra row hidden', await hidden('[data-reveal-row]'), '| timer', await t('[data-reveal-timer]'));
  log('  rpc:', JSON.stringify((await calls('rpc')).filter((c) => c[1].startsWith('access')).map((c) => [c[1], c[2]])));
  await p.click('[data-modal="access-reveal"] [data-copy="password"]'); await p.waitForTimeout(150);
  log('  clipboard ok:', (await p.evaluate(() => navigator.clipboard.readText())) === 'S3cret!');
  await p.click('[data-modal="access-reveal"] [data-action="close"]'); await p.waitForTimeout(100);
  log('  after close: password cleared', await t('[data-reveal="password"]'));
  log('  secret in console?', logs.some((l) => l.includes('S3cret!')));
  // новий сервіс → одразу форма доступу
  await p.click('[data-action="access-new"]'); await p.waitForTimeout(200);
  log('  new: kind', await p.$eval('[data-form="access-item"] [name=kind]', (e) => e.value), '| options', await n('[data-form="access-item"] [name=kind] option'), '| delete hidden', await hidden('[data-modal="access-item"] [data-action="access-delete"]'));
  await p.fill('[data-form="access-item"] [name=name]', 'Adobe CC'); await p.fill('[data-form="access-item"] [name=url]', 'ftp://bad');
  await p.click('[data-form="access-item"] [type=submit]'); await p.waitForTimeout(200);
  await p.fill('[data-form="access-item"] [name=url]', 'https://adobe.com');
  await p.click('[data-form="access-item"] [type=submit]'); await p.waitForTimeout(400);
  log('  insert:', JSON.stringify((await calls('insert')).filter((c) => c[1] === 'access_items').map((c) => c[2])), '| secret modal open', await open('access-secret'));
  await p.fill('[data-form="access-secret"] [name=login]', 'design@gapsy.studio'); await p.fill('[data-form="access-secret"] [name=password]', 'Pa55');
  await p.click('[data-form="access-secret"] [type=submit]'); await p.waitForTimeout(300);
  const set = (await calls('rpc')).filter((c) => c[1] === 'access_set_secret');
  log('  set_secret:', JSON.stringify(set.map((c) => ({ item: c[2].item, login: c[2].login, hasPassword: !!c[2].password }))), '| password field cleared', await p.$eval('[data-form="access-secret"] [name=password]', (e) => e.value === ''));

  // ---------- developer: кнопок доступу немає
  await p.addInitScript(() => { window.__FIXPATCH = { profiles: [{ id: 'u1', email: 'dev@gapsy.studio', full_name: 'Розробник', role: 'developer' }] }; });
  await go('/access');
  log('DEVELOPER rows:', await n(row), '| reveal buttons:', await n(`${row} [data-action="access-reveal"]`), '| set buttons:', await n(`${row} [data-action="access-secret"]`), '| edit buttons:', await n(`${row} [data-action="access-edit"]`));
  await p.click(`${row} [data-action="access-edit"]`); await p.waitForTimeout(200);
  log('  edit modal delete btn:', await n('[data-modal="access-item"] [data-action="access-delete"]'), '| name', await p.$eval('[data-form="access-item"] [name=name]', (e) => e.value));
  await p.click('[data-form="access-item"] [type=submit]'); await p.waitForTimeout(300);
  log('  dev update:', JSON.stringify((await calls('update')).filter((c) => c[1] === 'access_items').map((c) => Object.keys(c[2]))), '| secret modal not opened', !(await open('access-secret')));

  // ---------- ?id= відкриває потрібний таб
  await go('/access?id=ac3');
  log('BY ID tab:', await p.$eval('[data-tabs="access"] .is-active', (e) => e.dataset.tab), '| row:', await t(`${row} [data-field="name"]`));

  log('\nERRORS:', errs.length ? errs.join('\n') : 'none');
  await b.close();
})();
