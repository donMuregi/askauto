export function UserChip({ name, subtitle }: { name: string; subtitle?: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?";

  return (
    <span className="hidden items-center gap-2.5 sm:inline-flex">
      <span
        aria-hidden="true"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background"
      >
        {initials}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="max-w-40 truncate text-sm font-medium text-foreground">{name}</span>
        {subtitle ? (
          <span className="max-w-40 truncate text-[11px] text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
    </span>
  );
}

export const signOutButtonClass =
  "inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-foreground";

export const appHeaderClass =
  "sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80";
