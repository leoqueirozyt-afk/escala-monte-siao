# Aba Avisos (Parte 1 de 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba "Avisos" onde líderes/admins publicam avisos do mês (geral ou por ministério) e membros leem, com badge de não-lido no ícone do menu.

**Architecture:** Migration `notices` + `users.notices_seen_at`; rotas novas `/api/notices` (lista visível + limpeza lazy de meses anteriores, unread-count, seen, CRUD com permissão autor/admin); página `AvisosPage` + item de menu com badge no `AppShell` que zera ao entrar na aba (evento `notices-updated`).

**Tech Stack:** Hono + D1, React + lucide-react, smokes `.mjs` em `%TEMP%\opencode\`.

**Contexto:** Spec `docs/superpowers/specs/2026-09-26-aba-avisos-design.md`. Verificação: `npm run typecheck`, `npm run build`, detector `node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public` (exit 0), smokes com `SMOKE_BASE` (local `http://localhost:5173/api`, prod `https://escala-monte-siao.leoqueirozyt.workers.dev/api`), login `admin@montesiao.org` / `carlos@montesiao.org` senha `senha123`. Smoke **autocontido** (usuários/ministério temporários; assertions por id, nunca apaga dados reais). Migration: `npm run db:apply` (local) e `npm run db:apply:remote` (remota) — deploy NÃO aplica migrations.

---

### Task 1: Migration + backend `/api/notices` + smoke TDD

**Files:**
- Create: `migrations/0007_notices.sql`
- Create: `server/routes/notices.ts`
- Modify: `server/index.ts` (import + `app.route`)
- Create: `C:\Users\Raptor\AppData\Local\Temp\opencode\smoke-avisos.mjs`

- [ ] **Step 1: Migration** — criar `migrations/0007_notices.sql`:

```sql
CREATE TABLE notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ministry_id INTEGER REFERENCES ministries(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  month TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notices_month ON notices(month);

ALTER TABLE users ADD COLUMN notices_seen_at TEXT;
```

- [ ] **Step 2: Aplicar migration local e remota**

```
npm run db:apply
npm run db:apply:remote
```
Expected: ambas aplicam 0007 (se 7403/erro transitório no remote, esperar 5s e repetir).

- [ ] **Step 3: Escrever o smoke falhando (TDD)** — criar `smoke-avisos.mjs`:

```js
const base = process.env.SMOKE_BASE || "http://localhost:5173/api";

let passed = 0, failed = 0;
function check(name, ok, extra = "") {
  if (ok) { passed++; console.log(`PASS ${name}`); }
  else { failed++; console.log(`FAIL ${name} ${extra}`); }
}

async function login(email) {
  const r = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "senha123" }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (r.headers.get("set-cookie") || "").split(";")[0];
}

async function req(path, cookie, opts = {}) {
  return fetch(`${base}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers || {}) },
  });
}

const stamp = Date.now();
const now = new Date();
const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const admin = await login("admin@montesiao.org");
const carlos = await login("carlos@montesiao.org");

let res = await req("/users", admin, {
  method: "POST",
  body: JSON.stringify({ name: "Smoke Lider Avisos", email: `smoke-avis-leader-${stamp}@montesiao.org`, password: "senha123", role: "LEADER" }),
});
const tempLeader = await res.json();
res = await req("/users", admin, { method: "POST", body: JSON.stringify({ name: "Smoke Vol Avisos", email: `smoke-avis-vol-${stamp}@montesiao.org`, password: "senha123" }) });
const tempVol = await res.json();
res = await req("/users", admin, { method: "POST", body: JSON.stringify({ name: "Smoke Outsider", email: `smoke-avis-out-${stamp}@montesiao.org`, password: "senha123" }) });
const outsider = await res.json();
check("criar usuarios temporarios", !!tempLeader.id && !!tempVol.id && !!outsider.id, JSON.stringify([tempLeader, tempVol, outsider]));

const leaderCookie = await login(`smoke-avis-leader-${stamp}@montesiao.org`);
const volCookie = await login(`smoke-avis-vol-${stamp}@montesiao.org`);
const outCookie = await login(`smoke-avis-out-${stamp}@montesiao.org`);

res = await req("/ministries", admin, {
  method: "POST",
  body: JSON.stringify({ name: `Smoke Avisos ${stamp}`, description: "autoteste", leader_ids: [tempLeader.id] }),
});
const m = await res.json();
check("criar ministerio de teste", res.status === 201 && !!m.id, JSON.stringify(m));
res = await req(`/ministries/${m.id}/roles`, admin, { method: "POST", body: JSON.stringify({ name: "Vocal" }) });
const role = await res.json();
res = await req(`/ministries/${m.id}/members`, admin, { method: "POST", body: JSON.stringify({ user_id: tempVol.id, role_id: role.id }) });
check("vincular vol ao ministerio", res.status === 201, `got ${res.status}`);

// permissao de criacao
res = await req("/notices", volCookie, { method: "POST", body: JSON.stringify({ title: "x", body: "y", month }) });
check("voluntario cria aviso geral 403", res.status === 403, `got ${res.status}`);
res = await req("/notices", volCookie, { method: "POST", body: JSON.stringify({ title: "x", body: "y", ministry_id: m.id, month }) });
check("voluntario cria aviso do ministério 403", res.status === 403, `got ${res.status}`);
res = await req(`/notices`, volCookie);
check("GET sem month 400", res.status === 400, `got ${res.status}`);

// reseta estado de lidos
res = await req("/notices/seen", volCookie, { method: "POST" });
check("POST seen vol 200", res.status === 200, `got ${res.status}`);
await req("/notices/seen", outCookie, { method: "POST" });
await req("/notices/seen", leaderCookie, { method: "POST" });

// criacoes
res = await req("/notices", carlos, { method: "POST", body: JSON.stringify({ title: "Aviso Geral Smoke", body: "texto geral", month }) });
const globalN = await res.json();
check("lider cria aviso geral 201", res.status === 201 && !!globalN.id, JSON.stringify(globalN));
res = await req("/notices", leaderCookie, { method: "POST", body: JSON.stringify({ title: "Aviso Ministério Smoke", body: "texto ministério", ministry_id: m.id, month }) });
const minN = await res.json();
check("lider cria aviso do ministério 201", res.status === 201 && !!minN.id, JSON.stringify(minN));

// listagem + escopo
res = await req(`/notices?month=${month}`, volCookie);
let list = await res.json();
check("vol ve os 2 avisos", Array.isArray(list) && list.some((n) => n.id === globalN.id) && list.some((n) => n.id === minN.id), JSON.stringify(list.map((n) => n.id)));
const g = list.find((n) => n.id === globalN.id);
check("aviso geral com autor e escopo", g?.ministry_id == null && typeof g?.author_name === "string", JSON.stringify(g ?? null));
res = await req(`/notices?month=${month}`, outCookie);
list = await res.json();
check("outsider ve so o geral", list.some((n) => n.id === globalN.id) && !list.some((n) => n.id === minN.id), JSON.stringify(list.map((n) => n.id)));

// unread-count
res = await req(`/notices/unread-count?month=${month}`, volCookie);
let cnt = await res.json();
check("vol count 2", res.status === 200 && cnt.count === 2, JSON.stringify(cnt));
res = await req(`/notices/unread-count?month=${month}`, outCookie);
cnt = await res.json();
check("outsider count 1", cnt.count === 1, JSON.stringify(cnt));
res = await req(`/notices/unread-count?month=${month}`, leaderCookie);
cnt = await res.json();
check("lider count 2", cnt.count === 2, JSON.stringify(cnt));

// zera ao abrir aba
res = await req("/notices/seen", volCookie, { method: "POST" });
res = await req(`/notices/unread-count?month=${month}`, volCookie);
cnt = await res.json();
check("vol count 0 apos seen", cnt.count === 0, JSON.stringify(cnt));

// edicao: autor ou admin
res = await req(`/notices/${globalN.id}`, volCookie, { method: "PUT", body: JSON.stringify({ title: "hack" }) });
check("vol edita aviso de outro 403", res.status === 403, `got ${res.status}`);
res = await req(`/notices/${globalN.id}`, outCookie, { method: "PUT", body: JSON.stringify({ title: "hack" }) });
check("outsider edita aviso 403", res.status === 403, `got ${res.status}`);
res = await req(`/notices/${globalN.id}`, carlos, { method: "PUT", body: JSON.stringify({ title: "Aviso Geral Editado" }) });
check("autor edita 200", res.status === 200, `got ${res.status}`);
res = await req(`/notices?month=${month}`, volCookie);
list = await res.json();
check("edicao refletida", list.find((n) => n.id === globalN.id)?.title === "Aviso Geral Editado", JSON.stringify(list.find((n) => n.id === globalN.id)));
res = await req(`/notices/${globalN.id}`, admin, { method: "PUT", body: JSON.stringify({ title: "Aviso Geral Admin" }) });
check("admin edita 200", res.status === 200, `got ${res.status}`);

// exclusao: autor ou admin
res = await req(`/notices/${minN.id}`, volCookie, { method: "DELETE" });
check("vol exclui aviso 403", res.status === 403, `got ${res.status}`);
res = await req(`/notices/${globalN.id}`, admin, { method: "DELETE" });
check("admin exclui 200", res.status === 200, `got ${res.status}`);
res = await req(`/notices/${minN.id}`, leaderCookie, { method: "DELETE" });
check("autor exclui aviso do ministério 200", res.status === 200, `got ${res.status}`);
res = await req(`/notices?month=${month}`, volCookie);
list = await res.json();
check("avisos removidos da lista", !list.some((n) => n.id === globalN.id || n.id === minN.id), JSON.stringify(list.map((n) => n.id)));

// limpeza de mes antigo
res = await req("/notices", admin, { method: "POST", body: JSON.stringify({ title: "Velho", body: "x", month: "2020-01" }) });
const oldN = await res.json();
check("cria aviso antigo 201", res.status === 201 && !!oldN.id, JSON.stringify(oldN));
res = await req(`/notices?month=${month}`, admin); // dispara limpeza (month < atual)
check("GET do mes atual ok", res.status === 200, `got ${res.status}`);
res = await req(`/notices?month=2020-01`, admin);
list = await res.json();
check("aviso antigo apagado", Array.isArray(list) && !list.some((n) => n.id === oldN.id), JSON.stringify(list));

// limpeza
await req(`/notices/${oldN.id}`, admin, { method: "DELETE" });
await req(`/ministries/${m.id}`, admin, { method: "DELETE" });
await req(`/users/${tempVol.id}`, admin, { method: "DELETE" });
await req(`/users/${tempLeader.id}`, admin, { method: "DELETE" });
await req(`/users/${outsider.id}`, admin, { method: "DELETE" });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 4: Rodar e ver falhar**

```
node "$env:TEMP\opencode\smoke-avisos.mjs"
```
Expected: falhas logo de início (rota 404). Se o dev server cair: `Start-Process cmd -ArgumentList "/c npm run dev > %TEMP%\opencode\vite-dev.log 2>&1"` e retestar.

- [ ] **Step 5: Criar `server/routes/notices.ts`**

```ts
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
  await c.env.DB.prepare("UPDATE users SET notices_seen_at = datetime('now') WHERE id = ?").bind(user.sub).run();
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
    "INSERT INTO notices (ministry_id, title, body, month, created_by) VALUES (?, ?, ?, ?, ?)",
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
```

- [ ] **Step 6: Registrar rota em `server/index.ts`** — após o import de `voiceRoutes`:

```ts
import { noticeRoutes } from "./routes/notices.js";
```
e após `app.route("/api/voice", voiceRoutes);`:

```ts
app.route("/api/notices", noticeRoutes);
```

- [ ] **Step 7: Typecheck + smoke local**

```
npm run typecheck
node "$env:TEMP\opencode\smoke-avisos.mjs"
```
Expected: typecheck sem erros; smoke `0 failed` (≈30 checks). Reiniciar o dev server se o smoke continuar 404.

- [ ] **Step 8: Commit**

```bash
git add migrations/0007_notices.sql server/routes/notices.ts server/index.ts
git commit -m "feat: backend de avisos (migration, rotas, unread-count e seen)"
```

---

### Task 2: Tipos + rota + página AvisosPage

**Files:**
- Modify: `shared/types.ts`
- Create: `src/lib/notices.ts`
- Modify: `src/App.tsx`
- Create: `src/pages/AvisosPage.tsx`

- [ ] **Step 1: Tipo `Notice`** — adicionar em `shared/types.ts` (após `MinistryMember`):

```ts
export interface Notice {
  id: number;
  ministry_id: number | null;
  title: string;
  body: string;
  month: string;
  created_by: number;
  created_at: string;
  author_name: string;
  ministry_name: string | null;
}
```

- [ ] **Step 2: Evento de atualização** — criar `src/lib/notices.ts`:

```ts
export const NOTICES_EVENT = "notices-updated";

export function notifyNoticesChanged() {
  window.dispatchEvent(new Event(NOTICES_EVENT));
}
```

- [ ] **Step 3: Rota em `src/App.tsx`** — adicionar import:

```tsx
import { AvisosPage } from "./pages/AvisosPage";
```
e rota (após a rota `/perfil`, sem guard — todos os logados):

```tsx
<Route path="/avisos" element={<AvisosPage />} />
```

- [ ] **Step 4: Criar `src/pages/AvisosPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Globe2, Megaphone, Pencil, Plus, Trash2, Users } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAsyncData } from "../lib/use-async-data";
import { formatDateTime, monthKey } from "../lib/utils";
import { notifyNoticesChanged } from "../lib/notices";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, Field, Textarea, Select } from "../components/ui/input";
import { Dialog } from "../components/ui/dialog";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Badge } from "../components/ui/badge";
import { toast } from "../components/ui/toast";
import { ErrorState, EmptyState, ListSkeleton } from "../components/ui/load-state";
import type { Ministry, Notice } from "../../shared/types";

export function AvisosPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const canWrite = isAdmin || user?.role === "LEADER";
  const month = monthKey();

  const [tick, setTick] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [form, setForm] = useState({ title: "", body: "", scope: "" });
  const [deleteTarget, setDeleteTarget] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const listQ = useAsyncData<Notice[]>(() => api.get<Notice[]>(`/notices?month=${month}`), [tick]);

  useEffect(() => {
    let alive = true;
    api
      .post("/notices/seen")
      .then(() => {
        if (alive) notifyNoticesChanged();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const reload = () => setTick((t) => t + 1);

  const openForm = async (n?: Notice) => {
    try {
      const list = await api.get<Ministry[]>(isAdmin ? "/ministries?scope=all" : "/ministries");
      setMinistries(list);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
      return;
    }
    if (n) {
      setEditing(n);
      setForm({ title: n.title, body: n.body, scope: n.ministry_id != null ? String(n.ministry_id) : "" });
    } else {
      setEditing(null);
      setForm({ title: "", body: "", scope: "" });
    }
    setFormOpen(true);
  };

  const save = async () => {
    const title = form.title.trim();
    const body = form.body.trim();
    if (!title || !body) {
      toast("Título e texto obrigatórios", "error");
      return;
    }
    const ministry_id = form.scope ? Number(form.scope) : null;
    setBusy(true);
    try {
      if (editing) {
        await api.put(`/notices/${editing.id}`, { title, body, ministry_id, month });
        toast("Aviso atualizado!");
      } else {
        await api.post("/notices", { title, body, ministry_id, month });
        toast("Aviso publicado!");
      }
      setFormOpen(false);
      notifyNoticesChanged();
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.delete(`/notices/${deleteTarget.id}`);
      toast("Aviso excluído.");
      setDeleteTarget(null);
      notifyNoticesChanged();
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    } finally {
      setBusy(false);
    }
  };

  const canEdit = (n: Notice) => isAdmin || n.created_by === user?.id;
  const iconBtn =
    "flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Megaphone size={20} aria-hidden="true" /> Avisos
          </h1>
          <p className="text-sm text-muted-foreground">Avisos do mês</p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => openForm()}>
            <Plus size={16} /> Novo aviso
          </Button>
        )}
      </div>

      {listQ.status === "error" && listQ.error ? (
        <ErrorState message={listQ.error} onRetry={listQ.reload} />
      ) : listQ.status === "loading" ? (
        <ListSkeleton rows={3} />
      ) : (listQ.data ?? []).length === 0 ? (
        <EmptyState title="Nenhum aviso este mês" hint="Quando um líder publicar um aviso, ele aparece aqui." />
      ) : (
        <div className="space-y-3">
          {(listQ.data ?? []).map((n) => (
            <Card key={n.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
                      {n.title}
                      <Badge
                        variant={n.ministry_id != null ? "default" : "outline"}
                        className="gap-1 text-[10px]"
                      >
                        {n.ministry_id != null ? <Users size={10} aria-hidden="true" /> : <Globe2 size={10} aria-hidden="true" />}
                        {n.ministry_id != null ? n.ministry_name : "Geral"}
                      </Badge>
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>
                    <p className="text-xs text-muted-foreground">
                      {n.author_name} · {formatDateTime(n.created_at)}
                    </p>
                  </div>
                  {canEdit(n) && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => openForm(n)}
                        aria-label={`Editar aviso ${n.title}`}
                        className={iconBtn}
                      >
                        <Pencil size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(n)}
                        aria-label={`Excluir aviso ${n.title}`}
                        className={`${iconBtn} hover:text-destructive`}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={formOpen}
        onClose={() => {
          if (!busy) setFormOpen(false);
        }}
        title={editing ? "Editar aviso" : "Novo aviso"}
      >
        <div className="space-y-4">
          <Field label="Título">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ensaio do sábado"
            />
          </Field>
          <Field label="Texto">
            <Textarea
              rows={5}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Escreva o aviso..."
            />
          </Field>
          <Field label="Escopo">
            <Select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
              <option value="">Geral (igreja inteira)</option>
              {ministries.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button className="w-full" onClick={save} disabled={busy}>
            {editing ? "Salvar" : "Publicar"}
          </Button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir aviso"
        description={
          deleteTarget ? `Excluir o aviso "${deleteTarget.title}"? Esta ação não pode ser desfeita.` : undefined
        }
        confirmLabel="Excluir"
        destructive
        busy={busy}
        onConfirm={remove}
        onClose={() => {
          if (!busy) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Verificar + commit**

```
npm run typecheck; npm run build; node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public
```
Expected: tudo limpo, detector exit 0.

```bash
git add shared/types.ts src/lib/notices.ts src/App.tsx src/pages/AvisosPage.tsx
git commit -m "feat: pagina Avisos com lista, criacao, edicao e exclusao"
```

---

### Task 3: Menu "Avisos" + badge de não-lido no AppShell

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Imports e estado** — ajustar as linhas de import existentes (não duplicar):

- `react-router-dom`: incluir `useLocation` → `import { NavLink, useLocation, useNavigate } from "react-router-dom";`
- lucide-react: acrescentar `Megaphone` à lista existente
- react: trocar `import { useState } from "react";` por `import { useEffect, useState } from "react";`
- `../../lib/utils`: trocar `import { cn, roleLabel } from "../../lib/utils";` por `import { cn, monthKey, roleLabel } from "../../lib/utils";`
- adicionar: `import { api } from "../../lib/api";` e `import { NOTICES_EVENT } from "../../lib/notices";`

- [ ] **Step 2: Estado + fetch do badge** — dentro de `AppShell`, após `const [menuOpen, setMenuOpen] = useState(false);`:

```tsx
const location = useLocation();
const [unreadNotices, setUnreadNotices] = useState(0);

useEffect(() => {
  let alive = true;
  const load = () => {
    api
      .get<{ count: number }>(`/notices/unread-count?month=${monthKey()}`)
      .then((d) => {
        if (alive) setUnreadNotices(d.count);
      })
      .catch(() => {});
  };
  load();
  window.addEventListener(NOTICES_EVENT, load);
  return () => {
    alive = false;
    window.removeEventListener(NOTICES_EVENT, load);
  };
}, [location.pathname]);
```

- [ ] **Step 3: Item "Avisos" nos dois menus** — declarar tipo e item; nos arrays `desktopNav` e `bottomNav` incluir `...avisosNav`:

```tsx
type NavItem = { to: string; label: string; icon: typeof Home; badge?: number };

const avisosNav: NavItem[] = [{ to: "/avisos", label: "Avisos", icon: Megaphone, badge: unreadNotices }];
```

`desktopNav` (líder) — inserir `...avisosNav` logo após `{ to: "/calendario", ... }`:

```tsx
const desktopNav: NavItem[] = leader
  ? [
      { to: "/", label: "Início", icon: Home },
      { to: "/agenda", label: "Minha Agenda", icon: ClipboardList },
      { to: "/calendario", label: "Indisponibilidade", icon: CalendarOff },
      ...avisosNav,
      ...leaderNav,
      ...gruposNav,
      ...playlistNav,
      { to: "/perfil", label: "Perfil", icon: UserIcon },
    ]
  : [...volunteerNav.slice(0, 3), ...avisosNav, ...gruposNav, ...playlistNav, volunteerNav[3]];
```

`bottomNav` — inserir `...avisosNav` na mesma posição (após o 3º item):

```tsx
const bottomNav: NavItem[] = leader
  ? [
      { to: "/", label: "Início", icon: Home },
      { to: "/agenda", label: "Agenda", icon: ClipboardList },
      { to: "/escala", label: "Escala", icon: CalendarDays },
      ...avisosNav,
      ...gruposNav,
      ...playlistNav,
      { to: "/perfil", label: "Perfil", icon: UserIcon },
    ]
  : [...volunteerNav.slice(0, 3), ...avisosNav, ...gruposNav, ...playlistNav, volunteerNav[3]];
```

- [ ] **Step 4: Render do badge** — inserir o MESMO bloco após `{item.label}` nos Dois NavLinks que usam `desktopNav` (sidebar e grid do menu mobile — ambos são linhas `flex items-center`, o `ml-auto` empurra o badge para a direita). Não mexer nos tamanhos de ícone já existentes (18 na sidebar, 16 no grid):

```tsx
{item.badge != null && item.badge > 0 && (
  <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
    {item.badge > 9 ? "9+" : item.badge}
  </span>
)}
```

No NavLink da bottom-nav, trocar o ícone por versão com badge relativo:

```tsx
<span className="relative inline-flex">
  <item.icon size={20} />
  {item.badge != null && item.badge > 0 && (
    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
      {item.badge > 9 ? "9+" : item.badge}
    </span>
  )}
</span>
{item.label}
```

- [ ] **Step 5: Verificar + commit**

```
npm run typecheck; npm run build; node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public
```
Expected: limpo, exit 0.

```bash
git add src/components/layout/AppShell.tsx
git commit -m "feat: aba Avisos no menu com badge de nao-lido"
```

---

### Task 4: Verificação final + push/deploy

- [ ] **Step 1: Smoke local + regressões**

```
node "$env:TEMP\opencode\smoke-avisos.mjs"
node "$env:TEMP\opencode\smoke-min-leaders.mjs"
node "$env:TEMP\opencode\smoke-leaders.mjs"
node "$env:TEMP\opencode\smoke-playlists.mjs"
node "$env:TEMP\opencode\smoke-remocoes-avatar.mjs"
node "$env:TEMP\opencode\smoke-grupos-voz.mjs"
node "$env:TEMP\opencode\smoke-excluir-funcoes.mjs"
```
Expected: todos `0 failed`.

- [ ] **Step 2: Push + deploy**

```bash
git push origin main
```
Watch: `$runId = (gh run list --limit 1 --json databaseId | ConvertFrom-Json)[0].databaseId; gh run watch $runId --exit-status`

- [ ] **Step 3: Smoke de produção (migration já aplicada na Task 1)**

```
$env:SMOKE_BASE = "https://escala-monte-siao.leoqueirozyt.workers.dev/api"
node "$env:TEMP\opencode\smoke-avisos.mjs"
```
Expected: `0 failed`. Repetir as 6 regressões com `SMOKE_BASE` de produção.

- [ ] **Step 4: Resumo final** — finishing-a-development-branch (sem branch: tudo na main, já em produção → resumo em português + teste manual: publicar aviso como líder, ver badge no menu como membro, abrir aba e badge zerar).
