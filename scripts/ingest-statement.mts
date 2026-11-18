// Statement ingestion: turn an already-extracted transaction list (or a
// well-behaved bank PDF/CSV) into rows in Supabase, reusing exactly the same
// categoriser and duplicate-detection logic as the in-app "Import statements"
// page and the Wise sync (lib/parse/statement.ts's guessCategory/markDuplicates).
//
// Usage:
//   npx tsx scripts/ingest-statement.mts <file> <account> [--dry-run] [--password <pwd>]
//
// <file>    Path to one of:
//             - a .json file: an array of transactions someone (Claude, reading
//               the statement PDF/photo directly) has already transcribed.
//               THIS IS THE RECOMMENDED PATH — it works for any bank, any
//               layout, and for photos of paper statements, because a human
//               (or an LLM with vision) did the reading, not a regex parser.
//               Shape: [{ "date": "2026-07-05", "description": "...",
//                         "amount": -30.00 }, ...]
//               "amount" is signed: positive = money in, negative = money out.
//               An optional "category" per row overrides the auto-categoriser.
//             - a .pdf file: best-effort automatic parse using the same
//               heuristic parser the in-app importer uses. Works well for
//               ordinary digital bank/card statements (Maybank, RHB, etc.);
//               may parse poorly for unusual layouts (see StatementsView.tsx's
//               notes on Touch 'n Go's columnar PDF) — if the output here
//               looks wrong or mostly ends up in "needs review", transcribe
//               to JSON instead.
//             - a .csv file: same heuristic column-detection parser as the
//               in-app importer.
//           Images (.jpg/.png/etc.) are refused — this script has no OCR/vision
//           of its own; have Claude read the photo and write a .json file.
//
// <account> Exact (or unambiguous partial) account name as shown on the
//           Accounts page, its ••last-4 account_ref, or its UUID id. Required,
//           always — this script never guesses which account a statement
//           belongs to.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (+ NEXT_PUBLIC_SUPABASE_URL) in this
// machine's .env.local — the same service-role connection the Vercel cron
// job uses (lib/supabase/admin.ts). Get the secret key from Supabase →
// Settings → API Keys → Secret keys. Never share it outside this file.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { isValid, parseISO } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../lib/supabase/admin.ts";
import {
  parseCSV,
  detectColumns,
  fromCSV,
  fromText,
  statementPeriod,
  guessCategory,
  type ParsedTxn,
} from "../lib/parse/statement.ts";
import { REVIEW_CATEGORY } from "../lib/constants.ts";
import { money, fmtDate } from "../lib/format.ts";

// ------------------------------------------------------------------
// .env.local loader (this is a standalone script, not the Next.js server —
// nothing auto-loads .env.local for it). Real process.env vars always win.
// ------------------------------------------------------------------
export function loadDotEnvLocal(cwd = process.cwd()) {
  const envPath = path.join(cwd, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// ------------------------------------------------------------------
// CLI args
// ------------------------------------------------------------------
export type CliArgs = {
  file?: string;
  account?: string;
  dryRun: boolean;
  alerts: boolean;
  password?: string;
};

export function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const positional: string[] = [];
  const kv: Record<string, string> = {};
  let dryRun = false;
  let alerts = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--alerts") {
      alerts = true;
    } else if (a === "--password") {
      kv.password = args[++i];
    } else if (a.startsWith("--password=")) {
      kv.password = a.slice("--password=".length);
    } else if (a === "--account") {
      kv.account = args[++i];
    } else if (a.startsWith("--account=")) {
      kv.account = a.slice("--account=".length);
    } else if (a === "--file") {
      kv.file = args[++i];
    } else if (a.startsWith("--file=")) {
      kv.file = a.slice("--file=".length);
    } else {
      positional.push(a);
    }
  }
  return {
    file: kv.file ?? positional[0],
    account: kv.account ?? positional[1],
    dryRun,
    alerts,
    password: kv.password,
  };
}

const USAGE = `Usage:
  npx tsx scripts/ingest-statement.mts <file> <account> [--dry-run] [--alerts] [--password <pwd>]

<file>     .json (recommended — a transaction list already transcribed by
           Claude reading the statement PDF/photo), .pdf, or .csv.
<account>  Exact/partial account name, ••last-4, or id (never guessed).
--alerts   The .json holds bank alert-email transactions (provisional): they are
           tagged source "alert" and later replaced when the statement covering
           their dates is imported.
--password Encrypted PDF password; defaults to STATEMENT_PDF_PASSWORD in .env.local.

Examples:
  npx tsx scripts/ingest-statement.mts ./statement.json "Maybank Islamic Premier"
  npx tsx scripts/ingest-statement.mts ./statement.pdf RHB --dry-run
  npx tsx scripts/ingest-statement.mts ./alerts-0748.json 0748 --alerts
`;

// ------------------------------------------------------------------
// File loading — three supported kinds, plus explicit refusal of images.
// ------------------------------------------------------------------
export type Kind = "json" | "pdf" | "csv" | "image" | "unsupported";

const IMAGE_EXTS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".heif",
  ".webp",
  ".tif",
  ".tiff",
  ".bmp",
  ".gif",
];

export function detectKind(file: string): Kind {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".pdf") return "pdf";
  if (ext === ".csv") return "csv";
  if (IMAGE_EXTS.includes(ext)) return "image";
  return "unsupported";
}

export type RawTxn = {
  date: string;
  description: string;
  amount: number;
  category?: string | null;
  ref?: string | null; // alert reference (e.g. Payment Advice no.), stored as external_ref
  card?: string | null; // last 4 of the card (combined credit-card statements)
  product?: string | null; // card product section the row came from
};

export function loadJsonTransactions(file: string): RawTxn[] {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(
      `${file} must contain a JSON array of transactions, e.g. ` +
        `[{"date":"2026-07-05","description":"...","amount":-30.00}]`
    );
  }
  return parsed;
}

async function extractPdfLines(
  filePath: string,
  password?: string
): Promise<string> {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const pdfjs: any = await import(
    "file://" + require.resolve("pdfjs-dist/legacy/build/pdf.mjs")
  );
  const bytes = fs.readFileSync(filePath);
  // Open without a password first: statements downloaded from Maybank2u are
  // encrypted with an empty open-password and reject any other password, so
  // the e-statement password is only tried when the file actually asks.
  const open = (pw?: string) =>
    pdfjs.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useSystemFonts: true,
      password: pw,
    }).promise;
  let doc;
  try {
    doc = await open();
  } catch (e: any) {
    if (e?.name !== "PasswordException") throw e;
    if (!password) {
      throw new Error("This PDF is password-protected. Re-run with --password <password>.");
    }
    try {
      doc = await open(password);
    } catch (e2: any) {
      if (e2?.name === "PasswordException") {
        throw new Error("That password was incorrect. Re-run with --password <correct-password>.");
      }
      throw e2;
    }
  }
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines = new Map<number, { x: number; str: string }[]>();
    for (const it of content.items as any[]) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y)!.push({ x: it.transform[4], str: it.str });
    }
    for (const y of Array.from(lines.keys()).sort((a, b) => b - a)) {
      const line = lines
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((f) => f.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (line) text += line + "\n";
    }
    text += "\n";
  }
  return text;
}

function fromParsedTxn(rows: ParsedTxn[]): RawTxn[] {
  return rows.map((r) => ({
    date: r.date,
    description: r.description,
    amount: r.amount,
    category: r.category,
    card: r.card ?? null,
    product: r.product ?? null,
  }));
}

// A Maybank card statement covers every card on the account — the primary
// cards of each product plus their supplementary cards — so keep only the
// rows that belong to `accountRef`, the same rule as the Import statements
// page: the card whose last 4 is the account's ref is Primary, and other
// cards in that card's product section are its Supplementary cards.
export function selectCardRows(
  rows: RawTxn[],
  accountRef: string | null
): { rows: (RawTxn & { cardholder: string | null })[]; otherCards: number } {
  if (!rows.some((r) => r.card)) return { rows: rows.map((r) => ({ ...r, cardholder: null })), otherCards: 0 };
  const products = new Set(
    rows.filter((r) => r.card && r.card === accountRef && r.product).map((r) => r.product!)
  );
  const kept: (RawTxn & { cardholder: string | null })[] = [];
  let otherCards = 0;
  for (const r of rows) {
    if (r.card && r.card === accountRef) kept.push({ ...r, cardholder: "Primary" });
    else if (r.card && r.product && products.has(r.product)) kept.push({ ...r, cardholder: "Supplementary" });
    else otherCards++;
  }
  return { rows: kept, otherCards };
}

export async function loadTransactions(
  file: string,
  kind: Kind,
  password?: string
): Promise<RawTxn[]> {
  if (kind === "json") return loadJsonTransactions(file);
  if (kind === "csv") {
    const text = fs.readFileSync(file, "utf8");
    const rows = parseCSV(text);
    return fromParsedTxn(fromCSV(rows, detectColumns(rows)));
  }
  if (kind === "pdf") {
    const text = await extractPdfLines(file, password);
    return fromParsedTxn(fromText(text));
  }
  if (kind === "image") {
    throw new Error(
      "Images have no automatic parser here (no OCR/vision in this script). " +
        "Open the photo with Claude, have it transcribe the transactions, " +
        "save that as a .json file (see the format in this script's header " +
        "comment), and run this script against the .json file instead."
    );
  }
  throw new Error(
    `Unsupported file type "${path.extname(file)}". Use .json (recommended), .pdf, or .csv.`
  );
}

// ------------------------------------------------------------------
// Validation + categorisation — every row goes through the SAME
// guessCategory() the Wise sync and in-app importer use, including the
// transfer/top-up fix already shipped there.
// ------------------------------------------------------------------
export type ValidTxn = {
  date: string;
  description: string;
  amount: number;
  category: string;
  ref?: string | null;
  card?: string | null;
  cardholder?: string | null;
};
export type InvalidTxn = { index: number; reason: string; raw: unknown };

export function validateAndCategorize(rows: (RawTxn & { cardholder?: string | null })[]): {
  valid: ValidTxn[];
  invalid: InvalidTxn[];
  needsReview: ValidTxn[];
} {
  const valid: ValidTxn[] = [];
  const invalid: InvalidTxn[] = [];
  const needsReview: ValidTxn[] = [];

  rows.forEach((r, index) => {
    const date = String(r?.date ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValid(parseISO(date))) {
      invalid.push({ index, reason: `unparseable date "${r?.date}"`, raw: r });
      return;
    }
    const description = String(r?.description ?? "").trim();
    if (!description) {
      invalid.push({ index, reason: "missing description", raw: r });
      return;
    }
    const amount = typeof r?.amount === "number" ? r.amount : Number(r?.amount);
    if (!Number.isFinite(amount)) {
      invalid.push({ index, reason: `unparseable amount "${r?.amount}"`, raw: r });
      return;
    }
    const category = (r?.category && String(r.category).trim()) || guessCategory(description);
    const ref = r?.ref ? String(r.ref).trim() || null : null;
    const txn: ValidTxn = {
      date,
      description,
      amount,
      category,
      ref,
      card: r?.card ?? null,
      cardholder: r?.cardholder ?? null,
    };
    valid.push(txn);
    if (category === REVIEW_CATEGORY) needsReview.push(txn);
  });

  return { valid, invalid, needsReview };
}

// ------------------------------------------------------------------
// Duplicate detection — same date+amount+description key as the in-app
// importer's markDuplicates, scoped to this account's existing rows, but
// counted: every line of a statement is a real transaction, so two
// identical charges on one statement (two same-day fuel top-ups) are both
// kept, and a row is only a duplicate while the account already holds an
// unmatched copy of it. Re-running a statement therefore inserts nothing,
// and a partly-imported one gets only its missing rows.
// ------------------------------------------------------------------
const dupKey = (d: string, a: number, desc: string) =>
  `${d}|${Number(a).toFixed(2)}|${(desc || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 48)}`;

export function dedupeAgainstExisting(
  valid: ValidTxn[],
  existing: { txn_date: string; amount: number; description: string }[]
): { toInsert: ValidTxn[]; duplicates: ValidTxn[] } {
  const remaining = new Map<string, number>();
  for (const e of existing) {
    const k = dupKey(e.txn_date, e.amount, e.description);
    remaining.set(k, (remaining.get(k) ?? 0) + 1);
  }
  const toInsert: ValidTxn[] = [];
  const duplicates: ValidTxn[] = [];
  for (const v of valid) {
    const k = dupKey(v.date, v.amount, v.description);
    const left = remaining.get(k) ?? 0;
    if (left > 0) {
      remaining.set(k, left - 1);
      duplicates.push(v);
    } else {
      toInsert.push(v);
    }
  }
  return { toInsert, duplicates };
}

// Alert emails never word a transaction the way the statement does, so they
// are matched on date + amount (or their own reference) against every row
// already on the account — a credit the statement has already recorded, or a
// second alert for the same transfer (e.g. a "received money" alert plus a
// Payment Advice), is skipped instead of double-counted.
export function dedupeAlerts(
  valid: ValidTxn[],
  existing: { txn_date: string; amount: number; external_ref?: string | null }[]
): { toInsert: ValidTxn[]; duplicates: ValidTxn[] } {
  const key = (d: string, a: number) => `${d}|${Number(a).toFixed(2)}`;
  const seen = new Set(existing.map((e) => key(e.txn_date, e.amount)));
  const refs = new Set(existing.map((e) => e.external_ref).filter(Boolean));
  const toInsert: ValidTxn[] = [];
  const duplicates: ValidTxn[] = [];
  for (const v of valid) {
    const k = key(v.date, v.amount);
    if (seen.has(k) || (v.ref && refs.has(v.ref))) {
      duplicates.push(v);
      continue;
    }
    seen.add(k);
    if (v.ref) refs.add(v.ref);
    toInsert.push(v);
  }
  return { toInsert, duplicates };
}

// ------------------------------------------------------------------
// Supabase: account + owner resolution, existing-row lookup, inserts.
// ------------------------------------------------------------------
type AccountRow = {
  id: string;
  name: string;
  account_ref: string | null;
  institution: string | null;
  type: string;
};

function listAccounts(accounts: AccountRow[]): string {
  return accounts
    .map(
      (a) =>
        `  - ${a.name}${a.account_ref ? ` (••${a.account_ref})` : ""}${
          a.institution ? ` · ${a.institution}` : ""
        } — id ${a.id}`
    )
    .join("\n");
}

export async function resolveAccount(
  supabase: SupabaseClient,
  identifier: string
): Promise<AccountRow> {
  const { data, error } = await supabase
    .from("accounts")
    .select("id,name,account_ref,institution,type");
  if (error) throw new Error(`Could not read accounts: ${error.message}`);
  const accounts = (data ?? []) as AccountRow[];
  if (accounts.length === 0) {
    throw new Error("No accounts exist in this Supabase project yet.");
  }

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      identifier
    );
  if (isUuid) {
    const byId = accounts.find((a) => a.id === identifier);
    if (byId) return byId;
    throw new Error(`No account with id "${identifier}".`);
  }

  const norm = identifier.trim().toLowerCase();
  const exact = accounts.filter(
    (a) => a.name.toLowerCase() === norm || a.account_ref === identifier.trim()
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new Error(
      `"${identifier}" matches more than one account — specify the id instead:\n${listAccounts(exact)}`
    );
  }

  const partial = accounts.filter((a) => a.name.toLowerCase().includes(norm));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(
      `"${identifier}" is ambiguous — it matches:\n${listAccounts(
        partial
      )}\nRe-run with the exact name or the id.`
    );
  }

  throw new Error(
    `No account matches "${identifier}". This script never guesses — ` +
      `available accounts:\n${listAccounts(accounts)}`
  );
}

// Same owner-resolution pattern as app/api/cron/wise/route.ts.
export async function resolveOwnerId(supabase: SupabaseClient): Promise<string> {
  let ownerId = process.env.OWNER_USER_ID;
  if (!ownerId) {
    const { data } = await supabase.auth.admin.listUsers();
    const first = (data?.users ?? []).sort(
      (a: any, b: any) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0];
    ownerId = first?.id;
  }
  if (!ownerId) throw new Error("No user found to attribute these transactions to.");
  return ownerId;
}

async function fetchExisting(supabase: SupabaseClient, accountId: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select("txn_date, amount, description, source, external_ref")
    .eq("account_id", accountId);
  if (error) throw new Error(`Could not read existing transactions: ${error.message}`);
  return (data ?? []) as {
    txn_date: string;
    amount: number;
    description: string;
    source: string | null;
    external_ref: string | null;
  }[];
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
async function main() {
  loadDotEnvLocal();

  const { file, account, dryRun, alerts, password: pwArg } = parseArgs(process.argv);
  const password = pwArg ?? process.env.STATEMENT_PDF_PASSWORD;
  if (!file || !account) {
    console.error(USAGE);
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`ERROR: file not found: ${file}`);
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error(
      "ERROR: SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set " +
        "in this machine's .env.local — get the secret key from Supabase → " +
        "Settings → API Keys → Secret keys. This is required even for --dry-run, " +
        "since resolving the account and checking for duplicates both read real data."
    );
    process.exit(1);
  }

  const kind = detectKind(file);
  if (alerts && kind !== "json") {
    console.error("ERROR: --alerts expects a .json file of alert transactions.");
    process.exit(1);
  }
  const loaded = await loadTransactions(file, kind, password);

  const supabase = createAdminClient();
  const accountRow = await resolveAccount(supabase, account);
  const { rows: raw, otherCards } = selectCardRows(loaded, accountRow.account_ref);
  const { valid, invalid, needsReview } = validateAndCategorize(raw);
  const ownerId = await resolveOwnerId(supabase);
  const existing = await fetchExisting(supabase, accountRow.id);
  // A statement is authoritative, so its rows are checked only against other
  // non-alert rows; the alert rows it covers are removed after it lands.
  const { toInsert, duplicates } = alerts
    ? dedupeAlerts(valid, existing)
    : dedupeAgainstExisting(valid, existing.filter((e) => e.source !== "alert"));

  const period = statementPeriod(valid.length ? valid : raw as any);
  const totalIn = valid.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = valid.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  let statementId: string | null = null;
  let inserted = 0;
  let alertsReplaced = 0;

  if (!dryRun && alerts) {
    if (toInsert.length > 0) {
      const rows = toInsert.map((t) => ({
        owner_id: ownerId,
        account_id: accountRow.id,
        txn_date: t.date,
        description: t.description,
        category: t.category,
        amount: t.amount,
        source: "alert",
        external_ref: t.ref ?? null,
      }));
      const { error: te } = await supabase.from("transactions").insert(rows);
      if (te) throw new Error(`Insert failed: ${te.message}`);
      inserted = toInsert.length;
    }
  } else if (!dryRun) {
    if (toInsert.length > 0) {
      // Re-running the same statement tops up its existing record rather
      // than adding a second entry to the import history.
      const { data: prior } = await supabase
        .from("statements")
        .select("id, txn_count")
        .eq("account_id", accountRow.id)
        .eq("filename", path.basename(file))
        .eq("period_start", period.start)
        .eq("period_end", period.end)
        .limit(1);
      let createdStatement = false;
      if (prior && prior.length) {
        statementId = prior[0].id;
        await supabase
          .from("statements")
          .update({ txn_count: (prior[0].txn_count ?? 0) + toInsert.length })
          .eq("id", statementId);
      } else {
        const { data: stmt, error: se } = await supabase
          .from("statements")
          .insert({
            owner_id: ownerId,
            account_id: accountRow.id,
            filename: path.basename(file),
            source: kind === "json" ? "other" : kind,
            period_start: period.start,
            period_end: period.end,
            txn_count: toInsert.length,
          })
          .select("id")
          .single();
        if (se || !stmt) {
          throw new Error(`Could not create statement record: ${se?.message ?? "unknown error"}`);
        }
        statementId = stmt.id;
        createdStatement = true;
      }

      const rows = toInsert.map((t) => ({
        owner_id: ownerId,
        account_id: accountRow.id,
        txn_date: t.date,
        description: t.description,
        category: t.category,
        amount: t.amount,
        source: "ingest",
        statement_id: statementId,
        card: t.card ?? null,
        cardholder: t.cardholder ?? null,
      }));
      const { error: te } = await supabase.from("transactions").insert(rows);
      if (te) {
        if (createdStatement) await supabase.from("statements").delete().eq("id", statementId);
        throw new Error(`Insert failed: ${te.message}`);
      }
      inserted = toInsert.length;
    } else if (raw.length === 0 && kind === "json") {
      // An explicit empty JSON array is a trustworthy signal (someone read the
      // statement and confirmed there was no activity) — record it so the
      // month shows "done" on the Import statements completeness checklist.
      await supabase.from("statements").insert({
        owner_id: ownerId,
        account_id: accountRow.id,
        filename: path.basename(file),
        source: "other",
        period_start: null,
        period_end: null,
        txn_count: 0,
      });
    }

    // The statement now holds the real record of these dates, so drop the
    // provisional alert rows it covers (they'd otherwise be counted twice).
    if (valid.length > 0 && period.start && period.end) {
      const { data: gone, error: de } = await supabase
        .from("transactions")
        .delete()
        .eq("account_id", accountRow.id)
        .eq("source", "alert")
        .gte("txn_date", period.start)
        .lte("txn_date", period.end)
        .select("id");
      if (de) throw new Error(`Could not remove superseded alert rows: ${de.message}`);
      alertsReplaced = gone?.length ?? 0;
    }
  }

  // ---------------- Summary ----------------
  console.log(alerts ? "=== Alert ingestion summary ===" : "=== Statement ingestion summary ===");
  console.log(
    `Account:        ${accountRow.name}${
      accountRow.account_ref ? ` (••${accountRow.account_ref})` : ""
    }`
  );
  console.log(`Source file:    ${path.basename(file)} (${kind})`);
  console.log(
    `Period covered: ${period.start ? fmtDate(period.start) : "—"} → ${
      period.end ? fmtDate(period.end) : "—"
    }`
  );
  console.log(`Parsed rows:    ${raw.length}`);
  if (otherCards) console.log(`Other cards' rows (left for their own account): ${otherCards}`);
  console.log(`${dryRun ? "Would insert" : "Inserted"}:     ${dryRun ? toInsert.length : inserted}`);
  console.log(`Duplicates (skipped, already in DB): ${duplicates.length}`);
  console.log(
    `Needs review (inserted, but category = "${REVIEW_CATEGORY}"): ${needsReview.length}`
  );
  for (const t of needsReview) {
    console.log(`  - ${t.date}  ${t.amount >= 0 ? "+" : ""}${t.amount.toFixed(2)}  ${t.description}`);
  }
  console.log(`Not confident (NOT inserted — add these manually): ${invalid.length}`);
  for (const inv of invalid) {
    console.log(`  - row ${inv.index}: ${inv.reason}`);
  }
  console.log(`Statement totals: ${money(totalIn)} in / ${money(totalOut)} out`);
  if (!alerts) console.log(`Provisional alert rows replaced by this statement: ${alertsReplaced}`);
  if (dryRun) console.log("\nDry run — nothing was written to Supabase.");

  console.log(
    "RESULT_JSON=" +
      JSON.stringify({
        ok: true,
        dryRun,
        mode: alerts ? "alerts" : "statement",
        account: { id: accountRow.id, name: accountRow.name },
        file: path.basename(file),
        kind,
        periodStart: period.start,
        periodEnd: period.end,
        parsed: raw.length,
        otherCards,
        inserted: dryRun ? 0 : inserted,
        wouldInsert: toInsert.length,
        duplicates: duplicates.length,
        needsReview: needsReview.length,
        invalid: invalid.length,
        totalIn,
        totalOut,
        statementId,
        alertsReplaced,
      })
  );
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => {
    console.error("ERROR:", e?.message ?? e);
    process.exit(1);
  });
}
