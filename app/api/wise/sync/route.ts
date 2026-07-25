import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runWiseSync } from "@/lib/wise-sync";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!process.env.WISE_API_TOKEN) {
    return NextResponse.json(
      { error: "Wise isn't connected — add WISE_API_TOKEN to your server env." },
      { status: 400 }
    );
  }

  try {
    const result = await runWiseSync(supabase, user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Wise sync failed." },
      { status: 500 }
    );
  }
}
