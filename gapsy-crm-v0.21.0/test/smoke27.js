// Смоук v0.21: ревʼю за посиланням. CRM на :8765, «сайт» з review-bridge.js на :8766 (інший origin).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (url, fix = {}, vw = 1440, host = 'localhost') => {
    const ctx = await b.newContext({ viewport: { width: vw, height: 900 } });
    await ctx.addInitScript((fix) => { window.__FIXPATCH = fix; window.__PERSIST_MARKS = true; }, fix);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${url}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/review_width/.test(m.text())) errs.push(`${url}: ${m.text()}`); });
    await p.goto(`http://${host}:8765${url}`); await p.waitForTimeout(1200);
    return p;
  };
  const F = (extra = {}) => ({ feedback: [{ id: 'f1', title: 'Кнопка в хедері', status: 'new', priority: 'normal', due_date: null, created_at: new Date().toISOString(), author_id: 'u1', assignee_id: null, project: { id: 'p1', name: 'CloudVno' }, author: { full_name: 'Нелія' }, assignee: null, page_url: 'http://localhost:8766/landing', review_width: 1440, ...extra }],
    feedback_files: [], feedback_marks: [] });

  // 1) Міст інертний поза iframe і без ?crm-review=1
  let ctx = await b.newContext(); let s = await ctx.newPage();
  await s.goto('http://localhost:8766/landing?crm-review=1'); await s.waitForTimeout(400);
  console.log('inert top-level:', !(await s.$('#crm-review-layer')) && !(await s.evaluate(() => document.documentElement.classList.contains('crm-commenting'))));
  await ctx.close();

  // 2) Без посилання: картка з формою
  let p = await open('/feedback-item?id=f1', F({ page_url: null }));
  console.log('card no url → form:', await p.$eval('[data-review-card] .rv_card-form', (f) => !f.hidden), '| open hidden:', await p.$eval('[data-review-card] [data-rv="open"]', (x) => x.hidden));
  await p.fill('[data-review-card] input[name="url"]', 'javascript:alert(1)'); await p.click('[data-review-card] .rv_card-form [type="submit"]'); await p.waitForTimeout(200);
  console.log('bad url rejected:', await p.evaluate(() => !window.__calls.some((c) => c[0] === 'update' && c[1] === 'feedback' && c[2]?.page_url)));
  await p.fill('[data-review-card] input[name="url"]', 'http://localhost:8766/landing'); await p.click('[data-review-card] .rv_card-form [type="submit"]'); await p.waitForTimeout(300);
  console.log('url saved:', JSON.stringify(await p.evaluate(() => window.__calls.filter((c) => c[0] === 'update' && c[1] === 'feedback').map((c) => c[2]))));
  await p.context().close();

  // 3) Відкриваємо ревʼю, ставимо пін кліком по сайту
  p = await open('/feedback-item?id=f1', F());
  await p.click('[data-review-card] [data-rv="open"]');
  await p.waitForTimeout(1500);
  const frame = p.frames().find((fr) => fr.url().startsWith('http://localhost:8766'));
  console.log('iframe src:', frame?.url(), '| status:', await p.$eval('.rv_status', (e) => e.textContent));
  console.log('commenting class on site:', await frame.evaluate(() => document.documentElement.classList.contains('crm-commenting')));
  // клік по кнопці CTA сайту в режимі Коментувати — кнопка НЕ має спрацювати, а пін — з'явитись
  const fe = await p.$('.rv_frame'); const box = await fe.boundingBox();
  const k = box.width / 1440;
  await frame.evaluate(() => window.scrollTo(0, 900));
  await p.waitForTimeout(200);
  await p.mouse.click(box.x + 300 * k, box.y + 200 * k);
  await p.waitForTimeout(300);
  console.log('form shown:', await p.$eval('.rv_form', (f) => !f.hidden), '| draft on site:', !!(await frame.$('[data-crm-pin="draft"]')));
  await p.fill('.rv_form textarea', 'Збільшити відступ');
  await p.click('.rv_form [type="submit"]'); await p.waitForTimeout(500);
  const ins = await p.evaluate(() => window.__calls.filter((c) => c[0] === 'insert' && c[1] === 'feedback_marks').map((c) => c[2]));
  console.log('insert:', JSON.stringify(ins));
  const py = ins[0]?.anchor?.py;
  console.log('py ≈ 900+200:', Math.abs(py - 1100) < 4, py);
  console.log('pins on site:', await frame.$$eval('[data-crm-pin]', (x) => x.map((e) => e.textContent + '@' + e.style.top)));
  console.log('list rows:', await p.$$eval('.rv_pin', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim())));
  // CTA не клацнувся
  await p.mouse.click(box.x + 60 * k, box.y + 8 * k); await p.waitForTimeout(200);
  console.log('CTA blocked in comment:', await frame.evaluate(() => !window.__ctaClicks));
  // Переглядати: шар прибрано, CTA працює
  await p.click('[data-rv="mode:browse"]'); await p.waitForTimeout(200);
  console.log('browse: no layer', !(await frame.$('#crm-review-layer')), '| class off', !(await frame.evaluate(() => document.documentElement.classList.contains('crm-commenting'))));
  await frame.click('#cta'); console.log('CTA works in browse:', await frame.evaluate(() => window.__ctaClicks === 1));
  // ширина 390: піни 1440 не на сайті, у «інших ширинах»
  await p.click('[data-rv="width:390"]'); await p.waitForTimeout(300);
  console.log('390: frame width', await p.$eval('.rv_frame', (f) => f.style.width), '| other:', await p.$eval('.rv_other', (e) => e.textContent), '| width saved:', await p.evaluate(() => window.__calls.some((c) => c[0] === 'update' && c[2]?.review_width === 390)));
  // перехід на іншу сторінку сайту в Browse → попередження, Коментувати вимкнено
  await frame.click('#nav-about'); await p.waitForTimeout(1200);
  console.log('other page warn:', await p.$eval('.rv_status', (e) => e.className + ' ' + e.textContent.slice(0, 40)), '| comment disabled:', await p.$eval('[data-rv="mode:comment"]', (x) => x.disabled));
  // Esc закриває (фокус — у панелі CRM, не в iframe)
  await p.focus('.rv_back'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  console.log('closed:', !(await p.$('.rv')), '| hash:', await p.evaluate(() => location.hash));
  console.log('main list label:', await p.$$eval('[data-list="marks"] > [data-rendered]', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim())));
  await p.context().close();

  // 4) CRM ігнорує повідомлення не від вікна iframe (вкладений чужий iframe шле фейкові newpin у top)
  p = await open('/feedback-item?id=f1#review', F({ page_url: 'http://localhost:8766/evil2' }));
  await p.waitForTimeout(1500);
  console.log('nested fake newpin ignored (form hidden):', await p.$eval('.rv_form', (f) => f.hidden));
  await p.context().close();
  // 5) Міст не говорить із CRM, чий origin не в data-crm-origin (CRM відкрито як 127.0.0.1) → через 8 с попередження
  p = await open('/feedback-item?id=f1#review', F(), 1440, '127.0.0.1');
  await p.waitForTimeout(9000);
  console.log('foreign CRM origin → no ready, warn:', await p.$eval('.rv_status', (e) => e.className.includes('is-warn') && e.textContent.includes('review-bridge')));
  await p.context().close();

  console.log('\nerrors:', errs.length ? errs : 'none');
  await b.close();
})();
