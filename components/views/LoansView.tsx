"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addMonths, addWeeks, addYears, format } from "date-fns";
import { money, fmtDay, todayISO } from "@/lib/format";
import { LOAN_PARTY, LOAN_PARTY_OPTIONS, LOAN_STATUS } from "@/lib/constants";
import {
  loanPaid,
  loanOutstanding,
  loanProgress,
  loansSummary,
} from "@/lib/compute";
import type {
  Loan,
  LoanPayment,
  LoanParty,
  LoanDirection,
  LoanStatus,
  Account,
} from "@/lib/types";
import { Card, Progress } from "@/components/ui";
import { PageHead } from "./AccountsView";
import { Modal, Field } from "@/components/Modal";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  HandCoins,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  CalendarClock,
  Check,
} from "lucide-react";

type Draft = Partial<Loan>;
type PayDraft = { loan_id?: string; amount?: number; paid_date?: string; note?: string };

const FREQS: Loan["frequency"][] = ["monthly", "weekly", "yearly", "once"];

export function LoansView({
  loans,
  payments,
  accounts,
  userId,
}: {
  loans: Loan[];
  payments: LoanPayment[];
  accounts: Account[];
  userId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [pay, setPay] = useState<PayDraft>({});
  const [payLoan, setPayLoan] = useState<Loan | null>(null);

  const summary = useMemo(() => loansSummary(loans, payments), [loans, payments]);

  const partyLabel = (l: Loan) =>
    l.counterparty === "other"
      ? l.counterparty_name || "Other"
      : LOAN_PARTY[l.counterparty]?.label ?? "Other";
  const partyColor = (l: Loan) => LOAN_PARTY[l.counterparty]?.color ?? "#ec9b52";

  function startAdd() {
    setDraft({
      direction: "borrowed",
      counterparty: "sa2",
      frequency: "monthly",
      status: "active",
      principal: 0,
      installment: 0,
      start_date: todayISO(),
    });
    setOpen(true);
  }
  function startEdit(l: Loan) {
    setDraft({ ...l });
    setOpen(true);
  }
  function startPay(l: Loan) {
    setPayLoan(l);
    setPay({
      loan_id: l.id,
      amount: Number(l.installment) || undefined,
      paid_date: todayISO(),
    });
    setPayOpen(true);
  }

  async function save() {
    if (!draft.name) return;
    setSaving(true);
    const payload = {
      name: draft.name,
      direction: draft.direction ?? "borrowed",
      counterparty: draft.counterparty ?? "other",
      counterparty_name: draft.counterparty_name ?? null,
      principal: Number(draft.principal ?? 0),
      interest_rate: draft.interest_rate ? Number(draft.interest_rate) : null,
      start_date: draft.start_date || null,
      term_months: draft.term_months ? Number(draft.term_months) : null,
      installment: Number(draft.installment ?? 0),
      frequency: draft.frequency ?? "monthly",
      next_due: draft.next_due || null,
      account_id: draft.account_id ?? null,
      status: draft.status ?? "active",
      notes: draft.notes ?? null,
    };
    if (draft.id) {
      await supabase.from("loans").update(payload).eq("id", draft.id);
    } else {
      await supabase.from("loans").insert({ ...payload, owner_id: userId });
    }
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  async function savePayment() {
    if (!pay.loan_id || !payLoan) return;
    setSaving(true);
    const amount = Number(pay.amount ?? 0);
    await supabase.from("loan_payments").insert({
      loan_id: pay.loan_id,
      owner_id: userId,
      paid_date: pay.paid_date || todayISO(),
      amount,
      note: pay.note ?? null,
    });

    // Advance the next due date and mark paid off if cleared.
    const paidAfter = loanPaid(payLoan.id, payments) + amount;
    const cleared = paidAfter >= Number(payLoan.principal);
    const patch: Partial<Loan> = {};
    if (cleared) {
      patch.status = "paid";
      patch.next_due = null;
    } else if (payLoan.next_due && payLoan.frequency !== "once") {
      const base = new Date(payLoan.next_due);
      const next =
        payLoan.frequency === "weekly"
          ? addWeeks(base, 1)
          : payLoan.frequency === "yearly"
          ? addYears(base, 1)
          : addMonths(base, 1);
      patch.next_due = format(next, "yyyy-MM-dd");
    }
    if (Object.keys(patch).length) {
      await supabase.from("loans").update(patch).eq("id", payLoan.id);
    }
    setSaving(false);
    setPayOpen(false);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this loan and its payment history?")) return;
    await supabase.from("loans").delete().eq("id", id);
    router.refresh();
  }

  const isOther = (draft.counterparty ?? "sa2") === "other";

  return (
    <div className="space-y-5">
      <PageHead
        title="Loans"
        subtitle="What you owe and what's owed to you — including the [SA]² company loan"
        action={
          <button onClick={startAdd} className="btn-dark text-sm">
            <Plus className="h-4 w-4" /> Add loan
          </button>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="You owe"
          value={money(summary.owe)}
          icon={<ArrowUpRight className="h-4 w-4 text-rose" />}
          tint="#fdece9"
        />
        <SummaryCard
          label="Owed to you"
          value={money(summary.owed)}
          icon={<ArrowDownLeft className="h-4 w-4 text-brand-700" />}
          tint="#eef6dd"
        />
        <SummaryCard
          label="Net position"
          value={money(summary.net)}
          sub={summary.net >= 0 ? "in your favour" : "you owe overall"}
          icon={<HandCoins className="h-4 w-4 text-sky" />}
          tint="#eaf1fa"
        />
        <SummaryCard
          label="Next repayment"
          value={
            summary.nextDue[0]
              ? money(summary.nextDue[0].loan.installment)
              : "—"
          }
          sub={
            summary.nextDue[0]
              ? `${partyLabel(summary.nextDue[0].loan)} · ${fmtDay(
                  summary.nextDue[0].loan.next_due!
                )}`
              : "nothing scheduled"
          }
          icon={<CalendarClock className="h-4 w-4 text-tangerine" />}
          tint="#fdf3ea"
        />
      </div>

      {/* List */}
      {loans.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center py-12 text-center">
            <HandCoins className="h-8 w-8 text-ink-soft" />
            <p className="mt-3 text-sm font-semibold">No loans tracked yet</p>
            <p className="mt-1 max-w-xs text-xs text-ink-muted">
              Add the [SA]² company loan or any money you owe or are owed, with a
              repayment schedule.
            </p>
            <button onClick={startAdd} className="btn-brand mt-4 text-sm">
              <Plus className="h-4 w-4" /> Add your first loan
            </button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {loans.map((l) => {
            const paid = loanPaid(l.id, payments);
            const outstanding = loanOutstanding(l, payments);
            const progress = loanProgress(l, payments);
            const st = LOAN_STATUS[l.status];
            const color = partyColor(l);
            const borrowed = l.direction === "borrowed";
            const days =
              l.next_due != null
                ? Math.ceil(
                    (new Date(l.next_due).getTime() - Date.now()) / 86400000
                  )
                : null;
            const overdue = days !== null && days < 0 && outstanding > 0;
            const dueSoon = days !== null && days >= 0 && days <= 7;
            return (
              <Card key={l.id} className="group flex flex-col">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
                      style={{ backgroundColor: color }}
                    >
                      <Landmark className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{l.name}</p>
                      <p className="text-[11px] text-ink-muted">
                        {borrowed ? "From" : "To"} {partyLabel(l)}
                        {l.interest_rate ? ` · ${l.interest_rate}% p.a.` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      onClick={() => startEdit(l)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-line hover:text-ink"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => remove(l.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-rose/10 hover:text-rose"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span
                    className="pill"
                    style={{
                      backgroundColor: borrowed ? "#fdece9" : "#eef6dd",
                      color: borrowed ? "#c0503f" : "#587a26",
                    }}
                  >
                    {borrowed ? "You owe" : "Owed to you"}
                  </span>
                  <span
                    className="pill"
                    style={{ backgroundColor: st.bg, color: st.text }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: st.dot }}
                    />
                    {st.label}
                  </span>
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="label">Outstanding</p>
                    <p className="text-2xl font-bold tracking-tight">
                      {money(outstanding)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="label">Repaid</p>
                    <p className="text-sm font-semibold text-ink-muted">
                      {money(paid)} / {money(l.principal)}
                    </p>
                  </div>
                </div>

                <div className="mt-2">
                  <Progress
                    value={progress * 100}
                    max={100}
                    color={l.status === "paid" ? "#5b9bd5" : color}
                  />
                  <div className="mt-1 flex items-center justify-between text-[11px] text-ink-muted">
                    <span>{Math.round(progress * 100)}% repaid</span>
                    {l.next_due && outstanding > 0 && (
                      <span
                        className={
                          overdue
                            ? "font-medium text-rose"
                            : dueSoon
                            ? "font-medium text-tangerine"
                            : ""
                        }
                      >
                        {money(l.installment)}/{l.frequency.replace("ly", "")} ·{" "}
                        {overdue
                          ? `overdue ${Math.abs(days!)}d`
                          : `due ${fmtDay(l.next_due)}`}
                      </span>
                    )}
                  </div>
                </div>

                {outstanding > 0 && (
                  <button
                    onClick={() => startPay(l)}
                    className="btn-brand mt-4 w-full text-sm"
                  >
                    <Check className="h-4 w-4" /> Record repayment
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Loan modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={draft.id ? "Edit loan" : "Add loan"}
        subtitle="Track money you owe or are owed, with a repayment schedule."
        footer={
          <>
            <button onClick={() => setOpen(false)} className="btn-ghost text-sm">
              Cancel
            </button>
            <button onClick={save} disabled={saving} className="btn-dark text-sm">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Loan name">
            <input
              className="input"
              value={draft.name ?? ""}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. [SA]² company loan"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Direction">
              <select
                className="input"
                value={draft.direction ?? "borrowed"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    direction: e.target.value as LoanDirection,
                  })
                }
              >
                <option value="borrowed">I borrowed (I owe)</option>
                <option value="lent">I lent (owed to me)</option>
              </select>
            </Field>
            <Field label="Counterparty">
              <select
                className="input"
                value={draft.counterparty ?? "sa2"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    counterparty: e.target.value as LoanParty,
                  })
                }
              >
                {LOAN_PARTY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {LOAN_PARTY[p].label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {isOther && (
            <Field label="Who (name)">
              <input
                className="input"
                value={draft.counterparty_name ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, counterparty_name: e.target.value })
                }
                placeholder="e.g. Public Bank, John"
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Principal (RM)">
              <input
                type="number"
                step="0.01"
                className="input"
                value={draft.principal ?? 0}
                onChange={(e) =>
                  setDraft({ ...draft, principal: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Interest % p.a. (optional)">
              <input
                type="number"
                step="0.01"
                className="input"
                value={draft.interest_rate ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, interest_rate: Number(e.target.value) })
                }
                placeholder="0"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Repayment amount (RM)">
              <input
                type="number"
                step="0.01"
                className="input"
                value={draft.installment ?? 0}
                onChange={(e) =>
                  setDraft({ ...draft, installment: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Frequency">
              <select
                className="input capitalize"
                value={draft.frequency ?? "monthly"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    frequency: e.target.value as Loan["frequency"],
                  })
                }
              >
                {FREQS.map((f) => (
                  <option key={f} value={f} className="capitalize">
                    {f}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Start date">
              <input
                type="date"
                className="input"
                value={draft.start_date ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, start_date: e.target.value })
                }
              />
            </Field>
            <Field label="Next due">
              <input
                type="date"
                className="input"
                value={draft.next_due ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, next_due: e.target.value })
                }
              />
            </Field>
            <Field label="Term (months)">
              <input
                type="number"
                className="input"
                value={draft.term_months ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, term_months: Number(e.target.value) })
                }
                placeholder="e.g. 12"
              />
            </Field>
          </div>

          <Field label="Repay from / into account">
            <select
              className="input"
              value={draft.account_id ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, account_id: e.target.value })
              }
            >
              <option value="">— none —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Notes (optional)">
            <input
              className="input"
              value={draft.notes ?? ""}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="Any terms or context"
            />
          </Field>
        </div>
      </Modal>

      {/* Payment modal */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={`Record repayment — ${payLoan?.name ?? ""}`}
        subtitle={
          payLoan
            ? `Outstanding ${money(loanOutstanding(payLoan, payments))}`
            : undefined
        }
        footer={
          <>
            <button
              onClick={() => setPayOpen(false)}
              className="btn-ghost text-sm"
            >
              Cancel
            </button>
            <button
              onClick={savePayment}
              disabled={saving}
              className="btn-dark text-sm"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save repayment
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (RM)">
              <input
                type="number"
                step="0.01"
                className="input"
                value={pay.amount ?? 0}
                onChange={(e) =>
                  setPay({ ...pay, amount: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                className="input"
                value={pay.paid_date ?? todayISO()}
                onChange={(e) => setPay({ ...pay, paid_date: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Note (optional)">
            <input
              className="input"
              value={pay.note ?? ""}
              onChange={(e) => setPay({ ...pay, note: e.target.value })}
              placeholder="e.g. July installment"
            />
          </Field>
          <p className="text-xs text-ink-muted">
            The outstanding balance and next due date update automatically. The
            loan is marked paid off once the principal is fully repaid.
          </p>
        </div>
      </Modal>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon,
  tint,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
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
      {sub && <p className="text-[11px] text-ink-muted">{sub}</p>}
    </Card>
  );
}
