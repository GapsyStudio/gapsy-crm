// Смоук v0.20: меню (групи, «Моя робота», Онбординг), Головна без стрибка, адмінка (налаштування, запрошення, експорт).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (url, role, created, extra = {}) => {
    const ctx = await b.newContext({ permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
    await ctx.addInitScript(({ role, created, extra }) => {
      window.__FIXPATCH = Object.assign({ profiles: [{ id: 'u1', email: 'nelia@gapsy.studio', full_name: 'Нелія', role, created_at: created, is_art_director: false, is_leave_approver: false }] }, extra);
    }, { role, created, extra });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${role} ${url}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(`${role} ${url}: ${m.text()}`); });
    await p.goto(`http://localhost:8765${url}`); await p.waitForTimeout(1300);
    return p;
  };
  const nav = (p) => p.$$eval('.app_nav > *', (x) => x.filter((e) => !e.hidden).map((e) => (e.classList.contains('app_nav-group') ? `[${e.textContent.trim()}${e.classList.contains('is-closed') ? ' ▸' : ' ▾'}]` : e.textContent.trim())).join(' '));
  const old = new Date(Date.now() - 90 * 864e5).toISOString(), fresh = new Date().toISOString();
  let p = await open('/app', 'admin', old);
  console.log('admin old:', await nav(p));
  await p.click('.app_nav-group:has-text("Знання")'); await p.waitForTimeout(100);
  console.log('after open Знання:', await nav(p), '| saved', await p.evaluate(() => localStorage.getItem('crm-nav-closed')));
  console.log('dashboard role attr:', await p.$eval('[data-element="dashboard"]', (e) => e.dataset.homeRole));
  await p.reload(); await p.waitForTimeout(1000);
  console.log('after reload:', await nav(p));
  await p.context().close();
  p = await open('/app', 'designer', fresh);
  console.log('\ndesigner fresh:', await nav(p));
  await p.context().close();
  p = await open('/app', 'sales', old);
  console.log('sales old:', await nav(p));
  await p.context().close();
  // адмінка
  p = await open('/admin', 'admin', old, { profiles: [
    { id: 'u1', email: 'nelia@gapsy.studio', full_name: 'Нелія', role: 'admin', created_at: old },
    { id: 'u2', email: 'info@gapsystudio.com', full_name: 'Gapsy Studio', role: 'admin', created_at: old },
    { id: 'u3', email: 'ilya@gapsy.studio', full_name: 'Ілля', role: 'admin', created_at: old },
    { id: 'u4', email: 'k@gapsy.studio', full_name: 'Ксенія', role: 'pm', created_at: old, is_leave_approver: true }] });
  console.log('\nhealth:', await p.$eval('[data-admin-health] .card_title', (e) => e.textContent));
  console.log(JSON.stringify(await p.$$eval('[data-admin-health] .list_row', (x) => x.map((e) => e.querySelector('.badge').textContent + ' ' + e.querySelector('.list_title').textContent))));
  await p.click('[data-action="admin-invite"]'); await p.waitForTimeout(200);
  console.log('invite:', (await p.evaluate(() => navigator.clipboard.readText())).slice(0, 90));
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.click('[data-action="admin-export"]')]);
  const fs = require('fs'); const path = await dl.path(); const j = JSON.parse(fs.readFileSync(path, 'utf8'));
  console.log('export:', dl.suggestedFilename(), Object.keys(j.tables).length, 'tables, errors', Object.keys(j.errors).length);
  await p.waitForTimeout(300);
  console.log('export row now:', await p.$$eval('[data-admin-health] .list_row', (x) => x.map((e) => e.textContent).find((t) => t.includes('експорт') || t.includes('Експорт'))));
  await p.context().close();
  console.log('\nerrors:', errs.length ? errs : 'none');
  await b.close();
})();
