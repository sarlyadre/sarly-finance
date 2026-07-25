import { getAccounts } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { AccountsView } from "@/components/views/AccountsView";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const [accounts, supabase] = [await getAccounts(), createClient()];
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <AccountsView accounts={accounts} userId={user!.id} />;
}
