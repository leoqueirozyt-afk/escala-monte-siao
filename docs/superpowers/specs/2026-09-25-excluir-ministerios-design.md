# Excluir Ministérios — Design

**Data:** 2026-09-25
**Status:** Aprovado em conversa (permissões + comportamento com dados + design em 3 seções)

## Problema

Não é possível excluir um ministério criado por engano. O endpoint `DELETE /api/ministries/:id` (ADMIN, cascata) **já existe** (`server/routes/ministries.ts:129-132`) — o que falta é a **UI** (botão + confirmação com contagens) e um **endpoint de contagens**; e o DELETE atual responde `{ok}` mesmo para id inexistente (sem 404).

## Decisões (respondidas pelo usuário)

- **Quem pode excluir:** somente **ADMIN** (líder não apaga nem o próprio ministério).
- **Ministério com histórico:** permitir excluir mesmo com dados, mas com **diálogo de confirmação que mostra as contagens** do que será apagado em cascata.

## Cadeia de dados (verificada nas migrations)

`ministries` → cascata: `roles` (→ `user_roles`, `schedules`), `ministry_leaders`, `voice_groups`, `notices`. Tabela `events` **não** tem FK de ministério — cultos são compartilhados e permanecem. Verificado: `migrations/0001_init.sql:25,33,52`, `0005:5`, `0006:24`, `0007:3`.

## Solução

### S1 — Backend (`server/routes/ministries.ts`)

1. **Novo** `GET /api/ministries/:id/impact` (nome espelha o existente `GET /roles/:roleId/impact`, linha 154) — `requireRole("ADMIN")`, retorna chaves em português como o padrão existente:
   ```json
   { "funcoes": 4, "escalas": 12, "membros": 5, "lideres": 2, "grupos": 2, "avisos": 1 }
   ```
   Contagens via `batch`: `roles WHERE ministry_id=?`; `schedules` e `user_roles` (`COUNT(DISTINCT user_id)`) com `role_id IN (SELECT id FROM roles WHERE ministry_id=?)`; `ministry_leaders`, `voice_groups`, `notices` por `ministry_id`. Ministério inexistente → 404.
2. **Existente** `DELETE /api/ministries/:id` (ADMIN) — **endurecer**: 404 quando `meta.changes === 0` (id inexistente), mantendo `{ ok: true }` no sucesso. Cascata já garantida pelos FKs.

Líder (não-admin) nas duas rotas → 403.

### S2 — Frontend (`src/pages/MinistriesPage.tsx`)

- Botão **Excluir** (`Trash2`, `variant="destructive"` outline-estilo consistente com os demais) no card, ao lado de Editar/Função/Membro — renderizado **apenas quando `isAdmin`**.
- Clique → `api.get` em `/ministries/:id/impact` → abre `ConfirmDialog` (`destructive`, `busy`) com descrição montada a partir das contagens, ex.: *"Isso apagará 4 funções, 12 escalas, 5 membros, 2 líderes, 2 grupos e 1 aviso. Esta ação não pode ser desfeita."*
- Confirmar → `api.delete(/ministries/:id)` → `toast("Ministério excluído")` → `ministriesQ.reload()` (e limpar dialog).
- Erro no impact ou no delete → `toast(erro, "error")`, diálogo fecha ou mantém com busy=false.

### S3 — Verificação

- **Smoke novo** `smoke-excluir-ministerio.mjs` (autocontido, em `%TEMP%\opencode\`, `SMOKE_BASE`):
  - 401 sem login nas 2 rotas;
  - `/impact` e delete como **líder** (carlos) → 403;
  - cria ministério + função + membro + escala (evento futuro próprio) como admin;
  - `/impact` como admin → contagens corretas (funcoes:1, escalas:1, membros:1, …);
  - delete → 200; lista sem o ministério; escala não existe mais (GET /schedules mês do evento); evento permanece (events não cascateiam);
  - delete de id inexistente → 404; cleanup dos usuários/evento temporários.
- typecheck + build + detector exit 0; regressão local (`smoke-avisos`, `smoke-leaders`); push + deploy com watch; suíte de 3 smokes em produção.

## Fora de escopo

- Exclusão por líder (recusada pelo usuário).
- Arquivamento/restauração (soft delete).
- Excluir/editar eventos ao excluir ministério (events permanecem).
- Interface de excluir em outras telas (Início, matriz).
