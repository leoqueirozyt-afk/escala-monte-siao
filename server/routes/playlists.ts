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
  const playlist = await c.env.DB.prepare("SELECT id, event_id, created_by, created_at FROM playlists WHERE event_id = ?")
    .bind(eventId)
    .first();
  if (!playlist) return c.json({ event, playlist: null, songs: [] });
  const songs = await c.env.DB.prepare("SELECT * FROM playlist_songs WHERE playlist_id = ? ORDER BY position ASC")
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
