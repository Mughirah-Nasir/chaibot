/**
 * Replay provider -- deterministic, offline, reproducible.
 *
 * Plays back previously recorded model outputs keyed by the (system, user)
 * prompt. This makes the LLM-polish path runnable and testable with no API
 * key and no spend, and it gives reproducible output for the test suite.
 *
 * It only ever returns outputs that were actually recorded; a prompt with no
 * recorded entry is a loud error, never invented text, so a replay run can't
 * silently diverge from what was captured.
 *
 * Cassette JSON:
 *   { "model": "gpt-4o-mini",
 *     "entries": [ { "system": "...", "user": "...", "response": "..." } ] }
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { ProviderError } from "./base.js";

function key(system, user) {
  return createHash("sha256")
    .update(system ?? "")
    .update("\u0000")
    .update(user ?? "")
    .digest("hex");
}

export class ReplayProvider {
  constructor({ model = "replay-model", entries = [] } = {}) {
    this.name = "replay";
    this.model = model;
    this._byKey = new Map();
    for (const e of entries) {
      if (typeof e.response !== "string" || typeof e.user !== "string") {
        throw new ProviderError("each replay entry needs string 'user' and 'response'");
      }
      this._byKey.set(key(e.system, e.user), e.response);
    }
  }

  static fromFile(path) {
    let data;
    try {
      data = JSON.parse(readFileSync(path, "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") throw new ProviderError(`cassette not found: ${path}`);
      throw new ProviderError(`invalid cassette JSON in ${path}: ${err.message}`);
    }
    return new ReplayProvider({ model: data.model, entries: data.entries ?? [] });
  }

  async complete({ system, user }) {
    const hit = this._byKey.get(key(system, user));
    if (hit === undefined) {
      throw new ProviderError(
        "no recorded response for this prompt in the cassette " +
          "(record it against a real provider first)",
      );
    }
    return hit;
  }
}
