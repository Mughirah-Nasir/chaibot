/**
 * Proposal orchestrator.
 *
 * Flow:
 *   posting + profile -> offline draft (always)
 *                     -> if a provider is configured, ask it to polish the
 *                        draft into a tailored proposal
 *                     -> if that fails, fall back to the offline draft
 *
 * Guarantee: this never throws for an operational reason. A provider failure
 * degrades to the deterministic offline draft, so the user always gets
 * something usable. High-risk postings are gated in the offline builder and
 * that gate is respected here too.
 */

import { buildOfflineProposal } from "./offline.js";

const SYSTEM_PROMPT =
  "You are helping a freelancer write a concise, professional, honest proposal " +
  "for a job posting. Improve clarity and tone. Do NOT invent experience, " +
  "skills, metrics, or past clients that are not in the draft. Keep it under " +
  "200 words. Output only the proposal text.";

/**
 * @param {object} input
 * @param {object} input.posting   normalized posting
 * @param {object} input.verdict   detector verdict
 * @param {object} input.profile   freelancer profile
 * @param {object} [input.provider]  optional provider with complete()
 * @param {object} [opts] { allowRisky }
 * @returns {Promise<{ proposal: string|null, blocked: boolean, reason?: string,
 *                      source: 'offline'|'llm', fellBack: boolean }>}
 */
export async function generateProposal(input, opts = {}) {
  const offline = buildOfflineProposal(input, opts);
  if (offline.blocked) {
    return { ...offline, source: "offline", fellBack: false };
  }

  if (!input.provider) {
    return { proposal: offline.proposal, blocked: false, source: "offline", fellBack: false };
  }

  const prompt = buildProposalPrompt({
    draft: offline.proposal,
    posting: input.posting,
    profile: input.profile,
  });

  try {
    const polished = (await input.provider.complete(prompt)).trim();
    if (!polished) throw new Error("provider returned empty text");
    return { proposal: polished, blocked: false, source: "llm", fellBack: false };
  } catch (err) {
    // Never block on a provider failure: hand back the offline draft.
    return {
      proposal: offline.proposal,
      blocked: false,
      source: "offline",
      fellBack: true,
      reason: `provider failed (${err.message}); used offline draft`,
    };
  }
}

/**
 * Construct the polish prompt. Exposed for testing.
 * @returns {{ system: string, user: string }}
 */
export function buildProposalPrompt({ draft, posting, profile }) {
  const postingExcerpt = (posting?.raw ?? "").slice(0, 1200);
  const skills = (profile?.skills ?? []).join(", ") || "(none provided)";
  const user = [
    "Job posting (excerpt):",
    postingExcerpt,
    "",
    `Freelancer's stated skills: ${skills}`,
    "",
    "Draft proposal to improve (do not add facts not present here):",
    draft,
  ].join("\n");
  return { system: SYSTEM_PROMPT, user };
}

export { SYSTEM_PROMPT };
