// Смоук v0.14: категорії Showcase. Запуск: node server.js, потім node smoke19.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  let answer = 'Сайти'; p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? answer : undefined));
  await p.goto('http://localhost:8765/showcase'); await p.waitForTimeout(1200);
  const tabs = () => p.$$eval('[data-tabs="category"] [data-tab]', (x) => x.map((t) => t.dataset.tab + ':' + t.textContent + (t.classList.contains('is-active') ? '*' : '')).join(' '));
  console.log('tabs (only used + all):', await tabs());
  console.log('select options:', await p.$$eval('[data-form="showcase-item"] select[name=category] option', (x) => x.map((o) => o.value + ':' + o.text).join(',')));
  console.log('card badge:', await p.$eval('[data-list="showcase-all"] > [data-rendered] [data-field="category"]', (e) => e.textContent + ' ' + e.className).catch(() => 'no field'));
  await p.click('[data-tabs="category"] [data-tab="site"]'); await p.waitForTimeout(200);
  console.log('after click site:', await tabs(), '| cards', await p.$$eval('[data-list="showcase-all"] > [data-rendered]', (x) => x.length));
  await p.click('[data-action="open:showcase-cats"]'); await p.waitForTimeout(300);
  console.log('cats list:', await p.$$eval('[data-list="showcase-cats"] > [data-rendered]', (x) => x.map((e) => e.querySelector('[data-field="label"]').textContent + '(' + e.querySelector('[data-field="count"]').textContent + ')').join(', ')));
  await p.fill('[data-form="showcase-cat"] [name=label]', 'Реальна нерухомість'); await p.click('[data-form="showcase-cat"] [type=submit]'); await p.waitForTimeout(300);
  await p.fill('[data-form="showcase-cat"] [name=label]', 'saas'); await p.click('[data-form="showcase-cat"] [type=submit]'); await p.waitForTimeout(300);
  await p.click('[data-list="showcase-cats"] > [data-rendered] [data-action="cat-rename"]'); await p.waitForTimeout(300);
  await p.click('[data-list="showcase-cats"] > [data-rendered] [data-action="cat-color"]'); await p.waitForTimeout(300);
  await p.click('[data-list="showcase-cats"] > [data-rendered]:nth-of-type(4) [data-action="cat-delete"]'); await p.waitForTimeout(300);
  const c = await p.evaluate(() => __calls.filter((x) => x[1] === 'showcase_categories' && x[0] !== 'select' || (x[0] === 'rpc' && x[1] === 'showcase_category_delete')).map((x) => x[0] + ' ' + JSON.stringify(x[2])));
  console.log('calls:', c.join(' | '));
  console.log('toasts:', await p.$$eval('.crm-toast, [data-toast]', (x) => x.map((e) => e.textContent).join(' / ')).catch(() => ''));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
