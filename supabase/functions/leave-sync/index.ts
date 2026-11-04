// Gapsy CRM · Edge Function leave-sync (v0.14.0)
// Читає з ClickUp річний ліміт (Time estimate) і затрекані години (Track time) на річних задачах «GPS | Vacation» і «GPS | Sick Days» кожної людини
// і кладе їх у public.leave_balances. У ClickUp нічого не пише.
//
// Секрети (Supabase → Edge Functions → Secrets):
//   CLICKUP_TOKEN            — персональний токен ClickUp (pk_…). Обовʼязковий.
//   CLICKUP_VACATION_LIST    — id списку Vacation (за замовчуванням 901503585527)
//   CLICKUP_SICK_LIST        — id списку Sick Days (за замовчуванням 901503585552)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY — Supabase додає сам.
//
// Виклик із сайту: sb.functions.invoke('leave-sync', { body: { force: false } }).
// Будь-хто з команди може оновити, але не частіше ніж раз на 10 хв; погоджувач/admin — з force: true.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const ORIGINS = ['https://pet-project-gapsy.webflow.io'];
const THROTTLE_MS = 10 * 60 * 1000;

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

type Task = { id: string; name: string; due_date?: string | null; time_spent?: number | null; time_estimate?: number | null; assignees?: { email?: string }[] };

async function clickup(path: string, token: string) {
  const res = await fetch(`https://api.clickup.com/api/v2${path}`, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(`ClickUp ${res.status}`);
  return res.json();
}

/** Усі задачі списку (з закритими), сторінками по 100. */
async function listTasks(listId: string, token: string): Promise<Task[]> {
  const out: Task[] = [];
  for (let page = 0; page < 20; page++) {
    const data = await clickup(`/list/${listId}/task?include_closed=true&subtasks=true&page=${page}`, token);
    out.push(...(data.tasks || []));
    if (data.last_page !== false || !(data.tasks || []).length) break;
  }
  return out;
}

/** email → { hours (Track time), limit (Time estimate або null), taskId } лише для задач поточного року (термін у цьому році або без терміну). */
async function hoursByEmail(listId: string, token: string) {
  const year = new Date().getUTCFullYear();
  const tasks = (await listTasks(listId, token)).filter((t) => !t.due_date || new Date(Number(t.due_date)).getUTCFullYear() === year);
  const map = new Map<string, { hours: number; limit: number | null; taskId: string }>();
  for (const t of tasks) {
    let ms = typeof t.time_spent === 'number' ? t.time_spent : null;
    let est = typeof t.time_estimate === 'number' ? t.time_estimate : null;
    if (ms === null) {
      const full = await clickup(`/task/${t.id}`, token);
      ms = Number(full.time_spent || 0);
      if (est === null && typeof full.time_estimate === 'number') est = full.time_estimate;
    }
    for (const a of t.assignees || []) {
      const email = (a.email || '').toLowerCase();
      if (!email) continue;
      const cur = map.get(email) || { hours: 0, limit: null, taskId: t.id };
      cur.hours += ms / 3_600_000;
      if (est !== null) cur.limit = (cur.limit || 0) + est / 3_600_000;
      map.set(email, cur);
    }
  }
  return map;
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('origin')), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  try {
    const token = Deno.env.get('CLICKUP_TOKEN');
    if (!token) return reply(500, { error: 'CLICKUP_TOKEN не задано в Secrets' });

    // хто викликає — перевіряємо його ж JWT
    const authHeader = req.headers.get('Authorization') || '';
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return reply(401, { error: 'Потрібен вхід' });
    const { data: staff } = await asUser.rpc('is_staff');
    if (!staff) return reply(403, { error: 'Лише для команди' });
    const { data: approver } = await asUser.rpc('is_leave_approver');

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const { data: last } = await admin.from('leave_balances').select('synced_at').order('synced_at', { ascending: false }).limit(1);
    const lastAt = last?.[0]?.synced_at ? new Date(last[0].synced_at).getTime() : 0;
    if (!(body.force && approver) && Date.now() - lastAt < THROTTLE_MS) {
      return reply(200, { cached: true, synced_at: last?.[0]?.synced_at });
    }

    const [vac, sick] = await Promise.all([
      hoursByEmail(Deno.env.get('CLICKUP_VACATION_LIST') || '901503585527', token),
      hoursByEmail(Deno.env.get('CLICKUP_SICK_LIST') || '901503585552', token),
    ]);
    const { data: people, error } = await admin.from('profiles').select('id, email, clickup_email').in('role', ['designer', 'developer', 'pm', 'admin']);
    if (error) throw error;
    const now = new Date().toISOString();
    const rows = (people || []).map((p) => {
      const e = (p.clickup_email || p.email || '').toLowerCase();
      return {
        user_id: p.id,
        vacation_used_h: Math.round((vac.get(e)?.hours || 0) * 10) / 10,
        sick_used_h: Math.round((sick.get(e)?.hours || 0) * 10) / 10,
        vacation_limit_h: vac.get(e)?.limit != null ? Math.round(vac.get(e)!.limit! * 10) / 10 : null,
        sick_limit_h: sick.get(e)?.limit != null ? Math.round(sick.get(e)!.limit! * 10) / 10 : null,
        vacation_task_id: vac.get(e)?.taskId || null,
        sick_task_id: sick.get(e)?.taskId || null,
        synced_at: now,
      };
    });
    const { error: upErr } = await admin.from('leave_balances').upsert(rows, { onConflict: 'user_id' });
    if (upErr) throw upErr;

    const known = new Set((people || []).map((p) => (p.clickup_email || p.email || '').toLowerCase()));
    const unmatched = approver ? [...new Set([...vac.keys(), ...sick.keys()])].filter((e) => !known.has(e)) : undefined;
    return reply(200, { synced_at: now, people: rows.length, matched: rows.filter((r) => r.vacation_task_id || r.sick_task_id).length, unmatched });
  } catch (e) {
    console.error(e);
    return reply(500, { error: String((e as Error).message || e) });
  }
});
