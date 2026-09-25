# Destaques Visuais (menu sticky + verde de líder + bolinha verde) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menu hambúrguer mobile acompanha a rolagem, cards de ministérios liderados ganham borda verde e a bolinha "Escalado" do mini-calendário fica verde.

**Architecture:** Três mudanças puramente visuais em 3 arquivos React/Tailwind: (1) envolver `<header>` + `#mobile-menu` num wrapper `sticky top-0 z-40`; (2) predicado `isLider` + `className="border-success"` no `<Card>` de `MinistriesPage`; (3) `bg-primary` → `bg-success` no ponto do dia e na legenda do `MiniCalendar`. Sem backend, migration ou smoke novo.

**Tech Stack:** React 19, Tailwind v4 (token `--color-success` já registrado em `src/index.css:20`), `cn()` (tailwind-merge) em `Card` faz merge de `className` (`src/components/ui/card.tsx:7-10`).

**Contexto:** Spec `docs/superpowers/specs/2026-09-25-destaques-visuais-design.md` (aprovada). Verificação: `npm run typecheck`, `npm run build`, detector `node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public` (exit 0), checagem visual via `wmux browser` contra o dev server local (`http://localhost:5173` — reiniciar se necessário: matar PID da porta 5173 e `Start-Process cmd -ArgumentList "/c npm run dev > %TEMP%\opencode\vite-dev.log 2>&1"`, esperar `/api/health` = 200). Logins: `admin@montesiao.org` / `carlos@montesiao.org` senha `senha123`. Sem framework de testes unitários no repositório — verificação = typecheck/build/detector + checagem visual/estrutural.

---

### Task 1: Menu mobile sticky junto com a barra

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Envolver header + mobile-menu num wrapper sticky**

Edit — inserir o `<div className="sticky top-0 z-40">` antes do `<header>`:

oldString:
```jsx
      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-card/90 px-4 py-3 backdrop-blur md:px-6">
```
newString:
```jsx
      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <div className="sticky top-0 z-40">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-card/90 px-4 py-3 backdrop-blur md:px-6">
```

Edit — fechar o wrapper depois do `#mobile-menu` e antes do `<main>` (não re-indentar o conteúdo interno; diff mínimo de 2 linhas):

oldString:
```jsx
          </nav>
        </div>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 md:px-6">{children}</main>
```
newString:
```jsx
          </nav>
        </div>
        </div>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 md:px-6">{children}</main>
```

Notas: o `sticky top-0 z-40` que já existia no `<header>` fica (inofensivo dentro do wrapper). `#mobile-menu` mantém `md:hidden` e `border-b bg-card` — desktop e cores intactos. O wrapper transparente não afeta visual: só os filhos (header/menu) têm fundo.

- [ ] **Step 2: Typecheck + build + detector**

Run:
```
npm run typecheck; if ($?) { npm run build }; if ($?) { node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public; "detector exit: $LASTEXITCODE" }
```
Expected: typecheck limpo, build ok, `detector exit: 0`.

- [ ] **Step 3: Checagem estrutural no navegador**

```bash
wmux browser open http://localhost:5173/login
wmux browser snapshot
# logar (email/senha/entrar) — refs do snapshot
wmux browser eval "document.getElementById('mobile-menu').parentElement.className"
```
Expected: string contendo `sticky top-0 z-40` (o wrapper). Adicional:
```bash
wmux browser eval "getComputedStyle(document.getElementById('mobile-menu').parentElement).position"
```
Expected: `sticky`.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "fix: menu mobile acompanha a rolagem (sticky com a barra)"
```

---

### Task 2: Borda verde no card do ministério liderado

**Files:**
- Modify: `src/pages/MinistriesPage.tsx` (~linha 51 e ~linha 309)

- [ ] **Step 1: Predicado `isLider`**

Edit — logo após `canEdit`:

oldString:
```ts
  const canEdit = (m: Ministry) => isAdmin || (m.leader_ids ?? []).includes(user?.id ?? -1);
```
newString:
```ts
  const canEdit = (m: Ministry) => isAdmin || (m.leader_ids ?? []).includes(user?.id ?? -1);
  const isLider = (m: Ministry) => (m.leader_ids ?? []).includes(user?.id ?? -1);
```

- [ ] **Step 2: Classe condicional no `<Card>` do ministério**

Edit — no `ministries.map`:

oldString:
```jsx
              <Card key={m.id}>
```
newString:
```jsx
              <Card key={m.id} className={isLider(m) ? "border-success" : undefined}>
```

Notas: `border-success` sobrepõe `border-border/80` via tailwind-merge no `cn()` do Card. Admin (não líder) → `undefined` → borda normal, conforme decisão "só líderes de fato". Se houver mais de um `<Card key={m.id}>` no arquivo (grep `key={m.id}`), garantir que é o do `ministries.map` (~linha 309, dentro do return da lista de cards).

- [ ] **Step 3: Typecheck + build + detector**

Run:
```
npm run typecheck; if ($?) { npm run build }; if ($?) { node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public; "detector exit: $LASTEXITCODE" }
```
Expected: limpo, exit 0.

- [ ] **Step 4: Checagem visual no navegador**

```bash
wmux browser open http://localhost:5173/ministerios
wmux browser snapshot   # (relogar como carlos@montesiao.org se a sessão for de outro usuário)
wmux browser screenshot
```
Expected: pelo menos um card com borda verde (Carlos é líder do ministério 1 Louvor no seed local — se nenhum aparecer, checar `leader_ids` via `wmux browser eval` na página). Contra-aprovado com admin:
```bash
# logar admin@montesiao.org → /ministerios
wmux browser eval "[...document.querySelectorAll('main .border-success')].length"
```
Expected: `0` (admin não é líder de fato).

- [ ] **Step 5: Commit**

```bash
git add src/pages/MinistriesPage.tsx
git commit -m "feat: borda verde no card do ministério que o usuário lidera"
```

---

### Task 3: Bolinha "Escalado" verde no MiniCalendar

**Files:**
- Modify: `src/components/MiniCalendar.tsx:103` e `:115`

- [ ] **Step 1: Ponto do dia escalado**

oldString:
```jsx
                  isMarked && !isSelected && "bg-primary",
```
newString:
```jsx
                  isMarked && !isSelected && "bg-success",
```

- [ ] **Step 2: Bolinha da legenda "Escalado"**

oldString:
```jsx
          <span className="h-2 w-2 rounded-full bg-primary" /> Escalado
```
newString:
```jsx
          <span className="h-2 w-2 rounded-full bg-success" /> Escalado
```

Notas: NÃO mudar — célula do dia selecionado (`bg-primary text-primary-foreground`, linha ~94), anel de hoje (`ring-primary`, ~95), ponto branco quando selecionado (`bg-white`, ~104), legenda "Indisponível" (`bg-destructive/70`, ~118). O MiniCalendar é usado em `DashboardPage.tsx:177` e `CalendarPage.tsx` — a mudança vale para ambos automaticamente.

- [ ] **Step 3: Typecheck + build + detector**

Run:
```
npm run typecheck; if ($?) { npm run build }; if ($?) { node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public; "detector exit: $LASTEXITCODE" }
```
Expected: limpo, exit 0.

- [ ] **Step 4: Checagem visual no navegador**

```bash
wmux browser open http://localhost:5173/    # Início (logado)
wmux browser screenshot
wmux browser eval "document.querySelector('.rounded-full.bg-success') !== null"
```
Expected: `true` (bolinha da legenda verde presente); e conferir no screenshot que a legenda "Escalado" está verde e "Indisponível" vermelha.

- [ ] **Step 5: Commit**

```bash
git add src/components/MiniCalendar.tsx
git commit -m "feat: bolinha de escalado verde no mini-calendario"
```

---

### Task 4: Verificação final + deploy

- [ ] **Step 1: Suíte de regressão rápida (sem smokes novos)**

```powershell
$env:SMOKE_BASE = "http://localhost:5173/api"
# 2 smokes de sanidade (nada de backend mudou, mas garante que nada quebrou):
node "$env:TEMP\opencode\smoke-avisos.mjs"; node "$env:TEMP\opencode\smoke-leaders.mjs"
```
Expected: ambos `0 failed`.

- [ ] **Step 2: Push + watch**

```bash
git push origin main
```
```powershell
Start-Sleep -Seconds 5; gh run list --limit 3   # escolher o run in_progress NOVO (evitar race com run antigo)
gh run watch <novo-run-id> --exit-status
```
Expected: `✓ main Deploy ...` / watch exit 0.

- [ ] **Step 3: Smoke final em produção**

```powershell
$env:SMOKE_BASE = "https://escala-monte-siao.leoqueirozyt.workers.dev/api"
node "$env:TEMP\opencode\smoke-avisos.mjs"; node "$env:TEMP\opencode\smoke-leaders.mjs"
```
Expected: `0 failed`.

- [ ] **Step 4: Resumo final** — finishing-a-development-branch (tudo na main, já em produção → resumo em PT + checklist visual manual: menu aberto + rolagem no celular, borda verde em `/ministerios` como líder, bolinha "Escalado" verde no Início/Calendário).

## Self-review (realizado na escrita)
- **Spec coverage:** S1 → Task 1; S2 → Task 2 (inclui decisão "admin sem verde" na Step 4); S3 → Task 3 (legenda + pontos, com lista explícita do que NÃO muda = seção "Não mudam" do spec); fora-de-escopo respeitado (nenhuma pill/badge alterado); verificação do spec (typecheck/build/detector/visual/wmux) → Tasks 1–4.
- **Placeholders:** nenhum — todos os edits têm oldString/newString completos.
- **Type/consistência:** `isLider` definido Task 2 usado no mesmo arquivo; classes `bg-success`/`border-success` existem (`src/index.css:20`); âncoras de string únicas verificadas contra os arquivos atuais.
