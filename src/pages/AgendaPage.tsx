import { useState } from "react";
import { Handshake, MapPin } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { formatDateTime } from "../lib/utils";
import { useAsyncData } from "../lib/use-async-data";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Dialog } from "../components/ui/dialog";
import { Select, Field } from "../components/ui/input";
import { StatusBadge } from "../components/StatusBadge";
import { toast } from "../components/ui/toast";
import { ErrorState, EmptyState, ListSkeleton } from "../components/ui/load-state";
import type { Candidate, Schedule } from "../../shared/types";

export function AgendaPage() {
  const [swapTarget, setSwapTarget] = useState<Schedule | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<string>("");
  const [respondingId, setRespondingId] = useState<number | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);

  const { data: schedules = [], status, error, reload } = useAsyncData<Schedule[]>(
    () => api.get<Schedule[]>("/schedules/my"),
    [],
  );

  const respond = async (id: number, status: "CONFIRMED" | "DECLINED") => {
    if (respondingId !== null) return;
    setRespondingId(id);
    try {
      await api.post(`/schedules/${id}/respond`, { status });
      toast(status === "CONFIRMED" ? "Presença confirmada!" : "Escala recusada");
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao responder", "error");
    } finally {
      setRespondingId(null);
    }
  };

  const openSwap = async (s: Schedule) => {
    setSwapTarget(s);
    setSelectedCandidate("");
    setCandidates([]);
    try {
      const list = await api.get<Candidate[]>(`/schedules/candidates/${s.id}`);
      setCandidates(list);
    } catch (e) {
      const msg =
        e instanceof ApiError && (e.status === 403 || e.status === 404)
          ? "Líder precisa aprovar trocas — escolha um alvo se disponível"
          : "Não foi possível carregar candidatos. Tente de novo.";
      toast(msg, "error");
    }
  };

  const requestSwap = async () => {
    if (!swapTarget || swapBusy) return;
    setSwapBusy(true);
    try {
      await api.post("/swaps", {
        schedule_id: swapTarget.id,
        target_user_id: selectedCandidate ? Number(selectedCandidate) : undefined,
      });
      toast("Solicitação de troca enviada!");
      setSwapTarget(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao solicitar troca", "error");
    } finally {
      setSwapBusy(false);
    }
  };

  const upcoming = schedules.filter((s) => new Date(s.event_date!).getTime() > Date.now());
  const past = schedules.filter((s) => new Date(s.event_date!).getTime() <= Date.now());

  const renderCard = (s: Schedule) => (
    <Card key={s.id}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{s.event_title}</h3>
              <StatusBadge schedule={s} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{formatDateTime(s.event_date!)}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{s.ministry_name} · {s.role_name}</Badge>
              {s.location && (
                <span className="flex items-center gap-1">
                  <MapPin size={12} /> {s.location}
                </span>
              )}
            </div>
            {s.notes && <p className="mt-2 text-xs text-muted-foreground">{s.notes}</p>}
          </div>
        </div>
        {new Date(s.event_date!).getTime() > Date.now() && s.status === "PENDING" && (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="success"
              className="flex-1"
              disabled={respondingId === s.id}
              onClick={() => respond(s.id, "CONFIRMED")}
            >
              Confirmar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              disabled={respondingId === s.id}
              onClick={() => respond(s.id, "DECLINED")}
            >
              Recusar
            </Button>
          </div>
        )}
        {new Date(s.event_date!).getTime() > Date.now() && (
          <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => openSwap(s)}>
            <Handshake size={14} /> Solicitar troca
          </Button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Minha Agenda</h1>

      {status === "error" && error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : status === "loading" ? (
        <ListSkeleton rows={4} />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Próximas</h2>
            {upcoming.length === 0 && (
              <EmptyState title="Nenhuma escala futura" hint="Novas atribuições aparecerão aqui." />
            )}
            {upcoming.map(renderCard)}
          </section>

          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">Passadas</h2>
              {past.reverse().map(renderCard)}
            </section>
          )}
        </>
      )}

      <Dialog open={!!swapTarget} onClose={() => setSwapTarget(null)} title="Solicitar troca de escala">
        {swapTarget && (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted p-3 text-sm">
              <p className="font-medium">{swapTarget.event_title}</p>
              <p className="text-muted-foreground">{formatDateTime(swapTarget.event_date!)}</p>
              <p className="text-muted-foreground">{swapTarget.role_name}</p>
            </div>
            {candidates.length > 0 ? (
              <Field label="Trocar com (opcional)">
                <Select value={selectedCandidate} onChange={(e) => setSelectedCandidate(e.target.value)}>
                  <option value="">Líder escolhe outro voluntário</option>
                  {candidates.map((cand) => (
                    <option key={cand.user_id} value={cand.user_id}>
                      {cand.name} ({cand.services_this_month}/{cand.max_services_per_month} escalas no mês)
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum voluntário elegível disponível. O líder será notificado para reassumir a vaga.
              </p>
            )}
            <Button className="w-full" onClick={requestSwap} disabled={swapBusy}>
              {swapBusy ? "Enviando…" : "Enviar solicitação"}
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
