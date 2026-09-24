# Playlist do Ministério de Louvor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playlist de músicas por culto do ministério Louvor — líder cria/edita (título, tom, link YouTube, observação), membros visualizam e reproduzem no player embutido.

**Architecture:** Migration D1 com `playlists` (1:1 com `events` via UNIQUE) + `playlist_songs`; rotas Hono em `/api/playlists` com guarda de ministério Louvor (id 1); página React com lista/detalhe/player/edição, item de menu condicional no AppShell.

**Tech Stack:** Cloudflare Workers (Hono + D1), React 19 + Vite + Tailwind v4, UI shadcn-style local (`src/components/ui`), lucide-react.

**Conventions deste repo:** sem framework de testes unitários — verificação = `npm run typecheck` + `npm run build` + detector impeccable + smoke manual (script Node com fetch) contra o dev server. Specs aprovadas: `docs/superpowers/specs/2026-09-24-playlist-louvor-design.md`.

---

### Task 1: Migration 0004 + tipos/util compartilhados

**Files:**
- Create: `migrations/0004_playlist_louvor.sql`
- Create: `shared/youtube.ts`
- Modify: `shared/types.ts` (adicionar ao final)

- [ ] **Step 1: Criar a migration**

```sql
CREATE TABLE playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL UNIQUE,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE playlist_songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  key TEXT,
  youtube_url TEXT NOT NULL,
  note TEXT,
  position INTEGER NOT NULL,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

CREATE INDEX idx_playlists_event ON playlists(event_id);
CREATE INDEX idx_playlist_songs_playlist ON playlist_songs(playlist_id, position);
```

- [ ] **Step 2: Criar `shared/youtube.ts`**

```ts
const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export function extractYouTubeId(url: string): string | null {
  const match = url.match(YOUTUBE_RE);
  return match ? match[1] : null;
}

export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeId(url) !== null;
}
```

- [ ] **Step 3: Adicionar tipos ao final de `shared/types.ts`**

```ts
export interface PlaylistSummary {
  id: number;
  event_id: number;
  created_at: string;
  title: string;
  event_date: string;
  location: string | null;
  song_count: number;
}

export interface PlaylistEvent {
  id: number;
  title: string;
  event_date: string;
  location: string | null;
}

export interface PlaylistSong {
  id: number;
  playlist_id: number;
  title: string;
  key: string | null;
  youtube_url: string;
  note: string | null;
  position: number;
}

export interface PlaylistDetail {
  event: PlaylistEvent;
  playlist: { id: number; event_id: number; created_by: number; created_at: string } | null;
  songs: PlaylistSong[];
}
```

- [ ] **Step 4: Aplicar migration local e verificar typecheck**

Run: `npm run db:apply`
Expected: aplica `0004_playlist_louvor.sql` (output do wrangler com "success")

Run: `npm run typecheck`
Expected: sem erros (exit 0)

- [ ] **Step 5: Commit**

```bash
git add migrations/0004_playlist_louvor.sql shared/youtube.ts shared/types.ts
git commit -m "Add playlist tables migration, YouTube helper and shared types"
```

---

### Task 2: API `/api/playlists`

**Files:**
- Create: `server/routes/playlists.ts`
- Modify: `server/index.ts` (import + montagem)

- [ ] **Step 1: Criar `server/routes/playlists.ts`**

```ts
import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { requireAuth, type AppVariables } from "../lib/auth.js";
import type { JwtPayload } from "../lib/jwt.js";
import { isValidYouTubeUrl } from "../../shared/youtube.js";

const LOUVOR_MINISTRY_ID = 1;
const HISTORY_DAYS = 14;

export const playlistRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

playlistRoutes.use("*", requireAuth);

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function canView(db: D1Database, user: JwtPayload): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  const member = await db
    .prepare(
      "SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.ministry_id = ?",
    )
    .bind(user.sub, LOUVOR_MINISTRY_ID)
    .first();
  if (member) return true;
  if (user.role !== "LEADER") return false;
  const led = await db
    .prepare("SELECT 1 FROM ministries WHERE id = ? AND leader_id = ?")
    .bind(LOUVOR_MINISTRY_ID, user.sub)
    .first();
  return !!led;
}

async function canManage(db: D1Database, user: JwtPayload): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (user.role !== "LEADER") return false;
  const led = await db
    .prepare("SELECT 1 FROM ministries WHERE id = ? AND leader_id = ?")
    .bind(LOUVOR_MINISTRY_ID, user.sub)
    .first();
  return !!led;
}

playlistRoutes.get("/", async (c) => {
  const user = c.get("user");
  if (!(await canView(c.env.DB, user))) return c.json({ error: "Sem permissão" }, 403);
  await c.env.DB.prepare(`DELETE FROM playlists WHERE created_at < datetime('now', '-${HISTORY_DAYS} days')`).run();
  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.event_id, p.created_at, e.title, e.event_date, e.location,
       (SELECT COUNT(*) FROM playlist_songs s WHERE s.playlist_id = p.id) AS song_count
     FROM playlists p JOIN events e ON e.id = p.event_id
     ORDER BY e.event_date ASC`,
  ).all();
  return c.json(rows.results);
});

playlistRoutes.get("/:eventId", async (c) => {
  const user = c.get("user");
  if (!(await canView(c.env.DB, user))) return c.json({ error: "Sem permissão" }, 403);
  const eventId = Number(c.req.param("eventId"));
  const event = await c.env.DB.prepare("SELECT id, title, event_date, location FROM events WHERE id = ?")
    .bind(eventId)
    .first();
  if (!event) return c.json({ error: "Culto não encontrado" }, 404);
  const playlist = await c.env.DB.prepare(
    "SELECT id, event_id, created_by, created_at FROM playlists WHERE event_id = ?",
  )
    .bind(eventId)
    .first();
  if (!playlist) return c.json({ event, playlist: null, songs: [] });
  const songs = await c.env.DB.prepare(
    "SELECT * FROM playlist_songs WHERE playlist_id = ? ORDER BY position ASC",
  )
    .bind(Number(playlist.id))
    .all();
  return c.json({ event, playlist, songs: songs.results });
});

playlistRoutes.put("/:eventId", async (c) => {
  const user = c.get("user");
  if (!(await canManage(c.env.DB, user))) return c.json({ error: "Sem permissão" }, 403);
  const eventId = Number(c.req.param("eventId"));
  const event = await c.env.DB.prepare("SELECT id, event_date FROM events WHERE id = ?")
    .bind(eventId)
    .first<any>();
  if (!event) return c.json({ error: "Culto não encontrado" }, 404);
  if (String(event.event_date).slice(0, 10) < todayISO()) {
    return c.json({ error: "Playlist de culto passado é somente leitura" }, 400);
  }
  const body = await c.req.json().catch(() => ({}));
  const songs = Array.isArray((body as any).songs) ? (body as any).songs : [];
  if (songs.length === 0) return c.json({ error: "Adicione pelo menos 1 música" }, 400);
  for (const s of songs) {
    if (!s.title || !String(s.title).trim()) return c.json({ error: "Título da música obrigatório" }, 400);
    if (!s.youtube_url || !isValidYouTubeUrl(String(s.youtube_url))) {
      return c.json({ error: "Link do YouTube inválido" }, 400);
    }
  }
  const existing = await c.env.DB.prepare("SELECT id FROM playlists WHERE event_id = ?")
    .bind(eventId)
    .first<any>();
  let playlistId: number;
  if (existing) {
    playlistId = Number(existing.id);
    await c.env.DB.prepare("DELETE FROM playlist_songs WHERE playlist_id = ?").bind(playlistId).run();
  } else {
    const r = await c.env.DB.prepare("INSERT INTO playlists (event_id, created_by) VALUES (?, ?)")
      .bind(eventId, user.sub)
      .run();
    playlistId = Number(r.meta.last_row_id);
  }
  const inserts = songs.map((s: any, i: number) =>
    c.env.DB.prepare(
      "INSERT INTO playlist_songs (playlist_id, title, key, youtube_url, note, position) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      playlistId,
      String(s.title).trim(),
      s.key ? String(s.key).trim() : null,
      String(s.youtube_url).trim(),
      s.note ? String(s.note).trim() : null,
      i,
    ),
  );
  await c.env.DB.batch(inserts);
  return c.json({ id: playlistId, ok: true });
});

playlistRoutes.delete("/:eventId", async (c) => {
  const user = c.get("user");
  if (!(await canManage(c.env.DB, user))) return c.json({ error: "Sem permissão" }, 403);
  const eventId = Number(c.req.param("eventId"));
  const event = await c.env.DB.prepare("SELECT id, event_date FROM events WHERE id = ?")
    .bind(eventId)
    .first<any>();
  if (!event) return c.json({ error: "Culto não encontrado" }, 404);
  if (String(event.event_date).slice(0, 10) < todayISO()) {
    return c.json({ error: "Playlist de culto passado é somente leitura" }, 400);
  }
  await c.env.DB.prepare("DELETE FROM playlists WHERE event_id = ?").bind(eventId).run();
  return c.json({ ok: true });
});
```

- [ ] **Step 2: Montar rota em `server/index.ts`**

Adicionar import após os demais:

```ts
import { playlistRoutes } from "./routes/playlists.js";
```

Adicionar montagem após `app.route("/api/reports", reportRoutes);`:

```ts
app.route("/api/playlists", playlistRoutes);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, sem erros

- [ ] **Step 4: Commit**

```bash
git add server/routes/playlists.ts server/index.ts
git commit -m "Add playlists API with Louvor ministry guard and lazy history cleanup"
```

---

### Task 3: Página de lista + rota + menu condicional

**Files:**
- Create: `src/pages/PlaylistsPage.tsx`
- Modify: `src/App.tsx` (guard `LouvorOnly` + rota `/playlists`)
- Modify: `src/components/layout/AppShell.tsx` (item "Playlist")

- [ ] **Step 1: Criar `src/pages/PlaylistsPage.tsx` (lista)**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ListMusic, Plus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, toISODate } from "../lib/utils";
import { useAsyncData } from "../lib/use-async-data";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Dialog } from "../components/ui/dialog";
import { ErrorState, EmptyState, ListSkeleton } from "../components/ui/load-state";
import type { EventItem, PlaylistSummary } from "../../shared/types";

export function PlaylistsPage() {
  const { user, ministries } = useAuth();
  const navigate = useNavigate();
  const canManage =
    user?.role === "ADMIN" || (user?.role === "LEADER" && ministries.some((m) => m.name === "Louvor"));
  const {
    data: playlists = [],
    status,
    error,
    reload,
  } = useAsyncData<PlaylistSummary[]>(() => api.get<PlaylistSummary[]>("/playlists"), []);
  const [pickOpen, setPickOpen] = useState(false);
  const { data: events = [] } = useAsyncData<EventItem[]>(() =>
    pickOpen
      ? api.get<EventItem[]>(`/events?from=${toISODate(new Date())}`)
      : Promise.resolve([]), [pickOpen]);

  const today = toISODate(new Date());
  const nextId = playlists.find((p) => p.event_date.slice(0, 10) >= today)?.id;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <ListMusic size={20} /> Playlist do Louvor
          </h1>
          <p className="text-sm text-muted-foreground">Músicas de cada culto, atualizadas pelo líder</p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setPickOpen(true)}>
            <Plus size={16} /> Novo
          </Button>
        )}
      </div>

      {status === "error" && error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : status === "loading" ? (
        <ListSkeleton rows={3} />
      ) : playlists.length === 0 ? (
        <EmptyState
          title="Nenhuma playlist cadastrada"
          hint="As playlists dos próximos cultos aparecerão aqui."
        />
      ) : (
        playlists.map((p) => {
          const past = p.event_date.slice(0, 10) < today;
          return (
            <Card key={p.id} className={past ? "opacity-60" : p.id === nextId ? "border-primary" : undefined}>
              <CardContent className="p-4">
                <button
                  onClick={() => navigate(`/playlists/${p.event_id}`)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div>
                    <p className="font-semibold">{p.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(p.event_date)}
                      {p.location ? ` · ${p.location}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {p.id === nextId && <Badge>Próximo culto</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {p.song_count} música{p.song_count === 1 ? "" : "s"}
                    </span>
                  </div>
                </button>
              </CardContent>
            </Card>
          );
        })
      )}

      <Dialog open={pickOpen} onClose={() => setPickOpen(false)} title="Escolher culto">
        <div className="space-y-2">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum culto futuro encontrado.</p>
          ) : (
            events.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  setPickOpen(false);
                  navigate(`/playlists/${e.id}`);
                }}
                className="flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm hover:bg-muted"
              >
                <span className="font-medium">{e.title}</span>
                <span className="text-muted-foreground">{formatDate(e.event_date)}</span>
              </button>
            ))
          )}
        </div>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Guard `LouvorOnly` + rota em `src/App.tsx`**

Adicionar import (junto aos demais imports de páginas):

```tsx
import { PlaylistsPage } from "./pages/PlaylistsPage";
```

Adicionar guard após `AdminOnly`:

```tsx
function LouvorOnly({ children }: { children: React.ReactNode }) {
  const { user, loading, ministries } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  const allowed = user.role === "ADMIN" || ministries.some((m) => m.name === "Louvor");
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

Adicionar rota interna (antes de `<Route path="*">`):

```tsx
<Route
  path="/playlists"
  element={
    <LouvorOnly>
      <PlaylistsPage />
    </LouvorOnly>
  }
/>
```

- [ ] **Step 3: Item de menu em `src/components/layout/AppShell.tsx`**

Adicionar `ListMusic` ao import do lucide-react:

```tsx
  Handshake,
  ListMusic,
  Menu,
```

Após `const adminNav = ...` adicionar:

```tsx
const showPlaylist = user?.role === "ADMIN" || ministries.some((m) => m.name === "Louvor");
const playlistNav = showPlaylist ? [{ to: "/playlists", label: "Playlist", icon: ListMusic }] : [];
```

Obs.: `ministries` já vem de `useAuth()` na linha 37 (`const { user, logout, ministries } = useAuth();`).

No `desktopNav` de líder, inserir `...playlistNav,` antes de `{ to: "/perfil", label: "Perfil", icon: UserIcon }`:

```tsx
  const desktopNav = leader
    ? [
        { to: "/", label: "Início", icon: Home },
        { to: "/agenda", label: "Minha Agenda", icon: ClipboardList },
        { to: "/calendario", label: "Indisponibilidade", icon: CalendarOff },
        ...leaderNav,
        ...(admin ? adminNav : []),
        ...playlistNav,
        { to: "/perfil", label: "Perfil", icon: UserIcon },
      ]
    : [...volunteerNav.slice(0, 3), ...playlistNav, volunteerNav[3]];
```

No `bottomNav`, inserir também (mobile):

```tsx
  const bottomNav = leader
    ? [
        { to: "/", label: "Início", icon: Home },
        { to: "/agenda", label: "Agenda", icon: ClipboardList },
        { to: "/escala", label: "Escala", icon: CalendarDays },
        ...playlistNav,
        { to: "/perfil", label: "Perfil", icon: UserIcon },
      ]
    : [...volunteerNav.slice(0, 3), ...playlistNav, volunteerNav[3]];
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck`
Expected: exit 0

Run: `npm run build`
Expected: build concluído sem erros

- [ ] **Step 5: Commit**

```bash
git add src/pages/PlaylistsPage.tsx src/App.tsx src/components/layout/AppShell.tsx
git commit -m "Add playlists list page, route guard and conditional menu entry"
```

---

### Task 4: Página de detalhe com player e editor

**Files:**
- Create: `src/pages/PlaylistDetailPage.tsx`
- Modify: `src/App.tsx` (rota `/playlists/:eventId`)

- [ ] **Step 1: Criar `src/pages/PlaylistDetailPage.tsx`**

```tsx
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowDown, ArrowUp, ExternalLink, ListMusic, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, toISODate } from "../lib/utils";
import { useAsyncData } from "../lib/use-async-data";
import { extractYouTubeId } from "../../shared/youtube";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input, Field } from "../components/ui/input";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { toast } from "../components/ui/toast";
import { ErrorState, EmptyState, ListSkeleton } from "../components/ui/load-state";
import type { PlaylistDetail, PlaylistSong } from "../../shared/types";

interface DraftSong {
  title: string;
  key: string;
  youtube_url: string;
  note: string;
}

const emptyDraft: DraftSong = { title: "", key: "", youtube_url: "", note: "" };

export function PlaylistDetailPage() {
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const { user, ministries } = useAuth();
  const canManage =
    user?.role === "ADMIN" || (user?.role === "LEADER" && ministries.some((m) => m.name === "Louvor"));
  const { data, status, error, reload } = useAsyncData<PlaylistDetail>(
    () => api.get<PlaylistDetail>(`/playlists/${eventId}`),
    [eventId],
  );

  const [activeIdx, setActiveIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<DraftSong[]>([]);
  const [form, setForm] = useState<DraftSong>(emptyDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (status === "loading") return <ListSkeleton rows={4} />;
  if (status === "error" && error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <ErrorState message="Playlist não encontrada" onRetry={reload} />;

  const { event, playlist, songs } = data;
  const past = event.event_date.slice(0, 10) < toISODate(new Date());
  const canEdit = canManage && !past;
  const activeSong: PlaylistSong | undefined = songs[activeIdx] ?? songs[0];
  const activeId = activeSong ? extractYouTubeId(activeSong.youtube_url) : null;

  const startEdit = () => {
    setDrafts(
      songs.map((s) => ({
        title: s.title,
        key: s.key ?? "",
        youtube_url: s.youtube_url,
        note: s.note ?? "",
      })),
    );
    setFormError(null);
    setEditing(true);
  };

  const move = (i: number, dir: -1 | 1) => {
    setDrafts((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
      return copy;
    });
  };

  const addSong = () => {
    if (!form.title.trim()) {
      setFormError("Informe o título da música");
      return;
    }
    if (!extractYouTubeId(form.youtube_url)) {
      setFormError("Link do YouTube inválido");
      return;
    }
    setDrafts((list) => [...list, { ...form }]);
    setForm(emptyDraft);
    setFormError(null);
  };

  const save = async () => {
    if (drafts.length === 0) {
      setFormError("Adicione pelo menos 1 música");
      return;
    }
    setBusy(true);
    try {
      await api.put(`/playlists/${eventId}`, { songs: drafts });
      toast("Playlist salva!");
      setEditing(false);
      setActiveIdx(0);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao salvar", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/playlists/${eventId}`);
      toast("Playlist removida");
      navigate("/playlists");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao remover", "error");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <button
            onClick={() => navigate("/playlists")}
            className="mb-1 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} /> Voltar
          </button>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <ListMusic size={20} /> {event.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(event.event_date)}
            {event.location ? ` · ${event.location}` : ""}
            {past ? " · passado" : ""}
          </p>
        </div>
        {!editing && canEdit && playlist && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={startEdit}>
              <Pencil size={14} /> Editar
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} />
            </Button>
          </div>
        )}
      </div>

      {!playlist && !editing && (
        <EmptyState
          title="Sem playlist para este culto"
          hint={canEdit ? "Crie a playlist com as músicas do culto." : "O líder ainda não cadastrou as músicas."}
        />
      )}

      {!playlist && editing && (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Nova playlist — adicione as músicas abaixo e salve.
        </div>
      )}

      {!editing && activeId && (
        <div className="space-y-2">
          <div className="aspect-video w-full overflow-hidden rounded-xl border bg-black">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${activeId}`}
              title={activeSong?.title ?? "Vídeo do YouTube"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <a
            href={`https://www.youtube.com/watch?v=${activeId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <ExternalLink size={14} /> Abrir no YouTube
          </a>
        </div>
      )}

      {!editing && playlist && songs.length > 0 && (
        <div className="space-y-2">
          {songs.map((s, i) => (
            <div
              key={s.id}
              className={`flex items-center gap-3 rounded-xl border p-3 ${i === activeIdx ? "border-primary bg-primary/5" : "bg-card"}`}
            >
              <span className="w-5 text-center text-sm text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.title}</p>
                {s.note && <p className="truncate text-xs text-muted-foreground">{s.note}</p>}
              </div>
              {s.key && <Badge>{s.key}</Badge>}
              <Button size="sm" variant={i === activeIdx ? "default" : "outline"} onClick={() => setActiveIdx(i)}>
                <Play size={14} /> Tocar
              </Button>
            </div>
          ))}
        </div>
      )}

      {!editing && playlist && songs.length === 0 && (
        <EmptyState title="Playlist vazia" hint="Nenhuma música cadastrada." />
      )}

      {editing && (
        <div className="space-y-4">
          {drafts.map((d, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border bg-card p-3">
              <span className="w-5 text-center text-sm text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{d.title}</p>
                <p className="truncate text-xs text-muted-foreground">{d.note || d.youtube_url}</p>
              </div>
              {d.key && <Badge>{d.key}</Badge>}
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Subir música"
                className="rounded-md border p-1.5 disabled:opacity-30"
              >
                <ArrowUp size={14} />
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === drafts.length - 1}
                aria-label="Descer música"
                className="rounded-md border p-1.5 disabled:opacity-30"
              >
                <ArrowDown size={14} />
              </button>
              <button
                onClick={() => setDrafts((l) => l.filter((_, j) => j !== i))}
                aria-label="Remover música"
                className="rounded-md border p-1.5 text-destructive"
              >
                <X size={14} />
              </button>
            </div>
          ))}

          <div className="space-y-3 rounded-xl border p-4">
            <p className="text-sm font-semibold">Adicionar música</p>
            <Field label="Título">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex.: Aquieta Minh'alma"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tom">
                <Input
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  placeholder="G, Am..."
                />
              </Field>
              <Field label="Observação">
                <Input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="opcional"
                />
              </Field>
            </div>
            <Field label="Link do YouTube">
              <Input
                value={form.youtube_url}
                onChange={(e) => setForm({ ...form, youtube_url: e.target.value })}
                placeholder="https://youtu.be/..."
              />
            </Field>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <Button variant="outline" onClick={addSong}>
              <Plus size={16} /> Adicionar à playlist
            </Button>
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={save} disabled={busy}>
              {busy ? "Salvando..." : "Salvar playlist"}
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {!playlist && !editing && canEdit && (
        <Button onClick={startEdit}>
          <Plus size={16} /> Criar playlist
        </Button>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Remover playlist"
        description={`Remover a playlist de "${event.title}"? As músicas serão apagadas.`}
        confirmLabel="Remover"
        destructive
        busy={busy}
        onConfirm={remove}
        onClose={() => !busy && setConfirmDelete(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Rota em `src/App.tsx`**

Adicionar import:

```tsx
import { PlaylistDetailPage } from "./pages/PlaylistDetailPage";
```

Adicionar rota (junto à rota `/playlists`, antes de `<Route path="*">`):

```tsx
<Route
  path="/playlists/:eventId"
  element={
    <LouvorOnly>
      <PlaylistDetailPage />
    </LouvorOnly>
  }
/>
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck`
Expected: exit 0

Run: `npm run build`
Expected: build concluído sem erros

- [ ] **Step 4: Commit**

```bash
git add src/pages/PlaylistDetailPage.tsx src/App.tsx
git commit -m "Add playlist detail page with embedded player and reorderable editor"
```

---

### Task 5: Verificação completa, migration remota e push

**Files:**
- Create (temp, fora do repo): `%TEMP%/opencode/smoke-playlists.mjs`

- [ ] **Step 1: Typecheck, build e detector**

Run: `npm run typecheck`
Expected: exit 0

Run: `npm run build`
Expected: build concluído

Run: `node "C:\Users\Raptor\.opencode\skills\impeccable\scripts\detector\cli\main.mjs" --json src public`
Expected: saída vazia / `[]` (exit 0)

- [ ] **Step 2: Subir dev server em background**

```powershell
Start-Process cmd -ArgumentList "/c npm run dev > %TEMP%\opencode\vite-dev.log 2>&1"
Start-Sleep -Seconds 8
(Invoke-WebRequest -Uri http://localhost:5173/api/health -UseBasicParsing).Content
```

Expected: `{"ok":true}`

- [ ] **Step 3: Escrever smoke script em `%TEMP%\opencode\smoke-playlists.mjs`**

```js
const base = "http://localhost:5173/api";
let failed = 0;

function check(name, cond, extra = "") {
  if (cond) console.log(`PASS ${name}`);
  else {
    failed++;
    console.log(`FAIL ${name} ${extra}`);
  }
}

async function login(email) {
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "senha123" }),
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (!res.ok || !cookie) throw new Error(`login ${email} falhou: ${res.status}`);
  return cookie;
}

async function req(path, cookie, options = {}) {
  return fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...(options.headers || {}) },
  });
}

const leader = await login("carlos@montesiao.org");
const other = await login("ana@montesiao.org");

let res = await req("/playlists", leader);
check("GET lista (líder Louvor) 200", res.status === 200, `got ${res.status}`);
const list = await res.json();

res = await req("/playlists", other);
check("GET lista (líder Mídia) 403", res.status === 403, `got ${res.status}`);

res = await req("/playlists/4", leader);
check("GET detalhe culto 4 (sem playlist) 200", res.status === 200, `got ${res.status}`);
const detail = await res.json();
check("detalhe retorna evento", detail.event?.id === 4);
check("playlist null antes de criar", detail.playlist === null);

res = await req("/playlists/4", other);
check("GET detalhe (outro ministério) 403", res.status === 403, `got ${res.status}`);

res = await req("/playlists/4", leader, {
  method: "PUT",
  body: JSON.stringify({ songs: [] }),
});
check("PUT vazio 400", res.status === 400, `got ${res.status}`);

res = await req("/playlists/4", leader, {
  method: "PUT",
  body: JSON.stringify({
    songs: [{ title: "Aquieta Minh'alma", key: "G", youtube_url: "https://youtube.com/watch?v=abc", note: "x" }],
  }),
});
check("PUT link inválido 400", res.status === 400, `got ${res.status}`);

const song1 = { title: "Aquieta Minh'alma", key: "G", youtube_url: "https://youtu.be/dQw4w9WgXcQ", note: "ao vivo" };
const song2 = { title: "Bondade de Deus", key: "A", youtube_url: "https://www.youtube.com/watch?v=abc123def45", note: "" };
res = await req("/playlists/4", leader, {
  method: "PUT",
  body: JSON.stringify({ songs: [song1, song2] }),
});
check("PUT válido 200", res.status === 200, `got ${res.status}`);

res = await req("/playlists/4", leader);
const after = await res.json();
check("2 músicas salvas", after.songs?.length === 2, `got ${after.songs?.length}`);
check("posição 0..1", after.songs?.[0]?.position === 0 && after.songs?.[1]?.position === 1);
check("ordem preservada", after.songs?.[0]?.title === "Aquieta Minh'alma");

res = await req("/playlists/4", leader, {
  method: "PUT",
  body: JSON.stringify({ songs: [song2] }),
});
const replaced = await (await req("/playlists/4", leader)).json();
check("rePUT substitui lista", replaced.songs?.length === 1 && replaced.songs[0].title === "Bondade de Deus");

res = await req("/playlists", leader);
const list2 = await res.json();
check("lista mostra song_count 1", list2.find((p) => p.event_id === 4)?.song_count === 1);

res = await req("/playlists/4", other, { method: "DELETE" });
check("DELETE (outro ministério) 403", res.status === 403, `got ${res.status}`);

res = await req("/playlists/4", leader, { method: "DELETE" });
check("DELETE (líder) 200", res.status === 200, `got ${res.status}`);
const final = await (await req("/playlists/4", leader)).json();
check("playlist removida", final.playlist === null);

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 4: Rodar o smoke**

Run: `node "$env:TEMP\opencode\smoke-playlists.mjs"`
Expected: todas as linhas `PASS` e `ALL PASS` (exit 0)

- [ ] **Step 5: Teste manual de UI (visual companion / navegador)**

Abrir `http://localhost:5173`, login `carlos@montesiao.org` / `senha123`:
- Menu lateral e inferior mostram item **Playlist**
- Lista → "+ Novo" → escolher culto → detalhe → "Criar playlist" → adicionar 2 músicas com links YouTube → ↑↓ reordenar → Salvar
- Clicar "Tocar" → vídeo toca no player embutido; "Abrir no YouTube" abre aba nova
- Login `admin@montesiao.org` → vê Playlist (ADMIN)
- Login `ana@montesiao.org` (Mídia) → item **não** aparece no menu

Expected: comportamento conforme acima

- [ ] **Step 6: Migration remota + commit final + push**

Run: `npm run db:apply:remote`
Expected: wrangler aplica `0004` no D1 remoto (`escala-monte-siao`) com sucesso

```bash
git add -A
git status
git commit -m "Apply playlist smoke verification" --allow-empty
git push origin main
```

Expected: push aceito; GitHub Actions dispara deploy (run verde em ~1-2 min). Conferir com `gh run list --limit 1`.

- [ ] **Step 7: Smoke pós-deploy**

Run: `curl -s https://escala-monte-siao.leoqueirozyt.workers.dev/api/health`
Expected: `{"ok":true}`

Rodar o mesmo `smoke-playlists.mjs` apontando para `https://escala-monte-siao.leoqueirozyt.workers.dev/api` (ajustar `base` no script) ou validar manualmente no deploy.

---

## Self-Review (feito após escrita)

- **Cobertura da spec:** migration ✓, lazy cleanup (GET /) ✓, 4 rotas ✓, guard Louvor ✓, validação YouTube + ≥1 música ✓, somente futuros editáveis ✓, lista com badge/próximos/esmaecidos ✓, player embutido + Abrir no YouTube ✓, ↑↓ ✓, menu condicional ✓, guard de rota ✓, verificação (typecheck/build/detect/smoke) ✓.
- **Placeholders:** nenhum — todos os passos têm código/comandos exatos.
- **Consistência de tipos:** `PlaylistSummary/PlaylistEvent/PlaylistSong/PlaylistDetail` definidos no Task 1 e usados idênticos nos Tasks 3-4; `extractYouTubeId/isValidYouTubeUrl` de `shared/youtube` usados no backend (`../../shared/youtube.js`) e frontend (`../../shared/youtube`).
