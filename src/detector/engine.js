/**
 * The rule engine: the deterministic core of ChaiBot.
 *
 * A "rule" inspects a normalized job posting and, if it fires, returns a
 * signal: a weight (how much it moves the risk score), a short human-readable
 * reason, and a category. Rules are pure functions of their input, so each one
 * is independently unit-testable and the whole engine is reproducible with no
 * network and no model.
 *
 * Scoring is transparent on purpose. The final risk score is a bounded sum of
 * fired-rule weights, mapped to a 0-100 scale and a verdict band. Every point
 * of that score traces back to a named rule with an explanation, so a user
 * (and an interviewer) can see exactly *why* a posting was flagged. This is
 * the opposite of an opaque classifier, and it's deliberate: trust/safety
 * tooling has to be explainable.
 */

import { ALL_RULES } from "./rules.js";

/**
 * @typedef {Object} Signal
 * @property {string} id          stable rule id
 * @property {string} category    grouping (payment, contact, scope, ...)
 * @property {number} weight      points this rule contributed
 * @property {string} reason      human-readable explanation
 * @property {string} [evidence]  the matched text/snippet, if any
 */

/**
 * @typedef {Object} Verdict
 * @property {number} score        0-100 risk score
 * @property {string} band         'low' | 'caution' | 'high'
 * @property {string} summary      one-line plain-language summary
 * @property {Signal[]} signals    every rule that fired, highest weight first
 * @property {string[]} categories distinct categories that fired
 */

// Score thresholds for the verdict bands. Tuned so a single minor flag stays
// "low", a couple of moderate flags reach "caution", and the classic scam
// fingerprints (upfront fee + off-platform + unrealistic pay) land in "high".
const BAND_CAUTION = 25;
const BAND_HIGH = 55;

// The raw weight sum is squashed into 0-100 with this cap so that piling on
// many small flags cannot exceed a clean, interpretable ceiling.
const SCORE_CAP = 100;

/**
 * Evaluate a normalized posting against a set of rules.
 *
 * @param {object} posting   output of normalizePosting()
 * @param {object} [opts]
 * @param {Array}  [opts.rules]  rule list (defaults to ALL_RULES)
 * @returns {Verdict}
 */
export function evaluate(posting, opts = {}) {
  const rules = opts.rules ?? ALL_RULES;

  const signals = [];
  for (const rule of rules) {
    const hit = rule.test(posting);
    if (hit) {
      signals.push({
        id: rule.id,
        category: rule.category,
        weight: rule.weight,
        reason: hit.reason ?? rule.reason,
        evidence: hit.evidence,
      });
    }
  }

  signals.sort((a, b) => b.weight - a.weight);

  const rawScore = signals.reduce((sum, s) => sum + s.weight, 0);
  const score = Math.min(SCORE_CAP, rawScore);
  const band = score >= BAND_HIGH ? "high" : score >= BAND_CAUTION ? "caution" : "low";
  const categories = [...new Set(signals.map((s) => s.category))];

  return {
    score,
    band,
    summary: buildSummary(band, signals),
    signals,
    categories,
  };
}

function buildSummary(band, signals) {
  if (signals.length === 0) {
    return "No common scam indicators detected. Still apply normal caution.";
  }
  const top = signals[0];
  const more = signals.length - 1;
  const tail = more > 0 ? ` (and ${more} other flag${more === 1 ? "" : "s"})` : "";
  switch (band) {
    case "high":
      return `High risk: ${top.reason}${tail}. Treat this posting as likely fraudulent.`;
    case "caution":
      return `Some caution warranted: ${top.reason}${tail}. Verify before engaging.`;
    default:
      return `Mostly clear, one minor flag: ${top.reason}${tail}.`;
  }
}
