# Aba Ministérios para líderes — Design Spec

**Data:** 2026-09-25
**Status:** Aprovado pelo usuário
**Escopo:** Líderes passam a ver e usar a aba Ministérios — editando apenas o ministério que lideram; outros ministérios aparecem somente-leitura; ADMIN continua editando todos.

## Regras aprovadas

1. **Acesso:** rota `/ministerios` muda de `AdminOnly` para `LeaderOnly` (líder + admin); item de menu "Ministérios" sai do `adminNav` e vai para o `leaderNav` (visível a líderes).
2. **Visão (opção B escolhida):** líder vê **todos** os ministérios, mas só mexe no que lidera; os demais aparecem bloqueados (somente leitura).
3. **Backend — escopo de leitura:** `GET /ministries?scope=all` retorna a lista completa (sem filtro de `leaderMinistryIds`) para ADMIN e LEADER. **Sem o parâmetro, o comportamento atual é mantido** (líder vê só os seus) — necessário porque `ScheduleMatrixPage` consome o endpoint sem parâmetro e depende do escopo (usa `ministries[0]` e monta o seletor de funções).
4. **Backend — mutações:**
   - `PUT /ministries/:id`: de `requireRole("ADMIN")` passa a exigir `canManage(id)` (admin OU líder daquele ministério via ponte `ministry_leaders`).
   - `leader_ids` no `PUT` **só é aplicado quando o chamador é ADMIN**; líder edita apenas `name`/`description`.
   - `POST /` (criar) e `DELETE /:id` (excluir) permanecem `requireRole("ADMIN")`.
   - `roles`/`members` (criar/editar/vincular): já usam `canManage` — inalterados.
5. **UI — `MinistriesPage`:**
   - Lista carregada de `/ministries?scope=all`.
   - `canEdit(m)` no cliente = `user.role === "ADMIN"` ou `m.leader_ids` contém `user.id`.
   - Cartão não editável: esconde botões Editar/Função/Membro, exibe selo "Somente leitura"; **a busca de membros (`GET /:id/members`) só é feita para ministérios editáveis** (o endpoint é protegido por `canManage` e retornaria 403).
   - Cartão editável (próprio ou admin): botões e diálogos atuais funcionando; no diálogo "Editar", o campo "Líderes" (checkboxes) só é exibido para ADMIN — líder edita nome/descrição.
   - Seções ADMIN-only na página: botão "Novo" (criar ministério) e cartão "Aprovação de líderes"; a requisição `GET /users?status=PENDING_LEADER` só é feita quando o usuário é ADMIN (o endpoint retorna 403 para não-admin).

## Arquivos previstos

| Arquivo | Mudança |
|---|---|
| `src/App.tsx` | rota `/ministerios`: `AdminOnly` → `LeaderOnly` |
| `src/components/layout/AppShell.tsx` | mover item "Ministérios" de `adminNav` para `leaderNav` |
| `server/routes/ministries.ts` | `GET /` aceita `?scope=all`; `PUT /:id` usa `canManage` + `leader_ids` só-admin |
| `src/pages/MinistriesPage.tsx` | `?scope=all`, `canEdit`, cartões somente-leitura, membros só dos editáveis, seções admin condicionais |

## Não muda

- `ScheduleMatrixPage` (sem parâmetro → escopo atual preservado).
- Guards de outras páginas; guards de roles/members no backend.
- Permissões de playlists, escalas, eventos.

## Verificação

1. `npm run typecheck` + `npm run build` + detector impeccable.
2. Smoke API (dev + produção):
   - Admin: `GET /ministries?scope=all` lista todos; `PUT` em qualquer ministério → 200.
   - Líder (carlos): `GET /ministries?scope=all` lista todos; `PUT` no Louvor (id 1, `name`) → 200; `PUT` no Mídia/Infantil → 403; `PUT` com `leader_ids` no seu → 200 mas **ignorado** (líderes inalterados); `GET /ministries` (sem scope) → só os seus; `POST /ministries` → 403.
   - Voluntário: `GET /ministries` → 403 (já é `requireRole`).
3. Teste manual: login `carlos@montesiao.org` → vê menu "Ministérios" → entra → vê todos com selo "Somente leitura" → no Louvor edita nome/funções/membros → em outro ministério nenhum botão → admin vê tudo.

## Fora de escopo

- Corrigir a limitação conhecida `ministries[0]` do `ScheduleMatrixPage` (registro no spec de múltiplos líderes).
- Permitir que líder redefina liderança de ministérios (`leader_ids`) — exclusivo de ADMIN.
- Alterar quem pode criar/excluir ministérios (ADMIN).
