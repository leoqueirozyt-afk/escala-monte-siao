---
name: Escala Monte Sião
description: PWA de escalas de voluntários da Igreja Monte Sião, acolhedor e orientado a tarefa
colors:
  cross-red: "#C8102E"
  cross-red-deep: "#7A0C1F"
  mountain-bronze: "#8C6239"
  mountain-bronze-deep: "#6B4A28"
  brand-ink: "#1A1A1A"
  primary: "#C8102E"
  primary-dark: "#E03A52"
  background: "#FAF8F6"
  background-dark: "#141110"
  foreground: "#1A1A1A"
  foreground-dark: "#F5F0EC"
  card: "#FFFFFF"
  card-dark: "#15181F"
  muted: "#ECEFF2"
  muted-dark: "#24262C"
  muted-foreground: "#606369"
  muted-foreground-dark: "#95989F"
  border: "#DFE1E5"
  border-dark: "#2B2E34"
  success: "#25984D"
  warning: "#D9A514"
  destructive: "#CC272E"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.2
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 16px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
  button-brand-commit:
    backgroundColor: "{colors.cross-red}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 24px"
    typography: "{typography.label}"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 12px"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "16px"
  badge-success:
    backgroundColor: "{colors.success}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
    typography: "{typography.body}"
  nav-item-active:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 12px"
    typography: "{typography.label}"
---

# Design System: Escala Monte Sião

## 1. Overview

**Creative North Star: "O Púlpito Acolhedor"**

Este sistema serve a um PWA de escalas: voluntários no celular antes do culto, líderes preenchendo vagas, o ADMIN aprovando pedidos. A personalidade é acolhedor, confiável e simples (PRODUCT.md). Calor de comunidade sem infantilidade; confiança de ferramenta sem burocracia de SaaS.

A paleta da logo carrega identidade **em todo o produto**: vermelho da cruz é o `primary` do shell autenticado (nav, botões, anel de foco, theme-color) e o bronze dos montes apoia superfícies e a arte de marca. Login e área interna compartilham ChurchMark, gradiente de marca e tokens `--brand-*`. O sistema rejeita explicitamente SaaS cream genérico, glassmorphism decorativo, gradient text e UI escura de “ferramenta de desenvolvedor” fora de lugar (PRODUCT.md anti-references).

**Key Characteristics:**
- Uma família sans do sistema; hierarquia por peso e escala fixa, sem fonte de display em labels
- Mobile-first: alvos ≥44px, uma coluna, bottom nav no celular
- Status sempre cor + texto (Confirmado, Pendente, Vago, Recusado)
- Cantos generosos (12–16px em controles e cards), sombras baixas e amplas
- Modo escuro como tema completo, não como inverter forçado

## 2. Colors

Paleta unificada da marca: vermelho da cruz como `primary` + neutros quentes sutis para o app em uso.

### Primary
- **Vermelho Cruz** (`#C8102E`): token `primary` em **login e shell autenticado** — ENTRAR, nav ativa, botões default, anel de foco, theme-color claro, herói do dashboard.
- **Vermelho Cruz Profundo** (`#7A0C1F` / mid `#9A0D22`): gradiente de commit e arte de marca; estados pressed mais densos.
- **Vermelho App Escuro** (`#E03A52`): `primary` no modo escuro (contraste sobre card escuro); theme-color dark.

### Secondary
- **Bronze Monte** (`#8C6239`): ícones secundários de marca, acentos de painel (nota de líder no login), blob de marca.
- **Bronze Monte Profundo** (`#6B4A28`): segundo plano do gradiente da arte de marca e sombra dos montes no SVG.

### Tertiary
- **Tinta da Marca** (`#1A1A1A`): títulos e texto forte no login claro; espelha o ink do body em superfícies brancas.

### Neutral
- **Fundo App** (`#FAF8F6` / dark `#141110`): `--background`, neutro quente sutil alinhado ao estágio de login (não cream de SaaS).
- **Card** (`#FFFFFF` / dark `#151413`): superfícies elevadas, dialogs, header.
- **Muted** (`oklch` quente / dark): hover de nav, chips, áreas de demo.
- **Muted Foreground**: labels secundários, papel do usuário no header. Nunca usar para corpo crítico em fundo tintado sem checar 4.5:1.
- **Borda**: bordas de card, input, divisores (tom quente leve).

### Semantic
- **Sucesso** (`#25984D`): badge Confirmado, toast de sucesso, variante `success` do botão.
- **Aviso** (`#D9A514`): badge Pendente (texto amber-600 no claro, amber-400 no escuro).
- **Destrutivo** (`#CC272E`): badge Recusado, Sair, erros, validação.

### Named Rules
**The Cross Red Rule.** O Vermelho Cruz é a voz única da marca em **login e shell logado** (primary). O destrutivo permanece um tom mais escuro (`destructive`) para não competir em dialogs de confirmação; não inundar listas de vermelho só por status.

**The Status Never Color-Only Rule.** Todo status de escala leva rótulo em texto junto da cor (Vago, Pendente, Confirmado, Recusado). Proibido comunicar status só com bolinha ou hue.

## 3. Typography

**Display Font:** ui-sans-serif / system-ui (Segoe UI, Roboto, sans-serif)
**Body Font:** ui-sans-serif / system-ui (mesma pilha)
**Label/Mono Font:** nenhuma; números de relatório usam `tabular-nums` na mesma família

**Character:** Sans de sistema, neutra e rápida de ler no celular. Peso carrega hierarquia; não há fonte de display. Labels, botões e dados nunca saem desta família.

### Hierarchy
- **Display** (700, 24px / `text-2xl`, LH 1.25): título do login (“Acesse sua Conta”); raríssimo fora do auth.
- **Headline** (700, 20px / `text-xl`, LH 1.3): H1 de página (Agenda, Escala, Perfil, Ministérios).
- **Title** (600, 16px / `text-base`, LH 1.4): `CardTitle`, nome de evento em destaque.
- **Body** (400, 14px / `text-sm`, LH 1.5, medida 65–75ch em prosa): descrições, células de lista, copy de erro. Inputs de auth e formulários críticos sobem para 16px (`text-base`) para evitar zoom iOS.
- **Label** (500, 14px / `text-sm`, LH 1.2): `Label` de campo, nav, botões. Brand no login usa tracking `0.06–0.08em` só no wordmark e no CTA.

### Named Rules
**The One Family Rule.** Uma família sans. Proibido display/serif/mono em labels, botões, tabelas ou dados.

## 4. Elevation

Híbrido sóbrio e contido: quase tudo plano com borda; profundidade vem de camadas discretas (sombras amplas e baixas), não de glow decorativo. O login é a única superfície “levantada” de propósito (card flutuante sobre gradiente de marca). Hover e foco mudam cor/anel, não empilham sombra nova.

### Shadow Vocabulary
- **Surface rest** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.05)` — Tailwind `shadow-sm`): cards, inputs, mini-calendário no repouso.
- **Toast / menu** (`shadow-lg`): toasts no topo, flutuantes temporários.
- **Dialog** (`shadow-xl`): sheet mobile e modal desktop sobre backdrop `black/50` + blur leve.
- **Login card** (`box-shadow: 0 24px 64px -24px rgba(26,26,26,0.22)`): elevação institucional do card de auth.
- **Brand mark** (`box-shadow: 0 8px 20px -6px rgba(26,26,26,0.35)`): badge SVG da cruz/montes.
- **Commit glow** (`box-shadow: 0 12px 28px -10px rgba(200,16,46,0.6)`): exclusivo do botão ENTRAR; não copiar para botões de lista.

### Named Rules
**The Discrete Layers Rule.** Superfícies em repouso são planas ou `shadow-sm`. Sombras novas só como resposta a estado ou a hierarquia real (dialog > card > texto). Proibido sombra “de 2014” escura com blur pequeno.

## 5. Components

Carácter: **seguro no toque, gentil na forma** — alvos ≥44px, radius 12–16px, primário chapado no app e gradiente vermelho só no commit de login.

### Buttons
- **Shape:** raio `12px` (`rounded-xl`); altura default 44px (`h-11`), `lg` 48px (`h-12`), `sm` 36px, ícone 40×40.
- **Primary (app):** fundo `primary` Vermelho Cruz, texto branco, `text-sm font-medium`, padding `16px`; hover `brightness-105`; `active:scale-[0.98]`.
- **Brand commit (login):** gradiente `linear-gradient(90deg, #C8102E 0%, #9A0D22 55%, #7A0C1F 100%)`, altura 48px, tracking `0.08em`, caixa alta “ENTRAR”, glow vermelho; focus ring `#C8102E` + offset 2px.
- **Secondary:** fundo `secondary`, texto `secondary-foreground`; **outline:** borda + `bg-card` hover `muted`; **ghost:** só hover `muted`; **destructive/success:** tokens semânticos.
- **Focus:** sempre `focus-visible:ring-2` no `ring` (ou `#C8102E` no auth); nunca outline do navegador cru sem anel de marca.

### Chips
- **Style:** pill `rounded-full`, `px-2 py-0.5`, `text-xs font-medium`.
- **State:** success (verde 15%), warning (âmbar 20% + texto amber), destructive (10%), muted “Vago”, default primary 12%; outline com borda.

### Cards / Containers
- **Corner Style:** `16px` (`rounded-2xl`); login shell `24px` (`rounded-3xl`); sheet inferior `24px` top only.
- **Background:** `card` (branco / dark `#15181F`); texto `card-foreground`.
- **Shadow Strategy:** `shadow-sm` no repouso (Elevation); login card usa sombra de marca.
- **Border:** 1px `border` em apps logados; login claro usa `stone-200/80`.
- **Internal Padding:** `16px` (`p-4`); header de card `16px` com pb menor.

### Inputs / Fields
- **Style:** borda 1px `input`, fundo `card`, raio `12px`, altura 44px (48px no login), `text-sm`/`text-base` no auth, ícone leading com `pl-10`, `shadow-sm` sutil.
- **Focus:** `ring-2 ring-ring` (app) ou `ring-[#C8102E]/45` (auth); sem glow colorido de fundo.
- **Error / Disabled:** texto `destructive` abaixo do campo; disabled `opacity-50`. Placeholder precisa de contraste ≥4.5:1 (não cinza-claro decorativo).
- **Label:** `Label` associado via `htmlFor`/`id`; `space-y-1.5` entre label e control.

### Navigation
- **Desktop:** aside fixa 256px; **topo com gradiente de marca** (`#C8102E → #A00F26 → #8C6239`) + ChurchMark em disco branco + wordmark tracking; itens `rounded-xl px-3 py-2.5 text-sm`; ativo `bg-primary/12 text-primary` + `shadow-sm`; inativo `muted-foreground` hover `muted`. Sair com hover `destructive`.
- **Mobile header:** sticky, `bg-card/90` + blur, borda inferior; ChurchMark 32px + wordmark; menu hambúrguer; avatar 36px round.
- **Mobile bottom:** fixed, `bg-card/95`, borda superior, safe-area; ícones 20px + label 11px; ativo `text-primary`.
- **Segmento (register Membro|Líder):** trilho `bg-stone-100`/`muted`, pill ativo branco/card + `shadow-sm`.

### Signature Component
- **BrandArt + ChurchMark:** painel de login com gradiente `#C8102E → #A00F26 → #8C6239`, blobs blur orgânicos, arcos bronze; ChurchMark SVG (cruz `#C8102E`, montes `#8C6239`/`#6B4A28`) em disco branco com sombra da marca. Mobile: faixa compacta no topo; desktop: coluna esquerda 5fr.
- **StatusBadge:** traduz `Schedule` em chip + rótulo (Vago/Pendente/Confirmado/Recusado).

## 6. Do's and Don'ts

### Do:
- **Do** responder “qual é o próximo passo?” em cada tela antes de decorar (PRODUCT.md princípio 1).
- **Do** usar alvos de toque ≥44px no mobile e manter ações do dia à altura do polegar.
- **Do** mostrar status com cor **e** texto; anel de foco visível em todo controle interativo.
- **Do** aplicar WCAG AA: corpo ≥4.5:1, placeholders inclusive; `prefers-reduced-motion` respeitado.
- **Do** usar o Vermelho Cruz (`#C8102E`) como `primary` em login **e** shell logado (nav, botões, foco); destrutivo em tom mais escuro nos dialogs.
- **Do** manter radius 12–16px em controles e cards; uma família sans; copy em português curta e gentil.
- **Do** pintar roles visíveis: ADMIN, LÍDER e MEMBRO veem só o que cabe, sem ler permissão como defeito.

### Don't:
- **Don't** cair no **SaaS cream genérico** (fundo bege quase branco + cards idênticos enfileirados + eyebrow cinza em caixa alta) — anti-reference do PRODUCT.md.
- **Don't** usar **glassmorphism decorativo** nem **gradient text** (`background-clip: text`).
- **Don't** imitar o **caos visual de corrente de WhatsApp / planilha colorida** que este app substitui: sem hierarquia não.
- **Don't** vestir **UI escura “ferramenta de desenvolvedor”** fora de lugar no contexto de igreja; dark mode é tema completo com os tokens `.dark`, não neon de IDE.
- **Don't** comunicar status só com cor; **Don't** colocar display/serif em label, botão ou dado; **Don't** reinventar scrollbars, controles ou modais non-standard.
- **Don't** usar `border-left`/`border-right` >1px como faixa colorida, **Don't** usar hero-metric template, **Don't** repetir grid de cards idênticos sem hierarquia.
- **Don't** copiar o glow do botão ENTRAR para botões de lista; **Don't** animação decorativa que não comunique estado (register product).
