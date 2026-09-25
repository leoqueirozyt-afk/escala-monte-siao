# Classificação de Voz + Grupos de Voz/Músicos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Líder do Louvor classifica vozes (6 tipos com cores) e monta grupos de vozes/músicos numa nova aba exclusiva, escalando grupos inteiros nas vagas da escala com status individual por membro.

**Architecture:** Migration `0006` cria `voice_classifications` (+seeds), `voice_classification_members`, `voice_groups`, `voice_group_members`, `schedule_group_members` e `schedules.group_id`; rotas novas em `server/routes/voice.ts` com guard `isLouvorLeader`; `PATCH /schedules/:id` aceita `group_id` e `respond` passa a operar por `schedule_group_members`; frontend ganha `GruposPage` (rota `/grupos`, guard via `leader_ministry_ids` do `/me`) + `VoiceBadge` aplicado em Ministérios/Perfil/Escala.

**Tech Stack:** Hono + D1 (SQLite), React 19, `shared/types.ts`, guard Louvor (ponte `ministry_leaders`, ministério id 1).

**Conventions:** verificação = `npm run typecheck` + `npm run build` + detector impeccable + smoke `.mjs` dev/prod. Sem testes unitários (convenção do repo). Spec: `docs/superpowers/specs/2026-09-25-classificacao-voz-grupos-design.md`. Trabalho direto na `main`.

**Importante:** deploy (`.github/workflows/deploy.yml`) **não** aplica migrations — rodar `npm run db:apply` (local) e `npm run db:apply:remote` manualmente (Task 1).

---

### Task 1: Migration 0006 + seeds (local e remota)

**Files:**
- Create: `migrations/0006_voice_groups.sql`

- [ ] **Step 1: Criar a migration**

```sql
CREATE TABLE voice_classifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('F','M')),
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO voice_classifications (name, gender, color, sort_order) VALUES
  ('Soprano', 'F', '#EC4899', 1),
  ('Mezzo-soprano', 'F', '#A855F7', 2),
  ('Contralto', 'F', '#059669', 3),
  ('Tenor', 'M', '#2563EB', 4),
  ('Barítono', 'M', '#D97706', 5),
  ('Baixo', 'M', '#475569', 6);

CREATE TABLE voice_classification_members (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  classification_id INTEGER NOT NULL REFERENCES voice_classifications(id)
);

CREATE TABLE voice_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ministry_id INTEGER NOT NULL REFERENCES ministries(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('VOZ','MUSICO')),
  name TEXT NOT NULL
);

CREATE TABLE voice_group_members (
  group_id INTEGER NOT NULL REFERENCES voice_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, user_id)
);

ALTER TABLE schedules ADD COLUMN group_id INTEGER REFERENCES voice_groups(id) ON DELETE SET NULL;

CREATE TABLE schedule_group_members (
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','DECLINED')),
  PRIMARY KEY (schedule_id, user_id)
);
```

- [ ] **Step 2: Aplicar local e remota**

```powershell
npm run db:apply
npm run db:apply:remote
```

Expected: ambas aplicam `0006_voice_groups` sem erro

- [ ] **Step 3: Commit**

```bash
git add migrations/0006_voice_groups.sql
git commit -m "feat: migration voice_classifications, voice_groups e schedule_group_members"
```

---

### Task 2: Backend — guard Louvor, `/me` com líderes, rotas de voz/grupos

**Files:**
- Modify: `server/lib/auth.ts`
- Modify: `server/routes/auth.ts:96-121`
- Create: `server/routes/voice.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: `server/lib/auth.ts` — constante e guard**

Após `leaderMinistryIds` (linha 44), adicionar:

```ts
export const LOUVOR_MINISTRY_ID = 1;

export async function isLouvorLeader(db: D1Database, user: JwtPayload): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (user.role !== "LEADER") return false;
  const led = await db
    .prepare("SELECT 1 FROM ministry_leaders WHERE ministry_id = ? AND user_id = ?")
    .bind(LOUVOR_MINISTRY_ID, user.sub)
    .first();
  return !!led;
}
```

(`JwtPayload` já é importado? Verificar — `auth.ts` importa `verifyJwt, type JwtPayload` na linha 5. ✓)

- [ ] **Step 2: `server/routes/auth.ts` — `leader_ministry_ids` no `/me`**

Na linha 96 (`authRoutes.get("/me"...)`), após a query de `ministries` e antes do `return` (linha 120), adicionar:

```ts
  const leaderMinistryIdsList =
    payload.role === "ADMIN"
      ? (await c.env.DB.prepare("SELECT id FROM ministries ORDER BY id").all()).results.map((r: any) => Number(r.id))
      : payload.role === "LEADER"
        ? (
            await c.env.DB.prepare("SELECT ministry_id FROM ministry_leaders WHERE user_id = ?")
              .bind(payload.sub)
              .all()
          ).results.map((r: any) => Number(r.ministry_id))
        : [];
  return c.json({ user, ministries: ministries.results, leader_ministry_ids: leaderMinistryIdsList });
```

(Trocar a linha 120 existente por essa com o campo novo.)

- [ ] **Step 3: Criar `server/routes/voice.ts`**

```ts
import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { requireAuth, isLouvorLeader, LOUVOR_MINISTRY_ID, type AppVariables } from "../lib/auth.js";

export const voiceRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

voiceRoutes.use("*", requireAuth);

async function canManage(c: any): Promise<boolean> {
  return isLouvorLeader(c.env.DB, c.get("user"));
}

voiceRoutes.get("/classifications", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare(
    "SELECT id, name, gender, color, sort_order FROM voice_classifications ORDER BY sort_order",
  ).all();
  const mine = await c.env.DB.prepare(
    "SELECT classification_id FROM voice_classification_members WHERE user_id = ?",
  ).bind(user.sub).first<any>();
  return c.json({ classifications: rows.results, mine: mine ? Number(mine.classification_id) : null });
});

voiceRoutes.get("/groups", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "Sem permissão" }, 403);
  const groups = await c.env.DB.prepare(
    "SELECT id, ministry_id, kind, name FROM voice_groups ORDER BY kind, name",
  ).all();
  const members = await c.env.DB.prepare(
    `SELECT gm.group_id, u.id AS user_id, u.name, u.avatar_url,
       vc.name AS classification, vc.color AS classification_color
     FROM voice_group_members gm
     JOIN users u ON u.id = gm.user_id
     LEFT JOIN voice_classification_members vcm ON vcm.user_id = u.id
     LEFT JOIN voice_classifications vc ON vc.id = vcm.classification_id
     ORDER BY gm.position, u.name`,
  ).all();
  const result = (groups.results as any[]).map((g) => ({
    ...g,
    members: (members.results as any[]).filter((m) => Number(m.group_id) === Number(g.id)),
  }));
  return c.json(result);
});

voiceRoutes.post("/groups", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "Sem permissão" }, 403);
  const { kind, name } = await c.req.json().catch(() => ({}));
  if (kind !== "VOZ" && kind !== "MUSICO") return c.json({ error: "Tipo inválido" }, 400);
  if (!name || !String(name).trim()) return c.json({ error: "Nome obrigatório" }, 400);
  const r = await c.env.DB.prepare(
    "INSERT INTO voice_groups (ministry_id, kind, name) VALUES (?, ?, ?)",
  )
    .bind(LOUVOR_MINISTRY_ID, kind, String(name).trim())
    .run();
  return c.json({ id: r.meta.last_row_id, ministry_id: LOUVOR_MINISTRY_ID, kind, name: String(name).trim() }, 201);
});

voiceRoutes.put("/groups/:id", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "Sem permissão" }, 403);
  const { name } = await c.req.json().catch(() => ({}));
  if (!name || !String(name).trim()) return c.json({ error: "Nome obrigatório" }, 400);
  await c.env.DB.prepare("UPDATE voice_groups SET name = ? WHERE id = ?")
    .bind(String(name).trim(), Number(c.req.param("id")))
    .run();
  return c.json({ ok: true });
});

voiceRoutes.delete("/groups/:id", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "Sem permissão" }, 403);
  const groupId = Number(c.req.param("id"));
  const used = await c.env.DB.prepare("SELECT id FROM schedules WHERE group_id = ?").bind(groupId).all();
  const scheduleIds = (used.results as any[]).map((r) => Number(r.id));
  const batch = [];
  if (scheduleIds.length > 0) {
    const placeholders = scheduleIds.map(() => "?").join(",");
    batch.push(
      c.env.DB.prepare(`DELETE FROM schedule_group_members WHERE schedule_id IN (${placeholders})`).bind(...scheduleIds),
      c.env.DB.prepare(`UPDATE schedules SET group_id = NULL, user_id = NULL, status = 'PENDING' WHERE group_id = ?`).bind(groupId),
    );
  }
  batch.push(c.env.DB.prepare("DELETE FROM voice_groups WHERE id = ?").bind(groupId));
  await c.env.DB.batch(batch);
  return c.json({ ok: true });
});

voiceRoutes.post("/groups/:id/members", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "Sem permissão" }, 403);
  const groupId = Number(c.req.param("id"));
  const { user_id } = await c.req.json().catch(() => ({}));
  if (!user_id) return c.json({ error: "user_id obrigatório" }, 400);
  const group = await c.env.DB.prepare("SELECT id FROM voice_groups WHERE id = ?").bind(groupId).first();
  if (!group) return c.json({ error: "Grupo não encontrado" }, 404);
  const isMember = await c.env.DB.prepare(
    `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.ministry_id = ?
     UNION SELECT 1 FROM ministry_leaders WHERE ministry_id = ? AND user_id = ?`,
  )
    .bind(user_id, LOUVOR_MINISTRY_ID, LOUVOR_MINISTRY_ID, user_id)
    .first();
  if (!isMember) return c.json({ error: "Usuário não é membro do Louvor" }, 400);
  await c.env.DB.prepare("INSERT OR IGNORE INTO voice_group_members (group_id, user_id) VALUES (?, ?)")
    .bind(groupId, user_id)
    .run();
  return c.json({ ok: true }, 201);
});

voiceRoutes.delete("/groups/:id/members/:userId", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "Sem permissão" }, 403);
  await c.env.DB.prepare("DELETE FROM voice_group_members WHERE group_id = ? AND user_id = ?")
    .bind(Number(c.req.param("id")), Number(c.req.param("userId")))
    .run();
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Registrar rota em `server/index.ts`**

Após a linha 11 (`playlistRoutes`), adicionar import:

```ts
import { voiceRoutes } from "./routes/voice.js";
```

Após a linha 37 (`app.route("/api/playlists", ...)`), adicionar:

```ts
app.route("/api/voice", voiceRoutes);
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add server/lib/auth.ts server/routes/auth.ts server/routes/voice.ts server/index.ts
git commit -m "feat: guard Louvor, leader_ministry_ids no /me e rotas de voz/grupos"
```

---

### Task 3: Backend — classificação no PUT de usuário + membros com classificação

**Files:**
- Modify: `server/routes/users.ts`
- Modify: `server/routes/ministries.ts:188-224` (GET members)

- [ ] **Step 1: `users.ts` — import do guard**

Na linha 3, trocar:

```ts
import { requireAuth, requireRole, type AppVariables } from "../lib/auth.js";
```

Por:

```ts
import { requireAuth, requireRole, isLouvorLeader, type AppVariables } from "../lib/auth.js";
```

- [ ] **Step 2: `users.ts` — novo endpoint**

Antes da linha 77 (`userRoutes.post("/:id/approve"...)`), adicionar:

```ts
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
```

- [ ] **Step 3: `ministries.ts` — membros com classificação**

Na query do `GET /:id/members` (linhas 191-197), trocar por:

```ts
  const links = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.avatar_url, r.id AS role_id, r.name AS role_name,
       vc.name AS classification_name, vc.color AS classification_color, vcm.classification_id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     LEFT JOIN voice_classification_members vcm ON vcm.user_id = u.id
     LEFT JOIN voice_classifications vc ON vc.id = vcm.classification_id
     WHERE r.ministry_id = ?`,
  )
    .bind(ministryId)
    .all();
```

No `map` do resultado (linhas 210 e 218), incluir `classification`. Trocar o bloco final (linhas 210-222) por:

```ts
  for (const row of links.results as any[]) {
    let entry = map.get(Number(row.id));
    if (!entry) {
      entry = {
        id: Number(row.id),
        name: row.name,
        email: row.email,
        avatar_url: row.avatar_url ?? null,
        roles: [],
        classification: row.classification_id
          ? { id: Number(row.classification_id), name: String(row.classification_name), color: String(row.classification_color) }
          : null,
      };
      map.set(entry.id, entry);
    }
    entry.roles.push({ id: Number(row.role_id), name: String(row.role_name) });
  }
  for (const id of leaderIds) {
    if (!map.has(id)) {
      const u = await c.env.DB.prepare(
        `SELECT u.name, u.email, u.avatar_url, vcm.classification_id, vc.name AS classification_name, vc.color AS classification_color
         FROM users u
         LEFT JOIN voice_classification_members vcm ON vcm.user_id = u.id
         LEFT JOIN voice_classifications vc ON vc.id = vcm.classification_id
         WHERE u.id = ?`,
      ).bind(id).first<any>();
      if (u) {
        map.set(id, {
          id,
          name: u.name,
          email: u.email,
          avatar_url: u.avatar_url ?? null,
          roles: [],
          classification: u.classification_id
            ? { id: Number(u.classification_id), name: String(u.classification_name), color: String(u.classification_color) }
            : null,
        });
      }
    }
  }
  const result = [...map.values()]
    .map((m) => ({ ...m, is_leader: leaderIds.has(m.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return c.json(result);
```

(Manter a declaração `const map = new Map<...>` — atualizar o tipo do value para incluir `classification: { id: number; name: string; color: string } | null`.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add server/routes/users.ts server/routes/ministries.ts
git commit -m "feat: PUT voice-classification e classificacao nos membros do ministerio"
```

---

### Task 4: Backend — escalas com grupo (PATCH, respond, GETs, events)

**Files:**
- Create: `server/lib/voice.ts`
- Modify: `server/routes/schedules.ts`
- Modify: `server/routes/events.ts:26-34`

- [ ] **Step 1: Criar `server/lib/voice.ts` — helper `attachGroups`**

```ts
export async function attachGroups(db: D1Database, rows: any[]): Promise<void> {
  const withGroup = rows.filter((r) => r.group_id != null);
  if (withGroup.length === 0) return;
  const groupIds = [...new Set(withGroup.map((r) => Number(r.group_id)))];
  const scheduleIds = [...new Set(withGroup.map((r) => Number(r.id)))];
  const gq = await db
    .prepare(`SELECT id, name, kind FROM voice_groups WHERE id IN (${groupIds.map(() => "?").join(",")})`)
    .bind(...groupIds)
    .all();
  const groups = new Map(
    (gq.results as any[]).map((g) => [Number(g.id), { id: Number(g.id), name: String(g.name), kind: String(g.kind), members: [] as any[] }]),
  );
  const mq = await db
    .prepare(
      `SELECT sgm.schedule_id, u.id AS user_id, u.name, u.avatar_url,
         vc.name AS classification, vc.color AS classification_color, sgm.status
       FROM schedule_group_members sgm
       JOIN users u ON u.id = sgm.user_id
       LEFT JOIN voice_classification_members vcm ON vcm.user_id = u.id
       LEFT JOIN voice_classifications vc ON vc.id = vcm.classification_id
       WHERE sgm.schedule_id IN (${scheduleIds.map(() => "?").join(",")})
       ORDER BY u.name`,
    )
    .bind(...scheduleIds)
    .all();
  const bySchedule = new Map<number, any[]>();
  for (const m of mq.results as any[]) {
    const sid = Number(m.schedule_id);
    const arr = bySchedule.get(sid) ?? [];
    arr.push({
      user_id: Number(m.user_id),
      name: m.name,
      avatar_url: m.avatar_url ?? null,
      classification: m.classification ?? null,
      classification_color: m.classification_color ?? null,
      status: m.status,
    });
    bySchedule.set(sid, arr);
  }
  for (const r of withGroup) {
    const g = groups.get(Number(r.group_id));
    r.group = g ? { ...g, members: bySchedule.get(Number(r.id)) ?? [] } : null;
  }
}
```

(Não precisa de import — usa só `D1Database` global do Cloudflare types, já disponível via tsconfig types do projeto; se o typecheck reclamar, `/// <reference types="@cloudflare/workers-types" />` no topo ou importar o tipo de onde `D1Database` vem nos outros arquivos `server/` — seguir o mesmo padrão de `server/lib/auth.ts`, que usa `D1Database` sem import.)

- [ ] **Step 2: `schedules.ts` — SELECT_JOIN com classificação**

Trocar a linha 10 de `SELECT_JOIN`:

```ts
    r.name AS role_name, m.name AS ministry_name, m.id AS ministry_id, u.name AS user_name, u.avatar_url AS user_avatar
```

Por:

```ts
    r.name AS role_name, m.name AS ministry_name, m.id AS ministry_id, u.name AS user_name, u.avatar_url AS user_avatar,
    vcm.classification_id AS user_classification_id, vc.name AS user_classification, vc.color AS user_classification_color
```

E na linha 15 (fim do JOIN), após `LEFT JOIN users u ON u.id = s.user_id`, adicionar:

```sql
  LEFT JOIN voice_classification_members vcm ON vcm.user_id = u.id
  LEFT JOIN voice_classifications vc ON vc.id = vcm.classification_id`
```

- [ ] **Step 3: `schedules.ts` — import do helper**

Na linha 3, após o import de `auth`, adicionar:

```ts
import { attachGroups } from "../lib/voice.js";
```

- [ ] **Step 4: `GET /` e `/my` com grupos**

Trocar o handler `GET /` (linhas 32-48), mantendo a lógica e adicionando attach + status:

```ts
scheduleRoutes.get("/", requireRole("ADMIN", "LEADER"), async (c) => {
  const month = c.req.query("month");
  const scope = await scopeClause(c);
  let sql = SELECT_JOIN;
  const binds: any[] = [];
  const wheres: string[] = [];
  if (month) {
    wheres.push("substr(e.event_date, 1, 7) = ?");
    binds.push(month);
  }
  if (wheres.length) sql += ` WHERE ${wheres.join(" AND ")}`;
  sql += scope.sql;
  binds.push(...scope.binds);
  sql += " ORDER BY e.event_date ASC, r.name ASC";
  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  const list = rows.results as any[];
  await attachGroups(c.env.DB, list);
  for (const r of list) if (r.group_id == null) r.group = null;
  return c.json(list);
});
```

Trocar o handler `GET /my` (linhas 50-56) por:

```ts
scheduleRoutes.get("/my", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare(
    `${SELECT_JOIN} WHERE s.user_id = ? OR s.id IN (SELECT schedule_id FROM schedule_group_members WHERE user_id = ?) ORDER BY e.event_date ASC`,
  )
    .bind(user.sub, user.sub)
    .all();
  const list = rows.results as any[];
  await attachGroups(c.env.DB, list);
  for (const r of list) if (r.group_id == null) r.group = null;
  const groupRows = list.filter((r) => r.group_id != null);
  if (groupRows.length > 0) {
    const sids = groupRows.map((r) => Number(r.id));
    const mine = await c.env.DB
      .prepare(
        `SELECT schedule_id, status FROM schedule_group_members WHERE user_id = ? AND schedule_id IN (${sids.map(() => "?").join(",")})`,
      )
      .bind(user.sub, ...sids)
      .all();
    const smap = new Map((mine.results as any[]).map((m) => [Number(m.schedule_id), String(m.status)]));
    for (const r of groupRows) {
      const st = smap.get(Number(r.id));
      if (st) r.status = st;
    }
  }
  return c.json(list);
});
```

- [ ] **Step 5: `PATCH /:id` com `group_id`**

Trocar o handler `PATCH /:id` (linhas 113-137) por:

```ts
scheduleRoutes.patch("/:id", requireRole("ADMIN", "LEADER"), async (c) => {
  const id = Number(c.req.param("id"));
  const { user_id, status, notes, group_id } = await c.req.json().catch(() => ({}));
  const schedule = await c.env.DB.prepare(
    `SELECT s.*, r.ministry_id FROM schedules s JOIN roles r ON r.id = s.role_id WHERE s.id = ?`,
  )
    .bind(id)
    .first<any>();
  if (!schedule) return c.json({ error: "Escala não encontrada" }, 404);
  if (!(await assertScope(c, schedule.ministry_id))) return c.json({ error: "Fora do seu ministério" }, 403);

  if (group_id !== undefined) {
    if (group_id === null) {
      await c.env.DB.batch([
        c.env.DB.prepare("DELETE FROM schedule_group_members WHERE schedule_id = ?").bind(id),
        c.env.DB.prepare("UPDATE schedules SET group_id = NULL, user_id = NULL, status = 'PENDING' WHERE id = ?").bind(id),
      ]);
      return c.json({ ok: true });
    }
    const group = await c.env.DB.prepare("SELECT id, ministry_id FROM voice_groups WHERE id = ?")
      .bind(Number(group_id))
      .first<any>();
    if (!group) return c.json({ error: "Grupo não encontrado" }, 404);
    if (Number(group.ministry_id) !== Number(schedule.ministry_id)) {
      return c.json({ error: "Grupo de outro ministério" }, 400);
    }
    const members = await c.env.DB.prepare(
      "SELECT user_id FROM voice_group_members WHERE group_id = ? ORDER BY position, user_id",
    )
      .bind(Number(group_id))
      .all();
    if (members.results.length === 0) return c.json({ error: "Grupo sem membros" }, 400);
    const inserts = (members.results as any[]).map((m) =>
      c.env.DB.prepare(
        "INSERT OR IGNORE INTO schedule_group_members (schedule_id, user_id, status) VALUES (?, ?, 'PENDING')",
      ).bind(id, Number(m.user_id)),
    );
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM schedule_group_members WHERE schedule_id = ?").bind(id),
      c.env.DB.prepare("UPDATE schedules SET group_id = ?, user_id = NULL, status = 'PENDING' WHERE id = ?").bind(
        Number(group_id),
        id,
      ),
      ...inserts,
    ]);
    return c.json({ ok: true });
  }

  if (user_id !== undefined && user_id !== null && user_id !== schedule.user_id) {
    const ok = await checkAvailability(c.env, user_id, schedule.event_id);
    if (!ok) return c.json({ error: "Voluntário indisponível ou já escalado neste evento" }, 400);
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM schedule_group_members WHERE schedule_id = ?").bind(id),
      c.env.DB.prepare("UPDATE schedules SET user_id = ?, group_id = NULL, status = 'PENDING' WHERE id = ?").bind(user_id, id),
    ]);
    return c.json({ ok: true });
  }
  if (user_id === null) {
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM schedule_group_members WHERE schedule_id = ?").bind(id),
      c.env.DB.prepare("UPDATE schedules SET user_id = NULL, group_id = NULL, status = 'PENDING' WHERE id = ?").bind(id),
    ]);
    return c.json({ ok: true });
  }
  await c.env.DB.prepare("UPDATE schedules SET status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ?")
    .bind(status ?? null, notes ?? null, id)
    .run();
  return c.json({ ok: true });
});
```

- [ ] **Step 6: `POST /:id/respond` com grupo**

Trocar o handler `respond` (linhas 139-148) por:

```ts
scheduleRoutes.post("/:id/respond", async (c) => {
  const user = c.get("user");
  const { status } = await c.req.json().catch(() => ({}));
  if (status !== "CONFIRMED" && status !== "DECLINED") return c.json({ error: "Status inválido" }, 400);
  const id = Number(c.req.param("id"));
  const schedule = await c.env.DB.prepare("SELECT id, group_id FROM schedules WHERE id = ?")
    .bind(id)
    .first<any>();
  if (!schedule) return c.json({ error: "Escala não encontrada" }, 404);
  if (schedule.group_id != null) {
    const r = await c.env.DB.prepare(
      "UPDATE schedule_group_members SET status = ? WHERE schedule_id = ? AND user_id = ?",
    )
      .bind(status, id, user.sub)
      .run();
    if (r.meta.changes === 0) return c.json({ error: "Você não está escalado nesta vaga" }, 404);
    return c.json({ ok: true });
  }
  const r = await c.env.DB.prepare("UPDATE schedules SET status = ? WHERE id = ? AND user_id = ?")
    .bind(status, id, user.sub)
    .run();
  if (r.meta.changes === 0) return c.json({ error: "Escala não encontrada para este usuário" }, 404);
  return c.json({ ok: true });
});
```

- [ ] **Step 7: `events.ts` — slots com grupo e classificação**

Na query de slots (linha 27), trocar por:

```ts
    `SELECT s.*, r.name AS role_name, m.name AS ministry_name, m.id AS ministry_id, u.name AS user_name, u.avatar_url AS user_avatar,
       vcm.classification_id AS user_classification_id, vc.name AS user_classification, vc.color AS user_classification_color
     FROM schedules s
     JOIN roles r ON r.id = s.role_id
     JOIN ministries m ON m.id = r.ministry_id
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN voice_classification_members vcm ON vcm.user_id = u.id
     LEFT JOIN voice_classifications vc ON vc.id = vcm.classification_id ${roleWhere}`,
```

Após a linha 34 (`.all()` dos slots) e antes do `result`, adicionar:

```ts
  const slotList = slots.results as any[];
  await attachGroups(c.env.DB, slotList);
  for (const s of slotList) if (s.group_id == null) s.group = null;
```

E trocar a linha 37:

```ts
    slots: (slots.results as any[]).filter((s) => s.event_id === e.id),
```

Por:

```ts
    slots: slotList.filter((s) => s.event_id === e.id),
```

Import na linha 3 de `events.ts`:

```ts
import { attachGroups } from "../lib/voice.js";
```

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: exit 0

- [ ] **Step 9: Commit**

```bash
git add server/lib/voice.ts server/routes/schedules.ts server/routes/events.ts
git commit -m "feat: escala com grupo — group_id, status individual e attachGroups"
```

---

### Task 5: Tipos + `VoiceBadge` + contexto `leaderMinistryIds`

**Files:**
- Modify: `shared/types.ts`
- Create: `src/components/VoiceBadge.tsx`
- Modify: `src/lib/auth.tsx`

- [ ] **Step 1: Tipos em `shared/types.ts`**

Após a interface `MinistryMember`, adicionar:

```ts
export interface VoiceClassification {
  id: number;
  name: string;
  gender: "F" | "M";
  color: string;
  sort_order: number;
}

export interface MemberClassification {
  id: number;
  name: string;
  color: string;
}

export interface VoiceGroupMember {
  user_id: number;
  name: string;
  avatar_url: string | null;
  classification: string | null;
  classification_color: string | null;
}

export interface VoiceGroup {
  id: number;
  ministry_id: number;
  kind: "VOZ" | "MUSICO";
  name: string;
  members: VoiceGroupMember[];
}

export interface ScheduleGroupMember {
  user_id: number;
  name: string;
  avatar_url: string | null;
  classification: string | null;
  classification_color: string | null;
  status: ScheduleStatus;
}

export interface ScheduleGroup {
  id: number;
  name: string;
  kind: string;
  members: ScheduleGroupMember[];
}
```

Na interface `MinistryMember` (linha 35), após `avatar_url: string | null;` adicionar:

```ts
  classification: MemberClassification | null;
```

Na interface `Schedule`, após `user_avatar?: string | null;` adicionar:

```ts
  user_classification?: string | null;
  user_classification_color?: string | null;
  group?: ScheduleGroup | null;
```

Na interface `EventItem`, em `slots?: Schedule[]` — nada muda (slots herda `Schedule`).

- [ ] **Step 2: Criar `src/components/VoiceBadge.tsx`**

```tsx
interface VoiceBadgeProps {
  name: string;
  color: string;
  className?: string;
}

export function VoiceBadge({ name, color, className = "" }: VoiceBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${className}`}>
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}
```

- [ ] **Step 3: `src/lib/auth.tsx` — `leaderMinistryIds` no contexto**

Ler o arquivo primeiro. Trocar a interface `AuthState` (linha ~7) para incluir:

```ts
  leaderMinistryIds: number[];
```

No `AuthProvider`, após `const [ministries, setMinistries] = useState<Ministry[]>([]);` (linha 27), adicionar:

```ts
  const [leaderMinistryIds, setLeaderMinistryIds] = useState<number[]>([]);
```

No `refresh` (linha 30-36), após `setMinistries(data.ministries);` adicionar:

```ts
      setLeaderMinistryIds(data.leader_ministry_ids ?? []);
```

E o tipo do `api.get` em `refresh` passa a ser:

```ts
{ user: User; ministries: Ministry[]; leader_ministry_ids: number[] }
```

Nos dois `useMemo`/`useCallback` de valor do contexto (linhas 79-80), incluir `leaderMinistryIds`:

```ts
    () => ({ user, ministries, leaderMinistryIds, loading, login, register, logout, refresh }),
    [user, ministries, leaderMinistryIds, loading, login, register, logout, refresh],
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts src/components/VoiceBadge.tsx src/lib/auth.tsx
git commit -m "feat: tipos de voz/grupos, componente VoiceBadge e leaderMinistryIds no contexto"
```

---

### Task 6: Frontend — rota/guard/menu + GruposPage

**Files:**
- Create: `src/pages/GruposPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: `src/App.tsx` — guard e rota**

Após o import da linha 14, adicionar:

```tsx
import { GruposPage } from "./pages/GruposPage";
```

Após o componente `LouvorOnly` (linha 37), adicionar:

```tsx
function GruposOnly({ children }: { children: React.ReactNode }) {
  const { user, loading, leaderMinistryIds } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  const allowed = user.role === "ADMIN" || leaderMinistryIds.includes(1);
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

Antes da rota `/playlists` (linha 89), adicionar:

```tsx
                <Route
                  path="/grupos"
                  element={
                    <GruposOnly>
                      <GruposPage />
                    </GruposOnly>
                  }
                />
```

- [ ] **Step 2: `AppShell.tsx` — item de menu**

Na linha 17 (import de ícones lucide), adicionar `Shapes`:

```ts
  ListMusic,
  Shapes,
  Menu,
```

Na linha 37 (`const playlistNav = ...`), após, adicionar:

```ts
  const showGrupos = admin || (leader && leaderMinistryIds.includes(1));
  const gruposNav = showGrupos ? [{ to: "/grupos", label: "Grupos", icon: Shapes }] : [];
```

`leaderMinistryIds` vem do `useAuth()` na linha 37 — trocar a destruturação:

```ts
  const { user, logout, ministries, leaderMinistryIds } = useAuth();
```

No `desktopNav` (linhas 44-53), trocar `...playlistNav,` (linha 50) por `...gruposNav,\n        ...playlistNav,`.

No `bottomNav` (linhas 55-63), trocar `...playlistNav,` (linha 61) por `...gruposNav,\n        ...playlistNav,`.

- [ ] **Step 3: Criar `src/pages/GruposPage.tsx`**

```tsx
import { useState } from "react";
import { Plus, Pencil, Trash2, X, UserPlus, Users, Music, Mic } from "lucide-react";
import { api } from "../lib/api";
import { useAsyncData } from "../lib/use-async-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, Field } from "../components/ui/input";
import { Dialog } from "../components/ui/dialog";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Badge } from "../components/ui/badge";
import { toast } from "../components/ui/toast";
import { PersonAvatar } from "../components/ui/person-avatar";
import { VoiceBadge } from "../components/VoiceBadge";
import { ErrorState, EmptyState, ListSkeleton } from "../components/ui/load-state";
import type { MinistryMember, VoiceClassification, VoiceGroup } from "../../shared/types";

type Tab = "vocal" | "grupos";

export function GruposPage() {
  const [tab, setTab] = useState<Tab>("vocal");
  const [classTarget, setClassTarget] = useState<MinistryMember | null>(null);
  const [classChoice, setClassChoice] = useState<string>("");
  const [newKind, setNewKind] = useState<"VOZ" | "MUSICO" | null>(null);
  const [newName, setNewName] = useState("");
  const [renameTarget, setRenameTarget] = useState<VoiceGroup | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<VoiceGroup | null>(null);
  const [addTarget, setAddTarget] = useState<VoiceGroup | null>(null);
  const [addQ, setAddQ] = useState("");

  const membersQ = useAsyncData<MinistryMember[]>(() => api.get<MinistryMember[]>("/ministries/1/members"), []);
  const classesQ = useAsyncData<{ classifications: VoiceClassification[]; mine: number | null }>(
    () => api.get("/voice/classifications"),
    [],
  );
  const groupsQ = useAsyncData<VoiceGroup[]>(() => api.get<VoiceGroup[]>("/voice/groups"), []);

  const members = membersQ.data ?? [];
  const classifications = classesQ.data?.classifications ?? [];
  const groups = groupsQ.data ?? [];
  const load = () => {
    membersQ.reload();
    groupsQ.reload();
  };

  const openClassify = (m: MinistryMember) => {
    setClassTarget(m);
    setClassChoice(m.classification ? String(m.classification.id) : "");
  };

  const saveClassification = async () => {
    if (!classTarget) return;
    try {
      await api.put(`/users/${classTarget.id}/voice-classification`, {
        classification_id: classChoice ? Number(classChoice) : null,
      });
      toast("Classificação salva!");
      setClassTarget(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const createGroup = async () => {
    if (!newKind || !newName.trim()) return;
    try {
      await api.post("/voice/groups", { kind: newKind, name: newName.trim() });
      toast("Grupo criado!");
      setNewKind(null);
      setNewName("");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const renameGroup = async () => {
    if (!renameTarget || !renameName.trim()) return;
    try {
      await api.put(`/voice/groups/${renameTarget.id}`, { name: renameName.trim() });
      toast("Grupo renomeado!");
      setRenameTarget(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const deleteGroup = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/voice/groups/${deleteTarget.id}`);
      toast("Grupo excluído. Vagas futuras voltaram a ficar em aberto.");
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const addMember = async (group: VoiceGroup, userId: number) => {
    try {
      await api.post(`/voice/groups/${group.id}/members`, { user_id: userId });
      toast("Membro adicionado!");
      setAddTarget(null);
      setAddQ("");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const removeMember = async (group: VoiceGroup, userId: number) => {
    try {
      await api.delete(`/voice/groups/${group.id}/members/${userId}`);
      toast("Membro removido do grupo.");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  if (membersQ.status === "error" && membersQ.error) {
    return <ErrorState message={membersQ.error} onRetry={membersQ.reload} />;
  }
  if (membersQ.status === "loading" || classesQ.status === "loading" || groupsQ.status === "loading") {
    return <ListSkeleton rows={4} />;
  }

  const unclassified = members.filter((m) => !m.classification);

  const renderMemberRow = (m: MinistryMember, showClassify: boolean) => (
    <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
      <div className="flex min-w-0 items-center gap-3">
        <PersonAvatar name={m.name} avatarUrl={m.avatar_url} />
        <div className="min-w-0">
          <p className="truncate font-medium">{m.name}</p>
          {m.classification && <VoiceBadge name={m.classification.name} color={m.classification.color} />}
        </div>
      </div>
      {showClassify && (
        <Button size="sm" variant="outline" onClick={() => openClassify(m)}>
          <Pencil size={14} /> Classificar
        </Button>
      )}
    </div>
  );

  const renderGroup = (group: VoiceGroup) => (
    <Card key={group.id}>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {group.kind === "VOZ" ? <Mic size={16} className="text-primary" /> : <Music size={16} className="text-primary" />}
            {group.name}
          </CardTitle>
          <CardDescription>{group.members.length} membro(s)</CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={() => { setAddTarget(group); setAddQ(""); }}>
            <UserPlus size={14} /> Adicionar
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setRenameTarget(group); setRenameName(group.name); }}>
            <Pencil size={14} />
          </Button>
          <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeleteTarget(group)}>
            <Trash2 size={14} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {group.members.map((m) => (
          <div key={m.user_id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
            <div className="flex min-w-0 items-center gap-3">
              <PersonAvatar name={m.name} avatarUrl={m.avatar_url} />
              <div className="min-w-0">
                <p className="truncate font-medium">{m.name}</p>
                {m.classification && m.classification_color && (
                  <VoiceBadge name={m.classification} color={m.classification_color} />
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeMember(group, m.user_id)}
              aria-label={`Remover ${m.name} do grupo`}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        ))}
        {group.members.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum membro — clique em Adicionar.</p>
        )}
      </CardContent>
    </Card>
  );

  const vozGroups = groups.filter((g) => g.kind === "VOZ");
  const musicGroups = groups.filter((g) => g.kind === "MUSICO");
  const addCandidates = addTarget
    ? members.filter(
        (m) =>
          !addTarget.members.some((gm) => gm.user_id === m.id) &&
          (addQ.trim() === "" ||
            m.name.toLowerCase().includes(addQ.toLowerCase()) ||
            m.email.toLowerCase().includes(addQ.toLowerCase())),
      )
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Grupos do Louvor</h1>
        <p className="text-xs text-muted-foreground">
          Classifique as vozes e monte grupos de vozes e músicos para escalar na esquiva
        </p>
      </div>

      <div className="flex gap-2" role="tablist" aria-label="Seções">
        {([
          { id: "vocal" as Tab, label: "Vocal", icon: Mic },
          { id: "grupos" as Tab, label: "Grupos", icon: Users },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium ${
              tab === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === "vocal" ? (
        <div className="space-y-4">
          {members.length === 0 && (
            <EmptyState title="Nenhum membro no Louvor" hint="Vincule voluntários ao ministério em Ministérios." />
          )}
          {classifications.map((cls) => {
            const inClass = members.filter((m) => m.classification?.id === cls.id);
            return (
              <section
                key={cls.id}
                className="space-y-2 rounded-2xl border p-4"
                style={{ borderColor: cls.color, backgroundColor: `${cls.color}10` }}
              >
                <h2 className="text-sm font-bold" style={{ color: cls.color }}>
                  {cls.name} ({cls.gender === "F" ? "Feminina" : "Masculina"}) — {inClass.length}
                </h2>
                {inClass.map((m) => renderMemberRow(m, true))}
                {inClass.length === 0 && <p className="text-xs text-muted-foreground">Ninguém nesta classificação.</p>}
              </section>
            );
          })}
          <section className="space-y-2 rounded-2xl border border-dashed p-4">
            <h2 className="text-sm font-bold text-muted-foreground">Sem classificação — {unclassified.length}</h2>
            {unclassified.map((m) => renderMemberRow(m, true))}
            {unclassified.length === 0 && (
              <p className="text-xs text-muted-foreground">Todos os membros têm classificação.</p>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          {([
            { kind: "VOZ" as const, title: "Grupos de Voz", list: vozGroups },
            { kind: "MUSICO" as const, title: "Grupos de Músicos", list: musicGroups },
          ]).map(({ kind, title, list }) => (
            <section key={kind} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-muted-foreground">{title}</h2>
                <Button size="sm" onClick={() => setNewKind(kind)}>
                  <Plus size={14} /> Novo grupo
                </Button>
              </div>
              {list.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum grupo — crie o primeiro com "Novo grupo".</p>
              )}
              {list.map(renderGroup)}
            </section>
          ))}
        </div>
      )}

      <Dialog
        open={!!classTarget}
        onClose={() => setClassTarget(null)}
        title={`Classificar — ${classTarget?.name ?? ""}`}
      >
        <div className="space-y-2" role="listbox" aria-label="Classificações">
          <button
            type="button"
            role="option"
            aria-selected={classChoice === ""}
            onClick={() => setClassChoice("")}
            className={`w-full rounded-lg p-3 text-left text-sm ${classChoice === "" ? "bg-primary/10" : "hover:bg-muted"}`}
          >
            Sem classificação
          </button>
          {classifications.map((cls) => (
            <button
              key={cls.id}
              type="button"
              role="option"
              aria-selected={classChoice === String(cls.id)}
              onClick={() => setClassChoice(String(cls.id))}
              className={`flex w-full items-center justify-between rounded-lg p-3 text-left text-sm ${
                classChoice === String(cls.id) ? "bg-primary/10" : "hover:bg-muted"
              }`}
            >
              <VoiceBadge name={cls.name} color={cls.color} />
              <span className="text-xs text-muted-foreground">{cls.gender === "F" ? "Feminina" : "Masculina"}</span>
            </button>
          ))}
        </div>
        <Button className="mt-4 w-full" onClick={saveClassification}>
          Salvar
        </Button>
      </Dialog>

      <Dialog open={!!newKind} onClose={() => setNewKind(null)} title="Novo grupo">
        <div className="space-y-4">
          <Field label="Tipo">
            <Badge variant="secondary">{newKind === "VOZ" ? "Grupo de Voz" : "Grupo de Músicos"}</Badge>
          </Field>
          <Field label="Nome">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Grupo A" autoFocus />
          </Field>
          <Button className="w-full" onClick={createGroup} disabled={!newName.trim()}>
            Criar grupo
          </Button>
        </div>
      </Dialog>

      <Dialog open={!!renameTarget} onClose={() => setRenameTarget(null)} title="Renomear grupo">
        <div className="space-y-4">
          <Field label="Nome">
            <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} autoFocus />
          </Field>
          <Button className="w-full" onClick={renameGroup} disabled={!renameName.trim()}>
            Salvar
          </Button>
        </div>
      </Dialog>

      <Dialog open={!!addTarget} onClose={() => { setAddTarget(null); setAddQ(""); }} title={`Adicionar em — ${addTarget?.name ?? ""}`}>
        <div className="space-y-4">
          <Input value={addQ} onChange={(e) => setAddQ(e.target.value)} placeholder="Buscar por nome ou email..." />
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border p-2">
            {addCandidates.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => addTarget && addMember(addTarget, m.id)}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm hover:bg-muted"
              >
                <PersonAvatar name={m.name} avatarUrl={m.avatar_url} className="h-7 w-7 text-[10px]" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{m.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                </span>
              </button>
            ))}
            {addCandidates.length === 0 && (
              <p className="p-2 text-sm text-muted-foreground">Nenhum disponível (todos já estão no grupo ou sem resultado).</p>
            )}
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir grupo"
        description={
          deleteTarget
            ? `Excluir "${deleteTarget.name}"? Escalas futuras com este grupo voltarão a ficar em aberto.`
            : undefined
        }
        confirmLabel="Excluir"
        destructive
        onConfirm={deleteGroup}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
```

Corrigir typo do comentário: "na esquiva" → "na escala" (linha do cabeçalho).

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck; if ($?) { npm run build }`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/layout/AppShell.tsx src/pages/GruposPage.tsx
git commit -m "feat: aba Grupos do Louvor (rota, guard, menu e GruposPage)"
```

---

### Task 7: Frontend — classificação em MinistriesPage + Perfil

**Files:**
- Modify: `src/pages/MinistriesPage.tsx`
- Modify: `src/pages/ProfilePage.tsx`

- [ ] **Step 1: `MinistriesPage.tsx` — imports e estado**

Na linha 15 (types), trocar:

```ts
import type { Ministry, MinistryMember, User } from "../../shared/types";
```

Por:

```ts
import type { Ministry, MinistryMember, User, VoiceClassification } from "../../shared/types";
```

Após o import de `PersonAvatar` (linha 13), adicionar:

```ts
import { VoiceBadge } from "../components/VoiceBadge";
```

Após `const [deleteTarget, ...]` (linha 33), adicionar:

```ts
  const [voiceTarget, setVoiceTarget] = useState<MinistryMember | null>(null);
  const [voiceChoice, setVoiceChoice] = useState<string>("");
```

Após `ministriesQ` (linha 38), adicionar:

```ts
  const classesQ = useAsyncData<{ classifications: VoiceClassification[] }>(
    () => api.get("/voice/classifications"),
    [],
  );
```

- [ ] **Step 2: `MinistriesPage.tsx` — handlers**

Após `deleteAccount` (que termina em volta da linha 100), adicionar:

```ts
  const openVoice = (m: MinistryMember) => {
    setVoiceTarget(m);
    setVoiceChoice(m.classification ? String(m.classification.id) : "");
  };

  const saveVoice = async () => {
    if (!voiceTarget) return;
    try {
      await api.put(`/users/${voiceTarget.id}/voice-classification`, {
        classification_id: voiceChoice ? Number(voiceChoice) : null,
      });
      toast("Classificação salva!");
      setVoiceTarget(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };
```

- [ ] **Step 3: `MinistriesPage.tsx` — props do MemberList**

No uso do `<MemberList>` (linha ~257), adicionar:

```tsx
                  classifications={classesQ.data?.classifications ?? []}
                  onClassify={(member) => openVoice(member)}
```

- [ ] **Step 4: `MinistriesPage.tsx` — MemberList renderiza classificação**

Na assinatura do `MemberList`, adicionar as props:

```ts
  classifications: VoiceClassification[];
  onClassify: (member: MinistryMember) => void;
```

(no tipo deprops e na destruturação)

Na linha do nome (onde tem `{m.name}` + selo Líder), após os badges de funções (`m.roles.length > 0 && ...`), adicionar dentro do `<div className="min-w-0">`:

```tsx
              {ministry.name === "Louvor" &&
                (m.classification ? (
                  <button type="button" onClick={() => onClassify(m)} className="mt-1 block hover:opacity-80">
                    <VoiceBadge name={m.classification.name} color={m.classification.color} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onClassify(m)}
                    className="mt-1 text-xs text-muted-foreground underline hover:text-primary"
                  >
                    Classificar voz
                  </button>
                ))}
```

- [ ] **Step 5: `MinistriesPage.tsx` — diálogo de classificação**

Antes do `<ConfirmDialog ... removeTarget>` (que abre com `open={!!removeTarget}`), adicionar:

```tsx
      <Dialog
        open={!!voiceTarget}
        onClose={() => setVoiceTarget(null)}
        title={`Classificação de voz — ${voiceTarget?.name ?? ""}`}
      >
        <div className="space-y-2" role="listbox" aria-label="Classificações">
          <button
            type="button"
            role="option"
            aria-selected={voiceChoice === ""}
            onClick={() => setVoiceChoice("")}
            className={`w-full rounded-lg p-3 text-left text-sm ${voiceChoice === "" ? "bg-primary/10" : "hover:bg-muted"}`}
          >
            Sem classificação
          </button>
          {(classesQ.data?.classifications ?? []).map((cls) => (
            <button
              key={cls.id}
              type="button"
              role="option"
              aria-selected={voiceChoice === String(cls.id)}
              onClick={() => setVoiceChoice(String(cls.id))}
              className={`flex w-full items-center justify-between rounded-lg p-3 text-left text-sm ${
                voiceChoice === String(cls.id) ? "bg-primary/10" : "hover:bg-muted"
              }`}
            >
              <VoiceBadge name={cls.name} color={cls.color} />
              <span className="text-xs text-muted-foreground">{cls.gender === "F" ? "Feminina" : "Masculina"}</span>
            </button>
          ))}
        </div>
        <Button className="mt-4 w-full" onClick={saveVoice}>
          Salvar
        </Button>
      </Dialog>
```

- [ ] **Step 6: `ProfilePage.tsx` — campo de classificação**

Após o import de `toast` (linha 10), adicionar:

```ts
import { useAsyncData } from "../lib/use-async-data";
import { VoiceBadge } from "../components/VoiceBadge";
import { Field as ProfileField, Select } from "../components/ui/input";
import type { VoiceClassification } from "../../shared/types";
```

(Verificar: `Field` já é importado na linha 9 — `import { Input, Field } from "../components/ui/input";` — então usar `Field` existente e importar só `Select` trocando a linha 9 para `import { Input, Field, Select } from "../components/ui/input";` e remover `ProfileField` do bloco novo.)

Na linha 9, trocar por:

```ts
import { Input, Field, Select } from "../components/ui/input";
```

Dentro do componente, após `const [savingPhoto, ...]` (linha 48), adicionar:

```ts
  const { leaderMinistryIds } = useAuth();
  const canEditVoice = user?.role === "ADMIN" || (leaderMinistryIds ?? []).includes(1);
  const classesQ = useAsyncData<{ classifications: VoiceClassification[]; mine: number | null }>(
    () => api.get("/voice/classifications"),
    [],
  );
  const [voiceChoice, setVoiceChoice] = useState<string>("");

  useEffect(() => {
    if (classesQ.data) setVoiceChoice(classesQ.data.mine !== null ? String(classesQ.data.mine) : "");
  }, [classesQ.data]);

  const saveVoice = async (value: string) => {
    setVoiceChoice(value);
    try {
      await api.put(`/users/${user!.id}/voice-classification`, {
        classification_id: value ? Number(value) : null,
      });
      toast("Classificação salva!");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro", "error");
    }
  };
```

Na linha 41 (`const { user, logout, refresh } = useAuth();`), trocar por:

```ts
  const { user, logout, refresh, leaderMinistryIds } = useAuth();
```

(e remover a linha duplicada `const { leaderMinistryIds } = useAuth();` do bloco adicionado acima).

No JSX, após o `Field label="Máx. de escalas por mês"` (fecha na linha 167) e antes de `Field label="Nova senha"` (linha 168), adicionar:

```tsx
            <Field label="Classificação de voz">
              {canEditVoice ? (
                <Select value={voiceChoice} onChange={(e) => saveVoice(e.target.value)}>
                  <option value="">Sem classificação</option>
                  {(classesQ.data?.classifications ?? []).map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} ({cls.gender === "F" ? "Feminina" : "Masculina"})
                    </option>
                  ))}
                </Select>
              ) : classesQ.data?.mine != null ? (
                (() => {
                  const mine = (classesQ.data?.classifications ?? []).find((c) => c.id === classesQ.data?.mine);
                  return mine ? <VoiceBadge name={mine.name} color={mine.color} /> : <span className="text-sm text-muted-foreground">—</span>;
                })()
              ) : (
                <span className="text-sm text-muted-foreground">Sem classificação</span>
              )}
            </Field>
```

- [ ] **Step 7: Typecheck + build**

Run: `npm run typecheck; if ($?) { npm run build }`
Expected: exit 0

- [ ] **Step 8: Commit**

```bash
git add src/pages/MinistriesPage.tsx src/pages/ProfilePage.tsx
git commit -m "feat: classificacao de voz na aba Ministerios e no Perfil"
```

---

### Task 8: Frontend — escala com grupos (matriz) + card na agenda

**Files:**
- Modify: `src/pages/ScheduleMatrixPage.tsx`
- Modify: `src/pages/AgendaPage.tsx`

- [ ] **Step 1: `ScheduleMatrixPage.tsx` — imports e estado**

Na linha 16 (types), trocar por:

```ts
import type { Candidate, EventItem, Ministry, Schedule, VoiceGroup } from "../../shared/types";
```

Após o import de `PersonAvatar` (linha 15), adicionar:

```ts
import { VoiceBadge } from "../components/VoiceBadge";
```

Após o estado `picker` (linha 26), trocar a declaração de `picker` para incluir grupos e aba:

```ts
  const [picker, setPicker] = useState<{
    schedule: Schedule;
    candidates: Candidate[];
    groups: VoiceGroup[];
    pickerTab: "pessoas" | "grupos";
  } | null>(null);
  const [chosenGroup, setChosenGroup] = useState<number | null>(null);
```

(`chosenUser` continua existente na linha 27.)

- [ ] **Step 2: `openPicker` busca grupos**

Trocar o `openPicker` (linhas 109-120) por:

```ts
  const openPicker = async (s: Schedule) => {
    setBusy(true);
    try {
      const [candidates, groups] = await Promise.all([
        api.get<Candidate[]>(`/schedules/candidates/${s.id}`),
        s.ministry_id === 1
          ? api.get<VoiceGroup[]>("/voice/groups").catch(() => [] as VoiceGroup[])
          : Promise.resolve([] as VoiceGroup[]),
      ]);
      setChosenUser("");
      setChosenGroup(null);
      setPicker({ schedule: s, candidates, groups, pickerTab: "pessoas" });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    } finally {
      setBusy(false);
    }
  };
```

- [ ] **Step 3: handler `assignGroup` + unaware de grupo no `unassign`**

Após o `assign` (que termina na linha 132), adicionar:

```ts
  const assignGroup = async () => {
    if (!picker || chosenGroup === null) return;
    try {
      await api.patch(`/schedules/${picker.schedule.id}`, { group_id: chosenGroup });
      toast("Grupo escalado!");
      setPicker(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };
```

Trocar o `unassign` (linhas 134-146) por:

```ts
  const unassign = (s: Schedule) => {
    const isGroup = !!s.group;
    setConfirm({
      title: "Liberar vaga",
      description: isGroup
        ? `Limpar o grupo "${s.group?.name}" de ${s.role_name}? A vaga voltará a ficar em aberto.`
        : `Remover ${s.user_name} de ${s.role_name}? A vaga voltará a ficar em aberto.`,
      confirmLabel: "Liberar vaga",
      destructive: true,
      run: async () => {
        await api.patch(`/schedules/${s.id}`, isGroup ? { group_id: null } : { user_id: null });
        toast("Vaga liberada");
        load();
      },
    });
  };
```

- [ ] **Step 4: render da vaga com grupo**

Na renderização do slot (bloco iniciado na linha 315 `return (<div key={s.id}...`), trocar o conteúdo do primeiro `<div className="flex min-w-0 items-center gap-3">` (o bloco com dot/avatar/texto, linhas 320-340 após a Task anterior) por:

```tsx
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`h-3 w-3 shrink-0 rounded-full ${groupDot(s)}`} />
                        {s.group ? (
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                              {s.role_name}
                              <Badge variant="secondary" className="gap-1 text-[10px]">
                                {s.group.kind === "VOZ" ? <Mic size={10} /> : <Music size={10} />}
                                {s.group.name}
                              </Badge>
                              <span className={groupCountClass(s)} aria-label="Status do grupo">
                                {groupCount(s)}
                              </span>
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {s.group.members.map((gm) => (
                                <span
                                  key={gm.user_id}
                                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px]"
                                >
                                  <PersonAvatar
                                    name={gm.name}
                                    avatarUrl={gm.avatar_url}
                                    className="h-4 w-4 text-[8px]"
                                  />
                                  {gm.name}
                                  {gm.classification_color && (
                                    <span
                                      aria-hidden="true"
                                      className="h-1.5 w-1.5 rounded-full"
                                      style={{ backgroundColor: gm.classification_color }}
                                    />
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : s.user_id ? (
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-medium">
                              {s.role_name}
                              {s.user_classification && s.user_classification_color && (
                                <VoiceBadge
                                  name={s.user_classification}
                                  color={s.user_classification_color}
                                  className="text-[10px]"
                                />
                              )}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{s.user_name}</p>
                          </div>
                        ) : (
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{s.role_name}</p>
                            <p className="truncate text-xs text-muted-foreground">Vaga em aberto</p>
                          </div>
                        )}
                      </div>
```

(Substitui o bloco com `PersonAvatar`/`?` adicionado na iteração anterior — agora `groupDot`/`groupCount` cobrem o dot para grupo; para vaga individual manter a semântica antiga: `dot` vira função. Ver Step 5.)

- [ ] **Step 5: helpers `groupDot`/`groupCount`/`groupCountClass` + ícones**

Na linha 2 (lucide), adicionar `Mic, Music`:

```ts
import { CalendarPlus, ChevronDown, Pencil, Plus, UserPlus, Trash2, ListPlus, Mic, Music } from "lucide-react";
```

Antes do `return (` principal (linha 176), adicionar:

```ts
  const groupMembers = (s: Schedule) => s.group?.members ?? [];
  const groupCount = (s: Schedule) => {
    const ms = groupMembers(s);
    const confirmed = ms.filter((m) => m.status === "CONFIRMED").length;
    return `${confirmed}/${ms.length}`;
  };
  const groupDot = (s: Schedule) => {
    if (!s.group) {
      return !s.user_id
        ? "bg-muted-foreground/50"
        : s.status === "CONFIRMED"
          ? "bg-success"
          : s.status === "DECLINED"
            ? "bg-destructive"
            : "bg-warning";
    }
    const ms = groupMembers(s);
    if (ms.some((m) => m.status === "DECLINED")) return "bg-destructive";
    if (ms.length > 0 && ms.every((m) => m.status === "CONFIRMED")) return "bg-success";
    return "bg-warning";
  };
  const groupCountClass = (s: Schedule) => {
    const ms = groupMembers(s);
    if (ms.some((m) => m.status === "DECLINED")) return "text-xs font-bold text-destructive";
    if (ms.length > 0 && ms.every((m) => m.status === "CONFIRMED")) return "text-xs font-bold text-success";
    return "text-xs font-bold text-warning";
  };
```

Remover a const `dot` antiga (linhas 307-314 dentro do map do slot) — o bloco Step 4 já a substitui.

- [ ] **Step 6: diálogo do picker — abas Pessoas/Grupos**

No diálogo do picker, o bloco `{picker.candidates.length === 0 ? (...)}` (linhas ~374-395+) — envolver as seções. Trocar o início do conteúdo do diálogo (após o `rounded-xl bg-muted` resumo, onde começa `{picker.candidates.length === 0 ?`) por:

```tsx
            {picker.groups.length > 0 && (
              <div className="flex gap-2" role="tablist" aria-label="Modo de escalação">
                {(["pessoas", "grupos"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={picker.pickerTab === t}
                    onClick={() => setPicker({ ...picker, pickerTab: t })}
                    className={`flex min-h-11 flex-1 items-center justify-center rounded-xl text-sm font-medium ${
                      picker.pickerTab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {t === "pessoas" ? "Pessoas" : "Grupos"}
                  </button>
                ))}
              </div>
            )}
            {picker.pickerTab === "grupos" && picker.groups.length > 0 ? (
              <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border p-2" role="listbox" aria-label="Grupos">
                {picker.groups
                  .filter((g) => g.ministry_id === picker.schedule.ministry_id)
                  .map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      role="option"
                      aria-selected={chosenGroup === g.id}
                      onClick={() => setChosenGroup(g.id)}
                      className={`flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm ${
                        chosenGroup === g.id ? "bg-primary/10" : "hover:bg-muted"
                      }`}
                    >
                      {g.kind === "VOZ" ? <Mic size={16} className="text-primary" /> : <Music size={16} className="text-primary" />}
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{g.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {g.members.length} membro(s)
                        </span>
                      </span>
                    </button>
                  ))}
                {picker.groups.filter((g) => g.ministry_id === picker.schedule.ministry_id).length === 0 && (
                  <p className="p-2 text-sm text-muted-foreground">Nenhum grupo para este ministério.</p>
                )}
              </div>
            ) : picker.candidates.length === 0 ? (
```

(O restante do diálogo — lista de candidatos com PersonAvatar e botão "Escalar voluntário" — permanece. Após o fechamento do bloco de candidatos, trocar o botão final:)

Localizar o botão:

```tsx
                <Button className="w-full" onClick={assign} disabled={!chosenUser}>
                  Escalar voluntário
                </Button>
```

Trocar por:

```tsx
                {picker.pickerTab === "grupos" && picker.groups.length > 0 ? (
                  <Button className="w-full" onClick={assignGroup} disabled={chosenGroup === null}>
                    Escalar grupo
                  </Button>
                ) : (
                  <Button className="w-full" onClick={assign} disabled={!chosenUser}>
                    Escalar voluntário
                  </Button>
                )}
```

(Abrir o picker com `s.group` existente: `openPicker` seta `pickerTab: "pessoas"` — ok, líder pode alternar.)

- [ ] **Step 7: `AgendaPage.tsx` — card de grupo**

Na linha 89 (badge de ministério/função), após, adicionar:

```tsx
              {s.group && (
                <Badge variant="secondary" className="gap-1">
                  <Users size={10} /> Grupo {s.group.name}
                </Badge>
              )}
```

Na linha 2 (lucide), adicionar `Users`:

```ts
import { Handshake, MapPin, UserSearch, Users } from "lucide-react";
```

Na linha 121 (botão "Solicitar troca"), trocar a condição:

```tsx
        {new Date(s.event_date!).getTime() > Date.now() && (
```

Por:

```tsx
        {new Date(s.event_date!).getTime() > Date.now() && !s.group && (
```

- [ ] **Step 8: Typecheck + build**

Run: `npm run typecheck; if ($?) { npm run build }`
Expected: exit 0

- [ ] **Step 9: Commit**

```bash
git add src/pages/ScheduleMatrixPage.tsx src/pages/AgendaPage.tsx
git commit -m "feat: escalar grupos na matriz e card de grupo na agenda"
```

---

### Task 9: Detector + smoke de grupos/voz + regressões

**Files:**
- Create: `%TEMP%\opencode\smoke-grupos-voz.mjs`

- [ ] **Step 1: Detector impeccable**

Run: `node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public`
Expected: exit 0, saída vazia

- [ ] **Step 2: Criar o smoke**

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

const admin = await login("admin@montesiao.org");
const louvor = await login("carlos@montesiao.org"); // líder do Louvor
const other = await login("ana@montesiao.org"); // líder de outro ministério
const vol = await login("maria@montesiao.org"); // voluntária

// 1. classificações
let res = await req("/voice/classifications", louvor);
let cls = await res.json();
check("GET classifications 200", res.status === 200, `got ${res.status}`);
check("6 classificações com cor", cls.classifications?.length === 6 && cls.classifications.every((c) => c.color?.startsWith("#")));
const sopranoId = cls.classifications.find((c) => c.name === "Soprano")?.id;

// 2. permissões de classificação
res = await req("/users/6/voice-classification", other, { method: "PUT", body: JSON.stringify({ classification_id: sopranoId }) });
check("líder de outro ministério 403", res.status === 403, `got ${res.status}`);
res = await req("/users/6/voice-classification", vol, { method: "PUT", body: JSON.stringify({ classification_id: sopranoId }) });
check("voluntário 403", res.status === 403, `got ${res.status}`);
res = await req("/users/6/voice-classification", louvor, { method: "PUT", body: JSON.stringify({ classification_id: sopranoId }) });
check("líder Louvor classifica 200", res.status === 200, `got ${res.status}`);
res = await req("/ministries/1/members", louvor);
let members = await res.json();
check("membro aparece classificado", members.find((m) => m.id === 6)?.classification?.name === "Soprano", JSON.stringify(members.find((m) => m.id === 6)?.classification));

// 3. permissão das rotas de grupo
res = await req("/voice/groups", other);
check("líder de outro ministério não vê grupos 403", res.status === 403, `got ${res.status}`);
res = await req("/voice/groups", vol);
check("voluntário não vê grupos 403", res.status === 403, `got ${res.status}`);

// 4. CRUD de grupo
res = await req("/voice/groups", louvor, { method: "POST", body: JSON.stringify({ kind: "VOZ", name: "Smoke Grupo X" }) });
const group = await res.json();
check("criar grupo VOZ 201", res.status === 201 && !!group.id, JSON.stringify(group));
res = await req("/voice/groups", louvor, { method: "POST", body: JSON.stringify({ kind: "MUSICO", name: "Smoke Grupo M" }) });
const gm = await res.json();
check("criar grupo MUSICO 201", res.status === 201 && !!gm.id);

// 5. adicionar/remover membro
res = await req(`/voice/groups/${group.id}/members`, louvor, { method: "POST", body: JSON.stringify({ user_id: 6 }) });
check("adicionar membro ao grupo 201", res.status === 201, `got ${res.status}`);
res = await req("/voice/groups", louvor);
let groups = await res.json();
check("grupo tem o membro", groups.find((g) => g.id === group.id)?.members.some((m) => m.user_id === 6) === true);

// 6. escalar grupo na vaga
res = await req("/events", admin, { method: "POST", body: JSON.stringify({ title: "Smoke Culto Voz", event_date: "2026-10-25T19:00:00" }) });
const ev = await res.json();
check("criar evento", !!ev.id, JSON.stringify(ev));
res = await req("/ministries", admin);
const mins = await res.json();
const role = mins.find((m) => Number(m.id) === 1)?.roles?.[0];
res = await req(`/events/${ev.id}/slots`, admin, { method: "POST", body: JSON.stringify({ role_id: role.id }) });
const slot = await res.json();
check("criar vaga", !!slot.id, JSON.stringify(slot));

res = await req(`/voice/groups`, louvor, { method: "POST", body: JSON.stringify({ kind: "VOZ", name: "Smoke Vazio" }) });
const empty = await res.json();
res = await req(`/schedules/${slot.id}`, louvor, { method: "PATCH", body: JSON.stringify({ group_id: empty.id }) });
check("grupo vazio 400", res.status === 400, `got ${res.status}`);

res = await req(`/schedules/${slot.id}`, louvor, { method: "PATCH", body: JSON.stringify({ group_id: group.id }) });
check("escalar grupo 200", res.status === 200, `got ${res.status}`);
res = await req(`/schedules?month=2026-10`, louvor);
let schedules = await res.json();
const s = schedules.find((x) => x.id === slot.id);
check("schedule retorna group com membros", s?.group?.id === group.id && (s?.group?.members?.length ?? 0) >= 1, JSON.stringify(s?.group ?? null));

// 7. respond individual do membro
res = await req(`/schedules/${slot.id}/respond`, vol, { method: "POST", body: JSON.stringify({ status: "CONFIRMED" }) });
check("membro do grupo confirma 200", res.status === 200, `got ${res.status}`);
res = await req(`/schedules/${slot.id}/respond`, other, { method: "POST", body: JSON.stringify({ status: "CONFIRMED" }) });
check("não-membro 404", res.status === 404, `got ${res.status}`);
res = await req("/schedules/my", vol);
let my = await res.json();
const myGroup = my.find((x) => x.id === slot.id);
check("/my traz vaga de grupo com status do membro", myGroup?.group?.id === group.id && myGroup?.status === "CONFIRMED", JSON.stringify(myGroup ?? null));

// 8. excluir grupo usado → vaga em aberto
res = await req(`/voice/groups/${group.id}`, louvor, { method: "DELETE" });
check("excluir grupo 200", res.status === 200, `got ${res.status}`);
res = await req(`/schedules?month=2026-10`, louvor);
schedules = await res.json();
const after = schedules.find((x) => x.id === slot.id);
check("vaga ficou em aberto", after?.group === null && after?.user_id == null, JSON.stringify(after ?? null));

// 9. limpando
await req(`/voice/groups/${gm.id}`, louvor, { method: "DELETE" });
await req(`/voice/groups/${empty.id}`, louvor, { method: "DELETE" });
await req(`/events/${ev.id}`, admin, { method: "DELETE" });
await req("/users/6/voice-classification", louvor, { method: "PUT", body: JSON.stringify({ classification_id: null }) });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Smoke local**

Run (dev em `localhost:5173`): `node "$env:TEMP\opencode\smoke-grupos-voz.mjs"`
Expected: ALL PASS. Subir dev se necessário: `Start-Process cmd -ArgumentList "/c npm run dev > %TEMP%\opencode\vite-dev.log 2>&1"` + sleep 8.

- [ ] **Step 4: Regressões locais**

Run: `node "$env:TEMP\opencode\smoke-min-leaders.mjs"; node "$env:TEMP\opencode\smoke-leaders.mjs"; node "$env:TEMP\opencode\smoke-playlists.mjs"; node "$env:TEMP\opencode\smoke-remocoes-avatar.mjs"`
Expected: ALL PASS em todos

---

### Task 10: Push + migração remota + deploy + smoke produção

- [ ] **Step 1: Push**

```bash
git push
```

- [ ] **Step 2: Assistir ao workflow**

```powershell
Start-Sleep -Seconds 5
$runId = (gh run list --limit 1 --json databaseId | ConvertFrom-Json)[0].databaseId
gh run watch $runId --exit-status
```

Expected: `success`

- [ ] **Step 3: Smoke em produção**

```powershell
$env:SMOKE_BASE = "https://escala-monte-siao.leoqueirozyt.workers.dev/api"
node "$env:TEMP\opencode\smoke-grupos-voz.mjs"
node "$env:TEMP\opencode\smoke-min-leaders.mjs"
node "$env:TEMP\opencode\smoke-leaders.mjs"
node "$env:TEMP\opencode\smoke-playlists.mjs"
node "$env:TEMP\opencode\smoke-remocoes-avatar.mjs"
```

Expected: todos ALL PASS

---

### Teste manual (entregar ao usuário)

1. `carlos@` → menu **Grupos** aparece; `ana@` e voluntário → menu ausente e `/grupos` redireciona.
2. Aba **Vocal**: classificar Maria como Soprano → badge rosa em Ministérios (Louvor), Grupos e Perfil dela.
3. Aba **Grupos**: criar "Grupo A" (Voz) e "Grupo M1" (Músicos), adicionar/remover membros, renomear, excluir.
4. `/escala`: na vaga do Louvor → Escalar → aba **Grupos** → "Grupo A" → vaga mostra membros com avatares e **0/N**; membros veem card "Grupo A" na agenda e confirmam individualmente; matriz atualiza para **N/N** verde.
5. Excluir grupo escalado → vaga volta a "Vaga em aberto".
