// v0.12.1: підписи полів звʼязані з полями (a11y) + форма без обробника не відправляється в Webflow Forms
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await (await b.newContext()).newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  // розмітка як у Webflow: label for="<name>", у поля інший id
  await p.addInitScript(() => document.addEventListener('readystatechange', () => document.readyState === 'interactive' && document.body.insertAdjacentHTML('beforeend',
    '<form data-form="review"><div class="form_field"><label for="title" class="field-label">Назва</label><input name="title" id="rv-title"></div>' +
    '<div class="form_field"><label for="project_id">Проєкт</label><select name="project_id"></select></div></form>')));
  await p.goto('http://localhost:8765/app'); await p.waitForTimeout(900);
  const labels = await p.$$eval('.form_field', (fs) => fs.map((f) => {
    const c = f.querySelector('input:not([type="hidden"]):not([type="checkbox"]), select, textarea');
    return c ? `${c.name}:${c.labels ? c.labels.length : 0}` : null;
  }).filter(Boolean));
  console.log('labels linked:', labels.join(' '));
  if (labels.some((x) => x.endsWith(':0'))) errs.push('unlinked label');
  // форма з невідомим ключем: додаємо в DOM і сабмітимо
  const r = await p.evaluate(async () => {
    document.body.insertAdjacentHTML('beforeend', '<form data-form="no-such-handler" action="/should-not-go"><input name="a" value="1"><button type="submit" id="nsh">go</button></form>');
    let leaked = false;
    document.addEventListener('submit', (e) => { if (!e.defaultPrevented) leaked = true; e.preventDefault(); });
    document.getElementById('nsh').click();
    await new Promise((res) => setTimeout(res, 200));
    return { leaked, toast: document.body.textContent.includes('Ця дія ще недоступна') };
  });
  console.log('unhandled form:', JSON.stringify(r));
  if (r.leaked) errs.push('unhandled form leaked');
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
