import { createClient } from "@supabase/supabase-js";

// Service-role client for background jobs (cron) that run without a user
// session. Bypasses RLS, so it must ONLY be used server-side. The key is a
// Supabase "secret" key — keep it out of any client bundle.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY (or URL) is not configured.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
