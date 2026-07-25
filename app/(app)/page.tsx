import Link from "next/link";
import {
  getAccounts,
  getTransactions,
  getCommitments,
  getClaims,
} from "@/lib/data";
import {
  totalBalance,
  monthFlows,
  weekBars,
  spendingByCategory,
  upcomingCommitments,
  claimTotals,
  nextDueDate,
} from "@/lib/compute";
import { money, moneySigned, fmtDay, fmtDate } from "@/lib/format";
import { CATEGORY_COLORS, BEHALF } from "@/lib/constants";
import { Card, CardHeader, BehalfBadge, Progress, EmptyState } from "@/components/ui";
import { WeeklyBars } from "@/components/charts/WeeklyBars";
import { Gauge } from "@/components/charts/Gauge";
import {
  TrendingUp,
  TrendingDown,
  PiggyBank,
  CalendarClock,
  ArrowUpRight,
  ReceiptText,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [accounts, txns, commitments, claims] = await Promise.all([
    getAccounts(),
    getTransactions(),
    getCommitments(),
    getClaims(),
  ]);

  const balance = totalBalance(accounts);
  const flows = monthFlows(txns);
  const bars = weekBars(txns);
  const cats = spendingByCategory(txns);
  const upcoming = upcomingCommitments(commitments).slice(0, 5);
  const claimSum = claimTotals(claims);
  const savingsRate =
    flows.income > 0 ? (flows.net / flows.income) * 100 : 0;

  const acctName = new Map(accounts.map((a) => [a.id, a.name]));
  const recent = txns.slice(0, 7);

  const now = new Date();
  const greeting =
    now.getHours() < 12
      ? "Good morning"
      : now.getHours() < 18
      ? "Good afternoon"
      : "Good evening";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            {greeting} 👋
          </h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            Here's your household overview for {fmtDate(now, "MMMM yyyy")}.
          </p>
        </div>
      </div>

      {/* Row 1: balance + stats */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="label">Total balance</p>
              <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                {money(balance)}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Across {accounts.length} account
                {accounts.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <Legend color="#f2d24b" label="Savings" />
              <Legend color="#b0d55a" label="Income" />
              <Legend color="#ec9b52" label="Expense" />
            </div>
          </div>
          <div className="mt-4">
            <WeeklyBars data={bars} />
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <MiniStat
            icon={<TrendingUp className="h-4 w-4 text-brand-600" />}
            label="Income this month"
            value={money(flows.income)}
            tint="#f4f9e8"
          />
          <MiniStat
            icon={<TrendingDown className="h-4 w-4 text-tangerine" />}
            label="Expenses this month"
            value={money(flows.expense)}
            tint="#fdf3ea"
          />
          <MiniStat
            icon={<PiggyBank className="h-4 w-4 text-brand-700" />}
            label="Net saved"
            value={money(flows.net)}
            tint="#eef6dd"
          />
        </div>
      </div>

      {/* Row 2: commitments + claims */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Upcoming commitments"
            subtitle="Bills & payments due — stay on time"
            action={
              <Link href="/commitments" className="btn-ghost text-xs">
                View all <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {upcoming.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="h-5 w-5" />}
              title="No commitments yet"
              hint="Add recurring bills — including ones you pay on behalf of [SA]² or gbi — to get due-date reminders."
              action={
                <Link href="/commitments" className="btn-brand text-xs">
                  Add a commitment
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map(({ commitment: c, due, days }) => {
                const overdue = days !== null && days < 0;
                const soon = days !== null && days >= 0 && days <= 3;
                return (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold"
                      style={{
                        backgroundColor: `${BEHALF[c.on_behalf_of].color}1a`,
                        color: BEHALF[c.on_behalf_of].color,
                      }}
                    >
                      {c.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <BehalfBadge value={c.on_behalf_of} />
                        {c.reimbursable && (
                          <span className="text-[11px] text-ink-soft">
                            claimable
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{money(c.amount)}</p>
                      <p
                        className={
                          "text-[11px] font-medium " +
                          (overdue
                            ? "text-rose"
                            : soon
                            ? "text-tangerine"
                            : "text-ink-muted")
                        }
                      >
                        {due ? fmtDay(due) : "—"}
                        {days !== null &&
                          ` · ${
                            overdue
                              ? `${Math.abs(days)}d overdue`
                              : days === 0
                              ? "today"
                              : `in ${days}d`
                          }`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Claims tracker"
            subtitle="Money to get back"
            action={
              <Link href="/claims" className="btn-ghost text-xs">
                <ReceiptText className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="rounded-2xl bg-canvas p-4">
            <p className="label">Outstanding</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">
              {money(claimSum.outstanding)}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {claimSum.count} claim{claimSum.count === 1 ? "" : "s"} tracked
            </p>
          </div>
          <div className="mt-4 space-y-3">
            <ClaimBar
              label="Submitted"
              value={claimSum.submitted}
              total={claimSum.outstanding}
              color="#5b9bd5"
            />
            <ClaimBar
              label="Approved"
              value={claimSum.approved}
              total={claimSum.outstanding}
              color="#93c23e"
            />
            <ClaimBar
              label="Paid out"
              value={claimSum.paid}
              total={Math.max(claimSum.paid, claimSum.outstanding)}
              color="#74a02e"
            />
          </div>
        </Card>
      </div>

      {/* Row 3: cost analysis + health + recent */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Cost analysis" subtitle="Spending this month" />
          <p className="stat">{money(cats.total)}</p>
          {cats.rows.length === 0 ? (
            <p className="mt-4 text-xs text-ink-soft">No expenses yet.</p>
          ) : (
            <>
              <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-line">
                {cats.rows.map((r) => (
                  <div
                    key={r.category}
                    style={{
                      width: `${r.pct}%`,
                      backgroundColor:
                        CATEGORY_COLORS[r.category] ?? "#b6bbc2",
                    }}
                  />
                ))}
              </div>
              <ul className="mt-4 space-y-2">
                {cats.rows.slice(0, 6).map((r) => (
                  <li
                    key={r.category}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{
                        backgroundColor:
                          CATEGORY_COLORS[r.category] ?? "#b6bbc2",
                      }}
                    />
                    <span className="flex-1 text-ink-muted">{r.category}</span>
                    <span className="font-medium">{r.pct}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Financial health" subtitle="Savings rate" />
          <div className="flex flex-1 items-center">
            <Gauge
              value={savingsRate}
              label="of income saved"
              sublabel="Based on this month's income vs. expenses."
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Recent activity"
            subtitle="Latest transactions"
            action={
              <Link href="/transactions" className="btn-ghost text-xs">
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {recent.length === 0 ? (
            <p className="text-xs text-ink-soft">No transactions yet.</p>
          ) : (
            <ul className="space-y-1">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-1.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
                    style={{
                      backgroundColor: `${
                        CATEGORY_COLORS[t.category || "Other"] ?? "#b6bbc2"
                      }22`,
                      color: CATEGORY_COLORS[t.category || "Other"] ?? "#8b9099",
                    }}
                  >
                    {(t.description || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {t.description}
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      {fmtDay(t.txn_date)} ·{" "}
                      {acctName.get(t.account_id ?? "") ?? "—"}
                    </p>
                  </div>
                  <span
                    className={
                      "text-sm font-semibold " +
                      (t.amount >= 0 ? "text-brand-600" : "text-ink")
                    }
                  >
                    {moneySigned(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-ink-muted">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function MiniStat({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="label">{label}</p>
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ backgroundColor: tint }}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-xl font-bold tracking-tight">{value}</p>
    </Card>
  );
}

function ClaimBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className="font-medium">{money(value)}</span>
      </div>
      <Progress value={value} max={total || 1} color={color} />
    </div>
  );
}
