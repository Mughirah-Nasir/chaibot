import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizePosting } from "../src/detector/normalize.js";

test("normalizePosting lowercases and collapses whitespace", () => {
  const p = normalizePosting("  Hello   WORLD\n\tnow ");
  assert.equal(p.text, "hello world now");
  assert.equal(p.wordCount, 3);
});

test("normalizePosting handles empty and null input", () => {
  assert.equal(normalizePosting("").wordCount, 0);
  assert.equal(normalizePosting(null).text, "");
  assert.equal(normalizePosting(undefined).length, 0);
});

test("normalizePosting extracts USD and PKR amounts", () => {
  const p = normalizePosting("Budget is $1,500 or PKR 20000 for the work");
  assert.ok(p.amounts.includes(1500));
  assert.ok(p.amounts.includes(20000));
  assert.ok(p.currencies.includes("USD"));
  assert.ok(p.currencies.includes("PKR"));
});

test("normalizePosting extracts emails and urls", () => {
  const p = normalizePosting("contact me at scam@evil.co or https://evil.example.com/apply");
  assert.deepEqual(p.emails, ["scam@evil.co"]);
  assert.equal(p.urls.length, 1);
  assert.ok(p.urls[0].startsWith("https://"));
});

test("normalizePosting flags whatsapp and telegram mentions", () => {
  assert.equal(normalizePosting("message me on WhatsApp").mentionsWhatsApp, true);
  assert.equal(normalizePosting("reach me on Telegram").mentionsTelegram, true);
  assert.equal(normalizePosting("normal posting").mentionsWhatsApp, false);
});

test("normalizePosting detects phone numbers within length bounds", () => {
  const p = normalizePosting("call +1 555 987 6543 now");
  assert.equal(p.phones.length, 1);
  // too-short digit runs are not treated as phones
  const q = normalizePosting("item 12345 in stock");
  assert.equal(q.phones.length, 0);
});

test("hasOffPlatformContact is true when contact info present", () => {
  assert.equal(normalizePosting("email me at a@b.com").hasOffPlatformContact, true);
  assert.equal(normalizePosting("apply via the platform").hasOffPlatformContact, false);
});

// Regression: WHATSAPP_RE/TELEGRAM_RE used to carry the /g flag, so .test()
// kept lastIndex state between calls and identical input produced different
// results on consecutive calls (e.g. mentionsWhatsApp true, then false).
test("normalizePosting is deterministic across repeated calls", () => {
  const input = "contact me on whatsapp or a@b.com";
  const first = normalizePosting(input);
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(normalizePosting(input), first);
  }
  assert.equal(first.mentionsWhatsApp, true);
  assert.equal(first.hasOffPlatformContact, true);
});

// Regression: the second .test() inside a single normalizePosting call used
// to consume the /g regex state, so a pure-WhatsApp posting came back with
// hasOffPlatformContact false even on the first call.
test("hasOffPlatformContact is true for a whatsapp-only posting, repeatedly", () => {
  for (let i = 0; i < 3; i++) {
    const p = normalizePosting("message me on WhatsApp");
    assert.equal(p.mentionsWhatsApp, true);
    assert.equal(p.hasOffPlatformContact, true);
  }
});

// Regression: TELEGRAM_RE's "@handle" branch used to match the domain part of
// every email address, mislabelling emails as Telegram mentions.
test("an email address does not count as a telegram mention", () => {
  const p = normalizePosting("email me at test@gmail.com");
  assert.equal(p.mentionsTelegram, false);
  assert.deepEqual(p.emails, ["test@gmail.com"]);
  // ...but a standalone @handle still does
  assert.equal(normalizePosting("message @scam_handle on telegram alt").mentionsTelegram, true);
  assert.equal(normalizePosting("dm @scam_handle for details").mentionsTelegram, true);
});
