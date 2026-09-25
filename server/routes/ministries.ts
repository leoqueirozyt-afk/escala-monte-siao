import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { requireAuth, requireRole, leaderMinistryIds, type AppVariables } from "../lib/auth.js";

export const ministryRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

ministryRoutes.use("*", requireAuth);

async function canManage(c: any, ministryId: number): Promise<boolean> {
  const user = c.get("user");
  if (user.role === "ADMIN") return true;
  if (user.role !== "LEADER") return false;
  const owned = await c.env.DB.prepare("SELECT 1 FROM ministry_leaders WHERE ministry_id = ? AND user_id = ?")
    .bind(ministryId, user.sub)
    .first();
  return !!owned;
}

async function applyLeaders(c: any, ministryId: number, leaderIds: number[]): Promise<string | null> {
  for (const uid of leaderIds) {
    const u = await c.env.DB.prepare("SELECT id, role, account_status FROM users WHERE id = ?").bind(uid).first();
    if (!u || u.account_status === "REJECTED") return "Usuário inválido";
  }
  await c.env.DB.prepare("DELETE FROM ministry_leaders WHERE ministry_id = ?").bind(ministryId).run();
  if (leaderIds.length > 0) {
    const ins = leaderIds.map((uid) =>
      c.env.DB.prepare("INSERT OR IGNORE INTO ministry_leaders (ministry_id, user_id) VALUES (?, ?)").bind(ministryId, uid),
    );
    await c.env.DB.batch(ins);
    let role: { id: number } | null = await c.env.DB.prepare("SELECT id FROM roles WHERE ministry_id = ? ORDER BY id LIMIT 1")
      .bind(ministryId)
      .first();
    if (!role) {
      const created = await c.env.DB.prepare("INSERT INTO roles (ministry_id, name) VALUES (?, 'Líder')")
        .bind(ministryId)
        .run();
      role = { id: created.meta.last_row_id };
    }
    const links = leaderIds.map((uid) =>
      c.env.DB.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)").bind(uid, Number(role.id)),
    );
    await c.env.DB.batch(links);
    await c.env.DB.prepare(
      `UPDATE users SET role = 'LEADER' WHERE role = 'VOLUNTEER' AND id IN (${leaderIds.map(() => "?").join(",")})`,
    )
      .bind(...leaderIds)
      .run();
  }
  await c.env.DB.prepare("UPDATE ministries SET leader_id = ? WHERE id = ?")
    .bind(leaderIds[0] ?? null, ministryId)
    .run();
  return null;
}

ministryRoutes.get("/", requireRole("ADMIN", "LEADER"), async (c) => {
  const user = c.get("user");
  const ids = c.req.query("scope") === "all" ? null : await leaderMinistryIds(c.env.DB, user);
  const where = ids ? `WHERE m.id IN (${ids.map(() => "?").join(",")})` : "";
  const rows = await c.env.DB.prepare(
    `SELECT m.*, u.name AS leader_name,
       (SELECT COUNT(DISTINCT ur.user_id) FROM roles r2 JOIN user_roles ur ON ur.role_id = r2.id WHERE r2.ministry_id = m.id) AS member_count
     FROM ministries m LEFT JOIN users u ON u.id = m.leader_id ${where} ORDER BY m.name`,
  )
    .bind(...(ids ?? []))
    .all();
  const roleWhere = ids ? `WHERE ministry_id IN (${ids.map(() => "?").join(",")})` : "";
  const roles = await c.env.DB.prepare(`SELECT * FROM roles ${roleWhere} ORDER BY ministry_id, name`)
    .bind(...(ids ?? []))
    .all();
  const leaders = await c.env.DB.prepare(
    "SELECT ml.ministry_id, u.id, u.name FROM ministry_leaders ml JOIN users u ON u.id = ml.user_id ORDER BY u.name",
  ).all();
  const leaderMap = new Map<number, { id: number; name: string }[]>();
  for (const l of leaders.results as any[]) {
    const arr = leaderMap.get(Number(l.ministry_id)) ?? [];
    arr.push({ id: Number(l.id), name: String(l.name) });
    leaderMap.set(Number(l.ministry_id), arr);
  }
  const result = rows.results.map((m: any) => {
    const ls = leaderMap.get(Number(m.id)) ?? [];
    return {
      ...m,
      leader_ids: ls.map((l) => l.id),
      leader_name: ls.length ? ls.map((l) => l.name).join(", ") : null,
      roles: (roles.results as any[]).filter((r) => r.ministry_id === m.id),
    };
  });
  return c.json(result);
});

ministryRoutes.post("/", requireRole("ADMIN"), async (c) => {
  const { name, description, leader_id, leader_ids } = await c.req.json().catch(() => ({}));
  if (!name) return c.json({ error: "Nome obrigatório" }, 400);
  const ids: number[] = Array.isArray(leader_ids)
    ? leader_ids.map(Number)
    : leader_id
      ? [Number(leader_id)]
      : [];
  const r = await c.env.DB.prepare("INSERT INTO ministries (name, description, leader_id) VALUES (?, ?, ?)")
    .bind(name, description ?? null, ids[0] ?? null)
    .run();
  const ministryId = Number(r.meta.last_row_id);
  if (ids.length > 0) {
    const err = await applyLeaders(c, ministryId, ids);
    if (err) {
      await c.env.DB.prepare("DELETE FROM ministries WHERE id = ?").bind(ministryId).run();
      return c.json({ error: err }, 400);
    }
  }
  return c.json({ id: ministryId, name, description, leader_id: ids[0] ?? null }, 201);
});

ministryRoutes.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  if (!(await canManage(c, id))) return c.json({ error: "Sem permissão para este ministério" }, 403);
  const { name, description, leader_id, leader_ids } = await c.req.json().catch(() => ({}));
  await c.env.DB.prepare("UPDATE ministries SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?")
    .bind(name ?? null, description ?? null, id)
    .run();
  if (user.role === "ADMIN" && (leader_ids !== undefined || leader_id !== undefined)) {
    const ids: number[] = Array.isArray(leader_ids) ? leader_ids.map(Number) : leader_id ? [Number(leader_id)] : [];
    const err = await applyLeaders(c, id, ids);
    if (err) return c.json({ error: err }, 400);
  }
  return c.json({ ok: true });
});

ministryRoutes.delete("/:id", requireRole("ADMIN"), async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM ministries WHERE id = ?").bind(Number(c.req.param("id"))).run();
  if ((r.meta.changes ?? 0) === 0) return c.json({ error: "Ministério não encontrado" }, 404);
  return c.json({ ok: true });
});

ministryRoutes.get("/:id/impact", requireRole("ADMIN"), async (c) => {
  const id = Number(c.req.param("id"));
  const min = await c.env.DB.prepare("SELECT id FROM ministries WHERE id = ?").bind(id).first();
  if (!min) return c.json({ error: "Ministério não encontrado" }, 404);
  const counts = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM roles WHERE ministry_id = ?").bind(id),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM schedules WHERE role_id IN (SELECT id FROM roles WHERE ministry_id = ?)").bind(id),
    c.env.DB.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM user_roles WHERE role_id IN (SELECT id FROM roles WHERE ministry_id = ?)").bind(id),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM ministry_leaders WHERE ministry_id = ?").bind(id),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM voice_groups WHERE ministry_id = ?").bind(id),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM notices WHERE ministry_id = ?").bind(id),
  ]);
  const n = (i: number) => Number((counts[i].results as any[])[0]?.n ?? 0);
  return c.json({ funcoes: n(0), escalas: n(1), membros: n(2), lideres: n(3), grupos: n(4), avisos: n(5) });
});

ministryRoutes.post("/:id/roles", async (c) => {
  const ministryId = Number(c.req.param("id"));
  if (!(await canManage(c, ministryId))) return c.json({ error: "Sem permissão para este ministério" }, 403);
  const { name } = await c.req.json().catch(() => ({}));
  if (!name) return c.json({ error: "Nome obrigatório" }, 400);
  const r = await c.env.DB.prepare("INSERT INTO roles (ministry_id, name) VALUES (?, ?)")
    .bind(ministryId, name)
    .run();
  return c.json({ id: r.meta.last_row_id, ministry_id: ministryId, name }, 201);
});

ministryRoutes.delete("/roles/:roleId", async (c) => {
  const roleId = Number(c.req.param("roleId"));
  const role = await c.env.DB.prepare("SELECT ministry_id FROM roles WHERE id = ?").bind(roleId).first<any>();
  if (!role) return c.json({ error: "Função não encontrada" }, 404);
  if (!(await canManage(c, role.ministry_id))) return c.json({ error: "Sem permissão para este ministério" }, 403);
  await c.env.DB.prepare("DELETE FROM roles WHERE id = ?").bind(roleId).run();
  return c.json({ ok: true });
});

ministryRoutes.get("/roles/:roleId/impact", async (c) => {
  const roleId = Number(c.req.param("roleId"));
  const role = await c.env.DB.prepare("SELECT ministry_id FROM roles WHERE id = ?").bind(roleId).first<any>();
  if (!role) return c.json({ error: "Função não encontrada" }, 404);
  if (!(await canManage(c, role.ministry_id))) return c.json({ error: "Sem permissão para este ministério" }, 403);
  const counts = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM schedules WHERE role_id = ?").bind(roleId),
    c.env.DB.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM user_roles WHERE role_id = ?").bind(roleId),
  ]);
  return c.json({
    escalas: Number((counts[0].results as any[])[0]?.n ?? 0),
    membros: Number((counts[1].results as any[])[0]?.n ?? 0),
  });
});

ministryRoutes.post("/:id/members", async (c) => {
  const ministryId = Number(c.req.param("id"));
  if (!(await canManage(c, ministryId))) return c.json({ error: "Sem permissão para este ministério" }, 403);
  const { user_id, role_id } = await c.req.json().catch(() => ({}));
  if (!user_id || !role_id) return c.json({ error: "user_id e role_id obrigatórios" }, 400);
  const role = await c.env.DB.prepare("SELECT ministry_id FROM roles WHERE id = ?").bind(role_id).first<any>();
  if (!role || role.ministry_id !== ministryId) return c.json({ error: "Função inválida" }, 400);
  await c.env.DB.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)")
    .bind(user_id, role_id)
    .run();
  return c.json({ ok: true }, 201);
});

ministryRoutes.delete("/:id/members/:userId/:roleId", async (c) => {
  const ministryId = Number(c.req.param("id"));
  if (!(await canManage(c, ministryId))) return c.json({ error: "Sem permissão para este ministério" }, 403);
  await c.env.DB.prepare("DELETE FROM user_roles WHERE user_id = ? AND role_id = ?")
    .bind(Number(c.req.param("userId")), Number(c.req.param("roleId")))
    .run();
  return c.json({ ok: true });
});

ministryRoutes.delete("/:id/members/:userId", async (c) => {
  const ministryId = Number(c.req.param("id"));
  if (!(await canManage(c, ministryId))) return c.json({ error: "Sem permissão para este ministério" }, 403);
  const userId = Number(c.req.param("userId"));
  await c.env.DB.prepare(
    "DELETE FROM user_roles WHERE user_id = ? AND role_id IN (SELECT id FROM roles WHERE ministry_id = ?)",
  )
    .bind(userId, ministryId)
    .run();
  return c.json({ ok: true });
});

ministryRoutes.get("/:id/members", async (c) => {
  const ministryId = Number(c.req.param("id"));
  if (!(await canManage(c, ministryId))) return c.json({ error: "Sem permissão para este ministério" }, 403);
  const links = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.avatar_url, r.id AS role_id, r.name AS role_name,
       vc.name AS classification_name, vc.color AS classification_color, vcm.classification_id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     LEFT JOIN voice_classification_members vcm ON vcm.user_id = u.id
     LEFT JOIN voice_classifications vc ON vc.id = vcm.classification_id
     WHERE r.ministry_id = ?`,
  )
    .bind(ministryId)
    .all();
  const leaders = await c.env.DB.prepare(
    "SELECT u.id FROM users u JOIN ministry_leaders ml ON ml.user_id = u.id WHERE ml.ministry_id = ?",
  )
    .bind(ministryId)
    .all();
  const leaderIds = new Set((leaders.results as any[]).map((l) => Number(l.id)));
  const map = new Map<
    number,
    {
      id: number;
      name: string;
      email: string;
      avatar_url: string | null;
      roles: { id: number; name: string }[];
      classification: { id: number; name: string; color: string } | null;
    }
  >();
  for (const row of links.results as any[]) {
    let entry = map.get(Number(row.id));
    if (!entry) {
      entry = {
        id: Number(row.id),
        name: row.name,
        email: row.email,
        avatar_url: row.avatar_url ?? null,
        roles: [],
        classification: row.classification_id
          ? { id: Number(row.classification_id), name: String(row.classification_name), color: String(row.classification_color) }
          : null,
      };
      map.set(entry.id, entry);
    }
    entry.roles.push({ id: Number(row.role_id), name: String(row.role_name) });
  }
  for (const id of leaderIds) {
    if (!map.has(id)) {
      const u = await c.env.DB.prepare(
        `SELECT u.name, u.email, u.avatar_url, vcm.classification_id, vc.name AS classification_name, vc.color AS classification_color
         FROM users u
         LEFT JOIN voice_classification_members vcm ON vcm.user_id = u.id
         LEFT JOIN voice_classifications vc ON vc.id = vcm.classification_id
         WHERE u.id = ?`,
      )
        .bind(id)
        .first<any>();
      if (u) {
        map.set(id, {
          id,
          name: u.name,
          email: u.email,
          avatar_url: u.avatar_url ?? null,
          roles: [],
          classification: u.classification_id
            ? { id: Number(u.classification_id), name: String(u.classification_name), color: String(u.classification_color) }
            : null,
        });
      }
    }
  }
  const result = [...map.values()]
    .map((m) => ({ ...m, is_leader: leaderIds.has(m.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return c.json(result);
});
