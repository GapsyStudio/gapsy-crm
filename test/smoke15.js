// Смоук v0.11: завантаження файлів шрифтів зі сторінки, видалення проєкту, Showcase, коментаря, скріна.
// Запуск: node server.js, потім node smoke15.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicons|TUNNEL/.test(m.text())) errs.push(m.text()); });
  const dialogs = []; let promptAnswer = 'CloudVno';
  p.on('dialog', async (d) => { dialogs.push(d.type() + ':' + d.message().split('\n')[0]); if (d.type() === 'prompt') await d.accept(promptAnswer); else await d.accept(); });
  const go = async (u) => { await p.goto('http://localhost:8765' + u); await p.waitForTimeout(900); };
  const calls = () => p.evaluate(() => __calls.map((c) => [c[0], c[1], c[0] === 'storage-remove' ? c[2] : c[2]]));
  const font = (name) => ({ name, mimeType: 'font/otf', buffer: Buffer.from('OTTO') });

  // 1. Шрифти: кнопка «Завантажити файли»
  await go('/fonts');
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-action="font-upload"]')]);
  await fc.setFiles([font('NeueMontreal-Medium.otf'), font('NeueMontreal-Bold.woff2'), font('Satoshi-BlackItalic.otf'), font('Satoshi-Regular (1).otf'), { name: 'readme.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }]);
  await p.waitForTimeout(800);
  let c = await calls();
  console.log('fonts insert:', JSON.stringify(c.filter((x) => x[0] === 'insert' && x[1] === 'fonts').map((x) => x[2].name)));
  console.log('font_files insert:', JSON.stringify(c.filter((x) => x[0] === 'insert' && x[1] === 'font_files').map((x) => x[2].map((r) => `${r.font_id}:${r.filename}:${r.weight}${r.style === 'italic' ? 'i' : ''}`))));
  // 1b. перетягування на сторінку
  await p.evaluate(() => { __calls.length = 0; });
  await p.evaluate(() => {
    const dt = new DataTransfer(); dt.items.add(new File(['x'], 'Inter-SemiBold.ttf'));
    const el = document.querySelector('[data-element="fonts"]');
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    window.__dragCls = el.classList.contains('is-dragover');
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await p.waitForTimeout(600);
  c = await calls();
  console.log('drag highlight:', await p.evaluate(() => window.__dragCls), '| drop → fonts insert:', c.filter((x) => x[0] === 'insert' && x[1] === 'fonts').length, '| files:', JSON.stringify(c.filter((x) => x[1] === 'font_files').map((x) => x[2].map((r) => r.font_id + ':' + r.weight))));

  // 2. Проєкти: Shift+клік → видалити (неправильна назва, потім правильна)
  await go('/projects');
  await p.click('[data-list="projects"] > [data-rendered]', { modifiers: ['Shift'] });
  await p.waitForTimeout(300);
  console.log('delete btn visible in edit:', await p.isVisible('[data-modal="project"] [data-action="project-delete"]'));
  promptAnswer = 'не те';
  await p.click('[data-modal="project"] [data-action="project-delete"]'); await p.waitForTimeout(300);
  console.log('wrong name → deletes:', (await calls()).filter((x) => x[0] === 'delete' && x[1] === 'projects').length);
  promptAnswer = 'cloudvno';
  await p.click('[data-modal="project"] [data-action="project-delete"]'); await p.waitForTimeout(400);
  console.log('right name → deletes:', (await calls()).filter((x) => x[0] === 'delete' && x[1] === 'projects').length);
  await go('/projects'); await p.click('[data-action="open:project"]').catch(() => {});
  console.log('delete btn hidden for new:', !(await p.isVisible('[data-modal="project"] [data-action="project-delete"]')));

  // 3. Showcase
  await go('/showcase');
  await p.click('[data-list="showcase-all"] > [data-rendered] [data-action="edit"]'); await p.waitForTimeout(300);
  await p.click('[data-action="showcase-delete"]'); await p.waitForTimeout(300);
  c = await calls();
  console.log('showcase delete:', c.filter((x) => x[0] === 'delete' && x[1] === 'showcase_items').length, '| cover removed:', JSON.stringify(c.filter((x) => x[0] === 'storage-remove').map((x) => x[2])));

  // 4. Правка: коментарі та скрін
  await go('/feedback-item?id=f1');
  const vis = await p.$$eval('[data-list="comments"] > [data-rendered]', (x) => x.map((e) => e.querySelector('[data-action="comment-delete"]').hidden ? 'hidden' : 'shown'));
  console.log('comment delete (own, other; I am admin):', vis.join(','));
  await p.click('[data-list="comments"] > [data-rendered] [data-action="comment-delete"]'); await p.waitForTimeout(300);
  console.log('comment delete calls:', (await calls()).filter((x) => x[0] === 'delete' && x[1] === 'feedback_comments').length);
  await p.click('[data-list="feedback-files"] > [data-rendered]'); await p.waitForTimeout(300);
  await p.click('[data-action="shot-delete"]'); await p.waitForTimeout(400);
  c = await calls();
  console.log('shot delete:', c.filter((x) => x[0] === 'delete' && x[1] === 'feedback_files').length, '| storage:', JSON.stringify(c.filter((x) => x[0] === 'storage-remove').map((x) => x[2])), '| thumbs left:', await p.$$eval('[data-list="feedback-files"] > [data-rendered]', (x) => x.length));
  console.log('dialogs:', dialogs.length);
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
