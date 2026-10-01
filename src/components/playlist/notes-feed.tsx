import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { EmptyState } from "../ui/load-state";
import { PersonAvatar } from "../ui/person-avatar";
import { api } from "../../lib/api";
import { toast } from "../ui/toast";
import { formatDateTime } from "../../lib/utils";
import { mmss } from "../../lib/youtube-player";
import type { SongNote } from "../../../shared/types";

function renderBody(body: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\@\[([^\]]+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(body))) {
    if (m.index > last) out.push(<span key={k++}>{body.slice(last, m.index)}</span>);
    out.push(
      <span key={k++} className="mx-0.5 rounded-md bg-blue-100 px-1.5 py-0.5 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
        @{m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push(<span key={k++}>{body.slice(last)}</span>);
  return out;
}

interface NotesFeedProps {
  notes: SongNote[];
  canDelete: boolean;
  onSeek: (sec: number) => void;
  onReload: () => void;
  composer?: ReactNode;
}

export function NotesFeed({ notes, canDelete, onSeek, onReload, composer }: NotesFeedProps) {
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (confirmId == null) return;
    setBusy(true);
    try {
      await api.delete(`/playlists/notes/${confirmId}`);
      toast("Anotação apagada");
      setConfirmId(null);
      onReload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao apagar", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 pt-1">
      <div className="border-t border-dashed" />
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Anotações ({notes.length})
      </p>
      {notes.length === 0 && (
        <EmptyState title="Sem anotações ainda" hint="Registre a dinâmica da música." />
      )}
      {notes.map((n) => (
        <div key={n.id} className="flex gap-2 rounded-lg border bg-card p-2.5">
          <PersonAvatar name={n.author_name} avatarUrl={n.author_avatar} className="h-7 w-7 text-[10px]" />
          <div className="min-w-0 flex-1">
            <p className="text-xs">
              <span className="font-semibold">{n.author_name}</span>{" "}
              <span className="text-muted-foreground">· {formatDateTime(n.created_at)}</span>
            </p>
            <p className="mt-0.5 text-sm break-words">
              {renderBody(n.body)}
              {n.seconds != null && (
                <button
                  type="button"
                  onClick={() => onSeek(n.seconds!)}
                  aria-label={`Ir para ${mmss(n.seconds)} do vídeo`}
                  className="ml-1 inline-flex items-center rounded-md bg-blue-600 px-1.5 py-0.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  {mmss(n.seconds)}
                </button>
              )}
            </p>
          </div>
          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirmId(n.id)}
              aria-label="Apagar anotação"
              className="h-6 w-6 shrink-0 self-start rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
            >
              <X size={14} className="mx-auto" />
            </button>
          )}
        </div>
      ))}
      {composer}
      <ConfirmDialog
        open={confirmId != null}
        title="Apagar anotação"
        description="Remover esta anotação da música?"
        confirmLabel="Apagar"
        destructive
        busy={busy}
        onConfirm={remove}
        onClose={() => !busy && setConfirmId(null)}
      />
    </div>
  );
}
