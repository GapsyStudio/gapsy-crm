/* Gapsy CRM · modules/cases.js — Sales-хаб (/cases): Кейси · Шаблони · Ціни
 * Розмітка: [data-element="cases"] — порожній контейнер (.stack); увесь UI будує модуль.
 * Кейси: case_items (+ case_item_tags) і case_tags (стиль/домен/формат). Видимість — admin/sales (RLS + guard сторінки).
 *   Фільтри: мультивибір у межах фасета = АБО, між фасетами = І; пошук за назвою/доменом/описом.
 *   v0.18: у фасеті видно 8 найчастіших тегів (+ вибрані), решта — за кнопкою «Ще N»; на чипі — кількість кейсів;
 *          «Скинути» знімає всі фільтри. Теги без кейсів не показуємо.
 *   v0.18 добірка: кнопка «+ У добірку» на картці, панель унизу — скопіювати список посилань для листа,
 *          прикріпити до ліда (RPC lead_set_cases). /cases?lead=<id> відкриває добірку цього ліда.
 * Шаблони (v0.18): sales_templates — пропозиції, відповіді, follow-up; змінні у фігурних дужках ({клієнт}) заповнюються
 *   перед копіюванням. Пишуть Sales, PM, admin.
 * Ціни (v0.18): price_items — групи, вилка ціни й термінів; бачать Sales/PM/admin, змінює admin.
 * Стилі .cases_* — у футері сторінки /cases; нові (v0.18) — у Site Head, блок 13. */
CRM.module('cases', (root, { sb, crumbs, toast, can, param, modal, onSubmit, action, user }) => {
  crumbs('Кейси');
  const el = (t, c, text) => { const e = document.createElement(t); if (c) e.className = c; if (text != null) e.textContent = text; return e; };
  const isAdmin = can('admin');
  root.replaceChildren();

  // ---------- шапка й таби ----------
  const head = el('div', 'page_header');
  const hleft = el('div');
  hleft.append(el('h1', 'heading-style-h3', 'Кейси'));
  const sub = el('div', 'text-color-secondary', 'Завантаження…');
  hleft.append(sub);
  const hact = el('div', 'page_actions');
  head.append(hleft, hact);
  root.append(head);

  const TABS = [['cases', 'Кейси'], ['templates', 'Шаблони й відповіді'], ['prices', 'Ціни']];
  const tabsBar = el('div', 'tabs_menu');
  tabsBar.setAttribute('role', 'tablist');
  const panes = {};
  TABS.forEach(([k, t]) => {
    const b = el('a', 'tabs_link', t);
    b.href = `#${k}`;
    b.dataset.casesTab = k;
    b.setAttribute('role', 'tab');
    tabsBar.append(b);
    panes[k] = el('div', 'stack cases_pane');
    panes[k].dataset.pane = k;
  });
  root.append(tabsBar, ...Object.values(panes));
  let tab = 'cases';
  function showTab(k) {
    tab = panes[k] ? k : 'cases';
    tabsBar.querySelectorAll('[data-cases-tab]').forEach((b) => {
      const on = b.dataset.casesTab === tab;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    Object.entries(panes).forEach(([key, p]) => { p.hidden = key !== tab; });
    hact.replaceChildren();
    if (tab === 'cases' && document.querySelector('.app_nav [data-nav="/showcase"]')) {
      const sc = el('a', 'button is-text is-small', 'Свіжі роботи · Showcase'); sc.href = '/showcase'; hact.append(sc); // v0.20
    }
    if (tab === 'templates') {
      const add = el('a', 'button is-small', '+ Шаблон'); add.href = '#'; add.dataset.action = 'tpl-new'; hact.append(add);
    }
    if (tab === 'prices' && isAdmin) {
      const add = el('a', 'button is-small', '+ Позиція'); add.href = '#'; add.dataset.action = 'price-new'; hact.append(add);
    }
    if (tab === 'templates') loadTemplates();
    if (tab === 'prices') loadPrices();
    updateSub();
  }
  tabsBar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cases-tab]');
    if (!b) return;
    e.preventDefault();
    history.replaceState(null, '', `${location.pathname}${location.search}#${b.dataset.casesTab}`);
    showTab(b.dataset.casesTab);
  });

  // =================================================================
  // КЕЙСИ
  // =================================================================
  const P = panes.cases;
  const bar = el('div', 'cases_toolbar');
  const search = el('input', 'form-input cases_search');
  search.type = 'search'; search.placeholder = 'Пошук за назвою, доменом…'; search.setAttribute('aria-label', 'Пошук кейсів');
  const reset = el('button', 'button is-text is-small', 'Скинути фільтри'); reset.type = 'button'; reset.hidden = true;
  bar.append(search, reset);
  const facets = el('div', 'cases_facets');
  const grid = el('div', 'cases_grid');
  const empty = el('div', 'empty_state'); empty.hidden = true;
  empty.append(el('div', 'text-size-small', 'Нічого не знайшли — зміни фільтри'));
  P.append(bar, facets, grid, empty);

  const SHOW = 8; // скільки тегів фасета видно без «Ще»
  const state = { q: '', sel: { format: new Set(), domain: new Set(), style: new Set() }, open: new Set() };
  let CASES = []; let TAGS = [];
  const labelOf = (s) => { const t = TAGS.find((x) => x.slug === s); return t ? t.label : s; };

  // ---------- добірка ----------
  const picked = new Set();
  let leads = [];          // мої нові ліди (Sales) або всі нові (PM/admin)
  let leadId = param('lead') || '';
  const tray = el('div', 'cases_tray'); tray.hidden = true;
  const trayText = el('span', 'cases_tray-text');
  const leadSel = el('select', 'form-input cases_tray-lead'); leadSel.setAttribute('aria-label', 'Лід для добірки');
  const btnCopy = el('button', 'button is-small', 'Скопіювати'); btnCopy.type = 'button';
  const btnSave = el('button', 'button is-secondary is-small', 'Прикріпити до ліда'); btnSave.type = 'button';
  const btnClear = el('button', 'button is-text is-small', 'Очистити'); btnClear.type = 'button';
  tray.append(trayText, leadSel, btnSave, btnCopy, btnClear);
  P.append(tray);

  function drawTray() {
    tray.hidden = !picked.size && !leadId;
    trayText.textContent = picked.size ? `У добірці: ${picked.size}` : 'Добірка порожня';
    btnCopy.disabled = !picked.size;
    btnSave.hidden = !leads.length;
    leadSel.hidden = !leads.length;
    grid.querySelectorAll('[data-case-id]').forEach((c) => {
      const on = picked.has(c.dataset.caseId);
      c.classList.toggle('is-picked', on);
      const b = c.querySelector('.cases_pick');
      if (b) { b.textContent = on ? '✓ У добірці' : '+ У добірку'; b.setAttribute('aria-pressed', String(on)); }
    });
  }
  const caseLine = (c) => {
    const url = c.live_url || c.behance_url || c.dribbble_url || '';
    return `• ${c.title}${c.sphere ? ` (${c.sphere})` : ''}${url ? ` — ${url}` : ''}`;
  };
  btnCopy.addEventListener('click', async () => {
    const text = CASES.filter((c) => picked.has(c.id)).map(caseLine).join('\n');
    try { await navigator.clipboard.writeText(text); toast(`Скопійовано ${picked.size} кейсів`); } catch (e) { toast('Не вдалося скопіювати'); }
  });
  btnClear.addEventListener('click', () => { picked.clear(); drawTray(); });
  btnSave.addEventListener('click', async () => {
    if (!leadSel.value) return toast('Обери лід');
    btnSave.disabled = true;
    const { error } = await sb.rpc('lead_set_cases', { lead: leadSel.value, ids: [...picked] });
    btnSave.disabled = false;
    if (error) return CRM.fail(error);
    const l = leads.find((x) => x.id === leadSel.value);
    if (l) l.case_ids = [...picked];
    toast(`Добірку прикріплено до «${l?.title || 'ліда'}»`);
  });
  leadSel.addEventListener('change', () => {
    leadId = leadSel.value;
    const l = leads.find((x) => x.id === leadId);
    if (l && l.case_ids?.length && !picked.size) { l.case_ids.forEach((id) => picked.add(id)); renderCases(); }
    drawTray();
  });

  async function loadLeads() {
    let q = sb.from('leads').select('id, title, client, case_ids, status, created_by').eq('status', 'new').order('created_at', { ascending: false }).limit(30);
    if (!can('pm,admin')) q = q.eq('created_by', user.id);
    const { data, error } = await q;
    if (error) return console.warn('[CRM] leads', error.message);
    leads = data || [];
    leadSel.replaceChildren(new Option('— лід —', ''), ...leads.map((l) => new Option([l.title, l.client].filter(Boolean).join(' · '), l.id)));
    if (leadId && leads.some((l) => l.id === leadId)) {
      leadSel.value = leadId;
      (leads.find((l) => l.id === leadId).case_ids || []).forEach((id) => picked.add(id));
    }
  }

  Promise.all([
    sb.from('case_tags').select('slug,kind,label,sort').order('sort'),
    sb.from('case_items').select('id,ref_code,title,format,sphere,service,summary,use_when,behance_url,dribbble_url,live_url,nda,case_item_tags(tag)').order('ref_code'),
    loadLeads(),
  ]).then(([te, ce]) => {
    if (te.error || ce.error) { sub.textContent = 'Помилка завантаження'; return console.error(te.error || ce.error); }
    TAGS = te.data;
    CASES = ce.data.map((c) => ({ ...c, tags: (c.case_item_tags || []).map((x) => x.tag) }));
    buildFacets(); renderCases();
  });

  // ---------- фасети ----------
  const FACETS = [['format', 'Формат'], ['domain', 'Домен'], ['style', 'Стиль']];
  function buildFacets() {
    facets.replaceChildren();
    const count = {};
    CASES.forEach((c) => c.tags.forEach((t) => { count[t] = (count[t] || 0) + 1; }));
    FACETS.forEach(([kind, title]) => {
      const tags = TAGS.filter((t) => t.kind === kind && count[t.slug])
        .sort((a, b) => count[b.slug] - count[a.slug] || a.sort - b.sort);
      if (!tags.length) return;
      const g = el('div', 'cases_facet');
      g.append(el('div', 'cases_facet-title', title));
      const chips = el('div', 'cases_chips');
      const sel = state.sel[kind];
      const open = state.open.has(kind);
      const visible = open ? tags : tags.filter((t, i) => i < SHOW || sel.has(t.slug));
      visible.forEach((tag) => {
        const b = el('button', `cases_chip${sel.has(tag.slug) ? ' is-active' : ''}`);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(sel.has(tag.slug)));
        b.append(document.createTextNode(tag.label), el('span', 'cases_chip-count', String(count[tag.slug])));
        b.addEventListener('click', () => {
          if (sel.has(tag.slug)) sel.delete(tag.slug); else sel.add(tag.slug);
          buildFacets(); renderCases();
        });
        chips.append(b);
      });
      const hiddenN = tags.length - visible.length;
      if (hiddenN > 0 || open) {
        const more = el('button', 'cases_chip is-more', open ? 'Згорнути' : `Ще ${hiddenN}`);
        more.type = 'button';
        more.setAttribute('aria-expanded', String(open));
        more.addEventListener('click', () => { if (open) state.open.delete(kind); else state.open.add(kind); buildFacets(); });
        chips.append(more);
      }
      g.append(chips);
      facets.append(g);
    });
    reset.hidden = !Object.values(state.sel).some((s) => s.size) && !state.q;
  }
  search.addEventListener('input', () => { state.q = search.value.trim().toLowerCase(); reset.hidden = !Object.values(state.sel).some((s) => s.size) && !state.q; renderCases(); });
  reset.addEventListener('click', () => {
    Object.values(state.sel).forEach((s) => s.clear());
    state.q = ''; search.value = '';
    buildFacets(); renderCases();
  });

  const match = (c) => {
    for (const kind in state.sel) {
      const s = state.sel[kind];
      if (s.size && ![...s].some((sl) => c.tags.includes(sl))) return false;
    }
    if (state.q) {
      const hay = `${c.title || ''} ${c.sphere || ''} ${c.summary || ''}`.toLowerCase();
      if (!hay.includes(state.q)) return false;
    }
    return true;
  };

  function updateSub() {
    if (tab === 'cases') sub.textContent = CASES.length ? `${CASES.filter(match).length} з ${CASES.length} кейсів` : 'Завантаження…';
    if (tab === 'templates') sub.textContent = 'Скопіюй готовий текст — змінні в {дужках} заповниш перед копіюванням';
    if (tab === 'prices') sub.textContent = 'Орієнтири для розмови з клієнтом; точну оцінку дає PM';
  }

  function renderCases() {
    const listed = CASES.filter(match);
    updateSub();
    grid.replaceChildren();
    empty.hidden = !!listed.length;
    listed.forEach((c) => {
      const card = el('div', 'cases_card');
      card.dataset.caseId = c.id;
      const top = el('div', 'cases_card-top');
      top.append(el('div', 'cases_card-title', c.title));
      if (c.nda && c.nda !== 'no') top.append(el('span', 'cases_nda', c.nda === 'yes' ? 'NDA' : 'NDA?'));
      card.append(top);
      card.append(el('div', 'cases_card-meta', [labelOf(c.format), c.sphere].filter(Boolean).join(' · ')));
      const tg = el('div', 'cases_card-tags');
      (c.tags || []).slice(0, 6).forEach((sl) => tg.append(el('span', 'cases_tag', labelOf(sl))));
      card.append(tg);
      const links = el('div', 'cases_card-links');
      [['behance_url', 'Behance'], ['dribbble_url', 'Dribbble'], ['live_url', 'Сайт']].forEach(([k, lbl]) => {
        if (c[k] && /^https?:\/\//i.test(c[k])) { const a = el('a', 'cases_link', lbl); a.href = c[k]; a.target = '_blank'; a.rel = 'noopener'; links.append(a); }
      });
      const pick = el('button', 'cases_pick'); pick.type = 'button';
      pick.addEventListener('click', () => { if (picked.has(c.id)) picked.delete(c.id); else picked.add(c.id); drawTray(); });
      links.append(pick);
      card.append(links);
      grid.append(card);
    });
    drawTray();
  }

  // =================================================================
  // ШАБЛОНИ Й ВІДПОВІДІ
  // =================================================================
  const T = panes.templates;
  const KIND = { proposal: 'Пропозиція', answer: 'Відповідь', followup: 'Follow-up' };
  const tSearch = el('input', 'form-input cases_search'); tSearch.type = 'search'; tSearch.placeholder = 'Пошук шаблону…'; tSearch.setAttribute('aria-label', 'Пошук шаблону');
  const tList = el('div', 'cases_tpl-groups');
  T.append(tSearch, tList);
  let TPL = null;
  async function loadTemplates(force) {
    if (TPL && !force) return drawTemplates();
    const { data, error } = await sb.from('sales_templates').select('id, kind, title, body, sort, updated_at').order('sort').order('title');
    if (error) return CRM.fail(error);
    TPL = data;
    drawTemplates();
  }
  tSearch.addEventListener('input', drawTemplates);
  function drawTemplates() {
    const q = tSearch.value.trim().toLowerCase();
    const rows = (TPL || []).filter((t) => !q || `${t.title} ${t.body}`.toLowerCase().includes(q));
    tList.replaceChildren();
    if (!rows.length) {
      const e = el('div', 'empty_state');
      e.append(el('div', 'text-size-small', TPL?.length ? 'Нічого не знайшли' : 'Шаблонів ще немає. Додай першу типову відповідь — наступного разу скопіюєш за секунду.'));
      tList.append(e);
      return;
    }
    Object.entries(KIND).forEach(([k, label]) => {
      const part = rows.filter((t) => t.kind === k);
      if (!part.length) return;
      const card = el('section', 'card');
      const hd = el('div', 'card_header'); hd.append(el('div', 'card_title', label)); card.append(hd);
      const list = el('div', 'list');
      part.forEach((t) => {
        const row = el('a', 'list_row'); row.href = '#'; row.dataset.action = 'tpl-open'; row.dataset.id = t.id;
        row.append(el('span', 'list_title', t.title), el('span', 'list_meta', t.body.replace(/\s+/g, ' ').slice(0, 80)));
        list.append(row);
      });
      card.append(list);
      tList.append(card);
    });
  }

  // модалка шаблону: перегляд зі змінними + редагування
  const tplModal = el('div', 'modal_wrapper');
  tplModal.dataset.modal = 'tpl';
  tplModal.setAttribute('role', 'dialog'); tplModal.setAttribute('aria-modal', 'true'); tplModal.setAttribute('aria-label', 'Шаблон');
  tplModal.innerHTML = '<div class="modal"><form class="modal_form" data-form="tpl">'
    + '<div class="modal_header"><div class="card_title" data-tpl-head>Шаблон</div><a href="#" class="icon_button" data-action="close" aria-label="Закрити">×</a></div>'
    + '<div class="modal_body">'
    + '<div data-tpl-view><div class="cases_vars" data-tpl-vars></div><div class="field-label">Текст</div><div class="cases_tpl-preview" data-tpl-preview></div></div>'
    + '<div data-tpl-edit hidden>'
    + '<div class="form_field"><label class="field-label" for="tpl-kind">Тип</label><select class="form-input" id="tpl-kind" name="kind"><option value="answer">Відповідь</option><option value="proposal">Пропозиція</option><option value="followup">Follow-up</option></select></div>'
    + '<div class="form_field"><label class="field-label" for="tpl-title">Назва</label><input class="form-input" id="tpl-title" name="title" maxlength="160" placeholder="Перша відповідь на запит з Behance"></div>'
    + '<div class="form_field"><label class="field-label" for="tpl-body">Текст</label><textarea class="form-input" id="tpl-body" name="body" rows="10" maxlength="10000" placeholder="Привіт, {імʼя}! Дякуємо за запит…"></textarea><div class="text-size-small text-color-secondary">Змінні пиши у фігурних дужках: {клієнт}, {термін}, {сума}</div></div>'
    + '</div></div>'
    + '<div class="modal_footer"><a href="#" class="button is-text is-small" data-action="tpl-delete" hidden>Видалити</a><a href="#" class="button is-text is-small" data-action="tpl-edit">Редагувати</a><a href="#" class="button is-small" data-action="tpl-copy">Скопіювати</a><button class="button is-small" type="submit" hidden>Зберегти</button></div>'
    + '</form></div>';
  root.append(tplModal);
  const $t = (s) => tplModal.querySelector(s);
  let tplCur = null;
  const VARS = (body) => [...new Set((body.match(/\{[^{}\n]{1,30}\}/g) || []).map((v) => v.slice(1, -1)))];
  function fillPreview() {
    let text = tplCur?.body || '';
    tplModal.querySelectorAll('[data-var]').forEach((i) => { if (i.value.trim()) text = text.split(`{${i.dataset.var}}`).join(i.value.trim()); });
    $t('[data-tpl-preview]').textContent = text;
    return text;
  }
  function openTpl(t, edit) {
    tplCur = t;
    modal.open('tpl');
    $t('[data-tpl-head]').textContent = t ? t.title : 'Новий шаблон';
    $t('[data-tpl-view]').hidden = !!edit;
    $t('[data-tpl-edit]').hidden = !edit;
    $t('[data-action="tpl-copy"]').hidden = !!edit;
    $t('[data-action="tpl-edit"]').hidden = !!edit;
    $t('[type="submit"]').hidden = !edit;
    $t('[data-action="tpl-delete"]').hidden = !(edit && t);
    const f = $t('[data-form="tpl"]');
    if (edit) {
      f.elements.kind.value = t?.kind || 'answer';
      f.elements.title.value = t?.title || '';
      f.elements.body.value = t?.body || '';
      setTimeout(() => f.elements.title.focus(), 40);
    } else {
      const vars = $t('[data-tpl-vars]');
      vars.replaceChildren(...VARS(t.body).map((v, i) => {
        const w = el('div', 'form_field');
        const id = `tpl-var-${i}`;
        const l = el('label', 'field-label', v); l.htmlFor = id;
        const inp = el('input', 'form-input'); inp.id = id; inp.dataset.var = v; inp.placeholder = v;
        inp.addEventListener('input', fillPreview);
        w.append(l, inp);
        return w;
      }));
      fillPreview();
      setTimeout(() => vars.querySelector('input')?.focus(), 40);
    }
  }
  action('tpl-open', (a) => openTpl((TPL || []).find((t) => t.id === a.dataset.id), false));
  action('tpl-new', () => openTpl(null, true));
  action('tpl-edit', () => openTpl(tplCur, true));
  action('tpl-copy', async () => {
    try { await navigator.clipboard.writeText(fillPreview()); toast('Текст скопійовано'); modal.close(); } catch (e) { toast('Не вдалося скопіювати'); }
  });
  action('tpl-delete', async () => {
    if (!tplCur || !confirm(`Видалити шаблон «${tplCur.title}»?`)) return;
    const { error } = await sb.from('sales_templates').delete().eq('id', tplCur.id);
    if (error) return CRM.fail(error);
    modal.close(); toast('Шаблон видалено'); loadTemplates(true);
  });
  onSubmit('tpl', async (d) => {
    const row = { kind: KIND[d.kind] ? d.kind : 'answer', title: (d.title || '').trim(), body: (d.body || '').trim() };
    if (!row.title || !row.body) return toast('Заповни назву й текст');
    const { error } = tplCur
      ? await sb.from('sales_templates').update(row).eq('id', tplCur.id)
      : await sb.from('sales_templates').insert(row);
    if (error) throw error;
    modal.close(); toast('Збережено'); loadTemplates(true);
  });

  // =================================================================
  // ЦІНИ
  // =================================================================
  const PR = panes.prices;
  const prBox = el('div', 'stack');
  PR.append(prBox);
  let PRICES = null;
  const SIGN = { USD: '$', EUR: '€', UAH: '₴' };
  const range = (a, b, fmt) => (a == null && b == null ? '—' : a != null && b != null && a !== b ? `${fmt(a)}–${fmt(b)}` : fmt(a ?? b));
  async function loadPrices(force) {
    if (PRICES && !force) return drawPrices();
    const { data, error } = await sb.from('price_items').select('*').order('grp').order('sort').order('title');
    if (error) return CRM.fail(error);
    PRICES = data;
    drawPrices();
  }
  function drawPrices() {
    prBox.replaceChildren();
    if (!PRICES.length) {
      const e = el('div', 'empty_state');
      e.append(el('div', 'text-size-small', isAdmin ? 'Довідник порожній. Додай типові роботи з вилкою ціни й термінів.' : 'Довідник цін ще не заповнили. Попроси адміна.'));
      prBox.append(e);
      return;
    }
    [...new Set(PRICES.map((p) => p.grp))].forEach((g) => {
      const card = el('section', 'card');
      const hd = el('div', 'card_header'); hd.append(el('div', 'card_title', g)); card.append(hd);
      const list = el('div', 'list');
      PRICES.filter((p) => p.grp === g).forEach((p) => {
        const row = el(isAdmin ? 'a' : 'div', 'list_row cases_price-row');
        if (isAdmin) { row.href = '#'; row.dataset.action = 'price-edit'; row.dataset.id = p.id; }
        const txt = el('div', 'person_text');
        txt.append(el('span', 'list_title', p.title));
        if (p.note) txt.append(el('span', 'list_meta', p.note));
        const money = (v) => `${SIGN[p.currency] || ''}${Number(v).toLocaleString('uk-UA')}${SIGN[p.currency] ? '' : ` ${p.currency}`}`;
        row.append(txt,
          el('span', 'cases_price', range(p.price_from, p.price_to, money)),
          el('span', 'list_meta cases_days', p.days_from == null && p.days_to == null ? '' : `${range(p.days_from, p.days_to, (v) => v)} роб. дн.`));
        list.append(row);
      });
      card.append(list);
      prBox.append(card);
    });
  }
  const prModal = el('div', 'modal_wrapper');
  prModal.dataset.modal = 'price';
  prModal.setAttribute('role', 'dialog'); prModal.setAttribute('aria-modal', 'true'); prModal.setAttribute('aria-label', 'Позиція довідника цін');
  prModal.innerHTML = '<div class="modal"><form class="modal_form" data-form="price">'
    + '<div class="modal_header"><div class="card_title" data-price-head>Позиція</div><a href="#" class="icon_button" data-action="close" aria-label="Закрити">×</a></div>'
    + '<div class="modal_body">'
    + '<div class="form_field"><label class="field-label" for="pr-grp">Група</label><input class="form-input" id="pr-grp" name="grp" maxlength="60" list="pr-grps" placeholder="Webflow"><datalist id="pr-grps"></datalist></div>'
    + '<div class="form_field"><label class="field-label" for="pr-title">Що робимо</label><input class="form-input" id="pr-title" name="title" maxlength="160" required placeholder="Лендинг до 6 секцій"></div>'
    + '<div class="grid-2col"><div class="form_field"><label class="field-label" for="pr-from">Ціна від</label><input class="form-input" id="pr-from" name="price_from" inputmode="numeric"></div>'
    + '<div class="form_field"><label class="field-label" for="pr-to">Ціна до</label><input class="form-input" id="pr-to" name="price_to" inputmode="numeric"></div></div>'
    + '<div class="grid-2col"><div class="form_field"><label class="field-label" for="pr-cur">Валюта</label><select class="form-input" id="pr-cur" name="currency"><option>USD</option><option>EUR</option><option>UAH</option></select></div>'
    + '<div class="form_field"><label class="field-label" for="pr-days">Термін, роб. днів (від–до)</label><input class="form-input" id="pr-days" name="days" placeholder="10–15"></div></div>'
    + '<div class="form_field"><label class="field-label" for="pr-note">Примітка</label><input class="form-input" id="pr-note" name="note" maxlength="1000" placeholder="Без копірайтингу; анімації — окремо"></div>'
    + '</div><div class="modal_footer"><a href="#" class="button is-text is-small" data-action="price-delete" hidden>Видалити</a><a href="#" class="button is-text is-small" data-action="close">Скасувати</a><button class="button is-small" type="submit">Зберегти</button></div>'
    + '</form></div>';
  root.append(prModal);
  let prCur = null;
  function openPrice(p) {
    prCur = p || null;
    modal.open('price');
    const f = prModal.querySelector('form');
    f.reset();
    prModal.querySelector('[data-price-head]').textContent = p ? p.title : 'Нова позиція';
    prModal.querySelector('#pr-grps').replaceChildren(...[...new Set((PRICES || []).map((x) => x.grp))].map((g) => new Option(g)));
    f.elements.grp.value = p?.grp || '';
    f.elements.title.value = p?.title || '';
    f.elements.price_from.value = p?.price_from ?? '';
    f.elements.price_to.value = p?.price_to ?? '';
    f.elements.currency.value = p?.currency || 'USD';
    f.elements.days.value = p ? [p.days_from, p.days_to].filter((x) => x != null).join('–') : '';
    f.elements.note.value = p?.note || '';
    prModal.querySelector('[data-action="price-delete"]').hidden = !p;
  }
  action('price-new', () => openPrice(null));
  action('price-edit', (a) => openPrice((PRICES || []).find((p) => p.id === a.dataset.id)));
  action('price-delete', async () => {
    if (!prCur || !confirm(`Видалити «${prCur.title}»?`)) return;
    const { error } = await sb.from('price_items').delete().eq('id', prCur.id);
    if (error) return CRM.fail(error);
    modal.close(); loadPrices(true);
  });
  onSubmit('price', async (d) => {
    const num = (v) => { const n = String(v ?? '').replace(/[\s,]/g, ''); return n === '' ? null : Number(n) >= 0 ? Math.round(Number(n)) : NaN; };
    const days = String(d.days || '').split(/[–\-—]/).map((x) => num(x.trim()));
    const row = {
      grp: (d.grp || '').trim() || 'Webflow', title: (d.title || '').trim(),
      price_from: num(d.price_from), price_to: num(d.price_to),
      currency: ['USD', 'EUR', 'UAH'].includes(d.currency) ? d.currency : 'USD',
      days_from: days[0] ?? null, days_to: days[1] ?? days[0] ?? null, note: (d.note || '').trim() || null,
    };
    if (!row.title) return toast('Вкажи, що робимо');
    if ([row.price_from, row.price_to, row.days_from, row.days_to].some((v) => Number.isNaN(v))) return toast('Ціни й терміни — числа');
    const { error } = prCur ? await sb.from('price_items').update(row).eq('id', prCur.id) : await sb.from('price_items').insert(row);
    if (error) throw error;
    modal.close(); toast('Збережено'); loadPrices(true);
  });

  showTab((location.hash || '').slice(1) || 'cases');
});
