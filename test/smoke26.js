// Смоук v0.20.1: дизайн-аудит — data-ready, чекліст/очікування в «Огляді», категорія showcase, плашка без обкладинки,
// секція позначок без скрінів, нумерація OL у документі, прев'ю шрифту без файлів.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (url, fix = {}) => {
    const ctx = await b.newContext();
    await ctx.addInitScript((fix) => { window.__FIXPATCH = fix; }, fix);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${url}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(`${url}: ${m.text()}`); });
    await p.goto(`http://localhost:8765${url}`); await p.waitForTimeout(1500);
    return p;
  };
  // проєкт: штучно додаємо таби/панелі, як на живому сайті
  let p = await open('/project?id=p1', { showcase_categories: [{ slug: 'site', label: 'Сайт' }], showcase_items: [{ id: 's1', title: 'CV', url: 'https://cloudvno.com', category: 'site' }] });
  console.log('project ready:', await p.$eval('[data-element="project"]', (r) => r.dataset.ready));
  console.log('showcase label:', await p.$$eval('[data-list="project-showcase"] > [data-rendered]', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim() + ' ' + e.target)));
  console.log('waits panel:', await p.$eval('[data-waits]', (s) => s.dataset.tabPanel || '(нема панелей у моку)'));
  await p.context().close();

  p = await open('/showcase', { showcase_items: [{ id: 's2', title: 'Без обкладинки', url: 'https://www.lumen.io/x', category: 'site', cover_path: null, is_best: false, status: 'published', project: null }] });
  console.log('nocover:', await p.$$eval('.crm-nocover', (x) => x.map((e) => e.textContent)), 'img hidden:', await p.$$eval('[data-list] img[hidden]', (x) => x.length));
  await p.context().close();

  p = await open('/feedback-item?id=f1', { feedback_files: [], feedback_marks: [] });
  console.log('fi ready:', await p.$eval('[data-element="feedback-item"]', (r) => r.dataset.ready), '| marks section hidden:', await p.$eval('[data-list="marks"]', (l) => l.closest('section').hidden));
  await p.context().close();
  p = await open('/feedback-item?id=f1');
  console.log('marks section with files hidden:', await p.$eval('[data-list="marks"]', (l) => l.closest('section').hidden));
  await p.context().close();

  p = await open('/fonts');
  console.log('font fallback:', await p.$$eval('[data-font-preview]', (x) => x.filter((e) => e.closest('[data-rendered]')).map((e) => e.classList.contains('is-fallback'))));
  await p.context().close();

  console.log('\nerrors:', errs.length ? errs : 'none');
  await b.close();
})();
