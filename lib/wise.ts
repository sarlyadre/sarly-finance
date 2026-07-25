// Server-only Wise API client. Never import this into a client component — the
// token can move money, so it must stay on the server (read via env). It's only
// imported by the /api/wise/sync route handler, which runs server-side.
const BASE = process.env.WISE_API_BASE || "https://api.transferwise.com";

function authHeaders() {
  const token = process.env.WISE_API_TOKEN;
  if (!token) throw new Error("WISE_API_TOKEN is not set on the server.");
  return { Authorization: `Bearer ${token}` };
}

async function wiseGet(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (res.status === 403 && res.headers.get("x-2fa-approval")) {
    throw new Error(
      "Wise requires Strong Customer Authentication (SCA) for this endpoint on your profile. Balances still sync; statements need a registered key pair."
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Wise API ${res.status}: ${body.slice(0, 180)}`);
  }
  return res.json();
}

export async function getPersonalProfileId(): Promise<number> {
  const profiles = await wiseGet("/v2/profiles");
  const list = Array.isArray(profiles) ? profiles : [];
  const personal =
    list.find((p: any) => String(p.type).toUpperCase() === "PERSONAL") ??
    list[0];
  if (!personal) throw new Error("No Wise profile found for this token.");
  return personal.id;
}

export type WiseBalance = {
  id: number;
  currency: string;
  value: number;
};

export async function getBalances(profileId: number): Promise<WiseBalance[]> {
  const data = await wiseGet(
    `/v4/profiles/${profileId}/balances?types=STANDARD`
  );
  return (Array.isArray(data) ? data : []).map((b: any) => ({
    id: b.id,
    currency: b.currency ?? b.amount?.currency,
    value: Number(b.amount?.value ?? 0),
  }));
}

export type WiseTxn = {
  ref: string;
  date: string; // yyyy-MM-dd
  amount: number; // signed
  description: string;
};

export async function getStatement(
  profileId: number,
  balanceId: number,
  currency: string,
  days = 180
): Promise<WiseTxn[]> {
  const end = new Date();
  const start = new Date(Date.now() - days * 86400000);
  const qs = new URLSearchParams({
    currency,
    intervalStart: start.toISOString(),
    intervalEnd: end.toISOString(),
    type: "COMPACT",
  });
  const data = await wiseGet(
    `/v1/profiles/${profileId}/balance-statements/${balanceId}/statement.json?${qs}`
  );
  const txns = Array.isArray(data?.transactions) ? data.transactions : [];
  return txns.map((t: any, i: number) => {
    // Wise statements are usually signed already; fall back to the DEBIT/CREDIT
    // type if a positive value is paired with a debit.
    let amount = Number(t.amount?.value ?? 0);
    const type = String(t.type ?? "").toUpperCase();
    if (type === "DEBIT" && amount > 0) amount = -amount;
    else if (type === "CREDIT" && amount < 0) amount = Math.abs(amount);
    return {
    ref: String(t.referenceNumber ?? `${balanceId}-${t.date}-${i}`),
    date: String(t.date ?? "").slice(0, 10),
    amount,
    description:
      t.details?.description ||
      t.details?.senderName ||
      t.details?.merchant?.name ||
      t.details?.paymentReference ||
      t.type ||
      "Wise transaction",
    };
  });
}
