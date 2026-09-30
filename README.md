# Escala Monte Sião

PWA mobile-first para gestão de escalas de voluntários da Igreja Monte Sião. Substitui a planilha e a corrente de WhatsApp: o voluntário vê e confirma suas escalas pelo celular, o líder escala o próprio ministério e o ADMIN aprova líderes e define ministérios.

## Funcionalidades

- **Escala por evento** — funções, vagas e atribuição individual ou por grupo de voz, com status sempre legível (Pendente, Confirmado, Recusado, Vago)
- **Minha Agenda** — filtro "Este mês | Todas", confirmação de presença, recusa com confirmação e aviso para avisar o líder, solicitar troca de vaga e "Time do culto" de cada evento
- **Ministérios e líderes** — múltiplos líderes por ministério, funções, membros e aprovação de novos líderes pelo ADMIN
- **Grupos de voz** — formação de grupos por voz e classificação de presença (voz ativa, contenção, afastada)
- **Trocas aprovadas por líder** — voluntário pede, o líder aprova ou escolhe outro voluntário
- **Playlist de louvor** — setlist com níveis por função
- **Avisos internos** — comunicação do ADMIN para os voluntários dentro do app
- **Notificações push** e **PWA instalável** — funciona como aplicativo no celular
- **Relatórios de participação** — confirmações, faltas e vagas em aberto
- **Perfis** — avatar, telefone formatado e histórico de remoções justificadas

## Stack

- **Frontend:** React 19 · TypeScript · Vite · Tailwind CSS v4 · Radix/base-ui
- **Backend:** Hono em Cloudflare Workers · D1 (SQLite) · Web Push (VAPID)
- **Deploy:** Cloudflare Workers

## Estrutura

```
src/         Frontend React (páginas, componentes, estilo)
server/      API Hono (rotas, autenticação, push)
shared/      Tipos compartilhados entre front e back
migrations/  Esquema do banco D1 (SQL)
public/      Ícones, manifest e service worker
```

## Rodando local

Requisitos: Node.js 24+ e npm.

```bash
npm install          # dependências
npm run db:apply     # aplica as migrations no D1 local
npm run dev          # dev server em http://localhost:5173
```

Contas seed de desenvolvimento (criadas pelas migrations):

| E-mail | Perfil |
|---|---|
| `admin@montesiao.org` | ADMIN |
| `carlos@montesiao.org` | Líder (Louvor) |
| `ana@montesiao.org` | Líder (Mídia) |

Senha local: `senha123` (apenas desenvolvimento).

Comandos úteis:

```bash
npm run typecheck    # checagem de tipos
npm run build        # build completo (tsc + vite)
```
