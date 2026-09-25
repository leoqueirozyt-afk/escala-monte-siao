import { useState } from "react";
import { Plus, Pencil, Trash2, X, UserPlus, Users, Music, Mic } from "lucide-react";
import { api } from "../lib/api";
import { useAsyncData } from "../lib/use-async-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, Field } from "../components/ui/input";
import { Dialog } from "../components/ui/dialog";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Badge } from "../components/ui/badge";
import { toast } from "../components/ui/toast";
import { PersonAvatar } from "../components/ui/person-avatar";
import { VoiceBadge } from "../components/VoiceBadge";
import { ErrorState, EmptyState, ListSkeleton } from "../components/ui/load-state";
import type { MinistryMember, VoiceClassification, VoiceGroup } from "../../shared/types";

type Tab = "vocal" | "grupos";

export function GruposPage() {
  const [tab, setTab] = useState<Tab>("vocal");
  const [classTarget, setClassTarget] = useState<MinistryMember | null>(null);
  const [classChoice, setClassChoice] = useState<string>("");
  const [newKind, setNewKind] = useState<"VOZ" | "MUSICO" | null>(null);
  const [newName, setNewName] = useState("");
  const [renameTarget, setRenameTarget] = useState<VoiceGroup | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<VoiceGroup | null>(null);
  const [addTarget, setAddTarget] = useState<VoiceGroup | null>(null);
  const [addQ, setAddQ] = useState("");

  const membersQ = useAsyncData<MinistryMember[]>(() => api.get<MinistryMember[]>("/ministries/1/members"), []);
  const classesQ = useAsyncData<{ classifications: VoiceClassification[]; mine: number | null }>(
    () => api.get("/voice/classifications"),
    [],
  );
  const groupsQ = useAsyncData<VoiceGroup[]>(() => api.get<VoiceGroup[]>("/voice/groups"), []);

  const members = membersQ.data ?? [];
  const classifications = classesQ.data?.classifications ?? [];
  const groups = groupsQ.data ?? [];
  const load = () => {
    membersQ.reload();
    groupsQ.reload();
  };

  const openClassify = (m: MinistryMember) => {
    setClassTarget(m);
    setClassChoice(m.classification ? String(m.classification.id) : "");
  };

  const saveClassification = async () => {
    if (!classTarget) return;
    try {
      await api.put(`/users/${classTarget.id}/voice-classification`, {
        classification_id: classChoice ? Number(classChoice) : null,
      });
      toast("Classificação salva!");
      setClassTarget(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const createGroup = async () => {
    if (!newKind || !newName.trim()) return;
    try {
      await api.post("/voice/groups", { kind: newKind, name: newName.trim() });
      toast("Grupo criado!");
      setNewKind(null);
      setNewName("");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const renameGroup = async () => {
    if (!renameTarget || !renameName.trim()) return;
    try {
      await api.put(`/voice/groups/${renameTarget.id}`, { name: renameName.trim() });
      toast("Grupo renomeado!");
      setRenameTarget(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const deleteGroup = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/voice/groups/${deleteTarget.id}`);
      toast("Grupo excluído. Vagas futuras voltaram a ficar em aberto.");
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const addMember = async (group: VoiceGroup, userId: number) => {
    try {
      await api.post(`/voice/groups/${group.id}/members`, { user_id: userId });
      toast("Membro adicionado!");
      setAddTarget(null);
      setAddQ("");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  const removeMember = async (group: VoiceGroup, userId: number) => {
    try {
      await api.delete(`/voice/groups/${group.id}/members/${userId}`);
      toast("Membro removido do grupo.");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    }
  };

  if (membersQ.status === "error" && membersQ.error) {
    return <ErrorState message={membersQ.error} onRetry={membersQ.reload} />;
  }
  if (membersQ.status === "loading" || classesQ.status === "loading" || groupsQ.status === "loading") {
    return <ListSkeleton rows={4} />;
  }

  const unclassified = members.filter((m) => !m.classification);

  const renderMemberRow = (m: MinistryMember, showClassify: boolean) => (
    <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
      <div className="flex min-w-0 items-center gap-3">
        <PersonAvatar name={m.name} avatarUrl={m.avatar_url} />
        <div className="min-w-0">
          <p className="truncate font-medium">{m.name}</p>
          {m.classification && <VoiceBadge name={m.classification.name} color={m.classification.color} />}
        </div>
      </div>
      {showClassify && (
        <Button size="sm" variant="outline" onClick={() => openClassify(m)}>
          <Pencil size={14} /> Classificar
        </Button>
      )}
    </div>
  );

  const renderGroup = (group: VoiceGroup) => (
    <Card key={group.id}>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {group.kind === "VOZ" ? <Mic size={16} className="text-primary" /> : <Music size={16} className="text-primary" />}
            {group.name}
          </CardTitle>
          <CardDescription>{group.members.length} membro(s)</CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAddTarget(group);
              setAddQ("");
            }}
          >
            <UserPlus size={14} /> Adicionar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setRenameTarget(group);
              setRenameName(group.name);
            }}
          >
            <Pencil size={14} />
          </Button>
          <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeleteTarget(group)}>
            <Trash2 size={14} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {group.members.map((m) => (
          <div key={m.user_id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
            <div className="flex min-w-0 items-center gap-3">
              <PersonAvatar name={m.name} avatarUrl={m.avatar_url} />
              <div className="min-w-0">
                <p className="truncate font-medium">{m.name}</p>
                {m.classification && m.classification_color && (
                  <VoiceBadge name={m.classification} color={m.classification_color} />
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeMember(group, m.user_id)}
              aria-label={`Remover ${m.name} do grupo`}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        ))}
        {group.members.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum membro — clique em Adicionar.</p>
        )}
      </CardContent>
    </Card>
  );

  const vozGroups = groups.filter((g) => g.kind === "VOZ");
  const musicGroups = groups.filter((g) => g.kind === "MUSICO");
  const addCandidates = addTarget
    ? members.filter(
        (m) =>
          !addTarget.members.some((gm) => gm.user_id === m.id) &&
          (addQ.trim() === "" ||
            m.name.toLowerCase().includes(addQ.toLowerCase()) ||
            m.email.toLowerCase().includes(addQ.toLowerCase())),
      )
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Grupos do Louvor</h1>
        <p className="text-xs text-muted-foreground">
          Classifique as vozes e monte grupos de vozes e músicos para escalar
        </p>
      </div>

      <div className="flex gap-2" role="tablist" aria-label="Seções">
        {([
          { id: "vocal" as Tab, label: "Vocal", icon: Mic },
          { id: "grupos" as Tab, label: "Grupos", icon: Users },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium ${
              tab === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === "vocal" ? (
        <div className="space-y-4">
          {members.length === 0 && (
            <EmptyState title="Nenhum membro no Louvor" hint="Vincule voluntários ao ministério em Ministérios." />
          )}
          {classifications.map((cls) => {
            const inClass = members.filter((m) => m.classification?.id === cls.id);
            return (
              <section
                key={cls.id}
                className="space-y-2 rounded-2xl border p-4"
                style={{ borderColor: cls.color, backgroundColor: `${cls.color}10` }}
              >
                <h2 className="text-sm font-bold" style={{ color: cls.color }}>
                  {cls.name} ({cls.gender === "F" ? "Feminina" : "Masculina"}) — {inClass.length}
                </h2>
                {inClass.map((m) => renderMemberRow(m, true))}
                {inClass.length === 0 && <p className="text-xs text-muted-foreground">Ninguém nesta classificação.</p>}
              </section>
            );
          })}
          <section className="space-y-2 rounded-2xl border border-dashed p-4">
            <h2 className="text-sm font-bold text-muted-foreground">Sem classificação — {unclassified.length}</h2>
            {unclassified.map((m) => renderMemberRow(m, true))}
            {unclassified.length === 0 && (
              <p className="text-xs text-muted-foreground">Todos os membros têm classificação.</p>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          {([
            { kind: "VOZ" as const, title: "Grupos de Voz", list: vozGroups },
            { kind: "MUSICO" as const, title: "Grupos de Músicos", list: musicGroups },
          ]).map(({ kind, title, list }) => (
            <section key={kind} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-muted-foreground">{title}</h2>
                <Button size="sm" onClick={() => setNewKind(kind)}>
                  <Plus size={14} /> Novo grupo
                </Button>
              </div>
              {list.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum grupo — crie o primeiro com "Novo grupo".</p>
              )}
              {list.map(renderGroup)}
            </section>
          ))}
        </div>
      )}

      <Dialog
        open={!!classTarget}
        onClose={() => setClassTarget(null)}
        title={`Classificar — ${classTarget?.name ?? ""}`}
      >
        <div className="space-y-2" role="listbox" aria-label="Classificações">
          <button
            type="button"
            role="option"
            aria-selected={classChoice === ""}
            onClick={() => setClassChoice("")}
            className={`w-full rounded-lg p-3 text-left text-sm ${classChoice === "" ? "bg-primary/10" : "hover:bg-muted"}`}
          >
            Sem classificação
          </button>
          {classifications.map((cls) => (
            <button
              key={cls.id}
              type="button"
              role="option"
              aria-selected={classChoice === String(cls.id)}
              onClick={() => setClassChoice(String(cls.id))}
              className={`flex w-full items-center justify-between rounded-lg p-3 text-left text-sm ${
                classChoice === String(cls.id) ? "bg-primary/10" : "hover:bg-muted"
              }`}
            >
              <VoiceBadge name={cls.name} color={cls.color} />
              <span className="text-xs text-muted-foreground">{cls.gender === "F" ? "Feminina" : "Masculina"}</span>
            </button>
          ))}
        </div>
        <Button className="mt-4 w-full" onClick={saveClassification}>
          Salvar
        </Button>
      </Dialog>

      <Dialog open={!!newKind} onClose={() => setNewKind(null)} title="Novo grupo">
        <div className="space-y-4">
          <Field label="Tipo">
            <Badge variant="secondary">{newKind === "VOZ" ? "Grupo de Voz" : "Grupo de Músicos"}</Badge>
          </Field>
          <Field label="Nome">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Grupo A" autoFocus />
          </Field>
          <Button className="w-full" onClick={createGroup} disabled={!newName.trim()}>
            Criar grupo
          </Button>
        </div>
      </Dialog>

      <Dialog open={!!renameTarget} onClose={() => setRenameTarget(null)} title="Renomear grupo">
        <div className="space-y-4">
          <Field label="Nome">
            <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} autoFocus />
          </Field>
          <Button className="w-full" onClick={renameGroup} disabled={!renameName.trim()}>
            Salvar
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={!!addTarget}
        onClose={() => {
          setAddTarget(null);
          setAddQ("");
        }}
        title={`Adicionar em — ${addTarget?.name ?? ""}`}
      >
        <div className="space-y-4">
          <Input value={addQ} onChange={(e) => setAddQ(e.target.value)} placeholder="Buscar por nome ou email..." />
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border p-2">
            {addCandidates.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => addTarget && addMember(addTarget, m.id)}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm hover:bg-muted"
              >
                <PersonAvatar name={m.name} avatarUrl={m.avatar_url} className="h-7 w-7 text-[10px]" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{m.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                </span>
              </button>
            ))}
            {addCandidates.length === 0 && (
              <p className="p-2 text-sm text-muted-foreground">Nenhum disponível (todos já estão no grupo ou sem resultado).</p>
            )}
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir grupo"
        description={
          deleteTarget
            ? `Excluir "${deleteTarget.name}"? Escalas futuras com este grupo voltarão a ficar em aberto.`
            : undefined
        }
        confirmLabel="Excluir"
        destructive
        onConfirm={deleteGroup}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
