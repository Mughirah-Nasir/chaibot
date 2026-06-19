import { test } from "node:test";
import assert from "node:assert/strict";

import { generateProposal, buildProposalPrompt } from "../src/proposal/index.js";
import { analyzePosting } from "../src/detector/index.js";
import { ProviderError } from "../src/providers/base.js";

const PROFILE = { name: "Sam", skills: ["React"], yearsExperience: 2 };

function legit() {
  return analyzePosting(
    "Looking for a React dev to build a dashboard, budget $1500, share portfolio, interview to follow.",
  );
}

test("generateProposal returns the offline draft when no provider is given", async () => {
  const { verdict, posting } = legit();
  const out = await generateProposal({ posting, verdict, profile: PROFILE });
  assert.equal(out.source, "offline");
  assert.equal(out.blocked, false);
  assert.ok(out.proposal.includes("Sam"));
});

test("generateProposal uses the provider to polish when given one", async () => {
  const { verdict, posting } = legit();
  const provider = {
    async complete() {
      return "polished proposal text";
    },
  };
  const out = await generateProposal({ posting, verdict, profile: PROFILE, provider });
  assert.equal(out.source, "llm");
  assert.equal(out.proposal, "polished proposal text");
  assert.equal(out.fellBack, false);
});

test("generateProposal falls back to offline when the provider throws", async () => {
  const { verdict, posting } = legit();
  const provider = {
    async complete() {
      throw new ProviderError("rate limited");
    },
  };
  const out = await generateProposal({ posting, verdict, profile: PROFILE, provider });
  assert.equal(out.source, "offline");
  assert.equal(out.fellBack, true);
  assert.match(out.reason, /provider failed/);
  assert.ok(out.proposal.includes("Sam")); // still usable
});

test("generateProposal falls back when the provider returns empty text", async () => {
  const { verdict, posting } = legit();
  const provider = {
    async complete() {
      return "   ";
    },
  };
  const out = await generateProposal({ posting, verdict, profile: PROFILE, provider });
  assert.equal(out.fellBack, true);
});

test("generateProposal respects the high-risk gate (no provider call)", async () => {
  const { verdict, posting } = analyzePosting(
    "pay $45 registration fee, gift cards only, contact me on WhatsApp, urgent you're hired!",
  );
  let called = false;
  const provider = {
    async complete() {
      called = true;
      return "x";
    },
  };
  const out = await generateProposal({ posting, verdict, profile: PROFILE, provider });
  assert.equal(out.blocked, true);
  assert.equal(called, false, "provider must not be called for a blocked posting");
});

test("buildProposalPrompt includes the draft and stated skills, truncates posting", () => {
  const { posting } = legit();
  const prompt = buildProposalPrompt({
    draft: "DRAFT-BODY",
    posting,
    profile: { skills: ["React", "Vue"] },
  });
  assert.ok(prompt.system.length > 0);
  assert.ok(prompt.user.includes("DRAFT-BODY"));
  assert.ok(prompt.user.includes("React, Vue"));
});
