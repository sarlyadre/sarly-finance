"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { money } from "@/lib/format";

type Row = {
  label: string;
  income: number;
  expense: number;
  savings: number;
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const get = (k: string) =>
    payload.find((p: any) => p.dataKey === k)?.value ?? 0;
  return (
    <div className="rounded-xl border border-line bg-white p-3 text-xs shadow-pop">
      <p className="mb-2 font-semibold">{label}</p>
      <Row color="#f2d24b" name="Savings" value={get("savings")} />
      <Row color="#93c23e" name="Income" value={get("income")} />
      <Row color="#ec9b52" name="Expense" value={get("expense")} />
    </div>
  );
}

function Row({
  color,
  name,
  value,
}: {
  color: string;
  name: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-0.5">
      <span className="flex items-center gap-1.5 text-ink-muted">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        {name}
      </span>
      <span className="font-medium text-ink">{money(value)}</span>
    </div>
  );
}

export function WeeklyBars({ data }: { data: Row[] }) {
  const empty = data.every((d) => !d.income && !d.expense);
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={4} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="#eceef0" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#8b9099", fontSize: 12 }}
            dy={8}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#b6bbc2", fontSize: 11 }}
            width={44}
            tickFormatter={(v) => (v === 0 ? "0" : `${v / 1000}k`)}
          />
          <Tooltip
            cursor={{ fill: "rgba(147,194,62,0.06)" }}
            content={<CustomTooltip />}
          />
          <Bar dataKey="savings" fill="#f2d24b" radius={[4, 4, 4, 4]} maxBarSize={16} />
          <Bar dataKey="income" fill="#b0d55a" radius={[4, 4, 4, 4]} maxBarSize={16} />
          <Bar dataKey="expense" fill="#ec9b52" radius={[4, 4, 4, 4]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
      {empty && (
        <p className="-mt-32 text-center text-xs text-ink-soft">
          Add transactions to see your weekly flow
        </p>
      )}
    </div>
  );
}
