"use client";

import { useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  format,
  parseISO,
  isSameMonth,
  isValid,
} from "date-fns";
import type { Account, Statement } from "@/lib/types";
import { Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { ChevronLeft, ChevronRight, Check, CircleDashed } from "lucide-react";

// Account types you'd normally get a monthly statement for.
const STMT_TYPES = new Set(["bank", "savings", "card", "ewallet", "fintech"]);

export function StatementChecklist({
  accounts,
  statements,
}: {
  accounts: Account[];
  statements: Statement[];
}) {
  const [monthRef, setMonthRef] = useState(() => startOfMonth(new Date()));
  const expected = accounts.filter((a) => STMT_TYPES.has(a.type));
  if (expected.length === 0) return null;

  const mStart = startOfMonth(monthRef);
  const mEnd = endOfMonth(monthRef);

  // A statement counts for this month if its period overlaps the month;
  // if it has no period dates (e.g. some CSVs), fall back to its import month.
  const covers = (s: Statement) => {
    if (s.period_start && s.period_end) {
      const ps = parseISO(s.period_start);
      const pe = parseISO(s.period_end);
      if (isValid(ps) && isValid(pe)) return ps <= mEnd && pe >= mStart;
    }
    const imp = parseISO(s.imported_at);
    return isValid(imp) && isSameMonth(imp, monthRef);
  };

  const rows = expected.map((a) => ({
    account: a,
    statement:
      statements.find((s) => s.account_id === a.id && covers(s)) ?? null,
  }));
  const done = rows.filter((r) => r.statement).length;
  const complete = done === expected.length;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">
            Statements this month
          </h3>
          <p className="text-xs text-ink-muted">
            {done} of {expected.length} imported —{" "}
            {complete ? (
              <span className="font-medium text-brand-700">complete ✓</span>
            ) : (
              <span className="font-medium text-tangerine">
                {expected.length - done} still to upload
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-line bg-card p-1 shadow-card">
          <button
            onClick={() => setMonthRef((m) => subMonths(m, 1))}
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-line hover:text-ink"
            title="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[112px] text-center text-xs font-semibold">
            {format(monthRef, "MMMM yyyy")}
          </span>
          <button
            onClick={() => setMonthRef((m) => addMonths(m, 1))}
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-line hover:text-ink"
            title="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(({ account, statement }) => (
          <div
            key={account.id}
            className={
              "flex items-center gap-3 rounded-xl border px-3 py-2.5 " +
              (statement
                ? "border-brand-200 bg-brand-50/50"
                : "border-line bg-canvas/40")
            }
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: account.color ?? "#8b9099" }}
            >
              {statement ? (
                <Check className="h-4 w-4" />
              ) : (
                <CircleDashed className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{account.name}</p>
              <p className="truncate text-[11px] text-ink-muted">
                {statement
                  ? `Imported ${fmtDate(statement.imported_at, "dd MMM")}${
                      statement.txn_count ? ` · ${statement.txn_count} txns` : ""
                    }`
                  : "Not uploaded yet"}
              </p>
            </div>
            <span
              className={
                "pill shrink-0 " +
                (statement
                  ? "bg-brand-50 text-brand-700"
                  : "bg-tangerine/10 text-tangerine")
              }
            >
              {statement ? "Done" : "Pending"}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
