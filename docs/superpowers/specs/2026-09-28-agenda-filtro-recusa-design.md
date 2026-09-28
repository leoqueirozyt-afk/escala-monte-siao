# Spec — Minha Agenda: filtro de mês, botões após confirmação e aviso de recusa

**Data:** 2026-09-28 · **Status:** aprovado em conversa · **Escopo:** somente frontend (Abordagem 1, sem mudança de backend)

## Contexto

A aba **Minha Agenda** mostra todas as escalas do usuário. Hoje: botões "Confirmar/Recusar" só aparecem em status PENDENTE; depois de confirmar, só existe o botão de troca (individual). Não há filtro de período. Quando o voluntário precisa recusar, não há orientação sobre como avisar o líder.

## Decisões do usuário (brainstorming)

1. Filtro: **"Todas" | "Este mês"**, começando em **"Este mês"** (mês calendário atual).
2. Escala de grupo: **sem botão de troca** (mantém decisão da feature anterior); só "Recusar".
3. Escopo do aviso: **qualquer escala recusada** (individual ou grupo, pendente ou confirmada).
4. Aviso: **texto puro** — sem link/redirecionamento para WhatsApp, sem expor telefone.
5. Depois de recusar: **definitivo** — não há botão para voltar atrás (não renasce "Confirmar").
6. Aviso aparece **somente dentro do diálogo** de confirmação e some ao clicar "Entendi"; o card recusado mostra apenas o badge.

## Requisitos

### R1 — Filtro de mês (AgendaPage)

- Controle segmentado **`Este mês` | `Todas`** no topo da aba (junto ao título).
- Padrão ao abrir a aba: **"Este mês"**.
- "Este mês" filtra por `event_date` no mês calendário corrente (local), aplicando-se às duas seções (Próximas e Anteriores).
- "Todas" = comportamento atual (sem filtro).
- Filtro é estado do componente (`useState`): ao navegar para outra aba e voltar, volta ao padrão "Este mês".
- Filtragem **client-side** sobre a lista já carregada — sem refetch, sem parâmetro na API.

### R2 — Botões por status (somente escalas futuras)

| Status | Individual | Grupo |
|---|---|---|
| PENDENTE | Confirmar · Recusar · Solicitar troca | Confirmar · Recusar |
| CONFIRMED | **Solicitar troca** · **Recusar** (novos) | **Recusar** (novo) |
| DECLINED | nenhum (só badge "Recusado") | nenhum (só badge "Recusado") |

- Escalas passadas: sem botões (comportamento atual mantido).
- "Solicitar troca": diálogo de troca **já existente**, inalterado; continua restrito a individual (`!s.group`).
- "Recusar" em CONFIRMED usa o mesmo endpoint de respond de hoje (individual ou de grupo) — o backend já aceita a troca de status sem guarda de status anterior.
- "Confirmar" em DECLINED **não** existe (regra 5).

### R3 — Fluxo de recusa (Dialog em dois passos)

1. Clique em **Recusar** → diálogo (`Dialog` já usado na página):
   - Título: **"Tem certeza?"**
   - Texto: "Você não poderá participar deste culto."
   - Ações: **Voltar** (fecha sem alterar) · **Recusar** (confirma).
2. Confirmação → `POST /schedules/:id/respond {status:"DECLINED"}` (o mesmo endpoint serve individual e grupo) → **na mesma janela**, conteúdo do diálogo vira:
   - Título: **"Escala recusada"**
   - Caixa de aviso (amarela): *"Avise o líder no WhatsApp o motivo de não poder participar."*
   - Ação: **Entendi** → fecha o diálogo.
3. Após fechar: card com badge "Recusado", **nenhum botão**, **sem nota permanente** (decisão 6).
4. Falha da API → diálogo permanece aberto no passo 1 com a mensagem de erro (padrão dos demais diálogos da página). Nenhuma alteração local de estado antes do sucesso.

## Fora de escopo

- Troca de vagas em grupo (backend/fluxo de aprovação).
- Link de WhatsApp, telefones de líderes, ou qualquer exposição de contato.
- Endpoint/novo campo de API — **zero mudança de backend, migration ou push**.
- Reverter recusa (re-confirmar).
- Filtro por mês escolhido (dropdown de meses).

## Arquitetura e fluxo de dados

- Único arquivo alterado: **`src/pages/AgendaPage.tsx`**.
  - Novo estado: `period: "month" | "all"` (padrão `"month"`), UI segmentada com as classes já usadas na página.
  - `renderCard`: condições de botões conforme R2; estado `recuse` (id da escala + passo `confirm` | `notice`).
  - Handlers reutilizam os mesmos `respond`/`openSwap` existentes; `reload()` após sucesso (padrão atual).
- Seções "Próximas"/"Anteriores" passam a derivar da lista já filtrada.
- Nenhum toque em `server/`, `shared/`, migrations ou código de push.

## Erros e estados

- API de recusa falha: diálogo aberto no passo 1 + mensagem (estado de loading no botão, padrão da página).
- Lista vazia após filtro: com filtro "Este mês" ativo, a mensagem de vazio passa a ser "Nenhuma escala este mês"; com "Todas", mantém o texto atual.
- Recusa repetida/race: card já DECLINED não mostra botão; requisições seguem o padrão `reload()` existente.

## Testes e verificação

1. **Smoke novo** (`%TEMP%\opencode\smoke-agenda-recusa.mjs`, independente dos demais): transições de status via API — confirmar → recusar (individual e grupo), com verificação em `GET /schedules/my`; regressão com os 12 smokes existentes.
2. **DOM check** headless (padrão CDP, porta 9335): segmentado presente e padrão "Este mês", filtro esconde/mostra, botões em CONFIRMED (individual e grupo), diálogo "Tem certeza?" + aviso do WhatsApp, card DECLINED sem botões.
3. **Verificação padrão:** `npm run typecheck`, `npm run build`, detector impeccable (exit 0).

## Critérios de aceite

- [x] Aba abre em "Este mês"; alternar "Todas" mostra tudo, sem refetch.
- [x] Escala futura CONFIRMED individual: botões "Solicitar troca" e "Recusar".
- [x] Escala futura CONFIRMED de grupo: botão "Recusar"; nunca "Solicitar troca".
- [x] Recusar (qualquer status futuro) → "Tem certeza?" → confirma → aviso do WhatsApp → "Entendi" → badge "Recusado" sem botões.
- [x] Recusado não oferece caminho de volta.
- [x] Falha de API mantém diálogo aberto com erro.
- [x] Typecheck/build/detector/smokes verdes; nenhum arquivo de backend tocado.
