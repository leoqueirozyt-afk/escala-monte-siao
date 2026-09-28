import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { requireAuth, requireRole, leaderMinistryIds, type AppVariables } from "../lib/auth.js";

export const reportRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

reportRoutes.use("*", requireAuth, requireRole("ADMIN", "LEADER"));

reportRoutes.get("/participation", async (c) => {
  const month = c.req.query("month") ?? new Date().toISOString().slice(0, 7);
  const ids = await leaderMinistryIds(c.env.DB, c.get("user"));
  let ministryWhere = "";
  const extraBinds: number[] = [];
  if (ids !== null) {
    if (ids.length === 0) ministryWhere = " AND 1 = 0";
    else {
      ministryWhere = ` AND m.id IN (${ids.map(() => "?").join(",")})`;
      extraBinds.push(...ids);
    }
  }
  const rows = await c.env.DB.prepare(
    `SELECT u.id AS user_id, u.name, u.avatar_url,
       SUM(CASE WHEN t.status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed,
       SUM(CASE WHEN t.status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN t.status = 'DECLINED' THEN 1 ELSE 0 END) AS declined,
       COUNT(*) AS total
     FROM (
       SELECT s.user_id AS uid, s.status AS status
       FROM schedules s
       JOIN events e ON e.id = s.event_id
       JOIN roles r ON r.id = s.role_id
       JOIN ministries m ON m.id = r.ministry_id
       WHERE substr(e.event_date, 1, 7) = ? AND s.user_id IS NOT NULL${ministryWhere}
       UNION ALL
       SELECT g.user_id AS uid, g.status AS status
       FROM schedule_group_members g
       JOIN schedules s ON s.id = g.schedule_id
       JOIN events e ON e.id = s.event_id
       JOIN roles r ON r.id = s.role_id
       JOIN ministries m ON m.id = r.ministry_id
       WHERE substr(e.event_date, 1, 7) = ?${ministryWhere}
     ) t
     JOIN users u ON u.id = t.uid
     GROUP BY u.id
     ORDER BY total DESC`,
  )
    .bind(month, ...extraBinds, month, ...extraBinds)
    .all();
  const summary = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS total_slots,
       SUM(CASE WHEN s.user_id IS NULL AND s.group_id IS NULL THEN 1 ELSE 0 END) AS vacancies,
       SUM(CASE WHEN (s.group_id IS NULL AND s.status = 'CONFIRMED')
             OR (s.group_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM schedule_group_members g WHERE g.schedule_id = s.id)
                 AND NOT EXISTS (SELECT 1 FROM schedule_group_members g WHERE g.schedule_id = s.id AND g.status <> 'CONFIRMED'))
           THEN 1 ELSE 0 END) AS confirmed,
       SUM(CASE WHEN (s.group_id IS NULL AND s.status = 'DECLINED')
             OR (s.group_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM schedule_group_members g WHERE g.schedule_id = s.id)
                 AND NOT EXISTS (SELECT 1 FROM schedule_group_members g WHERE g.schedule_id = s.id AND g.status <> 'DECLINED'))
           THEN 1 ELSE 0 END) AS declined
     FROM schedules s
     JOIN events e ON e.id = s.event_id
     JOIN roles r ON r.id = s.role_id
     JOIN ministries m ON m.id = r.ministry_id
     WHERE substr(e.event_date, 1, 7) = ?${ministryWhere}`,
  )
    .bind(month, ...extraBinds)
    .first();
  return c.json({ month, summary, rows: rows.results });
});
