import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";

import { createApp } from "../src/api/server.js";

// Spin up the app on an ephemeral port for each test group.
function withServer(run, appOpts) {
  return new Promise((resolve, reject) => {
    const server = createServer(createApp(appOpts));
    server.listen(0, "127.0.0.1", async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      try {
        await run(base);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

const SCAM =
  "pay a $45 registration fee, gift cards only, contact me on WhatsApp, urgent you're hired!";
const LEGIT =
  "Looking for a React developer to build a dashboard, budget $2000, share portfolio, interview to follow.";

test("GET /health returns ok", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });
});

test("GET /rules lists the rules", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/rules`);
    const data = await res.json();
    assert.ok(Array.isArray(data.rules));
    assert.ok(data.rules.find((r) => r.id === "upfront_fee"));
  });
});

test("POST /check scores a scam high and a legit posting low", async () => {
  await withServer(async (base) => {
    const post = (text) =>
      fetch(`${base}/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json());

    const scam = await post(SCAM);
    assert.equal(scam.verdict.band, "high");
    const legit = await post(LEGIT);
    assert.equal(legit.verdict.band, "low");
  });
});

test("POST /check rejects a missing text field", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /propose blocks a high-risk posting", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/propose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: SCAM, profile: { name: "X" } }),
    });
    const data = await res.json();
    assert.equal(res.status, 422);
    assert.equal(data.result.blocked, true);
  });
});

test("POST /propose returns an offline draft for a legit posting", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/propose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: LEGIT, profile: { name: "Sam", skills: ["React"] } }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.result.blocked, false);
    assert.equal(data.result.source, "offline");
    assert.ok(data.result.proposal.includes("Sam"));
  });
});

test("POST /propose rejects a body-supplied provider unless allow-listed", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/propose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: LEGIT, provider: "replay:/etc/passwd.json" }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /not enabled/);
  });
});

test("POST /propose accepts an allow-listed provider kind", async () => {
  await withServer(
    async (base) => {
      const res = await fetch(`${base}/propose`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: LEGIT,
          profile: { name: "Sam" },
          provider: "replay:examples/cassette.json",
        }),
      });
      // The cassette has no entry for this prompt, so the orchestrator falls
      // back to the offline draft -- but the provider itself was permitted.
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.result.blocked, false);
    },
    { allowedProviders: ["replay"] },
  );
});

test("requests with a non-local Host header are rejected", async () => {
  await withServer(async (base) => {
    const { port } = new URL(base);
    const status = await new Promise((resolve, reject) => {
      // fetch() forbids overriding Host, so use a raw http request to spoof
      // what a DNS-rebinding page would send.
      const req = request(
        { host: "127.0.0.1", port, path: "/health", headers: { host: "evil.example.com" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 403);
  });
});

test("unknown route returns 404", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
  });
});

test("invalid JSON body returns 413/400-style error", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    assert.ok(res.status >= 400);
  });
});
