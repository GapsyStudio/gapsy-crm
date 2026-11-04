// Смоук v0.10: референси, етапи проєкту й ризик, пульс агенції. Запуск: node server.js, потім node smoke14.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = [];
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const go = async (u) => { await p.goto('http://localhost:8765' + u); await p.waitForTimeout(900); };
  const calls = (t) => p.evaluate((t) => __calls.filter((c) => c[1] === t), t);
  // референси
  await go('/references');
  const cards = '[data-list="refs"] > [data-rendered]';
  console.log('refs:', await p.$$eval(cards, (x) => x.map((e) => [e.querySelector('[data-field="title"]').textContent, e.querySelector('[data-field="host"]').textContent, e.querySelector('[data-ref-link]').target, e.querySelector('[data-ref-icon]').style.backgroundImage.includes('favicons'), [...e.querySelectorAll('[data-tags] > :not([data-template])')].map((t) => t.textContent).join(' '), e.querySelector('[data-field="note"]').hidden])));
  console.log('tags:', await p.$$eval('[data-list="ref-tags"] > [data-rendered]', (x) => x.map((e) => e.textContent + (e.classList.contains('is-active') ? '*' : ''))));
  await p.click('[data-list="ref-tags"] > [data-rendered]:nth-of-type(2)'); console.log('filter #hero:', await p.$$eval(cards, (x) => x.length));
  await p.fill('[data-refs-search]', 'dribbble'); console.log('search after tag (0 expected):', await p.$$eval(cards, (x) => x.length));
  await p.click('[data-list="ref-tags"] > [data-rendered]'); console.log('search all tags:', await p.$$eval(cards, (x) => x.length));
  await p.fill('[data-refs-search]', '');
  await p.click('[data-action="open:ref-new"]'); await p.fill('[name=url]', 'ftp://x'); await p.click('[data-form="ref-new"] [type=submit]'); await p.waitForTimeout(200);
  await p.fill('[name=url]', 'https://mobbin.com/x'); await p.fill('[name=tags]', 'Mobile, UI, mobile'); await p.click('[data-form="ref-new"] [type=submit]'); await p.waitForTimeout(300);
  console.log('insert:', JSON.stringify((await calls('inspo_links')).filter((c) => c[0] === 'insert').map((c) => c[2])));
  // проєкти
  await go('/projects');
  console.log('projects row:', await p.$eval('[data-list="projects"] > [data-rendered]', (e) => ['stage', 'due', 'risk'].map((k) => { const f = e.querySelector(`[data-field="${k}"]`); return `${k}=${f.textContent}${f.hidden ? '(hidden)' : ''}${f.className ? ' .' + f.className : ''}`; })));
  // пульс (admin)
  await go('/app');
  console.log('pulse counts:', await p.$$eval('[data-pulse-count]', (x) => x.map((e) => e.dataset.pulseCount + '=' + e.textContent)));
  console.log('pulse risk:', await p.$$eval('[data-list="pulse-risk"] > [data-rendered]', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' '))));
  console.log('workload:', await p.$$eval('[data-list="workload"] > [data-rendered]', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' '))));
  console.log('my feedback status label:', await p.$eval('[data-list="my-feedback"] > [data-rendered] [data-field="status"]', (e) => e.textContent).catch(() => 'none'));
  // дизайнер: пульсу не бачить
  await p.addInitScript(() => { window.__FIXPATCH = Object.assign(window.__FIXPATCH || {}, { profiles: [{ id: 'u1', email: 'd@g', full_name: 'Дизайнер', role: 'designer' }] }); });
  await go('/app');
  console.log('designer pulse hidden:', await p.$eval('[data-pulse]', (e) => getComputedStyle(e).display === 'none' || e.hidden || !e.isConnected).catch(() => 'removed'));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
