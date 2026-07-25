# Deploying to Vercel (go live)

The app is committed to git and builds clean. These are the steps only you can
do (they need your GitHub / Vercel / Supabase logins).

## 1. Push to GitHub
Create an **empty private repo** at https://github.com/new (no README), then in
this folder:

```bash
git remote add origin https://github.com/<your-username>/sarly-finance.git
git push -u origin main
```

## 2. Import into Vercel
1. https://vercel.com → sign in with your **Gmail** → **Add New… → Project**.
2. Import the `sarly-finance` repo. Framework auto-detects as **Next.js** — leave
   build settings default.
3. Before clicking Deploy, add the **Environment Variables** below.

## 3. Environment variables (Vercel → Project → Settings → Environment Variables)
Required (the app won't run without these):

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://dcnnalmohykkyhfgsahf.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_wapjHKSKxB-OnjkGv6gtlQ_rhq4B7Wo` |

Optional (only for Wise sync + the morning cron):

| Name | Value |
|------|-------|
| `WISE_API_TOKEN` | your Wise personal token |
| `CRON_SECRET` | any long random string |
| `SUPABASE_SERVICE_ROLE_KEY` | a Supabase **secret** key (Settings → API Keys) |

Click **Deploy**. You'll get a URL like `https://sarly-finance.vercel.app`.

## 4. Point Supabase auth at the live URL
Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://sarly-finance.vercel.app`
- **Redirect URLs:** add `https://sarly-finance.vercel.app/**`

This makes password-reset / email links work on the live site (fixes the
localhost link problem).

## 5. Done
- Open the Vercel URL on any device → sign in → your data (already in Supabase)
  is there.
- Hani signs in with `hani@sarly.com` on her own phone.
- The **8am morning Wise sync** starts running automatically (if you set the
  optional vars). Check it under Vercel → your project → **Cron Jobs**.

## Redeploying after changes
`git push` to `main` → Vercel auto-builds and redeploys. That's it.
