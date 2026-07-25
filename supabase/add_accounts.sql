-- Creates the accounts from your June 2026 statements (closing balances filled in)
-- and fixes the existing Maybank Islamic Premier (adds its account number + real
-- closing balance) so statement auto-routing can match every account.
-- Plain statements so the SQL Editor reports real row counts. Owner = sarly@sarly.com.
-- Run once in the Supabase SQL Editor (project: sarly-finance).

insert into public.accounts
  (owner_id, name, type, institution, balance, currency, fx_rate, account_ref, color)
values
  ((select id from auth.users where email = 'sarly@sarly.com'), 'Maybank MAE',                 'ewallet', 'Maybank',          100.00, 'MYR', 1, '4144', '#f2c14b'),
  ((select id from auth.users where email = 'sarly@sarly.com'), 'Maybank Premier',             'bank',    'Maybank',          747.24, 'MYR', 1, '0748', '#f2c14b'),
  ((select id from auth.users where email = 'sarly@sarly.com'), 'Maybank Islamic Savings-i',   'savings', 'Maybank Islamic', 7916.60, 'MYR', 1, '2074', '#587a26'),
  ((select id from auth.users where email = 'sarly@sarly.com'), 'Maybank Islamic World Elite', 'card',    'Maybank Islamic', -4413.76,'MYR', 1, '5341', '#1a1c1e'),
  ((select id from auth.users where email = 'sarly@sarly.com'), 'Visa Ikhwan Platinum',        'card',    'Maybank Islamic',     0.00, 'MYR', 1, '3894', '#8b9099');

-- Fix the account that was created via the app (add its number + real balance).
update public.accounts
set account_ref = '4026', balance = 157.54
where name = 'Maybank Islamic Premier';
