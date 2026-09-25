# Destaques Visuais: menu sticky, borda verde de líder e bolinha verde — Design

**Data:** 2026-09-25
**Status:** Aprovado em conversa (3 perguntas + design em 3 seções)

## Problema

1. **Menu hambúrguer (mobile):** o `<header>` é `sticky top-0 z-40`, mas a div `#mobile-menu` é irmã dele sem `position`/`z-index`. Ao deslizar a tela com o menu aberto, o menu rola junto com o conteúdo e some, enquanto a barra permanece presa no topo ("só abre na parte superior").
2. **Ministérios:** todos os cards da página `/ministerios` têm a mesma borda cinza — não há destaque visual de qual ministério a pessoa logada lidera.
3. **Calendário:** os pontos de dias escalados e a bolinha da legenda "Escalado" no `MiniCalendar` são vermelhos (`bg-primary`, cor da igreja) — o vermelho é reservado para "Indisponível"; "escalado" deveria ser verde.

## Decisões (respondidas pelo usuário)

- Bolinha alvo: **só a do mini-calendário** (legenda + pontos dos dias); a pill de status da "Minha Agenda" não muda.
- Borda verde: **só nos cards de `/ministerios`**; os badges "Meus ministérios" do Início não mudam.
- Admin: **não** recebe borda verde em todos — verde somente para **líderes de fato** (`m.leader_ids` contém o usuário).

## Solução

### S1 — Menu sticky com a barra
Envolver `<header>` e `<div id="mobile-menu">` num único `<div className="sticky top-0 z-40">` dentro do mesmo pai. Barra e menu passam a rolar juntos como um bloco preso no topo. com o menu aberto, deslizar a tela mantém os dois visíveis no topo até o menu ser fechado. Sem JS; `md:hidden`/`hidden` existentes preservam o comportamento desktop. Nenhuma outra classe muda (o menu já tem `border-b bg-card`).

### S2 — Borda verde no card do ministério liderado
Em `src/pages/MinistriesPage.tsx`, além do `canEdit` existente, novo predicado estrito:

```ts
const isLider = (m: Ministry) => (m.leader_ids ?? []).includes(user?.id ?? -1);
```

No `<Card>` de cada ministério: `className={isLider(m) ? "border-success" : undefined}`. Usa o token `--success` (`oklch(0.58 0.15 150)`), o mesmo verde do status "Confirmado". `canEdit` (que inclui admin) continua inalterado para botões/permissões.

### S3 — Bolinha "Escalado" verde no MiniCalendar
Em `src/components/MiniCalendar.tsx`:
- ponto do dia escalado: `bg-primary` → `bg-success`;
- bolinha da legenda "Escalado": `bg-primary` → `bg-success`.

Não mudam: dia selecionado (`bg-white`), bolinha "Indisponível" (`bg-destructive/70`), pills de status da agenda.

## Fora de escopo

- Pill de status da "Minha Agenda" (continua âmbar "Pendente").
- Badges "Meus ministérios" no Início.
- Qualquer mudança de backend, API, migration ou smoke.

## Verificação

1. `npm run typecheck` + `npm run build` + detector impeccable (`src public`, exit 0).
2. Visual via navegador (wmux): `/ministerios` como líder (borda verde) e como admin sem liderança (sem verde); menu aberto no mobile em `/` com scroll (mantém-se visível); `MiniCalendar` no Início/Calendário com pontos e legenda "Escalado" verdes e "Indisponível" vermelho.
3. Sem novos endpoints — smokes existentes não são afetados.
