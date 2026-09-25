# Design: Múltiplos Líderes por Ministério + Correção de Permissão de Líder

**Data:** 2026-09-24
**Status:** Aprovado pelo usuário
**Escopo:** Suporte a N líderes por ministério; correção do bug em que um líder recém-definido não via a Playlist (nem menu/editação); auto-vinculação e auto-promoção de líderes.

## Problema (causa raiz)

Duas fontes de verdade divergentes para "ministérios do usuário":

- **Backend** (escala, playlists API, escopo de líder): `ministries.leader_id` (coluna escalar — 1 líder por ministério)
- **Frontend** (menu, guards de rota, botões de edição): `/auth/me`, que só listava ministérios via `user_roles` (filiação de membro)

`PUT /ministries/:id` só escrevia `leader_id` — não criava `user_roles` nem promovia `users.role`. Resultado: líder novo ficava com `ministries: []` no cliente → menu "Playlist" não aparecia, rota `/playlists` redirecionava, botões de edição escondidos, embora o servidor permitisse. O líder do seed (Carlos) funcionava por ter `user_roles` acidental no seed.

## Requisitos (clarificados com o usuário)

- **Múltiplos líderes por ministério** (admin marca vários na tela — caixa de seleção múltipla)
- Ao definir líder: **auto-vincular** como membro (`user_roles`) — corrige a raiz
- Desmarcado: perde **só** a liderança, **mantém** vínculo de membro
- Admin pode marcar **qualquer usuário**; voluntário marcado é **promovido automaticamente** a `users.role = 'LEADER'`
- `/auth/me` deve incluir ministérios por liderança além de filiação (defesa em profundidade)
- Playlist continua restrita ao ministério **Louvor** (filtro por nome no frontend, id 1 no backend — inalterado)

## Seção 1 — Modelo de dados e regras de liderança

Migration `migrations/0005_ministry_leaders.sql`:

```sql
CREATE TABLE ministry_leaders (
  ministry_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  PRIMARY KEY (ministry_id, user_id),
  FOREIGN KEY (ministry_id) REFERENCES ministries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO ministry_leaders (ministry_id, user_id)
SELECT id, leader_id FROM ministries WHERE leader_id IS NOT NULL;
```

- `ministries.leader_id` mantida por compatibilidade (exibição/seed), agora significa "líder principal" (`leader_ids[0]`); fonte de verdade = `ministry_leaders`
- Regras de `PUT /ministries/:id` com `leader_ids: number[]`:
  1. Reescreve `ministry_leaders` (remove saídos, adiciona entrantes)
  2. Cada líder → auto-vincula `user_roles` (`INSERT OR IGNORE` na primeira role do ministério; se o ministério não tiver role, cria role `"Líder"`)
  3. Cada líder com `users.role = 'VOLUNTEER'` → promove para `'LEADER'`
  4. Desmarcado → remove só de `ministry_leaders`, mantém `user_roles`
- UI deixa de filtrar candidatos por role (lista todos os usuários ativos)

## Seção 2 — Backend (API)

**`server/routes/ministries.ts`:**
- `PUT /:id` e `POST /` aceitam `leader_ids?: number[]` — aplicam as 4 regras acima; validação: id inexistente/desativado → 400 `"Usuário inválido"`
- `GET /` retorna `leader_ids: number[]` + `leader_name` (nomes concatenados)
- `GET /:id/members` passa a listar `user_roles` **UNION** líderes de `ministry_leaders`

**`server/lib/auth.ts` — `leaderMinistryIds`:** para `LEADER`:
```sql
SELECT ministry_id FROM ministry_leaders WHERE user_id = ?
```
Correção em cascata para todos os consumidores do helper: `schedules.ts`, `events.ts`, `reports.ts`, `swaps.ts`, `ministries.ts` (escopo), `playlists.ts` (`canManage`/`canView` — mantém `LOUVOR_MINISTRY_ID = 1`).

**`server/routes/auth.ts` — `/me`:** ramo não-ADMIN vira união (filiação + liderança):
```sql
SELECT m.id, m.name, m.description FROM ministries m
JOIN roles r ON r.ministry_id = m.id
JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?
UNION
SELECT m.id, m.name, m.description FROM ministries m
JOIN ministry_leaders ml ON ml.ministry_id = m.id WHERE ml.user_id = ?
```
(`UNION` deduplica ministérios onde o usuário é líder **e** membro.)

**Compatibilidade:** endpoints antigos que recebem `leader_id` único continuam aceitando (fallback: `leader_id` vira `leader_ids = [leader_id]`).

## Seção 3 — Frontend

**`src/pages/MinistriesPage.tsx`:**
- Estados `editLeaderId/newLeaderId: string` → `editLeaderIds/newLeaderIds: number[]`
- Diálogos "Novo ministério" e "Editar": `<Select>` única → **lista de checkboxes** (todos os usuários ativos, sem filtro por role)
- Payload: `leader_ids: number[]`
- Card: exibir "Líderes: A, B" (plural)

**Guards sem mudança de lógica:** `LouvorOnly` (App.tsx), `showPlaylist` (AppShell), `canManage` (PlaylistsPage/PlaylistDetailPage) já consomem `ministries` do contexto — corrigidos automaticamente pela união do `/me`. Filtro por nome "Louvor" mantido de propósito (spec original da playlist).

**Limitação registrada (fora do escopo):** `ScheduleMatrixPage` usa `ministries[0]` como "meu ministério" — líder com múltiplos ministérios vê o primeiro; não alterado neste trabalho.

## Seção 4 — Visual (multi-seleção)

- Lista de checkboxes com nome + email, scrollável (max-height ~240px)
- Marcado: fundo `primary/10`, check `#C8102E` (tokens atuais)
- Sem filtro por role; aviso sutil quando voluntário marcado: "Voluntários marcados serão promovidos a Líder"
- Estado vazio: "Nenhum líder selecionado"

## Seção 5 — Erros, edge cases e verificação

**Edge cases:**
- `leader_ids` inválido → 400 `"Usuário inválido"`
- Ministro sem `role` → cria role `"Líder"` antes do vínculo
- JWT desatualizado após promoção: rotas de playlist/escala usam escopo (`leaderMinistryIds`), não `requireRole` — funciona sem relogin
- Líder de 2 ministérios → suportado pelo PK composto
- Remoção de usuário → `ON DELETE CASCADE`
- Admin pode ser líder (papel ADMIN passa por checagens, como hoje)

**Erros:** `{error}` pt-BR, padrão atual (400/403/404).

**Verificação:**
1. `npm run typecheck` + `npm run build` limpos; detector impeccable `[]`
2. Smoke: admin `PUT /ministries/1` com `leader_ids: [2, 13]` → 200; login conta 13 → `/auth/me` inclui Louvor, `GET/PUT /playlists` 200; desmarcar 13 → `/auth/me` mantém Louvor (membro) mas escopo de líder sai → escala 403; promoção `VOLUNTEER → LEADER` conferida no banco
3. Manual: multi-select na tela de ministérios; menu "Playlist" visível para o líder novo
4. Deploy GitHub Actions + smoke em produção
