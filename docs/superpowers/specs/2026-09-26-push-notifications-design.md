# Notificações Push (Parte 2 de 2) — Design

**Data:** 2026-09-26
**Status:** Aprovado em brainstorming (Seções 1–4 aprovadas)
**Contexto:** Parte 1 (Aba Avisos) entregue em produção. Esta Parte 2 adiciona notificações push Web (PWA) para 4 eventos. Precedente: `docs/superpowers/specs/2026-09-26-aba-avisos-design.md`.

## Decisões do brainstorming

1. **Escopo de eventos (Pergunta 1 = C):** avisos novos + escalado em vaga + pedido de troca recebido + resultado de troca (aprovada/recusada).
2. **Ativação (Pergunta 2 = A):** botão "Ativar notificações" no Perfil; permissão só via gesto do usuário; sem banner automático.
3. **Plataformas (Pergunta 3 = A):** Android + desktop Chrome/Edge/Firefox nesta fase; iPhone/iPad/Safari mostram "Indisponível por enquanto" (suporte iOS exige conta Apple Developer — futura).
4. **Eventos exatos (Pergunta 4 = A):** 4 eventos enxutos (abaixo). Sem "removido da escala", sem lembretes, sem histórico.
5. **Abordagem técnica:** lib **`@mmmike/web-push`** (zero deps, WebCrypto+fetch nativo no Workers, RFC 8291/8292 ratificados com test vector do RFC, helpers de cliente e servidor).

## Arquitetura geral

### Chaves VAPID
- Geradas **uma única vez** (one-liner com `generateVapidKeys()` da lib).
- **Um único secret JSON** `VAPID_KEYS` = `{"publicKey": "...", "privateKey": "..."}` — fonte única de verdade, valores exatamente como gerados (sem conversão/derivação, sem risco de dessincronia): produção: `npx wrangler secret put VAPID_KEYS` uma vez (stdin via pipe); local: `.dev.vars`; mesma mecânica do `JWT_SECRET`.
- A API serve o campo `publicKey` desse secret por `GET /api/push/public-key`. Se o secret não existir, a rota retorna 500 "Push não configurado" (feature simplesmente desativada).

### Ciclo de vida da inscrição
1. Usuário toca "Ativar notificações" no Perfil → `Notification.requestPermission()` → `pushManager.subscribe({userVisibleOnly: true, applicationServerKey})` → `POST /api/push/subscribe`.
2. `push_subscriptions` (D1): mesmo usuário pode ter vários aparelhos; `endpoint UNIQUE` garante upsert por endpoint.
3. Desativar = `unsubscribe()` + `DELETE /api/push/subscribe`.
4. Envio para endpoint morto (**404/410** da push service) → **prune automático** da linha.

### Payload e deep link
Payload JSON `{title, body, url}` criptografado (RFC 8291) pela lib; o Service Worker exibe com `showNotification` (ícone `/icons/icon-192.png`) e, no clique, abre `url`.

| Evento | Destinatário | `url` | Textos (pt-BR) |
|---|---|---|---|
| Aviso novo | quem **vê** o aviso | `/avisos` | title = título do aviso; body = texto truncado a 120 caracteres + "…" |
| Você foi escalado | o escalado | `/agenda` | title = "Você foi escalado"; body = `"<evento> • <dd/mm>"` |
| Pedido de troca recebido | alvo do pedido | `/trocas` | title = "Pedido de troca"; body = `"<solicitante> quer trocar com você: <evento>"` |
| Troca aprovada/recusada | solicitante | `/trocas` | title = "Troca aprovada" / "Troca recusada"; body = `"<evento>"` |

### Princípios de resiliência
- Push é **best-effort**: nunca falha nem atrasa a operação principal (escala/troca/aviso é salvo mesmo se o envio inteiro quebrar).
- Envio **fire-and-forget** pós-mutação (`executionCtx.waitUntil` com fallback para promise solta + `.catch`), fan-out `Promise.all` com `.catch` por inscrição.
- Erro de envio ≠ 404/410 → `console.error` e mantém a linha (pode ser transitório).
- Timeouts: 10s por envio (configurado na chamada da lib).

## Backend

### Migration `0008_push_subscriptions.sql`
```sql
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
```
Aplicar local (`npm run db:apply`) e remota (`npm run db:apply:remote`).

### Rotas `/api/push` (`server/routes/push.ts`, `requireAuth` em tudo)
- `GET /public-key` → `{ publicKey }` derivada da secret.
- `GET /subscriptions` → lista as inscrições próprias (status + base do smoke).
- `POST /subscribe` `{endpoint, keys: {p256dh, auth}}` → upsert por endpoint; valida presença e formato base64url; 400 se inválido.
- `DELETE /subscribe` `{endpoint}` → apaga apenas `WHERE endpoint = ? AND user_id = ?`.

### Módulo `server/lib/push.ts`
- `notifyUser(db, env, userId, payload)` → carrega inscrições do usuário → fan-out.
- `notifyVisibleSubscribers(db, env, notice, payload)` → recipiente em SQL único:
  - aviso geral (`ministry_id IS NULL`) → todas as inscrições;
  - aviso de ministério → inscrições de usuários que são membros (`user_roles`→`roles`) ou líderes (`ministry_leaders`) daquele ministério, **+ todos os ADMIN**.
- `sendPush(env, sub, payload)` → `sendPushNotification` da lib com timeout; em `WebPushError` 404/410 → `DELETE` da linha (prune).
- Nunca lança para o caller (`.catch` interno + log).

### Gatilhos (chamada pós-mutação, sem bloquear resposta)
1. **`server/routes/notices.ts` `POST /`** → após INSERT, `notifyVisibleSubscribers`.
2. **Rotas de escala que atribuem `user_id`** (matrix/agenda — localizar no plano) → `notifyUser(escalado)` **somente quando `user_id` passa de nulo/vazio para um usuário diferente do anterior**. Regra anti-duplicidade: mudanças causadas por **aprovação de troca não disparam** "Você foi escalado" (o evento "Troca aprovada" já informa as duas partes).
3. **`server/routes/swaps.ts` `POST /`** → `notifyUser(target_user_id)` **apenas se `target_user_id` não for nulo**.
4. **`server/routes/swaps.ts` `POST /:id/decision`** (rota real — decide PENDING→APPROVED/REJECTED; o filtro `status = 'PENDING'` garante transição real, reenvio do mesmo status não notifica) → `notifyUser(requester_id)`.

### Segredos/ambiente
- Produção: `npx wrangler secret put VAPID_KEYS` (1× via stdin; deploys do GH Actions não sobrescrevem secrets).
- Local: `.dev.vars` com o mesmo JSON `VAPID_KEYS` (`.dev.vars` já está no `.gitignore`).
- Chaves: gerar 1× e guardar (par inteiro fora do repositório).

## Frontend

### Perfil — bloco "Notificações" (`src/pages/ProfilePage.tsx`)
Estados, na ordem de checagem:

| Estado | Condição | Comportamento |
|---|---|---|
| iPhone/iPad | UA contém `iPhone`/`iPad` | texto "Indisponível no iPhone por enquanto" (sem botão) |
| Sem suporte | `!("PushManager" in window)` ou `!("Notification" in window)` | "Seu navegador não suporta notificações" |
| Bloqueado | `Notification.permission === "denied"` | "Notificações bloqueadas — habilite nas configurações do navegador" |
| Disponível | demais | botão **"Ativar notificações"** |
| Ativado | `pushManager.getSubscription()` ≠ null | ✓ "Notificações ativadas" + botão **"Desativar"** |

**Ativação (tudo no clique):** SW pronto (`navigator.serviceWorker.ready`) → `requestPermission()` → `GET /public-key` → `subscribe()` → `POST /subscribe` → toast "Notificações ativadas!".

**Desativação:** `subscription.unsubscribe()` → `DELETE /subscribe` → toast "Notificações desativadas".

**Auto-sanagem:** ao **abrir a aplicação em PROD** (após auth pronta), se existir inscrição no navegador → `POST /subscribe` (upsert idempotente) — corrige rotação silenciosa de endpoint pela push service sem depender do usuário visitar o Perfil.

### Service Worker (`public/sw.js` — handlers novos, cache intacto)
- `push`: `event.data.json()` → `{title, body, url}` → `showNotification(title, {body, icon: "/icons/icon-192.png", data: {url}})`; sem JSON → fallback genérico ("Nova notificação").
- `notificationclick`: `close()` → procura janela já aberta (`clients.matchAll`) → foca e navega para `url`; senão `clients.openWindow(url)`.

### Restrição PROD
SW só registra em PROD (`main.tsx`) → funcionalidade de push opera em produção; dev serve para typecheck/review.

## Verificação

### Smoke `smoke-push.mjs` (autocontido, `%TEMP%\opencode\`)
1. `GET /public-key`: 401 sem login; 200 com login; `publicKey` base64url (≥ 80 chars).
2. `POST /subscribe`, `DELETE /subscribe`: 401 sem login.
3. Upsert: mesmo endpoint 2× → `GET /subscriptions` = 1 linha com chave atualizada; 2º endpoint → 2 linhas.
4. `DELETE /subscribe` alheio não afeta (apaga só as próprias).
5. Resiliência: inscrição fake `https://example.invalid/...` (DNS morto) no banco → publicar aviso + criar troca → operações principais **201/200**.
6. Limpeza: apagar usuários temporários (CASCADE remove inscrições).

### Suíte final
`typecheck` + `build` + detector impeccable + **8 smokes** (7 existentes + push), local e produção.

### Teste manual E2E (produção, navegador real)
1. Android/desktop → Perfil → Ativar → permitir → toast e estado "Ativadas".
2. Publicar aviso (líder) → notificação com título/texto no aparelho.
3. Clicar na notificação → abre `/avisos` (focando aba existente se já aberta).
4. Escalar membro na matriz → "Você foi escalado" no aparelho do membro.
5. Pedido de troca → no alvo; aprovar → no solicitante.
6. Desativar → sem novas notificações.
7. iPhone → "Indisponível no iPhone por enquanto".

## Fora de escopo (YAGNI / futuro)
- iOS/macOS Safari (exige conta Apple Developer + APNs).
- Lembretes agendados ("1h antes do culto"), silencio/quiet hours, agrupamento.
- Notificação por "remoção/recebimento em vaga" e outros eventos de escala.
- Histórico de notificações no app (push é transporte, não arquivo).
- Serviços externos (OneSignal/FCM).

## Riscos e mitigações
- **Lib nova** (dez/2025): mitigado por specs ratificadas + teste E2E real obrigatório antes do aceite.
- **Push quebrar silenciosamente:** smoke de resiliência + checklist manual E2E com verificação visual.
- **Endpoint rotacionado:** auto-sanagem no Perfil + prune 404/410.
- **Notificação dupla escala/troca:** regra explícita (troca não dispara "escalado").
