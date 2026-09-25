# Notificações Push (Parte 2 de 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web Push (PWA) para 4 eventos — aviso novo, escalado em vaga, pedido de troca recebido, resultado de troca — com ativação no Perfil e deep link ao clicar.

**Architecture:** Lib `@mmmike/web-push` (RFC 8291/8292, WebCrypto+fetch, zero deps). Secret único `VAPID_KEYS` (JSON `{publicKey, privateKey}`); tabela `push_subscriptions` (D1); módulo `server/lib/push.ts` com `sendPushBatch` (gone → prune), `schedulePush` (`executionCtx.waitUntil`); gatilhos pós-mutação em `notices`/`schedules`/`swaps`; card "Notificações" no Perfil; handlers `push`/`notificationclick` no `sw.js`.

**Tech Stack:** Hono + D1, React 19, `@mmmike/web-push`, smokes `.mjs` em `%TEMP%\opencode\`.

**Contexto:** Spec `docs/superpowers/specs/2026-09-26-push-notifications-design.md` (amendada: secret `VAPID_KEYS` JSON; rota real de decisão = `POST /swaps/:id/decision`). Verificação: `npm run typecheck`, `npm run build`, detector `node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public` (exit 0), smokes com `SMOKE_BASE` (local `http://localhost:5173/api`, prod `https://escala-monte-siao.leoqueirozyt.workers.dev/api`), login `admin@montesiao.org` / `carlos@montesiao.org` senha `senha123`. Smoke **autocontido**. Migration: `npm run db:apply` + `npm run db:apply:remote`. **Atenção:** mudanças em `server/` exigem restart do dev server (matar PID da porta 5173, `Start-Process cmd -ArgumentList "/c npm run dev > %TEMP%\opencode\vite-dev.log 2>&1"`, esperar `/api/health` 200).

---

### Task 1: Dependência + chaves VAPID + migration + rotas `/api/push` + smoke TDD

**Files:**
- Modify: `package.json` (via `npm install`)
- Modify: `.dev.vars` (não versionado — só local)
- Create: `migrations/0008_push_subscriptions.sql`
- Modify: `server/lib/env.ts`
- Create: `server/routes/push.ts`
- Modify: `server/index.ts`
- Create: `C:\Users\Raptor\AppData\Local\Temp\opencode\smoke-push.mjs`

- [ ] **Step 1: Instalar dependência**

```
npm install @mmmike/web-push
```
Expected: instalada (zero dependências transitivas).

- [ ] **Step 2: Gerar chaves VAPID e salvar no `.dev.vars` local**

```powershell
node --input-type=module -e "import { generateVapidKeys } from '@mmmike/web-push/vapid'; import { writeFileSync } from 'node:fs'; const k = await generateVapidKeys(); writeFileSync(process.env.TEMP + '/opencode/vapid.json', JSON.stringify({ publicKey: k.publicKey, privateKey: k.privateKey }));"
Get-Content "$env:TEMP\opencode\vapid.json" -Raw | ForEach-Object { Add-Content -Path .dev.vars -Value "VAPID_KEYS=$($_.Trim())" }
Get-Content .dev.vars | ForEach-Object { $_ -replace '=.*', '=***' }
```
Expected: lista mostra `JWT_SECRET=***` e `VAPID_KEYS=***`. **`writeFileSync` de propósito: o redirecionador `>` do PowerShell 5.1 grava UTF-16 e quebraria `wrangler secret put VAPID_KEYS < vapid.json` no Task 5.** (Guardar `vapid.json` — a MESMA chave vai para produção.)

- [ ] **Step 3: Migration `0008_push_subscriptions.sql`**

```sql
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
```

- [ ] **Step 4: Aplicar migration local e remota**

```
npm run db:apply
npm run db:apply:remote
```
Expected: ambas aplicam 0008 (retry em erro transitório 7403).

- [ ] **Step 5: `VAPID_KEYS` no `Env`** — em `server/lib/env.ts`:

```ts
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  VAPID_KEYS: string;
}
```

- [ ] **Step 6: Smoke TDD — criar `smoke-push.mjs` falhando (rota 404)**

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
const admin = await login("admin@montesiao.org");

let res = await req("/users", admin, {
  method: "POST",
  body: JSON.stringify({ name: "Smoke Push A", email: `smoke-push-a-${stamp}@montesiao.org`, password: "senha123" }),
});
const userA = await res.json();
res = await req("/users", admin, {
  method: "POST",
  body: JSON.stringify({ name: "Smoke Push B", email: `smoke-push-b-${stamp}@montesiao.org`, password: "senha123" }),
});
const userB = await res.json();
check("criar usuarios temporarios", !!userA.id && !!userB.id, JSON.stringify([userA, userB]));
const cookieA = await login(`smoke-push-a-${stamp}@montesiao.org`);
const cookieB = await login(`smoke-push-b-${stamp}@montesiao.org`);

// 401 sem login
res = await fetch(`${base}/push/public-key`);
check("public-key sem login 401", res.status === 401, `got ${res.status}`);
res = await fetch(`${base}/push/subscribe`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
check("subscribe sem login 401", res.status === 401, `got ${res.status}`);

// public-key com login
res = await req("/push/public-key", admin);
const pk = await res.json().catch(() => ({}));
check(
  "public-key 200 formato base64url",
  res.status === 200 && typeof pk.publicKey === "string" && pk.publicKey.length >= 80,
  JSON.stringify(pk),
);

// validação
res = await req("/push/subscribe", cookieA, { method: "POST", body: JSON.stringify({}) });
check("subscribe payload vazio 400", res.status === 400, `got ${res.status}`);
res = await req("/push/subscribe", cookieA, {
  method: "POST",
  body: JSON.stringify({ endpoint: "http://insecure.example/x", keys: { p256dh: "a", auth: "b" } }),
});
check("endpoint http (sem TLS) 400", res.status === 400, `got ${res.status}`);

// subscribe + upsert
const ep1 = `https://fcm.googleapis.com/fcm/send/smoke-${stamp}-1`;
const ep2 = `https://fcm.googleapis.com/fcm/send/smoke-${stamp}-2`;
res = await req("/push/subscribe", cookieA, {
  method: "POST",
  body: JSON.stringify({ endpoint: ep1, keys: { p256dh: "BNsmoke1", auth: "auth1" } }),
});
check("subscribe A ep1 201", res.status === 201, `got ${res.status}`);
res = await req("/push/subscriptions", cookieA);
let list = await res.json();
check("A lista 1 inscricao", Array.isArray(list) && list.length === 1, JSON.stringify(list));
res = await req("/push/subscribe", cookieA, {
  method: "POST",
  body: JSON.stringify({ endpoint: ep1, keys: { p256dh: "BNsmoke1-new", auth: "auth1-new" } }),
});
res = await req("/push/subscriptions", cookieA);
list = await res.json();
check(
  "upsert mesma ep = 1 linha com chave atualizada",
  list.length === 1 && list[0].p256dh === "BNsmoke1-new",
  JSON.stringify(list),
);
res = await req("/push/subscribe", cookieA, {
  method: "POST",
  body: JSON.stringify({ endpoint: ep2, keys: { p256dh: "BNsmoke2", auth: "auth2" } }),
});
res = await req("/push/subscriptions", cookieA);
list = await res.json();
check("segunda ep = 2 linhas", list.length === 2, JSON.stringify(list.map((x) => x.endpoint)));

// B nao apaga inscricao de A
res = await req("/push/subscribe", cookieB, { method: "DELETE", body: JSON.stringify({ endpoint: ep1 }) });
check("B delete ep de A responde ok", res.status === 200, `got ${res.status}`);
res = await req("/push/subscriptions", cookieA);
list = await res.json();
check("A ainda tem 2 linhas", list.length === 2, JSON.stringify(list));

// A apaga a propria
res = await req("/push/subscribe", cookieA, { method: "DELETE", body: JSON.stringify({ endpoint: ep1 }) });
check("A delete proprio 200", res.status === 200, `got ${res.status}`);
res = await req("/push/subscriptions", cookieA);
list = await res.json();
check("A queda para 1 linha", list.length === 1 && list[0].endpoint === ep2, JSON.stringify(list));

// limpeza
await req(`/users/${userA.id}`, admin, { method: "DELETE" });
await req(`/users/${userB.id}`, admin, { method: "DELETE" });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 7: Rodar e ver falhar**

```
node "$env:TEMP\opencode\smoke-push.mjs"
```
Expected: falhas nos checks de rota (404). Se dev server cair: reiniciar (ver Contexto).

- [ ] **Step 8: Criar `server/routes/push.ts`**

```ts
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
```

- [ ] **Step 9: Registrar rota em `server/index.ts`** — import após `noticeRoutes` + rota após a de notices:

```ts
import { pushRoutes } from "./routes/push.js";
```
```ts
app.route("/api/push", pushRoutes);
```

- [ ] **Step 10: Typecheck + restart do dev server + smoke verde**

```
npm run typecheck
```
Restart (obrigatório: `.dev.vars` e `server/` mudaram):
```powershell
$conns = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($conns) { $conns.OwningProcess | Select-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }
Start-Sleep -Seconds 2
Start-Process cmd -ArgumentList "/c npm run dev > %TEMP%\opencode\vite-dev.log 2>&1"
# esperar /api/health 200 (loop de até 40s)
```
```
node "$env:TEMP\opencode\smoke-push.mjs"
```
Expected: typecheck limpo; smoke `0 failed` (~17 checks).

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json migrations/0008_push_subscriptions.sql server/lib/env.ts server/routes/push.ts server/index.ts
git commit -m "feat: backend de push (tabela, rotas de inscricao e public-key)"
```

---

### Task 2: Módulo de envio `server/lib/push.ts` + gatilhos + resiliência no smoke

**Files:**
- Create: `server/lib/push.ts`
- Modify: `server/routes/notices.ts` (gatilho após INSERT)
- Modify: `server/routes/schedules.ts` (2 gatilhos)
- Modify: `server/routes/swaps.ts` (2 gatilhos)
- Modify: `C:\Users\Raptor\AppData\Local\Temp\opencode\smoke-push.mjs` (checks de resiliência)

- [ ] **Step 1: Criar `server/lib/push.ts`**

```ts
import { sendPushBatch } from "@mmmike/web-push/send";
import type { Env } from "./env.js";

export interface PushPayload {
  title: string;
  body?: string;
  url: string;
}

type SubRow = { endpoint: string; p256dh: string; auth: string };

function vapidConfig(env: Env) {
  const keys = JSON.parse(env.VAPID_KEYS);
  return { publicKey: keys.publicKey, privateKey: keys.privateKey, subject: "mailto:admin@montesiao.org" };
}

async function sendToSubscriptions(env: Env, subs: SubRow[], payload: PushPayload): Promise<void> {
  if (subs.length === 0) return;
  try {
    const { gone } = await sendPushBatch(
      subs.map((s) => ({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })),
      payload,
      vapidConfig(env),
      { timeoutMs: 10000 },
    );
    if (gone.length > 0) {
      await env.DB.batch(
        gone.map((g) => env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(g.endpoint)),
      );
    }
  } catch (err) {
    console.error("push: envio falhou", err instanceof Error ? err.message : String(err));
  }
}

export function schedulePush(c: any, task: Promise<void>): void {
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    task.catch(() => {});
  }
}

export async function notifyUser(env: Env, userId: number, payload: PushPayload): Promise<void> {
  const rows = await env.DB.prepare(
    "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
  )
    .bind(userId)
    .all();
  await sendToSubscriptions(env, rows.results as SubRow[], payload);
}

export async function notifyVisibleSubscribers(
  env: Env,
  ministryId: number | null,
  payload: PushPayload,
): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT ps.endpoint, ps.p256dh, ps.auth
     FROM push_subscriptions ps
     JOIN users u ON u.id = ps.user_id
     WHERE u.role = 'ADMIN'
        OR ? IS NULL
        OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.ministry_id = ?)
        OR EXISTS (SELECT 1 FROM ministry_leaders ml WHERE ml.user_id = u.id AND ml.ministry_id = ?)`,
  )
    .bind(ministryId, ministryId, ministryId)
    .all();
  await sendToSubscriptions(env, rows.results as SubRow[], payload);
}
```

- [ ] **Step 2: Gatilho em `server/routes/notices.ts`** — import + chamada logo após o INSERT do `POST /` (antes do `return c.json({ id: ... }, 201)`):

```ts
import { notifyVisibleSubscribers, schedulePush } from "../lib/push.js";
```
```ts
  const bodyText = String(body).trim();
  schedulePush(
    c,
    notifyVisibleSubscribers(c.env, ministry_id ?? null, {
      title: String(title).trim(),
      body: bodyText.length > 120 ? `${bodyText.slice(0, 120)}…` : bodyText,
      url: "/avisos",
    }),
  );
```

- [ ] **Step 3: Gatilhos em `server/routes/schedules.ts`** — import no topo:

```ts
import { notifyUser, schedulePush } from "../lib/push.js";
```

(a) Em `POST /`, logo após `const r = await c.env.DB.prepare("INSERT INTO schedules ...).run();` e antes do return:

```ts
  if (user_id) {
    const ev = await c.env.DB.prepare("SELECT title, event_date FROM events WHERE id = ?").bind(event_id).first<any>();
    const d = String(ev?.event_date ?? "");
    schedulePush(
      c,
      notifyUser(c.env, Number(user_id), {
        title: "Você foi escalado",
        body: `${ev?.title ?? "Escala"} • ${d.slice(8, 10)}/${d.slice(5, 7)}`,
        url: "/agenda",
      }),
    );
  }
```

(b) Em `PATCH /:id`, no branch `if (user_id !== undefined && user_id !== null && user_id !== schedule.user_id)`, logo após o `await c.env.DB.batch([...])` e antes do `return c.json({ ok: true });`:

```ts
    const ev = await c.env.DB.prepare("SELECT title, event_date FROM events WHERE id = ?")
      .bind(schedule.event_id)
      .first<any>();
    const d = String(ev?.event_date ?? "");
    schedulePush(
      c,
      notifyUser(c.env, Number(user_id), {
        title: "Você foi escalado",
        body: `${ev?.title ?? "Escala"} • ${d.slice(8, 10)}/${d.slice(5, 7)}`,
        url: "/agenda",
      }),
    );
```

(Não mexer nos branches de grupo nem de remoção — regra anti-duplicidade do spec.)

- [ ] **Step 4: Gatilhos em `server/routes/swaps.ts`** — import no topo:

```ts
import { notifyUser, schedulePush } from "../lib/push.js";
```

(a) `POST /`: acrescentar `e.title` ao SELECT da validação do schedule:

```ts
    `SELECT s.*, e.title AS event_title, e.event_date FROM schedules s JOIN events e ON e.id = s.event_id WHERE s.id = ? AND s.user_id = ?`,
```
e logo após o `INSERT INTO swap_requests ... .run();` antes do return:

```ts
  if (target_user_id) {
    const who = await c.env.DB.prepare("SELECT name FROM users WHERE id = ?").bind(user.sub).first<any>();
    const d = String(schedule.event_date ?? "");
    schedulePush(
      c,
      notifyUser(c.env, Number(target_user_id), {
        title: "Pedido de troca",
        body: `${who?.name ?? "Alguém"} quer trocar com você: ${schedule.event_title} • ${d.slice(8, 10)}/${d.slice(5, 7)}`,
        url: "/trocas",
      }),
    );
  }
```

(b) `POST /:id/decision`, logo após o `if/else` das batches e antes do `return c.json({ ok: true });`:

```ts
  const ev = await c.env.DB.prepare(
    "SELECT e.title, e.event_date FROM schedules s JOIN events e ON e.id = s.event_id WHERE s.id = ?",
  )
    .bind(swap.schedule_id)
    .first<any>();
  const d = String(ev?.event_date ?? "");
  schedulePush(
    c,
    notifyUser(c.env, Number(swap.requester_id), {
      title: decision === "APPROVED" ? "Troca aprovada" : "Troca recusada",
      body: `${ev?.title ?? "Escala"} • ${d.slice(8, 10)}/${d.slice(5, 7)}`,
      url: "/trocas",
    }),
  );
```

(O filtro `status = 'PENDING'` da query já garante que só transições reais chegam aqui.)

- [ ] **Step 5: Estender o smoke com checks de resiliência** — adicionar em `smoke-push.mjs` ANTES do bloco `// limpeza`:

```js
// resiliência: push com endpoint DNS-morto não derruba as operações
res = await req("/push/subscribe", cookieA, {
  method: "POST",
  body: JSON.stringify({ endpoint: "https://example.invalid/push/smoke", keys: { p256dh: "BNdead", auth: "dead" } }),
});
check("subscribe endpoint DNS-morto 201", res.status === 201, `got ${res.status}`);

res = await req("/notices", admin, {
  method: "POST",
  body: JSON.stringify({ title: "Aviso Push Smoke", body: "resiliência", month: (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`; })() }),
});
check("criar aviso com push quebrado 201", res.status === 201, `got ${res.status}`);
const noticeId = (await res.json()).id;

res = await req("/ministries", admin, {
  method: "POST",
  body: JSON.stringify({ name: `Smoke Push ${stamp}`, description: "autoteste", leader_ids: [userA.id] }),
});
const mPush = await res.json();
check("criar ministerio", res.status === 201 && !!mPush.id, JSON.stringify(mPush));
res = await req(`/ministries/${mPush.id}/roles`, admin, { method: "POST", body: JSON.stringify({ name: "Vocal" }) });
const rolePush = await res.json();
res = await req(`/ministries/${mPush.id}/members`, admin, {
  method: "POST",
  body: JSON.stringify({ user_id: userB.id, role_id: rolePush.id }),
});
check("vincular B ao ministerio", res.status === 201, `got ${res.status}`);

res = await req("/events", admin, {
  method: "POST",
  body: JSON.stringify({ title: "Culto Smoke Push", event_date: "2030-01-05" }),
});
const evPush = await res.json();
check("criar evento", res.status === 201 && !!evPush.id, JSON.stringify(evPush));

res = await req("/schedules", admin, {
  method: "POST",
  body: JSON.stringify({ event_id: evPush.id, role_id: rolePush.id, user_id: userA.id }),
});
const schPush = await res.json();
check("escalar A (push quebrado) 201", res.status === 201, `got ${res.status}`);

res = await req("/events", admin, {
  method: "POST",
  body: JSON.stringify({ title: "Culto Smoke Push 2", event_date: "2030-01-12" }),
});
const evPush2 = await res.json();
res = await req("/schedules", admin, {
  method: "POST",
  body: JSON.stringify({ event_id: evPush2.id, role_id: rolePush.id }),
});
const schPush2 = await res.json();
res = await req(`/schedules/${schPush2.id}`, admin, { method: "PATCH", body: JSON.stringify({ user_id: userA.id }) });
check("PATCH atribui A 200 (push quebrado)", res.status === 200, `got ${res.status}`);

res = await req("/swaps", cookieA, {
  method: "POST",
  body: JSON.stringify({ schedule_id: schPush.id, target_user_id: userB.id }),
});
const swapPush = await res.json();
check("swap A→B 201 (push quebrado)", res.status === 201, `got ${swapPush}`);
res = await req(`/swaps/${swapPush.id}/decision`, admin, {
  method: "POST",
  body: JSON.stringify({ decision: "APPROVED" }),
});
check("aprovar troca 200 (push quebrado)", res.status === 200, `got ${res.status}`);
```

E NO bloco `// limpeza` final, antes de apagar os usuários:

```js
await req(`/notices/${noticeId}`, admin, { method: "DELETE" });
await req(`/events/${evPush.id}`, admin, { method: "DELETE" });
await req(`/events/${evPush2.id}`, admin, { method: "DELETE" });
await req(`/ministries/${mPush.id}`, admin, { method: "DELETE" });
```

- [ ] **Step 6: Typecheck + restart do dev server + smoke verde**

```
npm run typecheck
```
Restart (server/ mudou) e rodar:
```
node "$env:TEMP\opencode\smoke-push.mjs"
```
Expected: typecheck limpo; smoke `0 failed` (~27 checks). Se travar: os `timeoutMs: 10000` limitam o envio; resposta HTTP não espera o push.

- [ ] **Step 7: Commit**

```bash
git add server/lib/push.ts server/routes/notices.ts server/routes/schedules.ts server/routes/swaps.ts
git commit -m "feat: envio de push nos gatilhos de aviso, escala e troca"
```

---

### Task 3: Frontend — `api.delete` com corpo + card no Perfil + auto-sync

**Files:**
- Modify: `src/lib/api.ts`
- Create: `src/components/NotificationsCard.tsx`
- Modify: `src/pages/ProfilePage.tsx`
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: `api.delete` aceita corpo** — em `src/lib/api.ts` trocar a linha do `delete`:

```ts
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
```

- [ ] **Step 2: Criar `src/components/NotificationsCard.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import {
  isPushSupported,
  getNotificationPermission,
  subscribe,
  unsubscribe,
  serializeSubscription,
} from "@mmmike/web-push/client";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { toast } from "./ui/toast";

type State = "loading" | "iphone" | "unsupported" | "blocked" | "dev" | "off" | "on";

function isIOSDevice(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function NotificationsCard() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (isIOSDevice()) {
        if (alive) setState("iphone");
        return;
      }
      if (!import.meta.env.PROD) {
        if (alive) setState("dev");
        return;
      }
      if (!isPushSupported()) {
        if (alive) setState("unsupported");
        return;
      }
      if (getNotificationPermission() === "denied") {
        if (alive) setState("blocked");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (alive) setState(sub ? "on" : "off");
      } catch {
        if (alive) setState("unsupported");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const activate = async () => {
    setBusy(true);
    try {
      await navigator.serviceWorker.register("/sw.js").catch(() => {});
      const { publicKey } = await api.get<{ publicKey: string }>("/push/public-key");
      const result = await subscribe(publicKey);
      if (result.status === "subscribed") {
        await api.post("/push/subscribe", serializeSubscription(result.subscription));
        toast("Notificações ativadas!");
        setState("on");
      } else if (result.status === "denied") {
        setState("blocked");
        toast("Permissão negada", "error");
      } else {
        setState("unsupported");
        toast("Este navegador não suporta notificações", "error");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao ativar", "error");
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    setBusy(true);
    try {
      const endpoint = await unsubscribe();
      if (endpoint) await api.delete("/push/subscribe", { endpoint });
      toast("Notificações desativadas");
      setState("off");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell size={18} aria-hidden="true" /> Notificações
        </CardTitle>
        <CardDescription>Alertas no seu aparelho: avisos, escalas e trocas</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state === "loading" && (
          <p className="text-sm text-muted-foreground">Verificando suporte...</p>
        )}
        {state === "iphone" && (
          <p className="text-sm text-muted-foreground">Indisponível no iPhone por enquanto.</p>
        )}
        {state === "unsupported" && (
          <p className="text-sm text-muted-foreground">Seu navegador não suporta notificações.</p>
        )}
        {state === "dev" && (
          <p className="text-sm text-muted-foreground">Disponível apenas na versão publicada do app.</p>
        )}
        {state === "blocked" && (
          <p className="text-sm text-destructive">
            Notificações bloqueadas — habilite nas configurações do navegador.
          </p>
        )}
        {state === "off" && (
          <Button onClick={activate} disabled={busy} className="w-full">
            <Bell size={16} /> {busy ? "Ativando..." : "Ativar notificações"}
          </Button>
        )}
        {state === "on" && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <Bell size={16} aria-hidden="true" /> Notificações ativadas
            </p>
            <Button variant="outline" onClick={deactivate} disabled={busy} className="w-full">
              <BellOff size={16} /> {busy ? "Desativando..." : "Desativar"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Renderizar no Perfil** — em `src/pages/ProfilePage.tsx`:

import:
```tsx
import { NotificationsCard } from "../components/NotificationsCard";
```
JSX — inserir `<NotificationsCard />` entre o `</Card>` final do "Dados da conta" e o `<Button variant="outline" ...>Sair da conta</Button>`:
```tsx
      </Card>

      <NotificationsCard />

      <Button
        variant="outline"
        className="w-full text-destructive"
```

- [ ] **Step 4: Auto-sync no `AppShell`** — import:
```tsx
import { serializeSubscription } from "@mmmike/web-push/client";
```
Effect logo após o effect do badge de avisos (mesmo componente):
```tsx
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let alive = true;
    navigator.serviceWorker
      .getRegistration()
      .then(async (reg) => {
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (alive && sub) await api.post("/push/subscribe", serializeSubscription(sub));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
```

- [ ] **Step 5: Verificar + commit**

```
npm run typecheck; npm run build; node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public
```
Expected: limpo, detector exit 0.

```bash
git add src/lib/api.ts src/components/NotificationsCard.tsx src/pages/ProfilePage.tsx src/components/layout/AppShell.tsx
git commit -m "feat: card de notificacoes no perfil com ativacao e auto-sync"
```

---

### Task 4: Handlers de push no Service Worker

**Files:**
- Modify: `public/sw.js`

- [ ] **Step 1: Acrescentar ao final de `public/sw.js`** (após o handler de `fetch`):

```js
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Nova notificação", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
      tag: data.tag,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const open = clients.find((client) => new URL(client.url).pathname === url);
      if (open) return open.focus();
      return self.clients.openWindow(url);
    }),
  );
});
```

- [ ] **Step 2: Verificar + commit**

```
npm run build; node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public
```
Expected: build ok, exit 0.

```bash
git add public/sw.js
git commit -m "feat: handlers de push e clique de notificacao no service worker"
```

---

### Task 5: Verificação final + secret de produção + deploy

- [ ] **Step 1: Suíte local (8 smokes)**

```powershell
$env:SMOKE_BASE = "http://localhost:5173/api"
# rodar os 8: smoke-push, smoke-avisos, smoke-min-leaders, smoke-leaders,
# smoke-playlists, smoke-remocoes-avatar, smoke-grupos-voz, smoke-excluir-funcoes
```
Expected: todos `0 failed`.

- [ ] **Step 2: Secret de produção**

```powershell
cmd /c "npx wrangler secret put VAPID_KEYS < %TEMP%\opencode\vapid.json"
```
Expected: `✨ Success! Secret added`. (Mesma chave do `.dev.vars`; deploys do GH Actions não sobrescrevem secrets.)

- [ ] **Step 3: Push + deploy**

```bash
git push origin main
```
Watch: `$runId = (gh run list --limit 1 --json databaseId | ConvertFrom-Json)[0].databaseId` — se voltar o run antigo (race), usar `gh run list` e escolher o `in_progress` — `gh run watch <novo> --exit-status`.

- [ ] **Step 4: Suíte de produção**

```powershell
$env:SMOKE_BASE = "https://escala-monte-siao.leoqueirozyt.workers.dev/api"
# os mesmos 8 smokes
```
Expected: todos `0 failed` (o smoke `min-leaders` é sensível a dados reais — em caso de falha isolada, repetir a suíte para confirmar transitória).

- [ ] **Step 5: Resumo final** — finishing-a-development-branch (tudo na main, já em produção → resumo em português + checklist de teste manual E2E do spec: ativar no Android/desktop, aviso → notificação → clique abre `/avisos`, escalado → `/agenda`, troca → `/trocas`, desativar, iPhone → "indisponível").

## Self-review (realizado na escrita)
- **Spec coverage:** 4 eventos ✅ (Task 2), ativação Perfil/iPhone/bloqueado ✅ (Task 3), SW deep link ✅ (Task 4), auto-sync ✅ (Task 3), secret único ✅ (Task 1/5), prune 404/410 ✅ (Task 2 `gone`), best-effort ✅ (`schedulePush` + try/catch), anti-duplicidade troca/escala ✅ (sem gatilho em `decision`→assign), smoke ✅ (Tasks 1–2).
- **Placeholders:** nenhum (todo código é completo; âncoras de inserção explícitas).
- **Consistência de tipos:** `PushPayload`/`SubRow`/`schedulePush`/`notifyUser`/`notifyVisibleSubscribers` usam os mesmos nomes em todas as tasks; corpo `DELETE {endpoint}` ↔ `api.delete(path, body)` ↔ rota `delete("/subscribe")`.
