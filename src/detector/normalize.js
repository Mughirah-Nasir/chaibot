/**
 * Normalize a raw job posting into the structured shape the rules consume.
 *
 * Real postings arrive as a blob of text pasted from Upwork/Fiverr/WhatsApp.
 * The rules should not each re-parse that blob, so this module does the
 * parsing once: lower-casing for matching, pulling out contact handles,
 * money amounts, and links, and exposing both the cleaned text and the
 * extracted fields. Keeping this separate means the rules stay small and the
 * parsing is tested on its own.
 */

// Money like "$5", "$1,000", "5 USD", "PKR 2000", "Rs. 500", "₨300".
const MONEY_RE =
  /(?:(?:\$|usd|us\$|pkr|rs\.?|₨|inr|₹)\s?)(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(?:usd|dollars?|pkr|rupees?|inr)/gi;

// Contact handles that imply moving off-platform.
const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const URL_RE = /\bhttps?:\/\/[^\s)]+/gi;
const WHATSAPP_RE = /\b(whats?app|wa\.me|whatsapp number)\b/gi;
const TELEGRAM_RE = /\b(telegram|t\.me|telegram handle|@[a-z0-9_]{4,})\b/gi;
// Phone-ish: international or local sequences, loosely.
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;

/**
 * @param {string} raw  the pasted posting text
 * @returns {object} normalized posting
 */
export function normalizePosting(raw) {
  const text = (raw ?? "").toString();
  const lower = text.toLowerCase();
  const collapsed = lower.replace(/\s+/g, " ").trim();

  const amounts = extractAmounts(text);
  const emails = unique(text.match(EMAIL_RE) ?? []);
  const urls = unique(text.match(URL_RE) ?? []);
  const phones = unique((text.match(PHONE_RE) ?? []).map((p) => p.trim())).filter(
    (p) => digitsOf(p).length >= 9 && digitsOf(p).length <= 15,
  );

  return {
    raw: text,
    text: collapsed, // lower-cased, whitespace-collapsed; what most rules match on
    length: collapsed.length,
    wordCount: collapsed ? collapsed.split(" ").length : 0,
    amounts, // array of numbers (in their stated unit; see currencies)
    currencies: detectCurrencies(lower),
    emails,
    urls,
    phones,
    mentionsWhatsApp: WHATSAPP_RE.test(lower),
    mentionsTelegram: TELEGRAM_RE.test(lower),
    // Convenience: does the text contain any explicit off-platform contact?
    hasOffPlatformContact:
      emails.length > 0 || phones.length > 0 || WHATSAPP_RE.test(lower) || TELEGRAM_RE.test(lower),
  };
}

function extractAmounts(text) {
  const out = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const numStr = m[1] ?? m[2];
    if (!numStr) continue;
    const n = Number(numStr.replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function detectCurrencies(lower) {
  const found = new Set();
  if (/\$|usd|us\$|dollar/.test(lower)) found.add("USD");
  if (/pkr|rs\.?|₨|rupee/.test(lower)) found.add("PKR");
  if (/inr|₹/.test(lower)) found.add("INR");
  return [...found];
}

function unique(arr) {
  return [...new Set(arr.map((s) => s.trim()))].filter(Boolean);
}

function digitsOf(s) {
  return (s.match(/\d/g) ?? []).join("");
}
