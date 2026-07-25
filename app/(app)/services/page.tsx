import { getServices, getUsageLogs, getAccounts } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { ServicesView } from "@/components/views/ServicesView";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const [services, usageLogs, accounts] = await Promise.all([
    getServices(),
    getUsageLogs(),
    getAccounts(),
  ]);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <ServicesView
      services={services}
      usageLogs={usageLogs}
      accounts={accounts}
      userId={user!.id}
    />
  );
}
