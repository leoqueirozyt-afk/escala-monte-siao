# Time do culto na Agenda + correção de status de grupo — Design

**Data:** 2026-09-28
**Status:** Aprovado em conversa (4 perguntas + abordagem A + layout B + design em 3 seções)
**Branch:** `feature/minha-nova-funcionalidade` (sem deploy — CI só publica `main`)

## Problema

**Bug principal (reportado):** quando o líder escala um **grupo**, `schedules.user_id` fica `NULL` (`schedules.ts:192`) e a confirmação do membro é gravada em `schedule_group_members` (`schedules.ts:244-251`). Consequências:

- `StatusBadge.statusLabel` testa `user_id` **antes** do status (`src/components/StatusBadge.tsx:11`) → o membro vê **"Vago"** mesmo confirmado; o card ainda imprime `notes = "Vaga em aberto"` gravado na criação da vaga (`events.ts:81`) e nunca limpo.
- O líder vê "confirmado" (agrega `schedule_group_members` na matriz, `ScheduleMatrixPage.tsx:243-268`) → **para um a vaga confirmada, para o outro aberta**. O Dashboard se contradiz: hero "Presença confirmada" (`DashboardPage.tsx:155`) × badge "Vago" na lista (`:215`).

**Problemas colaterais da mesma raiz (escopo aprovado):**

1. **Push ausente no grupo:** branch do grupo do `PATCH /schedules/:id` não chama `notifyUser` (o individual chama, `schedules.ts:212-219`).
2. **Membro tardio:** entrar no grupo depois da escala (`voice.ts:100-102`, só grava `voice_group_members`) não cria linha em `schedule_group_members` → a vaga não aparece na Agenda (`/my`, `schedules.ts:61`) e `respond` retorna 404 (`schedules.ts:250`).
3. **Relatório × grupos:** `GET /reports/participation` faz `JOIN users u ON u.id = s.user_id` (`reports.ts:31`) e conta `s.user_id IS NULL` como vaga vazia (`reports.ts:41`) → slots de grupo confirmados somem do relatório e viram "vagas vazias".

**Feature (aprovada):** o membro quer ver, no card da **Agenda**, o **time do culto inteiro** (grupo + individuais do mesmo evento) com função e status de cada um — seção **recolhível** (layout B).

## Decisões (respondidas pelo usuário)

1. Ponto de entrada: **Agenda** (abaixo dos botões Confirmar/Recusar do card).
2. Time = **time do culto inteiro** (membros de grupo + todas as pessoas escaladas no mesmo evento), inclusive para vagas individuais.
3. Cada pessoa: **avatar/nome + função + badge de status**; "· você" destacado.
4. Layout **B**: seção "Time" **recolhível** (tap para expandir).
5. Escopo do fix: bug principal + membro tardio + relatório + push (os 4).

## S1 — Correção de status (bug principal)

- **`StatusBadge`** (`src/components/StatusBadge.tsx`): passa a aceitar o contexto de grupo. Regra nova: `user_id` nulo **e sem grupo** → "Vago"; **com grupo** → exibir o `status` recebido. No `GET /schedules/my` todo retorno já é do próprio usuário (individual atribuída ou grupo do qual é membro) e o override de status (`schedules.ts:78-81`) já entrega o status **correto do usuário** — a badge só precisa parar de olhar `user_id` primeiro. **Auditar todos os consumers** de `StatusBadge`/`statusLabel` no plano (a matriz do líder já tem lógica própria e suprime a badge para grupos, `ScheduleMatrixPage.tsx:482`).
- **`notes`:** o `PATCH /schedules/:id` passa a **limpar `notes`** ao atribuir/reatribuir (branch individual e branch de grupo — nos `UPDATE` de `schedules.ts:164-199` e `:201-221`). Assim "Vaga em aberto" deixa de aparecer no card. Notas de troca são escritas pela rota própria de swaps (`swaps.ts:131`) e não são afetadas.
- Sem migration.

## S2 — Rota do time `GET /events/teams?ids=`

- **Autorização:** para cada `id`, o caller precisa ter escala no evento (`schedules.user_id = caller` **ou** presença em `schedule_group_members` daquele evento) **ou** ser `ADMIN`/`LEADER`. Ids sem acesso são **ignorados** (a resposta contém só os acessíveis; 401 sem login).
- **Retorno:** `{ [eventId]: [{ user_id, name, avatar_url, role_name, status, is_group }] }`.
  - Slots individuais: `schedules JOIN users JOIN roles` — `status = schedules.status`, `is_group = false`.
  - Membros de grupo: `schedule_group_members JOIN schedules JOIN users JOIN roles` — `status = sgm.status`, `is_group = true`.
  - Uma linha por assignment (mesma pessoa em 2 funções = 2 linhas). Ordenação: nome.
- **Frontend (`AgendaPage`):** após `GET /schedules/my`, coleta os `event_id` distintos e faz **1 chamada** a `/events/teams?ids=...`; guarda num mapa `event_id → pessoas` e renderiza no card.

## S3 — Card da Agenda (layout B)

Abaixo dos botões Confirmar/Recusar, seção recolhível:

- Cabeçalho: **"Time do culto"** + contagem (ex.: `4 pessoas ▾`); toque expande/recolhe (estado por `schedule.id`).
- Linha: avatar (ou inicial) + nome (**`· você`** destacado em destaque na sua linha) + função + badge de status (Confirmado / Pendente / Recusado).
- Badge principal do card já corrigida pela S1 ("Confirmado", não "Vago").
- Estado vazio (sem team retornado): não renderiza a seção.

## S4 — Demais fixes

1. **Push no grupo:** branch de grupo do `PATCH /schedules/:id`, após o batch, chama a mesma notificação do individual (`notifyUser` de `schedules.ts:212-219`) para **cada membro** do grupo.
2. **Membro tardio:** em `voice.ts` (adição de membro ao grupo), além de `voice_group_members`, `INSERT OR IGNORE` em `schedule_group_members` para as **escalas futuras** daquele grupo (`schedule_group_members` via `schedules.group_id = grupo` + `events.event_date >= now`), status `PENDING` → vaga aparece em `/my` e `respond` passa a funcionar.
3. **Relatório:** `GET /reports/participation` passa a incluir membros de grupo (assignments de `schedule_group_members`) e define **vaga vazia** somente como slot com `user_id IS NULL AND group_id IS NULL`.

## S5 — Verificação (TDD)

Smoke novo `smoke-time-agenda.mjs` (`%TEMP%\opencode\`, autocontido, `SMOKE_BASE`):

- `/events/teams`: 401 sem login; evento alheio não retorna; conteúdo (individual + grupo) com `role_name`/`status`/`is_group` corretos.
- `PATCH /schedules/:id` (individual e grupo) limpa `notes`.
- Membro adicionado ao grupo **depois** da escala: vaga aparece em `GET /schedules/my` e `POST /schedules/:id/respond` → 200.
- Relatório: slot de grupo com membro confirmado **não** conta como vaga vazia; membro aparece na participação.
- Regressão: suíte completa local (11 smokes).

DOM check headless (Chrome CDP, padrão do repo): badge "Confirmado" (não "Vago") na Agenda para vaga de grupo confirmada + seção "Time do culto" recolhível expandindo com as linhas.

Evidência por task: `npm run typecheck` + `npm run build` + detector `node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public` (exit 0) + smoke. Fim: push para **`feature/minha-nova-funcionalidade`** (não `main` — sem deploy).

## Fora de escopo

- Merge/deploy para `main` (decisão futura do usuário).
- Trocas (`swaps`) para vagas de grupo (já bloqueadas no UI).
- Notificação por push para membros de grupos em eventos passados; paginação da rota de time.
- Re-escalar grupo preservando confirmações antigas (hoje reseta — comportamento mantido).

## Checklist de conclusão

- [x] Task 1: StatusBadge + limpeza de notes (+ audit de consumers); smoke parcial
- [x] Task 2: rota `/events/teams` + AgendaPage (mapa + seção recolhível); smoke verde
- [x] Task 3: push de grupo + membro tardio + relatório; smoke verde; regressão 11 smokes
- [x] Task 4: typecheck/build/detector 0 + DOM check + push branch + resumo PT
