// Resolves a real brand logo for an account by matching its institution / name
// to a known domain, then loading that site's favicon. No data is stored — it's
// derived on render, with a graceful fallback to the coloured icon when there's
// no match or the image fails to load.

const BRAND_DOMAINS: [RegExp, string][] = [
  // Malaysian banks
  [/maybank|\bmae\b/i, "maybank.com"],
  [/cimb/i, "cimb.com"],
  [/public\s*bank|pbe\b/i, "pbebank.com"],
  [/rhb/i, "rhbgroup.com"],
  [/hong\s*leong|\bhlb\b/i, "hlb.com.my"],
  [/ambank/i, "ambankgroup.com"],
  [/bank\s*islam/i, "bankislam.com"],
  [/bank\s*rakyat/i, "bankrakyat.com.my"],
  [/affin/i, "affinalways.com"],
  [/alliance\s*bank/i, "alliancebank.com.my"],
  [/\bbsn\b|simpanan\s*nasional/i, "bsn.com.my"],
  [/\buob\b/i, "uob.com.my"],
  [/\bocbc\b/i, "ocbc.com.my"],
  [/hsbc/i, "hsbc.com.my"],
  [/standard\s*chartered|stanchart/i, "sc.com"],
  [/citibank|citi\b/i, "citibank.com.my"],
  // E-wallets
  [/touch\s*'?\s*n\s*go|\btng\b/i, "touchngo.com.my"],
  [/grab/i, "grab.com"],
  [/boost/i, "myboost.com.my"],
  [/shopee/i, "shopee.com.my"],
  [/bigpay/i, "bigpayme.com"],
  [/setel/i, "setel.com"],
  // Fintech / cards / global
  [/wise/i, "wise.com"],
  [/revolut/i, "revolut.com"],
  [/paypal/i, "paypal.com"],
  [/stripe/i, "stripe.com"],
  [/visa/i, "visa.com"],
  [/master\s*card|mastercard/i, "mastercard.com"],
  [/amex|american\s*express/i, "americanexpress.com"],
  [/\bunionpay\b/i, "unionpayintl.com"],
];

export function brandDomain(text?: string | null): string | null {
  if (!text) return null;
  for (const [re, dom] of BRAND_DOMAINS) if (re.test(text)) return dom;
  return null;
}

/** A logo URL for an account, or null to fall back to the coloured icon. */
export function logoForAccount(a: {
  institution?: string | null;
  name?: string | null;
}): string | null {
  const dom = brandDomain(a.institution) ?? brandDomain(a.name);
  return dom ? `https://www.google.com/s2/favicons?sz=128&domain=${dom}` : null;
}
