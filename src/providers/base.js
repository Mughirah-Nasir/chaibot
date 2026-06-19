/**
 * Provider abstraction for the LLM-backed proposal polish (Strategy pattern).
 *
 * Every provider exposes:
 *
 *     async complete({ system, user }) -> string
 *
 * The proposal layer doesn't know or care which provider it talks to, so the
 * tool is vendor-agnostic and -- importantly -- the whole pipeline is testable
 * offline with the ReplayProvider, which plays back recorded outputs. No real
 * API keys are ever required to run or test ChaiBot.
 */

export class ProviderError extends Error {
  constructor(message, { cause, retryable = false } = {}) {
    super(message);
    this.name = "ProviderError";
    this.cause = cause;
    this.retryable = retryable;
  }
}

/**
 * Race a fetch against a timeout via AbortController.
 * @param {(signal: AbortSignal) => Promise<any>} fn
 * @param {number} ms
 */
export async function withTimeout(fn, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
