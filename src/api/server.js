/**
 * Optional local HTTP API for ChaiBot.
 *
 * A tiny standard-library http server (zero dependencies) so the detector and
 * proposal builder can be called over HTTP -- handy for a quick demo or as the
 * thing a future Laravel UI calls. It is intended for LOCAL use only: it binds
 * to localhost, has no auth, and can invoke paid providers if you ask it to,
 * so it must not be exposed publicly.
 *
 * Endpoints:
 *   GET  /health                 -> { ok: true }
 *   GET  /rules                  -> the red-flag rules
 *   POST /check    { text }      -> verdict
 *   POST /propose  { text, profile?, provider?, allowRisky? } -> proposal result
 *
 * Hardening (cheap, but deliberate):
 *   - The Host header must be localhost/127.0.0.1/[::1]; anything else gets a
 *     403. This blocks DNS-rebinding pages from driving the local server.
 *   - The `provider` field of POST /propose is disabled unless the provider
 *     kind was explicitly allow-listed at startup (`chaibot serve --providers
 *     openai,anthropic`). Otherwise any local caller could spend the API keys
 *     in the server's environment, or use `replay:<path>` to probe local
 *     files.
 */

import { createServer } from "node:http";

import { analyzePosting } from "../detector/index.js";
import { ALL_RULES } from "../detector/rules.js";
import { generateProposal } from "../proposal/index.js";
import { createProvider } from "../providers/remote.js";
import { ProviderError } from "../providers/base.js";

const MAX_BODY = 100 * 1024; // 100 KB cap on request bodies

export const PROVIDER_KINDS = ["replay", "openai", "anthropic"];

/**
 * @param {object} [opts]
 * @param {string[]} [opts.allowedProviders]  provider kinds POST /propose may
 *   instantiate from the request body (default: none)
 */
export function createApp({ allowedProviders = [] } = {}) {
  return async function handler(req, res) {
    try {
      if (!isLocalHostHeader(req.headers.host)) {
        return send(res, 403, { error: "forbidden Host header" });
      }
      const url = new URL(req.url, "http://localhost");

      if (req.method === "GET" && url.pathname === "/health") {
        return send(res, 200, { ok: true });
      }
      if (req.method === "GET" && url.pathname === "/rules") {
        return send(res, 200, {
          rules: ALL_RULES.map((r) => ({
            id: r.id,
            category: r.category,
            weight: r.weight,
            reason: r.reason,
          })),
        });
      }
      if (req.method === "POST" && url.pathname === "/check") {
        const body = await readJson(req);
        if (typeof body.text !== "string" || !body.text.trim()) {
          return send(res, 400, { error: "body must include non-empty 'text'" });
        }
        const { verdict } = analyzePosting(body.text);
        return send(res, 200, { verdict });
      }
      if (req.method === "POST" && url.pathname === "/propose") {
        const body = await readJson(req);
        if (typeof body.text !== "string" || !body.text.trim()) {
          return send(res, 400, { error: "body must include non-empty 'text'" });
        }
        const { verdict, posting } = analyzePosting(body.text);
        let provider;
        if (body.provider) {
          const spec = String(body.provider);
          const kind = spec.split(":")[0].trim().toLowerCase();
          if (!allowedProviders.includes(kind)) {
            return send(res, 403, {
              error: `provider kind '${kind}' is not enabled on this server (start it with --providers to allow it)`,
            });
          }
          try {
            provider = createProvider(spec);
          } catch (err) {
            return send(res, 400, { error: err.message });
          }
        }
        const result = await generateProposal(
          { posting, verdict, profile: body.profile ?? {}, provider },
          { allowRisky: Boolean(body.allowRisky) },
        );
        // 422: the request was valid but we won't produce a proposal for a
        // high-risk posting; 200 when a draft/polished proposal was produced.
        return send(res, result.blocked ? 422 : 200, { result, verdict });
      }

      return send(res, 404, { error: "not found" });
    } catch (err) {
      if (err instanceof BodyError) return send(res, 413, { error: err.message });
      if (err instanceof ProviderError) return send(res, 502, { error: err.message });
      return send(res, 500, { error: "internal error" });
    }
  };
}

export function startServer({ port = 8100, host = "127.0.0.1", allowedProviders = [] } = {}) {
  const server = createServer(createApp({ allowedProviders }));
  server.listen(port, host, () => {
    const providers = allowedProviders.length > 0 ? allowedProviders.join(",") : "none";
    process.stderr.write(
      `ChaiBot API on http://${host}:${port} (local use only, no auth; providers: ${providers})\n`,
    );
  });
  return server;
}

// Only accept requests addressed to the local machine. A browser lured to a
// DNS-rebinding page sends the attacker's hostname in Host, so this check
// stops such pages from reaching the API even though it binds to 127.0.0.1.
function isLocalHostHeader(host) {
  // The bind address already restricts who can connect; a missing Host header
  // (bare HTTP/1.0 client, curl --http1.0) is fine.
  if (!host) return true;
  let hostname;
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    return false;
  }
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function send(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
}

class BodyError extends Error {}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new BodyError("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new BodyError("invalid JSON body"));
      }
    });
    req.on("error", () => reject(new BodyError("error reading body")));
  });
}
