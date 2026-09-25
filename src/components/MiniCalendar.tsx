import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, toISODate } from "../lib/utils";

interface MiniCalendarProps {
  markedDates: string[];
  unavailableDates?: string[];
  selected?: string | null;
  onSelect?: (date: string) => void;
  mode?: "view" | "range-start";
}

const WEEKDAYS = [
  { short: "D", full: "Domingo" },
  { short: "S", full: "Segunda-feira" },
  { short: "T", full: "Terça-feira" },
  { short: "Q", full: "Quarta-feira" },
  { short: "Q", full: "Quinta-feira" },
  { short: "S", full: "Sexta-feira" },
  { short: "S", full: "Sábado" },
];

export function MiniCalendar({ markedDates = [], unavailableDates = [], selected, onSelect, mode = "view" }: MiniCalendarProps) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const marked = useMemo(() => new Set(markedDates), [markedDates]);
  const unavail = useMemo(() => new Set(unavailableDates), [unavailableDates]);

  const days = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1).getDay();
    const total = new Date(year, month + 1, 0).getDate();
    const list: (Date | null)[] = Array(first).fill(null);
    for (let i = 1; i <= total; i++) list.push(new Date(year, month, i));
    return list;
  }, [cursor]);

  const today = toISODate(new Date());

  return (
    <div className="rounded-2xl border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Mês anterior"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold">
          {cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          aria-label="Próximo mês"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w.full} className="py-1 text-xs font-medium text-muted-foreground" title={w.full}>
            <span aria-hidden="true">{w.short}</span>
            <span className="sr-only">{w.full}</span>
          </div>
        ))}
        {days.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const iso = toISODate(d);
          const isMarked = marked.has(iso);
          const isUnavail = unavail.has(iso);
          const isSelected = selected === iso;
          const interactive = typeof onSelect === "function";
          return (
            <button
              key={iso}
              type="button"
              disabled={!interactive}
              tabIndex={interactive ? undefined : -1}
              onClick={() => onSelect?.(iso)}
              aria-label={`${d.getDate()} de ${d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}${isMarked ? ", escalado" : ""}${isUnavail ? ", indisponível" : ""}${isSelected ? ", selecionado" : ""}`}
              aria-current={iso === today ? "date" : undefined}
              aria-pressed={isSelected || undefined}
              className={cn(
                "relative flex h-11 flex-col items-center justify-center rounded-xl text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !interactive && "cursor-default hover:bg-transparent focus-visible:ring-0 disabled:opacity-100",
                isSelected && "bg-primary text-primary-foreground",
                !isSelected && iso === today && "ring-1 ring-primary",
                !isSelected && iso !== today && interactive && "hover:bg-muted",
              )}
            >
              {d.getDate()}
              <span
                className={cn(
                  "absolute bottom-1 h-1.5 w-1.5 rounded-full",
                  isMarked && !isSelected && "bg-success",
                  isMarked && isSelected && "bg-white",
                  !isMarked && isUnavail && "bg-destructive/70",
                  mode === "range-start" && "opacity-100",
                )}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-success" /> Escalado
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-destructive/70" /> Indisponível
        </span>
      </div>
    </div>
  );
}
