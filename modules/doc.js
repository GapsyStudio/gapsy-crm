/* Gapsy CRM · modules/doc.js — Документ бази знань (/doc?id=<id>)
 * Розмітка: [data-element="doc"]
 *   дерево:   data-list="docs-tree" (CRM.docsTree)
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
  CRM.docsTree(all, id);
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

  async function renderBlocks(blocks) {
    const urls = await signedUrls(storagePaths(blocks));
    const frag = document.createDocumentFragment();
    for (const b of blocks) {
      const d = b.data || {};
      switch (b.type) {
        case 'header': frag.appendChild(el(`h${Math.min(Math.max(d.level || 2, 2), 4)}`, clean(d.text, urls))); break;
        case 'paragraph': frag.appendChild(el('p', clean(d.text, urls))); break;
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
  const byId = Object.fromEntries(all.map((d) => [d.id, d]));
  function drawHead() {
    const icon = $('[data-doc="icon"]');
    if (icon) icon.textContent = doc.icon || '📄';
    titleEl.textContent = doc.title;
    document.title = `${doc.title} | Gapsy CRM`;
    const meta = $('[data-doc="meta"]');
    if (meta) meta.textContent = doc.editor ? `Оновив ${name(doc.editor)} · ${date(doc.updated_at)}` : `Імпортовано з Notion · ${date(doc.updated_at)}`;
    const path = [];
    for (let d = byId[doc.parent_id]; d; d = byId[d.parent_id]) path.unshift(d.title);
    crumbs(['База знань', ...path, doc.title].join(' / '));
  }
  function drawChildren() {
    const kids = all.filter((d) => d.parent_id === id).sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
    render('doc-children', kids.map((d) => ({ ...d, icon: d.icon || '📄' })), (row, d) => { row.href = `/doc?id=${d.id}`; });
    show($('[data-doc-children-section]'), kids.length > 0);
  }
  drawHead();
  drawChildren();
  await renderBlocks(doc.content?.blocks || []);
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();

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
    titleEl.classList.toggle('is-editing', editing);
    holder.classList.toggle('is-editing', editing);
  };
  setMode(false);
  const warn = (e) => { e.preventDefault(); e.returnValue = ''; };

  async function startEdit() {
    try {
      await loadLibs();
    } catch (err) { return CRM.fail(err); }
    const blocks = structuredClone(doc.content?.blocks || []);
    const urls = await signedUrls(storagePaths(blocks));
    blocks.forEach((b) => { if (b.type === 'image' && b.data.file?.path) b.data.file.url = urls[b.data.file.path] || ''; });
    holder.replaceChildren();
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
    await renderBlocks(doc.content?.blocks || []);
  }

  action('doc-edit', startEdit);
  action('doc-cancel', () => { if (confirm('Скасувати зміни?')) stopEdit(); });

  action('doc-save', async () => {
    if (!editor) return;
    const out = await editor.save();
    // signed URL тимчасові: у базі лишаємо лише path
    out.blocks.forEach((b) => { if (b.type === 'image' && b.data.file?.path) delete b.data.file.url; });
    const title = titleEl.textContent.trim().slice(0, 200) || 'Без назви';
    const { data, error } = await sb.from('docs').update({ title, content: out }).eq('id', id)
      .select('*, editor:profiles!docs_updated_by_fkey(full_name, email)').single();
    if (error) return CRM.fail(error);
    Object.assign(doc, data);
    byId[id].title = data.title;
    CRM.docsTree(all, id);
    drawHead();
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
