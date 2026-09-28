import { useState } from "react";
import { ChevronDown, Handshake, MapPin, UserSearch, Users } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { formatDateTime } from "../lib/utils";
import { useAsyncData } from "../lib/use-async-data";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Dialog } from "../components/ui/dialog";
import { Field } from "../components/ui/input";
import { StatusBadge } from "../components/StatusBadge";
import { PersonAvatar } from "../components/ui/person-avatar";
import { toast } from "../components/ui/toast";
import { ErrorState, EmptyState, ListSkeleton } from "../components/ui/load-state";
import type { Candidate, Schedule, TeamMember } from "../../shared/types";

export function AgendaPage() {
  const [swapTarget, setSwapTarget] = useState<Schedule | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<string>("");
  const [respondingId, setRespondingId] = useState<number | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);
  const [openTeam, setOpenTeam] = useState<Record<number, boolean>>({});
  const [period, setPeriod] = useState<"month" | "all">("month");

  const { data: schedules = [], status, error, reload } = useAsyncData<Schedule[]>(
    () => api.get<Schedule[]>("/schedules/my"),
    [],
  );

  const eventIdsKey = [...new Set(schedules.map((s) => s.event_id))].sort((a, b) => a - b).join(",");
  const teamsVersion = schedules.map((s) => `${s.event_id}:${s.status}`).join(",");
  const { data: teams = {} } = useAsyncData<Record<string, TeamMember[]>>(
    () => (eventIdsKey ? api.get<Record<string, TeamMember[]>>(`/events/teams?ids=${eventIdsKey}`) : Promise.resolve({})),
    [teamsVersion],
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

  const inPeriod = (s: Schedule) => {
    if (period === "all") return true;
    const d = new Date(s.event_date!);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
  const visible = schedules.filter(inPeriod);
  const upcoming = visible.filter((s) => new Date(s.event_date!).getTime() > Date.now());
  const past = visible.filter((s) => new Date(s.event_date!).getTime() <= Date.now());

  const renderCard = (s: Schedule) => {
    const team = teams[String(s.event_id)] ?? [];
    const open = !!openTeam[s.id];
    return (
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
                {s.group && (
                  <Badge variant="secondary" className="gap-1">
                    <Users size={10} /> Grupo {s.group.name}
                  </Badge>
                )}
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
          {new Date(s.event_date!).getTime() > Date.now() && !s.group && (
            <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => openSwap(s)}>
              <Handshake size={14} /> Solicitar troca
            </Button>
          )}
          {team.length > 0 && (
            <div className="mt-3 border-t pt-2">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-sm font-medium"
                aria-expanded={open}
                onClick={() => setOpenTeam((o) => ({ ...o, [s.id]: !o[s.id] }))}
              >
                <span className="flex items-center gap-2">
                  <Users size={14} aria-hidden="true" /> Time do culto
                  <Badge variant="outline">
                    {team.length} {team.length === 1 ? "pessoa" : "pessoas"}
                  </Badge>
                </span>
                <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <ul className="mt-2 space-y-1.5">
                  {team.map((m) => (
                    <li key={`${m.is_group ? "g" : "i"}-${m.user_id}`} className="flex items-center gap-2">
                      <PersonAvatar name={m.name} avatarUrl={m.avatar_url} className="h-7 w-7 text-xs" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {m.name}
                        {m.is_me && <span className="font-semibold text-primary"> · você</span>}
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          · {m.role_name}
                          {m.is_group ? " · grupo" : ""}
                        </span>
                      </span>
                      <StatusBadge schedule={{ status: m.status, user_id: m.user_id, group: null }} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Minha Agenda</h1>
        <div className="flex rounded-lg border p-0.5" role="group" aria-label="Período">
          <button
            type="button"
            aria-pressed={period === "month"}
            onClick={() => setPeriod("month")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              period === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Este mês
          </button>
          <button
            type="button"
            aria-pressed={period === "all"}
            onClick={() => setPeriod("all")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              period === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Todas
          </button>
        </div>
      </div>

      {status === "error" && error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : status === "loading" ? (
        <ListSkeleton rows={4} />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Próximas</h2>
            {upcoming.length === 0 &&
              (period === "month" ? (
                <EmptyState title="Nenhuma escala este mês" hint="Use o filtro para ver todas as escalas." />
              ) : (
                <EmptyState title="Nenhuma escala futura" hint="Novas atribuições aparecerão aqui." />
              ))}
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
                <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border p-2" role="listbox" aria-label="Candidatos para troca">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedCandidate === ""}
                    onClick={() => setSelectedCandidate("")}
                    className={`flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm ${
                      selectedCandidate === "" ? "bg-primary/10" : "hover:bg-muted"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted"
                    >
                      <UserSearch size={14} />
                    </span>
                    <span className="truncate font-medium">Líder escolhe outro voluntário</span>
                  </button>
                  {candidates.map((cand) => (
                    <button
                      key={cand.user_id}
                      type="button"
                      role="option"
                      aria-selected={selectedCandidate === String(cand.user_id)}
                      onClick={() => setSelectedCandidate(String(cand.user_id))}
                      className={`flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm ${
                        selectedCandidate === String(cand.user_id) ? "bg-primary/10" : "hover:bg-muted"
                      }`}
                    >
                      <PersonAvatar name={cand.name} avatarUrl={cand.avatar_url} className="h-8 w-8 text-xs" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{cand.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {cand.services_this_month}/{cand.max_services_per_month} escalas no mês
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
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
