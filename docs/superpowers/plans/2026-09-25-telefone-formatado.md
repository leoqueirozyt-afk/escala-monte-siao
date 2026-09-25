# Plano: Telefone formatado e validado

**Spec:** `docs/superpowers/specs/2026-09-25-telefone-formatado-design.md` (`c9f3af4`)
**Modo de execução:** inline (executing-plans nesta sessão), tudo na `main`.

## Contexto

- **Util novo:** `shared/phone.ts` — padrão do repo para código compartilhado (`shared/youtube.ts` já é importado por server e src). Server importa com `.js` (`server/routes/playlists.ts:5`: `"../../shared/youtube.js"`); frontend sem extensão (`src/pages/PlaylistDetailPage.tsx:19`: `"../../shared/youtube"`). Ambos os tsconfigs incluem `shared/`.
- **Cadastro:** `src/pages/LoginPage.tsx` — estado `phone` (49), submit `phone: phone.trim() || undefined` (101), campo (201-210, sem `required`). Servidor: `server/routes/auth.ts:51-94` (leader 70-72, member 86-87, grava cru).
- **Login:** `server/routes/auth.ts:22` — `WHERE email = ? OR phone = ?` exato. Identificador de login é `body.email` (LoginPage manda `identifier` no campo `email`).
- **Perfil:** `src/pages/ProfilePage.tsx` — form (48, init 81), `save` `PUT /users/${id}` com `...form` (114-118), campo (182-184).
- **Admin:** `server/routes/users.ts` — `POST /` (25-41, grava `phone ?? null`), `PUT /:id` (43-75, `COALESCE(?, phone)`). **Sem UI** que os chame.
- **Conflito resolvido:** 13 call sites de smoke criam usuários via `POST /users` **sem telefone** → Task 1 atualiza todos (obrigatório no POST).
- `phone` sem UNIQUE (0001_init.sql:5). Node v24 roda `.ts` (type stripping) → smoke testa funções puras via `import(pathToFileURL(...))`.
- Máscara progressiva precisa tratar backspace; formato aceito: 10 díg. `(DD) 9999-9999` ou 11 díg. `(DD) 99999-9999` com 3º dígito `9`; DDD 11–99.

## Estratégia de verificação

Por task: `npm run typecheck` → `npm run build` → detector `node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public` (exit 0) → smokes (`SMOKE_BASE` default `http://localhost:5173/api`). Fim: push + `gh run watch` + suíte completa de produção (8 smokes atuais + novo).

---

## Task 1 — `shared/phone.ts` + servidor + smokes atualizados (TDD)

### 1a. Smoke `smoke-telefone.mjs` primeiro (vermelho) em `%TEMP%\opencode\`

- **Unidades** (import dinâmico: `const { digits, isValidPhone, maskPhone, formatPhone } = await import(pathToFileURL("C:/Users/Raptor/Pictures/ESCALA-MONTE SIÃO/shared/phone.ts").href)`):
  - `digits("(11) 99999-9999") === "11999999999"`;
  - `isValidPhone`: `"11999999999"` ✓, `"1134567890"` (10 d.) ✓, `"11899999999"` (3º≠9) ✗, `"10999999999"` (DDD) ✗, `"119999999"` (9 d.) ✗, `"abc"` ✗, já-formatado ✓;
  - `maskPhone`: `""→""`, `"1"→"(1"`, `"11"→"(11"`, `"119"→"(11) 9"`, 6 d.→`"(11) 9999"`, 7 d.→`"(11) 99999"`, 8 d.→`"(11) 99999-9"`, 11 d. completo ✓; backspace: `maskPhone("(11) 99999-999") === "(11) 99999-999"`, apagar dígito do meio reformata sem re-inserir;
  - `formatPhone("11999999999") === "(11) 99999-9999"`; `formatPhone("abc")` lança Error.
- **API** (login admin + cookies como nos outros smokes):
  - `POST /auth/register` sem `phone` → 400; `"abc"` → 400; `"10999999999"` → 400; `"11899999999"` → 400;
  - member com `"11999999999"` cru → 201; login `POST /auth/login` com email → `user.phone === "(11) 99999-9999"` (gravado formatado);
  - member com `"1134567890"` (fixo 10 díg.) → 201; login → `user.phone === "(11) 3456-7890"`;
  - líder com telefone válido → 201 `pending_approval`;
  - **login por telefone**: formatado `(11) 99999-9999` → 200; cru `11999999999` → 200 (legado); número não cadastrado → 401; email inexistente → 401; email real → 200 (regressão);
  - `POST /users` **sem telefone → 400**; com `"1134567890"` → 201;
  - `PUT /users/:id` com `"abc"` → 400; com `"11988888888"` → 200 e `GET /users` mostra `(11) 98888-8888`; **sem campo `phone` → 200 e telefone não muda**;
  - cleanup: apagar todos os usuários temporários.
- Rodar → **falha** (400/404 não existem ainda).

### 1b. `shared/phone.ts` (novo)

```ts
export function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidPhone(value: string): boolean {
  const d = digits(value);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (d.length === 11 && d[2] !== "9") return false;
  return true;
}

export function maskPhone(value: string): string {
  const d = digits(value).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  const body = d.slice(2);
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${body}`;
  return `(${d.slice(0, 2)}) ${body.slice(0, 5)}-${body.slice(5)}`;
}

export function formatPhone(value: string): string {
  if (!isValidPhone(value)) throw new Error("Telefone inválido. Use o formato (11) 99999-9999.");
  const d = digits(value);
  const body = d.slice(2);
  return d.length === 11
    ? `(${d.slice(0, 2)}) ${body.slice(0, 5)}-${body.slice(5)}`
    : `(${d.slice(0, 2)}) ${body.slice(0, 4)}-${body.slice(4)}`;
}
```

### 1c. Servidor

**`server/routes/auth.ts`** — import `formatPhone, digits` de `"../../shared/phone.js"`.

- `POST /register` (antes da validação de senha, ~linha 60):
  ```ts
  const phoneRaw = String(body.phone ?? "").trim();
  if (!phoneRaw) return c.json({ error: "Telefone é obrigatório. Use o formato (11) 99999-9999." }, 400);
  let phone: string;
  try { phone = formatPhone(phoneRaw); } catch (e) { return c.json({ error: e instanceof Error ? e.message : "Telefone inválido" }, 400); }
  ```
  Trocar `const phone = body.phone` (56); binds dos dois INSERTs (72, 87) passam `phone` (já formatado — hoje `phone ?? null`).
- `POST /login` (22): ramificar no identificador:
  ```ts
  const ident = identifier.trim();
  const user = ident.includes("@")
    ? await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(ident.toLowerCase()).first<any>()
    : await c.env.DB.prepare(
        `SELECT * FROM users WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), '(', ''), ')', ''), '-', ''), ' ', '') = ?`,
      ).bind(digits(ident)).first<any>();
  ```
  (com `@` → só e-mail; sem `@` → só telefone por dígitos — cobre formatado e legado cru; e-mail case-insensitive igual hoje).

**`server/routes/users.ts`** — import `formatPhone` de `"../../shared/phone.js"`.

- `POST /` (após linha 27):
  ```ts
  const phoneRaw = String(phone ?? "").trim();
  if (!phoneRaw) return c.json({ error: "Telefone é obrigatório. Use o formato (11) 99999-9999." }, 400);
  let phoneFmt: string;
  try { phoneFmt = formatPhone(phoneRaw); } catch (e) { ... 400 ... }
  ```
  bind (38) → `phoneFmt`.
- `PUT /:id` (antes do UPDATE): string não-vazia → `formatPhone` (400 no catch); vazia/ausente → `phoneVal = null` (COALESCE mantém o atual).

### 1d. Atualizar os 13 call sites de smoke

Adicionar `phone` a cada `POST /users` (7 arquivos: smoke-avisos ×3, smoke-excluir-funcoes ×3, smoke-excluir-ministerio ×2, smoke-grupos-voz ×2, smoke-push ×2, smoke-remocoes-avatar ×1), com sufixo único por chamada dentro do arquivo:

```js
phone: `119${String(stamp).slice(-7)}1`,   // 2ª chamada: sufixo 2, etc.
```

(11 dígitos, DDD 11, 3º dígito `9` — válido; `stamp` único por execução evita colisão entre smokes.)

### 1e. Verificação

typecheck + build + detector + **smoke-telefone verde** + suíte completa local (8 antigos + novo = 9, 0 falhas).

## Task 2 — Frontend

**`src/pages/LoginPage.tsx`:**
- import `maskPhone, isValidPhone, formatPhone` de `"../../shared/phone"`;
- campo Telefone (201-210): `required` + `onChange={(e) => setPhone(maskPhone(e.target.value))}`;
- `submit` modo register (antes do `setBusy`, ~96):
  ```ts
  if (!isValidPhone(phone)) { toast("Telefone inválido. Use o formato (11) 99999-9999.", "error"); return; }
  ```
  e `phone: formatPhone(phone)` no payload (101).

**`src/pages/ProfilePage.tsx`:**
- import `maskPhone, isValidPhone, formatPhone` de `"../../shared/phone"`;
- campo (183): `onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}`;
- `save` (110, antes do `api.put`): `form.phone` não-vazio → `isValidPhone` senão toast + return; payload usa `phone: form.phone ? formatPhone(form.phone) : form.phone` (vazio cai no "não muda" do servidor).

### Verificação

typecheck + build + detector + suíte local 9 smokes.

## Task 3 — Push + deploy + produção

1. `git status` / `git diff --stat` → commit `feat: telefone formatado e validado no cadastro` → push.
2. `Start-Sleep 5; gh run list --limit 3` → run NOVO `in_progress` → `gh run watch <id> --exit-status`.
3. Sem migration → deploy já vem do CI.
4. Suíte produção completa (9 smokes, `SMOKE_BASE=https://escala-monte-siao.leoqueirozyt.workers.dev/api`) → 0 falhas.

## Task 4 — Fechamento

1. Marcar checkboxes + commit.
2. Resumo final em PT + checklist manual (máscara no cadastro, cadastro sem telefone bloqueado, login por número cru e formatado, perfil com máscera).

## Fora de escopo

- Migrar telefones legados gravados; tela admin de criação de usuário; SMS/OTP; telefones internacionais.

## Checklist de conclusão

- [ ] Task 1: `shared/phone.ts` + servidor + 13 smokes atualizados; `smoke-telefone` verde; suíte local 9/9
- [ ] Task 2: máscera + validação em Cadastro e Perfil; typecheck/build/detector 0
- [ ] Task 3: push, run CI success, 9 smokes de produção verdes
- [ ] Task 4: checkboxes, resumo PT entregue
