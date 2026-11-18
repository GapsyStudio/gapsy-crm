/* Gapsy CRM · review-bridge.js v0.21.0 — міст для «Ревʼю за посиланням».
 *
 * Кладеться на сайти, які ревʼюїмо (Site Settings → Custom Code → Footer):
 *   <script defer src="https://cdn.jsdelivr.net/gh/GapsyStudio/gapsy-crm@v0.21.0/review-bridge.js"
 *           data-crm-origin="https://pet-project-gapsy.webflow.io"></script>
 *
 * Інертний за замовчуванням: нічого не робить, якщо сторінка не в iframe або без ?crm-review=1
 * (у межах однієї вкладки ревʼю прапорець переживає переходи між сторінками — sessionStorage).
 * Говорить лише з origin із data-crm-origin (кілька — через кому) і лише з батьківським вікном.
 *
 * Необов'язково: data-crm-scroll-root=".smooth-wrapper" — для сайтів, де скрол зроблено трансформом
 * обгортки (SmoothScroll.js тощо): шар пінів кладемо всередину неї, тож піни їдуть разом із контентом.
 *
 * Протокол postMessage ({ __crm: 1, type, ... }):
 *   сайт → CRM: ready {path, title}, geom {dh, vw}, newpin {x, y, py, dh, vw}, pinClick {id}
 *   CRM → сайт: hello, mode {mode: 'comment'|'browse'}, pins {pins: [{id, n, x, y, py, done}]}, focus {id}
 */
(function () {
  'use strict';
  if (window.top === window) return;
  var KEY = 'crm-review';
  var flagged = /[?&]crm-review=1(&|$)/.test(location.search);
  try {
    if (flagged) sessionStorage.setItem(KEY, '1');
    else flagged = sessionStorage.getItem(KEY) === '1';
  } catch (e) { /* storage недоступний — лише параметр */ }
  if (!flagged) return;

  var script = document.currentScript || document.querySelector('script[src*="review-bridge"]');
  var ALLOWED = String((script && script.getAttribute('data-crm-origin')) || 'https://pet-project-gapsy.webflow.io')
    .split(',').map(function (s) { return s.trim().replace(/\/$/, ''); }).filter(Boolean);
  var rootSel = script && script.getAttribute('data-crm-scroll-root');
  var parentOrigin = null;
  var mode = 'browse';
  var pins = [];
  var layer = null;
  var draft = null;
  var style = null;

  function post(type, extra) {
    var msg = { __crm: 1, type: type };
    for (var k in extra || {}) msg[k] = extra[k];
    // до першого повідомлення від CRM origin невідомий — шлемо кожному дозволеному (чужий браузер відкине сам)
    (parentOrigin ? [parentOrigin] : ALLOWED).forEach(function (o) { try { parent.postMessage(msg, o); } catch (e) { /* */ } });
  }
  function root() { return (rootSel && document.querySelector(rootSel)) || document.body; }
  function docH() {
    var r = root();
    return r === document.body ? Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) : r.scrollHeight;
  }
  function geom() { post('geom', { dh: docH(), vw: window.innerWidth }); }

  function ensureLayer() {
    if (layer && layer.isConnected) return layer;
    var r = root();
    if (r !== document.body && getComputedStyle(r).position === 'static') r.style.position = 'relative';
    layer = document.createElement('div');
    layer.id = 'crm-review-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;margin:0;padding:0;border:0;'
      + 'z-index:2147483646;pointer-events:none;contain:layout style';
    r.appendChild(layer);
    return layer;
  }
  function pinEl(p, isDraft) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-crm-pin', p.id || 'draft');
    b.textContent = isDraft ? '+' : String(p.n);
    // крапля з «хвостиком» у лівому нижньому куті — він і є точка кліку
    b.style.cssText = 'position:absolute;box-sizing:border-box;transform:translate(0,-100%);transform-origin:0 100%;pointer-events:auto;'
      + 'width:30px;height:30px;margin:0;padding:0;border-radius:50% 50% 50% 0;'
      + 'border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.28);cursor:pointer;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'font:600 13px/1 system-ui,-apple-system,sans-serif;color:#fff;letter-spacing:0;'
      + 'background:' + (isDraft ? '#1f1f1f' : p.done ? '#9a9a9a' : '#fe6f61') + ';'
      + 'transition:transform .15s ease';
    var W = layer.getBoundingClientRect().width || window.innerWidth;
    var top = typeof p.py === 'number' ? p.py : p.y * docH();
    b.style.left = (p.x * W) + 'px';
    b.style.top = top + 'px';
    if (!isDraft) b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); post('pinClick', { id: p.id }); });
    return b;
  }
  function draw() {
    if (mode !== 'comment' && !draft) { if (layer) layer.remove(); layer = null; return; }
    ensureLayer();
    layer.style.height = docH() + 'px';
    layer.textContent = '';
    if (mode === 'comment') pins.forEach(function (p) { layer.appendChild(pinEl(p, false)); });
    if (draft) layer.appendChild(pinEl(draft, true));
  }

  // Comment: гасимо натискання (інакше клік по кнопці/посиланню на сайті спрацює) і ставимо пін.
  // Скрол, колесо, hover і анімації сторінки не чіпаємо.
  function onLayer(e) { return e.target && e.target.closest && e.target.closest('#crm-review-layer'); }
  function block(e) { if (mode === 'comment' && !onLayer(e)) { e.preventDefault(); e.stopImmediatePropagation(); } }
  function onClick(e) {
    if (mode !== 'comment' || onLayer(e)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    var l = ensureLayer();
    var r = l.getBoundingClientRect();
    if (!r.width) return;
    var py = e.clientY - r.top;
    var dh = docH();
    var x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    var y = Math.min(1, Math.max(0, py / dh));
    draft = { x: x, y: y, py: Math.round(py) };
    draw();
    post('newpin', { x: x, y: y, py: Math.round(py), dh: Math.round(dh), vw: window.innerWidth });
  }
  ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'auxclick', 'dblclick', 'submit'].forEach(function (t) {
    document.addEventListener(t, block, { capture: true, passive: false });
  });
  document.addEventListener('click', onClick, true);

  function setMode(m) {
    mode = m === 'comment' ? 'comment' : 'browse';
    if (mode === 'browse') draft = null;
    if (!style) {
      style = document.createElement('style');
      style.textContent = 'html.crm-commenting, html.crm-commenting * { cursor: crosshair !important; }'
        + ' html.crm-commenting #crm-review-layer [data-crm-pin] { cursor: pointer !important; }';
      document.head.appendChild(style);
    }
    document.documentElement.classList.toggle('crm-commenting', mode === 'comment');
    draw();
  }
  function focusPin(id) {
    var p = null;
    for (var i = 0; i < pins.length; i++) if (pins[i].id === id) p = pins[i];
    if (!p) return;
    var top = typeof p.py === 'number' ? p.py : p.y * docH();
    var rTop = layer ? layer.getBoundingClientRect().top + window.scrollY : 0;
    window.scrollTo({ top: Math.max(0, rTop + top - window.innerHeight / 2), behavior: 'smooth' });
    var el = layer && layer.querySelector('[data-crm-pin="' + id + '"]');
    if (el) { el.style.transform = 'translate(0,-100%) scale(1.35)'; setTimeout(function () { el.style.transform = 'translate(0,-100%)'; }, 900); }
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || ALLOWED.indexOf(e.origin) === -1) return;
    var d = e.data || {};
    if (d.__crm !== 1) return;
    parentOrigin = e.origin;
    if (d.type === 'hello') { post('ready', { path: location.pathname, title: document.title }); geom(); }
    else if (d.type === 'mode') setMode(d.mode);
    else if (d.type === 'pins') { pins = Array.isArray(d.pins) ? d.pins.slice(0, 500) : []; draft = null; draw(); }
    else if (d.type === 'focus') focusPin(d.id);
  });

  var last = 0;
  function onSize() { var h = docH(); if (Math.abs(h - last) > 2) { last = h; geom(); draw(); } }
  if ('ResizeObserver' in window) new ResizeObserver(onSize).observe(root());
  window.addEventListener('resize', onSize);
  window.addEventListener('load', onSize);
  post('ready', { path: location.pathname, title: document.title });
  geom();
})();
