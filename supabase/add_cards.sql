-- Adds your Maybank Islamic accounts: the Premier Mudharabah current account
-- (which this statement belongs to) plus two credit cards.
-- Run once in the Supabase SQL Editor. Attaches to your (first) user.
do $$
declare uid uuid;
begin
  select id into uid from auth.users order by created_at limit 1;

  insert into public.accounts
    (owner_id, name, type, institution, balance, currency, fx_rate, account_ref, color)
  values
    (uid, 'Maybank Islamic Premier',    'savings', 'Maybank Islamic', 157.54, 'MYR', 1, '4026', '#93c23e'),
    (uid, 'Maybank Islamic World Elite', 'card',    'Maybank Islamic',   0.00, 'MYR', 1, '5341', '#1a1c1e'),
    (uid, 'Visa Ikhwan Platinum',        'card',    'Maybank Islamic',   0.00, 'MYR', 1, '3894', '#8b9099');
end $$;
