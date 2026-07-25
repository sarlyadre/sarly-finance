import type {
  OnBehalfOf,
  ClaimKind,
  ClaimStatus,
  ServiceCategory,
  ServiceStatus,
  AccountType,
} from "./types";

// The entities you pay on behalf of / claim against.
export const BEHALF: Record<OnBehalfOf, { label: string; color: string }> = {
  self: { label: "Personal", color: "#8b9099" },
  sa2: { label: "[SA]²", color: "#5b9bd5" },
  gbi: { label: "gbi", color: "#93c23e" },
};

export const BEHALF_OPTIONS: OnBehalfOf[] = ["self", "sa2", "gbi"];

// ---- Loans ----
export const LOAN_PARTY: Record<
  "self" | "sa2" | "gbi" | "other",
  { label: string; color: string }
> = {
  sa2: { label: "[SA]²", color: "#5b9bd5" },
  gbi: { label: "gbi", color: "#93c23e" },
  self: { label: "Personal", color: "#8b9099" },
  other: { label: "Other", color: "#ec9b52" },
};

export const LOAN_PARTY_OPTIONS: ("sa2" | "gbi" | "self" | "other")[] = [
  "sa2",
  "gbi",
  "self",
  "other",
];

export const LOAN_STATUS: Record<
  "active" | "paid" | "default",
  { label: string; bg: string; text: string; dot: string }
> = {
  active: { label: "Active", bg: "#f4f9e8", text: "#587a26", dot: "#93c23e" },
  paid: { label: "Paid off", bg: "#eef2f5", text: "#5b9bd5", dot: "#5b9bd5" },
  default: { label: "In default", bg: "#fdece9", text: "#c0503f", dot: "#e0705f" },
};

export const ACCOUNT_TYPES: AccountType[] = [
  "bank",
  "savings",
  "ewallet",
  "fintech",
  "card",
  "cash",
  "investment",
];

// Grouping + display metadata for the Accounts page.
export const ACCOUNT_GROUPS = [
  "Cash & bank",
  "E-wallets",
  "Fintech & multi-currency",
  "Cards",
  "Investments",
] as const;
export type AccountGroup = (typeof ACCOUNT_GROUPS)[number];

export const ACCOUNT_TYPE_META: Record<
  AccountType,
  { label: string; group: AccountGroup; color: string }
> = {
  bank: { label: "Bank account", group: "Cash & bank", color: "#5b9bd5" },
  savings: { label: "Savings", group: "Cash & bank", color: "#587a26" },
  cash: { label: "Cash", group: "Cash & bank", color: "#8b9099" },
  ewallet: { label: "E-wallet", group: "E-wallets", color: "#93c23e" },
  fintech: {
    label: "Fintech / multi-currency",
    group: "Fintech & multi-currency",
    color: "#74a02e",
  },
  card: { label: "Credit card", group: "Cards", color: "#e0705f" },
  investment: {
    label: "Investment",
    group: "Investments",
    color: "#ec9b52",
  },
};

// Currencies you're likely to hold (esp. in Wise). fx = MYR per 1 unit.
// These are editable per-account — the numbers here are just sensible defaults.
export const CURRENCIES: { code: string; label: string; fx: number }[] = [
  { code: "MYR", label: "Malaysian Ringgit", fx: 1 },
  { code: "USD", label: "US Dollar", fx: 4.7 },
  { code: "SGD", label: "Singapore Dollar", fx: 3.5 },
  { code: "EUR", label: "Euro", fx: 5.1 },
  { code: "GBP", label: "British Pound", fx: 6.0 },
  { code: "AUD", label: "Australian Dollar", fx: 3.1 },
  { code: "JPY", label: "Japanese Yen", fx: 0.03 },
  { code: "CNY", label: "Chinese Yuan", fx: 0.65 },
  { code: "THB", label: "Thai Baht", fx: 0.13 },
  { code: "IDR", label: "Indonesian Rupiah", fx: 0.0003 },
  { code: "PHP", label: "Philippine Peso", fx: 0.083 },
  { code: "HKD", label: "Hong Kong Dollar", fx: 0.6 },
  { code: "INR", label: "Indian Rupee", fx: 0.056 },
];

export const DEFAULT_FX: Record<string, number> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c.fx])
);

// One-tap presets to speed up first-time setup (Malaysia-focused).
export const ACCOUNT_PRESETS: {
  name: string;
  type: AccountType;
  institution: string;
  color: string;
  currency?: string;
}[] = [
  { name: "Maybank", type: "bank", institution: "Maybank", color: "#f2c14b" },
  { name: "CIMB", type: "bank", institution: "CIMB Bank", color: "#e0705f" },
  { name: "Public Bank", type: "bank", institution: "Public Bank", color: "#e0705f" },
  { name: "RHB", type: "bank", institution: "RHB Bank", color: "#5b9bd5" },
  { name: "Touch 'n Go", type: "ewallet", institution: "TNG Digital", color: "#5b9bd5" },
  { name: "GrabPay", type: "ewallet", institution: "Grab", color: "#587a26" },
  { name: "Boost", type: "ewallet", institution: "Boost", color: "#ec9b52" },
  { name: "ShopeePay", type: "ewallet", institution: "Shopee", color: "#ec9b52" },
  { name: "Wise", type: "fintech", institution: "Wise", color: "#74a02e", currency: "USD" },
  { name: "Revolut", type: "fintech", institution: "Revolut", color: "#1a1c1e", currency: "EUR" },
  { name: "PayPal", type: "fintech", institution: "PayPal", color: "#5b9bd5", currency: "USD" },
  { name: "BigPay", type: "ewallet", institution: "BigPay", color: "#93c23e" },
];

export const CATEGORIES = [
  "To be confirmed",
  "Housing",
  "Debt payments",
  "Food (claimable)",
  "Food (non-claimable)",
  "Transportation",
  "Healthcare",
  "Investments",
  "Utilities",
  "Subscriptions",
  "Income",
  "Transfer",
  "Other",
];

// Default holding category for imported transactions we can't confidently tag.
export const REVIEW_CATEGORY = "To be confirmed";
// Default food category when the importer recognises a food merchant.
export const FOOD_DEFAULT = "Food (non-claimable)";
// Money moved between your own accounts (e.g. card payments) — excluded from
// income and expense totals so it doesn't look like earning or spending.
export const TRANSFER_CATEGORY = "Transfer";

export const CATEGORY_COLORS: Record<string, string> = {
  "To be confirmed": "#c99a3a",
  Housing: "#ec9b52",
  "Debt payments": "#f2d24b",
  "Food (claimable)": "#3fae9f",
  "Food (non-claimable)": "#c1de78",
  Food: "#c1de78", // legacy rows
  Transportation: "#93c23e",
  Healthcare: "#e0705f",
  Investments: "#587a26",
  Utilities: "#5b9bd5",
  Subscriptions: "#b0d55a",
  Income: "#74a02e",
  Transfer: "#6f7d94",
  Other: "#b6bbc2",
};

export const CLAIM_KINDS: Record<ClaimKind, { label: string; hint: string }> = {
  reimbursement: {
    label: "Reimbursement",
    hint: "Money you paid on behalf that you want back",
  },
  food: { label: "Food benefit", hint: "Food benefit / allowance claim" },
  health: { label: "Health benefit", hint: "Medical / health benefit claim" },
};

export const CLAIM_STATUS: Record<
  ClaimStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  draft: { label: "Draft", bg: "#f1f2f4", text: "#8b9099", dot: "#b6bbc2" },
  submitted: {
    label: "Submitted",
    bg: "#eaf1fa",
    text: "#3f7cbf",
    dot: "#5b9bd5",
  },
  approved: {
    label: "Approved",
    bg: "#f4f9e8",
    text: "#587a26",
    dot: "#93c23e",
  },
  paid: { label: "Paid", bg: "#e7f2cd", text: "#476124", dot: "#74a02e" },
  rejected: { label: "Rejected", bg: "#fbecea", text: "#c0503f", dot: "#e0705f" },
};

// ---- Services ----
export const SERVICE_CATEGORIES: ServiceCategory[] = [
  "AI",
  "Hosting",
  "Productivity",
  "Entertainment",
  "Domain",
  "Finance",
  "Design",
  "Other",
];

export const SERVICE_CATEGORY_COLORS: Record<ServiceCategory, string> = {
  AI: "#74a02e",
  Hosting: "#5b9bd5",
  Productivity: "#93c23e",
  Entertainment: "#ec9b52",
  Domain: "#b0d55a",
  Finance: "#587a26",
  Design: "#e0705f",
  Other: "#b6bbc2",
};

export const SERVICE_STATUS: Record<
  ServiceStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  active: { label: "Active", bg: "#f4f9e8", text: "#587a26", dot: "#93c23e" },
  trial: { label: "Trial", bg: "#eaf1fa", text: "#3f7cbf", dot: "#5b9bd5" },
  paused: { label: "Paused", bg: "#fdf3ea", text: "#c07a3f", dot: "#ec9b52" },
  cancelled: {
    label: "Cancelled",
    bg: "#f1f2f4",
    text: "#8b9099",
    dot: "#b6bbc2",
  },
};

export const SERVICE_UNITS = ["tokens", "credits", "requests", "units"];

export const ACCOUNT_COLORS = [
  "#93c23e",
  "#5b9bd5",
  "#ec9b52",
  "#f2d24b",
  "#e0705f",
  "#587a26",
  "#b0d55a",
  "#1a1c1e",
];
