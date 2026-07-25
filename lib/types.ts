export type OnBehalfOf = "self" | "sa2" | "gbi";

export type AccountType =
  | "bank"
  | "card"
  | "cash"
  | "ewallet"
  | "fintech"
  | "savings"
  | "investment";

export type Account = {
  id: string;
  owner_id: string | null;
  name: string;
  type: AccountType;
  institution: string | null;
  balance: number;
  currency: string; // ISO code, e.g. MYR, USD, SGD
  fx_rate: number; // rate to MYR (1 for MYR)
  account_ref: string | null; // last digits / handle / IBAN tail
  color: string | null;
  is_active: boolean;
  created_at: string;
};

export type Transaction = {
  id: string;
  owner_id: string | null;
  account_id: string | null;
  txn_date: string;
  description: string;
  category: string | null;
  amount: number; // + income, - expense
  source: string | null; // manual | import
  statement_id: string | null;
  card: string | null; // last 4 of card (credit cards)
  cardholder: string | null; // Primary | Supplementary
  created_at: string;
};

export type StatementSource = "csv" | "pdf" | "paste" | "other";

export type Statement = {
  id: string;
  owner_id: string | null;
  filename: string | null;
  source: StatementSource;
  account_id: string | null;
  period_start: string | null;
  period_end: string | null;
  txn_count: number;
  imported_at: string;
  created_at: string;
};

export type Commitment = {
  id: string;
  owner_id: string | null;
  name: string;
  payee: string | null;
  on_behalf_of: OnBehalfOf;
  amount: number;
  frequency: "monthly" | "weekly" | "yearly" | "once";
  due_day: number | null;
  next_due: string | null;
  autopay: boolean;
  account_id: string | null;
  reimbursable: boolean;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

export type CommitmentPayment = {
  id: string;
  commitment_id: string;
  owner_id: string | null;
  paid_date: string;
  amount: number;
  period_label: string | null;
  status: "paid" | "pending";
  created_at: string;
};

export type LoanDirection = "borrowed" | "lent";
export type LoanStatus = "active" | "paid" | "default";
export type LoanParty = "self" | "sa2" | "gbi" | "other";

export type Loan = {
  id: string;
  owner_id: string | null;
  name: string;
  direction: LoanDirection; // borrowed = you owe; lent = owed to you
  counterparty: LoanParty;
  counterparty_name: string | null;
  principal: number;
  interest_rate: number | null; // annual %, informational
  start_date: string | null;
  term_months: number | null;
  installment: number; // expected repayment per period
  frequency: "monthly" | "weekly" | "yearly" | "once";
  next_due: string | null;
  account_id: string | null;
  status: LoanStatus;
  notes: string | null;
  created_at: string;
};

export type LoanPayment = {
  id: string;
  loan_id: string;
  owner_id: string | null;
  paid_date: string;
  amount: number;
  note: string | null;
  created_at: string;
};

export type ClaimKind = "reimbursement" | "food" | "health";
export type ClaimStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "paid"
  | "rejected";

export type Claim = {
  id: string;
  owner_id: string | null;
  submitted_by: string | null;
  kind: ClaimKind;
  title: string;
  claimant: string | null;
  amount: number;
  claim_date: string;
  on_behalf_of: OnBehalfOf;
  category: string | null;
  status: ClaimStatus;
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
};

export type ServiceCategory =
  | "AI"
  | "Hosting"
  | "Productivity"
  | "Entertainment"
  | "Domain"
  | "Finance"
  | "Design"
  | "Other";

export type ServiceStatus = "active" | "trial" | "paused" | "cancelled";
export type ServiceCycle = "monthly" | "yearly" | "weekly" | "usage";

export type Service = {
  id: string;
  owner_id: string | null;
  name: string;
  provider: string | null;
  category: ServiceCategory;
  plan: string | null;
  cost: number;
  cycle: ServiceCycle;
  renewal_date: string | null;
  status: ServiceStatus;
  auto_renew: boolean;
  account_id: string | null;
  url: string | null;
  is_metered: boolean;
  unit: string | null;
  usage_limit: number | null;
  notes: string | null;
  created_at: string;
};

export type UsageLog = {
  id: string;
  service_id: string;
  owner_id: string | null;
  period_label: string | null;
  amount: number;
  cost: number;
  logged_at: string;
  notes: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
};
