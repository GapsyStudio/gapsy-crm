// Смоук v0.19: погоджена версія в хендоффі, нотатка → правка, Sales-перегляд проєкту, розробник на «Погодженнях».
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (url, role, extra = {}) => {
    const ctx = await b.newContext();
    await ctx.addInitScript(({ role, extra }) => {
      window.__FIXPATCH = Object.assign({ profiles: [{ id: 'u1', email: 'x@gapsy.studio', full_name: 'Тест', role, avatar_url: null }] }, extra);
    }, { role, extra });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${role} ${url}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(`${role} ${url}: ${m.text()}`); });
    await p.goto(`http://localhost:8765${url}`); await p.waitForTimeout(1300);
    return p;
  };
  const reviews = [{ id: 'r1', project_id: 'p1', title: 'Головна', version: 2, url: 'https://figma.com/a', status: 'approved', decided_at: '2026-11-05T10:00:00Z', created_at: '2026-11-04T10:00:00Z' },
                   { id: 'r2', project_id: 'p1', title: 'Каталог', version: 1, url: 'https://figma.com/b', status: 'pending', decided_at: null, created_at: '2026-11-08T10:00:00Z' }];
  const notes = [{ id: 'n1', body: 'Клієнт хоче темніший хедер\nі більший логотип', kind: 'client', link: 'https://gapsy.slack.com/x', pinned: false, created_at: new Date().toISOString(), author_id: 'u1', author: { full_name: 'Тест' } }];
  let p = await open('/project?id=p1', 'developer', { design_reviews: reviews, project_notes: notes });
  console.log('review line:', await p.$eval('[data-ho-review]', (e) => e.textContent));
  console.log('review link:', await p.$eval('[data-ho-review] a', (e) => e.href + ' ' + e.target));
  await p.click('[data-action="note-to-feedback"]'); await p.waitForTimeout(500);
  console.log('feedback insert:', JSON.stringify(await p.evaluate(() => window.__calls.filter((c) => c[1] === 'feedback' && c[0] === 'insert').map((c) => c[2]))).slice(0, 300), '→', p.url().replace('http://localhost:8765', ''));
  await p.context().close();
  p = await open('/project?id=p1', 'designer', { design_reviews: [reviews[1]] });
  console.log('\nno approved:', await p.$eval('[data-ho-review]', (e) => e.textContent));
  await p.context().close();
  p = await open('/project?id=p1', 'sales', { design_reviews: reviews, project_notes: notes });
  console.log('\nsales: handoff hidden', await p.$eval('[data-handoff]', (e) => e.hidden), '| feedback hidden', await p.$eval('[data-list="project-feedback"]', (e) => !!e.closest('section')?.hidden), '| review line', !(await p.$('[data-ho-review]')), '| no →Правка', !(await p.$('[data-action="note-to-feedback"]')));
  await p.context().close();
  p = await open('/reviews', 'developer');
  console.log('\ndev reviews: new btn removed', !(await p.$('[data-action="review-new"]')), '| path', new URL(p.url()).pathname);
  await p.context().close();
  console.log('\nerrors:', errs.length ? errs : 'none');
  await b.close();
})();
