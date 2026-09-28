import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { requireAuth, requireRole, leaderMinistryIds, type AppVariables } from "../lib/auth.js";
import { attachGroups } from "../lib/voice.js";
import type { TeamMember } from "../../shared/types.js";

export const eventRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

eventRoutes.use("*", requireAuth);

eventRoutes.get("/", async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
  let sql = "SELECT * FROM events";
  const binds: string[] = [];
  if (from) {
    sql += " WHERE event_date >= ?";
    binds.push(from);
  }
  if (to) {
    sql += binds.length ? " AND event_date <= ?" : " WHERE event_date <= ?";
    binds.push(to);
  }
  sql += " ORDER BY event_date ASC";
  const events = await c.env.DB.prepare(sql).bind(...binds).all();
  const ids = await leaderMinistryIds(c.env.DB, c.get("user"));
  const roleWhere = ids && ids.length > 0 ? `WHERE m.id IN (${ids.map(() => "?").join(",")})` : ids && ids.length === 0 ? "WHERE 1 = 0" : "";
  const slots = await c.env.DB.prepare(
    `SELECT s.*, r.name AS role_name, m.name AS ministry_name, m.id AS ministry_id, u.name AS user_name, u.avatar_url AS user_avatar,
       vcm.classification_id AS user_classification_id, vc.name AS user_classification, vc.color AS user_classification_color
     FROM schedules s
     JOIN roles r ON r.id = s.role_id
     JOIN ministries m ON m.id = r.ministry_id
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN voice_classification_members vcm ON vcm.user_id = u.id
     LEFT JOIN voice_classifications vc ON vc.id = vcm.classification_id ${roleWhere}`,
  )
    .bind(...(ids ?? []))
    .all();
  const slotList = slots.results as any[];
  await attachGroups(c.env.DB, slotList);
  for (const s of slotList) if (s.group_id == null) s.group = null;
  const result = (events.results as any[]).map((e) => ({
    ...e,
    slots: slotList.filter((s) => s.event_id === e.id),
  }));
  return c.json(result);
});

eventRoutes.get("/teams", async (c) => {
  const ids = [...new Set((c.req.query("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return c.json({ error: "Informe ids" }, 400);
  const user = c.get("user");
  const uid = Number(user.sub);
  let visible = ids;
  if (user.role !== "ADMIN" && user.role !== "LEADER") {
    const ph = ids.map(() => "?").join(",");
    const mine = await c.env.DB.prepare(
      `SELECT DISTINCT event_id FROM schedules WHERE event_id IN (${ph}) AND user_id = ?
       UNION
       SELECT DISTINCT s.event_id FROM schedule_group_members g JOIN schedules s ON s.id = g.schedule_id
       WHERE s.event_id IN (${ph}) AND g.user_id = ?`,
    )
      .bind(...ids, uid, ...ids, uid)
      .all();
    const allowed = new Set((mine.results as any[]).map((r) => Number(r.event_id)));
    visible = ids.filter((id) => allowed.has(id));
  }
  if (visible.length === 0) return c.json({});
  const vph = visible.map(() => "?").join(",");
  const rows = await c.env.DB.prepare(
    `SELECT s.event_id, u.id AS user_id, u.name AS name, u.avatar_url, r.name AS role_name, s.status AS status, 0 AS is_group
     FROM schedules s
     JOIN users u ON u.id = s.user_id
     JOIN roles r ON r.id = s.role_id
     WHERE s.event_id IN (${vph}) AND s.group_id IS NULL
     UNION ALL
     SELECT s.event_id, u.id AS user_id, u.name AS name, u.avatar_url, r.name AS role_name, g.status AS status, 1 AS is_group
     FROM schedule_group_members g
     JOIN schedules s ON s.id = g.schedule_id
     JOIN users u ON u.id = g.user_id
     JOIN roles r ON r.id = s.role_id
     WHERE s.event_id IN (${vph})
     ORDER BY name`,
  )
    .bind(...visible, ...visible)
    .all();
  const out: Record<string, TeamMember[]> = {};
  for (const r of rows.results as any[]) {
    const key = String(r.event_id);
    if (!out[key]) out[key] = [];
    out[key].push({
      user_id: Number(r.user_id),
      name: String(r.name),
      avatar_url: r.avatar_url ?? null,
      role_name: String(r.role_name),
      status: r.status,
      is_group: Number(r.is_group) === 1,
      is_me: Number(r.user_id) === uid,
    });
  }
  return c.json(out);
});

eventRoutes.post("/", requireRole("ADMIN", "LEADER"), async (c) => {
  const { title, event_date, location } = await c.req.json().catch(() => ({}));
  if (!title || !event_date) return c.json({ error: "Título e data obrigatórios" }, 400);
  const r = await c.env.DB.prepare("INSERT INTO events (title, event_date, location) VALUES (?, ?, ?)")
    .bind(title, event_date, location ?? null)
    .run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

eventRoutes.put("/:id", requireRole("ADMIN", "LEADER"), async (c) => {
  const { title, event_date, location } = await c.req.json().catch(() => ({}));
  await c.env.DB.prepare("UPDATE events SET title = COALESCE(?, title), event_date = COALESCE(?, event_date), location = COALESCE(?, location) WHERE id = ?")
    .bind(title ?? null, event_date ?? null, location ?? null, Number(c.req.param("id")))
    .run();
  return c.json({ ok: true });
});

eventRoutes.delete("/:id", requireRole("ADMIN", "LEADER"), async (c) => {
  await c.env.DB.prepare("DELETE FROM events WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

eventRoutes.post("/:id/slots", requireRole("ADMIN", "LEADER"), async (c) => {
  const { role_id } = await c.req.json().catch(() => ({}));
  if (!role_id) return c.json({ error: "role_id obrigatório" }, 400);
  const role = await c.env.DB.prepare("SELECT ministry_id FROM roles WHERE id = ?").bind(role_id).first<any>();
  if (!role) return c.json({ error: "Função não encontrada" }, 404);
  const ids = await leaderMinistryIds(c.env.DB, c.get("user"));
  if (ids !== null && !ids.includes(Number(role.ministry_id))) {
    return c.json({ error: "Fora do seu ministério" }, 403);
  }
  const r = await c.env.DB.prepare(
    "INSERT INTO schedules (event_id, role_id, user_id, status, notes) VALUES (?, ?, NULL, 'PENDING', 'Vaga em aberto')",
  )
    .bind(Number(c.req.param("id")), role_id)
    .run();
  return c.json({ id: r.meta.last_row_id }, 201);
});
