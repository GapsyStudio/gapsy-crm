const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); await ctx.grantPermissions(['clipboard-read','clipboard-write'], { origin: 'http://localhost:8765' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type()==='error') errs.push('CONSOLE ' + m.text()); });
  p.on('dialog', d => d.accept());
  const go = async (u) => { await p.goto('http://localhost:8765' + u); await p.waitForTimeout(700); };
  const t = (s) => p.$eval(s, e => e.textContent.trim()).catch(() => 'MISSING ' + s);
  const n = (s) => p.$$eval(s, x => x.length);
  const log = (...a) => console.log(...a);

  await go('/app');
  log('APP crumbs:', await t('[data-crm-crumbs]'), '| nav active:', await p.$eval('[data-nav="/app"]', e=>e.classList.contains('is-active')));
  log('  pm-only removed:', await n('a[href="/x"]') === 0, '| admin kept:', await n('a[href="/admin"]'));
  log('  today:', await t('[data-today]'), '| name:', await t('[data-crm-user="full_name"]'));
  log('  my-feedback rows:', await n('[data-list="my-feedback"] [data-rendered]'), '| recent-docs state:', await p.$eval('[data-list="recent-docs"]', e=>e.dataset.state));
  log('  pins:', await t('[data-list="pins"] [data-rendered] [data-field="host"]'));
  log('  notif count:', await t('[data-notif-count]'), '| notif rows:', await n('[data-list="notifications"] [data-rendered]'));
  await p.click('[data-action="toggle:notifications"]'); log('  panel open:', await p.$eval('[data-notif-panel]', e=>e.classList.contains('is-open')));
  await p.click('h1'); log('  panel closed by outside click:', !(await p.$eval('[data-notif-panel]', e=>e.classList.contains('is-open'))));
  await p.click('[data-action="toggle-theme"]'); log('  theme:', await p.$eval('html', e=>e.dataset.theme));
  await p.keyboard.press('Meta+k'); await p.waitForTimeout(100);
  log('  search open:', await p.$eval('[data-modal="search"]', e=>e.classList.contains('is-open')), '| input:', await n('[data-modal="search"] input[type=search]'));
  await p.keyboard.type('Кноп'); await p.waitForTimeout(400);
  log('  search results:', await n('[data-list="search"] [data-rendered]'), await t('[data-list="search"] [data-rendered] [data-field="type"]'));
  await p.keyboard.press('Escape'); log('  search closed:', !(await p.$eval('[data-modal="search"]', e=>e.classList.contains('is-open'))));
  await p.click('[data-action="open:pin"]'); await p.fill('[data-form="pin"] [name=title]', 'Drive'); await p.fill('[data-form="pin"] [name=url]', 'https://drive.google.com');
  await p.click('[data-form="pin"] [type=submit]'); await p.waitForTimeout(300);
  log('  pin insert:', JSON.stringify(await p.evaluate(()=>__calls.find(c=>c[1]==='pins'))), '| modal closed:', !(await p.$eval('[data-modal="pin"]', e=>e.classList.contains('is-open'))));

  await go('/feedback');
  log('FEEDBACK rows(open):', await n('[data-list="feedback"] [data-rendered]'), '| badge:', await p.$eval('[data-list="feedback"] [data-rendered] [data-field="status"]', e=>e.textContent+' '+e.className));
  log('  fields:', await t('[data-list="feedback"] [data-rendered] [data-field="files"]'), '/', await t('[data-list="feedback"] [data-rendered] [data-field="time"]'), '/ href', await p.$eval('[data-list="feedback"] [data-rendered]', e=>e.getAttribute('href')));
  await p.click('[data-tab="resolved"]'); log('  resolved tab rows:', await n('[data-list="feedback"] [data-rendered]'), '| tab active:', await p.$eval('[data-tab="resolved"]', e=>e.classList.contains('is-active')));
  await p.click('[data-tab="mine"]'); log('  mine rows:', await n('[data-list="feedback"] [data-rendered]'));
  await p.click('[data-action="open:feedback-new"]'); await p.waitForTimeout(200);
  log('  project options:', await n('[name=project_id] option'), '| staff options:', await n('[name=assignee_id] option'));
  await p.setInputFiles('[data-dropzone="feedback"] + input[type=file]', { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('89504e47','hex') });
  log('  previews:', await n('[data-upload-previews] [data-rendered]'));
  await p.fill('[name=title]', 'Тест'); await p.click('[data-form="feedback-new"] [type=submit]'); await p.waitForTimeout(400);
  log('  inserts:', JSON.stringify(await p.evaluate(()=>__calls.filter(c=>c[0]==='insert').map(c=>c[1]))));

  await go('/feedback-item?id=f1');
  log('ITEM title:', await t('[data-item="title"]'), '| crumbs:', await t('[data-crm-crumbs]'), '| active status:', await p.$eval('[data-status-switch] .is-active', e=>e.dataset.status));
  log('  files:', await n('[data-list="feedback-files"] [data-rendered]'), '| comments:', await n('[data-list="comments"] [data-rendered]'), '| project:', await t('[data-item="project"]'));
  await p.click('[data-status="resolved"]'); await p.waitForTimeout(200);
  log('  status update:', JSON.stringify(await p.evaluate(()=>__calls.filter(c=>c[0]==='update'))));
  await p.click('[data-list="feedback-files"] [data-rendered]'); log('  lightbox open:', await p.$eval('[data-modal="image"]', e=>e.classList.contains('is-open')));
  await p.keyboard.press('Escape');
  await p.fill('[data-form="comment"] [name=body]', 'ok'); await p.click('[data-form="comment"] [type=submit]'); await p.waitForTimeout(200);
  log('  comment insert:', !!(await p.evaluate(()=>__calls.find(c=>c[1]==='feedback_comments'))));

  await go('/showcase');
  log('SHOWCASE best:', await n('[data-list="showcase-best"] [data-rendered]'), '| all:', await n('[data-list="showcase-all"] [data-rendered]'), '| cat badge:', await t('[data-list="showcase-best"] [data-rendered] [data-field="category"]'));
  await p.click('[data-tabs="category"] [data-tab="site"]'); log('  figma all state:', await p.$eval('[data-list="showcase-all"]', e=>e.dataset.state), '| best hidden:', await p.$eval('[data-showcase-best]', e=>e.hidden));
  await p.click('[data-tab="all"]'); await p.click('[data-list="showcase-best"] [data-rendered] [data-action="copy-link"]'); await p.waitForTimeout(200);
  log('  clipboard:', await p.evaluate(()=>navigator.clipboard.readText()));
  await p.click('[data-list="showcase-all"] [data-rendered] [data-action="edit"]'); await p.waitForTimeout(200);
  log('  edit prefill:', await p.$eval('[data-form="showcase-item"] [name=title]', e=>e.value), '| checkbox:', await p.$eval('[name=is_best]', e=>e.checked));

  await go('/projects');
  log('PROJECTS active:', await n('[data-list="projects"] [data-rendered]'), '| count:', await t('[data-list="projects"] [data-rendered] [data-field="feedback_count"]'));
  await p.click('[data-tab="all"]'); log('  all:', await n('[data-list="projects"] [data-rendered]'));

  await go('/admin');
  log('ADMIN pending:', await n('[data-list="users-pending"] [data-rendered]'), '| users:', await n('[data-list="users"] [data-rendered]'));
  await p.click('[data-list="users-pending"] [data-rendered] [data-action="edit-user"]'); await p.waitForTimeout(100);
  log('  modal title:', await t('[data-user-title]'));
  await p.click('[data-form="user"] [type=submit]'); await p.waitForTimeout(200);
  log('  rpc:', JSON.stringify(await p.evaluate(()=>__calls.find(c=>c[0]==='rpc' && c[1]==='admin_update_user'))));

  await go('/profile');
  log('PROFILE name prefill:', await p.$eval('[name=full_name]', e=>e.value));
  await p.click('[data-theme-value="dark"]'); log('  theme:', await p.$eval('html', e=>e.dataset.theme), await p.evaluate(()=>localStorage.getItem('crm-theme')));
  await p.click('[data-theme-value="system"]'); log('  system → stored:', await p.evaluate(()=>localStorage.getItem('crm-theme')));

  log('\nERRORS:', errs.length ? errs.join('\n') : 'none');
  await b.close();
})();
