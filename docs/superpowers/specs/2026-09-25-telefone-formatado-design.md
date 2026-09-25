# Telefone formatado e validado no cadastro — Design

**Data:** 2026-09-25
**Status:** Aprovado em conversa (2 perguntas + abordagem A + design em 4 seções)

## Problema

O telefone é campo livre em todos os pontos de escrita e o login por telefone usa comparação **exata** (`WHERE email = ? OR phone = ?`, server/routes/auth.ts:22):

- Cadastro (src/pages/LoginPage.tsx:201-210): sem `required`, sem máscara, sem validação; `/auth/register` grava cru (auth.ts:56).
- Perfil (src/pages/ProfilePage.tsx:183): input livre, `PUT /users/:id` grava cru (users.ts:58).
- `POST /users` (users.ts:26): grava cru (hoje sem UI chamando, mas rota existe).
- Consequência: número cadastrado `11999999999` e digitado `(11) 99999-9999` no login **não casa** (e vice-versa) → a pessoa não consegue logar por número.

## Decisões (respondidas pelo usuário)

1. Telefone **obrigatório** no cadastro (membro e líder) — validar/rejeitar se ausente ou inválido.
2. Validação/formatação vale em **cadastro + perfil + POST/PUT users** (autoridade no servidor).

## Solução

### S1 — Util compartilhado (`src/lib/phone.ts`)

Importável pelo React e pelas rotas do servidor (mesmo módulo TS, padrão do repositório):

- `digits(phone: string): string` — remove tudo que não é dígito.
- `isValidPhone(phone: string): boolean` — `digits` com 10 ou 11 dígitos; DDD (2 primeiros) entre 11–99; com 11 dígitos, o 3º é `9` (celular). Aceita formatado ou cru.
- `maskPhone(input: string): string` — máscara progressiva ao digitar: `(11) 99999-9999` (11 díg.) ou `(11) 9999-9999` (10 díg.), permitindo apagar normalmente (não re-insere caracteres após o cursor apagado).
- `formatPhone(phone: string): string` — `isValidPhone` → retorna o formato canônico `(DD) 99999-9999`; caso contrário lança `Error("Telefone inválido...")`.

### S2 — Servidor (autoridade; grava sempre formatado)

- `POST /auth/register` (auth.ts:51): `phone` **obrigatório**; `formatPhone` → 400 `"Telefone inválido. Use o formato (11) 99999-9999."` → grava formatado. Aplica a membros (auth.ts:86) e líderes (auth.ts:70).
- `POST /users` (users.ts:25): idem — obrigatório, valida, grava formatado.
- `PUT /users/:id` (users.ts:43): se `phone` presente → valida/formata (400 se inválido); ausente/nulo → COALESCE mantém o atual.
- **Login** (auth.ts:22): comparação por dígitos — `REPLACE(REPLACE(REPLACE(REPLACE(phone, '(', ''), ')', ''), '-', ''), ' ', '') = ?` com `digits(identificador)` quando o identificador contém 10-11 dígitos; se contém `@`, casa só por email. Cobre dado gravado **formatado e legado cru**, sem migração.

### S3 — Frontend

- **Cadastro** (LoginPage.tsx:201): campo `required`, `onChange` aplica `maskPhone`, envia `formatPhone` (toast amigável na validação client-side antes do POST).
- **Perfil** (ProfilePage.tsx:183): `onChange` aplica `maskPhone`; valida com `isValidPhone` ao salvar (toast no client; 400 do servidor vira toast do `ApiError`).
- Não há outros formulários com telefone (criação de usuário pelo admin não tem UI hoje).

### S4 — Verificação (TDD, smoke novo `smoke-telefone.mjs`)

- Cadastro sem telefone → 400; `11999999999` (11 díg.) → 201 e gravado `(11) 99999-9999`; `1134567890` (10 díg., fixo) → 201 gravado `(11) 3456-7890`; `abc`, DDD `10`, `11899999999` (11 díg. com 3º ≠ `9`) → 400.
- Login por telefone: formatado → 200; cru (legado) → 200; número não cadastrado → 401; email inexistente → 401.
- `PUT /users/:id`: telefone inválido → 400; válido → gravado formatado; omitido → não muda.
- Testes puros do módulo: `digits`, `isValidPhone`, `maskPhone` (progressão e backspace), `formatPhone` (lança em inválido).
- Limpeza de usuários temporários.

Evidência por task: `npm run typecheck` + `npm run build` + detector exit 0 + smoke. Fim: push + `gh run watch` + suíte de produção (regressão 3 smokes + novo).

## Fora de escopo

- Migrar/reformatar telefones legados já gravados (login normalizado cobre os dois formatos).
- Tela de criação de usuário pelo admin (não existe hoje; rota fica validada).
- Login/SMS/OTP por telefone (só credencial de identificação + senha).
- Telefones internacionais (só BR: 10-11 dígitos, DDD 11-99).
