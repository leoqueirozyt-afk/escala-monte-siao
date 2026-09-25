import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { requireAuth, type AppVariables } from "../lib/auth.js";

export const pushRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

pushRoutes.use("*", requireAuth);

function parseVapid(env: Env): { publicKey: string; privateKey: string } | null {
  try {
    const keys = JSON.parse(env.VAPID_KEYS);
    if (typeof keys?.publicKey === "string" && typeof keys?.privateKey === "string") return keys;
    return null;
  } catch {
    return null;
  }
}

pushRoutes.get("/public-key", (c) => {
  const keys = parseVapid(c.env);
  if (!keys) return c.json({ error: "Push não configurado" }, 500);
  return c.json({ publicKey: keys.publicKey });
});

pushRoutes.get("/subscriptions", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id, endpoint, p256dh, created_at FROM push_subscriptions WHERE user_id = ? ORDER BY id",
  )
    .bind(c.get("user").sub)
    .all();
  return c.json(rows.results);
});

pushRoutes.post("/subscribe", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const p256dh = body.keys?.p256dh ?? body.p256dh;
  const auth = body.keys?.auth ?? body.auth;
  if (!endpoint.startsWith("https://")) return c.json({ error: "Endpoint inválido" }, 400);
  if (typeof p256dh !== "string" || !p256dh || typeof auth !== "string" || !auth) {
    return c.json({ error: "Chaves p256dh/auth obrigatórias" }, 400);
  }
  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  )
    .bind(user.sub, endpoint, p256dh, auth)
    .run();
  return c.json({ ok: true }, 201);
});

pushRoutes.delete("/subscribe", async (c) => {
  const user = c.get("user");
  const { endpoint } = await c.req.json().catch(() => ({}));
  if (typeof endpoint !== "string" || !endpoint) return c.json({ error: "endpoint obrigatório" }, 400);
  await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?")
    .bind(endpoint, user.sub)
    .run();
  return c.json({ ok: true });
});
