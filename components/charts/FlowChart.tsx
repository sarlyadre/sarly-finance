"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  LabelList,
} from "recharts";
import {
  startOfWeek,
  addDays,
  addWeeks,
  startOfMonth,
  addMonths,
  format,
  isSameMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { money } from "@/lib/format";
import type { DailyFlow } from "@/lib/data";

type Mode = "week" | "month";
type Row = {
  label: string;
  sub: string;
  title: string;
  income: number;
  expense: number;
  savings: number;
};

const SAVINGS = "#f2d24b";
const INCOME = "#b0d55a";
const EXPENSE = "#ec9b52";

/** Short total for the top of a bar: 0 → hidden, 1234 → 1.2k, 23456 → 23k. */
function compact(v: unknown): string {
  const n = Number(v);
  if (!n) return "";
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function flow(income: number, expense: number) {
  return { income, expense, savings: Math.max(0, income - expense) };
}

export function FlowChart({ daily }: { daily: Record<string, DailyFlow> }) {
  const [mode, setMode] = useState<Mode>("week");
  // How many weeks / 12-month windows back from now (0 = current).
  const [offset, setOffset] = useState(0);
  const today = new Date();

  const { rows, range } = useMemo(() => {
    if (mode === "week") {
      const start = addWeeks(startOfWeek(today, { weekStartsOn: 0 }), -offset);
      const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
      const rows: Row[] = days.map((d) => {
        const f = daily[format(d, "yyyy-MM-dd")] ?? { income: 0, expense: 0 };
        return {
          label: format(d, "EEE"),
          sub: format(d, "d MMM"),
          title: format(d, "EEE, d MMM yyyy"),
          ...flow(f.income, f.expense),
        };
      });
      const end = days[6];
      const range =
        format(start, "MMM") === format(end, "MMM")
          ? `${format(start, "d")} – ${format(end, "d MMM yyyy")}`
          : `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
      return { rows, range };
    }
    // Month view: 12 monthly bars ending this month (or `offset` years back).
    const last = addMonths(startOfMonth(today), -12 * offset);
    const months = Array.from({ length: 12 }, (_, i) => addMonths(last, i - 11));
    const rows: Row[] = months.map((m) => {
      let income = 0;
      let expense = 0;
      for (const [day, f] of Object.entries(daily)) {
        if (isSameMonth(new Date(day + "T00:00:00"), m)) {
          income += f.income;
          expense += f.expense;
        }
      }
      return {
        label: format(m, "MMM"),
        sub: format(m, "yyyy"),
        title: format(m, "MMMM yyyy"),
        ...flow(income, expense),
      };
    });
    return { rows, range: `${format(months[0], "MMM yyyy")} – ${format(last, "MMM yyyy")}` };
    // `today` is a fresh Date each render; the window only depends on the day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, mode, offset, format(today, "yyyy-MM-dd")]);

  const total = rows.reduce(
    (s, r) => ({ income: s.income + r.income, expense: s.expense + r.expense }),
    { income: 0, expense: 0 }
  );
  const atNow = offset === 0; // can't page past the current week / months
  const empty = rows.every((r) => !r.income && !r.expense);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-full border border-line bg-canvas p-0.5 text-xs font-medium">
          {(["week", "month"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setOffset(0);
              }}
              className={
                "rounded-full px-3 py-1 transition " +
                (mode === m ? "bg-white text-ink shadow-card" : "text-ink-muted hover:text-ink")
              }
            >
              {m === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <button
            onClick={() => setOffset((o) => o + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-line hover:text-ink"
            title={mode === "week" ? "Previous week" : "Previous 12 months"}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[132px] text-center font-semibold">{range}</span>
          <button
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={atNow}
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-line hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
            title={mode === "week" ? "Next week" : "Next 12 months"}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {!atNow && (
            <button
              onClick={() => setOffset(0)}
              className="ml-1 rounded-full px-2 py-1 text-ink-muted hover:bg-line hover:text-ink"
            >
              {mode === "week" ? "This week" : "Latest"}
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        In <span className="font-medium text-brand-700">{money(total.income)}</span> · Out{" "}
        <span className="font-medium text-tangerine">{money(total.expense)}</span>
        <span className="text-ink-soft"> · transfers between your own accounts excluded</span>
      </p>

      <div className="mt-2 h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={3} barCategoryGap="24%" margin={{ top: 18, right: 4, left: 0, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke="#eceef0" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              interval={0}
              height={40}
              tick={<DateTick rows={rows} />}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#b6bbc2", fontSize: 11 }}
              width={44}
              tickFormatter={(v) => (v === 0 ? "0" : `${v / 1000}k`)}
            />
            <Tooltip cursor={{ fill: "rgba(147,194,62,0.06)" }} content={<FlowTooltip />} />
            {(
              [
                ["savings", SAVINGS],
                ["income", INCOME],
                ["expense", EXPENSE],
              ] as const
            ).map(([key, color]) => (
              <Bar key={key} dataKey={key} fill={color} radius={[4, 4, 4, 4]} maxBarSize={16}>
                <LabelList
                  dataKey={key}
                  position="top"
                  formatter={compact}
                  style={{ fill: "#8b9099", fontSize: 9 }}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
        {empty && (
          <p className="-mt-36 text-center text-xs text-ink-soft">
            No income or spending in this {mode === "week" ? "week" : "period"}
          </p>
        )}
      </div>
    </div>
  );
}

/** Two-line x-axis label: "Tue" over "17 Nov" (week) or "Nov" over "2026" (month). */
function DateTick({ x, y, payload, rows }: any) {
  const sub = rows?.[payload?.index]?.sub ?? "";
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={12} textAnchor="middle" fill="#8b9099" fontSize={12}>
        {payload?.value}
      </text>
      <text dy={26} textAnchor="middle" fill="#b6bbc2" fontSize={10}>
        {sub}
      </text>
    </g>
  );
}

function FlowTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row: Row = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-white p-3 text-xs shadow-pop">
      <p className="mb-2 font-semibold">{row.title}</p>
      <TipRow color={SAVINGS} name="Savings" value={row.savings} />
      <TipRow color={INCOME} name="Income" value={row.income} />
      <TipRow color={EXPENSE} name="Expense" value={row.expense} />
    </div>
  );
}

function TipRow({ color, name, value }: { color: string; name: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-6 py-0.5">
      <span className="flex items-center gap-1.5 text-ink-muted">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {name}
      </span>
      <span className="font-medium text-ink">{money(value)}</span>
    </div>
  );
}
