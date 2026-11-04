// v0.6: база знань (/docs, /doc) на реальних даних імпорту з Notion
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  p.on('dialog', (d) => d.accept());
  const go = async (u, w = 900) => { await p.goto('http://localhost:8765' + u); await p.waitForTimeout(w); };
  const t = (s) => p.$eval(s, (e) => e.textContent.trim()).catch(() => 'MISSING ' + s);
  const n = (s) => p.$$eval(s, (x) => x.length);
  const calls = (tbl) => p.evaluate((tbl) => __calls.filter((c) => c[1] === tbl), tbl);
  const log = (...a) => console.log(...a);

  // ---------- /docs
  await go('/docs');
  log('DOCS tree top:', await n('[data-list="docs-tree"] > a[data-rendered]'), '| children boxes:', await n('[data-list="docs-tree"] [data-template="children"][data-rendered], [data-list="docs-tree"] .docs_tree-children[data-rendered]'));
  log('  first:', await t('[data-list="docs-tree"] > a[data-rendered] [data-field="title"]'), '| recent:', await n('[data-list="docs-recent"] [data-rendered]'), '| crumbs:', await t('[data-crm-crumbs]'));
  await p.fill('[data-docs-search]', 'Fig'); await p.waitForTimeout(500);
  log('  search title:', await t('[data-docs-recent-title]'), '| rows:', await n('[data-list="docs-recent"] [data-rendered]'));
  await p.fill('[data-docs-search]', ''); await p.waitForTimeout(100);
  log('  reset title:', await t('[data-docs-recent-title]'));
  await p.press('[data-docs-search]', 'Enter'); await p.waitForTimeout(150); log('  still on page:', p.url().endsWith('/docs'));
  await p.click('[data-action="doc-create"]'); await p.waitForTimeout(300);
  log('  create →', p.url().replace('http://localhost:8765', ''));

  // ---------- /doc: глибокий документ з картинками
  await go('/doc?id=a54a1d3f-84ec-5141-a796-c92a0aaa15de');
  log('DOC title:', await t('[data-doc="title"]'), '| crumbs:', await t('[data-crm-crumbs]'));
  log('  meta:', await t('[data-doc="meta"]'), '| active tree:', await t('.docs_tree-link.is-active [data-field="title"]'), '| open branch boxes:', await n('.docs_tree-children[data-rendered]'));
  log('  blocks h/p/ul/ol/fig/quote:', await n('.doc_content h2,.doc_content h3,.doc_content h4'), await n('.doc_content > p'), await n('.doc_content > ul'), await n('.doc_content > ol'), await n('.doc_content figure'), await n('.doc_content blockquote'));
  log('  img src signed:', await p.$eval('.doc_content figure img', (e) => e.src.slice(0, 22)).catch(() => 'none'));
  log('  internal links:', await p.$$eval('.doc_content a[href^="/doc?id="]', (x) => x.length), '| ext target:', await p.$eval('.doc_content a[href^="http"]', (e) => e.target).catch(() => '-'));
  log('  unsafe nodes:', await n('.doc_content script, .doc_content [onclick], .doc_content a[href^="javascript"]'));
  log('  edit btn visible:', await p.$eval('[data-action="doc-edit"]', (e) => !e.hidden), '| save hidden:', await p.$eval('[data-action="doc-save"]', (e) => e.hidden));

  // чекліст, таблиця-база, файли
  await go('/doc?id=84ea7cb6-7497-534b-a296-8dbbfed48cf6');
  log('HANDOFF checklists:', await n('.doc_checklist'), '| boxes:', await n('.doc_checklist .check_box'));
  await go('/doc?id=6808cd96-9185-5d55-a762-17c6a7dce0a2');
  log('SALES DB table rows:', await n('.doc_table tbody tr'), '| linked first col:', await n('.doc_table td a[href^="/doc?id="]'), '| children list:', await n('[data-list="doc-children"] [data-rendered]'), '| section visible:', await p.$eval('[data-doc-children-section]', (e) => !e.hidden));
  await go('/doc?id=f674911d-5cac-5eb0-a41d-7f7fc8f39aad');
  log('XLSX file chip:', await t('.doc_file'));

  // ---------- закріпити, редагування
  await go('/doc?id=a54a1d3f-84ec-5141-a796-c92a0aaa15de');
  await p.click('[data-action="pin"]'); await p.waitForTimeout(200);
  log('PIN insert:', JSON.stringify((await calls('pins')).pop()?.[2]));
  await p.click('[data-action="doc-edit"]'); await p.waitForTimeout(2500);
  log('EDIT editor blocks:', await n('.doc_content .ce-block'), '| images in editor:', await n('.doc_content .image-tool__image-picture'), '| title editable:', await p.$eval('[data-doc="title"]', (e) => e.contentEditable));
  log('  btns save/cancel/delete/child visible:', ...(await Promise.all(['doc-save', 'doc-cancel', 'doc-delete', 'doc-create-child'].map((a) => p.$eval(`[data-action="${a}"]`, (e) => !e.hidden)))));
  await p.$eval('[data-doc="title"]', (e) => { e.textContent = 'Competitor Analysis (edited)'; });
  await p.click('.doc_content .ce-paragraph'); await p.keyboard.type(' ДОДАНО');
  await p.click('[data-action="doc-save"]'); await p.waitForTimeout(800);
  const up = (await calls('docs')).filter((c) => c[0] === 'update').pop()?.[2];
  const imgs = (up?.content?.blocks || []).filter((x) => x.type === 'image');
  log('  saved title:', up?.title, '| blocks:', up?.content?.blocks?.length, '| images keep path, no url:', imgs.length, imgs.every((x) => x.data.file.path && !x.data.file.url));
  log('  typed text saved:', JSON.stringify(up?.content?.blocks || []).includes('ДОДАНО'), '| back to read mode:', await p.$eval('[data-action="doc-edit"]', (e) => !e.hidden), '| rendered h:', await n('.doc_content h2,.doc_content h3,.doc_content h4'));
  await p.click('[data-action="doc-edit"]'); await p.waitForTimeout(800);
  await p.click('[data-action="doc-create-child"]'); await p.waitForTimeout(300);
  log('  child insert:', JSON.stringify((await calls('docs')).filter((c) => c[0] === 'insert').pop()?.[2]), '→', p.url().replace('http://localhost:8765', ''));

  // ---------- немає документа, дашборд
  await go('/doc?id=nope');
  log('NOTFOUND visible:', await p.$eval('[data-doc-notfound]', (e) => !e.hidden));
  await go('/app');
  log('DASH recent docs:', await n('[data-list="recent-docs"] [data-rendered]'), '| href:', await p.$eval('[data-list="recent-docs"] [data-rendered]', (e) => e.getAttribute('href')).catch(() => '-'));

  log('\nERRORS:', errs.length ? errs.join('\n') : 'none');
  await b.close();
})();
