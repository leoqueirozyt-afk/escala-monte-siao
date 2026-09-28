import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { requireAuth, isLouvorLeader, LOUVOR_MINISTRY_ID, type AppVariables } from "../lib/auth.js";

export const voiceRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

voiceRoutes.use("*", requireAuth);

async function canManage(c: any): Promise<boolean> {
  return isLouvorLeader(c.env.DB, c.get("user"));
}

voiceRoutes.get("/classifications", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare(
    "SELECT id, name, gender, color, sort_order FROM voice_classifications ORDER BY sort_order",
  ).all();
  const mine = await c.env.DB.prepare(
    "SELECT classification_id FROM voice_classification_members WHERE user_id = ?",
  )
    .bind(user.sub)
    .first<any>();
  return c.json({ classifications: rows.results, mine: mine ? Number(mine.classification_id) : null });
});

voiceRoutes.get("/groups", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "Sem permissão" }, 403);
  const groups = await c.env.DB.prepare("SELECT id, ministry_id, kind, name FROM voice_groups ORDER BY kind, name").all();
  const members = await c.env.DB.prepare(
    `SELECT gm.group_id, u.id AS user_id, u.name, u.avatar_url,
       vc.name AS classification, vc.color AS classification_color
     FROM voice_group_members gm
     JOIN users u ON u.id = gm.user_id
     LEFT JOIN voice_classification_members vcm ON vcm.user_id = u.id
     LEFT JOIN voice_classifications vc ON vc.id = vcm.classification_id
     ORDER BY gm.position, u.name`,
  ).all();
  const result = (groups.results as any[]).map((g) => ({
    ...g,
    members: (members.results as any[]).filter((m) => Number(m.group_id) === Number(g.id)),
  }));
  return c.json(result);
});

voiceRoutes.post("/groups", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "Sem permissão" }, 403);
  const { kind, name } = await c.req.json().catch(() => ({}));
  if (kind !== "VOZ" && kind !== "MUSICO") return c.json({ error: "Tipo inválido" }, 400);
  if (!name || !String(name).trim()) return c.json({ error: "Nome obrigatório" }, 400);
  const r = await c.env.DB.prepare("INSERT INTO voice_groups (ministry_id, kind, name) VALUES (?, ?, ?)")
    .bind(LOUVOR_MINISTRY_ID, kind, String(name).trim())
    .run();
  return c.json({ id: r.meta.last_row_id, ministry_id: LOUVOR_MINISTRY_ID, kind, name: String(name).trim() }, 201);
});

voiceRoutes.put("/groups/:id", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "Sem permissão" }, 403);
  const { name } = await c.req.json().catch(() => ({}));
  if (!name || !String(name).trim()) return c.json({ error: "Nome obrigatório" }, 400);
  await c.env.DB.prepare("UPDATE voice_groups SET name = ? WHERE id = ?")
    .bind(String(name).trim(), Number(c.req.param("id")))
    .run();
  return c.json({ ok: true });
});

voiceRoutes.delete("/groups/:id", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "Sem permissão" }, 403);
  const groupId = Number(c.req.param("id"));
  const used = await c.env.DB.prepare("SELECT id FROM schedules WHERE group_id = ?").bind(groupId).all();
  const scheduleIds = (used.results as any[]).map((r) => Number(r.id));
  const batch = [];
  if (scheduleIds.length > 0) {
    const placeholders = scheduleIds.map(() => "?").join(",");
    batch.push(
      c.env.DB.prepare(`DELETE FROM schedule_group_members WHERE schedule_id IN (${placeholders})`).bind(...scheduleIds),
      c.env.DB.prepare(
        "UPDATE schedules SET group_id = NULL, user_id = NULL, status = 'PENDING' WHERE group_id = ?",
      ).bind(groupId),
    );
  }
  batch.push(c.env.DB.prepare("DELETE FROM voice_groups WHERE id = ?").bind(groupId));
  await c.env.DB.batch(batch);
  return c.json({ ok: true });
});

voiceRoutes.post("/groups/:id/members", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "Sem permissão" }, 403);
  const groupId = Number(c.req.param("id"));
  const { user_id } = await c.req.json().catch(() => ({}));
  if (!user_id) return c.json({ error: "user_id obrigatório" }, 400);
  const group = await c.env.DB.prepare("SELECT id FROM voice_groups WHERE id = ?").bind(groupId).first();
  if (!group) return c.json({ error: "Grupo não encontrado" }, 404);
  const isMember = await c.env.DB.prepare(
    `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.ministry_id = ?
     UNION SELECT 1 FROM ministry_leaders WHERE ministry_id = ? AND user_id = ?`,
  )
    .bind(user_id, LOUVOR_MINISTRY_ID, LOUVOR_MINISTRY_ID, user_id)
    .first();
  if (!isMember) return c.json({ error: "Usuário não é membro do Louvor" }, 400);
  await c.env.DB.prepare("INSERT OR IGNORE INTO voice_group_members (group_id, user_id) VALUES (?, ?)")
    .bind(groupId, user_id)
    .run();
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO schedule_group_members (schedule_id, user_id, status)
     SELECT s.id, ?, 'PENDING' FROM schedules s JOIN events e ON e.id = s.event_id
     WHERE s.group_id = ? AND replace(e.event_date, 'T', ' ') >= datetime('now')`,
  )
    .bind(user_id, groupId)
    .run();
  return c.json({ ok: true }, 201);
});

voiceRoutes.delete("/groups/:id/members/:userId", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "Sem permissão" }, 403);
  await c.env.DB.prepare("DELETE FROM voice_group_members WHERE group_id = ? AND user_id = ?")
    .bind(Number(c.req.param("id")), Number(c.req.param("userId")))
    .run();
  return c.json({ ok: true });
});
