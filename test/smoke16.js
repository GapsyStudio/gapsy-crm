// v0.12: погодження дизайну, підписки, тимчасовий доступ, пропозиції в Showcase, позначка АД в адмінці
const { chromium } = require('playwright');
const PROFILE = (role, ad = false) => `window.__FIXPATCH = Object.assign(window.__FIXPATCH || {}, { profiles: [{ id: 'u1', email: 'n@g.s', full_name: 'Нелія', role: '${role}', is_art_director: ${ad}, created_at: new Date().toISOString() }] });`;
(async () => {
  const b = await chromium.launch(); const errs = [];
  const page = async (init) => {
    const p = await (await b.newContext()).newPage();
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Немає кейсу' : undefined));
    if (init) await p.addInitScript(init);
    return p;
  };
  const go = async (p, u) => { await p.goto('http://localhost:8765' + u); await p.waitForTimeout(900); };
  const calls = (p, kind, name) => p.evaluate(([k, n]) => window.__calls.filter((c) => c[0] === k && c[1] === n).map((c) => JSON.stringify(c[2])), [kind, name]);

  // --- Погодження: АД (designer + is_art_director) ---
  let p = await page(PROFILE('designer', true));
  await go(p, '/reviews');
  console.log('AD tab pending rows:', await p.$$eval('[data-list="reviews"] > [data-rendered]', (x) => x.map((e) => e.textContent).join(' | ')));
  console.log('counts:', await p.$$eval('[data-count]', (x) => x.map((e) => e.dataset.count + '=' + e.textContent).join(' ')));
  await p.click('[data-list="reviews"] > [data-rendered]'); await p.waitForTimeout(300);
  console.log('modal:', await p.$eval('[data-review="title"]', (e) => e.textContent), '| meta:', await p.$eval('[data-review="meta"]', (e) => e.textContent), '| decide visible:', await p.$eval('[data-review-decide]', (e) => !e.hidden), '| history rows:', await p.$$eval('[data-list="review-history"] > [data-rendered]', (x) => x.map((e) => e.textContent).join(' ')));
  await p.click('[data-action="review-changes"]'); await p.waitForTimeout(200);
  console.log('changes w/o comment → rpc:', (await calls(p, 'rpc', 'review_decide')).length);
  await p.fill('[data-form="review-decide"] [name="comment"]', 'Збільш заголовок'); await p.click('[data-action="review-changes"]'); await p.waitForTimeout(300);
  console.log('rpc review_decide:', await calls(p, 'rpc', 'review_decide'));
  await p.close();

  // --- Погодження: дизайнер (не АД) створює нову версію ---
  p = await page(PROFILE('designer'));
  await go(p, '/reviews?id=dr1');
  console.log('old version (dr2 exists): version btn hidden:', await p.$eval('[data-action="review-version"]', (e) => e.hidden));
  await p.close();
  p = await page(PROFILE('designer') + `window.__FIXPATCH.design_reviews = [{ id: 'dr1', project_id: 'p1', parent_id: null, version: 1, title: 'Головна', url: 'https://figma.com/a', status: 'changes', requested_by: 'u1', decision_note: 'Більше повітря', created_at: new Date().toISOString(), project: { name: 'CloudVno' }, author: { full_name: 'Нелія' }, reviewer: { full_name: 'Арт' } }];`);
  await go(p, '/reviews?id=dr1');
  console.log('designer: decide hidden:', await p.$eval('[data-review-decide]', (e) => e.hidden), '| version btn:', await p.$eval('[data-action="review-version"]', (e) => !e.hidden), '| decision:', await p.$eval('[data-review="decision"]', (e) => e.textContent));
  await p.click('[data-action="review-version"]'); await p.waitForTimeout(300);
  console.log('form title:', await p.$eval('[data-review-form-title]', (e) => e.textContent), '| prefilled url:', await p.$eval('[data-form="review"] [name="url"]', (e) => e.value), '| submit:', await p.$eval('[data-form="review"] [type="submit"]', (e) => e.value));
  await p.fill('[data-form="review"] [name="url"]', 'http://bad'); await p.click('[data-form="review"] [type="submit"]'); await p.waitForTimeout(200);
  console.log('bad url inserts:', (await calls(p, 'insert', 'design_reviews')).length);
  await p.fill('[data-form="review"] [name="url"]', 'https://figma.com/v3'); await p.fill('[data-form="review"] [name="description"]', 'Виправила'); await p.click('[data-form="review"] [type="submit"]'); await p.waitForTimeout(400);
  console.log('insert:', await calls(p, 'insert', 'design_reviews'));
  await p.close();

  // --- Доступи: розробник просить доступ; підписки ---
  p = await page(PROFILE('developer') + `window.__FIXPATCH.access_items = [{ id: 'ac1', kind: 'service', name: 'Figma', url: 'https://figma.com', notes: null, secret_id: 's', price: 15, currency: 'USD', period: 'month', renews_on: new Date(Date.now() + 3 * 864e5).toLocaleDateString('sv') }, { id: 'ac2', kind: 'service', name: 'Adobe', url: null, notes: null, secret_id: 's', price: 600, currency: 'UAH', period: 'year', renews_on: null }];
    window.__FIXPATCH.access_requests = [{ id: 'rq1', item_id: 'ac2', requester: 'u1', status: 'approved', expires_at: new Date(Date.now() + 3600e3).toISOString(), created_at: new Date().toISOString(), who: { full_name: 'Нелія' } }];`);
  await go(p, '/access');
  const card = (n) => p.$eval(`[data-list="access"] > [data-rendered]:nth-of-type(${n + 1})`, (e) => ({ text: [...e.querySelectorAll('[data-field]:not([hidden])')].map((f) => f.textContent).join(' / '), ask: !e.querySelector('[data-action="access-request"]').hidden, grant: !e.querySelector('[data-access-grant]').hidden, red: e.querySelector('[data-field="renews"]').classList.contains('is-red') }));
  console.log('Figma:', JSON.stringify(await card(1)));
  console.log('Adobe:', JSON.stringify(await card(2)));
  console.log('total:', await p.$eval('[data-subs-total]', (e) => e.textContent));
  await p.click('[data-list="access"] > [data-rendered]:nth-of-type(2) [data-action="access-request"]'); await p.waitForTimeout(200);
  await p.fill('[data-form="access-request"] [name="reason"]', 'Експорт ассетів'); await p.click('[data-form="access-request"] button[type="submit"]'); await p.waitForTimeout(300);
  console.log('request insert:', await calls(p, 'insert', 'access_requests'));
  await p.click('[data-list="access"] > [data-rendered]:nth-of-type(3) [data-access-grant]'); await p.waitForTimeout(300);
  console.log('grant reveal rpc:', (await calls(p, 'rpc', 'access_reveal')).length, '| modal open:', await p.$eval('[data-modal="access-reveal"]', (e) => e.classList.contains('is-open')));
  await p.close();

  // --- Доступи: PM схвалює; редагує підписку ---
  p = await page(`window.__FIXPATCH = { access_requests: [{ id: 'rq2', item_id: 'ac1', requester: 'u7', reason: 'деплой', status: 'pending', expires_at: null, created_at: new Date().toISOString(), who: { full_name: 'Олег' } }] };`);
  await go(p, '/access');
  console.log('PM requests visible:', await p.$eval('[data-access-requests]', (e) => !e.hidden), await p.$eval('[data-list="access-requests"] > [data-rendered]', (e) => e.textContent.replace(/\s+/g, ' ')));
  await p.click('[data-list="access-requests"] > [data-rendered] [data-action="areq-approve"][data-hours="24"]'); await p.waitForTimeout(300);
  console.log('decide rpc:', await calls(p, 'rpc', 'access_request_decide'));
  await p.click('[data-list="access"] > [data-rendered] [data-action="access-edit"]'); await p.waitForTimeout(300);
  await p.fill('[data-form="access-item"] [name="price"]', '9,99'); await p.selectOption('[data-form="access-item"] [name="period"]', 'year'); await p.fill('[data-form="access-item"] [name="renews_on"]', '2026-12-01');
  await p.click('[data-form="access-item"] button[type="submit"]'); await p.waitForTimeout(300);
  console.log('update:', await calls(p, 'update', 'access_items'));
  await p.close();

  // --- Showcase: дизайнер пропонує, PM публікує/відхиляє ---
  p = await page(PROFILE('designer'));
  await go(p, '/showcase');
  await p.click('[data-action="showcase-propose"]'); await p.waitForTimeout(200);
  console.log('propose modal: best hidden:', await p.$eval('[data-showcase-best-field]', (e) => e.hidden), '| title:', await p.$eval('[data-showcase-modal-title]', (e) => e.textContent));
  await p.fill('[data-form="showcase-item"] [name="title"]', 'Lohhoo'); await p.fill('[data-form="showcase-item"] [name="url"]', 'https://lohhoo.com');
  await p.click('[data-form="showcase-item"] button[type="submit"]'); await p.waitForTimeout(400);
  console.log('propose insert:', await calls(p, 'insert', 'showcase_items'));
  await p.close();
  p = await page(`window.__FIXPATCH = { showcase_items: [{ id: 's1', title: 'CloudVno', url: 'https://c.com', category: 'site', status: 'published', is_best: true, created_by: 'u1' }, { id: 's2', title: 'Lohhoo', url: 'https://l.com', category: 'site', status: 'proposed', created_by: 'u5', author: { full_name: 'Оля' } }] };`);
  await go(p, '/showcase');
  console.log('PM proposals:', await p.$$eval('[data-list="showcase-proposed"] > [data-rendered]', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ')).join(' | ')), '| published cards:', await p.$$eval('[data-list="showcase-all"] > [data-rendered]', (x) => x.length));
  await p.click('[data-list="showcase-proposed"] > [data-rendered] [data-action="showcase-reject"]'); await p.waitForTimeout(300);
  await p.click('[data-list="showcase-proposed"] > [data-rendered] [data-action="showcase-publish"]'); await p.waitForTimeout(300);
  console.log('updates:', await calls(p, 'update', 'showcase_items'));
  await p.close();

  // --- Адмінка: позначка АД ---
  p = await page(`window.__FIXPATCH = { profiles: [{ id: 'u1', email: 'n@g.s', full_name: 'Нелія', role: 'admin', created_at: new Date().toISOString() }, { id: 'u3', email: 'a@g.s', full_name: 'Арт', role: 'designer', is_art_director: false, created_at: new Date().toISOString() }] };`);
  await go(p, '/admin');
  await p.click('[data-list="users"] > [data-rendered]:nth-of-type(3) [data-action="edit-user"]'); await p.waitForTimeout(200);
  await p.check('[data-form="user"] [name="is_art_director"]'); await p.click('[data-form="user"] button[type="submit"]'); await p.waitForTimeout(300);
  console.log('AD rpc:', await calls(p, 'rpc', 'admin_set_art_director'));
  await p.close();
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
