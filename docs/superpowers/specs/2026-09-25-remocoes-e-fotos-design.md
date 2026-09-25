# Remoções de Membros/Contas + Fotos de Pessoas em Todos os Lugares

**Data:** 2026-09-25
**Status:** Aprovado

## Objetivo

1. Permitir que **líderes removam membros** do ministério que lideram e que **admins excluam contas** (ban permanente).
2. Exibir a **foto do membro** (`avatar_url`) em todos os lugares onde nomes de pessoas aparecem — escala, ministérios, agenda, dashboard, trocas e relatórios — para **todos os usuários**.

## Contexto

- `DELETE /ministries/:id/members/:userId/:roleId` já existe (guarda `canManage`), mas não há botão na UI.
- `DELETE /users/:id` já existe (ADMIN). O schema já produz o comportamento de exclusão permanente: `schedules.user_id` → `ON DELETE SET NULL` (vaga vira "em aberto"), `user_roles`/`ministry_leaders`/trocas → `CASCADE`. Sem migration nova.
- Upload de foto já existe no Perfil (`avatar_url` no `users`), mas só é exibida no cabeçalho do AppShell.
- A lista de membros (`GET /:id/members`) retorna linhas por vínculo (sem agrupamento, sem `role_id`, sem `avatar_url`).

## Decisões (aprovadas)

- **Exclusão de conta = permanente (opção A):** apaga conta e vínculos; histórico de escalas fica sem a pessoa (vaga em aberto), conforme FKs existentes.
- **Fotos em todos os lugares (opção C):** todo local com nomes de pessoas.
- **Remover liderança sem excluir conta:** admin continua pelo diálogo Editar (checkboxes) — capacidade já existente.
- Usuários sem foto recebem **círculo com a inicial** (padrão do cabeçalho atual).

## Requisitos

### R1 — Líder/admin remover membro do ministério

- **Backend:** novo endpoint `DELETE /ministries/:id/members/:userId` com guarda `canManage` — apaga todos os `user_roles` do usuário cujos papéis pertencem ao ministério. Se o usuário for líder via `ministry_leaders`, a liderança **não** é removida por aqui (remoção de liderança é admin-only pelo Editar).
- **Backend:** `GET /:id/members` agrupa por pessoa: `id`, `name`, `email`, `avatar_url`, `roles` (lista de `role_id`/`name`), `is_leader`. Uma linha por usuário (sem duplicatas).
- **Frontend:** `MemberList` exibe funções como badges, foto (`PersonAvatar`) e botão **Remover** com `ConfirmDialog`, visível apenas quando `canEdit(ministry)` (líder do ministério ou admin).

### R2 — ADMIN excluir conta (ban permanente)

- **Backend:** reutilizar `DELETE /users/:id` existente (admin-only).
- **Frontend:** botão **"Excluir conta"** na lista de membros do ministério (cobre membros e líderes, pois a lista inclui ambos), visível **somente para admin**, com `ConfirmDialog` destrutivo (avisa que é permanente e que as vagas ficam em aberto).
- Escopo: pessoas que aparecem em alguma lista de membros. Contas sem ministério (ex.: líder aprovado sem vínculo) ficam fora desta tela.

### R3 — Foto de pessoas em todos os lugares

- **Novo componente** `PersonAvatar` (`src/components/ui/person-avatar.tsx`): renderiza `<img>` quando `avatar_url` existir, senão círculo com a inicial do nome. Props: `name`, `avatarUrl`, `size` (classe Tailwind), acessível (`alt`).
- **Backend — adicionar `avatar_url`** nas respostas:
  - `GET /schedules` (vaga escalada — `user_name` + `user_avatar`)
  - `GET /events` (slots do calendário)
  - candidatos da escala (`/schedules/:id/candidates` ou equivalente) e da agenda
  - `GET /ministries/:id/members` (junto com o agrupamento do R1)
  - trocas (solicitante e alvo)
  - relatórios (ranking por voluntário)
  - `GET /users` já retorna `avatar_url` ✓
- **Frontend — aplicar `PersonAvatar`** em:
  - matriz de escala: vaga preenchida e seletor de voluntário
  - aba Ministérios: lista de membros, painel de aprovação de líderes, LeaderPicker, diálogo "Vincular voluntário"
  - agenda: candidatos
  - dashboard: lista de escalas (quando mostrar outra pessoa)
  - trocas: solicitante e alvo
  - relatórios: ranking
- `shared/types.ts`: campos opcionais `user_avatar?`/`avatar_url?` onde aplicável.

## Fora de escopo

- Soft-ban/reversibilidade (opção B descartada).
- Exclusão de contas que não aparecem em nenhuma lista de membros.
- Alteração do upload de foto (já existe no Perfil).
- Cache/CDN de imagens (avatar é data URL no `users.avatar_url`).

## Critérios de aceitação

1. Líder remove membro do **seu** ministério (200) e **não** remove de outro (403).
2. Admin exclui conta pela lista de membros; conta some, vínculos somem, vagas ficam em aberto.
3. Líder **não** vê o botão "Excluir conta"; vê "Remover" apenas nos seus ministérios.
4. `GET /:id/members` retorna linhas agrupadas com `avatar_url` e `roles[]`.
5. Foto (ou inicial) visível nos locais listados em R3, para todos os papéis.
6. Typecheck/build/detector limpos; smokes existentes seguem verdes + smoke novo das remoções.
