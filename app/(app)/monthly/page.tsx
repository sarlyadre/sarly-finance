import { getCommitments, getCommitmentPayments } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { MonthlyView } from "@/components/views/MonthlyView";

export const dynamic = "force-dynamic";

export default async function MonthlyPage() {
  const [commitments, payments] = await Promise.all([
    getCommitments(),
    getCommitmentPayments(),
  ]);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <MonthlyView
      commitments={commitments}
      payments={payments}
      userId={user!.id}
    />
  );
}
