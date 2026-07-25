-- =============================================================
--  Optional demo data. Run AFTER schema.sql and AFTER you have
--  signed up at least one user (so a profile exists).
--  It attaches everything to the FIRST user in auth.users.
-- =============================================================

do $$
declare uid uuid;
begin
  select id into uid from auth.users order by created_at limit 1;
  if uid is null then
    raise notice 'No users yet — sign up first, then run this seed.';
    return;
  end if;

  -- Accounts
  insert into public.accounts (owner_id, name, type, institution, balance, currency, fx_rate, account_ref, color) values
    (uid, 'Maybank Current',  'bank',    'Maybank',      12450.00, 'MYR', 1,     '4821', '#93c23e'),
    (uid, 'CIMB Savings',     'savings', 'CIMB',          8300.00, 'MYR', 1,     '7130', '#5b9bd5'),
    (uid, 'Visa Credit',      'card',    'Maybank',      -1700.00, 'MYR', 1,     '9004', '#1a1c1e'),
    (uid, "Touch 'n Go",      'ewallet', 'TNG Digital',    240.00, 'MYR', 1,      null,  '#5b9bd5'),
    (uid, 'GrabPay',          'ewallet', 'Grab',           155.00, 'MYR', 1,      null,  '#587a26'),
    (uid, 'Wise USD',         'fintech', 'Wise',          1200.00, 'USD', 4.7,    null,  '#74a02e'),
    (uid, 'Wise SGD',         'fintech', 'Wise',           800.00, 'SGD', 3.5,    null,  '#74a02e'),
    (uid, 'Cash',             'cash',     null,            600.00, 'MYR', 1,      null,  '#f2d24b');

  -- A spread of transactions across this month
  insert into public.transactions (owner_id, txn_date, description, category, amount) values
    (uid, current_date - 1,  'Salary',                 'Income',        9000.00),
    (uid, current_date - 2,  'Jaya Grocer',            'Food',          -320.50),
    (uid, current_date - 3,  'Petronas fuel',          'Transportation',-180.00),
    (uid, current_date - 4,  'Netflix + Spotify',      'Subscriptions', -64.90),
    (uid, current_date - 5,  'TNB electricity',        'Utilities',    -210.00),
    (uid, current_date - 6,  'Clinic visit',           'Healthcare',   -150.00),
    (uid, current_date - 8,  'Investment top-up',      'Investments',  -1000.00),
    (uid, current_date - 9,  'Dividend payout',        'Income',        1100.00),
    (uid, current_date - 10, 'Lunch — team',           'Food',          -88.00),
    (uid, current_date - 12, 'Grab rides',             'Transportation', -95.40),
    (uid, current_date - 14, 'Home rent',              'Housing',      -1600.00);

  -- Commitments (incl. paid-on-behalf)
  insert into public.commitments (owner_id, name, payee, on_behalf_of, amount, frequency, due_day, next_due, reimbursable) values
    (uid, 'Office rent',       'Landlord',      'sa2', 1800.00, 'monthly', 5,  date_trunc('month', current_date) + interval '4 days',  true),
    (uid, 'Internet (gbi)',    'TIME',          'gbi',  199.00, 'monthly', 15, date_trunc('month', current_date) + interval '14 days', true),
    (uid, 'Insurance premium', 'Prudential',    'self', 350.00, 'monthly', 10, date_trunc('month', current_date) + interval '9 days',  false),
    (uid, 'Cloud hosting',     'Vercel/AWS',    'gbi',  120.00, 'monthly', 1,  date_trunc('month', current_date) + interval '30 days', true),
    (uid, 'Car loan',          'Bank',          'self', 980.00, 'monthly', 28, date_trunc('month', current_date) + interval '27 days', false);

  -- Claims (reimbursements + benefit forms)
  insert into public.claims (owner_id, submitted_by, kind, title, claimant, amount, claim_date, on_behalf_of, status) values
    (uid, 'You',  'reimbursement', 'Supplier invoice — gbi',   'gbi',  1450.00, current_date - 3,  'gbi',  'submitted'),
    (uid, 'You',  'reimbursement', 'Office rent — [SA]²',  '[SA]²', 1800.00, current_date - 6, 'sa2',  'approved'),
    (uid, 'Wife', 'food',          'Weekly groceries benefit', 'Family', 300.00, current_date - 2,  'self', 'draft'),
    (uid, 'Wife', 'health',        'Dental checkup',           'Wife',   220.00, current_date - 5,  'self', 'submitted'),
    (uid, 'You',  'health',        'Annual medical screening', 'You',    480.00, current_date - 20, 'self', 'paid');

  -- Online services & AI tools
  insert into public.services (owner_id, name, provider, category, plan, cost, cycle, renewal_date, status, is_metered, unit, usage_limit, url) values
    (uid, 'Claude',       'Anthropic', 'AI',            'Max',      100.00, 'monthly', current_date + 8,  'active', true,  'tokens',  50000000, 'https://claude.ai'),
    (uid, 'OpenAI API',   'OpenAI',    'AI',            'Pay-as-go',   0.00, 'usage',   null,             'active', true,  'tokens',  null,     'https://platform.openai.com'),
    (uid, 'Vercel',       'Vercel',    'Hosting',       'Pro',       88.00, 'monthly', current_date + 3,  'active', false, 'requests', null,    'https://vercel.com'),
    (uid, 'Supabase',     'Supabase',  'Hosting',       'Free',       0.00, 'monthly', null,             'active', false, 'requests', null,    'https://supabase.com'),
    (uid, 'GitHub',       'GitHub',    'Productivity',  'Team',      17.00, 'monthly', current_date + 20, 'active', false, 'units',   null,     'https://github.com'),
    (uid, 'Netflix',      'Netflix',   'Entertainment', 'Premium',   55.00, 'monthly', current_date + 12, 'active', false, 'units',   null,     'https://netflix.com'),
    (uid, 'Namecheap',    'Namecheap', 'Domain',        'Domains',  180.00, 'yearly',  current_date + 90, 'active', false, 'units',   null,     'https://namecheap.com'),
    (uid, 'Figma',        'Figma',     'Design',        'Pro',       60.00, 'monthly', current_date + 5,  'trial',  false, 'units',   null,     'https://figma.com');

  -- Usage logs for metered AI services (current period)
  insert into public.usage_logs (service_id, owner_id, period_label, amount, cost, logged_at)
    select id, uid, to_char(current_date, 'Mon YYYY'), 32000000, 100.00, current_date - 2
      from public.services where owner_id = uid and name = 'Claude';
  insert into public.usage_logs (service_id, owner_id, period_label, amount, cost, logged_at)
    select id, uid, to_char(current_date, 'Mon YYYY'), 1850000, 46.30, current_date - 1
      from public.services where owner_id = uid and name = 'OpenAI API';

  -- Loans (incl. the [SA]² company loan)
  insert into public.loans (owner_id, name, direction, counterparty, principal, interest_rate, start_date, term_months, installment, frequency, next_due, status, notes) values
    (uid, '[SA]² company loan', 'borrowed', 'sa2', 12000.00, 0,    current_date - 90, 12, 1000.00, 'monthly', current_date + 6, 'active', 'Interest-free staff advance from [SA]²'),
    (uid, 'Car loan',           'borrowed', 'other', 45000.00, 3.4, current_date - 400, 60, 980.00,  'monthly', current_date + 15, 'active', null),
    (uid, 'Loan to gbi',        'lent',     'gbi',  5000.00,  0,   current_date - 30, null, 500.00, 'monthly', current_date + 3,  'active', 'Covered supplier deposit for gbi');

  -- A few repayments already made on the [SA]² loan
  insert into public.loan_payments (loan_id, owner_id, paid_date, amount, note)
    select id, uid, current_date - 60, 1000.00, 'Installment 1' from public.loans where owner_id = uid and name = '[SA]² company loan';
  insert into public.loan_payments (loan_id, owner_id, paid_date, amount, note)
    select id, uid, current_date - 30, 1000.00, 'Installment 2' from public.loans where owner_id = uid and name = '[SA]² company loan';
  insert into public.loan_payments (loan_id, owner_id, paid_date, amount, note)
    select id, uid, current_date - 5,  1000.00, 'Installment 3' from public.loans where owner_id = uid and name = '[SA]² company loan';
end $$;
