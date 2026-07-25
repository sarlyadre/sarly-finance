-- =============================================================
--  Reset transaction data for a clean re-import.
--  Run in the Supabase SQL Editor (project: sarly-finance).
-- =============================================================

-- OPTION A (recommended): clear transactions + import history,
-- KEEP your accounts and their balances.
delete from public.transactions;
delete from public.statements;

-- ---------------------------------------------------------------
-- OPTION B (full wipe): also remove accounts, loans, claims, etc.
-- Uncomment the lines below only if you want to start completely over.
-- ---------------------------------------------------------------
-- delete from public.loan_payments;
-- delete from public.loans;
-- delete from public.commitment_payments;
-- delete from public.commitments;
-- delete from public.usage_logs;
-- delete from public.services;
-- delete from public.claims;
-- delete from public.accounts;
