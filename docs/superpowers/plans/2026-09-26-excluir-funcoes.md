# Excluir Funções (ministério, membro e escala) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir excluir funções do ministério (com aviso de impacto), remover funções individuais de membros e remover vagas de função da escala.

**Architecture:** Todos os endpoints de exclusão **já existem** no backend; a feature adiciona apenas `GET /ministries/roles/:roleId/impact` (contagens) e a UI: chips com X + `ConfirmDialog` em três lugares (`MinistriesPage`, card "Meu ministério" da matriz, `MemberList`) e botão X por vaga na matriz.

**Tech Stack:** Hono + D1 (backend), React + Tailwind + lucide-react (frontend), smoke `.mjs` de API em `%TEMP%\opencode\`.

**Contexto:** Spec em `docs/superpowers/specs/2026-09-26-excluir-funcoes-design.md`. Verificação do projeto: `npm run typecheck`, `npm run build`, detector impeccable (`node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public` → exit 0), smokes com `SMOKE_BASE` (local default `http://localhost:5173/api`, prod `https://escala-monte-siao.leoqueirozyt.workers.dev/api`), login `admin@montesiao.org`/`carlos@montesiao.org` com `senha123`. **O smoke deve ser autocontido** (usuários/ministério temporários) — nunca excluir funções/escalas reais.

---

### Task 1: Backend — endpoint de impacto + smoke de API

**Files:**
- Modify: `server/routes/ministries.ts` (após `DELETE /roles/:roleId`, linha ~152)
- Create: `%TEMP%\opencode\smoke-excluir-funcoes.mjs` (ou `C:\Users\Raptor\AppData\Local\Temp\opencode\smoke-excluir-funcoes.mjs`)

- [ ] **Step 1: Escrever o smoke falhando primeiro (TDD)** — criar `smoke-excluir-funcoes.mjs` com o código completo abaixo:

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
const carlos = await login("carlos@montesiao.org");

let res = await req("/users", admin, {
  method: "POST",
  body: JSON.stringify({ name: "Smoke Lider Funcoes", email: `smoke-fun-leader-${stamp}@montesiao.org`, password: "senha123", role: "LEADER" }),
});
const tempLeader = await res.json();
check("criar lider temporario", res.status === 201 && !!tempLeader.id, JSON.stringify(tempLeader));

res = await req("/users", admin, { method: "POST", body: JSON.stringify({ name: "Smoke Vol Funcoes", email: `smoke-fun-vol-${stamp}@montesiao.org`, password: "senha123" }) });
const tempVol = await res.json();
res = await req("/users", admin, { method: "POST", body: JSON.stringify({ name: "Smoke Vol2 Funcoes", email: `smoke-fun-vol2-${stamp}@montesiao.org`, password: "senha123" }) });
const tempVol2 = await res.json();
check("criar voluntarios temporarios", !!tempVol.id && !!tempVol2.id, JSON.stringify([tempVol, tempVol2]));

const leaderCookie = await login(`smoke-fun-leader-${stamp}@montesiao.org`);
const volCookie = await login(`smoke-fun-vol-${stamp}@montesiao.org`);

// ministerio de teste (autocontido — nunca tocar ministérios reais)
res = await req("/ministries", admin, {
  method: "POST",
  body: JSON.stringify({ name: `Smoke Funcoes ${stamp}`, description: "autoteste", leader_ids: [tempLeader.id] }),
});
const m = await res.json();
check("criar ministerio de teste", res.status === 201 && !!m.id, JSON.stringify(m));

res = await req(`/ministries/${m.id}/roles`, admin, { method: "POST", body: JSON.stringify({ name: "Funcao A" }) });
const roleA = await res.json();
check("criar funcao A", res.status === 201 && !!roleA.id, JSON.stringify(roleA));
res = await req(`/ministries/${m.id}/roles`, admin, { method: "POST", body: JSON.stringify({ name: "Funcao B" }) });
const roleB = await res.json();
check("criar funcao B", res.status === 201 && !!roleB.id, JSON.stringify(roleB));

res = await req("/events", admin, { method: "POST", body: JSON.stringify({ title: "Smoke Culto Funcoes", event_date: "2026-11-08T19:00:00" }) });
const ev = await res.json();
check("criar evento", !!ev.id, JSON.stringify(ev));
res = await req(`/events/${ev.id}/slots`, admin, { method: "POST", body: JSON.stringify({ role_id: roleA.id }) });
const slotA = await res.json();
res = await req(`/events/${ev.id}/slots`, admin, { method: "POST", body: JSON.stringify({ role_id: roleB.id }) });
const slotB = await res.json();
check("criar vagas A e B", !!slotA.id && !!slotB.id, JSON.stringify([slotA, slotB]));

res = await req(`/ministries/${m.id}/members`, admin, { method: "POST", body: JSON.stringify({ user_id: tempVol.id, role_id: roleA.id }) });
check("vincular vol a A", res.status === 201, `got ${res.status}`);
res = await req(`/ministries/${m.id}/members`, admin, { method: "POST", body: JSON.stringify({ user_id: tempVol2.id, role_id: roleA.id }) });
res = await req(`/ministries/${m.id}/members`, admin, { method: "POST", body: JSON.stringify({ user_id: tempVol2.id, role_id: roleB.id }) });
check("vincular vol2 a A e B", res.status === 201, `got ${res.status}`);

// A: impacto
res = await req(`/ministries/roles/${roleA.id}/impact`, admin);
let imp = await res.json();
check("impact admin 200", res.status === 200, `got ${res.status}`);
check("impact contagens", imp.escalas === 1 && imp.membros === 2, JSON.stringify(imp));
res = await req(`/ministries/roles/${roleA.id}/impact`, leaderCookie);
imp = await res.json();
check("impact lider do ministerio 200", res.status === 200 && imp.escalas === 1, JSON.stringify(imp));
res = await req(`/ministries/roles/${roleA.id}/impact`, carlos);
check("impact lider de outro 403", res.status === 403, `got ${res.status}`);
res = await req(`/ministries/roles/${roleA.id}/impact`, volCookie);
check("impact voluntario 403", res.status === 403, `got ${res.status}`);
res = await req(`/ministries/roles/999999/impact`, admin);
check("impact inexistente 404", res.status === 404, `got ${res.status}`);

// B: remover funcao individual do membro
res = await req(`/ministries/${m.id}/members/${tempVol2.id}/${roleB.id}`, admin, { method: "DELETE" });
check("remover funcao B do vol2 200", res.status === 200, `got ${res.status}`);
res = await req(`/ministries/${m.id}/members`, admin);
let members = await res.json();
const v2 = members.find((x) => x.id === tempVol2.id);
check("vol2 ficou so com A", v2?.roles?.length === 1 && v2?.roles?.[0]?.id === roleA.id, JSON.stringify(v2?.roles ?? null));
res = await req(`/ministries/${m.id}/members/${tempVol2.id}/${roleB.id}`, volCookie, { method: "DELETE" });
check("remover funcao voluntario 403", res.status === 403, `got ${res.status}`);
res = await req(`/ministries/${m.id}/members/${tempVol2.id}/${roleB.id}`, carlos, { method: "DELETE" });
check("remover funcao lider de outro 403", res.status === 403, `got ${res.status}`);
res = await req(`/ministries/${m.id}/members/${tempVol.id}/${roleA.id}`, leaderCookie, { method: "DELETE" });
check("remover ultima funcao do vol 200", res.status === 200, `got ${res.status}`);
res = await req(`/ministries/${m.id}/members`, admin);
members = await res.json();
check("vol saiu da lista de membros", !members.some((x) => x.id === tempVol.id), JSON.stringify(members.map((x) => x.id)));

// C: remover vaga da escala
res = await req(`/schedules/${slotA.id}`, volCookie, { method: "DELETE" });
check("remover vaga voluntario 403", res.status === 403, `got ${res.status}`);
res = await req(`/schedules/${slotA.id}`, carlos, { method: "DELETE" });
check("remover vaga lider de outro 403", res.status === 403, `got ${res.status}`);
res = await req(`/schedules/${slotA.id}`, leaderCookie, { method: "PATCH", body: JSON.stringify({ user_id: tempVol.id }) });
check("escalar vol na vaga A", res.status === 200, `got ${res.status}`);
res = await req(`/schedules/${slotA.id}`, leaderCookie, { method: "DELETE" });
check("remover vaga preenchida 200", res.status === 200, `got ${res.status}`);
res = await req(`/events/${ev.id}/slots`, admin, { method: "POST", body: JSON.stringify({ role_id: roleA.id }) });
const slotC = await res.json();
res = await req(`/schedules/${slotC.id}`, leaderCookie, { method: "DELETE" });
check("remover vaga vazia 200", res.status === 200 && !!slotC.id, `got ${res.status}`);
res = await req(`/schedules?month=2026-11`, admin);
let schedules = await res.json();
check(
  "vaga A e C removidas, B permanece",
  !schedules.some((x) => x.id === slotA.id || x.id === slotC.id) && schedules.some((x) => x.id === slotB.id),
);

// A: excluir funcao (cascade apenas nas vagas dela)
res = await req(`/ministries/${m.id}/roles`, admin, { method: "POST", body: JSON.stringify({ name: "Funcao A2" }) });
const roleA2 = await res.json();
res = await req(`/events/${ev.id}/slots`, admin, { method: "POST", body: JSON.stringify({ role_id: roleA2.id }) });
const slotA2 = await res.json();
res = await req(`/ministries/roles/${roleA2.id}`, carlos, { method: "DELETE" });
check("excluir funcao lider de outro 403", res.status === 403, `got ${res.status}`);
res = await req(`/ministries/roles/${roleA2.id}`, volCookie, { method: "DELETE" });
check("excluir funcao voluntario 403", res.status === 403, `got ${res.status}`);
res = await req(`/ministries/roles/${roleA2.id}`, leaderCookie, { method: "DELETE" });
check("excluir funcao lider 200", res.status === 200, `got ${res.status}`);
res = await req(`/ministries/roles/${roleA2.id}/impact`, admin);
check("impact apos exclusao 404", res.status === 404, `got ${res.status}`);
res = await req(`/schedules?month=2026-11`, admin);
schedules = await res.json();
check(
  "vaga da funcao excluida some, B permanece",
  !schedules.some((x) => x.id === slotA2.id) && schedules.some((x) => x.id === slotB.id),
);
res = await req(`/ministries?scope=all`, admin);
let mins = await res.json();
const mNow = mins.find((x) => x.id === m.id);
check("funcao A2 saiu do ministerio", !(mNow?.roles ?? []).some((r) => r.id === roleA2.id), JSON.stringify(mNow?.roles ?? null));

// limpeza
await req(`/events/${ev.id}`, admin, { method: "DELETE" });
res = await req(`/ministries?scope=all`, admin);
mins = await res.json();
const mClean = mins.find((x) => x.id === m.id);
for (const r of mClean?.roles ?? []) {
  await req(`/ministries/roles/${r.id}`, admin, { method: "DELETE" });
}
await req(`/ministries/${m.id}`, admin, { method: "DELETE" });
await req(`/users/${tempVol.id}`, admin, { method: "DELETE" });
await req(`/users/${tempVol2.id}`, admin, { method: "DELETE" });
await req(`/users/${tempLeader.id}`, admin, { method: "DELETE" });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Rodar o smoke e ver falhar no endpoint novo**

```
node "$env:TEMP\opencode\smoke-excluir-funcoes.mjs"
```
Expected: FAIL em `impact admin 200` (404 — rota não existe). Checks de B e C podem passar (rotas já existem).

- [ ] **Step 3: Implementar o endpoint** — em `server/routes/ministries.ts`, logo após o handler de `DELETE /roles/:roleId` (linha 152):

```ts
ministryRoutes.get("/roles/:roleId/impact", async (c) => {
  const roleId = Number(c.req.param("roleId"));
  const role = await c.env.DB.prepare("SELECT ministry_id FROM roles WHERE id = ?").bind(roleId).first<any>();
  if (!role) return c.json({ error: "Função não encontrada" }, 404);
  if (!(await canManage(c, role.ministry_id))) return c.json({ error: "Sem permissão para este ministério" }, 403);
  const counts = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM schedules WHERE role_id = ?").bind(roleId),
    c.env.DB.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM user_roles WHERE role_id = ?").bind(roleId),
  ]);
  return c.json({
    escalas: Number((counts[0].results as any[])[0]?.n ?? 0),
    membros: Number((counts[1].results as any[])[0]?.n ?? 0),
  });
});
```

- [ ] **Step 4: Typecheck + smoke local**

```
npm run typecheck
node "$env:TEMP\opencode\smoke-excluir-funcoes.mjs"
```
Expected: typecheck sem erros; smoke `ALL` com 0 failed. (Se o dev server cair: `Start-Process cmd -ArgumentList "/c npm run dev > %TEMP%\opencode\vite-dev.log 2>&1"` e retestar.)

- [ ] **Step 5: Commit**

```bash
git add server/routes/ministries.ts
git commit -m "feat: endpoint de impacto de funcao (escalas e membros)"
```

---

### Task 2: UI A — chips de função com X em MinistriesPage

**Files:**
- Modify: `src/pages/MinistriesPage.tsx`

- [ ] **Step 1: Imports** — adicionar `X` ao import do lucide-react (linha 2) e `MinistryRole` ao import de tipos (linha 16):

```tsx
import { Plus, UserPlus, Pencil, Crown, UserCheck, UserX, ShieldCheck, UserMinus, Trash2, X } from "lucide-react";
import type { Ministry, MinistryMember, MinistryRole, User, VoiceClassification } from "../../shared/types";
```

- [ ] **Step 2: Estado + handlers** — após `voiceChoice` (linha 36):

```tsx
const [roleDeleteTarget, setRoleDeleteTarget] = useState<{
  ministry: Ministry;
  role: MinistryRole;
  impact: { escalas: number; membros: number };
} | null>(null);
const [memberRoleTarget, setMemberRoleTarget] = useState<{
  ministry: Ministry;
  member: MinistryMember;
  role: { id: number; name: string };
} | null>(null);
```

Após `saveVoice` (linha 132):

```tsx
const openRoleImpact = async (ministry: Ministry, role: MinistryRole) => {
  try {
    const impact = await api.get<{ escalas: number; membros: number }>(`/ministries/roles/${role.id}/impact`);
    setRoleDeleteTarget({ ministry, role, impact });
  } catch (e) {
    toast(e instanceof Error ? e.message : "Erro", "error");
  }
};

const deleteRole = async () => {
  if (!roleDeleteTarget) return;
  try {
    await api.delete(`/ministries/roles/${roleDeleteTarget.role.id}`);
    toast(`Função "${roleDeleteTarget.role.name}" excluída.`);
    setRoleDeleteTarget(null);
    load();
  } catch (e) {
    toast(e instanceof Error ? e.message : "Erro", "error");
  }
};
```

- [ ] **Step 3: Chips clicáveis** — substituir o mapa de badges de função do card (linhas 295-304) por:

```tsx
<div className="flex flex-wrap gap-2">
  {(m.roles ?? []).map((r) =>
    canEdit(m) ? (
      <button
        key={r.id}
        type="button"
        onClick={() => openRoleImpact(m, r)}
        aria-label={`Excluir função ${r.name} de ${m.name}`}
        className="inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-secondary px-2 text-[11px] font-medium text-secondary-foreground hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate">{r.name}</span>
        <X size={11} aria-hidden="true" />
      </button>
    ) : (
      <Badge key={r.id} variant="secondary">
        {r.name}
      </Badge>
    ),
  )}
  {(m.roles ?? []).length === 0 && (
    <p className="text-sm text-muted-foreground">Nenhuma função cadastrada.</p>
  )}
</div>
```

- [ ] **Step 4: ConfirmDialog de exclusão** — adicionar antes do fecho final do componente (após o `ConfirmDialog` de `deleteTarget`, linha ~495):

```tsx
<ConfirmDialog
  open={!!roleDeleteTarget}
  title="Excluir função"
  description={
    roleDeleteTarget
      ? `Excluir a função "${roleDeleteTarget.role.name}" de ${roleDeleteTarget.ministry.name}? As vagas dela serão removidas dos eventos (${roleDeleteTarget.impact.escalas} vaga(s)) — o resto da escala permanece — e a função sai de ${roleDeleteTarget.impact.membros} membro(s). Esta ação não pode ser desfeita.`
      : undefined
  }
  confirmLabel="Excluir função"
  destructive
  onConfirm={deleteRole}
  onClose={() => setRoleDeleteTarget(null)}
/>
```

- [ ] **Step 5: Verificar + commit**

```
npm run typecheck; npm run build; node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public
```
Expected: tudo limpo, detector exit 0.

```bash
git add src/pages/MinistriesPage.tsx
git commit -m "feat: excluir funcao do ministerio com aviso de impacto na aba Ministerios"
```

---

### Task 3: UI A — chips no card "Meu ministério" da matriz

**Files:**
- Modify: `src/pages/ScheduleMatrixPage.tsx`

- [ ] **Step 1: Imports** — adicionar `X` ao import do lucide-react (linha 2) e `MinistryRole` aos tipos (linha 18):

```tsx
import { CalendarPlus, ChevronDown, Pencil, Plus, UserPlus, Trash2, ListPlus, Mic, Music, X } from "lucide-react";
import type { Candidate, EventItem, Ministry, MinistryRole, Schedule, VoiceGroup } from "../../shared/types";
```

- [ ] **Step 2: Handler** — usar o `setConfirm` genérico da página (já com `busy`); após `deleteEvent` (linha 115):

```tsx
const openRoleImpact = async (ministry: Ministry, role: MinistryRole) => {
  try {
    const impact = await api.get<{ escalas: number; membros: number }>(`/ministries/roles/${role.id}/impact`);
    setConfirm({
      title: "Excluir função",
      description: `Excluir a função "${role.name}" de ${ministry.name}? As vagas dela serão removidas dos eventos (${impact.escalas} vaga(s)) — o resto da escala permanece — e a função sai de ${impact.membros} membro(s). Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir função",
      destructive: true,
      run: async () => {
        await api.delete(`/ministries/roles/${role.id}`);
        toast(`Função "${role.name}" excluída.`);
        load();
      },
    });
  } catch (e) {
    toast(e instanceof Error ? e.message : "Erro", "error");
  }
};
```

- [ ] **Step 3: Chips com X** — substituir o mapa de badges do card (linhas 258-266):

```tsx
<div className="flex flex-wrap gap-2">
  {(ministries[0].roles ?? []).map((r) => (
    <button
      key={r.id}
      type="button"
      onClick={() => openRoleImpact(ministries[0], r)}
      aria-label={`Excluir função ${r.name} de ${ministries[0].name}`}
      className="inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-secondary px-2 text-[11px] font-medium text-secondary-foreground hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="truncate">{r.name}</span>
      <X size={11} aria-hidden="true" />
    </button>
  ))}
  {(ministries[0].roles ?? []).length === 0 && (
    <p className="text-sm text-muted-foreground">Nenhuma função ainda — adicione a primeira abaixo.</p>
  )}
</div>
```

- [ ] **Step 4: Verificar + commit**

```
npm run typecheck; npm run build; node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public
```
Expected: limpo, exit 0.

```bash
git add src/pages/ScheduleMatrixPage.tsx
git commit -m "feat: excluir funcao do card Meu ministerio da matriz"
```

---

### Task 4: UI B — chips de função do membro em MemberList

**Files:**
- Modify: `src/pages/MinistriesPage.tsx` (MemberList + paisagem de props)

- [ ] **Step 1: Nova prop + handler** — em `MinistriesPage`, `removeMemberRole` após `deleteAccount` (linha 113):

```tsx
const removeMemberRole = async () => {
  if (!memberRoleTarget) return;
  try {
    await api.delete(
      `/ministries/${memberRoleTarget.ministry.id}/members/${memberRoleTarget.member.id}/${memberRoleTarget.role.id}`,
    );
    toast(`Função "${memberRoleTarget.role.name}" removida de ${memberRoleTarget.member.name}.`);
    setMemberRoleTarget(null);
    setMembersTick((t) => t + 1);
  } catch (e) {
    toast(e instanceof Error ? e.message : "Erro", "error");
  }
};
```
(`memberRoleTarget` já foi criado no Task 2, Step 2.)

Na chamada `<MemberList ...>` (linhas 306-316) adicionar a prop com valor inline:

```tsx
onRemoveRole={(member, role) => setMemberRoleTarget({ ministry: m, member, role })}
```

- [ ] **Step 2: Props do MemberList** — na assinatura (linha 500-520) adicionar:

```tsx
onRemoveRole: (member: MinistryMember, role: { id: number; name: string }) => void;
```
e no destructuring `onRemoveRole,`.

- [ ] **Step 3: Chips clicáveis no MemberList** — substituir o mapa de badges de função do membro (linhas 552-560):

```tsx
{m.roles.length > 0 && (
  <div className="mt-1 flex flex-wrap gap-1">
    {m.roles.map((r) => (
      <button
        key={r.id}
        type="button"
        onClick={() => onRemoveRole(m, r)}
        aria-label={`Remover função ${r.name} de ${m.name}`}
        className="inline-flex h-6 items-center gap-1 rounded-full bg-secondary px-2 text-[10px] font-medium text-secondary-foreground hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate">{r.name}</span>
        <X size={10} aria-hidden="true" />
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 4: ConfirmDialog de remoção** — após o `ConfirmDialog` de `roleDeleteTarget` (Task 2):

```tsx
<ConfirmDialog
  open={!!memberRoleTarget}
  title="Remover função"
  description={
    memberRoleTarget
      ? `Remover a função "${memberRoleTarget.role.name}" de ${memberRoleTarget.member.name}? Se essa for a última função dela, ela deixa de aparecer na lista de membros.`
      : undefined
  }
  confirmLabel="Remover"
  destructive
  onConfirm={removeMemberRole}
  onClose={() => setMemberRoleTarget(null)}
/>
```

- [ ] **Step 5: Verificar + commit**

```
npm run typecheck; npm run build; node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public
```
Expected: limpo, exit 0.

```bash
git add src/pages/MinistriesPage.tsx
git commit -m "feat: remover funcao individual do membro"
```

---

### Task 5: UI C — remover vaga da escala na matriz

**Files:**
- Modify: `src/pages/ScheduleMatrixPage.tsx`

- [ ] **Step 1: Handler** — após `unassign` (linha 175), reutilizando `setConfirm` genérico:

```tsx
const removeSlot = (s: Schedule) => {
  setConfirm({
    title: "Remover função do evento",
    description: s.group
      ? `Remover "${s.role_name}" com o grupo ${s.group.name}? O grupo perderá a escalação deste evento.`
      : s.user_id
        ? `Remover "${s.role_name}" com ${s.user_name} escalado? A vaga será apagada e ${s.user_name} perderá a escalação deste evento.`
        : `Remover a função "${s.role_name}" deste evento? A vaga será apagada.`,
    confirmLabel: "Remover",
    destructive: true,
    run: async () => {
      await api.delete(`/schedules/${s.id}`);
      toast("Função removida do evento");
      load();
    },
  });
};
```

- [ ] **Step 2: Botão X na linha da vaga** — dentro do bloco de ações (linhas 437-463), **após** o ternário `{s.user_id || s.group ? (...) : (...)}` e antes de fechar o `div` de ações:

```tsx
<button
  type="button"
  onClick={() => removeSlot(s)}
  aria-label={`Remover função ${s.role_name} deste evento`}
  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
>
  <X size={15} aria-hidden="true" />
</button>
```

- [ ] **Step 3: Verificar + commit**

```
npm run typecheck; npm run build; node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public
```
Expected: limpo, exit 0.

```bash
git add src/pages/ScheduleMatrixPage.tsx
git commit -m "feat: remover funcao (vaga) da escala na matriz"
```

---

### Task 6: Verificação final + push/deploy

- [ ] **Step 1: Smoke local completo**

```
node "$env:TEMP\opencode\smoke-excluir-funcoes.mjs"
```
Expected: 0 failed (≈40 checks).

- [ ] **Step 2: Regressões locais**

```
node "$env:TEMP\opencode\smoke-min-leaders.mjs"; node "$env:TEMP\opencode\smoke-leaders.mjs"; node "$env:TEMP\opencode\smoke-playlists.mjs"; node "$env:TEMP\opencode\smoke-remocoes-avatar.mjs"; node "$env:TEMP\opencode\smoke-grupos-voz.mjs"
```
Expected: todos 0 failed.

- [ ] **Step 3: Push + deploy**

```bash
git push origin main
```
Watch: `$runId = (gh run list --limit 1 --json databaseId | ConvertFrom-Json)[0].databaseId; gh run watch $runId --exit-status`

- [ ] **Step 4: Smoke de produção**

```
$env:SMOKE_BASE = "https://escala-monte-siao.leoqueirozyt.workers.dev/api"; node "$env:TEMP\opencode\smoke-excluir-funcoes.mjs"
```
Expected: 0 failed. Repetir as regressões (Task 6 Step 2) com `SMOKE_BASE` de produção.

- [ ] **Step 5: Resumo final** — finishing-a-development-branch (sem branch: tudo na main, já em produção → resumo em português + teste manual oferecido ao usuário: excluir função na aba Ministérios, chip do membro, X na vaga da matriz).
