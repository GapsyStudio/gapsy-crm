// Gapsy CRM · Edge Function my-tasks (v0.17.0; 09.11: без задач на паузі)
// «Мої задачі» на Головній: відкриті задачі ClickUp, де людина — виконавець. Лише читання, у ClickUp нічого не пише.
// Людину шукаємо в ClickUp за поштою: profiles.clickup_email (якщо задано в адмінці) або пошта входу.
//
// Секрети (Supabase → Edge Functions → Secrets) — ті самі, що для leave-sync:
//   CLICKUP_TOKEN — токен ClickUp (pk_…). Обовʼязковий.
//   CLICKUP_TEAM  — id робочого простору (необовʼязково; без нього беремо перший доступний токену).
//   CLICKUP_HIDE  — статуси, які не показуємо, через кому (необовʼязково). За замовчуванням — HIDE нижче.
//   SUPABASE_URL, SUPABASE_ANON_KEY — Supabase додає сам.
//
// Виклик із сайту: sb.functions.invoke('my-tasks'). Відповідь: { tasks: [{ id, name, status, color, due, url, list }], matched }.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const ORIGINS = ['https://pet-project-gapsy.webflow.io'];
const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

// v0.17.3: задачі на паузі не показуємо. Порівнюємо назву статусу без регістру, частковим збігом («on hold», «Paused 🟡»).
const HIDE = ['pause', 'paused', 'on hold', 'hold', 'пауза', 'на паузі', 'backlog', 'blocked', 'waiting', 'очікує'];
const hiddenStatus = (name: string) => {
  const list = (Deno.env.get('CLICKUP_HIDE') || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const n = String(name || '').toLowerCase();
  return (list.length ? list : HIDE).some((h) => n.includes(h));
};

async function clickup(path: string, token: string) {
  const res = await fetch(`https://api.clickup.com/api/v2${path}`, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(`ClickUp ${res.status}`);
  return res.json();
}

// Склад команди змінюється рідко — тримаємо в памʼяті інстансу 30 хв
let teamCache: { at: number; teamId: string; members: Map<string, number> } | null = null;
async function team(token: string) {
  if (teamCache && Date.now() - teamCache.at < 30 * 60 * 1000) return teamCache;
  const { teams = [] } = await clickup('/team', token);
  const wanted = Deno.env.get('CLICKUP_TEAM');
  const t = teams.find((x: { id: string }) => !wanted || String(x.id) === wanted) || teams[0];
  if (!t) throw new Error('ClickUp: токену не доступний жоден робочий простір');
  const members = new Map<string, number>();
  for (const m of t.members || []) if (m.user?.email) members.set(String(m.user.email).toLowerCase(), m.user.id);
  teamCache = { at: Date.now(), teamId: String(t.id), members };
  return teamCache;
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('origin')), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  try {
    const token = Deno.env.get('CLICKUP_TOKEN');
    if (!token) return reply(500, { error: 'CLICKUP_TOKEN не задано в Secrets' });

    // хто викликає — перевіряємо його ж JWT; пошту беремо з його профілю (RLS віддає лише свій)
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return reply(401, { error: 'Потрібен вхід' });
    const { data: staff } = await asUser.rpc('is_staff');
    if (!staff) return reply(403, { error: 'Лише для команди' });
    const { data: me } = await asUser.from('profiles').select('email, clickup_email').eq('id', user.id).single();
    const email = String(me?.clickup_email || me?.email || user.email || '').toLowerCase();

    const t = await team(token);
    const cuId = t.members.get(email);
    if (!cuId) return reply(200, { tasks: [], matched: false });

    const q = new URLSearchParams({ include_closed: 'false', subtasks: 'true', order_by: 'due_date', reverse: 'true', page: '0' });
    q.append('assignees[]', String(cuId));
    const { tasks = [] } = await clickup(`/team/${t.teamId}/task?${q}`, token);
    const out = tasks
      .filter((x: any) => x.status?.type !== 'closed' && x.status?.type !== 'done' && !hiddenStatus(x.status?.status))
      .slice(0, 40)
      .map((x: any) => ({
        id: x.id,
        name: String(x.name || '').slice(0, 200),
        status: x.status?.status || '',
        color: x.status?.color || '',
        due: x.due_date ? new Date(Number(x.due_date)).toISOString() : null,
        url: x.url,
        list: x.list?.name || '',
      }));
    return reply(200, { tasks: out, matched: true });
  } catch (e) {
    console.error(e);
    return reply(500, { error: String((e as Error).message || e) });
  }
});
