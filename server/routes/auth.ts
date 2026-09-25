import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { requireAuth, type AppVariables } from "../lib/auth.js";
import { signJwt } from "../lib/jwt.js";
import { hashPassword, verifyPassword } from "../lib/password.js";

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function setToken(c: any, token: string) {
  c.header(
    "Set-Cookie",
    `token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}; ${c.req.url.startsWith("https") ? "Secure; " : ""}`,
    { append: true },
  );
}

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const identifier = String(body.email ?? "").trim();
  const password = String(body.password ?? "").trim();
  if (!identifier || !password) return c.json({ error: "E-mail (ou telefone) e senha obrigatórios" }, 400);
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ? OR phone = ?")
    .bind(identifier.toLowerCase(), identifier)
    .first<any>();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: "Credenciais inválidas — confira email e senha (demo: admin@montesiao.org / senha123)" }, 401);
  }
  if (user.account_status === "PENDING_LEADER") {
    return c.json({ error: "Conta de líder aguardando aprovação do ADMIN. Tente novamente após a aprovação." }, 403);
  }
  if (user.account_status === "REJECTED") {
    return c.json({ error: "Cadastro de líder rejeitado pelo ADMIN." }, 403);
  }
  const token = await signJwt({ sub: user.id, role: user.role, name: user.name }, c.env.JWT_SECRET);
  setToken(c, token);
  const { password_hash, ...safe } = user;
  return c.json({ user: safe, token });
});

authRoutes.get("/signup-options", async (c) => {
  const ministries = await c.env.DB.prepare("SELECT id, name, description FROM ministries ORDER BY name").all();
  const roles = await c.env.DB.prepare("SELECT id, ministry_id, name FROM roles ORDER BY name").all();
  return c.json(
    (ministries.results as any[]).map((m) => ({
      ...m,
      roles: (roles.results as any[]).filter((r) => r.ministry_id === m.id),
    })),
  );
});

authRoutes.post("/register", async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const phone = body.phone;
  const accountType = body.account_type === "leader" ? "leader" : "member";
  const ministryId = Number(body.ministry_id) || null;
  const roleId = Number(body.role_id) || null;
  if (!name || !email || !password) return c.json({ error: "Nome, email e senha obrigatórios" }, 400);
  if (password.trim().length < 6) return c.json({ error: "Senha deve ter ao menos 6 caracteres" }, 400);
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();
  if (existing) return c.json({ error: "Email já cadastrado — faça login" }, 409);
  const password_hash = await hashPassword(password.trim());

  if (accountType === "leader") {
    const r = await c.env.DB.prepare(
      "INSERT INTO users (name, email, phone, password_hash, role, account_status) VALUES (?, ?, ?, ?, 'LEADER', 'PENDING_LEADER')",
    )
      .bind(name, email, phone ?? null, password_hash)
      .run();
    return c.json({ pending_approval: true, user: { id: r.meta.last_row_id, name, email, role: "LEADER" } }, 201);
  }

  if (!ministryId || !roleId) return c.json({ error: "Escolha o ministério e a função" }, 400);
  const role = await c.env.DB.prepare("SELECT id, ministry_id FROM roles WHERE id = ?")
    .bind(roleId)
    .first<any>();
  if (!role || Number(role.ministry_id) !== ministryId) {
    return c.json({ error: "Função não pertence ao ministério escolhido" }, 400);
  }
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'VOLUNTEER')",
    ).bind(name, email, phone ?? null, password_hash),
    c.env.DB.prepare("INSERT INTO user_roles (user_id, role_id) VALUES (last_insert_rowid(), ?)").bind(roleId),
  ]);
  const id = results[0].meta.last_row_id;
  const token = await signJwt({ sub: id, role: "VOLUNTEER", name }, c.env.JWT_SECRET);
  setToken(c, token);
  return c.json({ user: { id, name, email, role: "VOLUNTEER" }, token }, 201);
});

authRoutes.get("/me", requireAuth, async (c) => {
  const payload = c.get("user");
  const user = await c.env.DB.prepare(
    "SELECT id, name, email, phone, role, max_services_per_month, avatar_url, created_at FROM users WHERE id = ?",
  )
    .bind(payload.sub)
    .first();
  if (!user) return c.json({ error: "Usuário não encontrado" }, 404);
  const ministries =
    payload.role === "ADMIN"
      ? (await c.env.DB.prepare("SELECT id, name, description FROM ministries ORDER BY name").all())
      : await c.env.DB.prepare(
          `SELECT m.id, m.name, m.description FROM ministries m
           JOIN roles r ON r.ministry_id = m.id
           JOIN user_roles ur ON ur.role_id = r.id
           WHERE ur.user_id = ?
           UNION
           SELECT m.id, m.name, m.description FROM ministries m
           JOIN ministry_leaders ml ON ml.ministry_id = m.id
           WHERE ml.user_id = ?
           ORDER BY name`,
        )
            .bind(payload.sub, payload.sub)
            .all();
  return c.json({ user, ministries: ministries.results });
});

authRoutes.post("/logout", (c) => {
  c.header("Set-Cookie", "token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0", { append: true });
  return c.json({ ok: true });
});
