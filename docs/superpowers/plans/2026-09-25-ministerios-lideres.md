# Aba Ministérios para líderes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Líderes veem e usam a aba Ministérios — editando só o ministério que lideram; demais cartões somente-leitura; ADMIN edita tudo. Inclui o push do fix de foco do Dialog (`51b5eb0`) pendente.

**Architecture:** `GET /ministries?scope=all` retorna lista completa (sem parâmetro mantém escopo atual, preservando `ScheduleMatrixPage`); `PUT /:id` troca `requireRole("ADMIN")` por `canManage` com `leader_ids` restrito a ADMIN; frontend usa `canEdit(m)` para renderizar cartões bloqueados e condicionar seções admin.

**Tech Stack:** Hono + D1 (ponte `ministry_leaders`), React 19, guards de rota `LeaderOnly`.

**Conventions:** verificação = `npm run typecheck` + `npm run build` + detector impeccable + smoke `.mjs` (fetch/cookies) dev e produção. Spec: `docs/superpowers/specs/2026-09-25-ministerios-lideres-design.md`.

---

### Task 1: Backend — `scope=all` e `PUT` via `canManage`

**Files:**
- Modify: `server/routes/ministries.ts:55-58` (GET) e `:113-125` (PUT)

- [ ] **Step 1: GET aceita `?scope=all`**

Trocar as linhas 55-58 de:

```ts
ministryRoutes.get("/", requireRole("ADMIN", "LEADER"), async (c) => {
  const user = c.get("user");
  const ids = await leaderMinistryIds(c.env.DB, user);
  const where = ids ? `WHERE m.id IN (${ids.map(() => "?").join(",")})` : "";
```

Por:

```ts
ministryRoutes.get("/", requireRole("ADMIN", "LEADER"), async (c) => {
  const user = c.get("user");
  const ids = c.req.query("scope") === "all" ? null : await leaderMinistryIds(c.env.DB, user);
  const where = ids ? `WHERE m.id IN (${ids.map(() => "?").join(",")})` : "";
```

- [ ] **Step 2: `PUT /:id` — `canManage` + `leader_ids` só-admin**

Trocar as linhas 113-125 inteiras por:

```ts
ministryRoutes.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  if (!(await canManage(c, id))) return c.json({ error: "Sem permissão para este ministério" }, 403);
  const { name, description, leader_id, leader_ids } = await c.req.json().catch(() => ({}));
  await c.env.DB.prepare("UPDATE ministries SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?")
    .bind(name ?? null, description ?? null, id)
    .run();
  if (user.role === "ADMIN" && (leader_ids !== undefined || leader_id !== undefined)) {
    const ids: number[] = Array.isArray(leader_ids) ? leader_ids.map(Number) : leader_id ? [Number(leader_id)] : [];
    const err = await applyLeaders(c, id, ids);
    if (err) return c.json({ error: err }, 400);
  }
  return c.json({ ok: true });
});
```

Obs.: `requireAuth` já cobre a rota via `ministryRoutes.use("*", requireAuth)` (linha 7).

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck` → exit 0

```bash
git add server/routes/ministries.ts
git commit -m "Allow leaders to update their own ministry; add scope=all to list"
```

---

### Task 2: Frontend — guards e menu

**Files:**
- Modify: `src/App.tsx:30-36` e `:73-80`
- Modify: `src/components/layout/AppShell.tsx:29-35` e `:45-55`

- [ ] **Step 1: Rota `/ministerios` vira `LeaderOnly`**

Em `src/App.tsx`, trocar as linhas 73-80 de:

```tsx
                <Route
                  path="/ministerios"
                  element={
                    <AdminOnly>
                      <MinistriesPage />
                    </AdminOnly>
                  }
                />
```

Por:

```tsx
                <Route
                  path="/ministerios"
                  element={
                    <LeaderOnly>
                      <MinistriesPage />
                    </LeaderOnly>
                  }
                />
```

- [ ] **Step 2: Remover `AdminOnly` não usado**

Após a Step 1, a função `AdminOnly` (linhas 30-36) fica sem uso — remova-a inteira:

```tsx
function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "ADMIN") return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 3: Menu — item vai para `leaderNav`**

Em `src/components/layout/AppShell.tsx`, trocar as linhas 29-35 de:

```tsx
const leaderNav = [
  { to: "/escala", label: "Escala", icon: CalendarDays },
  { to: "/trocas", label: "Trocas", icon: Handshake },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
];

const adminNav = [{ to: "/ministerios", label: "Ministérios", icon: Users }];
```

Por:

```tsx
const leaderNav = [
  { to: "/escala", label: "Escala", icon: CalendarDays },
  { to: "/trocas", label: "Trocas", icon: Handshake },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/ministerios", label: "Ministérios", icon: Users },
];
```

- [ ] **Step 4: Remover o spread `adminNav` do `desktopNav`**

Trocar as linhas 45-55 de:

```tsx
  const desktopNav = leader
    ? [
        { to: "/", label: "Início", icon: Home },
        { to: "/agenda", label: "Minha Agenda", icon: ClipboardList },
        { to: "/calendario", label: "Indisponibilidade", icon: CalendarOff },
        ...leaderNav,
        ...(admin ? adminNav : []),
        ...playlistNav,
        { to: "/perfil", label: "Perfil", icon: UserIcon },
      ]
    : [...volunteerNav.slice(0, 3), ...playlistNav, volunteerNav[3]];
```

Por:

```tsx
  const desktopNav = leader
    ? [
        { to: "/", label: "Início", icon: Home },
        { to: "/agenda", label: "Minha Agenda", icon: ClipboardList },
        { to: "/calendario", label: "Indisponibilidade", icon: CalendarOff },
        ...leaderNav,
        ...playlistNav,
        { to: "/perfil", label: "Perfil", icon: UserIcon },
      ]
    : [...volunteerNav.slice(0, 3), ...playlistNav, volunteerNav[3]];
```

(`admin` continua usada em `showPlaylist` — manter a declaração da linha 42.)

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` → exit 0

```bash
git add src/App.tsx src/components/layout/AppShell.tsx
git commit -m "Open ministries route and menu item to leaders"
```

---

### Task 3: `MinistriesPage` — cartões somente-leitura e seções admin

**Files:**
- Modify: `src/pages/MinistriesPage.tsx`

- [ ] **Step 1: Importar `useAuth` e criar flags**

Na linha 4 (após `import { useAsyncData } ...`), adicionar:

```tsx
import { useAuth } from "../lib/auth";
```

Após a linha 16 (`export function MinistriesPage() {`), no início do componente, adicionar — junto com os outros states (antes do `ministriesQ`):

```tsx
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const canEdit = (m: Ministry) => isAdmin || (m.leader_ids ?? []).includes(user?.id ?? -1);
```

- [ ] **Step 2: Lista com `scope=all`; `pendingQ` e membros só onde há permissão**

Trocar as linhas 33-35 (queries) de:

```tsx
  const ministriesQ = useAsyncData<Ministry[]>(() => api.get<Ministry[]>("/ministries"), []);
  const usersQ = useAsyncData<User[]>(() => api.get<User[]>("/users"), []);
  const pendingQ = useAsyncData<User[]>(() => api.get<User[]>("/users?status=PENDING_LEADER"), []);
```

Por:

```tsx
  const ministriesQ = useAsyncData<Ministry[]>(() => api.get<Ministry[]>("/ministries?scope=all"), []);
  const usersQ = useAsyncData<User[]>(() => api.get<User[]>("/users"), []);
  const pendingQ = useAsyncData<User[]>(
    () => (isAdmin ? api.get<User[]>("/users?status=PENDING_LEADER") : Promise.resolve([])),
    [isAdmin],
  );
```

Trocar o `membersMapQ` (linhas 42-51) de:

```tsx
  const ministriesKey = useMemo(() => ministries.map((m) => m.id).join(","), [ministries]);
  const membersMapQ = useAsyncData(async () => {
    const map = new Map<number, User[]>();
    const list = ministriesKey ? ministriesKey.split(",").map(Number) : [];
    if (list.length === 0) return map;
    const results = await Promise.all(
      list.map((id) => api.get<User[]>(`/ministries/${id}/members`).then((users) => ({ id, users }))),
    );
    for (const r of results) map.set(r.id, r.users);
    return map;
  }, [ministriesKey, membersTick]);
```

Por:

```tsx
  const editableKey = useMemo(
    () => ministries.filter(canEdit).map((m) => m.id).join(","),
    [ministries, user?.id, isAdmin],
  );
  const membersMapQ = useAsyncData(async () => {
    const map = new Map<number, User[]>();
    const list = editableKey ? editableKey.split(",").map(Number) : [];
    if (list.length === 0) return map;
    const results = await Promise.all(
      list.map((id) => api.get<User[]>(`/ministries/${id}/members`).then((users) => ({ id, users }))),
    );
    for (const r of results) map.set(r.id, r.users);
    return map;
  }, [editableKey, membersTick]);
```

- [ ] **Step 3: Botão "Novo" e cartão "Aprovação de líderes" só para admin**

Trocar o botão "Novo" (linhas 150-153) de:

```tsx
        <Button size="sm" onClick={() => setNewMinistryOpen(true)}>
          <Plus size={16} /> Novo
        </Button>
```

Por:

```tsx
        {isAdmin && (
          <Button size="sm" onClick={() => setNewMinistryOpen(true)}>
            <Plus size={16} /> Novo
          </Button>
        )}
```

Envolver o cartão `{pendingLeaders.length > 0 && (` (linhas 155-182) por:

```tsx
      {isAdmin && pendingLeaders.length > 0 && (
```

(ou seja, adicionar `isAdmin &&` no início da condição existente — o restante do cartão permanece igual).

- [ ] **Step 4: Cartão — botões condicionais e selo somente-leitura**

No mapa de cartões, trocar o bloco de botões (linhas 202-213) de:

```tsx
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(m)}>
                  <Pencil size={14} /> Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRoleDialog(m)}>
                  <Plus size={14} /> Função
                </Button>
                <Button size="sm" variant="outline" onClick={() => setMemberDialog(m)}>
                  <UserPlus size={14} /> Membro
                </Button>
              </div>
```

Por:

```tsx
              <div className="flex flex-wrap justify-end gap-2">
                {canEdit(m) ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => openEdit(m)}>
                      <Pencil size={14} /> Editar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRoleDialog(m)}>
                      <Plus size={14} /> Função
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setMemberDialog(m)}>
                      <UserPlus size={14} /> Membro
                    </Button>
                  </>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Somente leitura
                  </Badge>
                )}
              </div>
```

- [ ] **Step 5: Membros — lista só dos editáveis**

Trocar a chamada `<MemberList ... />` (linhas 225-231) por:

```tsx
              {canEdit(m) ? (
                <MemberList
                  ministry={m}
                  members={membersMapQ.data?.get(m.id)}
                  status={membersMapQ.status}
                  error={membersMapQ.error}
                  onRetry={membersMapQ.reload}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Somente o líder deste ministério ou o ADMIN pode ver e gerenciar membros.
                </p>
              )}
```

- [ ] **Step 6: Diálogo "Editar" — campo Líderes só para admin**

No diálogo "Editar" (linhas ~269-276), trocar:

```tsx
          <Field label="Líderes (marque um ou mais)">
            <LeaderPicker users={users} selected={editLeaderIds} onChange={setEditLeaderIds} />
          </Field>
```

Por:

```tsx
          {isAdmin ? (
            <Field label="Líderes (marque um ou mais)">
              <LeaderPicker users={users} selected={editLeaderIds} onChange={setEditLeaderIds} />
            </Field>
          ) : (
            <p className="text-xs text-muted-foreground">
              A definição de líderes é exclusiva do ADMIN.
            </p>
          )}
```

E no `saveEdit`, trocar o payload (linhas ~100-105):

```tsx
      await api.put(`/ministries/${editDialog.id}`, {
        name: editName,
        description: editDesc || null,
        leader_ids: editLeaderIds,
      });
```

Por:

```tsx
      await api.put(`/ministries/${editDialog.id}`, {
        name: editName,
        description: editDesc || null,
        ...(isAdmin ? { leader_ids: editLeaderIds } : {}),
      });
```

- [ ] **Step 7: Typecheck + build + commit**

Run: `npm run typecheck` → exit 0
Run: `npm run build` → sucesso

```bash
git add src/pages/MinistriesPage.tsx
git commit -m "Show all ministries to leaders with read-only cards"
```

---

### Task 4: Verificação, smoke, push e deploy

**Files:**
- Create (temp): `%TEMP%/opencode/smoke-min-leaders.mjs`

- [ ] **Step 1: Detector impeccable**

Run: `node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public` → saída vazia, exit 0

- [ ] **Step 2: Dev server + smoke script**

Subir dev server se necessário (`http://localhost:5173/api/health` → `{"ok":true}`).

Salvar `%TEMP%\opencode\smoke-min-leaders.mjs`:

```js
const base = process.env.SMOKE_BASE || "http://localhost:5173/api";
let failed = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${cond ? "" : extra}`);
  if (!cond) failed++;
};

async function login(email) {
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "senha123" }),
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (!res.ok || !cookie) throw new Error(`login ${email} falhou: ${res.status}`);
  return cookie;
}
const req = (path, cookie, options = {}) =>
  fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...(options.headers || {}) },
  });

const admin = await login("admin@montesiao.org");
const carlos = await login("carlos@montesiao.org");
const maria = await login("maria@montesiao.org"); // VOLUNTEER

// ADMIN: scope=all retorna todos
let res = await req("/ministries?scope=all", admin);
let list = await res.json();
check("admin scope=all 200", res.status === 200, `got ${res.status}`);
check("admin vê todos (>=3)", list.length >= 3, String(list.length));

// LÍDER: scope=all retorna todos; sem parâmetro, só os dele
res = await req("/ministries?scope=all", carlos);
list = await res.json();
check("líder scope=all 200", res.status === 200, `got ${res.status}`);
check("líder vê todos (>=3)", list.length >= 3, String(list.length));

res = await req("/ministries", carlos);
const scoped = await res.json();
check("líder sem scope vê só Louvor", res.status === 200 && scoped.length === 1 && scoped[0].id === 1, JSON.stringify(scoped.map((m) => m.id)));

// LÍDER: PUT nome no próprio ministério → 200
res = await req("/ministries/1", carlos, { method: "PUT", body: JSON.stringify({ name: "Louvor" }) });
check("líder PUT próprio 200", res.status === 200, `got ${res.status}`);

// LÍDER: PUT em ministério de outro → 403
res = await req("/ministries/2", carlos, { method: "PUT", body: JSON.stringify({ name: "Mídia" }) });
check("líder PUT outro 403", res.status === 403, `got ${res.status}`);

// LÍDER: PUT com leader_ids no próprio → 200 mas ignorado
res = await req("/ministries/1", carlos, { method: "PUT", body: JSON.stringify({ name: "Louvor", leader_ids: [2] }) });
check("líder PUT com leader_ids 200", res.status === 200, `got ${res.status}`);
res = await req("/ministries?scope=all", admin);
const after = (await res.json()).find((m) => m.id === 1);
check("leader_ids inalterado (2 continua)", Array.isArray(after?.leader_ids) && after.leader_ids.includes(2), JSON.stringify(after?.leader_ids));

// LÍDER: criação de ministério → 403
res = await req("/ministries", carlos, { method: "POST", body: JSON.stringify({ name: "Hack" }) });
check("líder POST 403", res.status === 403, `got ${res.status}`);

// LÍDER: cria função no próprio → 201; em outro → 403
res = await req("/ministries/1/roles", carlos, { method: "POST", body: JSON.stringify({ name: `Role ${Date.now()}` }) });
const roleRes = res;
if (roleRes.status === 201) {
  const { id } = await roleRes.json();
  await req(`/ministries/roles/${id}`, admin, { method: "DELETE" });
}
check("líder cria função no próprio 201", roleRes.status === 201, `got ${roleRes.status}`);

res = await req("/ministries/2/roles", carlos, { method: "POST", body: JSON.stringify({ name: "Hack" }) });
check("líder cria função em outro 403", res.status === 403, `got ${res.status}`);

// LÍDER: membros do próprio → 200; de outro → 403
res = await req("/ministries/1/members", carlos);
check("líder membros do próprio 200", res.status === 200, `got ${res.status}`);
res = await req("/ministries/2/members", carlos);
check("líder membros de outro 403", res.status === 403, `got ${res.status}`);

// VOLUNTÁRIO: 403 em tudo
res = await req("/ministries?scope=all", maria);
check("voluntário GET 403", res.status === 403, `got ${res.status}`);

// ADMIN: PUT em qualquer → 200
res = await req("/ministries/2", admin, { method: "PUT", body: JSON.stringify({ name: "Mídia" }) });
check("admin PUT qualquer 200", res.status === 200, `got ${res.status}`);

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
```

Run: `node "$env:TEMP\opencode\smoke-min-leaders.mjs"` → `ALL PASS`

- [ ] **Step 3: Smoke de regressão (playlists + múltiplos líderes)**

Run: `node "$env:TEMP\opencode\smoke-playlists.mjs"` → `ALL PASS`
Run: `node "$env:TEMP\opencode\smoke-leaders.mjs"` → `ALL PASS`

Obs.: `smoke-leaders.mjs` dá `PUT /ministries/1` como admin — continua válido.

- [ ] **Step 4: Push (inclui fix do Dialog `51b5eb0`) + deploy**

```bash
git push origin main
$run = (gh run list --limit 1 --json databaseId | ConvertFrom-Json)[0].databaseId
gh run watch $run --exit-status
```

Expected: run verde

- [ ] **Step 5: Smoke produção**

Run: `$env:SMOKE_BASE = "https://escala-monte-siao.leoqueirozyt.workers.dev/api"; node "$env:TEMP\opencode\smoke-min-leaders.mjs"` → `ALL PASS`

- [ ] **Step 6: Teste manual do usuário**

Login `carlos@montesiao.org`/`senha123` → menu vê "Ministérios" → vê todos os cartões, selo "Somente leitura" nos não-liderados → edita nome do Louvor → em Mídia nenhum botão. Login `admin@` → tudo editável + "Novo" + aprovação de líderes. Testar também digitação no diálogo de novo evento (fix do foco).

Expected: conforme descrito

---

## Self-Review (após escrita)

- **Spec coverage:** acesso rota/menu (T2) ✓; visão B com `scope=all` (T1 Step 1, T3 Step 2) ✓; `PUT canManage` + `leader_ids` só-admin (T1 Step 2) ✓; POST/DELETE admin (inalterados, smoke T4) ✓; cartões somente-leitura + membros só dos editáveis (T3 Steps 4-5) ✓; diálogos/botões admin-only (T3 Steps 3, 6) ✓; `pendingQ` só-admin (T3 Step 2) ✓; matrix inalterada (T1 obs + smoke) ✓; verificação (T4) ✓; push do Dialog fix (T4 Step 4) ✓.
- **Placeholders:** nenhum — todos os blocos de código completos com números de linha reais.
- **Type consistency:** `canEdit(m)` definido T3 Step 1 e usado Steps 2/4/5; `isAdmin` usado nos mesmos passos; payload `leader_ids` condicional bate com o backend (T1 Step 2 só aplica para ADMIN).
