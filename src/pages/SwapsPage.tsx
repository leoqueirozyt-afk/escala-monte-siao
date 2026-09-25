import { useState } from "react";
import { Check, X, Handshake } from "lucide-react";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/utils";
import { useAsyncData } from "../lib/use-async-data";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { PersonAvatar } from "../components/ui/person-avatar";
import { Badge } from "../components/ui/badge";
import { toast } from "../components/ui/toast";
import { ErrorState, EmptyState, ListSkeleton } from "../components/ui/load-state";
import type { SwapRequest } from "../../shared/types";

export function SwapsPage() {
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [pending, setPending] = useState<SwapRequest | null>(null);
  const [pendingDecision, setPendingDecision] = useState<"APPROVED" | "REJECTED" | null>(null);
  const { data: swaps = [], status, error, reload } = useAsyncData<SwapRequest[]>(
    () => api.get<SwapRequest[]>("/swaps?pending=1"),
    [],
  );

  const decide = async (id: number, decision: "APPROVED" | "REJECTED") => {
    if (decidingId !== null) return;
    setDecidingId(id);
    try {
      await api.post(`/swaps/${id}/decision`, { decision });
      toast(decision === "APPROVED" ? "Troca aprovada!" : "Troca rejeitada");
      setPending(null);
      setPendingDecision(null);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao decidir", "error");
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Handshake size={20} /> Solicitações de Troca
        </h1>
        <p className="text-sm text-muted-foreground">Aprove ou rejeite pedidos de voluntários</p>
      </div>

      {status === "error" && error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : status === "loading" ? (
        <ListSkeleton rows={3} />
      ) : swaps.length === 0 ? (
        <EmptyState title="Nenhuma solicitação pendente" hint="Novos pedidos de troca aparecerão aqui." />
      ) : (
        swaps.map((s) => (
          <Card key={s.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <PersonAvatar name={s.requester_name ?? "?"} avatarUrl={s.requester_avatar} />
                    <p className="font-semibold">{s.requester_name}</p>
                    <Badge variant="warning">Pendente</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {s.event_title} · {formatDateTime(s.event_date!)} · {s.role_name}
                  </p>
                  {s.target_user_name ? (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <PersonAvatar
                        name={s.target_user_name}
                        avatarUrl={s.target_user_avatar}
                        className="h-5 w-5 text-[9px]"
                      />
                      {`Deseja trocar com ${s.target_user_name}`}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Sem alvo definido — líder escolhe</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="success"
                  className="flex-1"
                  disabled={decidingId === s.id}
                  onClick={() => {
                    setPending(s);
                    setPendingDecision("APPROVED");
                  }}
                >
                  <Check size={14} /> Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                  disabled={decidingId === s.id}
                  onClick={() => {
                    setPending(s);
                    setPendingDecision("REJECTED");
                  }}
                >
                  <X size={14} /> Rejeitar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <ConfirmDialog
        open={!!pending && pendingDecision !== null}
        title={pendingDecision === "APPROVED" ? "Aprovar troca" : "Rejeitar troca"}
        description={
          pending
            ? pendingDecision === "APPROVED"
              ? `Aprovar a troca de ${pending.requester_name} em ${pending.event_title}? O escalado será substituído.`
              : `Rejeitar o pedido de troca de ${pending.requester_name} em ${pending.event_title}?`
            : undefined
        }
        confirmLabel={pendingDecision === "APPROVED" ? "Aprovar" : "Rejeitar"}
        destructive={pendingDecision === "REJECTED"}
        busy={decidingId !== null}
        onConfirm={() => pending && pendingDecision && decide(pending.id, pendingDecision)}
        onClose={() => {
          if (decidingId === null) {
            setPending(null);
            setPendingDecision(null);
          }
        }}
      />
    </div>
  );
}
