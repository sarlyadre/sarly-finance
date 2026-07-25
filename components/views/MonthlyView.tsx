"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  isSameMonth,
  parseISO,
  getDaysInMonth,
} from "date-fns";
import { money, fmtDay, todayISO } from "@/lib/format";
import { BEHALF, BEHALF_OPTIONS } from "@/lib/constants";
import type { Commitment, CommitmentPayment } from "@/lib/types";
import { Card, Progress } from "@/components/ui";
import { PageHead } from "./AccountsView";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  CalendarCheck,
  AlertTriangle,
} from "lucide-react";

export function MonthlyView({
  commitments,
  payments,
  userId,
}: {
  commitments: Commitment[];
  payments: CommitmentPayment[];
  userId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [monthRef, setMonthRef] = useState(() => startOfMonth(new Date()));
  const [busy, setBusy] = useState<string | null>(null);

  const periodLabel = format(monthRef, "MMM yyyy");
  const isCurrentMonth = isSameMonth(monthRef, new Date());

  // Payments recorded for the month being viewed.
  const paidMap = useMemo(() => {
    const m = new Map<string, CommitmentPayment>();
    for (const p of payments) if (p.period_label === periodLabel) m.set(p.commitment_id, p);
    return m;
  }, [payments, periodLabel]);

  // Which commitments belong to this month.
  const rows = useMemo(() => {
    return commitments
      .filter((c) => c.is_active)
      .filter((c) => {
        if (c.frequency === "monthly") return true;
        if (paidMap.has(c.id)) return true;
        return c.next_due ? isSameMonth(parseISO(c.next_due), monthRef) : false;
      })
      .map((c) => {
        // Due date within the viewed month.
        let due: Date | null = null;
        if (c.frequency === "monthly" && c.due_day) {
          const day = Math.min(c.due_day, getDaysInMonth(monthRef));
          due = new Date(monthRef.getFullYear(), monthRef.getMonth(), day);
        } else if (c.next_due) {
          const nd = parseISO(c.next_due);
          if (isSameMonth(nd, monthRef)) due = nd;
        }
        const payment = paidMap.get(c.id) ?? null;
        const overdue = !payment && due != null && due.getTime() < Date.now();
        return { c, due, payment, overdue };
      })
      .sort((a, b) => {
        if (a.due && b.due) return a.due.getTime() - b.due.getTime();
        return a.due ? -1 : b.due ? 1 : 0;
      });
  }, [commitments, paidMap, monthRef]);

  const total = rows.reduce((s, r) => s + Number(r.c.amount), 0);
  const paidTotal = rows
    .filter((r) => r.payment)
    .reduce((s, r) => s + Number(r.payment!.amount ?? r.c.amount), 0);
  const paidCount = rows.filter((r) => r.payment).length;
  const overdueCount = rows.filter((r) => r.overdue).length;

  /** Sensible default payment date: today for the current month, else the due date. */
  function defaultPaidDate(due: Date | null) {
    if (isCurrentMonth) return todayISO();
    if (due) return format(due, "yyyy-MM-dd");
    return format(monthRef, "yyyy-MM-dd");
  }

  async function toggle(row: (typeof rows)[number]) {
    setBusy(row.c.id);
    if (row.payment) {
      await supabase
        .from("commitment_payments")
        .delete()
        .eq("id", row.payment.id);
    } else {
      await supabase.from("commitment_payments").insert({
        commitment_id: row.c.id,
        owner_id: userId,
        paid_date: defaultPaidDate(row.due),
        amount: Number(row.c.amount),
        period_label: periodLabel,
        status: "paid",
      });
    }
    setBusy(null);
    router.refresh();
  }

  async function setPaidDate(row: (typeof rows)[number], date: string) {
    if (!row.payment || !date) return;
    await supabase
      .from("commitment_payments")
      .update({ paid_date: date })
      .eq("id", row.payment.id);
    router.refresh();
  }

  // Per-entity subtotals for this month.
  const byEntity = BEHALF_OPTIONS.map((b) => {
    const list = rows.filter((r) => r.c.on_behalf_of === b);
    return {
      key: b,
      ...BEHALF[b],
      total: list.reduce((s, r) => s + Number(r.c.amount), 0),
      paid: list.filter((r) => r.payment).length,
      count: list.length,
    };
  }).filter((e) => e.count > 0);

  return (
    <div className="space-y-5">
      <PageHead
        title="Monthly commitments"
        subtitle="Tick off each bill as you pay it — month by month"
        action={
          <div className="flex items-center gap-1 rounded-full border border-line bg-card p-1 shadow-card">
            <button
              onClick={() => setMonthRef((m) => subMonths(m, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-line hover:text-ink"
              title="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[120px] text-center text-sm font-semibold">
              {format(monthRef, "MMMM yyyy")}
            </span>
            <button
              onClick={() => setMonthRef((m) => addMonths(m, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-line hover:text-ink"
              title="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <p className="label">Due this month</p>
          <p className="mt-1 text-xl font-bold">{money(total)}</p>
        </Card>
        <Card className="p-4">
          <p className="label">Paid</p>
          <p className="mt-1 text-xl font-bold text-brand-600">
            {money(paidTotal)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="label">Outstanding</p>
          <p className="mt-1 text-xl font-bold text-tangerine">
            {money(Math.max(0, total - paidTotal))}
          </p>
        </Card>
        <Card className="p-4">
          <p className="label">Progress</p>
          <p className="mt-1 text-xl font-bold">
            {paidCount}/{rows.length}
          </p>
          <div className="mt-2">
            <Progress value={paidCount} max={Math.max(1, rows.length)} />
          </div>
        </Card>
      </div>

      {overdueCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-tangerine/30 bg-tangerine/5 px-3 py-2.5 text-sm text-tangerine">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {overdueCount} bill{overdueCount === 1 ? " is" : "s are"} past their
          due date and not ticked off.
        </div>
      )}

      {/* Entity subtotals */}
      {byEntity.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byEntity.map((e) => (
            <span
              key={e.key}
              className="pill"
              style={{ backgroundColor: `${e.color}1a`, color: e.color }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: e.color }}
              />
              {e.label}: {money(e.total)} · {e.paid}/{e.count} paid
            </span>
          ))}
        </div>
      )}

      {/* Checklist */}
      {rows.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center py-12 text-center">
            <CalendarCheck className="h-8 w-8 text-ink-soft" />
            <p className="mt-3 text-sm font-semibold">
              Nothing scheduled for {format(monthRef, "MMMM yyyy")}
            </p>
            <p className="mt-1 max-w-xs text-xs text-ink-muted">
              Add recurring bills on the Commitments page and they'll appear here
              each month.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-line">
            {rows.map((row, i) => {
              const { c, due, payment, overdue } = row;
              const behalf = BEHALF[c.on_behalf_of];
              return (
                <li
                  key={c.id}
                  className={
                    "flex flex-wrap items-center gap-3 px-4 py-3 transition-colors " +
                    (payment
                      ? "bg-brand-50/40"
                      : i % 2 === 1
                      ? "bg-canvas/50"
                      : "")
                  }
                >
                  {/* Tick box */}
                  <button
                    onClick={() => toggle(row)}
                    disabled={busy === c.id}
                    title={payment ? "Mark as unpaid" : "Mark as paid"}
                    className={
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition " +
                      (payment
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-ink-soft/50 bg-white hover:border-brand-400")
                    }
                  >
                    {payment && <Check className="h-4 w-4" />}
                  </button>

                  {/* Name + entity */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        "truncate text-sm font-medium " +
                        (payment ? "text-ink-muted line-through" : "")
                      }
                    >
                      {c.name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
                      <span
                        className="pill px-2 py-0"
                        style={{
                          backgroundColor: `${behalf.color}1a`,
                          color: behalf.color,
                        }}
                      >
                        {behalf.label}
                      </span>
                      {c.payee && <span>{c.payee}</span>}
                      {c.autopay && <span>· autopay</span>}
                    </div>
                  </div>

                  {/* Due date */}
                  <div className="w-[110px] text-xs">
                    <span className="label block">Due</span>
                    <span
                      className={
                        overdue ? "font-semibold text-rose" : "text-ink-muted"
                      }
                    >
                      {due ? fmtDay(due) : "—"}
                    </span>
                  </div>

                  {/* Paid date (editable once ticked) */}
                  <div className="w-[150px] text-xs">
                    <span className="label block">Paid on</span>
                    {payment ? (
                      <input
                        type="date"
                        value={payment.paid_date}
                        onChange={(e) => setPaidDate(row, e.target.value)}
                        className="input px-2 py-1 text-xs"
                      />
                    ) : (
                      <span className="text-ink-soft">not yet</span>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="w-[110px] text-right text-sm font-semibold">
                    {money(c.amount)}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
