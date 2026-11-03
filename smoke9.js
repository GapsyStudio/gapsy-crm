const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const go = async (u) => { await p.goto('http://localhost:8765' + u); await p.waitForTimeout(900); };
  const n = (s) => p.$$eval(s, (x) => x.length);
  await go('/docs');
  console.log('SECTIONS cards:', await n('[data-list="docs-sections"] > [data-rendered]'), '| items per card:', await p.$$eval('[data-list="docs-sections"] > [data-rendered]', (x) => x.map((c) => c.querySelectorAll('[data-section-item]').length).join(',')));
  console.log('  more visible:', await p.$$eval('[data-section-more]:not([hidden])', (x) => x.map((e) => e.textContent).join(' | ')), '| first item href:', await p.$eval('[data-list="docs-sections"] [data-rendered] [data-section-item]', (e) => e.getAttribute('href')));
  await p.fill('[data-docs-search]', 'Figma'); await p.waitForTimeout(400);
  console.log('  search hides sections:', await p.$eval('[data-docs-sections-wrap]', (e) => e.hidden));
  for (const [id, t] of process.argv.slice(2).map((x) => x.split('|'))) {
    await go('/doc?id=' + id);
    console.log(t, '→ link boxes:', await n('.doc_content .doc_links'), '| rows:', await n('.doc_content .doc_link'), '| p:', await n('.doc_content > p'), '| children section visible:', await p.$eval('[data-doc-children-section]', (e) => !e.hidden), '| ext rows:', await n('.doc_content .doc_link[target=_blank]'));
    console.log('   sample:', await p.$$eval('.doc_content .doc_link', (x) => x.slice(0, 3).map((e) => e.textContent).join(' / ')));
  }
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
