# Rebaixar líder removido a membro comum — Design

**Data:** 2026-09-25
**Status:** Aprovado em conversa (4 perguntas + abordagem A + design em 3 seções)

## Problema

`applyLeaders` promove `VOLUNTEER→LEADER` quando alguém vira líder (server/routes/ministries.ts:44), mas **nunca rebaixa** quando a pessoa é removida. Resultado: após sair da liderança, a pessoa mantém `users.role='LEADER'` e conserva tudo que é gated por papel global — menu de líder (App.tsx:28, AppShell.tsx:81), escrever avisos (AvisosPage.tsx:21), playlists (PlaylistsPage.tsx:19), controles da matriz (ScheduleMatrixPage.tsx:285) e rotas do servidor `requireRole("ADMIN","LEADER")` (events, schedules, reports, users, ministries, swaps). O mesmo vale quando o ministério inteiro é excluído (cascade remove `ministry_leaders` sem tocar no papel).

## Decisões (respondidas pelo usuário)

1. **Regra de rebaixamento:** só quando a pessoa perde o **último** ministério que lidera (sair de um de vários não rebaixa).
2. **Membros:** continua membro do ministério com as funções que já tinha; perde o vínculo/liderança. O vínculo automático da função **"Líder"** é removido.
3. **Exclusão de ministério:** vale a mesma regra (líder órfão do cascade também é rebaixado).
4. **Sessão:** efeito ao recarregar a página (sem deslogar à força); renovação automática do token detecta o papel mudado.

## S1 — Backend (`server/routes/ministries.ts`)

Função auxiliar `rebaixarSeOrfao(c, ministryId, userIds)` — para cada id:

1. Ler `role, account_status` do usuário. Se `role !== 'LEADER'` → nada (ADMIN nunca é tocado; VOLUNTEER idem).
2. `SELECT COUNT(*) FROM ministry_leaders WHERE user_id = ?` → se > 0, ainda lidera outro ministério → nada.
3. Se 0: em batch —
   - `UPDATE users SET role = 'VOLUNTEER', account_status = CASE WHEN account_status = 'PENDING_LEADER' THEN 'ACTIVE' ELSE account_status END WHERE id = ? AND role = 'LEADER'` (o `CASE` evita bloqueio de login pelo gate `PENDING_LEADER` de um cargo que não existe mais);
   - `DELETE FROM user_roles WHERE user_id = ? AND role_id IN (SELECT id FROM roles WHERE ministry_id = ? AND name = 'Líder')` — remove só o vínculo automático da função "Líder" daquele ministério; funções pré-existentes (ex.: Vocal) são mantidas e ela segue aparecendo em `/ministries/:id/members` como membro comum.

Gatilhos:

1. **`applyLeaders`** (ministries.ts:19 — usado por `POST /ministries` e `PUT /:id`, este só com `role='ADMIN'`): antes do `DELETE FROM ministry_leaders` (linha 24), capturar `SELECT user_id ... WHERE ministry_id = ?`. Após a reinserção, `removidos = antes − depois` → `rebaixarSeOrfao(c, ministryId, removidos)`.
2. **`DELETE /ministries/:id`** (ministries.ts:129): antes do `DELETE`, capturar os líderes do ministério; após o cascade, `rebaixarSeOrfao(c, id, lideres)` — o unlink de `user_roles` é no-op ali (as funções já caíram no cascade das `roles`), mas a rebaixada do papel vale normalmente.

Simetria: entrada promove (`VOLUNTEER→LEADER`), saída rebaixa (`LEADER→VOLUNTEER`) só no último ministério.

## S2 — Sessão (`server/routes/auth.ts` — `GET /me`, linha 96)

Após ler `user` do banco: se `user.role !== payload.role` → `signJwt({ sub, role: user.role, name }, JWT_SECRET)` + `setToken(c, novoToken)` (re-emissão do cookie, mesmo TTL de 7 dias). E nos branches de `ministries`/`leader_ministry_ids` do próprio handler (auth.ts:105 e 123), usar **`user.role`** (banco) em vez de `payload.role` (JWT) — senão a resposta fica inconsistente na primeira carga pós-mudança.

- A UI já lê o papel do banco em `/auth/me` → menu/páginas corrigem no F5.
- O JWT antigo (com papel LEADER) deixa de ser aceito pelo servidor após a renovação → rotas `requireRole("ADMIN","LEADER")` passam a negar.
- Sem deslogar, sem lista negra de tokens, sem infra de sessão.

## S3 — Verificação

Smoke novo `smoke-rebaixa-lider.mjs` (`%TEMP%\opencode\`, autocontido, TDD vermelho→verde, `SMOKE_BASE`):

- líder de 2 ministérios: removido de 1 → segue `LEADER`; removido do 2º → `VOLUNTEER` (usa `GET /users/:id` ou `GET /auth/me`);
- `GET /auth/me` com sessão antiga retorna `VOLUNTEER` **e** `Set-Cookie` novo decodifica com `role:"VOLUNTEER"`;
- com o cookie novo, `GET /users` (requireRole ADMIN/LEADER) → 403;
- ministério sem funções: `POST /ministries` com `leader_ids` cria função "Líder" + vínculo → líder removido → vínculo de `user_roles` some (via `/ministries/:id/members`), papel "Líder" permanece (sem membros);
- removido mantém funções pré-existentes: voluntário já vinculado a "Vocal" que vira líder e depois é removido → continua em `/ministries/:id/members` com "Vocal";
- ADMIN removido da liderança → continua `ADMIN`;
- `DELETE /ministries/:id` com líder sem outros ministérios → rebaixado;
- cleanup (usuários/ministérios/eventos temporários).

Evidência por task: `npm run typecheck` + `npm run build` + detector `node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public` (exit 0) + smoke. No fim: push + `gh run watch` + suíte de produção (3 smokes da regressão + novo).

## Fora de escopo

- Mudança manual de papel pela API `PUT /users/:id` (já funciona, não mexe em `ministry_leaders`).
- Deslogar sessões ativas à força.
- Rastrear vínculos `user_roles` criados por promoção (sem migração; só o vínculo "Líder" nomeado é removido).
- Rebaixar líder `PENDING_LEADER` que nunca foi líder de ministério (gatilho só dispara em remoção real).
