-- =============================================================
--  Personal Finance Dashboard — Supabase schema
--  Run this in the Supabase SQL Editor (one time).
--  Model: a trusted 2-person household (you + your wife).
--  All authenticated users share the same data set, so both of
--  you see one consolidated view and either can key things in.
-- =============================================================

-- ---------- PROFILES (mirror of auth.users) ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  avatar_url text,
  role       text default 'member',
  created_at timestamptz default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- ACCOUNTS ----------
create table if not exists public.accounts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users(id) on delete set null,
  name        text not null,
  type        text not null default 'bank',   -- bank | card | cash | ewallet | fintech | savings | investment
  institution text,
  balance     numeric(14,2) not null default 0,
  currency    text not null default 'MYR',    -- ISO code; Wise etc. can hold foreign currency
  fx_rate     numeric(14,6) not null default 1, -- units of MYR per 1 unit of currency
  account_ref text,                            -- last digits / handle / IBAN tail
  color       text default '#93c23e',
  is_active    boolean default true,
  created_at  timestamptz default now()
);

-- If upgrading an existing DB, add the new columns idempotently:
alter table public.accounts add column if not exists currency    text not null default 'MYR';
alter table public.accounts add column if not exists fx_rate     numeric(14,6) not null default 1;
alter table public.accounts add column if not exists account_ref text;

-- ---------- TRANSACTIONS ----------
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users(id) on delete set null,
  account_id  uuid references public.accounts(id) on delete cascade,
  txn_date    date not null default current_date,
  description text not null,
  category    text default 'Other',
  amount      numeric(14,2) not null,          -- positive = income, negative = expense
  created_at  timestamptz default now()
);

-- ---------- STATEMENTS (imported bank / card / other statements) ----------
create table if not exists public.statements (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users(id) on delete set null,
  filename     text,
  source       text default 'csv',            -- csv | pdf | paste | other
  account_id   uuid references public.accounts(id) on delete set null,
  period_start date,
  period_end   date,
  txn_count    int default 0,
  imported_at  timestamptz default now(),
  created_at   timestamptz default now()
);

-- Link imported transactions back to their statement (enables undo of an import).
alter table public.transactions add column if not exists source       text default 'manual';
alter table public.transactions add column if not exists statement_id uuid references public.statements(id) on delete set null;
-- Credit-card attribution: which card (last 4) and holder (Primary / Supplementary).
alter table public.transactions add column if not exists card         text;
alter table public.transactions add column if not exists cardholder   text;
-- External id (e.g. Wise referenceNumber) so API syncs don't create duplicates.
alter table public.transactions add column if not exists external_ref text;
create index if not exists idx_txn_external on public.transactions(external_ref);

-- ---------- COMMITMENTS (recurring bills, incl. paid-on-behalf) ----------
create table if not exists public.commitments (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references auth.users(id) on delete set null,
  name          text not null,
  payee         text,
  on_behalf_of  text default 'self',           -- self | sa2 | gbi
  amount        numeric(14,2) not null default 0,
  frequency     text default 'monthly',        -- monthly | weekly | yearly | once
  due_day       int,                           -- day of month (1-31) for monthly
  next_due      date,
  autopay       boolean default false,
  account_id    uuid references public.accounts(id) on delete set null,
  reimbursable  boolean default false,         -- should this be claimed back?
  notes         text,
  is_active     boolean default true,
  created_at    timestamptz default now()
);

-- ---------- COMMITMENT PAYMENTS (payment history / ledger) ----------
create table if not exists public.commitment_payments (
  id             uuid primary key default gen_random_uuid(),
  commitment_id  uuid references public.commitments(id) on delete cascade,
  owner_id       uuid references auth.users(id) on delete set null,
  paid_date      date not null default current_date,
  amount         numeric(14,2) not null default 0,
  period_label   text,                          -- e.g. "Jul 2026"
  status         text default 'paid',           -- paid | pending
  created_at     timestamptz default now()
);

-- ---------- LOANS (money you owe or are owed, incl. from [SA]²) ----------
create table if not exists public.loans (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid references auth.users(id) on delete set null,
  name              text not null,
  direction         text not null default 'borrowed', -- borrowed = you owe | lent = owed to you
  counterparty      text default 'other',             -- self | sa2 | gbi | other
  counterparty_name text,                              -- free label (e.g. company / person / bank)
  principal         numeric(14,2) not null default 0,
  interest_rate     numeric(6,3),                      -- annual %, informational
  start_date        date,
  term_months       int,
  installment       numeric(14,2) not null default 0,  -- expected repayment per period
  frequency         text default 'monthly',            -- monthly | weekly | yearly | once
  next_due          date,
  account_id        uuid references public.accounts(id) on delete set null,
  status            text default 'active',             -- active | paid | default
  notes             text,
  created_at        timestamptz default now()
);

create table if not exists public.loan_payments (
  id         uuid primary key default gen_random_uuid(),
  loan_id    uuid references public.loans(id) on delete cascade,
  owner_id   uuid references auth.users(id) on delete set null,
  paid_date  date not null default current_date,
  amount     numeric(14,2) not null default 0,
  note       text,
  created_at timestamptz default now()
);

-- ---------- CLAIMS (reimbursements + food/health benefit forms) ----------
create table if not exists public.claims (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references auth.users(id) on delete set null,
  submitted_by  text,                           -- name of who keyed it in
  kind          text not null default 'reimbursement', -- reimbursement | food | health
  title         text not null,
  claimant      text,                           -- who the benefit is for
  amount        numeric(14,2) not null default 0,
  claim_date    date not null default current_date,
  on_behalf_of  text default 'self',            -- self | sa2 | gbi
  category      text,
  status        text default 'draft',           -- draft | submitted | approved | paid | rejected
  receipt_url   text,
  notes         text,
  created_at    timestamptz default now()
);
-- ---------- SERVICES (online subscriptions / SaaS / AI tools) ----------
create table if not exists public.services (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users(id) on delete set null,
  name         text not null,
  provider     text,
  category     text default 'Other',          -- AI | Hosting | Productivity | Entertainment | Domain | Finance | Design | Other
  plan         text,
  cost         numeric(14,2) not null default 0,  -- cost per billing cycle
  cycle        text default 'monthly',         -- monthly | yearly | weekly | usage
  renewal_date date,
  status       text default 'active',          -- active | trial | paused | cancelled
  auto_renew   boolean default true,
  account_id   uuid references public.accounts(id) on delete set null,
  url          text,
  is_metered   boolean default false,          -- usage-based (AI tokens / credits)
  unit         text default 'tokens',          -- tokens | credits | requests | units
  usage_limit  numeric,                         -- quota per period (nullable)
  notes        text,
  created_at   timestamptz default now()
);

-- ---------- USAGE LOGS (AI tokens / metered consumption per period) ----------
create table if not exists public.usage_logs (
  id           uuid primary key default gen_random_uuid(),
  service_id   uuid references public.services(id) on delete cascade,
  owner_id     uuid references auth.users(id) on delete set null,
  period_label text,                            -- e.g. "Jul 2026"
  amount       numeric not null default 0,      -- tokens / credits / units consumed
  cost         numeric(14,2) not null default 0,
  logged_at    date not null default current_date,
  notes        text,
  created_at   timestamptz default now()
);

-- ---------- Row Level Security ----------
-- Household model: any authenticated user can read/write shared data.
alter table public.profiles            enable row level security;
alter table public.accounts            enable row level security;
alter table public.transactions        enable row level security;
alter table public.commitments         enable row level security;
alter table public.commitment_payments enable row level security;
alter table public.claims              enable row level security;
alter table public.services            enable row level security;
alter table public.usage_logs          enable row level security;
alter table public.statements          enable row level security;
alter table public.loans               enable row level security;
alter table public.loan_payments       enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'accounts','transactions','commitments','commitment_payments','claims',
    'services','usage_logs','statements','loans','loan_payments'
  ] loop
    execute format('drop policy if exists "household_all" on public.%I;', t);
    execute format(
      'create policy "household_all" on public.%I
         for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- Profiles: readable by all authenticated users, writable to your own row.
drop policy if exists "profiles_read"  on public.profiles;
drop policy if exists "profiles_write" on public.profiles;
create policy "profiles_read"  on public.profiles for select to authenticated using (true);
create policy "profiles_write" on public.profiles for update to authenticated using (auth.uid() = id);

-- ---------- Helpful indexes ----------
create index if not exists idx_txn_date        on public.transactions(txn_date);
create index if not exists idx_txn_account      on public.transactions(account_id);
create index if not exists idx_commit_next_due  on public.commitments(next_due);
create index if not exists idx_claims_status    on public.claims(status);
create index if not exists idx_services_renewal on public.services(renewal_date);
create index if not exists idx_usage_service    on public.usage_logs(service_id);
create index if not exists idx_txn_statement    on public.transactions(statement_id);
create index if not exists idx_loans_status      on public.loans(status);
create index if not exists idx_loan_pay_loan     on public.loan_payments(loan_id);
create index if not exists idx_usage_period     on public.usage_logs(period_label);
