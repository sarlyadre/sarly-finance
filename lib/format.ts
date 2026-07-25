import { format, parseISO, isValid } from "date-fns";

// ---- Currency: Malaysian Ringgit (RM) ----
const myr = new Intl.NumberFormat("en-MY", {
  style: "currency",
  currency: "MYR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const myrCompact = new Intl.NumberFormat("en-MY", {
  style: "currency",
  currency: "MYR",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function money(value: number | null | undefined): string {
  return myr.format(Number(value ?? 0));
}

/** Signed, e.g. +RM1,100.00 / -RM240.00 */
export function moneySigned(value: number): string {
  const s = money(Math.abs(value));
  return value < 0 ? `-${s}` : `+${s}`;
}

export function moneyCompact(value: number | null | undefined): string {
  return myrCompact.format(Number(value ?? 0));
}

// ---- Arbitrary currency (for Wise / foreign-currency balances) ----
const fmtCache = new Map<string, Intl.NumberFormat>();
function fmtFor(currency: string): Intl.NumberFormat {
  const key = currency.toUpperCase();
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat("en-MY", {
        style: "currency",
        currency: key,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      f = myr;
    }
    fmtCache.set(key, f);
  }
  return f;
}

/** Format an amount in its own currency, e.g. moneyIn(120, "USD") -> "USD 120.00". */
export function moneyIn(
  value: number | null | undefined,
  currency = "MYR"
): string {
  if (!currency || currency.toUpperCase() === "MYR") return money(value);
  return fmtFor(currency).format(Number(value ?? 0));
}

// ---- Dates: Malaysia (DD/MM/YYYY) ----
function toDate(d: string | Date): Date {
  return typeof d === "string" ? parseISO(d) : d;
}

export function fmtDate(d: string | Date, pattern = "dd MMM yyyy"): string {
  const date = toDate(d);
  return isValid(date) ? format(date, pattern) : "";
}

export function fmtDay(d: string | Date): string {
  return fmtDate(d, "dd MMM");
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
