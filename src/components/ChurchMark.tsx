import { cn } from "../lib/utils";

export function ChurchMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-white shadow-[0_8px_20px_-6px_rgba(26,26,26,0.35)]",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" className="h-[78%] w-[78%]">
        <path d="M6 54 L20 34 L30 46 L42 24 L58 54 Z" fill="var(--brand-mountain)" />
        <path d="M6 54 L16 42 L28 54 Z" fill="var(--brand-mountain-deep)" />
        <rect x="29.5" y="8" width="5" height="26" rx="1" fill="var(--brand-church)" />
        <rect x="22" y="15" width="20" height="5" rx="1" fill="var(--brand-church)" />
      </svg>
    </span>
  );
}
