import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { requireAuth, requireRole, isLouvorLeader, type AppVariables } from "../lib/auth.js";
import { hashPassword } from "../lib/password.js";
import { formatPhone } from "../../shared/phone.js";

export const userRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

userRoutes.use("*", requireAuth);

userRoutes.get("/", requireRole("ADMIN", "LEADER"), async (c) => {
  const q = c.req.query("q");
  const status = c.req.query("status");
  const caller = c.get("user");
  if (status && caller.role !== "ADMIN") return c.json({ error: "Apenas ADMIN pode filtrar por status" }, 403);
  const base =
    "SELECT id, name, email, phone, role, max_services_per_month, avatar_url, account_status, created_at FROM users";
  const rows = status
    ? await c.env.DB.prepare(`${base} WHERE account_status = ? ORDER BY created_at`).bind(status).all()
    : q
      ? await c.env.DB.prepare(`${base} WHERE name LIKE ? OR email LIKE ? ORDER BY name`).bind(`%${q}%`, `%${q}%`).all()
      : await c.env.DB.prepare(`${base} ORDER BY name`).all();
  return c.json(rows.results);
});

userRoutes.post("/", requireRole("ADMIN", "LEADER"), async (c) => {
  const { name, email, phone, password, role, max_services_per_month } = await c.req.json().catch(() => ({}));
  if (!name || !email || !password) return c.json({ error: "Nome, email e senha obrigatórios" }, 400);
  const phoneRaw = String(phone ?? "").trim();
  if (!phoneRaw) return c.json({ error: "Telefone é obrigatório. Use o formato (11) 99999-9999." }, 400);
  let phoneFmt: string;
  try {
    phoneFmt = formatPhone(phoneRaw);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Telefone inválido" }, 400);
  }
  const user = c.get("user");
  const finalRole = user.role === "ADMIN" ? (role ?? "VOLUNTEER") : "VOLUNTEER";
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(String(email).toLowerCase().trim())
    .first();
  if (existing) return c.json({ error: "Email já cadastrado" }, 409);
  const password_hash = await hashPassword(password);
  const r = await c.env.DB.prepare(
    "INSERT INTO users (name, email, phone, password_hash, role, max_services_per_month) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(name, String(email).toLowerCase().trim(), phoneFmt, password_hash, finalRole, max_services_per_month ?? 4)
    .run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

userRoutes.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const caller = c.get("user");
  if (caller.role !== "ADMIN" && caller.role !== "LEADER" && Number(caller.sub) !== id) {
    return c.json({ error: "Sem permissão" }, 403);
  }
  const { name, email, phone, role, max_services_per_month, password, avatar_url } = await c.req.json().catch(() => ({}));
  const targetRole = role ?? undefined;
  if (caller.role !== "ADMIN" && targetRole && targetRole !== "VOLUNTEER") {
    return c.json({ error: "Apenas ADMIN pode alterar papéis" }, 403);
  }
  if (typeof avatar_url === "string" && avatar_url.length > 300_000) {
    return c.json({ error: "Imagem muito grande" }, 400);
  }
  let phoneVal: string | null = null;
  const phoneRaw = typeof phone === "string" ? phone.trim() : "";
  if (phoneRaw) {
    try {
      phoneVal = formatPhone(phoneRaw);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Telefone inválido" }, 400);
    }
  }
  await c.env.DB.prepare(
    "UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone), role = COALESCE(?, role), max_services_per_month = COALESCE(?, max_services_per_month), avatar_url = COALESCE(?, avatar_url) WHERE id = ?",
  )
    .bind(
      name ?? null,
      email ? String(email).toLowerCase().trim() : null,
      phoneVal,
      targetRole ?? null,
      max_services_per_month ?? null,
      avatar_url ?? null,
      id,
    )
    .run();
  if (password) {
    const hash = await hashPassword(password);
    await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(hash, id).run();
  }
  return c.json({ ok: true });
});

userRoutes.put("/:id/voice-classification", async (c) => {
  const caller = c.get("user");
  if (!(await isLouvorLeader(c.env.DB, caller))) return c.json({ error: "Sem permissão" }, 403);
  const userId = Number(c.req.param("id"));
  const { classification_id } = await c.req.json().catch(() => ({}));
  if (classification_id === null || classification_id === undefined) {
    await c.env.DB.prepare("DELETE FROM voice_classification_members WHERE user_id = ?").bind(userId).run();
    return c.json({ ok: true, classification_id: null });
  }
  const cls = await c.env.DB.prepare("SELECT id FROM voice_classifications WHERE id = ?")
    .bind(Number(classification_id))
    .first();
  if (!cls) return c.json({ error: "Classificação inválida" }, 400);
  await c.env.DB.prepare(
    "INSERT INTO voice_classification_members (user_id, classification_id) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET classification_id = excluded.classification_id",
  )
    .bind(userId, Number(classification_id))
    .run();
  return c.json({ ok: true, classification_id: Number(classification_id) });
});

userRoutes.post("/:id/approve", requireRole("ADMIN"), async (c) => {
  const id = Number(c.req.param("id"));
  const { action } = await c.req.json().catch(() => ({} as any));
  const status = action === "reject" ? "REJECTED" : "ACTIVE";
  const target = await c.env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(id).first<any>();
  if (!target) return c.json({ error: "Usuário não encontrado" }, 404);
  await c.env.DB.prepare("UPDATE users SET account_status = ? WHERE id = ?").bind(status, id).run();
  return c.json({ ok: true, account_status: status });
});

userRoutes.delete("/:id", requireRole("ADMIN"), async (c) => {
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});
