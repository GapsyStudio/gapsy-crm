// Смоук v0.9: іконки без 📄, картки команди, порожні рядки таблиці, статуси українською.
// Запуск: DOCS_JSON=<docs після 009> node server.js, потім node smoke13.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const go = async (u) => { await p.goto('http://localhost:8765' + u); await p.waitForTimeout(900); };
  // Team → картки людей за відділами
  await go('/doc?id=7e807fea-dd2c-58e6-ae2d-b5649f61b679');
  console.log('team: groups', await p.$$eval('.doc_people-group', (x) => x.map((e) => e.textContent)));
  console.log('team: people', await p.$$eval('.doc_person', (x) => x.length), '| table shown', await p.$$eval('.doc_table', (x) => x.length));
  console.log('team: first card', await p.$eval('.doc_person', (e) => [e.querySelector('.doc_person-avatar').textContent, e.querySelector('.doc_person-name').textContent, e.querySelector('.doc_person-role')?.textContent, [...e.querySelectorAll('a')].map((a) => a.getAttribute('href').split(':')[0])]));
  console.log('team: icon', JSON.stringify(await p.$eval('[data-doc="icon"]', (e) => e.textContent)), '| tree has 📄', await p.$$eval('[data-list="docs-tree"] [data-field="icon"]', (x) => x.some((e) => e.textContent === '📄')));
  // All gadgets → звичайна таблиця, без порожнього рядка
  await go('/doc?id=bbed47e0-9c12-5b63-b826-b5a70d7b09eb');
  console.log('gadgets: people cards', await p.$$eval('.doc_person', (x) => x.length), '| rows', await p.$$eval('.doc_table tbody tr', (x) => x.length));
  // документ без іконки → порожньо; з іконкою → емодзі
  await go('/doc?id=bf45b45d-c0f5-5e9e-8b0e-6e2c3a2f2d7c');
  const sales = await p.evaluate(() => __FIXPATCH.docs.find((d) => d.title === 'Sales'));
  await go('/doc?id=' + sales.id);
  console.log('sales icon', await p.$eval('[data-doc="icon"]', (e) => e.textContent), '| title', await p.$eval('[data-doc="title"]', (e) => e.textContent));
  const plain = await p.evaluate(() => __FIXPATCH.docs.find((d) => d.title === 'Card 1'));
  await go('/doc?id=' + plain.id);
  console.log('no-icon doc icon empty:', await p.$eval('[data-doc="icon"]', (e) => e.textContent === ''));
  // /docs: немає 📄
  await go('/docs');
  console.log('docs page 📄 count:', await p.evaluate(() => (document.body.innerText.match(/📄/g) || []).length - (document.querySelector('[data-template]')?.innerText.match(/📄/g) || []).length));
  console.log('status labels:', await p.evaluate(() => Object.values(CRM.FEEDBACK_STATUS).map((v) => v[0]).join(', ')));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
