import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./button";
import { Card, CardContent } from "./card";
import { cn } from "../../lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-muted", className)}
      aria-hidden="true"
    />
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <Card className={cn("border-destructive/30", className)} role="alert">
      <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium">Não foi possível carregar</p>
            <p className="mt-0.5 text-muted-foreground">{message}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0">
          <RefreshCw size={14} /> Tentar de novo
        </Button>
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-6 text-center">
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
        {action && <div className="mt-3">{action}</div>}
      </CardContent>
    </Card>
  );
}

export function HeroSkeleton() {
  return (
    <Card
      className="overflow-hidden border-church/30 bg-[linear-gradient(155deg,var(--brand-church)_0%,#A00F26_48%,var(--brand-mountain)_100%)]"
      aria-busy="true"
      aria-label="Carregando próxima escala"
    >
      <CardContent className="space-y-3 p-5">
        <Skeleton className="h-3 w-24 bg-white/20" />
        <Skeleton className="h-6 w-2/3 bg-white/20" />
        <Skeleton className="h-4 w-1/2 bg-white/20" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-28 rounded-full bg-white/20" />
          <Skeleton className="h-7 w-20 rounded-full bg-white/20" />
          <Skeleton className="h-7 w-16 rounded-full bg-white/20" />
        </div>
        <Skeleton className="h-11 w-full bg-white/15" />
      </CardContent>
    </Card>
  );
}
