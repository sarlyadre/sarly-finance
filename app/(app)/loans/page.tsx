import { getLoans, getLoanPayments, getAccounts } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { LoansView } from "@/components/views/LoansView";

export const dynamic = "force-dynamic";

export default async function LoansPage() {
  const [loans, payments, accounts] = await Promise.all([
    getLoans(),
    getLoanPayments(),
    getAccounts(),
  ]);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <LoansView
      loans={loans}
      payments={payments}
      accounts={accounts}
      userId={user!.id}
    />
  );
}
