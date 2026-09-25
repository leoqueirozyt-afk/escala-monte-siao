# Ícone do PWA com a foto da igreja — Design Spec

**Data:** 2026-09-25
**Status:** Aprovado pelo usuário
**Escopo:** Substituir os ícones do PWA (tela inicial, favicon, apple-touch-icon) pela foto do logo "Igreja Monte Sião — Fazendo Discípulos" enviada pelo usuário.

## Problema / Objetivo

O usuário enviou a foto oficial da igreja (`https://i.ibb.co/4gfSBn02/IMG-20250707-WA0422.jpg`, 1024×1024) e quer que ela seja "a foto do aplicativo". Restrição explícita: **a área de login não muda** (permanece com `ChurchMark` e o layout atual).

## Decisões aprovadas

1. **Somente o ícone do app** (opção A do brainstorm): o ícone do PWA passa a ser a foto. Dentro do app (cabeçalho/menu) o `ChurchMark` atual permanece.
2. **Tratamento com margem de segurança** (opção B): brasão reduzido a ~78% e centrado sobre fundo escuro `#20242e` (amostra do canto da própria foto), para a máscara do sistema (círculo/arredondado) nunca cortar o brasão.
3. **Abordagem 1:** gerar os PNGs estaticamente e substituir os arquivos — sem dependências novas, sem mudanças de código React.
4. **`theme_color` do manifest:** atualizar `#4f46e5` (indigo, sobra do design antigo) → `#C8102E` (vermelho da marca).

## Arquivos

| Arquivo | Ação |
|---|---|
| `public/icons/fonte.jpg` | **novo** — foto original 1024×1024 como fonte no repo |
| `public/icons/icon-192.png` | **substituir** — gerado da fonte com margem B, 192×192 |
| `public/icons/icon-512.png` | **substituir** — gerado da fonte com margem B, 512×512 |
| `public/manifest.webmanifest` | **editar** — `theme_color: #4f46e5` → `#C8102E` |

Nada mais muda: `index.html` já referencia `/icons/icon-192.png` em `<link rel="icon">` e `<link rel="apple-touch-icon">`; `manifest.webmanifest` já referencia os dois PNGs com `"purpose": "any maskable"` (margem já embutida no PNG).

## Geração dos PNGs (sem dependências)

PowerShell + `System.Drawing`:

1. Carregar `fonte.jpg` (1024×1024).
2. Criar bitmap quadrado (`size` = 192 ou 512) com fundo `#20242e`.
3. Desenhar a foto com `DrawImage` em retângulo `0.11*size` … `0.89*size` (≈78% do canvas, centrado), `CompositingMode.SourceCopy`/alta qualidade (`InterpolationMode.HighQualityBicubic`).
4. Salvar como PNG (`PixelFormat.Format32bppArgb`).

O comando exato fica documentado no plano de implementação (`docs/superpowers/plans/`) e no commit da troca dos arquivos.

## O que NÃO muda

- `src/pages/LoginPage.tsx` — intocado (restrição do usuário).
- `src/components/layout/AppShell.tsx` e `src/components/ChurchMark.tsx` — intocados.
- Nenhum código React/TypeScript é alterado.

## Verificação

1. `npm run build` — sucesso.
2. Conferir dimensões dos PNGs gerados (192×192 e 512×512) via `System.Drawing`.
3. Conferir que o manifest tem `theme_color #C8102E`.
4. Smoke estático: `icon-192.png`, `icon-512.png`, `manifest.webmanifest` servidos pelo dev server (HTTP 200).
5. **Teste manual do usuário:** adicionar à tela inicial no celular/PC e conferir o ícone novo. Aviso: navegadores podem cachear o favicon antigo — hard refresh/limpar cache pode ser necessário.

## Fora de escopo

- Trocar a logo no cabeçalho/menu do app (opção B do brainstorm — recusada).
- Qualquer mudança visual na tela de login.
- Script reproduzível de geração de ícones (abordagem 2 — recusada em favor da 1).
- Recolorir o `background_color` do manifest (`#f8f8fc` mantido — é a cor de fundo do app, não da foto).
