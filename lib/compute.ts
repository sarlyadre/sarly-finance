import {
  startOfWeek,
  addDays,
  isSameDay,
  parseISO,
  differenceInCalendarDays,
  format,
  startOfMonth,
  isSameMonth,
} from "date-fns";
import type {
  Transaction,
  Commitment,
  Claim,
  Account,
  Service,
  UsageLog,
  Loan,
  LoanPayment,
} from "@/lib/types";

/** An account's balance expressed in MYR (native balance × fx rate). */
export function accountMYR(a: Account): number {
  return Number(a.balance) * Number(a.fx_rate ?? 1);
}

export function totalBalance(accounts: Account[]): number {
  return accounts.reduce((s, a) => s + accountMYR(a), 0);
}

/** Inter-account movements (card payments etc.) aren't income or spending. */
const isTransfer = (t: Transaction) => t.category === "Transfer";

export function monthFlows(txns: Transaction[], ref = new Date()) {
  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (isTransfer(t)) continue;
    const d = parseISO(t.txn_date);
    if (!isSameMonth(d, ref)) continue;
    if (t.amount >= 0) income += Number(t.amount);
    else expense += Math.abs(Number(t.amount));
  }
  return { income, expense, net: income - expense };
}

/** Bars for the current week: savings(income kept), income, expense per day. */
export function weekBars(txns: Transaction[], ref = new Date()) {
  const start = startOfWeek(ref, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return days.map((day) => {
    let income = 0;
    let expense = 0;
    for (const t of txns) {
      if (isTransfer(t)) continue;
      const d = parseISO(t.txn_date);
      if (!isSameDay(d, day)) continue;
      if (t.amount >= 0) income += Number(t.amount);
      else expense += Math.abs(Number(t.amount));
    }
    return {
      label: format(day, "EEE"),
      date: day,
      income,
      expense,
      savings: Math.max(0, income - expense),
    };
  });
}

export function spendingByCategory(txns: Transaction[], ref = new Date()) {
  const map = new Map<string, number>();
  let total = 0;
  for (const t of txns) {
    if (t.amount >= 0 || isTransfer(t)) continue;
    const d = parseISO(t.txn_date);
    if (!isSameMonth(d, ref)) continue;
    const amt = Math.abs(Number(t.amount));
    const cat = t.category || "Other";
    map.set(cat, (map.get(cat) ?? 0) + amt);
    total += amt;
  }
  return {
    total,
    rows: Array.from(map.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        pct: total ? Math.round((amount / total) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount),
  };
}

/** Compute the next due date for a commitment (falls back to due_day). */
export function nextDueDate(c: Commitment): Date | null {
  if (c.next_due) return parseISO(c.next_due);
  if (c.frequency === "monthly" && c.due_day) {
    const now = new Date();
    let d = new Date(now.getFullYear(), now.getMonth(), c.due_day);
    if (d < startOfMonth(now)) d = addDays(d, 30);
    return d;
  }
  return null;
}

export function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  return differenceInCalendarDays(date, new Date());
}

export function upcomingCommitments(commitments: Commitment[]) {
  return commitments
    .filter((c) => c.is_active)
    .map((c) => {
      const due = nextDueDate(c);
      return { commitment: c, due, days: daysUntil(due) };
    })
    .filter((x) => x.due !== null)
    .sort((a, b) => (a.due!.getTime() - b.due!.getTime()));
}

export function currentPeriodLabel(ref = new Date()): string {
  return format(ref, "MMM yyyy");
}

/** Normalised monthly cost of a service's fixed subscription fee. */
export function monthlyCost(s: Service): number {
  const c = Number(s.cost) || 0;
  if (s.status === "cancelled") return 0;
  switch (s.cycle) {
    case "monthly":
      return c;
    case "yearly":
      return c / 12;
    case "weekly":
      return (c * 52) / 12;
    default:
      return 0; // usage-based handled via usage logs
  }
}

/** Usage (amount + cost) logged for a service in the current period. */
export function periodUsage(
  serviceId: string,
  logs: UsageLog[],
  period = currentPeriodLabel()
) {
  return logs
    .filter((l) => l.service_id === serviceId && l.period_label === period)
    .reduce(
      (acc, l) => ({
        amount: acc.amount + Number(l.amount),
        cost: acc.cost + Number(l.cost),
      }),
      { amount: 0, cost: 0 }
    );
}

export function servicesSummary(services: Service[], logs: UsageLog[]) {
  const active = services.filter((s) => s.status !== "cancelled");
  const period = currentPeriodLabel();

  const fixedMonthly = active.reduce((s, svc) => s + monthlyCost(svc), 0);
  const meteredMonthly = active
    .filter((s) => s.is_metered)
    .reduce((sum, s) => sum + periodUsage(s.id, logs, period).cost, 0);

  const monthlyTotal = fixedMonthly + meteredMonthly;

  const aiServices = active.filter((s) => s.category === "AI" || s.is_metered);
  const aiCost = aiServices.reduce(
    (sum, s) => sum + periodUsage(s.id, logs, period).cost + monthlyCost(s),
    0
  );
  const aiTokens = active
    .filter((s) => s.is_metered)
    .reduce((sum, s) => sum + periodUsage(s.id, logs, period).amount, 0);

  const renewals = active
    .filter((s) => s.renewal_date)
    .map((s) => ({
      service: s,
      due: parseISO(s.renewal_date!),
      days: daysUntil(parseISO(s.renewal_date!)),
    }))
    .sort((a, b) => a.due.getTime() - b.due.getTime());

  return {
    monthlyTotal,
    annualTotal: monthlyTotal * 12,
    activeCount: active.length,
    aiCost,
    aiTokens,
    renewals,
  };
}

// ---- Loans ----
export function loanPaid(loanId: string, payments: LoanPayment[]): number {
  return payments
    .filter((p) => p.loan_id === loanId)
    .reduce((s, p) => s + Number(p.amount), 0);
}

export function loanOutstanding(loan: Loan, payments: LoanPayment[]): number {
  return Math.max(0, Number(loan.principal) - loanPaid(loan.id, payments));
}

export function loanProgress(loan: Loan, payments: LoanPayment[]): number {
  const p = Number(loan.principal);
  if (p <= 0) return 0;
  return Math.min(1, loanPaid(loan.id, payments) / p);
}

export function loansSummary(loans: Loan[], payments: LoanPayment[]) {
  const active = loans.filter((l) => l.status !== "paid");
  let owe = 0; // you owe (borrowed)
  let owed = 0; // owed to you (lent)
  for (const l of active) {
    const out = loanOutstanding(l, payments);
    if (l.direction === "borrowed") owe += out;
    else owed += out;
  }
  const nextDue = active
    .filter((l) => l.next_due && loanOutstanding(l, payments) > 0)
    .map((l) => ({ loan: l, due: parseISO(l.next_due!), days: daysUntil(parseISO(l.next_due!)) }))
    .sort((a, b) => a.due.getTime() - b.due.getTime());
  return { owe, owed, net: owed - owe, count: active.length, nextDue };
}

export function claimTotals(claims: Claim[]) {
  const by = (pred: (c: Claim) => boolean) =>
    claims.filter(pred).reduce((s, c) => s + Number(c.amount), 0);

  const outstanding = by((c) => c.status !== "paid" && c.status !== "rejected");
  const submitted = by((c) => c.status === "submitted");
  const approved = by((c) => c.status === "approved");
  const paid = by((c) => c.status === "paid");
  return { outstanding, submitted, approved, paid, count: claims.length };
}
