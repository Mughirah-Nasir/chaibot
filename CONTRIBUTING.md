# Contributing to ChaiBot

Contributions are welcome. ChaiBot is intentionally small, dependency-free, and
honest about being a heuristic tool — please keep those properties.

## Setup

```bash
npm install        # dev tooling only (eslint, prettier); zero runtime deps
```

Node 18+ is required (the code uses the built-in `fetch` and `node:test`).

## Before opening a pull request

All of these must pass — CI runs the same on Node 18/20/22:

```bash
npm test
npm run lint
npm run format:check
npm pack --dry-run
```

## Adding a red-flag rule

Rules live in `src/detector/rules.js`. A rule is:

```js
{
  id: "snake_case_id",
  category: "payment" | "contact" | "scope",
  weight: 10,                       // points it contributes to the score
  reason: "Plain-language explanation shown to the user",
  test(posting) {
    // return null if it doesn't fire, or { reason?, evidence? } if it does
  },
}
```

Add it to `ALL_RULES`, then **add a test** in `test/rules.test.js` with both a
positive case (it fires) and a negative case (it does not fire on a legitimate
posting). Avoiding false positives matters as much as catching scams — a
detector that flags everything is useless.

## Adding a provider

Providers implement one method, `async complete({ system, user }) -> string`.
Add the class in `src/providers/remote.js`, wire it into `createProvider`, and
test it with an injected `fetchImpl` so no network is needed.

## Keeping it honest

- Don't describe the detector as definitive. It catches **common** scam
  patterns; it is not adversarially robust, and the README says so.
- The proposal assistant must never fabricate experience. Keep the
  no-fabrication behaviour and its tests intact.
- If you change the number of tests, update the README badge to the actual
  `npm test` count.

## Commit style

Conventional-commit prefixes (`feat:`, `fix:`, `test:`, `docs:`, `chore:`) with
a short imperative summary.
