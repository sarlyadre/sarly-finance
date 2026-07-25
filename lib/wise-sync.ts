import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_FX } from "@/lib/constants";
import { getPersonalProfileId, getBalances, getStatement } from "@/lib/wise";

export type WiseSyncResult = {
  accounts: number;
  transactions: number;
  warnings: string[];
};

/**
 * Pull Wise balances + statements and upsert them as accounts/transactions.
 * Shared by the user-triggered route and the scheduled cron route.
 */
export async function runWiseSync(
  supabase: SupabaseClient,
  ownerId: string
): Promise<WiseSyncResult> {
  const profileId = await getPersonalProfileId();
  const balances = await getBalances(profileId);

  const { data: existingAccts } = await supabase.from("accounts").select("*");
  const byName = new Map((existingAccts ?? []).map((a: any) => [a.name, a]));

  let accountCount = 0;
  let txnCount = 0;
  const warnings: string[] = [];

  for (const bal of balances) {
    const name = `Wise ${bal.currency}`;
    let account = byName.get(name);

    if (account) {
      await supabase
        .from("accounts")
        .update({ balance: bal.value })
        .eq("id", account.id);
    } else {
      const { data: created } = await supabase
        .from("accounts")
        .insert({
          owner_id: ownerId,
          name,
          type: "fintech",
          institution: "Wise",
          currency: bal.currency,
          fx_rate: DEFAULT_FX[bal.currency] ?? 1,
          balance: bal.value,
          color: "#74a02e",
        })
        .select("*")
        .single();
      account = created;
      if (created) byName.set(name, created);
    }
    accountCount++;
    if (!account) continue;

    try {
      const txns = await getStatement(profileId, bal.id, bal.currency);
      const { data: existing } = await supabase
        .from("transactions")
        .select("external_ref")
        .eq("account_id", account.id)
        .not("external_ref", "is", null);
      const seen = new Set((existing ?? []).map((e: any) => e.external_ref));

      const rows = txns
        .filter((t) => t.ref && t.date && !seen.has(t.ref))
        .map((t) => ({
          owner_id: ownerId,
          account_id: account!.id,
          txn_date: t.date,
          description: t.description,
          category: t.amount >= 0 ? "Income" : "To be confirmed",
          amount: t.amount,
          source: "wise",
          external_ref: t.ref,
        }));
      if (rows.length) {
        await supabase.from("transactions").insert(rows);
        txnCount += rows.length;
      }
    } catch (e: any) {
      warnings.push(`${bal.currency}: ${e.message ?? "statement unavailable"}`);
    }
  }

  return { accounts: accountCount, transactions: txnCount, warnings };
}
