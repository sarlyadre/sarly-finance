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
  markDuplicates,
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
  password?: string;
};

export function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const positional: string[] = [];
  const kv: Record<string, string> = {};
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dry-run") {
      dryRun = true;
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
    password: kv.password,
  };
}

const USAGE = `Usage:
  npx tsx scripts/ingest-statement.mts <file> <account> [--dry-run] [--password <pwd>]

<file>     .json (recommended — a transaction list already transcribed by
           Claude reading the statement PDF/photo), .pdf, or .csv.
<account>  Exact/partial account name, ••last-4, or id (never guessed).

Examples:
  npx tsx scripts/ingest-statement.mts ./statement.json "Maybank Islamic Premier"
  npx tsx scripts/ingest-statement.mts ./statement.pdf RHB --dry-run
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
  const data = new Uint8Array(fs.readFileSync(filePath));
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data,
      isEvalSupported: false,
      useSystemFonts: true,
      password,
    }).promise;
  } catch (e: any) {
    if (e?.name === "PasswordException") {
      throw new Error(
        e.code === 2
          ? "That password was incorrect. Re-run with --password <correct-password>."
          : "This PDF is password-protected. Re-run with --password <password>."
      );
    }
    throw e;
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
  }));
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
export type ValidTxn = { date: string; description: string; amount: number; category: string };
export type InvalidTxn = { index: number; reason: string; raw: unknown };

export function validateAndCategorize(rows: RawTxn[]): {
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
    const txn: ValidTxn = { date, description, amount, category };
    valid.push(txn);
    if (category === REVIEW_CATEGORY) needsReview.push(txn);
  });

  return { valid, invalid, needsReview };
}

// ------------------------------------------------------------------
// Duplicate detection — reuses lib/parse/statement.ts's markDuplicates
// exactly (same date+amount+description key the in-app importer uses),
// scoped to just this account's existing rows (tighter than the in-app
// importer's whole-history check, and still correct for re-running the
// same statement or overlapping with an already-synced Wise period).
// ------------------------------------------------------------------
export function dedupeAgainstExisting(
  valid: ValidTxn[],
  existing: { txn_date: string; amount: number; description: string }[]
): { toInsert: ValidTxn[]; duplicates: ValidTxn[] } {
  const shaped: ParsedTxn[] = valid.map((v, i) => ({
    id: `ingest-${i}`,
    date: v.date,
    description: v.description,
    amount: v.amount,
    category: v.category,
    include: true,
    duplicate: false,
  }));
  const flagged = markDuplicates(shaped, existing);
  const toInsert: ValidTxn[] = [];
  const duplicates: ValidTxn[] = [];
  flagged.forEach((f, i) => {
    (f.duplicate ? duplicates : toInsert).push(valid[i]);
  });
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
    .select("txn_date, amount, description")
    .eq("account_id", accountId);
  if (error) throw new Error(`Could not read existing transactions: ${error.message}`);
  return (data ?? []) as { txn_date: string; amount: number; description: string }[];
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
async function main() {
  loadDotEnvLocal();

  const { file, account, dryRun, password } = parseArgs(process.argv);
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
  const raw = await loadTransactions(file, kind, password);
  const { valid, invalid, needsReview } = validateAndCategorize(raw);

  const supabase = createAdminClient();
  const accountRow = await resolveAccount(supabase, account);
  const ownerId = await resolveOwnerId(supabase);
  const existing = await fetchExisting(supabase, accountRow.id);
  const { toInsert, duplicates } = dedupeAgainstExisting(valid, existing);

  const period = statementPeriod(valid.length ? valid : raw as any);
  const totalIn = valid.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = valid.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  let statementId: string | null = null;
  let inserted = 0;

  if (!dryRun) {
    if (toInsert.length > 0) {
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

      const rows = toInsert.map((t) => ({
        owner_id: ownerId,
        account_id: accountRow.id,
        txn_date: t.date,
        description: t.description,
        category: t.category,
        amount: t.amount,
        source: "ingest",
        statement_id: statementId,
      }));
      const { error: te } = await supabase.from("transactions").insert(rows);
      if (te) {
        await supabase.from("statements").delete().eq("id", statementId);
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
  }

  // ---------------- Summary ----------------
  console.log("=== Statement ingestion summary ===");
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
  if (dryRun) console.log("\nDry run — nothing was written to Supabase.");

  console.log(
    "RESULT_JSON=" +
      JSON.stringify({
        ok: true,
        dryRun,
        account: { id: accountRow.id, name: accountRow.name },
        file: path.basename(file),
        kind,
        periodStart: period.start,
        periodEnd: period.end,
        parsed: raw.length,
        inserted: dryRun ? 0 : inserted,
        wouldInsert: toInsert.length,
        duplicates: duplicates.length,
        needsReview: needsReview.length,
        invalid: invalid.length,
        totalIn,
        totalOut,
        statementId,
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
