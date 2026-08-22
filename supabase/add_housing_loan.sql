-- Adds the RHB fixed-rate housing loan (Tiara Duta) + the RHB Savings account
-- it's paid from, and links them. Original amount RM 136,885.75; current payoff
-- (outstanding) RM 27,577.42. Payments-to-date recorded as one opening entry so
-- the outstanding balance and % repaid show correctly.
-- Safe to re-run (replaces any earlier version of this loan). Supabase SQL Editor.
do $$
declare uid uuid; acc uuid; lid uuid;
begin
  select id into uid from auth.users where email = 'sarly@sarly.com';

  -- RHB Savings account (the loan is paid from here)
  insert into public.accounts
    (owner_id, name, type, institution, balance, currency, fx_rate, account_ref, color)
  select uid, 'RHB Savings', 'savings', 'RHB', 19.91, 'MYR', 1, '4571', '#0b56a4'
  where not exists (
    select 1 from public.accounts where owner_id = uid and account_ref = '4571'
  );
  select id into acc from public.accounts
    where owner_id = uid and account_ref = '4571' limit 1;

  -- Remove any earlier version of this loan so we don't duplicate it
  delete from public.loans
    where owner_id = uid
      and name = 'Fixed Rate Housing Loan - A-3-1 Tiara Duta Condo';

  insert into public.loans
    (owner_id, name, direction, counterparty, counterparty_name, principal,
     interest_rate, start_date, term_months, installment, frequency, next_due,
     account_id, status, notes)
  values
    (uid,
     'Fixed Rate Housing Loan - A-3-1 Tiara Duta Condo',
     'borrowed', 'other', 'RHB',
     136885.75, 6.15, '2008-12-10', 240, 1021.00, 'monthly', '2026-08-10',
     acc, 'active',
     'RHB loan a/c 7-12273-0001033-9 · Individual · SARLY ADRE BIN SARKUM · payoff RM 27,577.42 as of 10 Jul 2026 · remaining 29 months · last payment RM 1,021.44')
  returning id into lid;

  insert into public.loan_payments (loan_id, owner_id, paid_date, amount, note)
  values (lid, uid, '2026-07-10', 109308.33, 'Payments to date (through 10 Jul 2026)');
end $$;
