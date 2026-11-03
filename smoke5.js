// Смоук v0.5: мудборд у картці проєкту + реєстр шрифтів. Запуск: node server.js, потім node smoke5.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext();
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  p.on('dialog', (d) => d.accept());
  const go = async (u) => { await p.goto('http://localhost:8765' + u); await p.waitForTimeout(900); };
  const t = (s) => p.$eval(s, (e) => e.textContent.trim()).catch(() => 'MISSING ' + s);
  const n = (s) => p.$$eval(s, (x) => x.length);
  const calls = (f) => p.evaluate((f) => __calls.filter((c) => c[1] === f || c[0] === f), f);
  const hidden = (s) => p.$eval(s, (e) => e.hidden).catch(() => 'MISSING');
  const log = (...a) => console.log(...a);
  const tmp = (name, bytes) => { const f = path.join('/tmp', name); fs.writeFileSync(f, bytes); return f; };

  // ---------- мудборд
  await go('/project?id=p1');
  const card = '[data-list="moodboard"] [data-rendered]';
  log('MOOD cards:', await n(card), '| count:', await t('[data-count="moodboard"]'));
  log('  image card: bg', await p.$eval(card, (e) => (e.querySelector('[data-mood-img]').style.backgroundImage || '').slice(0, 15)),
    '| link hidden', await p.$eval(card, (e) => e.querySelector('[data-mood-link]').hidden), '| href target', await p.$eval(card, (e) => e.querySelector('[data-action="mood-open"]').target));
  log('  link card:', JSON.stringify(await p.$$eval(card, (x) => { const e = x[1]; return { host: e.querySelector('[data-field="host"]').textContent,
    imgHidden: e.querySelector('[data-mood-img]').hidden, href: e.querySelector('[data-action="mood-open"]').getAttribute('href'), titleHidden: e.querySelector('[data-field="title"]').hidden }; })));
  // картинка через input (клік по зоні відкриває file chooser)
  const png = tmp('ref.png', Buffer.from('89504e470d0a1a0a', 'hex'));
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-mood-drop]')]);
  await chooser.setFiles(png); await p.waitForTimeout(400);
  const mi = (await calls('insert')).filter((c) => c[1] === 'moodboard_items');
  log('  image insert:', JSON.stringify(mi.map((c) => c[2])));
  // посилання: неправильне → тост, без запиту; правильне → insert
  await p.click('[data-action="open:mood-link"]'); await p.fill('[name=url]', 'javascript:alert(1)');
  await p.$eval('[data-form="mood-link"]', (f) => f.requestSubmit()); await p.waitForTimeout(200);
  await p.fill('[name=url]', 'https://dribbble.com/shots/1'); await p.fill('[data-form="mood-link"] [name=title]', 'Кнопки');
  await p.$eval('[data-form="mood-link"]', (f) => f.requestSubmit()); await p.waitForTimeout(300);
  log('  link inserts:', JSON.stringify((await calls('insert')).filter((c) => c[1] === 'moodboard_items').slice(1).map((c) => c[2])));
  await p.click(`${card} [data-action="mood-delete"]`); await p.waitForTimeout(300);
  log('  delete calls:', (await calls('delete')).filter((c) => c[1] === 'moodboard_items').length, '| storage remove:', JSON.stringify((await calls('storage-remove')).map((c) => c[2])), '| cards after:', await n(card));
  // шрифти проєкту
  const pf = '[data-list="project-fonts"] [data-rendered]';
  log('PROJECT FONTS:', JSON.stringify(await p.$$eval(pf, (x) => x.map((e) => [e.querySelector('[data-field="name"]').textContent, e.querySelector('[data-field="license"]').textContent, e.querySelector('[data-field="warning"]').hidden ? '-' : e.querySelector('[data-field="warning"]').textContent, e.getAttribute('href')]))));

  // ---------- /fonts
  await go('/fonts');
  const fc = '[data-list="fonts"] [data-rendered]';
  log('FONTS cards:', await n(fc), '| problems count:', await t('[data-count="font-problems"]'));
  log('  rows:', JSON.stringify(await p.$$eval(fc, (x) => x.map((e) => [e.querySelector('[data-field="name"]').textContent, e.querySelector('[data-field="license"]').textContent,
    e.querySelector('[data-field="allowed"]').textContent, e.querySelector('[data-field="warning"]').hidden ? '-' : e.querySelector('[data-field="warning"]').textContent,
    e.querySelector('[data-field="projects"]').textContent, e.querySelector('[data-field="files"]').textContent]))));
  await p.click('[data-tab="problems"]'); log('  problems tab:', await n(fc));
  await p.click('[data-tab="all"]'); await p.fill('[data-fonts-search]', 'pangram'); await p.waitForTimeout(100); log('  search pangram:', await n(fc));
  await p.fill('[data-fonts-search]', 'cloud'); await p.waitForTimeout(100); log('  search by project:', await n(fc));
  await p.fill('[data-fonts-search]', '');
  // новий шрифт
  await p.click('[data-action="font-new"]'); await p.waitForTimeout(300);
  log('  new: title', await t('[data-font-title]'), '| license opts', await n('[name=license] option'), '=', await p.$eval('[name=license]', (e) => e.value),
    '| owner', await p.$eval('[name=owner]', (e) => e.value), '| files block hidden', await hidden('[data-font-files-block]'), '| delete hidden', await hidden('[data-action="font-delete"]'),
    '| project chips', await n('[data-list="font-project-pick"] [data-rendered]'));
  await p.fill('[data-form="font"] [name=name]', 'Gilroy'); await p.selectOption('[name=license]', 'commercial');
  await p.click('[data-allow="web"]'); await p.click('[data-allow="desktop"]'); await p.click('[data-allow="desktop"]');
  await p.click('[data-list="font-project-pick"] [data-rendered]');
  await p.fill('[name=pageviews_limit]', '10000');
  await p.click('[data-form="font"] [type=submit]'); await p.waitForTimeout(500);
  log('  font insert:', JSON.stringify((await calls('insert')).filter((c) => c[1] === 'fonts').map((c) => c[2])));
  log('  font_projects insert:', JSON.stringify((await calls('insert')).filter((c) => c[1] === 'font_projects').map((c) => c[2])));
  await p.keyboard.press('Escape');
  // редагувати Neue Montreal: файли, зняти проєкт
  await p.click(`${fc} [data-action="font-edit"]`); await p.waitForTimeout(300);
  log('  edit: title', await t('[data-font-title]'), '| license', await p.$eval('[name=license]', (e) => e.value), '| web chip', await p.$eval('[data-allow="web"]', (e) => e.classList.contains('is-active')),
    '| desktop chip', await p.$eval('[data-allow="desktop"]', (e) => e.classList.contains('is-active')), '| files', JSON.stringify(await p.$$eval('[data-list="font-files"] [data-rendered] [data-field="variant"]', (x) => x.map((e) => e.textContent))),
    '| active projects', await n('[data-list="font-project-pick"] .is-active'), '| license-open hidden', await hidden('[data-action="font-license-open"]'));
  const woff = tmp('NeueMontreal-MediumItalic.woff2', Buffer.from('774f4632', 'hex'));
  const [ch2] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-action="font-files-add"]')]);
  await ch2.setFiles(woff); await p.waitForTimeout(400);
  log('  file insert:', JSON.stringify((await calls('insert')).filter((c) => c[1] === 'font_files').map((c) => c[2].map((r) => [r.filename, r.weight, r.style]))));
  await p.click('[data-list="font-project-pick"] .is-active'); // зняти CloudVno
  await p.click('[data-form="font"] [type=submit]'); await p.waitForTimeout(400);
  log('  update:', JSON.stringify((await calls('update')).filter((c) => c[1] === 'fonts').map((c) => ({ allowed: c[2].allowed, license: c[2].license }))),
    '| fp delete:', (await calls('delete')).filter((c) => c[1] === 'font_projects').length);
  // /fonts?id= відкриває модалку
  await go('/fonts?id=fo3');
  log('  open by id:', await p.$eval('[data-modal="font"]', (e) => e.classList.contains('is-open')), await t('[data-font-title]'), '| owner', await p.$eval('[name=owner]', (e) => e.value));

  log('\nERRORS:', errs.length ? errs.join('\n') : 'none');
  await b.close();
})();
