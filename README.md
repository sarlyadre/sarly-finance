# Household Finance Dashboard

A responsive personal-finance dashboard for you and your wife to share. Built
with **Next.js 14 (App Router)**, **Tailwind CSS**, and **Supabase**
(Postgres + Auth). Styled after the ACRU template — light canvas, white cards,
lime-green accents. Currency and dates are formatted for **Malaysia (RM,
DD/MM/YYYY)**.

## What it does

| Module | Purpose |
| --- | --- |
| **Dashboard** | Consolidated balance, weekly cash-flow, spending breakdown, savings-rate gauge, upcoming commitments and recent activity at a glance. |
| **Accounts** | Every bank / card / cash / e-wallet in one place → a single consolidated balance. |
| **Transactions** | Log income & spending, categorise, filter and search. Feeds the dashboard analytics. |
| **Commitments** | Recurring bills — including ones you pay **on behalf of [SA]² or gbi**. Due-date countdowns, overdue alerts, one-tap "mark paid", optional autopay & "claim-back" flags. Marking a claimable bill paid auto-creates a reimbursement. |
| **Claims & benefits** | Reimbursements you're owed **plus** food / health benefit forms. Simple status flow (draft → submitted → approved → paid). Your wife signs in and keys in her own claims. |
| **Services & AI** | Inventory of every online subscription / SaaS with cost, billing cycle, renewal countdowns and status. Metered services (AI tools) get **token / credit usage tracking** against a quota, plus monthly AI-spend and token totals. |
| **Import statements** | Drop a bank / card statement (CSV or PDF) or paste text — it's parsed into transactions with auto-detected columns, auto-categorisation and duplicate flagging. You review/edit every row, pick the target account, then import. Each import is tracked and can be undone in one click. |
| **Loans** | Money you owe or are owed — including the **[SA]² company loan**. Tracks principal, outstanding balance, payoff progress, interest and a repayment schedule. Recording a repayment draws down the balance, advances the next due date, and marks the loan paid off when cleared. Summary of total owed vs. owed-to-you and your net position. |

Both of you sign in with your own email/password and see **one shared data
set** (a trusted two-person household model).

---

## Setup (one time, ~10 minutes)

### 1. Create a Supabase project
1. Go to [supabase.com](https://supabase.com) → **New project** (free tier is
   fine). Sign in with your Gmail.
2. Once it's ready, open **SQL Editor** → paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**. This creates all
   tables, the auto-profile trigger, and security rules.

### 2. Get your API keys
In Supabase → **Project Settings → API**, copy:
- **Project URL**
- **anon public** key

### 3. Configure the app locally
```bash
cp .env.local.example .env.local
```
Open `.env.local` and paste your two values:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

### 4. Run it
```bash
npm install
npm run dev
```
Open <http://localhost:3000>. Click **Sign up**, create your account, then sign
in. Do the same for your wife (each of you gets a login; the data is shared).

### 5. (Optional) Load demo data
To preview everything populated: in Supabase SQL Editor, run
[`supabase/seed.sql`](supabase/seed.sql) **after** you've signed up once.

> **Email confirmation:** by default Supabase may require email confirmation.
> To let sign-ups log in immediately, go to **Authentication → Providers →
> Email** and turn **Confirm email** off (fine for a private two-person app).

---

## Deploy to Vercel

1. Push this folder to a **GitHub repo** (private).
2. On [vercel.com](https://vercel.com), sign in with Gmail → **Add New →
   Project** → import the repo.
3. Under **Environment Variables**, add the same two keys from `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy.** Vercel gives you a URL like `your-app.vercel.app`.
5. Back in Supabase → **Authentication → URL Configuration**, add your Vercel
   URL to **Site URL** / **Redirect URLs**.

> I can't create the Supabase or Vercel accounts or enter your credentials for
> you — those steps are yours. Everything else is wired and ready.

---

## Tech notes
- **Auth & session**: `@supabase/ssr` with middleware that refreshes the
  session and guards every route except `/login`.
- **Data access**: server components read via the server client; mutations run
  in client components against the browser client, then `router.refresh()`.
- **Security**: Row-Level Security is on; authenticated household members share
  read/write. Tighten `supabase/schema.sql` policies if you ever add people who
  shouldn't see everything.
- **Formatting**: `lib/format.ts` centralises RM currency and DD/MM/YYYY dates —
  change the locale there if you relocate.

## Project structure
```
app/
  (app)/            # authenticated area (shared shell)
    page.tsx        # dashboard
    accounts/  transactions/  statements/  commitments/  loans/  claims/  services/
  login/            # auth screen
  auth/signout/     # sign-out route
components/         # AppShell, Modal, charts, module views, ui primitives
lib/                # supabase clients, types, data fetchers, compute, format
supabase/           # schema.sql + seed.sql
```
