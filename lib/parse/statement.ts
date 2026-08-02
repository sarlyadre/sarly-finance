import { parse as parseDateFns, isValid, format } from "date-fns";
import type { Transaction } from "@/lib/types";
import { REVIEW_CATEGORY, FOOD_DEFAULT, TRANSFER_CATEGORY } from "@/lib/constants";

export type ParsedTxn = {
  id: string;
  date: string; // yyyy-MM-dd ("" if unparseable)
  description: string;
  amount: number; // signed: + income, - expense
  category: string;
  include: boolean;
  duplicate: boolean;
  card?: string | null; // last 4 of the card this txn is on (credit cards)
  product?: string | null; // card product name from the section header
  raw?: string;
};

export type ColumnMap = {
  date: number;
  description: number;
  details: number; // secondary detail / timestamp column (e.g. TNG "Details")
  amount: number;
  debit: number;
  credit: number;
  balance: number;
  drcr: number;
  headerRow: number;
};

const NONE = -1;

// ------------------------------------------------------------------
// CSV tokenizer (handles quotes, escaped quotes, and , ; or tab)
// ------------------------------------------------------------------
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const counts: Record<string, number> = {
    ",": (sample.match(/,/g) || []).length,
    ";": (sample.match(/;/g) || []).length,
    "\t": (sample.match(/\t/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ",";
}

export function parseCSV(text: string, delimiter?: string): string[][] {
  const delim = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

// ------------------------------------------------------------------
// Dates
// ------------------------------------------------------------------
const DATE_FORMATS = [
  "dd/MM/yyyy",
  "dd-MM-yyyy",
  "dd.MM.yyyy",
  "d/M/yyyy",
  "yyyy-MM-dd",
  "yyyy/MM/dd",
  "dd/MM/yy",
  "dd-MM-yy",
  "d/M/yy",
  "dd MMM yyyy",
  "dd-MMM-yyyy",
  "d MMM yyyy",
  "dd MMM yy",
  "dd MMMM yyyy",
  "MMM dd, yyyy",
  "MMMM d, yyyy",
];

export function parseDate(input: string): string {
  const s = input.trim();
  if (!s) return "";
  for (const fmt of DATE_FORMATS) {
    const d = parseDateFns(s, fmt, new Date());
    if (isValid(d) && d.getFullYear() > 1990 && d.getFullYear() < 2100) {
      return format(d, "yyyy-MM-dd");
    }
  }
  return "";
}

function looksLikeDate(s: string): boolean {
  return parseDate(s) !== "";
}

// ------------------------------------------------------------------
// Amounts
// ------------------------------------------------------------------
/** Parse a money token -> { value, crdr } where crdr: 1=credit, -1=debit, 0=unknown. */
export function parseAmount(
  input: string
): { value: number; crdr: number } | null {
  let s = input.trim();
  if (!s) return null;
  let crdr = 0;
  if (/CR\)?\s*$|\bcredit\b/i.test(s)) crdr = 1;
  else if (/DR\)?\s*$|\bdebit\b/i.test(s)) crdr = -1;

  const negative = /^\(.*\)$/.test(s) || /-\s*$/.test(s) || /^\s*-/.test(s);

  // strip currency symbols, codes, CR/DR markers, parentheses, spaces
  s = s
    .replace(/\(|\)/g, "")
    .replace(/\b(CR|DR|credit|debit|RM|MYR|USD|SGD|EUR|GBP)\b/gi, "")
    .replace(/[$£€]/g, "")
    .replace(/\s/g, "");

  if (s === "" || s === "-" || s === "+") return null;

  // If both comma and dot present, assume comma = thousands.
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (s.includes(",") && !s.includes(".")) {
    // comma could be decimal (e.g. 1.234,56 -> but no dot here) or thousands
    const parts = s.split(",");
    if (parts[parts.length - 1].length === 2) s = s.replace(",", ".");
    else s = s.replace(/,/g, "");
  }

  const n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  if (isNaN(n)) return null;
  const value = negative ? -Math.abs(n) : n;
  return { value, crdr };
}

// ------------------------------------------------------------------
// Column detection for CSV / tabular input
// ------------------------------------------------------------------
// Substring keywords (lowercase). Order below is the claim priority — each
// field claims the first still-unused column that contains one of its keywords,
// so greedy words can't steal a column another field owns. "description" is
// claimed last and also falls back to the widest text column.
const HEADER_KEYWORDS: [keyof Omit<ColumnMap, "headerRow">, string[]][] = [
  ["date", ["date", "tarikh", "posting"]],
  ["balance", ["balance", "baki"]],
  ["debit", ["debit", "withdrawal", "paid out", "money out", "dr amt"]],
  ["credit", ["credit", "deposit", "paid in", "money in", "cr amt"]],
  ["amount", ["amount", "jumlah", "value", "sum"]],
  ["drcr", ["dr/cr", "cr/dr", "type", "indicator"]],
  ["description", ["description", "desc", "narration", "narrative", "particular", "remark", "payee", "memo", "merchant", "detail"]],
  // Claimed after description, so a "Details"/time column is captured separately
  // (e.g. Touch 'n Go has both "Description" = merchant and "Details" = time).
  ["details", ["details", "time", "timestamp", "remarks"]],
];

function matchHeaderRow(cells: string[]): {
  local: Partial<ColumnMap>;
  hits: number;
} {
  const lower = cells.map((c) => c.trim().toLowerCase());
  const used = new Set<number>();
  const local: Partial<ColumnMap> = {};
  let hits = 0;
  for (const [key, kws] of HEADER_KEYWORDS) {
    const idx = lower.findIndex(
      (c, i) => !used.has(i) && c !== "" && kws.some((k) => c.includes(k))
    );
    if (idx !== NONE) {
      local[key] = idx;
      used.add(idx);
      hits++;
    }
  }
  return { local, hits };
}

export function detectColumns(rows: string[][]): ColumnMap {
  const map: ColumnMap = {
    date: NONE,
    description: NONE,
    details: NONE,
    amount: NONE,
    debit: NONE,
    credit: NONE,
    balance: NONE,
    drcr: NONE,
    headerRow: NONE,
  };

  // Find a header row within the first 8 rows.
  const scan = Math.min(rows.length, 8);
  for (let r = 0; r < scan; r++) {
    const { local, hits } = matchHeaderRow(rows[r]);
    if (hits >= 2 && (local.date !== undefined || local.amount !== undefined)) {
      Object.assign(map, local, { headerRow: r });
      // With separate debit/credit columns, ignore any single amount column.
      if (map.debit !== NONE && map.credit !== NONE) map.amount = NONE;
      return map;
    }
  }

  // No header — infer by sampling column contents.
  const cols = Math.max(...rows.map((r) => r.length));
  const dateScore: number[] = [];
  const amtScore: number[] = [];
  const textLen: number[] = [];
  for (let c = 0; c < cols; c++) {
    let dOK = 0;
    let aOK = 0;
    let tl = 0;
    let n = 0;
    for (const r of rows) {
      const cell = (r[c] ?? "").trim();
      if (!cell) continue;
      n++;
      if (looksLikeDate(cell)) dOK++;
      if (parseAmount(cell) !== null && /\d/.test(cell)) aOK++;
      tl += cell.length;
    }
    dateScore[c] = n ? dOK / n : 0;
    amtScore[c] = n ? aOK / n : 0;
    textLen[c] = n ? tl / n : 0;
  }
  map.headerRow = NONE;
  map.date = argmax(dateScore);
  // amount: the numeric column with the largest average magnitude that isn't date
  const amtCols = amtScore
    .map((s, i) => ({ i, s }))
    .filter((x) => x.s > 0.5 && x.i !== map.date)
    .map((x) => x.i);
  if (amtCols.length >= 2) {
    map.amount = amtCols[amtCols.length - 2];
    map.balance = amtCols[amtCols.length - 1];
  } else if (amtCols.length === 1) {
    map.amount = amtCols[0];
  }
  // description: longest text column that isn't date/amount/balance
  let best = NONE;
  let bestLen = 0;
  for (let c = 0; c < cols; c++) {
    if (c === map.date || c === map.amount || c === map.balance) continue;
    if (textLen[c] > bestLen) {
      bestLen = textLen[c];
      best = c;
    }
  }
  map.description = best;
  return map;
}

function argmax(arr: number[]): number {
  let idx = NONE;
  let val = -Infinity;
  arr.forEach((v, i) => {
    if (v > val) {
      val = v;
      idx = i;
    }
  });
  return idx;
}

// ------------------------------------------------------------------
// Build candidate transactions
// ------------------------------------------------------------------
export function fromCSV(rows: string[][], map: ColumnMap): ParsedTxn[] {
  const start = map.headerRow === NONE ? 0 : map.headerRow + 1;
  const out: ParsedTxn[] = [];
  let prevBalance: number | null = null; // running balance for sign inference
  for (let r = start; r < rows.length; r++) {
    const cells = rows[r];
    const date = map.date !== NONE ? parseDate(cells[map.date] ?? "") : "";
    let desc =
      map.description !== NONE ? (cells[map.description] ?? "").trim() : "";
    // Append a time from the details column so same-day, same-amount rows
    // (e.g. repeated toll charges) stay distinct and don't look like duplicates.
    if (map.details !== NONE) {
      const det = (cells[map.details] ?? "").trim();
      const time = det.match(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]\.?M\.?)?\b/i);
      if (time) desc = desc ? `${desc} · ${time[0].trim()}` : time[0].trim();
    }
    let amount = 0;

    if (map.debit !== NONE || map.credit !== NONE) {
      const dr = map.debit !== NONE ? parseAmount(cells[map.debit] ?? "") : null;
      const cr =
        map.credit !== NONE ? parseAmount(cells[map.credit] ?? "") : null;
      const debit = dr ? Math.abs(dr.value) : 0;
      const credit = cr ? Math.abs(cr.value) : 0;
      amount = credit - debit;
    } else if (map.amount !== NONE) {
      const a = parseAmount(cells[map.amount] ?? "");
      if (!a) continue;
      amount = a.value;
      let signSet = a.crdr !== 0;
      if (map.drcr !== NONE) {
        // Only flip on a genuine DR/CR indicator — a "Type" column may instead
        // hold the transaction kind (e.g. "DUITNOW"), which must not flip signs.
        const tag = (cells[map.drcr] ?? "").trim();
        if (/^(cr|c|credit|deposit|in|\+)$/i.test(tag)) {
          amount = Math.abs(amount);
          signSet = true;
        } else if (/^(dr|d|debit|withdrawal|out|-)$/i.test(tag)) {
          amount = -Math.abs(amount);
          signSet = true;
        } else if (a.crdr !== 0) amount = a.crdr * Math.abs(amount);
      } else if (a.crdr !== 0) {
        amount = a.crdr * Math.abs(amount);
      }

      // Unsigned amounts (e.g. Touch 'n Go "RM1.85") — infer direction from the
      // running-balance column: the exact signed change is balance − prevBalance.
      if (map.balance !== NONE) {
        const balP = parseAmount(cells[map.balance] ?? "");
        if (balP) {
          if (prevBalance !== null) {
            const delta = Math.round((balP.value - prevBalance) * 100) / 100;
            if (Math.abs(Math.abs(delta) - Math.abs(amount)) < 0.02)
              amount = delta;
            else if (!signSet) amount = -Math.abs(amount);
          } else if (!signSet) {
            amount = -Math.abs(amount); // first row: default to an outflow
          }
          prevBalance = balP.value;
        }
      }
    }

    if (!date && amount === 0) continue;
    if (amount === 0 && !desc) continue;

    out.push({
      id: `p${r}-${Math.random().toString(36).slice(2, 7)}`,
      date,
      description: desc || "(no description)",
      amount,
      category: guessCategory(desc),
      include: true,
      duplicate: false,
      raw: cells.join(" | "),
    });
  }
  return out;
}

// Money token: optional currency, optional integer part (so ".01" matches),
// 2 decimals, optional trailing +/- (Maybank debits "30.00-", credits ".01+")
// or CR/DR marker. Thousands separator is COMMA only — a space must NOT join
// digits, or a reference code like ".../024 170.42" merges into 24,170.42.
// (?!\s*%) rejects rate figures like "17.00%" that aren't money amounts.
const MONEY_RE = /[-(]?\s*(?:RM|MYR|\$|USD|SGD|£|€)?\s*(?:\d{1,3}(?:,\d{3})*)?\.\d{2}(?!\s*%)\s*[-+]?\)?(?:\s*(?:CR|DR))?/gi;

// Leading date: full (dd/mm/yyyy), ISO, "dd Mon yyyy", OR bare "dd/mm" (year
// taken from the statement header). Full forms are tried before the bare one.
const LEAD_DATE_RE =
  /^\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}|\d{1,2}[\/\-]\d{1,2})(?=\s|$)/;

// Lines that mark the end of the transaction table (summaries / footer notes).
const STOP_RE =
  /^(=|baki|beginning balance|ledger balance|ending balance|total|sub\s*total|previous|new\s*balance|current\s*balance|minimum|credit\s*limit|perhatian|note|overdrawn|all items|please notify|interest refers|wang yang|ditandakan|discrepan|sila|muka|tarikh|urusniaga|entry date|value date|statement|not protected|denoted by|warning|\(\d\))/i;

const BARE_DATE_RE = /^\d{1,2}[\/\-]\d{1,2}$/;

// Credit-card section header, e.g. "ISLAMIC WORLD ELITE MASTERCARD : 5184 8300 3008 5341"
const CARD_HEADER_RE = /^(.{3,60}?)\s*[:：]\s*(\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4})\s*$/;

function hasCJK(s: string): boolean {
  return /[　-鿿＀-￯]/.test(s);
}

/** Derive the statement's year from a full date in the header, else this year. */
function detectStatementYear(text: string): number {
  const m = text.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-](\d{2,4})\b/);
  if (m) {
    let y = parseInt(m[1], 10);
    if (y < 100) y += 2000;
    if (y > 1990 && y < 2100) return y;
  }
  return new Date().getFullYear();
}

function completeDate(token: string, year: number): string {
  return BARE_DATE_RE.test(token.trim())
    ? `${token.trim()}/${year}`
    : token.trim();
}

function tokenSign(tok: string, abs: number): number {
  const t = tok.trim();
  // CR/DR may be glued to the digits (e.g. "492.19CR"), so match as a suffix.
  if (/CR\)?$/i.test(t) || /\+\)?$/.test(t)) return abs; // credit / payment in
  if (/DR\)?$/i.test(t) || /-\)?$/.test(t) || /^\(.*\)$/.test(t) || /^-/.test(t))
    return -abs; // debit / charge out
  return -abs; // default: treat as expense (user can flip in review)
}

/**
 * Heuristic parser for pasted text or extracted PDF text. Handles multi-line
 * transactions (payee on following lines), bare dd/mm dates, trailing-minus
 * debits, and infers sign from the running balance when one is present.
 */
export function fromText(text: string): ParsedTxn[] {
  const year = detectStatementYear(text);
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const out: ParsedTxn[] = [];

  // Seed the running balance from an opening/beginning balance if present.
  let prevBalance: number | null = null;
  const bb = text.match(/(?:beginning|opening|b\/f|brought forward)[^\d]*([\d,]+\.\d{2})/i);
  if (bb) prevBalance = parseFloat(bb[1].replace(/,/g, ""));

  // Current credit-card section (set when we cross a "PRODUCT : CARDNO" header).
  let curCard: string | null = null;
  let curProduct: string | null = null;

  let cur: { date: string; amount: number; parts: string[]; raw: string; card: string | null; product: string | null } | null = null;
  const flush = () => {
    if (!cur) return;
    const desc = cur.parts.join(" ").replace(/\s{2,}/g, " ").trim() || "(no description)";
    out.push({
      id: `t${out.length}-${Math.random().toString(36).slice(2, 7)}`,
      date: cur.date,
      description: desc,
      amount: cur.amount,
      category: guessCategory(desc),
      include: true,
      duplicate: false,
      card: cur.card,
      product: cur.product,
      raw: cur.raw,
    });
    cur = null;
  };

  for (const line of lines) {
    if (!line) continue;
    const dm = line.match(LEAD_DATE_RE);
    const amounts = dm ? line.match(MONEY_RE) : null;

    if (dm && amounts && amounts.length) {
      const date = parseDate(completeDate(dm[1], year));
      if (date) {
        flush();
        const vals = amounts
          .map((a) => ({ tok: a, p: parseAmount(a) }))
          .filter((v): v is { tok: string; p: { value: number; crdr: number } } => v.p !== null);

        let amount = 0;
        if (vals.length >= 2) {
          // amount = first token; balance = last token → prefer balance delta.
          const absAmt = Math.abs(vals[0].p.value);
          const balance = Math.abs(vals[vals.length - 1].p.value);
          if (prevBalance !== null) {
            const delta = balance - prevBalance;
            amount = Math.abs(Math.abs(delta) - absAmt) < 0.02
              ? (delta >= 0 ? absAmt : -absAmt)
              : tokenSign(vals[0].tok, absAmt);
          } else {
            amount = tokenSign(vals[0].tok, absAmt);
          }
          prevBalance = balance;
        } else if (vals.length === 1) {
          amount = tokenSign(vals[0].tok, Math.abs(vals[0].p.value));
        }

        let d = line.replace(LEAD_DATE_RE, "");
        for (const a of amounts) d = d.replace(a, "");
        // Card statements print a second (transaction) date after the posting
        // date — drop a leading date left in the description.
        d = d.replace(/^\s*\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?\s+/, "");
        d = d.replace(/\s{2,}/g, " ").trim();
        cur = { date, amount, parts: d ? [d] : [], raw: line, card: curCard, product: curProduct };
        continue;
      }
    }

    // Credit-card section header — switch the current card/holder context.
    const ch = line.match(CARD_HEADER_RE);
    if (ch) {
      flush();
      curProduct = ch[1].trim();
      curCard = ch[2].replace(/\D/g, "").slice(-4);
      continue;
    }

    // A dated line with no usable amount (e.g. "... RATE 17.00%") is a boundary,
    // not a continuation — end the current transaction and skip it.
    if (dm) {
      flush();
      continue;
    }

    // Non-transaction line: either a continuation of the current transaction's
    // description, or a footer marker that ends the current transaction.
    if (STOP_RE.test(line) || hasCJK(line)) {
      flush();
    } else if (cur) {
      cur.parts.push(line);
    }
  }
  flush();
  return out;
}

// ------------------------------------------------------------------
// Categorisation
// ------------------------------------------------------------------
const CATEGORY_RULES: [RegExp, string][] = [
  // Card / account payments — money moved between your own accounts.
  [/\bpymt\b|pymt@|payment\s*received|payment\s*-\s*thank|autopay|standing\s*instruction/i, TRANSFER_CATEGORY],
  [/salary|payroll|gaji|wages|bonus/i, "Income"],
  [/dividend|interest|refund|reimburs|cashback|transfer from|incoming/i, "Income"],
  [/reload|top.?up|transfer to wallet|fund transfer|wallet.*top|add\s*money|cash\s*in\b/i, TRANSFER_CATEGORY],
  [/grocer|mart|tesco|lotus|aeon|jaya\s*grocer|giant|nsk|village\s*grocer|cold\s*storage|restaurant|cafe|food|mcd|kfc|starbucks|grabfood|foodpanda|kopitiam|mamak/i, FOOD_DEFAULT],
  [/petrol|petronas|shell|caltex|bhp|fuel|\btoll\b|touch\s*'?n\s*go|tng|parking|grab\b|mrt|lrt|rapidkl|airasia|flight|myeg\s*road|rfid|besraya|akleh|kesas|sprint|\bduke\b|\bnpe\b|\bsuke\b|\bspe\b|\bplus\b|lekas|litrak|penchala|grand\s*saga|\bmex\b|nkve|guthrie|\bsilk\b|ledp|smart\s*tunnel|lebuhraya|highway|expressway/i, "Transportation"],
  [/tnb|electric|air\s*selangor|syabas|indah\s*water|unifi|maxis|celcom|digi|umobile|yes|streamyx|astro|water\s*bill|utilit/i, "Utilities"],
  [/netflix|spotify|youtube|disney|prime\s*video|apple\.com|google\s*(one|storage)|icloud|subscription|patreon|openai|anthropic|claude|github|vercel|figma|notion|canva|adobe/i, "Subscriptions"],
  [/rent|mortgage|sewa|housing|maintenance\s*fee|management\s*fee/i, "Housing"],
  [/clinic|hospital|pharmac|guardian|watson|caring|medical|dental|klinik|specialist|health/i, "Healthcare"],
  [/loan|installment|instalment|financing|ansuran|credit\s*card\s*payment|repayment/i, "Debt payments"],
  [/stashaway|wahed|versa|kenanga|asnb|asb\b|unit\s*trust|invest|maybank\s*trade|rakuten|luno|binance|etf|share/i, "Investments"],
];

export function guessCategory(desc: string): string {
  const s = desc || "";
  for (const [re, cat] of CATEGORY_RULES) if (re.test(s)) return cat;
  return REVIEW_CATEGORY; // ambiguous — parked for you to confirm
}

// ------------------------------------------------------------------
// Duplicate detection against existing transactions
// ------------------------------------------------------------------
export function markDuplicates(
  parsed: ParsedTxn[],
  existing: Pick<Transaction, "txn_date" | "amount" | "description">[]
): ParsedTxn[] {
  // Include the description so repeated same-day, same-amount charges (e.g. two
  // identical tolls, distinguished by their appended time) aren't seen as dupes.
  const norm = (s: string) =>
    (s || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 48);
  const key = (d: string, a: number, desc: string) =>
    `${d}|${a.toFixed(2)}|${norm(desc)}`;
  const seen = new Set(
    existing.map((e) => key(e.txn_date, Number(e.amount), e.description))
  );
  const within = new Set<string>();
  return parsed.map((p) => {
    const k = key(p.date, p.amount, p.description);
    const dup = seen.has(k) || within.has(k);
    within.add(k);
    return { ...p, duplicate: dup, include: dup ? false : p.include };
  });
}

export function statementPeriod(parsed: ParsedTxn[]): {
  start: string | null;
  end: string | null;
} {
  const dates = parsed.map((p) => p.date).filter(Boolean).sort();
  return {
    start: dates[0] ?? null,
    end: dates[dates.length - 1] ?? null,
  };
}

/**
 * The statement's own date (e.g. "STATEMENT DATE 30/06/26"), used to attribute
 * an empty (no-transaction) statement to the correct month. Falls back to the
 * first full date found in the text.
 */
export function detectStatementDate(text: string): string | null {
  const labelled = text.match(
    /(?:statement\s*date|tarikh\s*penyata|結單日期)[\s\S]{0,30}?(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i
  );
  const m =
    labelled ?? text.match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/);
  return m ? parseDate(m[1]) || null : null;
}

/**
 * Extract candidate account identifiers (last 4 digits) from a statement so an
 * import can be auto-routed to the matching account. Looks near the account-
 * number labels and at card-number groups, to avoid picking up transaction refs.
 */
export function detectAccountRefs(text: string): string[] {
  const refs: string[] = [];
  const add = (raw: string) => {
    const d = raw.replace(/\D/g, "");
    if (d.length >= 6) refs.push(d.slice(-4));
  };
  // Long continuous numbers (bank account numbers) — 5-digit postcodes excluded.
  for (const m of Array.from(text.matchAll(/\d{10,}/g))) add(m[0]);
  // Hyphenated account numbers, e.g. 157157-712074.
  for (const m of Array.from(text.matchAll(/\b\d{4,}-\d{4,}\b/g))) add(m[0]);
  // Card numbers: four groups of four digits (space/hyphen separated).
  for (const m of Array.from(text.matchAll(/\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}\b/g)))
    add(m[0]);
  return Array.from(new Set(refs));
}

/**
 * Pull the opening and closing balances out of a statement's text, e.g.
 * "BEGINNING BALANCE 478.78" and "ENDING BALANCE : 157.54". Returns nulls when
 * not present (most CSV exports won't have them).
 */
export function detectBalances(text: string): {
  opening: number | null;
  closing: number | null;
} {
  const num = (m: RegExpMatchArray | null) =>
    m ? parseFloat(m[1].replace(/,/g, "")) : null;
  // Bounded gap [^\d\n\r]{0,20} keeps the number on the same line as the label,
  // so column headers like "BAKI PENYATA" can't reach across to another figure.
  const opening = text.match(
    /(?:beginning\s*balance|opening\s*balance|baki\s*awal|balance\s*b\/f|brought\s*forward)[^\d\n\r]{0,20}([\d,]+\.\d{2})/i
  );
  const closing = text.match(
    /(?:ending\s*balance|closing\s*balance|ledger\s*balance|baki\s*akhir|balance\s*c\/f|carried\s*forward)[^\d\n\r]{0,20}([\d,]+\.\d{2})/i
  );
  return { opening: num(opening), closing: num(closing) };
}
