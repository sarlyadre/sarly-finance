"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addMonths, addWeeks, addYears, parseISO, format } from "date-fns";
import { money, fmtDay, todayISO } from "@/lib/format";
import { BEHALF, BEHALF_OPTIONS } from "@/lib/constants";
import { nextDueDate, daysUntil } from "@/lib/compute";
import type { Commitment, CommitmentPayment, OnBehalfOf } from "@/lib/types";
import { Card, BehalfBadge } from "@/components/ui";
import { PageHead } from "./AccountsView";
import { Modal, Field } from "@/components/Modal";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  CalendarClock,
  RefreshCw,
  Zap,
} from "lucide-react";

type Draft = Partial<Commitment>;

export function CommitmentsView({
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
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [tab, setTab] = useState<"all" | OnBehalfOf>("all");

  const enriched = useMemo(
    () =>
      commitments.map((c) => {
        const due = nextDueDate(c);
        return { c, due, days: daysUntil(due) };
      }),
    [commitments]
  );

  const filtered = enriched.filter((x) =>
    tab === "all" ? true : x.c.on_behalf_of === tab
  );

  const paidThisMonth = new Set(
    payments
      .filter((p) => p.period_label === format(new Date(), "MMM yyyy"))
      .map((p) => p.commitment_id)
  );

  // Totals per entity
  const totals = BEHALF_OPTIONS.map((b) => ({
    key: b,
    ...BEHALF[b],
    total: commitments
      .filter((c) => c.on_behalf_of === b && c.is_active)
      .reduce((s, c) => s + Number(c.amount), 0),
    count: commitments.filter((c) => c.on_behalf_of === b && c.is_active).length,
  }));

  const overdue = enriched.filter(
    (x) => x.days !== null && x.days < 0 && !paidThisMonth.has(x.c.id)
  ).length;

  function startAdd() {
    setDraft({
      on_behalf_of: "self",
      frequency: "monthly",
      amount: 0,
      due_day: 1,
      autopay: false,
      reimbursable: false,
    });
    setOpen(true);
  }
  function startEdit(c: Commitment) {
    setDraft({ ...c });
    setOpen(true);
  }

  async function save() {
    if (!draft.name) return;
    setSaving(true);
    const payload = {
      name: draft.name,
      payee: draft.payee ?? null,
      on_behalf_of: draft.on_behalf_of ?? "self",
      amount: Number(draft.amount ?? 0),
      frequency: draft.frequency ?? "monthly",
      due_day: draft.due_day ? Number(draft.due_day) : null,
      next_due: draft.next_due || nextDueISO(draft),
      autopay: !!draft.autopay,
      reimbursable: !!draft.reimbursable,
      notes: draft.notes ?? null,
      is_active: draft.is_active ?? true,
    };
    if (draft.id) {
      await supabase.from("commitments").update(payload).eq("id", draft.id);
    } else {
      await supabase
        .from("commitments")
        .insert({ ...payload, owner_id: userId });
    }
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  async function markPaid(c: Commitment) {
    setBusy(c.id);
    const period = format(new Date(), "MMM yyyy");
    await supabase.from("commitment_payments").insert({
      commitment_id: c.id,
      owner_id: userId,
      paid_date: todayISO(),
      amount: Number(c.amount),
      period_label: period,
      status: "paid",
    });
    // advance next due
    const base = nextDueDate(c) ?? new Date();
    let next: Date | null = null;
    if (c.frequency === "monthly") next = addMonths(base, 1);
    else if (c.frequency === "weekly") next = addWeeks(base, 1);
    else if (c.frequency === "yearly") next = addYears(base, 1);
    await supabase
      .from("commitments")
      .update({ next_due: next ? format(next, "yyyy-MM-dd") : null })
      .eq("id", c.id);

    // Auto-create a reimbursement claim if flagged
    if (c.reimbursable) {
      await supabase.from("claims").insert({
        owner_id: userId,
        kind: "reimbursement",
        title: `${c.name} — ${period}`,
        amount: Number(c.amount),
        claim_date: todayISO(),
        on_behalf_of: c.on_behalf_of,
        status: "draft",
        notes: "Auto-created from a paid commitment.",
      });
    }
    setBusy(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this commitment and its payment history?")) return;
    await supabase.from("commitments").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <PageHead
        title="Commitments"
        subtitle="Recurring bills — including what you pay on behalf of others"
        action={
          <button onClick={startAdd} className="btn-dark text-sm">
            <Plus className="h-4 w-4" /> Add commitment
          </button>
        }
      />

      {/* Totals per entity */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {totals.map((t) => (
          <Card key={t.key} className="p-4">
            <div className="flex items-center justify-between">
              <span
                className="pill"
                style={{ backgroundColor: `${t.color}1a`, color: t.color }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                {t.label}
              </span>
              <span className="text-xs text-ink-muted">{t.count} bills</span>
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight">
              {money(t.total)}
            </p>
            <p className="text-[11px] text-ink-muted">committed / period</p>
          </Card>
        ))}
      </div>

      {overdue > 0 && (
        <div className="flex items-center gap-2 rounded-2xl bg-rose/10 px-4 py-3 text-sm text-rose">
          <CalendarClock className="h-4 w-4" />
          {overdue} commitment{overdue === 1 ? " is" : "s are"} overdue — settle
          them to stay on time.
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {(["all", ...BEHALF_OPTIONS] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition " +
              (tab === t
                ? "bg-ink text-white"
                : "bg-card text-ink-muted shadow-card hover:text-ink")
            }
          >
            {t === "all" ? "All" : BEHALF[t].label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center py-12 text-center">
            <CalendarClock className="h-8 w-8 text-ink-soft" />
            <p className="mt-3 text-sm font-semibold">No commitments here</p>
            <p className="mt-1 text-xs text-ink-muted">
              Add recurring bills and mark them paid each period to keep a clean
              record.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(({ c, due, days }) => {
            const paid = paidThisMonth.has(c.id);
            const overdueRow = days !== null && days < 0 && !paid;
            const soon = days !== null && days >= 0 && days <= 3 && !paid;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                    style={{
                      backgroundColor: `${BEHALF[c.on_behalf_of].color}1a`,
                      color: BEHALF[c.on_behalf_of].color,
                    }}
                  >
                    {c.name.slice(0, 2).toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{c.name}</p>
                      <BehalfBadge value={c.on_behalf_of} />
                      {c.autopay && (
                        <span className="pill bg-brand-50 text-brand-700">
                          <Zap className="h-3 w-3" /> Autopay
                        </span>
                      )}
                      {c.reimbursable && (
                        <span className="pill bg-sky/10 text-sky">
                          claimable
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                      <RefreshCw className="h-3 w-3" />
                      <span className="capitalize">{c.frequency}</span>
                      {c.payee ? ` · ${c.payee}` : ""}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-base font-bold">{money(c.amount)}</p>
                    <p
                      className={
                        "text-[11px] font-medium " +
                        (paid
                          ? "text-brand-600"
                          : overdueRow
                          ? "text-rose"
                          : soon
                          ? "text-tangerine"
                          : "text-ink-muted")
                      }
                    >
                      {paid
                        ? "Paid this period"
                        : due
                        ? `Due ${fmtDay(due)}${
                            days !== null
                              ? days < 0
                                ? ` · ${Math.abs(days)}d late`
                                : days === 0
                                ? " · today"
                                : ` · in ${days}d`
                              : ""
                          }`
                        : "No due date"}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => markPaid(c)}
                      disabled={busy === c.id || paid}
                      className={
                        "flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition " +
                        (paid
                          ? "cursor-default bg-brand-50 text-brand-600"
                          : "bg-brand-400 text-ink hover:bg-brand-500")
                      }
                    >
                      {busy === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      {paid ? "Paid" : "Mark paid"}
                    </button>
                    <button
                      onClick={() => startEdit(c)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-line hover:text-ink"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => remove(c.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-rose/10 hover:text-rose"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={draft.id ? "Edit commitment" : "Add commitment"}
        subtitle="A recurring bill or payment you're responsible for."
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
          <Field label="Name">
            <input
              className="input"
              value={draft.name ?? ""}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Office rent, Internet, Insurance"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (RM)">
              <input
                type="number"
                step="0.01"
                className="input"
                value={draft.amount ?? 0}
                onChange={(e) =>
                  setDraft({ ...draft, amount: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="On behalf of">
              <select
                className="input"
                value={draft.on_behalf_of ?? "self"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    on_behalf_of: e.target.value as OnBehalfOf,
                  })
                }
              >
                {BEHALF_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {BEHALF[b].label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Frequency">
              <select
                className="input capitalize"
                value={draft.frequency ?? "monthly"}
                onChange={(e) =>
                  setDraft({ ...draft, frequency: e.target.value as any })
                }
              >
                {["monthly", "weekly", "yearly", "once"].map((f) => (
                  <option key={f} value={f} className="capitalize">
                    {f}
                  </option>
                ))}
              </select>
            </Field>
            {draft.frequency === "monthly" || !draft.frequency ? (
              <Field label="Due day of month">
                <input
                  type="number"
                  min={1}
                  max={31}
                  className="input"
                  value={draft.due_day ?? 1}
                  onChange={(e) =>
                    setDraft({ ...draft, due_day: Number(e.target.value) })
                  }
                />
              </Field>
            ) : (
              <Field label="Next due date">
                <input
                  type="date"
                  className="input"
                  value={draft.next_due ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, next_due: e.target.value })
                  }
                />
              </Field>
            )}
          </div>
          <Field label="Payee (optional)">
            <input
              className="input"
              value={draft.payee ?? ""}
              onChange={(e) => setDraft({ ...draft, payee: e.target.value })}
              placeholder="Who gets paid"
            />
          </Field>
          <div className="flex flex-col gap-2 rounded-xl bg-canvas p-3">
            <Toggle
              checked={!!draft.autopay}
              onChange={(v) => setDraft({ ...draft, autopay: v })}
              label="Autopay enabled"
              hint="Paid automatically by the bank"
            />
            <Toggle
              checked={!!draft.reimbursable}
              onChange={(v) => setDraft({ ...draft, reimbursable: v })}
              label="Claim back after paying"
              hint="Auto-creates a reimbursement claim when marked paid"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function nextDueISO(d: Draft): string | null {
  if (d.frequency === "monthly" && d.due_day) {
    const now = new Date();
    const day = Math.min(Number(d.due_day), 28);
    let date = new Date(now.getFullYear(), now.getMonth(), day);
    if (date < now) date = addMonths(date, 1);
    return format(date, "yyyy-MM-dd");
  }
  return d.next_due ?? null;
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 text-left"
    >
      <span
        className={
          "relative h-6 w-10 shrink-0 rounded-full transition " +
          (checked ? "bg-brand-400" : "bg-ink-soft/40")
        }
      >
        <span
          className={
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition " +
            (checked ? "left-[18px]" : "left-0.5")
          }
        />
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
      </span>
    </button>
  );
}
