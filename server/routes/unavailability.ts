import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { requireAuth, type AppVariables } from "../lib/auth.js";

export const unavailabilityRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

unavailabilityRoutes.use("*", requireAuth);

unavailabilityRoutes.get("/", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare(
    "SELECT * FROM unavailabilities WHERE user_id = ? ORDER BY start_date DESC",
  )
    .bind(user.sub)
    .all();
  return c.json(rows.results);
});

unavailabilityRoutes.post("/", async (c) => {
  const user = c.get("user");
  const { start_date, end_date, reason } = await c.req.json().catch(() => ({}));
  if (!start_date || !end_date) return c.json({ error: "Datas obrigatórias" }, 400);
  if (end_date < start_date) return c.json({ error: "Data final antes da inicial" }, 400);
  const r = await c.env.DB.prepare(
    "INSERT INTO unavailabilities (user_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)",
  )
    .bind(user.sub, start_date, end_date, reason ?? null)
    .run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

unavailabilityRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  await c.env.DB.prepare("DELETE FROM unavailabilities WHERE id = ? AND user_id = ?")
    .bind(Number(c.req.param("id")), user.sub)
    .run();
  return c.json({ ok: true });
});
