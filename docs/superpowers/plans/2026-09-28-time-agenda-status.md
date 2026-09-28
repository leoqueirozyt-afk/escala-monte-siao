# Plano — Time do culto na Agenda + correção de status de grupo

> **Spec:** `docs/superpowers/specs/2026-09-28-time-agenda-status-design.md` (aprovada, commit `6a99727`)
> **Branch:** `feature/minha-nova-funcionalidade` — **NÃO** empurrar em `main` (CI só publica `main`; sem deploy nesta leva)
> **Data:** 2026-09-28

## Goal

Implementar a spec aprovada: (1) corrigir o bug em que o membro vê "Vago"/"Vaga em aberto" em vaga de grupo confirmada, (2) expor o **time do culto** em seção recolhível no card da Agenda, (3) corrigir push ausente no grupo, membro tardio e relatório × grupos. Verificação TDD com smoke novo + DOM check headless + regressão dos 11 smokes existentes. Tudo local; push apenas para a branch.

## Architecture

- **Backend (Hono/D1):**
  - `server/routes/schedules.ts` — `PATCH /:id`: limpar `notes = NULL` nos UPDATEs de atribuição individual (`:206`) e de grupo (`:192`); branch de grupo passa a notificar cada membro via `notifyUser` (espelhando `:212-219`).
  - `server/routes/events.ts` — rota nova `GET /events/teams?ids=1,2,3` → `{ [event_id]: TeamMember[] }`, com filtro de acesso por assignment (ou ADMIN/LEADER) e 401 via `requireAuth` global (`events.ts:9`).
  - `server/routes/voice.ts` — ao adicionar membro ao grupo (`:100-102`), além de `voice_group_members`, `INSERT OR IGNORE` em `schedule_group_members` para as **escalas futuras** do grupo (`replace(event_date,'T',' ') >= datetime('now')`).
  - `server/routes/reports.ts` — participação via `UNION ALL` de assignments individuais + membros de grupo; `vacancies` = `user_id IS NULL AND group_id IS NULL`; `confirmed`/`declined` = slot individual no status OU slot de grupo com todos os membros no status.
- **Frontend (React/Tailwind v4):**
  - `src/components/StatusBadge.tsx` — `Pick<Schedule, "status" | "user_id" | "group">`: "Vago" só quando `user_id` nulo **e** sem grupo; variante segue o status quando há grupo.
  - `src/pages/AgendaPage.tsx` — 1 chamada a `/events/teams` (mapa `event_id → pessoas`), seção recolhível "Time do culto" por `schedule.id` no fim do `CardContent` (abaixo dos botões), linha com avatar + nome + `· você` + função + `StatusBadge`.
- **Sem migrations.** `shared/types.ts` ganha `TeamMember`.

## Tech Stack / comandos de verificação (por task)

```powershell
npm run typecheck                                              # tsc -b --noEmit
npm run build                                                  # tsc -b && vite build
node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public   # exit 0
node "$env:TEMP\opencode\smoke-time-agenda.mjs"                # SMOKE_BASE default local
```

Reiniciar o dev server após **qualquer** mudança em `server/` (o Vite não recarrega o worker):

```powershell
$c = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id $c.OwningProcess -Force }
Start-Process cmd -ArgumentList "/c npm run dev > %TEMP%\opencode\vite-dev.log 2>&1"
for ($i=0; $i -lt 40; $i++) { try { $r = Invoke-WebRequest -Uri http://localhost:5173/api/health -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { "health OK"; break } } catch {}; Start-Sleep 2 }
```

Regras: smokes e DOM scripts ficam em `%TEMP%\opencode\` (fora do repo, não commitam); commit ao final de **cada task** na branch; **rodar apenas local** (sem `SMOKE_BASE` de produção nesta leva).

## Fixtures do smoke (`smoke-time-agenda.mjs`)

Pré-limpeza no início (apaga resíduos "Smoke Time*" de execuções red anteriores — o smoke só chega ao cleanup no fim):

| Fixture | Conteúdo |
|---|---|
| `vol1`, `vol2` | usuários temp (`senha123`), vinculados ao Louvor (ministério 1, `roles[0]`) |
| `g1`, `g2` | grupos VOZ ("Smoke Time G1/G2"): g1 ← vol1+vol2; g2 ← vol1 |
| `ev1` 2027-06-05 | `slotA` (individual→vol1), `slotB` (grupo g1) |
| `ev2` 2027-06-12 | `slotC` (individual→vol2) — ev2 invisível para vol1 |
| `ev3` 2027-06-19 | `slotD` (grupo g2) — teste de membro tardio (futuro) |
| `ev4` 2026-08-15 | `slotE` (grupo g2) — passado, NÃO deve ganhar tardio |
| `ev5` 2027-07-04 | `slotF` (aberto), `slotG` (grupo g2, vol1+vol2 CONFIRMED) — mês exclusivo p/ relatório |

Sequência das seções: pré-limpeza → setup → notes → teams → tardio → relatório → cleanup. Esperados: notes verdes após Task 1; teams após Task 2; tardio+relatório após Task 3 (red até lá).

---

## Tasks

### Task 1 — StatusBadge + limpeza de `notes` (bug principal)

**1.1 Criar o smoke completo (red)** — `%TEMP%\opencode\smoke-time-agenda.mjs`, conteúdo exato:

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
const louvor = await login("carlos@montesiao.org");

// pré-limpeza de resíduos (execuções red anteriores param antes do cleanup)
const allEvents = await (await req("/events", admin)).json();
for (const ev of allEvents.filter((e) => String(e.title).startsWith("Smoke Time"))) {
  await req(`/events/${ev.id}`, admin, { method: "DELETE" });
}
const allGroups = await (await req("/voice/groups", louvor)).json();
for (const g of allGroups.filter((x) => String(x.name).startsWith("Smoke Time G"))) {
  await req(`/voice/groups/${g.id}`, louvor, { method: "DELETE" });
}

// --- usuários temporários ---
let res = await req("/users", admin, {
  method: "POST",
  body: JSON.stringify({ name: "Smoke Time Vol1", email: `smoke-time-vol1-${stamp}@montesiao.org`, password: "senha123", phone: `119${String(stamp).slice(-7)}1` }),
});
const vol1 = await res.json();
check("criar vol1", res.status === 201 && !!vol1.id, JSON.stringify(vol1));
res = await req("/users", admin, {
  method: "POST",
  body: JSON.stringify({ name: "Smoke Time Vol2", email: `smoke-time-vol2-${stamp}@montesiao.org`, password: "senha123", phone: `119${String(stamp).slice(-7)}2` }),
});
const vol2 = await res.json();
check("criar vol2", res.status === 201 && !!vol2.id, JSON.stringify(vol2));
const v1 = await login(`smoke-time-vol1-${stamp}@montesiao.org`);
const v2 = await login(`smoke-time-vol2-${stamp}@montesiao.org`);

// vincula ao Louvor
res = await req("/ministries", admin);
const mins = await res.json();
const louvorMin = mins.find((m) => Number(m.id) === 1);
const role = louvorMin?.roles?.[0];
check("ministério 1 tem função", !!role, JSON.stringify(louvorMin?.roles ?? null));
res = await req("/ministries/1/members", admin, { method: "POST", body: JSON.stringify({ user_id: vol1.id, role_id: role.id }) });
check("vincular vol1 ao Louvor", res.status === 201, `got ${res.status}`);
res = await req("/ministries/1/members", admin, { method: "POST", body: JSON.stringify({ user_id: vol2.id, role_id: role.id }) });
check("vincular vol2 ao Louvor", res.status === 201, `got ${res.status}`);

// --- grupos ---
res = await req("/voice/groups", louvor, { method: "POST", body: JSON.stringify({ kind: "VOZ", name: "Smoke Time G1" }) });
const g1 = await res.json();
check("criar grupo g1", res.status === 201 && !!g1.id, JSON.stringify(g1));
res = await req("/voice/groups", louvor, { method: "POST", body: JSON.stringify({ kind: "VOZ", name: "Smoke Time G2" }) });
const g2 = await res.json();
check("criar grupo g2", res.status === 201 && !!g2.id, JSON.stringify(g2));
res = await req(`/voice/groups/${g1.id}/members`, louvor, { method: "POST", body: JSON.stringify({ user_id: vol1.id }) });
check("g1 ← vol1", res.status === 201, `got ${res.status}`);
res = await req(`/voice/groups/${g1.id}/members`, louvor, { method: "POST", body: JSON.stringify({ user_id: vol2.id }) });
check("g1 ← vol2", res.status === 201, `got ${res.status}`);
res = await req(`/voice/groups/${g2.id}/members`, louvor, { method: "POST", body: JSON.stringify({ user_id: vol1.id }) });
check("g2 ← vol1", res.status === 201, `got ${res.status}`);

// --- eventos e vagas ---
async function mkEvent(title, date) {
  const r = await req("/events", admin, { method: "POST", body: JSON.stringify({ title, event_date: date }) });
  return await r.json();
}
async function mkSlot(evId) {
  const r = await req(`/events/${evId}/slots`, admin, { method: "POST", body: JSON.stringify({ role_id: role.id }) });
  return await r.json();
}
const ev1 = await mkEvent("Smoke Time Ev1", "2027-06-05T19:00:00");
const slotA = await mkSlot(ev1.id);
const slotB = await mkSlot(ev1.id);
const ev2 = await mkEvent("Smoke Time Ev2", "2027-06-12T19:00:00");
const slotC = await mkSlot(ev2.id);
const ev3 = await mkEvent("Smoke Time Ev3", "2027-06-19T19:00:00");
const slotD = await mkSlot(ev3.id);
const ev4 = await mkEvent("Smoke Time Ev4", "2026-08-15T19:00:00");
const slotE = await mkSlot(ev4.id);
const ev5 = await mkEvent("Smoke Time Ev5", "2027-07-04T19:00:00");
const slotF = await mkSlot(ev5.id);
const slotG = await mkSlot(ev5.id);
check(
  "criar eventos e vagas",
  [ev1, slotA, slotB, ev2, slotC, ev3, slotD, ev4, slotE, ev5, slotF, slotG].every((x) => x?.id),
  JSON.stringify({ ev1: ev1.id, ev5: ev5.id }),
);

// ===== notes =====
res = await req("/schedules?month=2027-06", admin);
let list = await res.json();
check("slotA nasce com 'Vaga em aberto'", list.find((x) => x.id === slotA.id)?.notes === "Vaga em aberto");
res = await req(`/schedules/${slotA.id}`, louvor, { method: "PATCH", body: JSON.stringify({ user_id: vol1.id }) });
check("atribuir individual 200", res.status === 200, `got ${res.status}`);
res = await req("/schedules?month=2027-06", admin);
list = await res.json();
check(
  "atribuição individual limpa notes",
  list.find((x) => x.id === slotA.id)?.notes == null,
  JSON.stringify(list.find((x) => x.id === slotA.id)?.notes),
);
check("slotB nasce com 'Vaga em aberto'", list.find((x) => x.id === slotB.id)?.notes === "Vaga em aberto");
res = await req(`/schedules/${slotB.id}`, louvor, { method: "PATCH", body: JSON.stringify({ group_id: g1.id }) });
check("escalar grupo no slotB 200", res.status === 200, `got ${res.status}`);
res = await req("/schedules?month=2027-06", admin);
list = await res.json();
check(
  "atribuição de grupo limpa notes",
  list.find((x) => x.id === slotB.id)?.notes == null,
  JSON.stringify(list.find((x) => x.id === slotB.id)?.notes),
);
res = await req(`/schedules/${slotC.id}`, louvor, { method: "PATCH", body: JSON.stringify({ user_id: vol2.id }) });
check("atribuir vol2 ao slotC (ev2) 200", res.status === 200, `got ${res.status}`);

// ===== /events/teams =====
res = await req(`/events/teams?ids=${ev1.id},${ev2.id}`, v1);
check("vol1 teams 200", res.status === 200, `got ${res.status}`);
let teams = await res.json().catch(() => ({}));
const t1 = teams[String(ev1.id)];
check("vol1 vê time do ev1 (3 linhas)", Array.isArray(t1) && t1.length === 3, JSON.stringify(t1));
check(
  "linha individual com role_name/status/is_me",
  t1?.some((m) => m.user_id === vol1.id && m.is_group === false && m.is_me === true && typeof m.role_name === "string" && typeof m.status === "string"),
  JSON.stringify(t1),
);
check("vol1 aparece no grupo (is_group)", t1?.some((m) => m.user_id === vol1.id && m.is_group === true), JSON.stringify(t1));
check("vol2 no grupo (is_group)", t1?.some((m) => m.user_id === vol2.id && m.is_group === true), JSON.stringify(t1));
check("ev2 fora do escopo do vol1 omitido", teams[String(ev2.id)] === undefined, JSON.stringify(Object.keys(teams)));
res = await req(`/events/teams?ids=${ev1.id},${ev2.id}`, admin);
teams = await res.json().catch(() => ({}));
check("admin vê ev1 e ev2", Array.isArray(teams[String(ev1.id)]) && Array.isArray(teams[String(ev2.id)]), JSON.stringify(Object.keys(teams)));
res = await req("/events/teams?ids=999999999", v1);
teams = await res.json().catch(() => ({}));
check("id sem acesso → objeto vazio", res.status === 200 && Object.keys(teams).length === 0, JSON.stringify(teams));
res = await req("/events/teams", v1);
check("sem ids → 400", res.status === 400, `got ${res.status}`);
res = await req("/events/teams?ids=abc", v1);
check("ids inválidos → 400", res.status === 400, `got ${res.status}`);
res = await fetch(`${base}/events/teams?ids=${ev1.id}`);
check("sem login → 401", res.status === 401, `got ${res.status}`);

// ===== status do membro (precondição do fix de badge) =====
res = await req(`/schedules/${slotB.id}/respond`, v1, { method: "POST", body: JSON.stringify({ status: "CONFIRMED" }) });
check("vol1 confirma slotB", res.status === 200, `got ${res.status}`);
res = await req(`/events/teams?ids=${ev1.id}`, v1);
teams = await res.json().catch(() => ({}));
const rowV1G = teams[String(ev1.id)]?.find((m) => m.user_id === vol1.id && m.is_group === true);
check("team reflete status CONFIRMED do membro", rowV1G?.status === "CONFIRMED", JSON.stringify(rowV1G));
res = await req("/schedules/my", v1);
let my = await res.json();
const myB = my.find((x) => x.id === slotB.id);
check(
  "/my: membro CONFIRMED, user_id nulo, grupo anexado",
  myB?.status === "CONFIRMED" && myB?.user_id == null && myB?.group?.id === g1.id,
  JSON.stringify(myB && { status: myB.status, user_id: myB.user_id, group: myB.group?.id }),
);

// ===== membro tardio =====
res = await req(`/schedules/${slotD.id}`, louvor, { method: "PATCH", body: JSON.stringify({ group_id: g2.id }) });
check("escalar g2 no slotD 200", res.status === 200, `got ${res.status}`);
res = await req(`/schedules/${slotE.id}`, louvor, { method: "PATCH", body: JSON.stringify({ group_id: g2.id }) });
check("escalar g2 no slotE 200", res.status === 200, `got ${res.status}`);
res = await req("/schedules/my", v2);
my = await res.json();
check("vol2 sem slotD antes de entrar no g2", !my.some((x) => x.id === slotD.id));
res = await req("/schedules?month=2027-06", admin);
list = await res.json();
check("slotD com 1 membro antes", list.find((x) => x.id === slotD.id)?.group?.members?.length === 1, JSON.stringify(list.find((x) => x.id === slotD.id)?.group));
res = await req(`/voice/groups/${g2.id}/members`, louvor, { method: "POST", body: JSON.stringify({ user_id: vol2.id }) });
check("g2 ← vol2 (membro tardio)", res.status === 201, `got ${res.status}`);
res = await req("/schedules/my", v2);
my = await res.json();
check("vol2 vê slotD em /my após entrar no grupo", my.some((x) => x.id === slotD.id), JSON.stringify(my.map((x) => x.id)));
res = await req(`/schedules/${slotD.id}/respond`, v2, { method: "POST", body: JSON.stringify({ status: "CONFIRMED" }) });
check("vol2 responde slotD → 200", res.status === 200, `got ${res.status}`);
res = await req("/schedules?month=2027-06", admin);
list = await res.json();
const dAfter = list.find((x) => x.id === slotD.id);
check(
  "escala futura ganhou o membro tardio",
  dAfter?.group?.members?.length === 2 && dAfter.group.members.some((m) => m.user_id === vol2.id),
  JSON.stringify(dAfter?.group),
);
res = await req("/schedules?month=2026-08", admin);
const past = await res.json();
const eAfter = past.find((x) => x.id === slotE.id);
check("escala passada NÃO ganhou o tardio", eAfter?.group?.members?.length === 1, JSON.stringify(eAfter?.group));

// ===== relatório (mês exclusivo 2027-07) =====
res = await req(`/schedules/${slotG.id}`, louvor, { method: "PATCH", body: JSON.stringify({ group_id: g2.id }) });
check("escalar g2 no slotG 200", res.status === 200, `got ${res.status}`);
res = await req(`/schedules/${slotG.id}/respond`, v1, { method: "POST", body: JSON.stringify({ status: "CONFIRMED" }) });
check("vol1 confirma slotG", res.status === 200, `got ${res.status}`);
res = await req(`/schedules/${slotG.id}/respond`, v2, { method: "POST", body: JSON.stringify({ status: "CONFIRMED" }) });
check("vol2 confirma slotG", res.status === 200, `got ${res.status}`);
res = await req("/reports/participation?month=2027-07", admin);
const rep = await res.json();
check("relatório 200", res.status === 200 && !!rep.summary, JSON.stringify(rep.summary ?? null));
check("summary: total_slots = 2", Number(rep.summary?.total_slots) === 2, JSON.stringify(rep.summary));
check("summary: vacancies = 1 (grupo não é vaga)", Number(rep.summary?.vacancies) === 1, JSON.stringify(rep.summary));
check("summary: confirmed = 1 (grupo todo confirmado)", Number(rep.summary?.confirmed) === 1, JSON.stringify(rep.summary));
check("summary: declined = 0", Number(rep.summary?.declined) === 0, JSON.stringify(rep.summary));
check("rows: vol1 aparece confirmado", rep.rows?.some((r) => r.user_id === vol1.id && Number(r.confirmed) >= 1), JSON.stringify(rep.rows));
check("rows: vol2 (só grupo) aparece confirmado", rep.rows?.some((r) => r.user_id === vol2.id && Number(r.confirmed) >= 1), JSON.stringify(rep.rows));

// ===== cleanup =====
for (const ev of [ev5, ev4, ev3, ev2, ev1]) await req(`/events/${ev.id}`, admin, { method: "DELETE" });
await req(`/voice/groups/${g1.id}`, louvor, { method: "DELETE" });
await req(`/voice/groups/${g2.id}`, louvor, { method: "DELETE" });
await req(`/users/${vol1.id}`, admin, { method: "DELETE" });
await req(`/users/${vol2.id}`, admin, { method: "DELETE" });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

> **Proteção red-run:** todos os parses `await res.json()` da seção `/events/teams` usam `.catch(() => ({}))` — na execução inicial a rota ainda não existe (404 de texto do Hono derrubaria o script); com o catch os checks falham graciosamente e o cleanup roda mesmo em red.

**1.2 Rodar (red):** `node "$env:TEMP\opencode\smoke-time-agenda.mjs"` — esperado: fixtures + 2 checks de notes "nasce com Vaga em aberto" verdes; **2 checks de limpeza de notes RED**; teams/tardio/relatório RED (404/contas erradas). Salvar a contagem.

**1.3 Editar `server/routes/schedules.ts`:**

- Branch de grupo (`:192`):

```ts
c.env.DB.prepare("UPDATE schedules SET group_id = ?, user_id = NULL, status = 'PENDING', notes = NULL WHERE id = ?").bind(
  Number(group_id),
  id,
),
```

- Branch individual (`:206`):

```ts
c.env.DB.prepare("UPDATE schedules SET user_id = ?, group_id = NULL, status = 'PENDING', notes = NULL WHERE id = ?").bind(user_id, id),
```

(Nada nos demais branches — swaps mantêm `swaps.ts:131` intacto.)

**1.4 Reescrever `src/components/StatusBadge.tsx`** (arquivo completo):

```tsx
import { Badge } from "./ui/badge";
import type { Schedule } from "../../shared/types";

export function statusVariant(status: string): "success" | "warning" | "destructive" | "muted" {
  if (status === "CONFIRMED") return "success";
  if (status === "DECLINED") return "destructive";
  return "warning";
}

export function statusLabel(schedule: Pick<Schedule, "status" | "user_id" | "group">): string {
  if (!schedule.user_id && !schedule.group) return "Vago";
  if (schedule.status === "CONFIRMED") return "Confirmado";
  if (schedule.status === "DECLINED") return "Recusado";
  return "Pendente";
}

export function StatusBadge({ schedule }: { schedule: Pick<Schedule, "status" | "user_id" | "group"> }) {
  const label = statusLabel(schedule);
  const variant = !schedule.user_id && !schedule.group ? "muted" : statusVariant(schedule.status);
  return <Badge variant={variant}>{label}</Badge>;
}
```

**1.5 Auditar consumers:** `Select-String -Path "src\**\*.tsx" -Pattern "StatusBadge|statusLabel"` deve apontar apenas `AgendaPage.tsx:86`, `DashboardPage.tsx:215`, `ScheduleMatrixPage.tsx:482` — todos passam `schedule={s}` com `Schedule` completo (campo `group` existe) e a matriz só renderiza quando `!s.group`. Se o `typecheck` reclamar de algum literal, adicionar `group: null` no literal.

**1.6 Verificar:** reiniciar dev server (seção de comandos) → `npm run typecheck` → `npm run build` → detector → smoke: agora **só** teams/tardio/relatório red (notes 2/2 verdes).

**1.7 Commit:** `feat(agenda): badge de grupo sem "Vago" + notes limpa ao escalar` — arquivos: `src/components/StatusBadge.tsx`, `server/routes/schedules.ts`.

### Task 2 — Rota `GET /events/teams` + card da Agenda

**2.1 `shared/types.ts`** — após `ScheduleGroup` (`:95-100`):

```ts
export interface TeamMember {
  user_id: number;
  name: string;
  avatar_url: string | null;
  role_name: string;
  status: ScheduleStatus;
  is_group: boolean;
  is_me: boolean;
}
```

**2.2 `server/routes/events.ts`** — import de tipo `import type { TeamMember } from "../../shared/types.js";` e rota logo após o `GET /` (fecho `});` da linha ~47, **antes** de `eventRoutes.post("/")`); `requireAuth` global já dá 401:

```ts
eventRoutes.get("/teams", async (c) => {
  const ids = [...new Set((c.req.query("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return c.json({ error: "Informe ids" }, 400);
  const user = c.get("user");
  const uid = Number(user.sub);
  let visible = ids;
  if (user.role !== "ADMIN" && user.role !== "LEADER") {
    const ph = ids.map(() => "?").join(",");
    const mine = await c.env.DB.prepare(
      `SELECT DISTINCT event_id FROM schedules WHERE event_id IN (${ph}) AND user_id = ?
       UNION
       SELECT DISTINCT s.event_id FROM schedule_group_members g JOIN schedules s ON s.id = g.schedule_id
       WHERE s.event_id IN (${ph}) AND g.user_id = ?`,
    )
      .bind(...ids, uid, ...ids, uid)
      .all();
    const allowed = new Set((mine.results as any[]).map((r) => Number(r.event_id)));
    visible = ids.filter((id) => allowed.has(id));
  }
  if (visible.length === 0) return c.json({});
  const vph = visible.map(() => "?").join(",");
  const rows = await c.env.DB.prepare(
    `SELECT s.event_id, u.id AS user_id, u.name AS name, u.avatar_url, r.name AS role_name, s.status AS status, 0 AS is_group
     FROM schedules s
     JOIN users u ON u.id = s.user_id
     JOIN roles r ON r.id = s.role_id
     WHERE s.event_id IN (${vph}) AND s.group_id IS NULL
     UNION ALL
     SELECT s.event_id, u.id AS user_id, u.name AS name, u.avatar_url, r.name AS role_name, g.status AS status, 1 AS is_group
     FROM schedule_group_members g
     JOIN schedules s ON s.id = g.schedule_id
     JOIN users u ON u.id = g.user_id
     JOIN roles r ON r.id = s.role_id
     WHERE s.event_id IN (${vph})
     ORDER BY name`,
  )
    .bind(...visible, ...visible)
    .all();
  const out: Record<string, TeamMember[]> = {};
  for (const r of rows.results as any[]) {
    const key = String(r.event_id);
    if (!out[key]) out[key] = [];
    out[key].push({
      user_id: Number(r.user_id),
      name: String(r.name),
      avatar_url: r.avatar_url ?? null,
      role_name: String(r.role_name),
      status: r.status,
      is_group: Number(r.is_group) === 1,
      is_me: Number(r.user_id) === uid,
    });
  }
  return c.json(out);
});
```

(Autorização conforme spec: assignment no evento **ou** ADMIN/LEADER; ids sem acesso somem; 400 sem/inválido.)

**2.3 `src/pages/AgendaPage.tsx`:**

- Imports: adicionar `ChevronDown` em `lucide-react` (`:2`); `TeamMember` em `../../shared/types` (`:15`).
- Estado: `const [openTeam, setOpenTeam] = useState<Record<number, boolean>>({});` (após `swapBusy`, `:22`).
- Após o `useAsyncData` de `/schedules/my` (`:24-27`):

```ts
const eventIdsKey = [...new Set(schedules.map((s) => s.event_id))].sort((a, b) => a - b).join(",");
const teamsVersion = schedules.map((s) => `${s.event_id}:${s.status}`).join(",");
const { data: teams = {} } = useAsyncData<Record<string, TeamMember[]>>(
  () => (eventIdsKey ? api.get<Record<string, TeamMember[]>>(`/events/teams?ids=${eventIdsKey}`) : Promise.resolve({})),
  [teamsVersion],
);
```

(1 chamada; `teamsVersion` no dep força refetch após Confirmar/Recusar; vazio → resolve `{}`.)

- `renderCard` (`:79`): trocar a assinura de expressão para bloco e adicionar a seção **após** os botões (fim do `CardContent`, antes de `</CardContent>` na linha original `:131`):

```tsx
const renderCard = (s: Schedule) => {
  const team = teams[String(s.event_id)] ?? [];
  const open = !!openTeam[s.id];
  return (
    <Card key={s.id}>
      {/* ...corpo existente inalterado (linhas 81-131)... */}
      {team.length > 0 && (
        <div className="mt-3 border-t pt-2">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-sm font-medium"
            aria-expanded={open}
            onClick={() => setOpenTeam((o) => ({ ...o, [s.id]: !o[s.id] }))}
          >
            <span className="flex items-center gap-2">
              <Users size={14} aria-hidden="true" /> Time do culto
              <Badge variant="outline">
                {team.length} {team.length === 1 ? "pessoa" : "pessoas"}
              </Badge>
            </span>
            <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <ul className="mt-2 space-y-1.5">
              {team.map((m) => (
                <li key={`${m.is_group ? "g" : "i"}-${m.user_id}`} className="flex items-center gap-2">
                  <PersonAvatar name={m.name} avatarUrl={m.avatar_url} className="h-7 w-7 text-xs" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {m.name}
                    {m.is_me && <span className="font-semibold text-primary"> · você</span>}
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      · {m.role_name}
                      {m.is_group ? " · grupo" : ""}
                    </span>
                  </span>
                  <StatusBadge schedule={{ status: m.status, user_id: m.user_id, group: null }} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
};
```

**2.4 Verificar:** reiniciar dev server → `typecheck` → `build` → detector → smoke: **teams + notes verdes**; tardio/relatório ainda red (esperado). Commit: `feat(agenda): rota /events/teams + seção "Time do culto" recolhível` — `shared/types.ts`, `server/routes/events.ts`, `src/pages/AgendaPage.tsx`.

### Task 3 — Push no grupo + membro tardio + relatório

**3.1 `server/routes/schedules.ts`** — branch de grupo, após o `c.env.DB.batch([...])` (linhas 190-197), antes do `return c.json({ ok: true });` (`:198`); `members` já existe (`:179-184`):

```ts
const ev = await c.env.DB.prepare("SELECT title, event_date FROM events WHERE id = ?")
  .bind(schedule.event_id)
  .first<any>();
const d = String(ev?.event_date ?? "");
schedulePush(
  c,
  (async () => {
    for (const m of members.results as any[]) {
      await notifyUser(c.env, Number(m.user_id), {
        title: "Você foi escalado",
        body: `${ev?.title ?? "Escala"} • ${d.slice(8, 10)}/${d.slice(5, 7)}`,
        url: "/agenda",
      });
    }
  })(),
);
```

(Não testável em smoke — `sendPushBatch` fire-and-forget sem efeito observável; evidência = code path espelhado + regressão `smoke-push`.)

**3.2 `server/routes/voice.ts`** — após o INSERT de `voice_group_members` (`:100-102`), antes do `return c.json({ ok: true }, 201);`:

```ts
await c.env.DB.prepare(
  `INSERT OR IGNORE INTO schedule_group_members (schedule_id, user_id, status)
   SELECT s.id, ?, 'PENDING' FROM schedules s JOIN events e ON e.id = s.event_id
   WHERE s.group_id = ? AND replace(e.event_date, 'T', ' ') >= datetime('now')`,
)
  .bind(user_id, groupId)
  .run();
```

**3.3 `server/routes/reports.ts`** — substituir as queries de `rows` (`:21-37`) e `summary` (`:38-51`):

```ts
const rows = await c.env.DB.prepare(
  `SELECT u.id AS user_id, u.name, u.avatar_url,
     SUM(CASE WHEN t.status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed,
     SUM(CASE WHEN t.status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
     SUM(CASE WHEN t.status = 'DECLINED' THEN 1 ELSE 0 END) AS declined,
     COUNT(*) AS total
   FROM (
     SELECT s.user_id AS uid, s.status AS status
     FROM schedules s
     JOIN events e ON e.id = s.event_id
     JOIN roles r ON r.id = s.role_id
     JOIN ministries m ON m.id = r.ministry_id
     WHERE substr(e.event_date, 1, 7) = ? AND s.user_id IS NOT NULL${ministryWhere}
     UNION ALL
     SELECT g.user_id AS uid, g.status AS status
     FROM schedule_group_members g
     JOIN schedules s ON s.id = g.schedule_id
     JOIN events e ON e.id = s.event_id
     JOIN roles r ON r.id = s.role_id
     JOIN ministries m ON m.id = r.ministry_id
     WHERE substr(e.event_date, 1, 7) = ?${ministryWhere}
   ) t
   JOIN users u ON u.id = t.uid
   GROUP BY u.id
   ORDER BY total DESC`,
)
  .bind(month, ...extraBinds, month, ...extraBinds)
  .all();
const summary = await c.env.DB.prepare(
  `SELECT
     COUNT(*) AS total_slots,
     SUM(CASE WHEN s.user_id IS NULL AND s.group_id IS NULL THEN 1 ELSE 0 END) AS vacancies,
     SUM(CASE WHEN (s.group_id IS NULL AND s.status = 'CONFIRMED')
           OR (s.group_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM schedule_group_members g WHERE g.schedule_id = s.id)
               AND NOT EXISTS (SELECT 1 FROM schedule_group_members g WHERE g.schedule_id = s.id AND g.status <> 'CONFIRMED'))
         THEN 1 ELSE 0 END) AS confirmed,
     SUM(CASE WHEN (s.group_id IS NULL AND s.status = 'DECLINED')
           OR (s.group_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM schedule_group_members g WHERE g.schedule_id = s.id)
               AND NOT EXISTS (SELECT 1 FROM schedule_group_members g WHERE g.schedule_id = s.id AND g.status <> 'DECLINED'))
         THEN 1 ELSE 0 END) AS declined
   FROM schedules s
   JOIN events e ON e.id = s.event_id
   JOIN roles r ON r.id = s.role_id
   JOIN ministries m ON m.id = r.ministry_id
   WHERE substr(e.event_date, 1, 7) = ?${ministryWhere}`,
)
  .bind(month, ...extraBinds)
  .first();
```

(Semântica dos cards: `total_slots`/`vacancies` = slots; `confirmed`/`declined` = slot individual no status OU slot de grupo com **todos** os membros nesse status — grupo misto conta em nenhum; detalhe por pessoa vive em `rows`.)

**3.4 Verificar:** reiniciar dev server → `typecheck` → `build` → detector → **smoke completo verde** → regressão da suíte local (12 smokes: 11 existentes + o novo):

```powershell
$s = "avisos","excluir-funcoes","excluir-ministerio","grupos-voz","leaders","min-leaders","playlists","push","remocoes-avatar","telefone","rebaixa-lider","time-agenda"
foreach ($n in $s) { node "$env:TEMP\opencode\smoke-$n.mjs"; if (-not $?) { "FALHOU: $n" } }
```

(12 arquivos no total — os 11 existentes + o novo.) Commit: `feat(agenda): push p/ grupo, membro tardio e relatorio com membros de grupo` — `server/routes/schedules.ts`, `server/routes/voice.ts`, `server/routes/reports.ts`.

### Task 4 — DOM check + evidência final + push da branch

**4.1 Criar `%TEMP%\opencode\domcheck-time.mjs`** (padrão CDP do repo; porta **9335**, `user-data-dir chrome-dbg-time`):

```js
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { createRequire } from "node:module";
const require = createRequire("C:/Users/Raptor/Pictures/ESCALA-MONTE SIÃO/package.json");
const WebSocket = require("ws");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9335;
const BASE = "http://localhost:5173";
const API = `${BASE}/api`;

let passed = 0, failed = 0;
const check = (name, ok, extra = "") => {
  if (ok) { passed++; console.log(`PASS ${name}`); }
  else { failed++; console.log(`FAIL ${name} ${extra}`); }
};

async function login(email) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "senha123" }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (r.headers.get("set-cookie") || "").split(";")[0];
}
async function req(path, cookie, opts = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers || {}) },
  });
}

// ---------- setup via API ----------
const stamp = Date.now();
const admin = await login("admin@montesiao.org");
const louvor = await login("carlos@montesiao.org");
for (const ev of (await (await req("/events", admin)).json()).filter((e) => String(e.title).startsWith("Smoke Time Culto"))) {
  await req(`/events/${ev.id}`, admin, { method: "DELETE" });
}
for (const g of (await (await req("/voice/groups", louvor)).json()).filter((x) => String(x.name).startsWith("Smoke Time DG"))) {
  await req(`/voice/groups/${g.id}`, louvor, { method: "DELETE" });
}
let res = await req("/users", admin, {
  method: "POST",
  body: JSON.stringify({ name: "Smoke Time DomA", email: `smoke-time-dom-a-${stamp}@montesiao.org`, password: "senha123", phone: `119${String(stamp).slice(-7)}1` }),
});
const volA = await res.json();
res = await req("/users", admin, {
  method: "POST",
  body: JSON.stringify({ name: "Smoke Time DomB", email: `smoke-time-dom-b-${stamp}@montesiao.org`, password: "senha123", phone: `119${String(stamp).slice(-7)}2` }),
});
const volB = await res.json();
if (!volA.id || !volB.id) { console.error("FALHA: usuarios temporarios", volA, volB); process.exit(1); }
const mins = await (await req("/ministries", admin)).json();
const role = mins.find((m) => Number(m.id) === 1)?.roles?.[0];
await req("/ministries/1/members", admin, { method: "POST", body: JSON.stringify({ user_id: volA.id, role_id: role.id }) });
await req("/ministries/1/members", admin, { method: "POST", body: JSON.stringify({ user_id: volB.id, role_id: role.id }) });
res = await req("/voice/groups", louvor, { method: "POST", body: JSON.stringify({ kind: "VOZ", name: "Smoke Time DG" }) });
const grp = await res.json();
await req(`/voice/groups/${grp.id}/members`, louvor, { method: "POST", body: JSON.stringify({ user_id: volA.id }) });
await req(`/voice/groups/${grp.id}/members`, louvor, { method: "POST", body: JSON.stringify({ user_id: volB.id }) });
res = await req("/events", admin, { method: "POST", body: JSON.stringify({ title: "Smoke Time Culto", event_date: "2027-08-08T19:00:00" }) });
const ev = await res.json();
res = await req(`/events/${ev.id}/slots`, admin, { method: "POST", body: JSON.stringify({ role_id: role.id }) });
const slot = await res.json();
await req(`/schedules/${slot.id}`, louvor, { method: "PATCH", body: JSON.stringify({ group_id: grp.id }) });
const vA = await login(`smoke-time-dom-a-${stamp}@montesiao.org`);
res = await req(`/schedules/${slot.id}/respond`, vA, { method: "POST", body: JSON.stringify({ status: "CONFIRMED" }) });
check("setup: volA confirmou", res.status === 200, `got ${res.status}`);

// ---------- CDP ----------
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}\\opencode\\chrome-dbg-time`, "--headless=new", "--no-first-run", "--no-default-browser-check", "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
let target;
for (let i = 0; i < 50; i++) {
  await sleep(300);
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const list = await r.json();
    target = list.find((t) => t.type === "page");
    if (target) break;
  } catch {}
}
if (!target) { console.error("FALHA: sem target CDP"); chrome.kill(); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res2, rej) => { ws.once("open", res2); ws.once("error", rej); });
let id = 0;
const pending = new Map();
ws.on("message", (data) => { const msg = JSON.parse(data.toString()); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } });
function send(method, params = {}) { const mid = ++id; return new Promise((resolve) => { pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); }); }
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}
await send("Page.enable");
await send("Runtime.enable");
await evaluate(`(async () => {
  const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email: "smoke-time-dom-a-${stamp}@montesiao.org", password: "senha123" }) });
  return r.status;
})()`);
await evaluate(`(async () => { location.href = "${BASE}/agenda"; return true; })()`);
await sleep(4000);

const r1 = await evaluate(`(() => {
  const out = [];
  const h3 = [...document.querySelectorAll("h3")].find((h) => h.textContent.includes("Smoke Time Culto"));
  out.push(["card do evento existe", !!h3, "h3 ausente"]);
  if (!h3) return out;
  let card = h3;
  while (card && !card.querySelector("button")) card = card.parentElement;
  const text = card?.textContent ?? "";
  out.push(["badge 'Confirmado' no card", text.includes("Confirmado"), text.slice(0, 240)]);
  out.push(["sem 'Vago' no card", !text.includes("Vago"), text.slice(0, 240)]);
  const btn = card ? [...card.querySelectorAll("button")].find((b) => b.textContent.includes("Time do culto")) : null;
  out.push(["botão 'Time do culto' existe", !!btn, ""]);
  out.push(["inicia recolhido", btn?.getAttribute("aria-expanded") === "false", btn?.getAttribute("aria-expanded") ?? "n/a"]);
  return out;
})()`);
r1.forEach(([n, ok, e]) => check(n, ok, e));

const r2 = await evaluate(`(async () => {
  const out = [];
  const h3 = [...document.querySelectorAll("h3")].find((h) => h.textContent.includes("Smoke Time Culto"));
  if (!h3) { out.push(["seção expande", false, "h3 ausente"]); return out; }
  let card = h3;
  while (card && !card.querySelector("button")) card = card.parentElement;
  const btn = [...card.querySelectorAll("button")].find((b) => b.textContent.includes("Time do culto"));
  btn?.click();
  await new Promise((r) => setTimeout(r, 400));
  out.push(["expande (aria-expanded=true)", btn?.getAttribute("aria-expanded") === "true", btn?.getAttribute("aria-expanded") ?? "n/a"]);
  const text = card.textContent ?? "";
  out.push(["volB listado", text.includes("Smoke Time DomB"), ""]);
  out.push(["volA listado", text.includes("Smoke Time DomA"), ""]);
  out.push(["destaque '· você'", text.includes("· você"), ""]);
  out.push(["contagem de pessoas", /2 pessoas/.test(text), text.slice(0, 300)]);
  btn?.click();
  await new Promise((r) => setTimeout(r, 300));
  out.push(["recolhe de novo", btn?.getAttribute("aria-expanded") === "false", btn?.getAttribute("aria-expanded") ?? "n/a"]);
  return out;
})()`);
r2.forEach(([n, ok, e]) => check(n, ok, e));

// ---------- cleanup ----------
await req(`/events/${ev.id}`, admin, { method: "DELETE" });
await req(`/voice/groups/${grp.id}`, louvor, { method: "DELETE" });
await req(`/users/${volA.id}`, admin, { method: "DELETE" });
await req(`/users/${volB.id}`, admin, { method: "DELETE" });
chrome.kill();
ws.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

(Red garantido na primeira execução se a seção ainda faltar; com Task 2 feita, deve passar 12/12. Se o dev server cair, reiniciar antes.)

**4.2 Evidência final (tudo local):**

```powershell
npm run typecheck; npm run build
node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public
node "$env:TEMP\opencode\smoke-time-agenda.mjs"
node "$env:TEMP\opencode\domcheck-time.mjs"
# regressão 12 smokes (loop da Task 3)
```

**4.3 Marcar checkboxes da spec e push da branch (NUNCA `main`)** — o código já foi commitado nas Tasks 1-3; resta atualizar a spec e publicar:

```powershell
git branch --show-current   # precisa ser feature/minha-nova-funcionalidade
git status --short          # só docs/ (spec) deve aparecer
git add docs/superpowers/specs/2026-09-28-time-agenda-status-design.md
git commit -m "docs: marcar spec time do culto como concluida"
git push -u origin feature/minha-nova-funcionalidade
Start-Sleep 5; gh run list --limit 2   # CI pode rodar na branch; NÃO deve haver deploy (deploy = push em main)
```

**4.4 Resumo final em PT** + checklist manual: `git push` refletido no GitHub, smoke/dom/suíte verdes citados com números, decisão de merge/deploy para `main` fica com o usuário, parar o visual companion se não for mais usado.

---

## Riscos / gotchas

- **`tsc -b` cobre frontend + server** (um único `typecheck`); literais de `StatusBadge` sem `group` quebrariam o build — auditado na Task 1.
- **Smoke red deixa resíduos** (só limpa no fim) → pré-limpeza por título no início; sem ela os checks de contagem do relatório 2027-07 ficariam frágeis.
- **`ORDER BY name` em `UNION ALL`** — nomes das colunas vêm do primeiro SELECT (alias explícito nos dois ramos).
- **Push de grupo não é observável** por smoke (web-push sem efeito persistente) — aceito pela spec; cobertura = espelhamento de código + `smoke-push` de regressão.
- **Não rodar com `SMOKE_BASE` de produção** nesta leva (fixtures `2027-*` seriam criadas no banco real) — tudo local.
- Relógio: `datetime('now')` é UTC; eventos do smoke são futuros/pasados folgados — sem fronteira no dia atual.
- Se o detector reclamar de alvo de toque/contraste no cabeçalho da seção, adicionar `min-h-11` ao `<button>` da seção (padrão já usado na matriz) e revalidar.
- Sem resíduo em produção: nenhum comando desta leva usa `SMOKE_BASE` de produção; fixtures `2027-*` existem só no banco local.
