# Provenance

**Project:** ChaiBot v1.0.0 (verified Node.js core)
**Author / Director:** Mughirah Nasir (<mnasir.bee25seecs@seecs.edu.pk>)
**GitHub:** [@Mughirah-Nasir](https://github.com/Mughirah-Nasir)
**Built:** June 2026

## What this document is

A plain statement of where this project came from and how to verify it.

## Origin of the idea

ChaiBot is project **B4** in my 2026 portfolio build plan, conceived as a
freelancer-helper for Pakistani users on platforms like Upwork and Fiverr: a
scam/red-flag detector with a proposal assistant on top. The long-term plan is
a Laravel + Vue interface, but the part that carries the actual engineering —
the detector and the proposal logic — is built and verified here as a Node.js
core. I chose to ship the **verified core** rather than an unverified full-stack
app, because I'd rather be honest about what runs and is tested than ship a
Laravel skeleton I couldn't execute and prove.

## How it was built (honestly)

I design and direct these projects and build them in openly disclosed
pair-programming sessions with **Claude (Anthropic)**. Concretely:

* The design decisions — transparent weighted rules instead of an opaque
  classifier, an offline-first detector with zero runtime dependencies, a
  vendor-agnostic provider layer tested via a replay cassette, the never-fail
  proposal fallback, and the safety gating that refuses to draft for high-risk
  postings — were made deliberately and are documented in `AUTHENTICITY.md`.
* Implementation was AI-assisted, disclosed in the README, the way the industry
  treats such tools in 2026: a velocity tool, with my understanding (not my
  typing speed) as the thing being evidenced.
* Real bugs were found and fixed during the build — for example, a test harness
  that discarded a subprocess's stderr on success (masking a CLI assertion),
  and ESM relative-import wiring across the package. Finding and fixing them is
  part of the evidence this was developed, not pasted.

## How to verify authorship

1. **Clean source snapshot.** This public release is provided as a clean source
   snapshot. The full source — code, tests, examples, docs, and package
   metadata — is included for inspection, and the source tree is fingerprinted
   (see `CERTIFICATE.html`) so you can confirm nothing changed after it was
   sealed.
2. **GitHub push timestamp.** Once published, the push date on
   `github.com/Mughirah-Nasir/chaibot` is recorded by GitHub's servers and is
   not editable by me.
3. **Source-tree fingerprint.** `CERTIFICATE.html` embeds a SHA-256 hash over a
   sorted manifest of the source files, with the exact recompute command. Any
   change to any file changes the hash.
4. **(Optional) Timestamp anchor.** If stronger dating is ever needed, the
   fingerprint can be anchored with a public timestamping service.

## What I do *not* claim

* I do not claim this is a finished Laravel product — it is the verified Node
  core, clearly scoped as such.
* I do not claim the detector is definitive. It catches common scam patterns
  and is explicitly heuristic (see the README's "Limitations").
* I do not claim every line was typed by hand without AI assistance.

In short: this is a personal portfolio project, built with disclosed AI
assistance, scoped honestly, and the source tree is fingerprinted so it can be
checked.

— Mughirah Nasir, June 2026
