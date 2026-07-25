# Setup — go live in ~15 minutes

The app is code-complete but needs a Supabase project behind it before it can
save real data. Do these once.

## 1. Create a Supabase project (free)
- Go to https://supabase.com → **New project**.
- Region: **Singapore** (closest to Malaysia = faster).
- Save the database password it shows you.

## 2. Run the database schema
- Supabase → **SQL Editor** → **New query**.
- Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
- This creates every table (accounts, transactions, loans, statements, …) plus
  row-level security. Safe to re-run — it's idempotent.
- ⚠️ **Do not run `supabase/seed.sql`** unless you want demo data to explore.
  For real use, start empty. (To clear demo data later, run
  [`supabase/reset_demo.sql`](supabase/reset_demo.sql).)

## 3. Add your API keys
- Supabase → **Project Settings → API**.
- Copy **Project URL** and the **anon / public** key.
- Paste them into `.env.local` (replace the placeholder values):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

## 4. Create your logins
- Supabase → **Authentication → Users → Add user**.
- Add one user for you and one for your wife (email + password). You both see
  and edit the same shared household data.
- Tip: under **Authentication → Providers → Email**, you can turn off
  "Confirm email" so logins work immediately without a confirmation click.

## 5. Run it
```
npm run dev
```
Open http://localhost:3000, sign in, and start entering real data.

## Deploy to Vercel (when ready)
- Push this folder to a GitHub repo (or use the Vercel CLI).
- Vercel → **New Project** → import the repo.
- Add the **same two environment variables** from step 3 in Vercel's settings.
- Deploy. Use your Gmail to sign in to Vercel if you like — the app itself is
  unaffected by which Vercel account hosts it.

---

### Accuracy notes
- **Balances are manual** — there's no live bank connection. Enter real balances
  and keep them current, or use **Import statements** to bring in transactions.
- **Wise / foreign currency** — set each account's currency and FX rate; the
  consolidated total converts everything to RM.
- All roll-ups (net worth, loan net position, AI spend, claim totals) are
  computed live from what you enter.
