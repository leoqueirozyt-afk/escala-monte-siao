# Spec: Aba Avisos (Parte 1 de 2 — notificações push vem depois)

**Data:** 2026-09-26
**Status:** aprovado em brainstorming

## Objetivo

Nova aba **"Avisos"** onde líderes/admins publicam avisos do mês (título + texto, escopo geral ou por ministério) e todos os membros leem, com **badge de não-lido no ícone do menu** (estilo caixa de e-mail).

Escopo decomposto em 2 sub-projetos: **(1) esta Aba Avisos**, (2) notificações push (spec separado, futura).

## Decisões aprovadas

- **Escopo dos avisos: os dois** — aviso **Geral** (igreja inteira, `ministry_id NULL`) e aviso **por ministério** (só membros/líderes daquele ministério veem).
- **Vários avisos por mês** (lista, título + texto), não um único.
- **Aba "Avisos" para todos** — líder/admin cria/edita; membro só lê.
- **Badge não-lido automático** — ao abrir a aba, todos viram lidos (estado por usuário no servidor, multi-aparelho). Sem leituras por aviso, sem botão manual.
- **Editar/excluir: autor ou ADMIN** (outros líderes só leem).
- **Sem histórico** — a aba mostra só o mês atual; avisos de meses anteriores são **apagados do banco** automaticamente.
- Abordagem escolhida: **`notices` + `users.notices_seen_at`** (não `notice_reads` por aviso).

## Backend

### Migration `migrations/0007_notices.sql`

```sql
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ministry_id INTEGER REFERENCES ministries(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  month TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notices_month ON notices(month);
ALTER TABLE users ADD COLUMN notices_seen_at TEXT;
```

- `month` no formato `YYYY-MM`, **vindo do aparelho** (mesmo `monthKey()` do cliente) para não sofrer com fuso UTC × horário da igreja.
- `ministry_id NULL` = aviso geral.

### Rotas novas `server/routes/notices.ts` (registradas em `server/index.ts`)

Todas atrás de `requireAuth`. Reutilizar o padrão `canManage` de `server/routes/ministries.ts`.

| Rota | Permissão | Comportamento |
|---|---|---|
| `GET /api/notices?month=YYYY-MM` | qualquer logado | lista visíveis do mês, ordenada `created_at DESC`: `ministry_id IS NULL` **OU** ministério onde o usuário é membro (`user_roles`+`roles`) ou líder (`ministry_leaders`) **OU** `users.role = 'ADMIN'` (vê tudo). **Antes de listar:** `DELETE FROM notices WHERE month < ?` (mês enviado pelo aparelho) — limpeza lazy |
| `GET /api/notices/unread-count?month=YYYY-MM` | qualquer logado | `{ count }` = avisos visíveis do mês com `created_at > COALESCE(notices_seen_at, '')` (nulo = todos não lidos). Mesma limpeza lazy antes |
| `POST /api/notices/seen` | qualquer logado | `UPDATE users SET notices_seen_at = datetime('now') WHERE id = ?` → `{ ok: true }` |
| `POST /api/notices` | `ministry_id` informado → `canManage(ministry_id)`; geral → `role IN ('LEADER','ADMIN')` | body `{ title, body, ministry_id?: number\|null, month }`; valida título/texto/mês não vazios → `201 { id, ... }` |
| `PUT /api/notices/:id` | autor (`created_by`) ou ADMIN → senão `403` | body `{ title?, body?, ministry_id?, month? }`; `COALESCE` por campo |
| `DELETE /api/notices/:id` | autor ou ADMIN | `{ ok: true }` |

- Respostas de erro no padrão do projeto: `400` validação, `403` permissão, `404` inexistente — mensagens em português.

## Frontend

### Menu (`src/components/layout/AppShell.tsx`)

- Item **"Avisos"** (ícone `Megaphone`), rota `/avisos`, visível para **todos** os perfis.
- **Badge de contagem** no ícone: círculo `bg-destructive text-destructive-foreground` com o número (estilo e-mail), vindo de `GET /notices/unread-count`; buscado ao carregar o app e após ações que alteram listas; **zera ao entrar na aba** (POST `/seen`).

### Rota (`src/App.tsx`)

- `/avisos` → `AvisosPage`, sem guard (todos os logados).

### `src/pages/AvisosPage.tsx`

- Busca `GET /notices?month=<monthKey()>.`
- **Lista**: cards com `title`, `body` (`whitespace-pre-wrap`), selo de escopo (**Geral** / nome do ministério), autor + data/hora (`formatDateTime` ou `formatDate` de `src/lib/utils`).
- **Criar** (botão "Novo aviso", só `user.role` LEADER/ADMIN): diálogo com Campo Título, Campo Texto (textarea) e Campo Escopo. A lista de ministérios do seletor é buscada **ao abrir o diálogo** (só para LEADER/ADMIN): líder usa `GET /ministries` (escopo próprio), ADMIN usa `GET /ministries?scope=all`; opção *Geral* sempre presente. Um líder cria aviso de ministério só se o backend aceitar (`canManage` — só os seus).
- **Editar** (lápis) / **Excluir** (lixeira): visíveis no card só para **autor ou ADMIN**; excluir usa `ConfirmDialog` destrutivo.
- **Ao montar**: busca lista e dispara `POST /notices/seen` (badge zera).
- **Estados**: `ListSkeleton` carregando, `EmptyState` "Nenhum aviso este mês", `ErrorState` com retry, toasts de erro padrão (`toast(msg, "error")`).

## Fora de escopo (Parte 1)

- Push notificações, sons, badge do ícone do sistema, envio automático por e-mail/SMS, leitura por aviso, histórico de meses anteriores, anexos/imagens, rich text.

## Erros e estados

- Todos os mutations em `try/catch` com toast; diálogos fecham só no sucesso (padrão do projeto).
- 403/404/400 do servidor → toast com a mensagem.

## Verificação

- `npm run typecheck`, `npm run build`, detector impeccable (`... --json src public` → exit 0).
- Novo smoke `%TEMP%\opencode\smoke-avisos.mjs` autocontido (ministério + líder + membro + voluntário temporários):
  - líder cria aviso Geral → membro vê; voluntário cria → `403`
  - `unread-count` membro: 0 → líder publica → 1 → `POST /seen` → 0
  - aviso por ministério: membro vê; de fora não vê e não conta no badge
  - editar/excluir: não-autor → `403`; autor edita → `200`; ADMIN exclui → `200`
  - limpeza: aviso com `month` antigo some após `GET` do mês atual
  - limpeza final: DELETE ministério + usuários temporários
- Regressões: `smoke-min-leaders`, `smoke-leaders`, `smoke-playlists`, `smoke-remocoes-avatar`, `smoke-grupos-voz`, `smoke-excluir-funcoes` — 0 failed, local e produção.
