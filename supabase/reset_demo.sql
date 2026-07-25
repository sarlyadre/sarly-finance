-- =============================================================
--  Clear ALL data (demo or otherwise) but keep the schema + your
--  login accounts. Run this in the Supabase SQL Editor when you
--  want to start fresh with real data.
--
--  This does NOT delete your auth users or the tables themselves.
-- =============================================================

truncate table
  public.loan_payments,
  public.commitment_payments,
  public.usage_logs,
  public.transactions,
  public.loans,
  public.commitments,
  public.claims,
  public.services,
  public.statements,
  public.accounts
restart identity cascade;
