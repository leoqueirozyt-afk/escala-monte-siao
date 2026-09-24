import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, Clock, MapPin, Users } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAsyncData } from "../lib/use-async-data";
import { formatDateTime, formatTime, daysUntil } from "../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { MiniCalendar } from "../components/MiniCalendar";
import { StatusBadge } from "../components/StatusBadge";
import { toast } from "../components/ui/toast";
import { ErrorState, EmptyState, HeroSkeleton, ListSkeleton } from "../components/ui/load-state";
import type { Schedule } from "../../shared/types";

function Countdown({ eventDate }: { eventDate?: string | null }) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!eventDate) {
      setText("");
      return;
    }
    let timeout: ReturnType<typeof setTimeout>;
    const tick = () => {
      const diff = new Date(eventDate).getTime() - Date.now();
      if (diff <= 0) {
        setText("Acontecendo agora");
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) {
        setText(`${d}d ${h}h ${m}m`);
        timeout = setTimeout(tick, 60000);
      } else {
        setText(`${h}h ${m}m ${s}s`);
        timeout = setTimeout(tick, 1000);
      }
    };
    tick();
    return () => clearTimeout(timeout);
  }, [eventDate]);

  return <>{text}</>;
}

export function DashboardPage() {
  const { user, ministries } = useAuth();
  const [responding, setResponding] = useState(false);
  const { data: schedules = [], status, error, reload } = useAsyncData<Schedule[]>(
    () => api.get<Schedule[]>("/schedules/my"),
    [],
  );

  const upcoming = useMemo(
    () =>
      schedules
        .filter((s) => s.event_date && new Date(s.event_date).getTime() > Date.now() - 60 * 60 * 1000)
        .sort((a, b) => new Date(a.event_date!).getTime() - new Date(b.event_date!).getTime()),
    [schedules],
  );
  const next = upcoming[0];

  const respond = async (scheduleId: number, status: "CONFIRMED" | "DECLINED") => {
    if (responding) return;
    setResponding(true);
    try {
      await api.post(`/schedules/${scheduleId}/respond`, { status });
      toast(status === "CONFIRMED" ? "Presença confirmada!" : "Escala recusada");
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao responder", "error");
    } finally {
      setResponding(false);
    }
  };

  const futureMarked = useMemo(() => upcoming.map((s) => String(s.event_date).slice(0, 10)), [upcoming]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Olá, {user?.name.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground">
            {status === "loading"
              ? "Carregando suas escalas…"
              : status === "error"
                ? "Não foi possível carregar as escalas"
                : next
                  ? `Próxima escala em ${daysUntil(next.event_date!)} dia(s)`
                  : "Nenhuma escala futura"}
          </p>
        </div>
        <Badge variant={user?.role === "VOLUNTEER" ? "muted" : "default"}>
          {user?.role === "ADMIN" ? "Administrador" : user?.role === "LEADER" ? "Líder de Ministério" : "Membro / Voluntário"}
        </Badge>
      </div>

      {status === "error" && error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : status === "loading" ? (
        <HeroSkeleton />
      ) : next ? (
        <Card className="overflow-hidden border-church/30 bg-[linear-gradient(155deg,var(--brand-church)_0%,#A00F26_48%,var(--brand-mountain)_100%)] text-white shadow-[0_12px_28px_-14px_rgba(200,16,46,0.55)]">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase opacity-80">Próxima escala</p>
                <h2 className="mt-1 text-lg font-bold">{next.event_title}</h2>
                <p className="mt-1 text-sm opacity-90">{formatDateTime(next.event_date!)}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-1">
                    <MapPin size={12} /> {next.location ?? "—"}
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-1">
                    <Users size={12} /> {next.role_name}
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-1">
                    <Clock size={12} /> {formatTime(next.event_date!)}
                  </span>
                </div>
              </div>
              <div className="rounded-xl bg-white/20 px-3 py-2 text-center">
                <p className="text-[10px] uppercase opacity-80">Falta</p>
                <p className="text-sm font-bold tabular-nums">
                  <Countdown eventDate={next.event_date} />
                </p>
              </div>
            </div>
            {next.status === "PENDING" && (
              <div className="mt-4 flex gap-2">
                <Button
                  variant="success"
                  className="flex-1 bg-white text-primary hover:bg-white/90"
                  disabled={responding}
                  onClick={() => respond(next.id, "CONFIRMED")}
                >
                  <CalendarCheck size={16} /> Confirmar
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 bg-black/20 hover:bg-black/30"
                  disabled={responding}
                  onClick={() => respond(next.id, "DECLINED")}
                >
                  Recusar
                </Button>
              </div>
            )}
            {next.status !== "PENDING" && (
              <div className="mt-4">
                <Badge variant={next.status === "CONFIRMED" ? "success" : "destructive"} className="bg-white/90">
                  {next.status === "CONFIRMED" ? "Presença confirmada" : "Você recusou"}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          title="Nenhuma escala futura"
          hint="Fique atento ao calendário para novas atribuições."
          action={
            <Link to="/agenda" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">
              Ver minha agenda
            </Link>
          }
        />
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <MiniCalendar markedDates={futureMarked} />

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Meus ministérios</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {ministries.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum ministério vinculado ainda.</p>
              )}
              {ministries.map((m) => (
                <Badge key={m.id} variant="default">
                  {m.name}
                </Badge>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Próximas escalas</CardTitle>
              <Link to="/agenda" className="inline-flex min-h-11 items-center text-xs text-primary hover:underline">
                Ver todas
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {status === "loading" && <ListSkeleton rows={3} />}
              {status === "ready" && (
                <>
                  {upcoming.slice(0, 4).map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{s.event_title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(s.event_date!)} · {s.role_name}
                        </p>
                      </div>
                      <StatusBadge schedule={s} />
                    </div>
                  ))}
                  {upcoming.length === 0 && (
                    <p className="text-sm text-muted-foreground">Sem escalas nos próximos dias.</p>
                  )}
                </>
              )}
              {status === "error" && (
                <p className="text-sm text-muted-foreground">Não foi possível listar as escalas.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
