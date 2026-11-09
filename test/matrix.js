// Матриця: усі сторінки × усі ролі на мок-сервері з guard-ами живого сайту (09.11).
const { chromium } = require('playwright');
const GUARD = { '/app': 'auth', '/my-work': 'designer,developer,pm,admin', '/onboarding': 'auth,pending', '/projects': 'designer,developer,pm,sales,admin',
  '/project?id=p1': 'staff', '/feedback': 'designer,developer,pm,admin', '/feedback-item?id=f1': 'staff', '/reviews': 'designer,developer,pm,admin', '/docs': 'staff',
  '/doc?id=dcrm': 'staff,pending', '/snippets': 'developer,admin', '/snippet?id=sn1': 'developer,admin', '/references': 'designer,pm,admin',
  '/fonts': 'designer,developer,pm,admin', '/showcase': 'designer,developer,pm,sales,admin', '/cases': 'sales,pm,admin', '/leave': 'staff', '/access': 'staff',
  '/admin': 'admin', '/profile': 'auth' };
const ROLES = ['designer', 'art', 'developer', 'pm', 'sales', 'admin', 'pending'];
const STAFF = ['designer', 'developer', 'pm', 'sales', 'admin'];
const allowed = (rule, role) => { const r = role === 'art' ? 'designer' : role; const l = rule.split(','); if (r === 'pending') return l.includes('pending'); return l.includes('auth') || l.includes(r) || (l.includes('staff') && STAFF.includes(r)); };
(async () => {
  const b = await chromium.launch();
  const rows = []; let fails = 0;
  for (const role of ROLES) {
    const ctx = await b.newContext();
    await ctx.addInitScript((role) => {
      window.__FIXPATCH = Object.assign(window.__FIXPATCH || {}, { profiles: [{ id: 'u1', email: 'x@gapsy.studio', full_name: 'Тест', role: role === 'art' ? 'designer' : role, is_art_director: role === 'art', is_leave_approver: role === 'admin', avatar_url: null, created_at: new Date().toISOString() }] });
      window.__FN = { 'my-tasks': { data: { matched: true, tasks: [] }, error: null } };
    }, role);
    await ctx.route('**/*', async (route) => {
      const u = new URL(route.request().url());
      const key = Object.keys(GUARD).find((k) => k.split('?')[0] === u.pathname);
      if (route.request().resourceType() !== 'document' || !key) return route.continue();
      const res = await route.fetch(); let body = await res.text();
      body = body.replace(/data-crm-guard="[^"]*"/, `data-crm-guard="${GUARD[key]}"`);
      route.fulfill({ response: res, body });
    });
    for (const [url, rule] of Object.entries(GUARD)) {
      const p = await ctx.newPage(); const errs = [];
      p.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
      p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 120)); });
      await p.goto(`http://localhost:8765${url}`); await p.waitForTimeout(900);
      const path = new URL(p.url()).pathname;
      const want = allowed(rule, role);
      const ok = want ? path === url.split('?')[0] : path !== url.split('?')[0];
      if (!ok || errs.length) fails++;
      rows.push(`${ok && !errs.length ? 'OK ' : 'XX '} ${role.padEnd(9)} ${url.padEnd(22)} ${want ? 'open' : 'deny'} → ${path}${errs.length ? '  ERR: ' + errs.join(' | ') : ''}`);
      await p.close();
    }
    await ctx.close();
  }
  console.log(rows.filter((r) => r.startsWith('XX')).join('\n') || 'усі комбінації OK');
  console.log(`\nперевірено: ${rows.length}, проблем: ${fails}`);
  await b.close();
})();
