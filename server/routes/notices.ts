import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { requireAuth, type AppVariables } from "../lib/auth.js";

export const noticeRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

noticeRoutes.use("*", requireAuth);

async function canManage(c: any, ministryId: number): Promise<boolean> {
  const user = c.get("user");
  if (user.role === "ADMIN") return true;
  if (user.role !== "LEADER") return false;
  const owned = await c.env.DB.prepare("SELECT 1 FROM ministry_leaders WHERE ministry_id = ? AND user_id = ?")
    .bind(ministryId, user.sub)
    .first();
  return !!owned;
}

function visibility(user: { sub: number; role: string }): { sql: string; binds: number[] } {
  if (user.role === "ADMIN") return { sql: "1 = 1", binds: [] };
  return {
    sql: `(n.ministry_id IS NULL
      OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.ministry_id = n.ministry_id)
      OR EXISTS (SELECT 1 FROM ministry_leaders ml WHERE ml.user_id = ? AND ml.ministry_id = n.ministry_id))`,
    binds: [user.sub, user.sub],
  };
}

function validMonth(m: unknown): m is string {
  return typeof m === "string" && /^\d{4}-\d{2}$/.test(m);
}

async function cleanupOld(db: Env["DB"], month: string) {
  await db.prepare("DELETE FROM notices WHERE month < ?").bind(month).run();
}

noticeRoutes.get("/", async (c) => {
  const user = c.get("user");
  const month = c.req.query("month");
  if (!validMonth(month)) return c.json({ error: "month obrigatório (YYYY-MM)" }, 400);
  await cleanupOld(c.env.DB, month);
  const vis = visibility(user);
  const rows = await c.env.DB.prepare(
    `SELECT n.id, n.ministry_id, n.title, n.body, n.month, n.created_by, n.created_at,
            u.name AS author_name, m.name AS ministry_name
     FROM notices n
     JOIN users u ON u.id = n.created_by
     LEFT JOIN ministries m ON m.id = n.ministry_id
     WHERE n.month = ? AND ${vis.sql}
     ORDER BY n.created_at DESC, n.id DESC`,
  )
    .bind(month, ...vis.binds)
    .all();
  return c.json(rows.results);
});

noticeRoutes.get("/unread-count", async (c) => {
  const user = c.get("user");
  const month = c.req.query("month");
  if (!validMonth(month)) return c.json({ error: "month obrigatório (YYYY-MM)" }, 400);
  await cleanupOld(c.env.DB, month);
  const vis = visibility(user);
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM notices n
     WHERE n.month = ? AND ${vis.sql}
       AND n.created_at > COALESCE((SELECT notices_seen_at FROM users WHERE id = ?), '')`,
  )
    .bind(month, ...vis.binds, user.sub)
    .first<any>();
  return c.json({ count: Number(row?.n ?? 0) });
});

noticeRoutes.post("/seen", async (c) => {
  const user = c.get("user");
  await c.env.DB.prepare(
    `UPDATE users SET notices_seen_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?`,
  ).bind(user.sub).run();
  return c.json({ ok: true });
});

noticeRoutes.post("/", async (c) => {
  const user = c.get("user");
  const { title, body, ministry_id, month } = await c.req.json().catch(() => ({}));
  if (!title?.trim() || !body?.trim()) return c.json({ error: "Título e texto obrigatórios" }, 400);
  if (!validMonth(month)) return c.json({ error: "month obrigatório (YYYY-MM)" }, 400);
  if (ministry_id != null) {
    if (!(await canManage(c, Number(ministry_id)))) return c.json({ error: "Sem permissão para este ministério" }, 403);
  } else if (user.role === "VOLUNTEER") {
    return c.json({ error: "Sem permissão para avisos gerais" }, 403);
  }
  const r = await c.env.DB.prepare(
    `INSERT INTO notices (ministry_id, title, body, month, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))`,
  )
    .bind(ministry_id ?? null, String(title).trim(), String(body).trim(), month, user.sub)
    .run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

noticeRoutes.put("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const n = await c.env.DB.prepare("SELECT created_by FROM notices WHERE id = ?").bind(id).first<any>();
  if (!n) return c.json({ error: "Aviso não encontrado" }, 404);
  if (user.role !== "ADMIN" && Number(n.created_by) !== user.sub) {
    return c.json({ error: "Somente o autor ou ADMIN pode editar" }, 403);
  }
  const payload = await c.req.json().catch(() => ({}));
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  if (payload.title !== undefined) {
    if (!String(payload.title).trim()) return c.json({ error: "Título vazio" }, 400);
    sets.push("title = ?");
    binds.push(String(payload.title).trim());
  }
  if (payload.body !== undefined) {
    if (!String(payload.body).trim()) return c.json({ error: "Texto vazio" }, 400);
    sets.push("body = ?");
    binds.push(String(payload.body).trim());
  }
  if (payload.month !== undefined) {
    if (!validMonth(payload.month)) return c.json({ error: "month inválido" }, 400);
    sets.push("month = ?");
    binds.push(payload.month);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "ministry_id")) {
    const mid = payload.ministry_id == null ? null : Number(payload.ministry_id);
    if (mid != null) {
      if (!(await canManage(c, mid))) return c.json({ error: "Sem permissão para este ministério" }, 403);
    } else if (user.role === "VOLUNTEER") {
      return c.json({ error: "Sem permissão para avisos gerais" }, 403);
    }
    sets.push("ministry_id = ?");
    binds.push(mid);
  }
  if (sets.length === 0) return c.json({ error: "Nada para atualizar" }, 400);
  await c.env.DB.prepare(`UPDATE notices SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
  return c.json({ ok: true });
});

noticeRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const n = await c.env.DB.prepare("SELECT created_by FROM notices WHERE id = ?").bind(id).first<any>();
  if (!n) return c.json({ error: "Aviso não encontrado" }, 404);
  if (user.role !== "ADMIN" && Number(n.created_by) !== user.sub) {
    return c.json({ error: "Somente o autor ou ADMIN pode excluir" }, 403);
  }
  await c.env.DB.prepare("DELETE FROM notices WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});
