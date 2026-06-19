import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ReplayProvider } from "../src/providers/replay.js";
import { createProvider, OpenAIProvider, AnthropicProvider } from "../src/providers/remote.js";
import { ProviderError } from "../src/providers/base.js";

// --- replay ---
test("ReplayProvider returns recorded response for a matching prompt", async () => {
  const p = new ReplayProvider({
    model: "m",
    entries: [{ system: "sys", user: "hello", response: "world" }],
  });
  assert.equal(await p.complete({ system: "sys", user: "hello" }), "world");
});

test("ReplayProvider is deterministic", async () => {
  const p = new ReplayProvider({ entries: [{ user: "q", response: "a" }] });
  assert.equal(await p.complete({ user: "q" }), await p.complete({ user: "q" }));
});

test("ReplayProvider throws loudly on a cache miss", async () => {
  const p = new ReplayProvider({ entries: [{ user: "known", response: "x" }] });
  await assert.rejects(() => p.complete({ user: "unknown" }), ProviderError);
});

test("ReplayProvider distinguishes by system prompt", async () => {
  const p = new ReplayProvider({
    entries: [
      { system: "A", user: "q", response: "ra" },
      { system: "B", user: "q", response: "rb" },
    ],
  });
  assert.equal(await p.complete({ system: "A", user: "q" }), "ra");
  assert.equal(await p.complete({ system: "B", user: "q" }), "rb");
});

test("ReplayProvider.fromFile loads a cassette", async () => {
  const dir = mkdtempSync(join(tmpdir(), "chaibot-cass-"));
  try {
    const file = join(dir, "c.json");
    writeFileSync(
      file,
      JSON.stringify({ model: "gpt-4o-mini", entries: [{ user: "p", response: "r" }] }),
    );
    const p = ReplayProvider.fromFile(file);
    assert.equal(p.model, "gpt-4o-mini");
    assert.equal(await p.complete({ user: "p" }), "r");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ReplayProvider.fromFile errors on a missing file", () => {
  assert.throws(() => ReplayProvider.fromFile("/no/such/cassette.json"), ProviderError);
});

test("ReplayProvider rejects malformed entries", () => {
  assert.throws(() => new ReplayProvider({ entries: [{ user: "p" }] }), ProviderError);
});

// --- factory ---
test("createProvider builds a replay provider", () => {
  const dir = mkdtempSync(join(tmpdir(), "chaibot-cass-"));
  try {
    const file = join(dir, "c.json");
    writeFileSync(file, JSON.stringify({ model: "m", entries: [] }));
    const p = createProvider(`replay:${file}`);
    assert.ok(p instanceof ReplayProvider);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createProvider builds openai with a key from env", () => {
  const p = createProvider("openai:gpt-4o-mini", { env: { OPENAI_API_KEY: "test-openai-key" } });
  assert.ok(p instanceof OpenAIProvider);
  assert.equal(p.model, "gpt-4o-mini");
});

test("createProvider throws when the openai key is missing", () => {
  assert.throws(() => createProvider("openai:gpt-4o-mini", { env: {} }), ProviderError);
});

test("createProvider rejects a spec without a colon", () => {
  assert.throws(() => createProvider("justamodel"), ProviderError);
});

test("createProvider rejects an unknown kind", () => {
  assert.throws(() => createProvider("nonsense:x", { env: {} }), ProviderError);
});

// --- remote adapters via injected fetch ---
test("OpenAIProvider shapes the request and parses the response", async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "polished text" } }] }),
    };
  };
  const p = new OpenAIProvider({ apiKey: "test-openai-key", fetchImpl });
  const out = await p.complete({ system: "s", user: "u" });
  assert.equal(out, "polished text");
  assert.ok(captured.url.endsWith("/chat/completions"));
  assert.equal(captured.init.headers.authorization, "Bearer test-openai-key");
  const body = JSON.parse(captured.init.body);
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[1].content, "u");
});

test("OpenAIProvider raises ProviderError on non-ok status", async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({}) });
  const p = new OpenAIProvider({ apiKey: "test-openai-key", fetchImpl });
  await assert.rejects(() => p.complete({ user: "u" }), /429/);
});

test("AnthropicProvider parses content blocks and sends system separately", async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: "text", text: "claude says hi" }] }),
    };
  };
  const p = new AnthropicProvider({ apiKey: "test-anthropic-key", fetchImpl });
  const out = await p.complete({ system: "be brief", user: "hello" });
  assert.equal(out, "claude says hi");
  assert.ok(captured.url.endsWith("/messages"));
  assert.equal(captured.init.headers["x-api-key"], "test-anthropic-key");
  const body = JSON.parse(captured.init.body);
  assert.equal(body.system, "be brief");
  assert.equal(body.messages[0].content, "hello");
});

test("remote provider raises on an empty completion", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: "" } }] }),
  });
  const p = new OpenAIProvider({ apiKey: "test-openai-key", fetchImpl });
  await assert.rejects(() => p.complete({ user: "u" }), /empty/);
});
