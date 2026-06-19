import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = resolve(fileURLToPath(new URL("../src/cli.js", import.meta.url)));

// Run the CLI; returns { status, stdout, stderr }. Captures stderr on success
// and failure alike (execFileSync discards stdout/stderr on success).
function run(args, input) {
  const r = spawnSync("node", [CLI, ...args], {
    input: input ?? "",
    encoding: "utf8",
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

const SCAM =
  "pay a $45 registration fee, gift cards only, contact me on WhatsApp, urgent you're hired!";
const LEGIT =
  "Looking for a React developer to build a dashboard, budget $2000, share portfolio, interview to follow.";

test("--version prints a version", () => {
  const r = run(["--version"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test("--help prints usage", () => {
  const r = run(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
});

test("check on a scam posting (stdin) exits 1 and reports high risk", () => {
  const r = run(["check", "-"], SCAM);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /HIGH RISK/);
});

test("check on a legit posting (stdin) exits 0 and reports low risk", () => {
  const r = run(["check", "-"], LEGIT);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /LOW RISK/);
});

test("check --json emits valid JSON", () => {
  const r = run(["check", "-", "--json"], LEGIT);
  assert.equal(r.status, 0);
  const v = JSON.parse(r.stdout);
  assert.equal(v.band, "low");
  assert.equal(typeof v.score, "number");
});

test("check on a missing file exits 2 with a clean error", () => {
  const r = run(["check", "/no/such/file.txt"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /error: file not found/);
  assert.ok(!r.stderr.includes("at ")); // no stack trace
});

test("rules lists the rule catalog", () => {
  const r = run(["rules"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /upfront_fee/);
  assert.match(r.stdout, /credential_phishing/);
});

test("propose on a legit posting prints an offline draft", () => {
  const dir = mkdtempSync(join(tmpdir(), "chaibot-cli-"));
  try {
    const profile = join(dir, "profile.json");
    writeFileSync(profile, JSON.stringify({ name: "Sam", skills: ["React"] }));
    const r = run(["propose", "-", "--profile", profile], LEGIT);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Sam/);
    assert.match(r.stderr, /source: offline/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("propose on a scam posting is blocked and exits 1", () => {
  const r = run(["propose", "-"], SCAM);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /blocked/);
});

test("unknown command exits 2 and prints help", () => {
  const r = run(["frobnicate"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown command/);
});
