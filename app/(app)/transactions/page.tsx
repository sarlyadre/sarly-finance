import { getTransactions, getAccounts } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { TransactionsView } from "@/components/views/TransactionsView";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: { account?: string };
}) {
  const [transactions, accounts] = await Promise.all([
    getTransactions(),
    getAccounts(),
  ]);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <TransactionsView
      transactions={transactions}
      accounts={accounts}
      userId={user!.id}
      initialAccount={searchParams.account ?? "all"}
    />
  );
}
