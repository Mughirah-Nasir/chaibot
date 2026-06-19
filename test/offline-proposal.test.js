import { test } from "node:test";
import assert from "node:assert/strict";

import { buildOfflineProposal } from "../src/proposal/offline.js";
import { analyzePosting } from "../src/detector/index.js";

const PROFILE = {
  name: "Ayesha Khan",
  skills: ["React", "TypeScript"],
  yearsExperience: 3,
  highlights: ["Built dashboards", "Integrated APIs"],
  rate: 25,
  portfolio: "https://example.com/p",
};

function lowRiskInputs(profile = PROFILE) {
  const { verdict, posting } = analyzePosting(
    "Looking for a React developer to build a dashboard, budget $2000, share portfolio, interview to follow.",
  );
  return { posting, verdict, profile };
}

test("builds a proposal for a low-risk posting", () => {
  const out = buildOfflineProposal(lowRiskInputs());
  assert.equal(out.blocked, false);
  assert.ok(out.proposal.includes("Ayesha Khan"));
  assert.ok(out.proposal.includes("React"));
  assert.ok(out.proposal.includes("3 years"));
  assert.ok(out.proposal.includes("https://example.com/p"));
});

test("blocks a proposal for a high-risk posting by default", () => {
  const { verdict, posting } = analyzePosting(
    "pay $45 registration fee, gift cards only, contact me on WhatsApp, urgent you're hired!",
  );
  const out = buildOfflineProposal({ posting, verdict, profile: PROFILE });
  assert.equal(out.blocked, true);
  assert.equal(out.proposal, null);
  assert.match(out.reason, /high-risk/);
});

test("allowRisky overrides the high-risk block", () => {
  const { verdict, posting } = analyzePosting(
    "pay $45 registration fee, gift cards only, contact me on WhatsApp, urgent you're hired!",
  );
  const out = buildOfflineProposal({ posting, verdict, profile: PROFILE }, { allowRisky: true });
  assert.equal(out.blocked, false);
  assert.ok(out.proposal.length > 0);
});

test("does not fabricate skills or experience the profile lacks", () => {
  const minimal = { name: "Sam" };
  const out = buildOfflineProposal(lowRiskInputs(minimal));
  assert.equal(out.blocked, false);
  // No invented years of experience, no invented skills list.
  assert.ok(!/\d+\s+years?/.test(out.proposal));
  assert.ok(!out.proposal.includes("Relevant skills:"));
  assert.ok(out.proposal.includes("Sam"));
});

test("omits portfolio and rate lines when not provided", () => {
  const out = buildOfflineProposal(lowRiskInputs({ name: "Sam", skills: ["Vue"] }));
  assert.ok(!out.proposal.includes("Portfolio:"));
  assert.ok(!out.proposal.includes("My rate"));
});

test("personalizes the opener from a known topic in the posting", () => {
  const out = buildOfflineProposal(lowRiskInputs());
  assert.ok(out.proposal.toLowerCase().includes("react"));
});
