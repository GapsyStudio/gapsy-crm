// Мок supabase-js: chainable builder + фікстури
window.__calls = [];
const FIX = {
  profiles: [{ id: 'u1', email: 'nelia@gapsy.studio', full_name: 'Нелія', role: 'admin', avatar_url: null, clickup_task_id: null, created_at: new Date().toISOString() },
             { id: 'u2', email: 'new@x.com', full_name: null, role: 'pending', avatar_url: null, created_at: new Date().toISOString() }],
  feedback: [
    { id: 'f1', title: 'Кнопка в хедері', status: 'new', priority: 'urgent', due_date: '2020-01-01', created_at: new Date(Date.now()-3600e3).toISOString(), author_id: 'u1', assignee_id: null, project: { id: 'p1', name: 'CloudVno' }, assignee: null, feedback_files: [{ count: 2 }], description: 'Опис', page_url: 'https://x.com', author: { full_name: 'Нелія' } },
    { id: 'f2', title: 'Адаптив', status: 'resolved', priority: 'normal', due_date: null, created_at: new Date().toISOString(), author_id: 'u2', assignee_id: 'u1', project: { id: 'p1', name: 'CloudVno' }, assignee: { full_name: 'Нелія' }, feedback_files: [{ count: 0 }] },
  ],
  projects: [{ id: 'p1', name: 'CloudVno', client: 'Vno', status: 'active', stage: 'development', stage_due: new Date(Date.now() + 864e5).toLocaleDateString('sv'), deadline: '2020-02-01', feedback: [{ count: 2 }], prefix: 'cv-', stack: ['GSAP', 'Lenis'], summary: 'Сайт винного бару', staging_url: 'https://cv.webflow.io', figma_url: 'https://figma.com/x', github_url: 'javascript:alert(1)' }, { id: 'p2', name: 'Old', client: null, status: 'done', feedback: [{ count: 0 }] }],
  showcase_items: [{ id: 's1', title: 'CloudVno site', url: 'https://cloudvno.com', category: 'site', cover_path: 'showcase/u1/a.png', is_best: true, project: { name: 'CloudVno' } }],
  project_members: [{ user_id: 'u1', role_label: 'розробка', user: { full_name: 'Нелія', avatar_url: null } }],
  project_notes: [{ id: 'pn1', body: 'Lenis + GSAP', pinned: true, created_at: new Date().toISOString(), author_id: 'u1', author: { full_name: 'Нелія' } },
                  { id: 'pn2', body: 'Чужа нотатка', pinned: false, created_at: new Date().toISOString(), author_id: 'u9', author: { full_name: 'Інший' } }],
  handoffs: [],
  snippets: [{ id: 'sn1', title: 'Blur reveal', description: 'Поява тексту', tags: ['GSAP', 'Text'], language: 'js', code: 'gsap.to(el, { filter: "blur(0)" });', attributes: 'data-blur-reveal', placement: 'Site Footer', demo_url: 'javascript:alert(1)', created_by: 'u1', updated_at: new Date().toISOString(), author: { full_name: 'Нелія' } },
             { id: 'sn2', title: 'Mobile nav', description: null, tags: ['Nav'], language: 'js', code: 'x', created_by: 'u9', updated_at: new Date().toISOString() }],
  snippet_projects: [{ snippet: { id: 'sn1', title: 'Blur reveal' }, project: { id: 'p1', name: 'CloudVno' } }],
  pins: [{ id: 'pin1', title: 'Figma', url: 'https://www.figma.com/file/x' }],
  notifications: [{ id: 'n1', title: 'Нова правка для вас', url: '/feedback-item?id=f1', read_at: null, created_at: new Date().toISOString() }],
  feedback_files: [{ id: 'ff1', path: 'feedback/f1/u1/a.png', created_by: 'u1' }, { id: 'ff2', path: 'feedback/f1/u1/b.png', created_by: 'u2' }],
  feedback_marks: [{ id: 'm1', file_id: 'ff1', x: 0.25, y: 0.5, note: 'Відступ 24px', done: false, created_by: 'u1', created_at: new Date(Date.now()-60e3).toISOString(), author: { full_name: 'Нелія' } },
                   { id: 'm2', file_id: 'ff1', x: 0.8, y: 0.1, note: 'Чужа позначка', done: true, created_by: 'u9', created_at: new Date().toISOString(), author: { full_name: 'Інший' } }],
  feedback_comments: [{ id: 'c1', body: 'Беру', created_at: new Date().toISOString(), author_id: 'u1', author: { full_name: 'Нелія' } }, { id: 'c2', body: 'Чуже', created_at: new Date().toISOString(), author_id: 'u2', author: { full_name: 'Оля' } }],
};
FIX.moodboard_items = [
  { id: 'mb1', kind: 'image', path: 'moodboard/u1/a.png', url: null, title: 'Hero', created_at: new Date().toISOString(), author: { full_name: 'Нелія' } },
  { id: 'mb2', kind: 'link', path: null, url: 'https://www.awwwards.com/sites/x', title: null, created_at: new Date().toISOString(), author: { full_name: 'Оля' } },
];
FIX.fonts = [
  { id: 'fo1', name: 'Neue Montreal', foundry: 'Pangram Pangram', license: 'commercial', allowed: ['desktop'], owner: 'agency', pageviews_limit: null, source_url: null, license_path: null, notes: null,
    font_files: [{ id: 'ff-a', path: 'fonts/u1/nm-bold.woff2', filename: 'NeueMontreal-Bold.woff2', weight: 700, style: 'normal' }, { id: 'ff-b', path: 'fonts/u1/nm-reg.woff2', filename: 'NeueMontreal-Regular.woff2', weight: 400, style: 'normal' }],
    font_projects: [{ project_id: 'p1' }] },
  { id: 'fo2', name: 'Inter', foundry: 'Rasmus Andersson', license: 'free', allowed: [], owner: 'agency', font_files: [], font_projects: [{ project_id: 'p1' }] },
  { id: 'fo3', name: 'Formula Condensed', foundry: 'Pangram Pangram', license: 'trial', allowed: ['web'], owner: 'client', font_files: [], font_projects: [] },
];
FIX.font_projects = [{ font: { id: 'fo1', name: 'Neue Montreal', foundry: 'Pangram Pangram', license: 'commercial', allowed: ['desktop'] } }, { font: { id: 'fo2', name: 'Inter', foundry: null, license: 'free', allowed: [] } }];
FIX.access_items = [
  { id: 'ac1', kind: 'service', name: 'Figma Organization', url: 'https://www.figma.com', notes: 'Акаунт студії', secret_id: 'sec1', secret_set_at: new Date(Date.now() - 86400e3).toISOString() },
  { id: 'ac2', kind: 'service', name: 'Webflow Workspace', url: 'https://webflow.com', notes: null, secret_id: null, secret_set_at: null },
  { id: 'ac3', kind: 'course', name: 'Projector', url: 'https://prjctr.com', notes: 'UI/UX курс', secret_id: 'sec3', secret_set_at: null },
];
FIX.inspo_links = [
  { id: 'ri1', url: 'https://www.awwwards.com/sites/a', title: 'Awwwards hero', note: 'Скрол-анімація', tags: ['hero', 'scroll'], created_by: 'u1', created_at: new Date().toISOString(), author: { full_name: 'Нелія' } },
  { id: 'ri2', url: 'https://dribbble.com/shots/1', title: null, note: null, tags: ['ui'], created_by: 'u9', created_at: new Date().toISOString(), author: { full_name: 'Оля' } },
];
FIX.design_reviews = [
  { id: 'dr1', project_id: 'p1', parent_id: null, version: 1, title: 'Головна', url: 'https://figma.com/a', note: 'Перша версія', status: 'changes', requested_by: 'u1', reviewer_id: 'u3', decision_note: 'Більше повітря', created_at: new Date(Date.now() - 2 * 864e5).toISOString(), project: { name: 'CloudVno' }, author: { full_name: 'Нелія' }, reviewer: { full_name: 'Арт' } },
  { id: 'dr2', project_id: 'p1', parent_id: 'dr1', version: 2, title: 'Головна', url: 'https://figma.com/b', note: null, status: 'pending', requested_by: 'u1', reviewer_id: null, decision_note: null, created_at: new Date().toISOString(), project: { name: 'CloudVno' }, author: { full_name: 'Нелія' }, reviewer: null },
  { id: 'dr3', project_id: null, parent_id: null, version: 1, title: 'Банер', url: 'https://figma.com/c', note: null, status: 'approved', requested_by: 'u9', reviewer_id: 'u1', decision_note: null, created_at: new Date().toISOString(), project: null, author: { full_name: 'Оля' }, reviewer: { full_name: 'Нелія' } },
];
FIX.access_requests = [];
const D = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv');
FIX.leave_summary = [
  { user_id: 'u1', full_name: 'Нелія', email: 'nelia@gapsy.studio', avatar_url: null, hired_on: '2026-08-01', vacation_limit_h: 120, vacation_used_h: 56, vacation_planned_h: 16, sick_limit_h: 40, sick_used_h: 8, sick_planned_h: 0, synced_at: new Date().toISOString(), matched: true },
  { user_id: 'u2', full_name: 'Оля', email: 'olya@gapsy.studio', avatar_url: null, hired_on: '2021-01-10', vacation_limit_h: 120, vacation_used_h: 119, vacation_planned_h: 0, sick_limit_h: 80, sick_used_h: 80, sick_planned_h: 0, synced_at: new Date().toISOString(), matched: false },
];
FIX.showcase_categories = [
  { slug: 'site', label: 'Сайт', color: 'is-blue', sort: 10 }, { slug: 'figma', label: 'Figma', color: 'is-yellow', sort: 20 },
  { slug: 'saas', label: 'SaaS', color: 'is-blue', sort: 50 }, { slug: 'web3', label: 'Web3', color: 'is-red', sort: 90 },
];
FIX.quiz_questions = [
  { id: 'q1', track: 'crm', question: 'Що робить ⌘K?', options: ['Копіює', 'Пошук і перехід', 'Тема'], doc_id: '3a0226a1-0275-5881-b848-96df46008c26', sort: 10, active: true },
  { id: 'q2', track: 'crm', question: 'Де правки?', options: ['Правки', 'Slack'], doc_id: '3a0226a1-0275-5881-b848-96df46008c26', sort: 20, active: true },
  { id: 'q3', track: 'designer', question: 'Пошта?', options: ['Особиста', 'Робоча'], doc_id: '62c1a9e7-417f-5a60-be78-95841a7dfc23', sort: 10, active: true },
];
FIX.quiz_attempts = [];
FIX.role_requests = [];
FIX.docs = (FIX.docs || []).concat([{ id: 'dcrm', title: 'Як користуватися Gapsy CRM', icon: '🧭' }, { id: 'ddes', title: 'Onboarding for Designer', icon: '' }]);
FIX.company_holidays = [{ day: D(20), title: 'Тестове свято' }];
FIX.leave_balances = [{ user_id: 'u2', vacation_task_id: 'cu123', sick_task_id: 'cu124' }];
FIX.leave_requests = [
  { id: 'l1', user_id: 'u1', kind: 'vacation', start_date: D(30), end_date: D(34), hours: 24, comment: 'Море', status: 'pending', tracked: false, decision_note: null, created_at: new Date().toISOString(), person: { full_name: 'Нелія' } },
  { id: 'l2', user_id: 'u2', kind: 'vacation', start_date: D(3), end_date: D(7), hours: 40, comment: null, status: 'pending', tracked: false, decision_note: null, created_at: new Date().toISOString(), person: { full_name: 'Оля' } },
  { id: 'l3', user_id: 'u2', kind: 'sick', start_date: D(-2), end_date: D(-2), hours: 8, comment: null, status: 'approved', tracked: false, decision_note: null, created_at: new Date().toISOString(), person: { full_name: 'Оля' } },
];
Object.assign(FIX, window.__FIXPATCH || {});
function builder(table) {
  const st = { table, single: false, filters: [] };
  const b = {
    select() { return b; }, eq(k, v) { st.filters.push([k, v]); return b; }, neq() { return b; }, or() { return b; }, order() { return b; },
    limit() { return b; }, in() { return b; }, is() { return b; }, not() { return b; }, gte() { return b; }, gte() { return b; }, lte() { return b; }, gt() { return b; },
    single() { st.single = true; return b; }, maybeSingle() { st.single = true; return b; },
    insert(row) { window.__calls.push(['insert', table, row]); st.insert = row; return b; },
    update(row) { window.__calls.push(['update', table, row]); st.update = row; return b; },
    upsert(row, opt) { window.__calls.push(['upsert', table, row, opt]); st.upsert = row; return b; },
    delete() { window.__calls.push(['delete', table]); return b; },
    then(res) {
      let data = FIX[table] || [];
      if (st.insert) data = { id: 'new1' };
      else if (st.upsert) data = { id: 'h1', status: 'draft', ...st.upsert };
      else if (st.update && st.single) {
        const idf = st.filters.find(([k]) => k === 'id');
        const cur = (idf && data.find((r) => r.id === idf[1])) || { id: idf ? idf[1] : 'x' };
        data = Object.assign(cur, st.update);
      }
      else if (st.single) {
        const idf = st.filters.find(([k]) => k === 'id');
        data = idf ? data.find((r) => r.id === idf[1]) || null : data[0];
      }
      return Promise.resolve({ data, error: null, count: Array.isArray(data) ? data.length : null }).then(res);
    },
  };
  return b;
}
window.supabase = { createClient: () => ({
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'nelia@gapsy.studio', user_metadata: {} } } } }),
    onAuthStateChange() {}, signOut: async () => {}, signInWithPassword: async () => ({}), signInWithOAuth: async () => ({}),
  },
  from: builder,
  functions: { invoke: async (name, opts) => { window.__calls.push(['fn', name, opts?.body]); return { data: { synced_at: new Date().toISOString(), cached: false }, error: null }; } },
  rpc: async (name, args) => { window.__calls.push(['rpc', name, args]); if (name === 'leave_summary') return { data: FIX.leave_summary || [], error: null };
    if (name === 'quiz_submit') { const ok = args.t === 'crm' ? (args.answers.q1 === 1 && args.answers.q2 === 0) : args.answers.q3 === 1; const r = { score: ok ? 2 : 1, total: 2, passed: ok, mistakes: ok ? [] : [{ id: 'q1', question: 'Що робить ⌘K?', explanation: 'Це пошук', doc_id: '3a0226a1-0275-5881-b848-96df46008c26' }] }; FIX.quiz_attempts.unshift({ track: args.t, score: r.score, total: 2, passed: ok, created_at: new Date().toISOString() }); return { data: r, error: null }; }
    if (name === 'role_request_create') { FIX.role_requests.unshift({ id: 'rr1', role: args.target, status: 'pending', created_at: new Date().toISOString() }); return { data: 'rr1', error: null }; }
    if (name === 'role_requests_admin') return { data: [{ id: 'rr9', user_id: 'u5', full_name: 'Новачок Тест', email: 'n@x', role: 'designer', from_role: 'pending', crm_score: '10/10', role_score: '11/12', status: 'pending', created_at: new Date().toISOString() }], error: null };
    if (name === 'quiz_admin_list') return { data: FIX.quiz_questions.filter((q) => !args?.t || q.track === args.t).map((q) => ({ ...q, correct: 0, explanation: null })), error: null }; if (name === 'access_reveal') return { data: [{ login: 'studio@gapsy.studio', password: 'S3cret!', extra: null }], error: null }; return { data: name === 'search_all' ? [{ kind: 'feedback', id: 'f1', title: 'Кнопка в хедері', url: '/feedback-item?id=f1' }] : null, error: null }; },
  storage: { from: () => ({
    createSignedUrls: async (paths) => ({ data: paths.map((p) => ({ path: p, signedUrl: 'data:image/png;base64,iVBORw0KGgo=' })), error: null }),
    upload: async () => ({ error: null }), remove: async (paths) => { window.__calls.push(['storage-remove', 'media', paths]); return { error: null }; }, getPublicUrl: (p) => ({ data: { publicUrl: 'https://cdn/' + p } }),
  }) },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
}) };
