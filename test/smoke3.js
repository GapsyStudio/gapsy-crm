const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext();
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  p.on('dialog', (d) => d.accept());
  const go = async (u) => { await p.goto('http://localhost:8765' + u); await p.waitForTimeout(800); };
  const t = (s) => p.$eval(s, (e) => e.textContent.trim()).catch(() => 'MISSING ' + s);
  const n = (s) => p.$$eval(s, (x) => x.length);
  const calls = (f) => p.evaluate((f) => __calls.filter((c) => c[1] === f || c[0] === f), f);
  const log = (...a) => console.log(...a);
  const vis = (s) => p.$eval(s, (e) => e.style.display !== 'none').catch(() => 'MISSING');

  // ---------- /projects → посилання на картку
  await go('/projects');
  log('PROJECTS row href:', await p.$eval('[data-list="projects"] [data-rendered]', (e) => e.getAttribute('href')));

  // ---------- /project
  await go('/project?id=p1#handoff');
  log('PROJECT name:', await t('[data-item="name"]'), '| crumbs:', await t('[data-crm-crumbs]'), '| status:', await p.$eval('[data-item="status"]', (e) => e.textContent + ' ' + e.className));
  log('  prefix:', await t('[data-item="prefix"]'), '| stack:', await n('[data-list="project-stack"] [data-rendered]'), '| summary:', await t('[data-item="summary"]'));
  log('  links:', JSON.stringify(await p.$$eval('[data-list="project-links"] [data-rendered]', (x) => x.map((e) => e.textContent + '→' + e.getAttribute('href')))));
  log('  team:', await n('[data-list="project-team"] [data-rendered]'), '| notes:', await n('[data-list="project-notes"] [data-rendered]'), '| first note time:', await t('[data-list="project-notes"] [data-rendered] [data-field="time"]'));
  log('  foreign note actions removed:', await p.$$eval('[data-list="project-notes"] [data-rendered]', (x) => x.map((e) => e.querySelectorAll('[data-action]').length).join(',')));
  log('  feedback:', await n('[data-list="project-feedback"] [data-rendered]'), '| showcase:', await n('[data-list="project-showcase"] [data-rendered]'), '| snippets:', await n('[data-list="project-snippets"] [data-rendered]'));
  log('  fb link:', await p.$eval('[data-project-feedback-link]', (e) => e.getAttribute('href')));
  log('  HANDOFF items:', await n('[data-list="handoff-items"] [data-rendered]'), '| badge:', await t('[data-handoff-status]'), '| btns save/submit/accept/return:',
    await vis('[data-handoff-btn="save"]'), await vis('[data-handoff-btn="submit"]'), await vis('[data-handoff-btn="accept"]'), await vis('[data-handoff-btn="return"]'));
  log('  staff options:', await n('[data-form="handoff"] [name=developer_id] option'), '| decision visible:', await vis('[data-handoff-decision]'));
  await p.click('[data-list="handoff-items"] [data-rendered]');
  log('  check toggled:', await p.$eval('[data-list="handoff-items"] [data-rendered]', (e) => e.getAttribute('aria-checked') + ' ' + e.querySelector('.check_box').className));
  // передати без розробника → тост, без запиту
  await p.click('[data-action="handoff-submit"]'); await p.waitForTimeout(200);
  log('  submit w/o dev, upserts:', (await calls('upsert')).length);
  await p.selectOption('[data-form="handoff"] [name=developer_id]', 'u1');
  await p.click('[data-action="handoff-submit"]'); await p.waitForTimeout(300);
  const ho = await calls('handoffs');
  log('  submit calls:', JSON.stringify(ho.map((c) => [c[0], c[2].status || '', (c[2].items || []).filter((i) => i.done).length])));
  log('  after submit badge:', await t('[data-handoff-status]'), '| accept visible:', await vis('[data-handoff-btn="accept"]'), '| save hidden:', !(await vis('[data-handoff-btn="save"]')), '| locked:', await p.$eval('[data-list="handoff-items"] [data-rendered]', (e) => e.classList.contains('is-locked')));
  await p.click('[data-action="handoff-return"]'); await p.waitForTimeout(200);
  log('  return w/o comment blocked:', (await calls('handoffs')).length === ho.length);
  await p.fill('[data-form="handoff"] [name=decision_comment]', 'Де ховер кнопки?');
  await p.click('[data-action="handoff-return"]'); await p.waitForTimeout(200);
  log('  returned badge:', await t('[data-handoff-status]'), '| last call:', JSON.stringify((await calls('handoffs')).pop()[2].status));
  // нотатка
  await p.fill('[data-form="project-note"] [name=body]', 'Нове рішення'); await p.click('[data-form="project-note"] [type=submit]'); await p.waitForTimeout(200);
  log('  note insert:', JSON.stringify((await calls('project_notes')).find((c) => c[0] === 'insert')?.[2]));
  await p.click('[data-list="project-notes"] [data-rendered] [data-action="note-pin"]'); await p.waitForTimeout(200);
  log('  pin toggle:', JSON.stringify((await calls('project_notes')).find((c) => c[0] === 'update')?.[2]));
  // редагування
  await p.click('[data-action="project-edit"]'); await p.waitForTimeout(150);
  log('  edit prefill stack:', await p.$eval('[data-form="project-edit"] [name=stack]', (e) => e.value), '| name:', await p.$eval('[data-form="project-edit"] [name=name]', (e) => e.value));
  await p.fill('[data-form="project-edit"] [name=stack]', 'GSAP, Swiper 8, '); await p.click('[data-form="project-edit"] [type=submit]'); await p.waitForTimeout(200);
  log('  project update:', JSON.stringify((await calls('projects')).find((c) => c[0] === 'update')?.[2]));
  // команда
  await p.click('[data-action="open:member"]'); await p.waitForTimeout(200);
  await p.selectOption('[data-form="member"] [name=user_id]', 'u1'); await p.click('[data-form="member"] [type=submit]'); await p.waitForTimeout(200);
  log('  member insert:', JSON.stringify((await calls('project_members')).find((c) => c[0] === 'insert')?.[2]));

  // ---------- /snippets
  await go('/snippets');
  log('SNIPPETS cards:', await n('[data-list="snippets"] [data-rendered]'), '| tags:', await n('[data-list="snippet-tags"] [data-rendered]'), '| card tags:', await n('[data-list="snippets"] [data-rendered] [data-tags] .tag_chip'));
  log('  href:', await p.$eval('[data-list="snippets"] [data-rendered]', (e) => e.getAttribute('href')), '| skeleton state:', await p.$eval('[data-list="snippets"]', (e) => e.dataset.state));
  await p.click('[data-list="snippet-tags"] [data-rendered][data-tag="Nav"]');
  log('  filter Nav:', await n('[data-list="snippets"] [data-rendered]'), '| active:', await p.$eval('[data-tag="Nav"]', (e) => e.classList.contains('is-active')));
  await p.click('[data-tag=""]'); await p.fill('[data-snippet-search]', 'blur');
  log('  search blur:', await n('[data-list="snippets"] [data-rendered]'));
  await p.fill('[data-snippet-search]', 'zzz'); log('  search none state:', await p.$eval('[data-list="snippets"]', (e) => e.dataset.state));
  await p.press('[data-snippet-search]', 'Enter'); await p.waitForTimeout(200); log('  still on page:', p.url().includes('/snippets'));
  await go('/app'); await go('/snippets#Text'); log('  hash filter Text:', await n('[data-list="snippets"] [data-rendered]'));
  await p.click('[data-action="open:snippet"]'); await p.waitForTimeout(150);
  await p.fill('[data-form="snippet"] [name=title]', 'Новий'); await p.fill('[data-form="snippet"] [name=code]', 'console.log(1)');
  await p.fill('[data-form="snippet"] [name=tags]', 'GSAP, , Forms');
  await p.evaluate(() => { window.__keep = []; const o = __calls.push.bind(__calls); __calls.push = (c) => { sessionStorage.setItem('ins', JSON.stringify(c)); return o(c); }; });
  await p.click('[data-form="snippet"] [type=submit]'); await p.waitForTimeout(400);
  log('  snippet insert:', await p.evaluate(() => sessionStorage.getItem('ins')), '| url:', p.url().replace('http://localhost:8765', ''));

  // ---------- /snippet
  await go('/snippet?id=sn1');
  log('SNIPPET title:', await t('[data-item="title"]'), '| crumbs:', await t('[data-crm-crumbs]'), '| code:', await t('[data-item="code"]'));
  log('  demo row hidden (js url):', await p.$eval('[data-item="demo_url"]', (e) => e.closest('.meta_row').style.display === 'none'), '| tags:', await n('[data-tags] .tag_chip'), '| projects:', await n('[data-list="snippet-projects"] [data-rendered]'));
  log('  project options:', await n('[data-form="snippet-project"] option'));
  await p.click('.page_actions [data-action="snippet-copy"]'); await p.waitForTimeout(150);
  log('  clipboard:', await p.evaluate(() => navigator.clipboard.readText()));
  await p.click('[data-action="snippet-edit"]'); await p.waitForTimeout(150);
  log('  edit prefill:', await p.$eval('[data-form="snippet"] [name=tags]', (e) => e.value), '|', await p.$eval('[data-form="snippet"] [name=language]', (e) => e.value));
  await p.click('[data-form="snippet"] [type=submit]'); await p.waitForTimeout(200);
  log('  update keys:', Object.keys((await calls('snippets')).find((c) => c[0] === 'update')?.[2] || {}).join(','));
  await p.selectOption('[data-form="snippet-project"] [name=project_id]', 'p1'); await p.click('[data-form="snippet-project"] [type=submit]'); await p.waitForTimeout(200);
  log('  link insert:', JSON.stringify((await calls('snippet_projects')).find((c) => c[0] === 'insert')?.[2]));

  // ---------- профіль: перевірка оновленого рядка
  await go('/profile');
  await p.fill('[name=full_name]', 'Нелія К.'); await p.click('[data-form="profile"] [type=submit]'); await p.waitForTimeout(200);
  log('PROFILE greeting var:', await p.evaluate(() => CRM.profile.full_name));

  log('\nERRORS:', errs.length ? errs.join('\n') : 'none');
  await b.close();
})();
