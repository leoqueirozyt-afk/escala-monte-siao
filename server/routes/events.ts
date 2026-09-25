import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { requireAuth, requireRole, leaderMinistryIds, type AppVariables } from "../lib/auth.js";
import { attachGroups } from "../lib/voice.js";

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
