// v0.8: Cmd+K без запиту (нещодавнє + розділи), локалізація форм Webflow, групи не в «Нещодавніх»
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const go = async (u) => { await p.goto('http://localhost:8765' + u); await p.waitForTimeout(900); };
  await go('/doc?id=446d5d4c-76bb-59b9-a703-dda2a37087f1'); await p.waitForTimeout(2300);
  console.log('recent saved:', await p.evaluate(() => localStorage.getItem('crm-recent')));
  await go('/docs');
  await p.keyboard.press('Meta+k'); await p.waitForTimeout(300);
  console.log('quick (empty q):', await p.$$eval('[data-list="search"] > [data-rendered]', (x) => x.map((e) => e.textContent).join(' | ')));
  console.log('recent docs on /docs has groups:', await p.$$eval('[data-list="docs-recent"] > [data-rendered]', (x) => x.some((e) => /Старт|Команда|Продажі|Як ми працюємо/.test(e.textContent))));
  console.log('forms:', await p.$eval('form[data-form="profile"]', (f) => [...f.elements].map((e) => e.type === 'submit' ? e.value + '/' + e.dataset.wait : e.name + '=' + JSON.stringify(e.placeholder)).join(' ')));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
