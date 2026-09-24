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
  const { data: events = [] } = useAsyncData<EventItem[]>(
    () =>
      pickOpen
        ? api.get<EventItem[]>(`/events?from=${toISODate(new Date())}`)
        : Promise.resolve([]),
    [pickOpen],
  );

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
