import { cn } from "@/lib/cn";
import { BEHALF, CLAIM_STATUS } from "@/lib/constants";
import type { OnBehalfOf, ClaimStatus } from "@/lib/types";

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card p-5", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  delta,
  deltaUp,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  delta?: string;
  deltaUp?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="label">{label}</p>
        {icon}
      </div>
      <p className="stat mt-1.5">{value}</p>
      {delta && (
        <p
          className={cn(
            "mt-1 flex items-center gap-1 text-xs font-medium",
            deltaUp ? "text-brand-600" : "text-rose"
          )}
        >
          <span>{deltaUp ? "↗" : "↘"}</span>
          {delta}
        </p>
      )}
    </div>
  );
}

export function BehalfBadge({ value }: { value: OnBehalfOf }) {
  const b = BEHALF[value] ?? BEHALF.self;
  return (
    <span
      className="pill"
      style={{ backgroundColor: `${b.color}1a`, color: b.color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: b.color }}
      />
      {b.label}
    </span>
  );
}

export function StatusBadge({ value }: { value: ClaimStatus }) {
  const s = CLAIM_STATUS[value] ?? CLAIM_STATUS.draft;
  return (
    <span
      className="pill"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.dot }}
      />
      {s.label}
    </span>
  );
}

export function Progress({
  value,
  max = 100,
  color = "#93c23e",
  className,
}: {
  value: number;
  max?: number;
  color?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-line", className)}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-canvas text-ink-muted">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-xs text-ink-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function IconBadge({
  children,
  color = "#f4f5f6",
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold"
      style={{ backgroundColor: color }}
    >
      {children}
    </span>
  );
}
