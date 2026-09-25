# Spec: Excluir funções (ministério, membro e escala)

**Data:** 2026-09-26
**Status:** aprovado em brainstorming

## Objetivo

Permitir excluir funções em três níveis, reutilizando rotas backend já existentes:

1. **A** — Excluir uma função do ministério (com aviso de impacto).
2. **B** — Remover uma função individual de um membro (membro com múltiplas funções).
3. **C** — Remover uma função (vaga) de um evento ao montar a escala.

Permissão: **líder do ministério** ou **ADMIN** (já garantida no backend por `canManage` / `assertScope`; a UI só aparece para quem pode editar).

## Decisões de design (aprovadas)

- Deleção de função com escalas é **permitida, com aviso de impacto** (contagens de vagas + membros) — não bloqueada. Cascade `ON DELETE CASCADE` apaga **apenas as vagas (linhas) daquela função** em `schedules` (o evento e as demais funções da escala permanecem) e `user_roles` (vínculo da função com membros); `schedule_group_members` cai em cascata junto. Histórico passado é removido junto (sem distinção passado/futuro).
- Nenhuma mudança de permissão: as rotas já checam `canManage` (líder do ministério ou ADMIN) e `assertScope`.
- Padrão visual: chips clicáveis com **X** e `ConfirmDialog` (padrão já existente no projeto).

## Seção A — Excluir função do ministério

### Backend (novo)

`GET /ministries/roles/:roleId/impact` em `server/routes/ministries.ts`:

- `requireAuth`; busca a função → `404` se não existe; `canManage(role.ministry_id)` → `403` se fora de escopo.
- Retorna `{ escalas: number, membros: number }`:
  - `escalas` = `COUNT(*) FROM schedules WHERE role_id = ?`
  - `membros` = `COUNT(DISTINCT user_id) FROM user_roles WHERE role_id = ?`
- Rota existente (sem mudança): `DELETE /ministries/roles/:roleId` (`server/routes/ministries.ts`).

### Frontend

- `MinistriesPage.tsx` — badges de função do card (só quando `canEdit(m)`): cada badge vira chip-clicável com X (alvo ≥ 24px). Ao clicar: busca `/impact` → `ConfirmDialog` destrutivo:
  - *"Excluir a função "X" de [Ministério]? As vagas dela serão removidas dos eventos (N vaga(s)) — o resto da escala permanece — e a função sai de M membro(s). Esta ação não pode ser desfeita."*
  - Confirmar → `DELETE /ministries/roles/:roleId` → toast → `load()`. Erro → toast de erro.
- `ScheduleMatrixPage.tsx` — card "Meu ministério": mesmo chip com X, mesmo diálogo e endpoint de impacto.
- Se `/impact` falhar → toast de erro, diálogo não abre.

## Seção B — Remover função individual do membro

### Backend

Nenhum. Já existe `DELETE /ministries/:id/members/:userId/:roleId` com `canManage` — remove só o vínculo `(user_id, role_id)`.

### Frontend

- `MemberList` em `MinistriesPage.tsx` (já só renderiza quando `canEdit`): badge de função do membro vira chip-clicável com X → `ConfirmDialog`:
  - *"Remover a função "X" de [Nome]? Se essa for a última função dela, ela deixa de aparecer na lista de membros."*
  - Confirmar → `DELETE /ministries/:id/members/:userId/:roleId` → toast → recarrega só a lista de membros (`membersTick`).
- Intocados: badge Líder (coroa), classificação de voz, botões "remover membro" e "excluir conta".

## Seção C — Remover função/vaga da escala

### Backend

Nenhum. Já existe `DELETE /schedules/:id` (`requireRole("ADMIN","LEADER")` + `assertScope`) — apaga a vaga; `schedule_group_members` cai em cascata.

### Frontend

- `ScheduleMatrixPage.tsx` — botão X (`text-destructive`, `aria-label="Remover função {role_name} deste evento"`) em toda linha de vaga, vazia ou preenchida:
  - Vaga vazia (ao lado de "Escalar"): *"Remover a função "X" deste evento? A vaga será apagada."*
  - Preenchida com pessoa: *"Remover "X" com [Pessoa] escalada? Ela perderá a escalação deste evento."*
  - Preenchida com grupo: *"Remover "X" com o grupo [G]? O grupo perderá a escalação."*
  - Confirmar → `DELETE /schedules/:id` → toast → recarrega a matriz.
- Distinção: "Liberar vaga" (lixeira) mantém a função e esvazia; **X** apaga a função do evento.

## Erros e estados

- Todos os `DELETE` em `try/catch` → `toast(erro, "error")` (padrão do projeto); diálogos fecham só no sucesso.
- 403/404 vindos do backend viram toast com a mensagem do servidor.

## Fora de escopo

- Renomear funções, reordenar funções, notificações de remoção, mudanças em permissões ou cascades.

## Verificação

- `npm run typecheck`, `npm run build`, detector impeccable (exit 0).
- Novo smoke `smoke-excluir-funcoes.mjs` autocontido (usuários temporários, padrão dos smokes existentes): impacto com contagens; líder do ministério e ADMIN excluem; líder de outro ministério 403; voluntário 403; remoção de função individual (membro com 2 funções perde 1; última função remove da lista); remoção de vaga vazia e preenchida; regressões (`smoke-min-leaders`, `smoke-leaders`, `smoke-playlists`, `smoke-remocoes-avatar`, `smoke-grupos-voz`) verdes — local e produção.
