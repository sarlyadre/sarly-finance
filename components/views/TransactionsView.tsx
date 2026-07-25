"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { money, moneyIn, moneySigned, fmtDate, todayISO } from "@/lib/format";
import { CATEGORIES, CATEGORY_COLORS, FOOD_DEFAULT } from "@/lib/constants";
import type { Account, Transaction } from "@/lib/types";
import { Card } from "@/components/ui";
import { PageHead } from "./AccountsView";
import { Modal, Field } from "@/components/Modal";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  ArrowLeftRight,
  CopyCheck,
} from "lucide-react";

type Draft = Partial<Transaction> & { _kind?: "income" | "expense" };

export function TransactionsView({
  transactions,
  accounts,
  userId,
  initialAccount = "all",
}: {
  transactions: Transaction[];
  accounts: Account[];
  userId: string;
  initialAccount?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [acct, setAcct] = useState(initialAccount);
  const [holder, setHolder] = useState("all"); // all | Primary | Supplementary
  // Local category overrides so inline/bulk edits show instantly without a full refetch.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState(CATEGORIES[0]);
  const [dupOnly, setDupOnly] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const acctName = new Map(accounts.map((a) => [a.id, a.name]));
  const effCat = (t: Transaction) => overrides[t.id] ?? t.category ?? "Other";

  // Redundant-data detection: group by date + amount + description.
  const dupKey = (t: Transaction) =>
    `${t.txn_date}|${Number(t.amount).toFixed(2)}|${(t.description || "")
      .trim()
      .toLowerCase()}`;
  const { dupIds, redundantIds } = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const t of transactions) {
      const k = dupKey(t);
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
    }
    const dup = new Set<string>();
    const redundant = new Set<string>();
    groups.forEach((list) => {
      if (list.length > 1) {
        list.forEach((t, i) => {
          dup.add(t.id);
          if (i > 0) redundant.add(t.id); // keep the first, flag the rest
        });
      }
    });
    return { dupIds: dup, redundantIds: redundant };
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (dupOnly && !dupIds.has(t.id)) return false;
      if (acct !== "all" && t.account_id !== acct) return false;
      if (holder !== "all" && (t.cardholder ?? "") !== holder) return false;
      if (cat !== "all" && effCat(t) !== cat) return false;
      if (q && !t.description.toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, q, cat, acct, holder, overrides, dupOnly, dupIds]);

  // Show the cardholder filter only when there are card-tagged transactions here.
  const hasCardholders = useMemo(
    () =>
      transactions.some(
        (t) => t.cardholder && (acct === "all" || t.account_id === acct)
      ),
    [transactions, acct]
  );

  // When a single account is selected, compute a running balance per row
  // (opening balance → current balance) like a bank statement.
  const selectedAccount =
    acct !== "all" ? accounts.find((a) => a.id === acct) ?? null : null;
  const runBal = useMemo(() => {
    if (!selectedAccount) return null;
    const rows = transactions
      .filter((t) => t.account_id === selectedAccount.id)
      .slice()
      .sort(
        (a, b) =>
          a.txn_date.localeCompare(b.txn_date) ||
          (a.created_at ?? "").localeCompare(b.created_at ?? "")
      );
    const total = rows.reduce((s, t) => s + Number(t.amount), 0);
    const opening = Number(selectedAccount.balance) - total;
    const map = new Map<string, number>();
    let bal = opening;
    for (const t of rows) {
      bal += Number(t.amount);
      map.set(t.id, bal);
    }
    return { map, opening, current: Number(selectedAccount.balance), currency: selectedAccount.currency };
  }, [transactions, selectedAccount]);
  const cols = selectedAccount ? 8 : 7;

  function findDuplicates() {
    if (redundantIds.size === 0) {
      alert("No redundant transactions found — nothing is duplicated.");
      return;
    }
    setDupOnly(true);
    setCat("all");
    setQ("");
    setSel(new Set(redundantIds)); // pre-select the redundant copies to delete
  }

  async function deleteSelected() {
    const ids = Array.from(sel);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} transaction${ids.length === 1 ? "" : "s"}? This can't be undone.`
      )
    )
      return;
    setDeleting(true);
    await supabase.from("transactions").delete().in("id", ids);
    setDeleting(false);
    setSel(new Set());
    router.refresh();
  }

  async function setCategory(ids: string[], category: string) {
    if (ids.length === 0) return;
    setOverrides((o) => {
      const n = { ...o };
      ids.forEach((id) => (n[id] = category));
      return n;
    });
    await supabase.from("transactions").update({ category }).in("id", ids);
  }

  const toggleSel = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((t) => sel.has(t.id));
  const toggleSelAll = () =>
    setSel(
      allFilteredSelected ? new Set() : new Set(filtered.map((t) => t.id))
    );
  async function applyBulk() {
    await setCategory(Array.from(sel), bulkCat);
    setSel(new Set());
  }

  const income = filtered
    .filter((t) => t.amount >= 0 && effCat(t) !== "Transfer")
    .reduce((s, t) => s + Number(t.amount), 0);
  const expense = filtered
    .filter((t) => t.amount < 0 && effCat(t) !== "Transfer")
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  function startAdd() {
    setDraft({
      _kind: "expense",
      txn_date: todayISO(),
      category: FOOD_DEFAULT,
      account_id: accounts[0]?.id,
      amount: 0,
    });
    setOpen(true);
  }
  function startEdit(t: Transaction) {
    setDraft({
      ...t,
      _kind: t.amount >= 0 ? "income" : "expense",
      amount: Math.abs(Number(t.amount)),
    });
    setOpen(true);
  }

  async function save() {
    if (!draft.description) return;
    setSaving(true);
    const signed =
      (draft._kind === "income" ? 1 : -1) * Math.abs(Number(draft.amount ?? 0));
    const payload = {
      description: draft.description,
      category: draft.category ?? "Other",
      amount: signed,
      txn_date: draft.txn_date ?? todayISO(),
      account_id: draft.account_id ?? null,
    };
    if (draft.id) {
      await supabase.from("transactions").update(payload).eq("id", draft.id);
    } else {
      await supabase
        .from("transactions")
        .insert({ ...payload, owner_id: userId });
    }
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this transaction?")) return;
    await supabase.from("transactions").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <PageHead
        title="Transactions"
        subtitle="Track income and spending across all accounts"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={findDuplicates}
              className="btn-ghost text-sm"
              title="Find and remove redundant transactions"
            >
              <CopyCheck className="h-4 w-4" />
              Find duplicates
              {redundantIds.size > 0 && (
                <span className="ml-1 rounded-full bg-tangerine/15 px-1.5 text-xs font-semibold text-tangerine">
                  {redundantIds.size}
                </span>
              )}
            </button>
            <button onClick={startAdd} className="btn-dark text-sm">
              <Plus className="h-4 w-4" /> Add transaction
            </button>
          </div>
        }
      />

      {dupOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-tangerine/30 bg-tangerine/5 px-3 py-2.5 text-sm">
          <span className="text-tangerine">
            Showing <b>{filtered.length}</b> transactions in duplicate groups —{" "}
            <b>{redundantIds.size}</b> redundant copies pre-selected (one kept per
            group). Review, then delete.
          </span>
          <button
            onClick={() => {
              setDupOnly(false);
              setSel(new Set());
            }}
            className="btn-ghost px-2.5 py-1 text-xs"
          >
            Show all
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <p className="label">Income (filtered)</p>
          <p className="mt-1 text-xl font-bold text-brand-600">
            {money(income)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="label">Expenses (filtered)</p>
          <p className="mt-1 text-xl font-bold text-tangerine">
            {money(expense)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="label">Net</p>
          <p className="mt-1 text-xl font-bold">{money(income - expense)}</p>
        </Card>
        <Card className="p-4">
          <p className="label">
            {selectedAccount ? "Account balance" : "Total balance"}
          </p>
          <p className="mt-1 text-xl font-bold text-ink">
            {selectedAccount
              ? moneyIn(Number(selectedAccount.balance), selectedAccount.currency)
              : money(
                  accounts.reduce(
                    (s, a) => s + Number(a.balance) * Number(a.fx_rate ?? 1),
                    0
                  )
                )}
          </p>
        </Card>
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search transactions"
              className="input pl-9"
            />
          </div>
          <select
            value={acct}
            onChange={(e) => setAcct(e.target.value)}
            className="input w-auto"
          >
            <option value="all">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="input w-auto"
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {hasCardholders && (
            <select
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              className="input w-auto"
              title="Filter by cardholder"
            >
              <option value="all">All cardholders</option>
              <option value="Primary">Primary card</option>
              <option value="Supplementary">Supplementary card</option>
            </select>
          )}
        </div>

        {/* Opening / current balance for a single account */}
        {selectedAccount && runBal && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/60 px-4 py-2.5 text-sm">
            <span className="text-ink-muted">
              Opening balance{" "}
              <b className="text-ink">
                {moneyIn(runBal.opening, runBal.currency)}
              </b>
            </span>
            <span className="text-ink-muted">
              Current balance{" "}
              <b className="text-ink">
                {moneyIn(runBal.current, runBal.currency)}
              </b>
            </span>
          </div>
        )}

        {/* Bulk categorise bar */}
        {sel.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-line bg-brand-50/60 px-4 py-3">
            <span className="text-sm font-semibold">{sel.size} selected</span>
            <span className="text-xs text-ink-muted">Set category to</span>
            <select
              value={bulkCat}
              onChange={(e) => setBulkCat(e.target.value)}
              className="input w-auto py-1.5"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button onClick={applyBulk} className="btn-brand px-3 py-1.5 text-sm">
              Apply to {sel.size}
            </button>
            <button
              onClick={deleteSelected}
              disabled={deleting}
              className="btn px-3 py-1.5 text-sm bg-rose/10 text-rose hover:bg-rose/20"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete {sel.size}
            </button>
            <button
              onClick={() => setSel(new Set())}
              className="btn-ghost px-3 py-1.5 text-sm"
            >
              Clear
            </button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center">
            <ArrowLeftRight className="h-8 w-8 text-ink-soft" />
            <p className="mt-3 text-sm font-semibold">No transactions</p>
            <p className="mt-1 text-xs text-ink-muted">
              Add income or expenses to build your spending picture.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full sm:table">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelAll}
                      className="h-4 w-4 accent-brand-500"
                      title="Select all"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  {selectedAccount && (
                    <th className="px-4 py-3 text-right font-medium">Balance</th>
                  )}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const monthLabel = fmtDate(t.txn_date, "MMMM yyyy");
                  const newMonth =
                    i === 0 ||
                    monthLabel !== fmtDate(filtered[i - 1].txn_date, "MMMM yyyy");
                  const rowBg = sel.has(t.id)
                    ? "bg-brand-50/60"
                    : i % 2 === 1
                    ? "bg-canvas/50"
                    : "bg-white";
                  return (
                    <Fragment key={t.id}>
                      {newMonth && (
                        <tr>
                          <td
                            colSpan={cols}
                            className="border-t-2 border-ink/15 bg-canvas px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
                          >
                            {monthLabel}
                          </td>
                        </tr>
                      )}
                      <tr
                        className={
                          "group border-b border-line hover:bg-canvas " + rowBg
                        }
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={sel.has(t.id)}
                            onChange={() => toggleSel(t.id)}
                            className="h-4 w-4 accent-brand-500"
                          />
                        </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      {t.description}
                    </td>
                    <td className="px-4 py-3">
                      <CategorySelect
                        value={effCat(t)}
                        onChange={(c) => setCategory([t.id], c)}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-muted">
                      {acctName.get(t.account_id ?? "") ?? "—"}
                      {t.cardholder && (
                        <span
                          className={
                            "ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium " +
                            (t.cardholder === "Supplementary"
                              ? "bg-tangerine/15 text-tangerine"
                              : "bg-sky/10 text-sky")
                          }
                          title={`${t.cardholder} card${t.card ? " ••" + t.card : ""}`}
                        >
                          {t.cardholder === "Supplementary" ? "Supp" : "Primary"}
                          {t.card ? ` ••${t.card}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-muted">
                      {fmtDate(t.txn_date)}
                    </td>
                    <td
                      className={
                        "px-4 py-3 text-right text-sm font-semibold " +
                        (t.amount >= 0 ? "text-brand-600" : "text-ink")
                      }
                    >
                      {moneySigned(t.amount)}
                    </td>
                    {selectedAccount && runBal && (
                      <td className="px-4 py-3 text-right text-sm text-ink-muted">
                        {moneyIn(runBal.map.get(t.id) ?? 0, runBal.currency)}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                        <RowBtn onClick={() => startEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </RowBtn>
                        <RowBtn danger onClick={() => remove(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </RowBtn>
                      </div>
                    </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile list */}
            <ul className="sm:hidden">
              {filtered.map((t, i) => {
                const monthLabel = fmtDate(t.txn_date, "MMMM yyyy");
                const newMonth =
                  i === 0 ||
                  monthLabel !== fmtDate(filtered[i - 1].txn_date, "MMMM yyyy");
                return (
                  <Fragment key={t.id}>
                    {newMonth && (
                      <li className="border-t-2 border-ink/15 bg-canvas px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                        {monthLabel}
                      </li>
                    )}
                    <li
                      className={
                        "flex items-center gap-3 border-b border-line p-4 " +
                        (i % 2 === 1 ? "bg-canvas/50" : "")
                      }
                    >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {t.description}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <CategorySelect
                        value={effCat(t)}
                        onChange={(c) => setCategory([t.id], c)}
                      />
                      <span className="text-[11px] text-ink-muted">
                        {fmtDate(t.txn_date, "dd MMM")}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={
                        "text-sm font-semibold " +
                        (t.amount >= 0 ? "text-brand-600" : "text-ink")
                      }
                    >
                      {moneySigned(t.amount)}
                    </p>
                    <button
                      onClick={() => startEdit(t)}
                      className="text-[11px] text-ink-muted underline"
                    >
                      edit
                    </button>
                  </div>
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={draft.id ? "Edit transaction" : "Add transaction"}
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
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-canvas p-1">
            {(["expense", "income"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setDraft({ ...draft, _kind: k })}
                className={
                  "rounded-lg py-2 text-sm font-medium capitalize transition " +
                  (draft._kind === k
                    ? "bg-white shadow-card"
                    : "text-ink-muted")
                }
              >
                {k}
              </button>
            ))}
          </div>
          <Field label="Description">
            <input
              className="input"
              value={draft.description ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              placeholder="e.g. Groceries at Jaya Grocer"
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
                value={draft.txn_date ?? todayISO()}
                onChange={(e) =>
                  setDraft({ ...draft, txn_date: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select
                className="input"
                value={draft.category ?? "Other"}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Account">
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
          </div>
        </div>
      </Modal>
    </div>
  );
}

function CategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  const color = CATEGORY_COLORS[value] ?? "#b6bbc2";
  // Keep a legacy/unknown value selectable so it still displays.
  const options = CATEGORIES.includes(value) ? CATEGORIES : [value, ...CATEGORIES];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="cursor-pointer rounded-full border-0 py-1 pl-2.5 pr-6 text-xs font-medium outline-none transition focus:ring-2 focus:ring-brand-100"
      style={{ backgroundColor: `${color}1f`, color }}
      title="Change category"
    >
      {options.map((c) => (
        <option key={c} value={c} style={{ color: "#1a1c1e" }}>
          {c}
        </option>
      ))}
    </select>
  );
}

function RowBtn({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted " +
        (danger ? "hover:bg-rose/10 hover:text-rose" : "hover:bg-line hover:text-ink")
      }
    >
      {children}
    </button>
  );
}

