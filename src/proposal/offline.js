/**
 * Offline proposal builder -- deterministic, no model, no network.
 *
 * Given a (normalized) posting and the freelancer's profile, assemble a
 * structured, professional proposal draft from templates. This is the
 * zero-setup experience and the fallback when no LLM provider is configured.
 *
 * It deliberately does NOT fabricate experience or claim skills the user did
 * not provide -- it only arranges the user's own inputs into a clear proposal
 * skeleton. The honest framing matters: a templated draft is a starting point
 * the freelancer edits, not a finished application.
 *
 * One safety behaviour: if the posting looks high-risk, the builder refuses to
 * produce a polished proposal and instead returns a warning, so the tool never
 * helps a user invest effort into a likely scam.
 */

const GREETING = "Hello,";

/**
 * @param {object} input
 * @param {object} input.posting   normalized posting (from normalizePosting)
 * @param {object} input.verdict   detector verdict (to gate on risk)
 * @param {object} input.profile   { name, skills[], yearsExperience, highlights[], rate, portfolio }
 * @param {object} [opts]
 * @param {boolean} [opts.allowRisky]  build anyway despite a high-risk posting
 * @returns {{ proposal: string|null, blocked: boolean, reason?: string }}
 */
export function buildOfflineProposal({ posting, verdict, profile }, opts = {}) {
  if (verdict && verdict.band === "high" && !opts.allowRisky) {
    return {
      proposal: null,
      blocked: true,
      reason:
        "This posting scored as high-risk for scam indicators, so a proposal was not generated. " +
        "Review the red flags first; pass { allowRisky: true } to override.",
    };
  }

  const p = profile ?? {};
  const skills = (p.skills ?? []).filter(Boolean);
  const highlights = (p.highlights ?? []).filter(Boolean);

  const lines = [];
  lines.push(GREETING);
  lines.push("");
  lines.push(openingLine(posting, skills));

  if (highlights.length > 0) {
    lines.push("");
    lines.push("A bit about how I can help:");
    for (const h of highlights.slice(0, 4)) {
      lines.push(`- ${h}`);
    }
  }

  if (skills.length > 0) {
    lines.push("");
    lines.push(`Relevant skills: ${skills.join(", ")}.`);
  }

  if (Number.isFinite(p.yearsExperience) && p.yearsExperience > 0) {
    const yr = p.yearsExperience === 1 ? "year" : "years";
    lines.push("");
    lines.push(`I have ${p.yearsExperience} ${yr} of experience in this area.`);
  }

  lines.push("");
  lines.push(nextStepLine(p));

  if (p.portfolio) {
    lines.push("");
    lines.push(`Portfolio: ${p.portfolio}`);
  }

  lines.push("");
  lines.push(p.name ? `Best regards,\n${p.name}` : "Best regards,");

  return { proposal: lines.join("\n"), blocked: false };
}

function openingLine(posting, skills) {
  const focus = primaryFocus(posting);
  const skillBit = skills.length > 0 ? ` I work with ${skills.slice(0, 3).join(", ")}` : "";
  if (focus) {
    return (
      `I read your posting about ${focus} and it's a strong match for what I do.` +
      `${skillBit}, and I'd be glad to take this on.`
    );
  }
  return (
    `Thank you for the posting -- it looks like a good fit for my work.${skillBit}, ` +
    `and I'd be glad to help with this project.`
  );
}

function nextStepLine(profile) {
  if (Number.isFinite(profile.rate) && profile.rate > 0) {
    return (
      `My rate for work like this is around $${profile.rate}; happy to align on scope and ` +
      `timeline. Could you share any additional details so I can confirm the estimate?`
    );
  }
  return (
    "Could you share a few more details on scope and timeline? " +
    "I'll follow up with a clear estimate and a short plan."
  );
}

/**
 * Pull a short topic phrase from the posting to personalize the opener.
 * Heuristic and conservative: it only uses words actually in the posting.
 */
function primaryFocus(posting) {
  if (!posting || !posting.text) return null;
  const KNOWN = [
    "react",
    "vue",
    "laravel",
    "node",
    "python",
    "wordpress",
    "shopify",
    "logo design",
    "data entry",
    "web scraping",
    "mobile app",
    "api",
    "dashboard",
    "landing page",
    "seo",
    "copywriting",
    "video editing",
    "graphic design",
  ];
  const hit = KNOWN.find((k) => posting.text.includes(k));
  return hit ?? null;
}
