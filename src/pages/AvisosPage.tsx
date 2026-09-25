import { useEffect, useState } from "react";
import { Globe2, Megaphone, Pencil, Plus, Trash2, Users } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAsyncData } from "../lib/use-async-data";
import { formatDateTime, monthKey } from "../lib/utils";
import { notifyNoticesChanged } from "../lib/notices";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, Field, Textarea, Select } from "../components/ui/input";
import { Dialog } from "../components/ui/dialog";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Badge } from "../components/ui/badge";
import { toast } from "../components/ui/toast";
import { ErrorState, EmptyState, ListSkeleton } from "../components/ui/load-state";
import type { Ministry, Notice } from "../../shared/types";

export function AvisosPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const canWrite = isAdmin || user?.role === "LEADER";
  const month = monthKey();

  const [tick, setTick] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [form, setForm] = useState({ title: "", body: "", scope: "" });
  const [deleteTarget, setDeleteTarget] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const listQ = useAsyncData<Notice[]>(() => api.get<Notice[]>(`/notices?month=${month}`), [tick]);

  useEffect(() => {
    let alive = true;
    api
      .post("/notices/seen")
      .then(() => {
        if (alive) notifyNoticesChanged();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const reload = () => setTick((t) => t + 1);

  const openForm = async (n?: Notice) => {
    try {
      const list = await api.get<Ministry[]>(isAdmin ? "/ministries?scope=all" : "/ministries");
      setMinistries(list);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
      return;
    }
    if (n) {
      setEditing(n);
      setForm({ title: n.title, body: n.body, scope: n.ministry_id != null ? String(n.ministry_id) : "" });
    } else {
      setEditing(null);
      setForm({ title: "", body: "", scope: "" });
    }
    setFormOpen(true);
  };

  const save = async () => {
    const title = form.title.trim();
    const body = form.body.trim();
    if (!title || !body) {
      toast("Título e texto obrigatórios", "error");
      return;
    }
    const ministry_id = form.scope ? Number(form.scope) : null;
    setBusy(true);
    try {
      if (editing) {
        await api.put(`/notices/${editing.id}`, { title, body, ministry_id, month });
        toast("Aviso atualizado!");
      } else {
        await api.post("/notices", { title, body, ministry_id, month });
        toast("Aviso publicado!");
      }
      setFormOpen(false);
      notifyNoticesChanged();
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.delete(`/notices/${deleteTarget.id}`);
      toast("Aviso excluído.");
      setDeleteTarget(null);
      notifyNoticesChanged();
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    } finally {
      setBusy(false);
    }
  };

  const canEdit = (n: Notice) => isAdmin || n.created_by === user?.id;
  const iconBtn =
    "flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Megaphone size={20} aria-hidden="true" /> Avisos
          </h1>
          <p className="text-sm text-muted-foreground">Avisos do mês</p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => openForm()}>
            <Plus size={16} /> Novo aviso
          </Button>
        )}
      </div>

      {listQ.status === "error" && listQ.error ? (
        <ErrorState message={listQ.error} onRetry={listQ.reload} />
      ) : listQ.status === "loading" ? (
        <ListSkeleton rows={3} />
      ) : (listQ.data ?? []).length === 0 ? (
        <EmptyState title="Nenhum aviso este mês" hint="Quando um líder publicar um aviso, ele aparece aqui." />
      ) : (
        <div className="space-y-3">
          {(listQ.data ?? []).map((n) => (
            <Card key={n.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
                      {n.title}
                      <Badge
                        variant={n.ministry_id != null ? "default" : "outline"}
                        className="gap-1 text-[10px]"
                      >
                        {n.ministry_id != null ? <Users size={10} aria-hidden="true" /> : <Globe2 size={10} aria-hidden="true" />}
                        {n.ministry_id != null ? n.ministry_name : "Geral"}
                      </Badge>
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>
                    <p className="text-xs text-muted-foreground">
                      {n.author_name} · {formatDateTime(n.created_at)}
                    </p>
                  </div>
                  {canEdit(n) && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => openForm(n)}
                        aria-label={`Editar aviso ${n.title}`}
                        className={iconBtn}
                      >
                        <Pencil size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(n)}
                        aria-label={`Excluir aviso ${n.title}`}
                        className={`${iconBtn} hover:text-destructive`}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={formOpen}
        onClose={() => {
          if (!busy) setFormOpen(false);
        }}
        title={editing ? "Editar aviso" : "Novo aviso"}
      >
        <div className="space-y-4">
          <Field label="Título">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ensaio do sábado"
            />
          </Field>
          <Field label="Texto">
            <Textarea
              rows={5}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Escreva o aviso..."
            />
          </Field>
          <Field label="Escopo">
            <Select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
              <option value="">Geral (igreja inteira)</option>
              {ministries.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button className="w-full" onClick={save} disabled={busy}>
            {editing ? "Salvar" : "Publicar"}
          </Button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir aviso"
        description={
          deleteTarget ? `Excluir o aviso "${deleteTarget.title}"? Esta ação não pode ser desfeita.` : undefined
        }
        confirmLabel="Excluir"
        destructive
        busy={busy}
        onConfirm={remove}
        onClose={() => {
          if (!busy) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
