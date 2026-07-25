"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { money, moneyIn } from "@/lib/format";
import { accountMYR } from "@/lib/compute";
import { logoForAccount } from "@/lib/brand";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_META,
  ACCOUNT_GROUPS,
  ACCOUNT_COLORS,
  CURRENCIES,
  DEFAULT_FX,
  ACCOUNT_PRESETS,
} from "@/lib/constants";
import type { Account, AccountType } from "@/lib/types";
import { Card } from "@/components/ui";
import { Modal, Field } from "@/components/Modal";
import {
  Plus,
  Landmark,
  CreditCard,
  Wallet,
  Smartphone,
  PiggyBank,
  LineChart,
  Globe,
  Pencil,
  Trash2,
  Loader2,
  RefreshCw,
} from "lucide-react";

const TYPE_ICON: Record<AccountType, React.ReactNode> = {
  bank: <Landmark className="h-4 w-4" />,
  card: <CreditCard className="h-4 w-4" />,
  cash: <Wallet className="h-4 w-4" />,
  ewallet: <Smartphone className="h-4 w-4" />,
  fintech: <Globe className="h-4 w-4" />,
  savings: <PiggyBank className="h-4 w-4" />,
  investment: <LineChart className="h-4 w-4" />,
};

type Draft = Partial<Account>;

export function AccountsView({
  accounts,
  userId,
}: {
  accounts: Account[];
  userId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [open, setOpen] = useState(false);

  async function syncWise() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/wise/sync", { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        setSyncMsg({ ok: false, text: j.error ?? "Wise sync failed." });
      } else {
        const warn =
          j.warnings?.length > 0 ? ` (${j.warnings.join("; ")})` : "";
        setSyncMsg({
          ok: true,
          text: `Synced ${j.accounts} Wise account${
            j.accounts === 1 ? "" : "s"
          } and ${j.transactions} new transaction${
            j.transactions === 1 ? "" : "s"
          }.${warn}`,
        });
        router.refresh();
      }
    } catch (e: any) {
      setSyncMsg({ ok: false, text: e.message ?? "Wise sync failed." });
    } finally {
      setSyncing(false);
    }
  }
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>({});

  const total = useMemo(
    () => accounts.reduce((s, a) => s + accountMYR(a), 0),
    [accounts]
  );

  // Native-currency breakdown for the header (foreign currencies only).
  const byCurrency = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of accounts) {
      m.set(a.currency, (m.get(a.currency) ?? 0) + Number(a.balance));
    }
    return Array.from(m.entries())
      .filter(([c]) => c !== "MYR")
      .sort((a, b) => b[1] - a[1]);
  }, [accounts]);

  // Group accounts into sections with MYR subtotals.
  const groups = useMemo(() => {
    return ACCOUNT_GROUPS.map((g) => {
      const items = accounts.filter(
        (a) => ACCOUNT_TYPE_META[a.type]?.group === g
      );
      return { group: g, items, subtotal: items.reduce((s, a) => s + accountMYR(a), 0) };
    }).filter((s) => s.items.length > 0);
  }, [accounts]);

  function blankDraft(type: AccountType = "bank"): Draft {
    return {
      type,
      color: ACCOUNT_TYPE_META[type].color,
      balance: 0,
      currency: "MYR",
      fx_rate: 1,
    };
  }
  function startAdd() {
    setDraft(blankDraft());
    setOpen(true);
  }
  function startPreset(p: (typeof ACCOUNT_PRESETS)[number]) {
    const currency = p.currency ?? "MYR";
    setDraft({
      name: p.name,
      type: p.type,
      institution: p.institution,
      color: p.color,
      balance: 0,
      currency,
      fx_rate: DEFAULT_FX[currency] ?? 1,
    });
    setOpen(true);
  }
  function startEdit(a: Account) {
    setDraft({ ...a });
    setOpen(true);
  }
  function setType(type: AccountType) {
    setDraft((d) => ({
      ...d,
      type,
      color: d.color ?? ACCOUNT_TYPE_META[type].color,
    }));
  }
  function setCurrency(code: string) {
    setDraft((d) => ({ ...d, currency: code, fx_rate: DEFAULT_FX[code] ?? d.fx_rate ?? 1 }));
  }

  async function save() {
    if (!draft.name) return;
    setSaving(true);
    const currency = draft.currency ?? "MYR";
    const payload = {
      name: draft.name,
      type: draft.type ?? "bank",
      institution: draft.institution ?? null,
      balance: Number(draft.balance ?? 0),
      currency,
      fx_rate: currency === "MYR" ? 1 : Number(draft.fx_rate ?? DEFAULT_FX[currency] ?? 1),
      account_ref: draft.account_ref ?? null,
      color: draft.color ?? ACCOUNT_COLORS[0],
    };
    if (draft.id) {
      await supabase.from("accounts").update(payload).eq("id", draft.id);
    } else {
      await supabase.from("accounts").insert({ ...payload, owner_id: userId });
    }
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this account and its transactions?")) return;
    await supabase.from("accounts").delete().eq("id", id);
    router.refresh();
  }

  const isForeign = (draft.currency ?? "MYR") !== "MYR";

  return (
    <div className="space-y-5">
      <PageHead
        title="Accounts"
        subtitle="Banks, e-wallets, Wise and more — one consolidated view"
        action={
          <div className="flex gap-2">
            <button
              onClick={syncWise}
              disabled={syncing}
              className="btn-ghost text-sm"
              title="Pull balances & transactions from Wise"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync Wise
            </button>
            <button onClick={startAdd} className="btn-dark text-sm">
              <Plus className="h-4 w-4" /> Add account
            </button>
          </div>
        }
      />

      {syncMsg && (
        <div
          className={
            "rounded-xl border px-3 py-2.5 text-sm " +
            (syncMsg.ok
              ? "border-brand-200 bg-brand-50 text-brand-800"
              : "border-tangerine/30 bg-tangerine/5 text-tangerine")
          }
        >
          {syncMsg.text}
        </div>
      )}

      {/* Consolidated balance */}
      <Card className="bg-gradient-to-br from-brand-400 to-brand-600 text-ink">
        <p className="text-xs font-medium text-brand-900/70">
          Consolidated balance
        </p>
        <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          {money(total)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-brand-900/70">
          <span>
            {accounts.length} account{accounts.length === 1 ? "" : "s"}
          </span>
          {byCurrency.length > 0 && (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-brand-900/40">·</span>
              {byCurrency.map(([code, amt]) => (
                <span
                  key={code}
                  className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-medium"
                >
                  {moneyIn(amt, code)}
                </span>
              ))}
            </span>
          )}
        </div>
      </Card>

      {accounts.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center py-8 text-center">
            <Wallet className="h-8 w-8 text-ink-soft" />
            <p className="mt-3 text-sm font-semibold">Set up your accounts</p>
            <p className="mt-1 max-w-sm text-xs text-ink-muted">
              Tap a provider to add it fast, or create a custom account. Wise and
              other multi-currency wallets can hold foreign balances — they'll be
              converted to RM automatically.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {ACCOUNT_PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => startPreset(p)}
                  className="flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-medium shadow-card transition hover:border-brand-300"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name}
                </button>
              ))}
              <button
                onClick={startAdd}
                className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Custom
              </button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Quick-add strip */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="label mr-1">Quick add:</span>
            {ACCOUNT_PRESETS.slice(0, 8).map((p) => (
              <button
                key={p.name}
                onClick={() => startPreset(p)}
                className="flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium shadow-card transition hover:border-brand-300"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                {p.name}
              </button>
            ))}
          </div>

          {groups.map(({ group, items, subtotal }) => (
            <div key={group}>
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-ink">{group}</h2>
                <span className="text-sm font-semibold text-ink-muted">
                  {money(subtotal)}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((a) => {
                  const foreign = a.currency !== "MYR";
                  return (
                    <Card
                      key={a.id}
                      onClick={() => router.push(`/transactions?account=${a.id}`)}
                      className="group relative cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-soft"
                      title="View this account's transactions"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 gap-3">
                          <AccountAvatar account={a} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {a.name}
                            </p>
                            <p className="truncate text-xs text-ink-muted">
                              {a.institution ? `${a.institution} · ` : ""}
                              {ACCOUNT_TYPE_META[a.type]?.label ?? a.type}
                              {a.account_ref ? ` · ••${a.account_ref}` : ""}
                            </p>
                            <p className="mt-2 text-2xl font-bold tracking-tight">
                              {moneyIn(a.balance, a.currency)}
                            </p>
                            {foreign && (
                              <p className="text-xs text-ink-muted">
                                ≈ {money(accountMYR(a))}{" "}
                                <span className="text-ink-soft">
                                  @ {Number(a.fx_rate).toFixed(4)}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {foreign && (
                            <span className="pill bg-canvas text-ink-muted">
                              {a.currency}
                            </span>
                          )}
                          <div className="flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEdit(a);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-line hover:text-ink"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                remove(a.id);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-rose/10 hover:text-rose"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={draft.id ? "Edit account" : "Add account"}
        subtitle="Bank, e-wallet, Wise / multi-currency, card, cash or investment."
        footer={
          <>
            <button onClick={() => setOpen(false)} className="btn-ghost text-sm">
              Cancel
            </button>
            <button onClick={save} disabled={saving} className="btn-dark text-sm">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save account
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Account name">
            <input
              className="input"
              value={draft.name ?? ""}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Maybank Savings, Wise USD"
            />
          </Field>

          <Field label="Type">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {ACCOUNT_TYPES.map((t) => {
                const active = (draft.type ?? "bank") === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={
                      "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-medium transition " +
                      (active
                        ? "border-brand-400 bg-brand-50 text-ink"
                        : "border-line bg-card text-ink-muted hover:border-brand-200")
                    }
                  >
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: ACCOUNT_TYPE_META[t].color }}
                    >
                      {TYPE_ICON[t]}
                    </span>
                    {ACCOUNT_TYPE_META[t].label.split(" ")[0]}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency">
              <select
                className="input"
                value={draft.currency ?? "MYR"}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Balance (${draft.currency ?? "MYR"})`}>
              <input
                type="number"
                step="0.01"
                className="input"
                value={draft.balance ?? 0}
                onChange={(e) =>
                  setDraft({ ...draft, balance: Number(e.target.value) })
                }
              />
            </Field>
          </div>

          {isForeign && (
            <div className="rounded-xl bg-canvas p-3">
              <div className="grid grid-cols-2 items-end gap-3">
                <Field label={`Rate (1 ${draft.currency} = ? RM)`}>
                  <input
                    type="number"
                    step="0.0001"
                    className="input"
                    value={draft.fx_rate ?? 1}
                    onChange={(e) =>
                      setDraft({ ...draft, fx_rate: Number(e.target.value) })
                    }
                  />
                </Field>
                <div className="pb-2.5 text-right text-sm">
                  <span className="label block">In Ringgit</span>
                  <span className="font-semibold">
                    {money(
                      Number(draft.balance ?? 0) * Number(draft.fx_rate ?? 1)
                    )}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-ink-muted">
                Update the rate whenever you want an accurate conversion — Wise
                shows the live mid-market rate.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Institution (optional)">
              <input
                className="input"
                value={draft.institution ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, institution: e.target.value })
                }
                placeholder="e.g. Maybank, Wise"
              />
            </Field>
            <Field label="Last digits / handle (optional)">
              <input
                className="input"
                value={draft.account_ref ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, account_ref: e.target.value })
                }
                placeholder="e.g. 4321"
              />
            </Field>
          </div>

          <Field label="Colour">
            <div className="flex flex-wrap gap-2">
              {ACCOUNT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDraft({ ...draft, color: c })}
                  className={
                    "h-8 w-8 rounded-full ring-2 ring-offset-2 transition " +
                    (draft.color === c ? "ring-ink" : "ring-transparent")
                  }
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function AccountAvatar({ account }: { account: Account }) {
  const logo = logoForAccount(account);
  const [failed, setFailed] = useState(false);
  const showLogo = logo && !failed;

  if (showLogo) {
    return (
      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt=""
          className="h-9 w-9 object-contain"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white"
      style={{ backgroundColor: account.color ?? "#93c23e" }}
    >
      {TYPE_ICON[account.type] ?? <Wallet className="h-6 w-6" />}
    </span>
  );
}

export function PageHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
