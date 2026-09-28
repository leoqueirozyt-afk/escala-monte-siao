# Minha Agenda — Filtro de Mês + Recusa com Aviso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filtro "Este mês | Todas" na aba Minha Agenda, botões de troca/recusa após confirmação, e fluxo de recusa com confirmação + aviso de WhatsApp (só frontend, zero backend).

**Architecture:** Tudo em `src/pages/AgendaPage.tsx`: estado `period` filtra a lista client-side; estado `recuse`驱动 um `Dialog` em dois passos (confirmação → aviso); botões por status derivam de `s.status` + `s.group`. Backend intocado — `POST /schedules/:id/respond` já aceita transições CONFIRMED→DECLINED para individual e grupo.

**Tech Stack:** React 19 + Tailwind v4, `Dialog`/`Button`/`Badge` do projeto, smoke Node puro (`%TEMP%\opencode\`), DOM check via Chrome CDP (`ws`), verificação padrão (typecheck/build/detector/12 smokes).

**Spec:** `docs/superpowers/specs/2026-09-28-agenda-filtro-recusa-design.md`

**Contexto de execução:**
- Dev server: `http://localhost:5173` (precisa estar no ar; mudanças em `src/` aplicam via HRO/HMR, sem reiniciar).
- Branch atual: `feature/minha-nova-funcionalidade`.
- Padrões de fixture: telefone `119...`; prefixos de evento/grupo `"Smoke Recusa"` / `"Smoke Agenda"` para pré-limpeza.
- Contas seed: `admin@montesiao.org` (ADMIN), `carlos@montesiao.org` (líder Louvor, ministério id 1), senha `senha123` em todas.

---

### Task 1: Smoke de API — transições de status (test-first)

**Files:**
- Create: `%TEMP%\opencode\smoke-agenda-recusa.mjs` (não é commitado — padrão do projeto)

- [ ] **Step 1: Criar o smoke com o código completo abaixo**

```js
const base = process.env.SMOKE_BASE || "http://localhost:5173/api";

let passed = 0, failed = 0;
function check(name, ok, extra = "") {
  if (ok) { passed++; console.log(`PASS ${name}`); }
  else { failed++; console.log(`FAIL ${name} ${extra}`); }
}

async function login(email) {
  const r = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "senha123" }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (r.headers.get("set-cookie") || "").split(";")[0];
}

async function req(path, cookie, opts = {}) {
  return fetch(`${base}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers || {}) },
  });
}

const stamp = Date.now();
const admin = await login("admin@montesiao.org");
const louvor = await login("carlos@montesiao.org");

// pre-limpeza de resíduos (execuções anteriores que falharam no meio)
for (const ev of (await (await req("/events", admin)).json()).filter((e) => String(e.title).startsWith("Smoke Recusa"))) {
  await req(`/events/${ev.id}`, admin, { method: "DELETE" });
}
for (const g of (await (await req("/voice/groups", louvor)).json()).filter((x) => String(x.name).startsWith("Smoke Recusa G"))) {
  await req(`/voice/groups/${g.id}`, louvor, { method: "DELETE" });
}

// usuário temporário
let res = await req("/users", admin, {
  method: "POST",
  body: JSON.stringify({ name: "Smoke Recusa Vol", email: `smoke-recusa-vol-${stamp}@montesiao.org`, password: "senha123", phone: `119${String(stamp).slice(-7)}1` }),
});
const vol = await res.json();
check("criar vol", res.status === 201 && !!vol.id, JSON.stringify(vol));
const mins = await (await req("/ministries", admin)).json();
const role = mins.find((m) => Number(m.id) === 1)?.roles?.[0];
check("role do Louvor", !!role, JSON.stringify(mins.map((m) => m.name)));
res = await req("/ministries/1/members", admin, { method: "POST", body: JSON.stringify({ user_id: vol.id, role_id: role.id }) });
check("adicionar membro ao Louvor", res.status < 300, String(res.status));
const v = await login(`smoke-recusa-vol-${stamp}@montesiao.org`);

// data do mês atual (último dia, 23h45 — maior chance de ainda ser futura)
const now = new Date();
const y = now.getFullYear(), m = now.getMonth();
const lastDay = new Date(y, m + 1, 0).getDate();
const thisMonth = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:45:00`;

// --- escala individual ---
res = await req("/events", admin, { method: "POST", body: JSON.stringify({ title: "Smoke Recusa Individual", event_date: thisMonth }) });
const evInd = await res.json();
check("evento individual criado", !!evInd.id, JSON.stringify(evInd));
res = await req(`/events/${evInd.id}/slots`, admin, { method: "POST", body: JSON.stringify({ role_id: role.id }) });
const slotInd = await res.json();
res = await req(`/schedules/${slotInd.id}`, admin, { method: "PATCH", body: JSON.stringify({ user_id: vol.id }) });
check("atribui individual", res.status < 300, String(res.status));
res = await req(`/schedules/${slotInd.id}/respond`, v, { method: "POST", body: JSON.stringify({ status: "CONFIRMED" }) });
check("confirma individual", res.status === 200, String(res.status));
let my = await (await req("/schedules/my", v)).json();
let row = my.find((s) => s.event_id === evInd.id);
check("schedules/my mostra CONFIRMED", row?.status === "CONFIRMED", JSON.stringify(row?.status));
res = await req(`/schedules/${slotInd.id}/respond`, v, { method: "POST", body: JSON.stringify({ status: "DECLINED" }) });
check("recusa depois de confirmar (individual)", res.status === 200, String(res.status));
my = await (await req("/schedules/my", v)).json();
row = my.find((s) => s.event_id === evInd.id);
check("status final DECLINED (individual)", row?.status === "DECLINED", JSON.stringify(row?.status));

// --- escala de grupo ---
res = await req("/voice/groups", louvor, { method: "POST", body: JSON.stringify({ kind: "VOZ", name: "Smoke Recusa G" }) });
const grp = await res.json();
check("criar grupo", !!grp.id, JSON.stringify(grp));
await req(`/voice/groups/${grp.id}/members`, louvor, { method: "POST", body: JSON.stringify({ user_id: vol.id }) });
res = await req("/events", admin, { method: "POST", body: JSON.stringify({ title: "Smoke Recusa Grupo", event_date: thisMonth }) });
const evGrp = await res.json();
check("evento de grupo criado", !!evGrp.id, JSON.stringify(evGrp));
res = await req(`/events/${evGrp.id}/slots`, admin, { method: "POST", body: JSON.stringify({ role_id: role.id }) });
const slotGrp = await res.json();
res = await req(`/schedules/${slotGrp.id}`, louvor, { method: "PATCH", body: JSON.stringify({ group_id: grp.id }) });
check("atribui grupo", res.status < 300, String(res.status));
res = await req(`/schedules/${slotGrp.id}/respond`, v, { method: "POST", body: JSON.stringify({ status: "CONFIRMED" }) });
check("confirma grupo", res.status === 200, String(res.status));
res = await req(`/schedules/${slotGrp.id}/respond`, v, { method: "POST", body: JSON.stringify({ status: "DECLINED" }) });
check("recusa depois de confirmar (grupo)", res.status === 200, String(res.status));
my = await (await req("/schedules/my", v)).json();
row = my.find((s) => s.event_id === evGrp.id);
check("status final DECLINED (grupo)", row?.status === "DECLINED", JSON.stringify(row?.status));

// cleanup
await req(`/events/${evInd.id}`, admin, { method: "DELETE" });
await req(`/events/${evGrp.id}`, admin, { method: "DELETE" });
await req(`/voice/groups/${grp.id}`, louvor, { method: "DELETE" });
await req(`/users/${vol.id}`, admin, { method: "DELETE" });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Rodar o smoke**

Run: `node "$env:TEMP\opencode\smoke-agenda-recusa.mjs"`
Expected: `15 passed, 0 failed` (valida a premissa de R2: o backend aceita CONFIRMED→DECLINED sem guarda). Se algum FAIL de transição → parar e investigar `server/routes/schedules.ts:251` antes de seguir.

- [ ] **Step 3: Confirmar que nada precisa ser commitado aqui**

O smoke vive em `%TEMP%\opencode\` (fora do repo, padrão do projeto). Run: `git status --short` → Expected: apenas o plano deste feature (commitado abaixo, junto com a escrita do plano) — nenhum arquivo de código alterado neste task.

---

### Task 2: Filtro "Este mês | Todas"

**Files:**
- Modify: `src/pages/AgendaPage.tsx` (estado em `:14-20`, derivadas em `:84-85`, cabeçalho em `:187`, empty state em `:197-199`)

- [ ] **Step 1: Adicionar o estado do período**

Após `const [openTeam, setOpenTeam] = useState<Record<number, boolean>>({});` (linha ~20) adicione:

```tsx
  const [period, setPeriod] = useState<"month" | "all">("month");
```

- [ ] **Step 2: Filtrar as derivadas**

Substitua as linhas 84-85:

```tsx
  const upcoming = schedules.filter((s) => new Date(s.event_date!).getTime() > Date.now());
  const past = schedules.filter((s) => new Date(s.event_date!).getTime() <= Date.now());
```

por:

```tsx
  const inPeriod = (s: Schedule) => {
    if (period === "all") return true;
    const d = new Date(s.event_date!);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
  const visible = schedules.filter(inPeriod);
  const upcoming = visible.filter((s) => new Date(s.event_date!).getTime() > Date.now());
  const past = visible.filter((s) => new Date(s.event_date!).getTime() <= Date.now());
```

- [ ] **Step 3: Controle segmentado no cabeçalho**

Substitua a linha 187 (`<h1 className="text-xl font-bold">Minha Agenda</h1>`) por:

```tsx
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Minha Agenda</h1>
        <div className="flex rounded-lg border p-0.5" role="group" aria-label="Período">
          <button
            type="button"
            aria-pressed={period === "month"}
            onClick={() => setPeriod("month")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              period === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Este mês
          </button>
          <button
            type="button"
            aria-pressed={period === "all"}
            onClick={() => setPeriod("all")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              period === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Todas
          </button>
        </div>
      </div>
```

- [ ] **Step 4: Empty state do filtro "Este mês"**

Substitua (linhas 197-199):

```tsx
            {upcoming.length === 0 && (
              <EmptyState title="Nenhuma escala futura" hint="Novas atribuições aparecerão aqui." />
            )}
```

por:

```tsx
            {upcoming.length === 0 &&
              (period === "month" ? (
                <EmptyState title="Nenhuma escala este mês" hint="Use o filtro para ver todas as escalas." />
              ) : (
                <EmptyState title="Nenhuma escala futura" hint="Novas atribuições aparecerão aqui." />
              ))}
```

- [ ] **Step 5: Verificar typecheck e build**

Run: `npm run typecheck` → Expected: exit 0, sem saída de erro.
Run: `npm run build` → Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AgendaPage.tsx
git commit -m "feat(agenda): filtro 'Este mes | Todas' com padrao Este mes"
```

---

### Task 3: Botões pós-confirmação + diálogo de recusa em 2 passos

**Files:**
- Modify: `src/pages/AgendaPage.tsx` (estado em `:14-20`, novo handler após `respond` em `:32-45`, card em `:116-142`, novo `Dialog` antes do `</div>` final em `:272`)

- [ ] **Step 1: Estado do diálogo de recusa**

Após o estado `recuse` — adicione junto dos outros estados (após `period` do Task 2):

```tsx
  const [recuse, setRecuse] = useState<{ id: number; step: "confirm" | "notice" } | null>(null);
```

- [ ] **Step 2: Handler `confirmRecuse`**

Logo após a função `respond` (após a linha ~45, `};` que fecha `respond`), adicione:

```tsx
  const confirmRecuse = async () => {
    if (!recuse || recuse.step !== "confirm" || respondingId !== null) return;
    setRespondingId(recuse.id);
    try {
      await api.post(`/schedules/${recuse.id}/respond`, { status: "DECLINED" });
      setRecuse({ id: recuse.id, step: "notice" });
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao recusar", "error");
    } finally {
      setRespondingId(null);
    }
  };
```

(Em erro o diálogo permanece no passo "confirm" — apenas toast, spec R3.4.)

- [ ] **Step 3: Reescrever os botões do card**

Substitua o trecho das linhas 116-142 (bloco PENDING + bloco de troca) por:

```tsx
          {new Date(s.event_date!).getTime() > Date.now() && s.status === "PENDING" && (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="success"
                className="flex-1"
                disabled={respondingId === s.id}
                onClick={() => respond(s.id, "CONFIRMED")}
              >
                Confirmar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="flex-1"
                disabled={respondingId === s.id}
                onClick={() => setRecuse({ id: s.id, step: "confirm" })}
              >
                Recusar
              </Button>
            </div>
          )}
          {new Date(s.event_date!).getTime() > Date.now() && s.status === "CONFIRMED" && (
            <div className="mt-3 flex gap-2">
              {!s.group && (
                <Button size="sm" variant="outline" className="flex-1" onClick={() => openSwap(s)}>
                  <Handshake size={14} /> Solicitar troca
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                className="flex-1"
                disabled={respondingId === s.id}
                onClick={() => setRecuse({ id: s.id, step: "confirm" })}
              >
                Recusar
              </Button>
            </div>
          )}
          {new Date(s.event_date!).getTime() > Date.now() && !s.group && s.status === "PENDING" && (
            <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => openSwap(s)}>
              <Handshake size={14} /> Solicitar troca
            </Button>
          )}
```

Resultado por status (futuro): PENDENTE = Confirmar/Recusar + Solicitar troca (individual); CONFIRMED = Solicitar troca+Recusar (individual) ou só Recusar (grupo); DECLINED = nenhum; passado = nenhum (já era).

- [ ] **Step 4: Dialog de recusa em dois passos**

Antes do `</div>` final (logo após o `</Dialog>` do swap, linha ~272), adicione:

```tsx
      <Dialog open={!!recuse} onClose={() => setRecuse(null)} title={recuse?.step === "notice" ? "Escala recusada" : "Tem certeza?"}>
        {recuse?.step === "confirm" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Você não poderá participar deste culto.</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setRecuse(null)}>
                Voltar
              </Button>
              <Button size="sm" variant="destructive" disabled={respondingId === recuse.id} onClick={confirmRecuse}>
                Recusar
              </Button>
            </div>
          </div>
        )}
        {recuse?.step === "notice" && (
          <div className="space-y-4">
            <p className="rounded-xl border border-yellow-400 bg-yellow-100 p-3 text-sm text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-100">
              Avise o líder no WhatsApp o motivo de não poder participar.
            </p>
            <Button size="sm" className="w-full" onClick={() => setRecuse(null)}>
              Entendi
            </Button>
          </div>
        )}
      </Dialog>
```

- [ ] **Step 5: Verificar typecheck e build**

Run: `npm run typecheck` → Expected: exit 0.
Run: `npm run build` → Expected: exit 0.

- [ ] **Step 6: Smoke de regressão rápido**

Run: `node "$env:TEMP\opencode\smoke-agenda-recusa.mjs"` → Expected: `15 passed, 0 failed`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/AgendaPage.tsx
git commit -m "feat(agenda): botoes pos-confirmacao e recusa com confirmacao + aviso de WhatsApp"
```

---

### Task 4: DOM check headless (verificação visual da UI)

**Files:**
- Create: `%TEMP%\opencode\domcheck-agenda.mjs` (não é commitado — padrão do projeto)

- [ ] **Step 1: Criar o script completo abaixo**

```js
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { createRequire } from "node:module";
const require = createRequire("C:/Users/Raptor/Pictures/ESCALA-MONTE SIÃO/package.json");
const WebSocket = require("ws");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9335;
const BASE = "http://localhost:5173";
const API = `${BASE}/api`;

let passed = 0, failed = 0;
const check = (name, ok, extra = "") => {
  if (ok) { passed++; console.log(`PASS ${name}`); }
  else { failed++; console.log(`FAIL ${name} ${extra}`); }
};

async function login(email) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "senha123" }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (r.headers.get("set-cookie") || "").split(";")[0];
}
async function req(path, cookie, opts = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers || {}) },
  });
}

// ---------- setup via API ----------
const stamp = Date.now();
const admin = await login("admin@montesiao.org");
const louvor = await login("carlos@montesiao.org");
for (const ev of (await (await req("/events", admin)).json()).filter((e) => String(e.title).startsWith("Smoke Agenda"))) {
  await req(`/events/${ev.id}`, admin, { method: "DELETE" });
}
for (const g of (await (await req("/voice/groups", louvor)).json()).filter((x) => String(x.name).startsWith("Smoke Agenda DG"))) {
  await req(`/voice/groups/${g.id}`, louvor, { method: "DELETE" });
}
let res = await req("/users", admin, {
  method: "POST",
  body: JSON.stringify({ name: "Smoke Agenda Vol", email: `smoke-agenda-vol-${stamp}@montesiao.org`, password: "senha123", phone: `119${String(stamp).slice(-7)}9` }),
});
const vol = await res.json();
if (!vol.id) { console.error("FALHA: usuario temporario", vol); process.exit(1); }
const mins = await (await req("/ministries", admin)).json();
const role = mins.find((m) => Number(m.id) === 1)?.roles?.[0];
await req("/ministries/1/members", admin, { method: "POST", body: JSON.stringify({ user_id: vol.id, role_id: role.id }) });
const v = await login(`smoke-agenda-vol-${stamp}@montesiao.org`);

const now = new Date();
const y = now.getFullYear(), m = now.getMonth();
const lastDay = new Date(y, m + 1, 0).getDate();
const thisMonth = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:45:00`;
const ny = m === 11 ? y + 1 : y, nm = (m + 1) % 12;
const nextMonth = `${ny}-${String(nm + 1).padStart(2, "0")}-15T19:00:00`;

// individual do mês — CONFIRMADO
res = await req("/events", admin, { method: "POST", body: JSON.stringify({ title: "Smoke Agenda Dom", event_date: thisMonth }) });
const evMes = await res.json();
res = await req(`/events/${evMes.id}/slots`, admin, { method: "POST", body: JSON.stringify({ role_id: role.id }) });
const slotMes = await res.json();
await req(`/schedules/${slotMes.id}`, admin, { method: "PATCH", body: JSON.stringify({ user_id: vol.id }) });
res = await req(`/schedules/${slotMes.id}/respond`, v, { method: "POST", body: JSON.stringify({ status: "CONFIRMED" }) });
check("setup: individual confirmado", res.status === 200, String(res.status));

// grupo do mês — CONFIRMADO
res = await req("/voice/groups", louvor, { method: "POST", body: JSON.stringify({ kind: "VOZ", name: "Smoke Agenda DG" }) });
const grp = await res.json();
await req(`/voice/groups/${grp.id}/members`, louvor, { method: "POST", body: JSON.stringify({ user_id: vol.id }) });
res = await req("/events", admin, { method: "POST", body: JSON.stringify({ title: "Smoke Agenda Grupo", event_date: thisMonth }) });
const evGrp = await res.json();
res = await req(`/events/${evGrp.id}/slots`, admin, { method: "POST", body: JSON.stringify({ role_id: role.id }) });
const slotGrp = await res.json();
await req(`/schedules/${slotGrp.id}`, louvor, { method: "PATCH", body: JSON.stringify({ group_id: grp.id }) });
res = await req(`/schedules/${slotGrp.id}/respond`, v, { method: "POST", body: JSON.stringify({ status: "CONFIRMED" }) });
check("setup: grupo confirmado", res.status === 200, String(res.status));

// individual do próximo mês — PENDENTE (só para o filtro)
res = await req("/events", admin, { method: "POST", body: JSON.stringify({ title: "Smoke Agenda Proximo", event_date: nextMonth }) });
const evNext = await res.json();
res = await req(`/events/${evNext.id}/slots`, admin, { method: "POST", body: JSON.stringify({ role_id: role.id }) });
const slotNext = await res.json();
await req(`/schedules/${slotNext.id}`, admin, { method: "PATCH", body: JSON.stringify({ user_id: vol.id }) });

// ---------- CDP ----------
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}\\opencode\\chrome-dbg-agenda`, "--headless=new", "--no-first-run", "--no-default-browser-check", "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
let target;
for (let i = 0; i < 50; i++) {
  await sleep(300);
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const list = await r.json();
    target = list.find((t) => t.type === "page");
    if (target) break;
  } catch {}
}
if (!target) { console.error("FALHA: sem target CDP"); chrome.kill(); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res2, rej2) => { ws.once("open", res2); ws.once("error", rej2); });
let id = 0;
const pending = new Map();
ws.on("message", (data) => { const msg = JSON.parse(data.toString()); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } });
function send(method, params = {}) { const mid = ++id; return new Promise((resolve) => { pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); }); }
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}
await send("Page.enable");
await send("Runtime.enable");
await evaluate(`(async () => { location.href = "${BASE}/"; return true; })()`);
await sleep(2500);
await evaluate(`(async () => {
  const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email: "smoke-agenda-vol-${stamp}@montesiao.org", password: "senha123" }) });
  return r.status;
})()`);
await evaluate(`(async () => { location.href = "${BASE}/agenda"; return true; })()`);
await sleep(4000);

// r1: filtro padrão
let r = await evaluate(`(() => {
  const out = [];
  const monthBtn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Este mês");
  const allBtn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Todas");
  out.push(["segmentado existe", !!monthBtn && !!allBtn, ""]);
  out.push(["padrao 'Este mes' ativo", monthBtn?.getAttribute("aria-pressed") === "true", monthBtn?.getAttribute("aria-pressed") ?? "n/a"]);
  out.push(["evento do mes visivel", !!([...document.querySelectorAll("h3")].find((h) => h.textContent.includes("Smoke Agenda Dom"))), "h3 ausente"]);
  out.push(["evento do grupo visivel", !!([...document.querySelectorAll("h3")].find((h) => h.textContent.includes("Smoke Agenda Grupo"))), "h3 ausente"]);
  out.push(["evento do proximo mes oculto", !([...document.querySelectorAll("h3")].find((h) => h.textContent.includes("Smoke Agenda Proximo"))), "aparece com filtro mes"]);
  return out;
})()`);
r.forEach(([n, ok, e]) => check(n, ok, e));

// r2: alternar 'Todas' e voltar
r = await evaluate(`(async () => {
  const out = [];
  const allBtn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Todas");
  allBtn?.click();
  await new Promise((res) => setTimeout(res, 300));
  out.push(["'Todas' ativo", allBtn?.getAttribute("aria-pressed") === "true", allBtn?.getAttribute("aria-pressed") ?? "n/a"]);
  out.push(["proximo mes aparece em 'Todas'", !!([...document.querySelectorAll("h3")].find((h) => h.textContent.includes("Smoke Agenda Proximo"))), "ainda oculto"]);
  const monthBtn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Este mês");
  monthBtn?.click();
  await new Promise((res) => setTimeout(res, 300));
  out.push(["volta para 'Este mes'", monthBtn?.getAttribute("aria-pressed") === "true", monthBtn?.getAttribute("aria-pressed") ?? "n/a"]);
  out.push(["proximo mes some de volta", !([...document.querySelectorAll("h3")].find((h) => h.textContent.includes("Smoke Agenda Proximo"))), "ainda visivel"]);
  return out;
})()`);
r.forEach(([n, ok, e]) => check(n, ok, e));

// r3: card individual CONFIRMADO
r = await evaluate(`(() => {
  const out = [];
  const h3 = [...document.querySelectorAll("h3")].find((h) => h.textContent.includes("Smoke Agenda Dom"));
  let card = h3;
  while (card && !card.querySelector("button")) card = card.parentElement;
  const btns = card ? [...card.querySelectorAll("button")].map((b) => b.textContent.trim()) : [];
  out.push(["card individual: badge Confirmado", (card?.textContent ?? "").includes("Confirmado"), (card?.textContent ?? "").slice(0, 200)]);
  out.push(["card individual: botao 'Solicitar troca'", btns.some((t) => t.includes("Solicitar troca")), btns.join(" | ")]);
  out.push(["card individual: botao 'Recusar'", btns.some((t) => t === "Recusar"), btns.join(" | ")]);
  out.push(["card individual: sem 'Confirmar'", !btns.some((t) => t === "Confirmar"), btns.join(" | ")]);
  return out;
})()`);
r.forEach(([n, ok, e]) => check(n, ok, e));

// r4: card de grupo CONFIRMADO
r = await evaluate(`(() => {
  const out = [];
  const h3 = [...document.querySelectorAll("h3")].find((h) => h.textContent.includes("Smoke Agenda Grupo"));
  let card = h3;
  while (card && !card.querySelector("button")) card = card.parentElement;
  const btns = card ? [...card.querySelectorAll("button")].map((b) => b.textContent.trim()) : [];
  out.push(["card grupo: botao 'Recusar'", btns.some((t) => t === "Recusar"), btns.join(" | ")]);
  out.push(["card grupo: sem 'Solicitar troca'", !btns.some((t) => t.includes("Solicitar troca")), btns.join(" | ")]);
  return out;
})()`);
r.forEach(([n, ok, e]) => check(n, ok, e));

// r5: diálogo — abrir e 'Voltar'
r = await evaluate(`(async () => {
  const out = [];
  const h3 = [...document.querySelectorAll("h3")].find((h) => h.textContent.includes("Smoke Agenda Dom"));
  let card = h3;
  while (card && !card.querySelector("button")) card = card.parentElement;
  const recBtn = card ? [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === "Recusar") : null;
  out.push(["botao Recusar no card individual", !!recBtn, ""]);
  if (!recBtn) return out;
  recBtn.click();
  await new Promise((res) => setTimeout(res, 400));
  const dlg = document.querySelector('[role="dialog"]');
  out.push(["dialog 'Tem certeza?' abre", !!dlg && dlg.textContent.includes("Tem certeza?"), dlg?.textContent.slice(0, 120) ?? "sem dialog"]);
  const voltar = dlg ? [...dlg.querySelectorAll("button")].find((b) => b.textContent.trim() === "Voltar") : null;
  voltar?.click();
  await new Promise((res) => setTimeout(res, 300));
  out.push(["'Voltar' fecha o dialog", !document.querySelector('[role="dialog"]'), "dialog ainda aberto"]);
  return out;
})()`);
r.forEach(([n, ok, e]) => check(n, ok, e));

// r6: diálogo — confirmar, ver aviso, 'Entendi', card final
r = await evaluate(`(async () => {
  const out = [];
  const h3 = [...document.querySelectorAll("h3")].find((h) => h.textContent.includes("Smoke Agenda Dom"));
  let card = h3;
  while (card && !card.querySelector("button")) card = card.parentElement;
  const recBtn = card ? [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === "Recusar") : null;
  recBtn?.click();
  await new Promise((res) => setTimeout(res, 400));
  let dlg = document.querySelector('[role="dialog"]');
  const confirmBtn = dlg ? [...dlg.querySelectorAll("button")].find((b) => b.textContent.trim() === "Recusar") : null;
  out.push(["botao 'Recusar' dentro do dialog", !!confirmBtn, dlg?.textContent.slice(0, 120) ?? "sem dialog"]);
  confirmBtn?.click();
  await new Promise((res) => setTimeout(res, 1500));
  dlg = document.querySelector('[role="dialog"]');
  out.push(["titulo 'Escala recusada'", !!dlg && dlg.textContent.includes("Escala recusada"), dlg?.textContent.slice(0, 160) ?? "sem dialog"]);
  out.push(["aviso do WhatsApp visivel", !!dlg && dlg.textContent.includes("Avise o líder no WhatsApp"), dlg?.textContent.slice(0, 160) ?? ""]);
  const entendi = dlg ? [...dlg.querySelectorAll("button")].find((b) => b.textContent.trim() === "Entendi") : null;
  out.push(["botao 'Entendi' existe", !!entendi, ""]);
  entendi?.click();
  await new Promise((res) => setTimeout(res, 400));
  out.push(["dialog fecha apos 'Entendi'", !document.querySelector('[role="dialog"]'), "dialog ainda aberto"]);
  const h3b = [...document.querySelectorAll("h3")].find((h) => h.textContent.includes("Smoke Agenda Dom"));
  let card2 = h3b;
  while (card2 && !card2.querySelector("button")) card2 = card2.parentElement;
  const text = card2?.textContent ?? "";
  const btns2 = card2 ? [...card2.querySelectorAll("button")].map((b) => b.textContent.trim()) : [];
  out.push(["card final: badge 'Recusado'", text.includes("Recusado"), text.slice(0, 200)]);
  out.push(["card final: sem 'Confirmar'", !btns2.some((t) => t === "Confirmar"), btns2.join(" | ")]);
  out.push(["card final: sem 'Recusar'", !btns2.some((t) => t === "Recusar"), btns2.join(" | ")]);
  out.push(["card final: sem 'Solicitar troca'", !btns2.some((t) => t.includes("Solicitar troca")), btns2.join(" | ")]);
  return out;
})()`);
r.forEach(([n, ok, e]) => check(n, ok, e));

// ---------- cleanup ----------
await req(`/events/${evMes.id}`, admin, { method: "DELETE" });
await req(`/events/${evGrp.id}`, admin, { method: "DELETE" });
await req(`/events/${evNext.id}`, admin, { method: "DELETE" });
await req(`/voice/groups/${grp.id}`, louvor, { method: "DELETE" });
await req(`/users/${vol.id}`, admin, { method: "DELETE" });
chrome.kill();
ws.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Rodar o DOM check**

Run: `node "$env:TEMP\opencode\domcheck-agenda.mjs"`
Expected: `2 setup + 23 checks, 0 failed`. Se algum FAIL → corrigir `src/pages/AgendaPage.tsx` e rodar de novo até verde.

- [ ] **Step 3: Regressão de API**

Run: `node "$env:TEMP\opencode\smoke-agenda-recusa.mjs"` → Expected: `15 passed, 0 failed`.

---

### Task 4 (obs): limitação conhecida

O setup usa o **último dia do mês às 23h45** como data "futura deste mês". Rodar o domcheck depois das 23:45 do último dia do mês → os cards perdem os botões (não é mais futuro). Nesse caso, rodar antes ou ajustar a data manualmente.

---

### Task 5: Verificação final + docs + push

**Files:**
- Modify: `docs/superpowers/specs/2026-09-28-agenda-filtro-recusa-design.md` (rótulos e checkboxes)

- [ ] **Step 1: Padronizar rótulo na spec**

Na spec, substituir todas as ocorrências de `Pedir troca` por `Solicitar troca` (o rótulo UI existente é "Solicitar troca" — a spec usa "Pedir troca" como nome conceitual; padronizar para não haver divergência spec×UI).

- [ ] **Step 2: typecheck + build + detector**

Run: `npm run typecheck` → exit 0.
Run: `npm run build` → exit 0.
Run: `node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public` → exit 0.

- [ ] **Step 3: Regressão completa — 13 smokes**

```powershell
$s = "avisos","excluir-funcoes","excluir-ministerio","grupos-voz","leaders","min-leaders","playlists","push","remocoes-avatar","telefone","rebaixa-lider","time-agenda","agenda-recusa"
$fail = 0
foreach ($n in $s) {
  $out = node "$env:TEMP\opencode\smoke-$n.mjs" 2>&1 | Tee-Object -Variable t | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0) { $fail++; "FAIL $n" } else { "PASS $n -> $t" }
}
"falhas: $fail"
```
Expected: `falhas: 0`.

- [ ] **Step 4: DOM check final**

Run: `node "$env:TEMP\opencode\domcheck-agenda.mjs"` → Expected: 0 failed.

- [ ] **Step 5: Marcar critérios de aceite da spec**

Marcar todos os checkboxes da seção "Critérios de aceite" da spec (`[ ]` → `[x]`).

- [ ] **Step 6: Commit dos docs**

```bash
git add docs/superpowers/specs/2026-09-28-agenda-filtro-recusa-design.md
git commit -m "docs: rotulo 'Solicitar troca' uniforme e criterios de aceite marcados"
```

- [ ] **Step 7: Push da branch (sem deploy — CI só roda em main)**

```bash
git push -u origin feature/minha-nova-funcionalidade
```

---

## Self-review (executado na escrita do plano)

1. **Spec coverage:** R1 → Task 2; R2 → Task 3; R3 → Task 3 Steps 2/4; fora de escopo → nenhum arquivo de `server/` tocado em nenhum task; testes → Tasks 1/4/5; critérios de aceite → domcheck r1-r6 + smoke.
2. **Placeholder scan:** nenhum TBD/TODO; todos os passos de código contêm o código completo.
3. **Type consistency:** `period: "month" | "all"` (Task 2) usado no Task 4 via `aria-pressed`; `recuse: {id, step}` (Task 3 Step 1) usado em `confirmRecuse` e no Dialog; `respond(s.id, ...)` inalterado.
