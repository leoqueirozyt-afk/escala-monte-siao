interface PersonAvatarProps {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}

export function PersonAvatar({ name, avatarUrl, className = "h-8 w-8 text-xs" }: PersonAvatarProps) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={`${className} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span
      aria-hidden="true"
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
