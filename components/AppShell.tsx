"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { Profile } from "@/lib/types";
import {
  LayoutGrid,
  Landmark,
  ArrowLeftRight,
  CalendarClock,
  CalendarCheck,
  ReceiptText,
  Boxes,
  FileUp,
  HandCoins,
  Wallet,
  Menu,
  X,
  Search,
  Bell,
  LogOut,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/statements", label: "Import statements", icon: FileUp },
  { href: "/commitments", label: "Commitments", icon: CalendarClock },
  { href: "/monthly", label: "Monthly checklist", icon: CalendarCheck },
  { href: "/loans", label: "Loans", icon: HandCoins },
  { href: "/claims", label: "Claims", icon: ReceiptText },
  { href: "/services", label: "Services & AI", icon: Boxes },
];

function initials(name?: string | null, email?: string | null) {
  const base = name || email || "?";
  return base
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-canvas text-ink"
                : "text-ink-muted hover:bg-canvas/70 hover:text-ink"
            )}
          >
            <Icon
              className={cn("h-[18px] w-[18px]", active && "text-brand-600")}
            />
            {item.label}
            {active && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-400" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-400 text-ink">
        <Wallet className="h-[18px] w-[18px]" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold tracking-tight">Household</p>
        <p className="text-[11px] text-ink-muted">Finance</p>
      </div>
    </div>
  );
}

export function AppShell({
  profile,
  children,
}: {
  profile: Profile | null;
  children: React.ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const name = profile?.full_name || profile?.email || "Member";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1400px]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-card px-4 py-6 lg:flex">
        <Brand />
        <div className="mt-8 flex-1">
          <NavLinks />
        </div>
        <UserFooter name={name} email={profile?.email} />
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
            onClick={() => setDrawer(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-card px-4 py-6 shadow-pop">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                onClick={() => setDrawer(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-line"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-8 flex-1">
              <NavLinks onNavigate={() => setDrawer(false)} />
            </div>
            <UserFooter name={name} email={profile?.email} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-canvas/80 px-4 py-3 backdrop-blur-md sm:px-6">
          <button
            onClick={() => setDrawer(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-card text-ink-muted shadow-card lg:hidden"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>

          <div className="relative hidden max-w-md flex-1 sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              placeholder="Quick search"
              className="w-full rounded-full border border-line bg-card py-2.5 pl-9 pr-4 text-sm outline-none placeholder:text-ink-soft focus:border-brand-300"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-ink-muted shadow-card hover:text-ink">
              <Bell className="h-[18px] w-[18px]" />
            </button>
            <div className="flex items-center gap-2.5 rounded-full bg-card py-1 pl-1 pr-3 shadow-card">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-400 text-xs font-bold text-ink">
                {initials(profile?.full_name, profile?.email)}
              </span>
              <span className="hidden text-sm font-medium sm:block">
                {name}
              </span>
            </div>
          </div>
        </header>

        <main key={pathname} className="page-in flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function UserFooter({
  name,
  email,
}: {
  name: string;
  email?: string | null;
}) {
  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex items-center gap-2.5 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-400 text-xs font-bold text-ink">
          {initials(name, email)}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-[11px] text-ink-muted">{email}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            title="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-canvas hover:text-rose"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
