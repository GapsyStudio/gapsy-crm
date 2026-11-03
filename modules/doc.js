/* Gapsy CRM · modules/doc.js — Документ бази знань (/doc?id=<id>)
 * Розмітка: [data-element="doc"]
 *   дерево:   data-list="docs-tree" (CRM.docsTree) — лише поточна група; шапка групи [data-doc-group] (поля icon, title)
 *   зміст:    [data-doc-toc-wrap] + data-list="doc-toc" (поле title) — «На цій сторінці», якщо заголовків ≥ 3
 *   шапка:    [data-doc="icon|title|meta"]
 *   контент:  [data-doc-editor] — сюди JS малює блоки (читання) або вмикає Editor.js (редагування)
 *   діти:     [data-doc-children-section] + data-list="doc-children"
 *   немає:    [data-doc-notfound]
 *   дії:      pin, doc-edit, doc-save, doc-cancel, doc-delete, doc-create-child (редагування — лише PM/admin, решту ховає data-crm-role)
 * Контент — блоки Editor.js. Картинки й файли лежать у Storage (bucket media) і мають path; посилання storage:<path>
 * перетворюються на тимчасові signed URL. Editor.js вантажиться лише в режимі редагування. */
CRM.module('doc', async (root, { sb, user, render, action, toast, time, date, name, crumbs, param, can, signedUrls, upload }) => {
  const id = param('id');
  const $ = (s) => root.querySelector(s);
  const holder = $('[data-doc-editor]');
  const titleEl = $('[data-doc="title"]');
  const iconEl = $('[data-doc="icon"]');
  // перший символ-емодзі (з урахуванням складених, напр. 🧑‍💻)
  const firstEmoji = (s) => {
    const seg = [...new Intl.Segmenter('uk', { granularity: 'grapheme' }).segment(String(s || '').trim())][0];
    return seg && /\p{Extended_Pictographic}/u.test(seg.segment) ? seg.segment : null;
  };
  const btn = (a) => root.querySelector(`[data-action="${a}"]`);
  const show = (el, on) => { if (el) el.hidden = !on; };

  const notFound = () => {
    root.querySelector('article')?.querySelectorAll(':scope > :not([data-doc-notfound])').forEach((el) => { el.hidden = true; });
    show($('[data-doc-notfound]'), true);
  };
  if (!id) return notFound();

  const [{ data: all, error: e1 }, { data: doc, error: e2 }] = await Promise.all([
    sb.from('docs').select('id, parent_id, title, icon, sort').order('sort'),
    sb.from('docs').select('*, editor:profiles!docs_updated_by_fkey(full_name, email)').eq('id', id).maybeSingle(),
  ]);
  if (e1 || e2) return CRM.fail(e1 || e2);
  const byId = Object.fromEntries(all.map((d) => [d.id, d]));
  // група = предок верхнього рівня; дерево показує лише її
  const groupOf = (docId) => { let d = byId[docId]; while (d?.parent_id && byId[d.parent_id]) d = byId[d.parent_id]; return d; };
  const group = groupOf(id);
  const drawTree = () => {
    CRM.docsTree(all, id, group?.id || null);
    const head = $('[data-doc-group]');
    if (head) head.hidden = !group;
    if (head && group) {
      CRM.fill(head, { icon: group.icon || '📄', title: group.title });
      head.href = `/doc?id=${group.id}`;
      head.classList.toggle('is-active', group.id === id);
    }
  };
  drawTree();
  if (!doc) return notFound();

  // =================================================================
  // ЧИТАННЯ: блоки → HTML
  // =================================================================
  const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'A', 'CODE', 'BR', 'MARK']);
  // чистимо inline-HTML: лише прості теги, лише безпечні посилання
  function clean(html, urls) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) return;
        if (n.nodeType !== 1 || !ALLOWED.has(n.tagName)) { n.replaceWith(...(n.nodeType === 1 ? n.childNodes : [])); return walk(node); }
        [...n.attributes].forEach((a) => { if (!(n.tagName === 'A' && a.name === 'href')) n.removeAttribute(a.name); });
        if (n.tagName === 'A') {
          let href = n.getAttribute('href') || '';
          if (href.startsWith('storage:')) href = urls[href.slice(8)] || '';
          if (!/^(https?:|mailto:|\/)/i.test(href)) n.removeAttribute('href');
          else {
            n.setAttribute('href', href);
            if (!href.startsWith('/')) { n.target = '_blank'; n.rel = 'noopener'; }
          }
        }
        walk(n);
      });
    };
    walk(tpl.content);
    return tpl.innerHTML;
  }
  const el = (tag, html, cls) => {
    const n = document.createElement(tag);
    if (html != null) n.innerHTML = html;
    if (cls) n.className = cls;
    return n;
  };
  const kb = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);

  // усі шляхи Storage у документі (картинки, файли, посилання storage:)
  function storagePaths(blocks) {
    const out = [];
    const json = JSON.stringify(blocks);
    for (const m of json.matchAll(/storage:([^"\\]+)/g)) out.push(m[1]);
    blocks.forEach((b) => { if (b.data?.file?.path) out.push(b.data.file.path); });
    return out;
  }

  function listEl(style, items, start, urls) {
    const l = document.createElement(style === 'ordered' ? 'ol' : 'ul');
    if (start && start !== 1) l.start = start;
    (items || []).forEach((it) => {
      const li = el('li', clean(typeof it === 'string' ? it : it.content, urls));
      if (it.items?.length) li.appendChild(listEl(style, it.items, 1, urls));
      l.appendChild(li);
    });
    return l;
  }

  // Абзац, де є лише одне посилання (і, можливо, емодзі перед ним) — як сторінка-посилання в Notion
  const LEAD = /^[\s\p{Extended_Pictographic}\u200d\ufe0f]*$/u;
  function pageLink(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const nodes = [...tpl.content.childNodes].filter((n) => !(n.nodeType === 3 && !n.textContent.trim()));
    const a = nodes[nodes.length - 1];
    if (!a || a.tagName !== 'A' || !a.getAttribute('href')) return null;
    const lead = nodes.slice(0, -1);
    if (lead.some((n) => n.nodeType !== 3) || !LEAD.test(lead.map((n) => n.textContent).join(''))) return null;
    const href = a.getAttribute('href');
    const docId = (href.match(/^\/doc\?id=([0-9a-f-]{36})/) || [])[1];
    const icon = lead.map((n) => n.textContent).join('').trim() || (docId ? byId[docId]?.icon || '📄' : '🔗');
    const row = el('a', null, 'doc_link');
    row.href = href;
    if (!href.startsWith('/')) { row.target = '_blank'; row.rel = 'noopener'; }
    row.append(el('span', null, 'doc_link-icon'), el('span', null, 'doc_link-title'));
    row.firstChild.textContent = icon;
    row.lastChild.textContent = (docId && byId[docId]?.title) || a.textContent.trim() || href;
    if (!href.startsWith('/')) row.lastChild.textContent += ' ↗';
    return row;
  }

  async function renderBlocks(blocks) {
    const urls = await signedUrls(storagePaths(blocks));
    const frag = document.createDocumentFragment();
    for (const b of blocks) {
      const d = b.data || {};
      switch (b.type) {
        case 'header': frag.appendChild(el(`h${Math.min(Math.max(d.level || 2, 2), 4)}`, clean(d.text, urls))); break;
        case 'paragraph': {
          const row = pageLink(clean(d.text, urls));
          if (!row) { frag.appendChild(el('p', clean(d.text, urls))); break; }
          let box = frag.lastChild;
          if (!box || !box.classList?.contains('doc_links')) box = frag.appendChild(el('div', null, 'doc_links'));
          box.appendChild(row);
          break;
        }
        case 'list': frag.appendChild(listEl(d.style, d.items, d.meta?.start, urls)); break;
        case 'checklist': {
          const ul = el('ul', null, 'doc_checklist');
          (d.items || []).forEach((it) => {
            const li = el('li');
            li.appendChild(el('span', '✓', `check_box${it.checked ? ' is-done' : ''}`));
            li.appendChild(el('span', clean(it.text, urls)));
            ul.appendChild(li);
          });
          frag.appendChild(ul);
          break;
        }
        case 'quote': frag.appendChild(el('blockquote', clean(d.text, urls))); break;
        case 'code': { const pre = el('pre'); pre.appendChild(el('code')).textContent = d.code || ''; frag.appendChild(pre); break; }
        case 'delimiter': frag.appendChild(el('hr')); break;
        case 'table': {
          const wrap = el('div', null, 'doc_table');
          const t = wrap.appendChild(el('table'));
          (d.content || []).forEach((row, i) => {
            const tr = (i === 0 && d.withHeadings ? t.createTHead() : t.tBodies[0] || t.createTBody()).insertRow();
            row.forEach((cell) => tr.appendChild(el(i === 0 && d.withHeadings ? 'th' : 'td', clean(cell, urls))));
          });
          frag.appendChild(wrap);
          break;
        }
        case 'image': {
          const src = d.file?.path ? urls[d.file.path] : d.file?.url;
          if (!src || !/^(https?:|data:image\/)/i.test(src)) break;
          const fig = el('figure');
          const a = fig.appendChild(el('a'));
          Object.assign(a, { href: src, target: '_blank', rel: 'noopener' });
          const img = a.appendChild(el('img'));
          Object.assign(img, { src, loading: 'lazy', alt: (d.caption || '').replace(/<[^>]+>/g, '') });
          if (d.caption) fig.appendChild(el('figcaption', clean(d.caption, urls)));
          frag.appendChild(fig);
          break;
        }
        case 'attaches': {
          const url = d.file?.path ? urls[d.file.path] : d.file?.url;
          if (!url) break;
          const a = el('a', null, 'doc_file');
          Object.assign(a, { href: url, target: '_blank', rel: 'noopener' });
          a.textContent = `📎 ${d.title || d.file?.name || 'Файл'}${d.file?.size ? ` · ${kb(d.file.size)}` : ''}`;
          frag.appendChild(a);
          break;
        }
        default: if (d.text) frag.appendChild(el('p', clean(d.text, urls)));
      }
    }
    holder.replaceChildren(frag);
    if (!blocks.length) holder.replaceChildren(el('p', 'Порожній документ.', 'text-color-secondary'));
  }

  // =================================================================
  // ШАПКА, ХЛІБНІ КРИХТИ, ДІТИ
  // =================================================================
  function drawHead() {
    const icon = $('[data-doc="icon"]');
    if (icon) icon.textContent = doc.icon || '📄';
    titleEl.textContent = doc.title;
    document.title = `${doc.title} | Gapsy CRM`;
    CRM.rememberPage?.();
    const meta = $('[data-doc="meta"]');
    if (meta) meta.textContent = doc.editor ? `Оновив ${name(doc.editor)} · ${date(doc.updated_at)}` : `Імпортовано з Notion · ${date(doc.updated_at)}`;
    const path = [];
    for (let d = byId[doc.parent_id]; d; d = byId[d.parent_id]) path.unshift([d.title, `/doc?id=${d.id}`]);
    crumbs([['База знань', '/docs'], ...path, [doc.title]]);
  }
  function drawChildren() {
    const linked = new Set([...JSON.stringify(doc.content || {}).matchAll(/\/doc\?id=([0-9a-f-]{36})/g)].map((m) => m[1]));
    const kids = all.filter((d) => d.parent_id === id && !linked.has(d.id))
      .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
    render('doc-children', kids.map((d) => ({ ...d, icon: d.icon || '📄' })), (row, d) => { row.href = `/doc?id=${d.id}`; });
    show($('[data-doc-children-section]'), kids.length > 0);
  }
  // «На цій сторінці»: заголовки h2/h3 отримують id, список — у data-list="doc-toc"
  const tocWrap = $('[data-doc-toc-wrap]') || document.querySelector('[data-doc-toc-wrap]');
  let tocObserver;
  function drawToc() {
    tocObserver?.disconnect();
    const heads = [...holder.querySelectorAll('h2, h3')];
    const used = new Set();
    heads.forEach((h, i) => {
      let slug = h.textContent.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || `h-${i}`;
      while (used.has(slug)) slug += `-${i}`;
      used.add(slug);
      h.id = slug;
    });
    const on = heads.length >= 3;
    if (tocWrap) tocWrap.hidden = !on;
    if (!on) return;
    render('doc-toc', heads.map((h) => ({ id: h.id, title: h.textContent.trim(), level: h.tagName })), (a, d) => {
      a.href = `#${d.id}`;
      a.classList.toggle('is-sub', d.level === 'H3');
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
        document.getElementById(d.id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        history.replaceState(null, '', `#${d.id}`);
      });
    });
    // підсвічуємо розділ, який зараз читають
    const links = new Map([...document.querySelectorAll('[data-list="doc-toc"] > [data-rendered]')]
      .map((a) => [a.getAttribute('href').slice(1), a]));
    tocObserver = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => a.classList.remove('is-active'));
        links.get(en.target.id)?.classList.add('is-active');
      });
    }, { rootMargin: '0px 0px -70% 0px' });
    heads.forEach((h) => tocObserver.observe(h));
  }

  drawHead();
  drawChildren();
  await renderBlocks(doc.content?.blocks || []);
  drawToc();
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();

  // =================================================================
  // ЗАКРІПИТИ (на Головній)
  // =================================================================
  action('pin', async () => {
    const { error } = await sb.from('pins').insert({ title: doc.title, url: `/doc?id=${id}` });
    if (error) return CRM.fail(error);
    toast('Закріплено на Головній');
  });

  if (!can('pm,admin')) return;

  // =================================================================
  // РЕДАГУВАННЯ (PM/admin): Editor.js з CDN, лише коли треба
  // =================================================================
  const CDN = 'https://cdn.jsdelivr.net/npm/';
  const LIBS = [
    '@editorjs/editorjs@2.31.7/dist/editorjs.umd.js', '@editorjs/header@2.8.9/dist/header.umd.js',
    '@editorjs/list@2.0.9/dist/editorjs-list.umd.js', '@editorjs/checklist@1.6.0/dist/checklist.umd.js',
    '@editorjs/quote@2.7.6/dist/quote.umd.js', '@editorjs/code@2.9.4/dist/code.umd.js',
    '@editorjs/delimiter@1.4.2/dist/delimiter.umd.js', '@editorjs/table@2.4.6/dist/table.umd.js',
    '@editorjs/image@2.10.3/dist/image.umd.js', '@editorjs/inline-code@1.5.2/dist/inline-code.umd.js',
    '@editorjs/underline@1.2.1/dist/underline.umd.js',
  ];
  let libsReady;
  const loadLibs = () => (libsReady ||= LIBS.reduce((p, src) => p.then(() => new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = (window.CRM_CONFIG.editorCdn || CDN) + src;
    s.onload = ok;
    s.onerror = () => fail(new Error(`Не завантажився ${src}`));
    document.head.appendChild(s);
  })), Promise.resolve()));

  // файли (pdf, xlsx) у редакторі не змінюються: показуємо й зберігаємо як є
  class AttachesKeep {
    constructor({ data }) { this.data = data; }
    render() {
      const n = el('div', null, 'doc_file');
      n.textContent = `📎 ${this.data.title || this.data.file?.name || 'Файл'}`;
      return n;
    }
    save() { return this.data; }
  }

  let editor = null;
  const setMode = (editing) => {
    show(btn('doc-edit'), !editing);
    ['doc-save', 'doc-cancel', 'doc-delete', 'doc-create-child'].forEach((a) => show(btn(a), editing));
    titleEl.contentEditable = editing ? 'plaintext-only' : 'false';
    if (iconEl) {
      iconEl.contentEditable = editing ? 'plaintext-only' : 'false';
      iconEl.title = editing ? 'Клікни й встав емодзі (Mac: Ctrl+Cmd+Пробіл)' : '';
      iconEl.classList.toggle('is-editing', editing);
    }
    titleEl.classList.toggle('is-editing', editing);
    holder.classList.toggle('is-editing', editing);
  };
  setMode(false);
  iconEl?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); iconEl.blur(); } });
  iconEl?.addEventListener('blur', () => { if (iconEl.isContentEditable) iconEl.textContent = firstEmoji(iconEl.textContent) || '📄'; });
  const warn = (e) => { e.preventDefault(); e.returnValue = ''; };

  async function startEdit() {
    try {
      await loadLibs();
    } catch (err) { return CRM.fail(err); }
    const blocks = structuredClone(doc.content?.blocks || []);
    const urls = await signedUrls(storagePaths(blocks));
    blocks.forEach((b) => { if (b.type === 'image' && b.data.file?.path) b.data.file.url = urls[b.data.file.path] || ''; });
    holder.replaceChildren();
    tocObserver?.disconnect();
    if (tocWrap) tocWrap.hidden = true;
    setMode(true);
    editor = new window.EditorJS({
      holder,
      data: { blocks },
      placeholder: 'Пиши або натисни Tab, щоб додати блок',
      tools: {
        header: { class: window.Header, config: { levels: [2, 3, 4], defaultLevel: 2 } },
        list: { class: window.EditorjsList, inlineToolbar: true },
        checklist: { class: window.Checklist, inlineToolbar: true },
        quote: { class: window.Quote, inlineToolbar: true },
        code: window.CodeTool,
        delimiter: window.Delimiter,
        table: { class: window.Table, inlineToolbar: true },
        inlineCode: window.InlineCode,
        underline: window.Underline,
        attaches: AttachesKeep,
        image: {
          class: window.ImageTool,
          config: {
            uploader: {
              async uploadByFile(file) {
                const path = await upload(file, 'docs');
                const signed = await signedUrls([path]);
                return { success: 1, file: { url: signed[path], path } };
              },
              async uploadByUrl(url) { return { success: 1, file: { url } }; },
            },
          },
        },
      },
      i18n: { messages: { ui: { blockTunes: { toggler: { 'Click to tune': 'Налаштування' } }, toolbar: { toolbox: { Add: 'Додати' } } } } },
    });
    window.addEventListener('beforeunload', warn);
  }

  async function stopEdit() {
    window.removeEventListener('beforeunload', warn);
    try { await editor?.isReady; editor?.destroy(); } catch {}
    editor = null;
    setMode(false);
    titleEl.textContent = doc.title;
    if (iconEl) iconEl.textContent = doc.icon || '📄';
    await renderBlocks(doc.content?.blocks || []);
    drawToc();
  }

  action('doc-edit', startEdit);
  action('doc-cancel', () => { if (confirm('Скасувати зміни?')) stopEdit(); });

  action('doc-save', async () => {
    if (!editor) return;
    const out = await editor.save();
    // signed URL тимчасові: у базі лишаємо лише path
    out.blocks.forEach((b) => { if (b.type === 'image' && b.data.file?.path) delete b.data.file.url; });
    const title = titleEl.textContent.trim().slice(0, 200) || 'Без назви';
    let icon = firstEmoji(iconEl?.textContent);
    if (icon === '📄' && !doc.icon) icon = null; // 📄 — це просто іконка за замовчуванням
    const { data, error } = await sb.from('docs').update({ title, icon, content: out }).eq('id', id)
      .select('*, editor:profiles!docs_updated_by_fkey(full_name, email)').single();
    if (error) return CRM.fail(error);
    Object.assign(doc, data);
    byId[id].title = data.title;
    byId[id].icon = data.icon;
    drawTree();
    drawHead();
    drawChildren();
    toast('Збережено');
    stopEdit();
  });

  action('doc-delete', async () => {
    const kids = all.filter((d) => d.parent_id === id).length;
    if (!confirm(kids ? `Видалити документ разом із вкладеними (${kids})?` : 'Видалити документ?')) return;
    const { error } = await sb.from('docs').delete().eq('id', id);
    if (error) return CRM.fail(error);
    window.removeEventListener('beforeunload', warn);
    location.replace(doc.parent_id ? `/doc?id=${doc.parent_id}` : '/docs');
  });

  action('doc-create-child', async () => {
    const { data, error } = await sb.from('docs')
      .insert({ title: 'Нова сторінка', parent_id: id, sort: all.filter((d) => d.parent_id === id).length })
      .select('id').single();
    if (error) return CRM.fail(error);
    window.removeEventListener('beforeunload', warn);
    location.href = `/doc?id=${data.id}&edit=1`;
  });

  if (param('edit') === '1') startEdit();
});
