/**
 * Remote providers (OpenAI, Anthropic) and the provider factory.
 *
 * Both use the global fetch (Node 18+) so the package has zero runtime
 * dependencies. The transport is injectable (`fetchImpl`) so tests exercise
 * request shaping and error handling without a network. Keys are passed in by
 * the factory from the environment; these classes never read process.env.
 */

import { ProviderError, withTimeout } from "./base.js";
import { ReplayProvider } from "./replay.js";

export class OpenAIProvider {
  constructor({
    model = "gpt-4o-mini",
    apiKey,
    baseUrl = "https://api.openai.com/v1",
    timeoutMs = 30000,
    maxTokens = 600,
    fetchImpl,
  } = {}) {
    if (!apiKey) throw new ProviderError("OpenAI provider needs an API key");
    this.name = "openai";
    this.model = model;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
    this.maxTokens = maxTokens;
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
  }

  async complete({ system, user }) {
    const body = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: user },
      ],
    };
    const res = await withTimeout(
      (signal) =>
        this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        }),
      this.timeoutMs,
    ).catch((err) => {
      throw new ProviderError(`OpenAI request failed: ${err.message}`, {
        cause: err,
        retryable: true,
      });
    });
    if (!res.ok) {
      throw new ProviderError(`OpenAI returned ${res.status}`, {
        retryable: res.status >= 500 || res.status === 429,
      });
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) throw new ProviderError("OpenAI returned an empty message");
    return text;
  }
}

export class AnthropicProvider {
  constructor({
    model = "claude-3-5-haiku-latest",
    apiKey,
    baseUrl = "https://api.anthropic.com/v1",
    timeoutMs = 30000,
    maxTokens = 600,
    fetchImpl,
  } = {}) {
    if (!apiKey) throw new ProviderError("Anthropic provider needs an API key");
    this.name = "anthropic";
    this.model = model;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
    this.maxTokens = maxTokens;
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
  }

  async complete({ system, user }) {
    const body = {
      model: this.model,
      max_tokens: this.maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: user }],
    };
    const res = await withTimeout(
      (signal) =>
        this.fetchImpl(`${this.baseUrl}/messages`, {
          method: "POST",
          signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        }),
      this.timeoutMs,
    ).catch((err) => {
      throw new ProviderError(`Anthropic request failed: ${err.message}`, {
        cause: err,
        retryable: true,
      });
    });
    if (!res.ok) {
      throw new ProviderError(`Anthropic returned ${res.status}`, {
        retryable: res.status >= 500 || res.status === 429,
      });
    }
    const data = await res.json();
    const text = (data?.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) throw new ProviderError("Anthropic returned an empty message");
    return text;
  }
}

/**
 * Build a provider from a 'kind:detail' spec.
 *   "replay:path/to/cassette.json"
 *   "openai:gpt-4o-mini"        (needs OPENAI_API_KEY)
 *   "anthropic:claude-3-5-haiku-latest"  (needs ANTHROPIC_API_KEY)
 *
 * @param {string} spec
 * @param {object} [deps] { env, fetchImpl }
 */
export function createProvider(spec, deps = {}) {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetchImpl;

  if (!spec || !spec.includes(":")) {
    throw new ProviderError(
      `provider spec '${spec}' must look like 'kind:detail' (e.g. 'replay:cassette.json')`,
    );
  }
  const [kindRaw, detailRaw] = spec.split(/:(.+)/);
  const kind = kindRaw.trim().toLowerCase();
  const detail = (detailRaw ?? "").trim();

  switch (kind) {
    case "replay":
      return ReplayProvider.fromFile(detail);
    case "openai":
      return new OpenAIProvider({
        model: detail || undefined,
        apiKey: env.OPENAI_API_KEY,
        fetchImpl,
      });
    case "anthropic":
      return new AnthropicProvider({
        model: detail || undefined,
        apiKey: env.ANTHROPIC_API_KEY,
        fetchImpl,
      });
    default:
      throw new ProviderError(`unknown provider kind '${kind}' (use replay, openai, or anthropic)`);
  }
}
