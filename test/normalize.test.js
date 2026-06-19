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
