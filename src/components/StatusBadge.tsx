import { Badge } from "./ui/badge";
import type { Schedule } from "../../shared/types";

export function statusVariant(status: string): "success" | "warning" | "destructive" | "muted" {
  if (status === "CONFIRMED") return "success";
  if (status === "DECLINED") return "destructive";
  return "warning";
}

export function statusLabel(schedule: Pick<Schedule, "status" | "user_id" | "group">): string {
  if (!schedule.user_id && !schedule.group) return "Vago";
  if (schedule.status === "CONFIRMED") return "Confirmado";
  if (schedule.status === "DECLINED") return "Recusado";
  return "Pendente";
}

export function StatusBadge({ schedule }: { schedule: Pick<Schedule, "status" | "user_id" | "group"> }) {
  const label = statusLabel(schedule);
  const variant = !schedule.user_id && !schedule.group ? "muted" : statusVariant(schedule.status);
  return <Badge variant={variant}>{label}</Badge>;
}
