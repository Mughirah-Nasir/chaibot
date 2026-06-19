# ChaiBot ☕🛡️

**A scam/red-flag detector and proposal assistant for freelancers on platforms like Upwork and Fiverr — built with Pakistani freelancers in mind.** Paste a job posting; ChaiBot scores it for common scam patterns and explains every flag. For legitimate postings, it can also draft a proposal.

[![CI](https://github.com/Mughirah-Nasir/chaibot/actions/workflows/ci.yml/badge.svg)](https://github.com/Mughirah-Nasir/chaibot/actions)
[![Node 18+](https://img.shields.io/badge/node-18%2B-blue)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-71%20passed-brightgreen)](test/)
[![Dependencies](https://img.shields.io/badge/runtime%20deps-0-success)](package.json)

> **What this release is.** This is the **verified Node.js core** — the scam-detection engine and proposal assistant, with a CLI and an optional local API. It is designed so a **Laravel + Vue UI can wrap it later** (that's the longer-term plan), but this repository is *not* a full Laravel production app, and it doesn't pretend to be. The core is what's built, tested, and honest here.

```text
$ chaibot check examples/scam-posting.txt

[HIGH RISK]  risk score: 100/100  (high)
High risk: Asks the freelancer to pay a fee, deposit, or 'registration' upfront (and 6 other flags). Treat this posting as likely fraudulent.

Flags:
  - [payment] Asks the freelancer to pay a fee, deposit, or 'registration' upfront (+40)  ["registration fee"]
  - [contact] Asks to move the conversation off-platform (WhatsApp/Telegram/email) before hiring (+28)  ["message me on whatsapp"]
  - [payment] Pushes payment via gift cards / crypto / wire only (+22)  ["gift cards"]
  - [payment] Promises unusually high pay for little work or vague tasks (+20)  ["earn $600 per day"]
  - [scope] Offers the job with no interview, test, or portfolio review (+14)  ["no experience required"]
  - [scope] Uses urgency/pressure to rush you into committing (+12)  ["urgent"]
  - [scope] Reads like a copy-paste blast asking everyone to 'apply by messaging' (+8)  ["message me"]
```

## Why this exists

Freelance marketplaces are full of scams aimed at newcomers: "pay a registration fee to start", "we'll send you a check, keep your cut and refund the rest", "contact me on WhatsApp", "send your OTP to verify". They're especially costly for freelancers in places like Pakistan, where a single scam can wipe out real income and platform-side protection isn't always obvious to a first-timer.

ChaiBot encodes those patterns as **transparent, weighted rules**. Every point of a posting's risk score traces back to a named rule with a plain-language reason and the exact text that triggered it — so it's a tool you can learn from, not a black box that just says "bad".

## How it works

```text
        raw job posting text
                 │
                 ▼
        ┌──────────────────┐   lower-case, extract money / emails / phones /
        │   normalizePosting│   links / WhatsApp+Telegram mentions
        └────────┬─────────┘
                 ▼
        ┌──────────────────┐   11 independent red-flag rules, each returns a
        │   rule engine     │   weighted signal + reason + the matched evidence
        └────────┬─────────┘
                 ▼
        ┌──────────────────┐   bounded score 0-100 → band: low / caution / high
        │     Verdict       │   sorted signals, distinct categories
        └────────┬─────────┘
                 ▼
   if low/caution → proposal assistant (optional)
        ┌──────────────────┐         ┌─────────────────────────────┐
        │ offline draft     │────────▶│ optional LLM polish          │
        │ (deterministic)   │         │ replay · openai · anthropic  │
        └──────────────────┘         └─────────────────────────────┘
         deterministic fallback             falls back to offline on failure
```

## Install & quick start

Requires Node 18+. Clone the repo, then:

```bash
npm install        # dev tooling only; the core has ZERO runtime dependencies

# score a posting (from a file or stdin)
node src/cli.js check examples/scam-posting.txt
cat my-posting.txt | node src/cli.js check -

# list the red-flag rules and their weights
node src/cli.js rules

# draft a proposal for a (non-scam) posting
node src/cli.js propose examples/legit-posting.txt --profile examples/profile.json
```

To get a `chaibot` command on your PATH, `npm link` from the repo, then call `chaibot …` directly.

### Proposal assistant

The proposal assistant builds a clean draft from **your own profile** (name, skills, experience, highlights, rate, portfolio) and the posting. By default it works fully offline and deterministically. You can optionally route it through an LLM to polish the wording:

```bash
# offline (no key, deterministic)
node src/cli.js propose examples/legit-posting.txt --profile examples/profile.json

# replay a recorded model output (deterministic, no key — used in tests)
node src/cli.js propose examples/legit-posting.txt --profile examples/profile.json \
  --provider replay:examples/cassette.json

# a real model (needs the key in your environment)
OPENAI_API_KEY=your_openai_api_key_here node src/cli.js propose ... \
  --provider openai:gpt-4o-mini
```

Two safety behaviours:

- **It refuses to draft a proposal for a high-risk posting** (override with `--allow-risky`). The tool shouldn't help you invest effort in a likely scam.
- **It never fabricates experience.** The offline draft only arranges facts you provided, and the LLM prompt explicitly forbids inventing skills, metrics, or past clients. Treat the output as a starting point you edit.

> **Privacy note.** Offline mode keeps everything local. If you use `openai:…` or `anthropic:…`, the posting text, your profile, and the proposal draft may be sent to that provider to generate the polished proposal. Do not use remote providers with private client data, secrets, or anything you are not allowed to share. The `replay:…` provider reads a local cassette and sends nothing. See [SECURITY.md](SECURITY.md).

### Optional local API

```bash
node src/cli.js serve --port 8100     # local use only, no auth
curl -s localhost:8100/check -H 'content-type: application/json' \
  -d '{"text":"pay a registration fee, contact me on whatsapp"}'
```

Endpoints: `GET /health`, `GET /rules`, `POST /check {text}`, `POST /propose {text, profile?, provider?, allowRisky?}`.

## The rules

| Rule | Category | Weight | Fires when… |
|---|---|---|---|
| `upfront_fee` | payment | 40 | a fee/deposit/"registration" is required to start |
| `credential_phishing` | contact | 38 | login/OTP/bank details/CNIC are requested |
| `overpayment_refund` | payment | 35 | check-and-refund-the-difference language |
| `off_platform_contact` | contact | 28 | pushes to WhatsApp/Telegram/email before hiring |
| `odd_payment_rail` | payment | 22 | gift-cards / crypto / wire-only payment |
| `unrealistic_pay` | payment | 20 | implausibly high pay for little/no-experience work |
| `instant_hire` | scope | 14 | "you're hired", no interview/test/portfolio |
| `urgency_pressure` | scope | 12 | urgency / limited-slots pressure |
| `vague_scope` | scope | 10 | very short, no concrete deliverables |
| `mass_hire` | scope | 10 | "hiring 50 people" mass-recruitment language |
| `contact_farming` | scope | 8 | copy-paste "DM me to apply" blasts |

Bands: **low** `< 25`, **caution** `25–54`, **high** `≥ 55` (score is a bounded sum capped at 100).

## Architecture & trade-offs

The main design decisions and the reasoning behind them:

- **Transparent, weighted rules over an opaque classifier.** Trust & safety tooling has to be explainable. Each rule is an independent pure function returning a weight, a reason, and the matched evidence; the score is a simple bounded sum so every point is traceable. A model would be harder to audit and impossible to run offline.
- **The detector is the deterministic core; the LLM is an optional layer.** The whole scam-detection engine runs with no network and no key, which is what makes it testable and trustworthy. The proposal LLM sits behind a one-method provider interface (`complete({system, user})`), so it's vendor-agnostic and the pipeline is tested with a **replay provider** (recorded outputs, deterministic, no spend) — never a live key.
- **Errors are data; the proposal never hard-fails.** A provider error (rate limit, timeout, bad key) degrades to the deterministic offline draft, so the user always gets something usable.
- **Safety gating.** The proposal builder refuses high-risk postings by default and never fabricates experience — both enforced in code and covered by tests.
- **Zero runtime dependencies.** The core is standard-library Node (CLI, the rule engine, and the API all use no third-party packages); ESLint/Prettier are dev-only. Fewer dependencies, less supply-chain risk, easy to audit.
- **Wrappable by Laravel later.** The detector and proposal builder are plain functions, and the local API exposes them over HTTP — which is exactly the seam a Laravel + Vue UI would call. Keeping the verified core separate from an unverified UI is deliberate.

## Limitations (honest)

- **Heuristics, not proof.** A high score means "matches common scam patterns", not "definitely a scam"; a low score means "no common red flags found", not "definitely safe". Always apply your own judgment. ChaiBot is a decision aid.
- **English-focused.** The rules target English-language postings (with some Roman-Urdu-adjacent phrasing). Postings in other languages or heavy transliteration may be under-detected.
- **Pattern-based, so evadable.** A scammer who avoids the known phrasings can score low. The rules catch common, lazy scams well; they are not adversarially robust.
- **Single-turn.** It analyzes one posting (or one proposal draft) at a time. It does not track a conversation, verify a client's history, or check platform reputation.
- **The proposal assistant is a drafting aid.** Offline output is templated; even LLM-polished output should be reviewed and personalized before you send it.
- **Not affiliated** with Upwork, Fiverr, or any platform.

## Development

```bash
npm install
npm test            # 71 tests, node:test runner
npm run lint        # eslint
npm run format:check
```

Layout: `src/detector/` (normalize, rules, engine), `src/proposal/` (offline builder + orchestrator), `src/providers/` (base, replay, remote + factory), `src/api/` (local HTTP server), `src/cli.js`, `examples/`, `test/`.

## AI assistance disclosure

This project was designed and directed by me and built in pair-programming sessions with Claude (Anthropic), which I use openly as a coding partner. The design decisions — transparent weighted rules, the offline-first detector, the vendor-agnostic provider layer with replay-based testing, the never-fail proposal fallback, and the safety gating — are choices I understand and stand behind. See [PROVENANCE.md](PROVENANCE.md) and [AUTHENTICITY.md](AUTHENTICITY.md).

## License

[MIT](LICENSE) © 2026 Mughirah Nasir
