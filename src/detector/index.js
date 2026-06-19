/**
 * Public detector facade: raw posting text in, full verdict out.
 *
 * This is the one call most consumers (CLI, API, the future Laravel wrapper)
 * need. It normalizes the text and runs the rule engine, returning the
 * structured verdict plus the normalized fields (handy for the proposal
 * assistant, which reuses the extracted scope/pay).
 */

import { normalizePosting } from "./normalize.js";
import { evaluate } from "./engine.js";

/**
 * @param {string} rawText  pasted job posting
 * @param {object} [opts]   forwarded to evaluate()
 * @returns {{ verdict: object, posting: object }}
 */
export function analyzePosting(rawText, opts = {}) {
  const posting = normalizePosting(rawText);
  const verdict = evaluate(posting, opts);
  return { verdict, posting };
}
