import { useMemo, useState } from "react";
import { Plus, UserPlus, Pencil, Crown, UserCheck, UserX, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { useAsyncData } from "../lib/use-async-data";
import { roleLabel } from "../lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, Field, Select } from "../components/ui/input";
import { Dialog } from "../components/ui/dialog";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Badge } from "../components/ui/badge";
import { toast } from "../components/ui/toast";
import { ErrorState, EmptyState, ListSkeleton } from "../components/ui/load-state";
import type { Ministry, User } from "../../shared/types";

export function MinistriesPage() {
  const [newMinistryOpen, setNewMinistryOpen] = useState(false);
  const [ministryName, setMinistryName] = useState("");
  const [ministryDesc, setMinistryDesc] = useState("");
  const [roleDialog, setRoleDialog] = useState<Ministry | null>(null);
  const [roleName, setRoleName] = useState("");
  const [memberDialog, setMemberDialog] = useState<Ministry | null>(null);
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRoleId, setMemberRoleId] = useState("");
  const [editDialog, setEditDialog] = useState<Ministry | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editLeaderIds, setEditLeaderIds] = useState<number[]>([]);
  const [newLeaderIds, setNewLeaderIds] = useState<number[]>([]);
  const [pendingLeader, setPendingLeader] = useState<{ user: User; action: "approve" | "reject" } | null>(null);
  const [membersTick, setMembersTick] = useState(0);

  const ministriesQ = useAsyncData<Ministry[]>(() => api.get<Ministry[]>("/ministries"), []);
  const usersQ = useAsyncData<User[]>(() => api.get<User[]>("/users"), []);
  const pendingQ = useAsyncData<User[]>(() => api.get<User[]>("/users?status=PENDING_LEADER"), []);

  const ministries = ministriesQ.data ?? [];
  const users = usersQ.data ?? [];
  const pendingLeaders = pendingQ.data ?? [];

  const ministriesKey = useMemo(() => ministries.map((m) => m.id).join(","), [ministries]);
  const membersMapQ = useAsyncData(async () => {
    const map = new Map<number, User[]>();
    const list = ministriesKey ? ministriesKey.split(",").map(Number) : [];
    if (list.length === 0) return map;
    const results = await Promise.all(
      list.map((id) => api.get<User[]>(`/ministries/${id}/members`).then((users) => ({ id, users }))),
    );
    for (const r of results) map.set(r.id, r.users);
    return map;
  }, [ministriesKey, membersTick]);

  const load = () => {
    ministriesQ.reload();
    usersQ.reload();
    pendingQ.reload();
    setMembersTick((t) => t + 1);
  };

  const decideLeader = async (u: User, action: "approve" | "reject") => {
    try {
      await api.post(`/users/${u.id}/approve`, { action });
      toast(action === "approve" ? `${u.name} aprovado como líder!` : `${u.name} rejeitado.`);
      setPendingLeader(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const createMinistry = async () => {
    if (!ministryName) return;
    try {
      await api.post("/ministries", {
        name: ministryName,
        description: ministryDesc || null,
        leader_ids: newLeaderIds,
      });
      toast("Ministério criado!");
      setNewMinistryOpen(false);
      setMinistryName("");
      setMinistryDesc("");
      setNewLeaderIds([]);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const openEdit = (m: Ministry) => {
    setEditDialog(m);
    setEditName(m.name);
    setEditDesc(m.description ?? "");
    setEditLeaderIds(m.leader_ids ?? (m.leader_id ? [m.leader_id] : []));
  };

  const saveEdit = async () => {
    if (!editDialog || !editName) return;
    try {
      await api.put(`/ministries/${editDialog.id}`, {
        name: editName,
        description: editDesc || null,
        leader_ids: editLeaderIds,
      });
      toast("Ministério atualizado!");
      setEditDialog(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const createRole = async () => {
    if (!roleDialog || !roleName) return;
    try {
      await api.post(`/ministries/${roleDialog.id}/roles`, { name: roleName });
      toast("Função criada!");
      setRoleName("");
      setRoleDialog(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const addMember = async () => {
    if (!memberDialog || !memberUserId || !memberRoleId) return;
    try {
      await api.post(`/ministries/${memberDialog.id}/members`, {
        user_id: Number(memberUserId),
        role_id: Number(memberRoleId),
      });
      toast("Voluntário vinculado!");
      setMemberDialog(null);
      setMemberUserId("");
      setMemberRoleId("");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Ministérios</h1>
          <p className="text-xs text-muted-foreground">Área exclusiva do ADMIN — defina líderes e funções</p>
        </div>
        <Button size="sm" onClick={() => setNewMinistryOpen(true)}>
          <Plus size={16} /> Novo
        </Button>
      </div>

      {pendingLeaders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck size={16} /> Aprovação de líderes ({pendingLeaders.length})
            </CardTitle>
            <CardDescription>Contas que pediram para ser líder — aprove ou rejeite</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingLeaders.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => setPendingLeader({ user: u, action: "approve" })}>
                    <UserCheck size={14} /> Aprovar
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => setPendingLeader({ user: u, action: "reject" })}>
                    <UserX size={14} /> Rejeitar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {ministriesQ.status === "error" && ministriesQ.error ? (
        <ErrorState message={ministriesQ.error} onRetry={ministriesQ.reload} />
      ) : ministriesQ.status === "loading" ? (
        <ListSkeleton rows={3} />
      ) : ministries.length === 0 ? (
        <EmptyState title="Nenhum ministério" hint="Crie o primeiro ministério para começar." />
      ) : (
        ministries.map((m) => (
          <Card key={m.id}>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>{m.name}</CardTitle>
                <CardDescription>{m.description ?? "Sem descrição"}</CardDescription>
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
                  <Crown size={12} />
                  {m.leader_name ? `Líderes: ${m.leader_name}` : "Sem líder definido"}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(m)}>
                  <Pencil size={14} /> Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRoleDialog(m)}>
                  <Plus size={14} /> Função
                </Button>
                <Button size="sm" variant="outline" onClick={() => setMemberDialog(m)}>
                  <UserPlus size={14} /> Membro
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(m.roles ?? []).map((r) => (
                  <Badge key={r.id} variant="secondary">
                    {r.name}
                  </Badge>
                ))}
                {(m.roles ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma função cadastrada.</p>
                )}
              </div>
              <MemberList
                ministry={m}
                members={membersMapQ.data?.get(m.id)}
                status={membersMapQ.status}
                error={membersMapQ.error}
                onRetry={membersMapQ.reload}
              />
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={newMinistryOpen} onClose={() => setNewMinistryOpen(false)} title="Novo ministério">
        <div className="space-y-4">
          <Field label="Nome">
            <Input value={ministryName} onChange={(e) => setMinistryName(e.target.value)} placeholder="Louvor" />
          </Field>
          <Field label="Descrição">
            <Input value={ministryDesc} onChange={(e) => setMinistryDesc(e.target.value)} />
          </Field>
          <Field label="Líderes (marque um ou mais)">
            <LeaderPicker users={users} selected={newLeaderIds} onChange={setNewLeaderIds} />
          </Field>
          <Button className="w-full" onClick={createMinistry}>
            Criar
          </Button>
        </div>
      </Dialog>

      <Dialog open={!!editDialog} onClose={() => setEditDialog(null)} title={`Editar — ${editDialog?.name ?? ""}`}>
        <div className="space-y-4">
          <Field label="Nome">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </Field>
          <Field label="Descrição">
            <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
          </Field>
          <Field label="Líderes (marque um ou mais)">
            <LeaderPicker users={users} selected={editLeaderIds} onChange={setEditLeaderIds} />
          </Field>
          <Button className="w-full" onClick={saveEdit}>
            Salvar
          </Button>
        </div>
      </Dialog>

      <Dialog open={!!roleDialog} onClose={() => setRoleDialog(null)} title={`Nova função — ${roleDialog?.name ?? ""}`}>
        <div className="space-y-4">
          <Field label="Nome da função">
            <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="Câmera" />
          </Field>
          <Button className="w-full" onClick={createRole}>
            Criar função
          </Button>
        </div>
      </Dialog>

      <Dialog open={!!memberDialog} onClose={() => setMemberDialog(null)} title={`Vincular voluntário — ${memberDialog?.name ?? ""}`}>
        <div className="space-y-4">
          <Field label="Voluntário">
            <Select value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)}>
              <option value="">Selecione...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Função">
            <Select value={memberRoleId} onChange={(e) => setMemberRoleId(e.target.value)}>
              <option value="">Selecione...</option>
              {(memberDialog?.roles ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button className="w-full" onClick={addMember}>
            Vincular
          </Button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!pendingLeader}
        title={pendingLeader?.action === "approve" ? "Aprovar líder" : "Rejeitar líder"}
        description={
          pendingLeader
            ? pendingLeader.action === "approve"
              ? `Aprovar ${pendingLeader.user.name} como líder? Ele poderá gerenciar escalas do ministério.`
              : `Rejeitar o pedido de líder de ${pendingLeader.user.name}? A conta volta a ser voluntária.`
            : undefined
        }
        confirmLabel={pendingLeader?.action === "approve" ? "Aprovar" : "Rejeitar"}
        destructive={pendingLeader?.action === "reject"}
        onConfirm={() => pendingLeader && decideLeader(pendingLeader.user, pendingLeader.action)}
        onClose={() => setPendingLeader(null)}
      />
    </div>
  );
}

function MemberList({
  ministry,
  members,
  status,
  error,
  onRetry,
}: {
  ministry: Ministry;
  members?: User[];
  status: "loading" | "ready" | "error";
  error: string | null;
  onRetry: () => void;
}) {
  if (status === "error") {
    return <ErrorState message={error ?? "Erro"} onRetry={onRetry} className="border-destructive/30" />;
  }
  if (status === "loading") {
    return (
      <div className="space-y-2" aria-busy="true">
        <p className="text-xs font-medium text-muted-foreground">Membros</p>
        <ListSkeleton rows={2} />
      </div>
    );
  }

  const list = members ?? [];

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Membros ({list.length}) — {ministry.name}</p>
      {list.map((m) => (
        <div key={m.id} className="flex items-center justify-between rounded-xl border p-3 text-sm">
          <div>
            <p className="font-medium">{m.name}</p>
            <p className="text-xs text-muted-foreground">{m.email}</p>
          </div>
          <Badge variant="outline">{roleLabel(m.role)}</Badge>
        </div>
      ))}
      {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhum membro vinculado.</p>}
    </div>
  );
}

function LeaderPicker({
  users,
  selected,
  onChange,
}: {
  users: User[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  const promoting = users.filter((u) => selected.includes(u.id) && u.role === "VOLUNTEER");
  return (
    <div className="space-y-2">
      <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border p-2">
        {users.map((u) => {
          const checked = selected.includes(u.id);
          return (
            <label
              key={u.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg p-2 text-sm ${
                checked ? "bg-primary/10" : "hover:bg-muted"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(u.id)}
                className="h-4 w-4 accent-[#C8102E]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{u.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
              </span>
            </label>
          );
        })}
        {users.length === 0 && <p className="p-2 text-sm text-muted-foreground">Nenhum usuário disponível.</p>}
      </div>
      {selected.length === 0 && <p className="text-xs text-muted-foreground">Nenhum líder selecionado</p>}
      {promoting.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Voluntários marcados serão promovidos a Líder: {promoting.map((u) => u.name).join(", ")}
        </p>
      )}
    </div>
  );
}
