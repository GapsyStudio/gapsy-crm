// v0.8: таби з панелями, мобільне меню, «+ Сторінка» в групі
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8765/docs'); await p.waitForTimeout(900);
  await p.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div data-tabs="t"><a href="#" data-tab="a" class="is-active">A</a><a href="#" data-tab="b">B</a></div><section data-tab-panel="t:a" id="pa">A</section><section data-tab-panel="t:b"><div id="deep">B</div></section><a href="#" data-action="toggle-nav" aria-expanded="false">☰</a>'));
  await p.click('[data-tab="b"]');
  console.log('after B:', await p.$eval('#pa', (e) => e.hidden), await p.$eval('[data-tab-panel="t:b"]', (e) => e.hidden), await p.evaluate(() => location.hash));
  await p.evaluate(() => CRM.showTab('t', 'a'));
  console.log('showTab a:', await p.$eval('#pa', (e) => e.hidden), await p.$eval('[data-tab="a"]', (e) => e.classList.contains('is-active')));
  await p.click('[data-action="toggle-nav"]');
  console.log('nav open:', await p.evaluate(() => document.documentElement.classList.contains('crm-nav-open')), await p.$eval('[data-action="toggle-nav"]', (e) => e.getAttribute('aria-expanded')));
  await p.keyboard.press('Escape');
  console.log('nav after Esc:', await p.evaluate(() => document.documentElement.classList.contains('crm-nav-open')));
  console.log('cards have data-doc-id:', await p.$$eval('[data-list="docs-sections"] > [data-rendered]', (x) => x.every((c) => c.dataset.docId)));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
