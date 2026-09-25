import { useMemo, useState } from "react";
import { CalendarPlus, ChevronDown, Pencil, Plus, UserPlus, Trash2, ListPlus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime, monthKey } from "../lib/utils";
import { useAsyncData } from "../lib/use-async-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, Field, Select } from "../components/ui/input";
import { Dialog } from "../components/ui/dialog";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Badge } from "../components/ui/badge";
import { StatusBadge } from "../components/StatusBadge";
import { PersonAvatar } from "../components/ui/person-avatar";
import { toast } from "../components/ui/toast";
import { ErrorState, EmptyState, ListSkeleton } from "../components/ui/load-state";
import type { Candidate, EventItem, Ministry, Schedule } from "../../shared/types";

export function ScheduleMatrixPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(monthKey());
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addSlotEvent, setAddSlotEvent] = useState<EventItem | null>(null);
  const [newRoleId, setNewRoleId] = useState("");
  const [newEventOpen, setNewEventOpen] = useState(false);
  const [eventForm, setEventForm] = useState({ title: "", event_date: "", location: "" });
  const [picker, setPicker] = useState<{ schedule: Schedule; candidates: Candidate[] } | null>(null);
  const [chosenUser, setChosenUser] = useState("");
  const [busy, setBusy] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    confirmLabel?: string;
    destructive?: boolean;
    run: () => Promise<void>;
  } | null>(null);

  const dataQ = useAsyncData(async () => {
    const [evs, schs, min] = await Promise.all([
      api.get<EventItem[]>("/events"),
      api.get<Schedule[]>(`/schedules?month=${month}`),
      api.get<Ministry[]>("/ministries"),
    ]);
    return { events: evs, schedules: schs, ministries: min };
  }, [month]);

  const events = dataQ.data?.events ?? [];
  const schedules = dataQ.data?.schedules ?? [];
  const ministries = dataQ.data?.ministries ?? [];
  const load = dataQ.reload;

  const byEvent = useMemo(() => {
    const map = new Map<number, Schedule[]>();
    for (const s of schedules) {
      const list = map.get(s.event_id) ?? [];
      list.push(s);
      map.set(s.event_id, list);
    }
    return map;
  }, [schedules]);

  const allRoles = useMemo(
    () => ministries.flatMap((m) => (m.roles ?? []).map((r) => ({ ...r, ministry_name: m.name }))),
    [ministries],
  );

  const addRole = async () => {
    if (!newRoleName.trim()) return;
    const ministry = ministries[0];
    if (!ministry) return;
    try {
      await api.post(`/ministries/${ministry.id}/roles`, { name: newRoleName.trim() });
      toast(`Função "${newRoleName.trim()}" adicionada ao ministério ${ministry.name}!`);
      setNewRoleName("");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const runConfirm = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    try {
      await confirm.run();
      setConfirm(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteEvent = (ev: EventItem) => {
    setConfirm({
      title: "Excluir evento",
      description: `Excluir o evento "${ev.title}" e todas as suas vagas? Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir evento",
      destructive: true,
      run: async () => {
        await api.delete(`/events/${ev.id}`);
        toast("Evento excluído!");
        if (expanded === ev.id) setExpanded(null);
        load();
      },
    });
  };

  const openPicker = async (s: Schedule) => {
    setBusy(true);
    try {
      const candidates = await api.get<Candidate[]>(`/schedules/candidates/${s.id}`);
      setChosenUser("");
      setPicker({ schedule: s, candidates });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    } finally {
      setBusy(false);
    }
  };

  const assign = async () => {
    if (!picker || !chosenUser) return;
    try {
      await api.patch(`/schedules/${picker.schedule.id}`, { user_id: Number(chosenUser) });
      toast("Voluntário escalado!");
      setPicker(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const unassign = (s: Schedule) => {
    setConfirm({
      title: "Liberar vaga",
      description: `Remover ${s.user_name} de ${s.role_name}? A vaga voltará a ficar em aberto.`,
      confirmLabel: "Liberar vaga",
      destructive: true,
      run: async () => {
        await api.patch(`/schedules/${s.id}`, { user_id: null });
        toast("Vaga liberada");
        load();
      },
    });
  };

  const addSlot = async () => {
    if (!addSlotEvent || !newRoleId) return;
    try {
      await api.post(`/events/${addSlotEvent.id}/slots`, { role_id: Number(newRoleId) });
      toast("Função adicionada ao evento");
      setAddSlotEvent(null);
      setNewRoleId("");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const createEvent = async () => {
    if (!eventForm.title || !eventForm.event_date) return;
    try {
      await api.post("/events", eventForm);
      toast("Evento criado!");
      setNewEventOpen(false);
      setEventForm({ title: "", event_date: "", location: "" });
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const monthEvents = events.filter((e) => String(e.event_date).slice(0, 7) === month);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Gestão de Escala</h1>
          <p className="text-sm text-muted-foreground">Matriz por evento — verde confirmado, amarelo pendente, vermelho recusado/vago</p>
        </div>
        <div className="flex gap-2">
          <Input type="month" className="w-40" value={month} onChange={(e) => setMonth(e.target.value)} />
          <Button size="sm" onClick={() => setNewEventOpen(true)}>
            <CalendarPlus size={16} /> Evento
          </Button>
        </div>
      </div>

      {user?.role === "LEADER" && ministries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListPlus size={16} /> Meu ministério — {ministries[0].name}
            </CardTitle>
            <CardDescription>Adicione funções para poder escalar e criar vagas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(ministries[0].roles ?? []).map((r) => (
                <Badge key={r.id} variant="secondary">
                  {r.name}
                </Badge>
              ))}
              {(ministries[0].roles ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma função ainda — adicione a primeira abaixo.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="Nova função (ex.: Teclado, Iluminação...)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRole();
                  }
                }}
              />
              <Button onClick={addRole} disabled={!newRoleName.trim()}>
                <Plus size={16} /> Adicionar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-success" /> Confirmado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-warning" /> Pendente
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive" /> Recusado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/50" /> Vago
        </span>
      </div>

      {dataQ.status === "error" && dataQ.error ? (
        <ErrorState message={dataQ.error} onRetry={load} />
      ) : dataQ.status === "loading" ? (
        <ListSkeleton rows={3} />
      ) : monthEvents.length === 0 ? (
        <EmptyState title="Nenhum evento neste mês" hint="Crie um evento para começar." />
      ) : null}

      {dataQ.status === "ready" &&
        monthEvents.map((ev) => {
        const slots = byEvent.get(ev.id) ?? [];
        const isOpen = expanded === ev.id;
        const filled = slots.filter((s) => s.user_id).length;
        return (
          <Card key={ev.id}>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : ev.id)}
                aria-expanded={isOpen}
                aria-controls={`event-slots-${ev.id}`}
                className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block text-base font-semibold leading-none tracking-tight">
                    {ev.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {formatDateTime(ev.event_date)} · {ev.location ?? "—"} · {filled}/{slots.length} preenchidos
                  </span>
                </span>
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  className={isOpen ? "shrink-0 rotate-180 transition-transform" : "shrink-0 transition-transform"}
                />
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Adicionar função ao evento"
                  className="flex min-h-11 min-w-11 p-2"
                  onClick={() => setAddSlotEvent(ev)}
                >
                  <Plus size={16} aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex min-h-11 min-w-11 p-2 text-destructive hover:text-destructive"
                  aria-label={`Excluir evento ${ev.title}`}
                  onClick={() => deleteEvent(ev)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </Button>
              </div>
            </CardHeader>
            {isOpen && (
              <CardContent id={`event-slots-${ev.id}`} className="space-y-2 pt-0">
                {slots.length === 0 && <p className="text-sm text-muted-foreground">Sem funções definidas.</p>}
                {slots.map((s) => {
                  const dot =
                    !s.user_id
                      ? "bg-muted-foreground/50"
                      : s.status === "CONFIRMED"
                        ? "bg-success"
                        : s.status === "DECLINED"
                          ? "bg-destructive"
                          : "bg-warning";
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-xl border p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`h-3 w-3 shrink-0 rounded-full ${dot}`} />
                        {s.user_id ? (
                          <PersonAvatar name={s.user_name ?? ""} avatarUrl={s.user_avatar} className="h-8 w-8 text-xs" />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-xs text-muted-foreground"
                          >
                            ?
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{s.role_name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {s.user_name ?? "Vaga em aberto"}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge schedule={s} />
                        {s.user_id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openPicker(s)}
                              aria-label={`Trocar voluntário em ${s.role_name}`}
                              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <Pencil size={15} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => unassign(s)}
                              aria-label={`Liberar vaga de ${s.role_name}`}
                              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          </>
                        ) : (
                          <Button size="sm" onClick={() => openPicker(s)} disabled={busy}>
                            <UserPlus size={14} /> Escalar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}

      <Dialog open={!!picker} onClose={() => setPicker(null)} title="Selecionar voluntário">
        {picker && (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted p-3 text-sm">
              <p className="font-medium">
                {picker.schedule.role_name} · {picker.schedule.event_title}
              </p>
              <p className="text-muted-foreground">{formatDateTime(picker.schedule.event_date!)}</p>
            </div>
            {picker.candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum voluntário elegível (indisponíveis e já escalados são ocultados).
              </p>
            ) : (
              <>
                <Field label="Voluntário">
                  <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border p-2" role="listbox" aria-label="Candidatos">
                    {picker.candidates.map((c) => (
                      <button
                        key={c.user_id}
                        type="button"
                        role="option"
                        aria-selected={chosenUser === String(c.user_id)}
                        onClick={() => setChosenUser(String(c.user_id))}
                        className={`flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm ${
                          chosenUser === String(c.user_id) ? "bg-primary/10" : "hover:bg-muted"
                        }`}
                      >
                        <PersonAvatar name={c.name} avatarUrl={c.avatar_url} className="h-8 w-8 text-xs" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{c.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.services_this_month}/{c.max_services_per_month} no mês
                            {c.services_this_month >= c.max_services_per_month ? " (limite)" : ""}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </Field>
                <Button className="w-full" onClick={assign} disabled={!chosenUser}>
                  Escalar voluntário
                </Button>
              </>
            )}
          </div>
        )}
      </Dialog>

      <Dialog open={!!addSlotEvent} onClose={() => setAddSlotEvent(null)} title="Adicionar função ao evento">
        <div className="space-y-4">
          <Field label="Função">
            <Select value={newRoleId} onChange={(e) => setNewRoleId(e.target.value)}>
              <option value="">Selecione...</option>
              {allRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.ministry_name} · {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button className="w-full" onClick={addSlot} disabled={!newRoleId}>
            Adicionar vaga
          </Button>
        </div>
      </Dialog>

      <Dialog open={newEventOpen} onClose={() => setNewEventOpen(false)} title="Novo evento / culto">
        <div className="space-y-4">
          <Field label="Título">
            <Input
              value={eventForm.title}
              onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
              placeholder="Culto de Domingo Noite"
            />
          </Field>
          <Field label="Data e hora">
            <Input
              type="datetime-local"
              value={eventForm.event_date}
              onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })}
            />
          </Field>
          <Field label="Local">
            <Input
              value={eventForm.location}
              onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
              placeholder="Templo Principal"
            />
          </Field>
          <Button className="w-full" onClick={createEvent}>
            Criar evento
          </Button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.destructive}
        busy={busy}
        onConfirm={runConfirm}
        onClose={() => !busy && setConfirm(null)}
      />
    </div>
  );
}
