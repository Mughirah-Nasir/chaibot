# Changelog

All notable changes to ChaiBot are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) loosely; versions follow
[SemVer](https://semver.org/).

## v1.0.0 — Initial public release (verified Node core)

### Added
- **Scam/red-flag detector** for freelance job postings: a normalizer plus 11
  transparent, weighted rules across payment / contact / scope categories,
  producing a bounded 0–100 risk score with low/caution/high bands. Every flag
  carries a plain-language reason and the matched evidence.
- **Proposal assistant**: a deterministic offline draft built from the
  freelancer's own profile, with an optional, vendor-agnostic LLM polish step
  (OpenAI / Anthropic / replay) behind a single provider interface.
  - Refuses to draft for high-risk postings by default (`--allow-risky` to
    override).
  - Never fabricates skills or experience; the LLM prompt forbids it.
  - Never hard-fails: a provider error degrades to the offline draft.
- **CLI**: `check`, `propose`, `rules`, `serve`, `--version`, `--help`.
  `check` exits 1 on a high-risk verdict so it can gate scripts.
- **Optional local HTTP API** (`/health`, `/rules`, `/check`, `/propose`),
  standard-library only, local use.
- **Replay provider** for deterministic, key-free, reproducible testing of the
  LLM path.
- Examples (scam/legit postings, a profile, a cassette), tests (71), ESLint +
  Prettier config, and CI across Node 18/20/22.

### Scope note
- This release is the **verified Node.js core**. It is designed to be wrapped
  by a Laravel + Vue UI later, but this repository is not a full Laravel app.

### Known limitations
- Heuristic, not proof; English-focused; pattern-based and therefore evadable;
  single-turn. See the README's "Limitations".
