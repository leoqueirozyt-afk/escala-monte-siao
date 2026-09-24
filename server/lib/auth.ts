import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { Env } from "./env.js";
import { verifyJwt, type JwtPayload } from "./jwt.js";

export type AppVariables = { user: JwtPayload };

export function getCookie(headers: Headers, name: string): string | null {
  const raw = headers.get("Cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export const requireAuth = createMiddleware<{ Bindings: Env; Variables: AppVariables }>(async (c, next) => {
  const token = getCookie(c.req.raw.headers, "token") ?? c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Não autenticado" }, 401);
  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "Sessão expirada" }, 401);
  c.set("user", payload);
  await next();
});

export function requireRole(...roles: string[]) {
  return createMiddleware<{ Bindings: Env; Variables: AppVariables }>(async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Não autenticado" }, 401);
    if (!roles.includes(user.role)) return c.json({ error: "Sem permissão" }, 403);
    await next();
  });
}

export function isLeader(user: JwtPayload): boolean {
  return user.role === "ADMIN" || user.role === "LEADER";
}

export async function leaderMinistryIds(db: D1Database, user: JwtPayload): Promise<number[] | null> {
  if (user.role === "ADMIN") return null;
  if (user.role !== "LEADER") return [];
  const rows = await db.prepare("SELECT id FROM ministries WHERE leader_id = ?").bind(user.sub).all();
  return rows.results.map((r: any) => Number(r.id));
}

export function jsonError(c: Context, message: string, status: 400 | 403 | 404 | 409) {
  return c.json({ error: message }, status);
}
