/* Gapsy CRM · modules/cases.js — Кейс-бібліотека Sales (/cases)
 * Розмітка: [data-element="cases"] — порожній контейнер (.stack); увесь UI будує модуль.
 * Дані: case_items (+ вкладені case_item_tags) і case_tags (стиль/домен/формат). Видимість — admin/sales (RLS + guard сторінки).
 * Фільтри: мультивибір у межах фасета = АБО, між фасетами = І; пошук за назвою/доменом/описом.
 * Стилі .cases_* — у Site Settings → Footer (секція «кейс-бібліотека»). */
CRM.module('cases', (root, { sb, crumbs }) => {
  crumbs('Кейси');
  const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
  root.replaceChildren();

  const head = el('div', 'page_header');
  const hleft = el('div');
  const h1 = el('h1', 'heading-style-h3'); h1.textContent = 'Кейси';
  const sub = el('div', 'text-color-secondary'); sub.textContent = 'Завантаження…';
  hleft.append(h1, sub); head.append(hleft); root.append(head);

  const search = el('input', 'form-input cases_search');
  search.type = 'search'; search.placeholder = 'Пошук за назвою, доменом…'; root.append(search);
  const facets = el('div', 'cases_facets'); root.append(facets);
  const grid = el('div', 'cases_grid'); root.append(grid);
  const empty = el('div', 'empty_state'); empty.style.display = 'none';
  empty.innerHTML = '<div class="text-size-small">Нічого не знайшли — зміни фільтри</div>'; root.append(empty);

  const state = { q: '', sel: { format: new Set(), domain: new Set(), style: new Set() } };
  let CASES = []; let TAGS = [];
  const labelOf = (s) => { const t = TAGS.find((x) => x.slug === s); return t ? t.label : s; };

  Promise.all([
    sb.from('case_tags').select('slug,kind,label,sort').order('sort'),
    sb.from('case_items').select('id,ref_code,title,format,sphere,service,summary,use_when,behance_url,dribbble_url,live_url,nda,case_item_tags(tag)').order('ref_code'),
  ]).then(([te, ce]) => {
    if (te.error || ce.error) { sub.textContent = 'Помилка завантаження'; return console.error(te.error || ce.error); }
    TAGS = te.data;
    CASES = ce.data.map((c) => ({ ...c, tags: (c.case_item_tags || []).map((x) => x.tag) }));
    buildFacets(); render();
  });

  function buildFacets() {
    [['format', 'Формат'], ['domain', 'Домен'], ['style', 'Стиль']].forEach(([kind, title]) => {
      const tags = TAGS.filter((t) => t.kind === kind);
      if (!tags.length) return;
      const g = el('div', 'cases_facet'); const t = el('div', 'cases_facet-title'); t.textContent = title; g.append(t);
      const chips = el('div', 'cases_chips');
      tags.forEach((tag) => {
        const b = el('button', 'cases_chip'); b.type = 'button'; b.textContent = tag.label;
        b.addEventListener('click', () => {
          const s = state.sel[kind];
          if (s.has(tag.slug)) s.delete(tag.slug); else s.add(tag.slug);
          b.classList.toggle('is-active'); render();
        });
        chips.append(b);
      });
      g.append(chips); facets.append(g);
    });
  }

  search.addEventListener('input', () => { state.q = search.value.trim().toLowerCase(); render(); });

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

  function render() {
    const listed = CASES.filter(match);
    sub.textContent = `${listed.length} з ${CASES.length} кейсів`;
    grid.replaceChildren();
    empty.style.display = listed.length ? 'none' : '';
    listed.forEach((c) => {
      const card = el('div', 'cases_card');
      const top = el('div', 'cases_card-top');
      const ttl = el('div', 'cases_card-title'); ttl.textContent = c.title; top.append(ttl);
      if (c.nda && c.nda !== 'no') { const nd = el('span', 'cases_nda'); nd.textContent = c.nda === 'yes' ? 'NDA' : 'NDA?'; top.append(nd); }
      card.append(top);
      const meta = el('div', 'cases_card-meta'); meta.textContent = [labelOf(c.format), c.sphere].filter(Boolean).join(' · '); card.append(meta);
      const tg = el('div', 'cases_card-tags');
      (c.tags || []).slice(0, 6).forEach((sl) => { const s = el('span', 'cases_tag'); s.textContent = labelOf(sl); tg.append(s); });
      card.append(tg);
      const links = el('div', 'cases_card-links');
      [['behance_url', 'Behance'], ['dribbble_url', 'Dribbble'], ['live_url', 'Сайт']].forEach(([k, lbl]) => {
        if (c[k]) { const a = el('a', 'cases_link'); a.href = c[k]; a.target = '_blank'; a.rel = 'noopener'; a.textContent = lbl; links.append(a); }
      });
      card.append(links); grid.append(card);
    });
  }
});
