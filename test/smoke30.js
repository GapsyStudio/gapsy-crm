// Смоук v0.23.1: «Код мосту» копіює рядок для Footer сайту
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(() => { window.__FIXPATCH = { feedback: [{ id: 'f1', title: 'К', status: 'new', priority: 'normal', created_at: new Date().toISOString(), author_id: 'u1', project: null, author: { full_name: 'Н' }, page_url: 'http://localhost:8766/evil' }], feedback_files: [], feedback_marks: [] }; });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8765/feedback-item?id=f1'); await p.waitForTimeout(1200);
  await p.click('[data-review-card] [data-rv="bridge"]'); await p.waitForTimeout(200);
  console.log('card copy:', await p.evaluate(() => navigator.clipboard.readText()));
  await p.click('[data-review-card] [data-rv="open"]'); await p.waitForTimeout(9000);
  console.log('fail status has copy:', !!(await p.$('.rv_status [data-rv="bridge"]')));
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
