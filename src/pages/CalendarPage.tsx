import { useMemo, useState } from "react";
import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { formatDateTime, toISODate } from "../lib/utils";
import { useAsyncData } from "../lib/use-async-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, Field, Textarea } from "../components/ui/input";
import { Dialog } from "../components/ui/dialog";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Badge } from "../components/ui/badge";
import { MiniCalendar } from "../components/MiniCalendar";
import { toast } from "../components/ui/toast";
import { ErrorState, EmptyState, ListSkeleton } from "../components/ui/load-state";
import type { Schedule, Unavailability } from "../../shared/types";

export function CalendarPage() {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<Unavailability | null>(null);

  const unavail = useAsyncData<Unavailability[]>(
    () => api.get<Unavailability[]>("/unavailability"),
    [],
  );
  const schedulesQ = useAsyncData<Schedule[]>(() => api.get<Schedule[]>("/schedules/my"), []);

  const unavailabilities = unavail.data ?? [];
  const schedules = schedulesQ.data ?? [];

  const reload = () => {
    unavail.reload();
    schedulesQ.reload();
  };

  const expandRange = (u: Unavailability): string[] => {
    const out: string[] = [];
    const cur = new Date(u.start_date + "T00:00:00");
    const last = new Date(u.end_date + "T00:00:00");
    while (cur <= last) {
      out.push(toISODate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  };

  const unavailableDates = useMemo(() => unavailabilities.flatMap(expandRange), [unavailabilities]);
  const markedDates = useMemo(() => schedules.map((s) => String(s.event_date).slice(0, 10)), [schedules]);

  const onSelect = (date: string) => {
    setSelected(date);
    setStart(date);
    setEnd(date);
    setOpen(true);
  };

  const save = async () => {
    if (!start || !end || busy) return toast("Selecione as datas", "error");
    setBusy(true);
    try {
      await api.post("/unavailability", { start_date: start, end_date: end, reason: reason || null });
      toast("Indisponibilidade registrada!");
      setOpen(false);
      setReason("");
      setSelected(null);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao salvar", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await api.delete(`/unavailability/${id}`);
      toast("Removido");
      setPendingRemove(null);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao remover", "error");
    }
  };

  const loading = unavail.status === "loading" || schedulesQ.status === "loading";
  const loadError = unavail.status === "error" ? unavail.error : schedulesQ.status === "error" ? schedulesQ.error : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Calendário</h1>
          <p className="text-sm text-muted-foreground">Toque num dia para bloquear indisponibilidade</p>
        </div>
        <Button size="sm" onClick={() => { setStart(toISODate(new Date())); setEnd(toISODate(new Date())); setOpen(true); }}>
          <Plus size={16} /> Bloquear
        </Button>
      </div>

      {loadError ? (
        <ErrorState
          message={loadError}
          onRetry={() => {
            unavail.reload();
            schedulesQ.reload();
          }}
        />
      ) : (
        <MiniCalendar
          markedDates={markedDates}
          unavailableDates={unavailableDates}
          selected={selected}
          onSelect={onSelect}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarOff size={16} /> Minhas indisponibilidades
          </CardTitle>
          <CardDescription>Datas em que você não poderá ser escalado</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <ListSkeleton rows={2} />}
          {!loading && unavailabilities.length === 0 && (
            <EmptyState title="Nenhum bloqueio registrado" hint="Toque num dia no calendário para adicionar." />
          )}
          {!loading && unavail.status === "error" && (
            <ErrorState message={unavail.error ?? "Erro"} onRetry={unavail.reload} />
          )}
          {!loading && unavail.status === "ready" && unavailabilities.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">
                  {new Date(u.start_date + "T00:00:00").toLocaleDateString("pt-BR")} —{" "}
                  {new Date(u.end_date + "T00:00:00").toLocaleDateString("pt-BR")}
                </p>
                {u.reason && <p className="text-xs text-muted-foreground">{u.reason}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="destructive">Bloqueado</Badge>
                <button
                  onClick={() => setPendingRemove(u)}
                  aria-label={`Remover indisponibilidade de ${new Date(u.start_date + "T00:00:00").toLocaleDateString("pt-BR")} a ${new Date(u.end_date + "T00:00:00").toLocaleDateString("pt-BR")}`}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Minhas próximas escalas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <ListSkeleton rows={3} />}
          {!loading && schedulesQ.status === "error" && (
            <ErrorState message={schedulesQ.error ?? "Erro"} onRetry={schedulesQ.reload} />
          )}
          {!loading && schedulesQ.status === "ready" && (
            <>
              {schedules
                .filter((s) => new Date(s.event_date!) > new Date())
                .slice(0, 5)
                .map((s) => (
                  <div key={s.id} className="rounded-xl border p-3 text-sm">
                    <p className="font-medium">{s.event_title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(s.event_date!)} · {s.role_name}
                    </p>
                  </div>
                ))}
              {schedules.filter((s) => new Date(s.event_date!) > new Date()).length === 0 && (
                <EmptyState title="Sem escalas futuras" />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} title="Bloquear datas">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início">
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Fim">
              <Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          <Field label="Motivo (opcional)">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: Viagem" />
          </Field>
          <Button className="w-full" onClick={save} disabled={busy}>
            {busy ? "Salvando…" : "Salvar bloqueio"}
          </Button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!pendingRemove}
        title="Remover bloqueio"
        description={
          pendingRemove
            ? `Remover a indisponibilidade de ${new Date(pendingRemove.start_date + "T00:00:00").toLocaleDateString("pt-BR")} a ${new Date(pendingRemove.end_date + "T00:00:00").toLocaleDateString("pt-BR")}${pendingRemove.reason ? ` (${pendingRemove.reason})` : ""}? Você poderá voltar a aceitar escalas nesses dias.`
            : undefined
        }
        confirmLabel="Remover"
        destructive
        busy={busy}
        onConfirm={async () => {
          if (!pendingRemove) return;
          setBusy(true);
          try {
            await remove(pendingRemove.id);
          } finally {
            setBusy(false);
          }
        }}
        onClose={() => !busy && setPendingRemove(null)}
      />
    </div>
  );
}
