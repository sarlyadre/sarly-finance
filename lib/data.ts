import { createClient } from "@/lib/supabase/server";
import type {
  Account,
  Transaction,
  Commitment,
  CommitmentPayment,
  Claim,
  Service,
  UsageLog,
  Statement,
  Loan,
  LoanPayment,
} from "@/lib/types";

export async function getAccounts(): Promise<Account[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: true });
  return (data as Account[]) ?? [];
}

export async function getTransactions(limit = 500): Promise<Transaction[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as Transaction[]) ?? [];
}

export async function getCommitments(): Promise<Commitment[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("commitments")
    .select("*")
    .order("next_due", { ascending: true, nullsFirst: false });
  return (data as Commitment[]) ?? [];
}

export async function getCommitmentPayments(): Promise<CommitmentPayment[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("commitment_payments")
    .select("*")
    .order("paid_date", { ascending: false });
  return (data as CommitmentPayment[]) ?? [];
}

export async function getClaims(): Promise<Claim[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("claims")
    .select("*")
    .order("claim_date", { ascending: false });
  return (data as Claim[]) ?? [];
}

export async function getServices(): Promise<Service[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("services")
    .select("*")
    .order("renewal_date", { ascending: true, nullsFirst: false });
  return (data as Service[]) ?? [];
}

export async function getUsageLogs(): Promise<UsageLog[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("usage_logs")
    .select("*")
    .order("logged_at", { ascending: false });
  return (data as UsageLog[]) ?? [];
}

export async function getStatements(): Promise<Statement[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("statements")
    .select("*")
    .order("imported_at", { ascending: false });
  return (data as Statement[]) ?? [];
}

export async function getLoans(): Promise<Loan[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("loans")
    .select("*")
    .order("created_at", { ascending: true });
  return (data as Loan[]) ?? [];
}

export async function getLoanPayments(): Promise<LoanPayment[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("loan_payments")
    .select("*")
    .order("paid_date", { ascending: false });
  return (data as LoanPayment[]) ?? [];
}
