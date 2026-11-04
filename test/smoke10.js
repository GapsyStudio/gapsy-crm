// v0.7: групи на /docs, дерево поточної групи, клікабельні крихти, «На цій сторінці»
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const go = async (u) => { await p.goto('http://localhost:8765' + u); await p.waitForTimeout(900); };
  const n = (s) => p.$$eval(s, (x) => x.length);
  await go('/docs');
  console.log('GROUP cards:', await p.$$eval('[data-list="docs-sections"] > [data-rendered] [data-section-link]', (x) => x.map((e) => e.textContent).join(' | ')));
  console.log('  start rows:', await p.$$eval('[data-list="docs-sections"] > [data-rendered] [data-section-item]', (x) => x.map((e) => e.textContent).join(' | ')));
  // документ глибоко в групі «Старт»
  const deep = await p.evaluate(() => { const a = window.__FIXPATCH.docs; const by = Object.fromEntries(a.map((d) => [d.id, d]));
    const depth = (d) => (d.parent_id ? 1 + depth(by[d.parent_id]) : 0);
    const hasH = (d) => (d.content?.blocks || []).filter((b) => b.type === 'header').length >= 3;
    return (a.filter((d) => depth(d) >= 2 && hasH(d))[0] || a.filter((d) => depth(d) >= 2)[0]).id; });
  await go('/doc?id=' + deep);
  console.log('DOC group head:', await p.$eval('[data-doc-group]', (e) => e.textContent + ' → ' + e.getAttribute('href')));
  console.log('  tree top items:', await n('[data-list="docs-tree"] > [data-rendered].docs_tree-link'), '| active:', await n('[data-list="docs-tree"] .is-active'));
  console.log('  crumbs:', await p.$eval('[data-crm-crumbs]', (e) => [...e.children].map((c) => c.tagName + ':' + c.textContent).join(' ')));
  console.log('  toc visible:', await p.$eval('[data-doc-toc-wrap]', (e) => !e.hidden), '| toc items:', await n('[data-list="doc-toc"] > [data-rendered]'), '| heading ids:', await p.$$eval('.doc_content h2[id], .doc_content h3[id]', (x) => x.slice(0, 3).map((h) => h.id).join(', ')));
  if (await n('[data-list="doc-toc"] > [data-rendered]')) {
    await p.click('[data-list="doc-toc"] > [data-rendered]:nth-of-type(3)'); await p.waitForTimeout(800);
    console.log('  after toc click hash:', await p.evaluate(() => decodeURIComponent(location.hash)));
  }
  // група сама
  await go('/doc?id=a0000000-0000-4000-8000-000000000002');
  console.log('GROUP doc tree items:', await p.$$eval('[data-list="docs-tree"] > [data-rendered].docs_tree-link', (x) => x.map((e) => e.textContent).join(' | ')), '| head active:', await p.$eval('[data-doc-group]', (e) => e.classList.contains('is-active')));
  console.log('  children section visible:', await p.$eval('[data-doc-children-section]', (e) => !e.hidden));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
