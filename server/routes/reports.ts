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
       SUM(CASE WHEN s.status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed,
       SUM(CASE WHEN s.status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN s.status = 'DECLINED' THEN 1 ELSE 0 END) AS declined,
       COUNT(s.id) AS total
     FROM schedules s
     JOIN events e ON e.id = s.event_id
     JOIN roles r ON r.id = s.role_id
     JOIN ministries m ON m.id = r.ministry_id
     JOIN users u ON u.id = s.user_id
     WHERE substr(e.event_date, 1, 7) = ?${ministryWhere}
     GROUP BY u.id
     ORDER BY total DESC`,
  )
    .bind(month, ...extraBinds)
    .all();
  const summary = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS total_slots,
       SUM(CASE WHEN s.user_id IS NULL THEN 1 ELSE 0 END) AS vacancies,
       SUM(CASE WHEN s.status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed,
       SUM(CASE WHEN s.status = 'DECLINED' THEN 1 ELSE 0 END) AS declined
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
