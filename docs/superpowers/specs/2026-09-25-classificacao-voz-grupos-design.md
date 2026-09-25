# Classificação de Voz + Grupos de Voz/Músicos (Ministério Louvor)

**Data:** 2026-09-25
**Status:** Aprovado

## Objetivo

1. Líder do Louvor define a **classificação vocal** (6 tipos fixos com cores distintas, divididos em feminina/masculina) das pessoas do vocal — visível em Ministérios, nova aba e escala.
2. Nova **aba "Grupos"** exclusiva de líderes do Louvor (e ADMIN) para montar **grupos de vozes** e **grupos de músicos** (criação livre de grupos, ex.: A, B, C) e **encaixar grupos na escala** de um evento, mantendo a escala individual atual.

## Decisões (aprovadas)

- **Classificações fixas (6):** Soprano, Mezzo-soprano, Contralto (F) / Tenor, Barítono, Baixo (M) — cores pré-definidas, sem CRUD de classificações.
- **Grupos livres:** líder cria/renomeia/exclui grupos; dois tipos (`VOZ`/`MUSICO`); membro pode estar em vários grupos.
- **Fonte de membros dos grupos:** todos os membros do Louvor (sem depender de função).
- **Encaixe na escala:** a vaga aceita pessoa **ou** grupo (opção A); cada membro do grupo vira escalado individual com status próprio — status da vaga = soma (verde todos confirmaram / amarelo parcial / vermelho algum recusou).
- **Visibilidade:** aba só para líder do Louvor + ADMIN; classificação visível para todos os logados, editável só por líder Louvor/ADMIN; voluntário vê a própria no Perfil (somente leitura se não for líder).
- **Visual companion:** dispensado pelo usuário (texto puro).

## Modelo de dados (migration `0006_voice_groups.sql`)

```sql
CREATE TABLE voice_classifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('F','M')),
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE voice_classification_members (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  classification_id INTEGER NOT NULL REFERENCES voice_classifications(id)
);

CREATE TABLE voice_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ministry_id INTEGER NOT NULL REFERENCES ministries(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('VOZ','MUSICO')),
  name TEXT NOT NULL
);

CREATE TABLE voice_group_members (
  group_id INTEGER NOT NULL REFERENCES voice_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE schedule_group_members (
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','DECLINED')),
  PRIMARY KEY (schedule_id, user_id)
);

ALTER TABLE schedules ADD COLUMN group_id INTEGER REFERENCES voice_groups(id) ON DELETE SET NULL;
```

- Seeds: as 6 classificações com cores e `sort_order` (F: 1-3, M: 4-6).
- Migration aplicada local **e** remota.

### Cores fixas

| Classificação | Sexo | Cor | Hex |
|---|---|---|---|
| Soprano | F | Rosa | `#EC4899` |
| Mezzo-soprano | F | Lilás | `#A855F7` |
| Contralto | F | Verde-escuro | `#059669` |
| Tenor | M | Azul | `#2563EB` |
| Barítono | M | Âmbar | `#D97706` |
| Baixo | M | Cinza-azulado | `#475569` |

Badge = bolinha colorida + nome (padrão StatusBadge), com `aria-label`.

## Backend

Guard novo `requireLouvor(c)` (ADMIN **ou** líder com ministério "Louvor" via ponte `ministry_leaders`) — mesmo critério do `showPlaylist` do AppShell.

- `GET /voice-classifications` — todos os logados; retorna as 6 + `member_id` se houver (para o Perfil).
- `PUT /users/:id/voice-classification` — guard Louvor/ADMIN; body `{ classification_id: number | null }` (null remove).
- `GET /voice-groups?ministry_id=…` — membros com suas classificações; guard Louvor/ADMIN.
- `POST /voice-groups` `{ ministry_id, kind, name }` / `PUT /voice-groups/:id` `{ name }` / `DELETE /voice-groups/:id` — guard Louvor/ADMIN.
- `POST /voice-groups/:id/members` `{ user_id }` / `DELETE /voice-groups/:id/members/:userId` — guard Louvor/ADMIN; valida que usuário é membro do ministério do grupo.
- `GET /schedules` (e `/my`) — inclui `group: { id, name, kind, members: [{ user_id, name, avatar_url, classification, status }] }` quando `schedules.group_id` preenchido.
- `PATCH /schedules/:id` — aceita `{ group_id }`:
  - `group_id` numérico → valida grupo do ministério da vaga e `member_count > 0` (senão 400 "grupo sem membros"), zera `user_id`, popula `schedule_group_members` com todos os membros atuais (PENDING).
  - `group_id: null` → limpa grupo + `schedule_group_members` (vaga em aberto).
  - Comportamento `user_id` individual inalterado (ao atribuir pessoa numa vaga de grupo, limpa grupo primeiro).
- `POST /schedules/:id/respond` — quando a vaga tem grupo, identifica a linha do usuário em `schedule_group_members` (se não for membro → 404); atualiza status individual. Vaga individual inalterada.
- `DELETE /schedules/:id` — cascata natural (FKs).
- `GET /events` slots — inclui o mesmo objeto `group`.
- Excluir grupo → `group_id SET NULL` + cascata `schedule_group_members` → **vaga volta a em aberto**.

## Frontend

### Componente `VoiceBadge`

`src/components/VoiceBadge.tsx`: bolinha + nome na cor da classificação; usado em MinistriesPage, GruposPage, escala, Perfil.

### Aba Ministérios (cartão Louvor)

Na lista de membros do Louvor (apenas quando o ministério do cartão é Louvor e `canEdit`): badge de classificação + seletor (dropdown 6 + "Sem classificação") → `PUT /users/:id/voice-classification`. Em ministérios ≠ Louvor: nada muda.

### Nova rota `/grupos`

- Guard no App.tsx: ADMIN **ou** (`user.role === "LEADER"` e `ministries.some(m => m.name === "Louvor")`); outros → redirect `/`.
- Menu: item **"Grupos"** (ícone `Shapes`) no `playlistNav`-style — só aparece para quem passa no mesmo guard; posição entre Ministérios e Playlist; também no bottomNav mobile.
- **GruposPage** (`src/pages/GruposPage.tsx`) com abas internas:
  1. **Vocal** (padrão): blocos por classificação (fundo `bg-[cor]/10`, borda cor) com avatar/nome/badge; bloco "Sem classificação"; botão classificar por linha (líder/ADMIN).
  2. **Grupos**: duas seções — "Grupos de Voz" e "Grupos de Músicos". Cada grupo: nome editável (inline ou diálogo), lista de membros (avatar + nome + classificação) com **remover (X)**, botão **adicionar** (diálogo com busca em membros do Louvor), **excluir grupo** (ConfirmDialog). Botão **"Novo grupo"** por seção (diálogo: nome, tipo pré-preenchido).

### Escala (matriz)

- Seletor de vaga ganha seção **"Grupos"** (aba/lista junto com pessoas) quando a função pertencer ao Louvor; lista grupos do Louvor com contagem de membros.
- Vaga com grupo: nome do grupo + lista compacta de membros (avatar + classificação) + status **X/Y** com as cores verde/amarelo/vermelho; botões trocar/liberar.
- Badge da classificação (menor) ao lado do nome do escalado individual quando for membro do Louvor.

### Agenda do voluntário

Card de escala de grupo: etiqueta **"Grupo"** + nome do grupo + linha de status individual (Confirmar/Recusar continuam funcionando via `/schedules/:id/respond`).

### Perfil

Campo "Classificação de voz" (somente leitura para não-líder; seletor para líder Louvor/ADMIN).

## Erros e regras

- Grupo vazio escalado → 400.
- Membro removido do grupo após escala → mantém linha própria em `schedule_group_members` (histórico não é afetado).
- Excluir grupo escalado → vaga em aberto (cascata).
- Usuário não-líder Louvor em `/grupos` por URL → redirect `/`.
- Líder de outro ministério nas rotas de grupos → 403.

## Fora de escopo

- Drag-and-drop de membros entre grupos (campo `position` previsto, sem UI).
- CRUD de classificações (fixas) e subtipos (lírico/dramático etc.).
- Grupos em ministérios ≠ Louvor.
- Escalar grupos em relatórios/estatísticas próprias.

## Critérios de aceitação

1. Líder Louvor classifica membros; badge colorido aparece em Ministérios, Grupos e escala; líder de outro ministério e voluntário não editam.
2. Aba `/grupos` visível só para líder Louvor/ADMIN; cria/edita/exclui grupos de VOZ e MUSICO; adiciona/remove membros.
3. Vaga do Louvor aceita grupo; membros recebem status individual; matriz mostra X/Y; agenda do voluntário mostra card do grupo com Confirmar/Recusar.
4. Excluir grupo escalado deixa a vaga em aberto; grupo vazio não escala (400).
5. Typebuild/detector limpos; smoke novo verde local e produção; regressões seguem todas ALL PASS.
