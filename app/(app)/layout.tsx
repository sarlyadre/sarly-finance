import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const resolved: Profile =
    (profile as Profile) ?? {
      id: user.id,
      email: user.email ?? null,
      full_name: (user.user_metadata?.full_name as string) ?? user.email ?? null,
      avatar_url: null,
      role: "member",
    };

  return <AppShell profile={resolved}>{children}</AppShell>;
}
