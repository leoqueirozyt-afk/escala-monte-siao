interface VoiceBadgeProps {
  name: string;
  color: string;
  className?: string;
}

export function VoiceBadge({ name, color, className = "" }: VoiceBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${className}`}>
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}
