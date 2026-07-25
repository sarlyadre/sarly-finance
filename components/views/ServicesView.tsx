"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addMonths, addWeeks, addYears, format } from "date-fns";
import { money, moneyCompact, fmtDay, todayISO } from "@/lib/format";
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_COLORS,
  SERVICE_STATUS,
  SERVICE_UNITS,
} from "@/lib/constants";
import {
  monthlyCost,
  periodUsage,
  servicesSummary,
  currentPeriodLabel,
} from "@/lib/compute";
import type {
  Service,
  UsageLog,
  ServiceCategory,
  ServiceStatus,
  ServiceCycle,
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
  Sparkles,
  RefreshCw,
  ExternalLink,
  Gauge as GaugeIcon,
  CalendarClock,
  Layers,
} from "lucide-react";

type Draft = Partial<Service>;
type UsageDraft = { service_id?: string; amount?: number; cost?: number; notes?: string };

const CYCLES: ServiceCycle[] = ["monthly", "yearly", "weekly", "usage"];

export function ServicesView({
  services,
  usageLogs,
  accounts,
  userId,
}: {
  services: Service[];
  usageLogs: UsageLog[];
  accounts: Account[];
  userId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [usage, setUsage] = useState<UsageDraft>({});
  const [usageService, setUsageService] = useState<Service | null>(null);
  const [tab, setTab] = useState<"all" | ServiceCategory>("all");

  const summary = useMemo(
    () => servicesSummary(services, usageLogs),
    [services, usageLogs]
  );

  const filtered = services.filter((s) =>
    tab === "all" ? true : s.category === tab
  );

  const meteredServices = services.filter(
    (s) => s.is_metered && s.status !== "cancelled"
  );

  function startAdd() {
    setDraft({
      category: "AI",
      cycle: "monthly",
      status: "active",
      cost: 0,
      auto_renew: true,
      is_metered: false,
      unit: "tokens",
    });
    setOpen(true);
  }
  function startEdit(s: Service) {
    setDraft({ ...s });
    setOpen(true);
  }
  function startUsage(s: Service) {
    setUsageService(s);
    setUsage({ service_id: s.id, amount: 0, cost: 0 });
    setUsageOpen(true);
  }

  async function save() {
    if (!draft.name) return;
    setSaving(true);
    const payload = {
      name: draft.name,
      provider: draft.provider ?? null,
      category: draft.category ?? "Other",
      plan: draft.plan ?? null,
      cost: Number(draft.cost ?? 0),
      cycle: draft.cycle ?? "monthly",
      renewal_date: draft.renewal_date || null,
      status: draft.status ?? "active",
      auto_renew: !!draft.auto_renew,
      account_id: draft.account_id ?? null,
      url: draft.url ?? null,
      is_metered: !!draft.is_metered,
      unit: draft.unit ?? "tokens",
      usage_limit: draft.usage_limit ? Number(draft.usage_limit) : null,
      notes: draft.notes ?? null,
    };
    if (draft.id) {
      await supabase.from("services").update(payload).eq("id", draft.id);
    } else {
      await supabase.from("services").insert({ ...payload, owner_id: userId });
    }
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  async function saveUsage() {
    if (!usage.service_id) return;
    setSaving(true);
    await supabase.from("usage_logs").insert({
      service_id: usage.service_id,
      owner_id: userId,
      period_label: currentPeriodLabel(),
      amount: Number(usage.amount ?? 0),
      cost: Number(usage.cost ?? 0),
      logged_at: todayISO(),
      notes: usage.notes ?? null,
    });
    setSaving(false);
    setUsageOpen(false);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this service and its usage history?")) return;
    await supabase.from("services").delete().eq("id", id);
    router.refresh();
  }

  async function renew(s: Service) {
    if (!s.renewal_date) return;
    const base = new Date(s.renewal_date);
    let next = base;
    if (s.cycle === "monthly") next = addMonths(base, 1);
    else if (s.cycle === "weekly") next = addWeeks(base, 1);
    else if (s.cycle === "yearly") next = addYears(base, 1);
    await supabase
      .from("services")
      .update({ renewal_date: format(next, "yyyy-MM-dd") })
      .eq("id", s.id);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <PageHead
        title="Services & AI usage"
        subtitle="Every online subscription and metered tool in one place"
        action={
          <button onClick={startAdd} className="btn-dark text-sm">
            <Plus className="h-4 w-4" /> Add service
          </button>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="Monthly spend"
          value={money(summary.monthlyTotal)}
          icon={<Layers className="h-4 w-4 text-brand-600" />}
          tint="#f4f9e8"
        />
        <SummaryCard
          label="Annual projection"
          value={money(summary.annualTotal)}
          icon={<CalendarClock className="h-4 w-4 text-sky" />}
          tint="#eaf1fa"
        />
        <SummaryCard
          label="Active services"
          value={String(summary.activeCount)}
          icon={<RefreshCw className="h-4 w-4 text-brand-700" />}
          tint="#eef6dd"
        />
        <SummaryCard
          label="AI spend this month"
          value={money(summary.aiCost)}
          sub={`${moneyCompact(summary.aiTokens).replace("RM", "")} ${
            summary.aiTokens ? "tokens" : ""
          }`.trim()}
          icon={<Sparkles className="h-4 w-4 text-brand-600" />}
          tint="#f4f9e8"
        />
      </div>

      {/* AI / metered usage panel */}
      {meteredServices.length > 0 && (
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-600" />
            <h3 className="text-base font-semibold tracking-tight">
              AI &amp; metered usage
            </h3>
            <span className="text-xs text-ink-muted">
              · {currentPeriodLabel()}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {meteredServices.map((s) => {
              const u = periodUsage(s.id, usageLogs);
              const limit = s.usage_limit ? Number(s.usage_limit) : null;
              const pct = limit ? (u.amount / limit) * 100 : 0;
              const near = pct >= 80;
              return (
                <div key={s.id} className="rounded-2xl bg-canvas p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold"
                        style={{
                          backgroundColor: `${
                            SERVICE_CATEGORY_COLORS[s.category]
                          }1f`,
                          color: SERVICE_CATEGORY_COLORS[s.category],
                        }}
                      >
                        {s.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{s.name}</p>
                        <p className="text-[11px] text-ink-muted">
                          {s.provider ?? s.category}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => startUsage(s)}
                      className="rounded-full bg-brand-400 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-brand-500"
                    >
                      Log usage
                    </button>
                  </div>
                  <div className="mt-3 flex items-end justify-between text-sm">
                    <div>
                      <span className="text-lg font-bold">
                        {Number(u.amount).toLocaleString("en-MY")}
                      </span>
                      <span className="ml-1 text-xs text-ink-muted">
                        {s.unit}
                        {limit
                          ? ` / ${Number(limit).toLocaleString("en-MY")}`
                          : ""}
                      </span>
                    </div>
                    <span className="text-sm font-semibold">
                      {money(u.cost)}
                    </span>
                  </div>
                  {limit && (
                    <div className="mt-2">
                      <Progress
                        value={u.amount}
                        max={limit}
                        color={near ? "#e0705f" : "#93c23e"}
                      />
                      <p
                        className={
                          "mt-1 text-[11px] " +
                          (near ? "text-rose" : "text-ink-muted")
                        }
                      >
                        {Math.round(pct)}% of quota used
                        {near ? " — approaching limit" : ""}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {(["all", ...SERVICE_CATEGORIES] as const).map((t) => (
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
            {t === "all" ? "All" : t}
          </button>
        ))}
      </div>

      {/* Service list */}
      {filtered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center py-12 text-center">
            <GaugeIcon className="h-8 w-8 text-ink-soft" />
            <p className="mt-3 text-sm font-semibold">No services here</p>
            <p className="mt-1 max-w-xs text-xs text-ink-muted">
              Add your subscriptions and AI tools to track spend and renewals.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => {
            const st = SERVICE_STATUS[s.status];
            const color = SERVICE_CATEGORY_COLORS[s.category];
            const mCost = monthlyCost(s);
            const u = s.is_metered ? periodUsage(s.id, usageLogs) : null;
            const days =
              s.renewal_date != null
                ? Math.ceil(
                    (new Date(s.renewal_date).getTime() - Date.now()) /
                      86400000
                  )
                : null;
            const dueSoon = days !== null && days >= 0 && days <= 7;
            const overdue = days !== null && days < 0;
            return (
              <Card key={s.id} className="group flex flex-col">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold"
                      style={{ backgroundColor: `${color}1f`, color }}
                    >
                      {s.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{s.name}</p>
                      <p className="text-[11px] text-ink-muted">
                        {s.provider ? `${s.provider} · ` : ""}
                        {s.plan ?? s.category}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                    {s.url && (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-line hover:text-ink"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => startEdit(s)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-line hover:text-ink"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => remove(s.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-rose/10 hover:text-rose"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span
                    className="pill"
                    style={{ backgroundColor: `${color}1a`, color }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    {s.category}
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
                    <p className="text-xl font-bold tracking-tight">
                      {s.cycle === "usage" && u
                        ? money(u.cost)
                        : money(s.cost)}
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      {s.cycle === "usage"
                        ? "this month · usage"
                        : `per ${s.cycle.replace("ly", "")}`}
                      {s.cycle !== "usage" && s.cycle !== "monthly"
                        ? ` · ${money(mCost)}/mo`
                        : ""}
                    </p>
                  </div>
                  {s.renewal_date && (
                    <div className="text-right">
                      <p
                        className={
                          "text-[11px] font-medium " +
                          (overdue
                            ? "text-rose"
                            : dueSoon
                            ? "text-tangerine"
                            : "text-ink-muted")
                        }
                      >
                        {overdue ? "Renewed?" : "Renews"} {fmtDay(s.renewal_date)}
                      </p>
                      <button
                        onClick={() => renew(s)}
                        className="mt-1 text-[11px] text-brand-600 underline hover:text-brand-700"
                      >
                        advance
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Service modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={draft.id ? "Edit service" : "Add service"}
        subtitle="A subscription, SaaS tool or metered AI service."
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <input
                className="input"
                value={draft.name ?? ""}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Claude, Vercel, Netflix"
              />
            </Field>
            <Field label="Provider">
              <input
                className="input"
                value={draft.provider ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, provider: e.target.value })
                }
                placeholder="e.g. Anthropic"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select
                className="input"
                value={draft.category ?? "AI"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    category: e.target.value as ServiceCategory,
                  })
                }
              >
                {SERVICE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                className="input"
                value={draft.status ?? "active"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    status: e.target.value as ServiceStatus,
                  })
                }
              >
                {(Object.keys(SERVICE_STATUS) as ServiceStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {SERVICE_STATUS[s].label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Cost (RM)">
              <input
                type="number"
                step="0.01"
                className="input"
                value={draft.cost ?? 0}
                onChange={(e) =>
                  setDraft({ ...draft, cost: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Billing">
              <select
                className="input capitalize"
                value={draft.cycle ?? "monthly"}
                onChange={(e) =>
                  setDraft({ ...draft, cycle: e.target.value as ServiceCycle })
                }
              >
                {CYCLES.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Renewal">
              <input
                type="date"
                className="input"
                value={draft.renewal_date ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, renewal_date: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plan (optional)">
              <input
                className="input"
                value={draft.plan ?? ""}
                onChange={(e) => setDraft({ ...draft, plan: e.target.value })}
                placeholder="e.g. Pro, Team"
              />
            </Field>
            <Field label="Pays from">
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
          <Field label="Website (optional)">
            <input
              className="input"
              value={draft.url ?? ""}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              placeholder="https://…"
            />
          </Field>

          <div className="rounded-xl bg-canvas p-3">
            <Toggle
              checked={!!draft.is_metered}
              onChange={(v) => setDraft({ ...draft, is_metered: v })}
              label="Track usage (AI tokens / credits)"
              hint="Adds this service to the usage panel"
            />
            {draft.is_metered && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Unit">
                  <select
                    className="input"
                    value={draft.unit ?? "tokens"}
                    onChange={(e) =>
                      setDraft({ ...draft, unit: e.target.value })
                    }
                  >
                    {SERVICE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Monthly quota (optional)">
                  <input
                    type="number"
                    className="input"
                    value={draft.usage_limit ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        usage_limit: Number(e.target.value),
                      })
                    }
                    placeholder="e.g. 1000000"
                  />
                </Field>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Usage log modal */}
      <Modal
        open={usageOpen}
        onClose={() => setUsageOpen(false)}
        title={`Log usage — ${usageService?.name ?? ""}`}
        subtitle={`Recorded against ${currentPeriodLabel()}`}
        footer={
          <>
            <button
              onClick={() => setUsageOpen(false)}
              className="btn-ghost text-sm"
            >
              Cancel
            </button>
            <button
              onClick={saveUsage}
              disabled={saving}
              className="btn-dark text-sm"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Add usage
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={usageService?.unit ?? "Amount"}>
              <input
                type="number"
                className="input"
                value={usage.amount ?? 0}
                onChange={(e) =>
                  setUsage({ ...usage, amount: Number(e.target.value) })
                }
                placeholder="e.g. 250000"
              />
            </Field>
            <Field label="Cost (RM)">
              <input
                type="number"
                step="0.01"
                className="input"
                value={usage.cost ?? 0}
                onChange={(e) =>
                  setUsage({ ...usage, cost: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <Field label="Note (optional)">
            <input
              className="input"
              value={usage.notes ?? ""}
              onChange={(e) => setUsage({ ...usage, notes: e.target.value })}
              placeholder="What was this usage for?"
            />
          </Field>
          <p className="text-xs text-ink-muted">
            Usage adds up across the month. Log it whenever you top up or check
            your provider's dashboard.
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
      className="flex w-full items-center gap-3 text-left"
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
