import { getStatements, getAccounts, getTransactions } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { StatementsView } from "@/components/views/StatementsView";

export const dynamic = "force-dynamic";

export default async function StatementsPage() {
  const [statements, accounts, txns] = await Promise.all([
    getStatements(),
    getAccounts(),
    getTransactions(1000),
  ]);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const existing = txns.map((t) => ({
    txn_date: t.txn_date,
    amount: Number(t.amount),
    description: t.description,
  }));

  return (
    <StatementsView
      statements={statements}
      accounts={accounts}
      existing={existing}
      userId={user!.id}
    />
  );
}
