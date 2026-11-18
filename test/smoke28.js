// Смоук v0.22: скріни до пінів (вставити ⌘V / вибрати файл / перетягнути), мініатюри, перегляд, без міграції 024.
const { chromium } = require('playwright');
const CSS = ['../webflow/v021.css', '../webflow/v022.css'].map((f) => require('fs').readFileSync(require('path').join(__dirname, f), 'utf8')).join('\n') + '[hidden]{display:none!important}';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEJMDGgAQYGBgB1BgH/0XW8iAAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (url, fix = {}, extra = '') => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(({ fix, extra }) => { window.__FIXPATCH = fix; window.__PERSIST_MARKS = true; if (extra) eval(extra); }, { fix, extra });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${url}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/review_width|does not exist/.test(m.text())) errs.push(`${url}: ${m.text()}`); });
    await p.goto(`http://localhost:8765${url}`); await p.addStyleTag({ content: CSS }); await p.waitForTimeout(1200);
    return p;
  };
  const now = new Date().toISOString();
  const F = (extra = {}) => ({ feedback: [{ id: 'f1', title: 'Кнопка', status: 'new', priority: 'normal', created_at: now, author_id: 'u1', project: { id: 'p1', name: 'CloudVno' }, author: { full_name: 'Нелія' }, page_url: 'http://localhost:8766/landing', ...extra }],
    feedback_files: [], feedback_marks: [{ id: 'm1', file_id: null, x: .2, y: .1, note: 'Логотип', anchor: { w: 1440, py: 120, dh: 2964 }, done: false, created_by: 'u1', created_at: now, author: { full_name: 'Нелія' } }],
    feedback_mark_files: [{ id: 'mf0', mark_id: 'm1', feedback_id: 'f1', path: 'feedback-marks/u1/a.png', created_by: 'u1', created_at: now }] });
  const paste = (sel) => `(() => { const dt = new DataTransfer(); const bin = atob('${PNG.toString('base64')}'); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    dt.items.add(new File([u], 'figma.png', { type: 'image/png' })); const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); document.querySelector('${sel}').dispatchEvent(ev); return ev.defaultPrevented; })()`;

  // 1) Головна сторінка правки: мініатюра наявного скріна в списку «Позначки»
  let p = await open('/feedback-item?id=f1', F());
  console.log('main list thumbs:', await p.$$eval('[data-list="marks"] > [data-rendered] .pf_thumb', (x) => x.length), '| + Скрін:', !!(await p.$('[data-list="marks"] .pf_add')));
  // лайтбокс
  await p.click('[data-list="marks"] .pf_thumb-btn'); await p.waitForTimeout(150);
  console.log('lightbox open:', !!(await p.$('.pf_lightbox')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  console.log('lightbox closed:', !(await p.$('.pf_lightbox')));
  // «+ Скрін» до наявного піна
  await p.setInputFiles('[data-list="marks"] .pf_add input[type=file]', { name: 'fix.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForTimeout(600);
  console.log('add to existing:', JSON.stringify(await p.evaluate(() => window.__calls.filter((c) => c[1] === 'feedback_mark_files' || c[0] === 'storage-upload').map((c) => c[0] === 'storage-upload' ? ['upload', c[2].split('/')[0]] : ['insert', c[2].mark_id, c[2].feedback_id, c[2].path.split('/')[0]]))));
  console.log('thumbs now:', await p.$$eval('[data-list="marks"] > [data-rendered] .pf_thumb', (x) => x.length));
  // не-картинка відхиляється
  await p.setInputFiles('[data-list="marks"] .pf_add input[type=file]', { name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
  await p.waitForTimeout(300);
  console.log('pdf rejected:', await p.evaluate(() => window.__calls.filter((c) => c[0] === 'storage-upload').length) === 1);

  // 2) Режим ревʼю: новий пін + ⌘V картинки з «Figma»
  await p.click('[data-review-card] [data-rv="open"]'); await p.waitForTimeout(1500);
  console.log('review row thumbs:', await p.$$eval('.rv_pin .pf_thumb', (x) => x.length));
  const frame = p.frames().find((fr) => fr.url().startsWith('http://localhost:8766'));
  const box = await (await p.$('.rv_frame')).boundingBox();
  await p.mouse.click(box.x + 400, box.y + 300); await p.waitForTimeout(300);
  console.log('picker visible:', await p.$eval('.rv_form .pf_picker', (e) => !e.hidden && !!e.offsetParent));
  console.log('paste handled:', await p.evaluate(paste('.rv_form textarea')));
  console.log('pending thumbs:', await p.$$eval('.rv_form .pf_thumb', (x) => x.length));
  await p.fill('.rv_form textarea', 'Ось як має бути (з Figma)');
  const before = await p.evaluate(() => window.__calls.length);
  await p.click('.rv_form [type="submit"]'); await p.waitForTimeout(800);
  const calls = await p.evaluate((n) => window.__calls.slice(n).filter((c) => c[0] === 'insert' || c[0] === 'storage-upload').map((c) => c[0] === 'insert' ? [c[1], c[2].mark_id || ''] : ['upload']), before);
  console.log('save order:', JSON.stringify(calls));
  console.log('new pin thumbs:', await p.$$eval('.rv_pin', (rows) => rows.map((r) => r.querySelectorAll('.pf_thumb').length)));
  console.log('form cleared:', await p.$$eval('.rv_form .pf_thumb', (x) => x.length) === 0);
  await p.context().close();

  // 3) Без міграції 024: жодних помилок, поле вкладень сховане, мініатюр і «+ Скрін» немає
  p = await open('/feedback-item?id=f1', F(), "window.__ERR_TABLES=['feedback_mark_files']");
  console.log('no-024: thumbs', await p.$$eval('.pf_thumb', (x) => x.length), '| add', !!(await p.$('.pf_add')));
  await p.click('[data-review-card] [data-rv="open"]'); await p.waitForTimeout(1500);
  const box2 = await (await p.$('.rv_frame')).boundingBox();
  await p.mouse.click(box2.x + 400, box2.y + 300); await p.waitForTimeout(300);
  console.log('no-024: picker hidden', await p.$eval('.rv_form .pf_picker', (e) => e.hidden));
  await p.context().close();

  console.log('\nerrors:', errs.length ? errs : 'none');
  await b.close();
})();
