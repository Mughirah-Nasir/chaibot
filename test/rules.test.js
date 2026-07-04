import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizePosting } from "../src/detector/normalize.js";
import { evaluate } from "../src/detector/engine.js";
import { analyzePosting } from "../src/detector/index.js";
import { RULES_BY_ID, ALL_RULES } from "../src/detector/rules.js";

// Run a single rule against raw text; returns the fired signal or null.
function fire(ruleId, text) {
  const rule = RULES_BY_ID[ruleId];
  const posting = normalizePosting(text);
  const hit = rule.test(posting);
  return hit ? { rule, hit } : null;
}

test("every rule has the required shape", () => {
  for (const r of ALL_RULES) {
    assert.equal(typeof r.id, "string");
    assert.equal(typeof r.category, "string");
    assert.equal(typeof r.weight, "number");
    assert.equal(typeof r.reason, "string");
    assert.equal(typeof r.test, "function");
  }
});

test("rule ids are unique", () => {
  const ids = ALL_RULES.map((r) => r.id);
  assert.equal(ids.length, new Set(ids).size);
});

// --- individual rules: positive and negative ---
test("upfront_fee fires on registration fee, not on normal pay", () => {
  assert.ok(fire("upfront_fee", "pay a small registration fee to start"));
  assert.equal(fire("upfront_fee", "we will pay you $500 on delivery"), null);
});

test("overpayment_refund fires on classic check/refund language", () => {
  assert.ok(
    fire("overpayment_refund", "we will send you a check, keep your part and refund the rest"),
  );
  assert.equal(fire("overpayment_refund", "milestone payment on completion"), null);
});

test("odd_payment_rail fires on gift cards and crypto-only", () => {
  assert.ok(fire("odd_payment_rail", "payment in gift cards only"));
  assert.ok(fire("odd_payment_rail", "we pay in bitcoin only"));
  assert.equal(fire("odd_payment_rail", "payment via the platform escrow"), null);
});

test("unrealistic_pay fires on huge daily pay with no experience", () => {
  assert.ok(fire("unrealistic_pay", "earn $600 per day, no experience needed for $50 task"));
  assert.equal(fire("unrealistic_pay", "rate is $30 per hour for senior work"), null);
});

// Regression: the rule previously only matched $-denominated amounts, so
// PKR-denominated too-good-to-be-true pay (the primary audience's currency)
// fired nothing even though the normalizer extracts PKR amounts.
test("unrealistic_pay fires on huge PKR-denominated pay", () => {
  assert.ok(fire("unrealistic_pay", "earn Rs 50,000 per day working from home"));
  assert.ok(fire("unrealistic_pay", "PKR 200,000 weekly, no experience"));
  assert.ok(fire("unrealistic_pay", "we pay rs. 25000 daily for simple typing"));
  assert.ok(fire("unrealistic_pay", "Rs 15,000 per hour guaranteed"));
});

test("unrealistic_pay ignores plausible PKR budgets and monthly salaries", () => {
  assert.equal(fire("unrealistic_pay", "budget is PKR 20,000 for the whole project"), null);
  assert.equal(fire("unrealistic_pay", "salary: earn Rs 150,000 per month with benefits"), null);
  assert.equal(fire("unrealistic_pay", "rate around rs 2,000 per day for data entry"), null);
});

test("off_platform_contact fires on whatsapp and on embedded email", () => {
  assert.ok(fire("off_platform_contact", "contact me on WhatsApp to begin"));
  const viaEmail = fire("off_platform_contact", "send your application to hire@elsewhere.co");
  assert.ok(viaEmail);
  assert.equal(fire("off_platform_contact", "apply through Upwork only"), null);
});

test("credential_phishing fires on OTP, bank details, and CNIC requests", () => {
  assert.ok(fire("credential_phishing", "share the OTP code you receive"));
  assert.ok(fire("credential_phishing", "send your bank account number and cvv"));
  assert.ok(fire("credential_phishing", "upload your CNIC to verify"));
  assert.equal(fire("credential_phishing", "share your portfolio link"), null);
});

test("vague_scope fires only on very short postings", () => {
  assert.ok(fire("vague_scope", "need help fast pay good dm me"));
  assert.equal(fire("vague_scope", "a".repeat(5) + " " + Array(30).fill("word").join(" ")), null);
});

test("urgency_pressure fires on urgent/limited-slots language", () => {
  assert.ok(fire("urgency_pressure", "URGENT need this done asap"));
  assert.ok(fire("urgency_pressure", "only 3 spots left, hurry"));
  assert.equal(fire("urgency_pressure", "no rush, take your time"), null);
});

test("mass_hire fires on hiring-many language", () => {
  assert.ok(fire("mass_hire", "hiring 50 freelancers this week"));
  assert.equal(fire("mass_hire", "hiring one developer"), null);
});

test("instant_hire fires on no-interview/guaranteed-job", () => {
  assert.ok(fire("instant_hire", "you're hired, no interview needed"));
  assert.equal(fire("instant_hire", "shortlisted candidates will interview"), null);
});

test("contact_farming fires on DM-to-apply blasts", () => {
  assert.ok(fire("contact_farming", "interested candidates kindly inbox me"));
  assert.ok(fire("contact_farming", "DM me to apply"));
  assert.equal(fire("contact_farming", "submit a proposal with your plan"), null);
});

// --- engine scoring ---
test("evaluate returns low band and zero score for a clean posting", () => {
  const posting = normalizePosting(
    "Looking for a React developer to build a dashboard. Budget $2000 fixed. Please share your portfolio and timeline. Interview to follow.",
  );
  const v = evaluate(posting);
  assert.equal(v.band, "low");
  assert.equal(v.score, 0);
  assert.equal(v.signals.length, 0);
});

test("evaluate returns high band for a classic scam and caps at 100", () => {
  const posting = normalizePosting(
    "URGENT hiring 50 agents, earn $600 per day no experience, pay $45 registration fee, gift cards only, contact me on WhatsApp, you're hired!",
  );
  const v = evaluate(posting);
  assert.equal(v.band, "high");
  assert.ok(v.score <= 100);
  assert.ok(v.score >= 55);
  // signals are sorted by weight descending
  for (let i = 1; i < v.signals.length; i++) {
    assert.ok(v.signals[i - 1].weight >= v.signals[i].weight);
  }
});

test("evaluate reaches caution band for a couple of moderate flags", () => {
  const posting = normalizePosting("Urgent task, please DM me to apply quickly");
  const v = evaluate(posting);
  assert.equal(v.band, "caution");
  assert.ok(v.score >= 25 && v.score < 55);
});

test("evaluate exposes distinct categories", () => {
  const posting = normalizePosting(
    "pay a registration fee and contact me on WhatsApp, urgent only 2 slots",
  );
  const v = evaluate(posting);
  assert.ok(v.categories.includes("payment"));
  assert.ok(v.categories.includes("contact"));
  assert.ok(v.categories.includes("scope"));
});

// Regression: stateful /g regexes in normalize.js made the same posting gain
// or lose the 28-point off_platform_contact flag between consecutive scoring
// calls in a long-running process (e.g. the API server).
test("scoring the same posting repeatedly yields identical verdicts", () => {
  const text =
    "Great gig! Contact me on WhatsApp or telegram @quick_hire to start today, budget $500.";
  const first = analyzePosting(text).verdict;
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(analyzePosting(text).verdict, first);
  }
  assert.ok(first.signals.some((s) => s.id === "off_platform_contact"));
});

test("evaluate accepts a custom rule subset", () => {
  const posting = normalizePosting("pay a registration fee to start");
  const v = evaluate(posting, { rules: [RULES_BY_ID.upfront_fee] });
  assert.equal(v.signals.length, 1);
  assert.equal(v.signals[0].id, "upfront_fee");
});
