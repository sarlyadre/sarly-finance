import { getClaims } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { ClaimsView } from "@/components/views/ClaimsView";

export const dynamic = "force-dynamic";

export default async function ClaimsPage() {
  const claims = await getClaims();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user!.id)
    .maybeSingle();

  const userName =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string) ||
    user?.email ||
    "Member";

  return <ClaimsView claims={claims} userId={user!.id} userName={userName} />;
}
