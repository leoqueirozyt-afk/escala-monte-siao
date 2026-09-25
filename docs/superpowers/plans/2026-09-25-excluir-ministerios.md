# Plano: Excluir Ministérios (UI + impact + 404)

**Spec:** `docs/superpowers/specs/2026-09-25-excluir-ministerios-design.md` (`35a2ca4`)
**Modo de execução:** inline (executing-plans nesta sessão), tudo na `main`.

## Contexto

- Backend: `server/routes/ministries.ts` — `DELETE /:id` (ADMIN, cascata) **já existe** nas linhas 129-132, mas responde `{ok}` para id inexistente; não há endpoint de contagens.
- Frontend: `src/pages/MinistriesPage.tsx` — padrão de exclusão com impacto já existe para funções: estado `roleDeleteTarget` (linhas 37-41), `openRoleImpact` (159-166), `deleteRole` (168-178), `ConfirmDialog` (557-569). Componente `ConfirmDialog` aceita `busy` (`src/components/ui/confirm-dialog.tsx:11`).
- `isAdmin` (linha 50), `canEdit` (51), `load()` (84) recarrega `ministriesQ/usersQ/pendingQ/membersTick`.
- Colunas cascateadas confirmadas: `ministry_leaders.ministry_id` (0005:5), `voice_groups.ministry_id` (0006:24), `notices.ministry_id` (0007:3).
- Rotas existentes do arquivo: `get("/")` 55, `post("/")` 91, `put("/:id")` 113, `delete("/:id")` 129, `post("/:id/roles")` 134, `delete("/roles/:roleId")` 145, `get("/roles/:roleId/impact")` 154, `post("/:id/members")` 169, `delete("/:id/members/:userId/:roleId")` 182, `delete("/:id/members/:userId")` 191, `get("/:id/members")` 203. **Não existe `get("/:id")`** → inserir `get("/:id/impact")` após o DELETE (linha 132) não conflita (`/roles/:roleId/impact` tem 3 segmentos; `/:id/impact` casa só 2).

## Estratégia de verificação

Repetida por task: `npm run typecheck` → `npm run build` → detector `node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public` (exit 0) → smoke relevante (`SMOKE_BASE` default `http://localhost:5173/api`, senha `senha123`). No fim: push + `gh run watch` + suíte de prod.

---

## Task 1 — Backend: `GET /:id/impact` + 404 no DELETE (TDD)

1. **Smoke primeiro (vermelho):** criar `%TEMP%\opencode\smoke-excluir-ministerio.mjs` espelhando o scaffolding do `smoke-excluir-funcoes.mjs` (login admin/carlos, criação autocontida + cleanup). Checks:

   - 401 sem cookie: `GET /ministries/1/impact` e `DELETE /ministries/1`;
   - líder carlos: `GET /ministries/1/impact` → 403; `DELETE /ministries/1` → 403;
   - admin: POST `/ministries` (nome único c/ timestamp) → `POST /:id/roles` → `POST /:id/members` (user maria id 6) → `POST /events` (data futura 2026-12-20) → `POST /schedules` (role+evento) → `POST /notices` (ministry_id);
   - `GET /:id/impact` → `{funcoes:1, escalas:1, membros:1, lideres:0, grupos:0, avisos:1}` (as 6 chaves);
   - `DELETE /:id` → 200 `{ok:true}`; GET `/ministries` não contém mais o nome; `GET /schedules?month=2026-12` não contém a escala; `GET /events` ainda contém o evento (não cascateia);
   - `DELETE /ministries/9999999` → 404; `GET /ministries/9999999/impact` → 404;
   - cleanup: `DELETE /events/:id` temporário.
   - Rodar → **falha** (404/impact não existe ainda).

2. **Código em `server/routes/ministries.ts`** — trocar linhas 129-132 por:

   ```ts
   ministryRoutes.delete("/:id", requireRole("ADMIN"), async (c) => {
     const r = await c.env.DB.prepare("DELETE FROM ministries WHERE id = ?").bind(Number(c.req.param("id"))).run();
     if ((r.meta.changes ?? 0) === 0) return c.json({ error: "Ministério não encontrado" }, 404);
     return c.json({ ok: true });
   });

   ministryRoutes.get("/:id/impact", requireRole("ADMIN"), async (c) => {
     const id = Number(c.req.param("id"));
     const min = await c.env.DB.prepare("SELECT id FROM ministries WHERE id = ?").bind(id).first();
     if (!min) return c.json({ error: "Ministério não encontrado" }, 404);
     const counts = await c.env.DB.batch([
       c.env.DB.prepare("SELECT COUNT(*) AS n FROM roles WHERE ministry_id = ?").bind(id),
       c.env.DB.prepare("SELECT COUNT(*) AS n FROM schedules WHERE role_id IN (SELECT id FROM roles WHERE ministry_id = ?)").bind(id),
       c.env.DB.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM user_roles WHERE role_id IN (SELECT id FROM roles WHERE ministry_id = ?)").bind(id),
       c.env.DB.prepare("SELECT COUNT(*) AS n FROM ministry_leaders WHERE ministry_id = ?").bind(id),
       c.env.DB.prepare("SELECT COUNT(*) AS n FROM voice_groups WHERE ministry_id = ?").bind(id),
       c.env.DB.prepare("SELECT COUNT(*) AS n FROM notices WHERE ministry_id = ?").bind(id),
     ]);
     const n = (i: number) => Number((counts[i].results as any[])[0]?.n ?? 0);
     return c.json({ funcoes: n(0), escalas: n(1), membros: n(2), lideres: n(3), grupos: n(4), avisos: n(5) });
   });
   ```

3. typecheck + build + detector + smoke do Task 1 → **verde (N/N checks)**.

## Task 2 — Frontend: botão Excluir + ConfirmDialog

Em `src/pages/MinistriesPage.tsx`:

1. Tipo + estados — adicionar `type MinistryImpact = { funcoes: number; escalas: number; membros: number; lideres: number; grupos: number; avisos: number };` antes de `export function MinistriesPage()`; após o estado `roleDeleteTarget` (linha 41):

   ```ts
   const [ministryDeleteTarget, setMinistryDeleteTarget] = useState<{ ministry: Ministry; impact: MinistryImpact } | null>(null);
   const [deletingMinistry, setDeletingMinistry] = useState(false);
   ```

2. Funções — após `deleteRole` (linha 178):

   ```ts
   const openMinistryImpact = async (ministry: Ministry) => {
     try {
       const impact = await api.get<MinistryImpact>(`/ministries/${ministry.id}/impact`);
       setMinistryDeleteTarget({ ministry, impact });
     } catch (e) {
       toast(e instanceof Error ? e.message : "Erro", "error");
     }
   };

   const deleteMinistry = async () => {
     if (!ministryDeleteTarget) return;
     setDeletingMinistry(true);
     try {
       await api.delete(`/ministries/${ministryDeleteTarget.ministry.id}`);
       toast(`Ministério "${ministryDeleteTarget.ministry.name}" excluído.`);
       setMinistryDeleteTarget(null);
       load();
     } catch (e) {
       toast(e instanceof Error ? e.message : "Erro", "error");
     } finally {
       setDeletingMinistry(false);
     }
   };
   ```

3. Botão no card — dentro do `<div className="flex flex-wrap justify-end gap-2">` (linha 320), **depois** do ternário `canEdit` (ou seja, antes do fechamento `</div>` da linha 338):

   ```tsx
   {isAdmin && (
     <Button
       size="sm"
       variant="outline"
       className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
       onClick={() => openMinistryImpact(m)}
     >
       <Trash2 size={14} /> Excluir
     </Button>
   )}
   ```

4. `ConfirmDialog` — logo após o diálogo `roleDeleteTarget` (após a linha 569):

   ```tsx
   <ConfirmDialog
     open={!!ministryDeleteTarget}
     title="Excluir ministério"
     description={
       ministryDeleteTarget
         ? `Excluir o ministério "${ministryDeleteTarget.ministry.name}"? Serão removidos em cascata ${ministryDeleteTarget.impact.funcoes} função(ões), ${ministryDeleteTarget.impact.escalas} escala(s), ${ministryDeleteTarget.impact.membros} membro(s), ${ministryDeleteTarget.impact.lideres} líder(es), ${ministryDeleteTarget.impact.grupos} grupo(s) e ${ministryDeleteTarget.impact.avisos} aviso(s). Os cultos (eventos) permanecem. Esta ação não pode ser desfeita.`
         : undefined
     }
     confirmLabel="Excluir ministério"
     destructive
     busy={deletingMinistry}
     onConfirm={deleteMinistry}
     onClose={() => setMinistryDeleteTarget(null)}
   />
   ```

5. typecheck + build + detector + regressão local (`smoke-avisos` + `smoke-leaders` + `smoke-excluir-ministerio`).

## Task 3 — Push + deploy + produção

1. `git status` → `git diff --stat` → commit `feat: excluir ministerios (UI + impact + 404)` → push.
2. `Start-Sleep 5; gh run list --limit 3` → escolher run **NOVO** `in_progress` → `gh run watch <id> --exit-status`.
3. Deploy do Worker: `npm run deploy` (não há migration nova nesta feature).
4. Suíte de produção: `SMOKE_BASE=...` rodar `smoke-excluir-ministerio`, `smoke-avisos`, `smoke-leaders` → 0 falhas.

## Task 4 — Fechamento

1. Marcar checkboxes deste plano e commitar.
2. Aplicar regra **finishing-a-development-branch**: resumo final em PT + checklist de teste manual no navegador (admin vê Excluir; líder não vê; diálogo com contagens; confirmação apaga e recarrega; cancelar não apaga; evento permanece).

## Fora de escopo

- Exclusão por líder, soft delete, excluir/editar eventos junto, excluir em outras telas (spec).

## Checklist de conclusão

- [ ] Task 1: smoke `smoke-excluir-ministerio` escrito e verde local; typecheck/build/detector 0
- [ ] Task 2: botão só admin + diálogo com contagens + regressão de 3 smokes verdes
- [ ] Task 3: push/commit na main, deploy verde, 3 smokes de produção verdes
- [ ] Task 4: checkboxes marcados, resumo PT entregue
