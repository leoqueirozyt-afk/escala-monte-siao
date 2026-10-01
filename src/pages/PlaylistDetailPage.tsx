import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  ListMusic,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
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
import { VideoPlayer } from "../components/playlist/video-player";
import { NotesFeed } from "../components/playlist/notes-feed";
import { NoteComposer } from "../components/playlist/note-composer";
import { mmss } from "../lib/youtube-player";
import type { PlaylistDetail, PlaylistSong, SongNote } from "../../shared/types";

interface DraftSong {
  id?: number;
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
  const playerRef = useRef<any>(null);

  if (status === "loading") return <ListSkeleton rows={4} />;
  if (status === "error" && error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <ErrorState message="Playlist não encontrada" onRetry={reload} />;

  const { event, playlist, songs } = data;
  const past = event.event_date.slice(0, 10) < toISODate(new Date());
  const canEdit = canManage && !past;
  const activeSong: PlaylistSong | undefined = songs[activeIdx] ?? songs[0];
  const activeId = activeSong ? extractYouTubeId(activeSong.youtube_url) : null;

  const seekVideo = (sec: number) => {
    const p = playerRef.current;
    if (p && typeof p.seekTo === "function") {
      p.seekTo(sec, true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (activeId) {
      window.open(`https://www.youtube.com/watch?v=${activeId}&t=${sec}s`, "_blank", "noopener");
    }
  };

  const grabCurrentTime = (): string | null => {
    const p = playerRef.current;
    if (!p || typeof p.getCurrentTime !== "function") return null;
    return mmss(p.getCurrentTime());
  };

  const notesBySong = new Map<number, SongNote[]>();
  for (const n of data.notes ?? []) {
    const arr = notesBySong.get(n.song_id) ?? [];
    arr.push(n);
    notesBySong.set(n.song_id, arr);
  }

  const startEdit = () => {
    setDrafts(
      songs.map((s) => ({
        id: s.id,
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
            <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)} aria-label="Remover playlist">
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
          <VideoPlayer
            videoId={activeId}
            title={activeSong?.title ?? "Vídeo do YouTube"}
            onReady={(p) => {
              playerRef.current = p;
            }}
          />
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
          {songs.map((s, i) =>
            i === activeIdx ? (
              <div key={s.id} className="space-y-1 rounded-xl border border-primary bg-primary/5 p-3">
                <div className="flex items-center gap-3">
                  <span className="w-5 text-center text-sm text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{s.title}</p>
                    {s.note && <p className="truncate text-xs text-muted-foreground">{s.note}</p>}
                  </div>
                  {s.key && <Badge>{s.key}</Badge>}
                  <Button size="sm" onClick={() => setActiveIdx(i)}>
                    <Play size={14} /> Tocando
                  </Button>
                </div>
                <NotesFeed
                  notes={notesBySong.get(s.id) ?? []}
                  canDelete={canManage}
                  onSeek={seekVideo}
                  onReload={reload}
                  composer={
                    canManage && (
                      <NoteComposer
                        songId={s.id}
                        grabCurrentTime={grabCurrentTime}
                        onCreated={reload}
                      />
                    )
                  }
                />
              </div>
            ) : (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <span className="w-5 text-center text-sm text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.title}</p>
                  {s.note && <p className="truncate text-xs text-muted-foreground">{s.note}</p>}
                </div>
                {s.key && <Badge>{s.key}</Badge>}
                <Button size="sm" variant="outline" onClick={() => setActiveIdx(i)}>
                  <Play size={14} /> Tocar
                </Button>
              </div>
            ),
          )}
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
