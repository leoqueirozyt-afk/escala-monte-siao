# Ícone do PWA com a foto da igreja — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir os ícones do PWA (`icon-192.png`/`icon-512.png`) pela foto do logo da igreja com margem de segurança, e atualizar `theme_color` do manifest para `#C8102E` — sem tocar em nenhum código React (login e cabeçalho intocados).

**Architecture:** Foto fonte (1024×1024) fica em `public/icons/fonte.jpg`; os dois PNGs são gerados via PowerShell + `System.Drawing` (brasão a ~78% centrado sobre fundo `#20242e`), substituindo os arquivos existentes que `index.html`/`manifest` já referenciam.

**Tech Stack:** PowerShell 5.1 + `System.Drawing` (sem dependências novas), Vite/PWA existente.

**Conventions:** sem framework de testes — verificação = `npm run build` + checagem de dimensões dos PNGs + smoke HTTP dos ícones. Spec: `docs/superpowers/specs/2026-09-25-icone-pwa-foto-design.md`.

---

### Task 1: Foto fonte no repo

**Files:**
- Create: `public/icons/fonte.jpg`

- [ ] **Step 1: Baixar a foto para `public/icons/fonte.jpg`**

Run:
```powershell
curl.exe -L --max-time 60 -o "public\icons\fonte.jpg" "https://i.ibb.co/4gfSBn02/IMG-20250707-WA0422.jpg"
Add-Type -AssemblyName System.Drawing
[System.Drawing.Image]::FromFile((Resolve-Path "public\icons\fonte.jpg")).Size
```
Expected: arquivo com ~134.221 bytes; `Size` = `Width=1024, Height=1024`

- [ ] **Step 2: Commit**

```bash
git add public/icons/fonte.jpg
git commit -m "Add church photo as PWA icon source"
```

---

### Task 2: Gerar os PNGs dos ícones

**Files:**
- Replace: `public/icons/icon-192.png`
- Replace: `public/icons/icon-512.png`

- [ ] **Step 1: Script de geração — salve como `%TEMP%\opencode\gen-icons.ps1`**

```powershell
Add-Type -AssemblyName System.Drawing

$src = Resolve-Path "public\icons\fonte.jpg"
$bg = [System.Drawing.Color]::FromArgb(255, 0x20, 0x24, 0x2E)

foreach ($size in @(192, 512)) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear($bg)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $img = [System.Drawing.Image]::FromFile($src)
  $m = [int]([math]::Round($size * 0.11))
  $d = $size - 2 * $m
  $g.DrawImage($img, $m, $m, $d, $d)
  $g.Dispose()
  $out = Join-Path (Get-Location) "public\icons\icon-$size.png"
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $img.Dispose()
  Write-Output "gerado icon-$size.png ($d px brasão, margem $m px)"
}
```

- [ ] **Step 2: Executar**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\opencode\gen-icons.ps1"`
Expected: `gerado icon-192.png (170 px brasão, margem 11 px)` e `gerado icon-512.png (450 px brasão, margem 31 px)`

- [ ] **Step 3: Verificar dimensões**

Run:
```powershell
Add-Type -AssemblyName System.Drawing
[System.Drawing.Image]::FromFile((Resolve-Path "public\icons\icon-192.png")).Size
[System.Drawing.Image]::FromFile((Resolve-Path "public\icons\icon-512.png")).Size
Get-ChildItem public\icons | Select-Object Name, Length
```
Expected: `192x192` e `512x512`; PNGs > 20 KB cada (imagem real, não placeholder)

- [ ] **Step 4: Commit**

```bash
git add public/icons/icon-192.png public/icons/icon-512.png
git commit -m "Replace PWA icons with church photo (safe-zone margin)"
```

---

### Task 3: theme_color do manifest

**Files:**
- Modify: `public/manifest.webmanifest:8`

- [ ] **Step 1: Trocar theme_color**

Em `public/manifest.webmanifest`, trocar:
```json
  "theme_color": "#4f46e5",
```
Por:
```json
  "theme_color": "#C8102E",
```

- [ ] **Step 2: Commit**

```bash
git add public/manifest.webmanifest
git commit -m "Update manifest theme_color to brand red"
```

---

### Task 4: Verificação, push e deploy

**Files:** nenhum novo

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: sucesso (gera `dist/`)

- [ ] **Step 2: Smoke HTTP dos ícones no dev server**

Garantir dev server no ar (`http://localhost:5173/api/health` → `{"ok":true}`; se não, `Start-Process cmd -ArgumentList "/c npm run dev > %TEMP%\opencode\vite-dev.log 2>&1"` e aguardar 8s).

Run:
```powershell
foreach ($u in "/icons/icon-192.png","/icons/icon-512.png","/manifest.webmanifest") {
  $r = Invoke-WebRequest -Uri "http://localhost:5173$u" -UseBasicParsing
  "$u -> $($r.StatusCode) $($r.RawContentLength) bytes"
}
```
Expected: 3 linhas com `200` e tamanhos > 0 (manifest contendo `#C8102E`)

- [ ] **Step 3: Push + deploy**

```bash
git push origin main
gh run list --limit 1
gh run watch <run-id> --exit-status
```
Expected: run verde

- [ ] **Step 4: Smoke pós-deploy (produção)**

Run:
```powershell
foreach ($u in "/icons/icon-192.png","/icons/icon-512.png","/manifest.webmanifest") {
  $r = Invoke-WebRequest -Uri "https://escala-monte-siao.leoqueirozyt.workers.dev$u" -UseBasicParsing
  "$u -> $($r.StatusCode) $($r.RawContentLength) bytes"
}
```
Expected: 3× `200`

- [ ] **Step 5: Teste manual do usuário**

Pedir para o usuário abrir o app, fazer hard refresh (Ctrl+Shift+R) e conferir o favicon novo; no celular, reabrir/adicinar à tela inicial. Aviso: cache de favicon pode mostrar a imagem antiga por alguns minutos.

Expected: ícone da igreja visível

---

## Self-Review (após escrita)

- **Spec coverage:** fonte no repo (T1) ✓; PNGs margem B 78%/`#20242e` (T2) ✓; theme_color (T3) ✓; sem código React (nenhuma task toca `src/`) ✓; verificação build+dimensões+smoke+manual (T4) ✓.
- **Placeholders:** nenhum — script de geração completo, comandos exatos com saída esperada.
- **Type consistency:** N/A (sem código TS novo); variáveis do script definidas no Step 1 e usadas no mesmo bloco.
