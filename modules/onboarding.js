/* Gapsy CRM · modules/onboarding.js — Онбординг і квізи (/onboarding), v0.15.
 * Хто: новачок (pending) — квіз по CRM + квіз ролі; співробітник, що хоче іншу роль, — лише квіз нової ролі.
 * Після проходження — запит на роль до admin (role_request_create). Правильні відповіді перевіряє база (quiz_submit).
 * Розмітка: [data-element="onboarding"]
 *   [data-onb-current] — поточна роль; вибір ролі: [data-action="onb-pick"][data-role="designer|developer|pm"] (клас is-active);
 *   кроки data-list="onb-steps" (поля title, hint; бейдж [data-field="status"]; посилання на документи — контейнер [data-onb-docs]
 *     з шаблоном a[data-template]; кнопка data-action="onb-start");
 *   блок запиту [data-onb-request]: кнопка data-action="role-request", текст [data-onb-request-status], data-action="role-request-cancel";
 *   модалка data-modal="quiz": [data-quiz-title], [data-quiz-progress], [data-quiz-question], data-list="quiz-options"
 *     (шаблон з полем text, дія quiz-pick, клас is-active), кнопки quiz-prev / quiz-next, [data-quiz-body] (питання) і
 *     [data-quiz-result] (підсумок: [data-quiz-score], [data-quiz-verdict], data-list="quiz-mistakes" з полями question,
 *     explanation і посиланням [data-mistake-doc]; дія quiz-retry). */
CRM.module('onboarding', async (root, CRM) => {
  const { sb, user, render, toast, action, modal, badge } = CRM;
  const ROLE = { designer: 'Дизайнер', developer: 'Розробник', pm: 'Project Manager', admin: 'Admin', pending: 'Новачок', client: 'Клієнт' };
  const TRACK = { crm: 'Як користуватися Gapsy CRM', designer: 'Онбординг дизайнера', developer: 'Онбординг розробника', pm: 'Онбординг PM' };
  const STATUS = { todo: ['Не пройдено', ''], passed: ['Пройдено', 'is-green'], failed: ['Не склав — спробуй ще', 'is-yellow'] };
  const me = CRM.profile || {};
  const isNew = me.role === 'pending';
  const $ = (s) => root.querySelector(s);
  let target = null;          // роль, на яку йде людина
  let attempts = [];
  let request = null;
  let docTitles = {};
  let quiz = null;            // { track, questions, order, answers, i }

  const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
  const best = (track) => attempts.filter((a) => a.track === track).sort((a, b) => b.passed - a.passed || b.score / b.total - a.score / a.total)[0];
  const passed = (track) => attempts.some((a) => a.track === track && a.passed);

  async function load() {
    const [{ data: at }, { data: rq }] = await Promise.all([
      sb.from('quiz_attempts').select('track, score, total, passed, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
      sb.from('role_requests').select('id, role, status, decision_note, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
    ]);
    attempts = at || [];
    request = rq?.[0] || null;
    if (!target && request?.status === 'pending') target = request.role;
    draw();
  }

  async function docsFor(track) {
    const { data } = await sb.from('quiz_questions').select('doc_id').eq('track', track).eq('active', true);
    const ids = [...new Set((data || []).map((q) => q.doc_id).filter(Boolean))];
    const missing = ids.filter((id) => !docTitles[id]);
    if (missing.length) {
      const { data: docs } = await sb.from('docs').select('id, title, icon').in('id', missing);
      (docs || []).forEach((d) => { docTitles[d.id] = `${d.icon ? `${d.icon} ` : ''}${d.title}`; });
    }
    return ids.filter((id) => docTitles[id]).map((id) => ({ id, title: docTitles[id] }));
  }

  async function draw() {
    root.querySelectorAll('[data-onb-current]').forEach((el) => { el.textContent = ROLE[me.role] || me.role || '—'; });
    root.querySelectorAll('[data-action="onb-pick"]').forEach((b) => {
      const r = b.dataset.role;
      b.hidden = r === me.role;
      b.classList.toggle('is-active', r === target);
      b.setAttribute('aria-pressed', r === target);
    });
    const tracks = target ? (isNew ? ['crm', target] : [target]) : (isNew ? ['crm'] : []);
    const steps = await Promise.all(tracks.map(async (t) => {
      const b = best(t);
      return {
        track: t, title: TRACK[t], docs: await docsFor(t),
        hint: b ? `Найкращий результат: ${b.score} з ${b.total}` : 'Прочитай документи, потім пройди квіз. Прохідний бал — 80%.',
        status: passed(t) ? 'passed' : b ? 'failed' : 'todo',
      };
    }));
    render('onb-steps', steps, (el, s) => {
      el.dataset.track = s.track;
      badge(el.querySelector('[data-field="status"]'), s.status, STATUS);
      const box = el.querySelector('[data-onb-docs]');
      if (box) {
        const tpl = box.querySelector('[data-template]');
        box.querySelectorAll(':scope > :not([data-template])').forEach((n) => n.remove());
        s.docs.forEach((d) => {
          const a = tpl ? tpl.cloneNode(true) : document.createElement('a');
          a.removeAttribute('data-template');
          a.textContent = d.title;
          a.href = `/doc?id=${d.id}`;
          a.target = '_blank';
          box.appendChild(a);
        });
      }
      const start = el.querySelector('[data-action="onb-start"]');
      if (start) start.textContent = passed(s.track) ? 'Пройти ще раз' : best(s.track) ? 'Спробувати ще' : 'Почати квіз';
    });
    // запит на роль
    const block = $('[data-onb-request]');
    const btn = $('[data-action="role-request"]');
    const st = $('[data-onb-request-status]');
    const cancel = $('[data-action="role-request-cancel"]');
    const ready = target && tracks.every(passed);
    const pending = request?.status === 'pending';
    if (block) block.hidden = !target && !pending;
    if (btn) {
      btn.hidden = pending;
      btn.classList.toggle('is-disabled', !ready);
      btn.setAttribute('aria-disabled', String(!ready));
      btn.textContent = target ? `Надіслати запит на роль «${ROLE[target]}»` : 'Надіслати запит на роль';
    }
    if (cancel) cancel.hidden = !pending;
    if (st) {
      st.textContent = pending ? `Запит на роль «${ROLE[request.role]}» надіслано. Admin отримав сповіщення.`
        : request?.status === 'rejected' ? `Попередній запит відхилено: ${request.decision_note || 'без коментаря'}`
          : ready ? 'Усі квізи пройдено — можна надсилати запит.'
            : target ? 'Кнопка стане активною, коли пройдеш усі квізи вище.' : '';
    }
  }

  action('onb-pick', (el) => {
    if (request?.status === 'pending') return toast('Спершу скасуй надісланий запит');
    target = el.dataset.role;
    draw();
  });

  // ---------- квіз ----------
  const m$ = (s) => document.querySelector(`[data-modal="quiz"] ${s}`);
  async function openQuiz(track) {
    const { data, error } = await sb.from('quiz_questions').select('id, question, options, sort').eq('track', track).eq('active', true).order('sort');
    if (error) return CRM.fail(error);
    if (!data?.length) return toast('У цьому квізі ще немає питань');
    quiz = {
      track, i: 0, answers: {},
      questions: shuffle(data).map((q) => ({ ...q, order: shuffle(q.options.map((_, k) => k)) })),
    };
    modal.open('quiz');
    const t = m$('[data-quiz-title]');
    if (t) t.textContent = TRACK[track];
    m$('[data-quiz-result]')?.toggleAttribute('hidden', true);
    m$('[data-quiz-body]')?.toggleAttribute('hidden', false);
    m$('[data-action="quiz-next"]')?.toggleAttribute('hidden', false);
    drawQuestion();
  }
  function drawQuestion() {
    const q = quiz.questions[quiz.i];
    const last = quiz.i === quiz.questions.length - 1;
    const p = m$('[data-quiz-progress]');
    if (p) p.textContent = `${quiz.i + 1} з ${quiz.questions.length}`;
    const qt = m$('[data-quiz-question]');
    if (qt) qt.textContent = q.question;
    render('quiz-options', q.order.map((k) => ({ text: q.options[k], k })), (el, o) => {
      el.dataset.k = o.k;
      const on = quiz.answers[q.id] === o.k;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', on);
    });
    const prev = m$('[data-action="quiz-prev"]');
    if (prev) prev.hidden = quiz.i === 0;
    const next = m$('[data-action="quiz-next"]');
    if (next) {
      next.textContent = last ? 'Завершити' : 'Далі';
      next.classList.toggle('is-disabled', quiz.answers[q.id] === undefined);
    }
  }
  action('onb-start', (el) => openQuiz(el.closest('[data-track]')?.dataset.track));
  action('quiz-pick', (el) => {
    if (!quiz) return;
    quiz.answers[quiz.questions[quiz.i].id] = Number(el.dataset.k);
    drawQuestion();
  });
  action('quiz-prev', () => { if (quiz && quiz.i > 0) { quiz.i--; drawQuestion(); } });
  action('quiz-next', async () => {
    if (!quiz) return;
    const q = quiz.questions[quiz.i];
    if (quiz.answers[q.id] === undefined) return toast('Обери відповідь');
    if (quiz.i < quiz.questions.length - 1) { quiz.i++; return drawQuestion(); }
    if (quiz.sending) return;
    quiz.sending = true;
    const { data, error } = await sb.rpc('quiz_submit', { t: quiz.track, answers: quiz.answers });
    quiz.sending = false;
    if (error) return CRM.fail(error);
    showResult(data);
    load();
  });
  function showResult(r) {
    m$('[data-quiz-body]')?.toggleAttribute('hidden', true);
    m$('[data-quiz-result]')?.toggleAttribute('hidden', false);
    m$('[data-action="quiz-next"]')?.toggleAttribute('hidden', true);
    m$('[data-action="quiz-prev"]')?.toggleAttribute('hidden', true);
    const sc = m$('[data-quiz-score]');
    if (sc) sc.textContent = `${r.score} з ${r.total}`;
    const v = m$('[data-quiz-verdict]');
    if (v) v.textContent = r.passed ? 'Пройдено! 🎉' : `Потрібно щонайменше ${Math.ceil(r.total * 0.8)} правильних. Перечитай документи й спробуй ще.`;
    render('quiz-mistakes', (r.mistakes || []).map((x) => ({ ...x, explanation: x.explanation || '' })), (el, x) => {
      el.querySelector('[data-field="explanation"]')?.toggleAttribute('hidden', !x.explanation);
      const a = el.querySelector('[data-mistake-doc]');
      if (a) { a.hidden = !x.doc_id; if (x.doc_id) { a.href = `/doc?id=${x.doc_id}`; a.target = '_blank'; } }
    });
    const retry = m$('[data-action="quiz-retry"]');
    if (retry) retry.hidden = r.passed;
  }
  action('quiz-retry', () => quiz && openQuiz(quiz.track));

  // ---------- запит на роль ----------
  action('role-request', async () => {
    if (!target) return toast('Обери роль');
    const tracks = isNew ? ['crm', target] : [target];
    if (!tracks.every(passed)) return toast('Спершу пройди всі квізи');
    const { error } = await sb.rpc('role_request_create', { target, msg: null });
    if (error) return CRM.fail(error);
    toast('Запит надіслано admin');
    load();
  });
  action('role-request-cancel', async () => {
    if (!request || !confirm('Скасувати запит на роль?')) return;
    const { error } = await sb.rpc('role_request_cancel', { request: request.id });
    if (error) return CRM.fail(error);
    load();
  });

  await load();
});
