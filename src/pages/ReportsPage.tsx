import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { api } from "../lib/api";
import { monthKey } from "../lib/utils";
import { useAsyncData } from "../lib/use-async-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { ErrorState, EmptyState } from "../components/ui/load-state";
import type { ParticipationRow } from "../../shared/types";

interface Report {
  month: string;
  summary: { total_slots: number; vacancies: number; confirmed: number; declined: number } | null;
  rows: ParticipationRow[];
}

export function ReportsPage() {
  const [month, setMonth] = useState(monthKey());

  const { data: report, status, error, reload } = useAsyncData<Report>(
    () => api.get<Report>(`/reports/participation?month=${month}`),
    [month],
  );

  const max = Math.max(1, ...(report?.rows.map((r) => r.total) ?? [1]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <BarChart3 size={20} /> Participação do mês
          </h1>
          <p className="text-sm text-muted-foreground">Relatório geral de escala</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <span className="sr-only sm:not-sr-only">Mês</span>
          <Input type="month" className="w-44" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>

      {status === "error" && error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : status === "loading" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-busy="true" aria-label="Carregando relatório">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-2 p-4">
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                <div className="h-7 w-12 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {report?.summary && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Vagas no mês", value: report.summary.total_slots },
                { label: "Confirmadas", value: report.summary.confirmed },
                { label: "Vagas abertas", value: report.summary.vacancies },
                { label: "Recusadas", value: report.summary.declined },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-bold">{s.value ?? 0}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Por voluntário</CardTitle>
              <CardDescription>Total de escalas atribuídas no mês</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(report?.rows ?? []).length === 0 && (
                <EmptyState title="Sem dados neste mês" hint="Escolha outro mês ou aguarde novas escalas." />
              )}
              {(report?.rows ?? []).map((r) => (
                <div key={r.user_id} className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
                    <span className="min-w-0 truncate font-medium">{r.name}</span>
                    <span className="flex flex-wrap items-center justify-end gap-1.5">
                      <Badge variant="success">{r.confirmed} conf.</Badge>
                      <Badge variant="warning">{r.pending} pend.</Badge>
                      <Badge variant="destructive">{r.declined} rec.</Badge>
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={`${r.total} escalas de ${r.name}: ${r.confirmed} confirmadas, ${r.pending} pendentes, ${r.declined} recusadas`}
                  >
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(r.total / max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
