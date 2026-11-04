const http = require('http'), fs = require('fs'), path = require('path');
const HEAD = `<style>[data-template]{display:none!important}[data-list] [data-empty]{display:none}[data-list][data-state="empty"] [data-empty]{display:flex}
[data-list][data-state="ready"] [data-skeleton],[data-list][data-state="empty"] [data-skeleton]{display:none}
.modal_wrapper{display:none}.modal_wrapper.is-open{display:flex}.notif_panel{display:none}.notif_panel.is-open{display:flex}</style>
<script>window.CRM_CONFIG={url:'x',anonKey:'y',loginPath:'/login',homePath:'/app',pendingPath:'/pending',modulesBase:'/modules/',editorCdn:'/npm/'};</script>
<script src="/docs-fix.js"></script><script src="/mock.js"></script><script defer src="/crm-core.js"></script>`;
const SHELL = (guard, content) => `<!doctype html><html><head>${HEAD}</head><body><div data-crm-guard="${guard}">
<aside><a href="#" data-action="open:search">Пошук</a><nav><a href="/app" data-nav="/app">Головна</a><a href="/feedback" data-nav="/feedback,/feedback-item">Правки</a><a href="/admin" data-nav="/admin" data-crm-role="admin">Адмінка</a><a href="/x" data-crm-role="pm">PMonly</a></nav>
<div data-crm-avatar></div><span data-crm-user="email">e</span><span data-crm-user="role">r</span></aside>
<main><header><div data-crm-crumbs>—</div><a href="#" data-action="toggle:notifications">bell<span data-notif-count>0</span></a><a href="#" data-action="toggle-theme">theme</a>
<div class="notif_panel" data-notif-panel><div data-list="notifications"><a href="#" data-template><span data-field="title"></span><span data-field="time"></span></a><div data-empty>none</div></div></div>
<div class="modal_wrapper" data-modal="search"><div><div data-search-field>Шукати…</div><div data-list="search"><a href="#" data-template><span data-field="type"></span><span data-field="title"></span></a><div data-empty>no</div></div></div></div>
<div data-toast-region><div data-template>t</div></div></header>
<div data-page-content>${content}</div></main></div></body></html>`;
const W = (f) => fs.readFileSync(path.join(__dirname, '../webflow', f), 'utf8');
const MOOD = `<section data-element="moodboard"><span data-count="moodboard">0</span><a href="#" data-action="open:mood-link">+</a>
  <div class="dropzone" data-mood-drop><div>drop</div></div>
  <div data-list="moodboard"><div class="mood_card" data-template><a href="#" class="mood_media" data-action="mood-open"><div class="mood_img" data-mood-img></div><div data-mood-link><div data-field="host"></div></div></a><div data-field="title"></div><div data-field="author"></div><a href="#" data-action="mood-delete">x</a></div><div data-empty>e</div></div>
  <div class="modal_wrapper" data-modal="mood-link"><form data-form="mood-link"><input name="url" type="url"><input name="title"><button type="submit">ok</button></form></div></section>
  <div data-element="fonts" data-fonts-mode="project"><div data-list="project-fonts"><a href="#" data-template><span data-field="name"></span><span data-field="license"></span><span data-field="warning"></span></a><div data-empty>e</div></div></div>`;
const PAGES = {
  '/leave': SHELL('staff', `<div data-element="leave"><h1>Відпустки</h1><a href="#" data-action="open:leave-new">Новий запит</a>
    <section><div class="section_title">Мій баланс</div><div data-element="leave-balance"><div class="card"><div data-balance="vacation">—</div><div data-balance-sub="vacation">днів</div></div><div class="card"><div data-balance="sick">—</div><div data-balance-sub="sick">днів</div></div></div><div data-balance="updated">Дані з ClickUp</div><a href="#" data-action="leave-sync">sync</a></section>
    <section id="approvals" data-leave-approver="1" hidden><div data-list="leave-approvals"><div data-template><div data-field-bg="avatar"></div><div><div data-field="user"></div><div data-field="comment"></div></div><div data-field="period"></div><span data-field="type"></span><div data-field="days"></div><a href="#" data-action="leave-approve">ok</a><a href="#" data-action="leave-reject">no</a></div><div data-empty>e</div></div></section>
    <section data-leave-approver="1" hidden><div data-list="leave-tracking"><div data-template><span data-field="user"></span><span data-field="type"></span><span data-field="period"></span><span data-field="days"></span><a href="#" data-clickup-link="1">cu</a><a href="#" data-action="leave-tracked">done</a></div><div data-empty>e</div></div></section>
    <section><div data-list="leave-mine"><div data-template><div data-field="period"></div><span data-field="type"></span><div data-field="days"></div><span data-field="status"></span><div><div data-field="comment"></div><a href="#" data-action="leave-cancel" hidden>cancel</a></div></div><div data-empty>e</div></div></section>
    <section data-leave-approver="1" hidden><div data-list="leave-team"><div data-template><span data-field="user"></span><span data-field="note"></span><b data-field="vacation"></b><b data-field="sick"></b></div><div data-empty>e</div></div></section>
    <section data-crm-role="admin"><form data-form="holiday"><input type="date" name="day"><input name="title"><input type="submit" value="Submit"></form><div data-list="holidays"><div data-template><span data-field="title"></span><span data-field="day_label"></span><a href="#" data-action="holiday-delete">x</a></div><div data-empty>e</div></div></section>
    <div class="modal_wrapper" data-modal="leave-new"><form data-form="leave-new"><div class="form_field"><label for="kind">Тип</label><select name="kind" data-options="leave-kind" data-default="vacation"></select></div>
      <input type="date" name="start_date" required><input type="date" name="end_date" required><div data-leave-hours-field="1" hidden><input type="number" name="hours"></div>
      <div data-leave-preview="1">Обери дати</div><div data-leave-warn="1" hidden></div><textarea name="comment"></textarea><button type="submit">Submit</button></form></div></div>`),
  '/docs': SHELL('staff', `<div data-element="docs" class="stack"><h1>База знань</h1>
    <form data-form="docs-search"><input type="search" name="q" data-docs-search></form><form data-form="profile" hidden><input type="text" name="full_name" placeholder="Example text"><input type="text" name="weird" placeholder="Example text"><input type="submit" value="Submit" data-wait="Please wait..."></form><a href="#" data-action="doc-create" data-crm-role="admin,pm">Новий</a>
    <div class="docs_layout"><nav class="docs_tree" data-list="docs-tree"><a href="#" class="docs_tree-link" data-template><span data-field="icon">📄</span><span data-field="title">Д</span></a><div class="docs_tree-children" data-template="children"></div><div data-skeleton>sk</div><div data-empty>Порожньо</div></nav>
    <section data-docs-sections-wrap><div data-list="docs-sections"><div class="card" data-template><a href="#" data-section-link><span data-field="icon"></span><span data-field="title"></span></a><div class="doc_links" data-section-items><a href="#" class="doc_link" data-section-item><span data-field="icon"></span><span data-field="title"></span><span data-field="meta"></span></a></div><a href="#" data-section-more hidden>more</a></div><div data-skeleton>sk</div></div></section>
    <section><div class="section_title" data-docs-recent-title>Нещодавно змінені</div><div data-list="docs-recent"><a href="#" data-template><span data-field="icon"></span><span data-field="title"></span><span data-field="meta"></span></a><div data-empty>e</div></div></section></div></div>`),
  '/doc': SHELL('staff', `<div class="docs_layout" data-element="doc"><aside class="docs_aside"><a href="#" class="docs_group" data-doc-group><span data-field="icon"></span><span data-field="title"></span></a><nav class="docs_tree" data-list="docs-tree"><a href="#" class="docs_tree-link" data-template><span data-field="icon">📄</span><span data-field="title">Д</span></a><div class="docs_tree-children" data-template="children"></div><div data-skeleton>sk</div></nav>
    <div class="doc_toc" data-doc-toc-wrap hidden><div>На цій сторінці</div><nav data-list="doc-toc"><a href="#" class="doc_toc-link" data-template><span data-field="title"></span></a></nav></div></aside>
    <article><div class="doc_header"><div data-doc="icon">📄</div><h1 data-doc="title">Назва</h1><div data-doc="meta">—</div>
      <div><a href="#" data-action="pin">Закріпити</a><a href="#" data-action="doc-delete" data-crm-role="admin,pm" hidden>Видалити</a><a href="#" data-action="doc-create-child" data-crm-role="admin,pm" hidden>+ Вкладена</a>
      <a href="#" data-action="doc-edit" data-crm-role="admin,pm">Редагувати</a><a href="#" data-action="doc-cancel" data-crm-role="admin,pm" hidden>Скасувати</a><a href="#" data-action="doc-save" data-crm-role="admin,pm" hidden>Зберегти</a></div></div>
      <div class="doc_content" data-doc-editor><div class="skeleton"></div></div>
      <section data-doc-children-section hidden><div data-list="doc-children"><a href="#" data-template><span data-field="icon"></span><span data-field="title"></span></a></div></section>
      <div data-doc-notfound hidden>Документ не знайдено</div></article></div>`),
  '/project': SHELL('staff', W('project.html').replace(/<\/div>\s*$/, W('project-modals.html') + W('member-modal.html') + MOOD + '</div>')
    .replace('<label class="check_row" data-template><input type="checkbox" data-check> <span data-field="label">Пункт чекліста</span></label>',
      '<a href="#" class="check_row" data-template data-action="handoff-check" role="checkbox" aria-checked="false"><span class="check_box">✓</span><span data-field="label">Пункт</span></a>')),
  '/snippets': SHELL('staff', W('snippets.html')),
  '/snippet': SHELL('staff', W('snippet.html')),
  '/app': SHELL('auth', `<div data-element="dashboard"><h1>Привіт, <span data-crm-user="full_name">колего</span></h1><div data-today></div>
    <section id="bal" hidden><div data-element="leave-balance"><a class="card" href="/leave"><div data-balance="vacation">—</div><div data-balance-sub="vacation">днів</div></a><a class="card" href="/leave"><div data-balance="sick">—</div></a><a class="card" href="/leave#approvals" data-leave-approver="1" hidden><div data-balance="pending-approvals">—</div></a></div></section>
    <div data-list="my-feedback"><a data-template><span data-field="status"></span><span data-field="title"></span><span data-field="project"></span></a><div data-empty>e</div></div>
    <div data-list="recent-docs"><a data-template><span data-field="title"></span></a><div data-empty>e</div></div>
    <section data-pulse data-crm-role="pm,admin"><b data-pulse-count="risk">-</b><b data-pulse-count="overdue">-</b><b data-pulse-count="handoffs">-</b><b data-pulse-count="active">-</b>
      <div data-list="pulse-risk"><a data-template><span data-field="name"></span><span data-field="stage"></span><span data-field="due"></span><span data-field="risk"></span></a><div data-empty>e</div></div>
      <div data-list="workload"><div data-template><span data-field="name"></span><span data-field="role"></span><span data-field="projects"></span><span data-field="open"></span><span data-field="overdue"></span></div><div data-empty>e</div></div></section>
    <a href="#" data-action="open:pin">+</a><div data-list="pins"><a data-template><span data-field="title"></span><span data-field="host"></span></a><div data-empty>e</div></div>
    <div class="modal_wrapper" data-modal="pin"><form data-form="pin"><input name="title" required><input name="url" type="url" required><button type="submit">ok</button></form></div></div>`),
  '/feedback': SHELL('staff', `<div data-element="feedback"><h1>Правки</h1><a href="#" data-action="open:feedback-new">Нова</a>
    <div data-tabs="status"><a href="#" data-tab="open">Відкриті</a><a href="#" data-tab="overdue">Прострочені <span data-count="overdue">0</span></a><a href="#" data-tab="resolved">Resolved</a><a href="#" data-tab="mine">Мої</a></div>
    <div data-list="feedback"><a data-template><span class="badge" data-field="status"></span><span class="badge is-red" data-field="priority">P</span><span data-field="title"></span><span data-field="project"></span><span data-field="assignee"></span><span class="badge" data-field="due">D</span><span data-field="files"></span><span data-field="time"></span></a><div data-skeleton>sk</div><div data-empty>e</div></div>
    <div class="modal_wrapper" data-modal="feedback-new"><form data-form="feedback-new"><input name="title"><select name="project_id" data-options="projects"><option value="">—</option></select><select name="assignee_id" data-options="staff"><option value="">—</option></select><select name="priority" data-options="priority" data-default="normal"></select><input type="date" name="due_date"><input name="page_url"><textarea name="description"></textarea><div><div data-dropzone="feedback"><div>drop</div></div><div data-upload-previews><img data-template></div></div><button type="submit">ok</button></form></div></div>`),
  '/feedback-item': SHELL('staff', `<div data-element="feedback-item"><h1 data-item="title">t</h1><div><span class="badge is-red" data-item-badge="priority">P</span><span class="badge" data-item-badge="due">D</span></div><div data-status-switch><a href="#" data-status="new">New</a><a href="#" data-status="in_progress">IP</a><a href="#" data-status="resolved">R</a></div>
    <div data-list="feedback-files"><a data-template data-action="open-image"><img><span class="count_badge" data-field="marks">2</span></a><div data-empty>e</div></div><div data-item="description"></div>
    <section><div data-list="marks"><div class="mark_row" data-template><a href="#" data-action="mark-open" data-field="n">1</a><a href="#" class="check_box" data-mark-check data-action="mark-toggle">✓</a><div><div data-field="note"></div><span data-field="author"></span> · <span data-field="file"></span></div><a href="#" data-action="mark-delete">del</a></div><div data-empty>none</div></div></section>
    <div data-list="comments"><div data-template><div data-field-bg="avatar"></div><span data-field="author"></span><span data-field="time"></span><a href="#" data-action="comment-delete" hidden>x</a><div data-field="body"></div></div><div data-empty>e</div></div>
    <form data-form="comment"><textarea name="body"></textarea><button type="submit">s</button></form>
    <span data-item="project"></span><span data-item="author"></span><span data-item="assignee"></span><div><a data-item="page_url">o</a></div><span data-item="created"></span><a href="#" data-action="feedback-delete">del</a>
    <form data-form="feedback-meta"><select name="priority" data-options="priority" data-default="normal"></select><input type="date" name="due_date"></form>
    <div class="modal_wrapper" data-modal="image"><div><div data-mark-stage style="position:relative;display:inline-block;line-height:0"><img data-lightbox-img style="width:600px;height:400px">
      <div data-list="stage-marks" style="position:absolute;inset:0;pointer-events:none"><a href="#" class="mark_pin" data-template data-action="mark-pin" data-field="n" style="position:absolute;pointer-events:auto">1</a></div></div>
      <div><a href="#" data-action="shot-delete" hidden>del shot</a><div data-mark-hint>hint</div><div data-mark-form><form data-form="mark"><textarea name="note" required></textarea><a href="#" data-action="mark-cancel">c</a><button type="submit">ok</button></form></div></div></div></div></div>`),
  '/fonts': SHELL('staff', `<div data-element="fonts"><h1>Шрифти</h1><a href="#" data-action="font-upload">up</a><a href="#" data-action="font-new">+</a>
    <div data-tabs="fonts"><a href="#" data-tab="all">Усі</a><a href="#" data-tab="problems">P <span data-count="font-problems">0</span></a></div>
    <form data-form="font-search"><input type="search" name="q" data-fonts-search></form>
    <div data-list="fonts"><div data-template><div data-font-preview>Aa</div><div data-field="name"></div><div data-field="foundry"></div><a href="#" data-action="font-edit">o</a>
      <span data-field="license"></span><span data-field="allowed"></span><span data-field="owner"></span><span data-field="warning"></span><span data-field="projects"></span><span data-field="files"></span></div><div data-empty>e</div></div>
    <div class="modal_wrapper" data-modal="font"><form data-form="font"><div data-font-title>t</div><input name="name" required><input name="foundry">
      <select name="license" data-options="font-license" data-default="unknown"></select><select name="owner" data-options="font-owner" data-default="agency"></select>
      <a href="#" class="tag_chip" data-action="font-allow" data-allow="desktop">D</a><a href="#" class="tag_chip" data-action="font-allow" data-allow="web">W</a><a href="#" class="tag_chip" data-action="font-allow" data-allow="app">A</a>
      <input type="number" name="pageviews_limit"><input type="url" name="source_url"><textarea name="notes"></textarea>
      <div data-list="font-project-pick"><a href="#" class="tag_chip" data-template data-action="font-project-toggle" data-field="name">p</a><div data-empty>e</div></div>
      <div data-font-files-block><a href="#" data-action="font-files-add">+</a><div data-list="font-files"><div data-template><span data-field="filename"></span><span data-field="variant"></span><a href="#" data-action="font-file-download">d</a><a href="#" data-action="font-file-delete">x</a></div><div data-empty>e</div></div>
      <a href="#" data-action="font-license-add">L</a><a href="#" data-action="font-license-open">O</a></div>
      <a href="#" data-action="font-delete">del</a><button type="submit">save</button></form></div></div>`),
  '/access': SHELL('staff', `<div data-element="access"><h1>Доступи</h1><a href="#" data-action="access-new">+</a>
    <div data-tabs="access"><a href="#" data-tab="service">S <span data-count="service">0</span></a><a href="#" data-tab="course">C <span data-count="course">0</span></a></div>
    <form data-form="access-search"><input type="search" name="q" data-access-search></form><div data-subs-total hidden></div>
    <section data-access-requests data-crm-role="pm,admin" hidden><div data-list="access-requests"><div data-template><span data-field="who"></span><span data-field="item"></span><span data-field="reason"></span><span data-field="time"></span>
      <a href="#" data-action="areq-approve" data-hours="1">1h</a><a href="#" data-action="areq-approve" data-hours="24">24h</a><a href="#" data-action="areq-decline">no</a></div></div></section>
    <div class="modal_wrapper" data-modal="access-request"><form data-form="access-request"><span data-access-title>t</span><textarea name="reason"></textarea><button type="submit">s</button></form></div>
    <div data-list="access"><div data-template><div data-field="name"></div><a href="#" data-access-link><span data-field="host"></span></a><span class="badge" data-field="secret"></span>
      <div data-field="notes"></div><div data-field="updated"></div><span data-field="price"></span><span data-field="renews"></span><span data-field="grant"></span>
      <a href="#" data-action="access-request">ask</a><a href="#" data-action="access-reveal" data-access-grant>showgrant</a>
      <a href="#" data-action="access-reveal" data-crm-role="pm,admin">show</a><a href="#" data-action="access-secret" data-crm-role="pm,admin">set</a><a href="#" data-action="access-edit">edit</a></div><div data-empty>e</div></div>
    <div class="modal_wrapper" data-modal="access-item"><form data-form="access-item"><div data-access-title>t</div><input name="name"><select name="kind" data-options="access-kind" data-default="service"></select><input type="url" name="url"><textarea name="notes"></textarea>
      <input name="price"><select name="currency" data-options="currency" data-default="USD"></select><select name="period" data-options="period"><option value="">—</option></select><input type="date" name="renews_on">
      <a href="#" data-action="access-delete" data-crm-role="pm,admin">del</a><button type="submit">s</button></form></div>
    <div class="modal_wrapper" data-modal="access-secret"><form data-form="access-secret"><span data-access-title>t</span><div data-secret-hint>h</div><input name="login"><input type="password" name="password"><input name="extra">
      <a href="#" data-action="access-clear">clr</a><button type="submit">s</button></form></div>
    <div class="modal_wrapper" data-modal="access-reveal"><div><div data-access-title>t</div><div data-reveal="login">—</div><a href="#" data-action="access-copy" data-copy="login">c</a>
      <div data-reveal="password">—</div><a href="#" data-action="access-copy" data-copy="password">c</a><div data-reveal-row><div data-reveal="extra">—</div></div><div data-reveal-timer>60</div><a href="#" data-action="close">x</a></div></div></div>`),
  '/my-work': SHELL('staff', `<div data-element="my-work"><h1>Моя робота</h1><div data-mywork-summary>…</div>
    <div><span data-count="assigned">0</span><div data-list="mywork-assigned"><a data-template><span data-field="status"></span><span data-field="priority"></span><span data-field="title"></span><span data-field="project"></span><span data-field="due"></span></a><div data-empty>e</div></div></div>
    <div><span data-count="handoffs">0</span><div data-list="mywork-handoffs"><a data-template><span data-field="status"></span><span data-field="project"></span><span data-field="hint"></span></a><div data-empty>e</div></div></div>
    <div><span data-count="authored">0</span><div data-list="mywork-authored"><a data-template><span data-field="status"></span><span data-field="priority"></span><span data-field="title"></span><span data-field="assignee"></span><span data-field="due"></span></a><div data-empty>e</div></div></div>
    <div><span data-count="projects">0</span><div data-list="mywork-projects"><a data-template><span data-field="name"></span><span data-field="client"></span><span data-field="role"></span><span data-field="open"></span></a><div data-empty>e</div></div></div></div>`),
  '/showcase': SHELL('staff', `<div data-element="showcase"><h1>Showcase</h1><a href="#" data-action="showcase-propose" data-crm-role="designer,developer">propose</a><a href="#" data-action="open:showcase-item" data-crm-role="pm,admin">add</a>
    <section data-showcase-proposed hidden><div data-list="showcase-proposed"><div data-template><a href="#" data-proposal-link><span data-field="title"></span></a><span data-field="category"></span><span data-field="status"></span><span data-field="who"></span><p data-field="review_note"></p>
      <a href="#" data-action="showcase-publish">pub</a><a href="#" data-action="showcase-reject">rej</a><a href="#" data-action="showcase-withdraw">wd</a></div></div></section><a href="#" data-action="open:showcase-cats" data-crm-role="pm,admin">cats</a><div data-tabs="category"><a href="#" data-tab="all" class="is-active">Усі</a><a href="#" data-tab="figma">figma</a></div>
    <section data-showcase-best><div data-list="showcase-best"><div data-template><img><span data-field="category"></span><span data-field="title"></span><a href="#" data-action="copy-link">c</a></div></div></section>
    <div data-list="showcase-all"><div data-template><img data-field-src="cover_url"><span data-field="title"></span><a href="#" data-action="edit">e</a></div><div data-empty>e</div></div>
    <div class="modal_wrapper" data-modal="showcase-item"><form data-form="showcase-item"><input name="title"><select name="category"><option value="site">s</option></select><select name="project_id" data-options="projects"><option value="">—</option></select><input name="url"><div data-dropzone="showcase-cover"><div>Обкладинка</div></div><a href="#" data-action="showcase-delete" data-crm-role="pm,admin" hidden>del</a><label data-showcase-best-field><input type="checkbox" name="is_best"></label><div data-showcase-modal-title>t</div><button type="submit">ok</button></form></div></div><div class="modal_wrapper" data-modal="showcase-cats"><div><form data-form="showcase-cat"><input name="label"><input type="submit" value="Submit"></form><div data-list="showcase-cats"><div data-template><span data-field="label"></span><span data-field="count"></span><a href="#" data-action="cat-rename">r</a><a href="#" data-action="cat-color">c</a><a href="#" data-action="cat-delete">d</a></div><div data-empty>e</div></div></div></div>`),
  '/projects': SHELL('staff', `<div data-element="projects"><h1>Проєкти</h1><div data-tabs="status"><a data-tab="active">a</a><a data-tab="all">all</a></div>
    <div data-list="projects"><a data-template><span data-field="name"></span><span data-field="client"></span><span data-field="feedback_count"></span><span data-field="status"></span><span data-field="stage"></span><span data-field="due"></span><span data-field="risk"></span></a><div data-empty>e</div></div>
    <div class="modal_wrapper" data-modal="project"><form data-form="project"><input name="name"><input name="client"><select name="status"><option value="active">a</option></select><select name="stage" data-options="stage" data-default="design"></select><input type="date" name="stage_due"><input type="date" name="deadline"><input name="staging_url"><input name="figma_url"><a href="#" data-action="project-delete" data-crm-role="pm,admin" hidden>del</a><button type="submit">ok</button></form></div></div>`),
  '/references': SHELL('staff', `<div data-element="references"><h1>Референси</h1><a href="#" data-action="open:ref-new">Новий</a>
    <form data-form="refs-search"><input data-refs-search></form><div data-list="ref-tags"><a href="#" data-template><span data-field="tag"></span></a></div>
    <div data-list="refs"><div data-template><a href="#" data-ref-link><div data-ref-icon></div><span data-field="title"></span><span data-field="host"></span></a><p data-field="note"></p><div data-tags><span data-template>t</span></div><span data-field="author"></span><a href="#" data-action="ref-copy">c</a><a href="#" data-action="ref-delete">x</a></div><div data-empty>Порожньо</div></div>
    <div class="modal_wrapper" data-modal="ref-new"><form data-form="ref-new"><input name="url"><input name="title"><input name="tags"><textarea name="note"></textarea><button type="submit">ok</button></form></div></div>`),
  '/admin': SHELL('admin', `<div data-element="admin"><h1>Адмінка</h1><div data-list="users-pending"><div data-template><div data-field-bg="avatar_url"></div><span data-field="name"></span><span data-field="role"></span><a href="#" data-action="edit-user">e</a></div><div data-empty>e</div></div>
    <div data-list="users"><div data-template><span data-field="name"></span><span data-field="role"></span><span data-field="ad"></span><a href="#" data-action="edit-user">e</a></div></div>
    <div class="modal_wrapper" data-modal="user"><form data-form="user"><div data-user-title></div><select name="role"><option>designer</option><option>admin</option></select><input name="clickup_task_id"><input type="checkbox" name="is_art_director"><button type="submit">ok</button></form></div></div>`),
  '/reviews': SHELL('staff', `<div data-element="reviews"><h1>Погодження</h1><a href="#" data-action="review-new">new</a><div data-review-noad hidden>no AD</div>
    <div data-tabs="reviews"><a href="#" data-tab="pending">p <span data-count="pending">0</span></a><a href="#" data-tab="changes">c <span data-count="changes">0</span></a><a href="#" data-tab="approved">a <span data-count="approved">0</span></a><a href="#" data-tab="mine">m <span data-count="mine">0</span></a></div>
    <div data-list="reviews"><a href="#" data-template data-action="review-open"><span data-field="title"></span><span data-field="meta"></span><span data-field="status"></span></a><div data-empty>e</div></div>
    <div class="modal_wrapper" data-modal="review-new"><form data-form="review"><div data-review-form-title>t</div><select name="project_id" data-options="projects"><option value="">—</option></select><input name="title"><input name="url"><textarea name="description"></textarea><input type="submit" value="Submit"></form></div>
    <div class="modal_wrapper" data-modal="review"><div><h3 data-review="title"></h3><span data-review="status"></span><div data-review="meta"></div><p data-review="note"></p><p data-review="decision"></p><a href="#" data-review-link>open</a>
      <div data-review-history><div data-list="review-history"><a href="#" data-template><span data-field="version"></span><span data-field="status"></span><span data-field="time"></span><span data-field="decision_note"></span></a></div></div>
      <div data-review-decide><form data-form="review-decide"><textarea name="comment"></textarea></form><a href="#" data-action="review-approve">ok</a><a href="#" data-action="review-changes">back</a></div>
      <a href="#" data-action="review-version">v+</a><a href="#" data-action="review-delete">del</a><a href="#" data-action="close">x</a></div></div></div>`),
  '/profile': SHELL('auth', `<div data-element="profile"><h1>Профіль</h1><form data-form="profile"><input name="full_name"><button type="submit">s</button></form><div data-theme-switch><a data-theme-value="system">s</a><a data-theme-value="dark">d</a></div></div>`),
};
http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (PAGES[u]) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(PAGES[u]); }
  if (u === '/docs-fix.js') {
    const docs = JSON.parse(fs.readFileSync(process.env.DOCS_JSON || path.join(__dirname, 'docs-fixture.json'), 'utf8'))
      .map((d, i) => ({ ...d, icon: d.icon || null, updated_at: new Date(Date.now() - i * 3600e3).toISOString(), editor: null }));
    if (process.env.GROUPS || fs.existsSync(path.join(__dirname, ".groups"))) { // як після 008_docs_groups.sql
      const G = { start: ['fdc3cfe636c24a4297e073b7d981e318', 'e53d235f8f3743ba8a4f986bbb346755', '971ea9a9eb3f4b099bc02fe77a281566', 'e4a024c51f2c4597bbfeafd4e424e7f1', 'd707175c6ade4f35adb9d928b7401053'],
        work: ['d2cc0281a66847adbad87580216af575', '21d6d518cbb580fd8050d326c9a7eb73', '7c82169539d444b7ab613a523b279fa2'], sales: ['29a48c164b554edfbcd78c86ef30d395'], team: ['3b67b2b8f9a044b9a34755440adceef9', 'ce0beb9f83954933a6fae169c726dc94'] };
      const T = { start: ['Старт', '🚀'], work: ['Як ми працюємо', '🛠️'], sales: ['Продажі', '💼'], team: ['Команда', '👥'] };
      Object.keys(G).forEach((k, gi) => {
        const gid = `a0000000-0000-4000-8000-00000000000${gi + 1}`;
        docs.push({ id: gid, parent_id: null, title: T[k][0], icon: T[k][1], sort: (gi + 1) * 10, notion_id: 'group:' + k, content: { blocks: [] }, updated_at: new Date(0).toISOString(), editor: null });
        G[k].forEach((nid, i) => { const d = docs.find((x) => x.notion_id === nid); d.parent_id = gid; d.sort = (i + 1) * 10; });
      });
    }
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    return res.end(`window.__FIXPATCH = Object.assign(window.__FIXPATCH || {}, { docs: ${JSON.stringify(docs)} });`);
  }
  if (u.startsWith('/npm/')) {
    const f = path.join(process.env.NPM_DIR || path.join(__dirname, 'node_modules'), u.slice(5).replace(/@[\d.]+(?=\/)/, ''));
    if (fs.existsSync(f)) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(fs.readFileSync(f)); }
  }
  const map = { '/mock.js': 'mock-supabase.js', '/crm-core.js': '../crm-core.js' };
  const f = map[u] ? path.join(__dirname, map[u]) : u.startsWith('/modules/') ? path.join(__dirname, '..', u) : null;
  if (f && fs.existsSync(f)) { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); return res.end(fs.readFileSync(f)); }
  res.writeHead(404); res.end('nf');
}).listen(8765, () => console.log('up'));
