import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

let nextId = 1;
let listeners: ((t: Toast) => void)[] = [];

export function toast(message: string, type: "success" | "error" = "success") {
  const t = { id: nextId++, message, type };
  listeners.forEach((l) => l(t));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener = (t: Toast) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 3500);
    };
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.type === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto w-full max-w-sm rounded-xl px-4 py-3 text-sm text-white shadow-lg",
            t.type === "success" ? "bg-success" : "bg-destructive",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
