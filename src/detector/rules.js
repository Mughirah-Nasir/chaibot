/**
 * The rule set.
 *
 * Each rule is `{ id, category, weight, reason, test }` where `test(posting)`
 * returns either a falsy value (rule did not fire) or `{ reason?, evidence? }`
 * (rule fired, optionally overriding the default reason and attaching the
 * matched snippet). Weights are chosen so the well-known scam fingerprints add
 * up into the high-risk band while a single soft signal stays low.
 *
 * The patterns encoded here are common, documented freelance-scam tactics
 * (upfront fees, moving off-platform, unrealistic pay, payment-rail games,
 * overpayment/refund scams, urgency pressure, credential phishing). They are
 * heuristics, not proof: the engine explains its reasoning and the user
 * decides. See the README's "Limitations".
 */

// ---- helpers ---------------------------------------------------------------
function phrase(posting, patterns) {
  for (const re of patterns) {
    const m = posting.text.match(re);
    if (m) return m[0];
  }
  return null;
}

// ---- payment / money rules -------------------------------------------------
const upfrontFee = {
  id: "upfront_fee",
  category: "payment",
  weight: 40,
  reason: "Asks the freelancer to pay a fee, deposit, or 'registration' upfront",
  test(p) {
    const ev = phrase(p, [
      /\b(registration|processing|training|onboarding|security|refundable)\s+(fee|deposit|charge)\b/,
      /\bpay\s+(?:a\s+)?(?:small\s+)?(?:fee|deposit|\$?\d+)\s+(?:to|before|for)\s+(?:start|begin|register|apply|get)\b/,
      /\b(buy|purchase)\s+(?:a\s+)?(?:starter|kit|package|software|license)\s+(?:to|before)\b/,
    ]);
    return ev ? { evidence: ev } : null;
  },
};

const overpaymentScam = {
  id: "overpayment_refund",
  category: "payment",
  weight: 35,
  reason: "Mentions overpayment / sending a check and refunding the difference (classic scam)",
  test(p) {
    const ev = phrase(p, [
      /\b(send|mail|deposit)\s+you\s+(?:a\s+)?(?:check|cheque|payment)\b.*\brefund\b/,
      /\boverpay\b|\bsend\s+back\s+the\s+(?:extra|difference|remaining)\b/,
      /\b(?:cashier'?s?|certified)\s+check\b/,
    ]);
    return ev ? { evidence: ev } : null;
  },
};

const oddPaymentRail = {
  id: "odd_payment_rail",
  category: "payment",
  weight: 22,
  reason: "Pushes payment via gift cards / crypto / wire only — unusual for legitimate gigs",
  test(p) {
    const ev = phrase(p, [
      /\b(gift\s?cards?|itunes|google\s?play\s?card|steam\s?card)\b/,
      /\b(bitcoin|btc|usdt|crypto|binance)\s+(?:only|payment|wallet)\b/,
      /\b(western\s?union|moneygram|wire\s+transfer\s+only)\b/,
    ]);
    return ev ? { evidence: ev } : null;
  },
};

const unrealisticPay = {
  id: "unrealistic_pay",
  category: "payment",
  weight: 20,
  reason: "Promises unusually high pay for little work or vague tasks",
  test(p) {
    const ev = phrase(p, [
      // USD-denominated
      /\$\s?\d{3,}\s*(?:\/|per\s+)?(?:hour|hr)\b/,
      /\bearn\s+\$?\d{3,}\s+(?:a\s+)?(?:day|daily|per\s+day)\b/,
      /\b(easy|quick)\s+money\b|\bno\s+experience\s+(?:needed|required)\b.*\b\$?\d{2,}/,
      /\b\$?\d{3,}\s+(?:a\s+|per\s+)?week\s+(?:part[\s-]?time|for\s+\d+\s+hours)\b/,
      // PKR-denominated (Rs / PKR / ₨). Five-figure-plus daily, weekly, or
      // hourly pay is far above realistic entry-level rates for the
      // freelancers this tool targets. Monthly salaries are deliberately not
      // matched: "earn Rs 150,000 a month" can be a legitimate job.
      /\b(?:pkr|rs\.?|₨)\s?\d{2}[\d,]{3,}\s*(?:\/\s*|per\s+|a\s+|each\s+)?(?:day|daily|week|weekly)\b/,
      /\b(?:pkr|rs\.?|₨)\s?\d{2}[\d,]{3,}\s*(?:\/\s*|per\s+|an?\s+)?(?:hour|hr|hourly)\b/,
      /\bearn\s+(?:pkr|rs\.?|₨)\s?\d{2}[\d,]{3,}(?![\d,]*\s*(?:a\s+|per\s+)?month)/,
    ]);
    return ev ? { evidence: ev } : null;
  },
};

// ---- contact / off-platform rules ------------------------------------------
const offPlatformContact = {
  id: "off_platform_contact",
  category: "contact",
  weight: 28,
  reason: "Asks to move the conversation off-platform (WhatsApp/Telegram/email) before hiring",
  test(p) {
    if (p.mentionsWhatsApp || p.mentionsTelegram) {
      const ev = phrase(p, [
        /\b(?:contact|message|reach|text|add)\s+me\s+(?:on|at|via)\s+(?:whats?app|telegram)\b/,
        /\b(?:whats?app|telegram)\b/,
      ]);
      return { evidence: ev ?? "off-platform messaging app mentioned" };
    }
    // Email/phone embedded in the posting body (not a profile link).
    if (p.emails.length > 0) {
      return {
        reason: "Posting includes a direct email to contact outside the platform",
        evidence: p.emails[0],
      };
    }
    if (p.phones.length > 0) {
      return {
        reason: "Posting includes a phone number to contact outside the platform",
        evidence: p.phones[0],
      };
    }
    return null;
  },
};

const credentialPhishing = {
  id: "credential_phishing",
  category: "contact",
  weight: 38,
  reason: "Requests login credentials, OTP codes, banking details, or identity documents",
  test(p) {
    const ev = phrase(p, [
      /\b(password|login\s+credentials|otp|one[\s-]?time\s+(?:password|code)|verification\s+code)\b/,
      /\b(bank\s+account\s+(?:number|details)|routing\s+number|card\s+number|cvv|pin)\b/,
      /\b(send|share|upload)\s+(?:your\s+)?(?:cnic|passport|id\s+card|national\s+id)\b/,
    ]);
    return ev ? { evidence: ev } : null;
  },
};

// ---- scope / legitimacy rules ----------------------------------------------
const vagueScope = {
  id: "vague_scope",
  category: "scope",
  weight: 10,
  reason: "Very short or vague description with no concrete deliverables",
  test(p) {
    if (p.wordCount > 0 && p.wordCount < 18) {
      return { evidence: `only ${p.wordCount} words` };
    }
    return null;
  },
};

const urgencyPressure = {
  id: "urgency_pressure",
  category: "scope",
  weight: 12,
  reason: "Uses urgency/pressure to rush you into committing",
  test(p) {
    const ev = phrase(p, [
      /\b(urgent|asap|immediately|right\s+now|start\s+today|hurry|limited\s+(?:slots|spots|time))\b/,
      /\bonly\s+\d+\s+(?:spots|slots|positions)\s+(?:left|available)\b/,
    ]);
    return ev ? { evidence: ev } : null;
  },
};

const massHireGiveaway = {
  id: "mass_hire",
  category: "scope",
  weight: 10,
  reason: "Mass-hiring language ('hiring 50 people') typical of low-effort scams",
  test(p) {
    const ev = phrase(p, [
      /\bhiring\s+\d{2,}\s+(?:people|freelancers|workers|agents)\b/,
      /\b(?:multiple|many)\s+(?:positions|openings)\s+available\b.*\bno\s+interview\b/,
    ]);
    return ev ? { evidence: ev } : null;
  },
};

const noInterviewInstantHire = {
  id: "instant_hire",
  category: "scope",
  weight: 14,
  reason: "Offers the job with no interview, test, or portfolio review",
  test(p) {
    const ev = phrase(p, [
      /\b(?:you'?re\s+hired|guaranteed\s+(?:job|work|hire))\b/,
      /\bno\s+(?:interview|test|portfolio|experience)\s+(?:needed|required|necessary)\b/,
    ]);
    return ev ? { evidence: ev } : null;
  },
};

const grammarFarming = {
  id: "contact_farming",
  category: "scope",
  weight: 8,
  reason: "Reads like a copy-paste blast asking everyone to 'apply by messaging'",
  test(p) {
    const ev = phrase(p, [
      /\bdm\s+(?:me\s+)?(?:to\s+apply|for\s+details|now)\b/,
      /\b(?:interested\s+(?:candidates|people)\s+)?(?:kindly\s+)?(?:inbox|message|dm)\s+me\b/,
    ]);
    return ev ? { evidence: ev } : null;
  },
};

export const ALL_RULES = [
  upfrontFee,
  overpaymentScam,
  oddPaymentRail,
  unrealisticPay,
  offPlatformContact,
  credentialPhishing,
  vagueScope,
  urgencyPressure,
  massHireGiveaway,
  noInterviewInstantHire,
  grammarFarming,
];

// Exported individually so each can be unit-tested in isolation.
export const RULES_BY_ID = Object.fromEntries(ALL_RULES.map((r) => [r.id, r]));
