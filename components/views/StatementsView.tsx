"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { money, fmtDay, fmtDate } from "@/lib/format";
import {
  CATEGORIES,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_META,
  CURRENCIES,
  DEFAULT_FX,
} from "@/lib/constants";
import {
  parseCSV,
  detectColumns,
  fromCSV,
  fromText,
  markDuplicates,
  statementPeriod,
  detectBalances,
  detectAccountRefs,
  type ParsedTxn,
  type ColumnMap,
} from "@/lib/parse/statement";
import type { Account, AccountType, Statement, StatementSource } from "@/lib/types";
import { Card } from "@/components/ui";
import { PageHead } from "./AccountsView";
import { Modal, Field } from "@/components/Modal";
import { StatementChecklist } from "@/components/StatementChecklist";
import {
  Upload,
  FileText,
  FileSpreadsheet,
  ClipboardPaste,
  Loader2,
  Check,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  RotateCcw,
  Plus,
  X,
  Sparkles,
} from "lucide-react";

type ExistingTxn = { txn_date: string; amount: number; description: string };

const COLS: { key: keyof Omit<ColumnMap, "headerRow">; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "description", label: "Description" },
  { key: "details", label: "Time / details" },
  { key: "amount", label: "Amount" },
  { key: "debit", label: "Debit (out)" },
  { key: "credit", label: "Credit (in)" },
  { key: "balance", label: "Balance" },
];

export function StatementsView({
  statements,
  accounts,
  existing,
  userId,
}: {
  statements: Statement[];
  accounts: Account[];
  existing: ExistingTxn[];
  userId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "review">("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Local copy of accounts so an inline-created account appears immediately
  // without a navigation/refetch that would drop the parsed rows.
  const [accts, setAccts] = useState<Account[]>(accounts);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [source, setSource] = useState<StatementSource>("csv");
  const [filename, setFilename] = useState("");
  const [pasteText, setPasteText] = useState("");

  // Inline "new account" creation
  const [acctOpen, setAcctOpen] = useState(false);
  const [acctSaving, setAcctSaving] = useState(false);
  const [acctDraft, setAcctDraft] = useState<Partial<Account>>({});

  // CSV re-mapping context
  const [csvRows, setCsvRows] = useState<string[][] | null>(null);
  const [colMap, setColMap] = useState<ColumnMap | null>(null);

  const [rows, setRows] = useState<ParsedTxn[]>([]);

  // Balances detected from the statement text (opening/closing).
  const [opening, setOpening] = useState<number | null>(null);
  const [closing, setClosing] = useState<number | null>(null);
  const [applyClosing, setApplyClosing] = useState(true);

  // Auto-routing: which account this statement was matched to.
  const [route, setRoute] = useState<
    | { status: "matched"; account: Account }
    | { status: "multi"; account: Account; others: Account[] }
    | { status: "none" }
    | null
  >(null);

  const accountName = (id: string | null) =>
    accts.find((a) => a.id === id)?.name ?? "—";

  function startNewAccount() {
    setAcctDraft({ type: "bank", currency: "MYR", fx_rate: 1, balance: 0 });
    setAcctOpen(true);
  }

  async function createAccount() {
    if (!acctDraft.name) return;
    setAcctSaving(true);
    const currency = acctDraft.currency ?? "MYR";
    const payload = {
      owner_id: userId,
      name: acctDraft.name,
      type: acctDraft.type ?? "bank",
      institution: acctDraft.institution ?? null,
      balance: Number(acctDraft.balance ?? 0),
      currency,
      fx_rate: currency === "MYR" ? 1 : Number(acctDraft.fx_rate ?? DEFAULT_FX[currency] ?? 1),
      account_ref: acctDraft.account_ref ?? null,
      color: ACCOUNT_TYPE_META[(acctDraft.type ?? "bank") as AccountType].color,
    };
    const { data, error: e } = await supabase
      .from("accounts")
      .insert(payload)
      .select("*")
      .single();
    setAcctSaving(false);
    if (e || !data) {
      setError(`Couldn't create account: ${e?.message ?? "unknown error"}`);
      return;
    }
    // Append to the local list and select it — parsed rows are untouched.
    setAccts((prev) => [...prev, data as Account]);
    setAccountId((data as Account).id);
    setAcctOpen(false);
    router.refresh(); // keep server data in sync; client state (rows) is preserved
  }

  function reset() {
    setStep("upload");
    setRows([]);
    setCsvRows(null);
    setColMap(null);
    setPasteText("");
    setFilename("");
    setError(null);
    setOpening(null);
    setClosing(null);
    setRoute(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function captureBalances(text: string) {
    const b = detectBalances(text);
    setOpening(b.opening);
    setClosing(b.closing);
    setApplyClosing(b.closing !== null);
  }

  // Match the statement's account number to an existing account and select it.
  function autoRouteAccount(text: string) {
    const refs = detectAccountRefs(text);
    const matches = accts.filter(
      (a) => a.account_ref && refs.includes(a.account_ref)
    );
    if (matches.length === 1) {
      setAccountId(matches[0].id);
      setRoute({ status: "matched", account: matches[0] });
    } else if (matches.length > 1) {
      setAccountId(matches[0].id);
      setRoute({ status: "multi", account: matches[0], others: matches.slice(1) });
    } else {
      setRoute({ status: "none" });
    }
  }

  function finishParse(parsed: ParsedTxn[]) {
    if (parsed.length === 0) {
      setError(
        "Couldn't find any transactions. Try a CSV export, or check the paste/columns."
      );
      return;
    }
    setError(null);
    setRows(markDuplicates(parsed, existing));
    setStep("review");
  }

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setFilename(file.name);
    try {
      const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
      if (isPdf) {
        setSource("pdf");
        const { extractPdfText } = await import("@/lib/parse/pdf");
        const text = await extractPdfText(file);
        captureBalances(text);
        autoRouteAccount(text);
        finishParse(fromText(text));
      } else {
        setSource("csv");
        const text = await file.text();
        captureBalances(text);
        // CSVs are full of reference numbers whose digits can false-match an
        // account — don't auto-route; prompt the user to choose the account.
        setRoute({ status: "none" });
        const parsed = parseCSV(text);
        const map = detectColumns(parsed);
        setCsvRows(parsed);
        setColMap(map);
        finishParse(fromCSV(parsed, map));
      }
    } catch (e: any) {
      setError(
        `Could not read that file: ${e?.message ?? e}. For PDFs, try copying the text and pasting it instead.`
      );
    } finally {
      setBusy(false);
    }
  }

  function handlePaste() {
    if (!pasteText.trim()) return;
    setSource("paste");
    setFilename("Pasted text");
    captureBalances(pasteText);
    autoRouteAccount(pasteText);
    finishParse(fromText(pasteText));
  }

  function remap(key: keyof Omit<ColumnMap, "headerRow">, value: number) {
    if (!csvRows || !colMap) return;
    const next = { ...colMap, [key]: value };
    // amount vs debit/credit are mutually exclusive-ish; don't force it.
    setColMap(next);
    setRows(markDuplicates(fromCSV(csvRows, next), existing));
  }

  // Row editing
  const patch = (id: string, p: Partial<ParsedTxn>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const setAll = (include: boolean) =>
    setRows((rs) => rs.map((r) => ({ ...r, include })));
  const excludeDupes = () =>
    setRows((rs) => rs.map((r) => (r.duplicate ? { ...r, include: false } : r)));

  const selected = rows.filter((r) => r.include);
  const dupes = rows.filter((r) => r.duplicate).length;
  const totalsIn = selected
    .filter((r) => r.amount > 0)
    .reduce((s, r) => s + r.amount, 0);
  const totalsOut = selected
    .filter((r) => r.amount < 0)
    .reduce((s, r) => s + Math.abs(r.amount), 0);

  async function doImport() {
    if (!accountId) {
      setError("Pick which account these transactions belong to first.");
      return;
    }
    const toImport = rows.filter((r) => r.include && r.date && r.amount !== 0);
    if (toImport.length === 0) {
      setError("Nothing selected to import.");
      return;
    }
    setImporting(true);
    setError(null);
    const period = statementPeriod(toImport);

    const { data: stmt, error: se } = await supabase
      .from("statements")
      .insert({
        owner_id: userId,
        filename: filename || null,
        source,
        account_id: accountId,
        period_start: period.start,
        period_end: period.end,
        txn_count: toImport.length,
      })
      .select("id")
      .single();

    if (se || !stmt) {
      setImporting(false);
      setError(`Import failed: ${se?.message ?? "could not create statement"}`);
      return;
    }

    // Credit-card statements can cover several cards (primary + supplementary)
    // across two products. Route each card's transactions to its own account and
    // tag the holder. A card whose last-4 matches an account_ref is that
    // account's PRIMARY card; other cards of the same product are SUPPLEMENTARY.
    const refToAccount = new Map(
      accts.filter((a) => a.account_ref).map((a) => [a.account_ref!, a.id])
    );
    const productToAccount = new Map<string, string>();
    for (const r of toImport) {
      if (r.card && r.product && refToAccount.has(r.card)) {
        productToAccount.set(r.product, refToAccount.get(r.card)!);
      }
    }
    const routeFor = (r: (typeof toImport)[number]) => {
      if (r.card && refToAccount.has(r.card))
        return { account_id: refToAccount.get(r.card)!, cardholder: "Primary" };
      if (r.product && productToAccount.has(r.product))
        return { account_id: productToAccount.get(r.product)!, cardholder: "Supplementary" };
      return { account_id: accountId, cardholder: r.card ? "Supplementary" : null };
    };

    const payload = toImport.map((r) => {
      const route = routeFor(r);
      return {
        owner_id: userId,
        account_id: route.account_id,
        txn_date: r.date,
        description: r.description,
        category: r.category,
        amount: r.amount,
        source: "import",
        statement_id: stmt.id,
        card: r.card ?? null,
        cardholder: route.cardholder,
      };
    });

    const { error: te } = await supabase.from("transactions").insert(payload);
    if (te) {
      setImporting(false);
      // roll back the statement row so we don't leave an empty import
      await supabase.from("statements").delete().eq("id", stmt.id);
      setError(`Import failed: ${te.message}`);
      return;
    }

    // Set the account balance to the statement's closing balance (authoritative).
    if (applyClosing && closing !== null && accountId) {
      await supabase
        .from("accounts")
        .update({ balance: closing })
        .eq("id", accountId);
      setAccts((prev) =>
        prev.map((a) => (a.id === accountId ? { ...a, balance: closing } : a))
      );
    }

    setImporting(false);
    reset();
    router.refresh();
  }

  async function undoImport(s: Statement) {
    if (
      !confirm(
        `Remove the ${s.txn_count} transactions imported from "${s.filename ?? "statement"}"?`
      )
    )
      return;
    await supabase.from("transactions").delete().eq("statement_id", s.id);
    await supabase.from("statements").delete().eq("id", s.id);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <PageHead
        title="Import statements"
        subtitle="Drop a bank or card statement — we'll turn it into transactions"
        action={
          step === "review" ? (
            <button onClick={reset} className="btn-ghost text-sm">
              <X className="h-4 w-4" /> Start over
            </button>
          ) : undefined
        }
      />

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose/30 bg-rose/5 p-3 text-sm text-rose">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === "upload" && (
        <>
          <StatementChecklist accounts={accts} statements={statements} />

          <div className="grid gap-4 lg:grid-cols-5">
            {/* Dropzone */}
            <Card className="lg:col-span-3">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                onClick={() => fileInput.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line py-12 text-center transition hover:border-brand-300 hover:bg-brand-50/40"
              >
                {busy ? (
                  <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                    <Upload className="h-6 w-6" />
                  </span>
                )}
                <p className="mt-4 text-sm font-semibold">
                  {busy ? "Reading your statement…" : "Drop a statement here"}
                </p>
                <p className="mt-1 max-w-xs text-xs text-ink-muted">
                  or click to choose a file — CSV / Excel export or PDF. Nothing
                  leaves your browser until you confirm the import.
                </p>
                <div className="mt-4 flex gap-2 text-xs text-ink-muted">
                  <span className="flex items-center gap-1">
                    <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> PDF
                  </span>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,.txt,.pdf,text/csv,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>
            </Card>

            {/* Target account + tips */}
            <Card className="lg:col-span-2">
              <label className="label">Import into account</label>
              {accts.length === 0 ? (
                <button
                  onClick={startNewAccount}
                  className="btn-brand mt-1.5 w-full text-sm"
                >
                  <Plus className="h-4 w-4" /> Create your first account
                </button>
              ) : (
                <div className="mt-1.5 flex gap-2">
                  <select
                    className="input"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                  >
                    {accts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.currency !== "MYR" ? ` (${a.currency})` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={startNewAccount}
                    className="btn-ghost shrink-0 px-3"
                    title="New account"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="mt-4 space-y-2 rounded-xl bg-canvas p-3 text-xs text-ink-muted">
                <p className="flex items-center gap-1.5 font-medium text-ink">
                  <Sparkles className="h-3.5 w-3.5 text-brand-600" /> Tips
                </p>
                <p>• CSV exports parse most accurately — columns auto-detect.</p>
                <p>• You'll review and edit every row before anything saves.</p>
                <p>• Duplicates already in this app are flagged and skipped.</p>
              </div>
            </Card>
          </div>

          {/* Paste fallback */}
          <Card>
            <div className="mb-2 flex items-center gap-2">
              <ClipboardPaste className="h-4 w-4 text-ink-muted" />
              <h3 className="text-sm font-semibold">Or paste statement text</h3>
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={5}
              placeholder={"05/07/2026  Jaya Grocer            320.50 DR\n06/07/2026  Salary               9,000.00 CR"}
              className="input font-mono text-xs"
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={handlePaste}
                disabled={!pasteText.trim()}
                className="btn-dark text-sm"
              >
                Parse text
              </button>
            </div>
          </Card>
        </>
      )}

      {step === "review" && (
        <>
          {/* Auto-routing banner */}
          {route?.status === "matched" && (
            <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm text-brand-800">
              <Check className="h-4 w-4 shrink-0 text-brand-600" />
              <span>
                Auto-matched to <b>{route.account.name}</b>
                {route.account.account_ref ? ` (••${route.account.account_ref})` : ""}{" "}
                from the account number on the statement.
              </span>
            </div>
          )}
          {route?.status === "multi" && (
            <div className="flex items-center gap-2 rounded-xl border border-sky/30 bg-sky/5 px-3 py-2.5 text-sm text-sky">
              <Check className="h-4 w-4 shrink-0" />
              <span>
                This statement references multiple cards — routed to{" "}
                <b>{route.account.name}</b>. Also matches:{" "}
                {route.others.map((o) => o.name).join(", ")}. Change the account
                below if needed.
              </span>
            </div>
          )}
          {route?.status === "none" && (
            <div className="flex items-center gap-2 rounded-xl border border-tangerine/30 bg-tangerine/5 px-3 py-2.5 text-sm text-tangerine">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Couldn&apos;t match this statement to an account by its number —
                pick the account below.
              </span>
            </div>
          )}

          {/* Summary bar */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div>
                  <p className="label">Found</p>
                  <p className="text-lg font-bold">{rows.length} rows</p>
                </div>
                <div>
                  <p className="label">Selected</p>
                  <p className="text-lg font-bold text-brand-700">
                    {selected.length}
                  </p>
                </div>
                <div>
                  <p className="label">Duplicates</p>
                  <p className="text-lg font-bold text-tangerine">{dupes}</p>
                </div>
                <div>
                  <p className="label">Money in / out</p>
                  <p className="text-sm font-semibold">
                    <span className="text-brand-700">{money(totalsIn)}</span>
                    {"  ·  "}
                    <span className="text-rose">{money(totalsOut)}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {accts.length === 0 ? (
                  <button
                    onClick={startNewAccount}
                    className="btn-ghost text-sm"
                  >
                    <Plus className="h-4 w-4" /> New account
                  </button>
                ) : (
                  <div className="flex items-center">
                    <select
                      className="input w-auto rounded-r-none"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                    >
                      {accts.map((a) => (
                        <option key={a.id} value={a.id}>
                          → {a.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={startNewAccount}
                      className="btn-ghost rounded-l-none border border-l-0 border-line px-2.5"
                      title="New account"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <button
                  onClick={doImport}
                  disabled={importing || selected.length === 0}
                  className="btn-brand text-sm"
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Import {selected.length}
                </button>
              </div>
            </div>

            {/* CSV column mapping */}
            {source === "csv" && csvRows && colMap && (
              <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
                <span className="label">Columns:</span>
                {COLS.map(({ key, label }) => (
                  <label key={key} className="text-xs">
                    <span className="mb-0.5 block text-ink-muted">{label}</span>
                    <select
                      className="input w-auto py-1.5 text-xs"
                      value={colMap[key]}
                      onChange={(e) => remap(key, Number(e.target.value))}
                    >
                      <option value={-1}>—</option>
                      {Array.from({
                        length: Math.max(...csvRows.map((r) => r.length)),
                      }).map((_, i) => (
                        <option key={i} value={i}>
                          {colMap.headerRow >= 0
                            ? csvRows[colMap.headerRow][i] || `Col ${i + 1}`
                            : `Col ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3 text-xs">
              <button onClick={() => setAll(true)} className="btn-ghost px-2.5 py-1">
                Select all
              </button>
              <button onClick={() => setAll(false)} className="btn-ghost px-2.5 py-1">
                Deselect all
              </button>
              <button onClick={excludeDupes} className="btn-ghost px-2.5 py-1">
                Exclude duplicates
              </button>
            </div>

            {/* Statement balances */}
            {(opening !== null || closing !== null) && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-canvas p-3">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                  {opening !== null && (
                    <span>
                      <span className="text-ink-muted">Opening balance </span>
                      <span className="font-semibold">{money(opening)}</span>
                    </span>
                  )}
                  {closing !== null && (
                    <span>
                      <span className="text-ink-muted">Closing balance </span>
                      <span className="font-semibold">{money(closing)}</span>
                    </span>
                  )}
                </div>
                {closing !== null && (
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={applyClosing}
                      onChange={(e) => setApplyClosing(e.target.checked)}
                      className="h-4 w-4 accent-brand-500"
                    />
                    Set {accountName(accountId)} balance to closing (
                    {money(closing)})
                  </label>
                )}
              </div>
            )}
          </Card>

          {/* Editable rows */}
          <Card className="overflow-hidden p-0">
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-canvas text-left text-xs text-ink-muted">
                  <tr>
                    <th className="w-10 px-3 py-2"></th>
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Description</th>
                    <th className="px-2 py-2 font-medium">Category</th>
                    <th className="px-2 py-2 font-medium">Dir</th>
                    <th className="px-2 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const out = r.amount < 0;
                    return (
                      <tr
                        key={r.id}
                        className={
                          "border-t border-line " +
                          (!r.include ? "opacity-45" : "") +
                          (r.duplicate ? " bg-tangerine/5" : "")
                        }
                      >
                        <td className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            checked={r.include}
                            onChange={(e) =>
                              patch(r.id, { include: e.target.checked })
                            }
                            className="h-4 w-4 accent-brand-500"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="date"
                            value={r.date}
                            onChange={(e) => patch(r.id, { date: e.target.value })}
                            className="input w-[130px] px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <input
                              value={r.description}
                              onChange={(e) =>
                                patch(r.id, { description: e.target.value })
                              }
                              className="input min-w-[180px] px-2 py-1 text-xs"
                            />
                            {r.duplicate && (
                              <span className="pill shrink-0 bg-tangerine/15 text-tangerine">
                                dup
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={r.category}
                            onChange={(e) =>
                              patch(r.id, { category: e.target.value })
                            }
                            className="input w-[130px] px-2 py-1 text-xs"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            onClick={() =>
                              patch(r.id, { amount: -r.amount })
                            }
                            className={
                              "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium " +
                              (out
                                ? "bg-rose/10 text-rose"
                                : "bg-brand-50 text-brand-700")
                            }
                            title="Click to flip in/out"
                          >
                            {out ? (
                              <ArrowDownRight className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            )}
                            {out ? "Out" : "In"}
                          </button>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={Math.abs(r.amount)}
                            onChange={(e) => {
                              const v = Math.abs(Number(e.target.value));
                              patch(r.id, { amount: out ? -v : v });
                            }}
                            className="input w-[110px] px-2 py-1 text-right text-xs"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Import history */}
      {step === "upload" && statements.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Import history</h3>
          <div className="divide-y divide-line">
            {statements.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-canvas text-ink-muted">
                    {s.source === "pdf" ? (
                      <FileText className="h-4 w-4" />
                    ) : s.source === "paste" ? (
                      <ClipboardPaste className="h-4 w-4" />
                    ) : (
                      <FileSpreadsheet className="h-4 w-4" />
                    )}
                  </span>
                  <div>
                    <p className="text-sm font-medium">
                      {s.filename ?? "Statement"}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {s.txn_count} txns · {accountName(s.account_id)}
                      {s.period_start
                        ? ` · ${fmtDay(s.period_start)}–${fmtDay(
                            s.period_end ?? s.period_start
                          )}`
                        : ""}
                      {" · "}
                      {fmtDate(s.imported_at)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => undoImport(s)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-rose/10 hover:text-rose"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Undo
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Inline new-account modal */}
      <Modal
        open={acctOpen}
        onClose={() => setAcctOpen(false)}
        title="New account"
        subtitle="Create the account to import into — your parsed rows stay put."
        footer={
          <>
            <button
              onClick={() => setAcctOpen(false)}
              className="btn-ghost text-sm"
            >
              Cancel
            </button>
            <button
              onClick={createAccount}
              disabled={acctSaving || !acctDraft.name}
              className="btn-dark text-sm"
            >
              {acctSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create &amp; select
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Account name">
            <input
              className="input"
              value={acctDraft.name ?? ""}
              onChange={(e) =>
                setAcctDraft({ ...acctDraft, name: e.target.value })
              }
              placeholder="e.g. Maybank Islamic Premier"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select
                className="input"
                value={acctDraft.type ?? "bank"}
                onChange={(e) =>
                  setAcctDraft({
                    ...acctDraft,
                    type: e.target.value as AccountType,
                  })
                }
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACCOUNT_TYPE_META[t].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Currency">
              <select
                className="input"
                value={acctDraft.currency ?? "MYR"}
                onChange={(e) =>
                  setAcctDraft({
                    ...acctDraft,
                    currency: e.target.value,
                    fx_rate: DEFAULT_FX[e.target.value] ?? 1,
                  })
                }
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Starting balance (optional)">
            <input
              type="number"
              step="0.01"
              className="input"
              value={acctDraft.balance ?? 0}
              onChange={(e) =>
                setAcctDraft({ ...acctDraft, balance: Number(e.target.value) })
              }
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
