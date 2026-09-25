import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import {
  isPushSupported,
  getNotificationPermission,
  subscribe,
  unsubscribe,
  serializeSubscription,
} from "@mmmike/web-push/client";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { toast } from "./ui/toast";

type State = "loading" | "iphone" | "unsupported" | "blocked" | "dev" | "off" | "on";

function isIOSDevice(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function NotificationsCard() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (isIOSDevice()) {
        if (alive) setState("iphone");
        return;
      }
      if (!import.meta.env.PROD) {
        if (alive) setState("dev");
        return;
      }
      if (!isPushSupported()) {
        if (alive) setState("unsupported");
        return;
      }
      if (getNotificationPermission() === "denied") {
        if (alive) setState("blocked");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (alive) setState(sub ? "on" : "off");
      } catch {
        if (alive) setState("unsupported");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const activate = async () => {
    setBusy(true);
    try {
      await navigator.serviceWorker.register("/sw.js").catch(() => {});
      const { publicKey } = await api.get<{ publicKey: string }>("/push/public-key");
      const result = await subscribe(publicKey);
      if (result.status === "subscribed") {
        await api.post("/push/subscribe", serializeSubscription(result.subscription));
        toast("Notificações ativadas!");
        setState("on");
      } else if (result.status === "denied") {
        setState("blocked");
        toast("Permissão negada", "error");
      } else {
        setState("unsupported");
        toast("Este navegador não suporta notificações", "error");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao ativar", "error");
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    setBusy(true);
    try {
      const endpoint = await unsubscribe();
      if (endpoint) await api.delete("/push/subscribe", { endpoint });
      toast("Notificações desativadas");
      setState("off");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell size={18} aria-hidden="true" /> Notificações
        </CardTitle>
        <CardDescription>Alertas no seu aparelho: avisos, escalas e trocas</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state === "loading" && (
          <p className="text-sm text-muted-foreground">Verificando suporte...</p>
        )}
        {state === "iphone" && (
          <p className="text-sm text-muted-foreground">Indisponível no iPhone por enquanto.</p>
        )}
        {state === "unsupported" && (
          <p className="text-sm text-muted-foreground">Seu navegador não suporta notificações.</p>
        )}
        {state === "dev" && (
          <p className="text-sm text-muted-foreground">Disponível apenas na versão publicada do app.</p>
        )}
        {state === "blocked" && (
          <p className="text-sm text-destructive">
            Notificações bloqueadas — habilite nas configurações do navegador.
          </p>
        )}
        {state === "off" && (
          <Button onClick={activate} disabled={busy} className="w-full">
            <Bell size={16} /> {busy ? "Ativando..." : "Ativar notificações"}
          </Button>
        )}
        {state === "on" && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <Bell size={16} aria-hidden="true" /> Notificações ativadas
            </p>
            <Button variant="outline" onClick={deactivate} disabled={busy} className="w-full">
              <BellOff size={16} /> {busy ? "Desativando..." : "Desativar"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
