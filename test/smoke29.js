// Смоук v0.23: піни на внутрішніх сторінках сайту (anchor.path), рядок адреси, «На інших сторінках».
const { chromium } = require('playwright');
const CSS = ['../webflow/v021.css', '../webflow/v022.css', '../webflow/v023.css'].map((f) => require('fs').readFileSync(require('path').join(__dirname, f), 'utf8')).join('\n') + '[hidden]{display:none!important}';
(async () => {
  const b = await chromium.launch(); const errs = [];
  const now = new Date().toISOString();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((now) => { window.__PERSIST_MARKS = true; window.__FIXPATCH = {
    feedback: [{ id: 'f1', title: 'Кнопка', status: 'new', priority: 'normal', created_at: now, author_id: 'u1', project: { id: 'p1', name: 'CloudVno' }, author: { full_name: 'Нелія' }, page_url: 'http://localhost:8766/landing' }],
    feedback_files: [], feedback_mark_files: [],
    feedback_marks: [
      { id: 'old', file_id: null, x: .2, y: .1, note: 'Старий пін без path', anchor: { w: 1440, py: 120, dh: 2964 }, done: false, created_by: 'u1', created_at: now, author: { full_name: 'Нелія' } },
      { id: 'ab', file_id: null, x: .5, y: .2, note: 'Пін на About', anchor: { w: 1440, py: 300, dh: 2964, path: '/about' }, done: false, created_by: 'u1', created_at: now, author: { full_name: 'Нелія' } }] }; }, now);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/review_width/.test(m.text())) errs.push(m.text()); });
  await p.goto('http://localhost:8765/feedback-item?id=f1'); await p.addStyleTag({ content: CSS }); await p.waitForTimeout(1200);
  console.log('main list labels:', await p.$$eval('[data-list="marks"] > [data-rendered]', (x) => x.map((e) => e.textContent.match(/На сторінці [^ ]+/)?.[0])));
  await p.click('[data-review-card] [data-rv="open"]'); await p.waitForTimeout(1500);
  const site = () => p.frames().find((fr) => fr.url().startsWith('http://localhost:8766'));
  const state = async () => ({ path: await p.$eval('.rv_nav-path', (e) => e.value), rows: await p.$$eval('.rv_pin', (x) => x.map((e) => e.dataset.id)), sitePins: await site().$$eval('[data-crm-pin]', (x) => x.map((e) => e.textContent)), other: await p.$eval('.rv_other', (e) => e.textContent.replace(/\s+/g, ' ').trim()) });
  console.log('landing:', JSON.stringify(await state()));
  // перехід через «На інших сторінках»
  await p.click('.rv_other-page'); await p.waitForTimeout(1500);
  console.log('after goto:', site().url(), JSON.stringify(await state()));
  // новий пін на /about
  const box = await (await p.$('.rv_frame')).boundingBox();
  await p.mouse.click(box.x + 300, box.y + 250); await p.waitForTimeout(300);
  await p.fill('.rv_form textarea', 'Ще один на About'); await p.click('.rv_form [type="submit"]'); await p.waitForTimeout(700);
  console.log('insert anchor:', JSON.stringify(await p.evaluate(() => window.__calls.filter((c) => c[0] === 'insert' && c[1] === 'feedback_marks').map((c) => c[2].anchor))));
  console.log('about now:', JSON.stringify(await state()));
  // рядок адреси → назад на /landing
  await p.fill('.rv_nav-path', '/landing'); await p.press('.rv_nav-path', 'Enter'); await p.waitForTimeout(1500);
  console.log('address bar:', site().url(), JSON.stringify(await state()));
  // чужий домен у рядку адреси відхиляється
  await p.fill('.rv_nav-path', 'https://evil.com/x'); await p.press('.rv_nav-path', 'Enter'); await p.waitForTimeout(400);
  console.log('foreign rejected:', site().url().startsWith('http://localhost:8766/landing'));
  // Переглядати → клік по посиланню сайту → ready з /about → піни About
  await p.click('[data-rv="mode:browse"]'); await site().click('#nav-about'); await p.waitForTimeout(1500);
  console.log('browse nav:', JSON.stringify(await state()), '| mode stays browse:', await p.$eval('[data-rv="mode:browse"]', (x) => x.classList.contains('is-active')));
  // з головної сторінки правки: «відкрити» пін на іншій сторінці
  await p.focus('.rv_back'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.click('[data-list="marks"] > [data-rendered][data-id="ab"] [data-action="mark-open"]'); await p.waitForTimeout(1500);
  console.log('mark-open other page:', site().url(), '| path', await p.$eval('.rv_nav-path', (e) => e.value));
  console.log('\nerrors:', errs.length ? errs : 'none');
  await b.close();
})();
