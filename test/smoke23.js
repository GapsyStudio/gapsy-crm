// Смоук v0.18: Sales-хаб (/cases: фільтри, добірка, шаблони, ціни), воронка лідів, PM (очікування, відпустки, огляд).
// Запуск: node server.js, потім node smoke23.js
const { chromium } = require('playwright');
const D = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (url, role, extra = {}) => {
    const ctx = await b.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.addInitScript(({ role, extra, Dm6, D0, D5, D12 }) => {
      const tags = [];
      ['site', 'landing', 'app', 'brand', 'ecom', 'deck', 'mobile', 'promo', 'dash', 'nft'].forEach((s, i) => tags.push({ slug: s, kind: 'format', label: s.toUpperCase(), sort: i }));
      ['fin', 'med', 'edu', 'food', 'travel', 'web3'].forEach((s, i) => tags.push({ slug: s, kind: 'domain', label: s, sort: i }));
      const cases = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, ref_code: `C${i}`, title: `Кейс ${i}`, format: tags[i % 10].slug, sphere: 'Fintech', summary: '', behance_url: `https://behance.net/${i}`, live_url: i % 3 ? null : `https://site${i}.com`, nda: 'no', case_item_tags: [{ tag: tags[i % 10].slug }, { tag: tags[10 + (i % 6)].slug }] }));
      window.__FIXPATCH = Object.assign({
        profiles: [{ id: 'u1', email: 'm@gapsy.studio', full_name: 'Маша', role, is_leave_approver: false }],
        case_tags: tags, case_items: cases,
        leads: [{ id: 'ld1', title: 'Сайт для Acme', client: 'Acme', status: 'new', case_ids: ['c3'], created_by: 'u1', created_at: new Date().toISOString(), project: null },
                { id: 'ld2', title: 'Лендинг Beta', client: 'Beta', status: 'taken', project_id: 'p1', case_ids: [], created_by: 'u1', created_at: new Date().toISOString(), project: { stage: 'development', deadline: D12, status: 'active' } }],
        sales_templates: [{ id: 't1', kind: 'answer', title: 'Перша відповідь', body: 'Привіт, {імʼя}! Дякуємо за запит щодо {проєкт}.', sort: 1 }],
        price_items: [{ id: 'pr1', grp: 'Webflow', title: 'Лендинг до 6 секцій', price_from: 1500, price_to: 2500, currency: 'USD', days_from: 10, days_to: 15, note: 'Без копірайтингу' }],
        client_waits: [{ id: 'w1', what: 'Тексти для головної', since: Dm6, project_id: 'p1', created_by: 'u1', project: { name: 'CloudVno', status: 'active' } }],
        reminders: [],
      }, extra);
      window.__RPC = { team_absences: [{ user_id: 'u1', kind: 'vacation', start_date: D5, end_date: D12, status: 'approved' }], lead_set_cases: null };
      window.__FN = { 'my-tasks': { data: { matched: true, tasks: [] }, error: null } };
    }, { role, extra, Dm6: D(-6), D0: D(0), D5: D(5), D12: D(12) });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${role} ${url}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(`${role} ${url}: ${m.text()}`); });
    await p.goto(`http://localhost:8765${url}`); await p.waitForTimeout(1300);
    return p;
  };
  const chips = (p) => p.$$eval('.cases_facet', (x) => x.map((f) => f.querySelector('.cases_facet-title').textContent + ': ' + [...f.querySelectorAll('.cases_chip')].map((c) => c.textContent).join(',')));

  // --- кейси: компактні фільтри
  let p = await open('/cases?lead=ld1', 'sales');
  console.log('tabs:', await p.$$eval('[data-cases-tab]', (x) => x.map((e) => e.textContent + (e.classList.contains('is-active') ? '*' : '')).join(' | ')));
  console.log('facets:', JSON.stringify(await chips(p)));
  await p.click('.cases_facet:first-child .is-more'); await p.waitForTimeout(100);
  console.log('format opened:', (await chips(p))[0]);
  await p.click('.cases_facet:first-child .cases_chip >> nth=0'); await p.waitForTimeout(100);
  console.log('sub after filter:', await p.$eval('.page_header .text-color-secondary', (e) => e.textContent), '| reset visible:', await p.$eval('.cases_toolbar .button', (e) => !e.hidden));
  // --- добірка під лід: c3 уже прикріплений
  console.log('tray:', await p.$eval('.cases_tray-text', (e) => e.textContent), '| lead selected:', await p.$eval('.cases_tray-lead', (e) => e.value));
  await p.click('.cases_toolbar .button'); await p.waitForTimeout(100);
  await p.click('[data-case-id="c0"] .cases_pick'); await p.click('[data-case-id="c1"] .cases_pick');
  console.log('picked:', await p.$eval('.cases_tray-text', (e) => e.textContent), await p.$$eval('.cases_card.is-picked', (x) => x.length));
  await p.click('.cases_tray .button.is-small >> text=Скопіювати'); await p.waitForTimeout(200);
  console.log('clipboard:', JSON.stringify(await p.evaluate(() => navigator.clipboard.readText())));
  await p.click('text=Прикріпити до ліда'); await p.waitForTimeout(200);
  console.log('rpc:', JSON.stringify(await p.evaluate(() => window.__calls.filter((c) => c[1] === 'lead_set_cases').map((c) => c[2]))));
  // --- шаблони
  await p.click('[data-cases-tab="templates"]'); await p.waitForTimeout(400);
  console.log('tpl rows:', await p.$$eval('.cases_tpl-groups .list_row', (x) => x.map((e) => e.textContent)));
  await p.click('.cases_tpl-groups .list_row'); await p.waitForTimeout(200);
  console.log('vars:', await p.$$eval('[data-var]', (x) => x.map((e) => e.dataset.var).join(',')));
  await p.fill('[data-var="імʼя"]', 'Олена'); await p.fill('[data-var="проєкт"]', 'сайту');
  console.log('preview:', await p.$eval('[data-tpl-preview]', (e) => e.textContent));
  await p.click('[data-action="tpl-copy"]'); await p.waitForTimeout(200);
  console.log('copied:', await p.evaluate(() => navigator.clipboard.readText()));
  await p.click('[data-action="tpl-new"]'); await p.waitForTimeout(200);
  await p.fill('#tpl-title', 'Follow-up 3 дні'); await p.fill('#tpl-body', 'Добрий день, {клієнт}!'); await p.selectOption('#tpl-kind', 'followup');
  await p.click('[data-form="tpl"] [type="submit"]'); await p.waitForTimeout(300);
  console.log('tpl insert:', JSON.stringify(await p.evaluate(() => window.__calls.filter((c) => c[1] === 'sales_templates' && c[0] === 'insert').map((c) => c[2]))));
  // --- ціни (sales: лише читання)
  await p.click('[data-cases-tab="prices"]'); await p.waitForTimeout(400);
  console.log('prices:', await p.$$eval('.cases_price-row', (x) => x.map((e) => e.textContent + ' ' + e.tagName)), '| add btn:', !!(await p.$('[data-action="price-new"]')));
  await p.context().close();

  // --- ціни (admin: редагування)
  p = await open('/cases#prices', 'admin');
  await p.click('[data-action="price-new"]'); await p.waitForTimeout(200);
  await p.fill('#pr-title', 'Анімації GSAP'); await p.fill('#pr-from', '800'); await p.fill('#pr-to', '1 500'); await p.fill('#pr-days', '5–7');
  await p.click('[data-form="price"] [type="submit"]'); await p.waitForTimeout(300);
  console.log('\nprice insert:', JSON.stringify(await p.evaluate(() => window.__calls.filter((c) => c[1] === 'price_items' && c[0] === 'insert').map((c) => c[2]))));
  await p.context().close();

  // --- Головна Sales: воронка
  p = await open('/app', 'sales');
  console.log('\nsales leads:', JSON.stringify(await p.$$eval('[data-list="home-leads"] > [data-rendered]', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ')))));
  console.log('cases link:', await p.$eval('[data-list="home-leads"] > [data-rendered] a.button', (e) => e.getAttribute('href')));
  await p.click('[data-list="home-leads"] > [data-rendered] [data-action="lead-remind"]'); await p.waitForTimeout(300);
  console.log('remind:', JSON.stringify(await p.evaluate(() => window.__calls.filter((c) => c[1] === 'reminders' && c[0] === 'insert').map((c) => c[2]))));
  await p.click('[data-action="open:lead"]'); await p.fill('#lead-title', 'X'); await p.click('[data-form="lead"] [type="submit"]'); await p.waitForTimeout(400);
  console.log('one add button after submit:', await p.$$eval('[data-action="open:lead"]', (x) => x.length));
  await p.context().close();

  // --- Головна PM: очікування, відпустки
  p = await open('/app', 'pm');
  console.log('\nwaits:', JSON.stringify(await p.$$eval('[data-list="home-waits"] > [data-rendered]', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ')))), '| red:', await p.$eval('[data-list="home-waits"] [data-field="meta"]', (e) => e.classList.contains('is-red')));
  console.log('today:', JSON.stringify(await p.$$eval('[data-list="home-today"] > [data-rendered]', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ')))));
  console.log('workload:', JSON.stringify(await p.$$eval('[data-list="workload"] > [data-rendered]', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ')).slice(0, 2))));
  await p.context().close();

  // --- проєкт: очікування
  p = await open('/project?id=p1', 'designer');
  console.log('\nproject waits:', JSON.stringify(await p.$$eval('[data-waits] .list_row', (x) => x.map((e) => e.textContent))));
  await p.fill('[data-form="client-wait"] [name="what"]', 'Доступ до домену'); await p.click('[data-form="client-wait"] [type="submit"]'); await p.waitForTimeout(300);
  await p.click('[data-action="wait-done"]'); await p.waitForTimeout(300);
  console.log('wait calls:', JSON.stringify(await p.evaluate(() => window.__calls.filter((c) => c[1] === 'client_waits').map((c) => [c[0], Object.keys(c[2] || {}).join(',')]))));
  console.log('waits before notes:', await p.evaluate(() => { const w = document.querySelector('[data-waits]'); const n = document.querySelector('[data-list="project-notes"]').closest('section'); return !!(w.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  await p.context().close();

  // --- проєкти: огляд
  p = await open('/projects', 'pm', { feedback: [{ project_id: 'p1', due_date: '2020-01-01' }, { project_id: 'p1', due_date: null }], handoffs: [{ project_id: 'p1', status: 'submitted' }],
    client_waits: [{ project_id: 'p1', since: D(-6) }], project_members: [{ project_id: 'p1', user: { full_name: 'Нелія Бурлаченко' } }, { project_id: 'p1', user: { full_name: 'Оля' } }] });
  console.log('\nswitch:', !!(await p.$('[data-view-switch]')));
  await p.click('[data-view="overview"]'); await p.waitForTimeout(400);
  console.log('overview:', JSON.stringify(await p.$$eval('.pm_row', (x) => x.map((e) => [...e.children].map((c) => c.textContent).join(' | ')))));
  console.log('list hidden:', await p.$eval('[data-list="projects"]', (e) => e.hidden));
  await p.context().close();
  p = await open('/projects', 'designer');
  console.log('designer no switch:', !(await p.$('[data-view-switch]')));
  await p.context().close();

  console.log('\nerrors:', errs.length ? errs : 'none');
  await b.close();
})();
