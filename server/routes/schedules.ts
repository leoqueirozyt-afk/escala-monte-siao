import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { requireAuth, requireRole, leaderMinistryIds, type AppVariables } from "../lib/auth.js";

export const scheduleRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const SELECT_JOIN = `
  SELECT s.id, s.event_id, s.role_id, s.user_id, s.status, s.notes,
    e.title AS event_title, e.event_date, e.location,
    r.name AS role_name, m.name AS ministry_name, m.id AS ministry_id, u.name AS user_name, u.avatar_url AS user_avatar
  FROM schedules s
  JOIN events e ON e.id = s.event_id
  JOIN roles r ON r.id = s.role_id
  JOIN ministries m ON m.id = r.ministry_id
  LEFT JOIN users u ON u.id = s.user_id`;

scheduleRoutes.use("*", requireAuth);

async function scopeClause(c: any): Promise<{ sql: string; binds: number[] }> {
  const ids = await leaderMinistryIds(c.env.DB, c.get("user"));
  if (ids === null) return { sql: "", binds: [] };
  if (ids.length === 0) return { sql: " AND 1 = 0", binds: [] };
  return { sql: ` AND m.id IN (${ids.map(() => "?").join(",")})`, binds: ids };
}

async function assertScope(c: any, ministryId: number): Promise<boolean> {
  const ids = await leaderMinistryIds(c.env.DB, c.get("user"));
  if (ids === null) return true;
  return ids.includes(ministryId);
}

scheduleRoutes.get("/", requireRole("ADMIN", "LEADER"), async (c) => {
  const month = c.req.query("month");
  const scope = await scopeClause(c);
  let sql = SELECT_JOIN;
  const binds: any[] = [];
  const wheres: string[] = [];
  if (month) {
    wheres.push("substr(e.event_date, 1, 7) = ?");
    binds.push(month);
  }
  if (wheres.length) sql += ` WHERE ${wheres.join(" AND ")}`;
  sql += scope.sql;
  binds.push(...scope.binds);
  sql += " ORDER BY e.event_date ASC, r.name ASC";
  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json(rows.results);
});

scheduleRoutes.get("/my", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare(`${SELECT_JOIN} WHERE s.user_id = ? ORDER BY e.event_date ASC`)
    .bind(user.sub)
    .all();
  return c.json(rows.results);
});

scheduleRoutes.get("/candidates/:scheduleId", requireRole("ADMIN", "LEADER"), async (c) => {
  const scheduleId = Number(c.req.param("scheduleId"));
  const schedule = await c.env.DB.prepare(
    `SELECT s.*, e.event_date, r.ministry_id FROM schedules s
     JOIN events e ON e.id = s.event_id
     JOIN roles r ON r.id = s.role_id
     WHERE s.id = ?`,
  )
    .bind(scheduleId)
    .first<any>();
  if (!schedule) return c.json({ error: "Escala não encontrada" }, 404);
  if (!(await assertScope(c, schedule.ministry_id))) {
    return c.json({ error: "Fora do seu ministério" }, 403);
  }
  const date = String(schedule.event_date).slice(0, 10);
  const month = String(schedule.event_date).slice(0, 7);
  const rows = await c.env.DB.prepare(
    `SELECT u.id AS user_id, u.name, u.email, u.avatar_url, u.max_services_per_month,
       (SELECT COUNT(*) FROM schedules s2 JOIN events e2 ON e2.id = s2.event_id
        WHERE s2.user_id = u.id AND substr(e2.event_date, 1, 7) = ? AND s2.status != 'DECLINED') AS services_this_month
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     WHERE ur.role_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM unavailabilities un
         WHERE un.user_id = u.id AND ? BETWEEN un.start_date AND un.end_date
       )
       AND NOT EXISTS (
         SELECT 1 FROM schedules s3 WHERE s3.event_id = ? AND s3.user_id = u.id
       )
     ORDER BY (services_this_month >= u.max_services_per_month), u.name`,
  )
    .bind(month, schedule.role_id, date, schedule.event_id)
    .all();
  return c.json(rows.results);
});

scheduleRoutes.post("/", requireRole("ADMIN", "LEADER"), async (c) => {
  const { event_id, role_id, user_id, notes } = await c.req.json().catch(() => ({}));
  if (!event_id || !role_id) return c.json({ error: "event_id e role_id obrigatórios" }, 400);
  const role = await c.env.DB.prepare("SELECT ministry_id FROM roles WHERE id = ?").bind(role_id).first<any>();
  if (!role) return c.json({ error: "Função não encontrada" }, 404);
  if (!(await assertScope(c, role.ministry_id))) return c.json({ error: "Fora do seu ministério" }, 403);
  if (user_id) {
    const ok = await checkAvailability(c.env, user_id, event_id);
    if (!ok) return c.json({ error: "Voluntário indisponível ou já escalado neste evento" }, 400);
  }
  const r = await c.env.DB.prepare(
    "INSERT INTO schedules (event_id, role_id, user_id, status, notes) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(event_id, role_id, user_id ?? null, "PENDING", notes ?? null)
    .run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

scheduleRoutes.patch("/:id", requireRole("ADMIN", "LEADER"), async (c) => {
  const id = Number(c.req.param("id"));
  const { user_id, status, notes } = await c.req.json().catch(() => ({}));
  const schedule = await c.env.DB.prepare(
    `SELECT s.*, r.ministry_id FROM schedules s JOIN roles r ON r.id = s.role_id WHERE s.id = ?`,
  )
    .bind(id)
    .first<any>();
  if (!schedule) return c.json({ error: "Escala não encontrada" }, 404);
  if (!(await assertScope(c, schedule.ministry_id))) return c.json({ error: "Fora do seu ministério" }, 403);
  if (user_id !== undefined && user_id !== null && user_id !== schedule.user_id) {
    const ok = await checkAvailability(c.env, user_id, schedule.event_id);
    if (!ok) return c.json({ error: "Voluntário indisponível ou já escalado neste evento" }, 400);
    await c.env.DB.prepare("UPDATE schedules SET user_id = ?, status = 'PENDING' WHERE id = ?").bind(user_id, id).run();
    return c.json({ ok: true });
  }
  if (user_id === null) {
    await c.env.DB.prepare("UPDATE schedules SET user_id = NULL, status = 'PENDING' WHERE id = ?").bind(id).run();
    return c.json({ ok: true });
  }
  await c.env.DB.prepare("UPDATE schedules SET status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ?")
    .bind(status ?? null, notes ?? null, id)
    .run();
  return c.json({ ok: true });
});

scheduleRoutes.post("/:id/respond", async (c) => {
  const user = c.get("user");
  const { status } = await c.req.json().catch(() => ({}));
  if (status !== "CONFIRMED" && status !== "DECLINED") return c.json({ error: "Status inválido" }, 400);
  const r = await c.env.DB.prepare("UPDATE schedules SET status = ? WHERE id = ? AND user_id = ?")
    .bind(status, Number(c.req.param("id")), user.sub)
    .run();
  if (r.meta.changes === 0) return c.json({ error: "Escala não encontrada para este usuário" }, 404);
  return c.json({ ok: true });
});

scheduleRoutes.delete("/:id", requireRole("ADMIN", "LEADER"), async (c) => {
  const id = Number(c.req.param("id"));
  const schedule = await c.env.DB.prepare(
    `SELECT s.id, r.ministry_id FROM schedules s JOIN roles r ON r.id = s.role_id WHERE s.id = ?`,
  )
    .bind(id)
    .first<any>();
  if (!schedule) return c.json({ error: "Escala não encontrada" }, 404);
  if (!(await assertScope(c, schedule.ministry_id))) return c.json({ error: "Fora do seu ministério" }, 403);
  await c.env.DB.prepare("DELETE FROM schedules WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

async function checkAvailability(env: Env, userId: number, eventId: number): Promise<boolean> {
  const event = await env.DB.prepare("SELECT event_date FROM events WHERE id = ?").bind(eventId).first<any>();
  if (!event) return false;
  const date = String(event.event_date).slice(0, 10);
  const unavailable = await env.DB.prepare(
    "SELECT id FROM unavailabilities WHERE user_id = ? AND ? BETWEEN start_date AND end_date",
  )
    .bind(userId, date)
    .first();
  if (unavailable) return false;
  const already = await env.DB.prepare("SELECT id FROM schedules WHERE event_id = ? AND user_id = ?")
    .bind(eventId, userId)
    .first();
  return !already;
}
