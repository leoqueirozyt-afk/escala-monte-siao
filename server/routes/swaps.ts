import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { requireAuth, requireRole, leaderMinistryIds, type AppVariables } from "../lib/auth.js";

export const swapRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const SELECT_SWAP = `
  SELECT sw.id, sw.schedule_id, sw.requester_id, sw.target_user_id, sw.status, sw.created_at,
    req.name AS requester_name, req.avatar_url AS requester_avatar, tgt.name AS target_user_name, tgt.avatar_url AS target_user_avatar,
    e.title AS event_title, e.event_date, r.name AS role_name, cur.name AS current_user_name
  FROM swap_requests sw
  JOIN schedules s ON s.id = sw.schedule_id
  JOIN events e ON e.id = s.event_id
  JOIN roles r ON r.id = s.role_id
  JOIN users req ON req.id = sw.requester_id
  LEFT JOIN users tgt ON tgt.id = sw.target_user_id
  LEFT JOIN users cur ON cur.id = s.user_id`;

swapRoutes.use("*", requireAuth);

swapRoutes.get("/", async (c) => {
  const user = c.get("user");
  const pending = c.req.query("pending");
  let sql = SELECT_SWAP;
  const binds: any[] = [];
  const wheres: string[] = [];
  if (user.role === "ADMIN") {
    if (pending === "1") wheres.push("sw.status = 'PENDING'");
  } else if (user.role === "LEADER") {
    const ids = await leaderMinistryIds(c.env.DB, user);
    if (pending === "1") wheres.push("sw.status = 'PENDING'");
    if (!ids || ids.length === 0) wheres.push("1 = 0");
    else {
      wheres.push(`r.ministry_id IN (${ids.map(() => "?").join(",")})`);
      binds.push(...ids);
    }
  } else {
    wheres.push("sw.requester_id = ?");
    binds.push(user.sub);
  }
  if (wheres.length) sql += ` WHERE ${wheres.join(" AND ")}`;
  sql += " ORDER BY sw.created_at DESC";
  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json(rows.results);
});

swapRoutes.post("/", async (c) => {
  const user = c.get("user");
  const { schedule_id, target_user_id } = await c.req.json().catch(() => ({}));
  if (!schedule_id) return c.json({ error: "schedule_id obrigatório" }, 400);
  const schedule = await c.env.DB.prepare(
    "SELECT s.*, e.event_date FROM schedules s JOIN events e ON e.id = s.event_id WHERE s.id = ? AND s.user_id = ?",
  )
    .bind(schedule_id, user.sub)
    .first<any>();
  if (!schedule) return c.json({ error: "Escala não encontrada ou não é sua" }, 404);
  if (target_user_id) {
    const hasRole = await c.env.DB.prepare("SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ?")
      .bind(target_user_id, schedule.role_id)
      .first();
    if (!hasRole) return c.json({ error: "Alvo não habilitado para esta função" }, 400);
    const date = String(schedule.event_date).slice(0, 10);
    const unavailable = await c.env.DB.prepare(
      "SELECT 1 FROM unavailabilities WHERE user_id = ? AND ? BETWEEN start_date AND end_date",
    )
      .bind(target_user_id, date)
      .first();
    if (unavailable) return c.json({ error: "Alvo indisponível na data" }, 400);
  }
  const existing = await c.env.DB.prepare(
    "SELECT id FROM swap_requests WHERE schedule_id = ? AND requester_id = ? AND status = 'PENDING'",
  )
    .bind(schedule_id, user.sub)
    .first();
  if (existing) return c.json({ error: "Já existe troca pendente para esta escala" }, 409);
  const r = await c.env.DB.prepare(
    "INSERT INTO swap_requests (schedule_id, requester_id, target_user_id, status) VALUES (?, ?, ?, 'PENDING')",
  )
    .bind(schedule_id, user.sub, target_user_id ?? null)
    .run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

swapRoutes.post("/:id/decision", requireRole("ADMIN", "LEADER"), async (c) => {
  const id = Number(c.req.param("id"));
  const { decision } = await c.req.json().catch(() => ({}));
  if (decision !== "APPROVED" && decision !== "REJECTED") return c.json({ error: "Decisão inválida" }, 400);
  const swap = await c.env.DB.prepare(
    `SELECT sw.* FROM swap_requests sw
     JOIN schedules s ON s.id = sw.schedule_id
     JOIN roles r ON r.id = s.role_id
     WHERE sw.id = ? AND sw.status = 'PENDING'`,
  )
    .bind(id)
    .first<any>();
  if (!swap) return c.json({ error: "Solicitação não encontrada" }, 404);
  const ministry = await c.env.DB.prepare(
    `SELECT r.ministry_id FROM schedules s JOIN roles r ON r.id = s.role_id WHERE s.id = ?`,
  )
    .bind(swap.schedule_id)
    .first<any>();
  const ids = await leaderMinistryIds(c.env.DB, c.get("user"));
  if (ids !== null && (!ministry || !ids.includes(Number(ministry.ministry_id)))) {
    return c.json({ error: "Fora do seu ministério" }, 403);
  }

  if (decision === "APPROVED") {
    if (swap.target_user_id) {
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE schedules SET user_id = ?, status = 'PENDING' WHERE id = ?").bind(
          swap.target_user_id,
          swap.schedule_id,
        ),
        c.env.DB.prepare("UPDATE swap_requests SET status = 'APPROVED' WHERE id = ?").bind(id),
      ]);
    } else {
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE schedules SET user_id = NULL, status = 'PENDING', notes = 'Vaga liberada por troca' WHERE id = ?").bind(
          swap.schedule_id,
        ),
        c.env.DB.prepare("UPDATE swap_requests SET status = 'APPROVED' WHERE id = ?").bind(id),
      ]);
    }
  } else {
    await c.env.DB.prepare("UPDATE swap_requests SET status = 'REJECTED' WHERE id = ?").bind(id).run();
  }
  return c.json({ ok: true });
});
