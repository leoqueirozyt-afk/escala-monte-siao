# Remoções de Membros/Contas + Fotos de Pessoas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Líder remove membros do ministério (vínculos), ADMIN exclui contas permanentemente, e foto (ou inicial) de pessoas aparece em todos os listados do app.

**Architecture:** Novo `DELETE /ministries/:id/members/:userId` (guarda `canManage`) apaga todos os `user_roles` do usuário no ministério (liderança intocada); `GET /:id/members` passa a agrupar por pessoa; componente `PersonAvatar` + `avatar_url` adicionado aos SELECTs de schedules/events/swaps/reports/candidates e aplicado nas páginas. Exclusão de conta reusa `DELETE /users/:id` (FKs já dão SET NULL/CASCADE).

**Tech Stack:** Hono + D1, React 19, `shared/types.ts`, componente novo em `src/components/ui/`.

**Conventions:** verificação = `npm run typecheck` + `npm run build` + detector impeccable + smoke `.mjs` (fetch/cookies) dev e produção. Sem testes unitários (convenção do repo). Spec: `docs/superpowers/specs/2026-09-25-remocoes-e-fotos-design.md`. Trabalho direto na `main`.

---

**Notas de cobertura do spec:** Dashboard e Agenda exibem apenas escalas **próprias** (`/schedules/my`) sem nome de terceiros — spec condiciona avatar no dashboard a "quando mostrar outra pessoa", condição nunca satisfeita; sem alteração. `CalendarPage` idem. Cabeçalho "Líderes: A, B" do cartão de ministério não está no R3 (string concatenada sem avatar no endpoint) — fora de escopo.

---

### Task 1: Tipos + componente `PersonAvatar`

**Files:**
- Create: `src/components/ui/person-avatar.tsx`
- Modify: `shared/types.ts`

- [ ] **Step 1: Tipos novos/campos novos em `shared/types.ts`**

Após a interface `MinistryRole` (linha 32), adicionar:

```ts
export interface MinistryMember {
  id: number;
  name: string;
  email: string;
  avatar_url: string | null;
  roles: { id: number; name: string }[];
  is_leader: boolean;
}
```

Na interface `Schedule` (linha 42), após `user_name?: string | null;` adicionar:

```ts
  user_avatar?: string | null;
```

Na interface `SwapRequest` (linha 65), após `current_user_name?: string | null;` adicionar:

```ts
  requester_avatar?: string | null;
  target_user_avatar?: string | null;
```

Na interface `Candidate` (linha 80), após `max_services_per_month: number;` adicionar:

```ts
  avatar_url?: string | null;
```

Na interface `ParticipationRow` (linha 88), após `total: number;` adicionar:

```ts
  avatar_url?: string | null;
```

- [ ] **Step 2: Criar `src/components/ui/person-avatar.tsx`**

```tsx
interface PersonAvatarProps {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}

export function PersonAvatar({ name, avatarUrl, className = "h-8 w-8 text-xs" }: PersonAvatarProps) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={`${className} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span
      aria-hidden="true"
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add shared/types.ts src/components/ui/person-avatar.tsx
git commit -m "feat: tipos de membro/avatar e componente PersonAvatar"
```

---

### Task 2: Backend — membros agrupados + remoção

**Files:**
- Modify: `server/routes/ministries.ts:167-193`

- [ ] **Step 1: Substituir `DELETE /:id/members/:userId/:roleId` e `GET /:id/members`**

Trocar as linhas 167-193 (os dois handlers no fim do arquivo) por:

```ts
ministryRoutes.delete("/:id/members/:userId/:roleId", async (c) => {
  const ministryId = Number(c.req.param("id"));
  if (!(await canManage(c, ministryId))) return c.json({ error: "Sem permissão para este ministério" }, 403);
  await c.env.DB.prepare("DELETE FROM user_roles WHERE user_id = ? AND role_id = ?")
    .bind(Number(c.req.param("userId")), Number(c.req.param("roleId")))
    .run();
  return c.json({ ok: true });
});

ministryRoutes.delete("/:id/members/:userId", async (c) => {
  const ministryId = Number(c.req.param("id"));
  if (!(await canManage(c, ministryId))) return c.json({ error: "Sem permissão para este ministério" }, 403);
  const userId = Number(c.req.param("userId"));
  await c.env.DB.prepare(
    "DELETE FROM user_roles WHERE user_id = ? AND role_id IN (SELECT id FROM roles WHERE ministry_id = ?)",
  )
    .bind(userId, ministryId)
    .run();
  return c.json({ ok: true });
});

ministryRoutes.get("/:id/members", async (c) => {
  const ministryId = Number(c.req.param("id"));
  if (!(await canManage(c, ministryId))) return c.json({ error: "Sem permissão para este ministério" }, 403);
  const links = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.avatar_url, r.id AS role_id, r.name AS role_name
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.ministry_id = ?`,
  )
    .bind(ministryId)
    .all();
  const leaders = await c.env.DB.prepare(
    "SELECT u.id FROM users u JOIN ministry_leaders ml ON ml.user_id = u.id WHERE ml.ministry_id = ?",
  )
    .bind(ministryId)
    .all();
  const leaderIds = new Set((leaders.results as any[]).map((l) => Number(l.id)));
  const map = new Map<number, { id: number; name: string; email: string; avatar_url: string | null; roles: { id: number; name: string }[] }>();
  for (const row of links.results as any[]) {
    let entry = map.get(Number(row.id));
    if (!entry) {
      entry = { id: Number(row.id), name: row.name, email: row.email, avatar_url: row.avatar_url ?? null, roles: [] };
      map.set(entry.id, entry);
    }
    entry.roles.push({ id: Number(row.role_id), name: String(row.role_name) });
  }
  for (const id of leaderIds) {
    if (!map.has(id)) {
      const u = await c.env.DB.prepare("SELECT name, email, avatar_url FROM users WHERE id = ?").bind(id).first<any>();
      if (u) map.set(id, { id, name: u.name, email: u.email, avatar_url: u.avatar_url ?? null, roles: [] });
    }
  }
  const result = [...map.values()]
    .map((m) => ({ ...m, is_leader: leaderIds.has(m.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return c.json(result);
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add server/routes/ministries.ts
git commit -m "feat: membros agrupados com avatar/funcoes e DELETE de vinculos"
```

---

### Task 3: Backend — `avatar_url` nos SELECTs de pessoas

**Files:**
- Modify: `server/routes/schedules.ts:7-15` (SELECT_JOIN) e `:74-90` (candidates)
- Modify: `server/routes/events.ts:26-34` (slots)
- Modify: `server/routes/swaps.ts:7-17` (SELECT_SWAP)
- Modify: `server/routes/reports.ts:21-37` (participation)

- [ ] **Step 1: `schedules.ts` — SELECT_JOIN**

Trocar a linha 10:

```ts
    r.name AS role_name, m.name AS ministry_name, m.id AS ministry_id, u.name AS user_name
```

Por:

```ts
    r.name AS role_name, m.name AS ministry_name, m.id AS ministry_id, u.name AS user_name, u.avatar_url AS user_avatar
```

- [ ] **Step 2: `schedules.ts` — query de candidates**

Na query da linha 75, trocar:

```ts
    `SELECT u.id AS user_id, u.name, u.email, u.max_services_per_month,
```

Por:

```ts
    `SELECT u.id AS user_id, u.name, u.email, u.avatar_url, u.max_services_per_month,
```

- [ ] **Step 3: `events.ts` — slots**

Na linha 27, trocar:

```ts
    `SELECT s.*, r.name AS role_name, m.name AS ministry_name, m.id AS ministry_id, u.name AS user_name
```

Por:

```ts
    `SELECT s.*, r.name AS role_name, m.name AS ministry_name, m.id AS ministry_id, u.name AS user_name, u.avatar_url AS user_avatar
```

- [ ] **Step 4: `swaps.ts` — SELECT_SWAP**

Na linha 9, trocar:

```ts
    req.name AS requester_name, tgt.name AS target_user_name,
```

Por:

```ts
    req.name AS requester_name, req.avatar_url AS requester_avatar, tgt.name AS target_user_name, tgt.avatar_url AS target_user_avatar,
```

- [ ] **Step 5: `reports.ts` — participation**

Na linha 22, trocar:

```ts
    `SELECT u.id AS user_id, u.name,
```

Por:

```ts
    `SELECT u.id AS user_id, u.name, u.avatar_url,
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add server/routes/schedules.ts server/routes/events.ts server/routes/swaps.ts server/routes/reports.ts
git commit -m "feat: avatar_url nos endpoints de escalas, eventos, trocas e relatorios"
```

---

### Task 4: Frontend — MinistriesPage (remover membro, excluir conta, avatares)

**Files:**
- Modify: `src/pages/MinistriesPage.tsx`

- [ ] **Step 1: Imports e tipos**

Na linha 2 (lucide), trocar por:

```ts
import { Plus, UserPlus, Pencil, Crown, UserCheck, UserX, ShieldCheck, Trash2, UserMinus } from "lucide-react";
```

Na linha 15, trocar:

```ts
import type { Ministry, User } from "../../shared/types";
```

Por:

```ts
import type { Ministry, MinistryMember, User } from "../../shared/types";
```

Após o import do `Badge` (linha 12), adicionar:

```ts
import { PersonAvatar } from "../components/ui/person-avatar";
```

Após a linha 6 (`roleLabel`), verificar se o import de `roleLabel` continua usado — o `MemberList` antigo usava `roleLabel(m.role)` e será substituído; se ficar sem uso, remover `roleLabel` do import de `../lib/utils` (mantendo `formatDateTime`/outros se houver — neste arquivo só `roleLabel` é importado de lá, então remover o import da linha 6 inteira se ficar órfão).

- [ ] **Step 2: Estado de confirmação**

Após a linha 31 (`pendingLeader`), adicionar:

```ts
  const [removeTarget, setRemoveTarget] = useState<{ ministry: Ministry; member: MinistryMember } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ ministry: Ministry; member: MinistryMember } | null>(null);
```

- [ ] **Step 3: Handlers de remoção/exclusão**

Após a função `decideLeader` (linha 80), adicionar:

```ts
  const removeMember = async () => {
    if (!removeTarget) return;
    try {
      await api.delete(`/ministries/${removeTarget.ministry.id}/members/${removeTarget.member.id}`);
      toast(`${removeTarget.member.name} removido do ministério.`);
      setRemoveTarget(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const deleteAccount = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/users/${deleteTarget.member.id}`);
      toast(`Conta de ${deleteTarget.member.name} excluída.`);
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };
```

- [ ] **Step 4: `membersMapQ` com o novo tipo**

Na linha 54, trocar `Map<number, User[]>` por `Map<number, MinistryMember[]>`; na linha 58, trocar `api.get<User[]>` por `api.get<MinistryMember[]>`:

```ts
    const map = new Map<number, MinistryMember[]>();
    const list = editableKey ? editableKey.split(",").map(Number) : [];
    if (list.length === 0) return map;
    const results = await Promise.all(
      list.map((id) => api.get<MinistryMember[]>(`/ministries/${id}/members`).then((members) => ({ id, members }))),
    );
    for (const r of results) map.set(r.id, r.members);
    return map;
```

- [ ] **Step 5: Avatar no painel de aprovação de líderes**

Na linha 184, trocar:

```tsx
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
```

Por:

```tsx
                <div className="flex min-w-0 items-center gap-3">
                  <PersonAvatar name={u.name} avatarUrl={u.avatar_url} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>
```

- [ ] **Step 6: Passar callbacks para o `MemberList`**

Na linha 251, adicionar as props novas:

```tsx
                <MemberList
                  ministry={m}
                  members={membersMapQ.data?.get(m.id)}
                  status={membersMapQ.status}
                  error={membersMapQ.error}
                  onRetry={membersMapQ.reload}
                  isAdmin={isAdmin}
                  onRemove={(member) => setRemoveTarget({ ministry: m, member })}
                  onDeleteAccount={(member) => setDeleteTarget({ ministry: m, member })}
                />
```

- [ ] **Step 7: Reescrever o `MemberList` (linhas 364-406)**

Substituir a função inteira por:

```tsx
function MemberList({
  ministry,
  members,
  status,
  error,
  onRetry,
  isAdmin,
  onRemove,
  onDeleteAccount,
}: {
  ministry: Ministry;
  members?: MinistryMember[];
  status: "loading" | "ready" | "error";
  error: string | null;
  onRetry: () => void;
  isAdmin: boolean;
  onRemove: (member: MinistryMember) => void;
  onDeleteAccount: (member: MinistryMember) => void;
}) {
  if (status === "error") {
    return <ErrorState message={error ?? "Erro"} onRetry={onRetry} className="border-destructive/30" />;
  }
  if (status === "loading") {
    return (
      <div className="space-y-2" aria-busy="true">
        <p className="text-xs font-medium text-muted-foreground">Membros</p>
        <ListSkeleton rows={2} />
      </div>
    );
  }

  const list = members ?? [];

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Membros ({list.length}) — {ministry.name}</p>
      {list.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
          <div className="flex min-w-0 items-center gap-3">
            <PersonAvatar name={m.name} avatarUrl={m.avatar_url} />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-medium">
                <span className="truncate">{m.name}</span>
                {m.is_leader && (
                  <Badge variant="outline" className="shrink-0 gap-1 text-primary">
                    <Crown size={10} /> Líder
                  </Badge>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              {m.roles.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {m.roles.map((r) => (
                    <Badge key={r.id} variant="secondary" className="text-[10px]">
                      {r.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => onRemove(m)}
              aria-label={`Remover ${m.name} do ministério`}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <UserMinus size={15} aria-hidden="true" />
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => onDeleteAccount(m)}
                aria-label={`Excluir conta de ${m.name}`}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      ))}
      {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhum membro vinculado.</p>}
    </div>
  );
}
```

- [ ] **Step 8: Avatar no LeaderPicker**

Na linha ~439 (dentro do `<label>` do LeaderPicker), trocar:

```tsx
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{u.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
              </span>
```

Por:

```tsx
              <PersonAvatar name={u.name} avatarUrl={u.avatar_url} className="h-7 w-7 text-[10px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{u.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
              </span>
```

- [ ] **Step 9: Diálogo "Vincular voluntário" — lista com avatar no lugar do `<Select>`**

No diálogo (linhas 317-343), substituir o `Field label="Voluntário"` inteiro por:

```tsx
          <Field label="Voluntário">
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border p-2" role="listbox" aria-label="Voluntários">
              {users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  role="option"
                  aria-selected={memberUserId === String(u.id)}
                  onClick={() => setMemberUserId(String(u.id))}
                  className={`flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm ${
                    memberUserId === String(u.id) ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <PersonAvatar name={u.name} avatarUrl={u.avatar_url} className="h-7 w-7 text-[10px]" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                  </span>
                </button>
              ))}
              {users.length === 0 && <p className="p-2 text-sm text-muted-foreground">Nenhum usuário disponível.</p>}
            </div>
          </Field>
```

O `Select` continua sendo usado pelo `Field label="Função"` abaixo — manter o import de `Select`.

- [ ] **Step 10: ConfirmDialogs de remoção/exclusão**

Após o `ConfirmDialog` do `pendingLeader` (linha ~359, antes do `</div>` final), adicionar:

```tsx
      <ConfirmDialog
        open={!!removeTarget}
        title="Remover membro"
        description={
          removeTarget
            ? `Remover ${removeTarget.member.name} de ${removeTarget.ministry.name}? Os vínculos de função serão removidos. Se for líder, a liderança só é alterada pelo ADMIN em Editar.`
            : undefined
        }
        confirmLabel="Remover"
        destructive
        onConfirm={removeMember}
        onClose={() => setRemoveTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir conta"
        description={
          deleteTarget
            ? `Excluir permanentemente a conta de ${deleteTarget.member.name}? Escalas em que ele aparecia ficarão sem pessoa. Esta ação não pode ser desfeita.`
            : undefined
        }
        confirmLabel="Excluir conta"
        destructive
        onConfirm={deleteAccount}
        onClose={() => setDeleteTarget(null)}
      />
```

- [ ] **Step 11: Typecheck + build**

Run: `npm run typecheck; if ($?) { npm run build }`
Expected: exit 0

- [ ] **Step 12: Commit**

```bash
git add src/pages/MinistriesPage.tsx
git commit -m "feat: remover membro e excluir conta na aba Ministerios + avatares"
```

---

### Task 5: Frontend — ScheduleMatrixPage (avatar na vaga + seletor de candidatos)

**Files:**
- Modify: `src/pages/ScheduleMatrixPage.tsx`

- [ ] **Step 1: Import**

Após a linha 13 (`StatusBadge`), adicionar:

```ts
import { PersonAvatar } from "../components/ui/person-avatar";
```

- [ ] **Step 2: Avatar na vaga preenchida**

Na linha 320-327, trocar:

```tsx
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`h-3 w-3 shrink-0 rounded-full ${dot}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{s.role_name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {s.user_name ?? "Vaga em aberto"}
                          </p>
                        </div>
                      </div>
```

Por:

```tsx
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`h-3 w-3 shrink-0 rounded-full ${dot}`} />
                        {s.user_id ? (
                          <PersonAvatar name={s.user_name ?? ""} avatarUrl={s.user_avatar} className="h-8 w-8 text-xs" />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-xs text-muted-foreground"
                          >
                            ?
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{s.role_name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {s.user_name ?? "Vaga em aberto"}
                          </p>
                        </div>
                      </div>
```

- [ ] **Step 3: Seletor de voluntário — lista com avatar no lugar do `<Select>`**

No diálogo do picker (linhas 380-390), trocar:

```tsx
                <Field label="Voluntário">
                  <Select value={chosenUser} onChange={(e) => setChosenUser(e.target.value)}>
                    <option value="">Selecione...</option>
                    {picker.candidates.map((c) => (
                      <option key={c.user_id} value={c.user_id}>
                        {c.name} · {c.services_this_month}/{c.max_services_per_month} no mês
                        {c.services_this_month >= c.max_services_per_month ? " (limite)" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
```

Por:

```tsx
                <Field label="Voluntário">
                  <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border p-2" role="listbox" aria-label="Candidatos">
                    {picker.candidates.map((c) => (
                      <button
                        key={c.user_id}
                        type="button"
                        role="option"
                        aria-selected={chosenUser === String(c.user_id)}
                        onClick={() => setChosenUser(String(c.user_id))}
                        className={`flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm ${
                          chosenUser === String(c.user_id) ? "bg-primary/10" : "hover:bg-muted"
                        }`}
                      >
                        <PersonAvatar name={c.name} avatarUrl={c.avatar_url} className="h-8 w-8 text-xs" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{c.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.services_this_month}/{c.max_services_per_month} no mês
                            {c.services_this_month >= c.max_services_per_month ? " (limite)" : ""}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </Field>
```

(`Select` continua usado no diálogo "Adicionar função ao evento" — manter import.)

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck; if ($?) { npm run build }`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add src/pages/ScheduleMatrixPage.tsx
git commit -m "feat: avatares na matriz de escala e seletor de candidatos"
```

---

### Task 6: Frontend — AgendaPage (lista de candidatos com avatar)

**Files:**
- Modify: `src/pages/AgendaPage.tsx`

- [ ] **Step 1: Imports**

Linha 10, trocar:

```ts
import { Select, Field } from "../components/ui/input";
```

Por:

```ts
import { Field } from "../components/ui/input";
```

Após a linha 11 (`StatusBadge`), adicionar:

```ts
import { PersonAvatar } from "../components/ui/person-avatar";
```

Após a linha 2 (`lucide`), trocar por:

```ts
import { Handshake, MapPin, UserSearch } from "lucide-react";
```

- [ ] **Step 2: Lista de candidatos no lugar do `<Select>`**

No diálogo de troca (linhas 165-175), trocar:

```tsx
            {candidates.length > 0 ? (
              <Field label="Trocar com (opcional)">
                <Select value={selectedCandidate} onChange={(e) => setSelectedCandidate(e.target.value)}>
                  <option value="">Líder escolhe outro voluntário</option>
                  {candidates.map((cand) => (
                    <option key={cand.user_id} value={cand.user_id}>
                      {cand.name} ({cand.services_this_month}/{cand.max_services_per_month} escalas no mês)
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
```

Por:

```tsx
            {candidates.length > 0 ? (
              <Field label="Trocar com (opcional)">
                <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border p-2" role="listbox" aria-label="Candidatos para troca">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedCandidate === ""}
                    onClick={() => setSelectedCandidate("")}
                    className={`flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm ${
                      selectedCandidate === "" ? "bg-primary/10" : "hover:bg-muted"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted"
                    >
                      <UserSearch size={14} />
                    </span>
                    <span className="truncate font-medium">Líder escolhe outro voluntário</span>
                  </button>
                  {candidates.map((cand) => (
                    <button
                      key={cand.user_id}
                      type="button"
                      role="option"
                      aria-selected={selectedCandidate === String(cand.user_id)}
                      onClick={() => setSelectedCandidate(String(cand.user_id))}
                      className={`flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm ${
                        selectedCandidate === String(cand.user_id) ? "bg-primary/10" : "hover:bg-muted"
                      }`}
                    >
                      <PersonAvatar name={cand.name} avatarUrl={cand.avatar_url} className="h-8 w-8 text-xs" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{cand.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {cand.services_this_month}/{cand.max_services_per_month} escalas no mês
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </Field>
            ) : (
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck; if ($?) { npm run build }`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add src/pages/AgendaPage.tsx
git commit -m "feat: avatares na lista de candidatos de troca da agenda"
```

---

### Task 7: Frontend — SwapsPage + ReportsPage (avatares)

**Files:**
- Modify: `src/pages/SwapsPage.tsx:60-69`
- Modify: `src/pages/ReportsPage.tsx:85-94`

- [ ] **Step 1: `SwapsPage` — import**

Após a linha 8 (`ConfirmDialog`), adicionar:

```ts
import { PersonAvatar } from "../components/ui/person-avatar";
```

- [ ] **Step 2: `SwapsPage` — avatar do solicitante e do alvo**

Na linha 60, trocar:

```tsx
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{s.requester_name}</p>
                    <Badge variant="warning">Pendente</Badge>
                  </div>
```

Por:

```tsx
                  <div className="flex items-center gap-2">
                    <PersonAvatar name={s.requester_name ?? "?"} avatarUrl={s.requester_avatar} />
                    <p className="font-semibold">{s.requester_name}</p>
                    <Badge variant="warning">Pendente</Badge>
                  </div>
```

Na linha 67-69, trocar:

```tsx
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.target_user_name ? `Deseja trocar com ${s.target_user_name}` : "Sem alvo definido — líder escolhe"}
                  </p>
```

Por:

```tsx
                  {s.target_user_name ? (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <PersonAvatar
                        name={s.target_user_name}
                        avatarUrl={s.target_user_avatar}
                        className="h-5 w-5 text-[9px]"
                      />
                      {`Deseja trocar com ${s.target_user_name}`}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Sem alvo definido — líder escolhe</p>
                  )}
```

- [ ] **Step 3: `ReportsPage` — import**

Após o import do `Badge` (linha 6), adicionar:

```ts
import { PersonAvatar } from "../components/ui/person-avatar";
```

- [ ] **Step 4: `ReportsPage` — avatar no ranking**

Na linha 88, trocar:

```tsx
                    <span className="min-w-0 truncate font-medium">{r.name}</span>
```

Por:

```tsx
                    <span className="flex min-w-0 items-center gap-2">
                      <PersonAvatar name={r.name} avatarUrl={r.avatar_url} className="h-6 w-6 text-[9px]" />
                      <span className="truncate font-medium">{r.name}</span>
                    </span>
```

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck; if ($?) { npm run build }`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add src/pages/SwapsPage.tsx src/pages/ReportsPage.tsx
git commit -m "feat: avatares nas trocas e no relatorio de participacao"
```

---

### Task 8: Detector + smoke de remoções/avatars

**Files:**
- Create: `%TEMP%\opencode\smoke-remocoes-avatar.mjs`

- [ ] **Step 1: Detector impeccable**

Run: `node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public`
Expected: exit 0, saída vazia (sem violations)

- [ ] **Step 2: Criar smoke `smoke-remocoes-avatar.mjs`**

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
  const raw = r.headers.get("set-cookie") || "";
  return raw.split(";")[0];
}

async function req(path, cookie, opts = {}) {
  return fetch(`${base}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers || {}) },
  });
}

const admin = await login("admin@montesiao.org");
const leader = await login("carlos@montesiao.org");

// 1. membros agrupados
let res = await req("/ministries/1/members", admin);
let members = await res.json();
check("admin GET membros 200", res.status === 200, `got ${res.status}`);
const ids = members.map((m) => m.id);
check("membros sem duplicatas", new Set(ids).size === ids.length, JSON.stringify(ids));
check("membro tem roles[] + avatar_url", members.every((m) => Array.isArray(m.roles) && "avatar_url" in m && "is_leader" in m));

// 2. cria membro temporário
res = await req("/users", admin, {
  method: "POST",
  body: JSON.stringify({ name: "Smoke Temp", email: `smoke-temp-${Date.now()}@test.local`, password: "senha123", role: "VOLUNTEER" }),
});
const created = await res.json();
check("criar usuário temporário", !!created.id, JSON.stringify(created));

res = await req("/ministries", admin);
const ministries = await res.json();
const m1 = ministries.find((m) => Number(m.id) === 1);
const roleId = m1?.roles?.[0]?.id;
check("ministério 1 tem função", !!roleId, JSON.stringify(m1?.roles ?? []));

res = await req("/ministries/1/members", admin, {
  method: "POST",
  body: JSON.stringify({ user_id: created.id, role_id: roleId }),
});
check("vincular temporário", res.status === 201, `got ${res.status}`);

// 3. líder do ministério 1 remove → 200
res = await req(`/ministries/1/members/${created.id}`, leader, { method: "DELETE" });
check("líder remove membro do seu ministério 200", res.status === 200, `got ${res.status}`);

res = await req("/ministries/1/members", admin);
members = await res.json();
check("temporário não está mais no ministério", !members.some((m) => m.id === created.id));

// 4. líder de outro ministério não remove (ministério 2 ≠ ministério 1)
res = await req("/ministries/1/members", admin, {
  method: "POST",
  body: JSON.stringify({ user_id: created.id, role_id: roleId }),
});
res = await req(`/ministries/2/members/${created.id}`, leader, { method: "DELETE" });
check("líder de outro ministério 403", res.status === 403, `got ${res.status}`);

// 5. admin exclui conta
res = await req(`/users/${created.id}`, admin, { method: "DELETE" });
check("admin exclui conta 200", res.status === 200, `got ${res.status}`);
res = await req(`/users?q=Smoke Temp`, admin);
const after = await res.json();
check("conta excluída some da lista", !after.some((u) => u.id === created.id));

// 6. avatar nos endpoints
res = await req("/schedules?month=" + new Date().toISOString().slice(0, 7), admin);
const schedules = await res.json();
check("schedules tem user_avatar", Array.isArray(schedules) && schedules.every((s) => "user_avatar" in s), `${schedules.length} linhas`);
res = await req("/events", admin);
const events = await res.json();
check("slots de events tem user_avatar", events.every((e) => (e.slots ?? []).every((s) => "user_avatar" in s)));
res = await req("/swaps", admin);
const swaps = await res.json();
check("swaps tem requester_avatar/target_user_avatar", swaps.every((s) => "requester_avatar" in s && "target_user_avatar" in s));
res = await req("/reports/participation", admin);
const report = await res.json();
check("relatório rows tem avatar_url", (report.rows ?? []).every((r) => "avatar_url" in r));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Smoke local**

Run (dev em `localhost:5173`): `node "$env:TEMP\opencode\smoke-remocoes-avatar.mjs"`
Expected: `all passed` (exit 0). Subir dev se necessário: `Start-Process cmd -ArgumentList "/c npm run dev > %TEMP%\opencode\vite-dev.log 2>&1"` e aguardar.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: smoke de remocoes e avatares"
```

(Não há arquivo novo no repo — o smoke vive em `%TEMP%`; se nada mudou no repo, pular o commit e ir ao Step 5.)

- [ ] **Step 5: Regressões locais**

Run: `node "$env:TEMP\opencode\smoke-min-leaders.mjs"; node "$env:TEMP\opencode\smoke-leaders.mjs"; node "$env:TEMP\opencode\smoke-playlists.mjs"`
Expected: 16/16, 17/17, 18/18 ALL PASS

---

### Task 9: Push + deploy + smoke em produção

**Files:** (nenhum — deploy)

- [ ] **Step 1: Push**

```bash
git push
```

- [ ] **Step 2: Assistir ao workflow**

```powershell
$runId = (gh run list --limit 1 --json databaseId | ConvertFrom-Json)[0].databaseId
gh run watch $runId --exit-status
```

Expected: `success`

- [ ] **Step 3: Smoke em produção**

```powershell
$env:SMOKE_BASE = "https://escala-monte-siao.leoqueirozyt.workers.dev/api"
node "$env:TEMP\opencode\smoke-remocoes-avatar.mjs"
node "$env:TEMP\opencode\smoke-min-leaders.mjs"
node "$env:TEMP\opencode\smoke-leaders.mjs"
node "$env:TEMP\opencode\smoke-playlists.mjs"
```

Expected: todos ALL PASS

---

### Teste manual (entregar ao usuário)

1. `carlos@montesiao.org` → Ministérios → no cartão do Louvor: membro com foto/inicial + funções em badges → ícone **remover** (`UserMinus`) → confirma → some. Ícone de lixeira (excluir conta) **não** aparece para líder.
2. `admin@montesiao.org` → mesmo cartão → também tem **lixeira** (excluir conta) → confirma → conta some de `/users`.
3. Escala (matriz): vaga preenchida mostra a foto do escalado (ou inicial); vaga vazia mostra `?` pontilhado; seletor de voluntário mostra foto + contagem.
4. Agenda (voluntário) → Solicitar troca → lista de candidatos com foto.
5. Trocas: foto do solicitante e do alvo. Relatórios: foto no ranking.
6. Perfil → trocar foto → aparece nos locais acima.
