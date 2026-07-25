import { getCommitments, getCommitmentPayments } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { CommitmentsView } from "@/components/views/CommitmentsView";

export const dynamic = "force-dynamic";

export default async function CommitmentsPage() {
  const [commitments, payments] = await Promise.all([
    getCommitments(),
    getCommitmentPayments(),
  ]);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <CommitmentsView
      commitments={commitments}
      payments={payments}
      userId={user!.id}
    />
  );
}
