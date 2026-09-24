# Design: Playlist do Ministério de Louvor

**Data:** 2026-09-24
**Status:** Aprovado pelo usuário
**Escopo:** Nova feature PWA — playlists de músicas por culto, do ministério Louvor

## Contexto

O app de escalas já possui eventos/cultos (`events`), ministérios (`ministries`), funções (`roles`) e adesão de membros (`user_roles`). O ministério Louvor (id 1, líder Carlos Lima / user 2) precisa de um espaço onde o líder monte a lista de músicas de cada culto (links do YouTube + tom) e os membros visualizem e reproduzam os vídeos no app.

## Requisitos (clarificados com o usuário)

- **Uma única playlist por culto (evento)** — músicas diferentes a cada culto
- Cada música é um item separado: **título + tom (opcional) + link YouTube + observação (opcional)**
- Criar/editar: **líder do Louvor + ADMIN**; visualizar: **membros do Louvor**
- Aba **"Playlist" no menu** visível apenas para membros/líderes do Louvor (ADMIN sempre vê)
- **Player embutido** na página (iframe YouTube) + botão **"Abrir no YouTube"** — as duas formas
- Reordenar com **botões ▲ ▼** (mobile-first, sem drag-and-drop)
- Histórico: playlists passadas visíveis, **excluídas após 2 semanas** (limpeza **lazy**)
- Cultos passados: **somente leitura**; edição apenas de cultos futuros
- Playlist deve ter **mínimo 1 música** para ser salva
- Playlist é do ministério Louvor vinculada ao culto específico (não genérica por ministério)

## Seção 1 — Modelo de dados

Migration `migrations/0004_playlist_louvor.sql`:

```sql
CREATE TABLE playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL UNIQUE,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE playlist_songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  key TEXT,
  youtube_url TEXT NOT NULL,
  note TEXT,
  position INTEGER NOT NULL,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

CREATE INDEX idx_playlists_event ON playlists(event_id);
CREATE INDEX idx_playlist_songs_playlist ON playlist_songs(playlist_id, position);
```

- `UNIQUE(event_id)` garante 1 playlist por culto no banco
- Exclusão lazy: `DELETE FROM playlists WHERE created_at < datetime('now', '-14 days')` executado no carregamento do histórico (`GET /api/playlists`)
- Evento deletado → playlist some via `ON DELETE CASCADE`

## Seção 2 — Backend (API)

Novo arquivo `server/routes/playlists.ts`, montado em `server/index.ts` sob `/api/playlists`:

| Método | Rota | Acesso | Comportamento |
|---|---|---|---|
| `GET` | `/api/playlists` | membro Louvor / leader / ADMIN | Roda limpeza lazy; lista playlists com evento (título/data) + contagem de músicas |
| `GET` | `/api/playlists/:eventId` | idem | 1 playlist + músicas ordenadas por `position` |
| `PUT` | `/api/playlists/:eventId` | leader Louvor ou ADMIN (`canManage` padrão) | Upsert da playlist + substitui músicas (transaction: apaga e re-insere com `position` 0..n); exige ≥1 música |
| `DELETE` | `/api/playlists/:eventId` | leader Louvor ou ADMIN | Remove playlist do culto |

Guardas:
- `requireAuth` em todas as rotas
- Membership check: usuário tem role no ministério Louvor (SQL `user_roles JOIN roles`) ou é ADMIN/leader; membros de outros ministérios → 403
- `youtube_url` validada (youtube.com/watch, youtu.be, youtube.com/shorts) → 400 em URL inválida
- Somente cultos futuros aceitam `PUT`/`DELETE` (passados somente leitura)

Payload `PUT`:

```json
{ "songs": [ { "title": "Aquieta Minh'alma", "key": "G",
               "youtube_url": "https://youtu.be/...", "note": "versão ao vivo" } ] }
```

Ordem do array = `position`.

## Seção 3 — Frontend

Nova página `src/pages/PlaylistsPage.tsx` (rota `/playlists`):

- **Lista:** cards com título do culto, data, contagem; badge "PRÓXIMO CULTO" no primeiro futuro; passados esmaecidos; botão "+ Nova playlist para culto" (líder/ADMIN)
- **Detalhe:** player 16:9 embutido (iframe `youtube-nocookie.com/embed/<id>`) no topo + botão "↗ Abrir no YouTube"; lista numerada com badge do tom, observação, botão "▶ Tocar" por música (troca o vídeo no player, um por vez), música ativa com borda vermelha
- **Edição (líder/ADMIN, culto futuro):** formulário "Adicionar música" (título, tom, link, nota) + ▲ ▼ para reordenar + remover; salva via `PUT`
- Padrões existentes: `useAsyncData`, `fetchAPI`, `ConfirmDialog`, design system Cross Red `#C8102E`

Menu `AppShell.tsx`: item **"Playlist"** condicional — ADMIN sempre; senão precisa de role no ministério Louvor.

Acessos inválidos → redirect `/dashboard`.

## Seção 4 — Visual

- Mobile-First, tema claro atual (fundo `#FAF9F7`, cards brancos, cantos 10-12px)
- Cross Red `#C8102E` em badges, player, bordas de destaque
- Mockup aprovado em `.superpowers/brainstorm/manual-1/content/screen.html` (visual companion)
- Extração do ID do vídeo de `watch?v=`, `youtu.be/`, `shorts/` → embed via `youtube-nocookie.com`

## Seção 5 — Permissões e edge cases

| Ação | Membro Louvor | Líder Louvor | ADMIN |
|---|---|---|---|
| Ver lista/detalhe | ✅ | ✅ | ✅ |
| Criar/editar (culto futuro) | ❌ | ✅ | ✅ |
| Deletar | ❌ | ✅ | ✅ |
| Editar culto passado | ❌ | ❌ | ❌ |

Edge cases:
- Culto sem playlist → botão "+ Nova" (líder) ou empty state (membro)
- Link inválido → 400 + destaque vermelho no campo
- Membro de outro ministério acessa `/playlists` → redirect `/dashboard`
- Limpeza lazy em `GET /api/playlists`: >14 dias somem e são apagadas

## Verificação

- `npm run typecheck` + `npm run build` limpos
- `detect.mjs --json src public` → `[]`
- Manual: login admin → criar playlist → tocar vídeo → reordenar → salvar; login membro → somente visualização
- Deploy automático via GitHub Actions (push em `main`)
