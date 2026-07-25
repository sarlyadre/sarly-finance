import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWiseSync } from "@/lib/wise-sync";

export const dynamic = "force-dynamic";

// Scheduled Wise sync (Vercel Cron). Runs without a user session, so it uses
// the service-role client and attributes data to the household owner.
export async function GET(request: NextRequest) {
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!process.env.WISE_API_TOKEN) {
    return NextResponse.json({ error: "WISE_API_TOKEN not set." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    // Attribute to a configured owner, else the first/earliest user.
    let ownerId = process.env.OWNER_USER_ID;
    if (!ownerId) {
      const { data } = await admin.auth.admin.listUsers();
      const first = (data?.users ?? []).sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )[0];
      ownerId = first?.id;
    }
    if (!ownerId) {
      return NextResponse.json({ error: "No user to attribute to." }, { status: 400 });
    }

    const result = await runWiseSync(admin, ownerId);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...result });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Cron Wise sync failed." },
      { status: 500 }
    );
  }
}
