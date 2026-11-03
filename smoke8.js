const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('dialog', (d) => d.accept());
  await p.goto('http://localhost:8765/doc?id=a54a1d3f-84ec-5141-a796-c92a0aaa15de'); await p.waitForTimeout(900);
  await p.click('[data-action="doc-edit"]'); await p.waitForTimeout(2000);
  console.log('icon editable:', await p.$eval('[data-doc="icon"]', (e) => e.contentEditable), await p.$eval('[data-doc="icon"]', (e) => e.title));
  await p.$eval('[data-doc="icon"]', (e) => { e.textContent = '🧑‍💻 ok'; e.dispatchEvent(new Event('blur')); });
  console.log('after blur:', await p.$eval('[data-doc="icon"]', (e) => e.textContent));
  await p.click('[data-action="doc-save"]'); await p.waitForTimeout(700);
  const up = await p.evaluate(() => __calls.filter((c) => c[0] === 'update' && c[1] === 'docs').pop()[2]);
  console.log('saved icon:', up.icon, '| tree icon:', await p.$eval('.docs_tree-link.is-active [data-field="icon"]', (e) => e.textContent), '| read mode:', await p.$eval('[data-doc="icon"]', (e) => e.contentEditable));
  await p.click('[data-action="doc-edit"]'); await p.waitForTimeout(800);
  await p.$eval('[data-doc="icon"]', (e) => { e.textContent = 'abc'; e.dispatchEvent(new Event('blur')); });
  await p.click('[data-action="doc-save"]'); await p.waitForTimeout(700);
  console.log('non-emoji →', JSON.stringify(await p.evaluate(() => __calls.filter((c) => c[0] === 'update' && c[1] === 'docs').pop()[2].icon)));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
