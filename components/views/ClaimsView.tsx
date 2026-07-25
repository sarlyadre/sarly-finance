"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { money, fmtDate, todayISO } from "@/lib/format";
import {
  CLAIM_KINDS,
  CLAIM_STATUS,
  BEHALF,
  BEHALF_OPTIONS,
} from "@/lib/constants";
import type {
  Claim,
  ClaimKind,
  ClaimStatus,
  OnBehalfOf,
} from "@/lib/types";
import { Card, StatusBadge, BehalfBadge } from "@/components/ui";
import { PageHead } from "./AccountsView";
import { Modal, Field } from "@/components/Modal";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ReceiptText,
  Utensils,
  HeartPulse,
  Undo2,
  ChevronRight,
} from "lucide-react";

const KIND_ICON: Record<ClaimKind, React.ReactNode> = {
  reimbursement: <Undo2 className="h-4 w-4" />,
  food: <Utensils className="h-4 w-4" />,
  health: <HeartPulse className="h-4 w-4" />,
};

const STATUS_FLOW: ClaimStatus[] = [
  "draft",
  "submitted",
  "approved",
  "paid",
];

type Draft = Partial<Claim>;

export function ClaimsView({
  claims,
  userId,
  userName,
}: {
  claims: Claim[];
  userId: string;
  userName: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [tab, setTab] = useState<"all" | ClaimKind>("all");

  const filtered = useMemo(
    () => (tab === "all" ? claims : claims.filter((c) => c.kind === tab)),
    [claims, tab]
  );

  const totalsByStatus = (["submitted", "approved", "paid"] as ClaimStatus[]).map(
    (s) => ({
      status: s,
      value: claims
        .filter((c) => c.status === s)
        .reduce((sum, c) => sum + Number(c.amount), 0),
    })
  );
  const outstanding = claims
    .filter((c) => c.status !== "paid" && c.status !== "rejected")
    .reduce((s, c) => s + Number(c.amount), 0);

  function startAdd(kind: ClaimKind = "reimbursement") {
    setDraft({
      kind,
      status: "draft",
      on_behalf_of: "self",
      claim_date: todayISO(),
      amount: 0,
      submitted_by: userName,
      claimant: userName,
    });
    setOpen(true);
  }
  function startEdit(c: Claim) {
    setDraft({ ...c });
    setOpen(true);
  }

  async function save() {
    if (!draft.title) return;
    setSaving(true);
    const payload = {
      kind: draft.kind ?? "reimbursement",
      title: draft.title,
      claimant: draft.claimant ?? null,
      amount: Number(draft.amount ?? 0),
      claim_date: draft.claim_date ?? todayISO(),
      on_behalf_of: draft.on_behalf_of ?? "self",
      category: draft.category ?? null,
      status: draft.status ?? "draft",
      notes: draft.notes ?? null,
      submitted_by: draft.submitted_by ?? userName,
    };
    if (draft.id) {
      await supabase.from("claims").update(payload).eq("id", draft.id);
    } else {
      await supabase.from("claims").insert({ ...payload, owner_id: userId });
    }
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  async function advance(c: Claim) {
    const i = STATUS_FLOW.indexOf(c.status);
    const next = STATUS_FLOW[Math.min(i + 1, STATUS_FLOW.length - 1)];
    if (next === c.status) return;
    setBusy(c.id);
    await supabase.from("claims").update({ status: next }).eq("id", c.id);
    setBusy(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this claim?")) return;
    await supabase.from("claims").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <PageHead
        title="Claims & benefits"
        subtitle="Reimbursements and food / health benefit forms"
        action={
          <button onClick={() => startAdd()} className="btn-dark text-sm">
            <Plus className="h-4 w-4" /> New claim
          </button>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="label">Outstanding</p>
          <p className="mt-1 text-xl font-bold">{money(outstanding)}</p>
        </Card>
        {totalsByStatus.map((t) => (
          <Card key={t.status} className="p-4">
            <p className="label">{CLAIM_STATUS[t.status].label}</p>
            <p
              className="mt-1 text-xl font-bold"
              style={{ color: CLAIM_STATUS[t.status].text }}
            >
              {money(t.value)}
            </p>
          </Card>
        ))}
      </div>

      {/* Quick-add benefit forms */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(Object.keys(CLAIM_KINDS) as ClaimKind[]).map((k) => (
          <button
            key={k}
            onClick={() => startAdd(k)}
            className="card flex items-center gap-3 p-4 text-left transition hover:shadow-soft"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              {KIND_ICON[k]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{CLAIM_KINDS[k].label}</p>
              <p className="truncate text-xs text-ink-muted">
                {CLAIM_KINDS[k].hint}
              </p>
            </div>
            <Plus className="h-4 w-4 text-ink-soft" />
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {(["all", "reimbursement", "food", "health"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "rounded-full px-3.5 py-1.5 text-sm font-medium capitalize transition " +
              (tab === t
                ? "bg-ink text-white"
                : "bg-card text-ink-muted shadow-card hover:text-ink")
            }
          >
            {t === "all" ? "All" : CLAIM_KINDS[t as ClaimKind].label}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center py-12 text-center">
            <ReceiptText className="h-8 w-8 text-ink-soft" />
            <p className="mt-3 text-sm font-semibold">No claims yet</p>
            <p className="mt-1 max-w-xs text-xs text-ink-muted">
              Log money you paid on behalf of others, or submit a food / health
              benefit form. Anyone in the household can add here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-canvas text-ink-muted">
                  {KIND_ICON[c.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{c.title}</p>
                    <StatusBadge value={c.status} />
                    <BehalfBadge value={c.on_behalf_of} />
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {CLAIM_KINDS[c.kind].label} · {fmtDate(c.claim_date)}
                    {c.claimant ? ` · for ${c.claimant}` : ""}
                    {c.submitted_by ? ` · by ${c.submitted_by}` : ""}
                  </p>
                </div>
                <p className="text-base font-bold">{money(c.amount)}</p>
                <div className="flex items-center gap-1">
                  {c.status !== "paid" && c.status !== "rejected" && (
                    <button
                      onClick={() => advance(c)}
                      disabled={busy === c.id}
                      className="flex items-center gap-1 rounded-full bg-brand-400 px-3 py-2 text-xs font-semibold text-ink hover:bg-brand-500"
                    >
                      {busy === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          {nextLabel(c.status)}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  )}
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
              {c.notes && (
                <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs text-ink-muted">
                  {c.notes}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={draft.id ? "Edit claim" : "New claim"}
        subtitle={draft.kind ? CLAIM_KINDS[draft.kind].hint : undefined}
        footer={
          <>
            <button onClick={() => setOpen(false)} className="btn-ghost text-sm">
              Cancel
            </button>
            <button onClick={save} disabled={saving} className="btn-dark text-sm">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save claim
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Type">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(CLAIM_KINDS) as ClaimKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDraft({ ...draft, kind: k })}
                  className={
                    "flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-medium transition " +
                    (draft.kind === k
                      ? "border-brand-400 bg-brand-50 text-brand-700"
                      : "border-line text-ink-muted hover:border-ink-soft")
                  }
                >
                  {KIND_ICON[k]}
                  {CLAIM_KINDS[k].label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Title / description">
            <input
              className="input"
              value={draft.title ?? ""}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder={
                draft.kind === "reimbursement"
                  ? "e.g. Paid supplier invoice for gbi"
                  : "e.g. Clinic visit, groceries"
              }
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
            <Field label="Date">
              <input
                type="date"
                className="input"
                value={draft.claim_date ?? todayISO()}
                onChange={(e) =>
                  setDraft({ ...draft, claim_date: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <Field label="Status">
              <select
                className="input capitalize"
                value={draft.status ?? "draft"}
                onChange={(e) =>
                  setDraft({ ...draft, status: e.target.value as ClaimStatus })
                }
              >
                {(Object.keys(CLAIM_STATUS) as ClaimStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {CLAIM_STATUS[s].label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Claimant / for whom">
              <input
                className="input"
                value={draft.claimant ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, claimant: e.target.value })
                }
                placeholder="Name"
              />
            </Field>
            <Field label="Submitted by">
              <input
                className="input"
                value={draft.submitted_by ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, submitted_by: e.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <textarea
              className="input min-h-[72px] resize-none"
              value={draft.notes ?? ""}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="Receipt reference, extra detail…"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function nextLabel(status: ClaimStatus): string {
  const i = STATUS_FLOW.indexOf(status);
  const next = STATUS_FLOW[Math.min(i + 1, STATUS_FLOW.length - 1)];
  return CLAIM_STATUS[next].label;
}
