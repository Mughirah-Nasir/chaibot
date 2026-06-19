# Authenticity — design decisions and where they live

This file maps the main design decisions in ChaiBot to where they live in the
code and the reason behind each, so the project is easy to review.

| Decision | Where | Why |
|---|---|---|
| **Transparent weighted rules**, not a classifier | `src/detector/rules.js`, `engine.js` | Trust & safety output must be explainable; every score point traces to a named rule + evidence. |
| **Each rule is an independent pure function** | `rules.js` (`test(posting)`) | Lets each rule be unit-tested in isolation and keeps the engine a simple sum. |
| **Bounded, capped score with bands** | `engine.js` (`SCORE_CAP`, band thresholds) | A clean 0–100 scale with low/caution/high is interpretable; piling on small flags can't exceed the ceiling. |
| **Parsing done once in a normalizer** | `src/detector/normalize.js` | Rules shouldn't each re-parse the blob; extraction (money, email, phone, WhatsApp/Telegram) is centralized and tested. |
| **Detector is offline + zero-dependency** | `detector/*` | The core runs with no network and no key, which is what makes it trustworthy and fully testable. |
| **Proposal: deterministic offline draft first** | `src/proposal/offline.js` | Zero-setup experience and the fallback; only arranges the user's own profile facts. |
| **No fabrication of experience** | `offline.js` + `proposal/index.js` (`SYSTEM_PROMPT`) | Honesty: the draft uses only provided facts, and the LLM prompt forbids inventing skills/metrics/clients. Covered by a test. |
| **High-risk proposals are gated** | `offline.js` (gate) + `index.js` | The tool shouldn't help a user invest effort in a likely scam; `--allow-risky` is an explicit override. |
| **Vendor-agnostic provider interface** | `src/providers/base.js`, `remote.js` | One `complete({system,user})` method; the proposal layer is provider-agnostic and swappable. |
| **Replay provider for tests** | `src/providers/replay.js` | Deterministic, key-free, reproducible testing of the LLM path; a cache miss is a loud error, never invented text. |
| **Injectable fetch in remote providers** | `remote.js` (`fetchImpl`) | Request shaping and error handling are tested with no network. |
| **Keys come from env via the factory, never read in classes** | `remote.js` (`createProvider`) | Providers never touch `process.env`; secrets stay at the edge. |
| **Proposal never hard-fails** | `proposal/index.js` (try/catch → offline) | A provider error degrades to the offline draft so the user always gets something usable. |
| **CLI exit codes are scriptable** | `src/cli.js` (`check` → exit 1 on high) | Lets `chaibot check` gate a script or pre-submit hook. |
| **CLI errors are clean, not stack traces** | `cli.js` (`UserError`, exit 2) | A missing file or bad spec prints `error: …`, not a traceback. |
| **Local API is sandboxed by intent** | `src/api/server.js` (127.0.0.1, body cap, no auth note) | Standard-library HTTP, local-only, with a request-size cap; documented as not for public exposure. |
| **Zero runtime dependencies** | `package.json` | Less supply-chain risk, easy to audit; dev tooling only. |
| **Scoped as a Node core, Laravel-wrappable** | README scope note, the local API seam | Honest about what's built and tested; the HTTP API is the seam a Laravel UI would call. |

## Bugs found & fixed during this build

1. **Test harness discarded stderr on success.** The CLI test helper used
   `execFileSync` and hard-coded `stderr: ""` in its success branch, so a test
   asserting on the CLI's stderr (`source: offline`) failed even though the CLI
   was correct. Switched the helper to `spawnSync`, which captures stdout and
   stderr regardless of exit code — a test-harness bug rather than a product
   bug.
2. **ESM relative-import wiring.** Assembling the package across
   `detector/ · proposal/ · providers/ · api/` surfaced the usual `.` vs `..`
   relative-path issues between subfolders, fixed so each module resolves
   correctly.

Also verified by running the tool for real: a classic scam posting scores
100/high with seven explained flags; a legitimate React posting scores 0/low
with no false positives; the proposal assistant blocks the scam, drafts a clean
proposal for the legit posting using only the provided profile, and the replay
provider polishes that draft deterministically with no API key. The local API
returns the same verdicts over HTTP.

## AI assistance, plainly

Designed and directed by Mughirah Nasir; implemented in disclosed
pair-programming sessions with Claude (Anthropic). See `PROVENANCE.md` for the
verification approach (clean source snapshot, SHA-256 manifest in
`CERTIFICATE.html`, and the GitHub push timestamp once published).
