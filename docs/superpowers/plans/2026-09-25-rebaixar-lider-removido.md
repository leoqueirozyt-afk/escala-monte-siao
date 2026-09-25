# Plano: Rebaixar líder removido a membro comum

**Spec:** `docs/superpowers/specs/2026-09-25-rebaixar-lider-removido-design.md` (`40e0fb1`, "execute" dado)
**Modo de execução:** inline (executing-plans nesta sessão), tudo na `main`.

## Contexto

- **Gatilho 1 — `applyLeaders`** (`server/routes/ministries.ts:19-53`, usado por `POST /` linha 104 e `PUT /:id` linha 123 só com `role='ADMIN'`): `DELETE FROM ministry_leaders` na **linha 24**; reinserção 25-42; promoção `VOLUNTEER→LEADER` 43-47; retorna `null` na linha 52.
- **Gatilho 2 — `DELETE /:id`** (`ministries.ts:129-133`): cascade remove `ministry_leaders` sem tocar no papel; 404 se `meta.changes === 0` (linha 131).
- **Sessão — `GET /me`** (`server/routes/auth.ts:96-131`): `payload` é o JWT (`requireAuth` em `server/lib/auth.ts:17-24` só verifica assinatura — **não consulta banco**; o cookie antigo continua tecnicamente válido até expirar, mitigação = troca do cookie; revogação fica fora de escopo). Branches usam `payload.role` nas linhas **105** (ADMIN → todos os ministérios) e **123** (LEADER → `leader_ministry_ids`). `signJwt` (linha 5) e `setToken` (linha 10) já estão no mesmo arquivo.
- `.first()` do D1 default `any` → acesso a propriedades já é padrão no repo (`ministries.ts:21-22`).
- **Verificação do spec S3 usa `GET /users/:id` que NÃO existe** (`users.ts` só tem `GET /`) → smoke usará `GET /users?q=<prefixo>` + `find(id)`.
- `smoke-excluir-ministerio` já prova que `POST /ministries` com `leader_ids` cria função "Líder" + vínculo (`applyLeaders` só cria "Líder" quando o ministério não tem funções; com funções pré-existentes vincula a **primeira por id**, linha 30 — por isso o unlink do rebaixamento é limitado ao vínculo nomeado `name = 'Líder'`, conforme decisão 2 da spec).
- Dev server **não hot-reloada** `server/` → reiniciar após cada mudança (matar PID da 5173 + `Start-Process cmd "/c npm run dev > %TEMP%\opencode\vite-dev.log 2>&1"` + loop `/api/health` até 200).

## Estratégia de verificação

Por task: `npm run typecheck` → `npm run build` → detector `node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public` (exit 0) → smokes. Fim: push + `gh run watch` + suíte de produção (10 smokes).

---

## Task 1 — `rebaixarSeOrfao` + 2 gatilhos (TDD)

### 1a. Smoke `smoke-rebaixa-lider.mjs` primeiro (vermelho) em `%TEMP%\opencode\`

Helpers `check/login/req` no padrão dos smokes existentes; `stamp` único; prefixos de e-mail `smoke-reb-*`; login do líder temporário capturado **enquanto ainda é LEADER** (após criar os 2 ministérios, antes da 2ª remoção).

1. **Líder de 2 ministérios:** `POST /users` (VOLUNTEER, com `phone`) → `POST /ministries {leader_ids:[u]}` ×2 → papel `LEADER`; `PUT m1 {leader_ids:[]}` → **segue `LEADER`**; `PUT m2 {leader_ids:[]}` → `VOLUNTEER`.
2. **Sessão:** com o cookie capturado no passo 1 (JWT `role:"LEADER"`): `GET /auth/me` → `user.role === "VOLUNTEER"` **e** header `set-cookie` com token novo cujo payload decodificado (`Buffer.from(part, "base64url")`) tem `role === "VOLUNTEER"`; com o **cookie novo** → `GET /users` (requireRole ADMIN/LEADER) = **403**. (Cookie antigo não é assertado — continua válido até expirar, limitação conhecida/out of scope.)
3. **Vínculo "Líder":** ministério **sem funções** + `leader_ids:[uB]` → `GET /:id/members` mostra `uB.is_leader === true`; removido (`PUT {leader_ids:[]}`) → `uB` **ausente** do members; papel `VOLUNTEER`; em `GET /ministries?scope=all` o ministério **ainda tem** função `name === "Líder"` (sem membros).
4. **Funções pré-existentes:** `uC` vinculado a `POST /:id/roles {name:"Vocal"}` + `POST /:id/members` → vira líder via `PUT {leader_ids:[uC]}` → removido → `GET /:id/members` ainda retorna `uC` com `role_name === "Vocal"`, `is_leader === false`, papel `VOLUNTEER`.
5. **ADMIN:** admin vira líder de ministério temporário (`POST /ministries {leader_ids:[1]}`) → removido (`PUT {leader_ids:[]}`) → papel segue `ADMIN`.
6. **PENDING_LEADER + DELETE:** `POST /auth/register {account_type:"leader", phone}` → `POST /ministries {leader_ids:[novo]}` → `DELETE /ministries/:id` → papel `VOLUNTEER` **e** `account_status === "ACTIVE"` (o `CASE` evita o gate de login).
7. **DELETE /ministries:** líder único de outro ministério temporário → `DELETE` → `VOLUNTEER`.
8. **Cleanup:** apagar ministérios e usuários temporários (`DELETE /users/:id` cascateia `user_roles`) + check final de limpeza.

- Rodar → **falha** (rebaixamento e renovação de JWT não existem ainda).

### 1b. `server/routes/ministries.ts`

Import: `rebaixarSeOrfao` (função local, acima de `applyLeaders`):

```ts
async function rebaixarSeOrfao(c: any, ministryId: number, userIds: number[]): Promise<void> {
  for (const uid of userIds) {
    const u = await c.env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(uid).first<any>();
    if (!u || u.role !== "LEADER") continue;
    const cnt = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM ministry_leaders WHERE user_id = ?").bind(uid).first<any>();
    if (Number(cnt?.n ?? 0) > 0) continue;
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE users SET role = 'VOLUNTEER', account_status = CASE WHEN account_status = 'PENDING_LEADER' THEN 'ACTIVE' ELSE account_status END WHERE id = ? AND role = 'LEADER'",
      ).bind(uid),
      c.env.DB.prepare(
        "DELETE FROM user_roles WHERE user_id = ? AND role_id IN (SELECT id FROM roles WHERE ministry_id = ? AND name = 'Líder')",
      ).bind(uid, ministryId),
    ]);
  }
}
```

(ADMIN/`VOLUNTEER` caem no `continue` do passo 1; `role='LEADER'` no UPDATE é trava extra.)

**Gatilho 1 — `applyLeaders`:** antes da linha 24 (DELETE): `const antes = await c.env.DB.prepare("SELECT user_id FROM ministry_leaders WHERE ministry_id = ?").bind(ministryId).all();` e derivar `const antesIds = (antes.results as any[]).map((r: any) => Number(r.user_id));`. Após a atualização `leader_id` (linha 49-51) e antes do `return null`:

```ts
const depois = await c.env.DB.prepare("SELECT user_id FROM ministry_leaders WHERE ministry_id = ?").bind(ministryId).all();
const depoisIds = new Set(depois.results.map((r: any) => Number(r.user_id)));
const removidos = antesIds.filter((id) => !depoisIds.has(id));
if (removidos.length > 0) await rebaixarSeOrfao(c, ministryId, removidos);
```

**Gatilho 2 — `DELETE /:id`:** `const antes = await c.env.DB.prepare("SELECT user_id FROM ministry_leaders WHERE ministry_id = ?").bind(id).all();` antes do DELETE; após `meta.changes` OK (fora do caminho do 404):

```ts
const lideres = (antes.results as any[]).map((r: any) => Number(r.user_id));
if (lideres.length > 0) await rebaixarSeOrfao(c, id, lideres);
```

### 1c. Verificação

typecheck + build + detector + **smoke-rebaixa parcial** (censos 1, 3-8 verdes; 2 ainda vermelha) + suíte local 10/10 (regressão — `applyLeaders` é caminho do `smoke-excluir-ministerio`).

## Task 2 — Renovação do JWT em `GET /me` (`server/routes/auth.ts`)

Após o 404 do `user` (linha ~103):

```ts
if (user.role !== payload.role) {
  const token = await signJwt({ sub: user.id, role: user.role, name: user.name }, c.env.JWT_SECRET);
  setToken(c, token);
}
```

E trocar `payload.role` → `user.role` nos branches: linha **105** (`ministries`) e linha **123** (`leader_ministry_ids`).

Reiniciar dev server → **smoke-rebaixa 100% verde** + suíte local 10/10 + typecheck/build/detector.

## Task 3 — Push + deploy + produção

1. `git status`/`diff --stat` → commit `feat: rebaixar lider removido a membro comum (ultima lideranca + renovacao de JWT)` → push.
2. `Start-Sleep 5; gh run list --limit 3` → run NOVO `in_progress` → `gh run watch <id> --exit-status`.
3. Sem migration → deploy já vem do CI.
4. Suíte produção completa (10 smokes, `SMOKE_BASE=https://escala-monte-siao.leoqueirozyt.workers.dev/api`) → 0 falhas.

## Task 4 — Fechamento

1. Marcar checkboxes + commit.
2. Resumo final em PT + checklist manual (remover líder de um ministério → some do menu ao F5, etc.).

## Fora de escopo

- Revogar JWT antigo (cookie é trocado; token replay continua válido até expirar); `PUT /users/:id` manual; rastrear origem dos vínculos `user_roles`; líder `PENDING_LEADER` que nunca liderou ministério.

## Checklist de conclusão

- [ ] Task 1: helper + 2 gatilhos; `smoke-rebaixa-lider` cenários 1,3-8 verdes; suíte local 10/10
- [ ] Task 2: `/auth/me` renova JWT + branches com `user.role`; smoke 100% verde; typecheck/build/detector 0
- [ ] Task 3: push, run CI success, 10 smokes de produção verdes
- [ ] Task 4: checkboxes, resumo PT entregue
