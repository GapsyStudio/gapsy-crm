// Смоук v0.16: швидкий доступ — закріплення сторінок CRM і посилань. Запуск: node server.js, потім node smoke21.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const errs = [];
  const page = async () => { const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); return p; };
  const pins = (p) => p.$$eval('[data-list="pins"] > [data-rendered]', (x) => x.map((e) => e.querySelector('[data-field="title"]').textContent + ' <' + e.getAttribute('href') + '> ' + e.querySelector('[data-field="host"]').textContent + (e.target ? ' _blank' : '')));
  let p = await page();
  await p.goto('http://localhost:8765/app'); await p.waitForTimeout(1200);
  console.log('initial:', JSON.stringify(await pins(p)));
  console.log('no star on /app:', !(await p.$('[data-action="pin-page"]')));
  await p.click('[data-action="open:pin"]'); await p.waitForTimeout(400);
  console.log('picker + url type:', !!(await p.$('[data-pin-search]')), await p.$eval('[name="url"]', (e) => e.type));
  console.log('sections:', await p.$$eval('.pin_option', (x) => x.map((e) => e.textContent).join(' | ')));
  await p.fill('[data-pin-search]', 'Кнопка'); await p.waitForTimeout(500);
  console.log('search:', await p.$$eval('.pin_option', (x) => x.map((e) => e.textContent).join(' | ')));
  await p.press('[data-pin-search]', 'Enter'); await p.waitForTimeout(200);
  console.log('filled:', await p.$eval('[name="title"]', (e) => e.value), await p.$eval('[name="url"]', (e) => e.value));
  await p.click('[data-form="pin"] button[type="submit"]'); await p.waitForTimeout(600);
  const ins = () => p.evaluate(() => window.__calls.filter((c) => c[0] === 'insert' && c[1] === 'pins').map((c) => c[2]));
  console.log('inserted:', JSON.stringify(await ins()));
  // зовнішнє посилання і невалідне
  await p.click('[data-action="open:pin"]'); await p.waitForTimeout(300);
  await p.fill('[name="title"]', 'Погане'); await p.fill('[name="url"]', 'javascript:alert(1)');
  await p.click('[data-form="pin"] button[type="submit"]'); await p.waitForTimeout(400);
  console.log('bad rejected:', !(await ins()).some((x) => x.title === 'Погане'));
  await p.fill('[name="url"]', 'http://localhost:8765/feedback?x=1'); await p.fill('[name="title"]', 'Правки фільтр');
  await p.click('[data-form="pin"] button[type="submit"]'); await p.waitForTimeout(500);
  console.log('same-origin → path:', JSON.stringify((await ins()).find((x) => x.title === 'Правки фільтр')));
  // × прибирає
  await p.click('[data-list="pins"] > [data-rendered]:has-text("Figma") .pin_remove'); await p.waitForTimeout(500);
  console.log('delete call:', JSON.stringify(await p.evaluate(() => window.__calls.filter((c) => c[0] === 'delete' || (c[1] === 'pins' && /eq|delete/.test(c[0]))).slice(-2))));
  // ⌘K показує закріплене
  await p.click('[data-action="open:search"]'); await p.waitForTimeout(300);
  console.log('cmdk:', await p.$$eval('[data-list="search"] > [data-rendered]', (x) => x.slice(0, 3).map((e) => e.textContent).join(' | ')));
  // зірочка на іншій сторінці
  const q = await page();
  await q.goto('http://localhost:8765/feedback'); await q.waitForTimeout(1200);
  const star = '[data-action="pin-page"]';
  console.log('star:', !!(await q.$(star)), await q.$eval(star, (e) => e.getAttribute('aria-pressed')), '| before theme:', await q.$eval(star, (e) => e.nextElementSibling?.dataset.action));
  await q.click(star); await q.waitForTimeout(500);
  console.log('pinned:', await q.$eval(star, (e) => e.getAttribute('aria-pressed') + ' ' + e.className));
  await q.click(star); await q.waitForTimeout(500);
  console.log('unpinned:', await q.$eval(star, (e) => e.getAttribute('aria-pressed')));
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
